// #/welcome: starts the hands-on tutorial (services/tutorial.js) on top of the real
// home screen. A brand-new screen lands here until the tutorial is finished or skipped;
// "Tour" on the App menu (TOUR on Tom's flight deck) brings it back.
import { profile } from '../config.js';
import { startTutorial } from '../services/tutorial.js';

export function mount(el, ctx) {
  el.style.background = profile === 'tom' ? '#05070D' : 'var(--bg)';
  startTutorial();
  const home = (ctx && ctx.homeRoute) || (profile === 'tom' ? 'bridge' : 'home');
  // Show the real home screen underneath the welcome card.
  // (A new screen arrives here from #/home itself, so setting the same address again
  // wouldn't load anything: ask the router to load it.)
  setTimeout(() => {
    if (location.hash === `#/${home}`) window.dispatchEvent(new Event('hashchange'));
    else location.hash = `#/${home}`;
  }, 0);
}

export function unmount() {}
