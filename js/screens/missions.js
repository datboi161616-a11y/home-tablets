// Tom · Active missions (Missions.dc.html in the design)
// Next rocket launch from Launch Library 2 with a live T-minus countdown,
// plus cards for famous spacecraft. Deep-space distances are estimated from
// each probe's known distance on 2025-01-01 and its (nearly constant) speed.
import { getLocation } from '../services/location.js';
import { getLaunches, nextLaunch, getIssCrew, getIssPasses, passDay } from '../services/space.js';

let tick;
let launches = [];

const AU = 149597870.7; // km
const LIGHT_KMS = 299792.458;
const REF = Date.UTC(2025, 0, 1);
const YEAR = 365.25 * 86400000;

// [distance from the Sun on 2025-01-01 in AU, speed in AU per year] (NASA/JPL mission status, approx.)
const PROBES = { voyager1: [166.1, 3.58], voyager2: [138.8, 3.25], newHorizons: [61.5, 2.9] };
const probeKm = ([d0, v]) => (d0 + (v * (Date.now() - REF)) / YEAR) * AU;
const billions = (km) => `~${(km / 1e9).toFixed(1)} BILLION KM`;

function signalTime(km) {
  const min = Math.round(km / LIGHT_KMS / 60);
  if (min >= 24 * 60) return 'SIGNAL TIME: 1 FULL DAY';
  return `SIGNAL TIME: ${Math.floor(min / 60)} HR ${min % 60} MIN`;
}

const pad = (n) => String(n).padStart(2, '0');

function craftCards() {
  const on = '#7CF29A', far = '#FFB547';
  const v1 = probeKm(PROBES.voyager1);
  return [
    { name: 'VOYAGER 1', tag: 'INTERSTELLAR', tagColor: far, what: 'Launched 1977. Left the solar system in 2012.', dist: billions(v1), sub: signalTime(v1) },
    { name: 'VOYAGER 2', tag: 'INTERSTELLAR', tagColor: far, what: 'Only craft to visit Uranus and Neptune.', dist: billions(probeKm(PROBES.voyager2)), sub: 'STILL TRANSMITTING' },
    { name: 'NEW HORIZONS', tag: 'KUIPER BELT', tagColor: on, what: 'Flew past Pluto in 2015.', dist: billions(probeKm(PROBES.newHorizons)), sub: 'HEADING OUTWARD' },
    { name: 'WEBB TELESCOPE', tag: 'OBSERVING', tagColor: on, what: 'Looking back at the first galaxies.', dist: '1.5 MILLION KM', sub: 'NEWEST IMAGE ON VIEWSCREEN', href: '#/deepimage' },
    { name: 'PARKER PROBE', tag: 'SOLAR', tagColor: on, what: 'Fastest object humans have built.', dist: '~690,000 KM/H', sub: 'AT CLOSEST PASS TO THE SUN' },
    { name: 'SPACE STATION', tag: 'CREWED', tagColor: on, what: 'Circles Earth every 90 minutes.', dist: '<span data-crew>–</span> CREW ABOARD', sub: '<span data-pass>NEXT PASS: CHECKING…</span>' },
  ];
}

function card(c) {
  const tag = c.href ? 'a' : 'div';
  return `<${tag} ${c.href ? `href="${c.href}"` : ''} class="ms-card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div class="ms-ox" style="font-size:24px;font-weight:700;letter-spacing:2px;color:#5CE1E6;white-space:nowrap">${c.name}</div>
      <div style="font-size:12px;letter-spacing:2px;color:#05070D;background:${c.tagColor};padding:4px 8px;white-space:nowrap">${c.tag}</div>
    </div>
    <div style="font-size:14px;color:#7FA6B8">${c.what}</div>
    <div class="ms-ox" style="font-size:30px;font-weight:300;color:#FFB547;margin-top:auto">${c.dist}</div>
    <div style="font-size:13px;letter-spacing:2px;color:#7FA6B8">${c.sub}</div>
  </${tag}>`;
}

