// ============================================================================
// The Infinite End: setup, quality level, hashing and the fields that shape the world
// ============================================================================
const $ = (id) => document.getElementById(id), cv = $('c'), B = document.body;
const QS = new URLSearchParams(location.search), TEST = QS.has('test') || !!window.ES_TEST;
const mob = matchMedia('(pointer:coarse)').matches;
const keep = (k, v) => { try { localStorage[k] = v; } catch {} };
let LV = null;
try { LV = localStorage.esLevel; } catch {}
if (QS.has('lv')) LV = QS.get('lv');
if (window.ES_LV != null) LV = window.ES_LV;
LV = LV != null && LV !== '' ? +LV : mob ? 2 : navigator.deviceMemory <= 4 ? 1 : 0; // 0 High, 1 Medium, 2 Low
const Q = [
  { aa: 4, cube: 1024, k: 1, per: 1, rays: 28, dpr: 1.5 },
  { aa: 2, cube: 1024, k: .82, per: .7, rays: 20, dpr: 1.25 },
  { aa: 0, cube: 512, k: .64, per: .4, rays: 12, dpr: 1 },
][LV];

const gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
if (!gl) throw Error('This scene needs WebGL 2. Try a current Chrome, Edge, Firefox or Safari.', { cause: 1 });
const HF = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
const HDRI = HF ? gl.RGBA16F : gl.RGBA8, HDRT = HF ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

const step = (p, t) => { $('bf').style.transform = `scaleX(${p})`; $('pc').textContent = Math.round(p * 100) + '%'; $('st').textContent = t; return new Promise((r) => setTimeout(r, 30)); };

// ---- integer hashing (the whole world is a pure function of these) ----
const U = 1 / 4294967296;
const hs = (x) => { x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16; return x >>> 0; };
const h3 = (x, y, z, s) => hs(Math.imul(x | 0, 0x9E3779B1) ^ hs(Math.imul(y | 0, 0x85EBCA77) ^ hs(Math.imul(z | 0, 0xC2B2AE3D) ^ s)));
let rs = 1;
const rnd = () => (rs = hs(rs + 0x9E3779B9)) * U;
const sm = (a, b, x) => { x = (x - a) / (b - a); x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };

// smooth value noise on an integer lattice, 0..1
function noise(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = h3(xi, yi, zi, s), b = h3(xi + 1, yi, zi, s), c = h3(xi, yi + 1, zi, s), d = h3(xi + 1, yi + 1, zi, s);
  const e = h3(xi, yi, zi + 1, s), f = h3(xi + 1, yi, zi + 1, s), g = h3(xi, yi + 1, zi + 1, s), h = h3(xi + 1, yi + 1, zi + 1, s);
  const ab = a + (b - a) * fx, cd = c + (d - c) * fx, ef = e + (f - e) * fx, gh = g + (h - g) * fx;
  const lo = ab + (cd - ab) * fy, hi = ef + (gh - ef) * fy;
  return (lo + (hi - lo) * fz) * U;
}

