// Family · Settings: the handful of things an owner wants to change on the screen itself,
// without finding a phone first. The family's name and the temperature unit, how bright
// and how loud the screen is, when the night clock takes over, and the Wi-Fi.
// (Birthdays, people and calendar links stay on the phone page: they need real typing.)
import { backHref, backLabel } from '../services/nav.js';
import { getFamily, saveFamily, canSaveFamily } from '../services/family.js';
import { display, setDisplay, hourText } from '../services/display.js';
import { testBeep } from '../services/timers.js';
import { settings } from '../config.js';

const N = () => window.TabletNative;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The night clock may start between 6 PM and midnight and end between 4 and 10 AM.
const FROM = [18, 19, 20, 21, 22, 23, 0];
const TO = [4, 5, 6, 7, 8, 9, 10];

let netTimer = null;
let sendTimer = null;
let savedTimer = null;

export function mount(el) {
  const a = settings.accent;
  const fam = getFamily();
  const canSave = canSaveFamily();
  const hasVolume = !!(N() && N().volume && N().setVolume);
  const d = display();
  const volume = hasVolume ? N().volume() : 60;

  el.innerHTML = `
  <style>
    .st-wrap{height:100%;box-sizing:border-box;padding:40px;display:flex;flex-direction:column;gap:24px}
    .st-grid{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;gap:24px}
    .st-card{padding:26px 32px;display:flex;flex-direction:column;gap:20px;min-width:0}
    .st-row{display:flex;flex-direction:column;gap:10px}
    .st-line{display:flex;align-items:center;gap:14px;min-width:0}
    .st-label{font-size:20px;font-weight:600}
    .st-hint{font-size:16px;line-height:1.35;color:var(--ink-2)}
    .st-input{flex:1;min-width:0;font:inherit;font-size:22px;padding:13px 18px;border:2px solid var(--line);border-radius:14px;background:#fff;color:var(--ink);-webkit-user-select:text;user-select:text}
    .st-input:focus{outline:none;border-color:${a}}
    .st-input:disabled{background:var(--bg);color:var(--ink-2)}
    .st-btn{flex:none;min-height:52px;padding:0 24px;border:0;border-radius:999px;font-family:inherit;font-size:18px;font-weight:600;cursor:pointer;background:var(--ink);color:#fff}
    .st-btn.quiet{background:var(--bg);color:var(--ink)}
    .st-btn:disabled{opacity:.4}
    .st-seg{display:inline-flex;background:var(--bg);border-radius:999px;padding:4px}
    .st-seg button{min-height:48px;min-width:88px;border:0;border-radius:999px;background:none;font-family:inherit;font-size:20px;font-weight:600;color:var(--ink-2);cursor:pointer}
    .st-seg button.on{background:var(--ink);color:#fff}
    .st-range{-webkit-appearance:none;appearance:none;flex:1;min-width:0;height:48px;margin:0;background:none}
    .st-range::-webkit-slider-runnable-track{height:12px;border-radius:6px;background:var(--line)}
    .st-range::-webkit-slider-thumb{-webkit-appearance:none;width:40px;height:40px;margin-top:-14px;border-radius:50%;background:${a};border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25)}
    .st-val{flex:none;min-width:112px;text-align:right;font-size:18px;font-weight:600;color:var(--ink-2)}
    .st-step{display:inline-flex;align-items:center;gap:4px}
    .st-step button{width:48px;height:48px;border:0;border-radius:50%;background:var(--bg);font-family:inherit;font-size:26px;font-weight:600;line-height:1;color:var(--ink);cursor:pointer}
    .st-step span{min-width:86px;text-align:center;font-size:20px;font-weight:600}
    .st-dot{flex:none;width:14px;height:14px;border-radius:50%;background:#8A93A3}
  </style>
  <div class="st-wrap">
    <div class="st-line" style="gap:16px">
      <a href="${backHref()}" class="pill" style="background:#fff">${backLabel()}</a>
      <div class="display" style="font-size:40px;font-weight:500">Settings</div>
      <div data-saved style="margin-left:auto;font-size:18px;font-weight:600;color:#2F6B4F;opacity:0;transition:opacity .3s">✓ Saved</div>
    </div>
    <div class="st-grid">
      <div class="card st-card">
        <div class="eyebrow muted">Your family</div>
        <div class="st-row">
          <div class="st-label">Name on the Home screen</div>
          <div class="st-line">
            <input data-name class="st-input" type="text" maxlength="40" autocomplete="off" autocapitalize="words" spellcheck="false"
              placeholder="e.g. The Smiths" value="${esc(fam.familyName || '')}"${canSave ? '' : ' disabled'}>
            <button data-save-name class="st-btn" disabled>Save</button>
          </div>
          <div class="st-hint">Shows as “Good morning, <span data-name-echo>${esc(fam.familyName || 'Family')}</span>”.</div>
        </div>
        <div class="st-row">
          <div class="st-label">Temperature</div>
          <div><div class="st-seg" data-units>
            <button data-unit="fahrenheit"${canSave ? '' : ' disabled'}>°F</button><button data-unit="celsius"${canSave ? '' : ' disabled'}>°C</button>
          </div></div>
        </div>
        <div class="st-hint" style="margin-top:auto">${canSave ? '' : 'For now the name and °F/°C are changed from a phone as well. '}Birthdays, the people who leave notes and Google or iPhone calendars are added from a phone:
          <b>Photos → Add photos</b>, scan the code, then <b>Settings</b>.</div>
      </div>

      <div class="card st-card">
        <div class="eyebrow muted">This screen</div>
        <div class="st-row">
          <div class="st-label">Brightness</div>
          <div class="st-line">
            <input data-bright class="st-range" type="range" min="5" max="100" step="5" value="${d.brightness == null ? 70 : Math.round(d.brightness * 100)}">
            <div data-bright-val class="st-val"></div>
            <button data-bright-auto class="st-btn quiet">Automatic</button>
          </div>
        </div>
        ${hasVolume || !N() ? `<div class="st-row">
          <div class="st-label">Sound (timers, videos, apps)</div>
          <div class="st-line">
            <input data-volume class="st-range" type="range" min="0" max="100" step="5" value="${volume}">
            <div data-volume-val class="st-val"></div>
            <button data-volume-test class="st-btn quiet">Try it</button>
          </div>
        </div>` : ''}
        <div class="st-row">
          <div class="st-label">Night clock</div>
          <div class="st-line" style="flex-wrap:wrap;row-gap:10px">
            <div class="st-seg" data-night><button data-night-on="1">On</button><button data-night-on="0">Off</button></div>
            <div data-hours class="st-line" style="gap:10px">
              <span class="st-hint">from</span>
              <div class="st-step"><button data-from="-1" aria-label="Earlier">−</button><span data-from-val></span><button data-from="1" aria-label="Later">+</button></div>
              <span class="st-hint">to</span>
              <div class="st-step"><button data-to="-1" aria-label="Earlier">−</button><span data-to-val></span><button data-to="1" aria-label="Later">+</button></div>
            </div>
          </div>
          <div class="st-hint">Dims to a soft clock once nobody has touched the screen for 5 minutes.</div>
        </div>
      </div>

      <div class="card st-card" style="grid-column:1 / -1;flex-direction:row;align-items:center;gap:24px;padding:20px 32px">
        <div class="st-line" style="flex:1">
          <div data-net-dot class="st-dot"></div>
          <div style="min-width:0">
            <div data-net class="st-label"></div>
            <div data-net-hint class="st-hint"></div>
          </div>
        </div>
        ${N() && N().wifiSettings ? '<button data-wifi class="st-btn quiet">Wi-Fi settings</button>' : ''}
        <a href="#/welcome" class="st-btn quiet" style="display:inline-flex;align-items:center">Show the tour again</a>
        <div class="st-hint" style="flex:none;text-align:right">Kitchen screen${N() && N().appVersion ? `<br>app ${esc(N().appVersion())}` : ''}</div>
      </div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);

  function saved() {
    const s = $('[data-saved]');
    s.style.opacity = '1';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { if (el.isConnected) s.style.opacity = '0'; }, 1800);
  }

  // ---- family name
  const name = $('[data-name]');
  const saveName = $('[data-save-name]');
  const nameChanged = () => name.value.trim() !== (getFamily().familyName || '');
  name.addEventListener('input', () => {
    saveName.disabled = !canSave || !nameChanged();
    $('[data-name-echo]').textContent = name.value.trim() || 'Family';
  });
  const doSaveName = () => {
    if (!canSave || !nameChanged()) return;
    if (saveFamily({ familyName: name.value.trim() })) { saveName.disabled = true; name.blur(); saved(); }
  };
  saveName.addEventListener('click', doSaveName);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSaveName(); });

  // ---- °F / °C
  const showUnits = () => {
    const u = getFamily().units === 'celsius' ? 'celsius' : 'fahrenheit';
    el.querySelectorAll('[data-unit]').forEach((b) => b.classList.toggle('on', b.dataset.unit === u));
  };
  showUnits();
  $('[data-units]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unit]');
    if (!b || b.disabled || b.classList.contains('on')) return;
    if (saveFamily({ units: b.dataset.unit })) { showUnits(); saved(); }
  });

  // ---- brightness (sent a few times a second while the slider moves, not for every pixel)
  const bright = $('[data-bright]');
  const showBright = () => {
    const b = display().brightness;
    $('[data-bright-val]').textContent = b == null ? 'Automatic' : `${Math.round(b * 100)}%`;
    $('[data-bright-auto]').style.visibility = b == null ? 'hidden' : ''; // nothing to go back to
  };
  showBright();
  bright.addEventListener('input', () => {
    $('[data-bright-val]').textContent = `${bright.value}%`;
    clearTimeout(sendTimer);
    sendTimer = setTimeout(() => { setDisplay({ brightness: bright.value / 100 }); showBright(); }, 120);
  });
  $('[data-bright-auto]').addEventListener('click', () => { clearTimeout(sendTimer); setDisplay({ brightness: null }); showBright(); saved(); });

  // ---- sound
  const vol = $('[data-volume]');
  if (vol) {
    const showVol = () => { $('[data-volume-val]').textContent = +vol.value ? `${vol.value}%` : 'Off'; };
    showVol();
    vol.addEventListener('input', () => {
      showVol();
      try { if (hasVolume) N().setVolume(+vol.value); } catch (e) { /* not on a tablet */ }
    });
    vol.addEventListener('change', () => testBeep()); // let go: hear how loud that is
    $('[data-volume-test]').addEventListener('click', () => testBeep());
  }

  // ---- night clock
  const showNight = () => {
    const s = display();
    el.querySelectorAll('[data-night-on]').forEach((b) => b.classList.toggle('on', (b.dataset.nightOn === '1') === !!s.night));
    $('[data-hours]').style.visibility = s.night ? '' : 'hidden';
    $('[data-from-val]').textContent = hourText(s.nightFrom);
    $('[data-to-val]').textContent = hourText(s.nightTo);
  };
  showNight();
  const stepIn = (list, now, by) => list[Math.min(list.length - 1, Math.max(0, (list.indexOf(now) < 0 ? 0 : list.indexOf(now)) + by))];
  $('[data-night]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-night-on]');
    if (!b) return;
    setDisplay({ night: b.dataset.nightOn === '1' });
    showNight(); saved();
  });
  $('[data-hours]').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const s = display();
    if (b.dataset.from) setDisplay({ nightFrom: stepIn(FROM, s.nightFrom, +b.dataset.from) });
    else if (b.dataset.to) setDisplay({ nightTo: stepIn(TO, s.nightTo, +b.dataset.to) });
    showNight(); saved();
  });

  // ---- Wi-Fi
  const showNet = () => {
    let state = navigator.onLine === false ? 'off' : 'online';
    try { if (N() && N().network) state = N().network(); } catch (e) { /* keep the guess */ }
    $('[data-net-dot]').style.background = state === 'online' ? '#2F9E6B' : state === 'connected' ? '#D9A21B' : '#C2491F';
    $('[data-net]').textContent = state === 'online' ? 'Wi-Fi is connected' : state === 'connected' ? 'Wi-Fi is connected, but the internet isn’t answering' : 'Not connected to Wi-Fi';
    $('[data-net-hint]').textContent = state === 'online' ? 'Weather, calendars and updates are coming through.'
      : state === 'connected' ? 'Usually the router or the internet line. The screen keeps working from what it saved.'
        : (N() && N().wifiSettings ? 'A grown-up can pick a network with “Wi-Fi settings”.' : 'A grown-up can pick a network: hold the top-left corner for 5 seconds, then Wi-Fi settings.');
  };
  showNet();
  netTimer = setInterval(() => { if (el.isConnected) showNet(); }, 5000);
  const wifi = $('[data-wifi]');
  if (wifi) wifi.addEventListener('click', () => { try { N().wifiSettings(); } catch (e) { /* older app */ } });
}

export function unmount() {
  clearInterval(netTimer);
  clearTimeout(sendTimer);
  clearTimeout(savedTimer);
  netTimer = null;
}
