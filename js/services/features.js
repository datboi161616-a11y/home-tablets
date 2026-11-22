// Optional features you switch on or off per tablet from your admin dashboard.
// Defaults: everything on for Family tablets; Tom's tablet keeps its original
// space & flight focus, so the extras start hidden there.
// (Android starts the page over when a switch changes, so reading them once is enough.)
import { profile } from '../config.js';

const DEFAULTS = {
  family: { apps: true, camera: true },
  tom: { apps: false, camera: false },
};

let cached = null;

// A switch saved as true/false, 1/0 or "true"/"false"/"on"/"off": anything else is ignored
// (the default stays), so a stray "false" string can never switch a feature ON.
function asSwitch(v) {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === 0) return !!v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === 'on' || s === '1') return true;
    if (s === 'false' || s === 'off' || s === '0') return false;
  }
  return undefined;
}

function load() {
  const out = Object.assign({}, DEFAULTS[profile] || DEFAULTS.family);
  const n = window.TabletNative;
  try {
    if (n && n.features) {
      const saved = JSON.parse(n.features());
      if (saved && typeof saved === 'object') {
        Object.keys(saved).forEach((k) => { const v = asSwitch(saved[k]); if (v !== undefined) out[k] = v; });
      }
    }
  } catch (e) { /* not on a tablet, or nothing readable saved: the defaults */ }
  // On a real screen whose Android side can't list or open apps (an older launcher), an
  // Apps tile would only lead to an empty page: leave it out until the launcher is updated.
  if (n && !n.appList) out.apps = false;
  return out;
}

/** Is this optional feature switched on for this tablet? ('apps' | 'camera') */
export function feature(name) {
  if (!cached) cached = load();
  return !!cached[name];
}
