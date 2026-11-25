// Question of the day: one question each evening, everybody's answer sealed until all of
// them are in, and a book that keeps every day. All of it lives on this screen.
//
// The day: a new question arrives at 5 PM and stays until 5 PM the next day, so "the day"
// of a question is the date of that evening. Answers stay sealed until everyone has
// answered, or until the next morning (6 AM), when what there is opens and the others
// count as skipped. With nobody named in Settings there is one shared answer, shown at once.
//
// The order: the household's own shuffle of the whole list (a seed made once), walked one
// a day from the first day, so nothing comes back before the whole list has gone by
// (more than a year).
//
// Stored (localStorage 'question.v1'):
//   { seed, start: 'YYYY-MM-DD',
//     days: { 'YYYY-MM-DD': { n, q, c?: [labelA, artA, labelB, artB], p: [name], a: { name: answer } } } }
//   n: the day's number, q: the question's words, c: a quick choice's two answers and
//   their pictures, p: who was in the household that day ([''] = one shared answer),
//   a: what each wrote (a choice: the label picked). Only days somebody answered are kept,
//   the newest 1,096 of them (three years).
import { getFamily } from './family.js';

export const NEW_AT = 17;      // the hour a new question arrives
export const MORNING = 6;      // the hour the next morning when a sealed day opens
export const KEEP_DAYS = 1096; // three years
export const MAX_ANSWER = 100;

// The pictures a quick choice can show (painted in screens/question.js).
export const ART = ['beach', 'snow', 'mountain', 'sea', 'sunrise', 'sunset', 'moon', 'sun', 'rain', 'clouds', 'city', 'country',
  'forest', 'flower', 'leaf', 'coffee', 'tea', 'cat', 'dog', 'pancakes', 'waffle', 'pizza', 'taco', 'cake', 'pie', 'icecream',
  'cookie', 'popcorn', 'soup', 'sandwich', 'book', 'movie', 'music', 'game', 'train', 'plane', 'car', 'bike', 'tent', 'cabin',
  'campfire', 'couch', 'picnic'];

