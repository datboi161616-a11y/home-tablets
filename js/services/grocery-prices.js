// What groceries roughly cost: typical US supermarket prices (2026, plain store brands), for
// "Plan on a budget". ESTIMATES, never a quote: the screens always say "est." / "about".
//
// Each line: [words (a pattern, matched as whole words in the ingredient's name), price, for
// how much, unit, e = pounds in one ("each": one onion, one clove, one slice), c = pounds in
// one cup]. Everything is turned into a price per pound; a recipe's amount (lb/oz, cups/tbsp/
// tsp, a count, a can of N oz) is turned into pounds with e and c, so what a recipe uses is
// priced in proportion (like Budget Bytes does: a tablespoon of butter, not the whole pound).
// The longest matching words win ("chicken broth" over "chicken", "sweet potato" over "potato").
// Anything not in the table gets DEFAULT for the line. Pantry staples cost nothing here.
const T = [
  // ---- Meat ----
  ['chicken breasts?|chicken breast fillets?|chicken tenders|chicken tenderloins?|chicken cutlets?', 3.99, 1, 'lb', 0.5, 0.3],
  ['chicken thighs?|boneless skinless chicken thighs?', 3.49, 1, 'lb', 0.3, 0.3],
  ['bone-in(?: skin-on)? chicken thighs?|bone in chicken thighs?|skin-on chicken thighs?', 1.99, 1, 'lb', 0.4],
  ['chicken drumsticks?|drumsticks?|chicken legs?|chicken leg quarters?', 1.79, 1, 'lb', 0.3],
  ['chicken wings?|wings', 3.49, 1, 'lb', 0.1],
  ['whole chicken|chicken \\(whole\\)', 1.79, 1, 'lb', 4.5],
  ['ground chicken', 4.49, 1, 'lb', 1, 0.5],
  ['chicken', 3.49, 1, 'lb', 0.5, 0.3],
  ['rotisserie chicken', 7.99, 1, 'each', 2.5, 0.3],
  ['cooked chicken|shredded chicken|leftover chicken', 5.99, 1, 'lb', 0.5, 0.3],
  ['ground beef|lean ground beef|beef mince|minced beef|ground chuck', 5.49, 1, 'lb', 1, 0.5],
  ['steaks?|sirloin|sirloin steak|strip steak|new york strip', 10.99, 1, 'lb', 0.6, 0.4],
  ['flank steak|skirt steak|flat iron steak', 10.99, 1, 'lb', 1.5, 0.4],
  ['ribeye|rib-eye|filet mignon|beef tenderloin', 15.99, 1, 'lb', 0.75],
  ['beef chuck|chuck roast|stew meat|beef stew meat|pot roast|beef roast|chuck', 6.99, 1, 'lb', 3, 0.4],
  ['brisket|short ribs|beef short ribs', 7.99, 1, 'lb', 1],
  ['beef', 6.99, 1, 'lb', 1, 0.4],
  ['ground turkey', 4.99, 1, 'lb', 1, 0.5],
  ['turkey breast|turkey', 5.99, 1, 'lb', 1, 0.3],
  ['deli turkey|sliced turkey', 9.99, 1, 'lb', 0.06],
  ['pork chops?|pork steaks?|pork steaks? or chops?|pork cutlets?', 3.99, 1, 'lb', 0.45],
  ['pork tenderloin', 4.49, 1, 'lb', 1.25],
  ['pork shoulder|pork butt|boston butt|pork roast|pork loin', 2.99, 1, 'lb', 3],
  ['ground pork', 3.99, 1, 'lb', 1, 0.5],
  ['pork ribs|baby back ribs|spare ribs|ribs', 4.49, 1, 'lb', 3],
  ['pork', 3.99, 1, 'lb', 1, 0.4],
  ['bacon|bacon slices|bacon strips', 6.99, 1, 'lb', 0.0625, 0.3],
  ['ham|cooked ham|diced ham|ham steak', 4.99, 1, 'lb', 0.06, 0.33],
  ['sausages?|sausage links?|breakfast sausage|pork sausage|italian sausage', 4.99, 1, 'lb', 0.25, 0.5],
  ['andouille|andouille sausage|kielbasa|smoked sausage|polish sausage', 5.49, 1, 'lb', 0.5, 0.3],
  ['chorizo', 5.49, 1, 'lb', 0.25, 0.5],
  ['pepperoni', 7.99, 1, 'lb', 0.005, 0.25],
  ['salami|deli ham', 9.99, 1, 'lb', 0.03],
  ['prosciutto', 19.99, 1, 'lb', 0.03],
  ['pancetta', 13.99, 1, 'lb', 0.03, 0.33],
  ['hot dogs?|frankfurters?', 3.99, 1, 'lb', 0.1],
  ['lamb|lamb chops?|ground lamb|leg of lamb', 9.99, 1, 'lb', 0.3, 0.5],
  ['meatballs|frozen meatballs', 5.99, 1, 'lb', 0.06],
  // ---- Fish ----
  ['salmon|salmon fillets?', 9.99, 1, 'lb', 0.4, 0.4],
  ['smoked salmon', 17.99, 1, 'lb', 0.06],
  ['shrimp|prawns?|jumbo shrimp|large shrimp', 8.99, 1, 'lb', 0.04, 0.4],
  ['tilapia|swai|pollock', 5.99, 1, 'lb', 0.35],
  ['cod|cod fillets?|white fish|whitefish|haddock|halibut|mahi mahi|fish fillets?|fish', 9.99, 1, 'lb', 0.4],
  ['tuna|canned tuna|tuna in water|tuna in oil', 1.29, 5, 'oz', 0.3125, 0.5],
  ['tuna steaks?|ahi tuna', 12.99, 1, 'lb', 0.4],
  ['canned salmon', 3.99, 14.75, 'oz', 0.9],
  ['crab|crab meat|lump crab', 15.99, 1, 'lb', 0.5, 0.5],
  ['lobster|lobster tails?|lobster meat', 24.99, 1, 'lb', 0.3, 0.5],
  ['scallops?|sea scallops', 19.99, 1, 'lb', 0.06],
  ['mussels|clams', 6.99, 1, 'lb', 0.05],
  ['anchov(?:y|ies)|anchovy fillets', 2.99, 2, 'oz', 0.01],
  // ---- Dairy & eggs ----
  ['eggs?|large eggs?|egg whites?|egg yolks?|whole eggs?', 3.49, 12, 'each', 0.11, 0.53],
  ['milk|whole milk|2% milk|skim milk|low-fat milk', 3.99, 1, 'gal', 0, 0.54],
  ['buttermilk', 2.49, 1, 'qt', 0, 0.54],
  ['cream|heavy cream|heavy whipping cream|whipping cream|double cream|thickened cream', 4.49, 1, 'pint', 0, 0.5],
  ['half and half|half-and-half|half & half', 2.49, 1, 'pint', 0, 0.53],
  ['almond milk|oat milk|soy milk', 3.49, 0.5, 'gal', 0, 0.53],
  ['butter|unsalted butter|salted butter', 4.49, 1, 'lb', 0.5, 0.5],
  ['cream cheese', 2.49, 8, 'oz', 0.5, 0.5],
  ['sour cream', 2.29, 16, 'oz', 0, 0.53],
  ['yogurt|plain yogurt|yoghurt', 3.99, 32, 'oz', 0.375, 0.53],
  ['greek yogurt|plain greek yogurt|greek yoghurt', 4.99, 32, 'oz', 0.33, 0.53],
  ['cheddar|cheddar cheese|sharp cheddar|shredded cheddar|colby jack|monterey jack|pepper jack|jack cheese|shredded cheese|mexican blend cheese|mexican cheese|cheese', 4.49, 8, 'oz', 0.06, 0.25],
  ['mozzarella|mozzarella cheese|shredded mozzarella|fresh mozzarella', 4.29, 8, 'oz', 0.06, 0.25],
  ['parmesan|parmesan cheese|parmigiano reggiano|parmigiano|pecorino|romano|grated parmesan', 4.99, 6, 'oz', 0.02, 0.2],
  ['feta|feta cheese|crumbled feta', 3.99, 6, 'oz', 0, 0.33],
  ['ricotta|ricotta cheese', 3.99, 15, 'oz', 0, 0.55],
  ['cottage cheese', 3.49, 16, 'oz', 0, 0.5],
  ['swiss cheese|provolone|gouda|havarti|muenster', 4.49, 8, 'oz', 0.05, 0.25],
  ['american cheese', 3.99, 16, 'oz', 0.05],
  ['goat cheese|blue cheese|gorgonzola|gruyere|brie|halloumi', 5.99, 6, 'oz', 0.02, 0.3],
  ['mascarpone|creme fraiche|crème fraîche', 4.99, 8, 'oz', 0, 0.5],
  ['ghee', 8.99, 13, 'oz', 0, 0.45],
  // ---- Produce ----
  ['onions?|yellow onions?|brown onions?|white onions?|sweet onions?|vidalia onions?', 1.29, 1, 'lb', 0.5, 0.35],
  ['red onions?|purple onions?', 1.69, 1, 'lb', 0.5, 0.35],
  ['green onions?|scallions?|spring onions?', 0.99, 8, 'each', 0.033, 0.22],
  ['shallots?', 3.99, 1, 'lb', 0.08, 0.35],
  ['leeks?', 1.49, 1, 'each', 0.5, 0.2],
  ['garlic|garlic cloves?|cloves garlic|cloves of garlic|minced garlic', 0.6, 9, 'each', 0.011, 0.3],
  ['ginger|fresh ginger|ginger root|grated ginger', 3.99, 1, 'lb', 0.06, 0.4],
  ['carrots?|baby carrots', 1.29, 1, 'lb', 0.14, 0.28],
  ['celery|celery stalks?|celery ribs?|ribs celery|stalks celery', 1.99, 1.5, 'lb', 0.1, 0.25],
  ['potato(?:es)?|russet potato(?:es)?|baking potato(?:es)?', 0.99, 1, 'lb', 0.5, 0.33],
  ['red potato(?:es)?|yukon gold potato(?:es)?|gold potato(?:es)?|baby potato(?:es)?|new potato(?:es)?|small potato(?:es)?', 1.49, 1, 'lb', 0.2, 0.33],
  ['sweet potato(?:es)?|yams?', 1.29, 1, 'lb', 0.6, 0.3],
  ['bell peppers?|red bell peppers?|green bell peppers?|yellow bell peppers?|orange bell peppers?|red peppers?|green peppers?|capsicums?|sweet peppers?', 1.29, 1, 'each', 0.4, 0.33],
  ['jalape(?:ñ|n)os?|serrano peppers?|serranos?|chil(?:i|e|li)(?: peppers?)?|fresno chil(?:i|e)s?|poblano peppers?|poblanos?|thai chil(?:i|e)s?', 0.25, 1, 'each', 0.05, 0.3],
  ['tomato(?:es)?|roma tomato(?:es)?|plum tomato(?:es)?|ripe tomato(?:es)?', 1.99, 1, 'lb', 0.3, 0.4],
  ['cherry tomato(?:es)?|grape tomato(?:es)?', 2.99, 1, 'pint', 0.03, 0.33],
  ['lettuce|romaine|romaine lettuce|iceberg lettuce|butter lettuce|romaine hearts?', 2.29, 1, 'each', 1.2, 0.1],
  ['spinach|baby spinach', 3.49, 10, 'oz', 0, 0.07],
  ['kale|lacinato kale|tuscan kale', 1.99, 1, 'each', 0.5, 0.15],
  ['arugula|rocket|mixed greens|salad greens|spring mix|salad mix', 3.99, 5, 'oz', 0, 0.05],
  ['cabbage|green cabbage|red cabbage|napa cabbage|coleslaw mix', 0.89, 1, 'lb', 2, 0.2],
  ['bok choy|baby bok choy|pak choy', 2.49, 1, 'lb', 0.3, 0.15],
  ['broccoli|broccoli florets|broccoli crowns?', 2.29, 1, 'lb', 1, 0.2],
  ['cauliflower|cauliflower florets', 3.49, 1, 'each', 2, 0.25],
  ['brussels sprouts', 2.99, 1, 'lb', 0.04, 0.2],
  ['zucchini|zucchinis|courgettes?|yellow squash|summer squash', 1.69, 1, 'lb', 0.45, 0.3],
  ['butternut squash|acorn squash|spaghetti squash|winter squash|pumpkin', 1.49, 1, 'lb', 2.5, 0.3],
  ['cucumbers?|english cucumbers?|persian cucumbers?', 0.89, 1, 'each', 0.6, 0.3],
  ['mushrooms?|cremini mushrooms?|white mushrooms?|button mushrooms?|baby bella mushrooms?|portobello mushrooms?|shiitake mushrooms?', 2.49, 8, 'oz', 0.04, 0.17],
  ['eggplants?|aubergines?', 1.99, 1, 'lb', 1.25, 0.18],
  ['asparagus', 3.99, 1, 'lb', 1, 0.3],
  ['green beans|string beans|haricots verts', 2.49, 1, 'lb', 0.01, 0.25],
  ['corn|corn kernels|sweet corn|corn on the cob|ears? of corn', 0.6, 1, 'each', 0.4, 0.35],
  ['frozen corn', 1.49, 1, 'lb', 0, 0.35],
  ['peas|frozen peas|green peas|snow peas|sugar snap peas', 1.49, 1, 'lb', 0, 0.33],
  ['frozen mixed vegetables|mixed vegetables|frozen vegetables|stir fry vegetables', 1.49, 1, 'lb', 0, 0.33],
  ['frozen spinach', 1.49, 10, 'oz', 0, 0.4],
  ['avocados?', 1.25, 1, 'each', 0.4, 0.5],
  ['lemons?', 0.69, 1, 'each', 0.25, 0.5],
  ['lemon juice|fresh lemon juice|juice of (?:a |one |1 )?lemon', 0.69, 3, 'tbsp-juice', 0, 0.5],
  ['limes?', 0.35, 1, 'each', 0.15, 0.5],
  ['lime juice|fresh lime juice', 0.35, 2, 'tbsp-juice', 0, 0.5],
  ['lemon zest|lime zest|orange zest', 0.1, 1, 'tsp-zest', 0, 0.2],
  ['cilantro|fresh cilantro|coriander leaves|parsley|fresh parsley|flat-leaf parsley|italian parsley', 0.99, 1, 'each', 0.12, 0.035],
  ['basil|fresh basil|basil leaves|mint|fresh mint|mint leaves|dill|fresh dill|chives|fresh chives', 1.99, 1, 'each', 0.15, 0.06],
  ['thyme|fresh thyme|rosemary|fresh rosemary|sage|fresh sage|oregano leaves|fresh oregano|thyme sprigs?|rosemary sprigs?', 2.49, 0.75, 'oz', 0.003, 0.05],
  ['apples?|granny smith apples?|honeycrisp apples?', 1.79, 1, 'lb', 0.4, 0.27],
  ['bananas?|ripe bananas?', 0.62, 1, 'lb', 0.3, 0.5],
  ['blueberries|fresh blueberries', 3.99, 1, 'pint', 0.003, 0.33],
  ['strawberries', 3.49, 1, 'lb', 0.04, 0.33],
  ['raspberries|blackberries', 3.99, 6, 'oz', 0.01, 0.28],
  ['berries|mixed berries|frozen berries|frozen blueberries|frozen strawberries|frozen mixed berries', 3.49, 1, 'lb', 0.01, 0.33],
  ['oranges?|navel oranges?|clementines?', 1.29, 1, 'lb', 0.4, 0.4],
  ['orange juice', 3.99, 52, 'floz', 0, 0.54],
  ['mangos?|mangoes|frozen mango', 1.0, 1, 'each', 0.75, 0.36],
  ['pineapple|pineapple chunks', 2.99, 1, 'each', 3.5, 0.36],
  ['peach(?:es)?|nectarines?|pears?|plums?', 1.99, 1, 'lb', 0.33, 0.36],
  ['grapes', 2.49, 1, 'lb', 0.01, 0.33],
  ['radish(?:es)?|beets?|turnips?|parsnips?', 1.99, 1, 'lb', 0.25, 0.3],
  // ---- Cans, jars, dry goods ----
  ['black beans|kidney beans|red kidney beans|pinto beans|cannellini beans|white beans|great northern beans|navy beans|chickpeas|garbanzo beans|butter beans|lima beans|beans', 0.99, 15, 'oz', 0, 0.55],
  ['dried(?: \\w+){0,2} beans|dry(?: \\w+){0,2} beans|dried chickpeas', 1.49, 1, 'lb', 0, 0.42],
  ['lentils|red lentils|green lentils|brown lentils|french lentils|split peas', 1.49, 1, 'lb', 0, 0.42],
  ['refried beans', 1.29, 16, 'oz', 0, 0.55],
  ['diced tomato(?:es)?|crushed tomato(?:es)?|whole tomato(?:es)?|canned tomato(?:es)?|whole peeled tomato(?:es)?|fire-roasted tomato(?:es)?|san marzano tomato(?:es)?|stewed tomato(?:es)?|petite diced tomato(?:es)?', 0.99, 14.5, 'oz', 0, 0.55],
  ['tomato paste', 0.89, 6, 'oz', 0, 0.55],
  ['tomato sauce|passata|tomato puree', 0.79, 15, 'oz', 0, 0.55],
  ['marinara|marinara sauce|pasta sauce|spaghetti sauce|pizza sauce', 2.49, 24, 'oz', 0, 0.55],
  ['salsa|salsa verde|pico de gallo', 2.99, 16, 'oz', 0, 0.55],
  ['enchilada sauce|red enchilada sauce|green enchilada sauce', 1.79, 10, 'oz', 0, 0.55],
  ['green chil(?:i|e)s|diced green chil(?:i|e)s|canned green chil(?:i|e)s', 0.99, 4, 'oz', 0, 0.5],
  ['chipotles? in adobo|chipotle peppers in adobo|adobo sauce', 1.69, 7, 'oz', 0.03, 0.55],
  ['coconut milk|light coconut milk|coconut cream', 1.99, 13.5, 'oz', 0, 0.53],
  ['chicken broth|chicken stock|beef broth|beef stock|vegetable broth|vegetable stock|broth|stock|bone broth|low-sodium chicken broth', 2.49, 32, 'floz', 0, 0.53],
  ['bouillon|bouillon cubes?|stock cubes?|better than bouillon|chicken bouillon|bouillon powder', 0.1, 1, 'each', 0.01, 0.5],
  ['pumpkin puree|canned pumpkin', 1.99, 15, 'oz', 0, 0.55],
  ['pasta|spaghetti|penne|rigatoni|fettuccine|linguine|macaroni|elbow macaroni|rotini|fusilli|farfalle|orzo|ziti|shells|lasagna noodles|lasagne sheets|ditalini|bucatini|egg noodles|noodles', 1.49, 1, 'lb', 0, 0.25],
  ['rice noodles|ramen noodles|udon noodles|soba noodles|lo mein noodles|ramen', 2.49, 1, 'lb', 0.2, 0.25],
  ['rice|white rice|long-grain rice|long grain white rice|jasmine rice|basmati rice|brown rice|arborio rice|sushi rice', 1.49, 1, 'lb', 0, 0.44],
  ['cooked(?: \\w+){0,2} rice|cooked rice|cooked white rice|cooked brown rice|leftover rice|day-old rice', 1.49, 1, 'lb', 0, 0.15],
  ['quinoa', 4.99, 1, 'lb', 0, 0.38],
  ['couscous|bulgur|farro|barley', 2.99, 1, 'lb', 0, 0.38],
  ['oats|rolled oats|old-fashioned oats|old fashioned oats|quick oats|oatmeal|steel cut oats', 3.49, 42, 'oz', 0, 0.2],
  ['granola', 3.99, 12, 'oz', 0, 0.25],
  ['all-purpose flour|flour|plain flour|whole wheat flour|bread flour|self-rising flour', 0.6, 1, 'lb', 0, 0.28],
  ['cornmeal|polenta|masa harina|grits', 1.99, 1, 'lb', 0, 0.35],
  ['sugar|granulated sugar|white sugar|caster sugar', 0.9, 1, 'lb', 0, 0.44],
  ['brown sugar|light brown sugar|dark brown sugar|packed brown sugar', 1.5, 1, 'lb', 0, 0.48],
  ['powdered sugar|confectioners sugar|icing sugar', 1.5, 1, 'lb', 0, 0.26],
  ['honey', 5.99, 12, 'oz', 0, 0.75],
  ['maple syrup|pure maple syrup', 8.99, 12, 'floz', 0, 0.7],
  ['pancake syrup|syrup', 2.99, 24, 'floz', 0, 0.7],
  ['molasses|corn syrup', 3.99, 12, 'floz', 0, 0.75],
  ['peanut butter|almond butter|creamy peanut butter', 2.99, 16, 'oz', 0, 0.56],
  ['jam|jelly|preserves|fruit spread', 2.99, 18, 'oz', 0, 0.7],
  ['chocolate chips|semi-sweet chocolate chips|chocolate|dark chocolate|chocolate chunks', 2.99, 12, 'oz', 0, 0.37],
  ['cocoa powder|unsweetened cocoa|cocoa', 3.99, 8, 'oz', 0, 0.19],
  ['vanilla|vanilla extract|pure vanilla extract', 7.99, 2, 'floz', 0, 0.53],
  ['baking powder|baking soda|bicarbonate of soda|cream of tartar', 1.99, 1, 'lb', 0, 0.5],
  ['yeast|active dry yeast|instant yeast', 1.49, 0.75, 'oz', 0, 0.3],
  ['cornstarch|corn starch|cornflour|arrowroot', 1.99, 1, 'lb', 0, 0.28],
  ['breadcrumbs|bread crumbs|panko|panko breadcrumbs|panko bread crumbs', 2.49, 8, 'oz', 0, 0.12],
  ['walnuts|pecans|almonds|sliced almonds|slivered almonds|cashews|pistachios|hazelnuts|pine nuts|nuts|mixed nuts', 7.99, 1, 'lb', 0, 0.27],
  ['peanuts|roasted peanuts', 3.49, 1, 'lb', 0, 0.32],
  ['sesame seeds|chia seeds|flax seeds|ground flaxseed|sunflower seeds|pumpkin seeds|pepitas|hemp seeds', 5.99, 1, 'lb', 0, 0.3],
  ['raisins|dried cranberries|craisins|dried fruit|dates|medjool dates|dried apricots', 3.49, 1, 'lb', 0.02, 0.36],
  ['shredded coconut|coconut flakes|unsweetened coconut', 2.99, 7, 'oz', 0, 0.2],
  ['soy sauce|low-sodium soy sauce|tamari|coconut aminos|light soy sauce|dark soy sauce', 2.49, 15, 'floz', 0, 0.53],
  ['fish sauce|oyster sauce|hoisin sauce|hoisin|teriyaki sauce|sweet chili sauce|sweet chilli sauce', 3.49, 10, 'floz', 0, 0.6],
  ['sriracha|hot sauce|chili garlic sauce|sambal oelek|gochujang|chili paste|harissa|buffalo sauce|tabasco', 3.49, 12, 'floz', 0, 0.55],
  ['curry paste|red curry paste|green curry paste|yellow curry paste|thai curry paste|miso|miso paste|white miso', 3.49, 4, 'oz', 0, 0.55],
  ['vinegar|white vinegar|apple cider vinegar|cider vinegar|red wine vinegar|white wine vinegar|distilled vinegar', 1.99, 32, 'floz', 0, 0.53],
  ['balsamic vinegar|balsamic|balsamic glaze|rice vinegar|rice wine vinegar|sherry vinegar|mirin|shaoxing wine|rice wine', 3.49, 12, 'floz', 0, 0.55],
  ['worcestershire sauce|worcestershire', 2.49, 10, 'floz', 0, 0.55],
  ['mustard|yellow mustard|dijon mustard|dijon|whole grain mustard|grainy mustard|dry mustard', 2.29, 12, 'oz', 0, 0.55],
  ['ketchup|tomato ketchup', 2.29, 32, 'oz', 0, 0.6],
  ['mayonnaise|mayo|light mayonnaise', 3.99, 30, 'floz', 0, 0.5],
  ['bbq sauce|barbecue sauce', 2.29, 18, 'oz', 0, 0.6],
  ['ranch dressing|ranch|salad dressing|italian dressing|caesar dressing', 2.99, 16, 'floz', 0, 0.53],
  ['tahini', 5.99, 16, 'oz', 0, 0.56],
  ['olives|kalamata olives|black olives|green olives', 2.49, 6, 'oz', 0.01, 0.3],
  ['capers', 2.49, 3.5, 'oz', 0, 0.3],
  ['pickles|dill pickles|pickle relish|relish', 2.99, 24, 'oz', 0.08, 0.5],
  ['sun-dried tomato(?:es)?|sundried tomato(?:es)?|sun dried tomato(?:es)?', 3.99, 8, 'oz', 0.01, 0.25],
  ['roasted red peppers|jarred roasted red peppers|artichoke hearts|marinated artichokes', 3.49, 12, 'oz', 0.06, 0.4],
  ['pesto|basil pesto', 3.99, 6, 'oz', 0, 0.55],
  ['white wine|dry white wine|red wine|dry red wine|cooking wine|sherry|dry sherry|marsala|marsala wine', 6.99, 750, 'ml', 0, 0.53],
  ['beer|lager', 1.5, 12, 'floz', 0, 0.53],
  ['tofu|firm tofu|extra-firm tofu|extra firm tofu|silken tofu', 1.99, 14, 'oz', 0.875, 0.5],
  ['tempeh', 3.49, 8, 'oz', 0.5, 0.4],
  // ---- Bread, tortillas, frozen ----
  ['flour tortillas?|tortillas?|burrito tortillas?|wraps?', 2.99, 10, 'each', 0.1],
  ['corn tortillas?|tostadas?|taco shells?|hard taco shells?', 2.49, 30, 'each', 0.06],
  ['tortilla chips|chips', 2.99, 13, 'oz', 0, 0.06],
  ['bread|sandwich bread|white bread|whole wheat bread|sourdough|sourdough bread|bread slices|slices bread|toast|texas toast|brioche|challah', 2.49, 20, 'each', 0.06, 0.1],
  ['french bread|baguette|ciabatta|italian bread|loaf', 2.49, 1, 'each', 0.75, 0.1],
  ['hamburger buns?|burger buns?|buns?|hot dog buns?|slider buns|brioche buns?|rolls|dinner rolls|hoagie rolls|sub rolls', 2.49, 8, 'each', 0.12],
  ['english muffins?', 2.49, 6, 'each', 0.13],
  ['bagels?', 2.99, 6, 'each', 0.25],
  ['pita|pita bread|pitas|naan|naan bread|flatbreads?', 2.99, 5, 'each', 0.15],
  ['croissants?', 4.99, 6, 'each', 0.12],
  ['pizza dough|refrigerated pizza dough|pizza crust', 2.99, 1, 'each', 1],
  ['puff pastry|pie crust|pie crusts|refrigerated pie crust|crescent rolls|biscuit dough|refrigerated biscuits|phyllo dough|wonton wrappers|egg roll wrappers|dumpling wrappers', 3.99, 1, 'each', 1],
  ['crackers|graham crackers|saltines', 3.49, 1, 'each', 0.6, 0.15],
  ['hash browns|frozen hash browns|shredded hash browns|tater tots|frozen potatoes|french fries', 2.49, 2, 'lb', 0, 0.25],
];

