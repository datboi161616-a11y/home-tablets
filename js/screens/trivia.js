// Tom · Space & flight trivia (Trivia.dc.html in the design)
// Five questions a day, picked from the local bank with a date-seeded shuffle,
// so there are new questions every day. "Next round" serves five more.
import { QUESTIONS, seeded, shuffle } from '../services/space-trivia.js';

const PER_ROUND = 5;
const RANKS = ['CADET', 'PILOT', 'CAPTAIN', 'ACE', 'ASTRONAUT', 'ASTRONAUT'];

let state;
let root;

function dailyOrder() {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const rand = seeded(seed);
  // Shuffle the answer order too, so the right answer isn't always in the same spot.
  return shuffle(QUESTIONS, rand).map((q) => {
    const order = shuffle(q.o.map((_, k) => k), rand);
    return { ...q, o: order.map((k) => q.o[k]), a: order.indexOf(q.a) };
  });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function render() {
  const s = state;
  const cur = s.list[s.round * PER_ROUND + s.i];
  const right = s.chosen === cur.a;
  const last = s.i === PER_ROUND - 1;

  const opts = cur.o.map((label, k) => {
    let bg = '#0A1220', bd = '#1E3A4A', fg = '#D7E6F0';
    if (s.chosen !== null && k === cur.a) { bg = '#0F2A1C'; bd = '#7CF29A'; fg = '#7CF29A'; }
    else if (s.chosen === k) { bg = '#2A0F0F'; bd = '#FF6B57'; fg = '#FF6B57'; }
    return `<button data-pick="${k}" class="tv-opt" style="background:${bg};border-color:${bd};color:${fg}">
      <span class="tv-letter">${String.fromCharCode(65 + k)}</span><span>${esc(label)}</span></button>`;
  }).join('');

  let feedback = 'NEW QUESTIONS EVERY DAY · GET 4 RIGHT TO EARN YOUR ASTRONAUT WINGS';
  let feedColor = '#7FA6B8';
  if (s.chosen !== null) {
    feedback = (right ? 'CORRECT. ' : 'NOT QUITE. ') + cur.why;
    feedColor = right ? '#7CF29A' : '#FF9A8C';
    if (last) feedback += s.score >= 4 ? '  ★ ASTRONAUT WINGS EARNED!' : `  ROUND OVER: ${s.score} OF ${PER_ROUND}.`;
  }

  root.querySelector('[data-score]').textContent = s.score;
  root.querySelector('[data-rank]').textContent = RANKS[Math.min(s.score, 5)];
  root.querySelector('[data-num]').textContent = `QUESTION ${s.i + 1} OF ${PER_ROUND}`;
  const qEl = root.querySelector('[data-q]');
  qEl.textContent = cur.q;
  qEl.style.fontSize = cur.q.length > 80 ? '44px' : '52px';
  root.querySelector('[data-opts]').innerHTML = opts;
  const fb = root.querySelector('[data-feedback]');
  fb.textContent = feedback;
  fb.style.color = feedColor;
  root.querySelector('[data-next]').textContent = last && s.chosen !== null ? 'NEXT ROUND' : 'NEXT QUESTION';
}

function onClick(e) {
  const pick = e.target.closest('[data-pick]');
  const s = state;
  if (pick && s.chosen === null) {
    const k = Number(pick.dataset.pick);
    const cur = s.list[s.round * PER_ROUND + s.i];
    s.chosen = k;
    if (k === cur.a) s.score += 1;
    render();
    return;
  }
  if (e.target.closest('[data-next]')) {
    if (s.i < PER_ROUND - 1) {
      s.i += 1;
    } else {
      // New round: five more questions from today's shuffled bank.
      s.i = 0;
      s.score = 0;
      s.round = (s.round + 1) % Math.floor(s.list.length / PER_ROUND);
    }
    s.chosen = null;
    render();
  }
}

export function mount(el) {
  state = { list: dailyOrder(), round: 0, i: 0, chosen: null, score: 0 };
  el.innerHTML = `
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .tv-root{width:1280px;height:800px;box-sizing:border-box;padding:28px 40px;background:#05070D;color:#D7E6F0;font-family:'JetBrains Mono',monospace;display:flex;flex-direction:column;gap:22px}
    .tv-root a{color:#5CE1E6}
    .tv-root a:active{color:#A8F2F4}
    .tv-ox{font-family:Oxanium,sans-serif}
    .tv-opt{min-height:84px;padding:10px 28px;text-align:left;font-family:Oxanium,sans-serif;font-size:26px;line-height:1.2;cursor:pointer;border:2px solid;display:flex;align-items:center;border-radius:0}
    .tv-letter{margin-right:22px;flex:none}
    .tv-next{min-height:56px;padding:0 30px;border:none;background:#FFB547;color:#05070D;font-family:Oxanium,sans-serif;font-size:17px;font-weight:700;letter-spacing:3px;cursor:pointer;flex:none}
    .tv-next:active{background:#FFD08A}
  </style>
  <div class="tv-root">
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1E3A4A;padding-bottom:14px">
      <div style="display:flex;align-items:center;gap:16px">
        <a href="#/bridge" style="min-height:44px;padding:10px 18px;box-sizing:border-box;border:1px solid #1E3A4A;font-size:14px;letter-spacing:3px;display:flex;align-items:center">◂ DECK</a>
        <div class="tv-ox" style="font-size:24px;font-weight:700;letter-spacing:6px;color:#5CE1E6">SPACE &amp; FLIGHT TRIVIA</div>
      </div>
      <div style="display:flex;gap:24px;font-size:15px;letter-spacing:3px">
        <span style="color:#7FA6B8">SCORE <span data-score style="color:#FFB547">0</span></span>
        <span style="color:#7FA6B8">RANK <span data-rank style="color:#FFB547">CADET</span></span>
      </div>
    </div>
    <div data-num style="font-size:14px;letter-spacing:4px;color:#7FA6B8"></div>
    <div data-q class="tv-ox" style="font-size:52px;font-weight:500;line-height:1.15;max-width:1050px"></div>
    <div data-opts style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px"></div>
    <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:32px;border-top:1px solid #1E3A4A;padding-top:18px">
      <div data-feedback style="font-size:17px;line-height:1.4;color:#7FA6B8"></div>
      <button data-next class="tv-next">NEXT QUESTION</button>
    </div>
  </div>`;
  root = el.querySelector('.tv-root');
  root.addEventListener('click', onClick);
  render();
}

export function unmount() {
  root?.removeEventListener('click', onClick);
  root = null;
}
