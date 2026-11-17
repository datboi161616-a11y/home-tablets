// Kid-friendly space & flight trivia bank for Tom's Trivia screen.
// q = question, o = four options, a = index of the right option, why = the fun fact shown after.
// Keep questions under ~90 characters and options under ~28 so they fit the layout.
export const QUESTIONS = [
  { q: 'What does it mean when a plane sets its transponder to squawk 7700?', o: ['Radio failure', 'Hijacking', 'General emergency', 'Landing clearance'], a: 2, why: '7700 is the code for an emergency. 7600 means radio failure and 7500 means hijacking.' },
  { q: 'How long does the Space Station take to circle the Earth once?', o: ['About 90 minutes', 'About 6 hours', 'About 24 hours', 'About a week'], a: 0, why: 'It goes around about 16 times a day at roughly 17,500 mph.' },
  { q: 'What is the largest passenger airliner ever built?', o: ['Boeing 747-8', 'Airbus A380', 'Boeing 777X', 'Concorde'], a: 1, why: 'The double-decker A380 can seat over 800 people in an all-economy layout.' },
  { q: 'In what year did the Wright brothers make their first powered flight?', o: ['1899', '1903', '1910', '1927'], a: 1, why: 'December 17, 1903, at Kitty Hawk. The first flight lasted 12 seconds.' },
  { q: 'Who was the first person to walk on the Moon?', o: ['Buzz Aldrin', 'Yuri Gagarin', 'Neil Armstrong', 'John Glenn'], a: 2, why: 'Neil Armstrong, July 20, 1969, on Apollo 11.' },
  { q: 'Who was the first person ever to travel into space?', o: ['Yuri Gagarin', 'Alan Shepard', 'John Glenn', 'Neil Armstrong'], a: 0, why: 'Yuri Gagarin orbited Earth once on April 12, 1961, in Vostok 1.' },
  { q: 'Which planet is closest to the Sun?', o: ['Venus', 'Mars', 'Mercury', 'Earth'], a: 2, why: 'Mercury is closest. It zips around the Sun in just 88 days.' },
  { q: 'Which is the biggest planet in our solar system?', o: ['Saturn', 'Jupiter', 'Neptune', 'Earth'], a: 1, why: 'Jupiter is so big that more than 1,300 Earths could fit inside it.' },
  { q: 'Which planet is called the Red Planet?', o: ['Mars', 'Venus', 'Mercury', 'Jupiter'], a: 0, why: 'Mars is red because its dusty ground is full of rusty iron.' },
  { q: 'Which planet is famous for its big, bright rings?', o: ['Uranus', 'Neptune', 'Jupiter', 'Saturn'], a: 3, why: 'All four giant planets have rings, but Saturn’s icy rings are by far the brightest.' },
  { q: 'About how long does sunlight take to reach Earth?', o: ['1 second', '8 minutes', '3 hours', '1 day'], a: 1, why: 'Light from the Sun takes about 8 minutes 20 seconds to travel 93 million miles.' },
  { q: 'Which planet is the hottest?', o: ['Mercury', 'Venus', 'Mars', 'Jupiter'], a: 1, why: 'Venus! Its thick clouds trap heat, so it’s even hotter than Mercury — over 850°F.' },
  { q: 'What is the name of our galaxy?', o: ['Andromeda', 'Whirlpool', 'Milky Way', 'Sombrero'], a: 2, why: 'We live in the Milky Way, a spiral of hundreds of billions of stars.' },
  { q: 'Who was the first American woman in space?', o: ['Sally Ride', 'Amelia Earhart', 'Mae Jemison', 'Peggy Whitson'], a: 0, why: 'Sally Ride flew on the Space Shuttle Challenger in 1983.' },
  { q: 'Who was the first woman to travel into space?', o: ['Sally Ride', 'Valentina Tereshkova', 'Eileen Collins', 'Christa McAuliffe'], a: 1, why: 'Valentina Tereshkova orbited Earth 48 times in 1963.' },
  { q: 'Which NASA rover landed on Mars in February 2021?', o: ['Curiosity', 'Spirit', 'Perseverance', 'Sojourner'], a: 2, why: 'Perseverance is collecting rock samples that may one day come back to Earth.' },
  { q: 'What was the name of the little helicopter that flew on Mars?', o: ['Ingenuity', 'Dragonfly', 'Hummingbird', 'Spirit'], a: 0, why: 'Ingenuity made the first powered flight on another planet in 2021 — then 71 more!' },
  { q: 'What kind of object is the Sun?', o: ['A planet', 'A star', 'A comet', 'A moon'], a: 1, why: 'The Sun is a star — just much closer to us than all the others.' },
  { q: 'How many planets are in our solar system?', o: ['7', '8', '9', '10'], a: 1, why: 'Eight: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune.' },
  { q: 'In 2006, Pluto was renamed as what kind of object?', o: ['A moon', 'A comet', 'A dwarf planet', 'An asteroid'], a: 2, why: 'Pluto became a dwarf planet because it shares its orbit with lots of other icy objects.' },
  { q: 'Which company builds the Falcon 9 rocket?', o: ['Boeing', 'Blue Origin', 'SpaceX', 'Rocket Lab'], a: 2, why: 'SpaceX lands Falcon 9 boosters so they can fly again — some have flown over 25 times.' },
  { q: 'Which force pushes up on a plane’s wings to keep it flying?', o: ['Drag', 'Lift', 'Thrust', 'Weight'], a: 1, why: 'Lift comes from air flowing over the wings. Thrust pushes forward, drag pulls back.' },
  { q: 'Which force slows a plane down as it pushes through the air?', o: ['Lift', 'Thrust', 'Drag', 'Gravity'], a: 2, why: 'Drag is air resistance. Smooth, pointy shapes help planes make less of it.' },
  { q: 'Which passenger jet flew at twice the speed of sound?', o: ['Boeing 747', 'Concorde', 'Airbus A380', 'Boeing 787'], a: 1, why: 'Concorde crossed the Atlantic in about 3½ hours. It retired in 2003.' },
  { q: 'Who made the first solo nonstop flight across the Atlantic Ocean?', o: ['Charles Lindbergh', 'Orville Wright', 'Amelia Earhart', 'Chuck Yeager'], a: 0, why: 'Charles Lindbergh flew from New York to Paris in 1927 in the Spirit of St. Louis.' },
  { q: 'Amelia Earhart was the first woman to fly solo across which ocean?', o: ['Pacific', 'Indian', 'Atlantic', 'Arctic'], a: 2, why: 'She flew across the Atlantic alone in 1932, from Newfoundland to Northern Ireland.' },
  { q: 'What color is an airplane’s “black box” flight recorder?', o: ['Black', 'Bright orange', 'Silver', 'Green'], a: 1, why: 'It’s painted bright orange so searchers can find it easily after an accident.' },
  { q: 'What does NASA stand for?', o: ['National Aeronautics and Space Administration', 'North American Space Agency', 'National Astronaut Space Academy', 'New Air and Space Association'], a: 0, why: 'NASA was founded in 1958. “Aeronautics” means the science of flight.' },
  { q: 'Which planet spins tipped over on its side?', o: ['Neptune', 'Uranus', 'Saturn', 'Mars'], a: 1, why: 'Uranus is tilted about 98°, so it rolls around the Sun like a ball.' },
  { q: 'What do we call a space rock that lands on the ground?', o: ['Meteor', 'Comet', 'Meteorite', 'Asteroid'], a: 2, why: 'In the sky it’s a meteor (shooting star). If it reaches the ground, it’s a meteorite.' },
  { q: 'Which planet shines brightest in our night sky?', o: ['Mars', 'Jupiter', 'Venus', 'Saturn'], a: 2, why: 'Venus is so bright it’s often called the Evening Star or Morning Star.' },
  { q: 'How many people have walked on the Moon?', o: ['2', '6', '12', '24'], a: 2, why: 'Twelve astronauts walked on the Moon during six Apollo landings from 1969 to 1972.' },
  { q: 'What was the name of Apollo 11’s lunar landing module?', o: ['Columbia', 'Eagle', 'Falcon', 'Snoopy'], a: 1, why: '“The Eagle has landed.” Columbia was the command module that stayed in orbit.' },
  { q: 'What is the name of NASA’s program to send astronauts back to the Moon?', o: ['Gemini', 'Mercury', 'Artemis', 'Skylab'], a: 2, why: 'Artemis was Apollo’s twin sister in Greek myths.' },
  { q: 'Which giant space telescope launched on Christmas Day 2021?', o: ['Hubble', 'James Webb', 'Kepler', 'Spitzer'], a: 1, why: 'Webb sees infrared light and orbits about 1 million miles from Earth.' },
  { q: 'In what year was the Hubble Space Telescope launched?', o: ['1977', '1990', '2001', '2009'], a: 1, why: 'Space Shuttle Discovery carried Hubble to orbit in April 1990.' },
  { q: 'Where is Olympus Mons, the biggest volcano in the solar system?', o: ['Venus', 'Earth', 'Mars', 'Io'], a: 2, why: 'Olympus Mons on Mars is about 2½ times taller than Mount Everest.' },
  { q: 'What is Jupiter’s Great Red Spot?', o: ['A giant storm', 'A volcano', 'A crater', 'A red moon'], a: 0, why: 'It’s a storm bigger than Earth that has been raging for hundreds of years.' },
  { q: 'What is the biggest moon in the solar system?', o: ['Our Moon', 'Titan', 'Ganymede', 'Europa'], a: 2, why: 'Jupiter’s moon Ganymede is even bigger than the planet Mercury.' },
  { q: 'Which moon of Saturn has a thick atmosphere and lakes of methane?', o: ['Titan', 'Europa', 'Phobos', 'Io'], a: 0, why: 'Titan is the only moon with a thick atmosphere. NASA’s Dragonfly drone will fly there.' },
  { q: 'Who was the first pilot to fly faster than the speed of sound?', o: ['Neil Armstrong', 'Chuck Yeager', 'Charles Lindbergh', 'John Glenn'], a: 1, why: 'Chuck Yeager broke the sound barrier in the Bell X-1 rocket plane in 1947.' },
  { q: 'What is the speed of sound called in aviation?', o: ['Mach 1', 'Warp 1', 'Knot 1', 'Sonic 10'], a: 0, why: 'Mach 1 is the speed of sound — around 760 mph near the ground.' },
  { q: 'In the pilots’ alphabet, which word stands for the letter B?', o: ['Baker', 'Bravo', 'Beta', 'Boston'], a: 1, why: 'Alfa, Bravo, Charlie, Delta… pilots spell words this way so radio calls are clear.' },
  { q: 'In the pilots’ alphabet, which word stands for the letter Z?', o: ['Zebra', 'Zero', 'Zulu', 'Zeppelin'], a: 2, why: 'Zulu is also pilot-speak for UTC — the time zone all pilots use.' },
  { q: 'A plane takes off from Runway 27. Which way is it pointing?', o: ['North', 'East', 'South', 'West'], a: 3, why: 'Runway numbers are compass headings without the last zero: 27 means about 270°, west.' },
  { q: 'Which planet has the shortest year?', o: ['Mercury', 'Venus', 'Mars', 'Neptune'], a: 0, why: 'A year on Mercury is just 88 Earth days long.' },
  { q: 'What does a light-year measure?', o: ['Time', 'Distance', 'Brightness', 'Speed'], a: 1, why: 'It’s how far light travels in a year — about 5.9 trillion miles.' },
  { q: 'What was the name of the first artificial satellite?', o: ['Explorer 1', 'Sputnik 1', 'Vanguard', 'Telstar'], a: 1, why: 'The Soviet Union launched Sputnik 1 in October 1957. It beeped as it orbited.' },
  { q: 'What was the name of the first animal to orbit the Earth?', o: ['Ham', 'Laika', 'Félicette', 'Albert'], a: 1, why: 'Laika, a dog, orbited aboard Sputnik 2 in November 1957.' },
  { q: 'Why do astronauts float inside the Space Station?', o: ['There’s no gravity', 'They’re always falling around Earth', 'Magnetic boots', 'Special air'], a: 1, why: 'Gravity is still strong up there — the station and crew are falling around Earth together.' },
  { q: 'Which planet is farthest from the Sun?', o: ['Uranus', 'Pluto', 'Saturn', 'Neptune'], a: 3, why: 'Neptune is about 2.8 billion miles from the Sun. One year there lasts 165 Earth years.' },
  { q: 'In what year did the Space Shuttle first launch?', o: ['1969', '1975', '1981', '1990'], a: 2, why: 'Columbia launched on April 12, 1981 — 20 years to the day after Gagarin’s flight.' },
  { q: 'Which part of a plane turns its nose left and right?', o: ['Rudder', 'Flaps', 'Landing gear', 'Ailerons'], a: 0, why: 'The rudder is on the tail fin. Ailerons tilt the wings, and the elevator moves the nose up and down.' },
  { q: 'What makes the northern lights glow?', o: ['Moonlight on ice', 'Particles from the Sun', 'City lights', 'Lightning'], a: 1, why: 'Particles from the Sun hit gases high in our atmosphere and make them glow.' },
  { q: 'What is a comet mostly made of?', o: ['Ice and dust', 'Hot lava', 'Pure metal', 'Gas only'], a: 0, why: 'Comets are dirty snowballs. Near the Sun the ice turns to gas and makes a long tail.' },
  { q: 'Which spacecraft is the farthest human-made object from Earth?', o: ['Voyager 1', 'New Horizons', 'Hubble', 'Pioneer 10'], a: 0, why: 'Voyager 1 launched in 1977 and is now in interstellar space, still sending signals.' },
  { q: 'What do pilots call the room at the front where they fly the plane?', o: ['The galley', 'The cockpit', 'The hangar', 'The cabin'], a: 1, why: 'The cockpit, also called the flight deck. The galley is the plane’s kitchen.' },
];

/** Small seeded random generator (mulberry32) so everyone sees the same daily set. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rand) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