// ---- world fields, in world units ----
// matter: asteroid belts are thick curved sheets (where a slow noise crosses its middle), broken up by a faster one
// open space: wide pockets of quiet, a few kilometres across, where the belts thin out and traffic keeps away
// Every place has its own field genome (SYS.fg, set in setLoc): where its fields sit (offsets), how big and how flat its
// structures are, and which kind of field it is: 0 curved sheets, 1 dense clusters in emptiness, 2 a flat disc of rings, 3 sparse.
const FG0 = { o: [0, 0, 0], oc: [0, 0, 0], s: 1, sy: 1, m: 0, n: [0, 1, 0], th: 500, rw: 260, h0: 0 };
const fgg = () => (SYS && SYS.fg) || FG0;
const fC = (x, y, z) => { const g = fgg(); return sm(.56, .7, noise((x + g.oc[0]) / 9000, (y + g.oc[1]) / 6000, (z + g.oc[2]) / 9000, 61)); };
const fM = (x, y, z) => {
  const g = fgg(), X = x + g.o[0], Y = y + g.o[1], Z = z + g.o[2], s = g.s; let v;
  if (g.m === 1) v = .42 + 1.05 * sm(.52, .84, noise(X / (1700 * s), Y / (1700 * s * g.sy), Z / (1700 * s), 13)) + (noise(X / 620, Y / 620, Z / 620, 12) - .5) * .5;
  else if (g.m === 2) { const h = x * g.n[0] + y * g.n[1] + z * g.n[2] - g.h0, r = Math.sqrt(Math.max(0, x * x + y * y + z * z - h * h)), band = Math.exp(-(h * h) / (g.th * g.th));
    const ring = .5 + .5 * Math.cos(r / g.rw + noise(X / 3000, 0, Z / 3000, 14) * 4); v = .3 + 1.15 * band * (.35 + .65 * ring) + (noise(X / 700, Y / 700, Z / 700, 12) - .5) * .4; }
  else if (g.m === 3) v = .6 + (noise(X / 900, Y / 900, Z / 900, 15) - .5) * .7 + (noise(X / 260, Y / 260, Z / 260, 16) - .5) * .25;
  else v = 1 - Math.abs(2 * noise(X / (2600 * s), Y / (1500 * s * g.sy), Z / (2600 * s), 11) - 1) + (noise(X / 800, Y / 560, Z / 800, 12) - .5) * .55;
  return v - .8 * fC(x, y, z);
};
const fL = (x, y, z) => { const g = fgg(); return noise((x - g.o[2]) / 2800, (y + g.o[0]) / 2800, (z + g.o[1]) / 2800, 21); };   // life: where swarms gather
const fG = (x, y, z) => { const g = fgg(); return noise((x + g.o[1]) / 2400, (y - g.o[2]) / 2000, (z + g.o[0]) / 2400, 31); };   // gas: fog thickness and nebula wisps
const fW = (x, y, z) => noise(x / 1700, y / 1700, z / 1700, 51);   // wreckage
// ---- star systems. Nothing blends: a system has one look, one cast and one sky, and you jump between them. ----
// Eight kinds of system; the seed varies colour, planets and layout within a kind.
const NAMES = ['Verdant Belt', 'Glacier Field', 'Ember Forge', 'The Void', 'Ringworld', 'Graveyard', 'Bloom Nursery', "Giant's Shadow"];
// base colours: nebula A, nebula B, emission / glow, star
const PAL = [
  [.02, .50, .40, .04, .18, .62, .50, 1., .78, 1., .92, .76],
  [.42, .58, .70, .20, .34, .62, .85, .95, 1., .95, .97, 1.],
  [.78, .25, .04, .46, .04, .14, 1., .74, .32, 1., .78, .58],
  [.03, .03, .13, .07, .02, .11, .50, .45, 1., .80, .85, 1.],
  [.03, .15, .78, .02, .42, .60, .48, .80, 1., .84, .92, 1.],
  [.30, .22, .12, .12, .14, .20, 1., .62, .30, 1., .84, .66],
  [.56, .06, .50, .15, .07, .68, 1., .48, .86, 1., .84, .90],
  [.55, .30, .10, .10, .16, .45, 1., .80, .50, 1., .90, .72],
];
// sky: black hole, ringworld, galaxy, lightning
const SKYW = [[0, 0, .2, .2], [0, 0, .5, 0], [0, 0, .1, 1], [1, 0, 1, 0], [0, 1, .3, 0], [0, 0, .3, .3], [0, 0, .1, .6], [0, 0, .2, 0]];
// asteroid materials found there (picked by hash): 0 rock, 1 iron, 2 ice, 3 molten, 4 overgrown, 5 obsidian
const REGT = [[0, 0, 0, 0, 4, 4, 4, 0], [2, 2, 2, 2, 2, 2, 5, 2], [3, 3, 3, 1, 1, 3, 0, 3], [5, 5, 5, 5, 5, 5, 5, 0], [0, 0, 0, 0, 1, 0, 0, 1], [1, 1, 1, 1, 0, 1, 0, 1], [4, 4, 4, 0, 4, 4, 0, 4], [0, 0, 0, 2, 0, 0, 2, 0]];
// what fills it: rock (belt threshold shift, lower = denser), crystals, tendrils, debris, stations, megastructures, geodes, titans, fog,
// life = jellyfish swarms, colossal jellyfish, minnows, void rays, leviathans, serpents
const ARC = [
  { rock: 0, cry: .2, ten: 0, deb: 0, st: .15, mega: 0, geo: .1, ti: .15, fog: 1, life: [.6, .15, .4, .5, 0, 0], tr: 'Overgrown asteroid belts · jellyfish swarms · void rays' },
  { rock: -.05, cry: .8, ten: 0, deb: 0, st: .1, mega: 0, geo: .2, ti: .2, fog: .6, life: [0, 0, .25, 0, .7, 0], tr: 'Ice fields thick with crystal · leviathan pods' },
  { rock: -.08, cry: .05, ten: 0, deb: 0, st: .1, mega: 0, geo: .2, ti: .25, fog: 1.3, life: [0, 0, 0, 0, 0, .45], tr: 'Molten rock and iron · storm lightning · serpents' },
  { rock: .14, cry: .45, ten: 0, deb: 0, st: 0, mega: .12, geo: .25, ti: .1, fog: .3, life: [0, .6, 0, .25, 0, 0], tr: 'A black hole · obsidian shards · colossal jellyfish · rich geodes' },
  { rock: .06, cry: .15, ten: 0, deb: 0, st: .6, mega: .6, geo: .1, ti: .1, fog: .55, life: [0, 0, .5, 0, 0, 0], tr: 'Inside a ringworld · stations and megastructures' },
  { rock: .03, cry: 0, ten: 0, deb: 1, st: .8, mega: .3, geo: .15, ti: .15, fog: .9, life: [0, 0, 0, .35, 0, .25], tr: 'Wreckage fields · derelict stations · iron asteroids' },
  { rock: .2, cry: .1, ten: 1, deb: 0, st: 0, mega: 0, geo: .08, ti: .1, fog: 1.7, life: [1, .5, .7, .25, .3, 0], tr: 'Dense glowing nebula · tendril forests · life everywhere' },
  { rock: -.03, cry: .25, ten: 0, deb: 0, st: .2, mega: .1, geo: .15, ti: .5, fog: .8, life: [.2, 0, .15, .4, .5, 0], tr: 'A gas giant fills the sky · titan asteroids · leviathans' },
];
// traffic: fighter patrols, frigates, drone swarms. Machines are now the common sight; living things are rare.
[[.4, .25, .25], [.3, .25, .3], [.45, .35, .25], [.1, .15, .6], [.9, .8, .5], [.3, .35, .9], [.1, .05, .1], [.6, .6, .25]].forEach((f, i) => {
  const a = ARC[i]; a.fl = f[0]; a.fr = f[1]; a.dr = f[2]; a.life = a.life.map((v) => v * (i === 6 ? .6 : .3));
  a.tr += (f[0] > .5 ? ' · patrol wings' : '') + (f[1] > .5 ? ' · frigates' : '') + (f[2] > .5 ? ' · drone swarms' : '');
});
// ---- names: Earth's places and people, carried out into the dark with a little future on them ----
const NM = {
  city: ['Halifax', 'Lagos', 'Kyoto', 'Valparaiso', 'Tromso', 'Odessa', 'Marrakesh', 'Cusco', 'Dakar', 'Hobart', 'Reykjavik', 'Galway', 'Nairobi', 'Quito', 'Tbilisi', 'Manila', 'Perth', 'Juneau', 'Darwin', 'Kingston',
    'Samarkand', 'Lisbon', 'Hanoi', 'Tangier', 'Bergen', 'Zanzibar', 'Santiago', 'Aberdeen', 'Accra', 'Kampala', 'Osaka', 'Seville', 'Napoli', 'Krakow', 'Tallinn', 'Montreal', 'Sudbury', 'Avalon', 'Calgary', 'Memphis',
    'Savannah', 'Petra', 'Timbuktu', 'Lhasa', 'Ushuaia', 'Tasmania', 'Caspian', 'Hudson', 'Labrador', 'Orkney', 'Cornwall', 'Brittany', 'Sicily', 'Crete', 'Malta', 'Bermuda', 'Havana', 'Manaus', 'Macau', 'Busan',
    'Sapporo', 'Okinawa', 'Fiji', 'Tonga', 'Samoa', 'Tahiti', 'Kodiak', 'Sitka', 'Nome', 'Yukon', 'Dublin', 'Oslo', 'Porto', 'Riga', 'Cork', 'Muscat', 'Agra', 'Goa', 'Medina', 'Antigua'],
  pre: ['New', 'Port', 'Far', 'Upper', 'Outer', 'Fort', 'Nova'], suf: ['Reach', 'Drift', 'Verge', 'Deep', 'Crossing', 'Expanse', 'Haven', 'Terminus', 'Sound', 'Marches'],
  world: ['Shackleton', 'Amundsen', 'Magellan', 'Kepler', 'Hypatia', 'Galileo', 'Tycho', 'Banneker', 'Lovelace', 'Curie', 'Zheng He', 'Battuta', 'Earhart', 'Gagarin', 'Tereshkova', 'Herschel', 'Halley', 'Cassini',
    'Huygens', 'Persephone', 'Freya', 'Anansi', 'Maui', 'Quetzal', 'Inti', 'Osiris', 'Brigid', 'Selene', 'Atlas', 'Tethys', 'Calypso', 'Nansen', 'Cook', 'Tasman', 'Bering', 'Hudson', 'Franklin', 'Peary', 'Henson', 'Sacagawea'],
  place: [
    [['Sargasso', 'Hebrides', 'Danube', 'Mekong', 'Okavango', 'Tasman', 'Coral', 'Baltic', 'Loire', 'Zambezi', 'Fraser', 'Severn', 'Shannon', 'Volga', 'Amazon', 'Thames'], ['Belt', 'Field', 'Shoals', 'Run']],
    null,
    [['Vesuvius', 'Etna', 'Krakatoa', 'Sheffield', 'Pittsburgh', 'Hekla', 'Erebus', 'Stromboli', 'Ruhr', 'Katla', 'Tambora', 'Pele', 'Sakurajima', 'Fuji'], ['Forge', 'Works', 'Foundry']],
    [['Atacama', 'Gobi', 'Namib', 'Sahel', 'Nullarbor', 'Taklamakan', 'Mojave', 'Kalahari', 'Empty Quarter', 'Badlands', 'Steppe', 'Barrens'], ['Rim', 'Dark', 'Quiet']],
    [['Rotterdam', 'Marrakesh', 'Shenzhen', 'Lagos', 'Valparaiso', 'Hamburg', 'Singapore', 'Istanbul', 'Mombasa', 'Halifax', 'Antwerp', 'Busan', 'Panama', 'Gibraltar', 'Suez', 'Malacca'], ['Hub', 'Exchange', 'Market', 'Freeport']],
    [['Roanoke', 'Mary Celeste', 'Erebus', 'Endurance', 'Bounty', 'Flannan', 'Atlantis', 'Lyonesse', 'Franklin', 'Baychimo', 'Octavius', 'Terror'], ['Wreck Field', 'Graveyard', 'Boneyard']],
    [['Kew', 'Eden', 'Daintree', 'Galapagos', 'Ningaloo', 'Borneo', 'Monteverde', 'Sundarbans', 'Everglades', 'Camargue', 'Serengeti', 'Kinabalu'], ['Nursery', 'Gardens', 'Bloom']], null],
  first: ['Amara', 'Mateo', 'Priya', 'Kofi', 'Ingrid', 'Hiroshi', 'Leila', 'Tomas', 'Nadia', 'Emeka', 'Sofia', 'Ravi', 'Aiyana', 'Lars', 'Mei', 'Diego', 'Fatima', 'Callum', 'Yusuf', 'Elena', 'Kwame', 'Saoirse', 'Arjun', 'Noor',
    'Bjorn', 'Thandiwe', 'Luca', 'Zara', 'Oren', 'Ines', 'Malik', 'Hana', 'Rafael', 'Grace', 'Tariq', 'Freya', 'Jun', 'Esme', 'Kenji', 'Adaeze', 'Mira', 'Rowan', 'Soren', 'Lucia', 'Dmitri', 'Wren', 'Ayo', 'Celeste'],
  last: ['Okafor', 'Lindqvist', 'Tanaka', 'Morales', 'Haddad', 'Novak', 'Mensah', 'Kowalski', 'Reyes', 'Abernathy', 'Singh', 'Castellanos', 'Murphy', 'Nakamura', 'Osei', 'Petrov', 'Silva', 'Fitzgerald', 'Rahman', 'Holloway',
    'Achebe', 'Varga', 'Delacroix', 'Moreau', 'Kaur', 'Brennan', 'Yilmaz', 'Takahashi', 'Lindgren', 'Mwangi', 'Quispe', 'Halvorsen', 'Ferreira', 'Sato', "O'Neil", 'Dubois', 'Kane', 'Ndlovu', 'Sorensen', 'Vasquez'],
  ship: ['Kingfisher', 'Southern Cross', 'Morning Star', 'Saint Brendan', 'Halcyon', 'Albatross', 'Tasman Rose', 'Lady Ada', 'Old Faithful', 'Maple Leaf', 'Northern Light', 'Bluebird', 'Wanderer', 'Good Hope',
    'Silver Birch', 'Mayflower', 'Calypso', 'Sea Otter', 'Heron', 'Skylark', 'Piper', 'Juniper', 'Marigold', 'Second Wind', 'Long Haul', 'Fair Winds', 'Iron Mule', 'Little Dipper', 'Cormorant', 'Petrel', 'Kittiwake', 'Lodestar'],
  raider: ['Black Dog', 'Jackal', 'Red Mary', 'Grim Harvest', 'Rattlesnake', 'Bad Penny', 'Barracuda', 'Coyote', 'Hellcat', 'Scrapjack', 'Vandal', 'Carrion Crow', 'Mongrel', 'Widowmaker', 'Copperhead', 'Stray Bullet'],
  navy: ['Resolute', 'Valiant', 'Intrepid', 'Magellan', 'Discovery', 'Vanguard', 'Orion', 'Concord', 'Sovereign', 'Tenacity', 'Meridian', 'Steadfast'],
};
const pickN = (R, list) => list[R() * list.length | 0];
const personName = (R) => pickN(R, NM.first) + ' ' + pickN(R, NM.last);
const nameRng = (id, k) => { const r = mulberry32(Math.imul((id ^ k) >>> 0, 2654435761) >>> 0); r(); r(); return r; };   // well stirred: neighbouring systems' seeds are related
// The seed hierarchy. MASTER + sector coordinates give a system's seed; the system seed and a place's index give
// that place's salt; the salt enters the hash of every cell, so rocks, ore, creatures and traffic all follow from it.
let MASTER = 0x5EEDE5, HOME = 12;                            // set per player once the save is read: every new game is its own universe
const mulberry32 = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const sysIdAt = (x, y, z) => (x | y | z) === 0 ? HOME : h3(x, y, z, MASTER) >>> 0;            // the home sector is fixed; the rest is hashed
// gates link a sector to some of its six neighbours; a link is the same seen from either end
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function linked(a, b) { const f = a[0] < b[0] || a[0] === b[0] && (a[1] < b[1] || a[1] === b[1] && a[2] < b[2]), p = f ? a : b, q = f ? b : a; return a[1] === b[1] && a[2] === b[2] || h3(p[0], p[1], p[2], h3(q[0], q[1], q[2], MASTER)) % 100 < 14; }   // an east-west spine, and now and then a branch: two or three lanes a system
const reach = (s) => DIRS.map((d) => [s[0] + d[0], s[1] + d[1], s[2] + d[2]]).filter((n) => linked(s, n));
let SYS = null;
function mkSys(id) {
  id >>>= 0; const rnd = mulberry32(id ^ MASTER); const t = id & 7, a = ARC[t], s = { id, t, cls: t, a, salt: 0, mat: REGT[t], sky: SKYW[t].slice(), pr: [0, 0, 0], locs: [], loc: 0, planets: [], pal: new Float32Array(12), pl: new Float32Array(12), pa: new Float32Array(12), pb: new Float32Array(9), seed: [0, 0, 0] };
  // the kind's colours, with the hue turned a little so two systems of a kind are not twins
  const th = (rnd() - .5) * .9, co = Math.cos(th), si = Math.sin(th), k = (1 - co) / 3, q = si * .57735, P = PAL[t];
  for (let i = 0; i < 12; i += 3) { const r = P[i], g = P[i + 1], b = P[i + 2], w = i < 9 ? 1 : .3; s.pal[i] = r + w * ((co + k - 1) * r + (k - q) * g + (k + q) * b); s.pal[i + 1] = g + w * ((k + q) * r + (co + k - 1) * g + (k - q) * b); s.pal[i + 2] = b + w * ((k - q) * r + (k + q) * g + (co + k - 1) * b); }
  for (let i = 0; i < 12; i++) s.pal[i] = Math.max(.01, s.pal[i]);
  s.seed0 = [rnd() * 40, rnd() * 40, rnd() * 40]; s.seed = s.seed0.slice(); s.rot = [co, k, q]; s.th = th;
  // three worlds: a main planet (enormous in a Giant's Shadow, absent in the Void), and two lesser ones
  for (let i = 0; i < 3; i++) {
    let d; do { d = [rnd() * 2 - 1, rnd() * .9 - .45, rnd() * 2 - 1]; const l = Math.hypot(d[0], d[1], d[2]); d = [d[0] / l, d[1] / l, d[2] / l]; } while (d[0] * .45 + d[1] * .32 - d[2] * .83 > .55 || (i && d[0] * s.pl[0] + d[1] * s.pl[1] + d[2] * s.pl[2] > .6));
    const r = i ? .025 + .05 * rnd() : t === 3 ? 0 : .1 + .1 * rnd(), h = rnd(); s.pr[i] = r;
    s.pl.set([d[0], d[1], d[2], r], i * 4);
    const c1 = [.5 + .5 * Math.cos(6.283 * h), .5 + .5 * Math.cos(6.283 * (h + .33)), .5 + .5 * Math.cos(6.283 * (h + .67))];
    s.pa.set([c1[0] * .3 + s.pal[3] * .35 + .2, c1[1] * .3 + s.pal[4] * .35 + .2, c1[2] * .3 + s.pal[5] * .35 + .2, !i && rnd() < .7 || t === 7 && !i ? 1 : 0], i * 4);
    s.pb.set([c1[2] * .2 + s.pal[0] * .3 + .08, c1[0] * .2 + s.pal[1] * .3 + .08, c1[1] * .2 + s.pal[2] * .3 + .08], i * 3);
  }
  { const nr = nameRng(id, 0x4E414D45), c = pickN(nr, NM.city);   // e.g. New Halifax, Kyoto Reach
    s.name = nr() < .5 ? pickN(nr, NM.pre) + ' ' + c : c + ' ' + pickN(nr, NM.suf); }
  // the star
  const sc = id >>> 20 & 7, STC = [[1, .55, .4], [1, .72, .5], [1, .93, .78], [.98, .97, .95], [.8, .88, 1], [.65, .78, 1], [1, .85, .7], [.85, .92, 1]][sc];
  s.sc = sc; s.stc = STC;
  s.star = ['red dwarf', 'orange dwarf', 'yellow star', 'white star', 'blue-white star', 'blue giant', 'binary pair', 'white dwarf'][sc];
  for (let i = 0; i < 3; i++) s.pal[9 + i] = s.pal[9 + i] * .35 + STC[i] * .65;
  const PT = ['gas giant', 'rocky world', 'ice world'], wr = nameRng(id, 0x574F524C), wn = [];
  while (wn.length < 3) { const w = pickN(wr, NM.world); if (!wn.includes(w)) wn.push(w); }   // worlds named for explorers, thinkers and old gods
  for (let i = 0; i < 3; i++) s.planets.push({ name: wn[i], type: t === 3 && !i ? 'none' : PT[i] });
  // the places in it. The first is the system's signature; the rest are drawn from the other kinds.
  const kinds = [t]; while (kinds.length < 4 + (id >>> 27) % 3) { const k = rnd() * 8 | 0; if (!kinds.includes(k) && (k !== 3 || t === 3)) kinds.push(k); }
  const lr = nameRng(id, 0x504C4143), used = [], LN = (k) => {   // places: a river, a volcano, a port, a desert, a lost ship, a garden... and what it is now
    if (k === 1) return 'Ice Rings of ' + s.planets[2].name; if (k === 7) return 'Low Orbit, ' + s.planets[0].name;
    const [ws, ss] = NM.place[k]; let w; do { w = pickN(lr, ws); } while (used.includes(w) && used.length < ws.length); used.push(w);
    const sf = pickN(lr, ss); return k === 3 ? 'The ' + w + ' ' + sf : w + ' ' + sf; };
  kinds.forEach((k, i) => s.locs.push({ i, name: LN(k), t: k, kind: NAMES[k], body: k === 7 && t !== 3 ? 0 : k === 1 ? 2 : k === 2 ? 1 : -1, desc: ARC[k].tr }));
  // worlds you can go down to: the cloud tops of the giant and the skies of the rocky world (appended, so older saves keep their indices)
  if (t !== 3) s.locs.push({ i: s.locs.length, name: 'Cloud Tops, ' + s.planets[0].name, t: 7, kind: 'Atmosphere', body: -1, atm: 1, desc: 'Flight above the cloud deck · storm light · high traffic lanes' });
  s.locs.push({ i: s.locs.length, name: 'Skies of ' + s.planets[1].name, t: 0, kind: 'Atmosphere', body: -1, atm: 2, desc: 'Thin air over a rocky world · settlements below · survey work' });
  s.locs.push({ i: s.locs.length, name: 'Ice Skies of ' + s.planets[2].name, t: 1, kind: 'Atmosphere', body: -1, atm: 3, desc: 'Low over a frozen world · fracture lines · cold light' });
  for (let i = 0; i < 3; i++) { const p = s.planets[i]; p.orbit = +(.4 + i * .9 + rnd() * .5).toFixed(2); p.moons = rnd() * (i ? 3 : 9) | 0; p.pop = i === 1 ? ['outposts', 'a mining colony', 'domed cities', 'no one'][rnd() * 4 | 0] : 'none'; }
  { const h = hs(id ^ 0x5A17) >>> 0, p = (h % 1000) / 1000, q = ((h >>> 10) % 1000) / 1000 * 6.283, y = ((h >>> 20) % 1000) / 1000 * 1.2 - .5, cc = Math.sqrt(Math.max(0, 1 - y * y));   // a rare sight in this system's sky, if any
    s.ph = p < .42 ? 0 : p < .56 ? 1 : p < .67 ? 2 : p < .75 ? 3 : p < .86 ? 4 : p < .95 ? 5 : 6; s.phs = ((h >>> 5) % 97) / 97; s.pq = [Math.cos(q) * cc, y, Math.sin(q) * cc]; }
  s.fac = (hs(id ^ 0xFAC7) >>> 0) % 4; s.danger = (hs(id ^ 0xD4) >>> 0) % 5; s.econ = ['extraction', 'refining', 'agriculture', 'salvage', 'research', 'trade hub'][(hs(id ^ 0xEC0) >>> 0) % 6];
  // a place is named for the colour of its sky
  for (const L of s.locs) { setLoc(s, L.i); const r = s.pal[0] * .45 + s.pal[3] * .4 + s.pal[6] * .15, g = s.pal[1] * .45 + s.pal[4] * .4 + s.pal[7] * .15, b = s.pal[2] * .45 + s.pal[5] * .4 + s.pal[8] * .15, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = d < 1e-4 ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    const w = d < mx * .16 ? (mx < .25 ? 'Umbral' : 'Ashen') : h < 14 ? 'Crimson' : h < 38 ? 'Amber' : h < 64 ? 'Golden' : h < 150 ? 'Viridian' : h < 192 ? 'Teal' : h < 222 ? 'Azure' : h < 256 ? 'Cobalt' : h < 288 ? 'Violet' : h < 335 ? 'Rose' : 'Crimson';
    L.hue = w; }   // the sky's colour is kept for descriptions; names now come from Earth
  setLoc(s, 0);
  return s;
}
// stand in one of a system's places: it decides what is around you and which world looms in the sky
function setLoc(s, i) {
  const L = s.locs[s.loc = i % s.locs.length];
  s.t = L.t; s.a = L.atm ? Object.assign({}, ARC[L.t], { rock: .22, ti: 0, mega: 0, deb: 0, cry: 0, ten: 0, geo: .04, fog: .5, st: .25, life: [0, 0, 0, L.atm > 1 ? .2 : 0, 0, 0] }) : (() => { const R = mulberry32(s.id ^ Math.imul(s.loc + 3, 0x9E3779B1)), B = ARC[L.t], o = Object.assign({}, B), X = ARC[R() * 8 | 0];
    for (const k of ['cry', 'ten', 'deb', 'geo', 'fl', 'fr', 'dr', 'st', 'ti']) { if (typeof B[k] !== 'number') continue; o[k] = B[k] * (.25 + R() * 1.5); if (R() < .28 && typeof X[k] === 'number') o[k] = Math.max(o[k], X[k] * (.5 + R())); }
    o.deb = 0; o.fog = B.fog * (.35 + R() * R() * 4); o.rock = B.rock + (R() - .25) * .09; o.life = B.life.map((v, i) => R() < .3 ? 0 : Math.max(v, R() < .2 ? X.life[i] : 0) * (.4 + R() * 1.3)); return o; })(); s.atm = L.atm || 0; s.mat = REGT[L.t]; s.salt = hs(s.id ^ 0x5bd1e995 ^ Math.imul(s.loc + 1, 0x9E3779B1)) | 0;
  s.sky[2] = SKYW[L.t][2]; s.sky[3] = SKYW[L.t][3];
  { // ---- this place's own genome: field structure, rock mix and size, nebula style, light ----
    const G = mulberry32(Math.imul((s.id ^ Math.imul(s.loc + 11, 0x2545F491)) >>> 0, 2654435761) >>> 0); G(); G();
    const W = [[3, 1, 3, 1], [1, 1, 5, 1], [3, 4, 1, 1], [1, 1, 1, 5], [4, 1, 1, 3], [2, 5, 1, 1], [3, 4, 1, 1], [3, 1, 4, 1]][L.t], tot = W.reduce((a, b) => a + b, 0);
    let pk = G() * tot, m = 0; while (pk > W[m]) { pk -= W[m]; m++; }
    const big = () => (G() - .5) * 2e5, tl = (G() - .5) * .9, az = G() * 6.283, n = [Math.sin(tl) * Math.cos(az), Math.cos(tl), Math.sin(tl) * Math.sin(az)];
    s.fg = { o: [big(), big(), big()], oc: [big(), big(), big()], s: .55 + G() * 1.35, sy: .35 + G() * 1.4, m: L.atm ? 3 : m, n, th: 350 + G() * 900, rw: 140 + G() * 420, h0: (G() < .5 ? -1 : 1) * (500 + G() * 1600) };
    s.fz = { kb: .7 + G() * .5, kh: .7 + G() * .7 };                                                       // this place's rocks run small or large
    s.mat = REGT[L.t].slice(); for (let k = G() * 4 | 0; k > 0; k--) s.mat[G() * 8 | 0] = G() * 6 | 0;     // and their own mix of rock, iron, ice...
    if (G() < .15) { const f = G() * 6 | 0; s.mat = s.mat.map((v) => v === s.mat[0] ? f : v); }
    s.sty = [.6 + G() * 1.1, (G() - .45) * .3, G() * 1.6, G()];                                             // nebula: scale, coverage, filaments, dust
    s.bri = .7 + G() * .6; s.sat = 1.1 + G() * .8;                                                          // a dim place or a bright one, washed or vivid
    if (G() < .35) s.sky[2] = G() * 1.2; if (G() < .3) s.sky[3] = G() < .5 ? 0 : .3 + G() * .7;
  }
  // the place's own look: its kind's colours (turned by the system's hue) laid over the system's, and its own clouds.
  // The star keeps its colour. Places in one system are relatives, not twins.
  if (!s.pal0) s.pal0 = s.pal.slice();
  // every place turns the hue its own way, well beyond the system's, and is pushed away from grey: no two skies alike
  const th2 = s.th + (((hs(s.id ^ Math.imul(s.loc + 1, 7919)) >>> 0) % 1000) / 1000 - .5) * 2.8, co = Math.cos(th2), k = (1 - co) / 3, q = Math.sin(th2) * .57735, P = PAL[L.t];
  for (let i = 0; i < 9; i += 3) { const r = P[i], g = P[i + 1], b = P[i + 2];
    s.pal[i] = Math.max(.01, s.pal0[i] * .3 + .7 * (co * r + k * (r + g + b) + q * (b - g))); s.pal[i + 1] = Math.max(.01, s.pal0[i + 1] * .3 + .7 * (co * g + k * (r + g + b) + q * (r - b))); s.pal[i + 2] = Math.max(.01, s.pal0[i + 2] * .3 + .7 * (co * b + k * (r + g + b) + q * (g - r))); }
  for (let i = 0; i < 9; i += 3) { const m = (s.pal[i] + s.pal[i + 1] + s.pal[i + 2]) / 3; for (let j = 0; j < 3; j++) s.pal[i + j] = Math.max(.01, (m + (s.pal[i + j] - m) * (s.sat || 1.45)) * (s.bri || 1)); }
  s.seed = [s.seed0[0] + s.loc * 7.3, s.seed0[1] + s.loc * 3.1, s.seed0[2] - s.loc * 5.7];
  for (let k = 0; k < 3; k++) s.pl[k * 4 + 3] = L.body === k ? (k ? .3 : .6) : s.pr[k];
  return s;
}

