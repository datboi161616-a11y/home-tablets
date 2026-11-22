// Tom · Space & flight trivia (Trivia.dc.html in the design)
// Rounds of five questions from the local bank. Each new round takes the questions he has
// never been asked first (then the ones asked longest ago), so nothing repeats until the
// whole bank (or the whole chosen kind of question) has been through. One question a day
// is the "question of the day": it comes first, and the deck shows when it is waiting.
import { QUESTIONS, CATEGORIES, seeded, shuffle } from '../services/space-trivia.js';

const PER_ROUND = 5;
// Rank grows with all the wings Tom has ever earned (4+ right in a round).
const RANKS = [[50, 'ASTRONAUT'], [25, 'ACE'], [10, 'CAPTAIN'], [3, 'PILOT'], [0, 'CADET']];
const rankFor = (wings) => RANKS.find(([n]) => wings >= n)[1];

// Next rank up and how many more wings it needs (null at the top rank).
function nextRank(wings) {
  const up = RANKS.filter(([n]) => n > wings).pop();
  return up ? { name: up[1], more: up[0] - wings } : null;
}

const STATS_KEY = 'trivia.stats.v1'; // { wings, rounds, right, asked, streak, lastWingsDay, run, bestRun }
const TODAY_KEY = 'trivia.today.v2'; // this round and today's tally, so leaving the screen doesn't lose it
const SEEN_KEY = 'trivia.seen.v1';   // { questionIndex: dayNum it was last shown }
const CAT_KEY = 'trivia.cat.v1';     // the kind of question he picked
const QOTD_KEY = 'trivia.qotd.v1';   // { day, idx, answered, right } (bridge.js reads it too)
const SKIPPED = -1;                  // "SHOW ANSWER" pressed instead of picking

let state;
let root;

const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const dayNum = (d = new Date()) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full */ } };
const stats = () => Object.assign({ wings: 0, rounds: 0, right: 0, asked: 0, streak: 0, lastWingsDay: '', run: 0, bestRun: 0 }, read(STATS_KEY, {}));
const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
const inCat = (k, cat) => cat === 'all' || QUESTIONS[k].c === cat;

function saveToday() {
  const s = state;
  write(TODAY_KEY, { day: s.day, cat: s.cat, qs: s.qs, i: s.i, score: s.score, chosen: s.chosen, done: s.done, marks: s.marks, tally: s.tally });
}
function markSeen(idx) {
  const seen = read(SEEN_KEY, {});
  seen[idx] = dayNum();
  write(SEEN_KEY, seen);
}

// Questions in the order he should meet them: never asked first, then asked longest ago
// (today's last of all), mixed up with a date-seeded shuffle inside each group.
function freshOrder(cat) {
  const today = dayNum();
  const seen = read(SEEN_KEY, {});
  const pool = QUESTIONS.map((_, k) => k).filter((k) => inCat(k, cat));
  return shuffle(pool, seeded(today * 3 + cat.length))
    .map((k, pos) => ({ k, pos, age: seen[k] || 0 }))
    .sort((x, y) => x.age - y.age || x.pos - y.pos) // pos tie-break: old WebViews sort unstably
    .map((x) => x.k);
}

/** Today's question of the day (picked once a day from the questions he's met least). */
function questionOfTheDay() {
  const q = read(QOTD_KEY, null);
  if (q && q.day === dayKey() && QUESTIONS[q.idx]) return q;
  const fresh = { day: dayKey(), idx: freshOrder('all')[0], answered: false, right: false };
  write(QOTD_KEY, fresh);
  return fresh;
}

/** The next five questions: the question of the day first if it's still waiting. */
function nextRoundQuestions(cat) {
  const qotd = questionOfTheDay();
  let order = freshOrder(cat);
  if (!qotd.answered) order = [qotd.idx].concat(order.filter((k) => k !== qotd.idx));
  return order.slice(0, PER_ROUND);
}

// One question as shown: its answers shuffled (seeded, so a resumed question looks the same).
function shown(k) {
  const q = QUESTIONS[k];
  const o = shuffle(q.o.map((_, j) => j), seeded(dayNum() * 7 + k));
  return { ...q, idx: k, o: o.map((j) => q.o[j]), a: o.indexOf(q.a) };
}

