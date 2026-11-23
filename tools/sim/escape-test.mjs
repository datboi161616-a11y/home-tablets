// node tools/sim/escape-test.mjs [name ...]
//
// Does text from OUTSIDE stay text? Notes and names typed on phones, calendar feeds, weather
// warnings, plane and launch feeds and what the Android bridge hands over all end up on the
// screens, which build themselves with innerHTML; window.TabletNative (open apps, save
// settings, read photos) is in reach of anything that gets to run there. Each case below
// opens one screen in the pretend tablet (tools/sim/try.mjs) with hostile text arriving the
// way it really would (a pretend window.TabletNative, a stubbed fetch, or storage filled
// beforehand), then checks inside the page that:
//   - window.__pwned (or window.P, for the short payloads) was never set,
//   - nothing in #screen became markup: no <script>, no on...= attribute, no [data-pwn],
//   - the hostile text is shown literally (otherwise the case didn't reach its target).
// One PASS/FAIL line per case; exits non-zero when any case fails.
//
// Needs what try.mjs needs: the site at http://localhost:5173/ (python tools/sim/serve.py)
// and Edge. About 15 s a case. Not run by tools/check.sh (no browser there).
// Give case names to run only those, e.g.  node tools/sim/escape-test.mjs notes calendar
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const j = JSON.stringify;

// The payloads: they break out of text, "double-quoted" and 'single-quoted' attributes alike.
const H = `"'><img src=x onerror="window.__pwned=1" data-pwn></div><script>window.__pwned=2</script>`;
const H50 = `"'><img src=x onerror="window.__pwned=1" data-pwn>`; // fits 50-60 letter fields
const H30 = '<img src=x onerror=__pwned=1>';                    // fits 30-letter fields (names)
const H18 = '<svg onload=P=1>';                                 // survives an 18-letter cut
const SEEN = 'onerror="window.__pwned=1"';                      // what must show up as plain text
const SEEN30 = 'onerror=__pwned=1';
// The same, entity-encoded the way a WordPress site sends titles (decoded to text by web-recipes.js).
const WEB_H = '&lt;img src=x onerror=&quot;window.__pwned=1&quot; data-pwn&gt;';

// Before the app's own code: fetch to the outside world answers from ROUTES, or fails as if
// offline (so nothing real is asked); the site's own files load as usual.
const fetchStub = (routes) => `
(() => {
  const ROUTES = ${j(routes)};
  const real = window.fetch.bind(window);
  window.fetch = (u, o) => {
    const url = String((u && u.url) || u);
    for (const r of ROUTES) if (new RegExp(r[0]).test(url)) {
      return Promise.resolve(new Response(typeof r[1] === 'string' ? r[1] : JSON.stringify(r[1]), { status: r[2] || 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (/^https?:/.test(url) && !/^https?:\\/\\/(localhost|127\\.0\\.0\\.1)[:/]/.test(url)) return Promise.reject(new TypeError('offline (escape test)'));
    return real(u, o);
  };
})();`;
const bridge = (methods) => `window.TabletNative = Object.assign(window.TabletNative || {}, ${methods});`;
const store = (k, v) => `try { localStorage.setItem(${j(k)}, ${j(typeof v === 'string' ? v : JSON.stringify(v))}); } catch (e) {}`;
const NY = store('location.manual.v1', { lat: 40.7128, lon: -74.006, town: 'New York', region: 'NY', label: 'New York, NY', source: 'manual' });

