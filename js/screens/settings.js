// Family · Settings: what an owner wants to change on the screen itself, without finding a
// phone first. Sections down the left (your family, screen & sound, clock & night, photo
// frame, weather, timers, Wi-Fi & about), the chosen one on the right. Every choice takes
// effect as it is tapped; nothing here needs a Save button except typed text.
// (Birthdays, people and calendar links stay on the phone page: they need real typing.)
// Tom's flight deck has the same screen in its own colours, with the sections that apply.
import { backHref, backLabel } from '../services/nav.js';
import { getFamily, saveFamily, canSaveFamily } from '../services/family.js';
import { display, setDisplay, hourText, timeText } from '../services/display.js';
import { testBeep } from '../services/timers.js';
import { manualPlace, knownPlace, findPlaces, setPlace } from '../services/location.js';
import { BUILD } from '../build.js';
import { settings, profile } from '../config.js';
import { wipeScreen } from '../services/wipe.js';
import { trouble, clearTrouble, runningSince, storageUsed } from '../services/trouble.js';
import { batteryNow } from '../services/notices.js';

const N = () => window.TabletNative;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The night clock may start between 6 PM and midnight and end between 4 and 10 AM.
const FROM = [18, 19, 20, 21, 22, 23, 0];
const TO = [4, 5, 6, 7, 8, 9, 10];
const DECK = profile === 'tom'; // the flight deck: dark, and without the kitchen's sections
const SECTIONS = DECK ? [
  ['screen', 'Screen & sound'],
  ['clock', 'Clock & night'],
  ['weather', 'Where you are'],
  ['about', 'Wi-Fi & about'],
] : [
  ['family', 'Your family'],
  ['screen', 'Screen & sound'],
  ['clock', 'Clock & night'],
  ['photos', 'Photo frame'],
  ['weather', 'Weather'],
  ['timers', 'Timers'],
  ['about', 'Wi-Fi & about'],
];
const NIGHT_SCREEN = DECK ? 'viewscreen' : 'night';
const SECTION_KEY = 'settings.section';

let netTimer = null;
let sendTimer = null;
let savedTimer = null;

// The either/or choices: what each one is now, and how to change it. A `set` that
// answers false didn't take (the family's details couldn't be saved).
const CHOICES = {
  units: { get: () => (getFamily().units === 'celsius' ? 'celsius' : 'fahrenheit'), set: (v) => saveFamily({ units: v }) },
  clock24: { get: () => (display().clock24 ? '24' : '12'), set: (v) => setDisplay({ clock24: v === '24' }) },
  night: { get: () => (display().night ? '1' : '0'), set: (v) => setDisplay({ night: v === '1' }) },
  nightDim: { get: () => String(display().nightDim), set: (v) => setDisplay({ nightDim: +v }) },
  restScreen: { get: () => display().restScreen, set: (v) => setDisplay({ restScreen: v }) },
  restMinutes: { get: () => String(display().restMinutes), set: (v) => setDisplay({ restMinutes: +v }) },
  slideSecs: { get: () => String(display().slideSecs), set: (v) => setDisplay({ slideSecs: +v }) },
  photoZoom: { get: () => (display().photoZoom ? '1' : '0'), set: (v) => setDisplay({ photoZoom: v === '1' }) },
  photoCaptions: { get: () => (display().photoCaptions ? '1' : '0'), set: (v) => setDisplay({ photoCaptions: v === '1' }) },
  photoShuffle: { get: () => (display().photoShuffle ? '1' : '0'), set: (v) => setDisplay({ photoShuffle: v === '1' }) },
  alarmSound: { get: () => display().alarmSound, set: (v) => { setDisplay({ alarmSound: v }); testBeep(v); } },
  alarmMinutes: { get: () => String(display().alarmMinutes), set: (v) => setDisplay({ alarmMinutes: +v }) },
};

const seg = (name, options, off) => `<div class="st-seg" data-seg="${name}">${options.map(([v, text]) => `<button data-v="${v}"${off ? ' disabled' : ''}>${text}</button>`).join('')}</div>`;
const row = (label, body, hint) => `<div class="st-row"><div class="st-label">${label}</div>${body}${hint ? `<div class="st-hint">${hint}</div>` : ''}</div>`;

