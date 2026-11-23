// node tools/sim/device-trace.mjs home launcher [...]
//
// On a REAL tablet plugged in over USB (app 1.27+, USB debugging on): records a browser
// trace while it goes from screen to screen, and says where the time went, by the
// browser's own names for its work (painting, rasterising, image decoding, compositing...),
// and whether the graphics chip is drawing (GPU rasterisation) or the processor is.
import { execFileSync } from 'node:child_process';

const routes = process.argv.slice(2);
if (routes.length < 2) { console.error('usage: node device-trace.mjs <screen> <screen> [...]'); process.exit(2); }
const PORT = 9334;
const sockets = execFileSync('adb', ['shell', 'cat /proc/net/unix'], { encoding: 'utf8' }).match(/webview_devtools_remote_\d+/g) || [];
if (!sockets.length) { console.error('No page to look into.'); process.exit(1); }
execFileSync('adb', ['forward', `tcp:${PORT}`, `localabstract:${sockets[sockets.length - 1]}`]);
const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter((t) => t.type === 'page');
const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
await new Promise((ok, fail) => { ws.addEventListener('open', ok); ws.addEventListener('error', () => fail(new Error('could not connect'))); });
let id = 0; const waiting = {}; const events = []; let done = null;
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && waiting[d.id]) { waiting[d.id](d); delete waiting[d.id]; }
  if (d.method === 'Tracing.dataCollected') events.push(...d.params.value);
  if (d.method === 'Tracing.tracingComplete' && done) done();
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.result.value;

await ev(`(location.hash = '#/${routes[0]}', 'ok')`);
await new Promise((r) => setTimeout(r, 2500));
await send('Tracing.start', { categories: 'cc,gpu,viz,blink,devtools.timeline,disabled-by-default-devtools.timeline,toplevel,benchmark,disabled-by-default-cc.debug', transferMode: 'ReportEvents' });
for (const r of routes.slice(1)) {
  await ev(`(location.hash = '#/${r}', 'ok')`);
  await new Promise((res) => setTimeout(res, 2500));
}
await new Promise((r) => { done = r; send('Tracing.end'); });
ws.close();

// Sum complete events ("X") and begin/end pairs by name.
const sum = {}; const open = {};
const add = (name, dur) => { sum[name] = (sum[name] || 0) + dur; };
let gpuRaster = null;
for (const e of events) {
  if (e.name === 'LayerTreeHostImpl::SetVisible' || e.name === 'Graphics.Pipeline') continue;
  if (e.args && e.args.data && typeof e.args.data.gpu_rasterization !== 'undefined') gpuRaster = e.args.data.gpu_rasterization;
  if (/GpuRasterization/.test(e.name) && e.args) gpuRaster = JSON.stringify(e.args).slice(0, 120);
  if (e.ph === 'X' && e.dur) add(e.name, e.dur / 1000);
  else if (e.ph === 'B') open[`${e.tid}:${e.name}`] = e.ts;
  else if (e.ph === 'E' && open[`${e.tid}:${e.name}`]) { add(e.name, (e.ts - open[`${e.tid}:${e.name}`]) / 1000); delete open[`${e.tid}:${e.name}`]; }
}
const top = Object.entries(sum).sort((a, b) => b[1] - a[1]).slice(0, 28);
console.log(`trace of ${routes.join(' -> ')}: ${events.length} events`);
console.log(`GPU rasterisation: ${gpuRaster === null ? 'not reported' : gpuRaster}`);
for (const [n, ms] of top) console.log(`${String(Math.round(ms)).padStart(7)} ms  ${n}`);
const hints = events.filter((e) => /gpu_raster|GpuRaster|RasterMode|raster_mode|software/i.test(JSON.stringify(e.args || {}))).slice(0, 5);
for (const h of hints) console.log('hint:', h.name, JSON.stringify(h.args).slice(0, 200));