// the system's music: root note (MIDI), scale, tempo. Every kind sits inside C minor at 62.5 beats a minute, the key and
// pulse of the recorded score (fretboard.m4a), so its passages can drift in over any system and stay in tune.
const MUS = [[39, [0, 2, 4, 7, 9], 62.5], [44, [0, 2, 4, 7, 9], 62.5], [36, [0, 3, 5, 7, 10], 62.5], [43, [0, 1, 5, 7, 8], 62.5], [46, [0, 2, 5, 7, 9], 62.5], [41, [0, 3, 5, 7, 10], 62.5], [51, [0, 4, 7, 11, 14], 62.5], [36, [0, 3, 7, 10, 14], 62.5]];
// minerals, by rarity
const TIERS = ['', 'Ferrite', 'Pyrite', 'Cinnabar', 'Void Opal', 'Star Heart'], TVAL = [0, 1, 5, 25, 150, 1000];
const TCOL = new Float32Array([0, 0, 0, .75, .8, .9, 1, .82, .25, 1, .32, .14, .8, .35, 1, .7, .95, 1]);   // ferrite grey (hull), pyrite yellow (fuel), cinnabar red (weapons), void opal violet, star heart pearl
const TCSS = ['', '#c3ccdc', '#ffd84a', '#ff6a3d', '#cf6bff', '#bff4ff'];

// ============================================================================
// WebGL helpers
// ============================================================================
function prog(vs, fs) {
  const p = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(sh) + '\n' + s.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n').slice(0, 6000));
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
  gl.useProgram(p);
  const bi = gl.getUniformBlockIndex(p, 'G'); if (bi !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, bi, 0);
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  const ty = {}; for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(p, i), nm = inf.name; u[nm] = gl.getUniformLocation(p, nm); ty[nm] = inf.type; }
  const unit = { uNeb: 0, uNz: 1, uH: 2, uB: 3, uR: 4 }, smp = [gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE];
  for (const k in unit) if (u[k] && smp.includes(ty[k])) gl.uniform1i(u[k], unit[k]);   // texture slots only: the HUD has a vector with the same name
  return { p, u };
}
function tex2(w, h, lin) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, 1, HDRI, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, lin ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, lin ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  return { t, f, w, h };
}

// ============================================================================
// Shaders (GLSL ES 3.0)
// ============================================================================
// shared by every scene shader: per-frame globals, the nebula, the fog that melts things into it
const HD = `#version 300 es
precision highp float;precision highp int;precision highp sampler3D;
layout(std140)uniform G{mat4 uVP;vec4 uSun,uSunC,uCA,uCB,uCE,uVel,uRt,uUp,uFw;};
uniform samplerCube uNeb;uniform sampler3D uNz;
#define TIME uSun.w
#define FOGD uSunC.w
vec3 neb(vec3 d,float l){vec4 t=textureLod(uNeb,d,l);
 vec3 c=uCA.rgb*t.r*t.r*t.r*.13+uCB.rgb*t.g*t.g*t.g*.13+mix(uCB.rgb,uCE.rgb,.6)*t.a*.022;
 return c*(1.-.6*t.b)+(uCA.rgb+uCB.rgb)*.002;}
vec3 glow(vec3 d){float s=max(dot(d,uSun.xyz),0.);return uSunC.rgb*(pow(s,8.)*.035+pow(s,90.)*.22);}
vec3 fog(vec3 c,vec3 p,float R){float d=length(p);vec3 v=p/d;float f=1.-exp(-d*FOGD);
 f=mix(min(f,R>2e4?.8:1.),1.,smoothstep(.5*R,.92*R,d));return mix(c,neb(v,4.5)+glow(v),f);}
vec4 quat(vec3 ax,float a){return vec4(ax*sin(a*.5),cos(a*.5));}
vec3 qr(vec4 q,vec3 v){return v+2.*cross(q.xyz,cross(q.xyz,v)+q.w*v);}
float h1(float n){return fract(sin(n*127.1+.7)*43758.5453);}
vec3 h3(float n){return fract(sin(vec3(n*127.1,n*269.5+1.3,n*419.2+2.7))*43758.5453);}
`;
// instancing: every object lives in a lattice cell; the lattice wraps around the camera, so the field never ends.
// iA = cell slot xyz + size, iB = position inside the cell xyz + seed, iC = per-kind extras
const VI = HD + `
layout(location=0)in vec3 aP;layout(location=1)in vec3 aN;layout(location=2)in vec2 aU;
layout(location=3)in vec4 iA;layout(location=4)in vec4 iB;layout(location=5)in vec4 iC;
uniform vec3 uCell,uCam,uCN;
vec3 ctr(){if(uCN.y<.5)return iA.xyz-uCam;vec3 r=mod(iA.xyz-uCell+uCN.y*.5,uCN.y)-uCN.y*.5;return(r+iB.xyz)*uCN.x-uCam;}
vec4 rockQ(float s,float sp){return quat(normalize(h3(s*91.7)-.5+1e-3),s*40.+TIME*sp*(h1(s*3.)-.5)*2.);}
vec3 rockS(float s){return .6+.4*h3(s*33.3+5.);}
`;

const ROCK_V = VI + `
uniform float uSpin;uniform int uKind;
out vec3 vP,vN,vO;flat out vec4 vQ,vI,vJ;
void main(){
 vec3 c=ctr();float sz=iA.w,sd=iB.w;if(uCN.y>.5)sz*=smoothstep(uCN.x*uCN.y*.5,uCN.x*uCN.y*.28,length(c));
 vec4 q=rockQ(sd,uSpin);
 vec3 s=uKind==0?rockS(sd):uKind==2?.05+.95*pow(h3(sd*7.7),vec3(2.2)):vec3(1);
 vec3 o=aP*s*sz;
 float k=1.-smoothstep(.9*uCN.z,uCN.z,length(c));
 vec3 p=c+qr(q,o)*k;
 vP=p;vN=qr(q,aN/s);vO=o/sz;vQ=q;vI=vec4(sd,iC.x,iC.y,sz);vJ=vec4(iC.z,iC.w,0,0);
 gl_Position=uVP*vec4(p,1);}`;
const ROCK_F = HD + `
in vec3 vP,vN,vO;flat in vec4 vQ,vI,vJ;uniform int uKind;uniform vec3 uCN;uniform vec3 uTier[6];uniform float uFlat;out vec4 o;
float hh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec3 V=normalize(-vP),N=normalize(vN),L=uSun.xyz,alb,em=vec3(0);float sp=.18,gs=20.,rim=1.,iri=0.;
 if(uFlat>.5||uKind==3)N=normalize(cross(dFdx(vP),dFdy(vP)));
 if(uKind==0){
  vec3 t=vO*.5+vI.x*13.;float sz=vI.w;int ty=int(vJ.x+.5),tr=int(vI.z+.5);
  vec4 a=texture(uNz,t),b=texture(uNz,t*4.7+.31),c=texture(uNz,vO*max(19.,sz*.02)+.7),e=texture(uNz,vO*max(60.,sz*.25)+.2);
  float bg=1.,dq=length(vP)/sz,wc=1.-smoothstep(120.,350.,dq*max(19.,sz*.02)),we=1.-smoothstep(120.,350.,dq*max(60.,sz*.25));   // fine relief fades out before it can shimmer                    // on the giants the broadest relief is too stretched to light cleanly
  N=normalize(N-qr(vQ,(a.gba-.5)*1.5*bg+(b.gba-.5)*1.2*bg+(c.gba-.5)*.8*wc+(e.gba-.5)*.6*we)*(uFlat>.5?.6:1.15));
  float m=mix(.5,a.r*.55+b.r*.45,bg),vn=(1.-smoothstep(0.,.03,abs(a.r-.5)))*smoothstep(.42,.6,b.r)*bg;
  alb=mix(vec3(.07,.065,.065),vec3(.33,.28,.24),smoothstep(.3,.72,m*.8+mix(.5,c.r,wc)*.2));
  alb=mix(alb,alb*(uCA.rgb+uCB.rgb+.25)*1.3,.4*vI.y);
  if(ty==1){alb=mix(vec3(.1,.095,.1),vec3(.32,.2,.12),smoothstep(.45,.7,b.r));sp=.9;gs=36.;}
  else if(ty==2){alb=mix(vec3(.28,.4,.55),vec3(.75,.86,.95),smoothstep(.3,.7,m));sp=1.1;gs=90.;rim=1.8;}
  else if(ty==3){alb*=.35;float lv=smoothstep(.09,0.,abs(a.r-.5)-.03*b.r)*smoothstep(.3,.6,b.r+.2);
   em=mix(vec3(1.,.2,.02),vec3(1.,.75,.3),lv*lv)*lv*(3.5+1.5*sin(TIME*.8+vI.x*30.));}
  else if(ty==4){alb=mix(alb,vec3(.04,.15,.09),.6);em=uCE.rgb*smoothstep(.68,.76,c.r)*smoothstep(.45,.6,a.r)*2.6*(.6+.4*sin(TIME*1.5+c.g*40.));}
  else if(ty==5){alb=vec3(.02,.02,.03);sp=2.;gs=140.;iri=1.;}
  else if(ty==6){alb=vec3(.03);em=uTier[tr]*(.3+3.5*smoothstep(.12,0.,abs(b.r-.5)))*(.7+.3*sin(TIME*2.+vI.x*20.));sp=1.5;gs=100.;}
  alb*=.5+.5*mix(.5,c.r,wc)+.5*mix(.5,e.r,we);
  if(ty!=6&&tr>0)em+=uTier[tr]*vn*3.;
 }else if(uKind==1){
  float an=atan(vO.z,vO.x),rr=length(vO.xz),fs=vI.w>2000.?6.:1.;
  vec2 g=vec2(an*28.65+rr*3.,vO.y*26.+rr*18.)*fs,id=floor(g),f=fract(g);
  float ln=step(.05,f.x)*step(.08,f.y)*step(f.x,.97);
  alb=vec3(.13,.14,.17)*(.4+.8*hh(id))*mix(.25,1.,ln)*(.6+.4*hh(floor(g/fs)));
  {vec3 wp=vO*vI.w;float rs=texture(uNz,wp*.0035).r,st=texture(uNz,vec3(wp.x*.02,wp.y*.0025,wp.z*.02)).g,gr=texture(uNz,wp*.03).b;
   alb=mix(alb,vec3(.3,.13,.05)*(.5+.8*gr),smoothstep(.56,.78,rs+.25*hh(floor(g/fs/4.)))*.75);   // rust blooming from the seams
   alb*=mix(1.,.45,smoothstep(.55,.8,st))*(.75+.5*gr);}                                          // soot streaks and scuffing
  float w=step(.7,hh(id+3.7))*step(.25,f.x)*step(f.x,.75)*step(.3,f.y)*step(f.y,.7)*step(.66,hh(vec2(floor(g.y/fs/3.),7.)))*step(.45,hh(floor(g/fs/vec2(7.,3.))+1.3))*(.25+.75*step(.3,fract(TIME*.013*(.4+hh(id+5.1))+hh(id+2.2))));   // rooms go dark and light again as people come and go
  em=mix(uCE.rgb,vec3(1.,.68,.3),step(.5,hh(id+9.1)))*w*6.;sp=.7;gs=70.;
 }else if(uKind==4){                                          // ship hulls: plating, paint, engines, canopy glass, lit windows
  vec3 ln=vQ.xyz,ap=abs(ln),q3=vO*vI.w;float mid=vQ.w,big=step(100.,vI.w),ps=mix(vI.w*.11,max(vI.w*.012,6.),big);
  vec2 q=ap.y>.6?q3.xz:ap.x>.6?q3.zy:q3.xy,g=q/ps,id=floor(g),f=fract(g);
  float pl=step(.04,f.x)*step(.04,f.y),r=hh(id+vI.x*7.),wr=texture(uNz,q3/ps*.07).r;
  alb=vec3(.13,.14,.16)*(.55+.5*r)*mix(.4,1.,pl)*(.55+.8*wr);sp=.8;gs=50.;
  if(mid>4.5){alb=vec3(.01);em=(abs(vI.y-.67)<.06?vec3(.8,.86,1.):.5+.5*cos(6.283*(vI.y+vec3(0,.33,.67))))*5.*(.75+.25*sin(TIME*3.+vI.x*20.));}
  else if(mid>3.5){alb=vec3(.01);em=vec3(1.,.15,.1)*3.*step(.5,fract(TIME*.8+vI.x*5.));}
  else if(mid>2.5){alb=vec3(.008,.01,.016);sp=2.5;gs=140.;}
  else if(mid>1.5){alb=vec3(.01);em=mix(vec3(.3,.6,1.),vec3(1.,.55,.25),step(.5,h1(vI.x*3.)))*7.*(.8+.2*sin(TIME*23.+vI.x*9.));}
  else if(mid>.5)alb=mix(alb,(.5+.5*cos(6.283*(vI.y+vec3(0,.33,.67))))*.3,.8);
  else if(big>.5&&ap.y<.6){vec2 wg=q/(ps*.22),wi=floor(wg),wf=fract(wg);
   em=mix(vec3(1.,.8,.5),vec3(.6,.8,1.),step(.6,hh(wi+3.)))*step(.88,hh(wi*vec2(1.,.37)))*step(.45,hh(vec2(wi.y,7.)))*step(.25,wf.x)*step(wf.x,.75)*step(.3,wf.y)*step(wf.y,.7)*2.2;}
 }else if(uKind==2){
  alb=vec3(.24,.25,.3)*(.4+.9*h1(vI.x*5.));sp=1.;gs=50.;
  em=step(.9,h1(vI.x*9.))*vec3(1.,.42,.12)*3.*(.5+.5*sin(TIME*3.+vI.x*90.));
 }else{
  alb=vec3(.02);sp=2.;gs=60.;
  em=uTier[int(vI.z+.5)]*(1.1+1.6*pow(1.-abs(dot(N,V)),2.))*(.8+.2*sin(TIME*5.+vI.x*30.));
 }
 float nl=dot(N,L),df=clamp(nl*1.15+.06,0.,1.),fr=1.-max(dot(N,V),0.);
 vec3 amb=neb(N,6.)*1.6+.004,H=normalize(L+V);
 vec3 col=alb*(uSunC.rgb*df*3.2+amb)+uSunC.rgb*pow(max(dot(N,H),0.),gs)*sp*df;
 col+=fr*fr*fr*fr*neb(N,6.)*.55*rim+em+iri*(.5+.5*cos(6.283*(fr*1.6+vI.x+vec3(0,.33,.67))))*fr*fr*.1;
 o=vec4(fog(col,vP,uCN.z),0);}`;