export function mount(el) {
  const a = settings.accent;
  const canSave = canSaveFamily();
  const hasVolume = !!(N() && N().volume && N().setVolume);

  el.innerHTML = `
  <style>
    .st-wrap{height:100%;box-sizing:border-box;padding:40px;display:flex;flex-direction:column;gap:24px}
    .st-body{flex:1;min-height:0;display:flex;gap:24px}
    .st-rail{flex:none;width:272px;display:flex;flex-direction:column;gap:8px}
    .st-tab{min-height:62px;padding:0 24px;border:0;border-radius:18px;background:none;text-align:left;font-family:inherit;font-size:21px;font-weight:600;color:var(--ink-2);cursor:pointer}
    .st-tab.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.06)}
    .st-card{flex:1;min-width:0;padding:30px 36px;display:flex;flex-direction:column;gap:26px;overflow-y:auto;-webkit-overflow-scrolling:touch}
    .st-row{display:flex;flex-direction:column;gap:10px}
    .st-line{display:flex;align-items:center;gap:14px;min-width:0}
    .st-label{font-size:20px;font-weight:600}
    .st-hint{font-size:16px;line-height:1.4;color:var(--ink-2)}
    .st-input{flex:1;min-width:0;font:inherit;font-size:22px;padding:13px 18px;border:2px solid var(--line);border-radius:14px;background:#fff;color:var(--ink);-webkit-user-select:text;user-select:text}
    .st-input:focus{outline:none;border-color:${a}}
    .st-input:disabled{background:var(--bg);color:var(--ink-2)}
    .st-btn{flex:none;min-height:52px;padding:0 24px;border:0;border-radius:999px;font-family:inherit;font-size:18px;font-weight:600;cursor:pointer;background:var(--ink);color:#fff;display:inline-flex;align-items:center;text-decoration:none}
    .st-btn.quiet{background:var(--bg);color:var(--ink)}
    .st-btn:disabled{opacity:.4}
    .st-seg{display:inline-flex;background:var(--bg);border-radius:999px;padding:4px}
    .st-seg button{min-height:48px;min-width:88px;padding:0 20px;border:0;border-radius:999px;background:none;font-family:inherit;font-size:19px;font-weight:600;color:var(--ink-2);cursor:pointer;white-space:nowrap}
    .st-seg button.on{background:var(--ink);color:#fff}
    .st-seg button:disabled{opacity:.5}
    .st-range{-webkit-appearance:none;appearance:none;flex:1;min-width:0;height:48px;margin:0;background:none}
    .st-range::-webkit-slider-runnable-track{height:12px;border-radius:6px;background:var(--line)}
    .st-range::-webkit-slider-thumb{-webkit-appearance:none;width:40px;height:40px;margin-top:-14px;border-radius:50%;background:${a};border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25)}
    .st-val{flex:none;min-width:112px;text-align:right;font-size:18px;font-weight:600;color:var(--ink-2)}
    .st-step{display:inline-flex;align-items:center;gap:4px}
    .st-step button{width:48px;height:48px;border:0;border-radius:50%;background:var(--bg);font-family:inherit;font-size:26px;font-weight:600;line-height:1;color:var(--ink);cursor:pointer}
    .st-step span{min-width:86px;text-align:center;font-size:20px;font-weight:600}
    .st-dot{flex:none;width:14px;height:14px;border-radius:50%;background:#8A93A3}
    .st-places{display:flex;flex-direction:column;gap:8px}
    .st-place{min-height:52px;padding:0 20px;border:2px solid var(--line);border-radius:14px;background:#fff;text-align:left;font-family:inherit;font-size:19px;font-weight:600;color:var(--ink);cursor:pointer}
    .st-back{background:#fff}
    .st-list{display:flex;flex-direction:column;gap:8px;font-size:16px;line-height:1.35;color:var(--ink-2)}
    .st-list b{color:var(--ink);font-weight:600}
    /* The flight deck's colours */
    .st-wrap.deck{--ink:#E3EDF5;--ink-2:#8FA9BA;--line:#24384A;--bg:#0C1524;background:#05070D;color:var(--ink)}
    .deck .st-card{background:#0A1220;border:1px solid #1E3A4A;box-shadow:none}
    .deck .st-tab.on{background:#0F1B2E;color:#5CE1E6;box-shadow:none}
    .deck .st-input,.deck .st-place{background:#0C1524;color:var(--ink)}
    .deck .st-btn{background:#5CE1E6;color:#05070D}
    .deck .st-btn.quiet{background:#12203A;color:var(--ink)}
    .deck .st-seg button.on{background:#5CE1E6;color:#05070D}
    .deck .st-step button{background:#12203A}
    .deck .st-back{background:#12203A;color:var(--ink)}
    .deck .st-range::-webkit-slider-thumb{border-color:#0A1220}
  </style>
  <div class="st-wrap${DECK ? ' deck' : ''}">
    <div class="st-line" style="gap:16px">
      <a href="${backHref()}" class="pill st-back">${backLabel()}</a>
      <div class="display" style="font-size:40px;font-weight:500">Settings</div>
      <div data-saved style="margin-left:auto;font-size:18px;font-weight:600;color:#2F6B4F;opacity:0;transition:opacity .3s">✓ Saved</div>
    </div>
    <div class="st-body">
      <div class="st-rail" data-rail>${SECTIONS.map(([id, name]) => `<button class="st-tab" data-sec="${id}">${name}</button>`).join('')}</div>
      <div class="card st-card" data-pane></div>
    </div>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const pane = $('[data-pane]');

  function saved() {
    const s = $('[data-saved]');
    s.style.opacity = '1';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { if (el.isConnected) s.style.opacity = '0'; }, 1800);
  }

  // ---- what each section holds
  const SECTION_HTML = {
    family: () => {
      const fam = getFamily();
      return row('Name on the Home screen', `<div class="st-line">
          <input data-name class="st-input" type="text" maxlength="40" autocomplete="off" autocapitalize="words" spellcheck="false"
            placeholder="e.g. The Smiths" value="${esc(fam.familyName || '')}"${canSave ? '' : ' disabled'}>
          <button data-save-name class="st-btn" disabled>Save</button>
        </div>`, `Shows as “Good morning, <span data-name-echo>${esc(fam.familyName || 'Family')}</span>”.`)
        + `<div class="st-hint" style="margin-top:auto">${canSave ? '' : 'For now the name is changed from a phone as well. '}Birthdays, the people who leave notes and Google or iPhone calendars are added from a phone:
          <b>Photos → Add photos</b>, scan the code, then <b>Settings</b>.</div>`;
    },
    screen: () => {
      const d = display();
      const volume = hasVolume ? N().volume() : 60;
      return row('Brightness', `<div class="st-line">
          <input data-bright class="st-range" type="range" min="5" max="100" step="5" value="${d.brightness == null ? 70 : Math.round(d.brightness * 100)}">
          <div data-bright-val class="st-val"></div>
          <button data-bright-auto class="st-btn quiet">Automatic</button>
        </div>`)
        + (hasVolume || !N() ? row(DECK ? 'Sound' : 'Sound (timers, videos, apps)', `<div class="st-line">
          <input data-volume class="st-range" type="range" min="0" max="100" step="5" value="${volume}">
          <div data-volume-val class="st-val"></div>
          <button data-volume-test class="st-btn quiet">Try it</button>
        </div>`) : '')
        + (DECK ? '' : row('When nobody is using it, show', `<div>${seg('restScreen', [['home', 'Home'], ['photos', 'The photo frame']])}</div>`)
        + row('Go back to it after', `<div>${seg('restMinutes', [['5', '5 min'], ['10', '10 min'], ['30', '30 min'], ['0', 'Stay put']])}</div>`,
          'A menu or list that somebody walked away from doesn’t stay up all day. Recipes, timers and anything half-typed are never interrupted.'))
        + row('Cleaning the glass', `<div class="st-line">
          <div class="st-hint" style="flex:1">Switches touches off for 30 seconds, so a cloth doesn’t press anything. It comes back by itself.</div>
          <button data-wipe-now class="st-btn quiet">Wipe the screen</button>
        </div>`);
    },
    clock: () => row('Clock', `<div class="st-line">${seg('clock24', [['12', '12-hour'], ['24', '24-hour']])}<span class="st-hint" data-clock-now></span></div>`)
      + row(DECK ? 'Starfield at night' : 'Night clock', `<div class="st-line" style="flex-wrap:wrap;row-gap:10px">
          ${seg('night', [['1', 'On'], ['0', 'Off']])}
          <div data-hours class="st-line" style="gap:10px">
            <span class="st-hint">from</span>
            <div class="st-step"><button data-from="-1" aria-label="Earlier">−</button><span data-from-val></span><button data-from="1" aria-label="Later">+</button></div>
            <span class="st-hint">to</span>
            <div class="st-step"><button data-to="-1" aria-label="Earlier">−</button><span data-to-val></span><button data-to="1" aria-label="Later">+</button></div>
          </div>
        </div>`, DECK ? 'Dims to the starfield once nobody has touched the screen for 5 minutes.' : 'Dims to a soft clock once nobody has touched the screen for 5 minutes.')
      + row('At night the screen is', `<div class="st-line">${seg('nightDim', [['0.02', 'Darkest'], ['0.05', 'Dim'], ['0.15', 'Soft']])}
          <a href="#/${NIGHT_SCREEN}" class="st-btn quiet">${DECK ? 'See the starfield' : 'See the night clock'}</a></div>`,
        'Darkest suits a bedroom; Soft can be read from across a kitchen.'),
    photos: () => row('Each picture stays for', `<div>${seg('slideSecs', [['15', '15 sec'], ['30', '30 sec'], ['60', '1 min'], ['300', '5 min'], ['900', '15 min']])}</div>`)
      + row('Slow zoom', `<div>${seg('photoZoom', [['1', 'On'], ['0', 'Off']])}</div>`, 'Each picture drifts gently while it is up. Off keeps it perfectly still.')
      + row('Who sent it and when', `<div>${seg('photoCaptions', [['1', 'Show'], ['0', 'Hide']])}</div>`)
      + row('Order', `<div>${seg('photoShuffle', [['0', 'Newest first'], ['1', 'Mixed up']])}</div>`)
      + `<div class="st-line" style="margin-top:auto"><a href="#/photos" class="st-btn quiet">Open the photo frame</a><a href="#/addphotos" class="st-btn quiet">Add photos</a></div>`,
    weather: () => row('Temperature', `<div>${seg('units', [['fahrenheit', '°F'], ['celsius', '°C']], !canSave)}</div>`)
      + row(DECK ? 'Town for the sky, the planes overhead and the weather' : 'Town for the weather', `<div class="st-hint" data-place-now></div>
        <div class="st-line">
          <input data-place class="st-input" type="text" maxlength="60" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="A town or ZIP code">
          <button data-place-find class="st-btn" disabled>Find</button>
          <button data-place-auto class="st-btn quiet">Find it by itself</button>
        </div>
        <div class="st-places" data-place-list></div>`),
    timers: () => row('Alarm sound', `<div>${seg('alarmSound', [['beeps', 'Beeps'], ['chime', 'Chime'], ['bell', 'Bell']])}</div>`, 'Tap one to hear it. Kitchen timers and cooking timers both use it.')
      + row('An alarm nobody stops rings for', `<div>${seg('alarmMinutes', [['1', '1 min'], ['2', '2 min'], ['5', '5 min'], ['10', '10 min']])}</div>`)
      + `<div class="st-line" style="margin-top:auto"><a href="#/timers" class="st-btn quiet">Open the timers</a></div>`,
    about: () => `<div class="st-row">
        <div class="st-line">
          <div data-net-dot class="st-dot"></div>
          <div style="flex:1;min-width:0">
            <div data-net class="st-label"></div>
            <div data-net-hint class="st-hint"></div>
          </div>
          ${N() && N().wifiSettings ? '<button data-wifi class="st-btn quiet">Wi-Fi settings</button>' : ''}
        </div>
      </div>`
      + row('Updates', `<div class="st-line">
          <div class="st-hint" data-update style="flex:1">The screens update themselves when something new is published.</div>
          <button data-update-check class="st-btn quiet">Check now</button>
        </div>`)
      + row('If something looks stuck', `<div class="st-line">
          <div class="st-hint" style="flex:1">Starting the screens again is safe: ${DECK ? 'nothing is lost' : 'photos, lists and timers are kept'}.</div>
          <button data-restart class="st-btn quiet">Start again</button>
        </div>`)
      + row('The settings', `<div class="st-line">
          <div class="st-hint" style="flex:1">Puts brightness, the clock, the night hours and the town back the way they came. ${DECK ? 'Nothing else is touched.' : 'Photos, lists, notes and the family’s name are not touched.'}</div>
          <button data-reset class="st-btn quiet">Put them back</button>
        </div>`)
      + row('For whoever looks after this screen', `<div class="st-hint" data-health></div>
        <div class="st-line"><div class="st-hint" data-trouble-line style="flex:1"></div><button data-trouble-show class="st-btn quiet">Show</button></div>
        <div class="st-list" data-trouble-list></div>`)
      + `<div class="st-line" style="margin-top:auto">
          <a href="#/welcome" class="st-btn quiet">Show the tour again</a>
          <div class="st-hint" style="margin-left:auto;text-align:right">${DECK ? 'Flight deck' : 'Kitchen screen'} · version ${esc(BUILD)}${N() && N().appVersion ? ` · app ${esc(N().appVersion())}` : ''}</div>
        </div>`,
  };

  // ---- the either/or choices: show what is chosen now
  function paint() {
    pane.querySelectorAll('[data-seg]').forEach((box) => {
      const now = CHOICES[box.dataset.seg].get();
      box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === now));
    });
    const s = display();
    const hours = pane.querySelector('[data-hours]');
    if (hours) {
      hours.style.visibility = s.night ? '' : 'hidden';
      pane.querySelector('[data-from-val]').textContent = hourText(s.nightFrom);
      pane.querySelector('[data-to-val]').textContent = hourText(s.nightTo);
    }
    const clockNow = pane.querySelector('[data-clock-now]');
    if (clockNow) clockNow.textContent = `It is ${timeText()} now.`;
  }
  pane.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg] button');
    if (!b || b.disabled || b.classList.contains('on')) return;
    if (CHOICES[b.parentElement.dataset.seg].set(b.dataset.v) === false) return;
    paint(); saved();
  });

  // ---- each section's own controls, connected after it is shown
  const SECTION_START = {
    family() {
      const name = pane.querySelector('[data-name]');
      const saveName = pane.querySelector('[data-save-name]');
      const nameChanged = () => name.value.trim() !== (getFamily().familyName || '');
      name.addEventListener('input', () => {
        saveName.disabled = !canSave || !nameChanged();
        pane.querySelector('[data-name-echo]').textContent = name.value.trim() || 'Family';
      });
      const doSaveName = () => {
        if (!canSave || !nameChanged()) return;
        if (saveFamily({ familyName: name.value.trim() })) { saveName.disabled = true; name.blur(); saved(); }
      };
      saveName.addEventListener('click', doSaveName);
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSaveName(); });
    },
    screen() {
      // Brightness: sent a few times a second while the slider moves, not for every pixel.
      const bright = pane.querySelector('[data-bright]');
      const val = pane.querySelector('[data-bright-val]');
      const auto = pane.querySelector('[data-bright-auto]');
      const showBright = () => {
        const b = display().brightness;
        val.textContent = b == null ? 'Automatic' : `${Math.round(b * 100)}%`;
        auto.style.visibility = b == null ? 'hidden' : ''; // nothing to go back to
      };
      showBright();
      bright.addEventListener('input', () => {
        val.textContent = `${bright.value}%`;
        clearTimeout(sendTimer);
        sendTimer = setTimeout(() => { setDisplay({ brightness: bright.value / 100 }); showBright(); }, 120);
      });
      auto.addEventListener('click', () => { clearTimeout(sendTimer); setDisplay({ brightness: null }); showBright(); saved(); });

      const vol = pane.querySelector('[data-volume]');
      if (vol) {
        const volVal = pane.querySelector('[data-volume-val]');
        const showVol = () => { volVal.textContent = +vol.value ? `${vol.value}%` : 'Off'; };
        showVol();
        vol.addEventListener('input', () => {
          showVol();
          try { if (hasVolume) N().setVolume(+vol.value); } catch (e) { /* not on a tablet */ }
        });
        vol.addEventListener('change', () => testBeep()); // let go: hear how loud that is
        pane.querySelector('[data-volume-test]').addEventListener('click', () => testBeep());
      }
      pane.querySelector('[data-wipe-now]').addEventListener('click', () => wipeScreen(30));
    },
    clock() {
      const stepIn = (list, now, by) => list[Math.min(list.length - 1, Math.max(0, (list.indexOf(now) < 0 ? 0 : list.indexOf(now)) + by))];
      pane.querySelector('[data-hours]').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const s = display();
        if (b.dataset.from) setDisplay({ nightFrom: stepIn(FROM, s.nightFrom, +b.dataset.from) });
        else if (b.dataset.to) setDisplay({ nightTo: stepIn(TO, s.nightTo, +b.dataset.to) });
        paint(); saved();
      });
    },
    weather() {
      const box = pane.querySelector('[data-place]');
      const find = pane.querySelector('[data-place-find]');
      const auto = pane.querySelector('[data-place-auto]');
      const list = pane.querySelector('[data-place-list]');
      const nowLine = pane.querySelector('[data-place-now]');
      let found = [];
      const showNow = () => {
        const chosen = manualPlace();
        const known = knownPlace();
        nowLine.textContent = chosen ? `Chosen by you: ${chosen.label || chosen.town}.`
          : known && known.town ? `Found by itself: ${known.town}${known.region ? `, ${known.region}` : ''}. Not right? Type the town below.`
            : 'The screen works out where it is by itself. Not right? Type the town below.';
        auto.style.display = chosen ? '' : 'none';
      };
      showNow();
      const say = (text) => { list.innerHTML = `<div class="st-hint">${esc(text)}</div>`; };
      const look = async () => {
        const text = box.value.trim();
        if (text.length < 2) return;
        box.blur(); // puts the keyboard away so the answers can be seen
        say('Looking…');
        try {
          found = await findPlaces(text);
        } catch (e) {
          if (el.isConnected) say('Couldn’t look that up just now. Is the Wi-Fi connected?');
          return;
        }
        if (!el.isConnected || !list.isConnected) return;
        if (!found.length) { say('Nothing found by that name. Try the nearest bigger town, or a ZIP code.'); return; }
        list.innerHTML = found.map((p, i) => `<button class="st-place" data-pick="${i}">${esc(p.label)}</button>`).join('');
      };
      box.addEventListener('input', () => { find.disabled = box.value.trim().length < 2; });
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter') look(); });
      find.addEventListener('click', look);
      list.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pick]');
        if (!b || !found[+b.dataset.pick]) return;
        setPlace(found[+b.dataset.pick]);
        box.value = ''; find.disabled = true; list.innerHTML = '';
        showNow(); saved();
      });
      auto.addEventListener('click', () => { setPlace(null); list.innerHTML = ''; showNow(); saved(); });
    },
    about() {
      const showNet = () => {
        if (!pane.querySelector('[data-net]')) return;
        let state = navigator.onLine === false ? 'off' : 'online';
        try { if (N() && N().network) state = N().network(); } catch (e) { /* keep the guess */ }
        pane.querySelector('[data-net-dot]').style.background = state === 'online' ? '#2F9E6B' : state === 'connected' ? '#D9A21B' : '#C2491F';
        pane.querySelector('[data-net]').textContent = state === 'online' ? 'Wi-Fi is connected' : state === 'connected' ? 'Wi-Fi is connected, but the internet isn’t answering' : 'Not connected to Wi-Fi';
        pane.querySelector('[data-net-hint]').textContent = state === 'online' ? 'Weather, calendars and updates are coming through.'
          : state === 'connected' ? 'Usually the router or the internet line. The screen keeps working from what it saved.'
            : (N() && N().wifiSettings ? 'A grown-up can pick a network with “Wi-Fi settings”.' : 'A grown-up can pick a network: hold the top-left corner for 5 seconds, then Wi-Fi settings.');
      };
      showNet();
      clearInterval(netTimer);
      netTimer = setInterval(() => { if (el.isConnected) showNet(); }, 5000);
      const wifi = pane.querySelector('[data-wifi]');
      if (wifi) wifi.addEventListener('click', () => { try { N().wifiSettings(); } catch (e) { /* older app */ } });

      // Is there something newer published than what is running here?
      const line = pane.querySelector('[data-update]');
      const check = pane.querySelector('[data-update-check]');
      check.addEventListener('click', async () => {
        if (check.dataset.ready) { location.reload(); return; }
        check.disabled = true;
        line.textContent = 'Checking…';
        let text = '';
        try {
          const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
          const latest = (await res.json()).version;
          if (BUILD === 'dev') text = 'This is a preview copy; it doesn’t update itself.';
          else if (latest && latest !== BUILD) {
            text = 'Something new is ready. It arrives by itself once the screen has been left alone for a few minutes, or right now:';
            check.textContent = 'Update now';
            check.dataset.ready = '1';
          } else text = 'Up to date. New versions arrive by themselves.';
        } catch (e) {
          text = 'Couldn’t check just now. Is the Wi-Fi connected?';
        }
        if (!line.isConnected) return;
        line.textContent = text;
        check.disabled = false;
      });
      pane.querySelector('[data-restart]').addEventListener('click', () => location.reload());

      // Back the way it came: asks once more first, because it can't be undone.
      const reset = pane.querySelector('[data-reset]');
      let sure = 0;
      reset.addEventListener('click', () => {
        if (Date.now() - sure > 5000) {
          sure = Date.now();
          reset.textContent = 'Really? Tap again';
          setTimeout(() => { if (reset.isConnected && Date.now() - sure >= 5000) reset.textContent = 'Put them back'; }, 5100);
          return;
        }
        sure = 0;
        try { localStorage.removeItem('display.v1'); } catch (e) { /* storage off */ }
        setPlace(null);
        location.reload(); // every screen starts again with the settings it came with
      });

      // How it is doing, and what went wrong lately.
      const day = (at) => new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const power = batteryNow();
      pane.querySelector('[data-health]').textContent = `Running since ${day(runningSince())}, ${timeText(new Date(runningSince()))}`
        + ` · keeps ${(storageUsed() / 1048576).toFixed(1)} MB of settings, lists and notes`
        + (power ? ` · ${power.charging ? 'plugged in' : 'on its battery'}, ${Math.round(power.level * 100)}%` : '');
      const troubleLine = pane.querySelector('[data-trouble-line]');
      const show = pane.querySelector('[data-trouble-show]');
      const listEl = pane.querySelector('[data-trouble-list]');
      const showTrouble = () => {
        const list = trouble();
        troubleLine.textContent = list.length ? `${list.length === 1 ? 'One thing' : `${list.length} things`} went wrong lately (the last on ${day(list[0].at)}).` : 'Nothing has gone wrong lately.';
        show.style.display = list.length ? '' : 'none';
      };
      showTrouble();
      show.addEventListener('click', () => {
        if (listEl.children.length) { clearTrouble(); listEl.innerHTML = ''; show.textContent = 'Show'; showTrouble(); return; }
        listEl.innerHTML = trouble().map((t) => `<div><b>${esc(day(t.at))}, ${esc(timeText(new Date(t.at)))}${t.screen ? ` · ${esc(t.screen)}` : ''}${t.times > 1 ? ` · ${t.times} times` : ''}</b><br>${esc(t.what)}</div>`).join('');
        show.textContent = 'Clear the list';
      });
    },
  };

  function show(id) {
    if (!SECTION_HTML[id]) id = SECTIONS[0][0];
    try { sessionStorage.setItem(SECTION_KEY, id); } catch (e) { /* storage off */ }
    clearInterval(netTimer);
    el.querySelectorAll('[data-sec]').forEach((b) => b.classList.toggle('on', b.dataset.sec === id));
    pane.innerHTML = SECTION_HTML[id]();
    pane.scrollTop = 0;
    paint();
    if (SECTION_START[id]) SECTION_START[id]();
  }
  $('[data-rail]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sec]');
    if (b && !b.classList.contains('on')) show(b.dataset.sec);
  });
  // Back where you were (after "See the night clock", say); a first visit starts at the top.
  let first = SECTIONS[0][0];
  try { first = sessionStorage.getItem(SECTION_KEY) || first; } catch (e) { /* storage off */ }
  show(first);
}

export function unmount() {
  clearInterval(netTimer);
  clearTimeout(sendTimer);
  clearTimeout(savedTimer);
  netTimer = null;
}
