// Recipes for cooking mode. One recipe for now (the design's dinner idea).
// TODO(backend): load family favorites from the shared backend and pick one by id.
// `timer` is in seconds; steps with a timer get a countdown in cooking mode.

export const recipes = {
  'white-chicken-chili': {
    id: 'white-chicken-chili',
    title: 'Slow-cooker white chicken chili',
    meta: 'Serves 6 · 20 min prep · 6 hr low',
    ingredients: [
      '2 lb chicken breasts',
      '2 cans white beans',
      '1 onion, diced',
      '3 cloves garlic',
      '1 can green chiles',
      '3 cups chicken broth',
      '1 tsp cumin, 1 tsp oregano',
      '4 oz cream cheese',
    ],
    steps: [
      { text: 'Put the chicken breasts in the slow cooker and season with cumin, oregano, salt and pepper.' },
      { text: 'Add the diced onion, garlic, green chiles and drained white beans on top.' },
      { text: 'Pour in the chicken broth, cover, and cook on low for 6 hours.', timer: 6 * 3600, timerLabel: 'Slow cook on low' },
      { text: 'Pull the chicken out, shred it with two forks, and stir it back in.' },
      { text: 'Stir in the cream cheese until melted. Top with cilantro and lime and serve.', timer: 10 * 60, timerLabel: 'Let the cream cheese melt' },
    ],
  },
};

export const defaultRecipe = 'white-chicken-chili';
