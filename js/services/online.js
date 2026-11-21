// Is the site itself answering right now?
//
// Asking with HEAD matters: sw.js answers GET requests from the copy kept on the
// device when the Wi-Fi is down, but leaves every other kind of request alone. So
// this is true only when the real site replied, never because of the kept copy.
export function siteAnswers() {
  try {
    // (No time limit on the oldest WebViews, which can't cancel a request.)
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined;
    return fetch('./version.json', { method: 'HEAD', cache: 'no-store', signal }).then((res) => res.ok, () => false);
  } catch (err) {
    return Promise.resolve(false);
  }
}
