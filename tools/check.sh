#!/usr/bin/env bash
# bash tools/check.sh
# What to run before publishing. It needs only Node, and takes a few seconds.
#   1. The same translation the deploy does for the screens' old browser engine (Chrome 81
#      on the Lenovo tablets), and the same search for modern syntax it couldn't translate.
#   2. Every import really exists: a screen that asks another file for something that
#      file doesn't offer would only fail when somebody opens that screen.
#   3. Things Chrome 81 doesn't have and no translation adds (newer JavaScript methods,
#      newer CSS), which would work on this PC and quietly fail in a kitchen.
#   4. A lint for mistakes, not style (eslint.config.mjs): names that don't exist, things
#      declared twice, comparisons that can never be true.
#   5. The tests with known answers: every screen named in js/app.js has its file (and the
#      other way round), the calendar-file reader, the sky maths, the kitchen conversions,
#      the budget planner's prices and choices.
cd "$(dirname "$0")/.." || exit 1
fail=0
out="$(mktemp -d)"
# (Git Bash on Windows: hand the Windows programs below a path they understand.)
command -v cygpath >/dev/null 2>&1 && out="$(cygpath -m "$out")"

echo "1. Translating for Chrome 81..."
npx -y esbuild@0.24.2 $(find js -name '*.js') sw.js --outdir="$out/site" --outbase=. --target=chrome64 --log-level=warning || fail=1
if grep -rlE '\?\.[a-zA-Z_$(\[]|\?\?' "$out/site/js" "$out/site/sw.js"; then
  echo "   ^ modern syntax left after translation"; fail=1
fi

echo "2. Following every import..."
npx -y esbuild@0.24.2 js/app.js --bundle --format=esm --outfile="$out/all.js" --log-level=warning --log-override:commonjs-variable-in-esm=silent || fail=1

echo "3. Looking for things Chrome 81 doesn't have..."
# (Flex 'gap' is fine: js/compat.js makes up for it. The phone page isn't looked at:
# it runs on people's own phones.)
if grep -nE '\.replaceAll\(|\.at\(-?[0-9a-z]|structuredClone\(|Object\.hasOwn\(|Promise\.any\(|\.findLast(Index)?\(|[^a-z-]inset\s*:|aspect-ratio\s*:|:is\(|:where\(|:has\(|:focus-visible|filter\s*:\s*blur|backdrop-filter' -r js css index.html --include=*.js --include=*.css --include=*.html; then
  echo "   ^ not available (or far too slow) on the tablets"; fail=1
fi

echo "4. Mistakes a linter can see (a name that doesn't exist, something declared twice)..."
npx -y eslint@10.15.0 js sw.js tools --quiet || { echo "   ^ fix these"; fail=1; }

echo "5. The tests with known answers..."
for t in routes ics astro convert budget; do
  if node "tools/sim/$t-test.mjs" > "$out/$t.txt" 2>&1; then echo "   $t: $(tail -1 "$out/$t.txt")"
  else echo "   $t: FAILED"; grep -E "^FAIL" "$out/$t.txt" | head -10; fail=1; fi
done

rm -rf "$out"
if [ "$fail" = 0 ]; then echo "All good."; else echo "FAILED"; fi
exit $fail
