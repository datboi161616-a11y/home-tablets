// Illustrations for the kitchen screens: flat, drawn in code, in the app's own colors.
// Drawn here (not photos) so they work offline, load instantly and stay sharp at any size.
// Every function returns an <svg> string. Pass a CSS width/height; the drawing scales to fit.
//
// Style rules (keep new art matching):
//  - Flat shapes, no gradients, no outlines except the odd 2-6px detail stroke.
//  - Palette below only. One soft "halo" circle behind the subject is the house look.
//  - Decorative: always aria-hidden.

export const C = {
  ink: '#1D2430', ink2: '#4A5363', ink3: '#3A4558', bg: '#ECEEF0',
  accent: '#C2491F', accentDeep: '#A83A16', accentSoft: '#CF5A30', peach: '#F6D9C8',
  gold: '#F2B33D', sun: '#F6C24A', mustard: '#C98A1E', cream: '#F6E3C8', ivory: '#F3E6C8',
  green: '#3E7D6E', greenDeep: '#2F6558', greenSoft: '#5E9B7F', mint: '#D6E6E1',
  plum: '#A84E72', pink: '#E9A3BC', blue: '#3B7BC0', sky: '#BFD9EA', cloud: '#B7C3D0', cloudDark: '#7F8EA0',
};

const svg = (vb, body, style = '') =>
  `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" style="display:block;${style}">${body}</svg>`;

// ---------- Small pieces ----------
const house = (x, y, s = 1, wall = '#FFFFFF', lit = C.gold) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M0 40V16L24 0l24 16v24z" fill="${wall}"/>
  <path d="M-6 18L24-4l30 22" fill="none" stroke="${C.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="8" y="20" width="10" height="10" fill="${lit}"/><rect x="28" y="22" width="11" height="18" fill="${C.accent}"/></g>`;
const tree = (x, y, h = 50, c = C.green) => `<path d="M${x} ${y}l${h * 0.36} ${-h}l${h * 0.36} ${h}z" fill="${c}"/>`;
const steam = (xs, y, c = C.peach) => xs.map((x) => `<path d="M${x} ${y}q-10 14 0 26q10 12 0 26" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity="0.85"/>`).join('');
const cloudShape = (x, y, s, c) => `<path transform="translate(${x} ${y}) scale(${s})" d="M6 40a14 14 0 0 1 6-27a20 20 0 0 1 38 3a13 13 0 0 1 4 24z" fill="${c}"/>`;