// ships fly: uShip 0 = fighter wings holding formation round a patrol loop, 1 = frigates on a slow orbit,
// 2 = drone swarms hanging in a turning lattice. iC = a, b, hue, index. Shaded by ROCK_F as hull (uKind 4).
const SHIP_V = VI + `
uniform int uShip;
out vec3 vP,vN,vO;flat out vec4 vQ,vI,vJ;
vec3 loop(vec3 c,vec3 u,vec3 w,vec3 n,float sd,float t){float A=uCN.x*.33,g=sd*6.283+t*105./A;
 return c+(u*cos(g)+w*sin(g))*A*(1.+.3*sin(2.*g+sd*9.))+n*sin(3.*g+sd*5.)*A*.16;}
void main(){
 vec3 c=ctr(),lp=aP,P0,X,Y,Z;float sd=iB.w,a=iC.x,b=iC.y,k=iC.w,sz=iA.w;
 vec3 n=normalize(h3(sd*3.3)-.5+vec3(0,1.4,0)),u=normalize(cross(n,vec3(1,0,.2))),w=cross(n,u);
 if(uShip==0){
  vec3 p0=loop(c,u,w,n,sd,TIME),p1=loop(c,u,w,n,sd,TIME+.25),p2=loop(c,u,w,n,sd,TIME+.5),F=normalize(p1-p0);
  Y=normalize(n+normalize(p2-2.*p1+p0+n*1e-4)*.9);X=normalize(cross(Y,-F));Y=cross(-F,X);Z=-F;   // banked into the turn
  float kk=mod(k,4.),fl=floor(k/4.),row=ceil(kk*.5),sd2=mod(kk,2.)<.5?-1.:1.,s=sz*2.6;
  P0=p0+X*(sd2*row*s+(fl-1.)*s*5.)-F*(row*s*.9+abs(fl-1.)*s*4.)+Y*(sin(TIME*.7+k*2.)*.25+(fl-1.)*1.5)*sz;
 }else if(uShip==1){
  float ro=uCN.x*(.2+.1*a),g=sd*6.283+k*2.6+TIME*16./ro;
  P0=c+(u*cos(g)+w*sin(g))*ro+n*(b-.5)*uCN.x*.14;Z=u*sin(g)-w*cos(g);Y=n;X=cross(Y,Z);
  lp.xy*=.85+.4*b;
 }else if(uShip==4){P0=c;Z=-normalize(iB.xyz);Y=normalize(iC.xyz);X=normalize(cross(Y,Z));Y=cross(Z,X);
 }else if(uShip==3){P0=c;X=vec3(.8,0,.6);Y=vec3(0,1,0);Z=vec3(-.6,0,.8);
 }else{
  vec3 cc=c+vec3(sin(TIME*.02+sd*9.),sin(TIME*.017+sd*5.),cos(TIME*.019+sd*7.))*uCN.x*.25;
  vec3 ax=normalize(h3(sd*7.+k*1.37)-.5+vec3(.01)),o1=normalize(cross(ax,vec3(.3,1.,.2))),o2=cross(ax,o1);
  float rr=sz*(5.+26.*fract(k*.618+sd))*(1.+.35*sin(TIME*.11+sd*20.)),t=TIME*(.18+.5*fract(k*.37+sd*3.))*(mod(k,2.)<1.?1.:-1.)+k*2.4;
  P0=cc+(o1*cos(t)+o2*sin(t))*rr*(1.+.3*sin(t*1.7+k))+ax*sin(t*.6+k)*sz*5.;
  Z=-normalize(-o1*sin(t)+o2*cos(t)+ax*.2*cos(t*.6+k));X=normalize(cross(ax,Z));Y=cross(Z,X);
 }
 float d=length(P0),fd=1.-smoothstep(.85*uCN.z,uCN.z,d);
 vec3 p=P0+(X*lp.x+Y*lp.y+Z*lp.z)*sz*fd;
 vP=p;vN=X*aN.x+Y*aN.y+Z*aN.z;vO=lp;vQ=vec4(aN,aU.x);vI=vec4(sd+k*.13,uShip==4?k:iC.z,0,sz);vJ=vec4(0);
 gl_Position=uVP*vec4(p,1);}`;

// glowing crystals rooted in the big asteroids: iC.xyz = the root on the unit rock, iC.w = hue
const CRY_V = VI + `
uniform float uSpin;
out vec3 vP,vN;out vec2 vU;flat out vec4 vI;
void main(){
 vec3 c=ctr();float sz=iA.w,sd=iB.w;if(uCN.y>.5)sz*=smoothstep(uCN.x*uCN.y*.5,uCN.x*uCN.y*.28,length(c));
 vec4 q=rockQ(sd,uSpin);vec3 s=rockS(sd);
 vec3 up=normalize(iC.xyz/s),t=normalize(cross(up,vec3(.31,.9,.23))),b=cross(up,t);
 float cs=sz*(.16+.3*iC.w);
 vec3 o=iC.xyz*s*sz-up*cs*.12+(t*aP.x+up*aP.y+b*aP.z)*cs;
 float k=1.-smoothstep(.9*uCN.z,uCN.z,length(c));
 vec3 p=c+qr(q,o)*k;
 vP=p;vN=qr(q,t*aN.x+up*aN.y+b*aN.z);vU=aU;vI=vec4(sd,iC.w,0,0);
 gl_Position=uVP*vec4(p,1);}`;
const CRY_F = HD + `
in vec3 vP,vN;in vec2 vU;flat in vec4 vI;uniform vec3 uCN;out vec4 o;
void main(){
 vec3 N=normalize(vN),V=normalize(-vP);
 vec3 cc=mix(uCE.rgb,.5+.5*cos(6.283*(vI.y+h1(vI.x)+vec3(0,.33,.67))),.4);
 float fr=pow(1.-abs(dot(N,V)),2.),pl=.75+.25*sin(TIME*1.3+vI.x*50.);
 vec3 col=cc*cc*(.12+1.9*vU.x*vU.x+fr*.8)*pl+cc*max(dot(N,uSun.xyz),0.)*.35;
 o=vec4(fog(col,vP,uCN.z),0);}`;

// luminous life, drawn additively. uKind 0 jellyfish swarms, 1 void rays, 2 star minnows. iC = a, b, hue, index
const LIFE_V = VI + `
uniform int uKind;uniform float uSpin;
out vec3 vP,vN;out vec2 vU;flat out vec4 vI;
void main(){
 vec3 c=ctr(),lp=aP,P0,X,Y,Z,p;float sd=iB.w,a=iC.x,b=iC.y,sz,gl2=1.,hue=iC.z;bool direct=false;
 if(uKind==0){
  vec3 H=normalize(h3(sd*5.1)-.5+vec3(0,.001,0)),Ux=normalize(cross(H,vec3(.13,1,.07))),Wz=cross(H,Ux);
  float Ls=uCN.x*.45,Rs=uCN.x*.085,s=fract(a*7.3+b*3.1+TIME*(5.+4.*a)/Ls),an=a*18.85,rd=sqrt(b)*Rs;
  P0=c+(Ux*cos(an)+Wz*sin(an))*rd+H*(s-.5)*Ls;
  sz=iA.w*(.5+1.2*h1(a*91.+b))*smoothstep(0.,.1,s)*smoothstep(1.,.9,s);
  float ph=TIME*(1.1+a)+a*40.;
  if(iC.w<.5){sz=iA.w*7.;P0=c;ph=TIME*.5+sd*9.;gl2=-1.;}
  Y=normalize(H+.3*(h3(a*17.)-.5));X=normalize(cross(Y,Wz));Z=cross(X,Y);
  float cn=sin(ph);P0+=Y*sz*.35*sin(ph-1.2);gl2=gl2<0.?-2.:cn;
  if(aU.x<1.){lp.xz*=1.-.2*cn*aU.x;lp.y*=1.+.1*cn;}
  else{float t=aU.x-1.;lp.x+=sin(ph-t*5.+aU.y*6.28)*.25*t;lp.z+=cos(ph*.8-t*4.+aU.y*9.)*.25*t;lp.xz*=1.-.15*cn*(1.-t);}
 }else if(uKind==1||uKind==3){
  bool wh=uKind==3;
  vec3 n=normalize(h3(sd*3.3)-.5+vec3(0,wh?1.8:1.2,0)),u=normalize(cross(n,vec3(1,0,.2))),w=cross(n,u);
  float ro=uCN.x*(wh?.26+.1*a:.2+.12*a),an=sd*6.283+a*(wh?.9:.4)+TIME*(wh?20.:13.)/ro;
  P0=c+(u*cos(an)+w*sin(an))*ro+n*(b-.5)*(wh?uCN.x*.12:140.);
  Z=u*sin(an)-w*cos(an);Y=n;X=cross(Y,Z);sz=iA.w*(.7+.6*b);
  if(wh)lp.y+=sin(TIME*.5+a*9.-aP.z*1.7)*.08*(aP.z+1.15);
  else lp.y+=sin(TIME*1.1+a*20.-abs(aU.x)*1.6)*pow(abs(aU.x),1.5)*.5;
 }else if(uKind==2){
  vec3 cc=c+vec3(sin(TIME*.05+sd*9.),sin(TIME*.04+sd*5.),cos(TIME*.045+sd*7.))*uCN.x*.2;
  vec3 n=normalize(h3(sd*8.8)-.5),u=normalize(cross(n,vec3(.2,1,.1))),w=cross(n,u);
  float ro=22.+75.*a,an=b*6.283+TIME*(.55-.3*a)+sin(TIME*.3+a*9.)*.4;
  P0=cc+(u*cos(an)+w*sin(an))*ro+n*sin(TIME*.6+b*40.)*14.*(.3+a);
  Z=u*sin(an)-w*cos(an);Y=n;X=cross(Y,Z);sz=iA.w*(.6+.8*h1(b*77.));
  lp.x+=sin(TIME*9.+b*50.+aP.z*3.)*.1;
 }else if(uKind==4){
  vec3 cc=c+vec3(sin(TIME*.03+sd*9.),sin(TIME*.025+sd*5.),cos(TIME*.028+sd*7.))*uCN.x*.22;
  vec3 n=normalize(h3(sd*6.6+a*3.)-.5),u=normalize(cross(n,vec3(.2,1,.1))),w=cross(n,u);
  sz=iA.w*(.5+b);float ro=70.+230.*a,wv=TIME*1.7-aP.z*6.+a*20.;
  float an=b*6.283+TIME*17./ro-aP.z*sz/ro;ro+=sin(wv)*sz*.07*(aP.z+1.3);
  X=u*cos(an)+w*sin(an);Y=n;Z=u*sin(an)-w*cos(an);
  P0=cc+X*ro+n*(cos(wv*.8)*sz*.05*(aP.z+1.3)+(a-.5)*90.);lp.z=0.;
 }else{
  float rs=iA.w;vec4 q=rockQ(sd,uSpin);vec3 s=rockS(sd);hue=iC.w;
  vec3 up=normalize(iC.xyz/s),t=normalize(cross(up,vec3(.31,.9,.23))),bb=cross(up,t);
  float ln=rs*(.3+.9*iC.w),tt=aP.y;
  vec3 o=iC.xyz*s*rs*.95+up*tt*ln+t*(aP.x*ln*.0018*(1.-.6*tt)+sin(TIME*.6+iC.w*40.-tt*3.)*tt*tt*ln*.13)+bb*cos(TIME*.45+iC.w*23.-tt*2.5)*tt*tt*ln*.1;
  P0=c;p=c+qr(q,o);vN=qr(q,bb);direct=true;
 }
 float d=length(P0),k=1.-smoothstep(.8*uCN.z,uCN.z,d);
 if(!direct){p=P0+(X*lp.x+Y*lp.y+Z*lp.z)*sz;vN=X*aN.x+Y*aN.y+Z*aN.z;}
 if(uKind==0&&iC.w<.5)k*=smoothstep(sz*.9,sz*2.6,d);                // a colossus fades as you fly into it, instead of filling the view with its bell
 vP=p;vU=aU;vI=vec4(hue,gl2,k*exp(-min(d*FOGD*.7,1.7)),0);
 gl_Position=uVP*vec4(p,1);}`;
const LIFE_F = HD + `
in vec3 vP,vN;in vec2 vU;flat in vec4 vI;uniform int uKind;out vec4 o;
void main(){
 vec3 N=normalize(vN),V=normalize(-vP);float fr=pow(1.-abs(dot(N,V)),2.),g;
 vec3 cc=mix(uCE.rgb,.5+.5*cos(6.283*(vI.x+vec3(0,.33,.67))),.65);
 if(uKind==0){
  if(vU.x<1.)g=.1+1.5*fr+.8*pow(.5+.5*sin(vU.y*50.27),6.)*vU.x+1.3*smoothstep(.85,1.,vU.x);
  else g=(2.-vU.x)*.7+.05;
  g*=vI.y<-1.5?.4:.85+.35*vI.y;
 }else if(uKind==1)g=.08+1.3*fr+.9*pow(.5+.5*sin(vU.x*22.),10.)*(1.-abs(vU.x))+1.6*smoothstep(.8,1.,abs(vU.x));
 else if(uKind==2)g=2.6;
 else if(uKind==3)g=.04+.8*fr+pow(.5+.5*cos(vU.y*43.98),16.)*(.45+.9*pow(.5+.5*sin(vU.x*40.-TIME*1.5),6.))*smoothstep(0.,.15,vU.x);
 else if(uKind==4)g=.1+.8*fr+1.2*pow(.5+.5*sin(vU.x*70.-TIME*5.),8.);
 else g=(.05+1.1*vU.y*vU.y*vU.y+2.5*smoothstep(.94,1.,vU.y))*smoothstep(15.,90.,length(vP));
 o=vec4(cc*g*vI.z,0);}`;

// soft sprites, additive. uMode 0 space dust (stretches into streaks at speed), 1 drifting spores, 2 nebula wisps
const SPR_V = VI + `
uniform int uMode;uniform float uDark;
out vec2 vC;out vec4 vK;out vec3 vT;
void main(){
 vec3 c=ctr(),p;float sd=iB.w,sz=iA.w,R=uCN.z,a;
 if(uMode<2){
  c+=sin(TIME*.15+sd*vec3(40,70,90))*(uMode==0?.8:7.);
  float d=length(c),sp=length(uVel.xyz);
  vec3 ax=sp>2.?uVel.xyz/sp:uUp.xyz;float ln=sz+max(sp-2.,0.)*.011;
  p=c+normalize(cross(ax,c))*sz*aP.x+ax*aP.y*ln;
  a=smoothstep(.6,2.5+sz*6.,d)*(1.-smoothstep(.6*R,R,d))*sqrt(sz/ln)*(.55+.45*sin(TIME*(1.+sd*3.)+sd*99.))*(1.+5.*pow(max(dot(normalize(c),uSun.xyz),0.),12.));
  vK=vec4((iC.x>.86?vec3(1.,.35,.2):iC.x>.45?vec3(.55,.72,1.):vec3(1.,.95,.9))*a*(uMode==0?1.3:.55)*exp(-d*FOGD),float(uMode));
 }else if(uMode==2){
  float d=length(c),r=iC.z*6.283;vec2 q=vec2(aP.x*cos(r)-aP.y*sin(r),aP.x*sin(r)+aP.y*cos(r));
  p=c+(uRt.xyz*q.x+uUp.xyz*q.y)*sz;
  a=iC.x*smoothstep(.25*sz,sz,d)*(1.-smoothstep(.65*R,R,d));
  float s=max(dot(normalize(c),uSun.xyz),0.);
  vK=vec4((mix(uCA.rgb,uCB.rgb,iC.y)+uCE.rgb*.12+uSunC.rgb*s*s*s*.9)*a*.03,2.);
  if(uDark>.5)vK.rgb=vec3(a*.8);
 }else if(uMode==3){
  vec3 ax=iB.xyz;p=c+normalize(cross(ax,c))*sz*aP.x+ax*(aP.y*.5+.5);vK=vec4(iC.rgb,3.);
 }else{
  p=c+(uRt.xyz*aP.x+uUp.xyz*aP.y)*sz;vK=vec4(iC.rgb,4.+iC.w);
 }
 vC=aP.xy;vT=vec3(aP.xy*.22+sd*7.,sd*3.);gl_Position=uVP*vec4(p,1);}`;