// Quick choices: [question, answer, picture, answer, picture].
const CHOICES = [
  ['Beach day or snow day?', 'Beach day', 'beach', 'Snow day', 'snow'],
  ['Mountains or the sea?', 'Mountains', 'mountain', 'The sea', 'sea'],
  ['Sunrise or sunset?', 'Sunrise', 'sunrise', 'Sunset', 'sunset'],
  ['Coffee or tea?', 'Coffee', 'coffee', 'Tea', 'tea'],
  ['Cats or dogs?', 'Cats', 'cat', 'Dogs', 'dog'],
  ['Pancakes or waffles?', 'Pancakes', 'pancakes', 'Waffles', 'waffle'],
  ['City or countryside?', 'City', 'city', 'Countryside', 'country'],
  ['A book or a movie?', 'A book', 'book', 'A movie', 'movie'],
  ['Cake or pie?', 'Cake', 'cake', 'Pie', 'pie'],
  ['Summer or winter?', 'Summer', 'sun', 'Winter', 'snow'],
  ['Spring or autumn?', 'Spring', 'flower', 'Autumn', 'leaf'],
  ['Early bird or night owl?', 'Early bird', 'sunrise', 'Night owl', 'moon'],
  ['Pizza or tacos?', 'Pizza', 'pizza', 'Tacos', 'taco'],
  ['Train or plane?', 'Train', 'train', 'Plane', 'plane'],
  ['Tent or cabin?', 'Tent', 'tent', 'Cabin', 'cabin'],
  ['Rainy day or sunny day?', 'Rainy day', 'rain', 'Sunny day', 'sun'],
  ['Ice cream or cookies?', 'Ice cream', 'icecream', 'Cookies', 'cookie'],
  ['Bike ride or road trip?', 'Bike ride', 'bike', 'Road trip', 'car'],
  ['Campfire or cozy couch?', 'Campfire', 'campfire', 'Cozy couch', 'couch'],
  ['Game night or movie night?', 'Game night', 'game', 'Movie night', 'movie'],
  ['Forest walk or beach walk?', 'Forest walk', 'forest', 'Beach walk', 'beach'],
  ['Soup or sandwich?', 'Soup', 'soup', 'Sandwich', 'sandwich'],
  ['Stay in or go out tonight?', 'Stay in', 'couch', 'Go out', 'city'],
  ['Breakfast for dinner or pizza night?', 'Breakfast for dinner', 'pancakes', 'Pizza night', 'pizza'],
  ['Picnic in the park or dinner in town?', 'Picnic', 'picnic', 'Dinner in town', 'city'],
  ['Popcorn or ice cream?', 'Popcorn', 'popcorn', 'Ice cream', 'icecream'],
  ['Cabin in the woods or hotel in the city?', 'Cabin', 'cabin', 'City hotel', 'city'],
  ['Stargazing or cloud watching?', 'Stargazing', 'moon', 'Cloud watching', 'clouds'],
  ['Road trip or train trip?', 'Road trip', 'car', 'Train trip', 'train'],
  ['A garden or a forest?', 'A garden', 'flower', 'A forest', 'forest'],
  ['Morning swim or evening stroll?', 'Morning swim', 'sea', 'Evening stroll', 'sunset'],
  ['Cookies or cake?', 'Cookies', 'cookie', 'Cake', 'cake'],
  ['Tacos or sandwiches?', 'Tacos', 'taco', 'Sandwiches', 'sandwich'],
  ['Music on or peace and quiet?', 'Music on', 'music', 'Peace and quiet', 'clouds'],
  ['Thunderstorm or snowfall?', 'Thunderstorm', 'rain', 'Snowfall', 'snow'],
  ['Fly there or drive there?', 'Fly', 'plane', 'Drive', 'car'],
  ['Sleep under the stars or in a cabin?', 'Under the stars', 'moon', 'In a cabin', 'cabin'],
  ['A lazy morning or an early start?', 'Lazy morning', 'coffee', 'Early start', 'sunrise'],
  ['A concert or a movie?', 'A concert', 'music', 'A movie', 'movie'],
  ['Pie or ice cream?', 'Pie', 'pie', 'Ice cream', 'icecream'],
  ['Waffles or pizza for breakfast?', 'Waffles', 'waffle', 'Pizza', 'pizza'],
  ['A day on a boat or a day on a bike?', 'On a boat', 'sea', 'On a bike', 'bike'],
  ['Read by the fire or read on the beach?', 'By the fire', 'campfire', 'On the beach', 'beach'],
  ['Farm stay or city break?', 'Farm stay', 'country', 'City break', 'city'],
  ['Hot soup or cold ice cream?', 'Hot soup', 'soup', 'Cold ice cream', 'icecream'],
  ['Puzzle or board game?', 'Puzzle', 'couch', 'Board game', 'game'],
  ['Hike up a mountain or stroll in the woods?', 'Up a mountain', 'mountain', 'In the woods', 'forest'],
  ['Falling leaves or first flowers?', 'Falling leaves', 'leaf', 'First flowers', 'flower'],
  ['Tea and a book or popcorn and a movie?', 'Tea and a book', 'tea', 'Popcorn and a movie', 'popcorn'],
  ['A walk with a dog or a nap with a cat?', 'Walk with a dog', 'dog', 'Nap with a cat', 'cat'],
  ['Picnic or campfire cookout?', 'Picnic', 'picnic', 'Cookout', 'campfire'],
  ['Sunny picnic or rainy day indoors?', 'Sunny picnic', 'picnic', 'Rainy day in', 'rain'],
  ['Window seat on a train or on a plane?', 'On a train', 'train', 'On a plane', 'plane'],
  ['Camp in the mountains or by the sea?', 'In the mountains', 'tent', 'By the sea', 'sea'],
  ['Cake for breakfast or pancakes for dinner?', 'Cake for breakfast', 'cake', 'Pancakes for dinner', 'pancakes'],
  ['Country road or city lights?', 'Country road', 'country', 'City lights', 'city'],
  ['Sunset on the beach or sunrise on a mountain?', 'Beach sunset', 'sunset', 'Mountain sunrise', 'mountain'],
  ['A new book or a new album?', 'A new book', 'book', 'A new album', 'music'],
  ['Cookies and milk or coffee and cake?', 'Cookies and milk', 'cookie', 'Coffee and cake', 'coffee'],
  ['Long bike ride or long train ride?', 'Bike ride', 'bike', 'Train ride', 'train'],
  ['Snowed in or rained in?', 'Snowed in', 'snow', 'Rained in', 'rain'],
  ['Sandwich on a trail or pizza on the couch?', 'Trail sandwich', 'sandwich', 'Couch pizza', 'pizza'],
  ['Play a game or tell stories by the fire?', 'Play a game', 'game', 'Stories by the fire', 'campfire'],
  ['Bright sun or soft clouds?', 'Bright sun', 'sun', 'Soft clouds', 'clouds'],
  ['Tea in the garden or coffee in town?', 'Tea in the garden', 'tea', 'Coffee in town', 'coffee'],
  ['Pie from the oven or tacos from a truck?', 'Pie', 'pie', 'Tacos', 'taco'],
  ['A week in a tent or a week on a boat?', 'In a tent', 'tent', 'On a boat', 'sea'],
  ['Autumn hike or summer swim?', 'Autumn hike', 'leaf', 'Summer swim', 'beach'],
  ['Moonlit walk or sunrise walk?', 'Moonlit walk', 'moon', 'Sunrise walk', 'sunrise'],
  ['Popcorn or cookies with the movie?', 'Popcorn', 'popcorn', 'Cookies', 'cookie'],
  ['Waffles with fruit or pancakes with syrup?', 'Waffles with fruit', 'waffle', 'Pancakes with syrup', 'pancakes'],
  ['Adopt a kitten or a puppy?', 'A kitten', 'cat', 'A puppy', 'dog'],
  ['Soup on a cold day or a picnic on a warm one?', 'Soup', 'soup', 'Picnic', 'picnic'],
  ['A cabin in the snow or a tent on the beach?', 'Snowy cabin', 'cabin', 'Beach tent', 'tent'],
  ['A day in the country or a day in the mountains?', 'The country', 'country', 'The mountains', 'mountain'],
  ['Sing in the car or listen to a story?', 'Sing', 'music', 'Listen to a story', 'car'],
];