const CASES = [
  {
    name: 'notes', route: 'messages', seen: [SEEN, SEEN30],
    stub: bridge(`{
      notes: () => ${j(j([{ id: 'n1', who: H30, text: H, at: Date.now() - 60000, love: 0, read: false, replyTo: H30 }]))},
      markNotesRead: () => true, loveNote: () => true, deleteNote: () => true, addNote: () => '' }`),
  },
  {
    name: 'calendar', route: 'calendar', seen: [SEEN],
    // A linked calendar feed: the event's title, place and the calendar's own name are the sender's.
    stub: bridge(`{
      familySettings: () => ${j(j({ familyName: 'Test', people: [], dates: [{ name: H50, month: new Date().getMonth() + 1, day: new Date().getDate(), kind: 'event' }], calendars: [{ name: H30, url: 'https://example.com/a.ics' }], units: 'fahrenheit' }))},
      fetchCalendars: (cb) => {
        const d = new Date(), p = (n) => String(n).padStart(2, '0');
        const day = '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
        const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Calendar', 'BEGIN:VEVENT', 'UID:x1', 'DTSTART:' + day + 'T120000', 'DTEND:' + day + 'T130000',
          'SUMMARY:' + ${j(H)}, 'LOCATION:' + ${j(H)}, 'END:VEVENT', 'END:VCALENDAR'].join('\\r\\n');
        setTimeout(() => window[cb]([{ name: '', ics, ok: true }]), 50);
      } }`),
    steps: `await sleep(1500);
      const d = new Date(), p = (n) => String(n).padStart(2, '0');
      const box = document.querySelector('[data-day="' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '"]');
      if (box) box.click();
      await sleep(600);`,
  },
  {
    name: 'photo-caption', route: 'photos/album', seen: [SEEN30],
    stub: bridge(`{
      photoBase: () => 'http://localhost:5173/no-such-folder/',
      photoList: () => ${j(j([{ id: 'p1', name: H30, caption: H, added: Date.now() - 3600000, video: false }]))},
      uploadUrl: () => '' }`),
    steps: 'await sleep(800);',
  },
  {
    name: 'family-name', route: 'home', seen: [SEEN30],
    stub: bridge(`{ familySettings: () => ${j(j({ familyName: H30, people: [], dates: [], calendars: [], units: 'fahrenheit' }))} }`),
  },
  {
    name: 'app-name', route: 'apps', seen: [SEEN],
    stub: bridge(`{ appList: () => ${j(j([{ pkg: 'com.example.evil', label: H, icon: '' }, { pkg: 'com.example.two', label: H50 }]))}, openApp: () => true }`),
  },
  {
    name: 'shopping-item', route: 'shopping', seen: [SEEN],
    // Added on a phone: the Android side passes it on as a 'tablet-shopping' event.
    stub: bridge('{ setShoppingList: () => true }'),
    steps: `window.dispatchEvent(new CustomEvent('tablet-shopping', { detail: { act: 'add', text: ${j(H50)} } }));
      await sleep(900);`,
  },
  {
    name: 'own-recipe', route: 'dish/my-abcd1', seen: [SEEN],
    stub: bridge(`{ myRecipes: () => ${j(j([{ id: 'my-abcd1', title: H50, meal: 'dinner', blurb: H50, serves: 4, prep: 10, cook: 20, ingredients: [H50], steps: ['Bake 25 minutes ' + H50], updated: Date.now() }]))} }`),
  },
  {
    // Cooking one recipe while another's step timer runs: the other one's name is on a chip.
    name: 'recipe-timer-chip', route: 'recipe/my-bbbb2', seen: [H18],
    stub: bridge(`{ myRecipes: () => ${j(j([
      { id: 'my-aaaa1', title: H18, meal: 'dinner', blurb: '', serves: 4, prep: 0, cook: 25, ingredients: ['1 egg'], steps: ['Bake 25 minutes'], updated: 1 },
      { id: 'my-bbbb2', title: 'Plain soup', meal: 'dinner', blurb: '', serves: 4, prep: 0, cook: 5, ingredients: ['1 egg'], steps: ['Stir it'], updated: 2 },
    ]))} }`) + `\n;try { localStorage.setItem('recipe.v1.my-aaaa1', JSON.stringify({ step: 0, checked: [], timers: { 0: { end: Date.now() + 600000, label: 'Bake' } }, at: Date.now() })); } catch (e) {}`,
    steps: 'await sleep(1500);',
  },
  {
    name: 'timer-name', route: 'timers', seen: [SEEN30],
    stub: `try { localStorage.setItem('kitchen.timers.v1', JSON.stringify([{ id: 't1', label: ${j(H30)}, named: true, secs: 600, end: Date.now() + 600000 }])); } catch (e) {}`,
  },
  {
    name: 'weather-alert', route: 'forecast', seen: [SEEN],
    stub: NY + fetchStub([
      ['api\\.weather\\.gov/alerts', { features: [{ properties: { status: 'Actual', messageType: 'Alert', event: H50, severity: 'Severe', headline: H, description: H, instruction: H, ends: new Date(Date.now() + 864e5).toISOString() } }] }],
    ]),
    steps: `await sleep(1500);
      const a = document.querySelector('[data-f-alert]');
      if (a) a.click();
      await sleep(600);`,
  },
  {
    // Open-Meteo's own fields: a day's date is put in an attribute of the day card.
    name: 'forecast-date', route: 'forecast', check: `[...document.querySelectorAll('[data-f-date]')].some((x) => x.getAttribute('data-f-date').indexOf(${j(SEEN)}) >= 0)`,
    stub: NY + `
      (() => {
        const p = (n) => String(n).padStart(2, '0');
        const iso = (d) => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
        const t0 = new Date(); t0.setHours(0, 0, 0, 0);
        const days = [0, 1, 2, 3, 4, 5, 6].map((i) => iso(new Date(t0.getTime() + i * 864e5)));
        days[1] = '2099-01-01' + ${j(H50)};
        const hours = []; for (let h = 0; h < 48; h++) { const d = new Date(t0.getTime() + h * 36e5); hours.push(iso(d) + 'T' + p(d.getHours()) + ':00'); }
        const n = (len, v) => Array.from({ length: len }, () => v);
        window.__forecast = {
          current: { temperature_2m: 50, apparent_temperature: 48, weather_code: 1, wind_speed_10m: 5, wind_direction_10m: 90, wind_gusts_10m: 9, relative_humidity_2m: 60, is_day: 1 },
          hourly: { time: hours, temperature_2m: n(48, 50), weather_code: n(48, 1), precipitation_probability: n(48, 0), snowfall: n(48, 0), precipitation: n(48, 0), is_day: n(48, 1), wind_speed_10m: n(48, 5) },
          daily: { time: days, weather_code: n(7, 1), temperature_2m_max: n(7, 55), temperature_2m_min: n(7, 40), sunrise: days.map(() => iso(t0) + 'T07:00'), sunset: days.map(() => iso(t0) + 'T17:00'),
            precipitation_probability_max: n(7, 0), snowfall_sum: n(7, 0), precipitation_sum: n(7, 0), wind_speed_10m_max: n(7, 8), wind_gusts_10m_max: n(7, 12), wind_direction_10m_dominant: n(7, 90), uv_index_max: n(7, 2) },
          hourly_units: {},
        };
      })();` + fetchStub([]).replace('for (const r of ROUTES)', "if (/api\\.open-meteo\\.com\\/v1\\/forecast/.test(url)) return Promise.resolve(new Response(JSON.stringify(window.__forecast), { status: 200 }));\n    for (const r of ROUTES)"),
    steps: 'await sleep(1500);',
  },
  {
    name: 'aircraft', route: 'flights', tom: true, seen: [SEEN.toUpperCase(), SEEN],
    stub: NY + fetchStub([
      ['adsb\\.lol|adsb\\.fi', { ac: [{ hex: 'abc123', flight: 'BAW123', r: H50, t: 'B738', desc: H, ownOp: H, alt_baro: 12000, gs: 300, track: 90, lat: 40.75, lon: -74.0 }] }],
      ['adsbdb\\.com/v0/callsign', { response: { flightroute: { callsign_iata: 'BA123', airline: { name: H }, origin: { iata_code: 'JFK', name: H, municipality: H }, destination: { iata_code: 'LHR', name: H, municipality: H } } } }],
      ['adsbdb\\.com/v0/aircraft', { response: { aircraft: { url_photo: 'javascript:window.__pwned=3', registration: H50, registered_owner: H } } }],
    ]),
    steps: `await sleep(2500);
      const row = document.querySelector('[data-hex="abc123"]');
      if (row) row.click();
      await sleep(1200);`,
  },
  {
    // The deck's "closest plane" line shows the callsign as the feed sends it.
    name: 'aircraft-callsign', route: 'bridge', tom: true, seen: [SEEN.toUpperCase(), SEEN],
    stub: NY + fetchStub([
      ['adsb\\.lol|adsb\\.fi', { ac: [{ hex: 'abc124', flight: H50, r: H50, t: 'B738', desc: H, ownOp: H, alt_baro: 9000, gs: 300, track: 90, lat: 40.75, lon: -74.0 }] }],
    ]),
    steps: 'await sleep(2500);',
  },
  {
    name: 'launch', route: 'missions', tom: true, seen: [SEEN.toUpperCase(), SEEN],
    stub: fetchStub([
      ['launches/upcoming', { results: [{ id: 'L1', name: `${H50} | ${H50}`, net: new Date(Date.now() + 3 * 864e5).toISOString(), net_precision: { abbrev: 'MIN' }, status: { name: H, abbrev: 'Go' }, launch_service_provider: { name: H }, mission: { name: H, description: H, orbit: { name: H } }, rocket: { configuration: { name: H } }, pad: { name: H, location: { name: H }, latitude: 28.5, longitude: -80.6 } }] }],
      ['launches/previous', { results: [{ id: 'L0', name: `${H50} | ${H50}`, net: new Date(Date.now() - 864e5).toISOString(), net_precision: { abbrev: 'MIN' }, status: { name: H, abbrev: 'Success' }, mission: { name: H } }] }],
      ['people-in-space', { number: 1, people: [{ name: H, iss: true, craft: 'ISS' }] }],
    ]),
    steps: `await sleep(2500);
      const it = document.querySelector('[data-item]');
      if (it) it.click();
      await sleep(600);`,
  },
  {
    // Recipes from the web (web-recipes.js): a site's titles come entity-encoded, so they
    // decode into markup-looking text; the picture address tries to break out of href="".
    name: 'web-recipe-search', route: 'recipes', seen: [SEEN],
    stub: fetchStub([
      ['wprm_recipe\\?', [{ id: 7, recipe: { name: `Tacos ${WEB_H}`, image_url: 'https://x.test/a.jpg" onload="window.__pwned=3', total_time: '30' } }]],
    ]),
    steps: `const tap = (el) => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); el.click(); };
      tap(document.querySelector('[data-search]'));
      await sleep(200);
      'ab'.split('').forEach((c) => tap(document.querySelector('[data-k="' + c + '"]')));
      tap(document.querySelector('[data-kgo]'));
      await sleep(1800);`,
  },
  {
    name: 'web-recipe-page', route: 'dish/web:bb:7', seen: [SEEN],
    stub: fetchStub([
      ['wprm_recipe/7', { id: 7, link: 'javascript:window.__pwned=4', recipe: {
        name: WEB_H, image_url: 'https://x.test/a.jpg"><img src=x onerror="window.__pwned=5">', summary: `<p>${H}</p>`, servings: '4', prep_time: '5', cook_time: '10', total_time: '15',
        tags: { cuisine: [{ name: H }], course: [{ name: H }] },
        ingredients_flat: [{ type: 'group', name: H }, { type: 'ingredient', amount: '1', unit: H30, name: WEB_H, notes: H }],
        instructions_flat: [{ type: 'instruction', text: `<p>Bake 10 minutes ${WEB_H}</p><script>window.__pwned=6</script>` }],
      } }],
    ]),
    steps: 'await sleep(1500);',
  },
];