const DEFAULT = 0.75; // one ingredient line nobody listed: a modest guess
const UNKNOWN_LB = 4.99; // ...unless it is weighed: $ a pound
// Pounds in one small piece of something, when a recipe counts those.
const SMALL = { leaf: 0.02, leaves: 0.02, sprig: 0.003, sprigs: 0.003, slice: 0.05, slices: 0.05, piece: 0.06, pieces: 0.06, wedge: 0.06, wedges: 0.06, handful: 0.06, strip: 0.06, strips: 0.06 };
const MAX_LINE = 30; // a misread amount must not turn one line into $200

// Pounds in one of a table unit (p = the line: its e and c).
function unitLb(u, e, c) {
  switch (u) {
    case 'lb': return 1;
    case 'oz': return 1 / 16;
    case 'each': return e;
    case 'cup': return c;
    case 'pint': return 2 * c;
    case 'qt': return 4 * c;
    case 'gal': return 16 * c;
    case 'floz': return c / 8;
    case 'ml': return c / 236.6;
    case 'tbsp-juice': return c / 16; // "a lemon gives 3 tbsp of juice"
    case 'tsp-zest': return c / 48;
    default: return 0;
  }
}
// [regex, $ per lb, e, c], the longest words first is not needed: the longest MATCH wins.
const TABLE = T.map(([w, price, qty, unit, e = 0, c = 0]) => {
  const lb = unitLb(unit, e, c || 0.5) * qty;
  return { re: new RegExp(`(?:^|[^a-z])(?:${w})(?![a-z])`), perLb: lb > 0 ? price / lb : 0, e, c: c || 0.5, each: unit === 'each' ? price / qty : 0 };
});