// Questions to write an answer to.
const OPEN = [
  'What’s a meal from your childhood you miss?',
  'What made you laugh this week?',
  'Where would you go with a free Saturday?',
  'What should we do more of this winter?',
  'What was the best part of today?',
  'What’s a smell that takes you straight back somewhere?',
  'What song do you never skip?',
  'What’s the best gift you ever got?',
  'What’s a small thing that made today better?',
  'If we could have dinner anywhere tonight, where?',
  'What’s your favorite thing about this home?',
  'What’s something you’re looking forward to?',
  'What’s a food you could eat every week forever?',
  'What was your favorite game as a kid?',
  'What’s the nicest thing someone said to you lately?',
  'What would you do with one extra hour every day?',
  'What’s your favorite way to spend a rainy afternoon?',
  'What’s a place you’d love to see again?',
  'What’s the best thing you ever cooked?',
  'Who taught you something you still use?',
  'What’s a movie you can watch over and over?',
  'What’s one thing you’re proud of this month?',
  'What’s your favorite holiday tradition?',
  'What’s a tradition we should start?',
  'What did you want to be when you were little?',
  'What’s the coziest spot in the house?',
  'What’s a sound you love?',
  'If you could learn one thing overnight, what would it be?',
  'What’s the best trip you ever took?',
  'What’s a snack you’d never share?',
  'What’s something kind you saw someone do?',
  'What would be on your perfect pizza?',
  'What’s a word you just like saying?',
  'What’s the funniest thing that ever happened at dinner?',
  'What’s your favorite thing to do outside?',
  'What’s a book you wish you could read again for the first time?',
  'What was the highlight of your week?',
  'If today had a title, what would it be?',
  'What’s something new you tried lately?',
  'What’s the best breakfast you can imagine?',
  'Which season feels most like you?',
  'What’s a memory that always makes you smile?',
  'What’s something you’re grateful for today?',
  'What’s your favorite thing to do on a day off?',
  'What would you put in a time capsule from this year?',
  'What’s a dish you’d like to learn to make?',
  'Who would you love to have over for dinner?',
  'What’s the best advice you ever got?',
  'What’s a tiny luxury you love?',
  'What’s your favorite thing about weekends?',
  'If you could have any animal as a pet, which one?',
  'What’s the best thing you ate this week?',
  'What’s a place nearby we’ve never been to?',
  'What’s a song that reminds you of a good time?',
  'What’s your favorite room in any house you’ve lived in?',
  'What would your dream garden grow?',
  'What’s something that always calms you down?',
  'What’s a holiday you’d invent?',
  'What’s your favorite thing to wear?',
  'What’s a skill you’re glad you have?',
  'What was the best birthday you remember?',
  'What’s the first thing you’d do with a snow day?',
  'What’s a dessert you can never turn down?',
  'What would you name a boat?',
  'What’s one thing you want to do before the year ends?',
  'What’s the best view you’ve ever seen?',
  'What’s something you could talk about for an hour?',
  'What’s a good surprise you once got?',
  'What’s your favorite thing to do in the car?',
  'What’s a tiny thing you did well today?',
  'What was your favorite thing to eat at a fair?',
  'What’s a show you’d recommend to anyone?',
  'What’s the best sandwich there is?',
  'What’s a chore you secretly don’t mind?',
  'What would you plant if you had a whole field?',
  'What’s something you’ve changed your mind about?',
  'What’s a name you’ve always liked?',
  'What’s the best thing about this time of year?',
  'What’s a place that feels like a second home?',
  'What’s your favorite way to celebrate good news?',
  'What’s a recipe we should make again soon?',
  'What’s something you’d like to get better at?',
  'What’s the most beautiful thing you saw this week?',
  'What’s a game we should play this weekend?',
  'What’s your favorite thing to do before bed?',
  'What did someone do for you that you never forgot?',
  'What’s your favorite soup?',
  'What would you do on a perfect Sunday?',
  'What’s a color that makes you happy?',
  'What’s a story from your family you love hearing?',
  'What’s one thing you’d change about the kitchen?',
  'What would you bring to a potluck?',
  'What’s the best thing about mornings?',
  'What’s a town you’d like to wander around?',
  'What’s a habit you’re glad you started?',
  'What’s your favorite thing to do with friends?',
  'What’s something that surprised you lately?',
  'What’s the best thing about being your age?',
  'What’s a toy or thing you treasured as a kid?',
  'What’s your favorite fruit, and how do you like it?',
  'What’s something small you’re excited about tomorrow?',
  'What’s the best picnic food?',
  'What’s a job you’d try for one day?',
  'What’s a good deed that would be easy to do tomorrow?',
  'If our home had a motto, what would it be?',
  'What’s the best thing we did together this month?',
  'What’s your favorite thing to do when it snows?',
  'What’s a restaurant you’d go back to tomorrow?',
  'What’s a song you know every word of?',
  'What’s the best costume you ever wore?',
  'What’s a thing in this house you’d never give away?',
  'What’s your favorite kind of weather?',
  'What’s one thing you’d like to build or make?',
  'What’s the kindest thing you did this week?',
  'What’s a taste you didn’t like once and love now?',
  'What’s the best thing to put on toast?',
  'What’s a place you felt completely at peace?',
  'What’s your favorite thing to do in summer?',
  'What would you teach a class about?',
  'Who makes you laugh the most?',
  'What’s a movie that everyone should see once?',
  'What’s your favorite thing in the fridge right now?',
  'What’s something you’d do if it couldn’t go wrong?',
  'What’s the best cookie?',
  'What’s a thing you’re curious about lately?',
  'What’s a little thing that feels like a treat?',
  'What’s the best thing about where we live?',
  'What’s your favorite memory of a grandparent?',
  'What would you do with a whole day by yourself?',
  'What’s a celebration you’ll always remember?',
  'What’s the best part of a long drive?',
  'What’s a phrase people in your family always said?',
  'What would the perfect treehouse have in it?',
  'What’s a vegetable you really like?',
  'What’s the nicest thing about today’s weather?',
  'What’s a photo you love, and why?',
  'What do you wish there was more time for?',
  'What’s your go-to comfort food?',
  'What’s the best thing about a long weekend?',
  'What’s one thing you learned this week?',
  'What’s a place you’d like to show someone?',
  'What’s a game you always win?',
  'What’s the best ice cream flavor?',
  'What’s something you’re glad you didn’t miss?',
  'What would you cook to cheer someone up?',
  'What’s the best thing to do on the first warm day?',
  'What’s your favorite thing about your best friend?',
  'What’s a sound that means home to you?',
  'If you opened a shop, what would it sell?',
  'What’s something you’d like to do more slowly?',
  'What’s the best thing you’ve found by accident?',
  'What’s your favorite thing about autumn?',
  'What’s a little adventure we could have this month?',
  'What’s a cartoon or show you loved as a kid?',
  'What’s the best way to eat potatoes?',
  'What’s something that makes a house feel like home?',
  'What’s your favorite way to move, a walk, a swim, a dance?',
  'What’s a compliment you’d like to give someone here?',
  'What’s something you’d like to remember about today?',
  'What’s the best meal we’ve had at this table?',
  'What’s a place you’d visit in every season?',
  'What’s a rule you’d make if you ran the world for a day?',
  'What’s your favorite thing to do at the beach?',
  'What’s a thing you’re glad someone invented?',
  'What would be the theme of your dream party?',
  'What’s something you did for the first time this year?',
  'What’s the best thing to do when you can’t sleep?',
  'What’s your favorite pasta?',
  'What’s a moment this week you’d like to live again?',
  'What’s a museum, zoo or park you’d like to visit?',
  'What’s the most fun you’ve had in the rain?',
  'What’s a goal for next month?',
  'What’s a person you’d like to thank?',
  'What’s your favorite smell in the kitchen?',
  'What’s a tiny tradition only we have?',
  'What’s the best way to spend a birthday?',
  'What’s an animal you could watch for hours?',
  'What’s something you’re good at that few people know?',
  'What’s your favorite treat from a bakery?',
  'What’s the best seat in the house?',
  'What’s a thing you’d save up for?',
  'What’s the best sound to wake up to?',
  'What’s a nice thing about someone at this table?',
  'What would you do with a free plane ticket?',
  'What’s your favorite thing to do in spring?',
  'What’s a meal you’d make for a special guest?',
  'What’s something that made you feel proud of someone else?',
  'What’s the best thing to do with leftovers?',
  'What’s a song that makes you want to dance?',
  'What’s your favorite thing about your work or school?',
  'What’s the best way to start a morning?',
  'What’s a little thing you’d miss if it were gone?',
  'What’s a place from a story you’d like to visit?',
  'What’s the funniest word you know?',
  'What’s a thing that’s better homemade?',
  'What was the best part of last summer?',
  'What’s something you want to say thanks for?',
  'What would you do if you had the house to yourself?',
  'What’s the best thing to see at night?',
  'What’s a taste that means the holidays to you?',
  'What’s a great way to spend ten dollars?',
  'What’s something we own that tells a story?',
  'What’s your favorite thing to do at a park?',
  'What’s the best drink on a hot day?',
  'What’s the best drink on a cold day?',
  'What’s a hobby you’d like to try?',
  'What’s something that went better than you expected?',
  'What’s a place you like to sit and think?',
  'What’s your favorite thing about our street?',
  'What’s a movie snack you can’t do without?',
  'What’s something you’d like to hear more often?',
  'What’s one word for how today felt?',
  'What’s the best birthday cake?',
  'What’s a thing you could teach someone in five minutes?',
  'What would you do first in a new city?',
  'What’s the best thing that happened at work or school lately?',
  'What’s your favorite kind of evening?',
  'What’s a piece of music that gives you goosebumps?',
  'What’s a nickname you’ve had?',
  'What’s the best way to cheer you up?',
  'What’s something old that you love?',
  'What’s something brand new that you love?',
  'What would you put on the menu if we ran a diner?',
  'What’s a walk you’d happily take every day?',
  'What’s the best thing about a full table?',
  'What’s a tree, flower or plant you really like?',
  'What’s something you’d like to do together next weekend?',
  'What’s the best sleepover or late night you remember?',
  'What’s a place where you’ve felt really lucky?',
  'What’s your favorite spice or flavor?',
  'What’s a nice thing to do for a neighbor?',
  'What’s the bravest thing you’ve done?',
  'What’s a dinner you’d eat on your birthday?',
  'What’s something that always makes you hungry?',
  'What’s a moment you felt really listened to?',
  'What would the perfect day off start with?',
  'What’s the best board or card game ever?',
  'What’s a thing you can’t help smiling at?',
  'What’s your favorite sandwich filling?',
  'What’s a memory from this kitchen?',
  'What’s a season you’d make longer?',
  'What would you write on a note to yourself for next year?',
  'What’s a trip we should plan?',
  'What’s your favorite time of day?',
  'What’s the best thing about a slow morning?',
  'What’s a street food you love?',
  'What’s something that’s worth getting up early for?',
  'What’s a lesson you learned the fun way?',
  'What’s something you admire in someone you know?',
  'What’s the best soup for a sick day?',
  'What’s a thing you’d happily do for hours?',
  'What’s the best noise an animal makes?',
  'What’s a favorite thing from your last holiday?',
  'What would you grow on the windowsill?',
  'What’s a wish for the week ahead?',
  'What’s the best smell outdoors?',
  'What’s a meal that tastes better the next day?',
  'What’s a moment today you’d put in the book?',
  'What’s your favorite way to say thank you?',
  'What’s something you’d like to see from a hot-air balloon?',
  'What’s a tiny thing that says “I thought of you”?',
  'What’s your favorite thing about dinner time?',
  'What’s a place you remember from when you were small?',
  'What’s the best thing to dip, and in what?',
  'What’s a thing you’d like to celebrate soon?',
  'What’s your favorite kind of bread?',
  'What’s a day you’d like to do over, just for fun?',
  'What’s the best thing about a walk after dinner?',
  'What’s a taste of summer for you?',
  'What’s a taste of winter for you?',
  'What’s something you finished that felt great?',
  'What’s the best thing someone cooked for you?',
  'What’s a little thing you’re looking forward to this weekend?',
  'What’s a question you’d like to be asked?',
  'What’s your favorite way to help out at home?',
  'What’s a sight that means you’re nearly home?',
  'What’s the best topping for ice cream?',
  'What’s a thing you used to be afraid of and aren’t now?',
  'What would make tomorrow a good day?',
  'What’s your favorite kind of cheese?',
  'What’s a celebration food in your family?',
  'What’s a new place we should try eating at?',
  'What’s something you noticed today that nobody else did?',
  'What’s the best thing about having people over?',
  'What’s a piece of clothing with a story?',
  'What’s your favorite thing to make from scratch?',
  'What’s a song from when you were younger that you still love?',
  'What’s the best place for a nap?',
  'What’s something worth staying up late for?',
  'What’s the best thing about the first snow?',
  'What’s a moment you were glad to be home?',
  'What’s your favorite berry?',
  'What’s a thing you do that makes you feel like yourself?',
  'What’s something you’d like to hear a story about?',
  'What’s the best outdoor meal you’ve had?',
  'What’s a thing that made you say “wow” lately?',
  'What’s one thing you’d like us to cook together?',
  'What’s a holiday decoration you love?',
  'What’s the best thing to find in a lunch bag?',
  'What’s a favorite thing about the people in this home?',
  'What’s a wish you have for someone you love?',
  'What’s the best way to end a day?',
];

