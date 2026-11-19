// Driver for drive.mjs: in one session, time the same scene under several
// settings, to see what each costs per frame. Frames are paced as in
// profile.mjs. STEPS is a ;-separated list of name=javascript, each run in the
// page before its measurement (an empty script measures the scene as it is).
const MISSION = process.env.MISSION || 'planes';
const HZ = Number(process.env.HZ || 30);
const SECONDS = Number(process.env.SECONDS || 8);
const SETTLE_S = Number(process.env.SETTLE_S || 25);
const R = `(n, a) => window.__godsEyeView.voiceCommands.runner(n, a || {}).catch((e) => ({ ok: false, error: String(e) }))`;
const DEFAULT_STEPS = [
  ['as-is', ''],
  ['card-shut', `await run('set_panel_open', { panelId: 'global-context-panel', open: false })`],
  ['hud-off', `await run('set_hud', { visible: false })`],
  ['detection-off', `await run('set_detection', { enabled: false })`],
  ['card-open-again', `await run('set_panel_open', { panelId: 'global-context-panel', open: true })`],
];
const STEPS = process.env.STEPS_FILE
  ? JSON.parse((await import('node:fs')).readFileSync(process.env.STEPS_FILE, 'utf8'))
  : process.env.STEPS
  ? process.env.STEPS.split('|').map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; })
  : DEFAULT_STEPS;
/** Functions whose time (with all they call) is reported per frame. */
const WATCH = ['resize', 'render', '_fleetTick', 'drawWorldOverlay', 'layoutRightPanelRail', '_syncRightPanelAdaptiveLayout', 'refreshSelectedSubject',
  'updateAndExecuteCommands', '_focusIcons', '(program)', '(garbage collector)', 'tick', 'refresh', 'layoutLeftPanelRail', '_drawOverlay', 'host.update'];

export default async function drive({ ev, sleep, log, send }) {
  await sleep(4000);
  if (MISSION.startsWith('scene:')) {
    await ev(`(async () => { const run = ${R}; ${MISSION.slice(6)}; return 'ok'; })()`, 180000);
  } else {
    await ev(`window.__gevTablet.missions.choose(${JSON.stringify(MISSION)}).then(() => 'ok')`, 180000);
  }
  await sleep(SETTLE_S * 1000);
  await ev(`(() => {
    const G = window.__godsEyeView, v = G.viewer, sc = v.scene;
    const s = (window.__paced = { frames: 0, stop: false });
    let drew = false;
    sc.postRender.addEventListener(() => { drew = true; });
    v.useDefaultRenderLoop = false;
    const interval = 1000 / ${HZ};
    let next = performance.now();
    const pump = () => {
      if (s.stop) return;
      drew = false;
      try { v.resize(); v.render(); } catch (e) { s.error = String(e); }
      if (drew) s.frames++;
      next += interval;
      let delay = next - performance.now();
      if (delay < 0) { next = performance.now(); delay = 0; }
      setTimeout(pump, delay);
    };
    pump();
    return 'ok';
  })()`);
  await sleep(5000);
  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval', { interval: 500 });
  const out = { mission: MISSION, hz: HZ, steps: [] };
  for (const [name, script] of STEPS) {
    log('step', name);
    if (script) await ev(`(async () => { const run = ${R}; ${script}; return 'ok'; })()`, 60000);
    await sleep(5000);
    const f0 = await ev(`window.__paced.frames`);
    await send('Profiler.start');
    const t0 = Date.now();
    await sleep(SECONDS * 1000);
    const stopped = await send('Profiler.stop', {}, 120000);
    const wallMs = Date.now() - t0;
    const frames = (await ev(`window.__paced.frames`)) - f0;
    const profile = stopped.result && stopped.result.profile;
    if (!profile) { out.steps.push({ name, error: 'no profile' }); continue; }
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const self = new Map();
    const deltas = profile.timeDeltas || [];
    profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (deltas[i] || 0)));
    const kids = new Map(profile.nodes.map((n) => [n.id, n.children || []]));
    const parentOf = new Map();
    for (const n of profile.nodes) for (const c of n.children || []) parentOf.set(c, n.id);
    const order = [];
    const stack = [profile.nodes[0].id];
    while (stack.length) { const id = stack.pop(); order.push(id); for (const c of kids.get(id) || []) stack.push(c); }
    const incl = new Map();
    for (let i = order.length - 1; i >= 0; i--) { const id = order[i]; let t = self.get(id) || 0; for (const c of kids.get(id) || []) t += incl.get(c) || 0; incl.set(id, t); }
    let idle = 0, total = 0;
    for (const [id, us] of self) { total += us; if (byId.get(id).callFrame.functionName === '(idle)') idle += us; }
    const nameOf = (n) => n.callFrame.functionName || '(anonymous)';
    const watch = {};
    for (const w of WATCH) {
      let us = 0;
      for (const n of profile.nodes) {
        const fn = nameOf(n);
        if (!(fn === w || fn.endsWith('.' + w))) continue;
        let nested = false;
        for (let p = parentOf.get(n.id); p !== undefined; p = parentOf.get(p)) { const pf = nameOf(byId.get(p)); if (pf === w || pf.endsWith('.' + w)) { nested = true; break; } }
        if (!nested) us += incl.get(n.id);
      }
      watch[w] = +(us / 1000 / Math.max(1, frames)).toFixed(1);
    }
    const state = await ev(`(() => { const v = window.__godsEyeView.viewer; const g = window.__gevTablet && window.__gevTablet.governor ? window.__gevTablet.governor.state() : null; const hb = document.querySelector('.entity-card__preview-switch button.active'); const surf = v.scene.globe._surface; return { canvas: [v.canvas.width, v.canvas.height], tiles: surf && surf._tilesToRender ? surf._tilesToRender.length : null, sse: +v.scene.globe.maximumScreenSpaceError.toFixed(2), level: g && g.level, nodes: document.getElementsByTagName('*').length, hero: hb ? (hb.title || hb.getAttribute('aria-label') || hb.textContent.trim()) : (document.querySelector('#entity-card .entity-hero') ? document.querySelector('#entity-card .entity-hero').getAttribute('data-hero') + ':' + [...document.querySelectorAll('#entity-card .entity-hero__layer.is-shown')].map((n) => n.className.split(' ')[0]).join(',') : 'no card'), canvases: document.querySelectorAll('canvas').length, anims: document.getAnimations ? document.getAnimations().length : null }; })()`);
    out.steps.push({ name, frames, fps: +(frames / (wallMs / 1000)).toFixed(1), busyMsPerFrame: +(((total - idle) / 1000) / Math.max(1, frames)).toFixed(1), busyPct: +(((total - idle) / total) * 100).toFixed(0), perFrameMs: watch, ...state });
  }
  return out;
}