// Pantry staples are not counted (most kitchens have them; the screens say so): salt, pepper,
// oils, water and ice, and the common dried spices and herbs.
const STAPLE_RE = new RegExp('(?:^|[^a-z])(?:'
  + 'salt|kosher salt|sea salt|table salt|flaky salt|salt and pepper|black pepper|white pepper|ground pepper|cracked pepper|peppercorns?'
  + '|oil|olive oil|extra-virgin olive oil|extra virgin olive oil|vegetable oil|canola oil|cooking oil|neutral oil|avocado oil|coconut oil|sesame oil|toasted sesame oil|peanut oil|frying oil'
  + '|cooking spray|nonstick spray|non-stick spray|water|hot water|cold water|warm water|boiling water|ice water|ice|ice cubes'
  + '|cumin|ground cumin|paprika|smoked paprika|sweet paprika|chil(?:i|li) powder|cayenne|cayenne pepper|garlic powder|onion powder|garlic salt|onion salt'
  + '|cinnamon|ground cinnamon|nutmeg|ground nutmeg|turmeric|ground turmeric|curry powder|garam masala|ground ginger|ground cloves|whole cloves|ground coriander'
  + '|allspice|ground allspice|cardamom|ground cardamom|italian seasoning|cajun seasoning|creole seasoning|taco seasoning|fajita seasoning|old bay|old bay seasoning'
  + '|bay leaf|bay leaves|red pepper flakes|crushed red pepper|crushed red pepper flakes|chil(?:i|li) flakes|chipotle powder|ancho chile powder|mustard powder'
  + '|seasoned salt|seasoning salt|herbes de provence|za.atar|sumac|star anise|five spice|chinese five spice|everything bagel seasoning|poultry seasoning'
  + '|dried (?:oregano|thyme|basil|rosemary|parsley|dill|sage|marjoram|tarragon|mint|chives|herbs|italian herbs)|oregano|cumin seeds?|coriander seeds?|mustard seeds?|fennel seeds?'
  + ')(?![a-z])');