/** Every question: { text, a?: [label, picture], b?: [label, picture] }, a fixed order (never reorder: add at the end). */
export const QUESTIONS = OPEN.map((text) => ({ text }))
  .concat(CHOICES.map((c) => ({ text: c[0], a: [c[1], c[2]], b: [c[3], c[4]] })));

// ---------------------------------------------------------------------------------------
// Days (pure)
// ---------------------------------------------------------------------------------------
const two = (n) => (n < 10 ? '0' : '') + n;
/** 'YYYY-MM-DD' of a date, in this screen's own time. */
export const dayKey = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
/** The date a key names (its midnight). */
export function keyDate(key) {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(key)) || [0, 2000, 1, 1];
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
/** The evening a moment belongs to: today's from 5 PM, yesterday's before that. */
export function questionDay(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getHours() < NEW_AT ? 1 : 0));
  return dayKey(d);
}
/** Whole days from one key to another (clock changes don't count). */
export function daysBetween(from, to) {
  const a = keyDate(from);
  const b = keyDate(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}
/** The morning after a question's evening: when a sealed day opens. */
export function opensAt(day) {
  const d = keyDate(day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, MORNING);
}
/** Is it the evening a new question has just arrived (5 PM to midnight)? */
export const isEvening = (now = new Date()) => now.getHours() >= NEW_AT;

// ---------------------------------------------------------------------------------------
// The household's order (pure)
// ---------------------------------------------------------------------------------------
const orders = {};
/** The numbers 0..n-1 shuffled by a seed: the same seed always gives the same order. */
export function orderFor(seed, n) {
  const id = `${seed}/${n}`;
  if (orders[id]) return orders[id];
  let s = seed >>> 0;
  const rand = () => { // mulberry32
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const list = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const x = list[i]; list[i] = list[j]; list[j] = x;
  }
  orders[id] = list;
  return list;
}
/** A day's number: the first day is No. 1. */
export const dayNumber = (start, day) => Math.max(1, daysBetween(start, day) + 1);
/** Which question a day gets. */
export function questionIndex(seed, start, day, n = QUESTIONS.length) {
  return orderFor(seed, n)[(dayNumber(start, day) - 1) % n];
}

// ---------------------------------------------------------------------------------------
// Sealed or open (pure)
// ---------------------------------------------------------------------------------------
/** Who answers: everyone named in Settings, or one shared answer ('') when nobody is. */
export const slots = (names) => (names && names.length ? names.slice() : ['']);
const has = (answers, name) => !!(answers && Object.prototype.hasOwnProperty.call(answers, name) && answers[name]);
/** Who still has to answer. */
export const waiting = (names, answers) => slots(names).filter((n) => !has(answers, n));
/**
 * 'open': still sealed, people can answer. 'revealed': everyone has answered, or the
 * next morning has come and somebody had (the others are skipped).
 */
export function stateOf(names, answers, day, now = new Date()) {
  const left = waiting(names, answers).length;
  if (!left) return 'revealed';
  const some = left < slots(names).length;
  return some && now.getTime() >= opensAt(day).getTime() ? 'revealed' : 'open';
}
/** Keep only the newest `keep` days. */
export function prune(days, keep = KEEP_DAYS) {
  const keys = Object.keys(days).sort();
  if (keys.length <= keep) return days;
  const out = {};
  keys.slice(keys.length - keep).forEach((k) => { out[k] = days[k]; });
  return out;
}
/** "Alex & Jordan’s book", "The Riveras’ book", "The book". */
export function bookTitle(name) {
  const n = String(name || '').trim();
  if (!n) return 'The book';
  return `${n}${/s$/i.test(n) ? '’' : '’s'} book`;
}
/** What Home says in the evening while somebody still has to answer (null otherwise). */
export function homeText(t, now = new Date()) {
  if (!isEvening(now) || t.state !== 'open' || !t.waiting.length) return null;
  const done = t.names.filter((n) => t.waiting.indexOf(n) < 0);
  if (!done.length || !t.names[0]) return t.text;
  if (t.names.length === 2) return `${done[0]} answered · ${t.waiting[0]}’s turn`;
  return `${done.length} of ${t.names.length} answered`;
}

// ---------------------------------------------------------------------------------------
// What's kept
// ---------------------------------------------------------------------------------------
const KEY = 'question.v1';
const EVENT = 'question-changed';
let data = null;

function load() {
  if (data) return data;
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { d = null; }
  if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
  if (!d.days || typeof d.days !== 'object' || Array.isArray(d.days)) d.days = {};
  if (typeof d.seed !== 'number') d.seed = 0;
  if (!/^\d{4}-\d\d-\d\d$/.test(d.start || '')) d.start = '';
  data = d;
  return d;
}
function save(quiet) {
  data.days = prune(data.days);
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage full: it stays for this visit */ }
  if (!quiet) { try { window.dispatchEvent(new Event(EVENT)); } catch (e) { /* no window */ } }
}
/** Forget what was read (tests; a wipe of the screen's storage). */
export function reload() { data = null; }

