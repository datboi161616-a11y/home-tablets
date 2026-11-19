// Driver for drive.mjs: how fast does a scene run at its own pace, and where
// does the processor's time go? Sets a scene up, lets it settle, then runs the
// app's frame at HZ times a second (a headless browser's own animation timer is
// throttled, so the pace is kept here: each turn does exactly what the app's
// loop does, and the app still decides whether the turn draws) while sampling
// the page's JavaScript for PROFILE_S seconds.
//   SCENE   planes | flightsWide | satellites | globe | ...   (bench scenes)
//   MISSION a tablet-edition mission id, instead of SCENE
//   HZ      the pace: 60 for the stock app, 30 for the tablet edition's cap
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENE = process.env.SCENE || 'planes';
const MISSION = process.env.MISSION || '';
const HZ = Number(process.env.HZ || 60);
const PROFILE_S = Number(process.env.PROFILE_S || 15);
const SETTLE_S = Number(process.env.SETTLE_S || 25);
const LABEL = process.env.LABEL || (MISSION || SCENE);
const KEEP_PROFILE = process.env.KEEP_PROFILE === '1';

export default async function drive({ ev, sleep, log, send, memory, rate }) {
  await ev(readFileSync(join(HERE, 'inpage.js'), 'utf8'));
  await sleep(4000);
  if (MISSION) await ev(`window.__gevTablet.missions.choose(${JSON.stringify(MISSION)}).then(() => 'ok')`, 180000);
  else await ev(`window.__bench.scenes[${JSON.stringify(SCENE)}]().then(() => 'ok')`, 180000);
  await sleep(SETTLE_S * 1000);

  await ev(`(() => {
    const G = window.__godsEyeView, v = G.viewer, sc = v.scene, gl = sc.context._gl;
    const s = (window.__paced = { calls: 0, frames: 0, ms: [], gaps: [], last: 0, stop: false, was: v.useDefaultRenderLoop, draws: 0, tris: 0 });
    let drew = false;
    s.offPost = sc.postRender.addEventListener(() => { drew = true; });
    const T = gl.TRIANGLES, S = gl.TRIANGLE_STRIP;
    const wrap = (name, count) => { const orig = gl[name]; if (typeof orig !== 'function') return; gl[name] = function (...a) { s.draws++; s.tris += count(a) || 0; return orig.apply(this, a); }; (s.undo = s.undo || []).push(() => { gl[name] = orig; }); };
    wrap('drawElements', (a) => (a[0] === T ? a[1] / 3 : a[0] === S ? a[1] - 2 : 0));
    wrap('drawArrays', (a) => (a[0] === T ? a[2] / 3 : a[0] === S ? a[2] - 2 : 0));
    wrap('drawElementsInstanced', (a) => (a[0] === T ? (a[1] / 3) * a[4] : a[0] === S ? (a[1] - 2) * a[4] : 0));
    wrap('drawArraysInstanced', (a) => (a[0] === T ? (a[2] / 3) * a[3] : a[0] === S ? (a[2] - 2) * a[3] : 0));
    v.useDefaultRenderLoop = false;
    const interval = 1000 / ${HZ};
    let next = performance.now();
    const pump = () => {
      if (s.stop) return;
      const t0 = performance.now();
      drew = false;
      try { v.resize(); v.render(); } catch (e) { s.error = String(e); }
      const t1 = performance.now();
      s.calls++;
      if (drew) { s.frames++; s.ms.push(t1 - t0); if (s.last) s.gaps.push(t1 - s.last); s.last = t1; }
      next += interval;
      let delay = next - performance.now();
      if (delay < 0) { next = performance.now(); delay = 0; }
      setTimeout(pump, delay);
    };
    pump();
    return 'ok';
  })()`);
  // Warm up at the new pace, then count from zero.
  await sleep(6000);
  await ev(`(() => { const s = window.__paced; s.calls = 0; s.frames = 0; s.ms = []; s.gaps = []; s.last = 0; s.draws = 0; s.tris = 0; return 'ok'; })()`);

  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval', { interval: 500 });
  await send('Profiler.start');
  const t0 = Date.now();
  await sleep(PROFILE_S * 1000);
  const stopped = await send('Profiler.stop', {}, 180000);
  const wallMs = Date.now() - t0;
  const paced = await ev(`(() => {
    const s = window.__paced; s.stop = true; s.offPost(); (s.undo || []).forEach((u) => u());
    const G = window.__godsEyeView, v = G.viewer;
    v.useDefaultRenderLoop = s.was;
    const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return +(b[Math.min(b.length - 1, Math.floor(b.length * p))] || 0).toFixed(1); };
    return { turns: s.calls, frames: s.frames, frameMs: { median: q(s.ms, 0.5), p90: q(s.ms, 0.9), max: q(s.ms, 0.999) }, gapMs: { median: q(s.gaps, 0.5), p90: q(s.gaps, 0.9) },
      drawsPerFrame: Math.round(s.draws / Math.max(1, s.frames)), trianglesPerFrame: Math.round(s.tris / Math.max(1, s.frames)),
      canvas: [v.canvas.width, v.canvas.height], msaa: v.scene.msaaSamples, sse: +v.scene.globe.maximumScreenSpaceError.toFixed(2),
      tiles: v.scene.globe._surface && v.scene.globe._surface._tilesToRender ? v.scene.globe._surface._tilesToRender.length : null,
      holds: (G.getRenderGovernorDiagnostics() || {}).holds,
      layers: G.dataManager.getAll().filter((l) => l.enabled).map((l) => l.id),
      governor: window.__gevTablet && window.__gevTablet.governor ? window.__gevTablet.governor.state() : null,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, error: s.error || null };
  })()`);

  const profile = stopped.result && stopped.result.profile;
  // How much live data the scene is carrying: it varies from run to run.
  const load = await ev(`window.__godsEyeView.voiceCommands.runner('get_current_view_state', {}).then((s) => ({ layers: (s.layers || []).map((l) => [l.id || l.layerId, l.count ?? l.loaded ?? l.total ?? null, l.inView ?? null]), tracked: (s.tracked || []).map((t) => t.callsign || t.name), camera: s.camera })).catch(() => null)`, 30000);
  const out = { label: LABEL, hz: HZ, wallMs, paced, load, fps: +(paced.frames / (wallMs / 1000)).toFixed(1), memory: memory() };
  if (!profile) return { ...out, error: 'no profile' };

  // Self time per node from the sample stream.
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const deltas = profile.timeDeltas || [];
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (deltas[i] || 0)));
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const fileOf = (url) => (url || '').split('/').pop().split('?')[0];
  const fnKey = (n) => `${n.callFrame.functionName || '(anonymous)'} @ ${fileOf(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`;
  const byFn = new Map();
  const byFile = new Map();
  let idle = 0, gc = 0, program = 0;
  for (const [id, us] of self) {
    const n = byId.get(id);
    const name = n.callFrame.functionName;
    if (name === '(idle)') { idle += us; continue; }
    if (name === '(garbage collector)') gc += us;
    if (name === '(program)') program += us;
    byFn.set(fnKey(n), (byFn.get(fnKey(n)) || 0) + us);
    const f = fileOf(n.callFrame.url) || `[${name}]`;
    byFile.set(f, (byFile.get(f) || 0) + us);
  }
  const busy = total - idle;
  const top = (map, k) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, k)
    .map(([key, us]) => ({ key, ms: +(us / 1000).toFixed(0), pctOfBusy: +((us / busy) * 100).toFixed(1) }));

  // Time under each function (itself and everything it calls), counted once
  // per call path, to see which part of the app owns the frame.
  const kids = new Map(profile.nodes.map((n) => [n.id, n.children || []]));
  const incl = new Map();
  const order = [];
  const stack = [profile.nodes[0].id];
  while (stack.length) { const id = stack.pop(); order.push(id); for (const c of kids.get(id) || []) stack.push(c); }
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    let t = self.get(id) || 0;
    for (const c of kids.get(id) || []) t += incl.get(c) || 0;
    incl.set(id, t);
  }
  const inclByFn = new Map();
  const parentOf = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parentOf.set(c, n.id);
  for (const n of profile.nodes) {
    const key = fnKey(n);
    // Skip a node whose ancestor is the same function: its time is already
    // inside that ancestor's.
    let nested = false;
    for (let p = parentOf.get(n.id); p !== undefined; p = parentOf.get(p)) if (fnKey(byId.get(p)) === key) { nested = true; break; }
    if (!nested) inclByFn.set(key, (inclByFn.get(key) || 0) + incl.get(n.id));
  }
  out.busyPct = +((busy / total) * 100).toFixed(1);
  out.busyMsPerFrame = +((busy / 1000) / Math.max(1, paced.frames)).toFixed(1);
  out.gcPctOfBusy = +((gc / busy) * 100).toFixed(1);
  out.programPctOfBusy = +((program / busy) * 100).toFixed(1);
  out.topSelf = top(byFn, 50);
  out.topFiles = top(byFile, 30);
  out.topInclusive = top(inclByFn, 70);
  if (KEEP_PROFILE) writeFileSync(join(HERE, `profile-${LABEL}-${rate}x.cpuprofile`), JSON.stringify(profile));
  return out;
}
