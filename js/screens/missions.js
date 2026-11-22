// Tom · Active missions (Missions.dc.html in the design)
// Next rocket launch from Launch Library 2 with a live T-minus countdown,
// plus cards for famous spacecraft. Deep-space distances are estimated from
// each probe's known distance on 2025-01-01 and its (nearly constant) speed.
// Tapping the launch panel lists every upcoming launch; tapping one there says more.
import { getLocation } from '../services/location.js';
import { getLaunches, nextLaunch, getLastLaunch, getIssPassInfo, passDay, fmtTime } from '../services/space.js';
import { getCrew } from '../services/iss.js';
import { compass } from '../services/astro.js';

let tick;
let reload, reload2;
let launches = [];
let onPlace = null;
let state = null; // { el, loc, source, at, last, listOpen, crewedOnly, open }

const AU = 149597870.7; // km
const KM_PER_MI = 1.609344;
const LIGHT_KMS = 299792.458;
const REF = Date.UTC(2025, 0, 1);
const YEAR = 365.25 * 86400000;
const HOUR = 3600000;

// [distance from the Sun on 2025-01-01 in AU, speed in AU per year] (NASA/JPL mission status, approx.)
const PROBES = { voyager1: [166.1, 3.58], voyager2: [138.8, 3.25], newHorizons: [61.5, 2.9] };
const probeKm = ([d0, v]) => (d0 + (v * (Date.now() - REF)) / YEAR) * AU;
// Miles, like the rest of the deck (planes, Space Station speed).
const billions = (km) => `~${(km / KM_PER_MI / 1e9).toFixed(1)} BILLION MILES`;

// How long a radio message takes to reach the probe, in plain words.
function signalTime(km) {
  const min = Math.round(km / LIGHT_KMS / 60);
  if (min >= 24 * 60) return 'MESSAGES TAKE A FULL DAY';
  return `MESSAGES TAKE ${Math.floor(min / 60)} HR ${min % 60} MIN`;
}

const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shortDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
const exact = (x) => ['MIN', 'SEC', 'HR'].includes(x.precision);

function craftCards() {
  const on = '#7CF29A', far = '#FFB547';
  const v1 = probeKm(PROBES.voyager1), v2 = probeKm(PROBES.voyager2), nh = probeKm(PROBES.newHorizons);
  return [
    { name: 'VOYAGER 1', tag: 'INTERSTELLAR', tagColor: far, what: 'Launched 1977. Left the solar system in 2012.', dist: billions(v1), sub: signalTime(v1) },
    { name: 'VOYAGER 2', tag: 'INTERSTELLAR', tagColor: far, what: 'Only craft to visit Uranus and Neptune.', dist: billions(v2), sub: signalTime(v2) },
    { name: 'NEW HORIZONS', tag: 'KUIPER BELT', tagColor: on, what: 'Flew past Pluto in 2015.', dist: billions(nh), sub: signalTime(nh) },
    { name: 'WEBB TELESCOPE', tag: 'OBSERVING', tagColor: on, what: 'Looking back at the first galaxies.', dist: '~1 MILLION MILES', sub: 'TAP FOR A NEW SPACE PICTURE', href: '#/deepimage' },
    { name: 'PARKER PROBE', tag: 'SOLAR', tagColor: on, what: 'Fastest object humans have built.', dist: '~430,000 MPH', sub: 'AT CLOSEST PASS TO THE SUN' },
    { name: 'SPACE STATION', tag: 'CREWED', tagColor: on, what: 'Circles Earth every 90 minutes.', dist: '<span data-crew>–</span> <span data-crew-word>CREW ABOARD</span>', sub: '<span data-pass>NEXT PASS: CHECKING…</span>', href: '#/sky' },
  ];
}

function card(c) {
  const tag = c.href ? 'a' : 'div';
  // Tappable cards get an arrow so it's clear they lead somewhere.
  return `<${tag} ${c.href ? `href="${c.href}"` : ''} class="ms-card${c.href ? ' ms-link' : ''}">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div class="ms-ox" style="font-size:24px;font-weight:700;letter-spacing:2px;color:#5CE1E6;white-space:nowrap">${c.name}</div>
      <div style="font-size:14px;letter-spacing:2px;color:#05070D;background:${c.tagColor};padding:4px 8px;white-space:nowrap">${c.tag}</div>
    </div>
    <div style="font-size:16px;color:#9CC3D5">${c.what}</div>
    <div class="ms-ox" style="font-size:30px;font-weight:300;color:#FFB547;margin-top:auto">${c.dist}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:16px;letter-spacing:1px;color:#9CC3D5">
      <span class="ms-ell">${c.sub}</span>${c.href ? '<span style="color:#5CE1E6;flex:none;font-size:22px;line-height:16px">▸</span>' : ''}</div>
  </${tag}>`;
}

