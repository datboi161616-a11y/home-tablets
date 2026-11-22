// Where "back" leads from the screens that can be reached from both the Home dashboard
// and the Menu (Calendar, Weather, Messages, Recipes, Timers...): to whichever of the two
// the person came from. It used to be fixed per screen, so tapping the weather on Home and
// then "back" landed on the Menu.
let hub = 'home';

/** app.js calls this with the screen that is being left. */
export function cameFrom(screen) {
  if (screen === 'home' || screen === 'launcher') hub = screen;
}

export const backHref = () => `#/${hub}`;
export const backLabel = () => (hub === 'launcher' ? '← Menu' : '← Home');