// "1 tsp thyme" is dried thyme; "2 tbsp chopped parsley" is fresh (priced).
const DRY_HERB = /(?:^|[^a-z])(thyme|rosemary|basil|sage|dill|tarragon|marjoram|mint)(?![a-z])/;

/** True for what isn't counted: salt, pepper, oil, water, common dried spices. */
export function isStaple(ing) {
  const t = clean(ing && ing.item);
  if (!t || NOT_STAPLE.test(t)) return false;
  if (STAPLE_RE.test(t) || /^(?:freshly )?(?:ground |cracked )?pepper(?: to taste)?$/.test(t)) return true;
  return /^(tsp|pinch|dash)$/.test(ing.u || '') && DRY_HERB.test(t) && !/fresh|sprig|leaves/.test(t);
}
// (Oil-packed tuna is tuna; sun-dried tomatoes are tomatoes.)
const NOT_STAPLE = /sun.?dried|water chestnut|ice cream|oil.packed|packed in oil|in oil/;

const clean = (s) => String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

/** The table's line for an ingredient name (the longest words that match), or null. */
export function findPrice(name) {
  const t = ` ${clean(name)} `;
  let best = null;
  let len = 0;
  TABLE.forEach((p) => {
    const m = p.re.exec(t);
    if (m && m[0].length > len) { best = p; len = m[0].length; }
  });
  return best;
}