const SPR_F = HD + `
in vec2 vC;in vec4 vK;in vec3 vT;out vec4 o;
void main(){float r=dot(vC,vC),a;
 vec3 jt=vT+(fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5)*.012;
 if(vK.w<.5)a=exp(-r*4.)-.018;
 else if(vK.w<1.5)a=exp(-r*7.)+.4*exp(-(r-.5)*(r-.5)*70.)-.03;
 else if(vK.w<2.5){float n=texture(uNz,jt).r*texture(uNz,jt*2.7+.4).r*4.;a=smoothstep(1.,.1,r)*smoothstep(.25,1.15,n);}
 else if(vK.w<3.5)a=exp(-vC.x*vC.x*5.)*smoothstep(1.,.5,abs(vC.y));
 else if(vK.w<4.5)a=exp(-r*4.)-.018;
 else{float n=texture(uNz,jt).r*texture(uNz,jt*2.7+.4).r*4.;a=smoothstep(1.,.1,r)*smoothstep(.15,1.,n);}
 o=vec4(vK.rgb*max(a,0.),0);}`;

// the cockpit: solid metal lit by the system's star and sky, so light slides across it as the ship turns.
// uv.x = material (0 hull, 1 bronze trim, 2-4 screens, 5 cool lamps, 6 warm lamps, 7 grip, 8 red cap),
// uv.y = moving part (1 throttle lever, 2 flight stick)
const COCK_V = HD + `
layout(location=0)in vec3 aP;layout(location=1)in vec3 aN;layout(location=2)in vec2 aU;
uniform mat3 uShip;uniform vec3 uEye;uniform vec4 uMo,uCk,uSt;uniform float uWd;
out vec3 vL,vW,vN,vM;out vec2 vU;
mat2 r2(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
void main(){vec3 l=aP,n=aN;
 if(aU.y>1.5){vec3 pv=vec3(-.62,-1.5,-1.95);l-=pv;l.xy=r2(uSt.x)*l.xy;l.yz=r2(uSt.y)*l.yz;n.xy=r2(uSt.x)*n.xy;n.yz=r2(uSt.y)*n.yz;l+=pv;}
 else if(aU.y>.5){vec3 pv=vec3(.62,-1.5,-1.95);float a=uCk.x*.6-.12;l-=pv;l.yz=r2(a)*l.yz;n.yz=r2(a)*n.yz;l+=pv;}
 vL=aP;vM=aN;l.x*=uWd;l.xy=r2(uMo.w)*l.xy;n.xy=r2(uMo.w)*n.xy;l+=uMo.xyz;
 vec3 p=uShip*l-uEye;vW=p;vN=uShip*n;vU=aU;gl_Position=uVP*vec4(p,1);}`;
// materials: 0 hull, 1 trim, 2-4 screens, 5 lamps, 6 warm lamps, 7 grip, 8 red cap, 9 instrument panel, 10 glass,
// 11 cyan strip, 12 frame alloy. uDm = how damaged the ship is (0..1).
const COCK_F = HD + `
in vec3 vL,vW,vN,vM;in vec2 vU;uniform vec2 uAt;uniform vec4 uCk,uSt,uCg;uniform float uDm;uniform vec3 uHc;uniform sampler2D uPip;out vec4 o;
float hh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float bar(vec2 q,float y,float h,float f){return step(abs(q.y-y),h)*step(-.8,q.x)*step(q.x,-.8+1.6*f);}
float pool(vec3 c,float k){vec3 d=vL-c;return exp(-dot(d,d)*k);}
void plate(inout vec3 alb,inout vec3 em,inout float sp,inout float gs,vec3 AM){   // clean panelling: matte composite plates, fine seams, recessed fasteners, the odd status light
 vec2 q=abs(vM.y)>.5?vL.xz:abs(vM.x)>.7?vL.zy:vL.xy,g=q*vec2(2.4,3.),f=fract(g),e=min(f,1.-f);
 float seam=smoothstep(.016,.004,min(e.x,e.y)),bolt=smoothstep(.022,.012,length(e-.07));
 alb=vec3(.012,.013,.015)*(.85+.3*texture(uNz,vL*22.).r)*(1.-.7*seam)+.006*bolt;sp=.3;gs=22.;
 em=AM*step(.88,hh(floor(g)+3.1))*smoothstep(.025,.012,length((f-vec2(.86,.16))*vec2(1.,1.4)))*.9;}
void main(){
 vec3 N=normalize(vN),Vd=normalize(vW),V=-Vd,L=uSun.xyz,alb=vec3(.014,.016,.021),em=vec3(0),AM=vec3(1.,.5,.13);float id=vU.x,sp=.35,gs=40.;
 float fn=texture(uNz,vL*7.).r,warn=step(.3,uDm)*step(.5,fract(TIME*1.3));
 if(id>12.5){                                                  // the living quarters: fabrics, wood, paper, ceramic, warm bulbs; and the aux screen
#ifdef CABIN
  float n1=texture(uNz,vL*9.).r,n2=texture(uNz,vL*37.).r;
  if(id<13.5){alb=vec3(.15,.145,.135)*(.8+.3*n1)*(.92+.08*sin(vL.z*80.+n1*6.));sp=.04;gs=6.;}                                   // linen: mattress, pillow
  else if(id<14.5){plate(alb,em,sp,gs,AM);}
  else if(id<15.5){                                                                                                              // the aux CRT
   const float yw=.28,pt=-.35;vec3 d=vL-vec3(-1.15,-1.16,-2.06),Rx=vec3(cos(yw),0.,-sin(yw)),Uy=vec3(sin(yw)*sin(pt),cos(pt),cos(yw)*sin(pt));
   vec2 uv=vec2(dot(d,Rx)/.17,dot(d,Uy)/.0956),c=uv*(1.+.045*dot(uv,uv)),tc=vec2(c.x*.465+.5,.5-c.y*.465);
   float ins=smoothstep(1.075,1.05,abs(c.x))*smoothstep(1.075,1.04,abs(c.y)),px=1./640.,py=1./360.;
   float lum=texture(uPip,tc).r*1.1+(texture(uPip,tc+vec2(px*1.5,0)).r+texture(uPip,tc-vec2(px*1.5,0)).r+texture(uPip,tc+vec2(0,py*1.5)).r+texture(uPip,tc-vec2(0,py*1.5)).r)*.16;
   float fl=.88+.12*hh(vec2(floor(TIME*24.),5.)),rb=1.+.18*exp(-pow(fract(TIME*.11)*1.6-.3-tc.y,2.)*90.),scan=.62+.38*pow(sin(tc.y*3.1416*150.),2.);
   float gl2=step(.985,hh(vec2(floor(TIME*7.),9.)))*step(.5,fract(tc.y*6.+TIME));                                              // now and then a line tears
   lum=mix(lum,texture(uPip,tc+vec2(.02,0)).r,gl2);
   float vig=smoothstep(1.35,.5,length(c*vec2(.85,1.))),dmg=1.-.7*uDm*step(.8,hh(vec2(floor(TIME*11.),2.)));
   vec3 ph=uHc*(lum*1.7*scan*fl*rb+.05+.03*n2)*vig*ins*dmg;
   ph+=vec3(.025)*pow(1.-max(dot(normalize(vN),-Vd),0.),3.)+vec3(.04)*smoothstep(.25,0.,length(c-vec2(-.45,.5)))*.4;   // the curved glass catches the cabin
   o=vec4(ph,-1.);return;}
  else if(id<16.5){alb=vec3(.12,.05,.032)*(.65+.55*n2)*(.85+.15*sin((vL.x+vL.z)*55.))*(.85+.3*n1);sp=.03;gs=5.;}                // wool: blanket, rug, a bin
  else if(id<17.5){float k=floor(fract(id)*10.+.5);                                                                             // photographs (and a notebook)
   vec2 pc=k<.5?vec2(2.,-.75):k<1.5?vec2(2.65,-.85):vec2(4.3,.25),ph2=k<.5?vec2(.2,.15):k<1.5?vec2(.14,.1):vec2(.115,.16),u=(vec2(vL.z,vL.y)-pc)/ph2;
   if(k>2.5){alb=vec3(.2,.19,.16)*(1.-.35*step(.8,fract(vL.z*22.)));sp=.1;gs=10.;}
   else{float hz=-.15+.25*sin(k*3.1+1.),hl=hz+.12*sin(u.x*2.3+k*5.)*sin(u.x*5.1+k);
    vec3 sky=mix(vec3(.9,.55,.35),vec3(.25,.4,.65),clamp(u.y*.6+.4+.2*k,0.,1.)),gr=k>1.5?vec3(.1,.18,.12):vec3(.18,.12,.08);
    vec3 pic=u.y>hl?sky+vec3(1.,.85,.6)*smoothstep(.2,.15,length(u-vec2(.35*sin(k*2.),hz+.3))):gr*(.7+.3*n1);
    alb=pic*.28*(.85+.15*n2);sp=.6;gs=40.;}}
  else if(id<18.5){alb=vec3(.01);em=vec3(1.,.6,.28)*(1.6+.25*sin(TIME*1.7+vL.z*9.));}                                              // warm bulbs
  else if(id<19.5){alb=vec3(.02,.07,.075)*(.7+.45*n1)*(.75+.25*sin(vL.z*95.+vL.y*3.));sp=.05;gs=6.;}                              // deep teal fabric: curtain, a bin, a jacket
  else if(id<20.5){float gr=fract(dot(vL,vec3(1.,.3,3.2))*1.5+n1*1.8);alb=vec3(.12,.065,.03)*(.7+.4*smoothstep(0.,.5,gr)*smoothstep(1.,.6,gr));sp=.5;gs=30.;}   // wood
  else if(id<21.5){alb=vec3(.27,.26,.24)*(.95+.05*n2);sp=.9;gs=70.;}                                                                // ceramic, frames
  else if(id<22.5){alb=vec3(.025,.11,.035)*(.6+.7*n2);sp=.3;gs=12.;}                                                                // leaves
  else{float h=fract(id)*2.5;vec3 bc=h<.5?vec3(.5,.1,.08):h<1.?vec3(.08,.13,.3):h<1.5?vec3(.5,.36,.1):h<2.?vec3(.1,.28,.16):vec3(.45,.42,.36);   // book spines
   alb=bc*.22*(.8+.3*n2)*(1.-.4*step(.92,fract(vL.y*6.)));sp=.25;gs=18.;}
#else
  plate(alb,em,sp,gs,AM);   // in the dash's own shader only the plain panels exist: the quarters draw with their own
#endif
 }
 else if(id>11.5){alb=vec3(.03,.032,.037)*(.75+.5*texture(uNz,vL*vec3(3.,60.,3.)).r);sp=1.1;gs=45.;}        // brushed frame alloy
 else if(id>10.5){o=vec4(mix(vec3(.2,.9,1.),vec3(1.,.15,.1),warn)*(.5+.3*step(.5,fract(TIME*.5+vL.x*3.))),-1.);return;}
 else if(id>9.5){                                             // glass: a tinted pane that mirrors the sky and the cabin, thickest at its frame
  vec3 Ng=faceforward(N,Vd,N),R=reflect(Vd,Ng);float fr=.04+.96*pow(1.-abs(dot(Ng,Vd)),4.),ty=(vL.y+.95)/2.2;
  float e=min(vL.y+.97,1.5-vL.y),edge=smoothstep(0.,.24,e);
  float n=texture(uNz,vL*vec3(2.,7.,2.)).r,n2=texture(uNz,vL*13.).r,sg=pow(max(dot(Vd,L),0.),5.);
  vec2 cg=floor(vec2(vL.x,vL.y-vL.z)*7.);                                                               // the instruments, mirrored faintly
  vec3 c=(neb(R,3.)*1.6+glow(R)*2.)*fr*(1.+1.5*(1.-edge))+uSunC.rgb*sg*.004;
  c+AM*exp(-(vL.y+1.)*2.6)*.012;
  c+=vec3(.5,.7,.8)*(1.-edge)*(1.-edge)*.02;
  float ck=0.;                                                // damage no longer draws on the glass: the HUD and the lamps carry it
  c+=uSunC.rgb*pow(max(dot(R,L),0.),220.)*fr*2.5+vec3(.2,.45,.9)*pow(1.-edge,3.)*.035+vec3(.9,.35,.15)*pow(1.-edge,7.)*.03;
  o=vec4(c+vec3(.5,.55,.6)*ck*(.15+sg),.03+.12*(1.-edge)+ck*.2);return;}
 if(id>12.5){}
 else if(id>11.5){}
 else if(id<.5){alb=vec3(.011,.0115,.014)*(.85+.3*texture(uNz,vL*40.).r);sp=.2;gs=20.;}
 else if(id<1.5){alb=vec3(.005,.0055,.0068);sp=1.5;gs=240.;}
 else if(id<4.5){
  alb=vec3(.003);sp=.2;gs=200.;vec3 sc=vec3(.008,.02,.03);vec2 q;float scan=(.8+.2*sin(vL.y*400.+TIME*6.))*(1.-.7*uDm*step(.82,hh(vec2(floor(TIME*9.),id))));
  if(id<2.5){q=vec2(vL.x/.2,(vL.y+1.18)/.15);
   float bi=floor((q.x+.9)*2.78),bf=fract((q.x+.9)*2.78),lv=bi<1.?uCg.x:bi<2.?uCg.y:bi<3.?uCg.z:bi<4.?uCg.w:uSt.w,h=(q.y+.85)/1.2;
   vec3 bc=bi<1.?vec3(.75,.8,.9):bi<2.?vec3(.2,1.,.5):bi<3.?vec3(.25,.65,1.):bi<4.?vec3(.8,.35,1.):vec3(1.,.72,.2);
   float in1=step(0.,bi)*step(bi,4.)*step(.15,bf)*step(bf,.85)*step(0.,h)*step(h,1.);
   sc+=bc*in1*(step(h,lv)*step(.25,fract(h*12.))*1.1+.07);
   float row=floor((q.y-.45)*9.),ry=fract((q.y-.45)*9.);sc+=AM*step(.45,q.y)*step(q.y,.9)*step(.3,ry)*step(ry,.7)*step(-.85,q.x)*step(q.x,-.85+1.7*(.3+.6*hh(vec2(row,floor(TIME*.2+row)))))*step(.3,fract(q.x*9.+row))*.7;}
  else if(id<3.5){q=vec2((vL.x+.62)/.2,(vL.y+1.2)/.13);
   sc+=(uCk.x<0.?vec3(1.,.2,.15):AM)*bar(q,.35,.24,abs(uCk.x))*1.2+AM*.12*bar(q,.35,.24,1.);
   sc+=vec3(.5,.8,1.)*bar(q,-.4,.14,uSt.z)*step(.25,fract(q.x*8.))+vec3(.03,.05,.07)*bar(q,-.4,.14,1.);}
  else{q=vec2((vL.x-.62)/.2,(vL.y+1.2)/.13);                                                            // hull integrity over gun spin
   sc+=mix(vec3(1.,.15,.1),vec3(.2,1.,.5),smoothstep(.3,.8,1.-uDm))*bar(q,.35,.24,1.-uDm)*(uDm>.5?.6+.6*step(.5,fract(TIME*2.)):1.1)+vec3(.05,.08,.05)*bar(q,.35,.24,1.);
   sc+=vec3(1.,.5,.1)*bar(q,-.4,.14,max(uCk.y,uCk.z))*step(.2,fract(q.x*10.))*1.2+AM*.06*bar(q,-.4,.14,1.);}
  em=sc*scan*1.5*smoothstep(0.,-.1,length(max(abs(q)-vec2(.76,.68),0.))-.2);sp=.9;gs=260.;}
 else if(id<5.5){alb=vec3(.01);em=vec3(.85,.92,1.)*(1.1+uCk.z*2.);}
 else if(id<6.5){alb=vec3(.01);em=mix(AM,vec3(1.,.1,.06),warn)*(1.4+.8*uCk.w+uCk.z);}
 else if(id<7.5){alb=vec3(.016,.014,.013)*(.75+.5*texture(uNz,vL*90.).r);sp=.04;gs=8.;}
 else if(id<8.5){alb=vec3(.4,.035,.02);sp=1.;gs=50.;}
 else{                                                        // instrument modules: each bay is a key bank, a dial, a read-out or a plate
  if(abs(vL.x)>.84&&vL.z<-1.9&&vL.y<-.9&&vL.y>-1.6){plate(alb,em,sp,gs,AM);}else{
  vec2 q=abs(vM.y)>.5?vL.xz:abs(vM.x)>.7?vL.zy:vL.xy,g=q*vec2(4.2,6.),ci=floor(g),f=fract(g);float h=hh(ci),h2=hh(ci+7.3);
  vec2 bq=abs(f-.5)-vec2(.35,.32);float bd=length(max(bq,0.))+min(max(bq.x,bq.y),0.)-.08,in1=smoothstep(.015,-.015,bd),rim=smoothstep(.03,0.,abs(bd));
  alb=vec3(.0035)+.009*in1;sp=mix(.95,.4,in1);gs=mix(160.,35.,in1);em=vec3(.2,.55,.75)*rim*.035;
  if(h<.34){vec2 kg=f*vec2(5.,3.6),ki=floor(kg),kf=fract(kg)-.5;float kd=length(max(abs(kf)-vec2(.2,.15),0.))-.13,key=in1*smoothstep(.03,-.03,kd),kh=hh(ki+ci*3.1);
   alb+=.022*key;sp=mix(sp,.6,key);em+=AM*key*(.035+step(.9,kh)*.8)*smoothstep(.34,.05,length(kf))+vec3(.3,.8,1.)*key*step(kh,.05)*.7*smoothstep(.34,.05,length(kf));}
  else if(h<.56){vec2 d=(f-.5)*vec2(1.,.72);float r=length(d),a=atan(d.y,d.x);
   if(h2>.45){float yy=d.x*sin(uAt.y)+d.y*cos(uAt.y)+uAt.x*.17;
    em+=smoothstep(.255,.245,r)*(mix(vec3(.5,.27,.07),vec3(.08,.42,.7),smoothstep(-.004,.004,yy))*.55+vec3(1.)*smoothstep(.014,0.,abs(yy))*1.3)+AM*smoothstep(.02,0.,abs(r-.27))*.6+vec3(1.,.8,.3)*step(abs(d.y),.009)*step(abs(d.x),.13)*step(.045,abs(d.x))*1.6;}
   else{float nd=h2*5.+uSt.z*4.5+uCk.x*1.5+sin(TIME*.3+h*20.)*.12;
    em+=AM*(smoothstep(.02,0.,abs(r-.27))*.6+smoothstep(.255,.245,r)*smoothstep(.05,0.,abs(sin(a-nd)))*step(0.,cos(a-nd))*1.2+step(r,.27)*step(.92,fract(a*1.9))*.25);}}
  else if(h<.72){float ry=fract(f.y*3.),rw=floor(f.y*3.);em+=AM*in1*smoothstep(.28,.34,ry)*smoothstep(.72,.66,ry)*step(f.x,.15+.7*hh(ci+rw+floor(TIME*.15)))*step(.3,fract(f.x*12.))*.6;}
  else if(h<.88){vec2 d=(f-.5)*vec2(1.,.72);float r=length(d),a=atan(d.y,d.x),kn=h2*5.+uCk.x*2.2,body=smoothstep(.2,.19,r);
   alb=mix(alb,vec3(.018)+.03*step(.5,fract(a*11.))*smoothstep(.12,.19,r)+.02*smoothstep(.1,0.,r),body);sp=mix(sp,.85,body);gs=mix(gs,90.,body);
   em+=AM*(smoothstep(.014,0.,abs(sin(a-kn))*r)*step(0.,cos(a-kn))*step(.05,r)*step(r,.18)*1.3+step(.225,r)*step(r,.26)*step(.82,fract(a*2.55))*.5)*in1;}
  else{em+=mix(vec3(.3,.8,1.),vec3(.2,1.,.4),h2)*in1*smoothstep(.07,.03,length((f-vec2(.25,.5))*vec2(1.,.7)))*1.2+mix(AM,vec3(1.,.1,.06),warn)*in1*smoothstep(.07,.03,length((f-vec2(.5,.5))*vec2(1.,.7)))*step(.5,h2)*1.2;}}
 }
 // light pools from the screens, the cabin lamps and the side strips: the cabin is lit by what is in it
 vec3 Lc=AM*(pool(vec3(0,-1.15,-2.05),2.2)+.7*pool(vec3(-.62,-1.15,-2.05),4.)+.7*pool(vec3(.62,-1.15,-2.05),4.))*(1.-.5*uDm)
  +AM*(pool(vec3(-2.2,1.3,2.2),.3)+pool(vec3(2.2,1.3,2.2),.3))*.3+vec3(.2,.8,1.)*pool(vec3(0,.5,5.3),.4)*.25
  +vec3(.8,.9,1.)*pool(vec3(0,1.25,-2.15),2.5)*.7+vec3(.2,.8,1.)*(pool(vec3(-2.2,-1.2,-1.7),1.5)+pool(vec3(2.2,-1.2,-1.7),1.5))*.3
#ifdef CABIN
  +vec3(1.,.55,.25)*(pool(vec3(-3.,-.6,4.8),.9)*.9+pool(vec3(-2.9,-.4,3.),.35)*.45+pool(vec3(3.,-.5,2.6),.8)*.8+pool(vec3(.2,-2.6,3.),.2)*.12)
#endif
  +uHc*pool(vec3(-1.1,-1.12,-1.96),9.)*.35;
 float df=clamp(dot(N,L)*1.1+.05,0.,1.);vec3 H=normalize(L+V),R=reflect(Vd,N);float fr=pow(1.-max(dot(N,V),0.),4.);
 vec3 col=alb*(uSunC.rgb*df*.9+neb(N,6.)*.8+Lc*3.2+.002)+uSunC.rgb*pow(max(dot(N,H),0.),gs)*sp*df*.5;
 col+=(neb(R,4.)+glow(R))*(.012+.35*fr)*sp+Lc*sp*fr*.05;
 col+=alb*(Lc*.9+neb(N,6.)*.4)*14.*pow(1.-max(dot(N,V),0.),3.)*step(6.5,id)*step(id,7.5);
 col*=.62+.38*smoothstep(-3.6,-1.,vL.y);
 col+=em;
 o=vec4(col,-1.);}`;