/** "3:05 PM" today, "SAT 3:05 PM" another day. */
function whenChecked(at) {
  const t = new Date(at);
  const day = t.toDateString() === new Date().toDateString() ? '' : t.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() + ' ';
  return `${day}${fmtTime(t)}`;
}

// Header: when the launch list was last fetched, so stale data is obvious.
function updatedText(source, at) {
  if (source === 'sample') return 'NO SCHEDULE YET · SAMPLE LAUNCH';
  if (!at) return 'REAL SPACECRAFT';
  return `${source === 'stale' ? 'OFFLINE · ' : ''}LAUNCHES AS OF ${whenChecked(at)}`;
}

/** Launch Library's status, said plainly. */
function statusWords(l) {
  switch ((l.statusAbbrev || '').toLowerCase()) {
    case 'go': return 'GO FOR LAUNCH';
    case 'tbc': return 'DATE NOT CONFIRMED';
    case 'tbd': return 'DATE NOT FIRM YET';
    case 'hold': return 'ON HOLD';
    case 'in flight': return 'IN FLIGHT NOW';
    case 'success': return 'LAUNCHED SUCCESSFULLY';
    case 'failure': return 'LAUNCH FAILED';
    case 'partial failure': return 'PARTLY FAILED';
    default: return (l.status || '').toUpperCase();
  }
}

/** When it goes, honest about how well the time is known. */
function whenWords(l) {
  const d = new Date(l.net);
  if (exact(l)) return passDay(d);
  const p = l.precision;
  if (p === 'DAY') return `SOMETIME ON ${shortDate(d)}`;
  if (p === 'MONTH') return `SOMETIME IN ${d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()}`;
  return `NO DATE YET · ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()} AT THE EARLIEST`;
}

function label(x) {
  // Secret launches come through as "Unknown Payload": say so plainly.
  const name = /^unknown payload$/i.test(x.name || '') ? 'Secret payload' : x.name;
  return (x.rocket && x.rocket !== name ? `${name} · ${x.rocket}` : name).toUpperCase();
}

/** How far the launch pad is from home, and which way: "1,050 MILES SOUTH". */
function padFromHome(l, loc) {
  if (!loc || l.padLat == null || l.padLon == null) return '';
  const r = Math.PI / 180;
  const p1 = loc.lat * r, p2 = l.padLat * r, dl = (l.padLon - loc.lon) * r;
  const km = 6371 * 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2));
  const brg = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / r;
  const mi = Math.round(km / KM_PER_MI);
  if (mi < 30) return 'LAUNCH PAD RIGHT NEAR HOME';
  const out = `LAUNCH PAD ${mi.toLocaleString('en-US')} MILES ${compass(brg)}`;
  // A rocket climbing in the dark can be seen a few hundred miles away.
  return mi < 250 ? `${out} · CLOSE ENOUGH TO SEE IN A CLEAR SKY` : out;
}

/** Everything about the next launch except the ticking clock (that changes once a second). */
function showLaunch() {
  const { el } = state;
  const $ = (s) => el.querySelector(s);
  const l = nextLaunch(launches);
  state.shown = l;
  if (!l) {
    $('[data-l-name]').textContent = 'NO LAUNCHES SCHEDULED';
    $('[data-l-site]').textContent = 'CHECK BACK SOON';
    $('[data-l-label]').textContent = 'T-MINUS';
    $('[data-l-count]').textContent = '--:--:--';
    $('[data-l-then]').style.display = 'none';
    return;
  }
  $('[data-l-name]').textContent = label(l) + (l.crewed ? ' · CREWED' : '');
  // Time first: a long launch-site name may be cut off, the time must not be.
  const moved = l.slippedFrom ? `MOVED FROM ${exact(l) ? passDay(new Date(l.slippedFrom)) : shortDate(new Date(l.slippedFrom))}` : '';
  $('[data-l-site]').textContent = [exact(l) ? passDay(new Date(l.net)) : '', statusWords(l), moved, l.site]
    .filter(Boolean).join(' · ').toUpperCase();
  // And the one after it, so there's always something to look forward to.
  const after = launches[launches.indexOf(l) + 1];
  const then = $('[data-l-then]');
  if (after) {
    then.textContent = `THEN: ${label(after)} · ${exact(after) ? passDay(new Date(after.net)) : shortDate(new Date(after.net))}`;
    then.style.display = '';
  } else {
    then.style.display = 'none';
  }
  countdown();
}

