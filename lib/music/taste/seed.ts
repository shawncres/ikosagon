import type { SeedArtist, SeedTrack, ThemeId, TrackRole } from "./types";
import { vec } from "./vector";

/**
 * IkoArtist editorial taste map.
 *
 * Every number and theme tag here is an editorial estimate written by us at Ikosagon from listening
 * knowledge. They are NOT measured audio features and NOT chart or stream data. The three tracks per
 * artist (signature hit, fan favorite, deep cut) are our assumption of each artist's best-known work.
 * Metadata is hand-entered; verify it before using it anywhere public.
 *
 * Vector order: energy, acoustic, lyric, polish, mainstream, tempo (all 0..1).
 */
export const SEED_AS_OF = "2026-10-14";
export const SEED_SOURCE = "Ikosagon editorial seed (hand-written estimates, not measured audio features)";

type T = [title: string, album: string, year: number, themes: string, tweak?: SeedTrack["tweak"]];
const ROLES: TrackRole[] = ["signature hit", "fan favorite", "deep cut"];

function A(
  id: string,
  name: string,
  genres: string[],
  region: string,
  peak: number,
  v: [number, number, number, number, number, number],
  tracks: [T, T, T],
): SeedArtist {
  return {
    id,
    name,
    genres,
    region,
    peak,
    vector: vec(...v),
    tracks: tracks.map(([title, album, year, themes, tweak], i) => ({
      title,
      album,
      year,
      themes: themes.split(",") as ThemeId[],
      role: ROLES[i],
      ...(tweak ? { tweak } : {}),
    })),
  };
}

const NA = "North America";
const UK = "UK / Ireland";
const AF = "Afrobeats / Africa diaspora";
const LA = "Latin America / Spain";
const GM = "Global mix";

