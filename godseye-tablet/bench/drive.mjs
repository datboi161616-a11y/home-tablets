// node drive.mjs <url> <module.mjs> [cpuSlowdown]
// Opens the app in headless Edge with the real GPU at the tablet's screen size
// (1280x800 CSS px at 1.5x = 1920x1200), waits for the app's QA handle, then
// hands over to the module's default export:
//   async ({ ev, shot, sleep, log, send, memory }) => result
// and prints the result as JSON on stdout.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/');
const [url, modulePath, rateArg = '1'] = process.argv.slice(2);
const rate = Number(rateArg);
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const prof = `${HERE}/prof-${Date.now()}`;
mkdirSync(prof, { recursive: true });
const shots = `${HERE}/shots`;
mkdirSync(shots, { recursive: true });
const port = 9400 + Math.floor(Math.random() * 400);
const extra = (process.env.EDGE_FLAGS || '').split(' ').filter(Boolean);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--disk-cache-size=67108864', '--media-cache-size=33554432',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
  '--disable-features=CalculateNativeWinOcclusion', '--autoplay-policy=no-user-gesture-required', ...extra,
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
  const shot = async (name, { scale = 1, format = 'png', quality = 84 } = {}) => {
    const r = await send('Page.captureScreenshot', {
      format, ...(format === 'jpeg' ? { quality } : {}),
      clip: { x: 0, y: 0, width: 1280, height: 800, scale },
      captureBeyondViewport: false,
    }, 60000);
    if (!r.result || !r.result.data) { log('no screenshot', name); return null; }
    const file = `${shots}/${name}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return file;
  };
  /** Memory the browser's processes hold right now, by kind, in MB. */
  const memory = () => {
    try {
      const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -match '${prof.split('/').pop()}' } | ForEach-Object { $t = if ($_.CommandLine -match '--type=([a-z-]+)') { $Matches[1] } else { 'browser' }; '{0} {1}' -f $t, [math]::Round($_.WorkingSetSize/1MB) }`;
      const lines = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split(/\r?\n/);
      const mem = {};
      for (const l of lines) { const [t, mb] = l.trim().split(' '); if (t) mem[t] = (mem[t] || 0) + Number(mb || 0); }
      return mem;
    } catch (e) { return { error: String(e.message || e).slice(0, 120) }; }
  };

  // The tablet as the page sees it: a touch-only Android screen of 1280x800 CSS
  // pixels at 1.5x, eight cores, 2 GB. TABLET=0 leaves it a desktop of that size.
  const asTablet = process.env.TABLET !== '0';
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: asTablet });
  if (asTablet) {
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Linux; Android 10; Lenovo TB-X606FA Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Safari/537.36',
      platform: 'Linux armv8l',
    });
    await send('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: 8 });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 }); } catch (e) {}" });
  }
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.enable');
  await send('Runtime.enable');
  if (rate > 1) await send('Emulation.setCPUThrottlingRate', { rate });
  // A freshly started browser is still setting up its networking for a few
  // seconds; loading the page during that window makes some requests fail.
  await sleep(6000);
  const t0 = Date.now();
  await send('Page.navigate', { url });
  let ready = false;
  for (let i = 0; i < 360 && !ready; i++) {
    await sleep(500);
    ready = (await ev(`!!(window.__godsEyeView && window.__godsEyeView.voiceCommands && window.__godsEyeView.viewer)`, 20000)) === true;
  }
  const bootMs = ready ? Date.now() - t0 : null;
  log('boot', bootMs);
  if (ready) {
    const mod = await import(pathToFileURL(resolve(modulePath)).href);
    const value = await mod.default({ ev, shot, sleep, log, send, memory, shots, url, rate });
    result = { ok: true, url, cpuSlowdown: rate, bootMs, ...value, consoleErrors: consoleErrors.slice(0, 40) };
  } else {
    result = { ok: false, url, error: 'the app did not start', consoleErrors: consoleErrors.slice(0, 40) };
  }
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