/** The T-minus clock: only this text changes every second. */
function countdown() {
  const { el } = state;
  const l = state.shown;
  if (!l) return;
  const lab = el.querySelector('[data-l-label]'), cnt = el.querySelector('[data-l-count]');
  const set = (a, b) => { if (lab.textContent !== a) lab.textContent = a; if (cnt.textContent !== b) cnt.textContent = b; };
  const net = new Date(l.net);
  const ms = net - Date.now();
  const st = (l.statusAbbrev || '').toLowerCase();
  if (!exact(l)) {
    // Only a rough date is known — a ticking clock would be misleading.
    set('NO EXACT TIME YET', l.precision === 'MONTH' ? net.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : shortDate(net));
  } else if (st === 'hold' && ms > 0) {
    set('COUNTDOWN', 'ON HOLD');
  } else if (ms <= 0) {
    if (st === 'success' || st === 'in flight') set('T-PLUS', 'LIFTOFF!');
    else if (st === 'failure' || st === 'partial failure') set('RESULT', 'FAILED');
    else set('T-0 PASSED', 'NO NEWS YET');
  } else {
    const t = Math.floor(ms / 1000);
    const d = Math.floor(t / 86400);
    const hms = `${pad(Math.floor((t % 86400) / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
    set('T-MINUS', d > 0 ? `${d}D ${hms}` : hms);
  }
}

function showLast() {
  const { el, last } = state;
  const box = el.querySelector('[data-l-last]');
  if (!last) { box.style.display = 'none'; return; }
  const words = { success: 'WENT WELL ✓', failure: 'FAILED ✕', partial: 'PARTLY FAILED' }[last.result] || statusWords(last);
  const color = last.result === 'success' ? '#7CF29A' : last.result ? '#FF8A65' : '#9CC3D5';
  box.innerHTML = `LAST LAUNCH: ${esc(label(last))} · ${esc(passDay(new Date(last.net)))} · <span style="color:${color}">${esc(words)}</span>`;
  box.style.display = '';
}

/** The full list of upcoming launches, with a CREWED ONLY choice and details on tap. */
function showList() {
  const { el, loc, crewedOnly, open } = state;
  const now = Date.now();
  const all = launches.filter((l) => new Date(l.net).getTime() > now - 30 * 60000);
  const anyCrewed = all.some((l) => l.crewed);
  const btn = el.querySelector('[data-crewed]');
  btn.style.display = anyCrewed ? '' : 'none';
  btn.textContent = crewedOnly ? 'SHOW ALL' : 'CREWED ONLY';
  const list = crewedOnly && anyCrewed ? all.filter((l) => l.crewed) : all;
  el.querySelector('[data-list]').innerHTML = list.length ? list.map((l, k) => {
    const id = esc(l.id || String(k));
    const isOpen = open === (l.id || String(k));
    const detail = isOpen ? `<div style="margin-top:10px;font-size:18px;line-height:1.45;color:#D7E6F0;white-space:normal">
        ${l.mission ? esc(l.mission) + '<br>' : ''}
        <span style="color:#9CC3D5">${[l.provider, l.orbit, l.site].filter(Boolean).map(esc).join(' · ').toUpperCase()}</span>
        ${padFromHome(l, loc) ? `<br><span style="color:#5CE1E6">${esc(padFromHome(l, loc))}</span>` : ''}
        ${l.probability != null ? `<br><span style="color:#9CC3D5">WEATHER: ${l.probability}% CHANCE IT’S GOOD ENOUGH</span>` : ''}
      </div>` : '';
    return `<div class="ms-item" data-item="${id}">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:baseline">
        <div class="ms-ox ms-ell" style="font-size:24px;font-weight:500">${esc(label(l))}${l.crewed ? ' <span style="color:#7CF29A;font-size:18px">· CREWED</span>' : ''}</div>
        <div style="flex:none;font-size:20px;color:#FFB547">${esc(whenWords(l))}</div>
      </div>
      <div class="ms-ell" style="font-size:17px;color:#9CC3D5;margin-top:4px">${esc([statusWords(l), l.slippedFrom ? 'DATE MOVED' : '', l.site.toUpperCase()].filter(Boolean).join(' · '))}${isOpen ? '' : ' <span style="color:#5CE1E6">▸ MORE</span>'}</div>
      ${detail}
    </div>`;
  }).join('') : '<div class="ms-item" style="font-size:20px">NO UPCOMING LAUNCHES IN THE SCHEDULE RIGHT NOW.</div>';
}

export function mount(el) {
  el.innerHTML = `
  <link rel="stylesheet" crossorigin href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .ms-root{width:1280px;height:800px;box-sizing:border-box;padding:24px 40px;background:#05070D;color:#D7E6F0;font-family:'JetBrains Mono',monospace;display:flex;flex-direction:column;gap:16px;position:relative}
    .ms-root a{color:#5CE1E6}
    .ms-ox{font-family:Oxanium,sans-serif}
    .ms-card{border:1px solid #1E3A4A;background:#0A1220;padding:16px 20px;display:flex;flex-direction:column;gap:6px;min-width:0;text-decoration:none;color:#D7E6F0}
    .ms-ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ms-link:active,.ms-launch:active,.ms-item:active{border-color:#5CE1E6 !important}
    .ms-btn{min-height:56px;padding:10px 20px;box-sizing:border-box;border:1px solid #1E3A4A;background:#0A1220;color:#5CE1E6;font-family:inherit;font-size:16px;letter-spacing:3px;display:flex;align-items:center;flex:none;text-decoration:none;cursor:pointer}
    .ms-item{border:1px solid #1E3A4A;background:#0A1220;padding:14px 20px;min-height:56px;box-sizing:border-box;cursor:pointer}
  </style>
  <div class="ms-root">
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1E3A4A;padding-bottom:12px">
      <div style="display:flex;align-items:center;gap:16px">
        <a href="#/bridge" class="ms-btn">◂ DECK</a>
        <div class="ms-ox" style="font-size:24px;font-weight:700;letter-spacing:6px;color:#5CE1E6">ACTIVE MISSIONS</div>
      </div>
      <div data-updated style="font-size:16px;letter-spacing:2px;color:#9CC3D5">REAL SPACECRAFT · UPDATED HOURLY</div>
    </div>
    <div data-launch class="ms-launch" role="button" style="border:1px solid #FFB547;background:#0A1220;padding:18px 26px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:center;cursor:pointer">
      <div style="display:flex;flex-direction:column;gap:5px;min-width:0">
        <div data-l-eyebrow style="font-size:15px;letter-spacing:4px;color:#FFB547">NEXT ROCKET LAUNCH</div>
        <div data-l-name class="ms-ox ms-ell" style="font-size:34px;font-weight:500">LOADING LAUNCH SCHEDULE…</div>
        <div data-l-site class="ms-ell" style="font-size:17px;color:#9CC3D5">&nbsp;</div>
        <div data-l-then class="ms-ell" style="display:none;font-size:16px;letter-spacing:1px;color:#5CE1E6"></div>
        <div data-l-last class="ms-ell" style="display:none;font-size:16px;letter-spacing:1px;color:#9CC3D5"></div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <div data-l-label style="font-size:15px;letter-spacing:4px;color:#9CC3D5">T-MINUS</div>
        <div data-l-count class="ms-ox" style="font-size:64px;font-weight:300;color:#FFB547;line-height:1;font-variant-numeric:tabular-nums">--:--:--</div>
        <div style="font-size:16px;letter-spacing:2px;color:#5CE1E6">ALL LAUNCHES ▸</div>
      </div>
    </div>
    <div style="flex-grow:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:14px;min-height:0">
      ${craftCards().map(card).join('')}
    </div>
    <div data-sheet style="display:none;position:absolute;top:0;left:0;width:1280px;height:800px;box-sizing:border-box;padding:24px 40px;background:#05070D;flex-direction:column;gap:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #1E3A4A;padding-bottom:12px">
        <div class="ms-ox" style="font-size:26px;font-weight:700;letter-spacing:5px;color:#5CE1E6">UPCOMING LAUNCHES</div>
        <div style="display:flex;gap:12px">
          <button data-crewed class="ms-btn" style="display:none">CREWED ONLY</button>
          <button data-close class="ms-btn">CLOSE ✕</button>
        </div>
      </div>
      <div data-list style="display:flex;flex-direction:column;gap:10px;overflow-y:auto;min-height:0;flex:1"></div>
      <div style="font-size:16px;color:#9CC3D5">TAP A LAUNCH FOR MORE · TIMES ARE YOUR LOCAL TIME · LAUNCH DATES OFTEN MOVE</div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  state = { el, loc: null, source: null, at: null, last: null, listOpen: false, crewedOnly: false, open: null, shown: null };
  const mine = state;

  tick = setInterval(() => {
    if (state !== mine) return;
    // The next launch can change by itself (one goes, the next one is up): then redraw it all.
    if (nextLaunch(launches) !== state.shown) showLaunch(); else countdown();
  }, 1000);

  // Launch times slip and scrub: re-read the schedule every 15 minutes while the screen is
  // open (space.js serves its copy while it is fresh). Within an hour of a launch the copy
  // may only be 10 minutes old, so a scrub or hold shows up.
  async function loadLaunches() {
    const soon = launches.some((l) => Math.abs(new Date(l.net) - Date.now()) < HOUR && exact(l));
    const r = await getLaunches(soon ? { maxAge: 10 * 60000 } : undefined);
    if (state !== mine || !el.isConnected) return;
    launches = r.launches;
    state.source = r.source; state.at = r.at;
    $('[data-l-eyebrow]').textContent = r.source === 'sample' ? 'NEXT ROCKET LAUNCH · SAMPLE (NO SCHEDULE YET)' : 'NEXT ROCKET LAUNCH';
    $('[data-updated]').textContent = updatedText(r.source, r.at);
    showLaunch();
    if (state.listOpen) showList();
    getLastLaunch().then((last) => { if (state === mine) { state.last = last && last.source !== 'sample' ? last : null; showLast(); } }).catch(() => {});
  }
  loadLaunches();
  reload = setInterval(loadLaunches, 15 * 60 * 1000);

  $('[data-launch]').addEventListener('click', () => {
    state.listOpen = true;
    $('[data-sheet]').style.display = 'flex';
    showList();
  });
  $('[data-close]').addEventListener('click', () => {
    state.listOpen = false; state.open = null;
    $('[data-sheet]').style.display = 'none';
  });
  $('[data-crewed]').addEventListener('click', () => { state.crewedOnly = !state.crewedOnly; showList(); });
  $('[data-list]').addEventListener('click', (e) => {
    const item = e.target.closest('[data-item]');
    if (!item) return;
    state.open = state.open === item.dataset.item ? null : item.dataset.item;
    showList();
  });

  // Who is aboard: the real count, or nothing at all when it isn't known (no made-up number).
  getCrew().then((c) => {
    if (state !== mine) return;
    if (c && c.onIss) $('[data-crew]').textContent = c.onIss;
    else { $('[data-crew]').textContent = ''; $('[data-crew-word]').textContent = 'CREW: NOT KNOWN YET'; }
  }).catch(() => {});

  async function loadPass() {
    try {
      const loc = await getLocation();
      if (state !== mine) return;
      state.loc = loc;
      const info = await getIssPassInfo(loc, 72);
      if (state !== mine || !el.isConnected) return;
      const p = info.passes.find((x) => x.end > Date.now());
      $('[data-pass]').textContent = p ? `NEXT PASS ${passDay(p.start)}, ${compass(p.startAz, true)}`
        : info.known ? 'NO VISIBLE PASS IN 3 DAYS' : 'ORBITING AT 17,500 MPH';
      if (state.listOpen) showList();
    } catch (err) {
      console.warn(err);
      if (state === mine && el.isConnected) $('[data-pass]').textContent = 'ORBITING AT 17,500 MPH';
    }
  }
  loadPass();
  // The "next pass" moves on as passes go by, even if the screen is left open for days.
  reload2 = setInterval(loadPass, 30 * 60 * 1000);
  onPlace = () => loadPass();
  window.addEventListener('place-changed', onPlace);
}

export function unmount() {
  clearInterval(tick);
  clearInterval(reload);
  clearInterval(reload2);
  if (onPlace) window.removeEventListener('place-changed', onPlace);
  onPlace = null;
  launches = [];
  state = null;
}