// Run inside the page after the case's own steps.
const CHECK = (c) => `
${c.steps || 'await sleep(600);'}
await sleep(700); // time for a broken picture's onerror to have fired, had one got in
const s = document.querySelector('#screen');
const bad = [];
s.querySelectorAll('*').forEach((e) => {
  if (e.tagName === 'SCRIPT' || e.hasAttribute('data-pwn') || [].some.call(e.attributes, (a) => /^on/i.test(a.name))) bad.push(e.outerHTML.slice(0, 120));
});
const text = s.innerText;
const seen = ${c.check ? `!!(${c.check})` : `${j(c.seen || [])}.some((x) => text.indexOf(x) >= 0)`};
return { pwned: window.__pwned || window.P || null, bad, seen };`;

const only = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), 'escape-test-'));
let failed = 0;
for (const c of CASES) {
  if (only.length && only.indexOf(c.name) < 0) continue;
  const stubFile = join(dir, `${c.name}-stub.js`);
  const stepsFile = join(dir, `${c.name}-steps.js`);
  writeFileSync(stubFile, c.stub || '');
  writeFileSync(stepsFile, CHECK(c));
  const args = [join(HERE, 'try.mjs'), c.route, stepsFile, `--stub=${stubFile}`, `--name=escape-${c.name}`];
  if (c.tom) args.push('--tom');
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 120000 });
  let out = null;
  try { out = JSON.parse(run.stdout.slice(run.stdout.indexOf('{'))); } catch (e) { out = null; }
  const v = out && out.steps && out.steps.value;
  let why = '';
  if (!v) why = `the screen didn't run the check (${out && out.steps && out.steps.threw ? out.steps.threw.slice(0, 200) : (run.stderr || run.stdout || '').slice(-200)})`;
  else if (v.pwned) why = `script ran (window.__pwned = ${j(v.pwned)})`;
  else if (v.bad.length) why = `became markup: ${v.bad[0]}`;
  else if (!v.seen) why = 'the hostile text never showed up, so nothing was tested';
  const pageErrors = (out && out.pageErrors) || [];
  if (!why && pageErrors.length) why = `page error: ${String(pageErrors[0]).slice(0, 200)}`;
  if (why) failed++;
  console.log(`${why ? 'FAIL' : 'PASS'} ${c.name} (#/${c.route})${why ? ` — ${why}` : ''}`);
}
rmSync(dir, { recursive: true, force: true });
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
