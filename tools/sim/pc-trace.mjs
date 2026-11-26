// node tools/sim/pc-trace.mjs [--stub=seed.js] [--tom] [screen ...]
//
// Where the drawing time goes on each screen, WITHOUT a tablet: a headless Edge drawing in
// software like the tablet does (no graphics chip: every pixel is painted by the processor),
// 1280x800 at 1.5x. For each screen it records a browser trace while the screen opens
// (2.5 s) and while it then sits still (4 s), and prints the browser's own work by kind:
// script, style, layout, draw (putting the layers together into the frame) and raster
// (turning what to draw into pixels: on the tablet's slow processor, the big one). Numbers are this PC's, so compare
// screens with each other and before/after a change, not with the tablet's.
// It expects the site at http://localhost:5173/ (python tools/sim/serve.py).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const stub = (args.find((a) => a.startsWith('--stub=')) || '').slice(7);
const tom = args.includes('--tom');
let routes = args.filter((a) => !a.startsWith('--'));
if (!routes.length) {
  const app = readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8');
  const keys = (map) => { const m = new RegExp(`const ${map} = \\{([\\s\\S]*?)\\};`).exec(app); return m ? [...m[1].matchAll(/(?:^|[\s,{])([a-z][a-z0-9]*)\s*:/gi)].map((k) => k[1]) : []; };
  routes = keys(tom ? 'TOM' : 'FAMILY').concat(keys('BOTH')).filter((r) => r !== 'welcome');
}
const SITE = process.env.SITE || 'http://localhost:5173/';
const prof = resolve(tmpdir(), `ht-trace-${Date.now()}`);
mkdirSync(prof, { recursive: true });
const port = 9800 + Math.floor(Math.random() * 150);
const BROWSER = process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const edge = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--disable-gpu-rasterization', '--disable-gpu-compositing', '--hide-scrollbars', '--mute-audio', '--no-first-run',
  '--disable-renderer-backgrounding', '--disable-background-timer-throttling', `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (s, n) => String(s).padStart(n);
let page;
for (let i = 0; i < 50 && !page; i++) {
  await sleep(200);
  try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch (e) { /* not up yet */ }
}
if (!page) { console.error('The browser did not start.'); edge.kill(); process.exit(2); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok) => ws.addEventListener('open', ok));
let id = 0; const waiting = {}; let events = []; let done = null;
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && waiting[d.id]) { waiting[d.id](d); delete waiting[d.id]; }
  if (d.method === 'Tracing.dataCollected') events.push(...d.params.value);
  if (d.method === 'Tracing.tracingComplete' && done) done();
  // (A headless browser only draws when something watches: take every frame, as a display would.)
  if (d.method === 'Page.screencastFrame') ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: d.params.sessionId } }));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.result.value;

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
// THROTTLE=6: the page's own thread that many times slower (about the tablet's processor).
if (process.env.THROTTLE) await send('Emulation.setCPUThrottlingRate', { rate: +process.env.THROTTLE });
const init = `${process.env.GAPSHIM ? 'window.__gapShim=1;' : ''}try{if(!sessionStorage.getItem('__seeded')){localStorage.setItem('welcome.done.v1','1');localStorage.setItem('profile','${tom ? 'tom' : 'family'}');sessionStorage.setItem('__seeded','1');}}catch(e){}`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: init + (stub ? `\n${readFileSync(stub, 'utf8')}` : '') });
await send('Page.navigate', { url: `${SITE}#/home` });
await send('Page.startScreencast', { format: 'jpeg', quality: 5, maxWidth: 320, maxHeight: 200 });
await sleep(4000);

const KIND = {
  script: /^(FunctionCall|EvaluateScript|v8\.compile|TimerFire|EventDispatch|FireAnimationFrame|RunMicrotasks|v8\.run)$/,
  style: /^(UpdateLayoutTree|RecalculateStyles|ParseAuthorStyleSheet)$/,
  layout: /^(Layout|UpdateLayerTree)$/,
  draw: /^(DirectRenderer::DrawFrame)$/,
  raster: /^(RasterTask)$/,
  decode: /^(ImageDecodeTask|Decode Image|Decode LazyPixelRef|ImageFrameGenerator::decode|DecodingImageGenerator::getPixels)$/,
};
async function trace(ms, before) {
  events = [];
  await send('Tracing.start', { categories: 'cc,viz,blink,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.stack,toplevel,v8', transferMode: 'ReportEvents' });
  if (before) await before();
  await sleep(ms);
  await new Promise((r) => { done = r; send('Tracing.end'); });
  const sum = {}; const open = {}; const byName = {};
  for (const e of events) {
    let dur = 0;
    if (e.ph === 'X' && e.dur) dur = e.dur / 1000;
    else if (e.ph === 'B') { open[`${e.tid}:${e.name}`] = e.ts; continue; } else if (e.ph === 'E' && open[`${e.tid}:${e.name}`]) { dur = (e.ts - open[`${e.tid}:${e.name}`]) / 1000; delete open[`${e.tid}:${e.name}`]; }
    if (!dur) continue;
    byName[e.name] = (byName[e.name] || 0) + dur;
    for (const k of Object.keys(KIND)) if (KIND[k].test(e.name)) sum[k] = (sum[k] || 0) + dur;
  }
  // LAYOUTS=1: each layout and style pass, how long, and the script that asked for it (if any).
  if (process.env.LAYOUTS) {
    for (const e of events) {
      if ((e.name !== 'Layout' && e.name !== 'UpdateLayoutTree') || !(e.dur || e.ph === 'B')) continue;
      const st = (e.args && e.args.beginData && e.args.beginData.stackTrace) || (e.args && e.args.data && e.args.data.stackTrace) || [];
      const f = st[0];
      console.log(`   ${e.name.padEnd(16)} ${pad(((e.dur || 0) / 1000).toFixed(1), 6)} ms  ${f ? `${f.functionName || '?'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}` : '(the browser itself)'}`);
    }
  }
  // NAMES=1: every kind of work by the browser's own name (to see what the kinds miss).
  if (process.env.NAMES) console.log(Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([n, v]) => `   ${pad(Math.round(v), 6)} ms ${n}`).join('\n'));
  for (const k of Object.keys(KIND)) sum[k] = Math.round(sum[k] || 0);
  return sum;
}

