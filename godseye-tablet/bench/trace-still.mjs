// Driver for drive.mjs: what happens around "sharp when still"? Logs every
// drawn frame (mode, holds, canvas size) and the governor's changes.
const INPAGE = `
window.__f = (() => {
  const G = () => window.__godsEyeView;
  const sc = G().viewer.scene;
  const frames = [];
  sc.postRender.addEventListener(() => {
    const d = G().getRenderGovernorDiagnostics() || {};
    frames.push({ t: Math.round(performance.now()), mode: sc.requestRenderMode ? 'demand' : 'continuous', holds: (d.holds || []).join('+'), w: G().viewer.canvas.width,
      sse: +sc.globe.maximumScreenSpaceError.toFixed(2), tiles: sc.globe.tilesLoaded });
    if (frames.length > 3000) frames.shift();
  });
  // Frames from just before each sharpening to a while after it.
  function around() {
    const out = [];
    for (const c of window.__gevTablet.changes.filter((c) => c.reason === 'still' || c.reason === 'moving'))
      out.push({ change: c, frames: frames.filter((f) => f.t >= c.at - 300 && f.t <= c.at + 900).map((f) => (f.t - c.at) + ':' + f.mode[0] + ':' + f.w + ':' + f.sse + (f.holds ? ':' + f.holds : '')) });
    return out;
  }
  return { frames, around, count: () => frames.length };
})();
'ok'`;

export default async function drive({ ev, sleep, log }) {
  const out = {};
  await ev(INPAGE);
  await sleep(9000);
  out.afterStart = await ev(`({ changes: window.__gevTablet.changes, state: window.__gevTablet.governor.state(), frames: window.__f.count() })`);
  for (const id of (process.env.MISSIONS || 'quakes,explore,weather').split(',')) {
    log('mission', id);
    await ev(`window.__gevTablet.missions.choose(${JSON.stringify(id)}).then(() => 'ok')`, 150000);
    await sleep(9000);
  }
  out.around = await ev(`window.__f.around()`);
  out.state = await ev(`window.__gevTablet.governor.state()`);
  return out;
}
