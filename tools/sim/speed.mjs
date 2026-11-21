// Driver for site-drive.mjs: how long does each screen take to open, and what
// does it cost while it just sits there? Run with a CPU slowdown (4) to stand
// in for a slow processor. ROUTES env overrides the list.
const FAMILY = 'home,launcher,photos,recipes,recipes/dinner,plan,shopping,timers,calendar,forecast,messages,night,apps,addphotos,camera,home';
const TOM = 'bridge,flights,departures,trivia,alert,missions,sky,deepimage,viewscreen,bridge';
const IDLE_S = Number(process.env.IDLE_S || 4);

const INPAGE = `
window.__s = (() => {
  // Resolves once the screen has stopped changing for a moment.
  function settle(quietMs = 400, maxMs = 12000) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      let last = t0, changes = 0;
      const mo = new MutationObserver((m) => { last = performance.now(); changes += m.length; });
      mo.observe(document.getElementById('screen'), { subtree: true, childList: true, characterData: true, attributes: true });
      const check = () => {
        const now = performance.now();
        if (now - last >= quietMs || now - t0 >= maxMs) { mo.disconnect(); resolve({ ms: Math.round(last - t0), changes, timedOut: now - t0 >= maxMs }); }
        else setTimeout(check, 50);
      };
      setTimeout(check, 50);
    });
  }
  async function go(route) {
    const p = settle();
    location.hash = '#/' + route;
    return p;
  }
  return { go, settle };
})();
'ok'`;

export default async function drive({ ev, sleep, log, send, url, bootMs, memory, counters }) {
  const profile = /profile=tom/.test(url) ? 'tom' : 'family';
  const routes = (process.env.ROUTES || (profile === 'tom' ? TOM : FAMILY)).split(',');
  await send('Performance.enable');
  const metrics = async () => {
    const r = await send('Performance.getMetrics');
    const m = {};
    for (const { name, value } of r.result.metrics) m[name] = value;
    return m;
  };
  const delta = (a, b) => ({
    taskMs: Math.round((b.TaskDuration - a.TaskDuration) * 1000),
    scriptMs: Math.round((b.ScriptDuration - a.ScriptDuration) * 1000),
    layoutMs: Math.round((b.LayoutDuration - a.LayoutDuration) * 1000),
    styleMs: Math.round((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000),
  });
  await ev(INPAGE);
  const boot = await metrics();
  const out = { profile, boot: { ms: bootMs, taskMs: Math.round(boot.TaskDuration * 1000), scriptMs: Math.round(boot.ScriptDuration * 1000), layoutMs: Math.round(boot.LayoutDuration * 1000), styleMs: Math.round(boot.RecalcStyleDuration * 1000) }, screens: [] };
  await sleep(3000);
  for (const route of routes) {
    const a = await metrics();
    const opened = await ev(`window.__s.go(${JSON.stringify(route)})`, 30000);
    const b = await metrics();
    await sleep(600);
    const c = await metrics();
    await sleep(IDLE_S * 1000);
    const d = await metrics();
    const idle = delta(c, d);
    const rec = { route, openMs: opened && opened.ms, changes: opened && opened.changes, timedOut: opened && opened.timedOut, open: delta(a, b), idlePct: +((idle.taskMs / (IDLE_S * 1000)) * 100).toFixed(1), idle };
    out.screens.push(rec);
    log(route, 'open', rec.openMs, 'ms, busy', rec.open.taskMs, 'ms; idle', rec.idlePct, '%');
  }
  out.counters = await counters();
  out.memory = memory();
  return out;
}