const householdNames = () => getFamily().people.map((p) => String(p).trim()).filter(Boolean);

/**
 * The question on the screen now:
 * { day, n, text, a, b (a quick choice's [label, picture]), names (who answers; [''] = shared),
 *   answers: { name: words }, waiting: [name], state: 'open'|'revealed', evening }
 */
export function today(now = new Date()) {
  const d = load();
  const day = questionDay(now);
  if (!d.seed || !d.start || d.start > day) { // the first visit (or the clock went back before it)
    if (!d.seed) d.seed = 1 + Math.floor(Math.random() * 2147483646);
    d.start = day;
    save(true);
  }
  const kept = d.days[day];
  const q = QUESTIONS[questionIndex(d.seed, d.start, day)];
  const names = slots(kept ? kept.p : householdNames());
  const answers = kept ? kept.a : {};
  return {
    day,
    n: kept ? kept.n : dayNumber(d.start, day),
    text: kept ? kept.q : q.text,
    a: kept ? (kept.c ? [kept.c[0], kept.c[1]] : null) : q.a || null,
    b: kept ? (kept.c ? [kept.c[2], kept.c[3]] : null) : q.b || null,
    names,
    answers,
    waiting: waiting(names, answers),
    state: stateOf(names, answers, day, now),
    evening: isEvening(now),
  };
}

