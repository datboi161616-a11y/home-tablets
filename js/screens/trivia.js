// Tom · Space & flight trivia (Trivia.dc.html in the design)
// Five questions a day, picked from the local bank with a date-seeded shuffle,
// so there are new questions every day. "Next round" serves five more.
import { QUESTIONS, seeded, shuffle } from '../services/space-trivia.js';

const PER_ROUND = 5;
// Rank grows with all the wings Tom has ever earned (4+ right in a round).
const RANKS = [[50, 'ASTRONAUT'], [25, 'ACE'], [10, 'CAPTAIN'], [3, 'PILOT'], [0, 'CADET']];
const rankFor = (wings) => RANKS.find(([n]) => wings >= n)[1];

// Next rank up and how many more wings it needs (null at the top rank).
function nextRank(wings) {
  const up = RANKS.filter(([n]) => n > wings).pop();
  return up ? { name: up[1], more: up[0] - wings } : null;
}

const STATS_KEY = 'trivia.stats.v1'; // { wings, rounds, right, asked, streak, lastWingsDay }
const TODAY_KEY = 'trivia.today.v1'; // today's place, so leaving the screen doesn't lose it
const SEEN_KEY = 'trivia.seen.v1';   // { questionIndex: dayNum it was last shown }
const SKIPPED = -1;                  // "SHOW ANSWER" pressed instead of picking

let state;
let root;

const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const dayNum = (d = new Date()) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full */ } };
const stats = () => read(STATS_KEY, { wings: 0, rounds: 0, right: 0, asked: 0, streak: 0, lastWingsDay: '' });
function saveToday() {
  const s = state;
  write(TODAY_KEY, { day: dayKey(), order: s.order, round: s.round, i: s.i, score: s.score, chosen: s.chosen, done: s.done, marks: s.marks });
}
function markSeen(idx) {
  const seen = read(SEEN_KEY, {});
  seen[idx] = dayNum();
  write(SEEN_KEY, seen);
}
function finishRound() {
  const st = stats();
  st.rounds += 1;
  if (state.score >= 4) {
    st.wings += 1;
    const today = dayKey();
    if (st.lastWingsDay !== today) {
      const yesterday = dayKey(new Date(Date.now() - 86400000));
      st.streak = st.lastWingsDay === yesterday ? st.streak + 1 : 1;
      st.lastWingsDay = today;
    }
  }
  localStorage.setItem(STATS_KEY, JSON.stringify(st));
}

// Today's question order (indexes into QUESTIONS): a date-seeded shuffle, then
// questions never shown before come first and the ones seen longest ago next, so
// Tom doesn't meet yesterday's questions again until he's been through the bank.
// The order is saved with today's place, so it stays fixed for the whole day.
function dailyOrder() {
  const today = dayNum();
  const seen = read(SEEN_KEY, {});
  const shuffled = shuffle(QUESTIONS.map((_, k) => k), seeded(today));
  const age = (k) => (seen[k] && seen[k] < today ? seen[k] : 0);
  return shuffled
    .map((k, pos) => ({ k, pos, age: age(k) }))
    .sort((x, y) => x.age - y.age || x.pos - y.pos) // pos tie-break: old WebViews sort unstably
    .map((x) => x.k);
}

