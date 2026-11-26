// Question of the day: tonight's question in big italic type, a tile for each person
// (a sealed envelope once they've answered), the envelopes opening together when everyone
// has, and the book that keeps every day.
//
//   #/question              tonight's question (to answer, or opened)
//   #/question/book         the book
//   #/question/book/<day>   one day of the book
//
// Typing is on the screen's own keyboard (keyboard.js): nothing here ever takes the focus.
import { topBar, esc, avatar, personColor, initial } from './ui.js';
import { soften } from '../services/soft-bg.js';
import { flushCompat } from '../compat.js';
import { openKeyboard, keyboardStyle } from './keyboard.js';
import { householdName } from '../services/family.js';
import { backHref } from '../services/nav.js';
import { setRoute as chipLook } from '../services/timers.js';
import * as qd from '../services/question-data.js';

const CREAM = '#FFF4E2';
const NAVY = '#1B1D3D';
const AMBER = '#F5C26B';
const UNDO_MS = 6000;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------------------------------
// Painted pictures for the quick choices (560 x 300 each)
// ---------------------------------------------------------------------------------------
// [sky top, sky bottom, what's painted on it]
const cloud = (x, y, s = 1, fill = '#FFFFFF') => `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}"><circle cx="0" cy="0" r="22"/><circle cx="26" cy="-12" r="28"/><circle cx="56" cy="0" r="22"/><rect x="0" y="-2" width="56" height="24" rx="12"/></g>`;
const table = (c) => `<rect y="226" width="560" height="74" fill="${c}"/>`;
const plate = (y = 232, rx = 150) => `<ellipse cx="280" cy="${y}" rx="${rx}" ry="26" fill="#FFFFFF"/><ellipse cx="280" cy="${y}" rx="${rx - 26}" ry="17" fill="#F1ECE4"/>`;
const steam = (x, y) => `<path d="M${x} ${y} q-12 -16 0 -32 q12 -16 0 -32 M${x + 34} ${y} q-12 -16 0 -32 q12 -16 0 -32" stroke="#FFFFFF" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>`;
const pine = (x, y, s = 1, c = '#3E5A4A') => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-5" y="0" width="10" height="22" fill="#6A4A30"/><path d="M-34 4 L0 -52 L34 4Z M-26 -30 L0 -80 L26 -30Z" fill="${c}"/></g>`;
const PAINT = {
  beach: ['#7FC7E8', '#CDEBF4', '<circle cx="430" cy="70" r="40" fill="#FFE08A"/><circle cx="430" cy="70" r="62" fill="#FFE08A" opacity=".25"/><path d="M0 150 Q140 140 280 150 T560 148 V200 H0Z" fill="#2E9CC0"/><path d="M0 170 Q70 162 140 172 T280 170 T420 172 T560 168" stroke="#BFE9F5" stroke-width="4" fill="none"/><path d="M0 196 Q160 176 320 192 T560 186 V300 H0Z" fill="#F1D7A2"/><g transform="translate(130 120)"><path d="M0 110 L4 0" stroke="#8A5A34" stroke-width="5"/><path d="M-70 8 Q4 -40 78 8 Z" fill="#E8574A"/><path d="M-70 8 Q-30 -20 4 -14 Q-20 -8 -30 8Z" fill="#FFF4E2"/><path d="M4 -14 Q40 -20 78 8 H40Z" fill="#FFF4E2"/></g>'],
  snow: ['#8E9CC8', '#D8DEF0', `<path d="M0 170 Q120 110 260 160 T560 130 V300 H0Z" fill="#EEF2FA"/><path d="M0 230 Q200 180 380 220 T560 210 V300 H0Z" fill="#FFFFFF"/>${pine(112, 170, 1)}${pine(478, 150, 0.85)}<g transform="translate(300 228) rotate(-8)"><rect x="-44" y="-12" width="88" height="14" rx="6" fill="#C2331F"/><path d="M-50 8 H54 Q66 8 62 -4" stroke="#6A4A30" stroke-width="5" fill="none" stroke-linecap="round"/></g><g fill="#FFFFFF" opacity=".9"><circle cx="40" cy="40" r="4"/><circle cx="150" cy="70" r="3"/><circle cx="240" cy="30" r="4"/><circle cx="330" cy="80" r="3"/><circle cx="400" cy="40" r="4"/><circle cx="520" cy="70" r="3"/><circle cx="200" cy="110" r="3"/><circle cx="500" cy="20" r="3"/></g>`],
  mountain: ['#8FC1E8', '#DDEEF6', `${cloud(60, 70, 0.9)}<path d="M0 300 L170 96 L262 214 L372 60 L560 300Z" fill="#6E7FA6"/><path d="M170 96 L138 134 L162 126 L176 142 L196 128Z M372 60 L334 112 L360 100 L378 120 L404 102Z" fill="#FFFFFF"/><path d="M0 250 Q160 206 320 244 T560 230 V300 H0Z" fill="#5E9A6A"/>`],
  sea: ['#7FC7E8', '#CDEBF4', `${cloud(70, 64, 0.8)}<rect y="170" width="560" height="130" fill="#2E9CC0"/><path d="M0 200 Q70 190 140 200 T280 200 T420 200 T560 198 M0 250 Q70 240 140 250 T280 250 T420 250 T560 248" stroke="#BFE9F5" stroke-width="4" fill="none"/><g transform="translate(300 176)"><path d="M-70 0 H80 L58 30 H-50Z" fill="#C2331F"/><rect x="-3" y="-120" width="6" height="120" fill="#6A4A30"/><path d="M6 -116 L72 -14 H6Z" fill="#FFFFFF"/><path d="M-6 -96 L-52 -14 H-6Z" fill="#FFF4E2"/></g>`],
  sunrise: ['#F59E6C', '#FDE4B8', '<circle cx="280" cy="210" r="150" fill="#FFE08A" opacity=".3"/><circle cx="280" cy="210" r="84" fill="#FFE08A"/><path d="M0 210 Q140 176 280 208 T560 196 V300 H0Z" fill="#6E9A6A"/><path d="M0 250 Q180 216 340 248 T560 240 V300 H0Z" fill="#4E7A56"/><path d="M70 96 q14 -14 28 0 q14 -14 28 0 M410 70 q12 -12 24 0 q12 -12 24 0" stroke="#7A5040" stroke-width="5" fill="none" stroke-linecap="round"/>'],
  sunset: ['#4A3F7A', '#F08A5D', '<circle cx="280" cy="176" r="62" fill="#FFD27A"/><circle cx="280" cy="176" r="110" fill="#FFD27A" opacity=".22"/><rect y="176" width="560" height="124" fill="#3C3560"/><path d="M230 200 H330 M210 232 H350 M244 264 H316" stroke="#FFD27A" stroke-width="6" stroke-linecap="round" opacity=".7"/><path d="M0 176 Q60 150 130 176Z M430 176 Q500 140 560 176Z" fill="#2A2448"/>'],
  moon: ['#15173A', '#3A3E78', '<circle cx="400" cy="96" r="52" fill="#FFF1C4"/><circle cx="424" cy="82" r="46" fill="#1F2250"/><g fill="#FFF4E2"><circle cx="60" cy="50" r="4"/><circle cx="150" cy="110" r="3"/><circle cx="230" cy="44" r="4"/><circle cx="300" cy="130" r="3"/><circle cx="500" cy="170" r="3"/><circle cx="110" cy="170" r="3"/><circle cx="520" cy="40" r="4"/></g><path d="M0 240 Q150 196 300 232 T560 216 V300 H0Z" fill="#0E1027"/>'],
  sun: ['#6DB7EE', '#CDEBF4', '<g transform="translate(280 118)"><g stroke="#FFD24A" stroke-width="9" stroke-linecap="round"><path d="M0 -96 V-76 M0 96 V76 M-96 0 H-76 M96 0 H76 M-68 -68 L-54 -54 M68 68 L54 54 M-68 68 L-54 54 M68 -68 L54 -54"/></g><circle r="56" fill="#FFD24A"/></g><path d="M0 240 Q160 206 320 236 T560 226 V300 H0Z" fill="#6DB56A"/>'],
  rain: ['#6C778A', '#A8B4C4', `${cloud(150, 96, 1.5, '#E4E9F0')}${cloud(300, 80, 1.3, '#F4F6FA')}<g stroke="#DCEBFA" stroke-width="6" stroke-linecap="round"><path d="M150 150 l-12 30 M210 160 l-12 30 M270 150 l-12 30 M330 160 l-12 30 M390 150 l-12 30 M180 206 l-12 30 M240 214 l-12 30 M300 206 l-12 30 M360 214 l-12 30"/></g><rect y="258" width="560" height="42" fill="#55607A"/>`],
  clouds: ['#6DB7EE', '#DDEEF8', `${cloud(70, 90, 1.3)}${cloud(300, 70, 1.6)}${cloud(400, 170, 1)}${cloud(130, 190, 0.8)}<path d="M0 262 Q160 236 320 258 T560 250 V300 H0Z" fill="#6DB56A"/>`],
  city: ['#3A3E78', '#F3B27A', '<g fill="#1F2246"><rect x="30" y="130" width="80" height="170"/><rect x="120" y="80" width="70" height="220"/><rect x="200" y="150" width="90" height="150"/><rect x="300" y="60" width="76" height="240"/><rect x="386" y="120" width="84" height="180"/><rect x="480" y="160" width="60" height="140"/></g><g fill="#FFD27A"><rect x="46" y="150" width="14" height="18"/><rect x="78" y="190" width="14" height="18"/><rect x="136" y="104" width="14" height="18"/><rect x="160" y="150" width="14" height="18"/><rect x="136" y="200" width="14" height="18"/><rect x="220" y="176" width="14" height="18"/><rect x="254" y="220" width="14" height="18"/><rect x="316" y="86" width="14" height="18"/><rect x="344" y="130" width="14" height="18"/><rect x="316" y="180" width="14" height="18"/><rect x="404" y="146" width="14" height="18"/><rect x="438" y="196" width="14" height="18"/><rect x="498" y="186" width="14" height="18"/></g>'],
  country: ['#8FC9EC', '#DDF0F8', `${cloud(380, 60, 0.9)}<path d="M0 190 Q140 140 290 186 T560 164 V300 H0Z" fill="#8CC06A"/><path d="M0 236 Q180 196 350 232 T560 222 V300 H0Z" fill="#5E9A4E"/><g transform="translate(150 150)"><rect x="-44" y="0" width="88" height="62" fill="#C2331F"/><path d="M-54 2 L0 -40 L54 2Z" fill="#8A2416"/><rect x="-14" y="24" width="28" height="38" fill="#FFF4E2"/></g><path d="M300 250 H540 M320 236 V266 M380 236 V266 M440 236 V266 M500 236 V266" stroke="#FFF4E2" stroke-width="6" stroke-linecap="round"/>`],
  forest: ['#BFE3D0', '#EAF6EE', `<path d="M0 230 Q160 206 320 228 T560 220 V300 H0Z" fill="#7FB07A"/>${pine(70, 216, 1.3, '#4E7A56')}${pine(170, 232, 1.9)}${pine(290, 214, 1.4, '#4E7A56')}${pine(390, 236, 2.1)}${pine(500, 220, 1.5, '#4E7A56')}`],
  flower: ['#BFE6F2', '#F2FAFD', '<path d="M0 232 Q160 210 320 230 T560 222 V300 H0Z" fill="#6DB56A"/><g stroke="#3E8E4E" stroke-width="7" stroke-linecap="round"><path d="M150 250 V150 M280 250 V110 M410 250 V160"/></g><g fill="#F4A3B4"><circle cx="150" cy="122" r="18"/><circle cx="124" cy="146" r="18"/><circle cx="176" cy="146" r="18"/><circle cx="150" cy="170" r="18"/></g><circle cx="150" cy="146" r="14" fill="#FFD24A"/><g fill="#E8574A"><circle cx="280" cy="78" r="20"/><circle cx="250" cy="106" r="20"/><circle cx="310" cy="106" r="20"/><circle cx="280" cy="134" r="20"/></g><circle cx="280" cy="106" r="15" fill="#FFD24A"/><g fill="#B58AE0"><circle cx="410" cy="134" r="17"/><circle cx="386" cy="158" r="17"/><circle cx="434" cy="158" r="17"/><circle cx="410" cy="182" r="17"/></g><circle cx="410" cy="158" r="13" fill="#FFD24A"/>'],
  leaf: ['#F2B870', '#FBE6C2', '<path d="M0 240 Q160 216 320 238 T560 230 V300 H0Z" fill="#B9853E"/><rect x="266" y="150" width="28" height="100" fill="#6A4A30"/><circle cx="280" cy="110" r="78" fill="#E0662A"/><circle cx="222" cy="140" r="50" fill="#EE8A2E"/><circle cx="340" cy="138" r="52" fill="#D2531E"/><g fill="#C2331F"><ellipse cx="90" cy="120" rx="16" ry="8" transform="rotate(-30 90 120)"/><ellipse cx="460" cy="90" rx="16" ry="8" transform="rotate(24 460 90)"/><ellipse cx="480" cy="200" rx="16" ry="8" transform="rotate(-20 480 200)"/></g><g fill="#EE8A2E"><ellipse cx="130" cy="210" rx="16" ry="8" transform="rotate(20 130 210)"/><ellipse cx="420" cy="250" rx="16" ry="8" transform="rotate(-10 420 250)"/></g>'],
  coffee: ['#E9D2B4', '#F6E9D6', `${table('#B98A5E')}${steam(256, 104)}<path d="M360 150 q64 0 64 44 q0 44 -64 44" stroke="#FFFFFF" stroke-width="18" fill="none"/><path d="M196 124 H372 V214 Q372 256 330 256 H238 Q196 256 196 214Z" fill="#FFFFFF"/><ellipse cx="284" cy="126" rx="88" ry="16" fill="#6A4028"/>`],
  tea: ['#CFE5D6', '#EEF6F0', `${table('#8FB89A')}${steam(246, 78)}<path d="M150 180 q-56 -8 -50 -56" stroke="#E8574A" stroke-width="18" fill="none" stroke-linecap="round"/><path d="M372 150 q60 4 56 52 q-4 40 -56 34" stroke="#E8574A" stroke-width="16" fill="none"/><ellipse cx="264" cy="184" rx="124" ry="78" fill="#E8574A"/><rect x="204" y="98" width="120" height="18" rx="9" fill="#C2331F"/><circle cx="264" cy="90" r="13" fill="#C2331F"/><ellipse cx="230" cy="160" rx="22" ry="34" fill="#FFFFFF" opacity=".25"/>`],
  cat: ['#F4D9C6', '#FBEDE2', `${table('#D9A98A')}<path d="M360 240 q90 6 80 -70" stroke="#5A5A6E" stroke-width="20" fill="none" stroke-linecap="round"/><ellipse cx="280" cy="206" rx="92" ry="64" fill="#5A5A6E"/><circle cx="280" cy="116" r="60" fill="#5A5A6E"/><path d="M228 86 L232 30 L270 68Z M332 86 L328 30 L290 68Z" fill="#5A5A6E"/><circle cx="258" cy="112" r="9" fill="#FFE08A"/><circle cx="302" cy="112" r="9" fill="#FFE08A"/><path d="M272 132 h16 l-8 10z" fill="#F4A3B4"/><path d="M226 134 h-34 M226 144 l-32 10 M334 134 h34 M334 144 l32 10" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>`],
  dog: ['#CDE3F0', '#EDF6FB', `${table('#8FB6CC')}<ellipse cx="280" cy="232" rx="96" ry="50" fill="#C98A4E"/><circle cx="280" cy="128" r="74" fill="#C98A4E"/><ellipse cx="204" cy="132" rx="26" ry="56" fill="#8A5A34" transform="rotate(14 204 132)"/><ellipse cx="356" cy="132" rx="26" ry="56" fill="#8A5A34" transform="rotate(-14 356 132)"/><ellipse cx="280" cy="158" rx="38" ry="30" fill="#F1D7A2"/><ellipse cx="280" cy="144" rx="13" ry="10" fill="#3A2A20"/><circle cx="254" cy="112" r="8" fill="#3A2A20"/><circle cx="306" cy="112" r="8" fill="#3A2A20"/><path d="M270 168 q10 22 20 0z" fill="#E8574A"/>`],
  pancakes: ['#F6E3C0', '#FBF1DC', `${table('#D9B47A')}${plate()}<g fill="#E0A85A"><rect x="186" y="196" width="188" height="30" rx="15"/><rect x="194" y="168" width="172" height="30" rx="15"/><rect x="190" y="140" width="180" height="30" rx="15"/></g><path d="M196 150 Q280 128 364 150 V166 q-12 34 -24 0 q-30 6 -44 0 q-10 52 -22 0 q-40 6 -62 0 q-8 22 -16 0Z" fill="#8A4B1E"/><rect x="258" y="122" width="44" height="20" rx="5" fill="#FFE8A0"/>`],
  waffle: ['#F9E8C9', '#FDF4E2', `${table('#E0BE8A')}${plate(236, 170)}<rect x="184" y="76" width="192" height="160" rx="26" fill="#E3B25A"/><path d="M232 82 V230 M280 82 V230 M328 82 V230 M190 116 H370 M190 156 H370 M190 196 H370" stroke="#C48E3A" stroke-width="9"/><circle cx="256" cy="136" r="16" fill="#C2331F"/><circle cx="306" cy="176" r="16" fill="#5B4AA8"/><circle cx="302" cy="130" r="12" fill="#5B4AA8"/>`],
  pizza: ['#E9CFAE', '#F6E6D0', `${table('#B98A5E')}<circle cx="280" cy="156" r="128" fill="#E0A85A"/><circle cx="280" cy="156" r="108" fill="#F6D36B"/><g fill="#C2331F"><circle cx="232" cy="110" r="17"/><circle cx="318" cy="98" r="17"/><circle cx="346" cy="170" r="17"/><circle cx="270" cy="170" r="17"/><circle cx="218" cy="208" r="17"/><circle cx="310" cy="224" r="17"/></g><path d="M280 48 V264 M172 156 H388" stroke="#E0A85A" stroke-width="5"/>`],
  taco: ['#CFE8E0', '#EEF7F3', `${table('#8FC2B2')}<path d="M130 226 Q150 96 300 96 Q430 100 448 226Z" fill="#5E9A4E"/><path d="M124 230 q14 -24 30 -6 q14 -30 34 -8 q16 -30 36 -8 q18 -30 38 -8 q18 -28 38 -6 q18 -28 38 -6 q18 -24 36 -4 q16 -20 30 0 q14 -14 24 6Z" fill="#7FC25E"/><g fill="#E8574A"><circle cx="210" cy="150" r="15"/><circle cx="290" cy="128" r="15"/><circle cx="366" cy="156" r="15"/></g><path d="M112 232 Q130 120 280 120 Q430 120 448 232Z" fill="#F0C05A"/><g fill="#D9A23E"><circle cx="200" cy="190" r="6"/><circle cx="280" cy="170" r="6"/><circle cx="350" cy="196" r="6"/><circle cx="250" cy="212" r="6"/></g>`],
  cake: ['#F6D5DE', '#FCEEF2', `${table('#E0A8B8')}${plate(240, 170)}<rect x="170" y="156" width="220" height="80" rx="10" fill="#FFF4E2"/><path d="M170 166 q0 -10 10 -10 h200 q10 0 10 10 v14 q-18 22 -36 0 q-18 22 -36 0 q-18 22 -38 0 q-18 22 -36 0 q-18 22 -36 0 q-14 16 -38 0Z" fill="#F4A3B4"/><rect x="210" y="96" width="140" height="62" rx="8" fill="#FFF4E2"/><path d="M210 106 q0 -10 10 -10 h120 q10 0 10 10 v10 q-18 20 -35 0 q-18 20 -35 0 q-18 20 -35 0 q-16 18 -35 0Z" fill="#F4A3B4"/><rect x="275" y="58" width="10" height="38" fill="#7FC7E8"/><path d="M280 30 q14 16 0 28 q-14 -12 0 -28z" fill="#FFB02E"/>`],
  pie: ['#E9D8B8', '#F7EEDC', `${table('#B98A5E')}${steam(262, 104)}<path d="M130 176 H430 L396 246 H164Z" fill="#B8C4D0"/><ellipse cx="280" cy="176" rx="158" ry="44" fill="#E0A85A"/><ellipse cx="280" cy="172" rx="132" ry="32" fill="#C2331F"/><path d="M170 160 L390 186 M170 186 L390 160 M220 146 L340 200 M340 146 L220 200" stroke="#E8BC6E" stroke-width="13" stroke-linecap="round"/>`],
  icecream: ['#CDEBF4', '#EFF9FC', '<path d="M218 150 L342 150 L280 290Z" fill="#E0A85A"/><path d="M236 170 L316 210 M254 210 L302 236 M324 170 L244 210 M306 210 L262 236" stroke="#C48E3A" stroke-width="5"/><circle cx="244" cy="124" r="46" fill="#F4A3B4"/><circle cx="318" cy="124" r="46" fill="#FFF1C4"/><circle cx="280" cy="76" r="46" fill="#B9E3C4"/><circle cx="280" cy="28" r="13" fill="#C2331F"/>'],
  cookie: ['#E9D8C4', '#F7EEE2', `${table('#B99A7A')}${plate(238, 190)}<circle cx="214" cy="170" r="70" fill="#C98A4E"/><circle cx="350" cy="184" r="62" fill="#D69A5A"/><g fill="#5A3A2A"><circle cx="190" cy="146" r="10"/><circle cx="236" cy="162" r="10"/><circle cx="200" cy="200" r="10"/><circle cx="250" cy="206" r="8"/><circle cx="332" cy="162" r="9"/><circle cx="374" cy="186" r="9"/><circle cx="340" cy="214" r="9"/></g>`],
  popcorn: ['#F9E0A8', '#FDF3D8', `${table('#E0B45A')}<g fill="#FFF4D0"><circle cx="212" cy="112" r="28"/><circle cx="258" cy="88" r="32"/><circle cx="306" cy="92" r="30"/><circle cx="350" cy="114" r="28"/><circle cx="280" cy="120" r="30"/><circle cx="232" cy="68" r="20"/><circle cx="330" cy="64" r="20"/></g><path d="M186 120 H374 L350 262 H210Z" fill="#FFFFFF"/><path d="M186 120 H224 L238 262 H210Z M262 120 H298 L292 262 H268Z M336 120 H374 L350 262 H322Z" fill="#E8574A"/>`],
  soup: ['#E6D0B0', '#F6EAD6', `${table('#B98A5E')}${steam(262, 96)}<path d="M150 150 H410 Q410 250 280 250 Q150 250 150 150Z" fill="#3B7BB8"/><ellipse cx="280" cy="150" rx="130" ry="26" fill="#2E639A"/><ellipse cx="280" cy="150" rx="112" ry="18" fill="#E8843A"/><rect x="240" y="246" width="80" height="12" rx="6" fill="#2E639A"/><path d="M360 146 L452 80" stroke="#D8DEE6" stroke-width="12" stroke-linecap="round"/>`],
  sandwich: ['#D9EAD0', '#F1F8EC', `${table('#9FC28A')}${plate(244, 190)}<path d="M150 228 L280 96 L410 228Z" fill="#E8C07A"/><path d="M168 224 L280 110 L392 224Z" fill="#FBEFD8"/><path d="M140 232 q20 -16 40 0 q20 -16 40 0 q20 -16 40 0 q20 -16 40 0 q20 -16 40 0 q20 -16 40 0 q20 -16 40 0 v10 H140Z" fill="#7FC25E"/><rect x="150" y="240" width="260" height="10" fill="#E8574A"/><rect x="150" y="250" width="260" height="8" fill="#FFD24A"/><rect x="144" y="258" width="272" height="18" rx="9" fill="#E8C07A"/>`],
  book: ['#D8CCE8', '#F1ECF8', `${table('#A794C8')}<path d="M96 96 H464 V250 H96Z" fill="#7A5CC8"/><path d="M110 86 Q200 66 280 96 V240 Q200 214 110 232Z" fill="#FFF6E6"/><path d="M450 86 Q360 66 280 96 V240 Q360 214 450 232Z" fill="#FBEFD8"/><path d="M140 120 Q200 108 252 124 M140 150 Q200 138 252 154 M140 180 Q200 168 252 184 M308 124 Q360 108 420 120 M308 154 Q360 138 420 150 M308 184 Q360 168 420 180" stroke="#C9B58E" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M360 76 V140 l14 -12 l14 12 V72Z" fill="#E8574A"/>`],
  movie: ['#1F2250', '#2C2E5C', '<rect x="110" y="40" width="340" height="170" rx="8" fill="#FFF4E2"/><path d="M252 88 L326 126 L252 164Z" fill="#E8574A"/><path d="M0 0 H86 Q96 130 60 250 H0Z M560 0 H474 Q464 130 500 250 H560Z" fill="#A82A2A"/><g fill="#0E1027"><rect x="60" y="246" width="90" height="54" rx="18"/><rect x="176" y="246" width="90" height="54" rx="18"/><rect x="292" y="246" width="90" height="54" rx="18"/><rect x="408" y="246" width="90" height="54" rx="18"/></g>'],
  music: ['#F0C8DC', '#FBEAF2', `${table('#D99AB8')}<circle cx="170" cy="170" r="92" fill="#23233A"/><circle cx="170" cy="170" r="60" fill="none" stroke="#3E3E5E" stroke-width="4"/><circle cx="170" cy="170" r="32" fill="#F5C26B"/><circle cx="170" cy="170" r="6" fill="#23233A"/><g fill="#3A2A6E"><ellipse cx="352" cy="214" rx="30" ry="22" transform="rotate(-20 352 214)"/><ellipse cx="462" cy="190" rx="30" ry="22" transform="rotate(-20 462 190)"/><path d="M370 70 L492 44 V190 H478 V84 L384 104 V214 H370Z"/></g>`],
  game: ['#CFE8D8', '#EEF7F1', `${table('#7FB89A')}<g transform="rotate(-10 200 170)"><rect x="136" y="106" width="128" height="128" rx="24" fill="#FFFFFF"/><g fill="#1B1D3D"><circle cx="170" cy="140" r="11"/><circle cx="230" cy="140" r="11"/><circle cx="200" cy="170" r="11"/><circle cx="170" cy="200" r="11"/><circle cx="230" cy="200" r="11"/></g></g><g transform="rotate(12 380 190)"><rect x="322" y="132" width="116" height="116" rx="22" fill="#E8574A"/><g fill="#FFFFFF"><circle cx="352" cy="162" r="10"/><circle cx="408" cy="218" r="10"/></g></g>`],
  train: ['#8FC9EC', '#DDF0F8', '<path d="M0 216 Q160 190 320 212 T560 204 V300 H0Z" fill="#6DB56A"/><rect y="252" width="560" height="10" fill="#6A4A30"/><path d="M40 262 V276 M100 262 V276 M160 262 V276 M220 262 V276 M280 262 V276 M340 262 V276 M400 262 V276 M460 262 V276 M520 262 V276" stroke="#6A4A30" stroke-width="8"/><g fill="#FFFFFF" opacity=".9"><circle cx="396" cy="70" r="20"/><circle cx="352" cy="46" r="26"/><circle cx="300" cy="30" r="20"/></g><rect x="384" y="98" width="28" height="44" fill="#2A2A3A"/><rect x="230" y="136" width="210" height="84" rx="12" fill="#C2331F"/><rect x="130" y="96" width="112" height="124" rx="10" fill="#E8574A"/><rect x="152" y="116" width="68" height="46" rx="6" fill="#CDEBF4"/><path d="M440 190 L480 220 H440Z" fill="#2A2A3A"/><g fill="#2A2A3A"><circle cx="176" cy="230" r="26"/><circle cx="290" cy="234" r="22"/><circle cx="390" cy="234" r="22"/></g><g fill="#D8DEE6"><circle cx="176" cy="230" r="9"/><circle cx="290" cy="234" r="8"/><circle cx="390" cy="234" r="8"/></g>'],
  plane: ['#6DB7EE', '#DDEEF8', `${cloud(50, 220, 1.2)}${cloud(380, 250, 1.4)}${cloud(420, 60, 0.7)}<g transform="rotate(-10 280 140)"><path d="M250 150 L190 236 H232 L330 150Z M260 126 L226 66 H256 L318 126Z" fill="#D8DEE6"/><rect x="110" y="110" width="330" height="56" rx="28" fill="#FFFFFF"/><path d="M118 124 L84 60 H126 L176 112Z" fill="#E8574A"/><g fill="#3B7BB8"><circle cx="230" cy="134" r="8"/><circle cx="264" cy="134" r="8"/><circle cx="298" cy="134" r="8"/><circle cx="332" cy="134" r="8"/><path d="M388 124 h30 q14 4 18 14 h-48Z"/></g></g>`],
  car: ['#8FC9EC', '#DDF0F8', `${cloud(70, 60, 0.8)}<path d="M0 190 Q140 150 290 186 T560 170 V300 H0Z" fill="#6DB56A"/><rect y="232" width="560" height="68" fill="#4A4E5E"/><path d="M20 266 H90 M150 266 H220 M280 266 H350 M410 266 H480" stroke="#FFE08A" stroke-width="6"/><path d="M196 172 Q214 116 262 116 H330 Q372 116 396 172Z" fill="#C2331F"/><path d="M222 168 Q234 132 264 132 H286 V168Z M300 132 H328 Q354 132 370 168 H300Z" fill="#CDEBF4"/><rect x="140" y="166" width="300" height="62" rx="24" fill="#E8574A"/><g fill="#23233A"><circle cx="210" cy="230" r="30"/><circle cx="370" cy="230" r="30"/></g><g fill="#D8DEE6"><circle cx="210" cy="230" r="12"/><circle cx="370" cy="230" r="12"/></g>`],
  bike: ['#BFE6F2', '#F2FAFD', '<path d="M0 240 Q160 216 320 238 T560 230 V300 H0Z" fill="#6DB56A"/><g fill="none" stroke="#23233A" stroke-width="9"><circle cx="180" cy="200" r="62"/><circle cx="390" cy="200" r="62"/></g><g fill="none" stroke="#E8574A" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><path d="M180 200 L246 112 H350 L390 200 M246 112 L290 200 H180 M290 200 L350 112"/></g><path d="M340 84 L352 116 M326 84 H366 M226 104 H268" stroke="#23233A" stroke-width="10" stroke-linecap="round"/><circle cx="290" cy="200" r="11" fill="#23233A"/>'],
  tent: ['#F3B27A', '#FBE1C0', `<path d="M0 226 Q160 200 320 222 T560 214 V300 H0Z" fill="#5E9A4E"/>${pine(84, 222, 1.5)}${pine(486, 226, 1.8)}<path d="M150 250 L280 84 L410 250Z" fill="#E8843A"/><path d="M280 84 L330 250 H410Z" fill="#C96A24"/><path d="M252 250 L280 150 L308 250Z" fill="#3A2A20"/><path d="M280 84 V64" stroke="#6A4A30" stroke-width="6" stroke-linecap="round"/>`],
  cabin: ['#8FB6DC', '#DDEAF6', `<path d="M0 226 Q160 200 320 222 T560 214 V300 H0Z" fill="#7FB07A"/>${pine(70, 224, 1.7)}${pine(498, 230, 2)}<g fill="#FFFFFF" opacity=".85"><circle cx="372" cy="60" r="14"/><circle cx="392" cy="34" r="18"/></g><rect x="350" y="76" width="30" height="50" fill="#6A4A30"/><rect x="166" y="140" width="228" height="112" fill="#8A5A34"/><path d="M166 168 H394 M166 196 H394 M166 224 H394" stroke="#6A4028" stroke-width="5"/><path d="M144 146 L280 60 L416 146Z" fill="#5A3A2A"/><rect x="258" y="182" width="46" height="70" fill="#3A2A20"/><rect x="330" y="172" width="42" height="38" fill="#FFD27A"/><rect x="188" y="172" width="42" height="38" fill="#FFD27A"/>`],
  campfire: ['#15173A', '#3A3058', '<g fill="#FFF4E2"><circle cx="70" cy="50" r="3"/><circle cx="180" cy="90" r="3"/><circle cx="430" cy="60" r="4"/><circle cx="510" cy="120" r="3"/><circle cx="330" cy="30" r="3"/></g><path d="M0 240 Q160 220 320 238 T560 232 V300 H0Z" fill="#0E1027"/><circle cx="280" cy="190" r="120" fill="#FF8A2E" opacity=".16"/><path d="M280 60 Q350 140 326 200 Q316 240 280 240 Q244 240 234 200 Q214 140 280 60Z" fill="#FF7A2E"/><path d="M280 122 Q318 172 304 208 Q298 236 280 236 Q262 236 256 208 Q244 172 280 122Z" fill="#FFD24A"/><g stroke="#6A4028" stroke-width="20" stroke-linecap="round"><path d="M200 262 L360 228 M200 228 L360 262"/></g>'],
  couch: ['#F1E3D0', '#F9F0E4', '<rect y="226" width="560" height="74" fill="#D9BF92"/><rect x="446" y="60" width="8" height="180" fill="#6A4A30"/><path d="M410 60 H490 L474 20 H426Z" fill="#F5C26B"/><rect x="100" y="110" width="320" height="110" rx="26" fill="#2E7466"/><rect x="76" y="150" width="60" height="96" rx="22" fill="#3E8E7E"/><rect x="384" y="150" width="60" height="96" rx="22" fill="#3E8E7E"/><rect x="124" y="176" width="272" height="60" rx="16" fill="#3E8E7E"/><rect x="150" y="136" width="70" height="56" rx="14" fill="#F4A3B4"/><rect x="300" y="136" width="70" height="56" rx="14" fill="#FFE08A"/><path d="M130 246 V262 M390 246 V262" stroke="#6A4A30" stroke-width="10" stroke-linecap="round"/>'],
  picnic: ['#8FC9EC', '#DDF0F8', `${cloud(400, 60, 0.9)}<path d="M0 170 Q160 130 320 164 T560 150 V300 H0Z" fill="#6DB56A"/><path d="M90 250 L190 180 H470 L400 250Z" fill="#FFFFFF"/><path d="M140 215 L240 180 H296 L212 250 H152Z M352 180 H408 L334 250 H274Z" fill="#E8574A" opacity=".85"/><path d="M250 150 q50 -70 100 0" stroke="#8A5A34" stroke-width="10" fill="none"/><path d="M236 150 H364 L350 214 H250Z" fill="#C98A4E"/><path d="M244 172 H356 M248 192 H352" stroke="#8A5A34" stroke-width="5"/><circle cx="420" cy="200" r="16" fill="#C2331F"/>`],
};
/** A painted picture, stretched to fill its box. `uid` keeps two on one page apart. */
export function paint(key, uid = '') {
  const p = PAINT[key] || PAINT.clouds;
  const id = `qdp-${key}${uid}`;
  return `<svg class="qd-art" viewBox="0 0 560 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient></defs><rect width="560" height="300" fill="url(#${id})"/>${p[2]}</svg>`;
}

