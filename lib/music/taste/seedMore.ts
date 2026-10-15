import { A, AF, GM, LA, NA, UK } from "./seedKit";
import type { SeedArtist } from "./types";

/**
 * Second batch of the editorial seed (same rules as seed.ts): hand-written estimates by us at Ikosagon,
 * not measured audio features and not chart data. Track metadata is hand-entered; where an album was
 * not certain it is left blank rather than guessed.
 * Vector order: energy, acoustic, lyric, polish, mainstream, tempo.
 */
export const EXTRA_ARTISTS: SeedArtist[] = [
  // Pop
  A("olivia-rodrigo", "Olivia Rodrigo", ["Pop", "Rock / Alt"], NA, 2021, [0.5, 0.3, 0.85, 0.8, 0.93, 0.5], [
    ["drivers license", "SOUR", 2021, "heartbreak", { energy: 0.3, tempo: 0.35 }],
    ["good 4 u", "SOUR", 2021, "rebellion,heartbreak", { energy: 0.85, tempo: 0.8 }],
    ["vampire", "GUTS", 2023, "heartbreak,resilience"],
  ]),
  A("sabrina-carpenter", "Sabrina Carpenter", ["Pop"], NA, 2024, [0.65, 0.1, 0.5, 0.9, 0.9, 0.65], [
    ["Espresso", "Short n' Sweet", 2024, "party,love"],
    ["Please Please Please", "Short n' Sweet", 2024, "love,heartbreak"],
    ["Nonsense", "emails i can't send", 2022, "party,love"],
  ]),
  A("bruno-mars", "Bruno Mars", ["Pop", "R&B / Soul"], NA, 2013, [0.7, 0.25, 0.5, 0.92, 0.97, 0.65], [
    ["Uptown Funk", "Uptown Special", 2014, "party"],
    ["Just the Way You Are", "Doo-Wops & Hooligans", 2010, "love", { energy: 0.5, tempo: 0.45 }],
    ["When I Was Your Man", "Unorthodox Jukebox", 2012, "heartbreak,nostalgia", { energy: 0.2, tempo: 0.25 }],
  ]),
  A("rihanna", "Rihanna", ["Pop", "R&B / Soul"], NA, 2012, [0.7, 0.08, 0.45, 0.92, 0.98, 0.6], [
    ["Umbrella", "Good Girl Gone Bad", 2007, "love,resilience"],
    ["Diamonds", "Unapologetic", 2012, "love,escapism", { energy: 0.55, tempo: 0.45 }],
    ["Needed Me", "Anti", 2016, "rebellion,heartbreak", { energy: 0.45, tempo: 0.4 }],
  ]),
  A("adele", "Adele", ["Pop", "R&B / Soul"], UK, 2011, [0.4, 0.5, 0.85, 0.85, 0.95, 0.35], [
    ["Rolling in the Deep", "21", 2010, "heartbreak,resilience", { energy: 0.7, tempo: 0.6 }],
    ["Someone Like You", "21", 2011, "heartbreak,nostalgia", { energy: 0.2, tempo: 0.25 }],
    ["Hometown Glory", "19", 2007, "roots,nostalgia"],
  ]),
  A("elton-john", "Elton John", ["Pop", "Rock / Alt"], UK, 1973, [0.45, 0.5, 0.85, 0.75, 0.95, 0.4], [
    ["Rocket Man", "Honky Château", 1972, "escapism,introspection"],
    ["Tiny Dancer", "Madman Across the Water", 1971, "nostalgia,love"],
    ["Goodbye Yellow Brick Road", "Goodbye Yellow Brick Road", 1973, "nostalgia,roots"],
  ]),
  A("abba", "ABBA", ["Pop"], GM, 1977, [0.65, 0.3, 0.55, 0.9, 0.95, 0.6], [
    ["Dancing Queen", "Arrival", 1976, "party,nostalgia"],
    ["Mamma Mia", "ABBA", 1975, "love,party"],
    ["The Winner Takes It All", "Super Trouper", 1980, "heartbreak", { energy: 0.3, tempo: 0.3 }],
  ]),
  A("bts", "BTS", ["Pop"], GM, 2021, [0.75, 0.1, 0.4, 0.93, 0.95, 0.65], [
    ["Dynamite", "BE", 2020, "party,resilience"],
    ["Butter", "Butter", 2021, "love,party"],
    ["Spring Day", "You Never Walk Alone", 2017, "nostalgia,heartbreak", { energy: 0.4, tempo: 0.4 }],
  ]),
  A("madonna", "Madonna", ["Pop"], NA, 1990, [0.7, 0.15, 0.45, 0.9, 0.97, 0.7], [
    ["Like a Prayer", "Like a Prayer", 1989, "faith,love"],
    ["Vogue", "I'm Breathless", 1990, "party,escapism"],
    ["Ray of Light", "Ray of Light", 1998, "escapism,faith"],
  ]),
  A("lady-gaga", "Lady Gaga", ["Pop"], NA, 2010, [0.75, 0.2, 0.5, 0.92, 0.97, 0.65], [
    ["Bad Romance", "The Fame Monster", 2009, "rebellion,love"],
    ["Shallow", "A Star Is Born (Soundtrack)", 2018, "love,resilience", { energy: 0.45, acoustic: 0.5 }],
    ["Poker Face", "The Fame", 2008, "party"],
  ]),
  A("prince", "Prince", ["Pop", "R&B / Soul", "Rock / Alt"], NA, 1985, [0.65, 0.25, 0.55, 0.8, 0.9, 0.6], [
    ["Purple Rain", "Purple Rain", 1984, "love,faith", { energy: 0.5, tempo: 0.35 }],
    ["When Doves Cry", "Purple Rain", 1984, "heartbreak,rebellion"],
    ["Kiss", "Parade", 1986, "love,party"],
  ]),

  // Hip-hop / Rap
  A("jay-z", "Jay-Z", ["Hip-hop / Rap"], NA, 2003, [0.65, 0.1, 0.95, 0.8, 0.95, 0.5], [
    ["99 Problems", "The Black Album", 2003, "rebellion,hustle"],
    ["Empire State of Mind", "The Blueprint 3", 2009, "hustle,roots"],
    ["Song Cry", "The Blueprint", 2001, "heartbreak,introspection", { energy: 0.4 }],
  ]),
  A("lauryn-hill", "Lauryn Hill", ["Hip-hop / Rap", "R&B / Soul"], NA, 1998, [0.5, 0.5, 0.9, 0.65, 0.8, 0.5], [
    ["Doo Wop (That Thing)", "The Miseducation of Lauryn Hill", 1998, "social,resilience"],
    ["Ex-Factor", "The Miseducation of Lauryn Hill", 1998, "heartbreak", { energy: 0.35, tempo: 0.35 }],
    ["To Zion", "The Miseducation of Lauryn Hill", 1998, "love,faith", { energy: 0.3, acoustic: 0.7 }],
  ]),
  A("2pac", "2Pac", ["Hip-hop / Rap"], NA, 1995, [0.65, 0.15, 0.85, 0.6, 0.9, 0.5], [
    ["California Love", "All Eyez on Me", 1995, "party,roots", { energy: 0.8, tempo: 0.65 }],
    ["Changes", "Greatest Hits", 1998, "social,resilience"],
    ["Dear Mama", "Me Against the World", 1995, "love,roots", { energy: 0.4, tempo: 0.35 }],
  ]),
  A("notorious-big", "The Notorious B.I.G.", ["Hip-hop / Rap"], NA, 1995, [0.55, 0.1, 0.95, 0.65, 0.85, 0.45], [
    ["Juicy", "Ready to Die", 1994, "hustle,nostalgia"],
    ["Hypnotize", "Life After Death", 1997, "party,hustle"],
    ["Suicidal Thoughts", "Ready to Die", 1994, "introspection", { energy: 0.3, tempo: 0.3 }],
  ]),
  A("outkast", "OutKast", ["Hip-hop / Rap", "R&B / Soul"], NA, 2000, [0.7, 0.25, 0.8, 0.65, 0.8, 0.65], [
    ["Hey Ya!", "Speakerboxxx/The Love Below", 2003, "love,party", { energy: 0.85, tempo: 0.8 }],
    ["Ms. Jackson", "Stankonia", 2000, "heartbreak,social"],
    ["Rosa Parks", "Aquemini", 1998, "social,roots"],
  ]),
  A("cardi-b", "Cardi B", ["Hip-hop / Rap"], NA, 2018, [0.85, 0.05, 0.6, 0.85, 0.9, 0.6], [
    ["Bodak Yellow", "Invasion of Privacy", 2017, "hustle,resilience"],
    ["WAP", "Single", 2020, "party"],
    ["I Like It", "Invasion of Privacy", 2018, "party,hustle"],
  ]),
  A("lil-wayne", "Lil Wayne", ["Hip-hop / Rap"], NA, 2008, [0.65, 0.1, 0.85, 0.75, 0.9, 0.5], [
    ["Lollipop", "Tha Carter III", 2008, "party,love"],
    ["A Milli", "Tha Carter III", 2008, "hustle,rebellion"],
    ["How to Love", "Tha Carter IV", 2011, "love,heartbreak", { energy: 0.4, tempo: 0.4 }],
  ]),
  A("childish-gambino", "Childish Gambino", ["Hip-hop / Rap", "R&B / Soul", "Other / Hybrid"], NA, 2018, [0.5, 0.3, 0.75, 0.7, 0.85, 0.45], [
    ["Redbone", "\"Awaken, My Love!\"", 2016, "love,escapism"],
    ["This Is America", "Single", 2018, "social,rebellion"],
    ["3005", "Because the Internet", 2013, "love,resilience"],
  ]),
  A("wu-tang-clan", "Wu-Tang Clan", ["Hip-hop / Rap"], NA, 1994, [0.6, 0.1, 0.9, 0.25, 0.6, 0.5], [
    ["C.R.E.A.M.", "Enter the Wu-Tang (36 Chambers)", 1993, "hustle,social", { energy: 0.45 }],
    ["Protect Ya Neck", "Single", 1992, "rebellion,hustle"],
    ["Triumph", "Wu-Tang Forever", 1997, "hustle,rebellion"],
  ]),
  A("mf-doom", "MF DOOM", ["Hip-hop / Rap"], NA, 2004, [0.5, 0.2, 1, 0.3, 0.3, 0.5], [
    ["Rapp Snitch Knishes", "Mm..Food", 2004, "escapism,party"],
    ["All Caps", "Madvillainy", 2004, "escapism,rebellion"],
    ["Doomsday", "Operation: Doomsday", 1999, "rebellion,hustle"],
  ]),

  // R&B / Soul
  A("whitney-houston", "Whitney Houston", ["R&B / Soul", "Pop"], NA, 1987, [0.6, 0.15, 0.55, 0.95, 0.95, 0.6], [
    ["I Wanna Dance with Somebody (Who Loves Me)", "Whitney", 1987, "party,love", { energy: 0.85, tempo: 0.75 }],
    ["I Will Always Love You", "The Bodyguard (Soundtrack)", 1992, "love,heartbreak", { energy: 0.35, tempo: 0.3 }],
    ["How Will I Know", "Whitney Houston", 1985, "love"],
  ]),
  A("usher", "Usher", ["R&B / Soul"], NA, 2004, [0.65, 0.1, 0.5, 0.9, 0.9, 0.6], [
    ["Yeah!", "Confessions", 2004, "party"],
    ["Burn", "Confessions", 2004, "heartbreak", { energy: 0.4, tempo: 0.35 }],
    ["U Remind Me", "8701", 2001, "love,heartbreak"],
  ]),
  A("alicia-keys", "Alicia Keys", ["R&B / Soul", "Pop"], NA, 2004, [0.45, 0.45, 0.7, 0.85, 0.9, 0.4], [
    ["Fallin'", "Songs in A Minor", 2001, "love,heartbreak"],
    ["No One", "As I Am", 2007, "love"],
    ["If I Ain't Got You", "The Diary of Alicia Keys", 2003, "love,resilience", { energy: 0.3, acoustic: 0.6 }],
  ]),
  A("marvin-gaye", "Marvin Gaye", ["R&B / Soul"], NA, 1972, [0.5, 0.35, 0.7, 0.7, 0.9, 0.5], [
    ["What's Going On", "What's Going On", 1971, "social,faith", { energy: 0.4, tempo: 0.4 }],
    ["Let's Get It On", "Let's Get It On", 1973, "love"],
    ["I Heard It Through the Grapevine", "In the Groove", 1968, "heartbreak"],
  ]),
  A("aretha-franklin", "Aretha Franklin", ["R&B / Soul", "Gospel / Worship"], NA, 1968, [0.65, 0.35, 0.7, 0.6, 0.85, 0.55], [
    ["Respect", "I Never Loved a Man the Way I Love You", 1967, "resilience,rebellion"],
    ["(You Make Me Feel Like) A Natural Woman", "Lady Soul", 1968, "love,faith", { energy: 0.4, tempo: 0.35 }],
    ["Chain of Fools", "Lady Soul", 1968, "heartbreak,resilience"],
  ]),
  A("anderson-paak", "Anderson .Paak", ["R&B / Soul", "Hip-hop / Rap"], NA, 2016, [0.7, 0.3, 0.55, 0.7, 0.65, 0.6], [
    ["Come Down", "Malibu", 2016, "love,party"],
    ["Bubblin", "Single", 2018, "party,hustle"],
    ["The Season / Carry Me", "Malibu", 2016, "introspection,resilience", { energy: 0.4, tempo: 0.4 }],
  ]),
  A("sam-cooke", "Sam Cooke", ["R&B / Soul", "Gospel / Worship"], NA, 1962, [0.4, 0.5, 0.65, 0.65, 0.8, 0.45], [
    ["You Send Me", "Sam Cooke", 1957, "love"],
    ["A Change Is Gonna Come", "Ain't That Good News", 1964, "social,faith", { energy: 0.35, tempo: 0.3 }],
    ["Bring It On Home to Me", "Single", 1962, "love,heartbreak"],
  ]),

  // Afrobeats / Africa diaspora
  A("asake", "Asake", ["Afrobeats"], AF, 2023, [0.75, 0.2, 0.35, 0.75, 0.8, 0.65], [
    ["Peace Be Unto You (PBUY)", "Mr. Money with the Vibe", 2022, "party,faith"],
    ["Terminator", "Mr. Money with the Vibe", 2022, "party,hustle"],
    ["Sungba", "Single", 2022, "party"],
  ]),
  A("sade", "Sade", ["R&B / Soul", "Jazz / Blues"], UK, 1985, [0.25, 0.55, 0.6, 0.85, 0.75, 0.3], [
    ["Smooth Operator", "Diamond Life", 1984, "love,escapism"],
    ["No Ordinary Love", "Love Deluxe", 1992, "love,heartbreak"],
    ["By Your Side", "Lovers Rock", 2000, "love,faith"],
  ]),
  A("tems", "Tems", ["Afrobeats", "R&B / Soul"], AF, 2022, [0.35, 0.3, 0.55, 0.8, 0.75, 0.4], [
    ["Free Mind", "Single", 2020, "resilience,escapism"],
    ["Me & U", "Single", 2022, "love"],
    ["Higher", "Single", 2022, "faith,resilience"],
  ]),
  A("miriam-makeba", "Miriam Makeba", ["Afrobeats", "Jazz / Blues"], AF, 1967, [0.45, 0.7, 0.5, 0.5, 0.5, 0.55], [
    ["Pata Pata", "Pata Pata", 1967, "party,roots"],
    ["Click Song (Qongqothwane)", "", null, "roots,party"],
    ["Malaika", "", null, "love,roots", { energy: 0.25, tempo: 0.3 }],
  ]),

  // Rock / Alt
  A("led-zeppelin", "Led Zeppelin", ["Rock / Alt"], UK, 1971, [0.8, 0.3, 0.55, 0.55, 0.9, 0.5], [
    ["Stairway to Heaven", "Led Zeppelin IV", 1971, "escapism,faith", { energy: 0.6, tempo: 0.4 }],
    ["Whole Lotta Love", "Led Zeppelin II", 1969, "rebellion,party"],
    ["Kashmir", "Physical Graffiti", 1975, "escapism"],
  ]),
  A("the-beatles", "The Beatles", ["Rock / Alt", "Pop"], UK, 1966, [0.5, 0.5, 0.65, 0.65, 1, 0.5], [
    ["Hey Jude", "Single", 1968, "resilience,love"],
    ["Here Comes the Sun", "Abbey Road", 1969, "escapism,resilience", { energy: 0.4, acoustic: 0.65 }],
    ["A Day in the Life", "Sgt. Pepper's Lonely Hearts Club Band", 1967, "introspection,social"],
  ]),
  A("queen", "Queen", ["Rock / Alt"], UK, 1977, [0.75, 0.25, 0.6, 0.8, 0.95, 0.6], [
    ["Bohemian Rhapsody", "A Night at the Opera", 1975, "escapism,rebellion"],
    ["Don't Stop Me Now", "Jazz", 1978, "party,resilience", { energy: 0.9, tempo: 0.8 }],
    ["Somebody to Love", "A Day at the Races", 1976, "love,faith"],
  ]),
  A("the-rolling-stones", "The Rolling Stones", ["Rock / Alt"], UK, 1969, [0.75, 0.3, 0.55, 0.4, 0.9, 0.6], [
    ["(I Can't Get No) Satisfaction", "Out of Our Heads", 1965, "rebellion"],
    ["Paint It Black", "Aftermath", 1966, "heartbreak,rebellion"],
    ["Gimme Shelter", "Let It Bleed", 1969, "social,rebellion"],
  ]),
  A("pink-floyd", "Pink Floyd", ["Rock / Alt"], UK, 1975, [0.45, 0.4, 0.6, 0.6, 0.85, 0.35], [
    ["Wish You Were Here", "Wish You Were Here", 1975, "nostalgia,introspection", { energy: 0.3, acoustic: 0.65 }],
    ["Comfortably Numb", "The Wall", 1979, "introspection,escapism"],
    ["Time", "The Dark Side of the Moon", 1973, "introspection,social"],
  ]),
  A("ac-dc", "AC/DC", ["Rock / Alt"], GM, 1980, [0.95, 0.1, 0.4, 0.4, 0.9, 0.65], [
    ["Back in Black", "Back in Black", 1980, "rebellion,resilience"],
    ["Highway to Hell", "Highway to Hell", 1979, "rebellion,party"],
    ["Thunderstruck", "The Razors Edge", 1990, "party,rebellion"],
  ]),
  A("u2", "U2", ["Rock / Alt"], UK, 1987, [0.6, 0.3, 0.7, 0.7, 0.9, 0.5], [
    ["With or Without You", "The Joshua Tree", 1987, "love,heartbreak", { energy: 0.45, tempo: 0.4 }],
    ["One", "Achtung Baby", 1991, "love,faith"],
    ["Sunday Bloody Sunday", "War", 1983, "social,rebellion", { energy: 0.8, tempo: 0.7 }],
  ]),
  A("red-hot-chili-peppers", "Red Hot Chili Peppers", ["Rock / Alt"], NA, 1999, [0.75, 0.25, 0.5, 0.65, 0.9, 0.6], [
    ["Under the Bridge", "Blood Sugar Sex Magik", 1991, "introspection,roots", { energy: 0.4, tempo: 0.35 }],
    ["Californication", "Californication", 1999, "escapism,social"],
    ["Can't Stop", "By the Way", 2002, "party,hustle", { energy: 0.85 }],
  ]),
  A("green-day", "Green Day", ["Rock / Alt"], NA, 2004, [0.85, 0.15, 0.6, 0.55, 0.9, 0.75], [
    ["Basket Case", "Dookie", 1994, "introspection,rebellion"],
    ["American Idiot", "American Idiot", 2004, "social,rebellion"],
    ["Boulevard of Broken Dreams", "American Idiot", 2004, "introspection,escapism", { energy: 0.55, tempo: 0.45 }],
  ]),
  A("linkin-park", "Linkin Park", ["Rock / Alt"], NA, 2003, [0.85, 0.1, 0.6, 0.7, 0.9, 0.6], [
    ["In the End", "Hybrid Theory", 2000, "resilience,heartbreak", { energy: 0.7 }],
    ["Numb", "Meteora", 2003, "introspection,resilience"],
    ["Crawling", "Hybrid Theory", 2000, "introspection"],
  ]),
  A("imagine-dragons", "Imagine Dragons", ["Rock / Alt", "Pop"], NA, 2013, [0.8, 0.15, 0.45, 0.85, 0.93, 0.6], [
    ["Radioactive", "Night Visions", 2012, "rebellion,resilience"],
    ["Believer", "Evolve", 2017, "resilience,hustle"],
    ["Demons", "Night Visions", 2012, "introspection,faith", { energy: 0.55, tempo: 0.45 }],
  ]),
  A("metallica", "Metallica", ["Rock / Alt"], NA, 1991, [0.95, 0.15, 0.55, 0.5, 0.85, 0.6], [
    ["Enter Sandman", "Metallica", 1991, "rebellion"],
    ["One", "...And Justice for All", 1988, "social,introspection"],
    ["Nothing Else Matters", "Metallica", 1991, "love,introspection", { energy: 0.45, acoustic: 0.55, tempo: 0.3 }],
  ]),
  A("the-cure", "The Cure", ["Rock / Alt", "Other / Hybrid"], UK, 1989, [0.5, 0.2, 0.55, 0.55, 0.6, 0.5], [
    ["Just Like Heaven", "Kiss Me, Kiss Me, Kiss Me", 1987, "love,escapism"],
    ["Boys Don't Cry", "Three Imaginary Boys", 1979, "heartbreak"],
    ["Lovesong", "Disintegration", 1989, "love", { energy: 0.35, tempo: 0.35 }],
  ]),
  A("the-smiths", "The Smiths", ["Rock / Alt"], UK, 1986, [0.55, 0.35, 0.85, 0.45, 0.6, 0.55], [
    ["How Soon Is Now?", "Single", 1984, "introspection,heartbreak"],
    ["There Is a Light That Never Goes Out", "The Queen Is Dead", 1986, "love,escapism"],
    ["This Charming Man", "Single", 1983, "love,rebellion", { energy: 0.65, tempo: 0.65 }],
  ]),
  A("pearl-jam", "Pearl Jam", ["Rock / Alt"], NA, 1992, [0.8, 0.25, 0.65, 0.4, 0.8, 0.55], [
    ["Alive", "Ten", 1991, "resilience,introspection"],
    ["Black", "Ten", 1991, "heartbreak", { energy: 0.45, tempo: 0.3 }],
    ["Even Flow", "Ten", 1991, "social,rebellion"],
  ]),
  A("the-black-keys", "The Black Keys", ["Rock / Alt"], NA, 2011, [0.75, 0.3, 0.5, 0.35, 0.75, 0.55], [
    ["Lonely Boy", "El Camino", 2011, "heartbreak,rebellion"],
    ["Gold on the Ceiling", "El Camino", 2011, "love,hustle"],
    ["Little Black Submarines", "El Camino", 2011, "heartbreak", { energy: 0.6 }],
  ]),

  // Electronic / Dance
  A("david-guetta", "David Guetta", ["Electronic / Dance", "Pop"], GM, 2011, [0.85, 0.03, 0.25, 0.9, 0.92, 0.8], [
    ["Titanium", "Nothing but the Beat", 2011, "resilience", { energy: 0.75, tempo: 0.75 }],
    ["When Love Takes Over", "One Love", 2009, "love,party"],
    ["Without You", "Nothing but the Beat", 2011, "heartbreak,love"],
  ]),
  A("swedish-house-mafia", "Swedish House Mafia", ["Electronic / Dance"], GM, 2012, [0.85, 0.05, 0.2, 0.85, 0.8, 0.75], [
    ["Don't You Worry Child", "Until Now", 2012, "nostalgia,resilience", { energy: 0.75, tempo: 0.65 }],
    ["One", "Single", 2010, "party,escapism"],
    ["Save the World", "Single", 2011, "escapism,social"],
  ]),
  A("deadmau5", "deadmau5", ["Electronic / Dance"], NA, 2009, [0.7, 0.03, 0.05, 0.7, 0.65, 0.65], [
    ["Strobe", "For Lack of a Better Name", 2009, "escapism", { energy: 0.6, tempo: 0.6 }],
    ["Ghosts 'n' Stuff", "For Lack of a Better Name", 2009, "escapism,party"],
    ["I Remember", "Random Album Title", 2008, "escapism,love"],
  ]),
  A("aphex-twin", "Aphex Twin", ["Electronic / Dance", "Other / Hybrid"], UK, 1996, [0.4, 0.3, 0.02, 0.4, 0.4, 0.5], [
    ["Windowlicker", "Single", 1999, "escapism,rebellion", { energy: 0.7, tempo: 0.65 }],
    ["Xtal", "Selected Ambient Works 85-92", 1992, "escapism", { energy: 0.35, tempo: 0.5 }],
    ["Avril 14th", "Drukqs", 2001, "nostalgia,introspection", { energy: 0.1, acoustic: 0.85, tempo: 0.25 }],
  ]),
  A("jamie-xx", "Jamie xx", ["Electronic / Dance"], UK, 2015, [0.55, 0.1, 0.15, 0.7, 0.55, 0.55], [
    ["Loud Places", "In Colour", 2015, "heartbreak,escapism"],
    ["Gosh", "In Colour", 2015, "escapism", { energy: 0.7, tempo: 0.7 }],
    ["I Know There's Gonna Be (Good Times)", "In Colour", 2015, "nostalgia,party"],
  ]),
  A("the-chemical-brothers", "The Chemical Brothers", ["Electronic / Dance"], UK, 1999, [0.9, 0.03, 0.05, 0.65, 0.65, 0.8], [
    ["Block Rockin' Beats", "Dig Your Own Hole", 1997, "party,rebellion"],
    ["Galvanize", "Push the Button", 2005, "rebellion,party"],
    ["Hey Boy Hey Girl", "Surrender", 1999, "party"],
  ]),

  // Country / Folk
  A("kenny-rogers", "Kenny Rogers", ["Country / Folk"], NA, 1980, [0.35, 0.7, 0.8, 0.7, 0.85, 0.4], [
    ["The Gambler", "The Gambler", 1978, "hustle,resilience"],
    ["Lucille", "Kenny Rogers", 1977, "heartbreak"],
    ["Islands in the Stream", "Eyes That See in the Dark", 1983, "love"],
  ]),
  A("willie-nelson", "Willie Nelson", ["Country / Folk"], NA, 1980, [0.35, 0.85, 0.75, 0.45, 0.8, 0.4], [
    ["On the Road Again", "Honeysuckle Rose", 1980, "escapism,roots"],
    ["Always on My Mind", "Always on My Mind", 1982, "love,heartbreak", { energy: 0.2, tempo: 0.25 }],
    ["Blue Eyes Crying in the Rain", "Red Headed Stranger", 1975, "heartbreak", { energy: 0.15, tempo: 0.2 }],
  ]),
  A("hank-williams", "Hank Williams", ["Country / Folk"], NA, 1951, [0.35, 0.85, 0.8, 0.3, 0.7, 0.45], [
    ["Hey, Good Lookin'", "Single", 1951, "love,party", { energy: 0.55, tempo: 0.6 }],
    ["I'm So Lonesome I Could Cry", "Single", 1949, "heartbreak,introspection", { energy: 0.15, tempo: 0.2 }],
    ["Cold, Cold Heart", "Single", 1951, "heartbreak"],
  ]),
  A("shania-twain", "Shania Twain", ["Country / Folk", "Pop"], NA, 1998, [0.6, 0.35, 0.5, 0.9, 0.9, 0.6], [
    ["Man! I Feel Like a Woman!", "Come On Over", 1997, "party,resilience"],
    ["You're Still the One", "Come On Over", 1997, "love", { energy: 0.35, tempo: 0.35 }],
    ["That Don't Impress Me Much", "Come On Over", 1997, "rebellion"],
  ]),
  A("carrie-underwood", "Carrie Underwood", ["Country / Folk", "Pop"], NA, 2007, [0.6, 0.4, 0.75, 0.85, 0.9, 0.55], [
    ["Before He Cheats", "Some Hearts", 2006, "heartbreak,rebellion"],
    ["Jesus, Take the Wheel", "Some Hearts", 2005, "faith,resilience", { energy: 0.4, tempo: 0.4 }],
    ["Blown Away", "Blown Away", 2012, "heartbreak,rebellion"],
  ]),
  A("jason-isbell", "Jason Isbell", ["Country / Folk", "Rock / Alt"], NA, 2013, [0.4, 0.75, 0.95, 0.5, 0.45, 0.4], [
    ["Cover Me Up", "Southeastern", 2013, "love,resilience", { energy: 0.3 }],
    ["Elephant", "Southeastern", 2013, "heartbreak", { energy: 0.2, tempo: 0.25 }],
    ["Live Oak", "Southeastern", 2013, "roots,rebellion"],
  ]),
  A("bob-dylan", "Bob Dylan", ["Country / Folk", "Rock / Alt"], NA, 1966, [0.45, 0.65, 1, 0.3, 0.85, 0.5], [
    ["Like a Rolling Stone", "Highway 61 Revisited", 1965, "rebellion,social"],
    ["Blowin' in the Wind", "The Freewheelin' Bob Dylan", 1963, "social,faith", { energy: 0.3, tempo: 0.35 }],
    ["Tangled Up in Blue", "Blood on the Tracks", 1975, "heartbreak,nostalgia"],
  ]),
  A("joni-mitchell", "Joni Mitchell", ["Country / Folk"], NA, 1971, [0.3, 0.8, 0.95, 0.55, 0.65, 0.4], [
    ["A Case of You", "Blue", 1971, "love,heartbreak", { energy: 0.2, tempo: 0.25 }],
    ["Both Sides, Now", "Clouds", 1969, "introspection,nostalgia"],
    ["Big Yellow Taxi", "Ladies of the Canyon", 1970, "social,roots", { energy: 0.5, tempo: 0.6 }],
  ]),
  A("fleet-foxes", "Fleet Foxes", ["Country / Folk", "Other / Hybrid"], NA, 2011, [0.35, 0.8, 0.8, 0.55, 0.5, 0.4], [
    ["White Winter Hymnal", "Fleet Foxes", 2008, "nostalgia,faith"],
    ["Mykonos", "Sun Giant", 2008, "escapism,roots"],
    ["Helplessness Blues", "Helplessness Blues", 2011, "introspection,resilience"],
  ]),
  A("mumford-and-sons", "Mumford & Sons", ["Country / Folk", "Rock / Alt"], UK, 2012, [0.65, 0.7, 0.75, 0.65, 0.85, 0.65], [
    ["I Will Wait", "Babel", 2012, "love,faith"],
    ["Little Lion Man", "Sigh No More", 2009, "heartbreak,rebellion"],
    ["The Cave", "Sigh No More", 2009, "escapism,faith"],
  ]),

  // Jazz / Blues
  A("john-coltrane", "John Coltrane", ["Jazz / Blues"], NA, 1964, [0.6, 0.9, 0.03, 0.55, 0.5, 0.55], [
    ["A Love Supreme, Pt. I - Acknowledgement", "A Love Supreme", 1965, "faith"],
    ["Giant Steps", "Giant Steps", 1960, "escapism,hustle", { energy: 0.8, tempo: 0.85 }],
    ["My Favorite Things", "My Favorite Things", 1961, "escapism,nostalgia"],
  ]),
  A("ella-fitzgerald", "Ella Fitzgerald", ["Jazz / Blues"], NA, 1957, [0.35, 0.85, 0.6, 0.7, 0.75, 0.45], [
    ["Summertime", "Porgy and Bess", 1957, "escapism,love", { energy: 0.2, tempo: 0.25 }],
    ["Cheek to Cheek", "Ella and Louis", 1956, "love"],
    ["Mack the Knife", "Mack the Knife: Ella in Berlin", 1960, "rebellion,party", { energy: 0.55, tempo: 0.6 }],
  ]),
  A("louis-armstrong", "Louis Armstrong", ["Jazz / Blues"], NA, 1960, [0.35, 0.85, 0.55, 0.5, 0.85, 0.45], [
    ["What a Wonderful World", "Single", 1967, "faith,resilience", { energy: 0.2, tempo: 0.25 }],
    ["La Vie en Rose", "Single", 1950, "love", { energy: 0.25, tempo: 0.3 }],
    ["Hello, Dolly!", "Hello, Dolly!", 1964, "party,nostalgia", { energy: 0.6, tempo: 0.6 }],
  ]),
  A("etta-james", "Etta James", ["Jazz / Blues", "R&B / Soul"], NA, 1967, [0.45, 0.7, 0.65, 0.55, 0.7, 0.45], [
    ["At Last", "At Last!", 1960, "love", { energy: 0.25, tempo: 0.25 }],
    ["I'd Rather Go Blind", "Tell Mama", 1968, "heartbreak", { energy: 0.3, tempo: 0.25 }],
    ["Tell Mama", "Tell Mama", 1968, "rebellion,love", { energy: 0.7, tempo: 0.6 }],
  ]),
  A("robert-johnson", "Robert Johnson", ["Jazz / Blues"], NA, 1937, [0.3, 0.95, 0.75, 0.15, 0.5, 0.4], [
    ["Cross Road Blues", "Single", 1936, "faith,escapism"],
    ["Hellhound on My Trail", "Single", 1937, "introspection,faith"],
    ["Come On in My Kitchen", "Single", 1937, "love,introspection", { energy: 0.2, tempo: 0.25 }],
  ]),
  A("dave-brubeck", "Dave Brubeck", ["Jazz / Blues"], NA, 1959, [0.45, 0.9, 0.02, 0.65, 0.65, 0.5], [
    ["Take Five", "Time Out", 1959, "escapism"],
    ["Blue Rondo à la Turk", "Time Out", 1959, "escapism,party", { energy: 0.6, tempo: 0.7 }],
    ["Unsquare Dance", "Time Further Out", 1961, "party"],
  ]),
  A("herbie-hancock", "Herbie Hancock", ["Jazz / Blues", "Electronic / Dance"], NA, 1973, [0.65, 0.45, 0.03, 0.7, 0.55, 0.6], [
    ["Chameleon", "Head Hunters", 1973, "party,escapism"],
    ["Watermelon Man", "Takin' Off", 1962, "party,roots", { acoustic: 0.8 }],
    ["Rockit", "Future Shock", 1983, "party,rebellion", { acoustic: 0.05, energy: 0.8 }],
  ]),

  // Gospel / Worship
  A("tasha-cobbs-leonard", "Tasha Cobbs Leonard", ["Gospel / Worship"], NA, 2014, [0.5, 0.35, 0.55, 0.8, 0.5, 0.45], [
    ["Break Every Chain", "Grace", 2013, "faith,resilience"],
    ["You Know My Name", "Heart. Passion. Pursuit.", 2013, "faith"],
    ["Gracefully Broken", "", null, "faith,resilience"],
  ]),
  A("mary-mary", "Mary Mary", ["Gospel / Worship", "R&B / Soul"], NA, 2001, [0.65, 0.2, 0.5, 0.85, 0.55, 0.6], [
    ["Shackles (Praise You)", "Thankful", 2000, "faith,party"],
    ["God in Me", "Incredible", 2008, "faith,resilience"],
    ["Incredible", "Incredible", 2002, "faith,party"],
  ]),
  A("chris-tomlin", "Chris Tomlin", ["Gospel / Worship"], NA, 2010, [0.45, 0.45, 0.55, 0.85, 0.7, 0.4], [
    ["How Great Is Our God", "Arriving", 2004, "faith"],
    ["Good Good Father", "Never Lose Sight", 2016, "faith,love"],
    ["Amazing Grace (My Chains Are Gone)", "See the Morning", 2006, "faith,resilience"],
  ]),

  // Latin
  A("selena", "Selena", ["Latin", "Pop"], LA, 1994, [0.6, 0.3, 0.5, 0.75, 0.85, 0.6], [
    ["Bidi Bidi Bom Bom", "Amor Prohibido", 1994, "love,party"],
    ["Como la Flor", "Entre a Mi Mundo", 1992, "heartbreak", { energy: 0.5, tempo: 0.45 }],
    ["Dreaming of You", "Dreaming of You", 1995, "love,nostalgia", { energy: 0.3, tempo: 0.3 }],
  ]),
  A("marc-anthony", "Marc Anthony", ["Latin"], LA, 2004, [0.65, 0.35, 0.6, 0.85, 0.8, 0.65], [
    ["Vivir Mi Vida", "3.0", 2013, "resilience,party"],
    ["Valió la Pena", "Valió la Pena", 2004, "love,resilience"],
    ["Tu Amor Me Hace Bien", "Marc Anthony", 1999, "love"],
  ]),
  A("celia-cruz", "Celia Cruz", ["Latin"], LA, 1990, [0.75, 0.4, 0.4, 0.6, 0.6, 0.7], [
    ["La Vida Es un Carnaval", "Mi Vida Es Cantar", 1998, "resilience,party"],
    ["Quimbara", "Celia & Johnny", 1974, "party,roots"],
    ["Azúcar Negra", "Azúcar Negra", 1993, "party,roots"],
  ]),
  A("enrique-iglesias", "Enrique Iglesias", ["Latin", "Pop"], LA, 2014, [0.7, 0.15, 0.5, 0.9, 0.9, 0.65], [
    ["Bailando", "Sex and Love", 2014, "love,party"],
    ["Hero", "Escape", 2001, "love,resilience", { energy: 0.4, tempo: 0.35 }],
    ["Tonight (I'm Lovin' You)", "Euphoria", 2010, "party"],
  ]),
  A("rauw-alejandro", "Rauw Alejandro", ["Latin"], LA, 2022, [0.7, 0.05, 0.35, 0.85, 0.85, 0.6], [
    ["Todo de Ti", "Vice Versa", 2021, "love,party"],
    ["Cúrame", "Saturno", 2022, "love,heartbreak"],
    ["Baila Conmigo", "Single", 2021, "love,party"],
  ]),
  A("maluma", "Maluma", ["Latin"], LA, 2018, [0.7, 0.1, 0.4, 0.85, 0.88, 0.65], [
    ["Felices los 4", "Single", 2017, "love,party"],
    ["Hawái", "Papi Juancho", 2020, "heartbreak,party"],
    ["Chantaje", "Single", 2016, "love,rebellion"],
  ]),
  A("ozuna", "Ozuna", ["Latin", "Hip-hop / Rap"], LA, 2018, [0.7, 0.05, 0.35, 0.85, 0.9, 0.6], [
    ["Baila Baila Baila", "Odisea", 2017, "party,love"],
    ["Se Preparó", "Odisea", 2017, "party"],
    ["Caramelo", "Nibiru", 2019, "party,love"],
  ]),

  // Other / Hybrid
  A("bob-marley", "Bob Marley & The Wailers", ["Other / Hybrid"], GM, 1977, [0.4, 0.6, 0.75, 0.5, 0.95, 0.4], [
    ["No Woman, No Cry", "Live!", 1975, "resilience,roots"],
    ["Redemption Song", "Uprising", 1980, "social,faith", { energy: 0.2, acoustic: 0.95, tempo: 0.25 }],
    ["Three Little Birds", "Exodus", 1977, "resilience,escapism"],
  ]),
  A("david-bowie", "David Bowie", ["Other / Hybrid", "Rock / Alt"], UK, 1975, [0.55, 0.35, 0.65, 0.6, 0.85, 0.5], [
    ["\"Heroes\"", "\"Heroes\"", 1977, "resilience,love"],
    ["Life on Mars?", "Hunky Dory", 1971, "escapism,introspection", { energy: 0.4, tempo: 0.35 }],
    ["Space Oddity", "Space Oddity", 1969, "escapism,introspection", { energy: 0.4, tempo: 0.4 }],
  ]),
  A("massive-attack", "Massive Attack", ["Other / Hybrid", "Electronic / Dance"], UK, 1998, [0.4, 0.1, 0.4, 0.65, 0.6, 0.4], [
    ["Teardrop", "Mezzanine", 1998, "love,introspection"],
    ["Unfinished Sympathy", "Blue Lines", 1991, "love,heartbreak"],
    ["Angel", "Mezzanine", 1998, "escapism,rebellion"],
  ]),
  A("portishead", "Portishead", ["Other / Hybrid"], UK, 1995, [0.3, 0.25, 0.6, 0.55, 0.55, 0.35], [
    ["Glory Box", "Dummy", 1994, "love,rebellion"],
    ["Roads", "Dummy", 1994, "heartbreak,introspection"],
    ["Sour Times", "Dummy", 1994, "heartbreak,escapism"],
  ]),
  A("sia", "Sia", ["Pop", "Other / Hybrid"], GM, 2015, [0.55, 0.15, 0.6, 0.9, 0.9, 0.5], [
    ["Chandelier", "1000 Forms of Fear", 2014, "escapism,party"],
    ["Cheap Thrills", "This Is Acting", 2016, "party"],
    ["Breathe Me", "Colour the Small One", 2004, "introspection", { energy: 0.15, tempo: 0.25 }],
  ]),
  A("the-xx", "The xx", ["Other / Hybrid", "Electronic / Dance"], UK, 2012, [0.3, 0.2, 0.5, 0.6, 0.6, 0.35], [
    ["Intro", "xx", 2009, "love,escapism"],
    ["Crystalised", "xx", 2009, "love,heartbreak"],
    ["Angels", "Coexist", 2012, "love,faith"],
  ]),
  A("florence-and-the-machine", "Florence + The Machine", ["Other / Hybrid", "Rock / Alt"], UK, 2011, [0.65, 0.3, 0.65, 0.75, 0.8, 0.55], [
    ["Dog Days Are Over", "Lungs", 2008, "resilience,party"],
    ["You've Got the Love", "Lungs", 2009, "love,resilience"],
    ["Shake It Out", "Ceremonials", 2011, "resilience,faith"],
  ]),
  A("mitski", "Mitski", ["Other / Hybrid", "Rock / Alt"], GM, 2018, [0.5, 0.25, 0.85, 0.55, 0.55, 0.55], [
    ["Your Best American Girl", "Puberty 2", 2016, "heartbreak,rebellion"],
    ["Nobody", "Be the Cowboy", 2018, "introspection,escapism"],
    ["Washing Machine Heart", "Be the Cowboy", 2018, "love,rebellion"],
  ]),
  A("vampire-weekend", "Vampire Weekend", ["Rock / Alt", "Other / Hybrid"], NA, 2010, [0.65, 0.45, 0.8, 0.6, 0.7, 0.7], [
    ["A-Punk", "Vampire Weekend", 2008, "party,rebellion"],
    ["Oxford Comma", "Vampire Weekend", 2008, "social,rebellion"],
    ["Harmony Hall", "Father of the Bride", 2019, "social,nostalgia"],
  ]),
  A("beach-house", "Beach House", ["Other / Hybrid", "Rock / Alt"], NA, 2012, [0.35, 0.2, 0.35, 0.6, 0.45, 0.35], [
    ["Space Song", "Depression Cherry", 2015, "love,escapism"],
    ["Myth", "Bloom", 2012, "nostalgia,escapism"],
    ["Walk in the Park", "Teen Dream", 2010, "love,nostalgia"],
  ]),
  A("sufjan-stevens", "Sufjan Stevens", ["Other / Hybrid", "Country / Folk"], NA, 2015, [0.3, 0.85, 0.9, 0.5, 0.55, 0.35], [
    ["Chicago", "Illinois", 2005, "escapism,roots", { energy: 0.55, tempo: 0.6 }],
    ["Mystery of Love", "Call Me by Your Name (Soundtrack)", 2017, "love,faith"],
    ["Death with Dignity", "Carrie & Lowell", 2015, "faith,introspection", { energy: 0.15, tempo: 0.25 }],
  ]),
];
