// Optional features you switch on or off per tablet from your admin dashboard.
// Defaults: everything on for Family tablets; Tom's tablet keeps its original
// space & flight focus, so the extras start hidden there.
import { profile } from '../config.js';

const DEFAULTS = {
  family: { apps: true, camera: true },
  tom: { apps: false, camera: false },
};

let cached = null;

function load() {
  const defaults = DEFAULTS[profile] || DEFAULTS.family;
  try {
    const n = window.TabletNative;
    if (n && n.features) return { ...defaults, ...JSON.parse(n.features()) };
  } catch { /* not on a tablet */ }
  return defaults;
}

/** Is this optional feature switched on for this tablet? ('apps' | 'camera') */
export function feature(name) {
  if (!cached) cached = load();
  return !!cached[name];
}