// one big triangle for every full-screen pass
const TRI_V = `#version 300 es
out vec2 vU;void main(){vec2 p=vec2(gl_VertexID<<1&2,gl_VertexID&2);vU=p;gl_Position=vec4(p*2.-1.,1,1);}`;

// the sky: nebula, stars, the sun, and a ringed giant with a moon
const SKY_F = HD + `
in vec2 vU;uniform vec4 uBS[8],uBC[8],uCS;uniform vec3 uCC;uniform vec4 uSky,uPl[3],uPa[3],uOrb,uPh;uniform vec3 uPb[3],uSd,uOa,uOb,uPq;out vec4 o;
float hsh(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(hsh(i),hsh(i+vec3(1,0,0)),f.x),mix(hsh(i+vec3(0,1,0)),hsh(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(hsh(i+vec3(0,0,1)),hsh(i+vec3(1,0,1)),f.x),mix(hsh(i+vec3(0,1,1)),hsh(i+vec3(1,1,1)),f.x),f.y),f.z);}
// smooth noise worked out per pixel: the sky's large shapes are far too magnified to read from a small texture cleanly
float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*f*(f*(f*6.-15.)+10.);
 return mix(mix(mix(hsh(i),hsh(i+vec3(1,0,0)),f.x),mix(hsh(i+vec3(0,1,0)),hsh(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(hsh(i+vec3(0,0,1)),hsh(i+vec3(1,0,1)),f.x),mix(hsh(i+vec3(0,1,1)),hsh(i+vec3(1,1,1)),f.x),f.y),f.z);}
float tn(vec3 p){p*=4.;return .55*vn(p)+.3*vn(p*2.03+7.)+.15*vn(p*4.1+3.);}
float stars(vec3 d,float sc,float th){vec3 p=d*sc,i=floor(p),f=p-i;float h=hsh(i);
 vec3 q=.2+.6*vec3(hsh(i+3.1),hsh(i+7.7),hsh(i+11.3));
 float r=length(f-q),tw=.6+.4*sin(TIME*(1.3+h*7.)+h*97.)*sin(TIME*(.7+h*3.1)+h*41.);   // far stars scintillate, each at its own pace
 return step(th,h)*smoothstep(.16,0.,r)*(h-th)/(1.-th)*tw;}
// ---- big stars: a few per place, each a kind and a stage of life. S = direction + kind, C = colour + angular size ----
float spk(vec2 v,float s,float L,float rot,float th){float a=0.;for(int i=0;i<3;i++){float an=rot+float(i)*1.0472;vec2 ax=vec2(cos(an),sin(an));
 a+=exp(-abs(dot(v,vec2(-ax.y,ax.x)))/(.00045+s*th*.12))*exp(-abs(dot(v,ax))/min(s*L*.3,.045));}return a*.35;}   // thin, short, faint: a hint of the optics, not searchlights            // six diffraction spikes
vec3 bigStar(vec3 d,vec4 S,vec4 C){
 float s=C.w;if(s<=0.||dot(d,S.xyz)<.8)return vec3(0);
 vec3 T=normalize(cross(S.xyz,vec3(.17,1.,.31))),B=cross(S.xyz,T);vec2 v=vec2(dot(d,T),dot(d,B));float r=length(v),ty=S.w,ph=fract(S.x*91.7+S.y*13.1),an=atan(v.y,v.x);
 vec3 col=C.rgb,o=vec3(0);float halo=s*s/(r*r+s*s*.25)*1.6,core=exp(-r*r/(s*s*.05));
 if(ty<.5){                                                   // a star in its prime: hard core, soft corona, spikes
  o=col*(core*22.+halo*.6+spk(v,s,9.,ph*2.,.05)*1.6);}
 else if(ty<1.5){                                             // a red giant: a swollen, mottled disc that breathes, darker at its rim
  float R=s*(1.+.04*sin(TIME*.25+ph*9.)),q=clamp(r/R,0.,1.),cv=n3(vec3(v/s*5.,TIME*.05+ph*7.))*.6+n3(vec3(v/s*13.,ph*3.))*.4;
  o=col*(smoothstep(1.,.96,r/R)*sqrt(max(0.,1.-q*q))*(.6+.7*cv)*2.4+halo*.7+exp(-max(r-R,0.)/(s*.6))*.6)+col*spk(v,s,4.,ph,.04)*.4;}
 else if(ty<2.5){                                             // a blue supergiant: fierce, with long spikes
  o=col*(core*40.+halo*1.4+spk(v,s,26.,ph*2.,.04)*2.6)+vec3(.5,.7,1.)*exp(-r/(s*5.))*.5;}
 else if(ty<3.5){                                             // a white dwarf in the ring of gas it shed: teal inside, red at the edge, clumped
  float Rr=s*6.,dr=(r-Rr)/Rr,cl=.55+.45*n3(vec3(cos(an)*3.,sin(an)*3.,ph*9.)+r/s*.4);
  o=vec3(1.)*exp(-r*r/(s*s*.004))*30.+vec3(.25,.95,.85)*exp(-r*r/(Rr*Rr*.55))*.35+mix(vec3(.3,1.,.8),vec3(1.,.25,.2),smoothstep(-.15,.2,dr))*exp(-dr*dr*28.)*cl*2.;}
 else if(ty<4.5){                                             // a pulsar: a pinprick with a soft pulse, two short beams that drift slowly round it, a faint wind nebula
  float ba=TIME*.012+ph*6.28,fl=.8+.2*pow(.5+.5*sin(TIME*2.2+ph*30.),6.);vec2 ax=vec2(cos(ba),sin(ba));
  float bm=exp(-abs(dot(v,vec2(-ax.y,ax.x)))/(r*.06+s*.04))*exp(-r/(s*9.));
  o=vec3(.8,.9,1.)*(exp(-r*r/(s*s*.02))*40.*fl+bm*2.6*fl)+vec3(.35,.5,1.)*exp(-r/(s*4.))*n3(vec3(v/s*1.5,ph))*.8;}
 else if(ty<5.5){                                             // a protostar: a warm glow still wrapped in dust, jets driven out of its poles
  vec2 ax=vec2(cos(ph*6.28),sin(ph*6.28));float al=dot(v,ax),ac=dot(v,vec2(-ax.y,ax.x));
  float jet=exp(-abs(ac)/(s*.12+abs(al)*.05))*exp(-abs(al)/(s*9.))*(.5+.5*sin(abs(al)/s*3.-TIME*.8))*smoothstep(s*.3,s*1.2,abs(al));
  o=vec3(1.,.5,.25)*(core*10.+halo*.8)+vec3(1.,.3,.45)*jet*4.;}
 else if(ty<6.5){                                             // a Wolf-Rayet star: fierce and hot, inside a clumpy bubble it is blowing
  float Rb=s*5.5,dr=(r-Rb)/Rb,cl=n3(vec3(cos(an)*4.,sin(an)*4.,ph*5.)+r/s*.8);
  o=vec3(.75,.85,1.)*(core*36.+halo*.8+spk(v,s,14.,ph,.04)*1.8)+mix(vec3(1.,.35,.6),vec3(.6,.4,1.),cl)*exp(-dr*dr*14.)*smoothstep(.3,.75,cl)*2.4;}
 else{                                                        // a binary pair: gold and blue, close enough to share a glow
  vec2 off=vec2(cos(ph*6.28+TIME*.02),sin(ph*6.28+TIME*.02))*s*1.4;float r1=length(v-off),r2=length(v+off);
  o=vec3(1.,.78,.45)*(exp(-r1*r1/(s*s*.04))*26.+spk(v-off,s,7.,ph,.05)*1.3)+vec3(.55,.7,1.)*(exp(-r2*r2/(s*s*.035))*30.+spk(v+off,s,7.,ph,.05)*1.3)+mix(vec3(1.,.8,.5),vec3(.6,.75,1.),.5)*halo*.9;}
 return o;}
// ---- the system's own star, close: a disc that fills part of the sky. uCS = angular radius, stage, seed, giant phase; uCC = colour ----
vec3 closeStar(vec3 d){
 float R=uCS.x;vec3 L=uSun.xyz;float mu0=dot(d,L);if(R<=0.||mu0<cos(min(R*2.6,1.5)))return vec3(0);
 vec3 T=normalize(cross(L,vec3(.17,1.,.31))),B=cross(L,T);vec2 v=vec2(dot(d,T),dot(d,B));float th=acos(clamp(mu0,-1.,1.)),rr=th/R,an=atan(v.y,v.x),ph=uCS.z,st=uCS.y,gi=uCS.w;
 vec3 col=uCC,o=vec3(0);float gs=gi>.5?7.:st>3.5&&st<5.5?26.:16.;
 if(rr<1.){
  float mu=sqrt(1.-rr*rr);vec3 p=vec3(v/max(th,1e-5)*rr,mu);float ca=cos(TIME*.004+ph),sa=sin(TIME*.004+ph);p=vec3(p.x*ca+p.z*sa,p.y,-p.x*sa+p.z*ca);   // the surface turns, slowly
  float g1=n3(p*gs+TIME*.02),g2=n3(p*gs*2.7+9.-TIME*.03),cell=1.-abs(2.*g1-1.),fine=n3(p*gs*7.+3.);
  float gran=.62+.22*cell*cell+.1*g2+.06*fine;                                                            // fine convection cells, coarser for a giant
  float grp=smoothstep(.62,.8,n3(p*1.6+ph*7.)),spn=n3(p*14.+ph*3.)*grp,spot=smoothstep(.55,.62,spn)*(st>4.5&&st<5.5||st>6.5?.3:1.),umb=smoothstep(.6,.66,spn);   // small spots, in groups
  float act=smoothstep(.4,.55,spn)*(1.-spot)*.6,loops=exp(-abs(n3(p*22.+ph)-.5)*40.)*smoothstep(.35,.5,spn);                      // active regions: bright plage and magnetic loops around the spots
  float limb=1.-.62*(1.-mu)-.25*(1.-mu)*(1.-mu);
  vec3 hot=mix(col,vec3(1.,.9,.6),.3),cool=col*vec3(1.,.6,.35);
  vec3 surf=mix(cool,hot,clamp((gran-.5)*2.2,0.,1.))*limb*(1.-spot*.6-umb*.35)+hot*act*.5+vec3(1.,.95,.8)*loops*.7;
  if(gi>.5)surf*=.75+.25*sin(TIME*.15+ph*5.);                                                             // a giant breathes
  o=surf*(st>6.5?2.4:1.8)*smoothstep(1.,.985,rr);                                                       // a star glows: brighter than anything else in the sky, colour kept saturated
  o+=col*pow(1.-mu,4.)*.6;}                                                              // a thin bright rim of the atmosphere
 else{
  float h=th-R;
  float cor=exp(-h/(R*.12))*.9+exp(-h/(R*.6))*.15,str=n3(vec3(cos(an)*3.,sin(an)*3.,ph))*exp(-h/(R*.7));
  o=col*(cor+str*.2)*(st>4.5&&st<5.5?1.4:1.);
  float sec=smoothstep(.62,.78,n3(vec3(cos(an)*2.2,sin(an)*2.2,ph*3.)));                                   // prominences: flame arcs standing off the limb in a few places
  float hn=h/R,fl=exp(-abs(n3(vec3(an*7.,hn*9.,TIME*.03+ph))-.5)*14.)*smoothstep(.3,.02,hn)*step(0.,hn);
  o+=col*vec3(1.,.55,.4)*fl*sec*1.6*(gi>.5?.6:1.);}
 if(st>5.5&&st<6.5){vec3 C2=normalize(L+T*R*2.3+B*R*.6);float t2=acos(clamp(dot(d,C2),-1.,1.)),R2=R*.35;   // a binary: the companion, small and blue, close by
  float rq=t2/(R*.03);o+=vec3(.6,.75,1.)*(exp(-rq*rq)*14.+.02/(rq*rq*.02+.02)*.06);}
 return o;}
vec4 planet(vec3 d,vec3 P,float rp,vec3 ca,vec3 cb,float ring){
 float b=dot(d,P),ds=b*b-(1.-rp*rp);vec4 c=vec4(0);float ts=1e9;vec3 L=uSun.xyz,atm=mix(ca,vec3(.4,.68,1.),.65)*uSunC.rgb;
 if(ds>0.&&b>0.){ts=b-sqrt(ds);vec3 n=normalize(d*ts-P);float nl=dot(n,L);
  float w=tn(n*.6+.2),w2=tn(n*2.3+.5),w3=texture(uNz,n*7.).r;
  vec3 s=mix(ca,cb,smoothstep(.3,.7,.5+.3*sin((n.y*2.5+w*1.3)*5.)+(w2-.5)*.9))*(.45+.7*w3);
  // clouds: a storm swirl, two layers drifting at different rates, and the shadows they throw on the ground
  vec3 sw=normalize(ca.zxy-.45+vec3(.07,.11,.03));float sdt=dot(n,sw),ga=smoothstep(.8,1.,sdt)*5.;vec3 nq=n*cos(ga)+cross(sw,n)*sin(ga)+sw*sdt*(1.-cos(ga));
  float c1=smoothstep(.47,.72,tn(nq*1.5+vec3(TIME*.0015,0,.3))*.65+w3*.45),c2=smoothstep(.56,.8,tn(nq*3.1+vec3(-TIME*.003,.7,0))*.7+texture(uNz,nq*11.).r*.35)*.7,cl=max(c1*.85,c2);
  vec3 nS=normalize(n+L*.035);float shd=smoothstep(.47,.72,tn(nS*1.5+vec3(TIME*.0015,0,.3))*.65+texture(uNz,nS*7.).r*.45);
  s*=1.-.5*shd*(1.-cl);s=mix(s,vec3(.86,.88,.9)*(.72+.38*w2),cl*.85);
  float lit=mix(smoothstep(-.06,.28,nl),smoothstep(-.16,.2,nl),cl),mu=max(dot(n,-d),0.),rim=pow(1.-mu,2.5),hz=pow(1.-mu,1.5),tw=exp(-nl*nl*50.)*smoothstep(-.25,.05,nl);
  vec3 col=s*s*lit*uSunC.rgb*1.15+vec3(1.,.66,.3)*step(.78,w3)*step(.52,w2)*(1.-lit)*(1.-cl)*.35;
  col+=vec3(1.,.45,.2)*uSunC.rgb*tw*(.12+.35*cl);                                              // a warm band where day turns to night
  col=mix(col,atm*(.08+1.3*lit),hz*.7)+atm*.035*lit;                                           // haze thickens toward the edge of the disc
  col+=atm*rim*pow(max(dot(d,L),0.),4.)*1.6;                                                    // backlit: the rim of air lights up
  c=vec4(mix(col,atm*(.12+1.7*lit),rim*.9),1.);}
 else if(b>0.&&rp>0.){float h=(acos(clamp(b,-1.,1.))-asin(min(rp,.999)))/rp;
  if(h<.7){float lit=smoothstep(-.35,.35,dot(normalize(d-P*b),L)),a=(exp(-h*22.)*.75+exp(-h*6.)*.22)*(.08+lit),fs=pow(max(dot(d,L),0.),6.)*exp(-h*7.)*1.4;
   c=vec4(atm*1.5*a+uSunC.rgb*fs*.5,min(1.,a+fs*.3));}}
 if(ring>0.){vec3 rn=normalize(vec3(.25,1,.35)),e1=normalize(cross(rn,vec3(0,0,1))),e2=cross(rn,e1);float t=dot(P,rn)/dot(d,rn);
  vec3 hp=d*t-P;float r=length(hp)/rp,k=r*120.,lw=fwidth(k);
  if(t>0.&&t<ts&&r>1.25&&r<3.1){                              // thousands of orbiting grains, each drawn as the path it travels
   float li=floor(k),lf=fract(k),lh=hsh(vec3(li,3.,7.)),l2=hsh(vec3(li,11.,5.)),ang=atan(dot(hp,e2),dot(hp,e1));
   float line=mix(smoothstep(.48,.2,abs(lf-.5)),.45,smoothstep(.5,1.4,lw));
   float dd=fract(ang*(30.+floor(lh*110.))+TIME*.03*(l2-.4)+lh*9.),dot1=mix(1.,smoothstep(.5,.25,abs(dd-.5)),step(.3,l2)*smoothstep(1.2,.4,lw));
   float env=smoothstep(1.25,1.4,r)*smoothstep(3.1,2.7,r)*(.25+.75*texture(uNz,vec3(r*.5,.3,.7)).r)*(1.-.8*smoothstep(.06,0.,abs(r-2.05)));
   vec3 tc=l2<.1?vec3(1.,.22,.12):l2<.17?vec3(1.,.6,.3):mix(vec3(.3,.5,1.),vec3(1.),lh*lh*lh);
   float sh=dot(hp,L),shd=length(hp-L*sh)<rp&&sh<0.?.08:1.,a=env*line*dot1;
   c.rgb=c.rgb*(1.-a*.5)+tc*uSunC.rgb*(.3+7.*lh*lh*lh*lh*lh)*a*shd;c.a=max(c.a,a*.5);}}
 return c;}
void main(){
 vec3 d=normalize(uFw.xyz+uRt.xyz*mix(uRt.w,uFw.w,vU.x)+uUp.xyz*mix(uUp.w,uVel.w,vU.y));
 vec4 t=texture(uNeb,d);vec3 c=neb(d,0.);float dens=max(t.r,t.g),m=1.;
 // storms: lightning flickering inside the densest cloud
 float k=floor(TIME*.6),fl=exp(-fract(TIME*.6)*7.)*step(.45,hsh(vec3(k,1,2)))*(.6+.4*sin(TIME*70.));
 vec3 lp=normalize(vec3(hsh(vec3(k,3,4)),hsh(vec3(k,5,6)),hsh(vec3(k,7,8)))-.5);
 c+=uCE.rgb*fl*uSky.w*exp(-(1.-dot(d,lp))*12.)*dens*dens*6.;
 // a spiral galaxy, far behind everything
 {vec3 P=normalize(vec3(.2,.75,.62)),gx=normalize(cross(P,vec3(.3,1,.1))),gy=cross(P,gx);float w=dot(d,P);
  if(w>0.){vec2 g=vec2(dot(d,gx),dot(d,gy)*2.3)/w/.36;float r=length(g);
   float arm=.5+.5*cos(2.*atan(g.y,g.x)-2.6*log(r+.06));
   float gb=(exp(-r*3.2)*(.45+.55*arm)*(.4+1.2*tn(vec3(g*.9,.3)))+exp(-r*16.)*1.1)*smoothstep(1.5,.7,r);
   c+=mix(vec3(1.,.85,.6),vec3(.5,.68,1.),smoothstep(0.,.5,r))*gb*(.025+.45*uSky.z)*(1.-.7*dens);}}
 float st=stars(d,110.,.93)*3.+stars(d,230.,.9)*1.6+stars(d,60.,.985)*9.,fine=stars(d,470.,.62),hc=hsh(floor(d*230.));
 vec3 scol=hc<.14?vec3(1.,.35,.2):hc<.5?vec3(.55,.72,1.):vec3(1.,.95,.9);
 c+=(st*1.5+fine*.9)*scol*(1.-.9*t.b);
 for(int i=0;i<8;i++)c+=bigStar(d,uBS[i],uBC[i])*(1.-.7*t.b);
 // one soft ribbon of light following a level curve of a smooth, gently warped field
 {vec3 q1=(d+uSd*.07)*.9;q1+=vec3(n3(q1*.8+3.),n3(q1*.8+13.),n3(q1*.8+23.))*1.5;
  float phi=n3(q1+50.)*.7+n3(q1*2.+9.)*.3,den=smoothstep(.5,.85,n3(q1*1.3+31.)*.75+t.r*.35);
  float rib=exp(-(phi-.5)*(phi-.5)*500.),band=exp(-(phi-.5)*(phi-.5)*60.);
  c+=mix(mix(uCB.rgb,uCE.rgb,.6),vec3(1.),rib*.5)*(band*.05+rib*.3)*den*den*(.7+.6*tn(d*9.))*(1.-.8*t.b);}
 float s=dot(d,uSun.xyz),s2=dot(d,normalize(uSun.xyz+vec3(.07,.045,.02)));
 c+=glow(d)*(uCS.x>0.?.15:1.)+(uCS.x>0.?closeStar(d):uSunC.rgb*(smoothstep(.99982,.99994,s)*30.+pow(max(s,0.),1500.)*1.3));
 c+=vec3(1.,.3,.12)*(smoothstep(.99996,.99999,s2)*22.+pow(max(s2,0.),4000.)*1.4);
 // a ringworld: we are inside its hoop, so it crosses the whole sky as a band of lit land and city lights
 if(uSky.y>.01){vec3 n=normalize(vec3(.35,.25,.9));float sn=dot(d,n),w=.017;
  if(abs(sn)<w){vec3 rd=normalize(d-n*sn),e1=normalize(cross(n,vec3(0,1,0))),e2=cross(n,e1);
   float ph=atan(dot(rd,e2),dot(rd,e1)),v=sn/w,k=v*13.,li=floor(k),lf=fract(k),lh=hsh(vec3(li,2.,9.)),l2=hsh(vec3(li,4.,1.));
   float dd=fract(ph*(60.+floor(lh*240.))+TIME*.01*(l2-.5)),ln=smoothstep(.48,.15,abs(lf-.5))*(.1+.03*dd);
   vec3 tc=l2<.12?vec3(1.,.3,.15):l2<.3?vec3(1.,.75,.45):mix(vec3(.35,.55,1.),vec3(1.),lh*lh);
   float a=uSky.y*smoothstep(1.,.8,abs(v));c=c*(1.-a*.55)+tc*ln*a*(.25+3.5*lh*lh*lh);}}
 // a black hole and its accretion disc
 if(uSky.x>.01){vec3 P=normalize(vec3(.58,-.22,.78)),rn=normalize(vec3(.18+.7*sin(uSd.z*2.1),.96,-.2+.7*cos(uSd.z*1.3))),sd=normalize(cross(rn,P)),fw=cross(sd,rn);
  float rp=.05+.035*fract(uSd.x*.37),ang=acos(clamp(dot(d,P),-1.,1.))/rp,tt=dot(P,rn)/dot(d,rn);vec3 hp=d*tt-P;float r=length(hp)/rp;vec3 dc=vec3(0);
  if(tt>0.&&r>1.6&&r<8.){float w=TIME*.5/pow(r,1.5);vec2 hq=vec2(dot(hp,sd),dot(hp,fw))/rp;float dop=1.+.75*hq.x/r;
   vec2 hr=mat2(cos(w),-sin(w),sin(w),cos(w))*hq;float tb=tn(vec3(hr*1.3,TIME*.02))*.8+tn(vec3(hr*3.1,2.+TIME*.01))*.2;
   vec3 tc=mix(vec3(1.,.38,.1),vec3(1.,.82,.55),smoothstep(7.,3.2,r));tc=mix(tc,vec3(.85,.93,1.),smoothstep(3.2,1.8,r));
   dc=tc*(.25+1.5*tb*tb)*pow(1.6/r,2.4)*dop*dop*dop*4.*smoothstep(1.6,2.,r)*smoothstep(8.,5.5,r);}
  float hole=smoothstep(1.06,.96,ang);vec3 e2=normalize(d-P*dot(d,P)+1e-5);float tb2=abs(dot(e2,rn));
  vec3 halo=vec3(1.,.95,.9)*exp(-(ang-1.025)*(ang-1.025)*6000.)*(.25+.7*max(0.,dot(e2,sd)))+vec3(1.,.86,.66)*exp(-(ang-1.55)*(ang-1.55)*9.)*(.15+1.1*tb2*tb2);
  c=mix(c,c*(1.-hole)+halo,uSky.x);m*=1.-hole*uSky.x;
  c+=dc*uSky.x*(tt<1.?1.:1.-hole);}
 if(uPh.x>.5){vec3 Q=uPq,U=normalize(cross(Q,vec3(.13,.97,.21))),W=cross(Q,U);float ca=dot(d,Q),an=acos(clamp(ca,-1.,1.)),ty=uPh.x,sv=uPh.y;vec2 pp=vec2(dot(d,U),dot(d,W));
  if(ca>0.){
   if(ty<1.5){float R=.16+.1*sv,fl=tn(d*22.+sv*9.),f2=tn(d*55.+sv*3.),q1=(an-R*(.92+.16*fl))/.018,q2=(an-R*.8*(.9+.2*f2))/.03;
    c+=(vec3(1.,.22,.18)*exp(-q1*q1)*(.3+1.4*f2*f2)+vec3(.15,.75,.7)*exp(-q2*q2)*(.15+.8*fl*fl)+vec3(.25,.3,.6)*smoothstep(R,0.,an)*.05)*.9;}
   else if(ty<2.5){float R=.035+.03*sv,el=length(pp*vec2(1.,1.+.6*sv)),q1=(el-R)/(R*.22),q2=(el-R*1.25)/(R*.3);
    c+=vec3(.2,.9,.75)*exp(-q1*q1)*.9+vec3(.9,.3,.25)*exp(-q2*q2)*.35+vec3(.3,.5,.9)*smoothstep(R,0.,el)*.18+vec3(1.)*exp(-an*an*3e5)*3.;}
   else if(ty<3.5){float th=TIME*(2.+3.*sv),bd=abs(pp.x*sin(th)-pp.y*cos(th)),pl=.6+.4*sin(TIME*(14.+20.*sv));
    c+=vec3(.7,.85,1.)*(exp(-an*an*2.5e5)*5.*pl+exp(-bd*bd*2.5e4)*exp(-length(pp)*16.)*.8+exp(-an*an*900.)*.12);}
   else if(ty<4.5){vec3 sc=mix(vec3(.6,.75,1.),vec3(1.,.5,.25),sv);c+=sc*(exp(-an*an*6e3)*6.+exp(-an*an*220.)*.35+exp(-an*18.)*.08);}
   else if(ty<5.5){vec3 aw=normalize(Q-uSun.xyz);vec2 td=normalize(vec2(dot(aw,U),dot(aw,W))+1e-4);float al0=dot(pp,td),al=max(al0,0.),pe=pp.x*td.y-pp.y*td.x+al*al*.6*(sv-.5),p2=pe-al*.25;
    c+=vec3(.75,.9,1.)*exp(-an*an*8e4)*3.+step(0.,al0)*exp(-al*(7.+4.*sv))*(vec3(.5,.75,1.)*exp(-pe*pe*9e3/(1.+al*40.))*.8+vec3(1.,.85,.6)*exp(-p2*p2*2.5e3/(1.+al*30.))*.35);}
   else{vec2 gq=pp*520.,gi=floor(gq),gf=fract(gq)-.2-.6*vec2(hsh(vec3(gi,1.)),hsh(vec3(gi,2.)));float h=hsh(vec3(gi,sv*31.)),fall=exp(-an*an*(160.+200.*sv));
    c+=mix(vec3(1.,.8,.55),vec3(.8,.88,1.),hsh(vec3(gi,7.)))*(step(1.-fall*.9,h)*exp(-dot(gf,gf)*14.)*1.6+fall*.1);}
  }}

 for(int i=2;i>=0;i--)if(uPl[i].w>0.){vec4 p=planet(d,uPl[i].xyz,uPl[i].w,uPa[i].rgb,uPb[i],uPa[i].a);c=c*(1.-p.a)+p.rgb;m*=1.-p.a;}
 if(uOrb.x>0.){float R=90000.,h=uOrb.y,cl=R+h,b=-d.y*cl,q=2.*R*h+h*h,disc=b*b-q;vec3 L=uSun.xyz;
  vec3 at=mix(uOa,uSunC.rgb,.45);float sunH=smoothstep(-.25,.25,L.y+.15);
  // the horizon: ground and sky both melt into one band of haze, brightest toward the sun, with a thin glow along the limb
  float yh=-sqrt(q)/cl,hzv=d.y-yh,sdh=pow(max(dot(normalize(vec3(d.x,0.,d.z)+1e-4),normalize(vec3(L.x,0.,L.z)+1e-4)),0.),3.);
  vec3 hcol=at*at*(.22+.55*sunH)+mix(vec3(1.,.55,.25),uSunC.rgb,.4)*sdh*(.15+.6*sunH)*(.4+.6*smoothstep(.35,-.05,L.y));
  if(b>0.&&disc>0.){float t=b-sqrt(disc);vec3 P=d*t,N=normalize(P+vec3(0,cl,0));vec2 s=P.xz+uOrb.zw;
   float big=tn(vec3(s*.000035,.3)),c1=tn(vec3(s*.00011+big*.6,1.7)),c2=tn(vec3(s*.0005,4.1));
   {float h0=smoothstep(.4,.85,big*.5+c1*.4+c2*.18);vec2 pv=d.xz/max(.18,dot(-d,N))*1400.*h0;s+=pv;big=tn(vec3(s*.000035,.3));c1=tn(vec3(s*.00011+big*.6,1.7));c2=tn(vec3(s*.0005,4.1));}
   float cov=smoothstep(.46,.8,big*.5+c1*.4+c2*.18),cov2=smoothstep(.46,.8,tn(vec3((s+L.xz*900.)*.000035,.3))*.5+tn(vec3((s+L.xz*900.)*.00011+big*.6,1.7))*.4+c2*.18);
   float ty=uOrb.x,ndl=smoothstep(-.12,.35,dot(N,L)),sh=clamp(1.-(cov2-cov)*3.2,.08,1.3),top=.35+.65*c2+.5*(cov-cov2);if(ty>1.5)cov*=.7;
   vec3 warm=mix(vec3(1.,.4,.13),vec3(1.),smoothstep(0.,.6,ndl)),lit=uSunC.rgb*warm*ndl*sh;
   float land=smoothstep(.47,.56,tn(vec3(s*.00006,11.))+.22*tn(vec3(s*.0004,12.))-.08),rg=tn(vec3(s*.0012,5.));
   vec3 band=mix(mix(uOb,uOa.zxy,smoothstep(.3,.7,tn(vec3(s.x*.000012,s.y*.00007,3.)))),uCE.rgb*.6,.3*smoothstep(.55,.8,tn(vec3(s*.00002,9.))));
   vec3 surf=ty<1.5?band:ty<2.5?mix(uOb*.45+vec3(0.,.03,.09),mix(uOa.yxz*.55,uOa,rg),land):mix(vec3(.7,.86,1.),uOa,.25)*(.55+.55*rg);
   if(ty>2.5)surf=mix(surf,vec3(.1,.5,.7),smoothstep(.035,0.,abs(tn(vec3(s*.0003,8.))-.5))*.7);
   vec3 gnd=surf*(lit*.85+at*.05);
   if(ty>1.5&&ty<2.5)gnd+=uSunC.rgb*pow(max(dot(reflect(d,N),L),0.),90.)*(1.-land)*1.6*ndl;
   vec3 ccol=mix(vec3(1.),uOa*.6+.4,.55)+(ty<1.5?(uCE.rgb-.4)*.35*sin(c1*9.+big*6.):vec3(0));
   vec3 cc=mix(gnd,ccol*top*(lit*.95+at*.07),cov);
   float gp=smoothstep(.6,.8,tn(vec3(s*.00022,7.)))*(1.-cov*.85)*(.35+.65*smoothstep(.3,.7,tn(vec3(s*.004,2.))));
   cc+=(ty<1.5?mix(uCE.rgb,vec3(1.,.72,.22),.7)*gp*(.5+1.2*(1.-ndl)):ty<2.5?vec3(1.,.75,.4)*gp*land*smoothstep(.5,.1,ndl)*1.5:vec3(.2,.7,1.)*gp*.15);
   cc+=uSunC.rgb*warm*pow(max(dot(reflect(d,N),L),0.),50.)*.3*cov*ndl;
   float sd2=pow(max(dot(d,L),0.),4.);vec3 air=mix(at*at*1.3,vec3(1.,.5,.2),sd2*.6)*(.05+.22*sunH+1.2*sd2);
   cc=mix(vec3(dot(cc,vec3(.33))),cc,1.45);float fg=1.-exp(-t/30000.);cc=mix(cc,air,fg*.85);
   cc=mix(cc,hcol,smoothstep(-.09,0.,hzv)*.92);                        // far ground dissolves into the horizon haze
   {float ah=abs(hzv);cc+=hcol*(exp(-ah*140.)*.55+exp(-ah*9.)*.12);}
   c=cc;m=0.;}
  else{float bb=max(b,0.),alt=sqrt(max(cl*cl-bb*bb,0.))-R;
   float g=exp(-max(alt,0.)/1500.)+.25*exp(-max(alt,0.)/7000.);c+=at*at*g*(.08+.3*sunH+1.6*pow(max(dot(d,L),0.),5.));
   float hz=max(hzv,0.);c=mix(c,hcol,exp(-hz*26.)*.9);c+=hcol*(exp(-hz*140.)*.55+exp(-hz*9.)*.12);m*=1.-exp(-hz*26.)*.9;}   // haze above the horizon, and the glow along it
 }
 o=vec4(c,m);}`;

