// Driver for site-drive.mjs: what on each screen is costly for the tablet to PAINT (it has
// no graphics chip: every pixel of every change is drawn by its slow processor). Per screen:
//  - animations running while it opens (each frame of one repaints or recomposites the
//    screen while the new screen is still being drawn), and any that never stop;
//  - soft shadows (box-shadow / text-shadow / drop-shadow), weighted by area x blur: the
//    costliest thing to draw in software;
//  - see-through groups (opacity < 1 on an element with children), CSS filters, blend modes;
//  - big gradients still drawn by CSS (soft-bg.js turns most into a small picture);
//  - pictures drawn much larger or smaller than their own size (resampled every paint).
// It changes nothing. ROUTES overrides the list; STUB seeds the page (see try.mjs).
//   node tools/sim/site-drive.mjs http://localhost:5173/ tools/sim/paint-audit.mjs
const FAMILY = 'home,launcher,photos,recipes,recipes/dinner,plan,shopping,timers,calendar,forecast,messages,night,convert,settings,budget,bills,chores,manual,trips,datenight,question,photoweek,care,apps,addphotos,camera,myrecipe,whatsnew';

const INPAGE = `
window.__pa = (() => {
  const where = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') + (el.getAttributeNames ? el.getAttributeNames().filter((a) => a.startsWith('data-')).slice(0, 1).map((a) => '[' + a + ']').join('') : '');
  function anims() {
    const list = document.getAnimations ? document.getAnimations() : [];
    return list.filter((a) => a.playState === 'running').map((a) => {
      const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : {};
      const kf = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [];
      const props = [...new Set(kf.flatMap((k) => Object.keys(k).filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p))))];
      const el = a.effect && a.effect.target;
      return { name: a.animationName || a.transitionProperty || '?', props: props.join(','), ms: t.duration, endless: t.iterations === Infinity, el: el ? where(el) : '' };
    });
  }
  const blurOf = (s) => { let m = 0; (s.match(/(-?[\\d.]+)px\\s+(-?[\\d.]+)px\\s+([\\d.]+)px/g) || []).forEach((p) => { const b = +p.split(/\\s+/)[2].replace('px', ''); if (b > m) m = b; }); return m; };
  function paint() {
    const out = { shadows: [], see: [], filters: [], grads: [], imgs: [], textShadow: 0, svgNodes: 0 };
    const all = document.querySelectorAll('#screen *, #screen');
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.right < 0 || r.top > 800 || r.left > 1280) continue;
      const area = Math.min(r.width, 1280) * Math.min(r.height, 800);
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden') continue;
      if (s.boxShadow !== 'none') { const b = blurOf(s.boxShadow); if (b >= 8) out.shadows.push({ el: where(el), blur: b, area: Math.round(area), cost: Math.round(area * b / 1000) }); }
      if (s.textShadow !== 'none') out.textShadow++;
      if (+s.opacity < 1 && el.children.length) out.see.push({ el: where(el), o: s.opacity, area: Math.round(area) });
      if (s.filter !== 'none' || (s.backdropFilter && s.backdropFilter !== 'none') || s.mixBlendMode !== 'normal') out.filters.push({ el: where(el), f: s.filter + ' ' + s.mixBlendMode });
      if (/gradient/.test(s.backgroundImage) && area > 200000) out.grads.push({ el: where(el), area: Math.round(area), n: (s.backgroundImage.match(/gradient/g) || []).length });
      if (el.tagName === 'IMG' && el.naturalWidth) { const k = el.naturalWidth / (r.width * 1.5); if (k > 2.5) out.imgs.push({ el: where(el), natural: el.naturalWidth + 'x' + el.naturalHeight, shown: Math.round(r.width) + 'x' + Math.round(r.height) }); }
      if (el.namespaceURI === 'http://www.w3.org/2000/svg') out.svgNodes++;
    }
    out.shadows.sort((a, b) => b.cost - a.cost);
    out.shadowCost = out.shadows.reduce((a, x) => a + x.cost, 0);
    return out;
  }
  return { anims, paint };
})();
'ok'`;

export default async function drive({ ev, sleep, log }) {
  const routes = (process.env.ROUTES || FAMILY).split(',');
  await ev(INPAGE);
  const out = [];
  for (const route of routes) {
    await ev(`(location.hash = '#/${route}', 'ok')`);
    await sleep(120);
    const opening = await ev('window.__pa.anims()');
    await sleep(2500);
    const still = await ev('window.__pa.anims()');
    const p = await ev('window.__pa.paint()');
    const rec = { route, openingAnims: opening.length, opening: opening.slice(0, 6), endless: still.filter((a) => a.endless), shadowCost: p.shadowCost, shadows: p.shadows.slice(0, 5), shadowCount: p.shadows.length, see: p.see.slice(0, 4), seeCount: p.see.length, filters: p.filters.slice(0, 4), grads: p.grads, imgs: p.imgs.slice(0, 4), textShadow: p.textShadow, svgNodes: p.svgNodes };
    out.push(rec);
    log(route, 'opening anims', rec.openingAnims, 'endless', rec.endless.length, 'shadow', rec.shadowCost, `(${rec.shadowCount})`, 'see-through', rec.seeCount, 'filters', p.filters.length, 'grads', p.grads.length, 'big imgs', p.imgs.length, 'text-shadow', p.textShadow, 'svg', p.svgNodes);
  }
  return out;
}