function newRound(cat) {
  const s = state;
  if (s.day !== dayKey()) { s.day = dayKey(); s.tally = { rounds: 0, right: 0, asked: 0 }; } // a new day's tally
  s.cat = cat;
  s.qs = nextRoundQuestions(cat);
  s.i = 0; s.score = 0; s.chosen = null; s.done = false; s.marks = [];
}

function finishRound() {
  const st = stats();
  st.rounds += 1;
  state.tally.rounds += 1;
  if (state.score >= 4) {
    st.wings += 1;
    const today = dayKey();
    if (st.lastWingsDay !== today) {
      const yesterday = dayKey(new Date(Date.now() - 86400000));
      st.streak = st.lastWingsDay === yesterday ? st.streak + 1 : 1;
      st.lastWingsDay = today;
    }
  }
  write(STATS_KEY, st);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function seenCount(cat) {
  const seen = read(SEEN_KEY, {});
  let n = 0, all = 0;
  QUESTIONS.forEach((_, k) => { if (inCat(k, cat)) { all += 1; if (seen[k]) n += 1; } });
  return { n, all };
}

function render() {
  const s = state;
  const cur = shown(s.qs[s.i]);
  const right = s.chosen === cur.a;
  const last = s.i === s.qs.length - 1;

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

  let feedback = 'NEW QUESTIONS EVERY ROUND · GET 4 RIGHT TO EARN YOUR ASTRONAUT WINGS';
  let feedColor = '#9FBFCF';
  if (answered) {
    const answer = `${letter(cur.a)}: ${cur.o[cur.a].toUpperCase()}. `;
    if (right) feedback = 'CORRECT. ' + cur.why;
    else if (s.chosen === SKIPPED) feedback = `THE ANSWER IS ${answer}${cur.why}`;
    else feedback = `NOT QUITE, IT'S ${answer}${cur.why}`;
    feedColor = right ? '#7CF29A' : s.chosen === SKIPPED ? '#D7E6F0' : '#FF9A8C';
  }

  // Progress pips for this round: green right, red wrong, grey shown, amber = now.
  root.querySelector('[data-pips]').innerHTML = s.qs.map((_, k) => {
    const m = k < s.i || (k === s.i && answered) ? s.marks[k] : k === s.i ? 'now' : '';
    const st = { r: 'background:#7CF29A;border-color:#7CF29A', w: 'background:#FF6B57;border-color:#FF6B57', s: 'background:#3A5566;border-color:#3A5566', now: 'border-color:#FFB547' }[m] || '';
    return `<span class="tv-pip" style="${st}"></span>`;
  }).join('');

  // The kind of question: the chosen one lit up.
  root.querySelectorAll('[data-cat]').forEach((b) => b.classList.toggle('tv-on', b.dataset.cat === s.cat));

  const st = stats();

  // End of round: a summary in the free space under the answers.
  const sum = root.querySelector('[data-summary]');
  if (last && answered) {
    const got = s.score >= 4;
    const up = nextRank(st.wings);
    const toRank = up ? `${up.more} MORE WING${up.more > 1 ? 'S' : ''} TO MAKE ${up.name}` : 'TOP RANK REACHED';
    const pct = st.asked ? Math.round((100 * st.right) / st.asked) : 0;
    const t = s.tally;
    const seen = seenCount(s.cat);
    const bank = seen.n >= seen.all ? `YOU’VE MET ALL ${seen.all} ${s.cat === 'all' ? '' : catOf(s.cat).label + ' '}QUESTIONS: THE OLDEST COME BACK NOW`
      : `${seen.n} OF ${seen.all} ${s.cat === 'all' ? '' : catOf(s.cat).label + ' '}QUESTIONS MET SO FAR`;
    sum.innerHTML = `
      <div class="tv-ox" style="font-size:30px;font-weight:700;letter-spacing:3px;color:${got ? '#FFB547' : '#D7E6F0'}">
        ${got ? '★ ASTRONAUT WINGS EARNED' : 'ROUND COMPLETE'} · ${s.score} OF ${s.qs.length} RIGHT</div>
      <div style="font-size:18px;letter-spacing:1px;color:#B9CBD6">
        ${got ? `YOU NOW HAVE ${st.wings} WINGS` : 'GET 4 RIGHT NEXT ROUND TO EARN WINGS'} · ${toRank}</div>
      <div style="font-size:18px;letter-spacing:1px;color:#B9CBD6">
        TODAY ${t.right} OF ${t.asked} RIGHT IN ${t.rounds} ROUND${t.rounds === 1 ? '' : 'S'} · BEST EVER ${st.bestRun} RIGHT IN A ROW · ALL-TIME ${pct}%</div>
      <div style="font-size:16px;letter-spacing:1px;color:#9FBFCF">${bank}</div>`;
    sum.style.display = 'flex';
  } else {
    sum.style.display = 'none';
  }
  root.querySelector('[data-score]').textContent = `${s.score}/${s.qs.length}`;
  root.querySelector('[data-wings]').textContent = st.wings;
  const alive = st.lastWingsDay === dayKey() || st.lastWingsDay === dayKey(new Date(Date.now() - 86400000));
  root.querySelector('[data-streak]').textContent = alive && st.streak ? `${st.streak} DAY${st.streak > 1 ? 'S' : ''}` : '0 DAYS';
  root.querySelector('[data-run]').textContent = st.run;
  root.querySelector('[data-rank]').textContent = rankFor(st.wings);
  const qotd = read(QOTD_KEY, {});
  const isQotd = qotd.day === dayKey() && qotd.idx === cur.idx && s.i === 0;
  const num = root.querySelector('[data-num]');
  num.textContent = isQotd ? `★ QUESTION OF THE DAY · 1 OF ${s.qs.length}` : `QUESTION ${s.i + 1} OF ${s.qs.length}`;
  num.style.color = isQotd ? '#FFB547' : '#9FBFCF';
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
  const cur = shown(s.qs[s.i]);
  const ok = k === cur.a;
  s.chosen = k;
  s.marks[s.i] = ok ? 'r' : k === SKIPPED ? 's' : 'w';
  if (ok) s.score += 1;
  s.tally.asked += 1;
  if (ok) s.tally.right += 1;
  const st = stats();
  st.asked += 1;
  if (ok) st.right += 1;
  st.run = ok ? st.run + 1 : 0;
  st.bestRun = Math.max(st.bestRun, st.run);
  write(STATS_KEY, st);
  markSeen(cur.idx);
  const qotd = read(QOTD_KEY, {});
  if (qotd.day === dayKey() && qotd.idx === cur.idx && !qotd.answered) write(QOTD_KEY, Object.assign(qotd, { answered: true, right: ok }));
  if (s.i === s.qs.length - 1 && !s.done) { s.done = true; finishRound(); }
  saveToday();
  render();
}

function onClick(e) {
  const s = state;
  const cat = e.target.closest('[data-cat]');
  if (cat) {
    if (cat.dataset.cat === s.cat) return;
    try { localStorage.setItem(CAT_KEY, cat.dataset.cat); } catch (err) { /* storage off */ }
    newRound(cat.dataset.cat); // a fresh round of that kind (answers so far still count)
    saveToday();
    render();
    return;
  }
  const pick = e.target.closest('[data-pick]');
  if (pick && s.chosen === null) { answer(Number(pick.dataset.pick)); return; }
  if (e.target.closest('[data-next]')) {
    if (s.chosen === null) { answer(SKIPPED); return; }
    if (s.i < s.qs.length - 1) {
      s.i += 1;
      s.chosen = null;
    } else {
      newRound(s.cat); // five more, the least-met first (and after midnight, a new day's tally)
    }
    saveToday();
    render();
  }
}

export function mount(el) {
  const t = read(TODAY_KEY, null);
  let cat = 'all';
  try { cat = catOf(localStorage.getItem(CAT_KEY) || 'all').id; } catch (e) { /* storage off */ }
  // Pick up where he left off today; otherwise a fresh round.
  const resume = t && t.day === dayKey() && Array.isArray(t.qs) && t.qs.length && t.qs.every((k) => QUESTIONS[k]);
  state = { day: dayKey(), cat, qs: [], i: 0, chosen: null, score: 0, done: false, marks: [], tally: { rounds: 0, right: 0, asked: 0 } };
  if (resume) {
    Object.assign(state, {
      cat: catOf(t.cat).id, qs: t.qs, i: Math.min(t.i || 0, t.qs.length - 1), score: t.score || 0,
      chosen: t.chosen == null ? null : t.chosen, done: !!t.done, marks: t.marks || [],
      tally: Object.assign({ rounds: 0, right: 0, asked: 0 }, t.tally),
    });
  } else {
    newRound(cat);
    saveToday();
  }
  el.innerHTML = `
  <link rel="stylesheet" crossorigin href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .tv-root{width:1280px;height:800px;box-sizing:border-box;padding:24px 40px 26px;background:#05070D;color:#D7E6F0;font-family:'JetBrains Mono',monospace;display:flex;flex-direction:column;gap:18px}
    .tv-root a{color:#5CE1E6}
    .tv-root a:active{color:#A8F2F4}
    .tv-ox{font-family:Oxanium,sans-serif}
    .tv-opt{min-height:92px;padding:10px 28px;text-align:left;font-family:Oxanium,sans-serif;font-size:28px;line-height:1.2;cursor:pointer;border:2px solid;display:flex;align-items:center;border-radius:0}
    .tv-letter{margin-right:22px;flex:none}
    .tv-next{min-height:64px;padding:0 30px;border:none;background:#FFB547;color:#05070D;font-family:Oxanium,sans-serif;font-size:18px;font-weight:700;letter-spacing:3px;cursor:pointer;flex:none}
    .tv-next:active{background:#FFD08A}
    .tv-next.tv-reveal{background:none;border:1px solid #1E3A4A;color:#9FBFCF}
    .tv-next.tv-reveal:active{border-color:#5CE1E6;color:#5CE1E6}
    .tv-mark{margin-left:auto;padding-left:16px;font-size:30px;flex:none}
    .tv-pip{display:inline-block;width:16px;height:16px;box-sizing:border-box;border:2px solid #1E3A4A;margin-left:8px}
    .tv-stat{color:#9FBFCF}
    .tv-stat b{color:#FFB547;font-weight:400}
    .tv-cat{min-height:52px;padding:0 16px;border:1px solid #1E3A4A;background:none;color:#9FBFCF;font-family:'JetBrains Mono',monospace;font-size:15px;letter-spacing:2px;cursor:pointer;white-space:nowrap}
    .tv-cat.tv-on{border-color:#5CE1E6;color:#05070D;background:#5CE1E6}
  </style>
  <div class="tv-root">
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1E3A4A;padding-bottom:12px">
      <div style="display:flex;align-items:center;gap:16px">
        <a href="#/bridge" style="min-height:56px;padding:0 22px;box-sizing:border-box;border:1px solid #1E3A4A;font-size:16px;letter-spacing:3px;display:flex;align-items:center">◂ DECK</a>
        <div class="tv-ox" style="font-size:24px;font-weight:700;letter-spacing:5px;color:#5CE1E6;white-space:nowrap">SPACE &amp; FLIGHT TRIVIA</div>
      </div>
      <div style="display:flex;gap:12px;font-size:16px;letter-spacing:1px;white-space:nowrap">
        <span class="tv-stat">ROUND <b data-score>0</b></span>
        <span class="tv-stat">IN A ROW <b data-run>0</b></span>
        <span class="tv-stat">WINGS ★ <b data-wings>0</b></span>
        <span class="tv-stat">STREAK <b data-streak>0 DAYS</b></span>
        <span class="tv-stat">RANK <b data-rank>CADET</b></span>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <div data-num style="font-size:16px;letter-spacing:3px;color:#9FBFCF"></div>
      <div data-pips style="display:flex;align-items:center"></div>
      <div style="margin-left:auto;display:flex;gap:8px">
        ${CATEGORIES.map((c) => `<button class="tv-cat" data-cat="${c.id}">${c.label}</button>`).join('')}
      </div>
    </div>
    <div data-q class="tv-ox" style="font-size:52px;font-weight:500;line-height:1.15;max-width:1100px"></div>
    <div data-opts style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px"></div>
    <div data-summary style="display:none;border:1px solid #1E3A4A;background:#0A1220;padding:14px 24px;flex-direction:column;gap:6px"></div>
    <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:32px;border-top:1px solid #1E3A4A;padding-top:16px">
      <div data-feedback style="font-size:20px;line-height:1.4;color:#9FBFCF"></div>
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