// Shuffle each question's answers too (seeded, so a resumed question looks the same).
function buildList(order) {
  const today = dayNum();
  return order.map((k) => {
    const q = QUESTIONS[k];
    const o = shuffle(q.o.map((_, j) => j), seeded(today * 7 + k));
    return { ...q, idx: k, o: o.map((j) => q.o[j]), a: o.indexOf(q.a) };
  });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function render() {
  const s = state;
  const cur = s.list[s.round * PER_ROUND + s.i];
  const right = s.chosen === cur.a;
  const last = s.i === PER_ROUND - 1;

  const answered = s.chosen !== null;
  const letter = (k) => String.fromCharCode(65 + k);
  const opts = cur.o.map((label, k) => {
    let bg = '#0A1220', bd = '#1E3A4A', fg = '#D7E6F0', mark = '';
    // A tick or cross as well as the colour, so it reads at a glance.
    if (answered && k === cur.a) { bg = '#0F2A1C'; bd = '#7CF29A'; fg = '#7CF29A'; mark = '✓'; }
    else if (s.chosen === k) { bg = '#2A0F0F'; bd = '#FF6B57'; fg = '#FF6B57'; mark = '✗'; }
    return `<button data-pick="${k}" class="tv-opt" style="background:${bg};border-color:${bd};color:${fg}">
      <span class="tv-letter">${letter(k)}</span><span>${esc(label)}</span>${mark ? `<span class="tv-mark">${mark}</span>` : ''}</button>`;
  }).join('');

  let feedback = 'NEW QUESTIONS EVERY DAY · GET 4 RIGHT TO EARN YOUR ASTRONAUT WINGS';
  let feedColor = '#7FA6B8';
  if (answered) {
    const answer = `${letter(cur.a)}: ${cur.o[cur.a].toUpperCase()}. `;
    if (right) feedback = 'CORRECT. ' + cur.why;
    else if (s.chosen === SKIPPED) feedback = `THE ANSWER IS ${answer}${cur.why}`;
    else feedback = `NOT QUITE, IT'S ${answer}${cur.why}`;
    feedColor = right ? '#7CF29A' : s.chosen === SKIPPED ? '#D7E6F0' : '#FF9A8C';
  }

  // Progress pips for this round: green right, red wrong, grey shown, amber = now.
  root.querySelector('[data-pips]').innerHTML = Array.from({ length: PER_ROUND }, (_, k) => {
    const m = k < s.i || (k === s.i && answered) ? s.marks[k] : k === s.i ? 'now' : '';
    const st = { r: 'background:#7CF29A;border-color:#7CF29A', w: 'background:#FF6B57;border-color:#FF6B57', s: 'background:#3A5566;border-color:#3A5566', now: 'border-color:#FFB547' }[m] || '';
    return `<span class="tv-pip" style="${st}"></span>`;
  }).join('');

  const st = stats();

  // End of round: a summary in the free space under the answers.
  const sum = root.querySelector('[data-summary]');
  if (last && answered) {
    const got = s.score >= 4;
    const up = nextRank(st.wings);
    const toRank = up ? `${up.more} MORE WING${up.more > 1 ? 'S' : ''} TO MAKE ${up.name}` : 'TOP RANK REACHED';
    const pct = st.asked ? Math.round((100 * st.right) / st.asked) : 0;
    sum.innerHTML = `
      <div class="tv-ox" style="font-size:30px;font-weight:700;letter-spacing:3px;color:${got ? '#FFB547' : '#D7E6F0'}">
        ${got ? '★ ASTRONAUT WINGS EARNED' : 'ROUND COMPLETE'} · ${s.score} OF ${PER_ROUND} RIGHT</div>
      <div style="font-size:16px;letter-spacing:2px;color:#7FA6B8">
        ${got ? `YOU NOW HAVE ${st.wings} WINGS` : 'GET 4 RIGHT NEXT ROUND TO EARN WINGS'} · ${toRank} · ALL-TIME ${pct}% RIGHT</div>`;
    sum.style.display = 'flex';
  } else {
    sum.style.display = 'none';
  }
  root.querySelector('[data-score]').textContent = `${s.score}/${PER_ROUND}`;
  root.querySelector('[data-wings]').textContent = st.wings;
  const alive = st.lastWingsDay === dayKey() || st.lastWingsDay === dayKey(new Date(Date.now() - 86400000));
  root.querySelector('[data-streak]').textContent = alive && st.streak ? `${st.streak} DAY${st.streak > 1 ? 'S' : ''}` : '—';
  root.querySelector('[data-rank]').textContent = rankFor(st.wings);
  root.querySelector('[data-num]').textContent = `QUESTION ${s.i + 1} OF ${PER_ROUND}`;
  const qEl = root.querySelector('[data-q]');
  qEl.textContent = cur.q;
  qEl.style.fontSize = cur.q.length > 80 ? '44px' : '52px';
  root.querySelector('[data-opts]').innerHTML = opts;
  const fb = root.querySelector('[data-feedback]');
  fb.textContent = feedback;
  fb.style.color = feedColor;
  // Before answering, the button only reveals the answer (no skipping past by accident).
  const next = root.querySelector('[data-next]');
  next.textContent = !answered ? 'SHOW ANSWER' : last ? 'NEXT ROUND' : 'NEXT QUESTION';
  next.classList.toggle('tv-reveal', !answered);
}

// k = the option picked, or SKIPPED for "SHOW ANSWER" (counts as not right).
function answer(k) {
  const s = state;
  const cur = s.list[s.round * PER_ROUND + s.i];
  s.chosen = k;
  s.marks[s.i] = k === cur.a ? 'r' : k === SKIPPED ? 's' : 'w';
  if (k === cur.a) s.score += 1;
  const st = stats();
  st.asked += 1;
  if (k === cur.a) st.right += 1;
  write(STATS_KEY, st);
  markSeen(cur.idx);
  if (s.i === PER_ROUND - 1 && !s.done) { s.done = true; finishRound(); }
  saveToday();
  render();
}

function onClick(e) {
  const pick = e.target.closest('[data-pick]');
  const s = state;
  if (pick && s.chosen === null) { answer(Number(pick.dataset.pick)); return; }
  if (e.target.closest('[data-next]')) {
    if (s.chosen === null) { answer(SKIPPED); return; }
    if (s.i < PER_ROUND - 1) {
      s.i += 1;
    } else {
      // New round: five more questions from today's shuffled bank.
      s.i = 0;
      s.score = 0;
      s.marks = [];
      s.round = (s.round + 1) % Math.floor(s.list.length / PER_ROUND);
      s.done = false;
    }
    s.chosen = null;
    saveToday();
    render();
  }
}

export function mount(el) {
  const t = read(TODAY_KEY, null);
  // Resume today's place only if it was saved with today's question order.
  const resume = t && t.day === dayKey() && Array.isArray(t.order) && t.order.length === QUESTIONS.length;
  const order = resume ? t.order : dailyOrder();
  state = { order, list: buildList(order), round: 0, i: 0, chosen: null, score: 0, done: false, marks: [] };
  if (resume) Object.assign(state, { round: t.round || 0, i: t.i || 0, score: t.score || 0, chosen: t.chosen == null ? null : t.chosen, done: !!t.done, marks: t.marks || [] });
  else saveToday();
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
    .tv-next.tv-reveal{background:none;border:1px solid #1E3A4A;color:#7FA6B8}
    .tv-next.tv-reveal:active{border-color:#5CE1E6;color:#5CE1E6}
    .tv-mark{margin-left:auto;padding-left:16px;font-size:30px;flex:none}
    .tv-pip{display:inline-block;width:14px;height:14px;box-sizing:border-box;border:2px solid #1E3A4A;margin-left:8px}
  </style>
  <div class="tv-root">
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1E3A4A;padding-bottom:14px">
      <div style="display:flex;align-items:center;gap:16px">
        <a href="#/bridge" style="min-height:44px;padding:10px 18px;box-sizing:border-box;border:1px solid #1E3A4A;font-size:14px;letter-spacing:3px;display:flex;align-items:center">◂ DECK</a>
        <div class="tv-ox" style="font-size:24px;font-weight:700;letter-spacing:6px;color:#5CE1E6">SPACE &amp; FLIGHT TRIVIA</div>
      </div>
      <div style="display:flex;gap:24px;font-size:15px;letter-spacing:3px">
        <span style="color:#7FA6B8">ROUND <span data-score style="color:#FFB547">0</span></span>
        <span style="color:#7FA6B8">WINGS ★ <span data-wings style="color:#FFB547">0</span></span>
        <span style="color:#7FA6B8">STREAK <span data-streak style="color:#FFB547">—</span></span>
        <span style="color:#7FA6B8">RANK <span data-rank style="color:#FFB547">CADET</span></span>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <div data-num style="font-size:14px;letter-spacing:4px;color:#7FA6B8"></div>
      <div data-pips style="display:flex;align-items:center"></div>
    </div>
    <div data-q class="tv-ox" style="font-size:52px;font-weight:500;line-height:1.15;max-width:1050px"></div>
    <div data-opts style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px"></div>
    <div data-summary style="display:none;border:1px solid #1E3A4A;background:#0A1220;padding:16px 24px;flex-direction:column;gap:8px"></div>
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
