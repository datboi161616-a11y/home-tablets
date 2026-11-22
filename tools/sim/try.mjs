// node tools/sim/try.mjs <screen> [steps.js] [--tom] [--name=label] [--stub=bridge.js] [--wait=ms]
//
// Opens ONE screen of the working copy in a pretend tablet (headless Edge, 1280x800 touch,
// see site-drive.mjs), optionally does something on it, and reports: what the screen says,
// what your steps returned, any errors, and a picture (tools/sim/shots/try-<label>.jpg).
// The quick way to see a change working without the real hardware.
//
//   node tools/sim/try.mjs timers
//   node tools/sim/try.mjs calendar steps.js --name=cal-add
//   node tools/sim/try.mjs sky --tom
//
// It expects the site at http://localhost:5173/ (python tools/sim/serve.py); SITE=... for
// another address. The tour is switched off and every run starts with empty storage.
//
// steps.js is the body of an async function run inside the page once the screen is up.
// It can tap and type, and what it returns is printed:
//   document.querySelector('[data-add]').click();
//   await sleep(300);                       // sleep(ms) and shot(name) are provided
//   await shot('after-add');                // an extra picture: shots/try-<label>-after-add.jpg
//   return document.querySelector('#screen').innerText.slice(0, 200);
//
// --stub=bridge.js runs before the app's own code: for a pretend window.TabletNative, or
// to put things in localStorage first.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ME = fileURLToPath(import.meta.url);

// ---- as a site-drive module ----
export default async function drive({ ev, shot, sleep, log }) {
  const route = process.env.TRY_ROUTE || 'home';
  const label = process.env.TRY_NAME || route.replace(/[^a-z0-9]+/gi, '-');
  await ev(`(location.hash = '#/' + ${JSON.stringify(route)}, 'ok')`);
  await sleep(Number(process.env.TRY_WAIT || 1800));
  const out = { screen: route };
  if (process.env.TRY_STEPS) {
    const body = readFileSync(process.env.TRY_STEPS, 'utf8');
    // shot() inside the page: asks this side for a picture and waits for it.
    let wanted = null;
    await ev(`(window.sleep = (ms) => new Promise((r) => setTimeout(r, ms)), window.__shots = [], window.shot = (name) => new Promise((r) => window.__shots.push({ name: String(name), done: r })), 'ok')`);
    const pending = ev(`(async () => { ${body}\n })().then((v) => ({ value: v === undefined ? null : v }), (e) => ({ threw: String((e && e.stack) || e).slice(0, 600) }))`);
    let finished = false;
    pending.then(() => { finished = true; });
    while (!finished) {
      wanted = await ev(`(window.__shots[0] || {}).name || null`, 10000);
      if (typeof wanted === 'string') {
        await shot(`try-${label}-${wanted.replace(/[^a-z0-9]+/gi, '-')}`, { scale: 0.5 });
        await ev(`(window.__shots.shift().done(), 'ok')`);
      } else await sleep(100);
    }
    out.steps = await pending;
  }
  await sleep(400);
  out.says = await ev(`document.querySelector('#screen').innerText.replace(/\\s+/g, ' ').trim().slice(0, 900)`);
  out.hash = await ev(`location.hash`);
  out.pageErrors = await ev(`(window.__probe && window.__probe.errors) || []`);
  out.picture = await shot(`try-${label}`, { scale: 0.5 });
  log('done', route);
  return out;
}

// ---- from the command line ----
if (process.argv[1] && resolve(process.argv[1]) === ME) {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith('--'));
  const [route = 'home', steps] = args.filter((a) => !a.startsWith('--'));
  const flag = (name) => { const f = flags.find((x) => x.startsWith(`--${name}=`)); return f ? f.slice(name.length + 3) : ''; };
  const tom = flags.includes('--tom');
  let init = `try{localStorage.setItem('welcome.done.v1','1');localStorage.setItem('profile','${tom ? 'tom' : 'family'}')}catch(e){}`;
  if (flag('stub')) init += `\n;${readFileSync(flag('stub'), 'utf8')}`;
  const site = process.env.SITE || 'http://localhost:5173/';
  const run = spawnSync(process.execPath, [resolve(dirname(ME), 'site-drive.mjs'), site, ME], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      TRY_ROUTE: route, TRY_STEPS: steps ? resolve(steps) : '', TRY_NAME: flag('name'), TRY_WAIT: flag('wait'), INIT_SCRIPT: init,
    }),
  });
  let result;
  try { result = JSON.parse(run.stdout.trim().split('\n').pop()); } catch (e) { result = { ok: false, error: (run.stderr || run.stdout || '').slice(-600) }; }
  console.log(JSON.stringify(result, null, 1));
  process.exit(result.ok && !(result.consoleErrors || []).length && !(result.pageErrors || []).length && !(result.steps && result.steps.threw) ? 0 : 1);
}
