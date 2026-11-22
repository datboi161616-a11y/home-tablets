// Which photos take their turn on the Home screen. Every photo in the album does, unless
// somebody took it out of the rotation in the Gallery (it stays in the album).
// Kept on this screen: { off: [photo id] }
const KEY = 'photos.rotation.v1';
let state = null;
function read() {
  if (!state) {
    try { state = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { state = null; }
    if (!state || !Array.isArray(state.off)) state = { off: [] };
  }
  return state;
}
function write() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage off: lasts until the page starts over */ }
  window.dispatchEvent(new Event('rotation-changed'));
}

/** Does this photo take its turn on Home? */
export const inRotation = (id) => read().off.indexOf(id) < 0;

/** Put a photo (or several: pass an array) into the rotation, or take it out. */
export function setRotation(ids, on) {
  const list = Array.isArray(ids) ? ids : [ids];
  const off = read().off.filter((id) => list.indexOf(id) < 0);
  state = { off: on ? off : off.concat(list) };
  write();
}

/** The photos of `album` (as getPhotos() gives them) that are in the rotation. */
export const rotationOf = (album) => album.filter((p) => inRotation(p.id));

/** Forget photos that are no longer in the album (pass the album's ids). */
export function tidyRotation(ids) {
  const have = new Set(ids);
  const off = read().off.filter((id) => have.has(id));
  if (off.length !== read().off.length) { state = { off }; write(); }
}

/** Calls cb() when the rotation changes. Returns an unsubscribe function. */
export function onRotationChanged(cb) {
  window.addEventListener('rotation-changed', cb);
  return () => window.removeEventListener('rotation-changed', cb);
}