/**
 * Seal somebody's answer to the question on the screen ('' = the shared answer).
 * `day` (from today().day) keeps an answer typed across 5 PM with its own question.
 * Returns the question as it now stands, or null when nothing was written.
 */
export function answer(name, words, now = new Date(), day = questionDay(now)) {
  const text = String(words || '').replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER);
  const t = today(now);
  if (!text || day !== t.day || t.state !== 'open' || t.names.indexOf(name) < 0 || has(t.answers, name)) return null;
  const d = load();
  if (!d.days[day]) {
    d.days[day] = { n: t.n, q: t.text, p: t.names, a: {} };
    if (t.a && t.b) d.days[day].c = [t.a[0], t.a[1], t.b[0], t.b[1]];
  }
  d.days[day].a[name] = text;
  save();
  return today(now);
}

/** Take an answer back (Undo, while the day is still sealed). */
export function unanswer(name, now = new Date()) {
  const d = load();
  const t = today(now);
  const kept = d.days[t.day];
  if (!kept || t.state !== 'open' || !has(kept.a, name)) return false;
  delete kept.a[name];
  if (!Object.keys(kept.a).length) delete d.days[t.day];
  save();
  return true;
}

const page = (day, e) => ({ day, n: e.n, text: e.q, a: e.c ? [e.c[0], e.c[1]] : null, b: e.c ? [e.c[2], e.c[3]] : null, names: slots(e.p), answers: e.a || {} });
/** The book: every opened day, newest first: [{ day, n, text, a, b, names, answers }]. */
export function book(now = new Date()) {
  const d = load();
  return Object.keys(d.days).sort().reverse()
    .filter((day) => stateOf(d.days[day].p, d.days[day].a, day, now) === 'revealed')
    .map((day) => page(day, d.days[day]));
}
/** One day of the book, or null (also null while it is still sealed). */
export function bookDay(day, now = new Date()) {
  const e = load().days[day];
  return e && stateOf(e.p, e.a, day, now) === 'revealed' ? page(day, e) : null;
}

