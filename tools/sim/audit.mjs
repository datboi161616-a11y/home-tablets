// Driver for site-drive.mjs: visit every screen of one profile, and note what
// each one costs and leaves behind. Then walk them all a few more times to see
// whether memory creeps.
//   ROUTES  comma-separated starting routes (default: the profile's own)
//   SOAK    rounds of the walk after the audit (default 4)
const FAMILY = 'home,launcher,photos,recipes,plan,shopping,timers,myrecipe,addphotos,apps,camera,calendar,forecast,messages,night,recipe,dish';
const TOM = 'bridge,flights,departures,trivia,alert,missions,sky,deepimage,viewscreen,apps,camera,photos,addphotos,settings';
const SOAK = Number(process.env.SOAK ?? 4);
const DWELL = Number(process.env.DWELL_MS || 2600);

const INPAGE = `
window.__a = (() => {
  const P = window.__probe;
  const snap = () => ({ ids: [...P.intervals.keys()], raf: P.raf, timeouts: P.timeouts, global: [...P.global.entries()].filter(([, n]) => n).map(([k, n]) => k + ':' + n).sort().join(' ') });
  const describe = (el) => el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') : '?';
  function look() {
    const screen = document.querySelector('#screen');
    const anims = document.getAnimations ? document.getAnimations() : [];
    const endless = anims.filter((a) => { try { const t = a.effect.getComputedTiming(); return t.iterations === Infinity && a.playState === 'running'; } catch (e) { return false; } });
    const names = {};
    for (const a of endless) { const k = (a.animationName || a.id || 'anim') + ' on ' + describe(a.effect.target); names[k] = (names[k] || 0) + 1; }
    const text = screen.innerText.replace(/\\s+/g, ' ').trim();
    // Things a finger has to hit: how small is the smallest?
    const hit = [...screen.querySelectorAll('a[href], button, [role=button], input, select, textarea, [data-act], [onclick]')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none'; });
    const small = hit.map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), what: describe(e) + ' "' + (e.innerText || e.getAttribute('aria-label') || e.value || '').trim().slice(0, 18) + '"' }; }).filter((s) => Math.min(s.w, s.h) < 44).sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h)).slice(0, 5);
    // Text that runs out of its box or off the 1280x800 canvas.
    const clipped = [];
    for (const e of screen.querySelectorAll('*')) {
      if (!e.children.length && e.textContent.trim().length > 2) {
        const r = e.getBoundingClientRect();
        if (r.width && (r.right > 1281 || r.bottom > 801 || r.left < -1)) { let p = e, hiddenBy = null; while ((p = p.parentElement) && p !== screen) { const o = getComputedStyle(p); if (o.overflow !== 'visible' || o.overflowX !== 'visible' || o.overflowY !== 'visible') { hiddenBy = p; break; } } if (!hiddenBy) clipped.push(describe(e) + ' "' + e.textContent.trim().slice(0, 24) + '" @' + Math.round(r.left) + ',' + Math.round(r.top)); }
      }
    }
    const links = [...new Set([...screen.querySelectorAll('a[href^="#/"]')].map((a) => a.getAttribute('href').slice(2)))];
    return { nodes: screen.querySelectorAll('*').length, textLen: text.length, text: text.slice(0, 110), anims: anims.length, endless: Object.entries(names).map(([k, n]) => n + 'x ' + k).slice(0, 6), canvases: screen.querySelectorAll('canvas').length, videos: screen.querySelectorAll('video').length, imgs: screen.querySelectorAll('img').length, brokenImgs: [...screen.querySelectorAll('img')].filter((i) => i.complete && !i.naturalWidth).map((i) => (i.getAttribute('src') || '').slice(0, 60)), hitTargets: hit.length, small, clipped: clipped.slice(0, 4), links, placeholder: /coming soon/i.test(text) };
  }
  const drainErrors = () => P.errors.splice(0);
  const interval = (id) => { const i = P.intervals.get(id); return i ? i.ms + 'ms from ' + i.from.slice(0, 150) : null; };
  return { snap, look, drainErrors, interval };
})();
'ok'`;

