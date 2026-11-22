// node site-drive.mjs <url> <module.mjs> [cpuSlowdown]
// Opens the kitchen-screen app in headless Edge made to look like the tablet
// (1280x800 CSS px at 1.5x, touch only, eight cores, Android WebView), with
// probes installed before the app's own code runs, then hands over to the
// module's default export: async ({ ev, shot, sleep, log, send, memory, counters, gc }) => result.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/');
const [url, modulePath, rateArg = '1'] = process.argv.slice(2);
const rate = Number(rateArg);
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Timers, animation frames and listeners the page asks for, noted before any of
// its own code runs, so a screen that leaves one running after it is left shows.
const PROBE = `(() => {
  if (window.__probe) return;
  const P = (window.__probe = { intervals: new Map(), raf: 0, timeouts: 0, listeners: 0, errors: [] });
  const where = () => (new Error().stack || '').split('\\n').slice(3, 6).map((l) => l.trim().replace(/^at /, '').replace(location.origin, '')).join(' < ');
  const si = window.setInterval, ci = window.clearInterval;
  P.rawSetInterval = (fn, ms) => si.call(window, fn, ms);
  window.setInterval = function (fn, ms, ...a) { const id = si.call(window, fn, ms, ...a); P.intervals.set(id, { ms, route: location.hash, from: where() }); return id; };
  window.clearInterval = function (id) { P.intervals.delete(id); return ci.call(window, id); };
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (fn) { P.raf++; return raf.call(window, fn); };
  const st = window.setTimeout;
  window.setTimeout = function (fn, ms, ...a) { P.timeouts++; return st.call(window, fn, ms, ...a); };
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  P.global = new Map();
  EventTarget.prototype.addEventListener = function (type, fn, o) {
    if (this === window || this === document || this === document.body) { const k = type; P.global.set(k, (P.global.get(k) || 0) + 1); }
    return add.call(this, type, fn, o);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, o) {
    if (this === window || this === document || this === document.body) { const k = type; P.global.set(k, (P.global.get(k) || 0) - 1); }
    return rem.call(this, type, fn, o);
  };
  window.addEventListener('error', (e) => P.errors.push(String(e.message).slice(0, 200)));
  window.addEventListener('unhandledrejection', (e) => P.errors.push('unhandled: ' + String(e.reason && (e.reason.message || e.reason)).slice(0, 200)));
})();`;

// In the system's temp folder: from a long project path the browser's own nested folders
// run past Windows' 260-character limit.
const prof = resolve(tmpdir(), `ht-sim-${Date.now()}`);
mkdirSync(prof, { recursive: true });
const shots = `${HERE}/shots`;
mkdirSync(shots, { recursive: true });
const port = 9400 + Math.floor(Math.random() * 400);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--disk-cache-size=67108864', '--media-cache-size=33554432',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
  '--disable-features=CalculateNativeWinOcclusion', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });

let result = { ok: false };
let exitCode = 0;
try {
  let tabs;
  for (let i = 0; i < 80; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
  const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const wait = {};
  const consoleErrors = [];
  const failedRequests = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && wait[d.id]) { wait[d.id](d); delete wait[d.id]; return; }
    if (d.method === 'Runtime.exceptionThrown') {
      const e = d.params.exceptionDetails;
      consoleErrors.push(String((e.exception && e.exception.description) || e.text).slice(0, 300));
    }
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
      consoleErrors.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    }
    if (d.method === 'Network.loadingFailed' && !d.params.canceled) failedRequests.push(`${d.params.type} ${d.params.errorText}`);
    if (d.method === 'Network.responseReceived' && d.params.response.status >= 400) failedRequests.push(`${d.params.response.status} ${d.params.response.url.slice(0, 120)}`);
  });
  const send = (method, params = {}, ms = 120000) => new Promise((r) => {
    const i = ++id; const t = setTimeout(() => { delete wait[i]; log('TIMEOUT', method); r({ timeout: true }); }, ms);
    wait[i] = (d) => { clearTimeout(t); r(d); }; ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (expression, ms = 120000) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, ms);
    if (r.timeout) return { timeout: true };
    if (r.result && r.result.exceptionDetails) {
      const e = r.result.exceptionDetails;
      const text = String((e.exception && e.exception.description) || e.text).slice(0, 400);
      log('PAGE ERROR', text);
      return { pageError: text };
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  /** A picture of the page: `scale` 1 is the tablet's 1920x1200. */
  const shot = async (name, { scale = 2 / 3, format = 'jpeg', quality = 82 } = {}) => {
    // A page that is not changing draws no frames in a headless browser, and
    // the capture waits for one: keep a pixel moving while the picture is taken.
    await ev(`(() => { if (document.getElementById('__tick')) return 1; const d = document.createElement('div'); d.id = '__tick'; d.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;pointer-events:none;z-index:2147483647;background:#000'; document.body.appendChild(d); let on = false; d.__timer = (window.__probe && window.__probe.rawSetInterval ? window.__probe.rawSetInterval : setInterval)(() => { on = !on; d.style.background = on ? '#0a0a0a' : '#000'; }, 30); return 1; })()`);
    const r = await send('Page.captureScreenshot', {
      format, ...(format === 'jpeg' ? { quality } : {}),
      clip: { x: 0, y: 0, width: 1280, height: 800, scale }, captureBeyondViewport: false,
    }, 15000);
    await ev(`(() => { const e = document.getElementById('__tick'); if (e) { clearInterval(e.__timer); e.remove(); } return 1; })()`);
    if (!r.result || !r.result.data) { log('no screenshot', name); return null; }
    const file = `${shots}/${name}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return file;
  };
  /** Memory the browser's processes hold right now, by kind, in MB. */
  const memory = () => {
    try {
      const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -match '${basename(prof)}' } | ForEach-Object { $t = if ($_.CommandLine -match '--type=([a-z-]+)') { $Matches[1] } else { 'browser' }; '{0} {1}' -f $t, [math]::Round($_.WorkingSetSize/1MB) }`;
      const lines = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split(/\r?\n/);
      const mem = {};
      for (const l of lines) { const [t, mb] = l.trim().split(' '); if (t) mem[t] = (mem[t] || 0) + Number(mb || 0); }
      return mem;
    } catch (e) { return { error: String(e.message || e).slice(0, 120) }; }
  };
  /** Collect garbage, then the page's script heap (MB) and DOM counts. */
  const counters = async () => {
    await send('HeapProfiler.collectGarbage');
    const heap = await send('Runtime.getHeapUsage');
    const dom = await send('Memory.getDOMCounters');
    return { heapMB: +(heap.result.usedSize / 1048576).toFixed(2), nodes: dom.result.nodes, listeners: dom.result.jsEventListeners, documents: dom.result.documents };
  };

  const asTablet = process.env.TABLET !== '0';
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: asTablet });
  if (asTablet) {
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Linux; Android 10; Lenovo TB-X606FA Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Safari/537.36',
      platform: 'Linux armv8l',
    });
    await send('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: 8 });
  }
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('HeapProfiler.enable');
  if (process.env.PROBE !== '0') await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
  if (process.env.INIT_SCRIPT) await send('Page.addScriptToEvaluateOnNewDocument', { source: process.env.INIT_SCRIPT });
  if (rate > 1) await send('Emulation.setCPUThrottlingRate', { rate });
  // A freshly started browser is still setting up its networking for a few
  // seconds; loading the page during that window makes some requests fail.
  await sleep(6000);
  const t0 = Date.now();
  await send('Page.navigate', { url });
  let ready = false;
  for (let i = 0; i < 240 && !ready; i++) {
    await sleep(250);
    ready = (await ev(`!!(document.querySelector('#screen > div') && document.querySelector('#screen > div').children.length)`, 20000)) === true;
  }
  const bootMs = ready ? Date.now() - t0 : null;
  log('boot', bootMs);
  const mod = await import(pathToFileURL(resolve(modulePath)).href);
  const value = await mod.default({ ev, shot, sleep, log, send, memory, counters, shots, url, rate, bootMs });
  result = { ok: true, url, cpuSlowdown: rate, bootMs, ...value, consoleErrors: [...new Set(consoleErrors)].slice(0, 40), failedRequests: [...new Set(failedRequests)].slice(0, 40) };
  ws.close();
} catch (error) {
  result = { ok: false, error: String((error && error.stack) || error).slice(0, 600) };
  exitCode = 1;
}
console.log(JSON.stringify(result));
edge.kill();
await sleep(800);
try { rmSync(prof, { recursive: true, force: true }); } catch { /* still in use */ }
process.exit(exitCode);