// ---------------------------------------------------------------------------------------
// For Home, the menu and anything that wants to know
// ---------------------------------------------------------------------------------------
/** Home's one line: only in the evening, only while somebody still has to answer. */
export function homeLine(now = new Date()) {
  const text = homeText(today(now), now);
  return text ? { label: 'Tonight’s question', text, href: '#/question', tone: 'due' } : null;
}

/** The menu card: the question, who has answered, and a way in. */
export function menuCard(now = new Date()) {
  const t = today(now);
  const open = t.state === 'open';
  const lines = [t.text];
  if (t.names[0]) {
    if (t.names.length <= 3) t.names.forEach((n) => lines.push(`${n} · ${has(t.answers, n) ? 'Answered' : open ? 'Not yet' : 'Skipped'}`));
    else lines.push(`${t.names.length - t.waiting.length} of ${t.names.length} answered`);
  }
  return {
    title: 'Question',
    side: `No. ${t.n}`,
    lines,
    badge: open && t.evening ? t.waiting.length : 0,
    action: { label: open ? 'Answer' : 'Read', href: '#/question' },
  };
}
/** The card's colours (the screen's evening blue), as the menu's cards take them. */
export const menuCardLook = () => ({
  bg: 'radial-gradient(ellipse 300px 220px at 90% 0%, rgba(255,190,110,.32), rgba(255,190,110,0)), linear-gradient(180deg, #2C2E5C, #15172F)',
  ink: '#FFF4E2',
  soft: '#F5C26B',
});
const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TICK = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#A9E3C4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
/**
 * The card's inside, as drawn on its board (the menu's own .lc-head / .lc-go classes;
 * `face(name, size)` draws somebody's round badge: pass ui.js's avatar).
 */
