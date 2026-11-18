# Recipe files (data/recipes/<cuisine>.json)

The family tablet (a kitchen-counter tablet) lets people browse cuisine -> type -> recipe list,
add recipes to a week plan, and get a merged shopping list. Cooking mode shows one step at a
time in very large type with tappable countdown timers. US measurements and US grocery stores.

## File shape
```json
{
  "id": "chinese",
  "name": "Chinese",
  "types": [ { "id": "noodles", "name": "Noodles" }, { "id": "stir-fry", "name": "Stir-fry" } ],
  "recipes": [ RECIPE, ... ]
}
```

## RECIPE
```json
{
  "id": "chinese-dan-dan-noodles",
  "title": "Dan dan noodles",
  "blurb": "Spicy sesame-peanut sauce, crispy pork and greens",
  "type": "noodles",
  "serves": 4, "prep": 15, "cook": 15,
  "tags": ["spicy", "quick"],
  "ingredients": [
    { "q": 12, "u": "oz", "item": "dried wheat noodles", "aisle": "international" },
    { "q": 0.5, "u": "lb", "item": "ground pork", "aisle": "meat" },
    { "q": 3, "u": "clove", "item": "garlic", "note": "minced", "aisle": "produce" },
    { "q": 2, "u": "tbsp", "item": "soy sauce", "aisle": "international" },
    { "q": 1, "u": "", "item": "bunch baby bok choy", "aisle": "produce" },
    { "q": null, "u": "", "item": "salt", "aisle": "spices" }
  ],
  "steps": [
    { "text": "Bring a large pot of water to a boil for the noodles." },
    { "text": "Cook the noodles until just tender, then drain.", "timer": 300, "timerLabel": "Boil the noodles" }
  ]
}
```

Rules
- `id`: lowercase-hyphen, must start with the file id (e.g. `chinese-...`), unique.
- `title`: sentence case, max 48 chars. `blurb`: optional, max 90 chars, one appetizing line.
- `prep`, `cook`: whole minutes (cook = total hands-off/cooking time; slow cooker 6 hr = 360).
- `tags`: only from: quick (≤30 min total), vegetarian, vegan, spicy, kid-friendly, slow cooker,
  instant pot, one pot, sheet pan, make ahead, grill, air fryer, gluten-free, healthy, holiday, crowd.
- Ingredients are what goes on a SHOPPING LIST, so:
  - `item` is the thing you buy, lowercase, plain and consistent ("yellow onion", "garlic",
    "boneless skinless chicken thighs", "soy sauce", "large eggs", "unsalted butter").
    Prep goes in `note` ("diced", "cut in 1-inch pieces", "divided", "to serve").
  - Use the SAME item name for the same thing everywhere (so lists can merge).
    Use exactly these names for basics: "salt", "black pepper", "water", "olive oil",
    "vegetable oil", "cooking spray", "sugar", "all-purpose flour", "large eggs",
    "unsalted butter", "garlic", "yellow onion", "whole milk".
  - `q`: number (decimals: 0.25, 0.33, 0.5, 0.75, 1.5 ...) or null for "to taste".
  - `u`: one of "", lb, oz, cup, tbsp, tsp, clove, can, jar, pkg, bunch, slice, pinch, head,
    stalk, sprig, inch, quart, pint, dash, stick, piece. Use "" for counted things (2 limes).
    For cans put the size in the item: { "q": 1, "u": "can", "item": "diced tomatoes (14.5 oz)" }.
  - `aisle`: produce, meat, seafood, dairy, bakery, pantry, spices, canned, frozen,
    international, beverages.
- Steps: 4-9 steps, each ≤ 170 chars (aim ≤ 140), plain words, one action per step.
  Add `timer` (whole seconds, ≥30) + short `timerLabel` to steps where the cook waits
  (boil, simmer, bake, rest, marinate). Include safe internal temps where it matters
  (chicken 165°F, pork 145°F, ground beef 160°F, fish 145°F).
- Real, well-known, home-cookable versions that work with a normal US supermarket
  (an Asian market item is OK when it's the point of the dish, mark aisle "international").
  Accurate quantities, times and temperatures — people will actually cook these.
- Variety inside each type (proteins, vegetarian options, quick vs weekend).

Check your file: `node tools/check-recipes.mjs data/recipes/<id>.json` must print "all good".