// ---------------------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------------------
/** A sealed envelope with somebody's wax seal (no letter: the shared one). */
function envelope(name, w = 210) {
  const seal = name ? personColor(name) : '#C98A2A';
  return `<svg width="${w}" height="${Math.round(w * 0.68)}" viewBox="0 0 200 136" aria-hidden="true"><rect x="4" y="4" width="192" height="128" rx="12" fill="#F3E3C6"/><path d="M4 16 L100 82 L196 16" fill="#E6D0AA"/><path d="M6 128 L80 66 M194 128 L120 66" stroke="#D9BF92" stroke-width="3"/><circle cx="100" cy="82" r="22" fill="${seal}"/><circle cx="100" cy="82" r="16" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/>${name ? `<text x="100" y="90" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-style="italic" font-size="22" fill="#FFFFFF">${esc(initial(name))}</text>` : ''}</svg>`;
}
const TICK = (c = '#A9E3C4', s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const BOOK_ICON = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6c-2-1.6-5-2-8-1.6v14c3-.4 6 0 8 1.6 2-1.6 5-2 8-1.6v-14c-3-.4-6 0-8 1.6z"/><path d="M12 6v14"/></svg>';
const CLOSED_BOOK = '<svg width="230" height="190" viewBox="0 0 230 190" aria-hidden="true"><path d="M40 26 H186 Q198 26 198 38 V160 Q198 172 186 172 H40Z" fill="#FBEFD8"/><path d="M30 18 H178 Q190 18 190 30 V152 Q190 164 178 164 H30Z" fill="#5A3A2A"/><rect x="30" y="18" width="20" height="146" fill="#4A2E20"/><rect x="72" y="52" width="94" height="52" rx="8" fill="#F5C26B"/><path d="M119 66 q12 0 12 9 q0 6 -9 9 v5 M122 96 v1" stroke="#5A3A2A" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M150 164 V186 l10 -8 l10 8 V164Z" fill="#E8574A"/></svg>';
/** "Wednesday, Nov 25" / "Wed, Nov 25" of a day. */
function dateWords(day, short) {
  const d = qd.keyDate(day);
  const name = DAYS[d.getDay()];
  return `${short ? name.slice(0, 3) : name}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
// What was typed, as it is shown and kept: a capital first, a curly apostrophe.
const cap = (s) => (s.charAt(0).toUpperCase() + s.slice(1)).replace(/'/g, '’');
const mine = (name) => (name ? `${name}’s answer` : 'Your answer');

const STYLE = `<style>
  .qd{position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:${CREAM};
    background:radial-gradient(ellipse 760px 520px at 82% 0%, rgba(255,190,110,.30) 0%, rgba(255,190,110,0) 70%), radial-gradient(ellipse at 50% 40%, #2C2E5C 0%, ${NAVY} 55%, #0E1027 100%)}
  .qd button{font-family:inherit;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
  .qd-top{position:absolute;left:40px;right:40px;top:24px}
  .qd-top .x-title{font:600 34px Outfit,sans-serif;color:#FFFFFF;margin-left:6px}
  .qd-top .x-btn.glass{background:rgba(8,10,28,.5)}
  .qd-side{font:600 20px Inter,sans-serif;color:#B9BEDF;flex:none}
  .qd-undo{position:absolute;right:40px;top:104px;z-index:3}
  .qd-ask{position:absolute;left:120px;right:120px;top:126px;text-align:center}
  .qd-kick{font:700 17px Inter,sans-serif;letter-spacing:2px;color:${AMBER};text-transform:uppercase}
  .qd-q{font:italic 500 66px/1.18 Fraunces,Georgia,serif;margin-top:20px}
  .qd-q.long{font-size:54px}
  /* a tile for each person */
  .qd-tiles{position:absolute;left:40px;right:40px;top:424px;height:280px;display:flex;justify-content:center}
  .qd-tile{flex:1 1 0;min-width:0;max-width:580px;margin:0 20px;border-radius:30px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 2px rgba(255,255,255,.14);
    box-sizing:border-box;display:flex;align-items:center;padding:0 40px;color:${CREAM};position:relative;text-align:left}
  .qd-tile:first-child{margin-left:0}
  .qd-tile:last-child{margin-right:0}
  .qd-tile .env{flex:none;margin-right:34px;transform:rotate(-4deg);display:flex}
  .qd-name{font:600 38px Outfit,sans-serif;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .qd-ok{display:flex;align-items:center;font:600 21px Inter,sans-serif;color:#A9E3C4;margin-top:8px}
  .qd-ok svg{margin-right:8px}
  .qd-tile.me{background:${CREAM};color:${NAVY};box-shadow:0 4px 12px rgba(0,0,0,.35);display:block;padding:34px 40px}
  .qd-tile.me:active{transform:scale(.985)}
  .qd-who{position:absolute;left:40px;right:40px;top:34px;display:flex;align-items:center}
  .qd-who>span:last-child{margin-left:20px;min-width:0}
  .qd-turn{display:block;font:600 21px Inter,sans-serif;color:#7A6A58;margin-top:4px}
  .qd-go{position:absolute;left:40px;right:40px;bottom:34px;height:88px;border-radius:24px;background:${NAVY};color:${CREAM};display:flex;align-items:center;justify-content:center;font:700 30px Outfit,sans-serif}
  .qd-tiles.many .qd-tile{margin:0 8px;padding:0 14px;flex-direction:column;justify-content:center;text-align:center}
  .qd-tiles.many .qd-tile:first-child{margin-left:0}
  .qd-tiles.many .qd-tile:last-child{margin-right:0}
  .qd-tiles.many .env{margin:0 0 14px}
  .qd-tiles.many .qd-name{font-size:28px;max-width:100%}
  .qd-tiles.many .qd-ok{justify-content:center;font-size:19px}
  .qd-tiles.many .qd-tile.me{padding:26px 14px}
  .qd-tiles.many .qd-who{flex-direction:column;left:14px;right:14px;top:26px}
  .qd-tiles.many .qd-who>span:last-child{margin:10px 0 0;max-width:100%}
  .qd-tiles.many .qd-go{left:16px;right:16px;bottom:22px;height:76px;font-size:26px;border-radius:20px}
  .qd-tile.solo .qd-who{justify-content:center;top:26px}
  /* a quick choice */
  .qd-faces{position:absolute;left:0;right:0;top:104px;display:flex;justify-content:center}
  .qd-face{width:112px;margin:0 11px;padding:0;background:transparent;color:${CREAM};display:flex;flex-direction:column;align-items:center;font:600 19px Inter,sans-serif}
  .qd-face .ring{position:relative;border-radius:50%;display:flex}
  .qd-face .nm{margin-top:10px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .qd-face.on .ring{box-shadow:0 0 0 5px ${AMBER}}
  .qd-face.on .nm{color:${AMBER}}
  .qd-face.later{opacity:.55}
  .qd-face .tk{position:absolute;right:-6px;bottom:-4px;width:30px;height:30px;border-radius:50%;background:#A9E3C4;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px ${NAVY}}
  .qd-ask.pick{left:80px;right:80px;top:226px}
  .qd-ask.pick.alone{top:150px}
  .qd-ask.pick .qd-q{font-size:54px;line-height:1.15;margin-top:8px;white-space:nowrap}
  .qd-ask.pick .qd-q.long{font-size:44px}
  .qd-opts{position:absolute;left:40px;right:40px;top:344px;height:360px}
  .qd-opts.alone{top:300px;height:404px}
  .qd-opt{position:absolute;top:0;width:560px;height:100%;border-radius:30px;overflow:hidden;background:${CREAM};box-shadow:0 4px 12px rgba(0,0,0,.4);padding:0;color:${NAVY}}
  .qd-opt.a{left:0}
  .qd-opt.b{right:0}
  .qd-opt:active{transform:scale(.985)}
  .qd-opt .pic{position:absolute;left:0;right:0;top:0;bottom:68px;overflow:hidden}
  .qd-art{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
  .qd-opt .lab{position:absolute;left:0;right:0;bottom:0;height:68px;display:flex;align-items:center;justify-content:center;font:700 32px Outfit,sans-serif}
  .qd-opt .who{position:absolute;left:18px;top:18px;right:18px;display:flex;flex-wrap:wrap}
  .qd-opt .who>span{margin:0 8px 8px 0;border-radius:50%;box-shadow:0 0 0 4px #FFFFFF;display:flex}
  .qd-opt.dim{opacity:.4}
  div.qd-opt:active{transform:none}
  /* the reveal */
  .qd-rq{position:absolute;left:100px;right:100px;top:112px;text-align:center;font:italic 500 44px/1.2 Fraunces,Georgia,serif}
  .qd-rq.long{font-size:38px}
  .qd-cards{position:absolute;left:48px;right:48px;top:250px;height:384px;display:flex;flex-wrap:wrap;justify-content:center;align-content:space-between}
  .qd-card{position:relative;box-sizing:border-box;border-radius:18px;background:${CREAM};color:${NAVY};box-shadow:0 4px 12px rgba(0,0,0,.4);margin:0 14px;padding:36px 44px 0;overflow:hidden}
  .qd-card.flap{overflow:visible}
  .qd-card .fl{position:absolute;left:0;top:-61px;width:100%;height:62px;display:block}
  .qd-card .hd{display:flex;align-items:center;font:600 28px Outfit,sans-serif}
  .qd-card .hd>span:last-child{margin-left:16px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .qd-card .tx{font:600 40px/1.25 Outfit,sans-serif;margin-top:26px;word-wrap:break-word}
  .qd-card.skip{background:rgba(255,255,255,.07);color:#B9BEDF;box-shadow:inset 0 0 0 2px rgba(255,255,255,.14)}
  .qd-card.skip .tx{font-weight:500;font-size:26px}
  .qd-cards.n1 .qd-card,.qd-cards.n2 .qd-card{width:560px;height:380px}
  .qd-cards.n2 .qd-card:first-child{transform:rotate(-1.6deg)}
  .qd-cards.n2 .qd-card:last-child{transform:rotate(1.4deg)}
  .qd-cards.n3 .qd-card{width:376px;height:380px;margin:0 8px;padding:30px 30px 0}
  .qd-cards.n3 .tx{font-size:30px;margin-top:20px}
  .qd-cards.n4 .qd-card{width:574px;height:184px;margin:0 8px;padding:20px 28px 0}
  .qd-cards.n5 .qd-card{width:378px;height:184px;margin:0 8px;padding:20px 24px 0}
  .qd-cards.n4 .hd,.qd-cards.n5 .hd{font-size:23px}
  .qd-cards.n4 .tx,.qd-cards.n5 .tx{font-size:24px;line-height:1.22;margin-top:10px}
  .qd-cards.n5 .tx.long{font-size:20px}
  .qd-cards .tx.long{font-size:32px}
  .qd-cards.n3 .tx.long{font-size:25px}
  .qd-cards.n4 .tx.long{font-size:22px}
  .qd-fresh .qd-card>.in,.qd-fresh .qd-opt .who{animation:qd-open .4s cubic-bezier(.2,.8,.2,1) both}
  .qd-fresh .qd-card:nth-child(2)>.in{animation-delay:.08s}
  .qd-fresh .qd-card:nth-child(3)>.in{animation-delay:.14s}
  .qd-fresh .qd-card:nth-child(4)>.in{animation-delay:.2s}
  .qd-fresh .qd-card:nth-child(5)>.in{animation-delay:.26s}
  @keyframes qd-open{0%{opacity:0;transform:translate3d(0,50px,0)}100%{opacity:1;transform:translate3d(0,0,0)}}
  .qd-ropts{position:absolute;left:40px;right:40px;top:226px;height:400px}
  .qd-skipped{position:absolute;left:40px;right:40px;top:640px;text-align:center;font:500 20px Inter,sans-serif;color:#B9BEDF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .qd-done{position:absolute;left:480px;top:680px;width:320px;height:88px;border-radius:26px;background:${AMBER};color:${NAVY};display:flex;align-items:center;justify-content:center;font:700 30px Outfit,sans-serif;box-shadow:0 4px 10px rgba(0,0,0,.35);text-decoration:none}
  /* answering */
  .qd-ahead{position:absolute;left:24px;right:40px;top:18px;display:flex;align-items:center}
  .qd-cancel{min-height:60px;min-width:110px;background:transparent;color:#B9BEDF;font:600 21px Inter,sans-serif}
  .qd-awho{flex:1;display:flex;align-items:center;justify-content:center;font:600 24px Outfit,sans-serif;min-width:0}
  .qd-awho>span:first-child{margin-right:12px}
  .qd-other{min-height:60px;min-width:110px;box-sizing:border-box;padding:0 18px 0 10px;border-radius:999px;background:rgba(255,255,255,.08);display:flex;align-items:center;font:600 18px Inter,sans-serif;color:#B9BEDF}
  .qd-other svg{margin-right:10px}
  .qd-other.none{background:transparent}
  .qd-aq{position:absolute;left:60px;right:60px;top:92px;text-align:center;font:italic 500 34px/1.2 Fraunces,Georgia,serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .qd-aq.long{font-size:28px;top:98px}
  .qd-box{position:absolute;left:60px;right:60px;top:158px;height:172px;border-radius:24px;background:${CREAM};color:${NAVY};box-sizing:border-box;padding:22px 30px;
    font:600 34px/1.3 Outfit,sans-serif;box-shadow:0 0 0 4px rgba(245,194,107,.75);overflow:hidden;word-wrap:break-word}
  .qd-box.small{font-size:30px}
  .qd-car{display:inline-block;width:3px;height:36px;background:#C98A2A;vertical-align:-6px;margin-left:2px}
  ${keyboardStyle({ panel: '#10132B', key: '#FFF5E9', ink: '#23323A', fn: '#3A4E58', sug: '#2E3F48', go: AMBER, goInk: NAVY, space: '#8A8F93', line: 'rgba(255,255,255,.4)' })}
  /* the book */
  .qd-months{position:absolute;left:0;right:0;top:108px;display:flex;justify-content:center;align-items:center}
  .qd-year{font:600 20px Inter,sans-serif;color:#B9BEDF;margin-right:18px}
  .qd-month{min-height:60px;min-width:96px;padding:0 20px;margin:0 6px;border-radius:999px;font:600 21px Inter,sans-serif;background:rgba(255,255,255,.08);color:${CREAM}}
  .qd-month.on{background:${AMBER};color:${NAVY}}
  .qd-cover{position:absolute;left:106px;top:210px;width:1068px;height:566px;border-radius:16px;background:#5A3A2A;box-shadow:0 6px 16px rgba(0,0,0,.5)}
  .qd-page{position:absolute;top:196px;width:520px;height:566px;box-sizing:border-box;padding:14px 38px 0;overflow:hidden}
  .qd-page.l{left:120px;background:linear-gradient(90deg,#FBEFD8 0%,#FFF6E6 85%,#E9D8B8 100%);border-radius:14px 4px 4px 14px}
  .qd-page.r{left:640px;background:linear-gradient(90deg,#E9D8B8 0%,#FFF6E6 15%,#FBEFD8 100%);border-radius:4px 14px 14px 4px}
  .qd-fold{position:absolute;left:630px;top:196px;width:20px;height:566px;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(80,50,20,.28),rgba(0,0,0,0));pointer-events:none}
  .qd-entry{display:block;box-sizing:border-box;padding:16px 0 0;border-bottom:1.5px dashed #DCC9A8;text-decoration:none;color:#3A3550;overflow:hidden}
  .qd-entry:last-child{border-bottom:0}
  .qd-entry .dt{font:700 14px Inter,sans-serif;letter-spacing:1.2px;color:#A0703A;text-transform:uppercase}
  .qd-entry .qq{font:italic 500 22px/1.2 Fraunces,Georgia,serif;color:${NAVY};margin-top:5px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
  .qd-entry .an{display:flex;align-items:center;margin-top:8px;font:500 18px/1.4 Inter,sans-serif}
  .qd-entry .an>span:last-child{margin-left:10px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .qd-entry .an.two{align-items:flex-start}
  .qd-entry .an.two>span:last-child{margin-left:0;white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}
  .qd-turnpg{position:absolute;top:448px;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.10);box-shadow:inset 0 0 0 2px rgba(255,255,255,.25);color:#FFFFFF;font:600 32px Inter,sans-serif;display:flex;align-items:center;justify-content:center;padding:0 0 4px}
  .qd-turnpg.prev{left:24px}
  .qd-turnpg.next{left:1192px}
  .qd-empty{position:absolute;left:0;right:0;top:230px;display:flex;flex-direction:column;align-items:center}
  .qd-empty .say{font:italic 500 40px Fraunces,Georgia,serif;margin:30px 0 34px}
  .qd-empty a{position:static;width:auto;padding:0 44px}
  @media (prefers-reduced-motion: reduce){.qd-fresh .qd-card>.in,.qd-fresh .qd-opt .who{animation:none}}
</style>`;

// ---------------------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------------------
let root = null;
let kb = null;
let tick = 0;
let undoTimer = 0;
let bookPage = 0;       // kept while looking at one of the book's days and coming back
const drafts = {};      // what somebody had typed when the keyboard was closed ('day|name')

const bookBtn = `<a class="x-btn glass" href="#/question/book">${BOOK_ICON}The book</a>`;
const top = (opts) => `<div class="qd-top">${topBar(opts)}</div>`;
const face = (name, size) => (name ? avatar(name, size) : '');

// ---- An opened day: letters side by side, or the two pictures with who chose which ----
function openedHtml(t, { fresh = false, done = false } = {}) {
  const long = t.text.length > 48;
  const head = `<div class="qd-rq${long ? ' long' : ''}">${esc(t.text)}</div>`;
  const doneBtn = done ? `<a class="qd-done" href="${backHref()}">Done</a>` : '';
  const skipped = t.names.filter((n) => !t.answers[n]);
  if (t.a && t.b) {
    const opt = (o, cls) => {
      const who = t.names.filter((n) => t.answers[n] === o[0]);
      const alone = !t.names[0];
      return `<div class="qd-opt ${cls}${who.length ? '' : ' dim'}"><div class="pic">${paint(o[1])}<div class="who">${alone ? '' : who.map((n) => `<span title="${esc(n)}">${avatar(n, 64)}</span>`).join('')}</div></div>
        <div class="lab">${alone && who.length ? TICK('#2E7466', 34) : ''}${esc(o[0])}</div></div>`;
    };
    return `${head}<div class="qd-ropts${fresh ? ' qd-fresh' : ''}">${opt(t.a, 'a')}${opt(t.b, 'b')}</div>
      ${skipped.length && t.names[0] ? `<div class="qd-skipped">${esc(skipped.join(', '))} skipped</div>` : ''}${doneBtn}`;
  }
  const n = t.names.length;
  const flap = n <= 3 ? '<svg class="fl" viewBox="0 0 560 70" preserveAspectRatio="none" aria-hidden="true"><path d="M8 70 L280 6 L552 70 Z" fill="#E9D5B0"/></svg>' : '';
  const cards = t.names.map((name) => {
    const words = t.answers[name];
    const hd = name ? `<div class="hd">${avatar(name, n > 3 ? 44 : 60)}<span>${esc(name)}</span></div>` : '';
    if (!words) return `<div class="qd-card skip"><div class="in">${hd}<div class="tx">Skipped</div></div></div>`;
    return `<div class="qd-card${flap ? ' flap' : ''}">${flap}<div class="in">${hd}<div class="tx${words.length > 60 ? ' long' : ''}">${esc(words)}</div></div></div>`;
  }).join('');
  return `${head}<div class="qd-cards n${Math.min(n, 5)}${fresh ? ' qd-fresh' : ''}">${cards}</div>${doneBtn}`;
}

// ---- Tonight's question, still sealed ----
function sealedHtml(t, sel) {
  const kick = `No. ${t.n} · ${dateWords(t.day)}`;
  const shared = !t.names[0];
  if (t.a && t.b) {
    const faces = shared ? '' : `<div class="qd-faces">${t.names.map((name, i) => {
      const did = !!t.answers[name];
      return `<button type="button" class="qd-face ${did ? 'did' : name === sel ? 'on' : 'later'}" data-pick="${i}"${did ? ' disabled' : ''}>
        <span class="ring">${avatar(name, 72)}${did ? `<span class="tk">${TICK(NAVY, 17)}</span>` : ''}</span><span class="nm">${esc(name)}</span></button>`;
    }).join('')}</div>`;
    const opt = (o, i) => `<button type="button" class="qd-opt ${i ? 'b' : 'a'}" data-opt="${i}"><span class="pic">${paint(o[1])}</span><span class="lab">${esc(o[0])}</span></button>`;
    return `${faces}<div class="qd-ask pick${shared ? ' alone' : ''}"><div class="qd-kick">${shared ? esc(kick) : `No. ${t.n}`}</div><div class="qd-q${t.text.length > 34 ? ' long' : ''}">${esc(t.text)}</div></div>
      <div class="qd-opts${shared ? ' alone' : ''}">${opt(t.a, 0)}${opt(t.b, 1)}</div>`;
  }
  const many = t.names.length > 2;
  const env = many ? (t.names.length > 3 ? 120 : 150) : 210;
  const tiles = t.names.map((name, i) => {
    if (t.answers[name]) return `<div class="qd-tile"><div class="env">${envelope(name, env)}</div><div style="min-width:0;max-width:100%"><span class="qd-name">${esc(name)}</span><div class="qd-ok">${TICK()}Answered</div></div></div>`;
    const turn = !shared && t.waiting.length === 1 && t.names.length > 1 ? '<span class="qd-turn">Your turn</span>' : '';
    const who = shared ? `<span class="qd-who">${envelope('', 150)}</span>` : `<span class="qd-who">${avatar(name, 72)}<span><span class="qd-name">${esc(name)}</span>${turn}</span></span>`;
    return `<button type="button" class="qd-tile me${shared ? ' solo' : ''}" data-answer="${i}" aria-label="${esc(mine(name))}">${who}<span class="qd-go">Answer</span></button>`;
  }).join('');
  return `<div class="qd-ask"><div class="qd-kick">${esc(kick)}</div><div class="qd-q${t.text.length > 34 ? ' long' : ''}">${esc(t.text)}</div></div>
    <div class="qd-tiles${many ? ' many' : ''}">${tiles}</div>`;
}

function mountToday(el) {
  let t = qd.today();
  let sel = t.waiting[0] || '';
  let fresh = false;
  let undo = null; // { name, until }
  let writing = null; // { name, day } while the keyboard is up
  const body = el.querySelector('[data-body]');
  const sig = (x) => `${x.day}|${x.state}`;
  let shown = '';

  function draw() {
    t = qd.today();
    shown = sig(t);
    if (t.waiting.indexOf(sel) < 0) sel = t.waiting[0] || '';
    const title = t.evening || new Date().getHours() < qd.MORNING ? 'Tonight’s question' : 'Question of the day';
    if (t.state === 'revealed') {
      body.innerHTML = `${top({ title, right: bookBtn })}${openedHtml(t, { fresh, done: true })}`;
      fresh = false;
      return;
    }
    const canUndo = undo && Date.now() < undo.until && t.answers[undo.name];
    body.innerHTML = `${top({ title, right: bookBtn })}${canUndo ? '<button type="button" class="x-btn glass qd-undo" data-undo>Undo</button>' : ''}${sealedHtml(t, sel)}`;
  }

  function seal(name, words, day) {
    const after = qd.answer(name, words, new Date(), day);
    if (!after) { draw(); return; }
    clearTimeout(undoTimer);
    if (after.state === 'open') {
      undo = { name, until: Date.now() + UNDO_MS };
      undoTimer = setTimeout(() => { undo = null; const b = body.querySelector('[data-undo]'); if (b) b.parentNode.removeChild(b); }, UNDO_MS);
    } else { undo = null; fresh = true; }
    draw();
  }

  function write(name) {
    writing = { name, day: t.day };
    const id = `${t.day}|${name}`;
    const other = t.names.length === 2 ? t.names.filter((n) => n !== name && t.answers[n])[0] : '';
    body.innerHTML = `<div class="qd-ahead"><button type="button" class="qd-cancel" data-cancel>Cancel</button>
        <div class="qd-awho">${face(name, 44)}<span>${esc(mine(name))}</span></div>
        ${other ? `<div class="qd-other">${envelope(other, 52)}${esc(other)}</div>` : '<div class="qd-other none"></div>'}</div>
      <div class="qd-aq${t.text.length > 60 ? ' long' : ''}">${esc(t.text)}</div>
      <div class="qd-box" data-box></div>`;
    const box = body.querySelector('[data-box]');
    let sealed = false;
    kb = openKeyboard(root, {
      go: 'Seal it',
      max: qd.MAX_ANSWER,
      slots: 4,
      text: drafts[id] || '',
      onChange: (text) => {
        box.classList.toggle('small', text.length > 80);
        box.innerHTML = `${esc(cap(text))}<span class="qd-car"></span>`;
      },
      onGo: (pick, k) => {
        if (!k.text.trim()) return;
        sealed = true;
        const words = cap(k.text.trim());
        k.close();
        delete drafts[id];
        seal(name, words, writing ? writing.day : t.day);
      },
      onClose: (text) => {
        kb = null;
        if (!sealed) { drafts[id] = text; }
        writing = null;
        chipLook('question');
        if (!sealed && root) draw();
      },
    });
    chipLook('question'); // the timer chip steps off the keys
  }

  root.addEventListener('mousedown', (e) => { if (e.target.closest && e.target.closest('button')) e.preventDefault(); });
  root.addEventListener('click', (e) => {
    const b = e.target.closest ? e.target.closest('button') : null;
    if (!b || b.closest('[data-kb]')) return;
    if (b.hasAttribute('data-cancel')) { if (kb) kb.close(); return; }
    if (b.hasAttribute('data-undo')) {
      if (undo) qd.unanswer(undo.name);
      if (undo) sel = undo.name;
      undo = null;
      clearTimeout(undoTimer);
      draw();
      return;
    }
    if (b.hasAttribute('data-answer')) { write(t.names[+b.getAttribute('data-answer')]); return; }
    if (b.hasAttribute('data-pick')) { sel = t.names[+b.getAttribute('data-pick')]; draw(); return; }
    if (b.hasAttribute('data-opt')) {
      const o = +b.getAttribute('data-opt') ? t.b : t.a;
      seal(sel, o[0], t.day);
    }
  });
  // 5 PM brings a new question, 6 AM opens a sealed one: look now and then, draw only on a change.
  tick = setInterval(() => {
    if (sig(qd.today()) === shown) return;
    if (kb) kb.close(); else draw();
  }, 20000);
  draw();
}

// ---- One day of the book ----
function mountDay(el, day) {
  const t = qd.bookDay(day);
  const body = el.querySelector('[data-body]');
  if (!t) { location.replace('#/question/book'); return; }
  body.innerHTML = `${top({ title: dateWords(day), back: '#/question/book', backLabel: '← Back', right: `<div class="qd-side">No. ${t.n}</div>` })}${openedHtml(t)}`;
}

// ---- The book ----
function mountBook(el) {
  const body = el.querySelector('[data-body]');
  const all = qd.book();
  const title = qd.bookTitle(householdName());
  if (!all.length) {
    body.innerHTML = `${top({ title, back: '#/question', backLabel: '← Back' })}
      <div class="qd-empty">${CLOSED_BOOK}<div class="say">No pages yet.</div><a class="qd-done" href="#/question">${qd.isEvening() ? 'Tonight’s question' : 'The question'}</a></div>`;
    return;
  }
  const most = all.reduce((m, e) => Math.max(m, e.names.length), 1);
  const per = most > 2 ? 2 : 3;          // days on a page
  const high = Math.floor(552 / per);
  const spreads = Math.ceil(all.length / (per * 2));
  const monthOf = (e) => e.day.slice(0, 7);
  const months = []; // oldest first
  all.forEach((e) => { if (months.indexOf(monthOf(e)) < 0) months.unshift(monthOf(e)); });
  bookPage = Math.max(0, Math.min(spreads - 1, bookPage));
  let want = ''; // the month just tapped (its newest day may sit below another month's last days)

  const entry = (e) => {
    const rows = e.names.filter((n) => e.answers[n]).map((n) => {
      const words = e.a ? `<b>${esc(e.answers[n])}</b>` : esc(e.answers[n]);
      return n ? `<div class="an">${avatar(n, 28)}<span>${words}</span></div>` : `<div class="an two"><span></span><span>${words}</span></div>`;
    }).join('');
    return `<a class="qd-entry" href="#/question/book/${e.day}" style="height:${high}px"><div class="dt">${esc(dateWords(e.day, true))} · No. ${e.n}</div><div class="qq">${esc(e.text)}</div>${rows}</a>`;
  };
  function draw() {
    const from = bookPage * per * 2;
    const left = all.slice(from, from + per);
    const right = all.slice(from + per, from + per * 2);
    const here = left.concat(right);
    const now = here.some((e) => monthOf(e) === want) ? want : monthOf(left[0]);
    const at = months.indexOf(now);
    const first = Math.max(0, Math.min(at - 2, months.length - 5));
    const tabs = months.slice(first, first + 5).map((m) => `<button type="button" class="qd-month${m === now ? ' on' : ''}" data-month="${m}">${MONTHS[+m.slice(5) - 1]}</button>`).join('');
    body.innerHTML = `${top({ title, back: '#/question', backLabel: '← Back', right: `<div class="qd-side">${all.length} ${all.length === 1 ? 'day' : 'days'}</div>` })}
      <div class="qd-months"><div class="qd-year">${now.slice(0, 4)}</div>${tabs}</div>
      <div class="qd-cover"></div>
      <div class="qd-page l">${left.map(entry).join('')}</div><div class="qd-page r">${right.map(entry).join('')}</div><div class="qd-fold"></div>
      ${bookPage > 0 ? '<button type="button" class="qd-turnpg prev" data-turn="-1" aria-label="Newer">‹</button>' : ''}
      ${bookPage < spreads - 1 ? '<button type="button" class="qd-turnpg next" data-turn="1" aria-label="Older">›</button>' : ''}`;
    // Drawn again after the screen opened: its big soft backgrounds become tiny pictures again too
    // (services/soft-bg.js; app.js only does that when a screen opens).
    try { flushCompat(); soften(body); } catch (e) { /* it keeps its own background */ }
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    if (b.hasAttribute('data-turn')) { bookPage += +b.getAttribute('data-turn'); want = ''; }
    else if (b.hasAttribute('data-month')) {
      want = b.getAttribute('data-month');
      const i = all.findIndex((x) => monthOf(x) === b.getAttribute('data-month'));
      if (i >= 0) bookPage = Math.floor(i / (per * 2));
    } else return;
    draw();
  });
  draw();
}

export function mount(el, ctx) {
  const args = (ctx && ctx.args) || [];
  el.innerHTML = `${STYLE}<div class="qd" data-root><div data-body></div></div>`;
  root = el.querySelector('[data-root]');
  if (args[0] === 'book' && args[1]) mountDay(el, args[1]);
  else if (args[0] === 'book') mountBook(el);
  else { bookPage = 0; mountToday(el); }
}

export function unmount() {
  clearInterval(tick);
  clearTimeout(undoTimer);
  tick = 0;
  const k = kb;
  root = null; // (closing the keyboard must not draw on a screen that's leaving)
  if (k) k.close();
  kb = null;
}