export default async function drive({ ev, shot, sleep, log, counters, memory, url }) {
  const profile = /profile=tom/.test(url) ? 'tom' : 'family';
  const seeds = (process.env.ROUTES || (profile === 'tom' ? TOM : FAMILY)).split(',');
  await ev(INPAGE);
  await sleep(1500);
  const out = { profile, screens: [], soak: [] };
  const queue = [...seeds];
  const seen = new Set();
  const perHead = {};
  let previous = null;
  out.start = await counters();
  while (queue.length && out.screens.length < 60) {
    const route = queue.shift();
    if (seen.has(route)) continue;
    seen.add(route);
    const head = route.split('/')[0];
    perHead[head] = (perHead[head] || 0) + 1;
    if (perHead[head] > 2) continue;
    const before = await ev(`window.__a.snap()`);
    await ev(`(location.hash = '#/' + ${JSON.stringify(route)}, 'ok')`);
    await sleep(DWELL);
    // The screen before this one has been left for a while: what is still running from it?
    if (previous) {
      const alive = await ev(`${JSON.stringify(previous.created)}.map((id) => window.__a.interval(id)).filter(Boolean)`);
      previous.record.leftRunning = alive;
      const globalNow = (await ev(`window.__a.snap()`)).global;
      previous.record.listenersAfterLeaving = globalNow === previous.globalBefore ? 'same' : globalNow;
    }
    const mid = await ev(`window.__a.snap()`);
    await sleep(2000);
    const after = await ev(`window.__a.snap()`);
    const look = await ev(`window.__a.look()`);
    const errors = await ev(`window.__a.drainErrors()`);
    const created = after.ids.filter((id) => !before.ids.includes(id));
    const record = {
      route, ...look, links: undefined,
      rafPerSec: +((after.raf - mid.raf) / 2).toFixed(1), timeoutsPerSec: +((after.timeouts - mid.timeouts) / 2).toFixed(1),
      intervals: await ev(`${JSON.stringify(created)}.map((id) => window.__a.interval(id)).filter(Boolean)`),
      errors,
    };
    out.screens.push(record);
    previous = { record, created, globalBefore: before.global };
    await shot(`${profile}-${String(out.screens.length).padStart(2, '0')}-${route.replace(/[^a-z0-9]+/gi, '_')}`);
    for (const link of look.links || []) if (!seen.has(link)) queue.push(link);
    log(route, 'nodes', look.nodes, 'raf/s', record.rafPerSec, 'endless', look.endless.length, 'errors', errors.length);
  }
  // Leave the last one too, to see what it leaves behind.
  await ev(`(location.hash = '#/${profile === 'tom' ? 'bridge' : 'home'}', 'ok')`);
  await sleep(DWELL);
  if (previous) previous.record.leftRunning = await ev(`${JSON.stringify(previous.created)}.map((id) => window.__a.interval(id)).filter(Boolean)`);
  out.afterAudit = await counters();
  out.intervalsAlive = await ev(`[...window.__probe.intervals.values()].map((i) => i.ms + 'ms @' + i.route + ' from ' + i.from.slice(0, 110))`);

  // The walk again, quickly, several times: does anything pile up?
  const routes = out.screens.map((s) => s.route);
  for (let round = 1; round <= SOAK; round++) {
    for (const route of routes) { await ev(`(location.hash = '#/' + ${JSON.stringify(route)}, 'ok')`); await sleep(700); }
    await ev(`(location.hash = '#/${profile === 'tom' ? 'bridge' : 'home'}', 'ok')`);
    await sleep(1500);
    const c = await counters();
    const live = await ev(`window.__probe.intervals.size`);
    out.soak.push({ round, ...c, intervals: live });
    log('soak', round, JSON.stringify(c), 'intervals', live);
  }
  out.intervalsAliveAfterSoak = await ev(`(() => { const m = {}; for (const i of window.__probe.intervals.values()) { const k = i.ms + 'ms from ' + i.from.slice(0, 110); m[k] = (m[k] || 0) + 1; } return Object.entries(m).map(([k, n]) => n + 'x ' + k); })()`);
  out.memory = memory();
  return out;
}