export function menuCardHtml(face = () => '', now = new Date()) {
  const t = today(now);
  const open = t.state === 'open';
  const row = (n) => `<div style="display:flex;align-items:center;font:600 19px Inter,sans-serif">${face(n, 40)}<span style="margin-left:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(n)}</span>`
    + `<span style="margin-left:auto;padding-left:10px;display:flex;color:#B9BEDF;font-weight:500;white-space:nowrap">${has(t.answers, n) ? TICK : open ? 'Not yet' : 'Skipped'}</span></div>`;
  let who = '';
  if (t.names[0]) {
    who = t.names.length <= 3
      ? t.names.map((n, i) => `<div style="margin-top:${i ? 12 : 0}px">${row(n)}</div>`).join('')
      : `<div style="display:flex;align-items:center">${t.names.map((n) => `<span style="margin-right:6px;display:flex;opacity:${has(t.answers, n) ? 1 : 0.45}">${face(n, 40)}</span>`).join('')}</div>`;
  }
  return `<div class="lc-head"><span class="lc-name">Question</span><span class="lc-side" style="color:#F5C26B">No. ${t.n}</span></div>
    <div style="font:italic 500 ${t.text.length > 52 ? 25 : 29}px/1.28 Fraunces,Georgia,serif;margin-top:${t.names.length > 2 ? 20 : 30}px">${escHtml(t.text)}</div>
    <div style="position:absolute;left:26px;right:26px;bottom:100px">${who}</div>
    <div class="lc-go" style="background:#F5C26B;color:#1B1D3D;font:700 19px Inter,sans-serif">${open ? 'Answer' : 'Read'}</div>`;
}

/** Tell me when an answer is sealed or taken back. Returns the way to stop. */
export function onChanged(cb) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