// baked once into a cubemap: R, G two cloud layers, B dark dust lanes, A bright filaments
const BAKE_F = `#version 300 es
precision highp float;in vec2 vU;uniform vec3 uFa,uRa,uUa,uSeed;uniform vec4 uSty;out vec4 o;
float hsh(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(hsh(i),hsh(i+vec3(1,0,0)),f.x),mix(hsh(i+vec3(0,1,0)),hsh(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(hsh(i+vec3(0,0,1)),hsh(i+vec3(1,0,1)),f.x),mix(hsh(i+vec3(0,1,1)),hsh(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<6;i++){s+=a*n3(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}
void main(){vec2 n=vU*2.-1.;vec3 d=normalize(uFa+uRa*n.x+uUa*n.y)+uSeed;
 vec3 w=vec3(fbm(d*2.+3.),fbm(d*2.+11.),fbm(d*2.+19.))-.5;
 float sc=uSty.x,cv=uSty.y;                                                                // this place's nebula: scale and coverage
 float r=smoothstep(.3-cv,.8-cv,fbm(d*1.7*sc+w*1.6));
 float g=smoothstep(.38-cv,.85-cv,fbm(d*2.2*sc+17.+w.yzx*1.8));
 float b=smoothstep(.5-cv*.6,.78-cv*.6,fbm(d*3.4*sc+31.+w.zxy*2.4))*(.5+uSty.w);
 // a few long filaments: three level curves of a smooth, gently warped field
 vec3 q1=d*.9+vec3(n3(d*.7+3.),n3(d*.7+13.),n3(d*.7+23.))*1.5;
 float phi=n3(q1+50.)*.7+n3(q1*2.+9.)*.3,den=smoothstep(.45,.8,n3(d*1.2+w*.6+7.)*.7+n3(q1*1.7+31.)*.4),core=exp(-(phi-.5)*(phi-.5)*1400.);
 float br=smoothstep(.35,.65,n3(d*4.+w*2.+70.));                                         // filaments come and go along their length
 float a=clamp((exp(-(phi-.5)*(phi-.5)*260.)+.5*exp(-(phi-.36)*(phi-.36)*200.))*den*br,0.,1.);
 o=vec4(r,g,b,clamp(a*uSty.z,0.,1.));}`;