// ---------- App menu tiles (285 x 170 scenes) ----------
const TILE = '0 0 285 170';
export const tileArt = {
  home: () => svg(TILE, `
    <circle cx="236" cy="40" r="16" fill="${C.ivory}"/><circle cx="243" cy="35" r="14" fill="${C.ink}"/>
    <g fill="${C.ivory}"><circle cx="60" cy="30" r="2"/><circle cx="120" cy="22" r="1.6"/><circle cx="180" cy="48" r="1.6"/><circle cx="30" cy="70" r="1.4"/></g>
    <path d="M0 150Q70 128 150 142T285 136V170H0z" fill="#2B3445"/>
    <path d="M92 150V104l50-38 50 38v46z" fill="${C.ink3}"/>
    <path d="M82 108l60-48 60 48" fill="none" stroke="${C.accent}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="106" y="112" width="26" height="24" rx="4" fill="${C.gold}"/><rect x="152" y="112" width="26" height="24" rx="4" fill="${C.gold}"/>
    <path d="M119 112v24M106 124h26M165 112v24M152 124h26" stroke="${C.ink3}" stroke-width="2.5"/>`),
  photos: () => svg(TILE, `<rect width="285" height="170" fill="#FBF3EE"/>
    <g transform="rotate(-8 120 92)"><rect x="62" y="34" width="112" height="104" rx="6" fill="#FFF" stroke="#E6D5CB" stroke-width="2"/><rect x="72" y="44" width="92" height="66" rx="3" fill="${C.peach}"/><circle cx="146" cy="62" r="9" fill="${C.gold}"/><path d="M72 110l30-32 20 18 14-12 28 26z" fill="${C.accent}" opacity=".85"/></g>
    <g transform="rotate(7 175 92)"><rect x="120" y="40" width="112" height="104" rx="6" fill="#FFF" stroke="#E6D5CB" stroke-width="2"/><rect x="130" y="50" width="92" height="66" rx="3" fill="${C.mint}"/><circle cx="160" cy="76" r="12" fill="${C.green}"/><path d="M142 116q18-24 36 0z" fill="${C.green}"/><circle cx="196" cy="80" r="10" fill="${C.mustard}"/><path d="M181 116q15-20 31 0z" fill="${C.mustard}"/></g>`),
  calendar: () => svg(TILE, `<rect width="285" height="170" fill="#F3F1EC"/>
    <rect x="78" y="28" width="130" height="122" rx="12" fill="#FFF" stroke="#DCD6CB" stroke-width="2"/>
    <path d="M78 40a12 12 0 0 1 12-12h106a12 12 0 0 1 12 12v16H78z" fill="${C.accent}"/>
    <rect x="104" y="20" width="6" height="18" rx="3" fill="${C.ink}"/><rect x="176" y="20" width="6" height="18" rx="3" fill="${C.ink}"/>
    <g fill="#D9D3C8">${[94, 118, 142, 166].map((x) => [70, 92, 114].map((y) => (x === 142 && y === 92) ? '' : `<rect x="${x}" y="${y}" width="14" height="10" rx="2"/>`).join('')).join('')}</g>
    <circle cx="149" cy="97" r="13" fill="none" stroke="${C.accent}" stroke-width="3.5"/>
    <path d="M214 110q16-6 22-22q4 14-8 26z" fill="${C.mustard}"/><path d="M222 120q18 2 28-10q-2 16-20 20z" fill="${C.accent}"/>`),
  weather: (kind = 'sun', night = false) => svg(TILE, `<rect width="285" height="170" fill="${night ? '#DDE3EE' : '#EAF1F6'}"/>
    ${kind === 'sun' || kind === 'partly' ? (night
      ? `<circle cx="112" cy="70" r="26" fill="${C.ivory}"/><circle cx="124" cy="62" r="22" fill="#DDE3EE"/>`
      : `<g stroke="${C.gold}" stroke-width="6" stroke-linecap="round"><path d="M112 24v14M72 64H58M84 36l10 10M140 36l-10 10"/></g><circle cx="112" cy="70" r="26" fill="${C.gold}"/>`) : ''}
    ${kind !== 'sun' ? `<path d="M104 128a26 26 0 0 1 22-40a34 34 0 0 1 64 8a22 22 0 0 1 6 44H110a20 20 0 0 1-6-12z" fill="${kind === 'storm' || kind === 'rain' ? C.cloud : '#FFF'}"/>` : `<path d="M150 124a20 20 0 0 1 17-31a26 26 0 0 1 49 6a17 17 0 0 1 5 34h-66a15 15 0 0 1-5-9z" fill="#FFF"/>`}
    ${kind === 'rain' ? `<g stroke="${C.blue}" stroke-width="5" stroke-linecap="round"><path d="M130 146l-5 12M155 146l-5 12M180 146l-5 12"/></g>` : ''}
    ${kind === 'snow' ? `<g fill="#FFF" stroke="${C.cloud}" stroke-width="2"><circle cx="128" cy="152" r="5"/><circle cx="154" cy="158" r="5"/><circle cx="180" cy="152" r="5"/></g>` : ''}
    ${kind === 'storm' ? `<path d="M156 140l-12 18h12l-8 14" fill="none" stroke="${C.gold}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${kind === 'fog' ? `<g stroke="#C9D5DF" stroke-width="6" stroke-linecap="round"><path d="M70 146h150M96 160h100"/></g>` : ''}
    ${kind !== 'rain' && kind !== 'snow' && kind !== 'storm' && kind !== 'fog' ? `<path d="M0 156q90-16 170-4t115-6v24H0z" fill="#CFDDE6"/>` : ''}`),
  recipes: () => svg(TILE, `<circle cx="142" cy="108" r="78" fill="${C.accentSoft}"/>
    ${steam([118, 146, 174], 26)}
    <ellipse cx="146" cy="98" rx="78" ry="12" fill="${C.cream}"/>
    <path d="M68 98h156q-6 52-78 56q-72-4-78-56z" fill="#FFF"/><path d="M76 112h140" stroke="${C.peach}" stroke-width="5"/>
    <circle cx="120" cy="94" r="7" fill="${C.gold}"/><circle cx="160" cy="92" r="6" fill="${C.green}"/><circle cx="178" cy="98" r="5" fill="${C.accent}"/>
    <path d="M200 70l36 34" stroke="${C.ivory}" stroke-width="6" stroke-linecap="round"/>`),
  messages: () => svg(TILE, `<rect width="285" height="170" fill="#FBF6E9"/>
    <g transform="rotate(-6 110 84)"><rect x="56" y="38" width="104" height="96" rx="4" fill="#FCE7A6"/><path d="M72 66h70M72 84h64M72 102h48" stroke="#C9A64A" stroke-width="5" stroke-linecap="round"/></g>
    <g transform="rotate(5 186 90)"><rect x="134" y="48" width="104" height="96" rx="4" fill="${C.peach}"/><path d="M150 76h70M150 94h60" stroke="#C98A6E" stroke-width="5" stroke-linecap="round"/><path d="M186 124c-10-8-16-12-16-19a8 8 0 0 1 16-3a8 8 0 0 1 16 3c0 7-6 11-16 19z" fill="${C.accent}"/></g>
    <circle cx="108" cy="42" r="8" fill="${C.accent}"/><circle cx="186" cy="52" r="8" fill="${C.green}"/>`),
  grocery: () => svg(TILE, `<rect width="285" height="170" fill="#EEF4EF"/>
    <path d="M128 70q-10-40-16-50" stroke="${C.green}" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="104" cy="44" rx="14" ry="26" transform="rotate(-20 104 44)" fill="${C.greenSoft}"/><ellipse cx="128" cy="40" rx="12" ry="24" transform="rotate(14 128 40)" fill="${C.green}"/>
    <rect x="150" y="18" width="18" height="74" rx="9" transform="rotate(18 159 55)" fill="#E2B067"/>
    <path d="M176 40l20 30-20-4z" fill="#E5772F"/><path d="M176 40q-6-10 2-16M180 40q2-12 10-12" stroke="${C.green}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <path d="M84 72h118l-10 80H94z" fill="#D9B98C"/><path d="M84 72h118l-4 14H88z" fill="#C9A577"/><path d="M120 112h46" stroke="#B8945F" stroke-width="5" stroke-linecap="round"/>`),
  apps: () => svg(TILE, `<rect width="285" height="170" fill="#F1EFF5"/>
    <rect x="62" y="42" width="72" height="72" rx="18" fill="${C.accent}"/><path d="M88 62l26 16-26 16z" fill="#FFF"/>
    <rect x="148" y="42" width="72" height="72" rx="18" fill="${C.green}"/><path d="M176 96V64l22-6v30" stroke="#FFF" stroke-width="5" fill="none" stroke-linejoin="round"/><circle cx="172" cy="96" r="6" fill="#FFF"/><circle cx="194" cy="90" r="6" fill="#FFF"/>
    <rect x="105" y="122" width="34" height="34" rx="10" fill="${C.mustard}"/><rect x="146" y="122" width="34" height="34" rx="10" fill="${C.ink}"/><rect x="187" y="122" width="34" height="34" rx="10" fill="${C.plum}"/>`),
  camera: () => svg(TILE, `<rect width="285" height="170" fill="#EEF0F4"/>
    <rect x="72" y="52" width="142" height="96" rx="18" fill="${C.ink}"/><path d="M110 52l10-16h46l10 16z" fill="${C.ink}"/>
    <circle cx="143" cy="100" r="32" fill="${C.ink3}"/><circle cx="143" cy="100" r="22" fill="#5B6FA8"/><circle cx="135" cy="92" r="7" fill="#C9D3F0"/>
    <circle cx="192" cy="70" r="6" fill="${C.accent}"/>`),
  timers: () => svg(TILE, `<rect width="285" height="170" fill="#FBF3EE"/>
    <circle cx="143" cy="96" r="54" fill="${C.accent}"/><circle cx="143" cy="96" r="42" fill="#FFF"/>
    <rect x="133" y="30" width="20" height="14" rx="4" fill="${C.ink}"/>
    <path d="M143 96V66M143 96l18 12" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/><circle cx="143" cy="96" r="6" fill="${C.accent}"/>`),
  plan: () => svg(TILE, `<rect width="285" height="170" fill="#EEF4EF"/>
    ${[56, 116, 176].map((x, i) => `<ellipse cx="${x + 26}" cy="104" rx="30" ry="30" fill="#FFF"/><ellipse cx="${x + 26}" cy="104" rx="20" ry="20" fill="${[C.cream, C.mint, C.peach][i]}"/>`).join('')}
    <circle cx="80" cy="100" r="6" fill="${C.gold}"/><circle cx="142" cy="104" r="7" fill="${C.green}"/><circle cx="204" cy="100" r="6" fill="${C.accent}"/>`),
};

// ---------- Food (meal / dish scenes, 386 x 210) ----------
const FOOD = '0 0 386 210';
export const foodArt = {
  breakfast: (halo = '#D49A33', shadow = '#B37714') => svg(FOOD, `<circle cx="193" cy="120" r="96" fill="${halo}"/>
    <ellipse cx="193" cy="176" rx="132" ry="18" fill="${shadow}"/><ellipse cx="193" cy="170" rx="120" ry="16" fill="#FFF"/>
    <ellipse cx="193" cy="156" rx="92" ry="16" fill="#E9B868"/><rect x="101" y="142" width="184" height="14" fill="#E9B868"/><ellipse cx="193" cy="142" rx="92" ry="16" fill="#F3CE87"/>
    <rect x="105" y="122" width="176" height="14" fill="#E3AD5A"/><ellipse cx="193" cy="122" rx="88" ry="15" fill="#F3CE87"/>
    <rect x="109" y="103" width="168" height="14" fill="#E3AD5A"/><ellipse cx="193" cy="103" rx="84" ry="14" fill="#F6D899"/>
    <path d="M120 104q10 24 26 8q14 24 30-2q20 30 38-2q18 24 36-2q12 14 18-4q-38-16-75-14q-43 0-73 16z" fill="#8A4B12"/>
    <rect x="176" y="80" width="34" height="18" rx="4" fill="#FCEFB8"/>
    <circle cx="300" cy="74" r="10" fill="${C.accent}"/><circle cx="318" cy="88" r="8" fill="${C.accentDeep}"/><path d="M300 64q4-8 10-6" stroke="${C.green}" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  lunch: (halo = '#478A7A', shadow = '#2F6558') => svg(FOOD, `<circle cx="193" cy="120" r="96" fill="${halo}"/>
    <ellipse cx="193" cy="178" rx="132" ry="16" fill="${shadow}"/><ellipse cx="193" cy="172" rx="120" ry="14" fill="#FFF"/>
    <path d="M96 160q4-14 24-14h146q20 0 24 14z" fill="#D9A35B"/>
    <path d="M92 146q28-14 58-2q30-14 60 0q30-14 60 0q16-4 24 2l-4 8H96z" fill="#7BBE6A"/>
    <rect x="100" y="132" width="186" height="12" rx="4" fill="#E4583A"/><rect x="104" y="122" width="178" height="12" rx="4" fill="#F2C94C"/>
    <path d="M98 122q2-46 95-50q93 4 95 50z" fill="#E7B46A"/><path d="M120 98q73-18 146 0" fill="none" stroke="#C98A3E" stroke-width="3" stroke-linecap="round"/>
    <g fill="#FFF3D6"><ellipse cx="150" cy="88" rx="4" ry="2"/><ellipse cx="188" cy="82" rx="4" ry="2"/><ellipse cx="226" cy="86" rx="4" ry="2"/><ellipse cx="170" cy="100" rx="4" ry="2"/><ellipse cx="246" cy="98" rx="4" ry="2"/></g>
    <path d="M193 54v68" stroke="#C9B48A" stroke-width="3"/><path d="M193 54l14 6-14 6z" fill="${C.accent}"/>`),
  dinner: (halo = '#273041', shadow = '#141A23') => svg(FOOD, `<circle cx="193" cy="120" r="96" fill="${halo}"/>
    ${steam([150, 193, 236], 26, '#5A6577')}
    <ellipse cx="193" cy="176" rx="132" ry="18" fill="${shadow}"/>
    <path d="M92 104h202v46q0 26-26 26H118q-26 0-26-26z" fill="${C.accent}"/><rect x="92" y="104" width="202" height="12" fill="${C.accentDeep}"/>
    <rect x="66" y="112" width="30" height="10" rx="5" fill="${C.accentDeep}"/><rect x="290" y="112" width="30" height="10" rx="5" fill="${C.accentDeep}"/>
    <ellipse cx="193" cy="104" rx="100" ry="14" fill="#E4583A"/><ellipse cx="193" cy="104" rx="88" ry="10" fill="#F2C76A"/>
    <circle cx="160" cy="102" r="6" fill="${C.green}"/><circle cx="202" cy="100" r="5" fill="${C.accent}"/><circle cx="226" cy="104" r="6" fill="${C.green}"/><circle cx="182" cy="106" r="4" fill="#FFF"/>`),
  dessert: (halo = '#B9658A', shadow = '#8C3D5D') => svg(FOOD, `<circle cx="193" cy="120" r="96" fill="${halo}"/>
    <ellipse cx="193" cy="180" rx="120" ry="14" fill="${shadow}"/><ellipse cx="193" cy="174" rx="108" ry="12" fill="#FFF"/>
    <path d="M110 168V112l170-26v82z" fill="${C.cream}"/><path d="M110 112l170-26v18l-170 26z" fill="#FFF"/>
    <path d="M110 144l170-20v12l-170 20z" fill="${C.pink}"/><path d="M110 112l118-62 52 36z" fill="#FFF"/>
    <circle cx="230" cy="48" r="13" fill="${C.accent}"/><path d="M230 35q6-12 16-8" stroke="${C.green}" stroke-width="4" fill="none" stroke-linecap="round"/>`),
  bowl: (halo = C.accentSoft) => foodBowl(halo),
  myRecipe: () => svg('0 0 64 72', `<rect x="6" y="4" width="50" height="64" rx="6" fill="#F6EFE7" stroke="${C.accent}" stroke-width="3"/><path d="M16 22h30M16 34h30M16 46h20" stroke="#C98A6E" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="58" r="12" fill="${C.accent}"/><path d="M50 52v12M44 58h12" stroke="#FFF" stroke-width="3" stroke-linecap="round"/>`),
};
function foodBowl(halo) {
  return svg('0 0 150 150', `<circle cx="80" cy="84" r="64" fill="${halo}"/>
    <path d="M62 22q-8 10 0 20q8 10 0 20M84 16q-8 10 0 20q8 10 0 20" fill="none" stroke="${C.peach}" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="78" cy="80" rx="58" ry="10" fill="#F2C76A"/><path d="M20 80h116q-4 50-58 54q-54-4-58-54z" fill="#FFF"/>
    <circle cx="58" cy="78" r="5" fill="${C.gold}"/><circle cx="88" cy="76" r="5" fill="${C.green}"/><circle cx="104" cy="80" r="4" fill="${C.accent}"/>`);
}
// Which food scene suits a recipe: by meal, then a few cuisine/type hints.
export function foodFor(meal, hint = '') {
  // Clear the words that only look sweet: pancakes, crab/fish cakes, baked ziti, pot pie...
  const h = String(hint).toLowerCase()
    .replace(/pancake|griddle ?cake|hoe ?cake|(crab|fish|salmon|potato|rice|corn) ?cakes?|baked|pot ?pie|shepherd'?s pie|cottage pie|pizza pie/g, ' ');
  if (meal === 'dessert' || /dessert|\bcakes?\b|cupcake|cheesecake|cookie|brownie|\bpies?\b|tart|baking|sweet|pudding|cobbler/.test(h)) return 'dessert';
  if (meal === 'breakfast' || /breakfast|pancake|egg|waffle|muffin/.test(h)) return 'breakfast';
  if (meal === 'lunch' || /sandwich|wrap|salad|melt/.test(h)) return 'lunch';
  return 'dinner';
}

// ---------- Weather ----------
// Big scene behind the current temperature. kind: sun|partly|cloud|rain|snow|storm|fog
export function weatherScene(kind = 'sun', night = false) {
  const dark = night;
  const sky = dark ? '#243049' : ({ sun: '#BFD9EA', partly: '#C6DCEA', cloud: '#C9D3DC', fog: '#D3D9DF', rain: '#AEBBC8', storm: '#9AA6B4', snow: '#D7E0E8' }[kind] || '#BFD9EA');
  const far = dark ? '#33415E' : (kind === 'snow' ? '#E9EEF2' : '#9CC1D6');
  const mid = dark ? '#2B3852' : (kind === 'snow' ? '#DCE4EA' : '#6E9FB8');
  const near = dark ? '#1E2A40' : (kind === 'snow' ? '#FFFFFF' : '#4E8299');
  const trees = dark ? '#1A2436' : C.greenDeep;
  const body = [];
  body.push(`<rect width="665" height="270" fill="${sky}"/>`);
  if (dark) body.push(`<g fill="${C.ivory}">${[[80, 40], [150, 70], [240, 30], [330, 60], [420, 26], [600, 140], [470, 90], [40, 110]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2"/>`).join('')}</g>`);
  if (kind === 'sun' || kind === 'partly') {
    body.push(dark
      ? `<circle cx="560" cy="78" r="64" fill="#2E3B57"/><circle cx="560" cy="78" r="38" fill="${C.ivory}"/><circle cx="576" cy="66" r="32" fill="#2E3B57"/>`
      : `<circle cx="560" cy="78" r="70" fill="#D3E6F1"/><circle cx="560" cy="78" r="44" fill="${C.sun}"/>`);
  }
  const cl = dark ? '#3C4A66' : '#FFFFFF';
  if (kind === 'partly') body.push(cloudShape(420, 40, 2, cl));
  if (kind === 'sun' && !dark) body.push(cloudShape(330, 40, 1.4, 'rgba(255,255,255,0.85)'));
  if (['cloud', 'rain', 'storm', 'snow', 'fog'].includes(kind)) {
    const c1 = dark ? '#3C4A66' : (kind === 'storm' ? '#7F8EA0' : kind === 'rain' ? '#9AA8B8' : '#E6ECF1');
    const c2 = dark ? '#34425C' : (kind === 'storm' ? '#6B7A8D' : kind === 'rain' ? '#8696A8' : '#F4F7F9');
    body.push(cloudShape(300, 10, 2.6, c1), cloudShape(470, 30, 2.2, c2));
  }
  if (kind === 'rain' || kind === 'storm') body.push(`<g stroke="${dark ? '#7FA6D6' : C.blue}" stroke-width="4" stroke-linecap="round" opacity=".8">${[330, 370, 410, 450, 490, 530, 570, 610].map((x, i) => `<path d="M${x} ${118 + (i % 2) * 14}l-8 18"/>`).join('')}</g>`);
  if (kind === 'storm') body.push(`<path d="M470 116l-18 28h18l-12 24" fill="none" stroke="${C.gold}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`);
  if (kind === 'snow') body.push(`<g fill="#FFF">${[[320, 130], [360, 150], [400, 124], [440, 156], [480, 132], [520, 150], [560, 128], [600, 146], [250, 150]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5"/>`).join('')}</g>`);
  body.push(`<path d="M0 190q120-50 250-14t250-16t165 10v100H0z" fill="${far}"/>`);
  body.push(`<path d="M0 214q160-34 330-8t335-10v74H0z" fill="${mid}"/>`);
  body.push(`<g>${tree(500, 210, 50, trees)}${tree(526, 214, 66, trees)}${tree(560, 210, 40, trees)}${tree(600, 212, 56, trees)}</g>`);
  body.push(house(410, 176, 1, dark ? '#C9D3E0' : '#FFFFFF', C.gold));
  if (kind === 'fog') body.push(`<g stroke="#FFF" stroke-width="10" stroke-linecap="round" opacity=".7"><path d="M40 170h260M360 196h260M120 228h340"/></g>`);
  body.push(`<path d="M0 240q200-18 400-4t265-6v40H0z" fill="${near}"/>`);
  return svg('0 0 665 270', body.join(''), 'width:100%;height:100%');
}

// Colored weather icon (replaces the single-color line icons where we want warmth).
export function wxIcon(kind = 'sun', size = 48, night = false) {
  const moon = `<path d="M40 8a20 20 0 1 0 12 32a16 16 0 0 1-12-32z" fill="#5B6FA8"/>`;
  const sun = `<g stroke="${C.sun}" stroke-width="4" stroke-linecap="round"><path d="M32 2v7M32 47v7M6 28h7M51 28h7M14 10l5 5M45 41l5 5M50 10l-5 5M19 41l-5 5"/></g><circle cx="32" cy="28" r="13" fill="${C.sun}"/>`;
  const map = {
    sun: night ? moon : sun,
    partly: (night ? `<path d="M44 6a12 12 0 1 0 8 20a10 10 0 0 1-8-20z" fill="#5B6FA8"/>` : `<circle cx="40" cy="18" r="11" fill="${C.sun}"/>`) + `<path d="M12 46a10 10 0 0 1 4-19a14 14 0 0 1 27 2a9 9 0 0 1 3 17z" fill="${C.cloud}"/>`,
    cloud: `<path d="M10 44a11 11 0 0 1 4-21a16 16 0 0 1 31 2a10 10 0 0 1 4 19z" fill="${C.cloud}"/><path d="M30 40a8 8 0 0 1 3-15a12 12 0 0 1 23 2a7 7 0 0 1 2 13z" fill="#9AA8B8"/>`,
    rain: `<path d="M10 34a11 11 0 0 1 4-21a16 16 0 0 1 31 2a10 10 0 0 1 4 19z" fill="${C.cloudDark}"/><g stroke="${C.blue}" stroke-width="4" stroke-linecap="round"><path d="M18 40l-4 10M30 40l-4 10M42 40l-4 10"/></g>`,
    snow: `<path d="M10 34a11 11 0 0 1 4-21a16 16 0 0 1 31 2a10 10 0 0 1 4 19z" fill="${C.cloud}"/><g fill="#8FB3D9"><circle cx="18" cy="44" r="3.5"/><circle cx="30" cy="50" r="3.5"/><circle cx="42" cy="44" r="3.5"/></g>`,
    storm: `<path d="M10 34a11 11 0 0 1 4-21a16 16 0 0 1 31 2a10 10 0 0 1 4 19z" fill="#6B7A8D"/><path d="M32 36l-8 10h8l-6 9" fill="none" stroke="${C.gold}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`,
    fog: `<path d="M10 30a11 11 0 0 1 4-21a16 16 0 0 1 31 2a10 10 0 0 1 4 19z" fill="${C.cloud}"/><g stroke="#9AA8B8" stroke-width="4" stroke-linecap="round"><path d="M8 40h48M16 49h32"/></g>`,
  };
  return `<svg width="${size}" height="${size * 56 / 64}" viewBox="0 0 64 56" aria-hidden="true" focusable="false">${map[kind] || map.cloud}</svg>`;
}
// Soft card tint for a day's weather.
export const wxTint = (kind) => ({ sun: '#FFF7E6', partly: '#F7F6EF', rain: '#E8F0F7', storm: '#E6EAF0', snow: '#F0F5FA' }[kind] || '#F2F4F7');

// What to wear (advice card). which: jacket|umbrella|sunglasses|coat|shorts — any combination.
export function wearArt(which = []) {
  const set = new Set(which);
  let b = '';
  if (set.has('coat') || set.has('jacket')) b += `<path d="M34 20l18-8 8 12 8-12 18 8 18 34-12 6-6-12v46H34V48l-6 12-12-6z" fill="${set.has('coat') ? C.accent : C.green}"/><path d="M60 24v70" stroke="${set.has('coat') ? C.accentDeep : C.greenDeep}" stroke-width="3"/><path d="M52 12l8 20 8-20" fill="none" stroke="${set.has('coat') ? C.accentDeep : C.greenDeep}" stroke-width="3"/>`;
  if (set.has('umbrella')) b += `<g transform="translate(${b ? 56 : 20} 4)"><path d="M0 40a32 32 0 0 1 64 0z" fill="${C.blue}"/><path d="M32 40v40q0 8-8 8" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/></g>`;
  if (set.has('sunglasses')) b += `<g transform="translate(26 70)"><rect width="28" height="18" rx="8" fill="${C.ink}"/><rect x="40" width="28" height="18" rx="8" fill="${C.ink}"/><path d="M28 6q6-4 12 0" stroke="${C.ink}" stroke-width="3" fill="none"/></g>`;
  if (!b) b = `<g stroke="${C.sun}" stroke-width="5" stroke-linecap="round"><path d="M60 14v10M60 76v10M24 50h10M86 50h10"/></g><circle cx="60" cy="50" r="18" fill="${C.sun}"/>`;
  return svg('0 0 120 100', b, 'width:120px;height:100px;flex:none');
}

// ---------- Home ----------
// Landscape strip along the bottom of the home weather card.
export function homeLandscape(night = false) {
  return svg('0 0 588 150', `
    <path d="M0 70q90-40 190-8t190-12t208 8v92H0z" fill="${night ? '#33415E' : '#DCE7EE'}"/>
    <path d="M0 98q120-32 250-6t220-8t118 6v60H0z" fill="${night ? '#2B3852' : '#B9CCD8'}"/>
    ${tree(70, 106, 40, night ? '#1A2436' : C.green)}${tree(92, 110, 52, night ? '#1A2436' : C.green)}${tree(460, 100, 38, night ? '#1A2436' : C.green)}${tree(482, 104, 52, night ? '#1A2436' : C.green)}
    <path d="M0 124q150-20 300-4t288-4v34H0z" fill="${night ? '#1E2A40' : '#8FAEBF'}"/>
    ${house(250, 64, 1, night ? '#C9D3E0' : '#FFFFFF')}`, 'width:100%;height:auto');
}
// No photos yet: three hanging pictures.
export function framesArt() {
  return svg('0 0 420 230', `
    <path d="M80 18q130-24 260 0" fill="none" stroke="#C9B8A6" stroke-width="2"/><path d="M120 12v22M210 6v22M300 12v22" stroke="#C9B8A6" stroke-width="2"/>
    <g transform="rotate(-7 120 110)"><rect x="56" y="34" width="128" height="150" rx="6" fill="#FFF"/><rect x="68" y="46" width="104" height="104" rx="3" fill="${C.peach}"/><circle cx="150" cy="70" r="11" fill="${C.gold}"/><path d="M68 150l38-46 24 24 16-16 26 38z" fill="${C.accent}"/><rect x="88" y="160" width="64" height="6" rx="3" fill="#E7DED4"/></g>
    <g transform="rotate(4 214 104)"><rect x="150" y="26" width="128" height="150" rx="6" fill="#FFF"/><rect x="162" y="38" width="104" height="104" rx="3" fill="${C.mint}"/><circle cx="196" cy="76" r="14" fill="${C.green}"/><path d="M174 142q22-36 44 0z" fill="${C.green}"/><circle cx="236" cy="84" r="12" fill="${C.mustard}"/><path d="M216 142q20-30 40 0z" fill="${C.mustard}"/><rect x="182" y="152" width="64" height="6" rx="3" fill="#E7DED4"/></g>
    <g transform="rotate(9 310 116)"><rect x="248" y="44" width="128" height="150" rx="6" fill="#FFF"/><rect x="260" y="56" width="104" height="104" rx="3" fill="#EADCEB"/><path d="M312 92l10 22h-20z" fill="${C.green}"/><path d="M312 80l14 30h-28z" fill="${C.green}"/><rect x="309" y="112" width="6" height="12" fill="#8A5A3B"/><circle cx="300" cy="100" r="3" fill="${C.accent}"/><circle cx="322" cy="96" r="3" fill="${C.gold}"/><rect x="280" y="170" width="64" height="6" rx="3" fill="#E7DED4"/></g>`, 'width:420px;max-width:100%;height:auto');
}
// Little picture for an event name (holidays, birthdays...). 22px by default.
export function eventIcon(name = '', size = 22) {
  const n = String(name).toLowerCase();
  let b;
  if (/christmas|xmas/.test(n) && !/eve/.test(n)) b = `<path d="M11 2l7 10h-4l5 7H3l5-7H4z" fill="${C.green}"/><circle cx="11" cy="3" r="2" fill="${C.gold}"/>`;
  else if (/eve|ornament/.test(n)) b = `<circle cx="11" cy="13" r="7" fill="${C.accent}"/><rect x="8" y="3" width="6" height="4" rx="1" fill="${C.mustard}"/>`;
  else if (/thanks|fall|autumn|labor/.test(n)) b = `<path d="M11 3q7 4 7 10a7 7 0 0 1-14 0q0-6 7-10z" fill="${C.mustard}"/><path d="M11 8v12" stroke="#8A5A1E" stroke-width="2"/>`;
  else if (/birthday|bday/.test(n)) b = `<rect x="4" y="10" width="14" height="9" rx="2" fill="${C.pink}"/><rect x="4" y="10" width="14" height="3" fill="#FFF"/><path d="M11 4v5" stroke="${C.ink}" stroke-width="1.6"/><path d="M11 1q2 2 0 3q-2-1 0-3z" fill="${C.gold}"/>`;
  else if (/valentine|anniversar|wedding|mother/.test(n)) b = `<path d="M11 19c-6-4-9-7-9-11a4.5 4.5 0 0 1 9-1a4.5 4.5 0 0 1 9 1c0 4-3 7-9 11z" fill="${C.accent}"/>`;
  else if (/patrick/.test(n)) b = `<g fill="${C.green}"><circle cx="8" cy="8" r="4"/><circle cx="14" cy="8" r="4"/><circle cx="11" cy="13" r="4"/></g><path d="M11 13v7" stroke="${C.greenDeep}" stroke-width="2"/>`;
  else if (/easter/.test(n)) b = `<ellipse cx="11" cy="12" rx="6" ry="8" fill="${C.pink}"/><path d="M5 11l3 2 3-2 3 2 3-2" fill="none" stroke="#FFF" stroke-width="1.6"/>`;
  else if (/halloween/.test(n)) b = `<ellipse cx="11" cy="13" rx="8" ry="7" fill="#E5772F"/><path d="M11 6V3" stroke="${C.green}" stroke-width="2"/>`;
  else if (/independence|memorial|veteran|president|july/.test(n)) b = `<path d="M11 2l2.6 6 6.4.4-5 4.2 1.6 6.4L11 15.6 5.4 19l1.6-6.4-5-4.2L8.4 8z" fill="${C.blue}"/>`;
  else if (/new year/.test(n)) b = `<g stroke="${C.gold}" stroke-width="2" stroke-linecap="round"><path d="M11 2v5M11 15v5M2 11h5M15 11h5M5 5l3 3M14 14l3 3M17 5l-3 3M8 14l-3 3"/></g>`;
  else b = `<rect x="3" y="5" width="16" height="14" rx="3" fill="${C.peach}"/><rect x="3" y="5" width="16" height="4" rx="2" fill="${C.accent}"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 22 22" aria-hidden="true" focusable="false" style="flex:none">${b}</svg>`;
}

// ---------- Empty states & headers for other screens ----------
export const spot = {
  // Message board with nothing pinned.
  noteBoard: () => svg('0 0 300 200', `<rect x="20" y="20" width="260" height="160" rx="14" fill="#E2C9A6"/><rect x="32" y="32" width="236" height="136" rx="8" fill="#EBD6B8"/>
    <g transform="rotate(-6 100 96)"><rect x="60" y="56" width="80" height="76" rx="4" fill="#FCE7A6"/><path d="M72 80h56M72 96h48M72 112h36" stroke="#C9A64A" stroke-width="4" stroke-linecap="round"/></g>
    <g transform="rotate(5 200 100)"><rect x="160" y="62" width="80" height="76" rx="4" fill="${C.peach}"/><path d="M200 120c-8-6-12-9-12-14a6 6 0 0 1 12-2a6 6 0 0 1 12 2c0 5-4 8-12 14z" fill="${C.accent}"/></g>
    <circle cx="100" cy="56" r="7" fill="${C.accent}"/><circle cx="200" cy="62" r="7" fill="${C.green}"/>`, 'width:300px;max-width:100%;height:auto'),
  // Phone sending photos to the tablet.
  phoneToTablet: () => svg('0 0 360 200', `<circle cx="180" cy="104" r="92" fill="#F6EFE7"/>
    <rect x="40" y="56" width="74" height="132" rx="14" fill="${C.ink}"/><rect x="47" y="70" width="60" height="100" rx="4" fill="${C.peach}"/><circle cx="77" cy="104" r="12" fill="${C.gold}"/><path d="M47 170l22-30 14 14 12-10 12 26z" fill="${C.accent}"/>
    <path d="M126 112q54-40 104 0" fill="none" stroke="${C.accent}" stroke-width="4" stroke-dasharray="2 10" stroke-linecap="round"/><path d="M222 100l10 12-14 4" fill="none" stroke="${C.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="216" y="64" width="128" height="92" rx="12" fill="${C.ink}"/><rect x="224" y="72" width="112" height="76" rx="4" fill="${C.mint}"/><circle cx="262" cy="100" r="11" fill="${C.green}"/><path d="M244 148q18-30 36 0z" fill="${C.green}"/><circle cx="300" cy="104" r="9" fill="${C.mustard}"/><path d="M284 148q16-24 32 0z" fill="${C.mustard}"/>`, 'width:360px;max-width:100%;height:auto'),
  // Empty grocery list.
  groceryBag: () => svg('0 0 285 170', tileArt.grocery().replace(/^<svg[^>]*>|<\/svg>$/g, ''), 'width:285px;max-width:100%;height:auto'),
  // Calendar day with nothing on.
  quietDay: () => svg('0 0 300 180', `<circle cx="150" cy="96" r="80" fill="#EEF4EF"/>
    <path d="M70 150q80-30 160 0" fill="none" stroke="${C.green}" stroke-width="0"/>
    <rect x="96" y="46" width="108" height="100" rx="12" fill="#FFF" stroke="#DCD6CB" stroke-width="2"/><path d="M96 58a12 12 0 0 1 12-12h84a12 12 0 0 1 12 12v12H96z" fill="${C.green}"/>
    <path d="M128 112q22 16 44 0" fill="none" stroke="${C.mustard}" stroke-width="5" stroke-linecap="round"/><circle cx="130" cy="94" r="5" fill="${C.ink}"/><circle cx="170" cy="94" r="5" fill="${C.ink}"/>
    <path d="M222 70q16-6 22-22q4 14-8 26z" fill="${C.mustard}"/>`, 'width:300px;max-width:100%;height:auto'),
  // Kitchen timer with nothing running.
  timer: () => svg(TILE, tileArt.timers().replace(/^<svg[^>]*>|<\/svg>$/g, ''), 'width:285px;max-width:100%;height:auto'),
  // Empty plate for an unplanned meal.
  plate: (fill = C.cream, size = 64) => `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" focusable="false" style="flex:none"><circle cx="32" cy="32" r="28" fill="#FFF" stroke="#E2E5E9" stroke-width="2"/><circle cx="32" cy="32" r="18" fill="${fill}"/><path d="M6 12v14M10 12v14M8 26v28" stroke="#C4CAD2" stroke-width="2.5" stroke-linecap="round"/><path d="M56 12q-4 8 0 16v26" stroke="#C4CAD2" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>`,
  // Recipe card + pencil (My recipe form).
  recipeCard: () => svg('0 0 220 170', `<circle cx="110" cy="90" r="76" fill="#F6EFE7"/>
    <g transform="rotate(-5 100 90)"><rect x="40" y="36" width="130" height="100" rx="8" fill="#FFF" stroke="#E6D5CB" stroke-width="2"/><rect x="40" y="36" width="130" height="22" rx="8" fill="${C.accent}"/><path d="M56 76h96M56 94h86M56 112h60" stroke="#E2C9B8" stroke-width="5" stroke-linecap="round"/></g>
    <g transform="rotate(35 170 110)"><rect x="160" y="40" width="16" height="96" rx="3" fill="${C.gold}"/><path d="M160 136l8 18 8-18z" fill="${C.cream}"/><rect x="160" y="40" width="16" height="12" fill="${C.pink}"/></g>`, 'width:220px;max-width:100%;height:auto'),
  // Calm night hills for the night clock (very dark, never bright).
  nightHills: () => svg('0 0 1280 220', `
    <g fill="#3A3F4A">${[[120, 40], [260, 90], [420, 30], [610, 70], [780, 26], [930, 84], [1090, 40], [1210, 100], [40, 120], [520, 120]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6"/>`).join('')}</g>
    <path d="M0 150q200-60 420-20t430-30t430 20v100H0z" fill="#0E1116"/>
    <path d="M0 186q260-40 560-10t720-10v54H0z" fill="#0A0C10"/>
    ${tree(980, 160, 44, '#0A0C10')}${tree(1006, 166, 60, '#0A0C10')}${tree(1040, 162, 36, '#0A0C10')}
    <g transform="translate(860 120)"><path d="M0 40V16L24 0l24 16v24z" fill="#0A0C10"/><rect x="8" y="20" width="10" height="10" fill="#4A3A1C"/></g>`, 'width:100%;height:auto'),
};
