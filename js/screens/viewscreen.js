// Tom · Viewscreen night mode (Viewscreen.dc.html in the design)
// Big clock over a slowly drifting starfield. The stars are drawn on one canvas
// at ~20 fps (they move only 5-9 px a second), which keeps the low-end tablet cool.
// From 10 PM to 6 AM the whole screen is dimmed.

let raf = 0;
let clock = 0;

const W = 1280, H = 800;
const FRAME_MS = 50;

// Two layers like the design: small stars drift 640px per 120s, big ones per 70s.
function makeStars() {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const colors = ['#ffffff', '#ffffff', '#ffffff', '#99ffbb', '#ccddee', '#aabbcc'];
  const stars = [];
  for (let k = 0; k < 80; k++) {
    stars.push({ x: rand() * W, y: rand() * H, s: 2, v: 640 / 120, c: colors[Math.floor(rand() * colors.length)], a: 0.55 + rand() * 0.45 });
  }
  for (let k = 0; k < 14; k++) {
    stars.push({ x: rand() * W, y: rand() * H, s: 3, v: 640 / 70, c: '#ffffff', a: 1 });
  }
  return stars;
}

function clockVals() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const frac = (now - start) / (new Date(now.getFullYear() + 1, 0, 1) - start);
  return {
    stardate: ((now.getFullYear() - 2000) * 1000 + frac * 1000).toFixed(1),
    time: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
    night: now.getHours() >= 22 || now.getHours() < 6,
  };
}

export function mount(el) {
  const c = clockVals();
  el.innerHTML = `
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oxanium:wght@300;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
  <style>
    .vs-root{width:1280px;height:800px;box-sizing:border-box;background:#020308;color:#D7E6F0;font-family:'JetBrains Mono',monospace;position:relative;overflow:hidden}
    .vs-root a{color:#5CE1E6}
    .vs-dim{position:absolute;top:0;right:0;bottom:0;left:0;background:#000;opacity:0;pointer-events:none;transition:opacity 2s}
    .vs-root.vs-night .vs-dim{opacity:.45}
  </style>
  <div class="vs-root${c.night ? ' vs-night' : ''}">
    <canvas data-stars aria-hidden="true" style="position:absolute;left:0;top:0;width:1280px;height:800px"></canvas>
    <div style="position:absolute;top:0;right:0;bottom:0;left:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">
      <div data-time style="font-family:Oxanium,sans-serif;font-size:200px;font-weight:300;line-height:1;color:#C9D6E0;letter-spacing:4px">${c.time}</div>
      <div style="font-size:18px;letter-spacing:6px;color:#7FA6B8">STARDATE <span data-stardate>${c.stardate}</span> · ALL DECKS QUIET</div>
    </div>
    <div style="position:absolute;left:40px;bottom:32px;font-size:14px;letter-spacing:4px;color:#4F6E7E">NIGHT WATCH · SCREEN DIMMED 10 PM–6 AM</div>
    <div class="vs-dim"></div>
    <a href="#/bridge" style="position:absolute;right:32px;bottom:24px;min-height:44px;padding:12px 20px;box-sizing:border-box;border:1px solid #1E3A4A;font-size:14px;letter-spacing:3px;display:flex;align-items:center">RETURN TO CONSOLE</a>
  </div>`;

  const root = el.querySelector('.vs-root');
  clock = setInterval(() => {
    const v = clockVals();
    el.querySelector('[data-time]').textContent = v.time;
    el.querySelector('[data-stardate]').textContent = v.stardate;
    root.classList.toggle('vs-night', v.night);
  }, 10000);

  // ---- Starfield
  const canvas = el.querySelector('[data-stars]');
  const g = canvas.getContext('2d');
  // Match the real pixel size (the canvas is scaled 1.5x on the tablet) but never above 2x.
  const k = Math.min(2, Math.max(1, (el.getBoundingClientRect().width / W) * (window.devicePixelRatio || 1)));
  canvas.width = Math.round(W * k);
  canvas.height = Math.round(H * k);
  g.setTransform(k, 0, 0, k, 0, 0);
  const stars = makeStars();
  const t0 = performance.now();
  let last = 0;

  const draw = (now) => {
    raf = requestAnimationFrame(draw);
    if (now - last < FRAME_MS) return;
    last = now;
    const t = (now - t0) / 1000;
    g.clearRect(0, 0, W, H);
    for (const s of stars) {
      const x = (((s.x - s.v * t) % W) + W) % W;
      g.globalAlpha = s.a;
      g.fillStyle = s.c;
      g.fillRect(x, s.y, s.s, s.s);
    }
    g.globalAlpha = 1;
  };
  raf = requestAnimationFrame(draw);
}

export function unmount() {
  cancelAnimationFrame(raf);
  clearInterval(clock);
  raf = 0;
}
