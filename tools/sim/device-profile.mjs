// node tools/sim/device-profile.mjs launcher home calendar ...
//
// On a REAL tablet plugged in over USB: opens each screen named, and says where the time
// went. For every screen: how long until it was drawn, how much of that was script, style,
// layout and everything else (painting, the app), and which functions the script time was
// spent in. Needs launcher app 1.27+ and USB debugging on (see device-eval.mjs).
import { execFileSync } from 'node:child_process';

const routes = process.argv.slice(2);
if (!routes.length) { console.error('usage: node device-profile.mjs <screen> [<screen> ...]'); process.exit(2); }
const PORT = 9333;
const sockets = execFileSync('adb', ['shell', 'cat /proc/net/unix'], { encoding: 'utf8' }).match(/webview_devtools_remote_\d+/g) || [];
if (!sockets.length) { console.error('No page to look into: is the app 1.27+, running, and USB debugging on?'); process.exit(1); }
execFileSync('adb', ['forward', `tcp:${PORT}`, `localabstract:${sockets[sockets.length - 1]}`]);
const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter((t) => t.type === 'page');
const visible = (t) => { try { return JSON.parse(t.description || '{}').visible !== false; } catch { return true; } };
const page = pages.find(visible) || pages[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, fail) => { ws.addEventListener('open', ok); ws.addEventListener('error', () => fail(new Error('could not connect'))); });
let id = 0; const waiting = {};
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && waiting[d.id]) { waiting[d.id](d); delete waiting[d.id]; } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.result.value;
const metrics = async () => { const m = {}; for (const { name, value } of (await send('Performance.getMetrics')).result.metrics) m[name] = value; return m; };

await send('Runtime.enable');
await send('Performance.enable');
await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: 500 });

// Go to a screen and come back when it has been built and drawn.
const GO = (route) => `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const host0 = document.querySelector('#screen > div');
  const t0 = performance.now();
  location.hash = '#/${route}';
  let guard = 0;
  while ((document.querySelector('#screen > div') === host0 || !document.querySelector('#screen > div').children.length) && guard++ < 600) await wait(4);
  const built = performance.now() - t0;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const drawn = performance.now() - t0;
  await wait(250);
  return { built: Math.round(built), drawn: Math.round(drawn), nodes: document.querySelector('#screen > div').querySelectorAll('*').length };
})()`;

for (const route of routes) {
  const before = await metrics();
  await send('Profiler.start');
  const r = await ev(GO(route));
  const { profile } = (await send('Profiler.stop')).result;
  const after = await metrics();
  const ms = (k) => Math.round((after[k] - before[k]) * 1000);
  const task = ms('TaskDuration'), script = ms('ScriptDuration'), layout = ms('LayoutDuration'), style = ms('RecalcStyleDuration');
  console.log(`\n=== ${route}: built in ${r.built} ms, drawn in ${r.drawn} ms (${r.nodes} elements)`);
  console.log(`    page was busy ${task} ms: script ${script}, style ${style}, layout ${layout}, the rest (painting and so on) ${task - script - style - layout}`);
  // Self time per function.
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  profile.samples.forEach((nodeId, i) => {
    const n = byId.get(nodeId);
    const f = n.callFrame;
    const key = `${f.functionName || '(anonymous)'} ${f.url ? f.url.replace(/^.*\/js\//, 'js/') + ':' + (f.lineNumber + 1) : ''}`.trim();
    self.set(key, (self.get(key) || 0) + (profile.timeDeltas[i] || 0) / 1000);
  });
  const top = [...self.entries()].filter(([k]) => !/^\((idle|program)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 12);
  for (const [k, v] of top) if (v >= 3) console.log(`      ${String(Math.round(v)).padStart(4)} ms  ${k.slice(0, 110)}`);
}
ws.close();
