// node tools/sim/convert-test.mjs
// The kitchen-conversions screen's sums, against answers anyone can check on a measuring jug.
globalThis.location = { search: '', hash: '' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => {};
const { _test: t } = await import(new URL('../../js/screens/convert.js', import.meta.url));

const cases = [
  // half, a third, double... in measures you can scoop (teaspoons in, words out)
  ['half of 3/4 cup', t.natural(36 / 2), '6 tablespoons'],
  ['half of 1/3 cup', t.natural(16 / 2), '2 tablespoons + 2 teaspoons'],
  ['a third of 1 cup', t.natural(48 / 3), '⅓ cup'],
  ['double 3/4 cup', t.natural(36 * 2), '1½ cups'],
  ['half of 1 tablespoon', t.natural(3 / 2), '1½ teaspoons'],
  ['half of 1/4 cup', t.natural(12 / 2), '2 tablespoons'],
  ['half of 1 teaspoon', t.natural(1 / 2), '½ teaspoon'],
  ['three times 1/3 cup', t.natural(16 * 3), '1 cup'],
  ['one and a half of 2/3 cup', t.natural(32 * 1.5), '1 cup'],
  ['a third of 1 tablespoon', t.natural(1), '1 teaspoon'],
  ['4 tablespoons', t.natural(12), '¼ cup'],
  ['one and a half of 3/4 cup', t.natural(36 * 1.5), '1 cup + 2 tablespoons'],
  ['250 ml with spoons and cups', t.natural(51), '1 cup + 1 tablespoon'],
  ['three times 3/4 cup', t.natural(36 * 3), '2¼ cups'],
  // fractions and plain numbers
  ['1.5', t.amount(1.5), '1½'], ['0.333', t.amount(1 / 3), '⅓'], ['0.125', t.amount(0.125), '⅛'], ['16', t.amount(16), '16'],
  ['2.3 is no kitchen fraction', t.amount(2.3), '2.3'], ['2.37 is as good as 2 3/8', t.amount(2.37), '2⅜'],
  // metric
  ['1 cup in ml', t.metric(48 * 4.92892), '237 ml'], ['1 tbsp in ml', t.metric(3 * 4.92892), '15 ml'],
  ['1 tsp in ml', t.metric(4.92892), '4.9 ml'], ['1 quart in ml', t.metric(192 * 4.92892), '946 ml'],
  ['8 oz in g', t.grams(8 * 28.3495), '227 g'], ['1 lb in g', t.grams(453.592), '454 g'], ['5 lb in kg', t.grams(5 * 453.592), '2.27 kg'],
];
let bad = 0;
for (const [what, got, want] of cases) {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}: ${got}${ok ? '' : `   (wanted ${want})`}`);
}
console.log(`\n${cases.length - bad}/${cases.length} passed`);
process.exit(bad ? 1 : 0);