// post: one shader blurs both down and up the bloom chain
const BLUR_F = `#version 300 es
precision highp float;uniform sampler2D uH;uniform vec2 uPx;in vec2 vU;out vec4 o;
void main(){vec4 d=uPx.xyxy*vec4(-1,-1,1,1);
 o=min(.25*(texture(uH,vU+d.xy)+texture(uH,vU+d.zy)+texture(uH,vU+d.xw)+texture(uH,vU+d.zw)),vec4(60.));}`;
// star shafts: march toward the sun, gathering bright sky; alpha is 0 wherever something solid is in the way
const RAY_F = `#version 300 es
precision highp float;uniform sampler2D uH;uniform vec3 uSunS;in vec2 vU;out vec4 o;
void main(){vec2 dl=(uSunS.xy-vU)/float(NS)*.92;
 float j=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
 vec2 p=vU+dl*j;vec3 acc=vec3(0);float w=1.;
 for(int i=0;i<NS;i++){vec4 s=texture(uH,p);float l=max(max(s.r,s.g),s.b);
  acc+=min(s.rgb,vec3(8.))*max(s.a,0.)*smoothstep(.9,4.,l)*w;w*=.976;p+=dl;}
 o=vec4(acc/float(NS)*uSunS.z,1);}`;
const COMP_F = HD + `
uniform sampler2D uH,uB,uR;uniform vec2 uPx,uJc;uniform vec3 uFl,uJ;uniform vec4 uFx,uFy,uFz;uniform float uFs;in vec2 vU;out vec4 o;
vec3 aces(vec3 x){return clamp(x*(2.51*x+.03)/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec2 q=vU-.5;float bs=uCA.w;
 vec2 of=q*dot(q,q)*(.005+.028*bs)*uFx.x;
 vec3 c=vec3(texture(uH,vU+of).r,texture(uH,vU).g,texture(uH,vU-of).b);
 vec2 mv=uFx.zw+q*dot(q,q)*uFs;                               // motion blur: the turn, plus speed streaming past the edges
 if(texture(uH,vU).a>-.5&&dot(mv,mv)>2e-7){float jt=fract(52.98*fract(dot(gl_FragCoord.xy,vec2(.0671,.00584))));vec3 mb=c,c0=c;for(int i=1;i<7;i++){vec2 u=vU+mv*(float(i)-jt)/6.;vec4 sg=texture(uH,u);mb+=sg.a<-.5?c0:vec3(texture(uH,u+of).r,sg.g,texture(uH,u-of).b);}c=mb/7.;}   // the cabin is not moving relative to you: it stays sharp
 vec2 qj=vU-uJc;   // the jump is centred on the point dead ahead of the ship, projected for this eye: in a headset both eyes agree, so the tunnel has depth
 if(uJ.x>0.){vec3 ac=vec3(0);for(int i=0;i<12;i++){float t=float(i)/12.;ac+=texture(uH,uJc+qj*(1.-uJ.x*.6*t)).rgb*(1.-.5*t);}c=mix(c,ac/8.*(1.+uJ.x),uJ.x);}
 vec4 e=uPx.xyxy*vec4(-5,-5,5,5);
 c+=(texture(uB,vU).rgb*.03+.25*(texture(uR,vU+e.xy)+texture(uR,vU+e.zy)+texture(uR,vU+e.xw)+texture(uR,vU+e.zw)).rgb)*uFy.y;   // glow and sun rays
 if(uFl.z>0.){vec2 sv=vU-uFl.xy,g1=vU-mix(uFl.xy,1.-uFl.xy,.62),g2=vU-(1.-uFl.xy);float vis=uFl.z*max(texture(uH,clamp(uFl.xy,.002,.998)).a,0.);
  c+=vis*uSunC.rgb*(vec3(.45,.65,1.)*exp(-abs(sv.y)*110.)*exp(-abs(sv.x)*3.2)*.22+vec3(.6,.8,1.)*exp(-dot(g1,g1)*700.)*.035+vec3(1.,.7,.5)*smoothstep(.012,0.,abs(length(g2)-.11))*.02);}
 if(uJ.y>0.){vec2 qa=qj*vec2(uPx.y/uPx.x,1.);float r=length(qa),a=atan(qa.y,qa.x),z=.22/(r+.03)+uJ.z*5.;
  float ag=(a+3.1416)*52.,id=floor(ag),af=fract(ag)-.5,h=h1(id),h2=h1(id+91.),ln=exp(-af*af*(10.+30.*h2));
  float s=(pow(fract(z*(.25+h*.9)+h2*9.),6.)*step(.3,h)+.3*pow(fract(z*(.6+h2)+h*5.),10.))*ln;
  float sw=texture(uNz,vec3(cos(a)*.35,sin(a)*.35,z*.06)).r;
  vec3 tc=mix(uCE.rgb,vec3(.35,.6,1.),.6)*(s*smoothstep(.03,.45,r)*4.+sw*sw*r*.9)+vec3(.9,.95,1.)*exp(-r*r*90.)*(1.+.4*sin(uJ.z*40.))+c*.25;
  c=mix(c,tc,uJ.y);}
 if(uFz.x>0.){vec2 vq=q*vec2(uPx.y/uPx.x,1.)*vec2(.92,1.);float rim=length(vq*vec2(.9,1.3)+vec2(0.,.1))-.8;   // the visor: a tinted rim where the glass curves away, a faint line on its edge
  float gm=smoothstep(-.02,.06,rim)*uFz.x;vec2 rq=vU-q*.035*gm;vec3 bent=texture(uH,rq).rgb;
  c=mix(c,bent*vec3(.55,.62,.7),gm*.8);c+=vec3(.55,.75,1.)*exp(-abs(rim-.005)*320.)*.01*uFz.x;
  c+=vec3(.6,.8,1.)*smoothstep(.55,1.,1.-vU.y)*smoothstep(.2,.9,abs(q.x)*2.)*.012*uFz.x;}
 c*=uCE.w*(1.-dot(q,q)*1.15*uFy.z);                           // vignette
 if(uFy.w>0.){float hy=uFy.w;c=mix(c,vec3(dot(c,vec3(.3,.5,.2))),hy*.7);c*=1.-hy*smoothstep(.12,.75,length(q*vec2(1.25,1.)));c*=1.-hy*.25*(.5+.5*sin(uSun.w*4.));}   // hypoxia: colour drains, sight closes in, a slow pulse
 c=pow(aces(c),vec3(1./2.2));c=mix(c,c*c*(3.-2.*c),.55);c*=mix(vec3(.9,.98,1.1),vec3(1.),smoothstep(0.,.5,dot(c,vec3(.33))));
 c*=1.-.045*step(fract(gl_FragCoord.y/3.),.34)*uFy.x;                // faint scanlines: the view as a screen
 c+=(fract(52.9829189*fract(dot(gl_FragCoord.xy+TIME*61.,vec2(.06711056,.00583715))))-.5)*(1./160.+uFx.y*(.6-.45*dot(c,vec3(.33))));
 o=vec4(mix(c,vec3(1.,.97,.95),uCB.w),1);}`;
