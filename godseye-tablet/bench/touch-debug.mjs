// Driver for drive.mjs: does a finger tap on a plane select it? Records the
// events the page sees for three kinds of tap, and what the app then shows.
const INPAGE = `
window.__d = (() => {
  const G = () => window.__godsEyeView;
  const log = [];
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click'])
    document.addEventListener(type, (e) => log.push(type + (e.pointerType ? ':' + e.pointerType : '') + '@' + Math.round(e.clientX ?? (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : -1)) + ',' + Math.round(e.clientY ?? (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : -1)) + '>' + (e.target && e.target.tagName)), true);
  function findPickable({ x0 = 260, x1 = 820, y0 = 130, y1 = 640, step = 10, skip = 0 } = {}) {
    const sc = G().viewer.scene;
    const seen = new Set();
    for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
      let hit = null;
      try { hit = sc.pick({ x, y }); } catch (e) { hit = null; }
      const id = hit && (typeof hit.id === 'string' ? hit.id : hit.id && hit.id.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (seen.size > skip) return { x, y, id: String(id).slice(0, 40) };
    }
    return null;
  }
  const state = async () => {
    const st = await G().voiceCommands.runner('get_current_view_state', {});
    const c = document.querySelector('#entity-card');
    return { tracked: (st.tracked || []).map((t) => t.callsign || t.name || t.kind), card: c ? c.innerText.replace(/\\s+/g, ' ').slice(0, 90) : null, events: log.splice(0) };
  };
  return { findPickable, state, coarse: matchMedia('(pointer: coarse)').matches };
})();
'ok'`;

export default async function drive({ ev, sleep, log, send, shot }) {
  const out = {};
  await ev(INPAGE);
  await sleep(4000);
  out.coarse = await ev(`window.__d.coarse`);
  await ev(`window.__gevTablet.missions.choose(${JSON.stringify(process.env.MISSION || 'military')}).then(() => 'ok')`, 150000);
  await sleep(9000);
  await ev(`window.__d.state()`); // clear the log
  const kinds = {
    touchEvents: async (x, y) => {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 0.5 }] });
      await sleep(70);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    tapGesture: async (x, y) => { await send('Input.synthesizeTapGesture', { x, y, duration: 70, tapCount: 1, gestureSourceType: 'touch' }); },
    mouse: async (x, y) => {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
  };
  out.taps = [];
  let skip = 0;
  for (const [kind, tap] of Object.entries(kinds)) {
    const pick = await ev(`window.__d.findPickable(${JSON.stringify({ skip })})`, 90000);
    skip += 2;
    log(kind, JSON.stringify(pick));
    if (pick) await tap(pick.x, pick.y);
    await sleep(3000);
    out.taps.push({ kind, pick, after: await ev(`window.__d.state()`) });
    await shot(`touch-${kind}`, { format: 'jpeg', scale: 2 / 3 });
    // Let go again, as a tap on open sky does.
    await ev(`window.__godsEyeView.voiceCommands.runner('stop_tracking', {}).then(() => 'ok')`);
    await sleep(1500);
    await ev(`window.__d.state()`);
  }
  return out;
}
