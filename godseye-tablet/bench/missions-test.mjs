// Driver for drive.mjs: picks every mission in turn through the tablet
// edition's own menu handle, and records what ends up on screen. Then the ways
// out of the full-screen experiences, quick switching, taps on the map, the
// "All controls" view and the two sheets.
const ORDER = (process.env.MISSIONS ||
  'explore,quakes,planes,cockpit,station,launches,weather,military,cameras,radio,stories,show,explore')
  .split(',').filter(Boolean);
const SETTLE_MS = Number(process.env.SETTLE_MS || 7000);
const EXTRAS = process.env.EXTRAS !== '0';

const INPAGE = `
window.__t = (() => {
  const G = () => window.__godsEyeView;
  const run = async (n, a) => { try { return await G().voiceCommands.runner(n, a || {}); } catch (e) { return { ok: false, error: String((e && e.message) || e) }; } };
  const vis = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01 && r.width > 0 && r.height > 0;
  };
  const box = (sel) => { const e = document.querySelector(sel); if (!e || !vis(sel)) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
  const SEL = ['#title-bar', '#right-context-rail', '#global-context-panel', '#entity-card', '#radio-panel', '#cctv-panel', '#intel-hud', '#cockpit-hud', '#left-panel-stack',
    '#control-panel', '#top-center-actions', '#gev-omnibar', '#hStories', '#hPop', '.tm-bar', '.tm-now', '.tm-menu', '.tm-help', '.gev-panel-rail--right', '.context-tabs', '.global-context-modes'];
  async function snap() {
    const st = await run('get_current_view_state');
    const carto = G().viewer.camera.positionCartographic;
    return {
      mission: window.__gevTablet.missions.state(),
      title: (document.querySelector('.tm-now-title') || {}).textContent,
      tip: (document.querySelector('.tm-now-tip') || {}).textContent,
      layers: G().dataManager.getAll().filter((l) => l.enabled).map((l) => l.id),
      holds: (G().getRenderGovernorDiagnostics() || {}).holds,
      htmlAttrs: document.documentElement.className + ' | ' + (document.documentElement.getAttribute('data-tm-mission') || '-'),
      bodyClass: document.body.className,
      visible: SEL.filter((s) => vis(s)),
      boxes: { rail: box('#global-context-panel') || box('#cctv-panel'), bar: box('.tm-bar') },
      governor: window.__gevTablet.governor && window.__gevTablet.governor.state(),
      canvas: [G().viewer.canvas.width, G().viewer.canvas.height],
      camera: { lat: +(carto.latitude * 180 / Math.PI).toFixed(2), lon: +(carto.longitude * 180 / Math.PI).toFixed(2), heightKm: Math.round(carto.height / 1000) },
      cockpit: st && st.cockpit && st.cockpit.active, context: st && st.context && st.context.mode, tracked: st && (st.tracked || []).map((t) => t.callsign || t.name || t.kind),
      scene: st && st.scenePlayback && st.scenePlayback.running,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    };
  }
  async function choose(id, ms) {
    const t0 = performance.now();
    const done = window.__gevTablet.missions.choose(id).then(() => 'done');
    const out = await Promise.race([done, new Promise((r) => setTimeout(() => r('timeout'), ms))]);
    return { out, ms: Math.round(performance.now() - t0) };
  }
  // The nth spot on the map where something can be picked, scanning a grid.
  function findPickable({ x0 = 260, x1 = 820, y0 = 130, y1 = 640, step = 12, skip = 0, prefix = '' } = {}) {
    const sc = G().viewer.scene;
    const seen = new Set();
    for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
      let hit = null;
      try { hit = sc.pick({ x, y }); } catch (e) { hit = null; }
      const id = hit && (typeof hit.id === 'string' ? hit.id : hit.id && hit.id.id);
      if (!id || (prefix && !String(id).startsWith(prefix)) || seen.has(id)) continue;
      seen.add(id);
      if (seen.size > skip) return { x, y, id: String(id).slice(0, 60) };
    }
    return null;
  }
  const card = () => {
    const c = document.querySelector('#entity-card');
    return c ? { layer: c.getAttribute('data-layer'), text: c.innerText.replace(/\\s+/g, ' ').slice(0, 260) } : null;
  };
  const clickText = (text) => { const b = [...document.querySelectorAll('button, a')].find((n) => n.textContent.trim().toUpperCase().includes(text)); if (!b) return false; b.click(); return true; };
  return { run, snap, choose, vis, findPickable, card, clickText };
})();
'ok'`;

