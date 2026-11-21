// node offline-test.mjs <siteDir> <label>
// Does the kitchen screen really keep working when the Wi-Fi is gone?
// Serves <siteDir> itself, opens it in headless Edge made to look like the tablet,
// lets it run, cuts the network for the page AND its service worker (with the
// browser's own HTTP cache switched off, so only the copy the app keeps counts),
// starts the page over, and opens every screen.
//
// env: PROFILE=family|tom   RELOAD_FIRST=1 (a second start before waiting)
//      WAIT_S=95 (how long it runs online first)   RECOVER=1 (the "comes back by itself" check)
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/');
const [siteDir, label = 'run'] = process.argv.slice(2);
const PROFILE = process.env.PROFILE || 'family';
const RELOAD_FIRST = process.env.RELOAD_FIRST === '1';
const WAIT_S = Number(process.env.WAIT_S || 95);
const RECOVER = process.env.RECOVER === '1';
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), `[${label}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the site, served the way GitHub Pages does (10 minutes of browser caching) ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const requests = [];
const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  requests.push(`${req.method} ${path}`);
  let file = normalize(join(siteDir, path === '/' ? 'index.html' : path));
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=600', 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const sitePort = server.address().port;
const url = `http://localhost:${sitePort}/${PROFILE === 'tom' ? '?profile=tom' : ''}`;

