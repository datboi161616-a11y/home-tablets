// Runs inside the God's Eye View page. Uses the app's own QA handle
// (window.__godsEyeView) to set up scenes with the app's own actions and to time frames.
window.__bench = (() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const G = () => window.__godsEyeView;
  const run = async (name, args) => {
    try { return await G().voiceCommands.runner(name, args || {}); } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  };

  async function setLayers(ids) {
    const want = new Set(ids);
    for (const l of G().dataManager.getAll()) {
      if (l.enabled && !want.has(l.id)) await run('set_layer_visibility', { layerId: l.id, enabled: false });
    }
    for (const id of ids) if (!G().dataManager.isEnabled(id)) await run('set_layer_visibility', { layerId: id, enabled: true });
  }

  const SCENES = {
    // Whole globe, nothing on.
    globe: async () => { await run('set_context_mode', { mode: 'off' }); await run('stop_tracking'); await setLayers([]); await run('zoom_to_globe'); },
    // The app's own "Live contacts": follows the nearest plane over 3D terrain.
    planes: async () => { await run('set_context_mode', { mode: 'contacts' }); },
    // The same, set up as the tablet edition's mission does: go there first.
    planesNear: async () => { await run('set_context_mode', { mode: 'off' }); await run('stop_tracking'); await setLayers([]); await run('fly_to_location', { latitude: 35, longitude: -82.5, rangeM: 250000, waitForArrival: true }); await run('set_context_mode', { mode: 'contacts' }); },
    // The space station followed, as the tablet edition's mission sets it up.
    stationLike: async () => { await run('set_context_mode', { mode: 'off' }); await run('stop_tracking'); await setLayers(['satellites']); await run('zoom_to_globe'); for (let i = 0; i < 15; i++) { const r = await run('track_entity', { query: 'ISS', layerId: 'satellites' }); if (r && r.ok) break; await sleep(1500); } },
    // Military aircraft over the start place, as the mission sets it up.
    militaryLike: async () => { await run('set_context_mode', { mode: 'off' }); await run('stop_tracking'); await setLayers(['military']); await run('fly_to_location', { latitude: 35, longitude: -82.5, rangeM: 2500000, waitForArrival: true }); },
    // Only civil flights, seen from high up over a busy region.
    flightsWide: async () => { await run('set_context_mode', { mode: 'off' }); await run('stop_tracking'); await setLayers(['flights']); await run('fly_to_location', { latitude: 40.7, longitude: -74.0, rangeM: 900000, waitForArrival: true }); },
    space: async () => { await run('set_context_mode', { mode: 'space-missions' }); },
    satellites: async () => { await run('set_context_mode', { mode: 'off' }); await run('stop_tracking'); await setLayers(['satellites']); await run('zoom_to_globe'); },
    quakes: async () => { await run('set_context_mode', { mode: 'off' }); await run('stop_tracking'); await setLayers(['earthquakes']); await run('zoom_to_globe'); },
    city: async () => { await run('set_context_mode', { mode: 'off' }); await run('stop_tracking'); await setLayers([]); await run('fly_to_location', { locationId: 'nyc', viewMode: 'close', waitForArrival: true }); },
  };

  // Time `frames` frames drawn back to back: each is one full app + Cesium frame
  // (every per-frame listener runs), then gl.finish() so the GPU's work is included.
  async function measure(frames) {
    const v = G().viewer, sc = v.scene, gl = sc.context._gl;
    const stat = { draws: 0, tris: 0, frames: 0 };
    const wrap = (name, count) => {
      const orig = gl[name];
      if (typeof orig !== 'function') return () => {};
      gl[name] = function (...a) { stat.draws++; stat.tris += count(a) || 0; return orig.apply(this, a); };
      return () => { gl[name] = orig; };
    };
    const T = gl.TRIANGLES, S = gl.TRIANGLE_STRIP;
    const undo = [
      wrap('drawElements', (a) => (a[0] === T ? a[1] / 3 : a[0] === S ? a[1] - 2 : 0)),
      wrap('drawArrays', (a) => (a[0] === T ? a[2] / 3 : a[0] === S ? a[2] - 2 : 0)),
      wrap('drawElementsInstanced', (a) => (a[0] === T ? (a[1] / 3) * a[4] : a[0] === S ? (a[1] - 2) * a[4] : 0)),
      wrap('drawArraysInstanced', (a) => (a[0] === T ? (a[2] / 3) * a[3] : a[0] === S ? (a[2] - 2) * a[3] : 0)),
    ];
    const was = v.useDefaultRenderLoop;
    v.useDefaultRenderLoop = false;
    const ms = [];
    const warm = 4;
    try {
      for (let i = 0; i < frames + warm; i++) {
        sc.requestRender();
        if (i === warm) { stat.draws = 0; stat.tris = 0; }
        const t = performance.now();
        v.render();
        gl.finish();
        const d = performance.now() - t;
        if (i >= warm) { ms.push(d); stat.frames++; }
        await sleep(0);
      }
    } finally {
      v.useDefaultRenderLoop = was;
      undo.forEach((u) => u());
    }
    const sorted = [...ms].sort((a, b) => a - b);
    const q = (p) => +(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0).toFixed(2);
    const surf = sc.globe && sc.globe._surface;
    return {
      frameMs: { median: q(0.5), p90: q(0.9), min: q(0), max: q(0.999) },
      drawsPerFrame: Math.round(stat.draws / Math.max(1, stat.frames)),
      trianglesPerFrame: Math.round(stat.tris / Math.max(1, stat.frames)),
      tiles: surf && surf._tilesToRender ? surf._tilesToRender.length : null,
      canvas: [v.canvas.width, v.canvas.height],
      resolutionScale: v.resolutionScale,
      msaa: sc.msaaSamples,
      sse: sc.globe.maximumScreenSpaceError,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      layers: G().dataManager.getAll().filter((l) => l.enabled).map((l) => l.id),
      holds: (G().getRenderGovernorDiagnostics() || {}).holds || [],
    };
  }

  return { ready: () => !!(G() && G().voiceCommands && G().viewer), scenes: SCENES, measure, run, sleep };
})();
'bench installed';