function updateLaunch(el) {
  const $ = (s) => el.querySelector(s);
  const l = nextLaunch(launches);
  if (!l) {
    $('[data-l-name]').textContent = 'NO LAUNCHES SCHEDULED';
    $('[data-l-site]').textContent = 'CHECK BACK SOON';
    $('[data-l-label]').textContent = 'T-MINUS';
    $('[data-l-count]').textContent = '--:--:--';
    return;
  }
  const net = new Date(l.net);
  const when = net.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).toUpperCase();
  $('[data-l-name]').textContent = `${l.name} · ${l.rocket}`.toUpperCase();
  $('[data-l-site]').textContent = [l.site, l.status, ['MIN', 'SEC', 'HR'].includes(l.precision) ? when : '']
    .filter(Boolean).join(' · ').toUpperCase();

  const ms = net - Date.now();
  if (!['MIN', 'SEC', 'HR'].includes(l.precision)) {
    // Only a rough date is known — a ticking clock would be misleading.
    $('[data-l-label]').textContent = 'TARGET DATE';
    $('[data-l-count]').textContent = net.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  } else if (ms <= 0) {
    $('[data-l-label]').textContent = 'T-PLUS';
    $('[data-l-count]').textContent = 'LIFTOFF!';
  } else {
    const t = Math.floor(ms / 1000);
    const d = Math.floor(t / 86400);
    const hms = `${pad(Math.floor((t % 86400) / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
    $('[data-l-label]').textContent = 'T-MINUS';
    $('[data-l-count]').textContent = d > 0 ? `${d}D ${hms}` : hms;
  }
}

export function mount(el) {
  el.innerHTML = `
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .ms-root{width:1280px;height:800px;box-sizing:border-box;padding:28px 40px;background:#05070D;color:#D7E6F0;font-family:'JetBrains Mono',monospace;display:flex;flex-direction:column;gap:20px}
    .ms-root a{color:#5CE1E6}
    .ms-ox{font-family:Oxanium,sans-serif}
    .ms-card{border:1px solid #1E3A4A;background:#0A1220;padding:20px 22px;display:flex;flex-direction:column;gap:8px;min-width:0}
    .ms-ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  </style>
  <div class="ms-root">
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1E3A4A;padding-bottom:14px">
      <div style="display:flex;align-items:center;gap:16px">
        <a href="#/bridge" style="min-height:44px;padding:10px 18px;box-sizing:border-box;border:1px solid #1E3A4A;font-size:14px;letter-spacing:3px;display:flex;align-items:center">◂ DECK</a>
        <div class="ms-ox" style="font-size:24px;font-weight:700;letter-spacing:6px;color:#5CE1E6">ACTIVE MISSIONS</div>
      </div>
      <div data-updated style="font-size:14px;letter-spacing:3px;color:#7FA6B8">REAL SPACECRAFT · UPDATED HOURLY</div>
    </div>
    <div style="border:1px solid #FFB547;background:#0A1220;padding:24px 30px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:center">
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        <div data-l-eyebrow style="font-size:13px;letter-spacing:4px;color:#FFB547">NEXT ROCKET LAUNCH</div>
        <div data-l-name class="ms-ox ms-ell" style="font-size:34px;font-weight:500">LOADING LAUNCH SCHEDULE…</div>
        <div data-l-site class="ms-ell" style="font-size:16px;color:#7FA6B8">&nbsp;</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <div data-l-label style="font-size:13px;letter-spacing:4px;color:#7FA6B8">T-MINUS</div>
        <div data-l-count class="ms-ox" style="font-size:64px;font-weight:300;color:#FFB547;line-height:1;font-variant-numeric:tabular-nums">--:--:--</div>
      </div>
    </div>
    <div style="flex-grow:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:16px;min-height:0">
      ${craftCards().map(card).join('')}
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);

  tick = setInterval(() => updateLaunch(el), 1000);

  (async () => {
    const r = await getLaunches();
    if (!el.isConnected) return;
    launches = r.launches;
    if (r.source === 'sample') $('[data-l-eyebrow]').textContent = 'NEXT ROCKET LAUNCH · SAMPLE (OFFLINE)';
    updateLaunch(el);
  })();

  getIssCrew().then((n) => { if (el.isConnected) $('[data-crew]').textContent = n; });

  (async () => {
    try {
      const loc = await getLocation();
      const passes = await getIssPasses(loc, 72);
      if (!el.isConnected) return;
      $('[data-pass]').textContent = passes.length
        ? `NEXT PASS: ${passDay(passes[0].start)}` : 'NO VISIBLE PASS IN 3 DAYS';
    } catch (err) {
      console.warn(err);
      if (el.isConnected) $('[data-pass]').textContent = 'ORBITING AT 17,500 MPH';
    }
  })();
}

export function unmount() {
  clearInterval(tick);
  launches = [];
}
