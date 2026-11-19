// Driver for drive.mjs: which parts of the page are rewritten while a scene
// runs? Counts DOM changes by the nearest named ancestor for a few seconds,
// with frames paced as in profile.mjs.
const MISSION = process.env.MISSION || 'planes';
const HZ = Number(process.env.HZ || 30);
export default async function drive({ ev, sleep, log }) {
  await sleep(4000);
  await ev(`window.__gevTablet.missions.choose(${JSON.stringify(MISSION)}).then(() => 'ok')`, 180000);
  await sleep(Number(process.env.SETTLE_S || 30) * 1000);
  const out = {};
  for (const [name, script] of [['card-open', ''], ['card-shut', `window.__godsEyeView.voiceCommands.runner('set_panel_open', { panelId: 'global-context-panel', open: false })`]]) {
    if (script) { await ev(`${script}.then(() => 'ok')`); await sleep(3000); }
    out[name] = await ev(`(async () => {
      const G = window.__godsEyeView, v = G.viewer, sc = v.scene;
      const where = (node) => { for (let e = node.nodeType === 1 ? node : node.parentElement; e; e = e.parentElement) { if (e.id) return '#' + e.id; if (e === document.body) return 'body'; } return '?'; };
      const leaf = (node) => { const e = node.nodeType === 1 ? node : node.parentElement; return e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') : '?'; };
      const counts = {}, leaves = {}, kinds = {};
      const mo = new MutationObserver((records) => { for (const r of records) { const k = where(r.target) + ' ' + r.type + (r.attributeName ? ':' + r.attributeName : ''); counts[k] = (counts[k] || 0) + 1; const l = leaf(r.target) + ' ' + r.type + (r.attributeName ? ':' + r.attributeName : ''); leaves[l] = (leaves[l] || 0) + 1; } });
      mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
      let frames = 0, drew = false;
      const off = sc.postRender.addEventListener(() => { drew = true; });
      const was = v.useDefaultRenderLoop; v.useDefaultRenderLoop = false;
      const t0 = performance.now();
      while (performance.now() - t0 < 5000) { drew = false; v.resize(); v.render(); if (drew) frames++; await new Promise((r) => setTimeout(r, ${Math.round(1000 / HZ)})); }
      v.useDefaultRenderLoop = was; off(); mo.disconnect();
      const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => (c / frames).toFixed(1) + '/frame  ' + k);
      return { frames, byRegion: top(counts, 14), byElement: top(leaves, 26) };
    })()`, 60000);
    log(name, 'frames', out[name] && out[name].frames);
  }
  return out;
}
