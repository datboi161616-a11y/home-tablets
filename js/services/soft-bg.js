// Big soft backgrounds, painted once as a tiny picture.
//
// Measured on a real tablet (November 2026): a full-screen CSS gradient is the most
// expensive thing these screens draw. The menu's soft purple glow alone took about a
// quarter of a second every time the menu opened, and nothing could be tapped meanwhile.
// A tiny picture of the same gradient, stretched over the same box, looks the same (a soft
// gradient has no detail to lose) and costs almost nothing to draw.
//
// soften(host) looks at the big boxes of a screen that has just been built, and swaps each
// big gradient background it can read for such a picture. What it can't read exactly
// (sharp stripes, repeating patterns, pictures) it leaves alone, so nothing looks
// different: it only makes the same thing cheaper.

const MIN_AREA = 1280 * 800 * 0.25; // only boxes at least a quarter of the screen
const W = 96;                        // the picture's width; its height follows the box
const made = {};                     // css text + size -> data URL
let made_n = 0;

// ---- Reading the browser's own description of a gradient (getComputedStyle) ----
// e.g. "radial-gradient(1200px 700px at 50% 30%, rgb(74, 58, 94) 0%, rgb(35, 27, 48) 70%)"
//      "linear-gradient(135deg, rgb(43, 58, 103) 0%, rgb(122, 75, 120) 100%)"
// Split a list at the commas that are not inside brackets.
function splitTop(s) {
  const out = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push(s.slice(from, i).trim()); from = i + 1; }
  }
  out.push(s.slice(from).trim());
  return out.filter(Boolean);
}
const COLOR = /^(rgba?\([^)]*\)|transparent)\s*(.*)$/;
// A stop: { color, at } where at is a fraction of the gradient's length, or null (spread evenly).
function readStop(part, length) {
  const m = COLOR.exec(part);
  if (!m) return null;
  const color = m[1] === 'transparent' ? 'rgba(0, 0, 0, 0)' : m[1];
  const pos = m[2].trim();
  if (!pos) return { color, at: null };
  if (/\s/.test(pos)) return false; // two positions for one colour: a hard band
  if (/%$/.test(pos)) return { color, at: parseFloat(pos) / 100 };
  if (/px$/.test(pos)) return { color, at: parseFloat(pos) / length };
  return false;
}
function readStops(parts, length) {
  const stops = parts.map((p) => readStop(p, length));
  if (stops.some((s) => !s)) return null;
  // Unplaced stops are spread between their neighbours, as CSS does.
  if (stops[0].at == null) stops[0].at = 0;
  if (stops[stops.length - 1].at == null) stops[stops.length - 1].at = 1;
  for (let i = 1; i < stops.length - 1; i++) {
    if (stops[i].at != null) continue;
    let j = i;
    while (stops[j].at == null) j++;
    const a = stops[i - 1].at, b = stops[j].at, n = j - i + 1;
    for (let k = i; k < j; k++) stops[k].at = a + ((b - a) * (k - i + 1)) / n;
  }
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].at < stops[i - 1].at) stops[i].at = stops[i - 1].at;
    // Two stops at (almost) the same place make a sharp edge: a tiny picture would blur it.
    if (stops[i].at - stops[i - 1].at < 0.004 && stops[i].color !== stops[i - 1].color) return null;
  }
  return stops;
}
const pctOrPx = (v, of) => (/%$/.test(v) ? (parseFloat(v) / 100) * of : /px$/.test(v) ? parseFloat(v) : NaN);
const KEYWORD = { left: '0%', center: '50%', right: '100%', top: '0%', bottom: '100%' };

