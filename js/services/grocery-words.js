// Everyday grocery and household things, for the Shopping list keyboard's suggestions.
// Plain US names, roughly most-bought first within each group.
export const GROCERY_WORDS = [
  // Produce
  'Bananas', 'Apples', 'Oranges', 'Lemons', 'Limes', 'Grapes', 'Strawberries', 'Blueberries', 'Raspberries',
  'Blackberries', 'Pears', 'Peaches', 'Plums', 'Nectarines', 'Cherries', 'Watermelon', 'Cantaloupe', 'Honeydew',
  'Pineapple', 'Mango', 'Kiwi', 'Avocados', 'Clementines', 'Grapefruit', 'Tomatoes', 'Cherry tomatoes',
  'Potatoes', 'Sweet potatoes', 'Red potatoes', 'Onions', 'Red onions', 'Green onions', 'Garlic', 'Shallots',
  'Carrots', 'Baby carrots', 'Celery', 'Lettuce', 'Romaine lettuce', 'Iceberg lettuce', 'Salad mix', 'Spinach',
  'Baby spinach', 'Kale', 'Arugula', 'Broccoli', 'Cauliflower', 'Cabbage', 'Brussels sprouts', 'Cucumbers',
  'Bell peppers', 'Red peppers', 'Green peppers', 'Jalapeños', 'Zucchini', 'Yellow squash', 'Butternut squash',
  'Mushrooms', 'Corn on the cob', 'Green beans', 'Asparagus', 'Peas', 'Eggplant', 'Radishes', 'Beets',
  'Ginger', 'Cilantro', 'Parsley', 'Basil', 'Mint', 'Rosemary', 'Thyme', 'Dill', 'Fresh herbs', 'Coleslaw mix',
  // Meat & seafood
  'Chicken', 'Chicken breasts', 'Chicken thighs', 'Chicken wings', 'Chicken drumsticks', 'Whole chicken', 'Rotisserie chicken',
  'Ground beef', 'Ground turkey', 'Ground pork', 'Steak', 'Pork chops', 'Pork tenderloin', 'Beef roast',
  'Stew meat', 'Bacon', 'Sausage', 'Italian sausage', 'Breakfast sausage', 'Hot dogs', 'Ham', 'Deli turkey',
  'Deli ham', 'Salami', 'Pepperoni', 'Lunch meat', 'Meatballs', 'Ribs', 'Lamb chops', 'Salmon', 'Shrimp', 'Tilapia',
  'Cod', 'Tuna steaks', 'Crab legs', 'Scallops', 'Fish sticks',
  // Dairy & eggs
  'Milk', 'Whole milk', '2% milk', 'Skim milk', 'Almond milk', 'Oat milk', 'Eggs', 'Butter', 'Unsalted butter',
  'Margarine', 'Cheese', 'Cheddar cheese', 'Shredded cheese', 'Mozzarella', 'Parmesan', 'Swiss cheese',
  'American cheese', 'Sliced cheese', 'String cheese', 'Cream cheese', 'Cottage cheese', 'Feta', 'Sour cream',
  'Yogurt', 'Greek yogurt', 'Heavy cream', 'Whipping cream', 'Half and half', 'Coffee creamer', 'Whipped cream',
  // Bakery
  'Bread', 'White bread', 'Wheat bread', 'Sourdough', 'Bagels', 'English muffins', 'Hamburger buns', 'Hot dog buns',
  'Dinner rolls', 'Tortillas', 'Flour tortillas', 'Corn tortillas', 'Pita bread', 'Croissants', 'Muffins',
  'Donuts', 'Cake', 'Pie', 'Breadcrumbs',
  // Frozen
  'Ice cream', 'Frozen pizza', 'Frozen vegetables', 'Frozen peas', 'Frozen corn', 'Frozen berries',
  'Frozen waffles', 'French fries', 'Tater tots', 'Frozen dinners', 'Ice', 'Popsicles', 'Frozen chicken nuggets',
  // Pantry
  'Rice', 'Brown rice', 'Pasta', 'Spaghetti', 'Macaroni', 'Egg noodles', 'Ramen', 'Mac and cheese', 'Cereal',
  'Oatmeal', 'Granola', 'Pancake mix', 'Maple syrup', 'Flour', 'Sugar', 'Brown sugar', 'Powdered sugar',
  'Baking soda', 'Baking powder', 'Yeast', 'Chocolate chips', 'Vanilla extract', 'Cornstarch', 'Olive oil',
  'Vegetable oil', 'Cooking spray', 'Vinegar', 'Peanut butter', 'Jelly', 'Jam', 'Honey', 'Nutella', 'Crackers',
  'Chips', 'Tortilla chips', 'Pretzels', 'Popcorn', 'Cookies', 'Granola bars', 'Nuts', 'Almonds', 'Peanuts',
  'Trail mix', 'Raisins', 'Dried fruit', 'Applesauce', 'Fruit cups', 'Pudding', 'Jell-O', 'Marshmallows',
  'Candy', 'Chocolate', 'Gum', 'Ketchup', 'Mustard', 'Mayonnaise', 'Ranch dressing', 'Salad dressing',
  'BBQ sauce', 'Hot sauce', 'Soy sauce', 'Salsa', 'Pickles', 'Olives', 'Relish', 'Pasta sauce', 'Pizza sauce',
  'Gravy mix', 'Taco seasoning', 'Stuffing',
  // Canned goods
  'Canned tomatoes', 'Diced tomatoes', 'Tomato sauce', 'Tomato paste', 'Black beans', 'Kidney beans',
  'Pinto beans', 'Chickpeas', 'Refried beans', 'Baked beans', 'Canned corn', 'Green chiles', 'Tuna',
  'Canned chicken', 'Chicken broth', 'Beef broth', 'Vegetable broth', 'Soup', 'Chicken noodle soup',
  'Tomato soup', 'Cream of mushroom soup', 'Coconut milk', 'Evaporated milk', 'Canned fruit',
  // Spices
  'Salt', 'Black pepper', 'Garlic powder', 'Onion powder', 'Paprika', 'Chili powder', 'Cumin', 'Cinnamon',
  'Oregano', 'Italian seasoning', 'Red pepper flakes', 'Bay leaves', 'Nutmeg',
  // Drinks
  'Coffee', 'Ground coffee', 'Coffee pods', 'Tea', 'Tea bags', 'Orange juice', 'Apple juice', 'Juice',
  'Lemonade', 'Soda', 'Diet soda', 'Sparkling water', 'Bottled water', 'Sports drinks', 'Hot chocolate',
  'Beer', 'Wine', 'Red wine', 'White wine',
  // Household
  'Toilet paper', 'Paper towels', 'Napkins', 'Tissues', 'Paper plates', 'Plastic cups', 'Dish soap',
  'Dishwasher pods', 'Laundry detergent', 'Fabric softener', 'Dryer sheets', 'Bleach', 'All-purpose cleaner',
  'Sponges', 'Trash bags', 'Aluminum foil', 'Plastic wrap', 'Ziploc bags', 'Parchment paper', 'Hand soap',
  'Body wash', 'Shampoo', 'Conditioner', 'Toothpaste', 'Toothbrushes', 'Dental floss', 'Deodorant',
  'Razors', 'Lotion', 'Sunscreen', 'Band-Aids', 'Cotton swabs', 'Vitamins', 'Pain reliever', 'Batteries',
  'Light bulbs', 'Diapers', 'Baby wipes', 'Dog food', 'Cat food', 'Cat litter', 'Dog treats', 'Bird seed',
  'Flowers', 'Birthday card', 'Candles', 'Charcoal',
];
