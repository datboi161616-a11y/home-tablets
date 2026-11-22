// node tools/sim/smoke.mjs [site address]        (default http://localhost:5173/)
//
// The last check before anything is published: opens EVERY screen of the site in a real
// browser, as a kitchen screen and as Tom's deck, with the outside world switched off
// (only the site itself answers, as on a screen whose Wi-Fi has no internet), and fails
// if any screen can't open, throws an error nobody catches, breaks the content policy, or
// shows "NaN" / "undefined" to its owner.
//
// The deploy runs it against the BUILT site (the code as translated for the tablets' old
// browser engine), so what is tested is what the tablets will fetch. Here on the PC:
//   python tools/sim/serve.py            (in one window)
//   node tools/sim/smoke.mjs             (in another)
// BROWSER=<path> picks the browser (see site-drive.mjs); the screens named in js/app.js
// are found by themselves, so a new screen is tested from the day it is added.
// It ends with 0 when every screen opens, 1 when one doesn't, and 2 when the browser
// itself never started (so nothing was learned about the site).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ME = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(ME), '..', '..');

// Every screen js/app.js names for this kind of display, plus a few that need a word more.
function routesFor(profile) {
  const app = readFileSync(resolve(ROOT, 'js/app.js'), 'utf8');
  const keys = (map) => { const m = new RegExp(`const ${map} = \\{([\\s\\S]*?)\\};`).exec(app); return m ? [...m[1].matchAll(/(?:^|[\s,{])([a-z][a-z0-9]*)\s*:/gi)].map((k) => k[1]) : []; };
  const own = keys(profile === 'tom' ? 'TOM' : 'FAMILY').concat(keys('BOTH')).filter((r) => r !== 'welcome');
  const more = profile === 'tom' ? ['flights/abc123'] : ['recipes/american', 'recipes/favorites', 'dish/pancakes', 'recipe/pancakes', 'photos/album', 'myrecipe'];
  return own.concat(more);
}

// ---- inside site-drive: visit them all
export default async function drive({ ev, sleep, log }) {
  const routes = JSON.parse(process.env.SMOKE_ROUTES || '[]');
  await ev(`(window.__smoke = { policy: [] }, document.addEventListener('securitypolicyviolation', (e) => window.__smoke.policy.push(e.violatedDirective + ' <- ' + String(e.blockedURI).slice(0, 80))), 'ok')`);
  const screens = [];
  for (const route of routes) {
    const r = await ev(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const P = window.__probe || { errors: [] };
      P.errors.length = 0; window.__smoke.policy.length = 0;
      const before = document.querySelector('#screen > div');
      const t0 = performance.now();
      location.hash = '#/' + ${JSON.stringify(route)};
      let n = 0;
      while ((document.querySelector('#screen > div') === before || !document.querySelector('#screen > div').children.length) && n++ < 1200) await wait(5);
      const built = Math.round(performance.now() - t0);
      await wait(900);
      const text = document.querySelector('#screen').innerText.replace(/\\s+/g, ' ');
      const odd = text.match(/.{0,24}(NaN|undefined|Invalid Date|\\[object Object\\]).{0,24}/);
      return { built, never: n >= 1200, cantOpen: /can.t open right now|went wrong with this screen/i.test(text), comingSoon: /coming soon/i.test(text),
        odd: odd ? odd[0] : '', errors: P.errors.slice(0, 4), policy: window.__smoke.policy.slice(0, 4), empty: text.length < 12 };
    })()`, 30000);
    screens.push(Object.assign({ route }, r && !r.timeout && !r.pageError ? r : { broke: JSON.stringify(r).slice(0, 200) }));
    log('smoke', route, r && r.built);
  }
  return { screens };
}

// ---- from the command line: both kinds of display
if (process.argv[1] && resolve(process.argv[1]) === ME) {
  const site = process.argv[2] || 'http://localhost:5173/';
  let bad = 0;
  let neverRan = 0; // the browser itself didn't start (not the site's fault)
  for (const profile of ['family', 'tom']) {
    const routes = routesFor(profile);
    const run = spawnSync(process.execPath, [resolve(dirname(ME), 'site-drive.mjs'), site, ME], {
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        SMOKE_ROUTES: JSON.stringify(routes), BLOCK_EXTERNAL: '1',
        INIT_SCRIPT: `try{localStorage.setItem('welcome.done.v1','1');localStorage.setItem('profile','${profile}')}catch(e){}`,
      }),
    });
    let result;
    try { result = JSON.parse(run.stdout.trim().split('\n').pop()); } catch (e) { result = { ok: false, error: (run.stderr || run.stdout || 'the browser did not start').slice(-500) }; }
    console.log(`\n${profile === 'tom' ? "Tom's deck" : 'Kitchen screen'}: ${routes.length} screens`);
    if (!result.ok || !result.screens) { bad++; neverRan++; console.log(`  FAIL  could not run: ${result.error || 'no answer'}`); continue; }
    for (const s of result.screens) {
      const why = [s.broke ? `the test itself broke: ${s.broke}` : '', s.never ? 'never appeared' : '', s.cantOpen ? "says it can't open" : '', s.comingSoon ? 'says "coming soon" (no such screen?)' : '',
        s.empty ? 'is empty' : '', s.odd ? `shows "${s.odd.trim()}"` : '', (s.errors || []).length ? `error: ${s.errors.join(' | ')}` : '',
        (s.policy || []).length ? `breaks the content policy: ${s.policy.join(' | ')}` : ''].filter(Boolean);
      if (why.length) { bad++; console.log(`  FAIL  ${s.route}: ${why.join('; ')}`); } else console.log(`  ok    ${s.route.padEnd(20)} ${String(s.built).padStart(5)} ms`);
    }
    // The app's own word that a screen's code didn't arrive or stopped half-way.
    const fatal = (result.consoleErrors || []).filter((e) => /failed to load|stopped while opening|Refused to (execute|load|apply|connect)/i.test(e));
    for (const e of fatal) { bad++; console.log(`  FAIL  ${e.slice(0, 220)}`); }
  }
  console.log(bad ? `\n${bad} problem(s). Nothing should be published like this.` : '\nEvery screen opens.');
  // 1: a screen failed. 2: the browser never ran at all, so nothing was learned either way.
  process.exit(!bad ? 0 : neverRan === 2 ? 2 : 1);
}