export default async function drive({ ev, shot, sleep, log, send, memory }) {
  const out = { steps: [] };
  const pic = (name) => shot(name, { format: 'jpeg', scale: 2 / 3 });
  const missionState = () => ev(`window.__gevTablet.missions.state()`);
  await ev(INPAGE);
  // The app's own start, the starting values, then the menu opens.
  await sleep(5000);
  out.start = await ev(`window.__t.snap()`);
  await pic('00-menu');

  let n = 0;
  for (const id of ORDER) {
    n += 1;
    log('mission', id);
    const chosen = await ev(`window.__t.choose(${JSON.stringify(id)}, 110000)`, 130000);
    await sleep(SETTLE_MS);
    const snap = await ev(`window.__t.snap()`, 60000);
    const file = await pic(`${String(n).padStart(2, '0')}-${id}`);
    const step = { id, chosen, snap, file };
    out.steps.push(step);
    log(id, JSON.stringify(chosen), 'layers', JSON.stringify(snap && snap.layers), '|', snap && snap.tip && snap.tip.slice(0, 44));

    // The full-screen experiences have their own ways out: the bar follows.
    if (!EXTRAS) continue;
    if (id === 'cockpit') {
      await ev(`window.__t.run('control_cockpit', { action: 'exit' })`);
      await sleep(2500);
      step.afterOwnExit = await missionState();
      await ev(`window.__t.choose('cockpit', 110000)`, 130000); // back in, for the next mission to leave
      await sleep(3000);
    }
    if (id === 'stories') {
      step.backClicked = await ev(`window.__t.clickText('BACK TO GEV')`);
      await sleep(4000);
      step.afterOwnExit = await missionState();
      await pic(`${String(n).padStart(2, '0')}-${id}-after-back`);
      await ev(`window.__t.choose('stories', 110000)`, 130000); // open again, for the next mission to close
      await sleep(3000);
    }
    if (id === 'show') {
      let running = true;
      for (let i = 0; i < 50 && running; i++) { await sleep(1000); running = (await ev(`window.__t.run('control_scene', { action: 'status' }).then((s) => s && s.running === true)`)) === true; }
      await sleep(1500);
      step.afterFilmEnded = await missionState();
      await pic(`${String(n).padStart(2, '0')}-${id}-after-film`);
    }
  }
  if (!EXTRAS) { out.memory = memory(); return out; }

  // Switching quickly: the first mission must not carry on underneath.
  log('rapid switch');
  await ev(`(window.__gevTablet.missions.choose('cameras'), 'started')`);
  await sleep(1500);
  const quick = await ev(`window.__t.choose('quakes', 60000)`, 80000);
  await sleep(12000);
  out.rapid = { quick, snap: await ev(`window.__t.snap()`, 60000) };
  await pic('20-rapid-switch');

  // Taps on the map, as a finger makes them.
  // The browser's own tap gesture: hand-made touchStart/touchEnd pairs reach
  // the page but are not taken for a tap by the app.
  const touchTap = async (x, y) => {
    await send('Input.synthesizeTapGesture', { x, y, duration: 70, tapCount: 1, gestureSourceType: 'touch' });
  };
  const mouseTap = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  out.taps = [];
  for (const [mission, prefix] of [['quakes', 'earthquake'], ['military', ''], ['radio', 'radio']]) {
    log('tap', mission);
    await ev(`window.__t.choose(${JSON.stringify(mission)}, 110000)`, 130000);
    await sleep(8000);
    for (const [how, tap, skip] of [['touch', touchTap, 0], ['touch', touchTap, 2]]) {
      const pick = await ev(`window.__t.findPickable(${JSON.stringify({ prefix, skip })})`, 90000);
      if (pick) { await tap(pick.x, pick.y); await sleep(3500); }
      out.taps.push({ mission, how, pick, card: await ev(`window.__t.card()`), visible: await ev(`['#global-context-panel','#entity-card','#radio-panel'].filter((s) => window.__t.vis(s))`) });
    }
    await pic(`24-tap-${mission}`);
  }
  await ev(`window.__t.run('control_radio', { action: 'stop' })`);

  // All controls, the plain-English sheet, and the menu.
  await ev(`window.__t.choose('planes', 110000)`, 130000);
  await sleep(9000);
  await pic('25-planes-with-card');
  await ev(`(window.__gevTablet.missions.setSimple(false), 'ok')`);
  await sleep(1500);
  out.allControls = await ev(`window.__t.snap()`);
  await pic('21-all-controls');
  await ev(`(window.__gevTablet.missions.setSimple(true), 'ok')`);
  await ev(`(document.querySelector('.tm-bar .tm-button-round').click(), 'ok')`);
  await sleep(800);
  await pic('22-help');
  await ev(`(document.querySelector('.tm-help .tm-button-round').click(), 'ok')`);
  await ev(`(document.querySelector('.tm-bar .tm-button-main').click(), 'ok')`);
  await sleep(800);
  await pic('23-menu-again');
  out.changes = await ev(`window.__gevTablet.changes.slice(-30)`);
  out.env = await ev(`({ coarse: matchMedia('(pointer: coarse)').matches, hoverNone: matchMedia('(hover: none)').matches, touchPoints: navigator.maxTouchPoints, cores: navigator.hardwareConcurrency, mem: navigator.deviceMemory, ua: navigator.userAgent.slice(0, 60), inner: [innerWidth, innerHeight], dpr: devicePixelRatio })`);
  out.memory = memory();
  return out;
}