export const SEED_ARTISTS: SeedArtist[] = [
  // Pop
  A("taylor-swift", "Taylor Swift", ["Pop", "Country / Folk"], NA, 2014, [0.55, 0.35, 0.85, 0.85, 0.98, 0.55], [
    ["Shake It Off", "1989", 2014, "party,resilience"],
    ["All Too Well (Taylor's Version)", "Red (Taylor's Version)", 2021, "heartbreak,nostalgia", { energy: 0.35, tempo: 0.4 }],
    ["this is me trying", "folklore", 2020, "introspection,heartbreak", { energy: 0.25, tempo: 0.35 }],
  ]),
  A("dua-lipa", "Dua Lipa", ["Pop", "Electronic / Dance"], UK, 2020, [0.8, 0.08, 0.4, 0.92, 0.9, 0.8], [
    ["Levitating", "Future Nostalgia", 2020, "party,love"],
    ["Don't Start Now", "Future Nostalgia", 2019, "resilience,heartbreak"],
    ["Pretty Please", "Future Nostalgia", 2020, "love,party"],
  ]),
  A("harry-styles", "Harry Styles", ["Pop", "Rock / Alt"], UK, 2020, [0.6, 0.3, 0.55, 0.8, 0.93, 0.6], [
    ["As It Was", "Harry's House", 2022, "introspection,nostalgia"],
    ["Watermelon Sugar", "Fine Line", 2019, "love,party"],
    ["Cherry", "Fine Line", 2019, "heartbreak,love", { energy: 0.3, tempo: 0.3 }],
  ]),
  A("billie-eilish", "Billie Eilish", ["Pop", "Other / Hybrid"], NA, 2020, [0.35, 0.3, 0.75, 0.75, 0.92, 0.4], [
    ["bad guy", "When We All Fall Asleep, Where Do We Go?", 2019, "rebellion,party"],
    ["when the party's over", "When We All Fall Asleep, Where Do We Go?", 2018, "heartbreak,introspection", { energy: 0.15 }],
    ["Ocean Eyes", "Don't Smile at Me", 2017, "love,introspection", { energy: 0.2 }],
  ]),
  A("michael-jackson", "Michael Jackson", ["Pop", "R&B / Soul"], NA, 1983, [0.75, 0.15, 0.45, 0.9, 1, 0.65], [
    ["Billie Jean", "Thriller", 1982, "rebellion,introspection"],
    ["Thriller", "Thriller", 1982, "party"],
    ["Human Nature", "Thriller", 1982, "escapism,introspection", { energy: 0.4, tempo: 0.4 }],
  ]),
  A("ariana-grande", "Ariana Grande", ["Pop", "R&B / Soul"], NA, 2019, [0.5, 0.15, 0.55, 0.93, 0.95, 0.5], [
    ["7 rings", "thank u, next", 2019, "party,hustle"],
    ["thank u, next", "thank u, next", 2018, "resilience,heartbreak"],
    ["ghostin", "thank u, next", 2019, "heartbreak,introspection", { energy: 0.25, tempo: 0.3 }],
  ]),
  A("ed-sheeran", "Ed Sheeran", ["Pop", "Country / Folk"], UK, 2017, [0.5, 0.6, 0.8, 0.75, 0.95, 0.55], [
    ["Shape of You", "÷ (Divide)", 2017, "love,party"],
    ["Photograph", "x (Multiply)", 2014, "love,nostalgia", { energy: 0.35, tempo: 0.4 }],
    ["Eraser", "÷ (Divide)", 2017, "introspection,hustle"],
  ]),
  A("the-weeknd", "The Weeknd", ["Pop", "R&B / Soul"], NA, 2020, [0.7, 0.08, 0.55, 0.85, 0.95, 0.7], [
    ["Blinding Lights", "After Hours", 2019, "love,escapism"],
    ["Starboy", "Starboy", 2016, "hustle,party"],
    ["Wicked Games", "House of Balloons", 2011, "heartbreak,escapism", { energy: 0.35, tempo: 0.35 }],
  ]),

  // Hip-hop / Rap
  A("kendrick-lamar", "Kendrick Lamar", ["Hip-hop / Rap"], NA, 2016, [0.7, 0.1, 0.95, 0.75, 0.85, 0.55], [
    ["HUMBLE.", "DAMN.", 2017, "hustle,rebellion"],
    ["Alright", "To Pimp a Butterfly", 2015, "social,resilience,faith"],
    ["Sing About Me, I'm Dying of Thirst", "good kid, m.A.A.d city", 2012, "introspection,social", { energy: 0.45, tempo: 0.4 }],
  ]),
  A("drake", "Drake", ["Hip-hop / Rap", "R&B / Soul"], NA, 2016, [0.5, 0.1, 0.7, 0.85, 0.98, 0.45], [
    ["Hotline Bling", "Views", 2015, "heartbreak,nostalgia"],
    ["God's Plan", "Scorpion", 2018, "hustle,resilience"],
    ["Marvins Room", "Take Care", 2011, "heartbreak,introspection", { energy: 0.3 }],
  ]),
  A("j-cole", "J. Cole", ["Hip-hop / Rap"], NA, 2014, [0.45, 0.2, 0.95, 0.65, 0.8, 0.45], [
    ["No Role Modelz", "2014 Forest Hills Drive", 2014, "introspection,social"],
    ["Middle Child", "Revenge of the Dreamers III", 2019, "hustle,social"],
    ["Love Yourz", "2014 Forest Hills Drive", 2014, "resilience,introspection", { energy: 0.35 }],
  ]),
  A("travis-scott", "Travis Scott", ["Hip-hop / Rap"], NA, 2018, [0.85, 0.05, 0.35, 0.85, 0.85, 0.6], [
    ["SICKO MODE", "ASTROWORLD", 2018, "party,hustle"],
    ["goosebumps", "Birds in the Trap Sing McKnight", 2016, "party,escapism"],
    ["STARGAZING", "ASTROWORLD", 2018, "escapism,introspection"],
  ]),
  A("tyler-the-creator", "Tyler, the Creator", ["Hip-hop / Rap", "Other / Hybrid"], NA, 2019, [0.6, 0.15, 0.6, 0.6, 0.7, 0.55], [
    ["EARFQUAKE", "IGOR", 2019, "love,heartbreak"],
    ["See You Again", "Flower Boy", 2017, "love,escapism"],
    ["NEW MAGIC WAND", "IGOR", 2019, "rebellion,heartbreak", { energy: 0.8 }],
  ]),
  A("nas", "Nas", ["Hip-hop / Rap"], NA, 1996, [0.55, 0.15, 1, 0.55, 0.65, 0.45], [
    ["N.Y. State of Mind", "Illmatic", 1994, "social,hustle"],
    ["If I Ruled the World (Imagine That)", "It Was Written", 1996, "hustle,escapism"],
    ["One Mic", "Stillmatic", 2001, "hustle,introspection"],
  ]),
  A("eminem", "Eminem", ["Hip-hop / Rap"], NA, 2002, [0.8, 0.1, 1, 0.6, 0.95, 0.6], [
    ["Lose Yourself", "8 Mile (Soundtrack)", 2002, "hustle,resilience"],
    ["Stan", "The Marshall Mathers LP", 2000, "introspection,social", { energy: 0.5, tempo: 0.4 }],
    ["Sing for the Moment", "The Eminem Show", 2002, "rebellion,resilience"],
  ]),
  A("megan-thee-stallion", "Megan Thee Stallion", ["Hip-hop / Rap"], NA, 2020, [0.85, 0.05, 0.7, 0.75, 0.85, 0.6], [
    ["Savage", "Suga", 2020, "party,resilience"],
    ["Hot Girl Summer", "Single", 2019, "party"],
    ["Cash Shit", "Good News", 2020, "hustle,party"],
  ]),
  A("a-tribe-called-quest", "A Tribe Called Quest", ["Hip-hop / Rap", "Jazz / Blues"], NA, 1992, [0.55, 0.35, 0.8, 0.55, 0.5, 0.5], [
    ["Can I Kick It?", "People's Instinctive Travels and the Paths of Rhythm", 1990, "escapism,party"],
    ["Check the Rhime", "The Low End Theory", 1991, "party,hustle"],
    ["Scenario", "The Low End Theory", 1991, "party,social"],
  ]),

  // R&B / Soul
  A("sza", "SZA", ["R&B / Soul"], NA, 2022, [0.4, 0.3, 0.75, 0.75, 0.85, 0.45], [
    ["Kill Bill", "SOS", 2022, "heartbreak,rebellion"],
    ["The Weekend", "Ctrl", 2017, "love,heartbreak"],
    ["Normal Girl", "Ctrl", 2017, "introspection,resilience"],
  ]),
  A("frank-ocean", "Frank Ocean", ["R&B / Soul", "Other / Hybrid"], NA, 2016, [0.3, 0.35, 0.9, 0.6, 0.75, 0.35], [
    ["Thinking Bout You", "channel ORANGE", 2012, "love,heartbreak"],
    ["Nights", "Blonde", 2016, "introspection,nostalgia", { energy: 0.5, tempo: 0.5 }],
    ["Pink + White", "Blonde", 2016, "escapism,nostalgia"],
  ]),
  A("beyonce", "Beyoncé", ["R&B / Soul", "Pop"], NA, 2016, [0.75, 0.15, 0.6, 0.95, 1, 0.65], [
    ["Crazy in Love", "Dangerously in Love", 2003, "love,party"],
    ["Formation", "Lemonade", 2016, "social,resilience"],
    ["Daddy Lessons", "Lemonade", 2016, "roots,heartbreak", { acoustic: 0.55, energy: 0.5 }],
  ]),
  A("leon-bridges", "Leon Bridges", ["R&B / Soul"], NA, 2015, [0.35, 0.7, 0.6, 0.55, 0.5, 0.35], [
    ["Coming Home", "Coming Home", 2015, "love,nostalgia"],
    ["River", "Coming Home", 2015, "faith,resilience", { energy: 0.2, acoustic: 0.85 }],
    ["Beyond", "Good Thing", 2018, "love,introspection"],
  ]),
  A("dangelo", "D'Angelo", ["R&B / Soul"], NA, 2000, [0.4, 0.45, 0.6, 0.5, 0.5, 0.35], [
    ["Brown Sugar", "Brown Sugar", 1995, "love,party"],
    ["Untitled (How Does It Feel)", "Voodoo", 2000, "love"],
    ["Really Love", "Black Messiah", 2014, "love,introspection"],
  ]),
  A("amy-winehouse", "Amy Winehouse", ["R&B / Soul", "Jazz / Blues"], UK, 2007, [0.45, 0.55, 0.85, 0.55, 0.85, 0.4], [
    ["Rehab", "Back to Black", 2006, "rebellion,resilience"],
    ["Back to Black", "Back to Black", 2006, "heartbreak"],
    ["Love Is a Losing Game", "Back to Black", 2006, "heartbreak,introspection", { energy: 0.2, tempo: 0.25 }],
  ]),
  A("stevie-wonder", "Stevie Wonder", ["R&B / Soul"], NA, 1976, [0.65, 0.35, 0.7, 0.75, 0.85, 0.6], [
    ["Superstition", "Talking Book", 1972, "party,rebellion"],
    ["Sir Duke", "Songs in the Key of Life", 1976, "party,faith"],
    ["Visions", "Innervisions", 1973, "social,escapism", { energy: 0.3, tempo: 0.3 }],
  ]),
  A("daniel-caesar", "Daniel Caesar", ["R&B / Soul", "Gospel / Worship"], NA, 2017, [0.25, 0.5, 0.6, 0.7, 0.6, 0.3], [
    ["Best Part", "Freudian", 2017, "love"],
    ["Get You", "Freudian", 2017, "love"],
    ["Blessed", "Freudian", 2017, "faith,love"],
  ]),

  // Afrobeats / Africa diaspora
  A("burna-boy", "Burna Boy", ["Afrobeats", "Hip-hop / Rap"], AF, 2022, [0.7, 0.25, 0.6, 0.75, 0.8, 0.6], [
    ["Ye", "Outside", 2018, "hustle,party"],
    ["Last Last", "Love, Damini", 2022, "heartbreak,party"],
    ["Wonderful", "Twice as Tall", 2020, "resilience,faith", { energy: 0.5, tempo: 0.45 }],
  ]),
  A("wizkid", "Wizkid", ["Afrobeats"], AF, 2021, [0.55, 0.2, 0.4, 0.85, 0.85, 0.5], [
    ["Essence", "Made in Lagos", 2020, "love"],
    ["Ojuelegba", "Ayo", 2014, "hustle,roots"],
    ["Joro", "Single", 2019, "love,party"],
  ]),
  A("davido", "Davido", ["Afrobeats"], AF, 2019, [0.7, 0.15, 0.4, 0.85, 0.8, 0.65], [
    ["IF", "Son of Mercy", 2017, "love"],
    ["Fall", "Single", 2017, "love,party"],
    ["Unavailable", "A Better Time", 2020, "party,hustle"],
  ]),
  A("rema", "Rema", ["Afrobeats"], AF, 2022, [0.65, 0.15, 0.35, 0.85, 0.85, 0.55], [
    ["Calm Down", "Rave & Roses", 2022, "love,party"],
    ["Dumebi", "Single", 2019, "love,party"],
    ["Ginger Me", "Rave & Roses", 2022, "love"],
  ]),
  A("ayra-starr", "Ayra Starr", ["Afrobeats", "Pop"], AF, 2022, [0.65, 0.15, 0.5, 0.85, 0.75, 0.6], [
    ["Rush", "The Year I Turned 21", 2023, "party,escapism"],
    ["Bloody Samaritan", "19 & Dangerous", 2021, "rebellion,resilience"],
    ["Sability", "19 & Dangerous", 2021, "party,resilience"],
  ]),
  A("fela-kuti", "Fela Kuti", ["Afrobeats", "Jazz / Blues"], AF, 1976, [0.8, 0.55, 0.7, 0.35, 0.35, 0.6], [
    ["Zombie", "Zombie", 1977, "social,rebellion"],
    ["Water No Get Enemy", "Expensive Shit", 1975, "faith,roots"],
    ["Gentleman", "Gentleman", 1973, "social,roots"],
  ]),

  // Rock / Alt
  A("arctic-monkeys", "Arctic Monkeys", ["Rock / Alt"], UK, 2013, [0.65, 0.15, 0.75, 0.55, 0.85, 0.5], [
    ["Do I Wanna Know?", "AM", 2013, "love,introspection", { energy: 0.5, tempo: 0.4 }],
    ["R U Mine?", "Single", 2012, "love,rebellion", { energy: 0.85 }],
    ["Cornerstone", "Humbug", 2009, "nostalgia,heartbreak", { energy: 0.3, tempo: 0.35 }],
  ]),
  A("radiohead", "Radiohead", ["Rock / Alt", "Other / Hybrid"], UK, 1997, [0.45, 0.35, 0.7, 0.6, 0.75, 0.4], [
    ["Creep", "Pablo Honey", 1992, "introspection"],
    ["Karma Police", "OK Computer", 1997, "social,rebellion"],
    ["Pyramid Song", "Amnesiac", 2001, "escapism,faith", { energy: 0.25, tempo: 0.25 }],
  ]),
  A("nirvana", "Nirvana", ["Rock / Alt"], NA, 1992, [0.9, 0.2, 0.65, 0.2, 0.85, 0.6], [
    ["Smells Like Teen Spirit", "Nevermind", 1991, "rebellion"],
    ["Come as You Are", "Nevermind", 1991, "introspection", { energy: 0.6, tempo: 0.45 }],
    ["Heart-Shaped Box", "In Utero", 1993, "love,introspection"],
  ]),
  A("foo-fighters", "Foo Fighters", ["Rock / Alt"], NA, 2005, [0.85, 0.15, 0.55, 0.6, 0.85, 0.65], [
    ["Everlong", "The Colour and the Shape", 1997, "love"],
    ["Best of You", "In Your Honor", 2005, "resilience"],
    ["My Hero", "The Colour and the Shape", 1997, "resilience"],
  ]),
  A("the-strokes", "The Strokes", ["Rock / Alt"], NA, 2002, [0.7, 0.2, 0.5, 0.35, 0.65, 0.65], [
    ["Last Nite", "Is This It", 2001, "rebellion,escapism"],
    ["Reptilia", "Room on Fire", 2003, "rebellion"],
    ["Someday", "Is This It", 2001, "nostalgia,love", { energy: 0.55 }],
  ]),
  A("fleetwood-mac", "Fleetwood Mac", ["Rock / Alt", "Pop"], UK, 1977, [0.5, 0.5, 0.75, 0.7, 0.9, 0.45], [
    ["Go Your Own Way", "Rumours", 1977, "heartbreak,resilience", { energy: 0.7 }],
    ["Dreams", "Rumours", 1977, "heartbreak,escapism", { energy: 0.35 }],
    ["Gold Dust Woman", "Rumours", 1977, "introspection,escapism", { energy: 0.35 }],
  ]),
  A("paramore", "Paramore", ["Rock / Alt", "Pop"], NA, 2013, [0.85, 0.1, 0.6, 0.7, 0.8, 0.75], [
    ["Misery Business", "Riot!", 2007, "rebellion,heartbreak"],
    ["Ain't It Fun", "Paramore", 2013, "resilience,party"],
    ["Hard Times", "After Laughter", 2017, "introspection,resilience"],
  ]),
  A("tame-impala", "Tame Impala", ["Rock / Alt", "Electronic / Dance", "Other / Hybrid"], GM, 2015, [0.6, 0.1, 0.45, 0.65, 0.7, 0.55], [
    ["The Less I Know the Better", "Currents", 2015, "heartbreak,escapism"],
    ["Let It Happen", "Currents", 2015, "escapism,resilience"],
    ["Feels Like We Only Go Backwards", "Lonerism", 2012, "nostalgia,heartbreak", { energy: 0.45 }],
  ]),
  A("oasis", "Oasis", ["Rock / Alt"], UK, 1995, [0.65, 0.45, 0.55, 0.55, 0.9, 0.5], [
    ["Wonderwall", "(What's the Story) Morning Glory?", 1995, "love,nostalgia", { energy: 0.45, acoustic: 0.65 }],
    ["Don't Look Back in Anger", "(What's the Story) Morning Glory?", 1995, "nostalgia,resilience"],
    ["Slide Away", "Definitely Maybe", 1994, "love,escapism"],
  ]),
  A("coldplay", "Coldplay", ["Rock / Alt", "Pop"], UK, 2005, [0.5, 0.4, 0.6, 0.85, 0.98, 0.5], [
    ["Yellow", "Parachutes", 2000, "love"],
    ["Fix You", "X&Y", 2005, "resilience,faith", { energy: 0.4, tempo: 0.3 }],
    ["Politik", "A Rush of Blood to the Head", 2002, "social,rebellion"],
  ]),

  // Electronic / Dance
  A("calvin-harris", "Calvin Harris", ["Electronic / Dance", "Pop"], UK, 2014, [0.85, 0.03, 0.2, 0.9, 0.9, 0.8], [
    ["This Is What You Came For", "Single", 2016, "love,party", { energy: 0.7, tempo: 0.7 }],
    ["Feel So Close", "18 Months", 2011, "love,party"],
    ["Outside", "Motion", 2014, "heartbreak,resilience", { energy: 0.7 }],
  ]),
  A("daft-punk", "Daft Punk", ["Electronic / Dance"], GM, 2001, [0.8, 0.05, 0.1, 0.9, 0.85, 0.7], [
    ["One More Time", "Discovery", 2000, "party"],
    ["Get Lucky", "Random Access Memories", 2013, "party,love", { acoustic: 0.3, energy: 0.65 }],
    ["Veridis Quo", "Discovery", 2001, "escapism,nostalgia", { energy: 0.55, tempo: 0.55 }],
  ]),
  A("disclosure", "Disclosure", ["Electronic / Dance"], UK, 2013, [0.7, 0.05, 0.3, 0.85, 0.65, 0.65], [
    ["Latch", "Settle", 2012, "love"],
    ["White Noise", "Settle", 2013, "love,party"],
    ["F for You", "Settle", 2013, "love,party"],
  ]),
  A("avicii", "Avicii", ["Electronic / Dance", "Pop"], GM, 2013, [0.85, 0.15, 0.2, 0.9, 0.9, 0.75], [
    ["Levels", "Single", 2011, "party,resilience"],
    ["Wake Me Up", "True", 2013, "escapism,roots", { acoustic: 0.5, energy: 0.75 }],
    ["Silhouettes", "Single", 2012, "escapism,party"],
  ]),
  A("skrillex", "Skrillex", ["Electronic / Dance"], NA, 2011, [0.98, 0, 0.05, 0.75, 0.75, 0.8], [
    ["Scary Monsters and Nice Sprites", "Scary Monsters and Nice Sprites", 2010, "rebellion,party"],
    ["Bangarang", "Bangarang", 2011, "party,rebellion"],
    ["First of the Year (Equinox)", "Scary Monsters and Nice Sprites", 2010, "rebellion,escapism"],
  ]),
  A("kaytranada", "Kaytranada", ["Electronic / Dance", "R&B / Soul"], NA, 2016, [0.6, 0.1, 0.15, 0.8, 0.6, 0.6], [
    ["10%", "BUBBA", 2019, "love,escapism"],
    ["Glowed Up", "BUBBA", 2019, "party,hustle"],
    ["Lite Spots", "99.9%", 2016, "escapism,party"],
  ]),
  A("burial", "Burial", ["Electronic / Dance", "Other / Hybrid"], UK, 2007, [0.35, 0.05, 0.05, 0.45, 0.35, 0.5], [
    ["Archangel", "Untrue", 2007, "heartbreak,escapism"],
    ["Etched Headplate", "Untrue", 2007, "escapism,introspection"],
    ["Near Dark", "Untrue", 2007, "introspection,escapism"],
  ]),

  // Country / Folk
  A("morgan-wallen", "Morgan Wallen", ["Country / Folk"], NA, 2023, [0.55, 0.55, 0.75, 0.8, 0.95, 0.5], [
    ["Last Night", "One Thing at a Time", 2023, "heartbreak,party"],
    ["Wasted on You", "Dangerous: The Double Album", 2021, "heartbreak", { energy: 0.4, tempo: 0.4 }],
    ["Sand in My Boots", "Dangerous: The Double Album", 2021, "roots,nostalgia"],
  ]),
  A("chris-stapleton", "Chris Stapleton", ["Country / Folk", "Rock / Alt"], NA, 2015, [0.45, 0.7, 0.75, 0.55, 0.8, 0.35], [
    ["Tennessee Whiskey", "Traveller", 2015, "love", { energy: 0.3, tempo: 0.25 }],
    ["Starting Over", "Starting Over", 2020, "love,resilience"],
    ["Daddy Doesn't Pray Anymore", "Traveller", 2015, "faith,heartbreak", { energy: 0.3 }],
  ]),
  A("luke-combs", "Luke Combs", ["Country / Folk"], NA, 2019, [0.6, 0.55, 0.7, 0.75, 0.9, 0.55], [
    ["Beautiful Crazy", "What You See Is What You Get", 2019, "love"],
    ["Hurricane", "This One's for You", 2017, "heartbreak,resilience"],
    ["When It Rains It Pours", "This One's for You", 2015, "party,hustle", { energy: 0.7 }],
  ]),
  A("kacey-musgraves", "Kacey Musgraves", ["Country / Folk", "Pop"], NA, 2018, [0.35, 0.6, 0.75, 0.8, 0.6, 0.4], [
    ["Slow Burn", "Golden Hour", 2018, "escapism,nostalgia"],
    ["Rainbow", "Golden Hour", 2018, "resilience,faith", { energy: 0.2, acoustic: 0.7 }],
    ["Biscuits", "Same Trailer Different Park", 2013, "social,rebellion"],
  ]),
  A("johnny-cash", "Johnny Cash", ["Country / Folk"], NA, 1968, [0.45, 0.8, 0.85, 0.3, 0.85, 0.45], [
    ["Ring of Fire", "Ring of Fire: The Best of Johnny Cash", 1963, "love,rebellion"],
    ["Folsom Prison Blues", "At Folsom Prison", 1968, "rebellion,social", { energy: 0.6, tempo: 0.6 }],
    ["Hurt", "American IV: The Man Comes Around", 2002, "introspection,faith", { energy: 0.15, tempo: 0.2 }],
  ]),
  A("zach-bryan", "Zach Bryan", ["Country / Folk"], NA, 2022, [0.4, 0.8, 0.85, 0.3, 0.75, 0.4], [
    ["Something in the Orange", "American Heartbreak", 2022, "heartbreak", { energy: 0.3, tempo: 0.25 }],
    ["Oklahoma Smokeshow", "American Heartbreak", 2022, "love,roots"],
    ["Revival", "American Heartbreak", 2022, "faith,roots"],
  ]),
  A("lainey-wilson", "Lainey Wilson", ["Country / Folk"], NA, 2023, [0.6, 0.5, 0.7, 0.75, 0.8, 0.55], [
    ["Things a Man Oughta Know", "Sayin' What I'm Thinkin'", 2021, "resilience,roots"],
    ["Heart Like a Truck", "Bell Bottom Country", 2022, "roots,hustle"],
    ["Watermelon Moonshine", "Bell Bottom Country", 2022, "nostalgia,love"],
  ]),
  A("dolly-parton", "Dolly Parton", ["Country / Folk", "Pop"], NA, 1980, [0.4, 0.8, 0.85, 0.6, 0.9, 0.5], [
    ["Jolene", "Jolene", 1973, "heartbreak,love"],
    ["9 to 5", "9 to 5 and Odd Jobs", 1980, "hustle,resilience", { energy: 0.7, tempo: 0.7 }],
    ["Coat of Many Colors", "Coat of Many Colors", 1971, "roots,faith,nostalgia", { energy: 0.25, tempo: 0.35 }],
  ]),
  A("noah-kahan", "Noah Kahan", ["Country / Folk", "Rock / Alt"], NA, 2023, [0.55, 0.65, 0.9, 0.6, 0.85, 0.5], [
    ["Stick Season", "Stick Season", 2022, "introspection,roots"],
    ["Dial Drunk", "Stick Season", 2022, "heartbreak"],
    ["Northern Attitude", "Stick Season", 2022, "roots,introspection"],
  ]),

  // Jazz / Blues
  A("miles-davis", "Miles Davis", ["Jazz / Blues"], NA, 1959, [0.3, 0.9, 0.05, 0.65, 0.6, 0.4], [
    ["So What", "Kind of Blue", 1959, "escapism,introspection"],
    ["Blue in Green", "Kind of Blue", 1959, "introspection", { energy: 0.15, tempo: 0.2 }],
    ["Miles Runs the Voodoo Down", "Bitches Brew", 1970, "escapism,rebellion", { energy: 0.55 }],
  ]),
  A("nina-simone", "Nina Simone", ["Jazz / Blues", "R&B / Soul"], NA, 1965, [0.45, 0.85, 0.8, 0.5, 0.6, 0.5], [
    ["Feeling Good", "I Put a Spell on You", 1965, "resilience,escapism"],
    ["Sinnerman", "Pastel Blues", 1965, "faith,rebellion", { energy: 0.75, tempo: 0.75 }],
    ["Mississippi Goddam", "Nina Simone in Concert", 1964, "social,rebellion", { energy: 0.6, tempo: 0.7 }],
  ]),
  A("norah-jones", "Norah Jones", ["Jazz / Blues", "Country / Folk"], NA, 2002, [0.2, 0.85, 0.6, 0.85, 0.85, 0.3], [
    ["Don't Know Why", "Come Away with Me", 2002, "love,heartbreak"],
    ["Come Away with Me", "Come Away with Me", 2002, "love"],
    ["Sunrise", "Feels Like Home", 2004, "love,escapism"],
  ]),
  A("billie-holiday", "Billie Holiday", ["Jazz / Blues"], NA, 1945, [0.2, 0.85, 0.85, 0.35, 0.65, 0.3], [
    ["Strange Fruit", "Single", 1939, "social,rebellion"],
    ["God Bless the Child", "Single", 1941, "hustle,social"],
    ["Don't Explain", "Single", 1944, "love,heartbreak"],
  ]),
  A("kamasi-washington", "Kamasi Washington", ["Jazz / Blues"], NA, 2018, [0.65, 0.85, 0.05, 0.55, 0.35, 0.55], [
    ["Truth", "Heaven and Earth", 2018, "faith,escapism"],
    ["Change of the Guard", "The Epic", 2015, "resilience,faith"],
    ["The Rhythm Changes", "The Epic", 2015, "escapism"],
  ]),

  // Gospel / Worship
  A("kirk-franklin", "Kirk Franklin", ["Gospel / Worship"], NA, 1998, [0.75, 0.2, 0.55, 0.85, 0.6, 0.65], [
    ["Stomp", "God's Property from Kirk Franklin's Nu Nation", 1997, "party,faith"],
    ["I Smile", "Hello Fear", 2011, "resilience,faith"],
    ["Love Theory", "Single", 2019, "love,faith", { energy: 0.5 }],
  ]),
  A("elevation-worship", "Elevation Worship", ["Gospel / Worship"], NA, 2020, [0.55, 0.3, 0.6, 0.85, 0.6, 0.5], [
    ["Graves into Gardens", "Graves Into Gardens", 2020, "faith,resilience"],
    ["O Come to the Altar", "Here as in Heaven", 2016, "faith", { energy: 0.45, tempo: 0.35 }],
    ["Do It Again", "There Is a Cloud", 2017, "faith,resilience"],
  ]),
  A("maverick-city-music", "Maverick City Music", ["Gospel / Worship", "R&B / Soul"], NA, 2021, [0.45, 0.4, 0.55, 0.7, 0.5, 0.4], [
    ["Jireh", "Old Church Basement", 2021, "faith"],
    ["Promises", "Maverick City Vol. 3 Part 1", 2020, "faith,resilience"],
    ["Man of Your Word", "Maverick City Vol. 3 Part 1", 2020, "faith,resilience"],
  ]),
  A("hillsong-united", "Hillsong United", ["Gospel / Worship"], GM, 2013, [0.55, 0.3, 0.55, 0.85, 0.65, 0.5], [
    ["Oceans (Where Feet May Fail)", "Zion", 2013, "faith"],
    ["Touch the Sky", "Aftermath", 2011, "faith,escapism", { energy: 0.7, tempo: 0.65 }],
    ["So Will I (100 Billion X)", "Wonder", 2017, "faith,introspection"],
  ]),
  A("cece-winans", "CeCe Winans", ["Gospel / Worship", "R&B / Soul"], NA, 2021, [0.4, 0.45, 0.6, 0.85, 0.55, 0.35], [
    ["Goodness of God", "Believe for It", 2021, "faith"],
    ["Alabaster Box", "Alabaster Box", 1999, "faith,love"],
    ["Believe for It", "Believe for It", 2021, "faith,resilience"],
  ]),
  A("mahalia-jackson", "Mahalia Jackson", ["Gospel / Worship", "Jazz / Blues"], NA, 1955, [0.4, 0.6, 0.6, 0.4, 0.5, 0.35], [
    ["Move On Up a Little Higher", "Single", 1947, "faith,resilience"],
    ["Precious Lord, Take My Hand", "Single", 1956, "faith,heartbreak", { energy: 0.2, tempo: 0.2 }],
    ["How I Got Over", "Single", 1951, "faith,resilience"],
  ]),

  // Latin
  A("bad-bunny", "Bad Bunny", ["Latin", "Hip-hop / Rap"], LA, 2022, [0.7, 0.1, 0.55, 0.8, 0.98, 0.6], [
    ["Dákiti", "El Último Tour del Mundo", 2020, "love,party"],
    ["Tití Me Preguntó", "Un Verano Sin Ti", 2022, "party,love"],
    ["Ojitos Lindos", "Un Verano Sin Ti", 2022, "love,roots", { energy: 0.45, tempo: 0.45 }],
  ]),
  A("shakira", "Shakira", ["Latin", "Pop"], LA, 2006, [0.7, 0.3, 0.55, 0.8, 0.95, 0.65], [
    ["Hips Don't Lie", "Oral Fixation, Vol. 2", 2006, "party,love"],
    ["Whenever, Wherever", "Laundry Service", 2001, "love,party"],
    ["Ojos Así", "¿Dónde Están los Ladrones?", 1998, "love,heartbreak", { energy: 0.5, acoustic: 0.45 }],
  ]),
  A("karol-g", "KAROL G", ["Latin", "Pop"], LA, 2023, [0.75, 0.1, 0.4, 0.85, 0.9, 0.65], [
    ["Bichota", "Single", 2020, "resilience,party"],
    ["TQG", "Mañana Será Bonito", 2023, "heartbreak,resilience"],
    ["Provenza", "Single", 2022, "escapism,party"],
  ]),
  A("j-balvin", "J Balvin", ["Latin"], LA, 2017, [0.8, 0.1, 0.25, 0.85, 0.9, 0.65], [
    ["Mi Gente", "Single", 2017, "party,roots"],
    ["Ginza", "Energía", 2015, "party"],
    ["Ay Vamos", "Energía", 2015, "party,love"],
  ]),
  A("rosalia", "Rosalía", ["Latin", "Other / Hybrid"], LA, 2022, [0.65, 0.3, 0.45, 0.75, 0.7, 0.55], [
    ["Malamente", "El Mal Querer", 2018, "heartbreak,rebellion"],
    ["Con Altura", "Single", 2019, "party,hustle"],
    ["SAOKO", "MOTOMAMI", 2022, "rebellion,hustle"],
  ]),
  A("daddy-yankee", "Daddy Yankee", ["Latin", "Hip-hop / Rap"], LA, 2005, [0.85, 0.05, 0.35, 0.85, 0.85, 0.75], [
    ["Gasolina", "Barrio Fino", 2004, "party"],
    ["Dura", "Single", 2018, "party,hustle"],
    ["Limbo", "Prestige", 2012, "party"],
  ]),
  A("juanes", "Juanes", ["Latin", "Rock / Alt"], LA, 2004, [0.6, 0.5, 0.6, 0.7, 0.8, 0.55], [
    ["La Camisa Negra", "Mi Sangre", 2004, "heartbreak,party"],
    ["A Dios Le Pido", "Un Día Normal", 2002, "faith,love"],
    ["Fotografía", "Un Día Normal", 2002, "love,heartbreak", { energy: 0.35, tempo: 0.4 }],
  ]),

  // Other / Hybrid
  A("lorde", "Lorde", ["Other / Hybrid", "Pop"], GM, 2013, [0.5, 0.15, 0.8, 0.7, 0.8, 0.5], [
    ["Royals", "Pure Heroine", 2013, "social,rebellion"],
    ["Green Light", "Melodrama", 2017, "heartbreak,escapism", { energy: 0.8, tempo: 0.7 }],
    ["Ribs", "Pure Heroine", 2013, "nostalgia,introspection"],
  ]),
  A("glass-animals", "Glass Animals", ["Other / Hybrid", "Rock / Alt"], UK, 2021, [0.5, 0.15, 0.5, 0.65, 0.7, 0.5], [
    ["Heat Waves", "Dreamland", 2020, "nostalgia,heartbreak"],
    ["Gooey", "ZABA", 2014, "escapism,love"],
    ["Space Ghost Coast to Coast", "ZABA", 2014, "escapism"],
  ]),
  A("gorillaz", "Gorillaz", ["Other / Hybrid", "Hip-hop / Rap", "Electronic / Dance"], UK, 2005, [0.6, 0.15, 0.55, 0.6, 0.85, 0.55], [
    ["Feel Good Inc.", "Demon Days", 2005, "escapism,social"],
    ["Clint Eastwood", "Gorillaz", 2001, "rebellion,escapism"],
    ["On Melancholy Hill", "Plastic Beach", 2010, "escapism,introspection", { energy: 0.45 }],
  ]),
  A("bjork", "Björk", ["Other / Hybrid", "Electronic / Dance"], GM, 1997, [0.5, 0.25, 0.5, 0.5, 0.5, 0.5], [
    ["Army of Me", "Post", 1995, "resilience,rebellion", { energy: 0.8 }],
    ["Human Behaviour", "Debut", 1993, "introspection,escapism"],
    ["Hyperballad", "Post", 1995, "love,introspection"],
  ]),
  A("lana-del-rey", "Lana Del Rey", ["Other / Hybrid", "Pop"], NA, 2019, [0.3, 0.35, 0.8, 0.75, 0.8, 0.3], [
    ["Summertime Sadness", "Born to Die", 2012, "heartbreak,nostalgia"],
    ["Video Games", "Born to Die", 2011, "love,nostalgia"],
    ["Venice Bitch", "Norman Fucking Rockwell!", 2019, "love,escapism"],
  ]),
  A("hozier", "Hozier", ["Other / Hybrid", "Rock / Alt", "Country / Folk"], UK, 2014, [0.5, 0.6, 0.85, 0.65, 0.8, 0.45], [
    ["Take Me to Church", "Hozier", 2013, "faith,rebellion"],
    ["Cherry Wine", "Hozier", 2014, "love,social", { energy: 0.25, acoustic: 0.85 }],
    ["Work Song", "Hozier", 2014, "love,roots"],
  ]),
  A("phoebe-bridgers", "Phoebe Bridgers", ["Other / Hybrid", "Rock / Alt", "Country / Folk"], NA, 2020, [0.35, 0.7, 0.9, 0.55, 0.5, 0.4], [
    ["Motion Sickness", "Stranger in the Alps", 2017, "heartbreak,introspection", { energy: 0.5 }],
    ["Kyoto", "Punisher", 2020, "introspection,resilience", { energy: 0.65, tempo: 0.65 }],
    ["Funeral", "Stranger in the Alps", 2017, "introspection", { energy: 0.15 }],
  ]),
  A("bon-iver", "Bon Iver", ["Other / Hybrid", "Country / Folk"], NA, 2011, [0.25, 0.75, 0.8, 0.5, 0.6, 0.3], [
    ["Skinny Love", "For Emma, Forever Ago", 2007, "heartbreak,introspection"],
    ["Holocene", "Bon Iver, Bon Iver", 2011, "introspection,nostalgia"],
    ["Flume", "For Emma, Forever Ago", 2007, "introspection,escapism"],
  ]),
];

const BY_ID = new Map(SEED_ARTISTS.map((a) => [a.id, a]));
export function seedArtist(id: string): SeedArtist | undefined {
  return BY_ID.get(id);
}