// ---- the browser ----
const prof = `${HERE}/prof-off-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
mkdirSync(prof, { recursive: true });
mkdirSync(`${HERE}/shots`, { recursive: true });
const port = 9800 + Math.floor(Math.random() * 150);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--hide-scrollbars', '--mute-audio', '--no-first-run',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
  '--disable-features=CalculateNativeWinOcclusion', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });

const out = { label, profile: PROFILE, reloadFirst: RELOAD_FIRST, waitS: WAIT_S, ok: false };
let exitCode = 0;
try {
  let version;
  for (let i = 0; i < 80; i++) { try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(250); } }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const wait = {};
  const consoleErrors = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && wait[d.id]) { wait[d.id](d); delete wait[d.id]; return; }
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') consoleErrors.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  });
  const send = (method, params = {}, sessionId, ms = 60000) => new Promise((r) => {
    const i = ++id; const t = setTimeout(() => { delete wait[i]; log('TIMEOUT', method); r({ timeout: true }); }, ms);
    wait[i] = (d) => { clearTimeout(t); r(d); };
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const targets = async () => (await send('Target.getTargets')).result.targetInfos;
  const attach = async (targetId) => (await send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId;

  const pageTarget = (await targets()).find((t) => t.type === 'page');
  const page = await attach(pageTarget.targetId);
  const P = (method, params, ms) => send(method, params, page, ms);
  const ev = async (expression, ms = 60000) => {
    const r = await P('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, ms);
    if (r.timeout) return { timeout: true };
    if (r.result && r.result.exceptionDetails) return { pageError: String((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text).slice(0, 300) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const shot = async (name) => {
    await ev(`(() => { if (document.getElementById('__tick')) return 1; const d = document.createElement('div'); d.id = '__tick'; d.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;pointer-events:none;z-index:2147483647;background:#000'; document.body.appendChild(d); let on = false; d.__timer = setInterval(() => { on = !on; d.style.background = on ? '#0a0a0a' : '#000'; }, 30); return 1; })()`);
    const r = await P('Page.captureScreenshot', { format: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: 1280, height: 800, scale: 2 / 3 }, captureBeyondViewport: false }, 15000);
    await ev(`(() => { const e = document.getElementById('__tick'); if (e) { clearInterval(e.__timer); e.remove(); } return 1; })()`);
    if (!r.result || !r.result.data) { log('no screenshot', name); return null; }
    writeFileSync(`${HERE}/shots/${name}.jpg`, Buffer.from(r.result.data, 'base64'));
    return name;
  };

  await P('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: true });
  await P('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await P('Emulation.setFocusEmulationEnabled', { enabled: true });
  await P('Page.enable');
  await P('Runtime.enable');
  await P('Network.enable');
  // No welcome tour: this is about the screens.
  await P('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('welcome.done.v1','1')}catch(e){}` });

  const ready = async (max = 60) => {
    for (let i = 0; i < max * 4; i++) {
      await sleep(250);
      const r = await ev(`!!(document.querySelector('#screen > div') && document.querySelector('#screen > div').children.length)`, 20000);
      if (r === true) return true;
    }
    return false;
  };
  /** What is on the screen right now, in a few words. */
  const look = () => ev(`(() => {
    const host = document.querySelector('#screen > div');
    if (!host) return { nothing: true, title: document.title, body: (document.body ? document.body.innerText : '').slice(0, 160) };
    const text = host.innerText.replace(/\\s+/g, ' ').trim();
    const faces = [...document.fonts];
    const w = (font) => { const c = document.createElement('canvas').getContext('2d'); c.font = font; return Math.round(c.measureText('Hamburgefonstiv 0123456789').width); };
    return {
      route: location.hash,
      text: text.slice(0, 110),
      cantOpen: /can.t open right now/i.test(text),
      comingSoon: /coming soon/i.test(text),
      fontFaces: faces.length, fontsLoaded: faces.filter((f) => f.status === 'loaded').length,
      outfitIsReal: w('500 40px Outfit, monospace') !== w('500 40px monospace'),
      oxaniumIsReal: w('500 40px Oxanium, monospace') !== w('500 40px monospace'),
      jetbrainsIsReal: w('400 40px "JetBrains Mono", serif') !== w('400 40px serif'),
      brokenImgs: [...host.querySelectorAll('img')].filter((i) => i.complete && !i.naturalWidth).map((i) => (i.getAttribute('src') || '').slice(0, 60)),
    };
  })()`);
  const go = async (route, settle = 1500) => {
    await ev(`location.hash = ${JSON.stringify('#/' + route)}; 1`);
    await sleep(settle);
    return look();
  };
  const kept = () => ev(`(async () => { if (!window.caches) return null; const c = await caches.open('tablet-v2'); return (await c.keys()).map((r) => r.url.replace(location.origin, '')); })()`);
  /** Cut or restore the network for the page and for its service worker. */
  const workerSessions = new Map(); // one session per worker, kept: the cut belongs to the session that made it
  const network = async (offline) => {
    const cond = { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
    for (let i = 0; i < 60 && offline && !workerSessions.size; i++) {
      for (const t of await targets()) {
        if (t.type === 'service_worker' && t.url.includes(`:${sitePort}/`) && !workerSessions.has(t.targetId)) workerSessions.set(t.targetId, await attach(t.targetId));
      }
      if (!workerSessions.size) await sleep(250);
    }
    const sessions = [page, ...workerSessions.values()];
    for (const s of sessions) {
      await send('Network.enable', {}, s);
      await send('Network.setCacheDisabled', { cacheDisabled: true }, s);
      await send('Network.emulateNetworkConditions', cond, s);
    }
    return sessions.length;
  };

  await sleep(6000); // a freshly started browser is still setting up its networking
  await P('Page.navigate', { url });
  out.firstStart = await ready();
  if (RELOAD_FIRST) { await sleep(5000); await P('Page.reload'); out.secondStart = await ready(); }

  if (RECOVER) {
    // The Wi-Fi goes before the app has had time to keep the other screens.
    await sleep(4000);
    out.sessionsCut = await network(true);
    const route = PROFILE === 'tom' ? 'sky' : 'forecast';
    out.whileDown = await go(route, 2500);
    await shot(`${label}-1-while-down`);
    const before = requests.length;
    await sleep(4000);
    await network(false);
    log('network back');
    // It should start over and open the screen without anyone touching it.
    let back = null;
    for (let i = 0; i < 40 && !back; i++) {
      await sleep(1000);
      const l = await look();
      if (l && l.route === `#/${route}` && !l.cantOpen && !l.comingSoon && !l.nothing) back = { afterS: i + 1, ...l };
      else out.lastSeen = l;
    }
    out.cameBack = back;
    out.requestsAfterBack = requests.slice(before).filter((r) => /HEAD|version/.test(r)).slice(0, 6);
    await shot(`${label}-2-came-back`);
  } else {
    log('running online for', WAIT_S, 's');
    await sleep(WAIT_S * 1000);
    const keys = (await kept()) || [];
    out.keptCount = keys.length;
    out.keptScreens = keys.filter((k) => k.includes('/js/screens/')).length;
    out.keptFonts = keys.filter((k) => k.includes('fonts.g')).map((k) => k.slice(0, 60));
    out.keptPage = keys.filter((k) => /^\/(\?.*)?$|index\.html/.test(k));
    out.keptData = keys.filter((k) => k.includes('/data/')).length;
    out.sessionsCut = await network(true);
    log('network cut for', out.sessionsCut, 'targets; starting the page over');
    await P('Page.reload');
    out.startedOffline = await ready(20);
    out.afterStart = await look();
    await shot(`${label}-0-start-offline`);
    const routes = PROFILE === 'tom'
      ? ['bridge', 'flights', 'departures', 'trivia', 'alert', 'missions', 'sky', 'deepimage', 'viewscreen']
      : ['home', 'launcher', 'photos', 'recipes', 'plan', 'shopping', 'timers', 'myrecipe', 'addphotos', 'apps', 'camera', 'calendar', 'forecast', 'messages', 'night'];
    out.screens = [];
    if (out.startedOffline) {
      for (const r of routes) {
        const l = await go(r);
        out.screens.push(l);
        if (['launcher', 'forecast', 'calendar', 'apps', 'flights', 'sky'].includes(r)) await shot(`${label}-${r}`);
      }
      if (PROFILE !== 'tom') {
        // A recipe, the way someone would get to it: Recipes -> a cuisine -> a dish -> cook it.
        await go('recipes');
        const cuisine = await ev(`(() => { const a = [...document.querySelectorAll('a[href^="#/recipes/"]')].find((x) => !/favorites|mine|dinner/.test(x.getAttribute('href'))); return a ? a.getAttribute('href').slice(2) : null; })()`);
        if (cuisine) {
          out.screens.push(await go(cuisine, 2000));
          const dish = await ev(`(() => { const a = document.querySelector('a[href^="#/dish/"]'); return a ? a.getAttribute('href').slice(2) : null; })()`);
          if (dish) {
            out.screens.push(await go(dish, 2000));
            await shot(`${label}-dish`);
            out.screens.push(await go(dish.replace(/^dish/, 'recipe'), 2000));
          } else out.noDishLink = cuisine;
        } else out.noCuisineLink = true;
      }
    }
    await network(false);
  }
  out.consoleErrors = [...new Set(consoleErrors)].slice(0, 12);
  out.ok = true;
  ws.close();
} catch (error) {
  out.error = String((error && error.stack) || error).slice(0, 600);
  exitCode = 1;
}
writeFileSync(`${HERE}/offline-${label}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
edge.kill();
server.close();
await sleep(800);
try { rmSync(prof, { recursive: true, force: true }); } catch { /* still in use */ }
process.exit(exitCode);
