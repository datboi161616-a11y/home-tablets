// Line icons for weather, drawn on a 24x24 grid.
const P = {
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  cloud: '<path d="M17.5 18H7a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10.5a3.75 3.75 0 0 1-1.5 7.5z"/>',
  partly: '<path d="M8 3v1.5M3.5 7.5H2M4.8 4.3l1 1M12.7 5.3l-1 1"/><path d="M5.3 10.5A3.5 3.5 0 0 1 11.6 8"/><path d="M18 20H8.5a4 4 0 1 1 .8-7.9 5 5 0 0 1 9.2 1.9A3 3 0 0 1 18 20z"/>',
  rain: '<path d="M17.5 15H7a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 7.5a3.75 3.75 0 0 1-1.5 7.5z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
  snow: '<path d="M17.5 15H7a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 7.5a3.75 3.75 0 0 1-1.5 7.5z"/><path d="M8 19v.01M12 19v.01M16 19v.01M10 22v.01M14 22v.01"/>',
  storm: '<path d="M17.5 15H7a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 7.5a3.75 3.75 0 0 1-1.5 7.5z"/><path d="M13 15l-3 4h4l-3 4"/>',
  fog: '<path d="M17.5 13H7a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 5.5a3.75 3.75 0 0 1-1.5 7.5z"/><path d="M4 17h16M6 21h12"/>',
};

export function icon(name, size = 24, color = 'currentColor', stroke = 1.5) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}"
    stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.cloud}</svg>`;
}
