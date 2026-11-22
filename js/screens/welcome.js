// #/welcome: the first thing a brand-new screen shows. Two short questions (what to call
// the household, and who lives here), then the showcase tour (services/tutorial.js) on top
// of the real Home screen. A new screen lands here until the tour is finished or skipped;
// Settings → Wi-Fi & about on either kind of screen brings the tour back (the questions are
// only asked again while no name has been given).
// Most of these screens belong to a couple and one to a family of five: the wording here
// never assumes either.
import { profile } from '../config.js';
import { startTutorial } from '../services/tutorial.js';
import { welcomeDone } from '../services/welcome-state.js';
import { getFamily, householdName, saveFamily, canSaveFamily } from '../services/family.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_PEOPLE = 12;

// Which question is up. Kept outside mount(): saving the name makes the app draw the
// screen again (a change of household settings does), and it must come back on the
// question it had reached, not the first one.
let stage = null;        // null (not started) | 'name' | 'people'
let draftPeople = null;  // the names on the second question, until they are saved

/** "Alex & Jordan" -> ['Alex', 'Jordan']; "The Parkers" -> [] (nothing to guess from). */
function guessPeople(name) {
  if (/^the\s/i.test(name)) return [];
  const parts = name.split(/\s*(?:&|\+|,|\band\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 && parts.every((p) => p.length <= 20 && !/\s.*\s/.test(p)) ? parts.slice(0, MAX_PEOPLE) : [];
}

function beginTour(ctx) {
  stage = null;
  draftPeople = null;
  startTutorial();
  const home = (ctx && ctx.homeRoute) || (profile === 'tom' ? 'bridge' : 'home');
  // Show the real home screen underneath the welcome card.
  // (A new screen arrives here from #/home itself, so setting the same address again
  // wouldn't load anything: ask the router to load it.)
  setTimeout(() => {
    if (location.hash === `#/${home}`) window.dispatchEvent(new Event('hashchange'));
    else location.hash = `#/${home}`;
  }, 0);
}

const STYLE = `
  .wl{position:absolute;top:0;left:0;width:100%;height:100%;box-sizing:border-box;padding:64px 140px 0;color:#fff;overflow:hidden;
    background:radial-gradient(900px 620px at 88% 108%,rgba(226,103,74,.50),rgba(226,103,74,0) 70%),radial-gradient(760px 560px at 4% -8%,rgba(91,127,214,.42),rgba(91,127,214,0) 70%),linear-gradient(160deg,#1B2036,#251C2E 60%,#2E1D26)}
  .wl-eye{color:rgba(255,255,255,.72)}
  .wl-q{font:300 54px/1.12 Outfit,system-ui,sans-serif;letter-spacing:-.5px;margin:14px 0 0;max-width:940px}
  .wl-sub{font:400 21px/1.45 Inter,system-ui,sans-serif;color:rgba(255,255,255,.80);margin:14px 0 0;max-width:900px}
  .wl-line{display:flex;align-items:center;gap:16px;margin-top:28px}
  .wl-input{flex:1;min-width:0;box-sizing:border-box;height:84px;padding:0 30px;border:0;border-radius:24px;background:#fff;color:#1D2430;
    font:500 34px Outfit,system-ui,sans-serif;-webkit-user-select:text;user-select:text;outline:none;box-shadow:0 0 0 0 rgba(255,255,255,0)}
  .wl-input:focus{box-shadow:0 0 0 5px rgba(255,255,255,.30)}
  .wl-input::placeholder{color:#9AA3B2;font-weight:300}
  .wl-input::-webkit-input-placeholder{color:#9AA3B2;font-weight:300}
  .wl-row{display:flex;align-items:center;gap:20px;margin-top:26px}
  .wl-skip{min-height:64px;padding:0 18px;border:0;background:none;color:rgba(255,255,255,.78);font:500 19px Inter,system-ui,sans-serif;text-decoration:underline;cursor:pointer}
  .wl-chips{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px;min-height:60px}
  .wl-chip{min-height:60px;padding:0 20px 0 10px;border:0;border-radius:30px;background:rgba(255,255,255,.16);color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.40);
    font:600 22px Inter,system-ui,sans-serif;display:inline-flex;align-items:center;gap:12px;cursor:pointer}
  .wl-chip i{flex:none;width:40px;height:40px;border-radius:20px;display:inline-flex;align-items:center;justify-content:center;font:600 19px Outfit,sans-serif;font-style:normal;color:#fff}
  .wl-chip b{font-weight:400;font-size:26px;line-height:1;opacity:.75}
  .wl-none{font:400 19px Inter,system-ui,sans-serif;color:rgba(255,255,255,.62);align-self:center}
  .wl-dots{position:absolute;left:140px;bottom:44px;display:flex;gap:10px}
  .wl-dots span{width:34px;height:6px;border-radius:3px;background:rgba(255,255,255,.26)}
  .wl-dots span.on{background:#fff}
  .wl-in{animation:wl-in .5s ease both}
  @keyframes wl-in{0%{opacity:0;transform:translate3d(0,18px,0)}100%{opacity:1;transform:translate3d(0,0,0)}}
  @media (prefers-reduced-motion: reduce){.wl-in{animation:none}}`;
const CHIP_COLORS = ['#E2674A', '#3F8F7A', '#5B7FD6', '#C9892B', '#9A62C4', '#3E9BC0', '#D05C8E', '#6E8B3D'];

export function mount(el, ctx) {
  el.style.background = profile === 'tom' ? '#05070D' : '#1B2036';
  // Tom's flight deck already knows whose it is. An older app can't save a name from the
  // screen itself (the phone page can). And a tour started again from Settings doesn't ask
  // a household that has a name what it is called.
  if (!stage) {
    if (profile === 'tom' || !canSaveFamily() || (welcomeDone() && householdName())) { beginTour(ctx); return; }
    stage = 'name';
  }
  if (stage === 'people') showPeople(el, ctx); else showName(el, ctx);
}

// ---- 1. What should this screen call your household? ----
function showName(el, ctx) {
  const have = householdName();
  el.innerHTML = `<style>${STYLE}</style>
  <div class="wl">
    <div class="wl-in">
      <div class="x-eyebrow wl-eye">${have ? 'Welcome · one thing to check' : 'Welcome · two quick questions first'}</div>
      <h1 class="wl-q">${have ? 'Is this what the screen should call your household?' : 'What should this screen call your household?'}</h1>
      <p class="wl-sub">${have
    ? 'It was typed in when the screen was set up. Change it here if it isn’t right.'
    : 'Your two names, a surname, a nickname for the place: whatever you call home. It goes on the Home screen, and Settings can change it any time.'}</p>
      <div class="wl-line">
        <input data-name class="wl-input" type="text" maxlength="40" autocomplete="off" autocapitalize="words" spellcheck="false"
          placeholder="Alex &amp; Jordan, or The Parkers" value="${esc(have)}" aria-label="Household name">
      </div>
      <div class="wl-row">
        <button data-go class="x-btn lg white">${have ? 'Yes, continue' : 'Continue'}</button>
        <button data-skip class="wl-skip">Skip for now</button>
        <span data-oops class="wl-sub" style="margin:0;display:none">That couldn’t be saved just now. Try once more, or skip it: Settings can do it later.</span>
      </div>
    </div>
    <div class="wl-dots"><span class="on"></span><span></span><span></span></div>
  </div>`;
  const box = el.querySelector('[data-name]');
  const go = () => {
    const name = box.value.replace(/\s+/g, ' ').trim();
    if (!name) { beginTour(ctx); return; } // nothing typed: the same as skipping
    if (name !== have && !saveFamily({ familyName: name })) { el.querySelector('[data-oops]').style.display = ''; return; }
    box.blur();
    stage = 'people';
    draftPeople = null;
    showPeople(el, ctx);
  };
  el.querySelector('[data-go]').addEventListener('click', go);
  el.querySelector('[data-skip]').addEventListener('click', () => { box.blur(); beginTour(ctx); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

// ---- 2. Who lives here? ----
function showPeople(el, ctx) {
  const name = householdName();
  if (!draftPeople) {
    const saved = (getFamily().people || []).map((p) => String(p).trim()).filter(Boolean);
    draftPeople = saved.length ? saved.slice(0, MAX_PEOPLE) : guessPeople(name);
  }
  const before = JSON.stringify((getFamily().people || []).map((p) => String(p).trim()).filter(Boolean));
  el.innerHTML = `<style>${STYLE}</style>
  <div class="wl">
    <div class="wl-in">
      <div class="x-eyebrow wl-eye">${esc(name)}</div>
      <h1 class="wl-q">And who lives here?</h1>
      <p class="wl-sub">First names are plenty. The screen puts them on notes and lists, each in its own colour. Tap a name to take it off.</p>
      <div class="wl-chips" data-chips></div>
      <div class="wl-line" style="margin-top:18px">
        <input data-person class="wl-input" type="text" maxlength="24" autocomplete="off" autocapitalize="words" spellcheck="false"
          placeholder="A name" aria-label="A name" style="max-width:520px">
        <button data-add class="x-btn lg frost" disabled>Add</button>
      </div>
      <div class="wl-row">
        <button data-go class="x-btn lg white">Continue</button>
        <button data-skip class="wl-skip">Skip for now</button>
        <span data-oops class="wl-sub" style="margin:0;display:none">The names couldn’t be saved just now. Settings can add them later.</span>
      </div>
    </div>
    <div class="wl-dots"><span class="on"></span><span class="on"></span><span></span></div>
  </div>`;
  const chips = el.querySelector('[data-chips]');
  const box = el.querySelector('[data-person]');
  const addBtn = el.querySelector('[data-add]');
  const draw = () => {
    chips.innerHTML = draftPeople.length
      ? draftPeople.map((p, i) => `<button class="wl-chip" data-off="${i}" aria-label="Take ${esc(p)} off"><i style="background:${CHIP_COLORS[i % CHIP_COLORS.length]}">${esc(p.charAt(0).toUpperCase())}</i>${esc(p)}<b>×</b></button>`).join('')
      : '<span class="wl-none">Nobody yet. Type a name and tap Add.</span>';
    box.disabled = draftPeople.length >= MAX_PEOPLE;
  };
  // "Alex, Jordan" typed in one go counts as two.
  const add = () => {
    const typed = box.value.split(/[,;]/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
    typed.forEach((p) => {
      if (draftPeople.length < MAX_PEOPLE && !draftPeople.some((q) => q.toLowerCase() === p.toLowerCase())) draftPeople.push(p.slice(0, 24));
    });
    box.value = '';
    addBtn.disabled = true;
    draw();
  };
  draw();
  box.addEventListener('input', () => { addBtn.disabled = !box.value.trim(); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (box.value.trim()) add(); else finish(); } });
  addBtn.addEventListener('click', () => { add(); box.focus(); });
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-off]');
    if (!b) return;
    draftPeople.splice(+b.dataset.off, 1);
    draw();
  });
  let failedOnce = false;
  function finish() {
    if (box.value.trim()) add(); // a name typed but not added still counts
    box.blur();
    if (JSON.stringify(draftPeople) !== before && !saveFamily({ people: draftPeople.slice() }) && !failedOnce) {
      failedOnce = true; // say so once; the next tap carries on regardless
      el.querySelector('[data-oops]').style.display = '';
      return;
    }
    beginTour(ctx);
  }
  el.querySelector('[data-go]').addEventListener('click', finish);
  el.querySelector('[data-skip]').addEventListener('click', () => { box.blur(); beginTour(ctx); });
}

export function unmount() {}