// Paint one gradient onto the canvas context; false when it can't be read exactly.
// w, h: the real box's size; sx, sy: picture pixels per box pixel.
function paint(g, css, w, h, sx, sy) {
  const lin = /^linear-gradient\((.*)\)$/.exec(css);
  const rad = /^radial-gradient\((.*)\)$/.exec(css);
  if (!lin && !rad) return false;
  const parts = splitTop((lin || rad)[1]);
  if (lin) {
    let angle = 180; // CSS default: to bottom
    if (!COLOR.test(parts[0])) {
      const a = parts.shift();
      const deg = /^(-?[\d.]+)deg$/.exec(a);
      const to = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 }[a];
      if (deg) angle = parseFloat(deg[1]); else if (to != null) angle = to; else return false;
    }
    const r = (angle * Math.PI) / 180;
    const dx = Math.sin(r), dy = -Math.cos(r);
    // CSS: the line is long enough that the corners get the first and last colours.
    const len = Math.abs(w * dx) + Math.abs(h * dy);
    const stops = readStops(parts, len);
    if (!stops) return false;
    const cx = w / 2, cy = h / 2;
    const grad = g.createLinearGradient((cx - (dx * len) / 2) * sx, (cy - (dy * len) / 2) * sy, (cx + (dx * len) / 2) * sx, (cy + (dy * len) / 2) * sy);
    stops.forEach((s) => grad.addColorStop(Math.max(0, Math.min(1, s.at)), s.color));
    g.fillStyle = grad;
    g.fillRect(0, 0, w * sx, h * sy);
    return true;
  }
  // radial: "[shape/size] [at x y], stops…"
  let shape = 'ellipse', rx = null, ry = null, px = w / 2, py = h / 2, extent = 'farthest-corner';
  if (!COLOR.test(parts[0])) {
    const head = parts.shift();
    const at = /\bat\s+(\S+)\s+(\S+)/.exec(head);
    if (at) {
      px = pctOrPx(KEYWORD[at[1]] || at[1], w);
      py = pctOrPx(KEYWORD[at[2]] || at[2], h);
      if (isNaN(px) || isNaN(py)) return false;
    }
    const size = head.replace(/\bat\s+\S+\s+\S+/, '').trim();
    if (/circle/.test(size)) shape = 'circle';
    const words = size.replace(/\b(circle|ellipse)\b/, '').trim();
    if (/^(closest|farthest)-(side|corner)$/.test(words)) extent = words;
    else if (words) {
      const v = words.split(/\s+/);
      rx = pctOrPx(v[0], w);
      ry = v[1] ? pctOrPx(v[1], h) : rx;
      if (isNaN(rx) || isNaN(ry)) return false;
    }
  }
  if (rx == null) {
    const sides = [px, w - px, py, h - py].map(Math.abs);
    const cl = { x: Math.min(sides[0], sides[1]), y: Math.min(sides[2], sides[3]) };
    const fa = { x: Math.max(sides[0], sides[1]), y: Math.max(sides[2], sides[3]) };
    const pick = extent.indexOf('closest') === 0 ? cl : fa;
    if (/side$/.test(extent)) { rx = pick.x; ry = pick.y; } else { rx = pick.x * Math.SQRT2; ry = pick.y * Math.SQRT2; }
    if (shape === 'circle') { const r = /side$/.test(extent) ? Math.min(pick.x, pick.y) : Math.hypot(pick.x, pick.y); rx = ry = r; }
  }
  if (!(rx > 0) || !(ry > 0)) return false;
  const stops = readStops(parts, rx);
  if (!stops) return false;
  // An ellipse is a circle stretched: draw a circle of radius rx in a squashed space.
  g.save();
  g.setTransform(sx, 0, 0, sy * (ry / rx), 0, 0);
  const grad = g.createRadialGradient(px, py * (rx / ry), 0, px, py * (rx / ry), rx);
  stops.forEach((s) => grad.addColorStop(Math.max(0, Math.min(1, s.at)), s.color));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h * (rx / ry));
  g.restore();
  return true;
}

// The picture for a box's whole background (all its gradient layers, and its colour).
function pictureFor(bgImage, bgColor, w, h) {
  const H = Math.max(8, Math.round((W * h) / w));
  const key = `${bgImage}|${bgColor}|${Math.round(w)}x${Math.round(h)}`;
  if (made[key] !== undefined) return made[key];
  let url = '';
  try {
    const layers = splitTop(bgImage);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (bgColor && !/rgba\([^)]*,\s*0\)$/.test(bgColor)) { g.fillStyle = bgColor; g.fillRect(0, 0, W, H); }
    // The first layer is on top: paint from the last.
    let ok = true;
    for (let i = layers.length - 1; i >= 0 && ok; i--) ok = paint(g, layers[i], w, h, W / w, H / h);
    url = ok ? c.toDataURL('image/png') : '';
  } catch (e) { url = ''; }
  if (made_n > 200) { Object.keys(made).forEach((k) => { delete made[k]; }); made_n = 0; }
  made[key] = url;
  made_n++;
  return url;
}

/** Swap the big gradient backgrounds inside `host` (a screen just built) for tiny pictures. */
export function soften(host) {
  if (window.__noSoft) return; // (the look-the-same test switches it off)
  if (!host || !document.createElement('canvas').getContext) return;
  const scale = host.getBoundingClientRect().width / (host.offsetWidth || 1) || 1;
  // Only the outer few levels: the page, its main panels.
  const seen = [];
  const walk = (el, depth) => {
    for (let i = 0; i < el.children.length; i++) {
      const c = el.children[i];
      if (c.tagName === 'STYLE' || c.tagName === 'SCRIPT' || c.tagName === 'svg' || c.tagName === 'SVG') continue;
      seen.push(c);
      if (depth < 3) walk(c, depth + 1);
    }
  };
  walk(host, 0);
  const big = [];
  for (let i = 0; i < seen.length; i++) {
    const r = seen[i].getBoundingClientRect();
    const w = r.width / scale, h = r.height / scale;
    if (w * h >= MIN_AREA) big.push([seen[i], w, h]);
  }
  for (let i = 0; i < big.length; i++) {
    const [el, w, h] = big[i];
    const cs = getComputedStyle(el);
    const img = cs.backgroundImage;
    if (!img || img === 'none' || img.indexOf('gradient(') < 0 || img.indexOf('url(') >= 0) continue;
    if (/repeating-|conic-/.test(img)) continue;
    // Only a background that covers the box once, as plain gradients do.
    if (cs.backgroundRepeat.indexOf('no-repeat') < 0 && cs.backgroundSize !== 'auto' && cs.backgroundSize !== 'auto auto') continue;
    if (cs.backgroundSize !== 'auto' && cs.backgroundSize !== 'auto auto' && cs.backgroundSize !== '100% 100%') continue;
    if (cs.backgroundPosition !== '0% 0%') continue;
    const url = pictureFor(img, cs.backgroundColor, w, h);
    if (!url) continue;
    el.style.backgroundImage = `url(${url})`;
    el.style.backgroundSize = '100% 100%';
    el.style.backgroundRepeat = 'no-repeat';
  }
}
