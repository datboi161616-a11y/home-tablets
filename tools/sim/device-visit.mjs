// node tools/sim/device-visit.mjs [family|tom|both] [--live]
//
// The check to do on a REAL tablet before publishing something big: puts the working
// copy from this PC on the tablet plugged in over USB, opens every screen there in turn
// (with the real feeds, the real browser engine and the real, slow chip), and reports for
// each one how long it took to build, any error, and any "NaN / undefined" on screen.
// Then it puts the tablet back on the published site, whatever happened.
//
//   --live   don't switch to the working copy: visit the screens of the published site.
//
// Needs: adb on the PATH (or in Downloads\platform-tools*), launcher app 1.27+, USB
// debugging on, and for the working copy "python tools/sim/serve.py" running on port 5173.
// The tablet shows the screens changing by themselves for a couple of minutes; say so to
// anyone using it. Tom's screens can be opened on a Family tablet too (and the other way
// round): what is checked is that they open and read sensibly, not the profile's look.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const live = args.includes('--live');
const which = args.find((a) => !a.startsWith('--')) || 'family';
const PKG = 'com.hometablets.launcher';
const SITE = 'http://127.0.0.1:5173/';

// ---- adb, wherever it is
function findAdb() {
  try { execFileSync('adb', ['version'], { stdio: 'ignore' }); return 'adb'; } catch (e) { /* not on the PATH */ }
  for (const root of [join(homedir(), 'Downloads'), join(homedir(), 'Desktop')]) {
    if (!existsSync(root)) continue;
    for (const d of readdirSync(root)) {
      for (const p of [join(root, d, 'adb.exe'), join(root, d, 'platform-tools', 'adb.exe')]) if (existsSync(p)) return p;
    }
  }
  return null;
}
const ADB = findAdb();
if (!ADB) { console.error("Can't find adb. Put Google's platform-tools in Downloads, or on the PATH."); process.exit(2); }
if (ADB !== 'adb') process.env.PATH = `${dirname(ADB)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
const adb = (...a) => { try { return execFileSync(ADB, a, { encoding: 'utf8', env: Object.assign({}, process.env, { MSYS_NO_PATHCONV: '1' }) }).trim(); } catch (e) { return String(e.stdout || e.message || '').trim(); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const onTablet = (file) => {
  const r = spawnSync(process.execPath, [resolve(HERE, 'device-eval.mjs'), '--file', file], { encoding: 'utf8', env: process.env });
  const out = (r.stdout || '').trim();
  try { return JSON.parse(out.slice(out.indexOf('{'))); } catch (e) { return { failed: (out || r.stderr || '').slice(-400) }; }
};

const ROUTES = {
  family: [['home', 1500], ['launcher', 900], ['settings', 900], ['calendar', 1200], ['forecast', 1500], ['messages', 900], ['recipes', 900],
    ['recipes/american', 1200], ['dish/pancakes', 1200], ['recipe/pancakes', 1200], ['shopping', 900], ['timers', 900], ['plan', 1200],
    ['addphotos', 900], ['apps', 900], ['night', 900], ['photos', 2500], ['photos/album', 1500], ['camera', 1500], ['myrecipe', 900], ['whatsnew', 900], ['home', 900]],
  tom: [['bridge', 8000], ['flights', 7000], ['departures', 6000], ['sky', 8000], ['missions', 7000], ['alert', 5000], ['trivia', 2000],
    ['deepimage', 7000], ['viewscreen', 4000], ['bridge', 2000]],
};
const visitScript = (routes) => `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const errors = [];
  const onErr = (e) => errors.push(location.hash + ': ' + String(e.message || (e.reason && (e.reason.message || e.reason)) || e).slice(0, 160));
  addEventListener('error', onErr); addEventListener('unhandledrejection', onErr);
  try { localStorage.setItem('welcome.done.v1', '1'); } catch (e) {}
  const back = location.hash;
  const out = [];
  for (const [r, ms] of ${JSON.stringify(routes)}) {
    const host0 = document.querySelector('#screen > div');
    const t0 = performance.now();
    location.hash = '#/' + r;
    let guard = 0;
    while ((document.querySelector('#screen > div') === host0 || !document.querySelector('#screen > div').children.length) && guard++ < 600) await wait(5);
    const built = Math.round(performance.now() - t0);
    await wait(ms);
    const text = document.querySelector('#screen').innerText.replace(/\\s+/g, ' ');
    out.push({ screen: r, built, odd: /NaN|undefined|Invalid Date/.test(text) ? (text.match(/.{0,30}(NaN|undefined|Invalid Date).{0,30}/) || [''])[0] : '', cantOpen: /can.t open right now|went wrong with this screen/i.test(text), notYet: /coming soon/i.test(text) });
  }
  location.hash = back || '#/';
  removeEventListener('error', onErr); removeEventListener('unhandledrejection', onErr);
  let build = '?';
  try { build = (await import('./js/build.js')).BUILD; } catch (e) {}
  return { build, screens: out, errors };
})()`;

// ---- go
const devices = adb('devices').split('\n').slice(1).filter((l) => /\tdevice$/.test(l.trim()));
if (devices.length !== 1) { console.error(devices.length ? 'More than one device is plugged in.' : 'No tablet found (USB debugging on? cable?).'); process.exit(2); }
let bad = 0;
try {
  if (!live) {
    adb('reverse', 'tcp:5173', 'tcp:5173');
    if (!/5173/.test(adb('reverse', '--list'))) adb('reverse', 'tcp:5173', 'tcp:5173'); // it has silently done nothing before
    adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`, '--es', 'site', SITE);
    await sleep(7000);
  }
  const dir = mkdtempSync(join(tmpdir(), 'ht-visit-'));
  for (const profile of which === 'both' ? ['family', 'tom'] : [which]) {
    if (!ROUTES[profile]) { console.error(`Unknown: ${profile} (family, tom or both)`); process.exit(2); }
    const file = join(dir, `${profile}.js`);
    writeFileSync(file, visitScript(ROUTES[profile]));
    console.log(`\n${profile === 'tom' ? "Tom's" : 'Family'} screens on the tablet${live ? ' (published site)' : ' (working copy)'}...`);
    const r = onTablet(file);
    if (r.failed) { console.log('  could not run there:', r.failed); bad++; continue; }
    console.log(`  version on the tablet: ${r.build}`);
    for (const s of r.screens) {
      let flags = [s.cantOpen ? "CAN'T OPEN" : '', s.odd ? `ODD TEXT: "${s.odd}"` : ''].filter(Boolean).join('  ');
      if (flags) bad++;
      if (s.notYet) flags += '(not a screen in the version on the tablet)';
      console.log(`  ${s.screen.padEnd(18)} ${String(s.built).padStart(5)} ms  ${flags}`);
    }
    if (r.errors.length) { bad += r.errors.length; console.log('  ERRORS:'); r.errors.forEach((e) => console.log(`    ${e}`)); }
    else console.log('  no errors');
  }
} finally {
  if (!live) {
    adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`, '--es', 'site', 'off');
    await sleep(4000);
    adb('reverse', '--remove-all');
    console.log('\nThe tablet is back on the published site.');
  }
}
console.log(bad ? `\n${bad} thing(s) to look at.` : '\nAll screens opened cleanly.');
process.exit(bad ? 1 : 0);