console.log(`${'screen'.padEnd(22)} | open: script style layout   draw raster decode | still 4s: script   draw raster`);
const rows = [];
for (const r of routes) {
  // PROFILE=1: the page's own functions that took the time while the screen opened (self time).
  if (process.env.PROFILE) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start'); }
  const o = await trace(2500, () => ev(`(location.hash = '#/${r}', 'ok')`));
  if (process.env.PROFILE) {
    const { result } = await send('Profiler.stop');
    const p = result.profile; const self = {}; const byId = {};
    p.nodes.forEach((n) => { byId[n.id] = n; });
    const dt = {}; p.samples.forEach((id, i) => { dt[id] = (dt[id] || 0) + (p.timeDeltas[i] || 0) / 1000; });
    for (const id of Object.keys(dt)) { const f = byId[id].callFrame; const k = `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}`; self[k] = (self[k] || 0) + dt[id]; }
    console.log(Object.entries(self).filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `   ${pad(v.toFixed(1), 6)} ms  ${k}`).join('\n'));
  }
  const s = await trace(4000);
  const err = await ev('(window.__err || 0)');
  rows.push({ r, o, s });
  console.log(`${r.padEnd(22)} | ${pad(o.script, 12)} ${pad(o.style, 5)} ${pad(o.layout, 6)} ${pad(o.draw, 6)} ${pad(o.raster, 6)} ${pad(o.decode, 6)} | ${pad(s.script, 15)} ${pad(s.draw, 6)} ${pad(s.raster, 6)}${err ? '  (errors)' : ''}`);
}
const tot = (f) => rows.reduce((a, x) => a + f(x), 0);
console.log(`${'TOTAL'.padEnd(22)} | ${pad(tot((x) => x.o.script), 12)} ${pad(tot((x) => x.o.style), 5)} ${pad(tot((x) => x.o.layout), 6)} ${pad(tot((x) => x.o.draw), 6)} ${pad(tot((x) => x.o.raster), 6)} ${pad(tot((x) => x.o.decode), 6)} | ${pad(tot((x) => x.s.script), 15)} ${pad(tot((x) => x.s.draw), 6)} ${pad(tot((x) => x.s.raster), 6)}`);
ws.close();
edge.kill();
await sleep(500);
try { rmSync(prof, { recursive: true, force: true }); } catch (e) { /* still locked */ }
