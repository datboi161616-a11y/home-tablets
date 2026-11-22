// node tools/sim/routes-test.mjs
// Every screen named in js/app.js has its file in js/screens/, and every file there is
// named in js/app.js. A screen missing either way only shows when somebody taps the one
// link that leads to it ("Coming soon", or a screen nobody can reach).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = readFileSync(resolve(root, 'js/app.js'), 'utf8');
// Not screens themselves: shared pieces that live beside them.
const HELPERS = ['kitchen-ui', 'placeholder'];

const named = new Set();
for (const map of ['FAMILY', 'TOM', 'BOTH']) {
  const m = new RegExp(`const ${map} = \\{([\\s\\S]*?)\\};`).exec(app);
  if (!m) { console.log(`FAIL  can't find the ${map} list in js/app.js`); process.exit(1); }
  for (const key of m[1].matchAll(/(?:^|[\s,{])([a-z][a-z0-9]*)\s*:/gi)) named.add(key[1]);
}
const files = new Set(readdirSync(resolve(root, 'js/screens')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).filter((f) => !HELPERS.includes(f)));

let bad = 0;
for (const n of named) if (!files.has(n)) { bad++; console.log(`FAIL  "${n}" is named in js/app.js but js/screens/${n}.js doesn't exist`); }
for (const f of files) if (!named.has(f)) { bad++; console.log(`FAIL  js/screens/${f}.js exists but js/app.js doesn't name it, so nobody can open it`); }
// Each screen offers mount(); app.js calls it.
for (const f of files) {
  if (!/export\s+(?:async\s+)?function\s+mount\b/.test(readFileSync(resolve(root, `js/screens/${f}.js`), 'utf8'))) { bad++; console.log(`FAIL  js/screens/${f}.js has no "export function mount"`); }
}
console.log(bad ? `\n${bad} problem(s)` : `${named.size}/${named.size} screens line up`);
process.exit(bad ? 1 : 0);
