// Tom · Sky alert (Alert.dc.html in the design)
// Shows the most important real sky event happening now (see services/skyalert.js).
// The Bridge jumps here automatically when a new one starts. With nothing going on
// it shows an "all clear" panel counting down to the next visible Space Station
// pass, plus a TEST ALERT button that plays the design's 3:00 example.
import { getLocation } from '../services/location.js';
import { nextVisiblePass, orbitStatus, brightnessWords } from '../services/iss.js';
import { compass } from '../services/astro.js';
import { passDay } from '../services/space.js';
import { checkAlerts, testAlert, startTest, stopTest, testActive, markSeen, dismiss, nextShower, heightWords } from '../services/skyalert.js';

let timers = [];
let alive = false;

const pad = (n) => String(n).padStart(2, '0');
// Under an hour it ticks as 9:59; longer waits read "6 HR 01 MIN" so the
// countdown can't be mistaken for a clock time (it sits right above one).
function countdown(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h} HR ${pad(m)} MIN` : `${m}:${pad(s % 60)}`;
}
const bigSize = (text) => Math.min(190, Math.floor(1150 / (Math.max(text.length, 1) * 0.58)));

// Every kind of alert has a chip, so the one going off lights up.
const CHIPS = [
  ['iss', 'SPACE STATION FLYING OVER'],
  ['launch', 'ROCKET ABOUT TO LAUNCH'],
  ['plane', 'RARE OR VERY LOW PLANE'],
  ['aurora', 'NORTHERN LIGHTS TONIGHT'],
  ['meteor', 'METEOR SHOWER PEAK'],
];
const chipKind = (kind) => (kind === 'rare' || kind === 'overhead' ? 'plane' : kind);

export function mount(el) {
  alive = true;
  el.innerHTML = `
  <link rel="stylesheet" crossorigin href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .tba a,.tba button.tba-btn{color:#FFD2CB}.tba a:hover{color:#FFFFFF}
    @keyframes tba-pulse{0%{opacity:1}100%{opacity:.35}}
    .tba .pulse{animation:tba-pulse 1.6s steps(2) infinite}
    .tba-btn{min-height:56px;padding:10px 20px;box-sizing:border-box;border:1px solid #7A2A20;background:none;font-family:inherit;text-decoration:none;font-size:14px;letter-spacing:3px;display:flex;align-items:center;cursor:pointer}
    .tba.calm{background:#05070D !important;color:#D7E6F0 !important}
    .tba.calm .pulse{animation:none}
    .tba.calm [data-bar]{background:#1E3A4A !important}
    .tba.calm [data-head]{color:#5CE1E6 !important}
    .tba.calm [data-label],.tba.calm [data-sub],.tba.calm [data-chips-label]{color:#7FA6B8 !important}
    .tba.calm .tba-btn,.tba.calm [data-chips] > div,.tba.calm [data-chips-wrap]{border-color:#1E3A4A !important;color:#D7E6F0}
    .tba.calm [data-big]{color:#FFB547 !important}
    .tba [data-chips] > div.on{border-color:#FF6B57;background:rgba(255,59,46,.18);color:#FFFFFF}
  </style>
  <div class="tba calm" style="width: 1280px; height: 800px; box-sizing: border-box; padding: 24px 40px 40px; background: #160606; color: #FFE7E2; font-family: 'JetBrains Mono', monospace; display: flex; flex-direction: column; gap: 24px; position: relative">
    <div data-bar class="pulse" style="position: absolute; left: 0; right: 0; top: 0; height: 14px; background: #FF3B2E"></div>
    <div data-bar class="pulse" style="position: absolute; left: 0; right: 0; bottom: 0; height: 14px; background: #FF3B2E"></div>
    <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px">
      <div style="display: flex; align-items: center; gap: 16px; min-width: 0">
        <a data-deck href="#/bridge" class="tba-btn" style="padding: 0 22px; font-size: 16px; flex: none">◂ DECK</a>
        <div data-head class="pulse" style="font-family: Oxanium, sans-serif; font-size: 28px; font-weight: 700; letter-spacing: 10px; color: #FF6B57; white-space: nowrap">SKY ALERT</div>
      </div>
      <div style="display: flex; gap: 12px; flex: none">
        <a data-link href="#/bridge" class="tba-btn" style="display: none"></a>
        <button data-seen class="tba-btn" style="display: none">SEEN IT ✓</button>
        <button data-test class="tba-btn">TEST ALERT</button>
        <a data-dismiss href="#/bridge" class="tba-btn" style="display: none">DISMISS</a>
      </div>
    </div>
    <div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: center; gap: 18px; min-width: 0">
      <div data-label style="font-size: 18px; letter-spacing: 5px; color: #FF9A8C">CHECKING THE SKY…</div>
      <div data-big style="font-family: Oxanium, sans-serif; font-size: 190px; font-weight: 300; line-height: 1; color: #FFFFFF; white-space: nowrap">--:--</div>
      <div data-headline style="font-family: Oxanium, sans-serif; font-size: 40px; font-weight: 500">&nbsp;</div>
      <div data-sub style="font-size: 18px; color: #FF9A8C">&nbsp;</div>
    </div>
    <div data-chips-wrap style="border-top: 1px solid #7A2A20; padding-top: 16px; display: flex; flex-direction: column; gap: 10px">
      <div data-chips-label style="font-size: 13px; letter-spacing: 4px; color: #FF9A8C">THIS SCREEN GOES RED FOR</div>
      <div data-chips style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; font-size: 15px">
        ${CHIPS.map(([k, t]) => `<div data-chip="${k}" style="border: 1px solid #7A2A20; padding: 12px 14px">${t}${k === 'meteor' ? '<span data-shower></span>' : ''}</div>`).join('')}
      </div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const root = $('.tba');
  let loc = null;
  let guessed = false; // the town isn't known yet: New York stands in, and the times say so
  let alert = null;   // active alert (real or test)
  let calm = null;    // { pass } when nothing is happening

  function setBig(text) {
    const b = $('[data-big]');
    if (b.textContent !== text) b.textContent = text;
    b.style.fontSize = bigSize(text) + 'px';
  }

  function tick() {
    if (!alive) return;
    const now = Date.now();
    if (alert) {
      root.classList.remove('calm');
      $('[data-head]').textContent = alert.test ? 'SKY ALERT · TEST' : 'SKY ALERT';
      $('[data-test]').style.display = alert.test ? 'none' : '';
      $('[data-seen]').style.display = alert.test ? 'none' : '';
      if (alert.until) {
        if (alert.until > now) {
          $('[data-label]').textContent = alert.label;
          setBig(countdown(alert.until - now));
        } else if (alert.ends > now) {
          $('[data-label]').textContent = alert.nowLabel || alert.label;
          setBig('NOW');
        } else if (alert.test) {
          startTest(); // loop the demo, like the design
          alert = testAlert();
          return tick();
        } else {
          alert = null;
          refresh();
          return;
        }
      } else {
        $('[data-label]').textContent = alert.label;
        setBig(alert.big);
      }
      $('[data-headline]').textContent = alert.headline;
      $('[data-sub]').textContent = alert.sub;
      el.querySelectorAll('[data-chip]').forEach((c) => c.classList.toggle('on', c.dataset.chip === chipKind(alert.kind)));
      $('[data-dismiss]').style.display = '';
      // A way to the screen with more about it (launch details, the plane radar).
      const link = $('[data-link]');
      if (alert.link) {
        link.setAttribute('href', alert.link.href);
        link.textContent = alert.link.label + ' ▸';
        link.style.display = '';
      } else {
        link.style.display = 'none';
      }
      return;
    }

    // Nothing happening: calm panel
    root.classList.add('calm');
    $('[data-head]').textContent = 'SKY ALERT · ALL CLEAR';
    $('[data-test]').style.display = '';
    $('[data-seen]').style.display = 'none';
    $('[data-link]').style.display = 'none';
    $('[data-dismiss]').style.display = 'none';
    el.querySelectorAll('[data-chip]').forEach((c) => c.classList.remove('on'));
    const sh = nextShower();
    if (sh) {
      const isTonight = sh.date.toDateString() === new Date(now - (new Date(now).getHours() <= 4 ? 86400000 : 0)).toDateString();
      $('[data-shower]').textContent = isTonight ? ' · TONIGHT!'
        : ` · NEXT: ${sh.name}, ${sh.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}`;
    }
    const p = calm?.pass;
    if (p && p.visEnd < now) { calm = null; refresh(); return; }
    if (p && p.visStart > now) {
      $('[data-label]').textContent = 'NOTHING RIGHT NOW · NEXT VISIBLE SPACE STATION PASS IN';
      setBig(countdown(p.visStart - now));
      $('[data-headline]').textContent = `${passDay(new Date(p.visStart))} · LOOK ${compass(p.visAz)}`;
      const bright = brightnessWords(p) === 'VERY BRIGHT' ? 'very bright' : brightnessWords(p) === 'BRIGHT' ? 'bright' : 'fainter';
      const path = p.visMaxAz != null && p.visEndAz != null ? ` · Highest ${compass(p.visMaxAz).toLowerCase()}, fades ${compass(p.visEndAz).toLowerCase()}` : '';
      const mins = Math.max(1, Math.round((p.visEnd - p.visStart) / 60000));
      $('[data-sub]').textContent = `About ${mins} minute${mins > 1 ? 's' : ''} of ${bright} steady light, ${heightWords(p.visMaxEl)}${path} · `
        + (guessed ? 'Worked out for New York until the screen finds your town' : 'This screen goes red 10 minutes before');
    } else if (calm) {
      $('[data-label]').textContent = 'NOTHING RIGHT NOW';
      setBig('CLEAR');
      // "None" and "we can't tell" are different things: say which.
      $('[data-headline]').textContent = calm.orbitOk === false ? 'SPACE STATION TIMES UNAVAILABLE RIGHT NOW' : 'NO SPACE STATION PASSES IN THE DARK FOR 2 DAYS';
      $('[data-sub]').textContent = calm.orbitOk === false ? 'Its latest orbit could not be fetched · Rockets, planes and the night sky are still watched every minute'
        : 'We keep watching the sky every minute';
    }
  }

  async function refresh() {
    if (testActive()) { alert = testAlert(); tick(); return; }
    if (!loc) return;
    try {
      const a = await checkAlerts(loc);
      if (!alive || testActive()) return;
      alert = a;
      if (a) markSeen(a.id);
      if (!a && !calm) calm = await calmInfo();
      if (!alive) return;
    } catch (e) {
      console.error(e);
      if (!calm) calm = { pass: null };
    }
    tick();
  }

  async function calmInfo() {
    const pass = await nextVisiblePass(loc);
    let orbitOk = true;
    try { orbitOk = (await orbitStatus()).ok; } catch (e) { /* keep true */ }
    return { pass, orbitOk };
  }

  $('[data-test]').addEventListener('click', () => {
    startTest();
    alert = testAlert();
    tick();
  });
  // Put a real alert away for good (until the next one): it won't come back here or on the deck.
  $('[data-dismiss]').addEventListener('click', () => {
    if (alert && !alert.test) { markSeen(alert.id); dismiss(alert.id); }
    stopTest();
  });
  // Back to the deck: a test that is playing stops (a real alert stays seen, so it won't jump back).
  $('[data-deck]').addEventListener('click', () => { if (alert && alert.test) stopTest(); });
  $('[data-seen]').addEventListener('click', () => {
    if (alert && !alert.test) { markSeen(alert.id); dismiss(alert.id); }
    alert = null;
    tick();
    refresh();
  });

  if (testActive()) { alert = testAlert(); tick(); }
  timers.push(setInterval(tick, 1000));

  (async () => {
    try {
      loc = await getLocation();
    } catch (e) {
      console.warn('alert: no location yet', e);
      loc = { lat: 40.7128, lon: -74.006, town: '' };
      guessed = true;
    }
    if (!alive) return;
    await refresh();
    timers.push(setInterval(refresh, 30 * 1000));
    timers.push(setInterval(async () => {
      // Still standing in for the town: look for it again first.
      if (guessed) { try { loc = await getLocation(); guessed = false; } catch (e) { /* still not found */ } }
      if (loc && alive) { const c = await calmInfo(); if (alive) calm = c; }
    }, 15 * 60 * 1000));
  })();

  // The town changed in Settings: passes and night-time checks are for the new place.
  onPlace = async () => {
    try { loc = await getLocation(); } catch (e) { return; }
    if (!alive) return;
    guessed = false;
    calm = null;
    refresh();
  };
  window.addEventListener('place-changed', onPlace);
}

let onPlace = null;

export function unmount() {
  alive = false;
  timers.forEach(clearInterval);
  timers = [];
  if (onPlace) window.removeEventListener('place-changed', onPlace);
  onPlace = null;
}
