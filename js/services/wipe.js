// "Wipe the screen": a kitchen screen gets splashed and greasy, and wiping it taps
// everything the cloth passes over. This switches touches off for half a minute, on a
// dark screen (smears show best on dark), and comes back by itself.
let timer = null;

export function wipeScreen(seconds = 30) {
  if (timer) return;
  const cover = document.createElement('div');
  cover.setAttribute('data-wipe', '');
  cover.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:1000;background:#0B0E13;color:#fff;'
    + 'display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:Inter,sans-serif;'
    + '-webkit-user-select:none;user-select:none;touch-action:none';
  cover.innerHTML = `
    <div style="font-family:Outfit,Inter,sans-serif;font-size:64px;font-weight:500;letter-spacing:-1px">Wipe away</div>
    <div style="font-size:24px;color:#B8C0CC;margin-top:14px">Touches are switched off.</div>
    <div data-left style="font-size:120px;font-weight:300;line-height:1;margin-top:40px;font-variant-numeric:tabular-nums"></div>
    <div style="font-size:20px;color:#8A93A3;margin-top:16px">Back by itself</div>`;
  // Nothing underneath hears about these touches, and nothing scrolls.
  const swallow = (e) => { e.stopPropagation(); if (e.cancelable) e.preventDefault(); };
  ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'contextmenu']
    .forEach((type) => cover.addEventListener(type, swallow, { passive: false }));
  document.body.appendChild(cover);

  const until = Date.now() + seconds * 1000;
  const left = cover.querySelector('[data-left]');
  const tick = () => {
    const s = Math.ceil((until - Date.now()) / 1000);
    if (s <= 0) { clearInterval(timer); timer = null; cover.remove(); return; }
    if (left.textContent !== String(s)) left.textContent = String(s);
  };
  tick();
  timer = setInterval(tick, 250);
}

/** Is the screen being wiped right now? (Nothing should change underneath meanwhile.) */
export const wiping = () => !!timer;