// The size kept in brackets with an item ("diced tomatoes (14.5 oz)"), in pounds, or 0.
const sizeLb = (item) => {
  const m = /\((\d+(?:\.\d+)?)\s*(oz|lb|g)\)/.exec(String(item));
  return m ? (m[2] === 'lb' ? +m[1] : m[2] === 'g' ? +m[1] / 453.6 : +m[1] / 16) : 0;
};
const VOL = { tsp: 1 / 48, tbsp: 1 / 16, cup: 1, pint: 2, quart: 4 };
const NO_AMOUNT = /^(pinch|dash|drizzle|splash|sprinkle|to taste)$/;
/**
 * Estimated cost (dollars) of one ingredient line as a recipe uses it: `ing` is the library's
 * { q, u, item } (web-recipes.js webIngredient). Staples cost 0; unknown things DEFAULT.
 */
export function ingredientCost(ing) {
  if (!ing || typeof ing !== 'object' || isStaple(ing)) return 0;
  const p = findPrice(ing.item);
  const u = String(ing.u || '');
  const q = Number(ing.q);
  if (NO_AMOUNT.test(u)) return p ? 0.1 : 0;
  // Something nobody listed: by weight at a middling meat-and-vegetables price, else DEFAULT.
  if (!p) return (u === 'lb' || u === 'oz') && q > 0 ? Math.min(MAX_LINE, round2((u === 'lb' ? q : q / 16) * UNKNOWN_LB)) : q > 0 ? DEFAULT : 0.25;
  if (!(q > 0)) return round2(Math.min(DEFAULT, p.each || DEFAULT)); // "cilantro, for serving"
  // "6 small romaine lettuce leaves", "8 slices salami": a small part of the thing (the line's
  // own slice when the table has one: salami is thinner than bread).
  const word = (/\b(leaf|leaves|sprigs?|slices?|wedges?|handful|strips?|pieces?)\b/.exec(`${u} ${clean(ing.item)}`) || [''])[0];
  const bit = SMALL[word] && (/^(slices?|strips?)$/.test(word) && p.e && p.e < 0.1 ? p.e : SMALL[word]);
  // "5 tightly packed cups kale": the measure was read as part of the name.
  const inName = !u && /\b(cups?|tablespoons?|tbsp|teaspoons?|tsp)\b/.exec(clean(ing.item));
  let lb = 0;
  if (bit && !/^(lb|oz|can|jar)$/.test(u) && !VOL[u]) lb = q * bit;
  else if (inName) lb = q * VOL[/^c/.test(inName[1]) ? 'cup' : /^(tablespoon|tbsp)/.test(inName[1]) ? 'tbsp' : 'tsp'] * p.c;
  else if (u === 'lb') lb = q;
  else if (u === 'oz') lb = q / 16;
  else if (VOL[u]) lb = q * VOL[u] * p.c;
  else if (u === 'can' || u === 'jar' || (!u && sizeLb(ing.item))) {
    // "1 (14.5 oz) can", "1 (12 lb) brisket": its size is kept with the item.
    lb = q * (sizeLb(ing.item) || 15 / 16);
  } else if (p.each && /^(|clove|slice|piece|large|medium|small|whole|head|bunch|stalk|rib|sprig|leaf|ear|fillet|link|breast|thigh|strip|sheet|each)$/.test(u)) {
    return Math.min(MAX_LINE, round2(q * p.each));
  } else if (p.e) lb = q * p.e; // a count of things that are sold by weight (3 carrots)
  else return DEFAULT;
  return Math.min(MAX_LINE, round2(lb * p.perLb));
}

export const round2 = (x) => Math.round(x * 100) / 100;
