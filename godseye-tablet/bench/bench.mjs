// node bench.mjs <url> <cpuSlowdown> <label> <scene,scene,...>
// Opens the app in headless Edge with the real GPU, at the tablet's screen size
// (1280x800 CSS px at 1.5x = 1920x1200), slows the processor by <cpuSlowdown>x, and for
// each scene measures how long one full frame takes when drawn back to back.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/');
const [url, rateArg = '1', label = '', sceneArg = 'globe,planes'] = process.argv.slice(2);
const rate = Number(rateArg);
const scenes = sceneArg.split(',').filter(Boolean);
const frames = Number(process.env.FRAMES || 30);
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const prof = `${HERE}/prof-${Date.now()}`;
mkdirSync(prof, { recursive: true });
const port = 9400 + Math.floor(Math.random() * 400);
const extra = (process.env.EDGE_FLAGS || '').split(' ').filter(Boolean);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--disk-cache-size=67108864', '--media-cache-size=33554432',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
  '--disable-features=CalculateNativeWinOcclusion', ...extra,
  `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });

let tabs;
for (let i = 0; i < 80; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch (e) { await sleep(250); } }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = {};
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d); delete wait[d.id]; } });
const send = (method, params = {}, ms = 120000) => new Promise((r) => {
  const i = ++id; const t = setTimeout(() => { delete wait[i]; log('TIMEOUT', method); r({ timeout: true }); }, ms);
  wait[i] = (d) => { clearTimeout(t); r(d); }; ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expression, ms = 120000) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, ms);
  if (r.result && r.result.exceptionDetails) log('PAGE ERROR', JSON.stringify(r.result.exceptionDetails.exception || r.result.exceptionDetails.text).slice(0, 300));
  return r.result && r.result.result ? r.result.result.value : undefined;
};

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: false });
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Page.enable');
await send('Emulation.setCPUThrottlingRate', { rate });

const out = { label, cpuSlowdown: rate, url, scenes: {} };
// A freshly started browser is still setting up its networking for a few seconds;
// loading the page during that window makes some requests fail.
await sleep(6000);
const t0 = Date.now();
await send('Page.navigate', { url });
const inpage = readFileSync(join(HERE, 'inpage.js'), 'utf8');
let ready = false;
for (let i = 0; i < 360 && !ready; i++) {
  await sleep(500);
  ready = (await ev(`!!(window.__godsEyeView && window.__godsEyeView.voiceCommands && window.__godsEyeView.viewer)`, 20000)) === true;
  if (!ready && i % 20 === 19) {
    const err = await ev(`(document.body.innerText.match(/Error: [^\\n]{0,140}/)||[''])[0]`, 20000);
    if (err) { out.bootError = err; break; }
  }
}
out.bootMs = ready ? Date.now() - t0 : null;
log('boot', out.bootMs, out.bootError || '');

if (ready) {
  await ev(inpage);
  out.gpu = await ev(`(()=>{const gl=window.__godsEyeView.viewer.scene.context._gl;const e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'?'})()`);
  for (const scene of scenes) {
    log('scene', scene);
    const st = Date.now();
    await ev(`window.__bench.scenes[${JSON.stringify(scene)}]().then(()=>'ok')`, 180000);
    // Let data arrive, then wait until the globe has finished loading its tiles
    // (a steady picture), so frames are compared like for like.
    await sleep(8000 + 1000 * rate);
    let loaded = false;
    for (let i = 0; i < 60 && !loaded; i++) {
      loaded = (await ev(`window.__godsEyeView.viewer.scene.globe.tilesLoaded === true`, 20000)) === true;
      if (!loaded) await sleep(1000);
    }
    const m = await ev(`window.__bench.measure(${frames})`, 600000);
    out.scenes[scene] = { setupAndSettleMs: Date.now() - st, tilesLoaded: loaded, ...(m || { failed: true }) };
    log(scene, JSON.stringify(m && m.frameMs), 'draws', m && m.drawsPerFrame, 'tris', m && m.trianglesPerFrame);
  }
  // Memory the browser's page and graphics processes hold right now.
  try {
    const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -match '${prof.split('/').pop()}' } | ForEach-Object { $t = if ($_.CommandLine -match '--type=([a-z-]+)') { $Matches[1] } else { 'browser' }; '{0} {1}' -f $t, [math]::Round($_.WorkingSetSize/1MB) }`;
    const lines = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split(/\r?\n/);
    const mem = {};
    for (const l of lines) { const [t, mb] = l.trim().split(' '); if (t) mem[t] = (mem[t] || 0) + Number(mb || 0); }
    out.processMemoryMB = mem;
  } catch (e) { out.processMemoryMB = { error: String(e.message || e).slice(0, 120) }; }
}
console.log(JSON.stringify(out));
ws.close(); edge.kill();
await sleep(600);
try { rmSync(prof, { recursive: true, force: true }); } catch (e) { /* still in use */ }
process.exit(0);
