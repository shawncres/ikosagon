// ================= head-up display, navigation, traffic and the text game =================
// The HUD is painted on a 2D canvas, uploaded as a texture and drawn on a plane just inside the front glass, so it
// is the same in a headset as on a flat screen. Target markers are separate quads so they track every frame.
const HUDW = 1600, HUDH = 900, HZ = -2.42;
const hudC = document.createElement('canvas'); hudC.width = HUDW; hudC.height = HUDH;
const hc = hudC.getContext('2d'), hudTex = gl.createTexture(), icoTex = gl.createTexture();
function texFrom(t, cv) {
  gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.activeTexture(gl.TEXTURE0);
}
const P_HUD = prog(HD + `layout(location=0)in vec2 aP;layout(location=1)in vec2 aU;uniform mat3 uShip;uniform vec3 uEye,uMo;uniform vec4 uR,uZ,uUV;out vec2 vU;
void main(){vec2 q=aP*uR.zw;float c=cos(uZ.y),s=sin(uZ.y);q=vec2(q.x*c-q.y*s,q.x*s+q.y*c);
 float z=uZ.x*(1.-uZ.w*(aP.x*aP.x*.36+aP.y*aP.y*.16));q.x*=1.+uZ.w*aP.y*aP.y*.06;                // the visor curves: edges wrap toward the eye
 vec3 p=uShip*(vec3(uR.xy+q,z)+uMo)-uEye;vU=mix(uUV.xy,uUV.zw,aU);gl_Position=uVP*vec4(p,1);}`,
  HD + `in vec2 vU;uniform sampler2D uTx;uniform vec4 uZ;out vec4 o;void main(){vec4 t=texture(uTx,vU);o=vec4(t.rgb*uZ.z,t.a);}`);
const hudVA = gl.createVertexArray(), visVA = gl.createVertexArray(); let visN = 0;
{ const v = [], NX = 40, NY = 20, pt = (i, j) => { const x = i / NX, y = j / NY; v.push(x * 2 - 1, y * 2 - 1, x, 1 - y); };
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { pt(i, j); pt(i + 1, j); pt(i, j + 1); pt(i + 1, j); pt(i + 1, j + 1); pt(i, j + 1); }
  gl.bindVertexArray(visVA); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW); visN = v.length / 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8); gl.bindVertexArray(null); }
{ gl.bindVertexArray(hudVA); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8); gl.bindVertexArray(null);
  const ic = document.createElement('canvas'); ic.width = 256; ic.height = 128; const c = ic.getContext('2d');
  c.strokeStyle = '#ffc266'; c.lineWidth = 5; c.lineCap = 'round';
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { c.beginPath(); c.moveTo(64 + sx * 50, 64 + sy * 22); c.lineTo(64 + sx * 50, 64 + sy * 50); c.lineTo(64 + sx * 22, 64 + sy * 50); c.stroke(); }
  c.fillStyle = '#ffc266'; c.beginPath(); c.moveTo(64, 56); c.lineTo(72, 64); c.lineTo(64, 72); c.lineTo(56, 64); c.fill();
  c.beginPath(); c.moveTo(192, 22); c.lineTo(236, 84); c.lineTo(192, 66); c.lineTo(148, 84); c.closePath(); c.fill();
  texFrom(icoTex, ic); }
{ const s = document.createElement('style'); s.textContent = '#gm{display:none!important}'; document.head.appendChild(s); }

// ---- the pilot's record: rank, standing with four factions, ship fittings, contracts, and the trail ----
const FAC = [['Meridian Combine', 'haulage, refining, and the law on the inner lanes'], ['Lantern Order', 'keepers of beacons and the old gate rites'], ['Free Haulers Union', 'independent crews, credit and grudges'], ['Deepfield Survey', 'cartographers of the Silence, and your licence']];
const RANKS = [[0, 'Drifter'], [100, 'Deckhand'], [300, 'Pilot'], [700, 'Pathfinder'], [1500, 'Wayfarer'], [3000, 'Navigator'], [6000, 'Star-warden']];
const UPS = [['eng', 'Engine tuning', 'More thrust at every throttle setting'], ['plt', 'Hull plating', 'Knocks take less out of the hull'], ['scn', 'Scanner array', 'Scan and hail from further away, faster'], ['ref', 'Refinery', 'A chance of extra yield from every mineral'], ['bay', 'Cargo bay', 'Four more slots in the hold'], ['shd', 'Shield generator', 'Stronger shields that come back faster']];
const rp = () => ST.rp || (ST.rp = { xp: 0, rep: [0, 0, 0, 0], up: { eng: 0, plt: 0, scn: 0, ref: 0 }, jobs: [], done: 0, trail: 0, seen: {}, took: {} });
const upLv = (k) => rp().up[k] || 0;
const rankName = () => { let r = RANKS[0][1]; for (const [x, n] of RANKS) if (rp().xp >= x) r = n; return r; };
const repName = (v) => v >= 60 ? 'trusted' : v >= 25 ? 'friendly' : v >= 8 ? 'known' : v > -8 ? 'neutral' : 'unwelcome';
const sameSec = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
function gain(o) {
  const r = rp();
  if (o.cr) ST.credits = Math.max(0, ST.credits + o.cr);
  if (o.xp) { const b = rankName(); r.xp += o.xp; if (rankName() !== b) tip(`You are now rated ${rankName()}`, 7000); }
  if (o.rep) { const f = o.fac == null ? SYS.fac : o.fac; r.rep[f] = Math.max(-100, Math.min(100, r.rep[f] + o.rep)); }
  if (o.hull) ST.hull = Math.max(5, Math.min(100, ST.hull + o.hull));
  if (o.min) cargo[o.min[0]] += o.min[1];
  showCargo(); save();
}
const JT = ['Deliver sealed freight', 'Fill a mineral order', 'Survey a place', 'Recover a flight recorder', 'Carry a message', 'Collect a bounty'];
function mkJob(R, k) {
  const ty = R() * 6 | 0, tn = pickN(R, RDN), nb = reach(SYS.sec), far = R() < .4 && nb.length > 0, sec = far ? nb[R() * nb.length | 0] : SYS.sec, s = far ? mkSys(sysIdAt(sec[0], sec[1], sec[2])) : SYS;
  let loc = R() * s.locs.length | 0; if (!far && loc === SYS.loc) loc = (loc + 1) % s.locs.length;
  const fac = ty === 3 ? 3 : ty === 2 ? (R() < .5 ? 1 : 3) : R() * 4 | 0, tier = 1 + (R() * 3 | 0), n = 3 + (R() * 5 | 0), here = SYS.locs[SYS.loc].name, pl = s.locs[loc].name, wh = pl + (far ? ' in ' + s.name : '');
  const base = [90, 70, 110, 160, 80, 240][ty] + (far ? 90 : 0) + (ty === 1 ? Math.round(n * TVAL[tier] * 1.5) : 0);
  const text = [`Take a sealed container to ${wh}.`, `Bring ${n} ${TIERS[tier]} back here to ${here}.`, `Go to ${wh} and scan three things there.`, `A ship went quiet at ${wh}. Find the wreck, pull its recorder and bring it back to ${here}.`, `Find any pilot at ${wh} and hail them with our message.`, `The raider ${tn} has been hitting traffic at ${wh}. Find that ship and end it.`][ty];
  return { id: mkey() + ':' + k + ':' + Math.floor(Date.now() / 864e5), ty, tn, fac, title: JT[ty], text, sec: (ty === 1 ? SYS.sec : sec).slice(), loc: ty === 1 ? SYS.loc : loc, pl: ty === 1 ? here : pl, sy: ty === 1 ? SYS.name : s.name,
    hsec: SYS.sec.slice(), hloc: SYS.loc, hpl: here, hsy: SYS.name, n, tier, got: 0, stage: 0, pay: Math.round(base * (1 + rp().rep[fac] / 200) / 10) * 10, rep: 4 + (far ? 3 : 0), xp: 30 + (far ? 25 : 0) };
}
const jobDest = (j) => j.ty === 1 ? (j.stage ? { sec: j.hsec, loc: j.hloc, pl: j.hpl, sy: j.hsy } : null) : j.ty === 3 && j.stage ? { sec: j.hsec, loc: j.hloc, pl: j.hpl, sy: j.hsy } : { sec: j.sec, loc: j.loc, pl: j.pl, sy: j.sy };
const isHere = (d) => d && sameSec(d.sec, SYS.sec) && d.loc === SYS.loc;
function jobDone(j) {
  const r = rp(); r.jobs = r.jobs.filter((x) => x !== j); r.done++;
  gain({ cr: j.pay, xp: j.xp, rep: j.rep, fac: j.fac }); tip(`Contract complete: ${j.title} · +${j.pay} credits · ${FAC[j.fac][0]} think better of you`, 9000); cue('outro');
}
let routeK = '', routeV = null;
function route(sec) {                                         // the next sector to warp to on the way to a far one
  if (sameSec(sec, SYS.sec)) return null;
  const k = SYS.sec + '>' + sec; if (k === routeK) return routeV;
  const key = (s) => s.join(','), seen = new Map([[key(SYS.sec), null]]); let q = [SYS.sec], out = null;
  for (let depth = 0; depth < 5 && q.length && !out && seen.size < 500; depth++) {
    const nq = [];
    for (const c of q) { for (const n of reach(c)) { if (seen.has(key(n))) continue; seen.set(key(n), c); if (sameSec(n, sec)) { let cur = n; while (!sameSec(seen.get(key(cur)), SYS.sec)) cur = seen.get(key(cur)); out = cur; break; } nq.push(n); } if (out) break; }
    q = nq;
  }
  routeK = k; return routeV = out;
}
// the trail: six places, fixed by the universe's seed, each holding a piece of one story
let TRAIL = null;
const LORE = ['A relay older than the Silence. One line, still live: "We went quiet on purpose. Follow, if you still listen."', 'Hull plates stacked as a cairn. Inside, a crew list from the lost survey, and coordinates in the Lantern cipher.', 'A garden pod with a working lamp. The log says the others went on ahead, and the fruit is for whoever still follows.', 'A gate frame that was never lit. Three hands annotated the plans: Combine, Order, Survey. They did not agree.', 'A listening post. For a century it recorded only its own heartbeat, and, last week, you.', 'The end of the trail: a lit window, a chair pulled out, a kettle still warm. Nobody is home. The Silence, it seems, is a door.'];
function trail() {
  if (TRAIL) return TRAIL; TRAIL = []; const R = mulberry32(MASTER ^ 0x7A11); let sec = [0, 0, 0];
  for (let i = 0; i < 6; i++) { for (let st = 1 + (R() * 2 | 0); st > 0; st--) { const nb = reach(sec); if (nb.length) sec = nb[R() * nb.length | 0]; } const s = mkSys(sysIdAt(sec[0], sec[1], sec[2])), loc = R() * s.locs.length | 0; TRAIL.push({ sec: sec.slice(), loc, pl: s.locs[loc].name, sy: s.name }); }
  return TRAIL;
}
function objective() {                                        // what to do next, and where the HUD should point
  { const eo = lifeObjective(); if (eo) return eo; }
  const r = rp(), j = r.jobs[0]; let d, pre = '';
  if (j) {
    d = jobDest(j); pre = j.title + ': ';
    if (!d) return { text: `${pre}mine ${TIERS[j.tier]} ${j.got}/${j.n}`, nav: 'rock' };
    if (isHere(d) && !j.stage) return j.ty === 2 ? { text: `${pre}scan things here ${j.got}/3 (target them and hold them ahead)`, nav: '' } : j.ty === 3 ? { text: pre + 'find the wreck signal', nav: 'wreck' } : j.ty === 4 ? { text: pre + 'target a ship and hail it', nav: 'npc' } : j.ty === 5 ? { text: `${pre}hunt down the raider ${j.tn}`, nav: 'bounty' } : { text: pre + 'arriving', nav: 'gate' };
  } else if (r.course && !sameSec(r.course, SYS.sec)) { const s = mkSys(sysIdAt(r.course[0], r.course[1], r.course[2])); d = { sec: r.course, loc: 0, pl: s.locs[0].name, sy: s.name }; pre = 'Plotted course: '; }
  else if (r.trail < 6) { d = trail()[r.trail]; pre = 'The trail: '; } else return { text: 'No contract. Traders post work on their boards.', nav: '' };
  if (isHere(d)) return { text: pre + 'you are here', nav: '' };
  if (sameSec(d.sec, SYS.sec)) { const L = SYS.locs[d.loc];
    if (L && L.atm) return SYS.atm ? { text: `${pre}climb out, then fly down to ${SYS.planets[L.atm - 1].name}`, nav: '' } : { text: `${pre}fly down to ${SYS.planets[L.atm - 1].name} (hold course on it)`, nav: 'p' + (L.atm - 1) };
    return SYS.atm ? { text: `${pre}climb out of the air, then the gate to ${d.pl}`, nav: 'settle' } : { text: `${pre}warp gate → ${d.pl}`, nav: 'gate', loc: d.loc }; }
  if (SYS.loc !== 0) return SYS.atm ? { text: `${pre}climb out, then ${SYS.locs[0].name}, on toward ${d.sy}`, nav: 'settle' } : { text: `${pre}warp gate → ${SYS.locs[0].name}, this system's gate, then on toward ${d.sy}`, nav: 'gate', loc: 0 };
  const hop = route(d.sec);
  return { text: hop ? `${pre}warp gate → ${mkSys(sysIdAt(hop[0], hop[1], hop[2])).name}, on the way to ${d.pl}, ${d.sy}` : `${pre}${d.pl}, ${d.sy} (sector ${d.sec.join(' ')}) is beyond charted routes`, nav: SYS.atm ? 'settle' : 'gate' };
}
const EV = [
  ['A hauler drifts dark off {p}. Its beacon asks, politely, for a jump-start.', [['Lend it power', 'It coughs awake. The crew send ore across and promise to speak well of you.', { min: [2, 3], rep: 6, xp: 15 }], ['Take a part for your trouble', 'Nobody is watching. Probably. The part sells well.', { cr: 140, rep: -8 }], ['Fly on', 'You leave it blinking behind you.', {}]]],
  ['A survey drone pings you near {p}: it has lost its mothership and wants to hand its data to someone.', [['Accept the data', 'Charts of {s} unroll across your screens. Someone will pay for these.', { cr: 60, xp: 30 }], ['Send it home', 'You give it a heading. It thanks you in six languages.', { rep: 4, xp: 10 }]]],
  ['An old pilot hails you over {p}, just to talk. They have been out here a long time.', [['Listen for a while', 'An hour of stories. One of them is a shortcut: your engines learn a trick.', { xp: 45 }], ['Trade news', 'You swap rumours of work. They put in a word for you.', { rep: 5, cr: 20 }], ['Make your excuses', 'They understand. Everyone is going somewhere.', {}]]],
  ['Something has shed cargo near {p}: sealed crates, tumbling, unmarked.', [['Scoop them up', 'Refined metal. No one comes asking.', { min: [3, 2], cr: 40 }], ['Report it to the local office', 'The clerk is surprised by honesty, and generous.', { rep: 9, cr: 70 }], ['Leave them', 'Not your crates.', {}]]],
  ['Static, then a voice: a prospector at {p} offers to sell you the location of a rich seam.', [['Pay 80 credits', 'The seam is real. Your hold fills faster than it ever has.', { cr: -80, min: [4, 2], xp: 20 }], ['Haggle', 'They respect it. You get the seam for a story instead.', { min: [3, 1], xp: 25 }], ['Decline', 'The channel closes with a shrug you can hear.', {}]]],
  ['A micrometeor sings off your hull as you settle in at {p}. A patrol offers to look you over.', [['Accept the inspection', 'They patch a seam you did not know had opened.', { hull: 25, rep: 3 }], ['Wave them off', 'They salute and peel away.', { xp: 5 }]]],
  ['A pod is tumbling near {p}, its lamp still pulsing. Someone is inside.', [['Bring it aboard', 'A courier, half-frozen and very grateful. Her employers are generous.', { cr: 150, rep: 8, xp: 30 }], ['Tow it to the gate', 'Gate control takes it from there, and notes your name.', { rep: 5, xp: 15 }], ['It is not your business', 'The lamp pulses on behind you for a long time.', { rep: -3 }]]],
  ['A customs cutter flags you down at {p} for a spot inspection.', [['Submit', 'Twenty minutes of politeness. They stamp your log and wave you on.', { rep: 4, xp: 10 }], ['Offer a consideration', 'The officer looks at the credits, then at you, then pockets them.', { cr: -60, xp: 5 }], ['Run', 'You are fast. They are annoyed.', { rep: -10, xp: 20 }]]],
  ['Your scanner paints a cold contact at {p}: an old probe, older than the charts.', [['Download its memory', 'Star positions from a thousand years back. A cartographer will weep.', { cr: 110, xp: 40 }], ['Salvage the casing', 'Good alloy, however old.', { min: [3, 3] }], ['Leave it sleeping', 'Some things have earned their rest.', { xp: 15 }]]],
  ['A convoy at {p} is short a wing pilot and asks if you will ride along to the gate.', [['Fly the wing', 'An hour of holding station. Dull, paid, and they remember faces.', { cr: 90, rep: 7, xp: 20 }], ['Name a higher price', 'They pay it. They do not smile.', { cr: 160, rep: -2 }], ['Decline', 'They find someone else.', {}]]],
  ['Something large passes under your keel at {p}, and your instruments sing in a key you have not heard.', [['Hold still and listen', 'It circles once and leaves a wake of bright dust. Your hold is heavier.', { min: [4, 1], xp: 35 }], ['Follow it', 'It leads you a long way, to nothing, or to the point of it.', { xp: 50 }], ['Light the engines', 'You are gone before you find out.', {}]]],
  ['A gambler on the {p} band wants to race you to the gate and back.', [['Take the bet (50)', 'You win by a length. He pays up, laughing.', { cr: 100, xp: 25 }], ['Take the bet and coast', 'He wins. He needed to more than you did.', { cr: -50, rep: 6 }], ['No bets', 'He calls you sensible. It does not sound like praise.', {}]]],
];
let ENC = null, trailPend = null;
function eventPanel() {
  const R = mulberry32(SYS.salt ^ 0xE7E), e = EV[R() * EV.length | 0], f = (s) => s.replace('{p}', SYS.locs[SYS.loc].name).replace('{s}', SYS.name);
  panel('Encounter', SYS.locs[SYS.loc].name + ' · ' + FAC[SYS.fac][0], [{ name: 'Contact', desc: f(e[0]) }].concat(e[1].map((o) => ({ name: o[0], desc: '', run: () => { gain(o[2]); panel('Encounter', SYS.locs[SYS.loc].name, [{ name: o[0], desc: f(o[1]) }, { name: 'Carry on', desc: '', run: () => {} }], 'Press a number · J to close'); } }))), 'Press a number to choose');
}
function encTick(dt) {
  if (trailPend && flying() && !jpOpen && !jumpTo) {
    trailPend.t += dt;
    const d = Math.hypot(bcn[0] - px, bcn[1] - py, bcn[2] - pz);
    if (trailPend.t > 5 && d < 1100) {
      const i = trailPend.i; trailPend = null;
      panel('The trail', `Part ${i + 1} of 6 · ${SYS.locs[SYS.loc].name}`, [{ name: 'Found', desc: LORE[i] }, { name: i < 5 ? 'Next' : 'Done', desc: i < 5 ? `It points on, to ${trail()[i + 1].pl} in ${trail()[i + 1].sy}.` : 'There is nothing further to follow. The rest is yours.' }], 'J to close');
    }
  }
  if (!ENC || ENC.open || !flying() || SYS.atm || jumpTo || jpOpen) return;
  ENC.t += dt;
  put(DGm, ENC.x - px, ENC.y - py, ENC.z - pz, 7, 0, 0, 0, .22, .95, .62, .28, 0);
  const d = Math.hypot(ENC.x - px, ENC.y - py, ENC.z - pz);
  if (ENC.t > 10 && d < 480) { ENC.open = 1; eventPanel(); }
}
function rpgArrive() {
  const r = rp(); npcSpawn(); scanned = {}; { const R = mulberry32(SYS.salt ^ 0x5702), a = R() * 6.283, d = 1800 + R() * 2600; STORM = R() < (SYS.atm === 1 ? .85 : .3 + .1 * SYS.danger) ? { x: Math.cos(a) * d, y: (R() - .5) * 900, z: Math.sin(a) * d, r: 900 + R() * 900, warned: 0 } : null; } sysInit(); scK = 0; scOut = 0; navAuto = 1; navId = ''; scanT = 0; routeK = '';
  for (const j of r.jobs.slice()) { const d = jobDest(j); if (!isHere(d)) continue; if (j.ty === 0) jobDone(j); else if (j.stage && (j.ty === 1 || j.ty === 3)) { if (j.ty === 1) cargo[j.tier] = Math.max(0, cargo[j.tier] - j.n); jobDone(j); } }
  ENC = null; trailPend = null;
  if (r.trail < 6 && isHere(trail()[r.trail])) { const i = r.trail++; gain({ xp: 80, cr: 100 }); trailPend = { i, t: 0 }; }
  else if (!SYS.atm && !r.seen[mkey()]) { r.seen[mkey()] = 1; if (mulberry32(SYS.salt ^ 0xE7)() < (typeof encRate === 'function' ? encRate() : .45)) { const R = mulberry32(SYS.salt ^ 0xE11C), a = R() * 6.283, el = (R() - .5) * .35, dist = 1600 + R() * 700, ce = Math.cos(el); ENC = { x: Math.cos(a) * ce * dist, y: Math.sin(el) * dist * .6, z: Math.sin(a) * ce * dist, t: 0, open: 0 }; } }
  save();
}
function rpgCollected(tier) {
  if (upLv('ref') && Math.random() < .2 * upLv('ref')) addItem('o' + tier, 1);
  if (wpn === 3) { const n = addItem('o' + tier, Math.random() < .35 ? 2 : 1); if (n) pop(`+${n} MINING LASER YIELD`, TCSS[tier]); }             // the mining laser cuts clean: more ore from every rock
  gain({ xp: 1 + tier });
  for (const j of rp().jobs) if (j.ty === 1 && !j.stage && tier === j.tier && ++j.got >= j.n) { j.stage = 1; tip(`Order filled: take it back to ${j.hpl}`, 6000); }
}
function boardPanel() {
  const r = rp(), R = mulberry32(SYS.salt ^ 0xB0A2D ^ Math.floor(Date.now() / 864e5)), list = [];
  for (let k = 0; k < 3; k++) { const j = mkJob(R, k); if (r.took[j.id]) continue; list.push({ name: j.title, kind: `${j.pay} cr · ${FAC[j.fac][0]}`, desc: j.text, run: () => { if (r.jobs.length >= 3) return tip('Three contracts is all your log will hold', 4000); r.took[j.id] = 1; r.jobs.push(j); save(); tip('Contract taken: ' + j.title, 4000); navAuto = 1; } }); }
  if (!list.length) list.push({ name: 'The board is empty', desc: 'New work is posted every day.' });
  for (const j of r.jobs) list.push({ name: 'Active · ' + j.title, kind: `${j.pay} cr`, desc: j.text });
  panel('Contract board', `${SYS.locs[SYS.loc].name} · ${FAC[SYS.fac][0]} (${repName(r.rep[SYS.fac])})`, list, 'Press a number to accept · J to close');
}
function outfitPanel() {
  const r = rp();
  panel('Outfitter', `You hold ${ST.credits} credits`, UPS.map(([k, n, d]) => { const lv = upLv(k), cost = 300 * 3 ** lv; return lv >= 3 ? { name: n + ' III', kind: 'fitted', desc: d } : { name: `${n} ${'I'.repeat(lv + 1)}`, kind: cost + ' cr', desc: d + (ST.credits < cost ? ' · not enough credits' : ''), run: ST.credits >= cost ? () => { ST.credits -= cost; r.up[k] = lv + 1; save(); showCargo(); tip(n + ' fitted', 4000); outfitPanel(); } : undefined }; }), 'Press a number to buy · J to close');
}
const rpgTrade = () => [{ name: 'Crew quarters', kind: `${Object.keys(rp().crew || {}).length}/3 aboard`, desc: 'Hire an engineer, a gunner, a navigator', run: crewPanel }, { name: 'Market', kind: `${holdN()}/${holdMax()} in the hold`, desc: 'Buy and sell trade goods. Prices follow what each place makes and lacks.', run: () => { closePanel(); invShow('market'); } }, { name: 'Contract board', kind: `${rp().jobs.length}/3 active`, desc: 'Deliveries, mineral orders, surveys, salvage, messages', run: boardPanel }, { name: 'Outfitter', kind: 'ship fittings', desc: 'Engine, plating, scanner, refinery', run: outfitPanel }];
function journalPanel() {
  const r = rp(), o = objective(), list = [{ name: rankName(), kind: r.xp + ' xp', desc: `${r.done} contracts done · trail ${Math.min(r.trail, 6)}/6 · fittings: ` + UPS.map(([k, n]) => n.split(' ')[0] + ' ' + upLv(k)).join(', ') }];
  { const L = ledger(); if (L) list.push({ name: 'Trade ledger', kind: holdN() + '/' + holdMax() + ' hold', desc: L }); }
  list.push({ name: 'Next', kind: '', desc: o.text });
  { const cw = rp().crew || {}, n = Object.keys(cw); if (n.length) list.push({ name: 'Crew', kind: n.length + '/3', desc: n.map((k) => `${cw[k]}, ${CREW[k][0].toLowerCase()}`).join(' · ') }); list.push({ name: 'Ship\'s log', kind: Object.keys(rp().lore || {}).length + ' entries', desc: 'Stop or slow down close to things. The log notices.' }); }
  for (const j of r.jobs) list.push({ name: j.title, kind: `${j.pay} cr · ${FAC[j.fac][0]}`, desc: j.text, run: () => { r.jobs = r.jobs.filter((x) => x !== j); gain({ rep: -3, fac: j.fac }); tip('Contract abandoned', 4000); } });
  list.push({ name: SYS.name, kind: SYS.star, desc: `${FAC[SYS.fac][0]} space · danger ${SYS.danger} · ${SYS.belt || 'mixed'} belt · economy: ${SYS.econ}${SYS.ph ? ' · in its sky: ' + ['', 'a supernova remnant', 'a planetary nebula', 'a pulsar', 'a companion star', 'a comet', 'a globular cluster'][SYS.ph] : ''} · ` + SYS.planets.filter((p) => p.type !== 'none').map((p) => `${p.name}: ${p.rare || ''} ${p.type}, ${p.orbit} AU, ${p.moons} moons${p.anomaly ? ', ' + p.anomaly : ''}${p.pop && p.pop !== 'none' ? ', ' + p.pop : ''}`).join(' · ') });
  { const ch = ST.chart || {}, ks = Object.keys(ch); if (ks.length) list.push({ name: 'First charts', kind: ks.length + ' systems', desc: ks.slice(-5).map((id) => `${ch[id].name}${ch[id].pay ? ' +' + ch[id].pay : ''}`).join(' · ') }); }
  list.push({ name: 'Standing', kind: '', desc: FAC.map((f, i) => `${f[0]}: ${repName(r.rep[i])} (${r.rep[i]})`).join(' · ') });
  list.push({ name: 'The Infinite End', kind: 'why you are out here', desc: 'The outer gates went quiet three centuries ago. The Survey calls it the Silence. You hold a pathfinder licence to go past the last reliable lane and bring the charts home. The Combine pays for them. The Lantern Order says the old rites still open a door. The kettle at the end of the trail was warm.' });
  { const arcs = Object.values(cast()).filter((c) => c.arc && !c.dead); if (arcs.length) list.push({ name: 'Oaths', kind: arcs.length + ' open', desc: arcs.slice(0, 4).map((c) => `${c.n} · ${c.arc.id} ${c.arc.done ? 'kept' : 'step ' + (c.arc.step + 1)}`).join(' · ') }); }
  { const gone = (ST.deadNames || []).slice(-4); if (gone.length) list.push({ name: 'The dead', kind: 'they do not return', desc: gone.join(' · ') }); }
  panel('Journal', SYS.locs[SYS.loc].name, list, 'Press a contract\'s number to abandon it · B or J to close');
}
const RUM = ['They say the {k} here is worth the trip.', 'Traders pay better where the {e} runs short. Not here.', 'Watch the big ships: they keep to their lanes and expect you to keep to yours.', 'If your hull is singing, the outfitter sells plating. Mine saved me twice.'];
function hailPanel(a) {
  const r = rp(), f = a.fac, list = [{ name: `${ROLE[a.role]} ${a.name}`, kind: FAC[f][0], desc: `"${call()}, ${a.name}, ${r.rep[f] >= 25 ? 'reading you five by five. Good to hear a friendly voice. Go ahead.' : r.rep[f] <= -8 ? 'receiving. Keep it brief.' : 'receiving, go ahead.'}"` }];
  const msg = r.jobs.find((j) => j.ty === 4 && !j.stage && isHere(jobDest(j)));
  if (msg) list.push({ name: 'Pass on the message', desc: 'They read it twice, and nod.', run: () => jobDone(msg) });
  list.push({ name: 'Ask for news', desc: '', run: () => { const R = mulberry32((a.seed * 1e9) | 0), t = r.trail < 6 && R() < .5 ? `"Odd signal out at ${trail()[r.trail].pl}, ${trail()[r.trail].sy}. Not ours."` : '"' + RUM[R() * RUM.length | 0].replace('{k}', SYS.locs[R() * SYS.locs.length | 0].name).replace('{e}', SYS.econ) + '"'; if (!a.told) { a.told = 1; gain({ xp: 5 }); } panel('Hail', a.name, [{ name: a.name, desc: t }], 'J to close'); } });
  let v = 0; for (let i = 1; i < 6; i++) v += cargo[i] * TVAL[i]; v = Math.round(v * .85);
  if (a.role < 2 && v) list.push({ name: 'Sell them your ore', kind: v + ' cr', desc: 'A little under the trader\'s rate, but they are right here.', run: () => { ST.credits += v; cargo.fill(0); showCargo(); save(); tip(`Sold · +${v} credits`, 4000); } });
  if (a.role < 2 && !a.px) list.push({ name: 'Ask what is selling elsewhere', desc: '', run: () => { a.px = 1; const li = (SYS.loc + 1 + (a.i % Math.max(1, SYS.locs.length - 1))) % SYS.locs.length, P = GOODS.map((_, q) => priceAt(SYS, li, q)), pm = r.px || (r.px = {}), best = P.map((p, q) => [p / GOODS[q][1], q]).sort((x, y) => y[0] - x[0])[0][1]; pm[SYS.id + ':' + li] = { n: SYS.locs[li].name, p: P, t: Date.now() }; save(); panel('Hail', a.name, [{ name: a.name, desc: `"Just came from ${SYS.locs[li].name}. ${GOODS[best][0]} was fetching ${P[best]} there. I have put their board in your ledger."` }], 'J to close'); } });
  if (!a.asked && r.jobs.length < 3) list.push({ name: 'Ask for work', desc: '', run: () => { a.asked = 1; const j = mkJob(mulberry32((a.seed * 7e8) | 0), 'h' + a.i); r.jobs.push(j); save(); navAuto = 1; panel('Hail', a.name, [{ name: j.title, kind: j.pay + ' cr', desc: '"As it happens, yes." ' + j.text }], 'J to close'); } });
  panel('Hail', `${SYS.locs[SYS.loc].name} · ${(Math.hypot(a.x - px, a.y - py, a.z - pz)) | 0} m`, list, 'Press a number · J to close');
}

// ---- traffic: every ship has somewhere to be. Haulers run between the gate and the dock, miners work a field and
// come back, patrols fly a loop in formation, couriers arrive, cross and leave by the gate, frigates keep a lane.
const NPCS = [], DAg = Dyn(40), DAgs = [DAg, Dyn(40), Dyn(40)], DAf = Dyn(6), ROLE = ['Hauler', 'Miner', 'Patrol', 'Courier', 'Frigate', 'Raider', 'Tender'];
const NPN = NM.ship, RDN = NM.raider;   // ships carry Earth names; raiders, the names they gave themselves
function nameBanned(n) { if (!n) return false; if ((ST.deadNames || []).includes(n)) return true; for (const c of Object.values(cast())) if (!c.dead && (c.n === n || c.sh === n)) return true; return false; }
function freshRaiderName(R) {
  const live = new Set(NPCS.map((a) => a.name));
  for (let i = 0; i < 28; i++) { const n = pickN(R, RDN) + ' ' + pickN(R, NM.last); if (!live.has(n) && !nameBanned(n)) return n; }
  return pickN(R, NM.first) + ' ' + pickN(R, RDN);
}
function noteKill(a) {
  if (!a || !a.name) return;
  ST.deadNames = ST.deadNames || [];
  if (!ST.deadNames.includes(a.name)) ST.deadNames.push(a.name);
  if (ST.deadNames.length > 240) ST.deadNames.splice(0, 40);
  if (a.cast && cast()[a.cast]) { const ch = cast()[a.cast]; ch.dead = 1; ch.cool = 1e15; }
  quietUntil = Math.max(quietUntil || 0, tm + (typeof v123Quiet === 'function' ? v123Quiet() : 38));
  cmT = Math.max(cmT, 190);
}
let NPT = null;
function wpOk(a) { return !!(a && a.wp && a.wp.length >= 3 && a.wp[0] != null && a.wp[1] != null && a.wp[2] != null); }
function ensureWp(a) {
  if (!a) return;
  if (wpOk(a)) return;
  try { if (NPT) npcGoal(a); } catch (e) {}
  if (!wpOk(a)) { const j = () => (Math.random() - .5) * 800; a.wp = [(a.x || 0) + j(), (a.y || 0) + j() * .3, (a.z || 0) + j()]; }
}
function leadLive(l) {
  if (!l || l.x == null) return false;
  if (typeof PL !== 'undefined' && l === PL) return true;
  if (l.dead) return false;
  return NPCS.includes(l);
}
function npcGoal(a) {
  const P = NPT, j = () => (Math.random() - .5) * 160;
  const here = () => [a.x + j() * 5, a.y + j(), a.z + j() * 5];
  a.toGate = 0;
  if (!P) { a.wp = here(); return; }
  if (a.role === 0) { a.toGate = a.st & 1; a.wp = a.toGate ? [j(), j(), j()] : [P.dock[0] + j(), P.dock[1] + j() * .5, P.dock[2] + j()]; }
  else if (a.role === 1) { const f = P.fields[(a.i || 0) % 3] || P.fields[0]; a.wp = a.st & 1 ? [P.dock[0] + j(), P.dock[1] + j(), P.dock[2] + j()] : [f[0] + j() * 2, f[1] + j() * 2, f[2] + j() * 2]; }
  else if (a.role === 2) a.wp = P.loop[(a.k || 0) % 4] || P.loop[0];
  else if (a.role === 3) { a.toGate = !(a.st & 1); a.wp = a.toGate ? [j(), j(), j()] : (P.far[(a.i || 0) % 3] || P.far[0]); }
  else if (a.role === 6) { const s = a.anchor, t = (a.k || 0) * 1.1 + (a.i || 0), orb = a.orb || 400; a.wp = s ? [s[0] + Math.cos(t) * orb, s[1] + Math.sin(t * .7) * orb * .35, s[2] + Math.sin(t) * orb] : (P.fields[(a.i || 0) % 3] || here()); }
  else if (a.role === 5) a.wp = [a.x + j() * 10, a.y + j() * 2, a.z + j() * 10];
  else { const p = (a.st & 1 ? a.A : a.B) || a.A || a.B; a.wp = (p && p.length >= 3 && p[0] != null) ? [p[0], p[1], p[2]] : here(); }
  if (!wpOk(a)) a.wp = here();
}
function npcSpawn() {
  if (typeof lifeReset === 'function') lifeReset();
  NPCS.length = 0; const R = mulberry32(SYS.salt ^ 0xA6E7), dir = () => { const a = R() * 6.283, y = R() * .6 - .3, c = Math.sqrt(1 - y * y); return [Math.cos(a) * c, y, Math.sin(a) * c]; }, mul = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
  NPT = { dock: [430, -70, 260], fields: [0, 1, 2].map(() => mul(dir(), 1600 + R() * 2200)), far: [0, 1, 2].map(() => mul(dir(), 7000)), loop: [0, 1, 2, 3].map((i) => { const a = i * 1.5708 + R(); return [Math.cos(a) * 1900, (R() - .5) * 700, Math.sin(a) * 1900]; }) };
  if (SYS.t === 3) NPT.dock = mul(dir(), 900);
  const n = Math.min(32, 12 + Math.round(SYS.a.fl * 18 + (SYS.atm ? 6 : 0))); let lead = null;
  for (let i = 0; i < n; i++) {
    const r = R(), role = r < .4 ? 0 : r < .62 ? 1 : r < .86 ? 2 : 3, d = dir(), ds = 400 + R() * 3000;
    const a = { i, role, big: 0, x: d[0] * ds, y: d[1] * ds, z: d[2] * ds, vx: 0, vy: 0, vz: 0, fx: -d[0], fy: -d[1], fz: -d[2], ux: 0, uy: 1, uz: 0, sp: [38, 30, 70, 95][role] * (.8 + R() * .4), size: [11, 9, 8, 7][role] * (.9 + R() * .3), st: R() * 2 | 0, t: 0, hold: 0, wp: null, hue: R(), seed: R(), fac: role === 2 ? SYS.fac : R() * 4 | 0, name: pickN(R, NPN), pilot: personName(R), lead: null, off: null, k: R() * 4 | 0 };
    if (role === 2) { if (lead && lead.n < 2) { lead.n++; a.lead = lead.a; a.off = [(lead.n === 1 ? -1 : 1) * 30, -4, 34]; a.hue = lead.a.hue; a.x = lead.a.x + a.off[0]; a.y = lead.a.y; a.z = lead.a.z + 30; } else lead = { a, n: 0 }; }
    npcGoal(a); ensureWp(a); NPCS.push(a);
  }
  for (let i = 0; i < 5; i++) { const d = dir(), ds = 900 + R() * 1500; NPCS.push({ i: 300 + i, role: 6, big: 0, x: d[0] * ds, y: d[1] * ds, z: d[2] * ds, vx: 0, vy: 0, vz: 0, fx: -d[0], fy: -d[1], fz: -d[2], ux: 0, uy: 1, uz: 0, sp: 42 + R() * 14, size: 4.5, st: 0, t: 0, hold: 0, wp: NPT.fields[i % 3], hue: .55, seed: R(), fac: SYS.fac, name: 'Tender ' + (i + 1), lead: null, k: i, anchor: null, orb: 380 + R() * 500 }); }   // small craft that work round the nearest station
  const nr = hostLv === 2 ? 2 + (R() * 3 | 0) : SYS.danger >= 2 ? 2 + (R() * 2 | 0) : 0;
  for (let i = 0; i < nr; i++) { const d = dir(), ds = 2500 + R() * 2500; NPCS.push({ i: 100 + i, role: 5, big: 0, x: d[0] * ds, y: d[1] * ds, z: d[2] * ds, vx: 0, vy: 0, vz: 0, fx: -d[0], fy: -d[1], fz: -d[2], ux: 0, uy: 1, uz: 0, sp: 105 + R() * 25, size: 9, st: 0, t: 0, hold: 0, wp: [0, 0, 0], hue: .02, seed: R(), fac: SYS.fac, name: freshRaiderName(R), lead: null, k: 0, hp: 1.3, cd: 1, brk: 0 }); }
  for (const j of rp().jobs) if (j.ty === 5 && !j.stage && isHere(jobDest(j))) { const d = dir(), ds = 1800 + R() * 1800; NPCS.push({ i: 200, role: 5, big: 0, x: d[0] * ds, y: d[1] * ds, z: d[2] * ds, vx: 0, vy: 0, vz: 0, fx: -d[0], fy: -d[1], fz: -d[2], ux: 0, uy: 1, uz: 0, sp: 120, size: 11, st: 0, t: 0, hold: 0, wp: [0, 0, 0], hue: .98, seed: R(), fac: SYS.fac, name: j.tn, lead: null, k: 0, hp: 3.2, cd: 1, brk: 0, bounty: j }); }
  const nb = SYS.a.fr > .1 ? 1 + (R() * 2 | 0) : R() < .35 ? 1 : 0;
  for (let i = 0; i < nb; i++) {
    const d = dir(), s = dir(), o = 1500 + R() * 1500, A = [d[0] * 9000 + s[0] * o, d[1] * 2500 + s[1] * o, d[2] * 9000 + s[2] * o], B = [-d[0] * 9000 + s[0] * o, -d[1] * 2500 + s[1] * o, -d[2] * 9000 + s[2] * o], u = R();
    const a = { i: n + i, role: 4, big: 1, x: A[0] + (B[0] - A[0]) * u, y: A[1] + (B[1] - A[1]) * u, z: A[2] + (B[2] - A[2]) * u, vx: 0, vy: 0, vz: 0, fx: -d[0], fy: 0, fz: -d[2], ux: 0, uy: 1, uz: 0, sp: 26 + R() * 10, size: 380 + R() * 420, st: 0, t: 0, hold: 0, A, B, hue: R(), seed: R(), fac: SYS.fac, name: 'ISV ' + pickN(R, NM.navy), lead: null, k: 0 };
    npcGoal(a); ensureWp(a); NPCS.push(a);
  }
  for (const a of NPCS) { const hs2 = a.big ? [3000, 2000] : a.bounty ? [240, 320] : ([[60, 40], [50, 30], [90, 80], [40, 50], 0, [150, 300], [35, 25]][a.role] || [50, 30]); a.hpM = a.hp = hs2[0]; a.shM = a.sh = hs2[1]; a.shT = -99; a.s = 0; a.var = a.role === 2 || a.role === 5 ? 2 : a.role === 3 ? 1 : (a.i || 0) & 1; ensureWp(a); }
}
const AVO = [];
let trafT = 8;
function traffic(dt) {                                       // keep a little traffic where the player is: ships drop out of warp a few km off and pass by
  trafT -= dt; if (trafT > 0 || !flying() || SYS.atm || jumpTo) return; trafT = 8 + Math.random() * 8;
  const free = NPCS.filter((a) => !a.big && !a.lead && !a.bounty && !a.esc && !a.comms && !a.escHunt && (a.role === 0 || a.role === 1 || a.role === 3));
  const near = NPCS.filter((a) => !a.big && Math.hypot(a.x - px, a.y - py, a.z - pz) < 2600).length; if (near >= 4 || !free.length) return;
  free.sort((p, q) => Math.hypot(q.x - px, q.y - py, q.z - pz) - Math.hypot(p.x - px, p.y - py, p.z - pz));
  const a = free[0]; if (Math.hypot(a.x - px, a.y - py, a.z - pz) < 4000) return;
  const g = Math.random() * 6.283, el = (Math.random() - .5) * .5, ds = 2000 + Math.random() * 1200, ce = Math.cos(el);
  const ox = Math.cos(g) * ce, oy = Math.sin(el), oz = Math.sin(g) * ce, side = (Math.random() < .5 ? -1 : 1) * (220 + Math.random() * 380);
  a.x = px + ox * ds; a.y = py + oy * ds; a.z = pz + oz * ds; a.vx = a.vy = a.vz = 0; a.s = a.sp * .8; a.hold = 0;
  a.wp = [px - ox * ds + oz * side, py - oy * ds * .5, pz - oz * ds - ox * side]; a.fx = -ox; a.fy = -oy; a.fz = -oz;
  fxAdd(a.x, a.y, a.z, 40, .5, .8, 1);
  const known = Object.values(cast()).filter((c) => c.met > 0 && c.rel > -20 && sameSec(c.home, SYS.sec));          // now and then it's someone you know
  if (known.length && Math.random() < .3 && !CM) { const ch = known[Math.random() * known.length | 0]; a.name = ch.sh; a.pilot = ch.n; a.cast = ch.id; ch.met++; ch.t = Date.now();
    comm(`${ch.n}, ${ch.sh}: "${ch.rel >= 15 ? `That you, ${call()}? Passing your port side. Drinks are on me next time.` : `${call()}, ${ch.n} here, passing through. Fly safe.`}"`); }
  else if (Math.random() < .5) comm(pickL([`${a.name} out of warp, passing through. Fly safe, ${call()}.`, `${ctl()}, ${a.name}${a.pilot ? ', ' + a.pilot + ' flying' : ''}, inbound from the lanes.`, `${a.name} to anyone listening: quiet run so far. Long may it last.`]));
}
function npcTick(dt) {
  traffic(dt); lifeTick(dt);
  for (const q of DAgs) q.n = 0; DAf.n = 0; if (!AVO.length) AVO.push([LH, hugeAt], [LB, bigAt]);
  const fire = flying() && (K.Space || mFire || tFire || xFire);
  for (let n = NPCS.length - 1; n >= 0; n--) {                 // every round in flight is tested against every hull it could reach this frame
    const a = NPCS[n], qd = Math.hypot(a.x - px, a.y - py, a.z - pz); if (qd > 3200) continue; const rr = a.big ? a.size * .45 : a.size * 1.4;
    for (let b = 0; b < NBU; b++) { if (bL[b] <= 0) continue; const o = b * 3, ex = bX[o] - a.x, ey = bX[o + 1] - a.y, ez = bX[o + 2] - a.z, bx2 = bV[o], by2 = bV[o + 1], bz2 = bV[o + 2], tt = Math.max(-dt, Math.min(0, -(ex * bx2 + ey * by2 + ez * bz2) / (bx2 * bx2 + by2 * by2 + bz2 * bz2))), cx = ex + bx2 * tt, cy = ey + by2 * tt, cz = ez + bz2 * tt;
      if (cx * cx + cy * cy + cz * cz > rr * rr) continue; bL[b] = 0; npcHit(a, [9, 6, 45, 1.2, 0][bW[b]] * (crew('gun') ? 1.3 : 1), qd, a.x + cx, a.y + cy, a.z + cz, bW[b]); if (a.dead) break; }
    if (a.dead) NPCS.splice(n, 1);
  }
  const calmP = fC(px, py, pz);
  for (let n = NPCS.length - 1; n >= 0; n--) {                 // raiders hunt
    const a = NPCS[n]; if (a.big || a.lead) continue;
    const qx = a.x - px, qy = a.y - py, qz = a.z - pz, qd = Math.hypot(qx, qy, qz) || 1;
    if (!a.greet && qd < 420 && flying()) { a.greet = 1; comm(a.role === 5 ? `${a.name} on open band: "${call()}, cut your engines and we keep this short."` : `${call()}, ${a.name}, we have you visual at ${Math.round(qd / 10) * 10} metres. ${a.role === 1 ? 'Cutting in progress, keep clear of the beam.' : a.role === 2 ? 'Patrol on station. Fly safe.' : 'Passing port to port.'}`); if (navAuto) { navId = 'n' + a.i; navT = 0; } }
    if (a.role === 1 && a.hold && !(a.st & 1)) for (let k = 1; k < 9; k++) { const f = k / 9 * 130, w = .5 + .5 * Math.sin(tm * 40 + k); put(DPa, qx + a.fx * f, qy + a.fy * f - k * 1.5, qz + a.fz * f, 2.2 + w * 1.5 + (k === 8 ? 7 : 0), 0, 0, 0, k * .11, 1, .32, .1, 0); }
    if (a.role === 2) { let en = null, ed = 3500; for (const b of NPCS) if (b.role === 5) { const e = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); if (e < ed) { ed = e; en = b; } }
      if (en) { a.hold = 0; a.wp = [en.x, en.y, en.z]; if (ed < 700) { const u = (tm * 2.2 + a.seed) % 1; for (let k = 0; k < 3; k++) { const f = (u + k / 3) % 1; put(DPa, qx + (en.x - a.x) * f, qy + (en.y - a.y) * f, qz + (en.z - a.z) * f, 3.5, 0, 0, 0, k * .3, .3, .8, 1, 0); } { const q = dt * 14, t = Math.min(en.sh, q); en.sh -= t; en.hp -= q - t; en.shT = tm; } en.brk = 2; if (en.hp <= 0) { fxAdd(en.x, en.y, en.z, 60, 1, .6, .3); en.dead = 1; navT = 0; } } } }
    if (a.role === 2 && wantedT > 0) { a.hold = 0; a.wp = [px + vx * .6, py + vy * .6, pz + vz * .6]; a.cd = (a.cd || 0) - dt; if (flying() && qd < 520 && a.cd <= 0 && -(a.fx * qx + a.fy * qy + a.fz * qz) / qd > .97) { a.cd = .5; hurtSrc = 'raider'; hurtSrcT = tm; hitFromX = a.x; hitFromY = a.y; hitFromZ = a.z; hurt(1.2); trauma = Math.min(1, trauma + .15); thud(.2); } }
    if (a.dead) { NPCS.splice(n, 1); continue; }
    if (a.role === 5) {
      if (a.fled) continue;
      if (a.escHunt && escHunt(a, dt)) continue;
      const hunt = a.hunter || a.bounty || calmP < .5 && (hostLv === 2 || hostLv === 1 && SYS.danger >= 3);   // in open space raiders lose interest
      if (!hunt) { a.brk -= dt; if (a.brk <= 0) { let en = null, ed = 4000; for (const b of NPCS) if (b.role === 2) { const e = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); if (e < ed) { ed = e; en = b; } } if (en) { a.wp = [en.x, en.y, en.z]; if (ed < 600) { const u = (tm * 2 + a.seed) % 1; put(DPa, qx + (en.x - a.x) * u, qy + (en.y - a.y) * u, qz + (en.z - a.z) * u, 3.5, 0, 0, 0, .5, 1, .3, .15, 0); } if (ed < 120) { a.brk = 3; const j = () => (Math.random() - .5) * 2500; a.wp = [a.x + j(), a.y + j() * .3, a.z + j()]; } } } }
      else v121Dog(a, dt, qx, qy, qz, qd);
    }

  }
  for (const a of NPCS) { if (a.big) continue; const ex = a.x - px, ey = a.y - py, ez = a.z - pz, ed = Math.hypot(ex, ey, ez); if (ed < 350 || ed > 7000) continue;
    const bl = .6 + .4 * Math.sin(tm * 3 + a.i), s = ed * .0026, c = a.role === 5 ? [1.4, .25, .2] : a.role === 2 ? [.4, .9, 1.4] : [1.2, 1, .7];
    put(DPa, ex, ey, ez, s, 0, 0, 0, .3, c[0] * bl * .35, c[1] * bl * .35, c[2] * bl * .35, 0); }
  for (const a of NPCS) {
    let tx, ty, tz, lv = 0; const arr = a.big ? 1200 : 150;
    let l = a.lead;
    try {
    if (l && !leadLive(l)) { a.lead = null; l = null; ensureWp(a); }
    if (l) { const off = a.off || [0, 0, 0]; const rx = l.fy * l.uz - l.fz * l.uy, ry = l.fz * l.ux - l.fx * l.uz, rz = l.fx * l.uy - l.fy * l.ux; lv = Math.hypot(l.vx || 0, l.vy || 0, l.vz || 0);
      tx = l.x + rx * off[0] + (l.ux || 0) * off[1] - l.fx * off[2] + (l.vx || 0) * .6; ty = l.y + ry * off[0] + (l.uy || 1) * off[1] - l.fy * off[2] + (l.vy || 0) * .6; tz = l.z + rz * off[0] + (l.uz || 0) * off[1] - l.fz * off[2] + (l.vz || 0) * .6;
    } else { ensureWp(a); tx = a.wp[0]; ty = a.wp[1]; tz = a.wp[2]; }
    const dx = tx - a.x, dy = ty - a.y, dz = tz - a.z, d = Math.hypot(dx, dy, dz) || 1;
    const sp = a.hold ? 0 : l ? Math.min(a.sp * 1.5, lv + d * .9) : a.sp * Math.min(1, .15 + d / arr);
    let ax = dx / d * sp - a.vx, ay = dy / d * sp - a.vy, az = dz / d * sp - a.vz;
    if (!a.big) {
      const lx = a.x + a.vx * 2.5, ly = a.y + a.vy * 2.5, lz = a.z + a.vz * 2.5;
      for (const [L, at] of AVO) {                           // look ahead: is there a rock where we will be?
        const C = L.C, cx = Math.floor(lx / C), cy = Math.floor(ly / C), cz = Math.floor(lz / C), s = at(C, cx, cy, cz); if (!s) continue;
        const ox = lx - (cx + gj0) * C, oy = ly - (cy + gj1) * C, oz = lz - (cz + gj2) * C, od = Math.hypot(ox, oy, oz) || 1;
        if (od < s * 1.3 + 25) { const k = a.sp * 1.8 / od; ax += ox * k; ay += oy * k; az += oz * k; }
      }
      const qx = a.x - px, qy = a.y - py, qz = a.z - pz, qd = Math.hypot(qx, qy, qz) || 1; if (qd < 80) { const k = (80 - qd) * 1.2 / qd; ax += qx * k; ay += qy * k; az += qz * k; }
      for (const b of NPCS) { if (b === a) continue; const ex = a.x - b.x, ey = a.y - b.y, ez = a.z - b.z, r = b.big ? b.size * .8 : 26, e2 = ex * ex + ey * ey + ez * ez; if (e2 < r * r && e2 > .01) { const e = Math.sqrt(e2), k = (r - e) * (b.big ? 3 : 1.5) / e; ax += ex * k; ay += ey * k; az += ez * k; } }
    }
    { const wx = a.vx + ax, wy = a.vy + ay, wz = a.vz + az, wl = Math.hypot(wx, wy, wz) || 1, nx = wx / wl, ny = wy / wl, nz = wz / wl;
      const dot = a.fx * nx + a.fy * ny + a.fz * nz, ang = Math.acos(Math.max(-1, Math.min(1, dot))), mt = (a.big ? .05 : a.role === 0 ? .32 : a.role === 4 ? .14 : a.role === 1 ? .42 : a.role === 5 || a.role === 2 ? 1.35 : a.role === 3 ? .95 : .75) * dt, k = wl < 1.5 ? 0 : Math.min(1, mt / Math.max(ang, 1e-4));
      const bank = Math.max(-1, Math.min(1, ((nx - a.fx) * -a.fz + (nz - a.fz) * a.fx) * 2.4)) * (a.big ? .12 : 1);
      a.fx += (nx - a.fx) * k; a.fy += (ny - a.fy) * k; a.fz += (nz - a.fz) * k; const fl = Math.hypot(a.fx, a.fy, a.fz) || 1; a.fx /= fl; a.fy /= fl; a.fz /= fl;
      const want = Math.min(wl, a.sp * 1.6) * (dot < .3 ? .35 : 1), ds = want - a.s; a.s += Math.max(-a.sp * .9 * dt, Math.min(a.sp * (a.big ? .15 : .45) * dt, ds));
      { const mass = a.big ? 6.5 : a.role === 0 ? 3.2 : a.role === 4 ? 5 : a.role === 1 ? 2.3 : 1.15, ak = Math.min(1, dt * (3.1 / mass));
        const tvx = a.fx * a.s, tvy = a.fy * a.s, tvz = a.fz * a.s, dvx = tvx - a.vx, dvy = tvy - a.vy, dvz = tvz - a.vz;
        a.vx += dvx * ak; a.vy += dvy * ak; a.vz += dvz * ak;
        if (!a.big && dvx * dvx + dvy * dvy + dvz * dvz > 280 && (a._rcs || 0) < tm) { a._rcs = tm + .42; put(DPa, a.x - px - a.fx * a.size * .4, a.y - py, a.z - pz - a.fz * a.size * .4, Math.max(.4, a.size * .12), 0, 0, 0, .15, .45, .62, .85, 0); } }
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      const k2 = Math.min(1, dt * 2.5); a.ux += (-a.fz * bank * .9 - a.ux) * k2; a.uy += (1 - a.uy) * k2; a.uz += (a.fx * bank * .9 - a.uz) * k2;
      if (tm - a.shT > 5) a.sh = Math.min(a.shM, a.sh + dt * a.shM * .12); }
    if (!l) {
      if (a.hold) { a.t -= dt; if (a.t <= 0) { a.hold = 0; a.st++; a.k++; npcGoal(a); } }
      else if (d < arr * .6) {
        if (a.toGate) { if (Math.random() < .5) comm(`${ctl()}, ${a.name}, entering the gate. Good day.`); fxAdd(a.x, a.y, a.z, 45, .5, .8, 1); const g = NPT.far[(a.i + a.st) % 3], s2 = .85 + Math.random() * .1; a.x = g[0] * s2; a.y = g[1] * s2; a.z = g[2] * s2; a.vx = a.vy = a.vz = 0; a.st++; npcGoal(a); }   // gone through the gate; another comes in from the deep
        else if (a.big) { fxAdd(a.x, a.y, a.z, a.size * 1.6, .6, .85, 1); const o = a.st & 1 ? a.B : a.A; a.x = o[0]; a.y = o[1]; a.z = o[2]; a.vx = a.vy = a.vz = 0; fxAdd(a.x, a.y, a.z, a.size * 1.6, .6, .85, 1); a.st++; npcGoal(a); if (flying()) tip(`${a.name} has jumped out; another frigate is inbound`, 3500); }
        else if (a.role === 2 || a.role === 6) { a.st++; a.k++; if (a.role === 6 && !a.anchor) { const r = nearInst(RV[0], LR); if (r[0] < 8000 * 8000) a.anchor = [px + r[1], py + r[2], pz + r[3]]; } npcGoal(a); }
        else { a.hold = 1; a.t = a.role === 1 && !(a.st & 1) ? 15 + Math.random() * 25 : 5 + Math.random() * 10; }
      }
    }
    if (a.s > 4) { const L2 = Math.min(a.big ? 900 : 60, a.s * (a.big ? 9 : .9)), w = a.big ? a.size * .03 : a.size * .05, k = Math.min(1, a.s / a.sp), bx3 = a.x - px - a.fx * a.size * .92, by3 = a.y - py - a.fy * a.size * .92, bz3 = a.z - pz - a.fz * a.size * .92; put(DT, bx3 - a.fx * L2 * .5, by3 - a.fy * L2 * .5, bz3 - a.fz * L2 * .5, w, -a.fx * L2, -a.fy * L2, -a.fz * L2, 0, (a.role === 5 ? 2.4 : .5) * k, (a.role === 5 ? .7 : 1.3) * k, (a.role === 5 ? .3 : 2.6) * k, 0); }   // a line of light behind the drives, longer the faster it goes
    put(a.big ? DAf : DAgs[(a.var || 0) % 3], a.x - px, a.y - py, a.z - pz, a.size, a.fx, a.fy, a.fz, a.seed, a.ux, a.uy, a.uz, a.hue);
    } catch (e) { console.error('npc', a && a.name, e); a.lead = null; ensureWp(a); }
  }
  for (const j of rp().jobs) if (j.ty === 3 && !j.stage && isHere(jobDest(j))) { const w = wreckAt(j); put(DAf, w[0] - px, w[1] - py, w[2] - pz, 46, .6, .3, .7, .37, .5, .8, .2, .08); put(DPa, w[0] - px, w[1] - py, w[2] - pz, 18, 0, 0, 0, .3, .9, .45, .12, 0); }
  for (const q of DAgs) flush(q); flush(DAf);
}

// ---- navigation: what can be pointed at here, which one is selected, scanning ----
let NAV = [], navId = '', navAuto = 1, navT = 0, scanT = 0, scanned = {}, psel = 0, hudTipS = '', hudTipT = 0, hudLast = 0, obj = { text: '', nav: '' };
const wreckAt = (j) => { const R = mulberry32(SYS.salt ^ (j.pay * 977 + j.n * 31)), a = R() * 6.283, y = R() * .5 - .25, c = Math.sqrt(1 - y * y), d = 1500 + R() * 2500; return [Math.cos(a) * c * d, y * d, Math.sin(a) * c * d]; };
const scanR = () => 1500 * (1 + .5 * upLv('scn')) * (crew('nav') ? 1.3 : 1) * (typeof shipMul === 'function' ? shipMul('sc') : 1);
function navBuild() {
  const N = SYS.atm ? [] : [{ id: 'gate', name: 'WARP GATE', kind: 'gate', x: 0, y: 0, z: 0 }];
  if (trader) N.push({ id: 'trader', name: 'TRADER', kind: 'dock', x: 430, y: -70, z: 260 });
  if (!ST.found[mkey()]) N.push({ id: 'signal', name: 'UNKNOWN SIGNAL', kind: 'signal', x: bcn[0], y: bcn[1], z: bcn[2] });
  for (const j of rp().jobs) if (j.ty === 3 && !j.stage && isHere(jobDest(j))) { const w = wreckAt(j); N.push({ id: 'wreck', name: 'WRECK SIGNAL', kind: 'wreck', x: w[0], y: w[1], z: w[2], job: j }); }
  { const L = LG, D = L.d; let best = 1e9, bx = 0, by = 0, bz = 0;                                    // the nearest geode: a rich rock worth the trip
    for (let i = 0; i < L.n; i++) { const o = i * F, w = (v, m) => ((v - m + L.N * 1.5) % L.N) - L.N * .5, x = (w(D[o], L.mx) + D[o + 4]) * L.C - L.fx, y = (w(D[o + 1], L.my) + D[o + 5]) * L.C - L.fy, z = (w(D[o + 2], L.mz) + D[o + 6]) * L.C - L.fz, d = x * x + y * y + z * z; if (d < best) { best = d; bx = x; by = y; bz = z; } }
    if (best < 1e9) N.push({ id: 'rock', name: 'RICH ROCK', kind: 'rock', x: px + bx, y: py + by, z: pz + bz }); }
  const near = NPCS.map((a) => [(a.x - px) ** 2 + (a.y - py) ** 2 + (a.z - pz) ** 2, a]).sort((p, q) => p[0] - q[0]).slice(0, 5);
  for (const [, a] of near) N.push({ id: 'n' + a.i, name: (ROLE[a.role] + ' ' + a.name).toUpperCase(), kind: 'ship', x: a.x, y: a.y, z: a.z, npc: a });
  for (let k = 0; k < 3; k++) if (!SYS.atm && SYS.pr[k] > 0) N.push({ id: 'p' + k, name: SYS.planets[k].name.toUpperCase(), kind: 'planet', far: 1, x: px + SYS.pl[k * 4] * 4e6, y: py + SYS.pl[k * 4 + 1] * 4e6, z: pz + SYS.pl[k * 4 + 2] * 4e6 });
  if (STORM) N.push({ id: 'storm', name: 'ION STORM', kind: 'storm', x: STORM.x, y: STORM.y, z: STORM.z });
  if (SYS.atm) N.push({ id: 'settle', name: SYS.atm === 1 ? 'CLOUD HARVESTER' : SYS.atm === 2 ? 'SETTLEMENT' : 'ICE STATION', kind: 'settle', x: 2600, y: -1400, z: 2600 });
  if (ESC || CM) for (const a of NPCS) if ((a.esc || a.escHunt || a.comms || a.hunter) && !a.dead && !N.some((n) => n.npc === a)) N.push({ id: 'n' + a.i, name: ((a.role === 5 ? 'RAIDER ' : a.esc ? 'CONVOY ' : '') + a.name).toUpperCase(), kind: 'ship', x: a.x, y: a.y, z: a.z, npc: a });
  { const b = NPCS.find((a) => a.bounty); if (b && !N.some((n) => n.npc === b)) N.push({ id: 'n' + b.i, name: ('RAIDER ' + b.name).toUpperCase(), kind: 'ship', x: b.x, y: b.y, z: b.z, npc: b }); }
  lifeScan(N); [[RV[0], 'RING STATION'], [RV[1], 'SPIRE STATION'], [RV[2], 'HUB STATION'], [RV[3], 'SHIPYARD']].forEach(([L, nm], i) => { const r = nearInst(L, LR); if (r[0] < 9000 * 9000) N.push({ id: 'stn' + i, name: nm, kind: 'station', x: px + r[1], y: py + r[2], z: pz + r[3] }); });
  ['MENDER SWARM', 'SIPHON SWARM', 'SPARK SWARM'].forEach((nm, k) => { const r = swN[k]; if (r && r[0] < 6000 * 6000) N.push({ id: 'sw' + k, name: nm, kind: 'swarm', x: px + r[1], y: py + r[2], z: pz + r[3] }); });
  NAV = N; obj = objective();
  { const lowK = ST.hull < 30 ? 0 : ST.fuel < 20 ? 1 : ST.wen < 12 ? 2 : -1; if (lowK >= 0 && navAuto && N.some((n) => n.id === 'sw' + lowK)) { obj = { ...obj, nav: 'sw' + lowK }; } }
  const homeNav = SYS.atm ? 'settle' : 'gate';
  if (navAuto) { const want = obj.nav === 'npc' ? (N.find((n) => n.npc) || {}).id : obj.nav === 'bounty' ? (N.find((n) => n.npc && n.npc.bounty) || {}).id : obj.nav; navId = N.some((n) => n.id === want) ? want : homeNav; }
  else if (!N.some((n) => n.id === navId)) navId = homeNav;
}
const navCur = () => { for (const n of NAV) if (n.id === navId) { if (n.npc) { n.x = n.npc.x; n.y = n.npc.y; n.z = n.npc.z; } return n; } return NAV[0]; };
let atK = '', atT = 0, manT = -99;
function autoTarget(dt) {                                    // hold something roughly ahead for a moment and it becomes the target
  if (jpOpen || tm - manT < 6 || (Math.hypot(vx, vy, vz) < 15 && bst < .2)) { atT = 0; return; }
  const dirTo = (n) => { const x = (n.npc ? n.npc.x : n.x) - px, y = (n.npc ? n.npc.y : n.y) - py, z = (n.npc ? n.npc.z : n.z) - pz, d = Math.hypot(x, y, z) || 1; return (x * sFx + y * sFy + z * sFz) / d; };
  const cone = (n) => Math.cos(n.kind === 'planet' ? Math.max(.17, SYS.pl[+n.id[1] * 4 + 3] * 1.3) : .17);
  let best = null, bc = 0; for (const n of NAV) { if (n.id === navId) continue; const cs = dirTo(n); if (cs > cone(n) && cs > bc) { bc = cs; best = n; } }
  const cur = navCur(); if (best && cur && dirTo(cur) > Math.max(bc, cone(cur))) best = null;   // the current target is ahead and nearer the centre: keep it
  if (!best) { atT = 0; atK = ''; return; }
  if (best.id !== atK) { atK = best.id; atT = 0; } atT += dt;
  if (atT > 3) { navId = best.id; navAuto = 0; atT = 0; scanT = 0; tip('Target: ' + best.name, 2500); }
}
function navCycle(s) { manT = tm; if (!NAV.length) return; let i = NAV.findIndex((n) => n.id === navId); i = (i + s + NAV.length) % NAV.length; navId = NAV[i].id; navAuto = 0; scanT = 0; tip('Target: ' + NAV[i].name, 2500); }
function interact() {
  if (jpOpen) return pick(psel);
  if (CM && CM.ph === 'offer') return cmAccept();   // answering a pilot alongside
  const c = navCur(), dd = (n) => Math.hypot(n.x - px, n.y - py, n.z - pz);
  if (c) { if (c.npc && dd(c) < scanR()) return hailPanel(c.npc); if (c.id === 'trader' && dd(c) < 900) return tradePanel(); if (c.id === 'gate' && dd(c) < 2600) return gatePanel();
    if (!c.npc && c.id !== 'trader') return hailThing(c, dd(c)); }
  if (trader && Math.hypot(430 - px, -70 - py, 260 - pz) < 900) return tradePanel();
  if (gateDist() < 2600) return gatePanel();
  const s = NAV.find((n) => n.npc && dd(n) < scanR()); if (s) return hailPanel(s.npc);
  tip(c ? `${c.name} is ${(dd(c) / 1000).toFixed(1)} km away: too far to raise` : 'Nothing in range', 4000);
}
function navTick(dt, fly) {
  navT -= dt; if (navT <= 0) { navT = .4; navBuild(); }
  if (!fly) return;
  autoTarget(dt);
  const c = navCur(); if (!c) return;
  const dx = c.x - px, dy = c.y - py, dz = c.z - pz, d = Math.hypot(dx, dy, dz) || 1, al = (dx * sFx + dy * sFy + dz * sFz) / d;
  if (c.id === 'wreck' && d < 130) { c.job.stage = 1; save(); tip(`Recorder aboard. Take it back to ${c.job.hpl}.`, 7000); navT = 0; navAuto = 1; }
  lingerTick(dt);
  if (!scanned[c.id] && c.id !== 'gate' && d < scanR() && al > .96) {
    scanT += dt * (1 + .4 * upLv('scn'));
    if (scanT > 1.6) { scanned[c.id] = 1; scanT = 0; gain({ xp: 4 }); tip('Scanned: ' + c.name + (c.npc ? ` · ${FAC[c.npc.fac][0]}` : ''), 3500); for (const j of rp().jobs) if (j.ty === 2 && isHere(jobDest(j)) && ++j.got >= 3) jobDone(j); }
  } else scanT = Math.max(0, scanT - dt);
}
function rpgSim(dt, fly) { encTick(dt); mslTick(dt); chatter(dt, fly); if (fly && crew('eng') && ST.hull < 100 && tm - shHit > 8) ST.hull = Math.min(100, ST.hull + dt * .25); if (wantedT > 0) { wantedT -= dt; if (wantedT <= 0) tip('The patrols have stood down. They will not forget.', 5000); } npcTick(dt); meteorTick(dt, fly); flareTick(dt, fly); if (!radioAir() && (!rdList || !CFG.radio)) playlistTick(dt, fly); fxTick(dt); droneTick(dt, fly); navTick(dt, fly); cruiseTick(dt, fly); stormTick(dt, fly); if (tm - shHit > 4) shield = Math.min(shMax(), shield + dt * (9 + 5 * upLv('shd'))); }

// ---- controllers in a headset: everything that has a key has a button ----
let hudForce = 0;
const xprev = { left: [], right: [] }, xNav = { left: 0, right: 0 };   // per hand: when the stick may next step the menu (0 = centred, ready)
function xrEdge(gp, h) {
  const pv = xprev[h];
  const down = (i) => { const b = gp.buttons[i]; return !!(b && (b.pressed || (i === 0 && b.value > .65))); };
  return (i) => { const p = down(i), r = p && !pv[i]; pv[i] = p; return r; };
}
let xrFace = { l4: 0, l5: 0, r4: 0, r5: 0, l3: 0 }, xrPauseHold = 0, xrStickHold = 0;
function xrDown(gp, i) {
  const b = gp.buttons[i];
  if (!b) return false;
  if (i === 6) return false;
  if (i === 4 || i === 5) return !!(b.pressed || b.value > .65);
  return !!(b.pressed || (i === 0 && b.value > .65));
}
function xrPad(src, gp) {
  // meta-quest-touch-plus, xr-standard: 0 trigger, 1 grip, 3 stick click, 4 X/A, 5 Y/B.
  // Button 6 is the thumbrest. Button 7 is the left menu on the profile, and Quest often never reports it.
  const h = src.handedness === 'left' ? 'left' : src.handedness === 'right' ? 'right' : '';
  if (!h) return 0;
  const pv = xprev[h];
  const edge = (i) => { const p = xrDown(gp, i), r = p && !pv[i]; pv[i] = p; return r; };
  if (h === 'left') { xrFace.l4 = xrDown(gp, 4); xrFace.l5 = xrDown(gp, 5); xrFace.l3 = xrDown(gp, 3); }
  else { xrFace.r4 = xrDown(gp, 4); xrFace.r5 = xrDown(gp, 5); }
  const steerLeft = !CFG.vrHand, menuHand = steerLeft ? 'right' : 'left';
  const menuEdge = h === 'left' && gp.buttons.length > 7 && edge(7);
  if (jpOpen) {
    if (h !== menuHand) { if (edge(5) || menuEdge) closePanel(); return 0; }
    const ay = gp.axes[3] || 0, now = performance.now();
    if (Math.abs(ay) > .65) { if (items.length && (xNav[h] === 0 || now >= xNav[h])) { const first = xNav[h] === 0; psel = (psel + (ay > 0 ? 1 : -1) + items.length) % items.length; xNav[h] = now + (first ? 480 : 220); } } else if (Math.abs(ay) < .3) xNav[h] = 0;
    if (edge(0) || edge(4)) pick(psel); else if (edge(5) || menuEdge) closePanel();
    return 1;
  }
  if (menuEdge) pausePanel();
  if (h === 'right') { if (edge(4)) interact(); if (edge(5)) navCycle(1); }
  else { if (edge(4)) journalPanel(); if (edge(5)) wpnCycle(); }
  if (h === (CFG.vrHand ? 'left' : 'right') && edge(3)) thr = 0;
  return 0;
}
function xrPauseWatch(dt) {
  if (!xr || !flying()) { xrPauseHold = 0; xrStickHold = 0; return; }
  const both = xrFace.l5 && xrFace.r5;
  xrPauseHold = both ? xrPauseHold + dt : 0;
  xrStickHold = xrFace.l3 ? xrStickHold + dt : 0;
  if (!jpOpen && (xrPauseHold > .42 || xrStickHold > .62)) {
    xrPauseHold = 0; xrStickHold = 0; pausePanel();
  }
}

// ---- painting the HUD ----
function hudPaint() {
  const c = hc, W = HUDW, [main, dim, amb, cy] = HCOL[CFG.hud][1], red = '#ff5d4f';
  c.clearRect(0, 0, W, HUDH); c.lineCap = 'butt';
  const T = (s, x, y, sz, al = 'left', col = main, w = 600) => gText(c, s, x, y, sz, al, col, w);
  const line = (pts, col = dim, lw = 2) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); };
  const tag = (s, x, y, al) => { const w = gW(s, 17) + 22, x0 = al === 'right' ? x - w : x; line([[x0, y - 19], [x0 + w, y - 19], [x0 + w, y + 5], [x0 + 8, y + 5], [x0, y - 3], [x0, y - 19]], main, 1.5); T(s, x0 + 11, y, 17, 'left', main, 700); line(al === 'right' ? [[x0 + w, y + 5], [x0 + w, y + 62], [x0 + w - 60, y + 62]] : [[x0, y + 5], [x0, y + 62], [x0 + 60, y + 62]], dim, 1.5); };
  const bar = (x, y, w, f, col) => { c.fillStyle = 'rgba(160,210,240,.22)'; c.fillRect(x, y, w, 7); c.fillStyle = col; c.fillRect(x, y, w * Math.max(0, Math.min(1, f)), 7); };
  const spd = Math.hypot(vx, vy, vz), hull = ST.hull, cur = navCur();
  const nar = !xr && W / H < 1.05, OX = 300, LX = nar ? 300 : 0, RX = nar ? 300 : 600, at = (o) => c.setTransform(1, 0, 0, 1, o, 0);
  at(OX);
  line([[120, 30], [170, 104], [830, 104], [880, 30]]);
  T('SHLD', 178, 63, 12, 'left', dim, 700); bar(232, 55, 190, shield / shMax(), tm - shHit < .55 ? '#ffffff' : cy);
  T('HULL', 178, 48, 15, 'left', dim, 700); bar(232, 38, 190, hull / 100, tm - hullHitT < .45 || gFlash[0] > .5 ? '#ffffff' : hull < 35 ? red : '#d2d4d8'); T((hull | 0) + '%', 430, 48, 15, 'left', tm - hullHitT < .45 ? '#ffffff' : hull < 35 ? red : '#d2d4d8');
  { const o2 = ST.o2 == null ? 100 : ST.o2, lo = o2 < 15, bl = lo && (tm * 3 | 0) % 2; T('O2', 178, 78, 12, 'left', lo ? red : dim, 700); bar(232, 70, 190, o2 / 100, bl ? '#ffffff' : lo ? red : '#7fd8ff'); if (SYS.atm && o2 < 100) T('REFILLING', 430, 78, 11, 'left', '#7fd8ff', 700); }
 if (wantedT > 0) T('WANTED  ' + Math.ceil(wantedT), 500, 228, 17, 'center', red, 700);
  T('THR', 822, 56, 15, 'right', dim, 700); bar(580, 46, 190, Math.abs(thr), thr < 0 ? red : bst > .3 ? amb : main); T(Math.round(thr * 100) + '%', 572, 56, 15, 'right', main);
  { const fu = ST.fuel == null ? 100 : ST.fuel, we = ST.wen == null ? 100 : ST.wen, spc = ST.spice || 0;
    T('FUEL', 822, 74, 12, 'right', dim, 700); bar(580, 66, 190, fu / 100, gFlash[1] > .5 ? '#ffffff' : fu < 15 ? red : '#ffd84a');
    T(WPN[wpn][0].toUpperCase(), 822, 108, 11, 'right', dim, 600);
    T('WPNS' + (wpn === 4 ? ' ' + mslN : ''), 822, 92, 12, 'right', dim, 700); bar(580, 84, 190, we / 100, gFlash[2] > .5 ? '#ffffff' : we < 12 ? red : '#ff6a3d');
    T('SPICE', 178, 93, 12, 'left', dim, 700); bar(232, 85, 190, spc / 100, btT > 0 ? '#ffffff' : '#ff3b5c'); if (btT > 0) { T('SLOW TIME', 500, 252, 15, 'center', '#ff3b5c', 700); line([[500 - 80 * btT / btMax, 262], [500 + 80 * btT / btMax, 262]], '#ff3b5c', 2); } }
  const hd = Math.atan2(sFx, -sFz) * 57.29578, CARD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], wrap = (a) => ((a + 540) % 360) - 180;
  for (let a = 0; a < 360; a += 5) { const x = 500 + wrap(a - hd) * 6.5; if (x < 250 || x > 750) continue; const m = a % 45 === 0; line([[x, 118], [x, m ? 134 : a % 15 ? 123 : 128]], m ? main : dim, m ? 2 : 1); if (m) T(CARD[a / 45], x, 156, 16, 'center', main, 700); }
  c.fillStyle = main; c.beginPath(); c.moveTo(500, 114); c.lineTo(493, 102); c.lineTo(507, 102); c.fill();
  T(SYS.locs[SYS.loc].name + '  ·  ' + SYS.name, 500, 196, 15, 'center', dim, 700);
  let dist = 0;
  if (cur) { const dx = cur.x - px, dy = cur.y - py, dz = cur.z - pz; dist = Math.hypot(dx, dy, dz); const bx = Math.max(250, Math.min(750, 500 + wrap(Math.atan2(dx, -dz) * 57.29578 - hd) * 6.5)); c.fillStyle = amb; c.beginPath(); c.moveTo(bx, 108); c.lineTo(bx + 7, 116); c.lineTo(bx, 124); c.lineTo(bx - 7, 116); c.fill(); }
  // left: speed, hull state. right: target, distance
  if (tm - hitPing < 1.2) { const u = 1 - (tm - hitPing) / 1.2, ang = hitAng || 0, rad = 230, cx = 500 + Math.sin(ang) * rad, cy = 460 - Math.cos(ang) * 150; c.save(); c.translate(cx, cy); c.rotate(ang); c.globalAlpha = .4 + .6 * u; c.fillStyle = '#ff5d4f'; c.beginPath(); c.moveTo(0, -16); c.lineTo(11, 10); c.lineTo(0, 4); c.lineTo(-11, 10); c.closePath(); c.fill(); c.restore(); }
  at(LX); tag('SPEED', 92, 236); T(String(spd | 0), 108, 290, 50, 'left', main, 700); T('U/S', 108 + gW(String(spd | 0), 50) + 10, 270, 15, 'left', dim, 700);
  tag(SYS.atm ? 'ALTITUDE' : 'CREDITS', 92, 366); T(SYS.atm ? ((Math.max(700, Math.min(9000, 2600 + py * .5)) / 100 | 0) / 10).toFixed(1) : String(ST.credits), 108, 420, 40, 'left', main, 700); if (SYS.atm) T('KM', 108 + gW('00.0', 40) + 12, 402, 15, 'left', dim, 700);
  at(RX); tag('TARGET', 908, 236, 'right'); T(cur ? cur.name : 'NONE', 892, 284, 22, 'right', amb, 700);
  if (cur && cur.npc) { T('SHD', 736, 304, 11, 'right', dim, 700); bar(742, 296, 150, cur.npc.sh / cur.npc.shM, cy); T('HULL', 736, 318, 11, 'right', dim, 700); bar(742, 310, 150, cur.npc.hp / cur.npc.hpM, cur.npc.hp < cur.npc.hpM * .35 ? red : main); }
  tag('DISTANCE', 908, 366, 'right'); const ds = dist >= 10000 ? (dist / 1000).toFixed(0) : dist >= 1000 ? (dist / 1000).toFixed(1) : String(dist | 0); T(cur && cur.far ? 'MM' : dist >= 1000 ? 'KM' : 'M', 892, 420, 15, 'right', dim, 700); T(cur && cur.far ? plDist(cur) : ds, 860, 420, 40, 'right', main, 700); if (drift) { T('LIGHT DRIFT  ' + (driftV / 300).toFixed(driftV < 30 ? 3 : 2) + ' c', 892, 500, 15, 'right', amb, 700); bar(742, 508, 150, Math.min(1, driftV / 300), amb); } else if (!SYS.atm && apOn && aimK >= 0) { const inR = apDist < apGate; T(bRamp <= 0 ? 'HOLD BOOST TO APPROACH' : inR ? 'APPROACH  ' + SYS.planets[aimK].name.toUpperCase() : 'CLOSING · DRIFT AT ' + Math.round(apGate) + ' MM', 892, 500, 15, 'right', amb, 700); bar(742, 508, 150, inR ? bRamp : Math.min(1, apGate / apDist), amb); } else if (SYS.atm && scK > 0) { T('TERMINAL VELOCITY', 892, 500, 15, 'right', amb, 700); bar(742, 508, 150, scK, amb); }
  if (cur && scanT > 0) { T('SCANNING', 892, 462, 14, 'right', cy, 700); bar(742, 470, 150, scanT / 1.6, cy); } else if (cur && scanned[cur.id]) T('SCANNED', 892, 462, 14, 'right', dim, 700);
  else if (cur && (cur.npc || cur.id === 'trader' || cur.id === 'gate') && dist < (cur.npc ? scanR() : cur.id === 'gate' ? 2600 : 900)) T(cur.npc ? 'F · HAIL' : 'F · OPEN', 892, 462, 14, 'right', cy, 700);
  // throttle reads only in the top bar; the side ladders (throttle, pitch) are gone
  at(OX);
  if (performance.now() < hudTipT) T(hudTipS.length > 84 ? hudTipS.slice(0, 82) + '…' : hudTipS, 500, 640, 19, 'center', main, 600);
  if (performance.now() < commT) {                             // radio: wrapped onto up to three lines, the last line sitting just above the tips
    const w = commS.split(' '), L = []; let ln = ''; for (const x of w) { if ((ln + ' ' + x).length > 86 && ln) { L.push(ln); ln = x; } else ln = ln ? ln + ' ' + x : x; } if (ln) L.push(ln);
    const sh = L.slice(0, 3); if (L.length > 3) sh[2] = sh[2].slice(0, 82) + '…'; sh.forEach((t, i) => T(t, 500, 612 - (sh.length - 1 - i) * 19, 15, 'center', cy, 600)); }
  if (CM && CM.ph === 'offer') T((xr ? 'A' : 'F') + ' · ACCEPT        ignore to pass  ' + '·'.repeat(Math.max(0, Math.min(4, 1 + ((20 - CM.t) / 5 | 0)))), 500, 634, 14, 'center', amb, 700);
  popDraw(c, T);
  if (sysWarn) T(sysWarn, 500, 676, 15, 'center', sysWarnC, 700);
  else if (obj.text) T(obj.text.length > 88 ? obj.text.slice(0, 86) + '…' : obj.text, 500, 676, 17, 'center', amb, 600);
  // bottom: the system at a glance. The star, its worlds' orbits, and a pin for every place the gate reaches.
  line([[318, 898], [352, 716], [648, 716], [682, 898]]);
  const mx = 500, my = 806; c.fillStyle = '#fff2c8'; c.beginPath(); c.arc(mx, my, 6, 0, 6.3); c.fill();
  const sq = Math.max(.12, Math.min(.85, .42 - sFy * .5 + mby * 10)), hdR = Math.atan2(sFx, -sFz), rl = Math.atan2(sRy, sUy) * .8 + mbx * 12;
  { const rt = (x0, y0) => [mx + x0 * Math.cos(rl) - y0 * Math.sin(rl), my + x0 * Math.sin(rl) + y0 * Math.cos(rl)];
    for (let k = 0; k < 36; k++) { const ag = k / 36 * 6.2832 - hdR, big = k % 9 === 0, [x1, y1] = rt(Math.cos(ag) * 112, Math.sin(ag) * 112 * sq), [x2, y2] = rt(Math.cos(ag) * (big ? 100 : 106), Math.sin(ag) * (big ? 100 : 106) * sq); line([[x1, y1], [x2, y2]], big ? main : dim, big ? 1.5 : 1); }
    const sw = tm * 1.4; for (let k = 0; k < 10; k++) { const ag = sw - k * .05, [x2, y2] = rt(Math.cos(ag) * 100, Math.sin(ag) * 100 * sq); line([[mx, my], [x2, y2]], `rgba(99,226,255,${(.22 * (1 - k / 10)).toFixed(3)})`, 1.5); }
    const [fx2, fy2] = rt(0, -100 * sq); line([[mx, my], [fx2, fy2]], amb, 1); }
  for (let i = 0; i < 3; i++) { c.strokeStyle = 'rgba(160,210,240,.35)'; c.lineWidth = 1; c.beginPath(); c.ellipse(mx, my, 34 + i * 34, (34 + i * 34) * sq, rl, 0, 6.3); c.stroke(); }
  { const nx = mx + Math.cos(-hdR - 1.5708) * 108, ny = my + Math.sin(-hdR - 1.5708) * 108 * sq; T('N', nx, ny + 4, 11, 'center', dim, 700); }
  SYS.locs.forEach((l, i) => { const ring = l.atm ? l.atm - 1 : l.body >= 0 ? l.body : (i % 3), a = i * 2.4 + .6 + (SYS.id & 7) + tm * .22 / (1 + ring) - hdR, r = 34 + ring * 34, x0 = Math.cos(a) * r, y0 = Math.sin(a) * r * sq, x = mx + x0 * Math.cos(rl) - y0 * Math.sin(rl), y = my + x0 * Math.sin(rl) + y0 * Math.cos(rl), here = i === SYS.loc, want = obj.loc === i;
    c.beginPath(); c.arc(x, y, here ? 6 : 4.5, 0, 6.3); if (here) { c.fillStyle = cy; c.fill(); } else { c.strokeStyle = want ? amb : main; c.lineWidth = 2; c.stroke(); if (want) { c.fillStyle = amb; c.fill(); } }
    if (here || want) { line([[x, y - 7], [x, y - 20]], here ? cy : amb, 1.5); T(String(i + 1), x, y - 24, 12, 'center', here ? cy : amb, 700); } });
  { const rk = keyName(CFG.keys.KeyR || 'KeyR'); if (rdOn && rdName) T(`${rk} · IKOSAGON RADIO · ` + rdName, 300, 848, 12, 'right', cy, 700); else T(`${rk} · RADIO ${CFG.radio ? '…' : 'OFF'}`, 300, 848, 12, 'right', dim, 700); }
  T(rankName().toUpperCase(), 300, 800, 14, 'right', dim, 700); T(rp().jobs.length + '/3 CONTRACTS', 300, 822, 14, 'right', dim, 700);
  T(ST.credits + ' CR', 700, 800, 14, 'left', dim, 700); T(SYS.star.toUpperCase(), 700, 822, 14, 'left', dim, 700);
  if ((xr || hudForce) && jpOpen) {                                         // in a headset the lists are drawn here, since the page cannot be seen
    c.fillStyle = 'rgba(4,10,18,.97)'; c.fillRect(110, 170, 780, 560); line([[110, 170], [890, 170], [890, 730], [110, 730], [110, 170]], main, 2);
    T($('jh').textContent.toUpperCase(), 136, 208, 22, 'left', amb, 700); T($('jc').textContent.slice(0, 80), 136, 234, 14, 'left', dim);
    const n = items.length, rows = Math.min(n, 7), top = Math.max(0, Math.min(n - rows, psel - 3)), wrapT = (s, x, y, w) => { c.font = '500 14px "Segoe UI",system-ui,sans-serif'; c.textAlign = 'left'; c.fillStyle = dim; let ln = '', k = 0; for (const wd of s.split(' ')) { if (c.measureText(ln + wd).width > w) { c.fillText(ln, x, y + k * 17); ln = ''; if (++k > 1) return; } ln += wd + ' '; } c.fillText(ln, x, y + k * 17); };
    for (let k = 0; k < rows; k++) { const i = top + k, d = items[i], y = 262 + k * 64; if (i === psel) { c.fillStyle = 'rgba(99,226,255,.16)'; c.fillRect(122, y - 6, 756, 60); line([[122, y - 6], [122, y + 54]], cy, 3); }
      T(String(i + 1), 140, y + 16, 16, 'left', d.run ? amb : dim, 700); T(d.name, 170, y + 16, 18, 'left', d.run ? main : dim, 700); if (d.kind) T(String(d.kind).toUpperCase().slice(0, 34), 866, y + 16, 13, 'right', cy, 700); wrapT(d.desc || '', 170, y + 35, 690); }
    T('THROTTLE STICK MOVES THE ROW    TRIGGER OR A SELECTS    B GOES BACK', 500, 716, 13, 'center', dim, 700);
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
}
function hudTick(now) { cinFit(); if (now - hudLast < (xr ? 70 : 45) || !flying()) return; hudLast = now; hudPaint(); texFrom(hudTex, hudC); }
function hudDraw(k) {
  if (!flying()) return;
  const P = P_HUD; gl.useProgram(P.p); gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
  if (xr && jpOpen) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.ONE, gl.ONE);
  const visor = xr && jpOpen;
  if (visor) {
    M3[0] = eRx; M3[1] = eRy; M3[2] = eRz; M3[3] = eUx; M3[4] = eUy; M3[5] = eUz; M3[6] = -eFx; M3[7] = -eFy; M3[8] = -eFz;
    gl.uniformMatrix3fv(P.u.uShip, false, M3); gl.uniform3f(P.u.uEye, eox, eoy, eoz); gl.uniform3f(P.u.uMo, 0, 0, 0);
  } else {
    M3[0] = sRx; M3[1] = sRy; M3[2] = sRz; M3[3] = sUx; M3[4] = sUy; M3[5] = sUz; M3[6] = -sFx; M3[7] = -sFy; M3[8] = -sFz;
    gl.uniformMatrix3fv(P.u.uShip, false, M3); if (xr) gl.uniform3f(P.u.uEye, cex, cey, cez); else gl.uniform3f(P.u.uEye, eox * k, eoy * k, eoz * k); gl.uniform3f(P.u.uMo, cockpit ? ckx : 0, cockpit ? cky : 0, cockpit ? ckz : 0);
  }
  gl.bindVertexArray(hudVA); gl.activeTexture(gl.TEXTURE8); gl.uniform1i(P.u.uTx, 8);
  gl.bindTexture(gl.TEXTURE_2D, hudTex); const asp = W / H, nar = !xr && asp < 1.05, hs2 = xr ? 1 : (nar ? Math.min(1.45, 1.5 * asp / 1.1) : Math.min(1.45, 1.55 * asp / 1.76, cinOn && asp > 1.6 ? 1.5 * asp / 2.39 : 9)) * CFG.size, cy0 = xr ? .2 : 0, hw = nar ? 1.1 * hs2 : 1.76 * hs2;                                   // on a flat screen the display is a visor across the whole view; in a headset it sits on the front glass
  if (visor) { gl.uniform4f(P.u.uR, 0, .05, 5.4, 3.05); gl.uniform4f(P.u.uZ, -9.2, 0, 1, 0); gl.uniform4f(P.u.uUV, 0, 0, 1, 1); }
  else { gl.uniform4f(P.u.uR, 0, cy0, hw, hs2); gl.uniform4f(P.u.uUV, nar ? .1875 : 0, 0, nar ? .8125 : 1, 1); }
  if (visor) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  else if (!xr && CFG.fxVisor) { gl.uniform4f(P.u.uZ, HZ, 0, .8 * hudOp, CFG.fxVisor); gl.bindVertexArray(visVA); gl.drawArrays(gl.TRIANGLES, 0, visN); gl.bindVertexArray(hudVA); }
  else { gl.uniform4f(P.u.uZ, HZ, 0, .8 * hudOp, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
  const c = navCur();
  if (c && !((xr || hudForce) && jpOpen)) {
    if (typeof v123Bracket === 'function' && v123Bracket(c)) { /* world bracket */ }
    else {
      gl.useProgram(P.p);
      const dx = c.x - px, dy = c.y - py, dz = c.z - pz, lx = dx * sRx + dy * sRy + dz * sRz, ly = dx * sUx + dy * sUy + dz * sUz, lz = -(dx * sFx + dy * sFy + dz * sFz);
      let hx0 = 0, hy0 = 0, rot = 0, ic = 0;
      if (lz < -1e-3) { hx0 = lx / -lz * -HZ; hy0 = ly / -lz * -HZ; }
      if (!(lz < 0 && Math.abs(hx0) < .92 * hw && Math.abs(hy0 - cy0) < .8 * hs2)) { const a = Math.atan2(ly, lx); hx0 = Math.cos(a) * .82 * hw; hy0 = cy0 + Math.sin(a) * .68 * hs2; rot = a - 1.5708; ic = 1; }
      gl.bindTexture(gl.TEXTURE_2D, icoTex); gl.uniform4f(P.u.uR, hx0, hy0, (ic ? .04 : .045) * hs2, (ic ? .04 : .045) * hs2); gl.uniform4f(P.u.uZ, HZ, rot, .55 * Math.max(.5, hudOp), 0); gl.uniform4f(P.u.uUV, ic ? .5 : 0, 0, ic ? 1 : .5, 1); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
  if (!xr && tm - lastFire < .6) { gl.bindTexture(gl.TEXTURE_2D, icoTex); gl.uniform4f(P.u.uR, gmx * -HZ, gmy * -HZ, .022, .022); gl.uniform4f(P.u.uZ, HZ, .785, .8, 0); gl.uniform4f(P.u.uUV, 0, 0, .5, 1); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }   // where the guns point
  gl.activeTexture(gl.TEXTURE0); gl.disable(gl.BLEND); gl.bindVertexArray(VA0);
}

// ---- settings: display, flight, and every key. Kept in the browser. ----
const HCOL = [['Ice', ['#e6f6ff', 'rgba(160,210,240,.62)', '#ffb44a', '#63e2ff']], ['Amber', ['#ffd9a0', 'rgba(255,190,110,.6)', '#ffffff', '#ffb44a']], ['Green', ['#c8ffd8', 'rgba(120,255,170,.55)', '#ffe27a', '#5dffa0']], ['Violet', ['#ffd6f6', 'rgba(255,150,230,.55)', '#7ee8ff', '#ff7ae0']], ['Red', ['#ffd0c8', 'rgba(255,120,100,.6)', '#ffe9a8', '#ff6a5a']]];
const ACTS = [['KeyW', 'Throttle up'], ['KeyS', 'Throttle down'], ['KeyA', 'Strafe left'], ['KeyD', 'Strafe right'], ['KeyE', 'Rise'], ['KeyQ', 'Sink'], ['ShiftLeft', 'Boost'], ['Space', 'Fire'], ['KeyX', 'Zero throttle'], ['KeyT', 'Next target'], ['KeyF', 'Interact / hail'], ['KeyJ', 'Warp gate'], ['KeyB', 'Journal'], ['KeyL', 'Log'], ['KeyC', 'Cockpit on / off'], ['Comma', 'Glance left'], ['Period', 'Glance right'], ['Slash', 'Glance behind'], ['KeyR', 'Radio on / off'], ['BracketRight', 'Radio: skip to another song'], ['KeyI', 'Cargo hold'], ['Tab', 'Aux display (full screen)'], ['KeyN', 'Star map'], ['KeyM', 'Mute'], ['KeyV', 'VR / 3D']];
const CFG = { hud: 1, op: .7, size: .85, cin: 0, host: 0, inv: 0, sens: 1, fx: 1, pl: 1, radio: 1, keys: {}, vEng: .5, vCht: 1, vRad: 1, fxBlur: .5, fxCA: 1, fxGrain: 1, fxScan: 1, fxBloom: 1, fxFlare: 1, fxVig: 1, fxVisor: .5, fxGlass: 1 };
const pct = (v) => v ? Math.round(v * 100) + '%' : 'off', LV3 = (v) => !v ? 'off' : v < .75 ? 'subtle' : 'full';
try { Object.assign(CFG, JSON.parse(localStorage.ibCfg || '{}')); } catch {}
if ((CFG.fxMig || 0) < 3) { for (const k of ['fxCA', 'fxGrain', 'fxBloom', 'fxFlare', 'fxGlass', 'fxScan', 'fxVig']) CFG[k] = 1; CFG.fxBlur = .5; CFG.fxVisor = .5; CFG.fxMig = 3; }
if ((CFG.fxMig || 0) < 4) { CFG.hud = 1; CFG.op = .7; CFG.size = .85; CFG.cin = 0; CFG.fxMig = 4; }
if ((CFG.fxMig || 0) < 5) { CFG.cin = 0; CFG.fxMig = 5; }   // cinematic bars off by default (anyone can turn them back on in Display)   // v1.18 display defaults: amber HUD, 70% brightness, 85% size, cinematic bars   // v1.17: effects at full, except motion blur and the visor curve, which start subtle
let wipeArm = 0;
let hostLv = CFG.host, hudOp = CFG.op, cinOn = !!CFG.cin, rebind = null, mbx = 0, mby = 0, mbs = 0;
const IY = () => CFG.inv ? -1 : 1;
const cinB = [0, 1].map((i) => { const d = document.createElement('div'); d.style.cssText = `position:fixed;left:0;right:0;${i ? 'bottom' : 'top'}:0;background:#000;z-index:1;pointer-events:none;height:0`; document.body.appendChild(d); return d; });
const setP = document.createElement('div'); setP.style.cssText = 'position:fixed;inset:0;z-index:30;display:none;overflow:auto;background:linear-gradient(160deg,rgb(var(--hcr) / .07),transparent 45%),rgba(3,7,11,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#dcecf6;font:15px/1.5 "Segoe UI",system-ui,sans-serif;padding:6vh 7vw;letter-spacing:.03em'; document.body.appendChild(setP);
function mkIcons(col) {
  const ic = document.createElement('canvas'); ic.width = 256; ic.height = 128; const c = ic.getContext('2d'); c.strokeStyle = c.fillStyle = col; c.lineWidth = 5; c.lineCap = 'round';
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { c.beginPath(); c.moveTo(64 + sx * 50, 64 + sy * 22); c.lineTo(64 + sx * 50, 64 + sy * 50); c.lineTo(64 + sx * 22, 64 + sy * 50); c.stroke(); }
  c.beginPath(); c.moveTo(64, 56); c.lineTo(72, 64); c.lineTo(64, 72); c.lineTo(56, 64); c.fill(); c.beginPath(); c.moveTo(192, 22); c.lineTo(236, 84); c.lineTo(192, 66); c.lineTo(148, 84); c.closePath(); c.fill();
  texFrom(icoTex, ic);
}
const keyName = (k) => k.replace(/^Key|^Digit/, '').replace('ShiftLeft', 'Left Shift').replace('ShiftRight', 'Right Shift');
let cinH = -1;
function cinFit() { const h = cinOn && innerWidth / innerHeight > 1.6 && document.body.className[0] === 'g' && document.getElementById('jp').className !== 'on' ? Math.max(0, (innerHeight - innerWidth / 2.39) / 2) : 0; if (h !== cinH) { cinH = h; for (const d of cinB) d.style.height = h + 'px'; } }   // bars only while flying: never over the menu or a panel
function setUi() {
  { const h = HCOL[CFG.hud][1][3], de = document.documentElement.style; de.setProperty('--hc', h); de.setProperty('--hcr', [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ')); }   // menus wear the HUD's colour
  hostLv = CFG.host; hudOp = CFG.op; cinOn = !!CFG.cin; keep('ibCfg', JSON.stringify(CFG)); mkIcons(HCOL[CFG.hud][1][2]);
  cinFit();
  if (setP.style.display === 'none') return;
  const row = (k, name, val) => `<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgb(var(--hcr) / .14);padding:7px 0"><span>${name}</span><button data-k="${k}" style="min-width:150px;padding:6px 14px;background:${rebind === k ? 'var(--hc)' : 'rgb(var(--hcr) / .06)'};color:${rebind === k ? '#000' : 'var(--hc)'};border:1px solid rgb(var(--hcr) / .5);font:inherit;cursor:pointer">${val}</button></div>`;
  const hd = (t) => `<h3 style="margin:26px 0 6px;font-weight:600;letter-spacing:.25em;font-size:13px;color:var(--hc);text-shadow:0 0 10px rgb(var(--hcr) / .45)">${t}</h3>`;
  setP.innerHTML = `<div style="max-width:720px;margin:auto"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2 style="font-weight:300;letter-spacing:.3em;margin:0">SETTINGS</h2><button data-k="close" style="background:rgb(var(--hcr) / .08);border:1px solid var(--hc);color:var(--hc);padding:6px 18px;font:inherit;cursor:pointer">Done</button></div>`
    + hd('DISPLAY') + row('hud', 'HUD colour', HCOL[CFG.hud][0]) + row('op', 'HUD brightness', Math.round(CFG.op * 100) + '%') + row('size', 'HUD size', Math.round(CFG.size * 100) + '%') + row('cin', 'Cinematic bars', CFG.cin ? 'on' : 'off') + row('fs', 'Full screen on launch', CFG.fs === 0 ? 'off' : 'on') + hd('LENS EFFECTS') + row('fxVisor', 'Curved visor (HUD wraps at the edges)', LV3(CFG.fxVisor)) + row('fxGlass', 'Visor glass (tinted rim)', LV3(CFG.fxGlass)) + row('fxBlur', 'Motion blur', LV3(CFG.fxBlur)) + row('fxCA', 'Colour fringing at the edges', LV3(CFG.fxCA)) + row('fxGrain', 'Film grain', LV3(CFG.fxGrain)) + row('fxBloom', 'Glow and sun rays', LV3(CFG.fxBloom)) + row('fxFlare', 'Lens flare from the sun', LV3(CFG.fxFlare)) + row('fxScan', 'Scanlines', CFG.fxScan ? 'on' : 'off') + row('fxVig', 'Darkened corners', CFG.fxVig ? 'on' : 'off') + hd('RADIO') + row('radio', 'Ikosagon radio', CFG.radio ? 'on' : 'off') + row('pl', 'My playlist (streams now and then)', CFG.pl ? 'on' : 'off') + hd('VOLUME') + row('vEng', 'Engine and boost', pct(CFG.vEng)) + row('vCht', 'Radio chatter (pilots, traffic control)', pct(CFG.vCht)) + row('vRad', 'Music stream', pct(CFG.vRad)) + row('suno', 'Suno playlist page', 'open in a new tab')
    + hd('FLIGHT') + row('inv', 'Invert pitch', CFG.inv ? 'on' : 'off') + row('ctl', 'Controls', CFG.ctl ? 'space sim' : 'standard') + row('sens', 'Mouse sensitivity', Math.round(CFG.sens * 100) + '%') + row('host', 'Other pilots', ['peaceful', 'wary', 'hostile'][CFG.host]) + row('wipe', 'New universe', 'start fresh, with a confirmation')
    + hd('KEYS · click one, then press the new key') + ACTS.map(([k, n]) => row('key:' + k, n, rebind === 'key:' + k ? 'press a key…' : keyName(CFG.keys[k] || k))).join('') + row('reset', 'All keys', 'reset to defaults') + '</div>';
  if (isPWA()) {   // the store app is played in a headset: desktop-only settings step aside, and the VR ones join
    for (const k of ['cin', 'fs', 'sens', 'ctl', 'reset', 'suno']) { const b = setP.querySelector(`[data-k="${k}"]`); if (b) b.parentNode.remove(); }
    setP.querySelectorAll('[data-k^="key:"],[data-k^="fx"]').forEach((b) => b.parentNode.remove());
    setP.querySelectorAll('h3').forEach((h) => { if (/KEYS|LENS/.test(h.textContent)) h.remove(); });
    const h = setP.querySelector('h3'); if (h) h.insertAdjacentHTML('beforebegin', hd('VR') + row('vrH', 'Seat height', VRH[vrHi()][0]) + row('ck', 'Cockpit', cockpit ? 'on' : 'off'));
  }
}
const isPWA = () => typeof window.getDigitalGoodsService === 'function' || QS.has('pwa');
const VRH = [['lower', -.15], ['normal', 0], ['higher', .15]], vrHi = () => Math.max(0, VRH.findIndex((v) => v[1] === (CFG.vrH || 0)));   // VR seat height: nudges where the cabin floor meets the room's floor
const cyc = (v, list) => list[(list.indexOf(v) + 1) % list.length];
setP.onclick = (e) => {
  const k = e.target.dataset && e.target.dataset.k; if (!k) return;
  if (k === 'close') { setP.style.display = 'none'; rebind = null; return; }
  if (k.startsWith('key:')) rebind = rebind === k ? null : k;
  else if (k === 'reset') CFG.keys = {};
  else if (k === 'suno') window.open('https://suno.com/playlist/12f42e02-78a5-4eb2-bf7e-f605817e4c06', '_blank', 'noopener');
  else if (k === 'wipe') { setP.style.display = 'none'; newUniverse(); return; }
  else if (k === 'hud') CFG.hud = (CFG.hud + 1) % HCOL.length; else if (k === 'op') CFG.op = cyc(CFG.op, [1, .7, .45, .25]); else if (k === 'size') CFG.size = cyc(CFG.size, [1, 1.15, .85]);
  else if (k === 'ctl') CFG.ctl = CFG.ctl ? 0 : 1;
  else if (k === 'vrH') CFG.vrH = VRH[(vrHi() + 1) % VRH.length][1];
  else if (k === 'ck') { const b = $('ck'); if (b) b.click(); }
  else if (k === 'vEng' || k === 'vCht' || k === 'vRad') CFG[k] = cyc(CFG[k], [1, .75, .5, .25, 0]);
  else if (k === 'cin') CFG.cin = CFG.cin ? 0 : 1; else if (k === 'fs') CFG.fs = CFG.fs === 0 ? 1 : 0; else if (k === 'radio') CFG.radio = CFG.radio ? 0 : 1; else if (k === 'pl') { CFG.pl = CFG.pl ? 0 : 1; if (!CFG.pl && plA) { plA.pause(); plOn = 0; } } else if (['fxBlur', 'fxCA', 'fxGrain', 'fxBloom', 'fxFlare', 'fxVisor', 'fxGlass'].includes(k)) CFG[k] = cyc(CFG[k], [.5, 1, 0]); else if (k === 'fxScan' || k === 'fxVig') CFG[k] = CFG[k] ? 0 : 1; else if (k === 'inv') CFG.inv = CFG.inv ? 0 : 1; else if (k === 'sens') CFG.sens = cyc(CFG.sens, [1, 1.3, 1.7, .5, .75]);
  else if (k === 'host') { CFG.host = (CFG.host + 1) % 3; hostLv = CFG.host; if (SYS) npcSpawn(); }
  if (k !== 'wipe') wipeArm = 0;
  setUi();
};
$('set').onclick = () => { setP.style.display = 'block'; setUi(); };
// ---- View controls: the key list, drawn from the live bindings, so a remapped key shows as remapped ----
const KEYN = (c) => ({ ShiftLeft: 'Shift', ShiftRight: 'Shift', Space: 'Space', Escape: 'Esc', Tab: 'Tab', Comma: ',', Period: '.', Slash: '/', BracketRight: ']', BracketLeft: '[', Semicolon: ';', Quote: "'", Backquote: '`', Minus: '-', Equal: '=', Backslash: '\\', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Backspace: 'Bksp', ControlLeft: 'Ctrl', AltLeft: 'Alt', CapsLock: 'Caps' }[c] || String(c).replace(/^Key|^Digit|^Numpad/, ''));
function keysShow() {
  const kk = (...a) => { let ch = 0; const t = a.map((c) => { const m = CFG.keys[c]; if (m && m !== c) ch = 1; return KEYN(m || c); }).join(' / '); return [t, ch]; };
  const sim = !!CFG.ctl, rows = [
    [['Mouse', 0], 'Look and steer'],
    [kk('KeyW', 'KeyS'), sim ? 'Pitch down / up' : 'Throttle up / down (or the wheel)'],
    [kk('KeyA', 'KeyD'), sim ? 'Roll left / right' : 'Slide left / right'],
    [kk('KeyQ', 'KeyE'), sim ? 'Throttle down / up' : 'Sink / rise'],
    sim ? [['Z / X', 0], 'Altitude down / up'] : [kk('KeyX'), 'Full stop'],
    [kk('ShiftLeft'), 'Boost. Keep holding and it builds; past full boost comes overdrive. Near a targeted planet: light drift'],
    [[kk('Space')[0] + ' / click', kk('Space')[1]], 'Fire · 1 to 5 pick the weapon: Gatling, scatter, lance, mining laser, seekers'],
    [kk('KeyJ'), 'Warp gate: other places, other systems'], [kk('KeyT', 'KeyF'), 'Next target · hail, dock or open what you point at'],
    [kk('KeyI'), 'Cargo hold'], [kk('Tab'), 'Aux display: the screen left of the dash, full screen. 1 to 5 pick its tabs'],
    [kk('KeyB', 'KeyN'), 'Journal · star map'], [kk('KeyL'), 'Log: task here, signal, hold, places visited'],
    [kk('KeyR', 'BracketRight'), 'Radio on / off · skip song'], [[kk('Comma')[0] + '  ' + kk('Period')[0] + '  ' + kk('Slash')[0], kk('Comma', 'Period', 'Slash')[1]], 'Glance left, right, behind'],
    [kk('KeyC', 'KeyV'), 'Cockpit · VR'], [[kk('KeyM')[0] + ' · H · Esc', kk('KeyM')[1]], 'Mute · stats · menu'],
    [['Swarms', 0], 'Slow down inside one and it works your ore: silver menders turn Ferrite into hull, yellow siphons turn Pyrite into fuel, red sparks turn Cinnabar into weapons energy'],
    [['Spice', 0], 'Fly through crimson blooms while boosting, skim rocks, or linger near living things. Boosting into a near-certain crash spends some to slow time']];
  $('keyl').innerHTML = rows.map(([[k, ch], d]) => `<dt${ch ? ' class=ch' : ''}>${k.replace(/</g, '&lt;')}</dt><dd>${d}</dd>`).join('');
  $('keyn').textContent = (sim ? 'Space sim controls are on. ' : '') + (Object.keys(CFG.keys).length ? 'Keys you have changed are shown in the second colour. ' : '') + 'Change keys in Settings.';
  $('card').className = 'on';
}
function keysHide() { $('card').className = ''; }
$('keys').onclick = keysShow; $('cardX').onclick = keysHide;
addEventListener('keydown', (e) => { if (e.code === 'Escape' && $('card').className === 'on') { keysHide(); e.stopImmediatePropagation(); } }, true);
addEventListener('pointerdown', (e) => { if ($('card').className === 'on' && !$('card').contains(e.target) && e.target.id !== 'keys') keysHide(); }, true);
// keys: a pressed key is translated to the action's own key before the game sees it
const canon = new Set(ACTS.map((a) => a[0]));
const relay = (e) => {
  if (!e.isTrusted) return;
  if (rebind && e.type === 'keydown') { e.stopImmediatePropagation(); e.preventDefault(); if (e.code !== 'Escape') { const a = rebind.slice(4); for (const k in CFG.keys) if (CFG.keys[k] === e.code) delete CFG.keys[k]; if (e.code === a) delete CFG.keys[a]; else CFG.keys[a] = e.code; } rebind = null; setUi(); return; }
  if (PIP.big) { pipKey(e); e.stopImmediatePropagation(); e.preventDefault(); return; }   // the aux display has the keys while it is open
  if (invOpen) { if (e.type === 'keydown' && (e.code === 'Escape' || e.code === 'KeyI')) invClose(); e.stopImmediatePropagation(); return; }
  if (setP.style.display !== 'none') { if (e.code === 'Escape' && e.type === 'keydown') { setP.style.display = 'none'; e.stopImmediatePropagation(); } return; }
  let to = null; for (const k in CFG.keys) if (CFG.keys[k] === e.code) to = k;
  if (!to && canon.has(e.code) && CFG.keys[e.code]) to = '';   // this key's own action now lives elsewhere
  if (to == null) return;
  e.stopImmediatePropagation(); e.preventDefault();
  if (to && !e.repeat) window.dispatchEvent(new KeyboardEvent(e.type, { code: to, key: e.key, shiftKey: e.shiftKey, bubbles: true }));
};
addEventListener('keydown', relay, true); addEventListener('keyup', relay, true);
addEventListener('resize', () => { cinH = -1; cinFit(); }); setUi();   // never rebuild the settings list on resize: it would be torn down under the pointer

// ---- supercruise: hold a planet ahead at speed and the drive takes over; climb hard out of an atmosphere to leave ----
let scP = -1, scT = 0, scK = 0, scE = 0, scOut = 0, plBase = [0, 0, 0], scTip = 0, fogX = 0, pYaw = 0, pPit = 0;
// ---- big stars: each place gets up to eight, seeded, each a different kind and stage of life ----
const BSK = [[0, .26, [1, .95, .86], .018, .032], [1, .14, [1, .4, .16], .05, .09], [2, .1, [.62, .76, 1], .024, .04], [3, .12, [1, 1, 1], .013, .022], [4, .08, [.8, .9, 1], .012, .018], [5, .12, [1, .5, .3], .02, .034], [6, .08, [.75, .85, 1], .018, .026], [7, .1, [1, 1, 1], .018, .03]];
const CSC = [[1, .3, .06], [1, .42, .08], [1, .55, .12], [1, .8, .45], [.62, .78, 1], [.5, .66, 1], [1, .58, .14], [.85, .92, 1]];   // close-star surface colours by stage: saturated, the way a filtered view sees them
let csKey = '', csU = [0, 0, 0, 0], csC = [1, 1, 1], bsKey = '', bsS = new Float32Array(32), bsC = new Float32Array(32);
function bigStarsSet() {
  const key = SYS.id + ':' + SYS.loc;
  if (key !== bsKey) { bsKey = key; bsS.fill(0); bsC.fill(0); const R = mulberry32((SYS.salt ^ 0x51A75) >>> 0), head = SYS.headline || 0, closeOn = !SYS.atm && !head && mulberry32((SYS.salt ^ 0xC105E) >>> 0)() < .32, show = !closeOn && !head && R() < .5, n = head ? 0 : closeOn ? (R() < .5 ? 0 : 1) : 1 + (R() < .4 ? 1 : 0);   // one headline already owns this sky
    for (let i = 0; i < n; i++) { let u = R() * BSK.reduce((a, k) => a + k[1], 0), K = BSK[0]; for (const k of BSK) { if ((u -= k[1]) <= 0) { K = k; break; } }
      if (i === 0 && show) K = BSK[[1, 2, 3, 6, 7][R() * 5 | 0]]; else if (!show && K[0] !== 0 && K[0] !== 4) K = BSK[0];   // a showpiece in about half the places; otherwise plain suns or a pulsar
      let x, y, z; do { z = R() * 2 - 1; const a = R() * 6.283, q = Math.sqrt(1 - z * z); x = Math.cos(a) * q; y = Math.sin(a) * q; } while (x * SUN[0] + y * SUN[1] + z * SUN[2] > .9);
      bsS.set([x, y, z, K[0]], i * 4); bsC.set([K[2][0], K[2][1], K[2][2], (K[3] + (K[4] - K[3]) * R()) * (i ? .8 : 1.2)], i * 4); } }
  if (key !== csKey) { csKey = key; const R = mulberry32((SYS.salt ^ 0xC105E) >>> 0), on = !SYS.atm && !(SYS.headline) && R() < .32, sc = SYS.sc || 0, giant = sc <= 2 && R() < .35;
    const RR = [[.1, .18], [.1, .2], [.1, .22], [.08, .15], [.06, .12], [.14, .3], [.1, .18], [.02, .04]][sc], rad = giant ? .26 + R() * .12 : RR[0] + (RR[1] - RR[0]) * R();
    csU = [on ? rad : 0, sc, R() * 6.283, giant ? 1 : 0]; csC = giant ? [1, .34, .1] : CSC[sc]; }
  gl.uniform4fv(P_SKY.u['uBS[0]'], bsS); gl.uniform4fv(P_SKY.u['uBC[0]'], bsC); gl.uniform4f(P_SKY.u.uCS, ...csU); gl.uniform3f(P_SKY.u.uCC, ...csC);
}
function hop(loc) { const sv = [yaw, pitch, thr, vx, vy, vz]; palEase = 1; softArr = 1; arrive(SYS.sec, loc, 1); softArr = 0; [yaw, pitch, thr, vx, vy, vz] = sv; snap = 0; fogX = .0065; }   // same heading and speed; attitude eases instead of snapping
function cruiseTick(dt, fly) {
  { const k = Math.min(1, dt * 8), d = Math.max(.001, dt); let dy = syaw - pYaw; pYaw = syaw; const dp = spit - pPit; pPit = spit; if (Math.abs(dy) > 1) dy = 0;
    mbx += (Math.max(-.03, Math.min(.03, dy / d * .011)) - mbx) * k; mby += (Math.max(-.03, Math.min(.03, -dp / d * .011)) - mby) * k; mbs += ((.012 + .09 * bst * bst) * Math.min(1, Math.hypot(vx, vy, vz) / 280) - mbs) * k; }
  if (veil > .02 && !jumpTo) flash = Math.max(flash, veil * veil * .55);   // the haze thickens to a veil and thins again: no cut
  if (!fly || jumpTo) { scK = scE = 0; return; }
  const sp = Math.hypot(vx, vy, vz), r = rp();
  if (SYS.atm) {
    if (sFy > .42 && (thr > .7 || bst > .5) && sp > 60) scOut += dt; else scOut = Math.max(0, scOut - dt * 2);
    scK = Math.min(1, scOut / 13); scE = scK * scK * (3 - 2 * scK); { const want = scE * scE * .0065; fogX += (want - fogX) * Math.min(1, dt * (fogX > want ? .18 : .6)); veil += (scE * scE - veil) * Math.min(1, dt * (veil > scE * scE ? .3 : 2)); }
    if (scOut > 1.2 && tm > scTip) { scTip = tm + 20; tip('Terminal velocity: hold the nose up, throttle open or boost held, to break out of the atmosphere', 5000); }
    if (scOut > 13) { const k = SYS.atm - 1, back = r.from != null && SYS.locs[r.from] && !SYS.locs[r.from].atm ? r.from : 0; hop(back); const P = sysP[k];
      if (P) {   // come out still facing the way you climbed: no turn, no cut. The planet sits behind you and below, where the climb left it
        const R0 = PR[k], cp = Math.cos(pitch), F = [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp], n = nrm([F[0], F[1] + .45, F[2]]);
        sysS = [P[0] + n[0] * 1.45 * R0, P[1] + n[1] * 1.45 * R0, P[2] + n[2] * 1.45 * R0];
        vx = F[0] * sp; vy = F[1] * sp; vz = F[2] * sp; drift = bst > .3 ? 2 : thr > .3 ? 1 : 0; driftV = 0; veil = .8; ent = null; }
      tip(`Clear of ${SYS.planets[k].name}: it is behind and below you.${drift === 2 ? ' Light drift while you hold boost.' : ''}`, 7000); }
    return;
  }
  veil += (0 - veil) * Math.min(1, dt * .2); scK = scE = 0;
  if (!sysP) return;
  let near = 1e9, nk = -1;
  for (let k = 0; k < 3; k++) { const P = sysP[k]; if (!P) continue; const x = P[0] - sysS[0], y = P[1] - sysS[1], z = P[2] - sysS[2], d = Math.hypot(x, y, z) || 1; SYS.pl[k * 4] = x / d; SYS.pl[k * 4 + 1] = y / d; SYS.pl[k * 4 + 2] = z / d; SYS.pl[k * 4 + 3] = Math.min(1.35, PR[k] / d); if (d - PR[k] < near) { near = d - PR[k]; nk = k; } }
  if (!drift && bRamp > 0) { const v = bRamp * bRamp * .04 * Math.max(.3, near); sysS[0] += sFx * v * dt; sysS[1] += sFy * v * dt; sysS[2] += sFz * v * dt; }   // sustained boost covers real distance: worlds grow or fall away as you go
  if (!drift) { driftV = 0; apOn = 0;
    // light drift is the top of the boost range: a planet targeted and ahead, boost held until it has built all the way, and the drive tips over into drift
    const c = navCur(), k = c && c.kind === 'planet' ? +c.id[1] : -1;
    if (k >= 0 && sysP[k]) { const w = SYS.pl[k * 4 + 3], cs = sFx * SYS.pl[k * 4] + sFy * SYS.pl[k * 4 + 1] + sFz * SYS.pl[k * 4 + 2];
      if (cs > Math.cos(Math.max(.14, w * 1.4)) && k !== noAuto) { const P = sysP[k], dist = Math.hypot(P[0] - sysS[0], P[1] - sysS[1], P[2] - sysS[2]); aimK = k;
        apOn = 1; apDist = dist; apGate = PR[k] * 12;                                   // close to within twelve of its radii under boost; then the drift takes you in
        if (dist < apGate && bRamp >= 1) { drift = 2; tip(`In range: light drift toward ${SYS.planets[k].name}. Let go of boost to drop out.`, 6000); }
        else if (bRamp >= 1 && tm > apTip) { apTip = tm + 25; tip(`Closing on ${SYS.planets[k].name}: light drift engages within ${Math.round(apGate)} Mm.`, 5000); } }
      else if (cs < .9) noAuto = -1; }
    return; }
  // light drift: speed is set by how far the nearest surface is, so an approach eases in by itself and deep space is crossed quickly
  driftV += (Math.max(.3, Math.min(900, near * .32)) * (crew('nav') ? 1.3 : 1) * (drift === 2 ? bst : Math.max(0, thr)) - driftV) * Math.min(1, dt * 1.2);
  if (drift === 2 && bst < .15 && driftV < 1) { drift = 0; noAuto = -1; tip('Dropped out of light drift', 3000); }   // let go of boost and the drift runs down and ends
  sysS[0] += sFx * driftV * dt; sysS[1] += sFy * driftV * dt; sysS[2] += sFz * driftV * dt;
  scE = Math.min(1, driftV / 40) * .7; fogX = Math.max(fogX, .0032);                           // the field around you streams and thins while the sky holds still
  if (nk >= 0) { const R = PR[nk], loc = SYS.locs.findIndex((l) => l.atm === nk + 1), u = near / R;
    if (loc >= 0) { if (u < .5) veil = Math.max(veil, 1 - (u - .1) / .4);                         // the air closes in
      if (u < .1) { { const P = sysP[nk], rr = nrm([sysS[0] - P[0], sysS[1] - P[1], sysS[2] - P[2]]), dp = sFx * rr[0] + sFy * rr[1] + sFz * rr[2], tt = [sFx - rr[0] * dp, sFy - rr[1] * dp, sFz - rr[2] * dp];
          ent = { k: nk, sys: SYS.id, r0: rr, t0: Math.hypot(tt[0], tt[1], tt[2]) < .05 ? nrm(crs(rr, [0, 1, 0])) : nrm(tt), yaw: 0 }; }   // remember where on the planet you came in, and which way you were travelling
        drift = 0; r.from = SYS.loc; const yaw0 = yaw, pit0 = pitch; hop(loc); py = 9000; yaw = yaw0; pitch = Math.max(-.85, Math.min(.35, pit0)); levelAim = -.22; rightT = 6.2; rollBias = 0; snap = 0; ent.yaw = yaw; { const cp = Math.cos(pitch), s2 = Math.max(sp, 120); vx = Math.sin(yaw) * cp * s2; vy = Math.sin(pitch) * s2; vz = -Math.cos(yaw) * cp * s2; } veil = 1; quietUntil = tm + 150; cmT = Math.max(cmT, 200); tip(`${SYS.locs[SYS.loc].name}: the wings will settle. Hold the nose up to climb back out.`, 7000); } }
    else if (u < .25) { drift = 0; tip(`${SYS.planets[nk].name} has no air to fly in: holding off`, 5000); } }
}
let scBack = -1;
const PR = [70, 6.4, 2.6];                                  // planet radii in thousands of km
let sysS = [0, 0, 0], sysP = null, drift = 0, driftV = 0, veil = 0, aimK = -1, aimT = 0, apT = 0, apTip = 0, noAuto = -1, apOn = 0, apDist = 0, apGate = 0, ent = null;
function syncPR() { if (SYS && SYS.prad) for (let k = 0; k < 3; k++) if (SYS.prad[k] > 0) PR[k] = SYS.prad[k]; }
function sysInit() { syncPR(); sysS = [0, 0, 0]; drift = 0; driftV = 0; aimK = -1; aimT = apT = 0; noAuto = -1; sysP = SYS.atm ? null : [0, 1, 2].map((k) => { const w = SYS.pl[k * 4 + 3]; return w > 0 ? [SYS.pl[k * 4] * PR[k] / w, SYS.pl[k * 4 + 1] * PR[k] / w, SYS.pl[k * 4 + 2] * PR[k] / w] : null; }); }
function driftToggle() { if (SYS.atm) return tip('Climb out of the atmosphere first: hold the nose up at full throttle', 4000); drift = drift ? 0 : 1; if (!drift) { noAuto = aimK; aimT = apT = 0; bHold = 0; } tip(drift ? 'Light drift: throttle sets the pace, the sky is the map. Point at a world and hold. G drops out.' : 'Dropped out of light drift', 5000); }
const plDist = (c) => { const k = +c.id[1], P = sysP && sysP[k]; if (!P) return '—'; const d = Math.hypot(P[0] - sysS[0], P[1] - sysS[1], P[2] - sysS[2]) - PR[k]; return d < 100 ? d.toFixed(1) : String(d | 0); };

// ---- trade: eight goods; what a place makes is cheap there and what it lacks is dear; your own trading moves the price ----
const GOODS = [['Water ice', 12], ['Ore', 20], ['Alloys', 55], ['Provisions', 30], ['Machinery', 90], ['Medicine', 140], ['Luxuries', 210], ['Data cores', 320]];
const ECO = { extraction: [[1, 0], [4, 3]], refining: [[2], [1, 0]], agriculture: [[3, 0], [4, 5]], salvage: [[2, 4], [3, 6]], research: [[7, 5], [6, 3]], 'trade hub': [[6], [7]] };
const KIND = [[[3], [5]], [[0], [3]], [[2], [0]], [[7], [3]], [[4], [1]], [[2], [5]], [[5], [4]], [[0], [6]]];   // by kind of place: makes, lacks
const holdN = () => slotsUsed(), holdMax = () => holdSlots();
function stock(key, g, add) {                                 // how much you have sold into a place lately; it drains back over about twenty minutes
  const r = rp(), m = r.mk || (r.mk = {}), e = m[key + ':' + g] || [0, Date.now()], v = e[0] * Math.exp(-(Date.now() - e[1]) / 12e5) + (add || 0);
  if (add) m[key + ':' + g] = [v, Date.now()]; return v;
}
function priceAt(s, loc, g) {
  const key = s.id + ':' + loc, e = ECO[s.econ], kd = KIND[s.locs[loc].t], day = Math.floor(Date.now() / 864e5);
  let m = .8 + .4 * ((hs(s.id ^ Math.imul(loc + 1, 7919) ^ Math.imul(g + 1, 104729) ^ day) >>> 0) % 1000) / 1000;
  { const ev = mktEvent(s); if (ev[0] === g) m *= ev[1] ? 1.8 : .5; }
  if (e[0].includes(g)) m *= .68; if (e[1].includes(g)) m *= 1.42; if (kd[0].includes(g)) m *= .8; if (kd[1].includes(g)) m *= 1.3;
  return Math.max(2, Math.round(GOODS[g][1] * m * Math.max(.55, Math.min(1.6, 1 - stock(key, g) * .015))));
}
const mktEvent = (s) => { const h = hs(s.id ^ Math.imul(Math.floor(Date.now() / 864e5), 0x2545F491)) >>> 0; return [h % 8, (h >> 8) & 1]; };
function ledger() {
  const px2 = rp().px || {}, ks = Object.keys(px2), out = [];
  for (let g = 0; g < 8; g++) { let lo = null, hi = null; for (const k of ks) { const p = px2[k].p[g]; if (!lo || p < lo[0]) lo = [p, px2[k].n]; if (!hi || p > hi[0]) hi = [p, px2[k].n]; } if (lo && hi && hi[0] * .92 - lo[0] > 4 && lo[1] !== hi[1]) out.push([hi[0] * .92 - lo[0], `${GOODS[g][0]}: ${lo[0]} at ${lo[1]} → ${Math.round(hi[0] * .92)} at ${hi[1]}`]); }
  return out.sort((a, b) => b[0] - a[0]).slice(0, 4).map((o) => o[1]).join(' · ');
}
function marketPanel() {
  const r = rp(), h = r.hold || (r.hold = {}), P = GOODS.map((_, g) => priceAt(SYS, SYS.loc, g)), e = ECO[SYS.econ], kd = KIND[SYS.locs[SYS.loc].t];
  const pxm = r.px || (r.px = {}); pxm[mkey()] = { n: SYS.locs[SYS.loc].name, p: P, t: Date.now() }; const ks = Object.keys(pxm); if (ks.length > 14) delete pxm[ks.sort((a, b) => pxm[a].t - pxm[b].t)[0]];
  save();
  const ev = mktEvent(SYS);
  panel('Market', `${SYS.econ} · ${ev[1] ? 'shortage of' : 'glut of'} ${GOODS[ev[0]][0]} across ${SYS.name} today · ${ST.credits} cr · hold ${holdN()}/${holdMax()}`, GOODS.map(([n], g) => ({ name: n, kind: `${P[g]} cr · you hold ${h[g] || 0}`, desc: (e[0].includes(g) || kd[0].includes(g) ? 'Made here: cheap. ' : e[1].includes(g) || kd[1].includes(g) ? 'Wanted here: sells high. ' : '') + (r.cost && r.cost[g] && h[g] ? `You paid about ${Math.round(r.cost[g])} each.` : ''), run: () => goodPanel(g) })), 'Press a number for a good · J to close');
}
function goodPanel(g) {
  const r = rp(), h = r.hold || (r.hold = {}), c = r.cost || (r.cost = {}), p = priceAt(SYS, SYS.loc, g), sell = Math.round(p * .92), have = h[g] || 0, room = roomFor(IT['g' + g]), key = mkey();
  const buy = (n) => () => { n = Math.min(n, room, Math.floor(ST.credits / p)); if (n < 1) return tip(room < 1 ? 'The hold is full' : 'Not enough credits', 3000); c[g] = ((c[g] || 0) * have + p * n) / (have + n); h[g] = have + n; ST.credits -= p * n; stock(key, g, -n); save(); showCargo(); goodPanel(g); };
  const sel = (n) => () => { n = Math.min(n, have); if (n < 1) return; const pr = Math.round((sell - (c[g] || sell)) * n); h[g] = have - n; ST.credits += sell * n; stock(key, g, n); gain({ xp: Math.max(1, Math.round(pr / 12)), rep: pr > 60 ? 1 : 0 }); tip(`Sold ${n} ${GOODS[g][0]} · ${pr >= 0 ? 'profit' : 'loss'} ${Math.abs(pr)} credits`, 4000); goodPanel(g); };
  panel(GOODS[g][0], `${p} to buy · ${sell} to sell · you hold ${have} · ${ST.credits} credits · room for ${room}`, [{ name: 'Buy 1', kind: p + ' cr', run: buy(1) }, { name: 'Buy 5', kind: p * 5 + ' cr', run: buy(5) }, { name: 'Fill the hold', kind: '', run: buy(999) }, { name: 'Sell 1', kind: sell + ' cr', run: have ? sel(1) : undefined }, { name: 'Sell all', kind: sell * have + ' cr', run: have ? sel(999) : undefined }, { name: 'Back to the market', kind: '', run: marketPanel }], 'Press a number · J to close');
}

// ---- the hold: one slot grid for ore, trade goods and ship supplies. Each slot takes one kind, stacked to a limit. ----
const SUP = [['Fuel cell', '#ffd84a', 'fuel', 40, 36], ['Energy cell', '#ff6a3d', 'weapons', 50, 30], ['Repair kit', '#c3ccdc', 'hull', 35, 50]];   // name, colour, what it fills, by how much, base price
const ITEMS = [];
for (let t = 1; t < 6; t++) ITEMS.push({ id: 'o' + t, name: TIERS[t], col: TCSS[t], stack: [0, 20, 20, 15, 6, 3][t], kind: 'ore', get: () => cargo[t], set: (v) => { cargo[t] = v; }, sell: () => TVAL[t], buy: t < 4 ? () => Math.round(TVAL[t] * 2.4 + 2) : null, shape: 'gem' });
GOODS.forEach(([n], g) => ITEMS.push({ id: 'g' + g, name: n, col: '#d8c9a6', stack: 10, kind: 'good', get: () => (rp().hold || {})[g] || 0, set: (v) => { (rp().hold || (rp().hold = {}))[g] = v; }, sell: () => Math.round(priceAt(SYS, SYS.loc, g) * .92), buy: () => priceAt(SYS, SYS.loc, g), shape: 'crate' }));
SUP.forEach(([n, col, , , p], s) => ITEMS.push({ id: 's' + s, name: n, col, stack: 5, kind: 'sup', get: () => (ST.sup || (ST.sup = [0, 0, 0]))[s], set: (v) => { (ST.sup || (ST.sup = [0, 0, 0]))[s] = v; }, sell: () => Math.round(p * .5), buy: () => p, shape: 'cell', use: s }));
const IT = {}; for (const it of ITEMS) IT[it.id] = it;
const holdSlots = () => Math.max(6, 10 + 4 * upLv('bay') + (typeof shipMul === 'function' ? shipMul('hold') : 0));
const slotsUsed = () => ITEMS.reduce((a, it) => a + Math.ceil(it.get() / it.stack), 0);
function roomFor(it) { const n = it.get(), part = n % it.stack ? it.stack - n % it.stack : 0; return Math.max(0, part + (holdSlots() - slotsUsed()) * it.stack); }
function addItem(id, n) { const it = IT[id], k = Math.min(n, roomFor(it)); if (k > 0) it.set(it.get() + k); return k; }
function useSup(s) {
  const it = IT['s' + s]; if (!it.get()) return;
  const lv = s === 0 ? ST.fuel : s === 1 ? ST.wen : ST.hull; if (lv >= 99) return tip(`${SUP[s][2][0].toUpperCase() + SUP[s][2].slice(1)} is already full`, 2500);
  it.set(it.get() - 1); sysAdd(s === 0 ? 1 : s === 1 ? 2 : 0, SUP[s][3]); gFlash[s === 0 ? 1 : s === 1 ? 2 : 0] = 1; convSnd(s === 0 ? 1 : s === 1 ? 2 : 0);
  pop(`${SUP[s][0].toUpperCase()} · +${SUP[s][3]} ${SUP[s][2].toUpperCase()}`, SUP[s][1]); showCargo(); save();
}

// ---- cues: something gained shows as a rising line in its colour, with a chime that grows with the find ----
const POPS = []; const gFlash = [0, 0, 0];
function pop(s, col) { pipLog(s); POPS.push({ s, col, t: performance.now() }); if (POPS.length > 4) POPS.shift(); }
function oreCue(tier, n) {
  pop(`+${n} ${TIERS[tier].toUpperCase()}`, TCSS[tier]);
  const e = $('cargo'); if (e) { e.classList.remove('gain'); void e.offsetWidth; e.classList.add('gain'); }
  if (!AC || AC.state !== 'running') return;
  const t = AC.currentTime, base = [0, 72, 76, 79, 84, 88][tier];
  [0, 4, 7, 12, 16].slice(0, 2 + Math.min(3, tier)).forEach((iv, k) => note(mf(base + iv), t + k * .055, .05 + .012 * tier, k & 1 ? 'triangle' : 'sine', .35 + .1 * tier, 1));
  burst(t, .05, .03, 7000, 4000, 'highpass');
}
function convSnd(k) {
  if (!AC || AC.state !== 'running') return;
  const t = AC.currentTime, b = [64, 67, 71][k];
  note(mf(b), t, .05, 'sine', .3, 0); note(mf(b + 7), t + .08, .05, 'sine', .35, 0); note(mf(b + 12), t + .16, .045, 'triangle', .5, 1);
  burst(t, .35, .025, 300, 2400, 'bandpass');
}
let convTick = 0;
function workTick(k, dt) {                                   // a soft rising tick while a swarm works, pitched by how full the gauge is
  convTick -= dt; if (convTick > 0 || !AC || AC.state !== 'running') return; convTick = .45;
  note(mf(60 + [0, 3, 7][k] + Math.round(sysLv(k) / 100 * 12)), AC.currentTime, .022, 'sine', .12, 0);
}
function popDraw(c, T) {
  const now = performance.now();
  for (let i = POPS.length - 1, row = 0; i >= 0; i--, row++) { const p = POPS[i], a = (now - p.t) / 1900; if (a >= 1) { POPS.splice(i, 1); continue; }
    c.globalAlpha = Math.min(1, (1 - a) * 2.2); T(p.s, 500, 566 - a * 46 - row * 30, 22, 'center', p.col, 700); }
  c.globalAlpha = 1;
}

// ---- oxygen: the air aboard runs down slowly (about 45 minutes a tank, faster through a damaged hull) and only a planet's
// atmosphere refills it: the scoops open as soon as you're below the clouds. Run dry and your sight narrows, then you black out
// and a rescue tug tows you to the system gate for a fee. Generous, but it sends you down to the worlds now and then.
let o2Hyp = 0, o2Out = 0, o2Fill = 0;
const o2Planet = () => { let best = -1, bd = -2; for (let k = 0; k < 3; k++) { if (!(SYS.pr[k] > 0)) continue; const d = SYS.pl[k * 4] * sFx + SYS.pl[k * 4 + 1] * sFy + SYS.pl[k * 4 + 2] * sFz; if (d > bd) { bd = d; best = k; } } return best; };   // the world most nearly ahead
function o2Tick(dt) {
  if (ST.o2 == null) ST.o2 = 100;
  if (SYS.atm) {                                                // scoops open below the clouds
    if (ST.o2 < 100) { if (!o2Fill) { o2Fill = 1; pop('O2 SCOOPS OPEN · REFILLING', '#7fd8ff'); } ST.o2 = Math.min(100, ST.o2 + dt * 6.5); if (ST.o2 >= 100) { pop('O2 FULL', '#7fd8ff'); save(); } }
    o2Out = 0;
  } else {
    o2Fill = 0; const was = ST.o2;
    ST.o2 = Math.max(0, ST.o2 - dt * (100 / 2700) * (ST.hull < 50 ? 1.6 : 1));
    if (Math.floor(was / 10) !== Math.floor(ST.o2 / 10)) save();
    if (ST.o2 <= 0) {
      if (!o2Out) tip('Oxygen gone · you have under a minute · any planet\'s air will do', 8000);
      o2Out += dt;
      if (o2Out > 45) {                                         // blackout: the tug finds you
        o2Out = 0; const fee = Math.round(ST.credits * .1); ST.credits -= fee; ST.o2 = 45; thr = 0; vx = vy = vz = 0;
        if (SYS.loc !== 0) arrive(SYS.sec, 0, 1); showCargo(); save();
        tip(`You blacked out. A rescue tug found your beacon and towed you to the ${SYS.name} gate · air at 45%${fee ? ' · ' + fee + ' credits for the tow' : ''}.`, 10000);
      }
    } else o2Out = 0;
  }
  const want = ST.o2 <= 0 ? Math.min(1, .35 + o2Out / 45 * .65) : ST.o2 < 8 ? (8 - ST.o2) / 8 * .3 : 0;   // hypoxia: the world narrows and greys
  o2Hyp += (want - o2Hyp) * Math.min(1, dt * 1.5);
}

// ---- survival advice: the right line at the right moment, never more than one every few seconds ----
let hurtSrc = '', hurtSrcT = 0, advT = 0; const advLast = { fuel: 101, hull: 101, wen: 101, o2: 101 };
const kmTo = (k) => swN[k] ? (Math.sqrt(swN[k][0]) / 1000).toFixed(1) + ' km' : '';
function swarmAdvice(k) {
  const S = SWM[k], ore = TIERS[S[2][0]], have = S[2].reduce((a, t) => a + cargo[t], 0), sup = IT['s' + [2, 0, 1][k]].get();
  const where = swN[k] ? `${S[0].toLowerCase()} ${kmTo(k)} (now your target)` : `${S[0].toLowerCase()} (${['silver', 'yellow', 'red'][k]}: none on scope, try another place)`;
  return (sup ? `use a ${SUP[[2, 0, 1][k]][0].toLowerCase()} (I) · ` : '') + (have ? `${where}, you carry ${have} ore` : `mine ${ore} (mining laser yields most), then find ${S[0].toLowerCase()}`);
}
function advise(lv, key, steps, msg) {
  const was = advLast[key]; advLast[key] = lv;
  for (const s of steps) if (was > s && lv <= s) { if (performance.now() > advT) { advT = performance.now() + 3500; tip(msg(s), 7000); } return; }
}
function advTick() {
  if (!flying()) return;
  advise(ST.fuel, 'fuel', [25, 10], (s) => `Fuel ${s}% · ${s === 10 ? 'ease off the boost · ' : ''}${swarmAdvice(1)}`);
  const cause = tm - hurtSrcT < 8 ? (hurtSrc === 'storm' ? 'get out of the ion storm · ' : hurtSrc === 'raider' ? 'break away from the raider, or fight with the lance · ' : hurtSrc === 'rock' ? 'slow down among the rocks · ' : '') : '';
  advise(ST.hull, 'hull', [35, 20, 10], (s) => s >= 60 ? `Hull ${s}% · ${cause || 'menders (silver) repair with Ferrite'}` : `${s <= 10 ? 'HULL FAILING' : 'Hull ' + s + '%'} · ${cause}${swarmAdvice(0)}${s <= 20 && trader ? ' · or the trader repairs' : ''}`);
  advise(ST.wen, 'wen', [15], (s) => `Weapons ${s}% · the mining laser (4) runs on almost nothing · ${swarmAdvice(2)}`);
  advise(ST.o2 == null ? 100 : ST.o2, 'o2', [30, 15, 5], (s) => { const k = o2Planet(); if (k >= 0 && !SYS.atm) navId = 'p' + k; return `${s <= 5 ? 'OXYGEN CRITICAL' : 'Oxygen ' + s + '%'} · fly down into a planet's air to refill${k >= 0 ? ': ' + SYS.planets[k].name + ' is now your target, hold course on it' : ''}`; });
}

// ---- screens: the hold (I), and trading as two grids side by side ----
const invP = document.createElement('div'); invP.style.cssText = 'position:fixed;inset:0;z-index:31;display:none;overflow:auto;background:linear-gradient(160deg,rgb(var(--hcr) / .07),transparent 45%),rgba(3,7,11,.74);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#dcecf6;font:14px/1.4 "Segoe UI",system-ui,sans-serif;padding:5vh 5vw;letter-spacing:.03em'; document.body.appendChild(invP);
let invMode = '', invSel = '', invOpen = 0;
const icon = (it) => it.shape === 'gem' ? `<i style="display:block;width:26px;height:26px;margin:6px auto 4px;background:${it.col};clip-path:polygon(50% 0,100% 38%,80% 100%,20% 100%,0 38%);box-shadow:0 0 14px ${it.col}"></i>`
  : it.shape === 'cell' ? `<i style="display:block;width:16px;height:28px;margin:5px auto 3px;border:2px solid ${it.col};border-radius:4px;background:linear-gradient(0deg,${it.col} 60%,transparent 60%)"></i>`
  : `<i style="display:block;width:26px;height:22px;margin:8px auto 4px;border:2px solid ${it.col};background:repeating-linear-gradient(90deg,transparent 0 5px,${it.col}33 5px 7px)"></i>`;
function tiles(list, side) {        // list of [item, count, price?]; one tile per stack
  let h = '';
  for (const [it, n, pr] of list) { let left = n; do { const k = side === 'shop' ? n : Math.min(left, it.stack); left -= k;
    h += `<button data-a="${side}" data-id="${it.id}" style="position:relative;width:92px;height:92px;margin:0 6px 6px 0;padding:2px;background:${invSel === it.id && side === 'hold' ? '#16303c' : '#0b1820'};border:1px solid ${it.col}55;color:#dcecf6;font:11px/1.2 system-ui;cursor:pointer;vertical-align:top">${icon(it)}${it.name}<b style="position:absolute;right:5px;top:3px;font-size:12px;color:${it.col}">${side === 'shop' ? '' : k}</b>${pr != null ? `<span style="position:absolute;left:0;right:0;bottom:3px;color:#ffb44a">${pr} cr</span>` : ''}</button>`; } while (left > 0 && side !== 'shop'); }
  return h;
}
function holdList() { return ITEMS.filter((it) => it.get() > 0).map((it) => [it, it.get()]); }
function invDraw() {
  const used = slotsUsed(), cap = holdSlots(), g = (v, col, n) => `<span style="display:inline-block;margin-right:18px">${n} <b style="color:${col}">${v | 0}%</b></span>`;
  const head = `<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap"><h2 style="font-weight:300;letter-spacing:.3em;margin:0">${invMode === 'hold' ? 'HOLD' : invMode === 'trader' ? 'TRADER' : 'MARKET'}</h2><button data-a="close" style="background:none;border:1px solid #63e2ff;color:#63e2ff;padding:6px 16px;cursor:pointer">Done</button></div>
    <p style="color:#9fb6c4;margin:8px 0 16px">${ST.credits} credits · <b style="color:${used >= cap ? '#ff5d4f' : '#dcecf6'}">${used}/${cap} slots</b> · ${g(ST.hull, '#c3ccdc', 'Hull')}${g(ST.fuel, '#ffd84a', 'Fuel')}${g(ST.wen, '#ff6a3d', 'Weapons')}${g(ST.spice || 0, '#ff3b5c', 'Spice')}</p>`;
  const empty = Math.max(0, cap - used), slotsH = (h) => h + `<span style="display:inline-block;width:92px;height:92px;margin:0 6px 6px 0;border:1px dashed #2a3c46;vertical-align:top"></span>`.repeat(Math.min(empty, 40));
  if (invMode === 'hold') {
    const it = IT[invSel], n = it ? it.get() : 0;
    const act = it && n ? `<div style="margin:10px 0 18px"><b style="color:${it.col}">${it.name}</b> × ${n} &nbsp; ${it.use != null ? `<button data-a="use" style="margin-right:8px">Use one (+${SUP[it.use][3]} ${SUP[it.use][2]})</button>` : ''}<button data-a="drop1" style="margin-right:8px">Jettison one</button><button data-a="dropall">Jettison all</button></div>`
      : `<div style="margin:10px 0 18px;color:#9fb6c4">Click a stack to use or jettison it. Ore is worth most to traders; swarms turn it into hull, fuel and weapons energy. The cargo bay upgrade adds four slots.</div>`;
    invP.innerHTML = `<div style="max-width:1000px;margin:auto">${head}${slotsH(tiles(holdList(), 'hold'))}${act}<p style="color:#6f8796">I or Esc to close</p></div>`;
  } else {
    const shop = ITEMS.filter((it) => it.buy && (invMode === 'market' ? it.kind !== 'ore' : it.kind !== 'good')).map((it) => [it, 0, it.buy()]);
    const sellH = holdList().map(([it, n]) => [it, n, it.sell()]);
    invP.innerHTML = `<div style="max-width:1200px;margin:auto">${head}<div style="display:flex;gap:4vw;flex-wrap:wrap"><div style="flex:1;min-width:300px"><h3 style="font-weight:600;letter-spacing:.25em;font-size:13px;color:#63e2ff">YOUR HOLD · CLICK TO SELL ONE · SHIFT-CLICK THE STACK</h3>${slotsH(tiles(sellH, 'hold'))}</div>
      <div style="flex:1;min-width:300px"><h3 style="font-weight:600;letter-spacing:.25em;font-size:13px;color:#ffb44a">${invMode === 'trader' ? 'TRADER' : 'MARKET'} · CLICK TO BUY ONE · SHIFT-CLICK FIVE</h3>${tiles(shop, 'shop')}</div></div><p style="color:#6f8796">${invMode === 'market' ? 'Prices follow what this place makes and lacks. ' : ''}I or Esc to close</p></div>`;
  }
}
function invShow(mode) { invMode = mode; invSel = ''; invOpen = 1; invP.style.display = 'block'; try { document.exitPointerLock(); } catch {} K.KeyW = K.KeyS = 0; invDraw(); }
function invClose() { invOpen = 0; invP.style.display = 'none'; save(); showCargo(); }
invP.onclick = (e) => {
  const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, it = IT[b.dataset.id];
  if (a === 'close') return invClose();
  if (a === 'hold' && invMode === 'hold') invSel = invSel === it.id ? '' : it.id;
  else if (a === 'hold') { const n = e.shiftKey ? it.get() : 1, pr = it.sell(); if (it.get() >= n && n > 0) { it.set(it.get() - n); ST.credits += pr * n; if (it.kind === 'good') { const g = +it.id.slice(1); stock(mkey(), g, n); } note(mf(76), AC ? AC.currentTime : 0, .03, 'sine', .2, 0); } }
  else if (a === 'shop') { const want = e.shiftKey ? 5 : 1, pr = it.buy(), n = Math.min(want, roomFor(it), Math.floor(ST.credits / pr)); if (n < 1) tip(roomFor(it) < 1 ? 'No room in the hold' : 'Not enough credits', 2500); else { it.set(it.get() + n); ST.credits -= pr * n; if (it.kind === 'good') stock(mkey(), +it.id.slice(1), -n); note(mf(71), AC ? AC.currentTime : 0, .03, 'sine', .2, 0); } }
  else if (a === 'use' && IT[invSel]) useSup(IT[invSel].use);
  else if (a === 'drop1' && IT[invSel]) IT[invSel].set(Math.max(0, IT[invSel].get() - 1));
  else if (a === 'dropall' && IT[invSel]) { IT[invSel].set(0); invSel = ''; }
  save(); showCargo(); invDraw();
};

// ---- the second voice of the score: 808s, trap hats with rolls, and a pentatonic lead. It trades eight bars with the arpeggio. ----
const SCL = [[0, 3, 5, 7, 10, 12, 15, 17, 19], [3, 5, 7, 10, 12, 15, 17, 19, 22], [0, 2, 3, 7, 8, 12, 14, 15, 19], [0, 2, 5, 7, 10, 12, 14, 17, 19]];
// by kind of place: drums (0 none, 1 in turns, 2 throughout), scale, lead voice, lead octave, hats (0 eighths, 1 sixteenths, 2 triplets), 808 figure, how busy the lead is
const STY = [[1, 1, 'triangle', 0, 0, 0, .5], [0, 2, 'sine', 12, 0, 1, .7], [2, 0, 'square', -12, 1, 2, .55], [0, 3, 'sine', 0, 0, 1, .28], [2, 0, 'triangle', 0, 1, 0, .62], [1, 2, 'sawtooth', -12, 2, 2, .4], [1, 1, 'sine', 12, 2, 1, .75], [2, 3, 'triangle', 0, 0, 2, .5]];
const K8 = [[0, 6, 10, 13], [0, 10], [0, 3, 6, 11, 14]];
let leadI = 4, hatRoll = 0, k8g = null;
function hat(t, v) { const g = AC.createGain(), f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v * .5, t + .002); g.gain.exponentialRampToValueAtTime(.0001, t + .035); f.connect(g).connect(AG); for (const hz of [7350, 10870]) { const o = AC.createOscillator(); o.type = 'square'; o.frequency.value = hz; o.connect(f); o.start(t); o.stop(t + .04); } }
function beat808(t, s, e, ch, solo) {
  if (solo) return;
  const S = SYS.atm ? [0, SYS.atm, 'sine', 12, 0, 1, .8] : STY[REG & 7], drums = grooveAt(bar) === 2 && (S[0] === 2 || S[0] === 1 && (bar >> 2 & 1)), spb = 60 / TMP() / 4;
  const hsh = (hs(Math.imul(bar, 31) + s * 7 + REG) >>> 0) / 4294967296;
  if (drums) {
    const fig = K8[S[5]], fi = fig.indexOf(s);
    if (e > .1 && fi >= 0 && (fi < 2 || hsh < .6)) {            // the 808: a sine that drops onto its note and rings; a new one cuts the last
      const o = AC.createOscillator(), g = AC.createGain(), f = mf(24 + sn(ch + [0, 0, 2, 4, 3][fi]));
      if (k8g) { k8g.gain.cancelScheduledValues(t); k8g.gain.setTargetAtTime(0, t, .012); }
      o.frequency.setValueAtTime(f * 2.2, t); o.frequency.exponentialRampToValueAtTime(f, t + .05); g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.1 + .05 * e, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + (fi ? .4 : .65));
      o.connect(g).connect(AG); o.start(t); o.stop(t + .8); k8g = g;
    }
    if (e > .1 && s === 8) { const o = AC.createOscillator(), q = AC.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(170, t + .09); q.gain.setValueAtTime(.0001, t); q.gain.linearRampToValueAtTime(.05, t + .004); q.gain.exponentialRampToValueAtTime(.0001, t + .16); o.connect(q).connect(AG); o.start(t); o.stop(t + .18); }   // a tuned rim knock on the backbeat, not noise
    if (s === 12) hatRoll = hsh < .5 ? (hsh < .2 ? 3 : 2) : 0;
    const v = .007 + .008 * e;
    if (S[4] === 2) { if (!(s & 1)) for (let k = 0; k < 3; k++) hat(t + k * spb * 2 / 3, v * (k ? .6 : 1)); }
    else { const n = s >= 12 && hatRoll && e > .35 ? hatRoll + 1 : s & 1 ? (S[4] === 1 || e > .5 ? 1 : 0) : 1; for (let k = 0; k < n; k++) hat(t + k * spb / n, v * (k ? .6 : 1)); }
  }
  if ((s === 0 || s === 3 || s === 6 || s === 10 || s === 12 || s === 14 && S[6] > .6) && hsh < S[6]) {
    leadI = Math.max(0, Math.min(8, leadI + [-2, -1, 1, 1, 2, -1][hsh * 97 % 6 | 0]));
    note(mf(72 + S[3] + SCL[S[1] & 3][leadI]), t, (.012 + .008 * e) * (S[2] === 'square' || S[2] === 'sawtooth' ? .45 : 1), S[2], S[0] ? .22 : .5, 1);
  }
}

// ---- the score differs by place: tempo, chords, whether the arpeggio plays at all ----
const TMPS = [108, 92, 140, 76, 125, 100, 132, 150], ARPVS = [1, .5, 1, 0, 1, .35, .7, 1];
const TMP = () => SYS.atm ? 84 : TMPS[REG & 7], ARPV = () => SYS.atm ? .5 : ARPVS[REG & 7];
// Everything is written in scale steps of the natural minor key, so no part can land outside it, whatever the chord.
const AEO = [0, 2, 3, 5, 7, 8, 10];
const sn = (d) => { const o = Math.floor(d / 7); return AEO[d - o * 7] + 12 * o; };          // scale step → semitones above the tonic
// chord roots as scale steps (0 = i, 2 = III, 3 = iv, 4 = v, 5 = VI, 6 = VII): the progressions pop and film music lean on
const PROGD = [[0, 5, 2, 6], [0, 6, 5, 6], [0, 3, 5, 4], [5, 6, 0, 0], [0, 5, 3, 6], [0, 2, 6, 5], [0, 0, 5, 6], [3, 5, 6, 0], [0, 4, 5, 3], [5, 3, 0, 6]];
// arpeggio shapes, steps from the chord root (2 third, 4 fifth, 6 seventh, 7 octave, 8 ninth, 9 tenth); -1 rests
const ARPS = [
  [0, 2, 4, 7, 0, 2, 4, 7, 0, 2, 4, 7, 0, 2, 4, 9],            // straight up
  [0, 2, 4, 7, 9, 7, 4, 2, 0, 2, 4, 7, 9, 7, 4, 2],            // up and down
  [0, 7, 4, 7, 2, 7, 4, 7, 0, 7, 4, 7, 2, 7, 4, 7],            // trance pedal on the octave
  [0, 4, 2, 4, 0, 4, 2, 4, 0, 4, 2, 4, 0, 4, 2, 4],            // alberti
  [0, -1, -1, 4, -1, -1, 7, -1, 9, -1, -1, 4, -1, -1, 7, -1],  // three-three-two
  [0, 7, 0, 7, 0, 7, 0, 9, 0, 7, 0, 7, 0, 7, 4, 7],            // octave pump
  [0, 2, 4, 6, 7, 6, 4, 2, 0, 2, 4, 6, 7, 9, 8, 6],            // seventh chord, rolling
  [0, -1, 4, -1, 7, -1, 4, 2, 0, -1, 4, -1, 9, 7, 4, -1],      // call and answer
  [7, 4, 2, 0, 7, 4, 2, 0, 9, 7, 4, 2, 9, 7, 4, 2],            // falling
  [0, 2, 4, 2, 7, 4, 9, 4, 8, 4, 7, 4, 2, 4, 0, 4]];           // broken, around the fifth
// drum grooves by step: kick, snare or clap, closed hats, open hats, bass steps (+12 marks an octave jump)
const GROOVES = [
  { k: [0, 4, 8, 12], c: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], o: [2, 6, 10, 14], b: [2, 6, 10, 14], clap: 1 },        // four on the floor
  { k: [0, 6, 10], c: [4, 12], g: [7, 15], h: [0, 2, 4, 6, 8, 10, 12, 14], o: [14], b: [0, 3, 6, 10] },                  // breakbeat
  { k: [], c: [8], h: [], o: [], b: [] },                                                                                // half-time trap: the 808 voice carries it
  { k: [0, 8], c: [3, 6, 11, 14], h: [0, 2, 4, 6, 8, 10, 12, 14], o: [], b: [0, 3, 6, 8, 11, 14] },                       // dembow
  { k: [0, 8], c: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], o: [], b: [0, 2, 4, 6, 8, 10, 12, 14], oct: 1, clap: 1 },     // synthwave, octave bass
  { k: [0, 10], c: [4, 12], h: [0, 3, 6, 8, 11, 14], o: [6], b: [0, 10, 13] }];                                          // two-step
const GBASE = [4, 2, 0, 5, 1, 3, 0, 1];                         // each kind of place has its home groove, and wanders from it
const chordAt = (b) => { const sec = b >> 4; return PROGD[(SYS.atm ? 3 : (REG + (sec & 1) * 4)) % PROGD.length][b & 3]; };
const arpAt = (b) => { const sec = b >> 3, pool = [REG % 10, (REG * 3 + 1) % 10, (REG * 7 + 4) % 10, (REG + 6) % 10]; return ARPS[pool[sec & 3]]; };
const grooveAt = (b) => SYS.atm ? 5 : (b >> 4 & 3) === 3 ? (GBASE[REG & 7] + 3) % GROOVES.length : GBASE[REG & 7];
function kick(t, v) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(38, t + .11); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + .22); o.connect(g).connect(AG); o.start(t); o.stop(t + .25); }
function snare(t, v, clap) {
  if (clap) for (let k = 0; k < 3; k++) burst(t + k * .011, k < 2 ? .02 : .12, v * (k < 2 ? .7 : 1), 1500, 1100, 'bandpass');
  else { burst(t, .13, v, 2600, 1100, 'bandpass'); const o = AC.createOscillator(), g = AC.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(160, t + .06); g.gain.setValueAtTime(v * .9, t); g.gain.exponentialRampToValueAtTime(.0001, t + .1); o.connect(g).connect(AG); o.start(t); o.stop(t + .12); }
}
function groove(t, s, e, rd, spb) {                              // the faster you go, the more of the kit plays
  const G = GROOVES[grooveAt(bar)], S = SYS.atm ? [1] : STY[REG & 7]; if (S[0] === 0 && e < .55) return;
  if (e > .3 && G.k.includes(s)) kick(t, .1 + .04 * e);
  if (e > .5 && G.c.includes(s)) snare(t, .035 + .02 * e, G.clap);
  if (e > .6 && G.g && G.g.includes(s)) snare(t, .012, 0);
  if (e > .15 && G.h.includes(s)) hat(t, .006 + .008 * e); else if (e > .75 && (s & 1) && G.h.length) hat(t, .004);            // flat out: ghost hats fill the gaps
  if (e > .65 && G.o.includes(s)) burst(t, .12, .012, 9000, 6000, 'highpass');
  if (e > .25 && G.b.includes(s)) { const o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter(), up = G.oct && (s & 2) ? 12 : 0; o.type = 'sawtooth'; o.frequency.value = mf(24 + up + sn(rd)); f.frequency.value = 170 + 280 * e;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.045 + .045 * e, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + spb * 1.6); o.connect(f).connect(g).connect(AG); o.start(t); o.stop(t + spb * 1.8); }
}

// ---- shields: they take the knocks first and come back after four quiet seconds; the hull does not ----
let shield = 100, shHit = -99;
const shMax = () => (100 + 40 * upLv('shd')) * (typeof shipMul === 'function' ? shipMul('sh') : 1);
function shieldTake(a) { shHit = tm; const t = Math.min(shield, a); shield -= t; return a - t; }

// ---- ion storms: lightning that charges your capacitors (credits) and eats your shields ----
let STORM = null, stT = 2;
function stormTick(dt, fly) {
  if (SYS.a.fog > .9 && Math.random() < dt * .22) { const a = Math.random() * 6.283, y = Math.random() - .5, d = 3500 + Math.random() * 3000; fxAdd(px + Math.cos(a) * d, py + y * d * .6, pz + Math.sin(a) * d, 500 + Math.random() * 700, SYS.pal[6] * .12 + .04, SYS.pal[7] * .12 + .04, SYS.pal[8] * .12 + .05); }   // far-off lightning inside the haze
  const S = STORM; if (!S) return;
  const x = S.x - px, y = S.y - py, z = S.z - pz, d = Math.hypot(x, y, z);
  put(DPa, x, y, z, S.r * 1.1, 0, 0, 0, .31, .05, .025, .09, 1); put(DPa, x + S.r * .3, y - S.r * .2, z, S.r * .8, 0, 0, 0, .67, .03, .02, .07, 1);
  if (Math.random() < dt * 1.4) { const j = () => (Math.random() - .5) * S.r * 1.2; put(DPa, x + j(), y + j() * .5, z + j(), S.r * (.15 + Math.random() * .25), 0, 0, 0, Math.random(), .5, .45, 1, 0); }   // sheet lightning, seen from far off
  if (!fly || d > S.r) return;
  fogX = Math.max(fogX, .002 * (1 - d / S.r));
  if (!S.warned) { S.warned = 1; tip('Ion storm: each strike pays into your capacitors and comes out of your shields. Leave before they fail.', 8000); }
  stT -= dt; if (stT <= 0) { stT = 1.2 + Math.random() * 2.6; hurtSrc = 'storm'; hurtSrcT = tm; hurt(9); flash = Math.max(flash, .3); trauma = Math.min(1, trauma + .35); thud(.3); gain({ cr: 7, xp: 2 }); }
}

// ---- anything you can target will answer, after its fashion ----
const hailed = {};
function hailThing(c, d) {
  const here = SYS.locs[SYS.loc].name, once = (k, o) => { if (!hailed[mkey() + k]) { hailed[mkey() + k] = 1; gain(o); } };
  if (c.kind === 'planet') {
    const k = +c.id[1], p = SYS.planets[k], loc = SYS.locs.findIndex((l) => l.atm === k + 1), P = loc >= 0 ? GOODS.map((_, g) => [priceAt(SYS, loc, g) / GOODS[g][1], g]).sort((a, b) => a[0] - b[0]) : null;
    const list = [{ name: p.name + ' traffic', kind: p.type, desc: `"${p.orbit} AU out, ${p.moons} moons, ${p.pop && p.pop !== 'none' ? p.pop : k ? 'survey crews only' : 'harvesters in the upper cloud'}. Hold us ahead at speed and your drive will bring you down."` }];
    if (P) list.push({ name: 'Ask what sells', desc: `"${GOODS[P[0][1]][0]} is cheap down here at ${priceAt(SYS, loc, P[0][1])}. We are short of ${GOODS[P[7][1]][0]}: ${priceAt(SYS, loc, P[7][1])} a unit."`, run: () => once('pp' + k, { xp: 5 }) });
    if (rp().jobs.length < 3 && !hailed[mkey() + 'pj' + k]) list.push({ name: 'Ask for work', desc: '', run: () => { hailed[mkey() + 'pj' + k] = 1; const j = mkJob(mulberry32(SYS.salt ^ (k * 7717 + 3)), 'p' + k); rp().jobs.push(j); save(); navAuto = 1; panel(p.name, 'Traffic control', [{ name: j.title, kind: j.pay + ' cr', desc: j.text }], 'J to close'); } });
    return panel('Hail', p.name, list, 'Press a number · J to close');
  }
  if (c.kind === 'life') { const L = LIFEN[c.li]; return panel('Contact', here, [{ name: L[0][0] + L[0].slice(1).toLowerCase(), desc: L[3] }, { name: 'Hold still and listen', desc: 'The sound goes through the hull and through you. Something in the ship settles.', run: () => once('lf' + c.li, { xp: 12, hull: 6 }) }, { name: 'Answer with a scanner ping', desc: 'It answers in kind, and sheds a little bright dust as it turns away.', run: () => once('lp' + c.li, { xp: 8, min: [3, 1] }) }], 'Press a number · J to close'); }
  if (c.kind === 'station') { if (d < 3500) { comm(`${call()}, ${ctl()}, you are cleared to the outer berths. Services are open.`); return tradePanel(); } return panel('Station control', here, [{ name: ctl(), desc: `"${call()}, ${ctl()}, we read you at ${(d / 1000).toFixed(1)} kilometres. Close to within three and a half for berthing and services. Traffic is light."` }], 'J to close'); }
  if (c.kind === 'settle') return tradePanel();
  if (c.kind === 'gate') return panel('Gate authority', here, [{ name: 'Gate control', desc: `"You are ${(d / 1000).toFixed(1)} km out. ${reach(SYS.sec).length} routes open from here, ${SYS.locs.length - 1} local. No toll for ${rankName().toLowerCase()}s."` }, ST.credits >= 25 ? { name: 'Ask for a tow', kind: '25 cr', desc: 'A tug brings you in to the gate.', run: () => { ST.credits -= 25; px = 0; py = 30; pz = 760; vx = vy = vz = 0; showCargo(); save(); } } : { name: 'A tow costs 25 credits', desc: '' }], 'Press a number · J to close');
  if (c.kind === 'rock') { const R = mulberry32((c.x * 13 + c.z * 7) | 0), t = 2 + (R() * 4 | 0); once('rk' + (c.x | 0), { xp: 6 }); return panel('Assay', 'Long-range spectrometer', [{ name: 'Composition', desc: `Strong ${TIERS[t]} lines, with ${TIERS[Math.max(1, t - 1)]} in the crust. ${(d / 1000).toFixed(1)} km. Break the shell and collect what comes out.` }], 'J to close'); }
  if (c.kind === 'storm') return panel('Weather', here, [{ name: 'Automated buoy', desc: `"Ion cell, ${(STORM.r / 1000).toFixed(1)} km across. Strikes every few seconds inside. Capacitor harvesting is legal and inadvisable."` }], 'J to close');
  if (c.kind === 'wreck') return panel('Wreck', here, [{ name: 'No answer', desc: 'A carrier tone and nothing else. The recorder will have the rest.' }], 'J to close');
  once('sg', { xp: 3 }); panel('Signal', here, [{ name: 'It answers', desc: `Your hail comes back a half-second late, pitched down. ${(d / 1000).toFixed(1)} km. Whatever it is, it is listening.` }], 'J to close');
}

// ---- the star map grows as you travel: every system you have entered, the routes between them, and where the unknown begins ----
const mapP = document.createElement('div'); mapP.style.cssText = 'position:fixed;inset:0;z-index:25;display:none;background:rgba(2,5,9,.95)'; document.body.appendChild(mapP);
const mapC = document.createElement('canvas'); mapC.style.cssText = 'width:100%;height:100%'; mapP.appendChild(mapC); let mapN = [];
mapP.onclick = (e) => { let hit = null; for (const n of mapN) if (Math.hypot(e.clientX - n.x, e.clientY - n.y) < 26) hit = n; if (hit && !sameSec(hit.sec, SYS.sec)) { rp().course = hit.sec.slice(); save(); navT = 0; routeK = ''; tip('Course plotted: ' + hit.name, 4000); } mapP.style.display = 'none'; };
function starMap() {
  if (mapP.style.display !== 'none') { mapP.style.display = 'none'; return; }
  mapP.style.display = 'block'; const w = mapC.width = innerWidth, h = mapC.height = innerHeight, c = mapC.getContext('2d'), key = (s) => s.join(',');
  const known = new Map(); for (const v of Object.values(ST.visited)) if (v.sec) known.set(key(v.sec), v);
  const nodes = new Map(); let ext = 2;
  for (const v of known.values()) { nodes.set(key(v.sec), { sec: v.sec, v }); for (const n of reach(v.sec)) if (!nodes.has(key(n))) nodes.set(key(n), { sec: n, v: known.get(key(n)) }); }
  for (const n of nodes.values()) ext = Math.max(ext, Math.abs(n.sec[0] - SYS.sec[0]) + .4 * Math.abs(n.sec[1] - SYS.sec[1]) + 1, Math.abs(n.sec[2] - SYS.sec[2]) + .5 * Math.abs(n.sec[1] - SYS.sec[1]) + 1);
  const sx = w / (2 * ext + 1), sy = (h - 90) / (2 * ext + 1), P = (s) => [w / 2 + ((s[0] - SYS.sec[0]) + (s[1] - SYS.sec[1]) * .38) * sx, h / 2 + 30 + ((s[2] - SYS.sec[2]) - (s[1] - SYS.sec[1]) * .5) * sy];
  c.clearRect(0, 0, w, h); c.font = '600 13px "Segoe UI",system-ui,sans-serif'; c.textAlign = 'center';
  c.fillStyle = '#ffb44a'; c.font = '300 22px "Segoe UI",system-ui,sans-serif'; c.textAlign = 'left'; c.fillText('S T A R   M A P', 40, 50); c.font = '500 13px "Segoe UI",system-ui,sans-serif'; c.fillStyle = 'rgba(170,215,240,.7)';
  c.fillText(`${known.size} systems entered · ${[...known.values()].filter((v) => v.charted).length} fully charted · click a system to plot a course · N closes`, 40, 74); c.textAlign = 'center';
  const want = []; for (const j of rp().jobs) { const d = jobDest(j); if (d) want.push(key(d.sec)); } if (rp().trail < 6) want.push(key(trail()[rp().trail].sec));
  c.strokeStyle = 'rgba(120,170,200,.25)'; c.lineWidth = 1;
  for (const v of known.values()) for (const n of reach(v.sec)) { const a = P(v.sec), b = P(n); c.setLineDash(known.has(key(n)) ? [] : [3, 5]); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  c.setLineDash([]);
  mapN = [];
  for (const n of nodes.values()) {
    const [x, y] = P(n.sec); mapN.push({ x, y, sec: n.sec, name: n.v ? n.v.name : 'an uncharted system' });
    const s = mkSys(sysIdAt(n.sec[0], n.sec[1], n.sec[2])), here = sameSec(n.sec, SYS.sec), col = `rgb(${s.pal[9] * 255 | 0},${s.pal[10] * 255 | 0},${s.pal[11] * 255 | 0})`;
    if (want.includes(key(n.sec))) { c.strokeStyle = '#ffb44a'; c.lineWidth = 2; c.strokeRect(x - 13, y - 13, 26, 26); }
    c.beginPath(); c.arc(x, y, n.v ? 7 : 4, 0, 6.3); if (n.v) { c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 14; c.fill(); c.shadowBlur = 0; } else { c.strokeStyle = 'rgba(170,215,240,.5)'; c.lineWidth = 1.5; c.stroke(); }
    if (here) { c.strokeStyle = '#63e2ff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 13, 0, 6.3); c.stroke(); }
    c.fillStyle = n.v ? '#e6f6ff' : 'rgba(170,215,240,.45)'; c.fillText(n.v ? s.name + (n.v.charted ? ' ✓' : ` ${n.v.locs.length}/${s.locs.length}`) : '?', x, y + 26);
    if (n.v) { c.fillStyle = 'rgba(170,215,240,.55)'; c.fillText(s.star, x, y + 42); }
  }
}

// ---- weapons: R (or the left stick click, or WPN on a touch screen) changes what the trigger does to other ships ----
// name, cone (radians), damage rate, loudness, pitch, range
const WPN = [['Gatling', .02, 1, .3, 115, 1500], ['Scatter', .09, .55, .34, 80, 800], ['Lance', .012, 2.6, .26, 190, 2600], ['Mining laser', .02, .3, .12, 420, 750], ['Seeker', .02, 1, .3, 60, 3000]];
let wpn = 0;
function wpnCycle() { wpnSet((wpn + 1) % WPN.length); }
function wpnSet(i) { if (i < 0 || i >= WPN.length) return; wpn = i; tip(`${wpn + 1} · ` + `Weapon: ${WPN[wpn][0]} · ${['amber rounds: the all-rounder', 'green shot: six at once, strips shields up close', 'violet lance: slow, fast and far, breaks hulls', 'blue mining laser: barely scratches a ship, but the best way to open rocks: more ore from every one, and almost no weapons energy', 'homing seekers: four in the rack, need a ship targeted'][wpn]}`, 3000); }

// ---- short-lived flashes: jumps and kills ----
const FXL = [];
function fxAdd(x, y, z, s, r, g, b) { FXL.push({ x, y, z, s, r, g, b, t: 0 }); }
function fxTick(dt) { for (let i = FXL.length - 1; i >= 0; i--) { const f = FXL[i]; f.t += dt; const u = f.t / .8; if (u >= 1) { FXL.splice(i, 1); continue; } const k = (1 - u) * (1 - u) * 3; put(DPa, f.x - px, f.y - py, f.z - pz, f.s * (.4 + 2.2 * u), 0, 0, 0, .4, f.r * k, f.g * k, f.b * k, 0); } }

// ---- ship systems: fuel, gun energy, hull, and the drone swarms that turn ore into all three ----
// Menders (silver) work Ferrite into hull plate, siphons (yellow) crack Pyrite into fuel, sparks (red) charge the weapons
// from Cinnabar. Any of the three ores will do at half the yield. With nothing in the hold they can only watch.
const SWM = [['MENDERS', 'hull', [1, 2, 3], 12, 8, '#c3ccdc', [.8, .86, 1]], ['SIPHONS', 'fuel', [2, 1, 3], 20, 10, '#ffd84a', [1, .82, .25]], ['SPARKS', 'weapons', [3, 2, 1], 24, 14, '#ff6a3d', [1, .32, .14]]];
const WEN = [.35, 1.6, 4, .02, 3];                                      // gun energy per shot, by weapon
let btHold = 0, nearSeen = new Set(), cHitT = -9, BLOOMS = [], bloomT = 6, drT = 0, swN = [null, null, null], swOn = -1, swCred = [0, 0, 0], swTip = [0, 0, 0], swWork = 0, strandT = 0, fuelTip = 0, sysWarn = '', sysWarnC = '', spiceAcc = 0, spiceTip = 0, btT = 0, btMax = 2, btCool = 0, raT = 0, raThr = null;
const sysLv = (k) => k === 0 ? ST.hull : k === 1 ? ST.fuel : ST.wen;
function sysAdd(k, v) { if (k === 0) ST.hull = Math.min(100, ST.hull + v); else if (k === 1) ST.fuel = Math.min(100, ST.fuel + v); else ST.wen = Math.min(100, ST.wen + v); }
function oreFor(k) { for (const t of SWM[k][2]) if (cargo[t] > 0) return t; return 0; }
function droneTick(dt, fly) {
  if (ST.fuel == null) ST.fuel = 100; if (ST.wen == null) ST.wen = 100; if (ST.spice == null || ST.spice < 10 && !ST.spiceV) { ST.spice = 60; ST.spiceV = 1; }
  drT -= dt; if (drT <= 0) { drT = .4; [LDr, LDs, LDe].forEach((L, k) => { const r = nearInst(L); swN[k] = r[0] < 1e11 ? r : null; }); }
  swOn = -1; let bd = 1e12;
  for (let k = 0; k < 3; k++) { const r = swN[k]; if (r && r[0] < 380 * 380 && r[0] < bd) { bd = r[0]; swOn = k; } }
  const spd = Math.hypot(vx, vy, vz); swWork = 0;
  if (fly && swOn >= 0) {
    const k = swOn, S = SWM[k];
    if (sysLv(k) < 99.5) {
      if (spd > 320) { if (tm > swTip[k]) { swTip[k] = tm + 20; tip(`${S[0]} close by · slow down and they will work`, 4000); } }
      else {
        if (swCred[k] <= 0) { const t = oreFor(k); if (t) { cargo[t]--; const v = S[3] * (t === S[2][0] ? 1 : .5); swCred[k] += v; showCargo(); save(); pop(`−1 ${TIERS[t].toUpperCase()} → +${v | 0} ${S[1].toUpperCase()}`, S[5]); convSnd(k); gFlash[k] = 1; } }
        if (swCred[k] > 0) { const g = Math.min(S[4] * dt, swCred[k], 100 - sysLv(k)); swCred[k] -= g; sysAdd(k, g); swWork = 1;
          if (tm > swTip[k]) { swTip[k] = tm + 25; tip(`${S[0]} at work: ${TIERS[S[2][0]]} into ${S[1]}`, 4500); } }
        else if (k === 0 && ST.hull < 20) { sysAdd(0, dt * 2); swWork = 1; }                               // they will always patch a hull that is about to fail
        else if (tm > swTip[k]) { swTip[k] = tm + 25; tip(`${S[0]} have nothing to work with · they need ${TIERS[S[2][0]]} (any ore at half yield)`, 5500); }
      }
    }
    if (swWork) { swarmFx(k, swN[k], dt); workTick(k, dt); }
  }
  // fuel: generous, but not endless. Idle sips, throttle drinks, boost and drift gulp.
  if (fly) {
    const use = bst * (.035 + .05 * bRamp + .04 * bOd);                              // only boost (and the drift it carries you into) burns fuel, and slowly
    const was = ST.fuel; ST.fuel = Math.max(0, ST.fuel - use * dt);
    if (was > 0 && ST.fuel <= 0) { tip('Fuel dry · emergency thrusters only · find a siphon swarm, or hold on: your beacon is calling a tug', 8000); strandT = 0; }
    if (ST.fuel <= 0) { strandT += dt; if (strandT > 50) { strandT = 0; const fee = Math.min(ST.credits, Math.round(60 * (typeof diffK === 'function' ? diffK() : 1))); ST.credits -= fee; ST.fuel = 25; showCargo(); save(); comm(`Distress beacon answered. Salvage tug to ${call()}: tanks topped to a quarter.${fee ? ' Tow is ' + fee + ' credits.' : ' This one is on us.'}`); } }
    o2Tick(dt);
    ST.wen = Math.min(100, ST.wen + dt * (ST.fuel > 0 ? 2.2 : .6) * (tm - lastFire > 1.5 ? 1 : .35));
    if (ST.hull < 60 && tm - shHit > 15) ST.hull = Math.min(60, ST.hull + dt * .2);              // field patching: a quiet ship slowly gets itself back to 60%   // the reactor recharges the guns, slowly
  }
  spiceTick(dt, fly); advTick(); for (let i = 0; i < 3; i++) gFlash[i] = Math.max(0, gFlash[i] - dt * 1.6);
  // one warning line, small, above the mission text and in place of it while it lasts
  sysWarn = ''; sysWarnC = '';
  if (ST.fuel <= 0) { sysWarn = `FUEL DRY · EMERGENCY THRUST · TUG IN ${Math.max(1, Math.ceil(50 - strandT))} S`; sysWarnC = '#ff5d4f'; }
  else if (ST.hull < 30) { sysWarn = `HULL ${ST.hull | 0}% · MENDERS (SILVER) ${swN[0] ? kmTo(0).toUpperCase() : 'NOT ON SCOPE'} · FERRITE ${cargo[1]}${IT.s2.get() ? ' · REPAIR KIT (I)' : ''}`; sysWarnC = '#ff5d4f'; }
  else if (ST.fuel < 15) { sysWarn = `FUEL ${ST.fuel | 0}% · SIPHONS (YELLOW) ${swN[1] ? kmTo(1).toUpperCase() : 'NOT ON SCOPE'} · PYRITE ${cargo[2]}${IT.s0.get() ? ' · FUEL CELL (I)' : ''}`; sysWarnC = '#ffb44a'; }
  else if (ST.wen < 12) { sysWarn = `WEAPONS ${ST.wen | 0}% · SPARKS (RED) ${swN[2] ? kmTo(2).toUpperCase() : 'NOT ON SCOPE'} · CINNABAR ${cargo[3]} · MINING LASER RUNS FREE`; sysWarnC = '#ffb44a'; }
  else if (swWork) { const S = SWM[swOn]; sysWarn = `${S[0]} · ${TIERS[S[2][0]].toUpperCase()} → ${S[1].toUpperCase()}  ${sysLv(swOn) | 0}%`; sysWarnC = S[5]; }
}
// a working swarm: needle beams from drones to the hull, puffs of gas, and sparks where they land
function swarmFx(k, r, dt) {
  const C = SWM[k][6]; if (Math.random() > dt * 9) return;
  const ax = r[1] + (Math.random() - .5) * 140, ay = r[2] + (Math.random() - .5) * 100, az = r[3] + (Math.random() - .5) * 140;
  const sx = (Math.random() - .5) * 2, hx = sFx * 7 + sRx * sx * 5 - sUx * 2.2, hy = sFy * 7 + sRy * sx * 5 - sUy * 2.2, hz = sFz * 7 + sRz * sx * 5 - sUz * 2.2;
  const fl = .5 + Math.random() * .5, len = Math.hypot(hx - ax, hy - ay, hz - az), n = Math.min(40, 6 + len / 6 | 0);
  for (let i = 0; i <= n; i++) { const u = i / n; put(DPa, ax + (hx - ax) * u, ay + (hy - ay) * u, az + (hz - az) * u, .09 + .25 * (1 - u) * (len / 200), 0, 0, 0, .3, C[0] * fl, C[1] * fl, C[2] * fl, 0); }   // a needle beam
  fxAdd(px + hx, py + hy, pz + hz, .08 + Math.random() * .1, C[0] * 2, C[1] * 2, C[2] * 2);                                                    // where it lands
  if (Math.random() < .25) { const gx = hx * 3 + (Math.random() - .5) * 18, gy = hy * 3 + (Math.random() - .5) * 12, gz = hz * 3 + (Math.random() - .5) * 18;
    fxAdd(px + gx, py + gy, pz + gz, .9 + Math.random() * .9, C[0] * .035, C[1] * .035, C[2] * .035); }                                     // a thin breath of gas
}
// spice: gathered from the dust living things shed. Hold near jellies, gliders, leviathans and it settles in the hold.
// Boosting at a rock with spice aboard slows the world for a breath, long enough to steer round it.
function spiceSnd(k) { if (!AC || AC.state !== 'running') return; const t = AC.currentTime; [0, 3, 7, 10].slice(0, k ? 2 : 4).forEach((iv, n) => note(mf(79 + iv), t + n * .045, .035, 'sine', .3, 1)); }
function spiceTick(dt, fly) {                              // spice: living things shed it, blooms of it drift in the lanes you boost through, near misses shake some loose
  btCool -= dt; if (cHit) cHitT = tm;
  if (!fly) return;
  let near = 0; for (const [L, R] of [[LJ, 420], [LY, 450], [LWh, 900], [LQ, 1300], [LM, 250]]) { const r = nearInst(L); if (r[0] < R * R) near = 1; }
  if (SYS.atm) { near = 1; const cloud = Math.exp(-((py - 5200) * (py - 5200)) / 1.4e7);
    if (cloud > .15 && ST.spice < 100) { const was = ST.spice; ST.spice = Math.min(100, ST.spice + dt * 5 * cloud); if (Math.random() < dt * 6 * cloud) fxAdd(px + (Math.random() - .5) * 50, py + (Math.random() - .5) * 24, pz + (Math.random() - .5) * 50, .35 + Math.random() * .7, 1.35, .22, .42); if (Math.floor(was / 25) < Math.floor(ST.spice / 25) && tm > spiceTip) { spiceTip = tm + 16; pop('SPICE IN THE CLOUDS', '#ff3b5c'); } } }
  if (!near && ST.spice > 0 && bst > .85) ST.spice = Math.max(0, ST.spice - dt * .04);   // spice stays in the hold; only a hard boost shakes a little loose
  if (near && ST.spice < 100) { const was = ST.spice; ST.spice = Math.min(100, ST.spice + dt * 5.5); if (Math.random() < dt * 6) fxAdd(px + sFx * 14 + (Math.random() - .5) * 30, py + sFy * 14 + (Math.random() - .5) * 20, pz + sFz * 14 + (Math.random() - .5) * 30, .12 + Math.random() * .2, 1.1, .2, .3);
    if (Math.floor(was / 25) < Math.floor(ST.spice / 25) && tm > spiceTip) { spiceTip = tm + 20; pop(`SPICE ${ST.spice | 0}%`, '#ff3b5c'); } }
  const sp = Math.hypot(vx, vy, vz);
  bloomT -= dt; if (SYS.atm && bloomT <= 0 && BLOOMS.length < 3 && Math.exp(-((py - 4600) * (py - 4600)) / 2.4e6) > .35) { bloomT = 3 + Math.random() * 4; BLOOMS.push({ x: px + sFx * (500 + Math.random() * 900) + (Math.random() - .5) * 220, y: py + (Math.random() - .5) * 140, z: pz + sFz * (500 + Math.random() * 900), t: 0, v: 6 + (Math.random() * 5 | 0) }); }
  if (bloomT <= 0 && !SYS.atm && bst > .5 && sp > 400 && BLOOMS.length < 4) {      // a bloom ahead, a little off the line: worth a steer
    bloomT = 4 + Math.random() * 5; const ux = vx / sp, uy = vy / sp, uz = vz / sp, d = Math.min(2600, 700 + sp * 1.4), off = 50 + Math.random() * 220, g = Math.random() * 6.283;
    const ox = sRx * Math.cos(g) + sUx * Math.sin(g), oy = sRy * Math.cos(g) + sUy * Math.sin(g), oz = sRz * Math.cos(g) + sUz * Math.sin(g);
    BLOOMS.push({ x: px + ux * d + ox * off, y: py + uy * d + oy * off, z: pz + uz * d + oz * off, t: 0, v: 8 + (Math.random() * 6 | 0) }); }
  for (let i = BLOOMS.length - 1; i >= 0; i--) { const b = BLOOMS[i]; b.t += dt; const ex = b.x - px, ey = b.y - py, ez = b.z - pz, ed = Math.hypot(ex, ey, ez);
    if (ed < 55) { ST.spice = Math.min(100, (ST.spice || 0) + b.v); pop(`SPICE BLOOM +${b.v}`, '#ff3b5c'); spiceSnd(0); for (let k = 0; k < 10; k++) fxAdd(b.x + (Math.random() - .5) * 40, b.y + (Math.random() - .5) * 40, b.z + (Math.random() - .5) * 40, 1 + Math.random() * 2, 1.6, .25, .4); BLOOMS.splice(i, 1); continue; }
    if (b.t > 40 || ed > 6000 || (ex * vx + ey * vy + ez * vz < 0 && ed > 600)) { BLOOMS.splice(i, 1); continue; }
    const pl = .7 + .3 * Math.sin(tm * 4 + i);
    put(DPa, ex, ey, ez, Math.max(26, ed * .022), 0, 0, 0, .3, 1.1 * pl, .1 * pl, .22 * pl, 0); put(DPa, ex, ey, ez, Math.max(8, ed * .007), 0, 0, 0, .3, 3 * pl, .5 * pl, .8 * pl, 0);                     // a soft crimson heart, visible from far off
    for (let k = 0; k < 7; k++) { const a = tm * (.6 + k * .13) + k * 2.1, r = 14 + 10 * Math.sin(k * 1.7 + tm); put(DPa, ex + Math.cos(a) * r, ey + Math.sin(a * 1.3) * r * .6, ez + Math.sin(a) * r, 3 + Math.max(0, ed * .004), 0, 0, 0, .3, 1.8 * pl, .25 * pl, .45 * pl, 0); } }
}
// the rock assist: looks ahead along the flight path, eases the speed down so nothing is under a second and a half away,
// and leans the ship off a rock it is about to hit, so a small turn is enough to clear it
function rockAssist(dt) {
  const sp = Math.hypot(vx, vy, vz);
  raT -= dt; if (raT <= 0) { raT = .07; raThr = null;
    if (sp > 240) { const ux = vx / sp, uy = vy / sp, uz = vz / sp, look = Math.min(2800, sp * 1.9); let best = 1e9; const seen = new Set();
      if (nearSeen.size > 400) nearSeen.clear();
      for (const [L, at] of [[LB, bigAt], [LH, hugeAt]]) { const C = L.C;
        for (let d = 0; d <= look + C; d += C * .8) { const bx = Math.floor((px + ux * d) / C), by = Math.floor((py + uy * d) / C), bz = Math.floor((pz + uz * d) / C);
          for (let kk = -1; kk < 2; kk++) for (let jj = -1; jj < 2; jj++) for (let ii = -1; ii < 2; ii++) { const cx = bx + ii, cy = by + jj, cz = bz + kk, key = C + ':' + cx + ',' + cy + ',' + cz; if (seen.has(key)) continue; seen.add(key);
            const s = at(C, cx, cy, cz); if (!s) continue;
            const rx = (cx + gj0) * C - px, ry = (cy + gj1) * C - py, rz = (cz + gj2) * C - pz, t = rx * ux + ry * uy + rz * uz; if (t < 0 || t > look) continue;
            const ox = ux * t - rx, oy = uy * t - ry, oz = uz * t - rz, m = Math.hypot(ox, oy, oz), R = s * .93 + 18;
            if (sp > 500 && t < sp * .14 && m > R && m < R + 90 && !nearSeen.has(key) && tm - cHitT > 1) { nearSeen.add(key); const g = Math.round((3 + 4 * (1 - (m - R) / 90)) * (1 + bOd)); ST.spice = Math.min(100, (ST.spice || 0) + g); spiceSnd(1); }
            if (m < R && t - s < best) { best = t - s; raThr = { t: Math.max(1, t - s), m, R, s, huge: L === LH, tier: hx(3) < .3 ? 1 : 0, nx: m > .1 ? ox / m : sRx, ny: m > .1 ? oy / m : sRy, nz: m > .1 ? oz / m : sRz }; } } } } } }
  if (!raThr || sp < 240) return;
  const T = raThr, tti = T.t / sp;
  if (bst > .5 && btT <= 0 && btCool <= 0 && tti < 1.1 + Math.min(1, T.s / 200)) {      // the worse the crash would have been, the more spice it takes: speed, size, how dense the rock is, how dead-centre
    const cost = Math.max(6, Math.round(Math.min(50, (sp / 1600) * 13 * (.7 + Math.min(T.s, 300) / 80) * (T.huge ? 1.4 : 1) * (T.tier ? 1.25 : 1) * (1.2 - .5 * T.m / T.R))));
    if (ST.spice >= cost) { ST.spice -= cost; btMax = btT = 1.8 + Math.min(1.4, cost / 30); btHold = 0; btCool = 6; save(); pop(`SLOW TIME · SPICE −${cost}`, '#ff3b5c'); spiceSnd(0);
      for (let k = 0; k < 18; k++) fxAdd(px + sFx * 30 + (Math.random() - .5) * 60, py + sFy * 30 + (Math.random() - .5) * 40, pz + sFz * 30 + (Math.random() - .5) * 60, .3 + Math.random() * .5, 1.4, .2, .35); }
    else if (tm > spiceTip) { spiceTip = tm + 8; tip(`Not enough spice to slow this one (needs ${cost}) · steer!`, 2500); } }
  if (btT > 0 && T.m < T.R * .85 && tti < .9 && btHold < 1.6) { btT = Math.max(btT, btMax * .45); btHold += dt / Math.max(.1, slow); }   // a big rock still dead ahead keeps time slow a little longer
  if (tti < .7 && bOd < .7) { const want = Math.max(240, T.t / .7); if (sp > want) { const f = Math.max(want / sp, 1 - dt * 1.5 * (1 - bOd)); vx *= f; vy *= f; vz *= f; } }   // overdrive: the safety brake lets go   // only the last moment eases off: a boost run still needs steering
  const a = 70 * (1 - T.m / T.R) * dt * (1 - .9 * bOd); vx += T.nx * a; vy += T.ny * a; vz += T.nz * a;
}

// ---- touch screens: the actions that have keys get buttons ----
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  const box = document.createElement('div'); box.style.cssText = 'position:fixed;right:max(10px,env(safe-area-inset-right));top:22%;z-index:6;display:none;flex-direction:column;gap:10px';
  for (const [t, f] of [['TGT', () => navCycle(1)], ['USE', () => interact()], ['WPN', () => wpnCycle()], ['GATE', () => gatePanel()], ['HOLD', () => invShow('hold')], ['LOG', () => (jpOpen ? closePanel() : journalPanel())], ['MAP', () => starMap()]]) {
    const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'width:58px;height:44px;border:1px solid rgba(99,226,255,.6);background:rgba(4,10,16,.55);color:#63e2ff;font:600 12px system-ui;letter-spacing:.08em;border-radius:6px;touch-action:manipulation';
    b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); f(); }, { passive: false }); b.onclick = f; box.appendChild(b);
  }
  document.body.appendChild(box); setInterval(() => { box.style.display = document.body.className[0] === 'g' ? 'flex' : 'none'; }, 400);
}

// ---- lettering for the display: thin strokes on a 4 x 6 grid, corners rounded, drawn in code (no font file) ----
const GSRC = { A: '06 00 40 46|03 43', B: '06 00 30 33 03|33 43 46 06', C: '40 00 06 46', D: '00 30 42 44 36 06 00', E: '40 00 06 46|03 33', F: '40 00 06|03 33', G: '40 00 06 46 43 23', H: '00 06|40 46|03 43', I: '20 26', J: '40 46 06 04', K: '00 06|40 03 46', L: '00 06 46', M: '06 00 23 40 46', N: '06 00 46 40', O: '20 40 46 06 00 20', P: '06 00 40 43 03', Q: '20 40 46 06 00 20|25 47', R: '06 00 40 43 03|23 46', S: '40 00 03 43 46 06', T: '00 40|20 26', U: '00 06 46 40', V: '00 26 40', W: '00 06 23 46 40', X: '00 46|40 06', Y: '00 23 40|23 26', Z: '00 40 06 46',
  0: '20 40 46 06 00 20|23', 1: '10 20 26', 2: '00 40 43 03 06 46', 3: '00 40 46 06|13 43', 4: '00 03 43|40 46', 5: '40 00 03 43 46 06', 6: '40 00 06 46 43 03', 7: '00 40 46', 8: '20 40 46 06 00 20|03 43', 9: '06 46 40 00 03 43',
  '.': '26', ',': '26 17', ':': '22|25', '-': '13 33', '—': '03 43', '/': '40 06', '+': '13 33|21 25', '·': '23', '%': '40 06|01|45', '→': '03 43|31 43 35', '(': '30 12 14 36', ')': '10 32 34 16', "'": '20 21', '"': '10 11|30 31', '!': '20 24|26', '?': '00 40 43 23 24|26', '=': '02 42|04 44', '✓': '03 16 40', '…': '06|26|46', '<': '40 03 46', '>': '00 43 06', ';': '22|26 17', '&': '46 00 30 06 46' };
const GL = {}; for (const k in GSRC) GL[k] = GSRC[k].split('|').map((p) => p.split(' ').map((q) => [+q[0], +q[1]]));
const GNAR = "I1.,:;!'·";
const gAdv = (ch, u) => ch === ' ' ? 3 * u : GNAR.includes(ch) ? 3 * u : 5.7 * u;
function gW(s, sz) { s = String(s).toUpperCase(); const u = Math.max(sz, 13) * .118; let w = 0; for (const ch of s) w += gAdv(ch, u); return w - 1.7 * u; }
function gText(c, s, x, y, sz, al, col, wt) {
  s = String(s).toUpperCase(); sz = Math.max(sz, 13); const u = sz * .118, w = gW(s, sz); let cx = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x;
  c.strokeStyle = c.fillStyle = col; c.lineWidth = Math.max(1.25, sz * (wt >= 700 ? .095 : .075)); c.lineCap = c.lineJoin = 'round';
  for (const ch of s) {
    const g = GL[ch], ox = cx - (GNAR.includes(ch) ? 1.3 * u : 0);
    if (g) for (const p of g) {
      if (p.length === 1) { c.beginPath(); c.arc(ox + p[0][0] * u, y + (p[0][1] - 6) * u, c.lineWidth * .75, 0, 6.3); c.fill(); continue; }
      c.beginPath(); c.moveTo(ox + p[0][0] * u, y + (p[0][1] - 6) * u);
      for (let i = 1; i < p.length; i++) { if (i < p.length - 1) {                // round a corner only as far as its angle allows: sharp corners (N, M, W, K) keep their points
          const ax = p[i - 1][0] - p[i][0], ay = p[i - 1][1] - p[i][1], bx = p[i + 1][0] - p[i][0], by = p[i + 1][1] - p[i][1], th = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1))));
          c.arcTo(ox + p[i][0] * u, y + (p[i][1] - 6) * u, ox + p[i + 1][0] * u, y + (p[i + 1][1] - 6) * u, Math.min(u * .95, u * .45 * Math.tan(th / 2))); }
        else c.lineTo(ox + p[i][0] * u, y + (p[i][1] - 6) * u); }
      c.stroke();
    } else if (ch !== ' ') { c.font = `600 ${sz}px system-ui,sans-serif`; c.textAlign = 'left'; c.fillText(ch, cx, y); }
    cx += gAdv(ch, u);
  }
  c.lineCap = 'butt';
}

// ---- meteor showers: now and then a rake of bright streaks crosses the field ----
const METS = []; let metT = 25, metN = 0, metD = [1, 0, 0];
function meteorTick(dt, fly) {
  metT -= dt; if (metT <= 0 && metN <= 0 && fC(px, py, pz) > .4) metT = 20;   // no showers in open space
  if (metT <= 0) { if (metN <= 0) { metN = 6 + Math.random() * 10 | 0; const a = Math.random() * 6.283, y = Math.random() * .6 - .5, c = Math.sqrt(1 - y * y); metD = [Math.cos(a) * c, y, Math.sin(a) * c]; }
    metN--; metT = metN > 0 ? .15 + Math.random() * .6 : 40 + Math.random() * 80;
    const j = () => (Math.random() - .5) * 2600; METS.push({ x: px + sFx * 1400 + j() - metD[0] * 900, y: py + sFy * 1400 + j() * .6 - metD[1] * 900, z: pz + sFz * 1400 + j() - metD[2] * 900, t: 0, s: 3 + Math.random() * 5, v: 1300 + Math.random() * 900 }); }
  for (let i = METS.length - 1; i >= 0; i--) { const m = METS[i]; m.t += dt; if (m.t > 1.5) { METS.splice(i, 1); continue; }
    m.x += metD[0] * m.v * dt; m.y += metD[1] * m.v * dt; m.z += metD[2] * m.v * dt; const f = Math.sin(Math.min(1, m.t / 1.5) * 3.1416);
    for (let k = 0; k < 7; k++) { const b = f * (1 - k / 7) * 1.6; put(DPa, m.x - px - metD[0] * k * 22, m.y - py - metD[1] * k * 22, m.z - pz - metD[2] * k * 22, m.s * (1 - k * .1), 0, 0, 0, k * .13, b, b * .85, b * .6, 0); } }
}

// ---- the owner's own tracks, streamed from where they are hosted: now and then one fades in from a random point, plays a minute, fades out ----
const TRACKS = ['8bca2649-ef58-4337-99da-96bc09457d8e', 'cab7667f-c12b-4b52-89f8-790cadf115f8', 'a8499c7c-09f5-47a4-82ba-ef1ed1d11704', '98987f77-6a7a-4fff-ab98-d48bdb3035e3', '53a8bb5c-0b30-4a08-85b1-628a4a3b71b8', '6ad0e9ff-0b1c-4904-8a12-44d2e5d90187', '00607acb-f516-4f98-8b2a-4fb7b4afa93c', '0f9a39ab-36f0-4090-91a6-1168566e464c'];
const PHOST = ['https://cdn1.suno.ai/', 'https://cdn2.suno.ai/'];
let plA = null, plOn = 0, plNext = 75, plEnd = 0, plVol = 0, plBad = 0, plWant = .3, plLast = -1, plH = 0;
let plLocal = null; const plLoadLocal = () => { if (plLocal || location.protocol === 'file:') return; plLocal = []; try { fetch('music/tracks.json').then((r) => r.ok ? r.json() : []).then((a) => { plLocal = Array.isArray(a) ? a : []; }).catch(() => {}); } catch {} };   // looked for only when the fallback playlist is actually needed
const plLevel = (v) => { plWant = Math.max(0, Math.min(1, v)); };   // the one place the game sets how loud the stream is: it dips for hails and fights and comes back
function playlistTick(dt, fly) {
  plLoadLocal();
  if (!CFG.pl || !fly || plBad > 3 || !AC || AC.state !== 'running') return;
  if (!plOn) {
    plNext -= dt; if (plNext > 0) return; plNext = 150 + Math.random() * 240;
    if (!plA) { plA = new Audio(); plA.preload = 'none'; plA.onerror = () => { plBad++; plOn = 0; plH = 1 - plH; plNext = 8; }; }
    let n = Math.random() * TRACKS.length | 0; if (n === plLast) n = (n + 1) % TRACKS.length; plLast = n; plA.src = plLocal && plLocal.length ? 'music/' + plLocal[n % plLocal.length] : PHOST[plH] + TRACKS[n] + '.mp3'; plA.volume = 0; plVol = 0;
    plA.onloadedmetadata = () => { try { if (plA.duration > 120) plA.currentTime = Math.random() * (plA.duration - 110); } catch {} };
    const p = plA.play(); if (p && p.then) p.then(() => { plOn = 1; plEnd = 55 + Math.random() * 50; }).catch(() => { plBad++; });
    return;
  }
  plEnd -= dt; plLevel(jpOpen ? .12 : tm - shHit < 6 ? .15 : .3); plVol += ((plEnd > 7 ? plWant : 0) - plVol) * Math.min(1, dt * .22); try { plA.volume = Math.max(0, Math.min(1, plVol * CFG.vRad)); } catch {}
  if (plEnd <= 0 && plVol < .01) { plA.pause(); plOn = 0; }
}

let wantedT = 0;
// ---- living things: the big ones show on the target list, notice you when you come close, and can be answered ----
const LIFEN = [['LEVIATHAN', () => LWh, 900, 'A leviathan turns one eye toward you. The hull hums with its song.'], ['COLOSSUS', () => LQ, 1300, 'A colossal drifter fills the view. Its bell pulses, slow as a tide.'], ['GLIDERS', () => LY, 450, 'A flight of gliders banks round you, curious and unafraid.']];
const lifeSeen = {};
function nearInst(L0, L = L0) { const D = L0.d; let best = 1e12, bx = 0, by = 0, bz = 0; for (let i = 0; i < L0.n; i++) { const o = i * F, w = (v, m) => ((v - m + L.N * 1.5) % L.N) - L.N * .5, x = (w(D[o], L.mx) + D[o + 4]) * L.C - L.fx, y = (w(D[o + 1], L.my) + D[o + 5]) * L.C - L.fy, z = (w(D[o + 2], L.mz) + D[o + 6]) * L.C - L.fz, d = x * x + y * y + z * z; if (d < best) { best = d; bx = x; by = y; bz = z; } } return [best, bx, by, bz]; }
function lifeScan(N) {
  LIFEN.forEach((L, i) => { const r = nearInst(L[1]()); if (r[0] > 7000 * 7000) return; N.push({ id: 'life' + i, name: L[0], kind: 'life', li: i, x: px + r[1], y: py + r[2], z: pz + r[3] });
    if (r[0] < L[2] * L[2] && !lifeSeen[mkey() + i] && flying()) { lifeSeen[mkey() + i] = 1; tip(L[3] + '  ·  T to target, F to answer', 7000); gain({ xp: 8 }); } });
}

// ---- Ikosagon radio: the same track list the site's own player reads (/api/radio), fetched again before every track,
// so a song added to the site is on the air the next time one is picked. The game plays the files itself and sets the level.
const RADIO = 'https://ikosagon.com/api/radio';
let rdList = null, rdA = null, rdT = 20, rdVol = 0, rdName = '', rdLast = '', rdFetchT = 0, rdBad = 0, rdGap = 0, rdRetry = 0, rdOn = 0;
function radioLoad() { if (location.protocol === 'file:') return; try { fetch(RADIO, { cache: 'no-store' }).then((r) => r.json()).then((a) => { if (Array.isArray(a)) { const l = a.filter((t) => t && t.url); if (l.length) rdList = l; } }).catch(() => { rdBad++; }); } catch { rdBad++; } }
function radioNext(seek) {
  radioLoad(); if (!rdList || !rdA) return;
  let t = rdList[Math.random() * rdList.length | 0]; if (rdList.length > 1) while (t.url === rdLast) t = rdList[Math.random() * rdList.length | 0];
  rdLast = t.url; rdName = String(t.title || 'On air').slice(0, 30); rdA.src = t.url; rdVol = Math.min(rdVol, .05); rdA.volume = rdFx ? 1 : rdVol;
  rdA.onloadedmetadata = seek ? () => { try { if (rdA.duration > 60) rdA.currentTime = rdA.duration * (.1 + Math.random() * .65); } catch {} } : null;
  const p = rdA.play(); if (p && p.catch) p.catch(() => { rdRetry = 1; });
}
// radio colour: the stream goes through a small speaker (band-limited, a touch of drive, faint hiss). Web Audio can only
// process a file from the page's own site, so this runs when the game is on ikosagon.com; elsewhere it just plays quieter.
let rdFx = null;
function radioFx() {
  if (rdFx || !AC || !rdA || AC.state !== 'running') return rdFx;
  try { if (new URL(rdA.currentSrc || rdA.src, location.href).origin !== location.origin) return null; } catch { return null; }
  try {
    const src = AC.createMediaElementSource(rdA), hp = AC.createBiquadFilter(), lp = AC.createBiquadFilter(), pk = AC.createBiquadFilter(), sh = AC.createWaveShaper(), g = AC.createGain();
    hp.type = 'highpass'; hp.frequency.value = 260; hp.Q.value = .8; lp.type = 'lowpass'; lp.frequency.value = 4300; lp.Q.value = .9;
    pk.type = 'peaking'; pk.frequency.value = 1500; pk.gain.value = 4; pk.Q.value = .9;
    const cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); } sh.curve = cv;
    const nb = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const ns = AC.createBufferSource(), nf = AC.createBiquadFilter(), ng = AC.createGain(); ns.buffer = nb; ns.loop = true; nf.type = 'bandpass'; nf.frequency.value = 3200; nf.Q.value = .6; ng.gain.value = 0;
    src.connect(hp); hp.connect(pk); pk.connect(sh); sh.connect(lp); lp.connect(g); g.connect(AC.destination); ns.connect(nf); nf.connect(ng); ng.connect(AC.destination); ns.start();
    rdFx = { g, ng }; rdA.volume = 1;
  } catch { rdFx = null; }
  return rdFx;
}
function radioJump() { if (CFG.radio && rdA && rdList) radioNext(1); }      // launch and every warp: another song, somewhere in its middle
let rdWas = 0, rdHold = false;
function radioTick(dt) {
  const fly = document.body.className[0] === 'g'; rdOn = 0;
  if (rdFx && (!CFG.radio || rdHold || rdA.paused)) try { rdFx.ng.gain.setTargetAtTime(0, AC.currentTime, .05); } catch {}
  if (!CFG.radio) { if (rdA && !rdA.paused) rdA.pause(); return; }
  if (!rdList) { rdFetchT -= dt; if (rdFetchT <= 0 && rdBad < 6) { rdFetchT = 8; radioLoad(); } return; }
  if (!rdA) { rdA = new Audio(); rdA.preload = 'auto'; rdA.onended = () => radioNext(0); rdA.onerror = () => { rdBad++; if (rdBad < 14) setTimeout(() => radioNext(0), 2500); }; radioNext(0); }   // on the air from the loading screen
  if (fly && !rdWas) rdWas = 1;                                   // once, at the first launch: pausing and resuming leaves the song alone
  rdHold = rdWas && !fly;                                                           // paused: the song waits where it is
  if (rdHold) { if (!rdA.paused) rdA.pause(); rdAirT = performance.now(); return; }
  if (rdA.paused && !rdA.ended) { rdRetry -= dt; if (rdRetry <= 0) { rdRetry = .3; const p = rdA.play(); if (p && p.catch) p.catch(() => {}); } return; }
  let lv = .34; try { lv = !fly ? .3 : jpOpen ? .14 : tm - shHit < 6 ? .16 : .34; } catch {}
  plLevel(lv); rdVol += (plWant - rdVol) * Math.min(1, dt * .5);
  { const v = Math.max(0, Math.min(1, rdVol)) * .62 * CFG.vRad, fx = radioFx();                // the radio sits lower than it did, under the ship
    try { if (fx) { fx.g.gain.setTargetAtTime(v * .9, AC.currentTime, .1); fx.ng.gain.setTargetAtTime(v * .012, AC.currentTime, .1); } else rdA.volume = v; } catch {} }
  rdOn = 1; rdAirT = performance.now(); if (plOn && plA) { plA.pause(); plOn = 0; }
}
let rdAirT = -1e9;
const radioAir = () => !!CFG.radio && performance.now() - rdAirT < 8000;   // true while a song is playing, and through the moment between songs
setInterval(() => radioTick(.25), 250);
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, () => { if (CFG.radio && rdA && rdA.paused && !rdHold) { const p = rdA.play(); if (p && p.catch) p.catch(() => {}); } }, true);   // browsers hold sound until the first tap or key

// ---- solar flares: a warning, then a wash of light that strips shields. Getting behind something big is not modelled; riding it out is. ----
let flT = 140 + Math.random() * 160, flW = 0;
function flareTick(dt, fly) {
  if (!fly || SYS.atm || jumpTo) return;
  if (flW > 0) { flW -= dt; if (flW <= 0) { const had = shield; shield = Math.max(0, shield - 75); shHit = tm; flash = Math.max(flash, .55); trauma = Math.min(1, trauma + .4); thud(.4); gain({ xp: had > 75 ? 12 : 4 }); tip(had > 75 ? 'The flare breaks over the hull. Shields held.' : 'The flare breaks over the hull. Shields are down: stay clear of trouble until they return.', 6000); } return; }
  flT -= dt; if (flT <= 0) { flT = 200 + Math.random() * 260; if ((hs(SYS.salt ^ 0xF1A2E) >>> 0) % 5 < 2) { flW = 12; tip(`Flare warning: ${SYS.star} is throwing a front. Impact in twelve seconds. Keep your shields full.`, 9000); } }
}


// ---- crew: three berths. Each hand changes how the ship behaves. ----
const CREW = { eng: ['Engineer', 400, 'Mends the hull slowly whenever you have had eight quiet seconds'], gun: ['Gunner', 550, 'Thirty percent more damage against ships'], nav: ['Navigator', 500, 'Faster light drift, longer scanner and hailing range'] };
const CNAME = Array.from({ length: 24 }, (_, i) => personName(mulberry32(0xC4E3 + i * 7919)));
const crew = (k) => !!(ST.rp && ST.rp.crew && ST.rp.crew[k]);
function crewPanel() {
  const r = rp(), cw = r.crew || (r.crew = {}), R = mulberry32(SYS.salt ^ 0xC2E7);
  panel('Crew quarters', `${SYS.locs[SYS.loc].name} · ${ST.credits} credits`, Object.keys(CREW).map((k) => { const [role, cost, d] = CREW[k], nm = CNAME[R() * CNAME.length | 0]; return cw[k] ? { name: `${cw[k]} · ${role}`, kind: 'aboard', desc: d } : { name: `${nm} · ${role}`, kind: cost + ' cr', desc: d + (ST.credits < cost ? ' · not enough credits' : ''), run: ST.credits >= cost ? () => { ST.credits -= cost; cw[k] = nm; save(); showCargo(); tip(`${nm} has come aboard as your ${role.toLowerCase()}`, 5000); crewPanel(); } : undefined }; }), 'Press a number to hire · J to close');
}

// ---- the ship's log: come to rest close to something and it has a story to tell, once per thing per place ----
const LORE2 = {
  gate: ['Up close the gate ticks, like cooling metal. Someone has scratched tally marks into the housing: four hundred and twelve, then nothing.', 'The gate ring is older than its lights. Under the paint there is another paint, and under that, lettering nobody reads any more.', 'A maintenance drone circles the gate, polishing one panel. It has worn that panel to a mirror. The rest is grey with dust.'],
  dock: ['The trader keeps a potted fern in the forward port. It leans toward {star} the way a face would.', 'There is a child\'s drawing taped inside the trader\'s airlock: a ship, a sun, and three figures holding hands in vacuum.', 'The trader\'s hull is patched with plates from a dozen ships. You can read parts of their names: -ANDER, MERID-, -OF TALLIS.'],
  signal: ['Dead still, you can hear it through the hull: not a tone but a breath, in and out, every nine seconds.', 'The buoy turns to keep one face toward you. There is no mechanism on it that could do that.', 'The signal carries numbers. They are your own position, a few minutes from now.'],
  rock: ['The rock is hollow. Something lived in it once; the walls inside are smooth as river stone.', 'Veins of ore run through the rock in straight lines and right angles. Nothing grows like that.', 'Frozen into the rock\'s shadow side is a boot print, sharp-edged, the size of your hand.'],
  life: ['It slows when you slow. For a long minute you are two things keeping pace in the dark, and neither of you is alone.', 'Close to, its skin is written over with scars in a pattern. The same pattern is on the next one, and the next.', 'It sings, and your ship\'s lights dim and brighten with the phrase, as if trying to learn it.'],
  ship: ['Their running lights blink a greeting in a code your grandmother used. You blink it back before you think.', 'Through their canopy you can see the pilot asleep, hat over eyes, autopilot holding. You leave quietly.', 'Someone aboard is playing a stringed instrument, badly, with great feeling. It comes over the open band.'],
  storm: ['At the storm\'s edge the lightning is slow enough to watch: it climbs, branches, hesitates, and goes out like a thought.', 'Between strikes the cloud glows from inside, and for a moment has the shape of a hand, open.'],
  wreck: ['The wreck is tidy. Whoever left it stowed the cups, made the bunks, and turned off the lights on the way out.', 'On the wreck\'s hull, in hand-high letters of weld: WE WERE HERE AND IT WAS GOOD.'],
  settle: ['From here the settlement\'s lights spell nothing, but they flicker in sequence, row by row, like a field in wind.', 'A balloon rises from the deck below, trailing a ribbon. It passes your canopy, and you see there is a letter tied to it.'],
};
LORE2.station = ['Along the station\'s shadow side, one window is lit and has a figure in it, watching you watch.', 'The station turns, and for a breath every viewport catches {star} at once: a ring of small suns.', 'Someone has painted a line of footprints up the outside of the hull, from the lock to nowhere.'];
const LRNG = { station: 1500, gate: 420, dock: 260, signal: 160, rock: 180, life: 500, ship: 160, storm: 1400, wreck: 220, settle: 2600 };
let lingT = 0, lingId = '';
function lingerTick(dt) {
  if (jpOpen || jumpTo || drift || Math.hypot(vx, vy, vz) > 16) { lingT = 0; return; }
  let best = null, bd = 1e9; for (const n of NAV) { const r = LRNG[n.kind]; if (!r) continue; const d = Math.hypot(n.x - px, n.y - py, n.z - pz); if (d < r && d < bd) { bd = d; best = n; } }
  if (!best) { lingT = 0; return; }
  const key = mkey() + ':' + best.kind, lore = rp().lore || (rp().lore = {}); if (lore[key]) { lingT = 0; return; }
  if (lingId !== key) { lingId = key; lingT = 0; } lingT += dt; if (lingT < 3.5) return;
  lingT = 0; lore[key] = 1; const R = mulberry32(SYS.salt ^ (best.kind.length * 7919 + best.kind.charCodeAt(0))), pool = LORE2[best.kind], text = pool[R() * pool.length | 0].replace('{star}', SYS.name), nb = reach(SYS.sec), lead = R() < .35 && nb.length ? nb[R() * nb.length | 0] : null;
  gain({ xp: 15 });
  const list = [{ name: 'Ship\'s log', desc: text }];
  if (lead) { const s = mkSys(sysIdAt(lead[0], lead[1], lead[2])); list.push({ name: 'Follow it up', kind: s.name, desc: `Something about it points toward ${s.name}. Plot a course there.`, run: () => { rp().course = lead.slice(); routeK = ''; navT = 0; save(); tip('Course plotted: ' + s.name, 4000); } }); }
  list.push({ name: 'Carry on', desc: '', run: () => {} });
  panel('Observation', `${SYS.locs[SYS.loc].name} · beside the ${best.name.toLowerCase()}`, list, 'Press a number · J to close');
}

// ---- damage to other ships: shields first, then hull; they answer, run or die accordingly ----
function npcHit(a, dmg, qd, hx, hy, hz, w = 0) {
  const sm = [1, 1.6, .55, 1, 1.2][w], hm = [1, .6, 1.7, .5, 1][w];                              // each weapon is better at one job: scatter for shields, lance for hulls
  a.shT = tm; const t = Math.min(a.sh, dmg * sm), hull = (dmg - t / sm) * hm; a.sh -= t; a.hp -= hull;
  fxAdd(hx, hy, hz, hull > 0 ? 9 : 14, hull > 0 ? 1 : .25, hull > 0 ? .55 : .7, hull > 0 ? .2 : 1);              // blue off the shield, orange off the plating
  if (a.role === 5) a.brk = 1.2;
  else if (!a.hit) { a.hit = 1; if (a.cast && cast()[a.cast]) remember(cast()[a.cast], 'shot', -30); wantedT = Math.max(wantedT, 75); gain({ rep: -6, fac: a.fac }); comm(`Mayday, mayday, ${a.name} taking fire from ${call()}! ${ctl()}, respond!`); if (!a.big) { a.sp *= 1.5; a.hold = 0; a.wp = NPT.far[a.i % 3]; } }
  if (a.hp > 0) return;
  a.dead = 1; noteKill(a); fxAdd(a.x, a.y, a.z, a.size * 7, 1, .6, .3); fxAdd(a.x, a.y, a.z, a.size * 3, 1, 1, .9); boom(a.big ? a.size : Math.max(36, a.size * 4), qd); flash = Math.max(flash, a.big ? .6 : .3); navT = 0;
  if (a.role === 5) { gain({ cr: 80, xp: 25, rep: 3 }); if (a.bounty) jobDone(a.bounty); tip('Raider destroyed · 80 credit bounty', 5000); comm(`${ctl()} to ${call()}: good kill. Bounty is on its way.`); }
  else { gain({ rep: -25, fac: a.fac }); wantedT = 150; tip(`${a.name} destroyed. ${FAC[a.fac][0]} have put a price on you.`, 7000); }
}

// ---- radio traffic: callsigns, who is being called, who is calling, what they want, and the answer ----
let commS = '', commT = 0, chatT = 12, gateCall = '';
const call = () => rp().call || (rp().call = 'Indigo ' + (10 + Math.random() * 89 | 0)), ctl = () => SYS.name + ' Control';
function comm(s) { commS = s; commT = performance.now() + 7500; radioVoice(Math.min(2.2, .5 + s.length * .018)); }
function chatter(dt, fly) {
  if (!fly || jpOpen || CM || ESC && ESC.wave) return;
  if (gateCall !== mkey() && gateDist() < 1500) { gateCall = mkey(); comm(`${call()}, ${ctl()}, we have you on approach. The gate is yours when ready.`); chatT = 10; return; }
  chatT -= dt; if (chatT > 0 || performance.now() < commT) return; chatT = 9 + Math.random() * 14;
  const sm = NPCS.filter((a) => !a.lead && Math.hypot(a.x - px, a.y - py, a.z - pz) < 6000); if (!sm.length) return;
  const a = sm[Math.random() * sm.length | 0], c = ctl(), n = a.name, re = (s) => setTimeout(() => { if (flying()) comm(s); }, 4200);
  if (a.role === 0) { if (a.toGate) { comm(`${c}, ${n}, outbound with cargo, request gate transit.`); re(`${n}, ${c}, cleared transit, lane ${1 + a.i % 4}. Safe flight.`); } else comm(`${n}, inbound for the trader, ${1 + a.i % 3} minutes out. Have the clamps ready.`); }
  else if (a.role === 1) comm(a.hold ? `${n}, on station at the field and cutting. Will call tonnage on the hour.` : `${n}, hold is full, returning to the trader.`);
  else if (a.role === 2) { if (NPCS.some((b) => b.role === 5)) { comm(`${n}, contact, two o'clock high, hostile. Engaging.`); re(`All ships, ${c}: raiders in the area. Patrols are responding. Stay off the lanes.`); } else comm(`${c}, ${n}, sweep ${1 + a.k % 4} complete, nothing to report.`); }
  else if (a.role === 3) { comm(`${c}, ${n}, priority courier, request direct routing to the gate.`); re(`${n}, direct approved. Expedite.`); }
  else if (a.role === 4) comm(`${n} to all traffic: holding lane ${1 + a.i % 3}, keep clear two kilometres.`);
  else comm(`…static… ${n} …say again…`);
}

// ---- small craft: three forms, none of them aeroplanes ----
function shipMeshA() {                                        // a tug: cab, spine, six cargo pods, twin drives
  const V = [], I = [];
  loft(V, I, [[-1, .04, .04], [-.86, .1, .085], [-.62, .115, .095], [-.5, .06, .055]], 6, 0); loft(V, I, [[-.92, .03, .018, .07], [-.76, .075, .04, .088], [-.62, .05, .03, .082]], 6, 3);
  loft(V, I, [[-.5, .035, .035], [.62, .035, .035]], 4, 0);
  for (const s of [-1, 1]) { for (const z of [-.3, .04, .38]) loft(V, I, [[z - .15, .085, .1, 0, s * .125], [z + .15, .085, .1, 0, s * .125]], 6, z === .04 ? 1 : 0);
    loft(V, I, [[.6, .085, .085, 0, s * .1], [.9, .075, .075, 0, s * .1], [.97, .055, .055, 0, s * .1]], 6, 0, 0, 2); slab(V, I, [[s * .2, .1, -.42], [s * .23, .1, -.42], [s * .23, .1, -.38], [s * .2, .1, -.38]], .012, 4); }
  for (let q = 0; q < V.length; q += 8) { V[q] *= 1.7; V[q + 1] *= 1.7; }
  return mesh(V, I);
}
function shipMeshB() {                                        // a runner: two long hulls, a bridge between, the pilot in a pod amidships
  const V = [], I = [];
  for (const s of [-1, 1]) { loft(V, I, [[-.98, .01, .01, 0, s * .24], [-.6, .05, .045, 0, s * .24], [.3, .06, .05, 0, s * .24], [.72, .05, .045, 0, s * .24]], 6, 0); loft(V, I, [[.7, .055, .055, 0, s * .24], [.94, .045, .045, 0, s * .24]], 6, 0, 0, 2);
    slab(V, I, [[s * .2, .05, -.7], [s * .28, .05, -.7], [s * .28, .05, -.3], [s * .2, .05, -.3]], .01, 1); slab(V, I, [[s * .23, .06, .6], [s * .26, .06, .6], [s * .26, .06, .64], [s * .23, .06, .64]], .012, 4); }
  slab(V, I, [[-.22, 0, -.22], [.22, 0, -.22], [.22, 0, .46], [-.22, 0, .46]], .022, 0); slab(V, I, [[-.22, 0, .5], [.22, 0, .5], [.22, 0, .6], [-.22, 0, .6]], .012, 0);
  loft(V, I, [[-.48, .02, .02, .03], [-.26, .075, .05, .05], [.06, .075, .05, .05], [.22, .03, .03, .035]], 6, 3);
  for (let q = 0; q < V.length; q += 8) { V[q] *= 1.7; V[q + 1] *= 1.7; }
  return mesh(V, I);
}
function shipMeshC() {                                        // an interceptor: a flat arrowhead body, a spine, drives out on the trailing corners
  const V = [], I = [];
  for (const s of [-1, 1]) { const mx = (P) => s < 0 ? mirX(P) : P;
    slab(V, I, mx([[0, 0, -1], [.56, -.012, .42], [.42, -.012, .72], [0, 0, .62]]), .034, 0); slab(V, I, mx([[.4, -.005, .2], [.56, -.012, .42], [.5, -.012, .56], [.36, -.005, .5]]), .038, 1);
    loft(V, I, [[.12, .045, .04, -.02, s * .5], [.78, .055, .05, -.02, s * .5], [.9, .038, .036, -.02, s * .5]], 6, 0, 0, 2); slab(V, I, mx([[.52, .0, .44], [.56, 0, .44], [.56, 0, .48], [.52, 0, .48]]), .03, 4); }
  loft(V, I, [[-.62, .03, .02, .03], [-.2, .1, .06, .05], [.4, .12, .07, .05], [.76, .075, .05, .04]], 6, 0); loft(V, I, [[-.58, .02, .012, .058], [-.36, .055, .03, .088], [-.1, .04, .024, .086]], 6, 3);
  return mesh(V, I);
}
let mShips = [shipMeshA(), shipMeshB(), shipMeshC()];

// ---- a pause menu that can be seen in a headset: time slows to a crawl while it is open ----
function pausePanel() {
  if (jpOpen) return closePanel();
  if (xr) return vrMenu();
  panel('Paused', `${SYS.locs[SYS.loc].name} · ${SYS.name}`, [{ name: 'Resume', desc: '', run: () => {} }, { name: 'Ikosagon radio', kind: CFG.radio ? 'on' : 'off', desc: 'Your tracks, or the ship\'s own score', run: () => { CFG.radio = CFG.radio ? 0 : 1; setUi(); pausePanel(); } },
    { name: 'Other pilots', kind: ['peaceful', 'wary', 'hostile'][CFG.host], desc: 'Whether raiders come for you', run: () => { CFG.host = (CFG.host + 1) % 3; hostLv = CFG.host; setUi(); npcSpawn(); pausePanel(); } },
    { name: 'HUD colour', kind: HCOL[CFG.hud][0], desc: '', run: () => { CFG.hud = (CFG.hud + 1) % HCOL.length; setUi(); pausePanel(); } }, { name: 'Journal', desc: 'Contracts, standing, crew, log', run: journalPanel }, { name: 'Star map and full settings', desc: 'These open on the flat screen: leave the headset view to use them', run: () => { if (xr) vr(); } }], 'Right stick click or B closes · ' + BUILD);
}
// the menu inside the headset: only what applies in VR, the controller map, and the way back to the main menu
function vrMenu() {
  panel('Paused', `${SYS.locs[SYS.loc].name} · ${SYS.name}`, [{ name: 'Resume', desc: '', run: () => {} },
    { name: 'Seat height', kind: VRH[vrHi()][0], desc: 'Where the cabin floor meets your room\'s floor', run: () => { CFG.vrH = VRH[(vrHi() + 1) % VRH.length][1]; setUi(); vrMenu(); } },
    { name: 'Cockpit', kind: cockpit ? 'on' : 'off', desc: 'The cabin around you, or open space', run: () => { const b = $('ck'); if (b) b.click(); vrMenu(); } },
    { name: 'Ikosagon radio', kind: CFG.radio ? 'on' : 'off', desc: 'Your tracks, or the ship\'s own score', run: () => { CFG.radio = CFG.radio ? 0 : 1; setUi(); vrMenu(); } },
    { name: 'Other pilots', kind: ['peaceful', 'wary', 'hostile'][CFG.host], desc: 'Whether raiders come for you', run: () => { CFG.host = (CFG.host + 1) % 3; hostLv = CFG.host; setUi(); npcSpawn(); vrMenu(); } },
    { name: 'HUD colour', kind: HCOL[CFG.hud][0], desc: '', run: () => { CFG.hud = (CFG.hud + 1) % HCOL.length; setUi(); vrMenu(); } },
    { name: 'Journal', desc: 'Contracts, standing, crew, log', run: journalPanel },
    { name: 'Controls', desc: 'The controller map', run: () => panel('Controls', 'Touch controllers', [
      { name: 'Left stick', desc: 'Steer' }, { name: 'Right stick', desc: 'Throttle · in menus, move up and down' }, { name: 'Right trigger', desc: 'Fire' }, { name: 'Grip (either)', desc: 'Boost: hold it and it builds' },
      { name: 'A', desc: 'Hail, dock or open what you point at · select in menus' }, { name: 'B', desc: 'Next target · close menus' }, { name: 'Left trigger', desc: 'Next target' },
      { name: 'X', desc: 'Journal' }, { name: 'Y or right stick click', desc: 'This menu' }, { name: 'Left stick click', desc: 'Next weapon' }], 'B to close') },
    { name: 'Exit to main menu', desc: 'Leave the headset view; Enter VR brings you back', run: () => { try { xr.end(); } catch {} menu(); } }], 'Right stick to choose · A to select · B to close');
}

let mHubS = hubMesh(), mDockS = dockMesh();

// ---- a click closes any panel that only has something to read ----
addEventListener('mousedown', (e) => { try { if (jpOpen && !items.some((d) => d.run) && !(e.target.closest && e.target.closest('button'))) { closePanel(); e.stopPropagation(); e.preventDefault(); } } catch {} }, true);
addEventListener('touchend', (e) => { try { if (jpOpen && !items.some((d) => d.run)) closePanel(); } catch {} }, true);

// ---- the sound of a voice on the radio: no words, just the shape of speech through a narrow band, kept low ----
function radioVoice(len) {
  if (!AC || AC.state !== 'running') return;
  const t0 = AC.currentTime + .05, out = AC.createGain(), bp = AC.createBiquadFilter(), hp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = .7; hp.type = 'highpass'; hp.frequency.value = 350; out.gain.value = .045 * CFG.vCht; if (!CFG.vCht) return; bp.connect(hp).connect(out).connect(AG);
  const base = 95 + Math.random() * 70; let t = t0; burst(t0 - .04, .03, .012, 2600, 1800, 'bandpass');
  while (t < t0 + len) { const d = .07 + Math.random() * .13, o = AC.createOscillator(), g = AC.createGain(), f1 = AC.createBiquadFilter(), f2 = AC.createBiquadFilter(), p = base * (.85 + Math.random() * .4);
    o.type = 'sawtooth'; o.frequency.setValueAtTime(p, t); o.frequency.linearRampToValueAtTime(p * (.88 + Math.random() * .25), t + d);
    f1.type = f2.type = 'bandpass'; f1.frequency.value = 300 + Math.random() * 500; f1.Q.value = 5; f2.frequency.value = 900 + Math.random() * 1500; f2.Q.value = 7;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.9, t + .02); g.gain.setValueAtTime(.9, t + d - .03); g.gain.linearRampToValueAtTime(.0001, t + d);
    o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(bp); o.start(t); o.stop(t + d + .01); t += d + (Math.random() < .22 ? .12 + Math.random() * .15 : .015); }
  burst(t + .02, .04, .012, 2400, 1500, 'bandpass');
}

// ---- seekers: four in the rack, one back every five seconds; they need a ship on the target list and they follow it ----
const MSL = []; let mslN = 4, mslT = 0;
function seekerFire() {
  const c = navCur(); if (!c || !c.npc) return tip('Seekers need a ship targeted: press T', 2500); if (mslN < 1) return;
  mslN--; const sd = MSL.length & 1 ? 1 : -1; MSL.push({ x: px + sRx * sd * 2.7 - sUx * 1.3 + sFx * 4, y: py + sRy * sd * 2.7 - sUy * 1.3 + sFy * 4, z: pz + sRz * sd * 2.7 - sUz * 1.3 + sFz * 4, dx: sFx, dy: sFy, dz: sFz, s: Math.hypot(vx, vy, vz) + 120, tg: c.npc, t: 0 }); gunSnd(); trauma = Math.min(1, trauma + .1);
}
function mslTick(dt) {
  if (mslN < 4) { mslT += dt; if (mslT > 5) { mslT = 0; mslN++; } }
  for (let i = MSL.length - 1; i >= 0; i--) { const m = MSL[i], g = m.tg; m.t += dt;
    if (m.t > 9 || !NPCS.includes(g)) { fxAdd(m.x, m.y, m.z, 12, 1, .6, .3); MSL.splice(i, 1); continue; }
    const ex = g.x - m.x, ey = g.y - m.y, ez = g.z - m.z, d = Math.hypot(ex, ey, ez) || 1, k = Math.min(1, dt * 3.2); m.dx += (ex / d - m.dx) * k; m.dy += (ey / d - m.dy) * k; m.dz += (ez / d - m.dz) * k; const l = Math.hypot(m.dx, m.dy, m.dz) || 1; m.dx /= l; m.dy /= l; m.dz /= l;
    m.s = Math.min(560, m.s + 420 * dt); m.x += m.dx * m.s * dt; m.y += m.dy * m.s * dt; m.z += m.dz * m.s * dt;
    put(DT, m.x - px - m.dx * 14, m.y - py - m.dy * 14, m.z - pz - m.dz * 14, .35, -m.dx * 28, -m.dy * 28, -m.dz * 28, 0, 8, 4, 1, 0); put(DPa, m.x - px, m.y - py, m.z - pz, 2.5, 0, 0, 0, .5, 3, 1.6, .5, 0);
    if (d < g.size * 1.8 + m.s * dt) { npcHit(g, 75 * (crew('gun') ? 1.3 : 1), Math.hypot(g.x - px, g.y - py, g.z - pz), m.x, m.y, m.z, 4); fxAdd(m.x, m.y, m.z, 30, 1, .7, .35); MSL.splice(i, 1); }
  }
}

// ============================================================================
// The score: seeded, soft electronic music for space, built on raw Web Audio.
// Shawn's direction: clean and sparse, deep but soft (low-passed kick, clean sub), warm sine/triangle pads with chorus,
// a soft filtered triangle lead, dark sparse hats, a restrained snare, long reverb, gentle pump, a quiet limiter;
// a touch of The Weeknd: 7th chords, a shimmering delayed arp, a snare on 2 and 4 in the night style.
// One seed per star system (tempo, key, mode, progression), varied per place (patterns, motif, colours).
// Speed drives the arrangement: drifting holds the ambient sections, cruising grooves, boosting brings the full section.
// ============================================================================
const SC = { bus: null, trk: null, key: '', bar: 0, step: 0, t: 0, sec: 'intro', secBar: 0, secLen: 8, drops: 0 };
const MODES = { minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };
const PROGS2 = [[0, 5, 2, 6], [0, 4, 5, 6], [0, 5, 0, 5], [0, 6, 0, 6], [0, 3, 0, 3], [5, 6, 0, 0], [0, 5, 3, 6], [0, 2, 6, 5]];
function scNote(T, deg, oct) { const sc = T.scale, o = Math.floor(deg / 7), d = deg - o * 7; return T.root + sc[d] + 12 * (o + oct); }
function scInit() {
  if (SC.bus) return;
  const A = AC;
  SC.lim = A.createDynamicsCompressor(); SC.lim.threshold.value = -4; SC.lim.knee.value = 10; SC.lim.ratio.value = 4; SC.lim.attack.value = .03; SC.lim.release.value = .3;   // slow enough not to grind on the sub
  SC.out = A.createGain(); SC.out.gain.value = 0; SC.lim.connect(SC.out).connect(AG);
  // reverb: a 4.5 s tail with a little pre-delay, darkening as it fades
  const len = A.sampleRate * 4.5 | 0, ir = A.createBuffer(2, len, A.sampleRate), pre = A.sampleRate * .05 | 0;
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let lp = 0; for (let i = pre; i < len; i++) { const k = (i - pre) / (len - pre); lp += (Math.random() * 2 - 1 - lp) * (.85 - .7 * k); d[i] = lp * Math.pow(1 - k, 2); } }
  SC.rev = A.createConvolver(); SC.rev.buffer = ir; SC.revIn = A.createGain(); SC.revIn.gain.value = .55; SC.revIn.connect(SC.rev).connect(SC.lim);
  // eighth-note delay, ping-pong, soft feedback
  const dl = A.createDelay(2), dr = A.createDelay(2), fb = A.createGain(), hp = A.createBiquadFilter(), lp = A.createBiquadFilter(), mg = A.createChannelMerger(2), dw = A.createGain();
  hp.type = 'highpass'; hp.frequency.value = 350; lp.frequency.value = 3200; fb.gain.value = .28; dw.gain.value = .6;
  SC.dlyIn = A.createGain(); SC.dlyIn.connect(hp).connect(lp).connect(dl); dl.connect(dr); dr.connect(fb).connect(dl); dl.connect(mg, 0, 0); dr.connect(mg, 0, 1); mg.connect(dw); dw.connect(SC.lim); dw.connect(SC.revIn);
  SC.dl = dl; SC.dr = dr;
  // a gentle pump: everything ducks a little under the kick
  SC.pump = A.createGain(); SC.bus = A.createGain(); SC.bus.gain.value = 1; SC.bus.connect(SC.pump); SC.pump.connect(SC.lim); SC.pump.connect(SC.revIn);
  SC.kickBus = A.createBiquadFilter(); SC.kickBus.type = 'lowpass'; SC.kickBus.frequency.value = 120; SC.kickBus.connect(SC.lim);
  // atmosphere: a low breath of filtered noise that never stops
  const ns = A.createBufferSource(); ns.buffer = NB; ns.loop = true; SC.atmF = A.createBiquadFilter(); SC.atmF.type = 'lowpass'; SC.atmF.frequency.value = 400; SC.atmF.Q.value = .5;
  SC.atm = A.createGain(); SC.atm.gain.value = 0; ns.connect(SC.atmF).connect(SC.atm).connect(SC.revIn); ns.start();
}
function scTrack() {
  const sysR = mulberry32((SYS.id * 2654435761) >>> 0), R = mulberry32((SYS.salt ^ 0x5C0E) >>> 0), pick = (r, a) => a[r() * a.length | 0];
  const T = {};
  T.bpm = SYS.atm ? 98 + (sysR() * 10 | 0) : 112 + (sysR() * 16 | 0); T.root = 45 + (sysR() * 7 | 0) - 3; T.mode = sysR() < .6 ? 'minor' : 'dorian'; T.scale = MODES[T.mode];
  T.prog = pick(sysR, PROGS2); T.prog2 = R() < .5 ? T.prog : pick(R, PROGS2);
  T.style = R() < .5 ? 'night' : 'drift';                                     // night: snare on 2 and 4, shimmering arp. drift: snare on 3, sparser
  T.kick = [0, 4, 8, 12]; T.kickVar = R() < .6 ? 14 : -1;                       // the occasional pickup kick, like the sketch's 0.6 on step 14
  T.snare = T.style === 'night' ? [4, 12] : [8];
  T.hat = Array.from({ length: 16 }, (_, i) => i % 2 === 1 && R() < .5 ? 1 : 0);
  T.bass = [0, 0, 4, 0, 0, 7, 4, 0].map((d, i) => R() < .7 ? d : pick(R, [0, 4, 7, 2]));   // rooted, mostly root and fifth
  T.motif = []; let dg = pick(R, [0, 2, 4]);
  for (let i = 0; i < 32; i++) { const on = i % 8 === 0 ? R() < .7 : i % 4 === 0 ? R() < .35 : i % 2 === 0 ? R() < .12 : 0; if (!on) { T.motif.push(null); continue; }
    const mv = R(); dg += mv < .4 ? 1 : mv < .75 ? -1 : mv < .87 ? 2 : -2; dg = Math.max(0, Math.min(9, dg)); T.motif.push(dg); }
  T.arp = pick(R, [[0, 2, 4, 6], [0, 4, 6, 9], [6, 4, 2, 0], [0, 4, 2, 6]]);
  T.lfo = .05 + R() * .1; T.cut = 500 + R() * 400; T.rev = .45 + R() * .2;
  return T;
}
// ---- voices: soft, clean, no distortion ----
function scEnv(g, t, a, peak, d) { g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + d); return t + d + .05; }
function scKick(t, v) {   // deep and soft: a sine dropping into the low end, low-passed, with a gentle pump on everything else
  const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + .08); o.frequency.exponentialRampToValueAtTime(36, t + .4);
  o.connect(g).connect(SC.kickBus); o.start(t); o.stop(scEnv(g, t, .006, v, .5));
  SC.pump.gain.cancelScheduledValues(t); SC.pump.gain.setTargetAtTime(.5, t, .012); SC.pump.gain.setTargetAtTime(1, t + .05, .07);   // the duck eases down and back: a hard step clicks
}
function scNoise(t, v, type, f, dur, dst, q) { const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = NB; fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q; s.connect(fl).connect(g).connect(dst || SC.bus); s.start(t, Math.random()); s.stop(scEnv(g, t, .001, v, dur)); return g; }
function scSnare(t, v) { const g = scNoise(t, v, 'bandpass', 1800, .18, SC.bus, .8); g.connect(SC.revIn); }        // restrained, and most of it is room
function scHat(t, v) { scNoise(t, v, 'highpass', 6000, .04); }
function scBass(t, n, dur, v) {   // clean sub, low-passed, legato: no grit
  const o = AC.createOscillator(), o2 = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain(), g2 = AC.createGain(); f.frequency.value = 180;
  o.frequency.value = mf(n); o2.type = 'triangle'; o2.frequency.value = mf(n + 12); g2.gain.value = .12;            // a faint octave so small speakers still hear the line
  o.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(SC.bus);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .02); g.gain.setTargetAtTime(v * .5, t + .05, .3); g.gain.setTargetAtTime(.0001, t + dur, .35);
  o.start(t); o2.start(t); o.stop(t + dur + 2.2); o2.stop(t + dur + 2.2);
}
function scPad(t, notes, dur, v) {   // sine and triangle pairs, slowly detuned against each other (a chorus), 2.5 s swell, 4 s release
  const g = AC.createGain(), f = AC.createBiquadFilter(); f.frequency.value = 1400; f.connect(g); g.connect(SC.bus); g.connect(SC.revIn);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + 2.5); g.gain.setValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(.0001, t + dur + 4);
  for (const n of notes) for (const [ty, dt] of [['sine', -6], ['triangle', 7]]) { const o = AC.createOscillator(), lf = AC.createOscillator(), lg = AC.createGain(); o.type = ty; o.frequency.value = mf(n); o.detune.value = dt;
    lf.frequency.value = .3 + Math.random() * .4; lg.gain.value = 6; lf.connect(lg).connect(o.detune); o.connect(f); o.start(t); lf.start(t); o.stop(t + dur + 4.1); lf.stop(t + dur + 4.1); }
}
function scLead(t, n, dur, v, T) {   // soft triangle through a slowly drifting low-pass, mostly heard through the delay
  const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain(); o.type = 'triangle'; o.frequency.value = mf(n); f.Q.value = 2;
  const drift = 150 + 450 * (.5 + .5 * Math.sin(t * T.lfo * 6.283)); f.frequency.setValueAtTime(drift * 4, t + .05); f.frequency.exponentialRampToValueAtTime(drift, t + .65);
  o.connect(f).connect(g); g.connect(SC.bus); g.connect(SC.dlyIn);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .05); g.gain.setTargetAtTime(v * .2, t + .1, .3); g.gain.setTargetAtTime(.0001, t + dur, .3); o.start(t); o.stop(t + dur + 1.5);
}
function scPluck(t, n, v) {   // the night arp: a soft triangle pluck that lives in the delay
  const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain(); o.type = 'triangle'; o.frequency.value = mf(n); f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(700, t + .2);
  o.connect(f).connect(g); g.connect(SC.bus); g.connect(SC.dlyIn); o.start(t); o.stop(scEnv(g, t, .004, v, .35));
}
function scSwell(t, dur, v) { const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = NB; s.loop = true; f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2500, t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(.0001, t + dur + .3); s.connect(f).connect(g).connect(SC.revIn); s.start(t); s.stop(t + dur + .4); }   // a soft breath into the full section
// ---- arrangement ----
const SECS = { intro: { len: 8, k: 0, h: 0, sn: 0, b: 0, pad: 1, arp: 0, lead: 0 }, groove: { len: 8, k: 1, h: .6, sn: 0, b: 1, pad: 1, arp: .5, lead: 0 }, build: { len: 4, k: 1, h: 1, sn: 1, b: 1, pad: 1, arp: 1, lead: 0 }, drop: { len: 16, k: 1, h: 1, sn: 1, b: 1, pad: .8, arp: 1, lead: 1 }, breakdown: { len: 8, k: 0, h: 0, sn: 0, b: 0, pad: 1, arp: .4, lead: 1 } };
function scNextSec(e) {
  const s = SC.sec;
  if (e < .22) return s === 'drop' || s === 'build' ? 'breakdown' : 'intro';
  if (e < .55) return s === 'intro' || s === 'breakdown' ? 'groove' : s === 'groove' ? (Math.random() < .5 ? 'groove' : 'build') : s === 'build' ? 'drop' : 'breakdown';
  return s === 'build' ? 'drop' : s === 'drop' ? (SC.drops % 2 ? 'breakdown' : 'drop') : 'build';
}
function scStep(t, T, e) {
  const s = SC.step & 15, S = SECS[SC.sec], spb = 60 / T.bpm / 4, prog = (SC.bar >> 4) & 1 ? T.prog2 : T.prog, rd = prog[(SC.secBar >> 1) & 3], bk = SC.sec === 'build' ? (SC.secBar + s / 16) / SC.secLen : 1;
  if (S.k && (T.kick.includes(s) || s === T.kickVar && SC.sec === 'drop') && Math.random() < .92) scKick(t, (s === T.kickVar ? .17 : .27) * (.75 + .25 * Math.random()));
  if (S.sn && T.snare.includes(s) && (T.style === 'night' || Math.random() < .6)) scSnare(t, .05 * bk);
  if (S.h && T.hat[s] && Math.random() < S.h) scHat(t, (.008 + .008 * Math.random()) * (SC.sec === 'build' ? .5 + .5 * bk : 1));
  if (S.b && s % 4 === 0) scBass(t, scNote(T, rd + T.bass[(s >> 2) + (SC.secBar & 1) * 4], -1), spb * 3.6, .19 + .04 * Math.random());
  if (s === 0 && S.pad) scPad(t, [scNote(T, rd, 0), scNote(T, rd + 2, 0), scNote(T, rd + 4, 0), scNote(T, rd + 6, 0)], spb * 16, .012 * S.pad);   // a 7th chord, one bar
  if (S.arp && T.style === 'night' && s % 2 === 0 && Math.random() < S.arp * (.4 + .6 * e)) scPluck(t, scNote(T, rd + T.arp[(s >> 1) % 4], 1), .022);
  if (S.arp && T.style === 'drift' && s % 4 === 2 && Math.random() < S.arp * .5) scPluck(t, scNote(T, rd + T.arp[(s >> 2) % 4], 1), .018);
  if (S.lead) { const dg = T.motif[(SC.secBar & 1) * 16 + s]; if (dg != null && Math.random() < .85) scLead(t, scNote(T, dg, 1), spb * 3, .035, T); }
  if (SC.sec === 'build' && SC.secBar === SC.secLen - 2 && s === 0) scSwell(t, spb * 32, .05);
}
function scTick() {
  if (!AC || AC.state !== 'running') return;
  scInit();
  const key = SYS.id + ':' + SYS.loc + ':' + (SYS.atm ? 1 : 0);
  if (key !== SC.key) { SC.key = key; SC.trk = scTrack(); SC.sec = 'intro'; SC.secBar = 0; SC.secLen = 8; SC.drops = 0; const T = SC.trk, q = 60 / T.bpm / 4; SC.dl.delayTime.value = q * 2; SC.dr.delayTime.value = q * 2; SC.revIn.gain.value = T.rev; }
  const T = SC.trk, air = radioAir(), solo = AC.currentTime < cueEnd, now = AC.currentTime;
  SC.out.gain.setTargetAtTime(air || muted ? 0 : solo ? .3 : .8, now, air ? .4 : 1.5);
  SC.atm.gain.setTargetAtTime(air ? 0 : .01 + .015 * (1 - energy), now, 1); SC.atmF.frequency.setTargetAtTime(250 + 600 * energy, now, .5);
  if (air) { SC.t = Math.max(SC.t, now + .1); return; }
  if (SC.t < now) SC.t = now + .05;
  const spb = 60 / T.bpm / 4;
  while (SC.t < now + .2) {
    scStep(SC.t, T, energy);
    SC.step++; if ((SC.step & 15) === 0) { SC.bar++; SC.secBar++;
      if (SC.secBar % 4 === 0 && SC.secBar < SC.secLen) {                                 // speed changes cut in at the next four-bar line
        if (energy > .55 && (SC.sec === 'intro' || SC.sec === 'groove' || SC.sec === 'breakdown')) { SC.sec = 'build'; SC.secLen = 4; SC.secBar = 0; }
        else if (energy < .2 && (SC.sec === 'drop' || SC.sec === 'build')) { SC.sec = 'breakdown'; SC.secLen = 8; SC.secBar = 0; } }
      if (SC.secBar >= SC.secLen) { if (SC.sec === 'drop') SC.drops++; SC.sec = scNextSec(energy); SC.secLen = SECS[SC.sec].len; SC.secBar = 0; } }
    SC.t += spb;
  }
}

// ---- the aux display: a small 16:9 monochrome CRT left of the dash. U opens it full screen as the ship's universal display,
// with tabs (status, hold, log, nav, comms). One painter draws both: in white onto the dash screen's canvas (the cockpit shader
// tints it the HUD colour and adds scanlines, glow, flicker and roll), and in the HUD colour onto the full-screen canvas.
// Its 16:9 frame is sized so a whole game could later run inside it.
const PIP = { c: null, x: null, t: 0, tex: null, col: [1, .7, .3], hud: -1, tab: 0, big: 0, o: null, bc: null, bx: null, bt: 0, tabR: [], log: [],
  tabs: ['STATUS', 'HOLD', 'LOG', 'NAV', 'COMMS'] };
function pipLog(s) { try { if (!s || (PIP.log[0] && PIP.log[0].s === s)) return; PIP.log.unshift({ s: String(s), t: Date.now() }); if (PIP.log.length > 40) PIP.log.pop(); } catch {} }
function pipInit() {
  PIP.c = document.createElement('canvas'); PIP.c.width = 640; PIP.c.height = 360; PIP.x = PIP.c.getContext('2d', { willReadFrequently: true });   // kept on the CPU: uploading it then never stalls the GPU
  PIP.tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, PIP.tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 640, 360, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.activeTexture(gl.TEXTURE0);
}
function pipPaint(x, W, ink, big) {
  const t = performance.now() / 1000, F = (w, px) => `${w} ${px}px ui-monospace,Consolas,"Courier New",monospace`, k = W / 640;
  x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#000'; x.fillRect(0, 0, W, W * 9 / 16); x.setTransform(k, 0, 0, k, 0, 0);
  x.fillStyle = x.strokeStyle = ink; x.textBaseline = 'middle'; x.textAlign = 'left'; x.lineWidth = 2;
  const A = (a, f) => { x.globalAlpha = a; f(); x.globalAlpha = 1; }, T = (s, X, Y, sz, w = 700, al = 'left') => { x.font = F(w, sz); x.textAlign = al; x.fillText(s, X, Y); x.textAlign = 'left'; };
  const seg = (X, Y, n, w, h, v, blink) => { for (let j = 0; j < n; j++) { const on = v >= (j + .5) / n; A(on ? (blink && (t * 3 | 0) % 2 ? .35 : 1) : .16, () => x.fillRect(X + j * (w + 2.6), Y - h / 2, w, h)); } };
  // header: tabs on the left, the purse on the right
  let tx = 22; PIP.tabR = [];
  PIP.tabs.forEach((s, i) => { x.font = F(700, 20); const w = x.measureText(s).width + 26; PIP.tabR.push([tx, 14, w, 34]);
    if (i === PIP.tab) { x.fillRect(tx, 14, w, 34); x.fillStyle = '#000'; x.fillText(s, tx + 13, 32); x.fillStyle = ink; } else { A(.75, () => x.fillText(s, tx + 13, 32)); A(.35, () => x.strokeRect(tx + 1, 15, w - 2, 32)); } tx += w + 8; });
  T('CR ' + Math.round(ST.credits || 0), 618, 32, 20, 700, 'right');
  A(.55, () => x.fillRect(18, 58, 604, 2));
  const tab = PIP.tabs[PIP.tab];
  if (tab === 'STATUS') {
    const cx = 132, cy = 196, r = 98; x.lineWidth = 2.4; x.beginPath(); x.arc(cx, cy, r, 0, 6.283); x.stroke();
    for (let i = 1; i < 7; i++) { const a = (i / 7 + t * .04) % 1 * Math.PI, w = Math.abs(Math.cos(a)) * r; A(.3 + .55 * Math.sin(a), () => { x.beginPath(); x.ellipse(cx, cy, w, r, 0, 0, 6.283); x.stroke(); }); }
    A(.5, () => { for (let i = 1; i < 6; i++) { const yy = cy - r + i * r * 2 / 6, w = Math.sqrt(r * r - (yy - cy) ** 2); x.beginPath(); x.ellipse(cx, yy, w, w * .17, 0, 0, 6.283); x.stroke(); } });
    const ba = t * .8; x.beginPath(); x.arc(cx + Math.cos(ba) * r * .55, cy + Math.sin(ba * .7) * r * .4, 5, 0, 6.283); x.fill();
    [['HULL', ST.hull], ['O2', ST.o2 == null ? 100 : ST.o2], ['FUEL', ST.fuel], ['WPNS', ST.wen], ['SPICE', ST.spice || 0]].forEach(([n, v], i) => { const y = 84 + i * 40, v1 = Math.max(0, Math.min(100, v || 0));
      T(n, 262, y, 22); seg(352, y, 14, 13, 22, v1 / 100, v1 < 25); T(String(Math.round(v1)), 616, y, 22, 700, 'right'); });
    A(.7, () => T(`SPEED ${Math.round(Math.hypot(vx, vy, vz))}   HOLD ${slotsUsed()}/${holdSlots()}`, 262, 280, 17, 600));
  } else if (tab === 'HOLD') {
    const it = ITEMS.filter((q) => q.get() > 0); T(`CARGO  ${slotsUsed()} / ${holdSlots()} SLOTS`, 22, 82, 18); seg(330, 82, 20, 11, 16, slotsUsed() / holdSlots());
    if (!it.length) A(.6, () => T('HOLD EMPTY · MINE ORE OR TRADE AT A HUB', 22, 130, 18, 600));
    it.slice(0, 12).forEach((q, i) => { const X = 22 + (i % 2) * 310, Y = 120 + (i >> 1) * 34; T(q.name.toUpperCase().slice(0, 18), X, Y, 18, 600); T('×' + q.get(), X + 290, Y, 18, 700, 'right'); A(.25, () => x.fillRect(X, Y + 14, 290, 1.5)); });
  } else if (tab === 'LOG') {
    if (!PIP.log.length) A(.6, () => T('NO ENTRIES YET', 22, 92, 18, 600));
    PIP.log.slice(0, 9).forEach((e, i) => { const d = new Date(e.t), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      A(i ? .8 - i * .06 : 1, () => { T(hm, 22, 86 + i * 28, 16, 700); T(e.s.toUpperCase().slice(0, 50), 96, 86 + i * 28, 16, 500); }); });
  } else if (tab === 'NAV') {
    T(((SYS.name || '') + '  ·  SECTOR ' + (SYS.sec || []).join(' ')).toUpperCase(), 22, 84, 19);
    (SYS.locs || []).slice(0, 7).forEach((l, i) => { const Y = 122 + i * 30, here = i === SYS.loc; if (here) { x.fillRect(22, Y - 12, 8, 24); } A(here ? 1 : .7, () => T(l.name.toUpperCase().slice(0, 26), 42, Y, 18, here ? 700 : 500)); if (here) T('YOU ARE HERE', 330, Y, 14, 600); });
    A(.7, () => (SYS.planets || []).slice(0, 3).forEach((p, i) => T('◯ ' + p.name.toUpperCase(), 470, 122 + i * 30, 16, 600)));
  } else {
    const on = !!CFG.radio, air = on && radioAir(); T('IKOSAGON RADIO', 22, 92, 22); T(on ? (air ? 'ON AIR' : 'TUNED · BETWEEN SONGS') : 'OFF', 22, 126, 18, 600);
    for (let i = 0; i < 48; i++) { const h = on ? (air ? 6 + 30 * Math.abs(Math.sin(t * (3 + i % 5) + i * 1.7)) * (.4 + .6 * Math.abs(Math.sin(i * .37))) : 3 + 2 * Math.sin(t * 2 + i)) : 2; x.fillRect(330 + i * 6, 110 - h / 2, 4, h); }
    A(.6, () => T('R TURNS THE RADIO OFF AND ON TO A NEW STATION', 22, 160, 15, 500));
    A(.55, () => x.fillRect(18, 186, 604, 1.5)); T('CHANNEL', 22, 210, 18);
    A(.75, () => T((PIP.log[0] ? PIP.log[0].s : 'QUIET').toUpperCase().slice(0, 52), 22, 242, 15, 500));
  }
  // footer: where you are, the clock, and the key that opens or closes it
  A(.55, () => x.fillRect(18, 314, 604, 2));
  const loc = SYS.locs && SYS.locs[SYS.loc] ? SYS.locs[SYS.loc].name : '', st = Math.floor(performance.now() / 1000), cl = [Math.floor(st / 3600) % 100, Math.floor(st / 60) % 60, st % 60].map((v) => String(v).padStart(2, '0')).join(':');
  T(loc.toUpperCase().slice(0, 20), 22, 336, 16, 600); T('T+ ' + cl, 618, 336, 16, 600, 'right');
  T((big ? '1-5  TAB' : 'TAB') + ((t * 2 | 0) % 2 ? ' _' : ''), 430, 308, 14, 600, 'right');
}
function pipTick() {
  if (!PIP.c) pipInit();
  if (PIP.hud !== CFG.hud) { PIP.hud = CFG.hud; const h = HCOL[CFG.hud][1][3], v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); PIP.col = v.map((c) => Math.pow(c, 2.2) * 1.2); }
  if (PIP.big) return;
  const now = performance.now(); if (now - PIP.t < 2200) return; PIP.t = now;
  pipPaint(PIP.x, 640, '#fff', 0); gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, PIP.tex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, PIP.c); gl.activeTexture(gl.TEXTURE0);
}
// full screen: the same screen, close up, behind curved glass
function pipOpen() {
  if (!PIP.o) {
    const st = document.createElement('style'); st.textContent = `#pipO{position:fixed;inset:0;z-index:9;display:none;align-items:center;justify-content:center;background:#05070c}body.pip #hud,body.pip #jp,body.pip #fire,body.pip #jb,body.pip #o{opacity:0!important;visibility:hidden!important}
#pipF{position:relative;width:min(92vw,calc(86vh*16/9));aspect-ratio:16/9;border-radius:2.2vmin;padding:1.1vmin;background:#08090b;box-shadow:0 0 0 2px #1d2229,0 0 0 1.2vmin #0d0f12,0 2vmin 6vmin #000}
#pipF canvas{width:100%;height:100%;display:block;border-radius:1.6vmin;filter:drop-shadow(0 0 .5vmin var(--pg))}
#pipF i{position:absolute;inset:1.1vmin;border-radius:1.6vmin;pointer-events:none;background:repeating-linear-gradient(#0000 0 2px,#0006 2px 4px),radial-gradient(ellipse at 50% 50%,#0000 60%,#000b 100%),linear-gradient(160deg,#ffffff12,#0000 35%);animation:pipFl .09s steps(2) infinite}
@keyframes pipFl{50%{opacity:.86}}`; document.head.appendChild(st);
    PIP.o = document.createElement('div'); PIP.o.id = 'pipO'; PIP.o.innerHTML = '<div id=pipF><canvas width=1280 height=720></canvas><i></i></div>'; document.body.appendChild(PIP.o);
    PIP.bc = PIP.o.querySelector('canvas'); PIP.bx = PIP.bc.getContext('2d');
    PIP.bc.addEventListener('click', (e) => { const r = PIP.bc.getBoundingClientRect(), X = (e.clientX - r.left) / r.width * 640, Y = (e.clientY - r.top) / r.height * 360; PIP.tabR.forEach(([a, b, w, h], i) => { if (X > a && X < a + w && Y > b && Y < b + h) PIP.tab = i; }); });
    PIP.o.addEventListener('click', (e) => { if (e.target === PIP.o) pipClose(); });
  }
  PIP.big = 1; PIP.o.style.display = 'flex'; PIP.o.style.setProperty('--pg', HCOL[CFG.hud][1][3] + '88'); document.body.classList.add('pip'); try { document.exitPointerLock(); } catch {} K.KeyW = K.KeyS = 0;
  const loop = () => { if (!PIP.big) return; pipPaint(PIP.bx, 1280, HCOL[CFG.hud][1][3], 1); requestAnimationFrame(loop); }; loop();
}
function pipClose() { PIP.big = 0; if (PIP.o) PIP.o.style.display = 'none'; document.body.classList.remove('pip'); }
function pipKey(e) {
  if (e.type !== 'keydown') return; const n = PIP.tabs.length;
  if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyU' || (CFG.keys.Tab && e.code === CFG.keys.Tab)) pipClose();
  else if (e.code === 'ArrowRight' || e.code === 'KeyE' || e.code === 'KeyD') PIP.tab = (PIP.tab + 1) % n;
  else if (e.code === 'ArrowLeft' || e.code === 'KeyQ' || e.code === 'KeyA') PIP.tab = (PIP.tab + n - 1) % n;
  else if (/^Digit[1-5]$/.test(e.code)) PIP.tab = Math.min(n - 1, +e.code[5] - 1);
}

// ======================================================================================================================
// ---- the living: a persistent cast of pilots, ships that fly alongside to talk, and escort runs ----
// The cast is saved (ST.cast): each pilot has a name, a ship, a temperament, a home system, how they feel about you and
// what they remember you doing. Now and then one flies up alongside, holds station off your wing and talks over the radio;
// offers are answered with F (A in a headset) or simply ignored. Nothing here takes the controls away.
// ======================================================================================================================
const TRAIT = ['warm', 'gruff', 'nervous', 'wry', 'formal', 'ambitious'];
const VOICE = {      // {c} your callsign · {me} their name · {sh} their ship · {pl} this place · {mem} something they remember
  hello: [
    ['{c}! {me} on the {sh}. Mind if I fly alongside a minute?', 'Hey there, {c}. {me}, {sh}. Pulling up on your right, wave if you see me.'],
    ['{c}. {me}, {sh}. Hold your course, I am coming up on your wing.', '{me} on the {sh}. Keep it steady, {c}, I will not take long.'],
    ['Uh, {c}? {me} on the {sh}... sorry, I will be quick. Pulling up beside you.', '{c}, {me} here, {sh}. Please do not shoot, I am just coming up alongside.'],
    ['{c}, {me} here, {sh}. Do not panic, I am only here to ruin your day with paperwork.', '{me}, {sh}, matching your speed, {c}. Nice ship. Shame about the paint.'],
    ['{c}, this is {me}, commanding the {sh}. Requesting a moment of your time.', '{me} of the {sh} to {c}. I have a matter to put to you, if you will hold station.'],
    ['{c}! {me}, {sh}. I have a proposition that will make us both rich.', '{me} on the {sh}, {c}. You look like a pilot who likes money. Let us talk.']],
  again: [
    ['{c}! It is {me} again, on the {sh}. Good to see you out here.', 'Well, if it is not {c}. {me}, {sh}. I hoped we would cross paths again.'],
    ['{c}. {me}. We meet again.', '{me} on the {sh}. Back again, {c}. Fine by me.'],
    ['{c}? Oh good, it is you. {me}, {sh}. I feel safer already.', 'It is {me} again, {c}. On the {sh}. You remember, right?'],
    ['{c}, {me} again. People will start talking.', 'Look who it is. {me}, {sh}. Miss me, {c}?'],
    ['{c}, {me} of the {sh}. A pleasure to meet again.', '{me} to {c}. Our paths cross once more.'],
    ['{c}! {me}, {sh}. I was hoping it was you. I have another one for you.', 'My favourite pilot. {me} here, {c}.']],
  grudge: ['You again, {c}. {me} has not forgotten {mem}.', '{c}. {me}, {sh}. I remember {mem}. Do not expect a smile.', 'Well, well. {c}. After {mem}, you have some nerve flying here.'],
  thanks: ['I still owe you for {mem}, {c}.', 'Never did thank you properly for {mem}.', '{mem}. I tell that story in every bar, {c}.'],
  bye: [['Fly safe, {c}. Peeling off.', 'Catch you around, {c}!'], ['{me} out.', 'Right. Off I go.'], ['Okay. Okay. Sorry to bother you, {c}.', 'Leaving now. Fly safe.'], ['Your loss, {c}. {me} out.', 'Suit yourself. See you in the next life.'], ['Understood. {me} breaking off.', 'Very well. Good flying, {c}.'], ['Your loss, {c}. Plenty more pilots out here.', 'Fine. Call me when you want to be rich.']],
  yes: [['Brilliant, {c}! Thank you.', 'You are a star.'], ['Good.', 'Knew you had sense.'], ['Oh thank goodness. Thank you, {c}.', 'Really? Thank you!'], ['Look at you, being helpful.', 'Excellent. Try not to get us killed.'], ['Much obliged, {c}.', 'Thank you. I will log it.'], ['Now we are talking.', 'Good. Money waits for no one.']],
};
const MEM = { saved: 'that run you flew with us', helped: 'the fuel you spared me', escorted: 'the convoy you brought home', lost: 'the ships we lost on your watch', left: 'you leaving us to the raiders', shot: 'you shooting up my ship', declined: 'you turning me down' };
const CARGO = ['medical supplies', 'seed stock', 'reactor coils', 'mail and family parcels', 'water ice', 'machine parts', 'a cold-sleep pod', 'refinery catalysts', 'live coral', 'a disassembled telescope'];
const FAULT = ['fuel line cracked', 'tanks ran dry two jumps ago', 'converter is coughing', 'navigator misread the burn', 'siphon swarm stripped my reserve'];
let CM = null, ESC = null, cmT = 70 + Math.random() * 40, cmSeq = 0, quietUntil = 0;
const PL = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 };   // the player, seen by a wingman as a formation leader
const cast = () => ST.cast || (ST.cast = {});
const say = (s, ch) => s.replace(/\{c\}/g, call()).replace(/\{me\}/g, ch.n).replace(/\{sh\}/g, ch.sh).replace(/\{pl\}/g, SYS.locs[SYS.loc].name).replace(/\{mem\}/g, ch.mem.length ? MEM[ch.mem[ch.mem.length - 1]] : 'last time');
const pickL = (l) => l[Math.random() * l.length | 0];
function castNew() {
  const R = mulberry32((Date.now() ^ (cmSeq++ * 7919) ^ SYS.salt) >>> 0), id = 'c' + (R() * 1e9 | 0);
  const ch = { id, n: personName(R), sh: pickN(R, NPN), fac: R() < .6 ? SYS.fac : R() * 4 | 0, tr: R() * 6 | 0, home: SYS.sec.slice(), rel: 0, met: 0, mem: [], t: Date.now() };
  const C = cast(), ks = Object.keys(C); if (ks.length >= 60) { ks.sort((a, b) => (C[a].met - C[b].met) || (C[a].t - C[b].t)); delete C[ks[0]]; }
  return C[id] = ch;
}
function castOk(c) { return c && !c.dead && Date.now() >= (c.cool || 0) && (ST.jumps || 0) >= (c.needJ || 0) && !nameBanned(c.dead ? c.n : ''); }
function castPick() {                                                            // someone you know (more likely near their home), or someone new
  const known = Object.values(cast()).filter((c) => c.met > 0 && castOk(c)), local = known.filter((c) => sameSec(c.home, SYS.sec));
  const pool = local.length && Math.random() < .7 ? local : known;
  return pool.length && Math.random() < .55 ? pool[Math.random() * pool.length | 0] : castNew();
}
function remember(ch, m, d) { ch.mem.push(m); if (ch.mem.length > 6) ch.mem.shift(); ch.rel = Math.max(-100, Math.min(100, ch.rel + d)); save(); }
function mkShip(role, x, y, z, name, extra) {
  const a = Object.assign({ i: 500 + (cmSeq++ % 400), role, big: 0, x, y, z, vx: 0, vy: 0, vz: 0, fx: sFx, fy: sFy, fz: sFz, ux: 0, uy: 1, uz: 0, sp: 90, size: [11, 9, 8, 7, 0, 9][role], st: 0, t: 0, hold: 0, wp: [x, y, z], hue: Math.random(), seed: Math.random(), fac: SYS.fac, name, lead: null, off: null, k: 0, greet: 1, toGate: 0 }, extra);
  const hs2 = role === 5 ? [150, 300] : [60, 40]; a.hpM = a.hp = hs2[0]; a.shM = a.sh = hs2[1]; a.shT = -99; a.s = 0; a.var = role === 5 ? 2 : role === 3 ? 1 : a.i & 1; a.cd = 1; a.brk = 0;
  NPCS.push(a); return a;
}
// ---- what they want: a small grammar of offers, filled from the world as it is ----
function mkOffer(ch) {
  if (ch.rel <= -20) return { ty: 'grudge' };
  const r = Math.random(), far = Math.hypot(px, py, pz) > 3800;
  if (r < .4) { const pay = Math.round((260 + Math.random() * 220) * (1 + Math.max(0, ch.rel) / 150) / 10) * 10, cg = pickL(CARGO);
    return { ty: 'escort', pay, cargo: cg, dest: far ? 'the warp gate' : 'the outer marker', text: `I am running ${cg} through ${SYS.locs[SYS.loc].name}. Raiders have been hitting this run. Fly cover to ${far ? 'the warp gate' : 'the outer marker'} and it is ${pay} credits.` }; }
  if (r < .62 && rp().jobs.length < 3) { const j = mkJob(mulberry32((Date.now() ^ cmSeq * 131) >>> 0), 'cm' + cmSeq); j.fac = ch.fac;
    return { ty: 'job', job: j, text: `I need someone I can trust. ${j.text} Pays ${j.pay}.` }; }
  if (r < .78 && ST.fuel > 25) return { ty: 'fuel', pay: 50 + (Math.random() * 60 | 0), text: `My ${pickL(FAULT)}. Could you spare ten units of fuel? I will pay you back with interest.` };
  const tips = [`Word is the trader here is paying over the odds for ${TIERS[1 + (Math.random() * 3 | 0)]} this week.`, `Rich rocks out past ${SYS.locs[(SYS.loc + 1) % SYS.locs.length].name}. I saw a geode the size of a house.`,
    `Watch yourself near ${SYS.locs[(SYS.loc + 2) % SYS.locs.length].name}. Raiders have been sniffing around.`, `Running low on air? ${SYS.planets[1].name} has the gentlest skies for a scoop run.`];
  if (rp().trail < 6) tips.push(`Odd signal reported out at ${trail()[rp().trail].pl}, ${trail()[rp().trail].sy}. Nobody wants to go and look.`);
  return { ty: 'tip', text: pickL(tips) };
}
// ---- a ship flies in, holds station off your wing, talks, then peels away ----
function cmStart() {
  if (tm < quietUntil || SYS.atm) { cmT = 50 + Math.random() * 40; return; }
  const ch = castPick(); if (!ch || !castOk(ch) && ch.met) { cmT = 40; return; }
  const off = mkOffer(ch);
  if ((off.ty === 'grudge' || ch.raider) && tm < quietUntil + 30) { cmT = 80 + Math.random() * 40; return; }
  const rx = sFy * sUz - sFz * sUy, ry = sFz * sUx - sFx * sUz, rz = sFx * sUy - sFy * sUx;
  const a = mkShip(off.ty === 'escort' ? 0 : off.ty === 'grudge' ? 5 : 3, px - sFx * 1400 + rx * 350, py - sFy * 1400 + 60, pz - sFz * 1400 + rz * 350, ch.sh, { pilot: ch.n, cast: ch.id, comms: 1, fac: ch.fac });
  if (ch.raider) { const pwr = 1 + (ch.returns || 1) * .6; a.hp = a.hpM = 150 * pwr; a.sh = a.shM = 300 * pwr; a.rival = ch.id; ch.returns = (ch.returns || 0) + 1; if (ch.returns > 1) mkShip(5, a.x + 90, a.y + 20, a.z + 70, freshRaiderName(Math.random), { hunter: 1, fac: ch.fac }); }
  a.lead = PL; a.off = [75, 12, -150]; a.sp = 420;                               // holds station ahead and to the right: in view on a screen, a glance in a headset
  CM = { a, ch, off, ph: 'approach', t: 0, n: 0 }; navId = 'n' + a.i; navAuto = 0;
}
function cmLine(s) { comm(`${CM.ch.n}, ${CM.ch.sh}: "${s}"`); commT = performance.now() + Math.max(7500, s.length * 75); }   // long lines stay up long enough to read
function cmTick(dt) {
  if (!CM) { cmT -= dt; if (cmT <= 0 && !ESC && !SYS.atm && !jpOpen && !jumpTo && wantedT <= 0 && flying()) { cmT = 160 + Math.random() * 120; cmStart(); } return; }
  const c = CM, a = c.a, d = Math.hypot(a.x - px, a.y - py, a.z - pz); c.t += dt;
  if (a.dead || !NPCS.includes(a)) { CM = null; return; }
  a.sp = Math.max(300, Math.hypot(vx, vy, vz) * 1.3);
  if (c.ph === 'approach') { if (d < 320 || c.t > 40) { c.ph = 'talk'; c.t = 0; const ch = c.ch;
      if (c.off.ty === 'grudge' || ch.raider) { cmLine(ch.ejected ? `I ejected last time, ${call()}. New hull, real shields${ch.returns > 1 ? ', and I did not come alone' : ''}.` : say(pickL(VOICE.grudge), ch)); } else { cmLine(say(pickL(VOICE[ch.met > 1 ? 'again' : 'hello'][ch.tr]), ch)); if (ch.rel >= 15 && ch.mem.length) setTimeout(() => CM && CM.ch === ch && cmLine(say(pickL(VOICE.thanks), ch)), 3800); }
      ch.met++; ch.t = Date.now(); save(); } return; }
  if (c.ph === 'talk' && c.t > 5.5) { c.t = 0;
    if (c.off.ty === 'grudge') { cmLine(ch2(c) < -40 && Math.random() < .6 ? 'I brought some friends this time.' : 'Stay out of my way, and I will stay out of yours.'); if (ch2(c) < -40) cmAmbush(2, 'player'); c.ph = 'leave'; return cmLeave(); }
    cmLine(c.off.text); c.ph = c.off.ty === 'tip' ? 'tip' : 'offer'; return; }
  if (c.ph === 'tip' && c.t > 6) { cmLine(say(pickL(VOICE.bye[c.ch.tr]), c.ch)); return cmLeave(); }
  if (c.ph === 'offer' && c.t > 20) { remember(c.ch, 'declined', -3); cmLine(say(pickL(VOICE.bye[c.ch.tr]), c.ch)); return cmLeave(); }
  if (c.ph === 'leave') { if (d > 3500 || c.t > 25) { fxAdd(a.x, a.y, a.z, 40, .5, .8, 1); a.dead = 1; CM = null; } }
}
const ch2 = (c) => c.ch.rel;
function cmLeave() { const c = CM; c.ph = 'leave'; c.t = 0; const a = c.a; a.lead = null; a.sp = 260; const rx = sFy * sUz - sFz * sUy, rz = sFx * sUy - sFy * sUx; a.wp = [a.x + rx * 3000 + sFx * 2000, a.y + 400, a.z + rz * 3000 + sFz * 2000]; if (navId === 'n' + a.i) { navId = 'gate'; navAuto = 1; } }
function cmAccept() {
  const c = CM, ch = c.ch, o = c.off; if (!c || c.ph !== 'offer') return false;
  cmLine(say(pickL(VOICE.yes[ch.tr]), ch)); ch.rel = Math.min(100, ch.rel + 3);
  if (o.ty === 'job') { rp().jobs.push(o.job); save(); navAuto = 1; tip(`Contract taken: ${o.job.title} · ${o.job.pay} credits · see the journal (B)`, 7000); cmLeave(); }
  else if (o.ty === 'fuel') { ST.fuel -= 10; ST.credits += o.pay; remember(ch, 'helped', 12); showCargo(); save(); pop(`FUEL −10 · +${o.pay} CR`, '#ffd84a'); cmLeave(); }
  else if (o.ty === 'escort') escStart(c);
  return true;
}
// ---- escort: the caller's convoy makes for a far point; raiders strike on the way; you keep them alive ----
function escStart(c) {
  const a = c.a, ch = c.ch, o = c.off; CM = null;
  const cand = [[0, 0, 0], ...NPT.far, NPT.dock].map((p) => [p, Math.hypot(p[0] - px, p[1] - py, p[2] - pz)]).filter((p) => p[1] > 3500).sort((p, q) => q[1] - p[1]);
  const dest = cand.length ? cand[cand.length > 1 && cand[0][1] > 9500 ? 1 : 0][0] : [px + sFx * 7000, py, pz + sFz * 7000];
  a.lead = null; a.esc = 1; a.sp = 72; a.wp = dest.slice(); a.hpM = a.hp = 300; a.shM = a.sh = 160; a.toGate = 0;
  const ships = [a]; for (let k = 0; k < 1 + (Math.random() < .5 ? 1 : 0); k++) { const b = mkShip(0, a.x - 40, a.y, a.z + 40, pickL(NPN), { esc: 1, lead: a, off: [(k ? 1 : -1) * 45, -6, 50], pilot: personName(Math.random), fac: ch.fac }); b.hpM = b.hp = 260; b.shM = b.sh = 140; ships.push(b); }
  ESC = { ch, ships, n: ships.length, dest, d0: Math.hypot(dest[0] - a.x, dest[1] - a.y, dest[2] - a.z), pay: o.pay, amb: .3 + Math.random() * .3, wave: 0, away: 0, t: 0, raiders: [], dn: o.dest };
  tip(`Escort accepted · keep the ${ch.sh} and her convoy alive to ${o.dest} · ${o.pay} credits`, 8000); navId = 'n' + a.i; navAuto = 1;
}
function cmAmbush(n, target) {
  const lead = target === 'player' ? null : ESC && ESC.ships.find((s) => !s.dead), o = lead || { x: px, y: py, z: pz, fx: sFx, fy: sFy, fz: sFz };
  const side = Math.random() < .5 ? -1 : 1, out = [];
  for (let k = 0; k < n; k++) { const r = mkShip(5, o.x + o.fx * 1600 - o.fz * side * 900 + k * 70, o.y + 120 + k * 40, o.z + o.fz * 1600 + o.fx * side * 900, freshRaiderName(Math.random), { escHunt: target !== 'player', hunter: target === 'player', fac: SYS.fac, sp: 110 + Math.random() * 25, hue: .02 }); out.push(r); }
  if (ESC && target !== 'player') ESC.raiders.push(...out);
  return out;
}
function escHunt(a, dt) {                                                       // a raider in an ambush picks a convoy ship (or you, if you are close) and goes for it
  const alive = ESC ? ESC.ships.filter((s) => !s.dead) : []; let tgt = null, td = 1e9;
  for (const s of alive) { const e = Math.hypot(s.x - a.x, s.y - a.y, s.z - a.z); if (e < td) { td = e; tgt = s; } }
  const pd = Math.hypot(px - a.x, py - a.y, pz - a.z); if (!tgt || pd < 380 && Math.random() < .5 * dt * 4 || a.brk > 0) return false;   // engaged by you: fight you (the normal raider code)
  a.wp = [tgt.x + tgt.vx * .8, tgt.y + tgt.vy * .8, tgt.z + tgt.vz * .8]; a.cd -= dt;
  const ex = tgt.x - a.x, ey = tgt.y - a.y, ez = tgt.z - a.z, el = Math.hypot(ex, ey, ez) || 1;
  if (el < 480 && a.cd <= 0 && (a.fx * ex + a.fy * ey + a.fz * ez) / el > .95) { a.cd = .45;
    const t = Math.min(tgt.sh, 4); tgt.sh -= t; tgt.hp -= 4 - t; tgt.shT = tm; fxAdd(tgt.x + (Math.random() - .5) * 8, tgt.y, tgt.z + (Math.random() - .5) * 8, 10, 1, .5, .2);
    for (let k = 0; k < 3; k++) { const f = (k + 1) / 4; put(DPa, a.x + ex * f - px, a.y + ey * f - py, a.z + ez * f - pz, 3.2, 0, 0, 0, .1, 1.4, .3, .2, 0); }
    if (tgt.hp <= 0 && !tgt.dead) { tgt.dead = 1; fxAdd(tgt.x, tgt.y, tgt.z, 80, 1, .6, .3); fxAdd(tgt.x, tgt.y, tgt.z, 30, 1, 1, .9); boom(40, Math.hypot(tgt.x - px, tgt.y - py, tgt.z - pz));
      comm(`${ESC.ch.n}: "We lost the ${tgt.name}! ${call()}, do something!"`); } }
  return true;
}
function escTick(dt) {
  if (!ESC) return; const E = ESC; E.t += dt;
  const alive = E.ships.filter((s) => !s.dead && NPCS.includes(s)); if (!alive.length) return escEnd(0, 'lost');
  if (E.ships[0].dead) { const nl = alive[0]; nl.lead = null; nl.wp = E.dest.slice(); nl.sp = 72; nl.esc = 1; for (const s of alive) if (s !== nl) s.lead = nl; E.ships = alive; }
  const L = alive[0], dd = Math.hypot(E.dest[0] - L.x, E.dest[1] - L.y, E.dest[2] - L.z), prog = 1 - dd / E.d0, pd = Math.hypot(L.x - px, L.y - py, L.z - pz);
  L.wp = E.dest.slice(); L.hold = 0; L.sp = pd > 1600 ? 30 : 72;                 // the convoy waits for you if you fall behind
  if (E.wave === 0 && prog > E.amb) { E.wave = 1; const rs = cmAmbush(2 + (Math.random() < .4 ? 1 : 0), 'convoy'); comm(`${rs[0].name} on open band: "That is a fat convoy. Take it apart."`); setTimeout(() => ESC && comm(`${E.ch.n}: "${call()}, contacts! Keep them off us!"`), 3500); navId = 'n' + rs[0].i; }
  if (E.wave === 1 && prog > .8 && Math.random() < .35 && !E.second) { E.second = 1; cmAmbush(2, 'convoy'); comm(`${E.ch.n}: "More of them, coming in high!"`); }
  E.away = pd > 5000 ? E.away + dt : 0; if (E.away > 25) return escEnd(0, 'left');
  const threat = E.raiders.some((r) => !r.dead && !r.fled && NPCS.includes(r) && Math.hypot(r.x - L.x, r.y - L.y, r.z - L.z) < 3000);
  if (dd < 380 && !threat) escEnd(1);
}
function escEnd(ok, why) {
  const E = ESC; ESC = null; if (!E) return; const alive = E.ships.filter((s) => !s.dead && NPCS.includes(s)), ch = E.ch;
  if (ok) { const pay = Math.round(E.pay * (.5 + .5 * alive.length / E.n) / 10) * 10; gain({ cr: pay, xp: 60, rep: 5, fac: ch.fac }); remember(ch, 'escorted', 18);
    comm(`${ch.n}: "${alive.length === E.n ? 'Every ship home. ' : 'We made it, most of us. '}${pickL(VOICE.yes[ch.tr]).replace(/\{c\}/g, call())} ${pay} credits sent."`); pop(`ESCORT COMPLETE · +${pay} CR`, '#ffd84a');
    for (const s of alive) { s.wp = [s.x + s.fx * 9000, s.y, s.z + s.fz * 9000]; s.lead = null; s.esc = 0; s.sp = 300; setTimeout(() => { fxAdd(s.x, s.y, s.z, 45, .5, .8, 1); s.dead = 1; }, 6000); } }
  else { remember(ch, why === 'left' ? 'left' : 'lost', why === 'left' ? -25 : -12); tip(why === 'left' ? `You left the ${ch.sh} behind. ${ch.n} will remember that.` : `The convoy is gone. ${ch.n} won't forget it.`, 8000);
    for (const s of alive) { s.esc = 0; s.lead = null; s.sp = 200; s.wp = NPT.far[0]; } }
  for (const r of E.raiders) r.escHunt = 0;
}
function lifeTick(dt) {
  PL.x = px; PL.y = py; PL.z = pz; PL.vx = vx; PL.vy = vy; PL.vz = vz; PL.fx = sFx; PL.fy = sFy; PL.fz = sFz; PL.ux = sUx; PL.uy = sUy; PL.uz = sUz;
  if (!flying()) return; cmTick(dt); escTick(dt);
}
function lifeReset() { try { if (ESC) escEnd(0, 'left'); CM = null; ST.jumps = (ST.jumps || 0) + 1; const q = typeof v123Quiet === 'function' ? v123Quiet() : 38; cmT = q + 12 + Math.random() * 20; quietUntil = tm + q; } catch {} }   // a jump or a new sky: known pilots wait, but the lane itself is already busy
const lifeObjective = () => { if (!ESC) return null; const E = ESC, alive = E.ships.filter((s) => !s.dead && NPCS.includes(s)), L = alive[0]; if (!L) return null;
  const dd = Math.hypot(E.dest[0] - L.x, E.dest[1] - L.y, E.dest[2] - L.z), rd = E.raiders.find((r) => !r.dead && !r.fled && NPCS.includes(r));
  if (E.wait) return { text: `Rescue the ${L.name}: ${rd ? 'drive the raiders off' : 'come alongside'} · ${(Math.hypot(L.x - px, L.y - py, L.z - pz) / 1000).toFixed(1)} km`, nav: 'n' + (rd || L).i };
  return { text: `Escort the ${E.ch.sh}: ${alive.length}/${E.n} ships · ${(dd / 1000).toFixed(1)} km to ${E.dn}${rd ? ' · RAIDERS ON THE CONVOY' : ''}`, nav: 'n' + (rd || L).i }; };

// ======================================================================================================================
// ---- deeper: story arcs that run over several meetings with one pilot, more kinds of work, and ships that behave ----
// An arc lives on a cast record (ch.arc = { id, step }); each time that pilot comes alongside, their offer is the arc's next beat.
//   debt:  you help them → they pay you back with a tip and credits → they need a rescue → they become an ally who joins your fights
//   rival: a raider who got away → threatens you → comes back with friends → a final showdown, with a bounty on their head
//   lost:  a recorder from a lost ship → what it says → a far place where the story ends, and a find
// ======================================================================================================================
const mkJobT = (ty) => { for (let i = 0; i < 60; i++) { const j = mkJob(mulberry32((Date.now() ^ (cmSeq++ * 2654435761)) >>> 0), 'cm' + cmSeq); if (j.ty === ty) return j; } return null; };
function arcOffer(ch) {
  const A = ch.arc, s = A.step;
  if (A.id === 'debt') {
    if (s === 0) return { ty: 'fuel', pay: 0, arc: 1, text: `My ${pickL(FAULT)}. I can't pay you now, but I swear I'll make it right. Ten units of fuel?` };
    if (s === 1) { const pay = 150 + (Math.random() * 120 | 0); return { ty: 'gift', pay, arc: 1, text: `I said I'd make it right. ${pay} credits, and a tip: ${pickL([`the trader at ${SYS.locs[0].name} buys ${TIERS[3]} high`, `there's a geode field near ${SYS.locs[(SYS.loc + 1) % SYS.locs.length].name}`, `patrols leave ${SYS.locs[(SYS.loc + 2) % SYS.locs.length].name} alone on the night shift`])}.` }; }
    if (s === 2) return { ty: 'rescue', pay: 300, arc: 1, text: `${call()}, it's my brother. His ship is dead in the water, two kilometres out, and raiders are circling. Please. I can't fight them.` };
    return { ty: 'ally', arc: 1, text: `I don't have words. From now on, if you're in a fight anywhere near ${mkSys(sysIdAt(ch.home[0], ch.home[1], ch.home[2])).name}, call and I'll come.` };
  }
  if (A.id === 'rival') {
    if (s === 0) return { ty: 'grudge', arc: 1 };
    if (s === 1) return { ty: 'grudge', arc: 1, friends: 2 };
    return { ty: 'duel', arc: 1, text: `You've cost me two crews, ${call()}. No more running, no more friends. Just you and me.` };
  }
  if (A.id === 'lost') {
    if (s === 0) { const j = mkJobT(3); if (j) { j.text = `My sister's ship went quiet at ${j.pl}. Find the wreck and bring me her recorder. ${j.text.split('.').slice(1).join('.')}`; return { ty: 'job', job: j, arc: 1, text: `I need a pilot with a strong stomach. My sister's ship went quiet at ${j.pl}${j.sy !== SYS.name ? ' in ' + j.sy : ''}. Bring back her flight recorder. ${j.pay} credits.` }; } }
    if (s === 1) { const j = mkJobT(2); if (j) return { ty: 'job', job: j, arc: 1, text: `I listened to the recorder. Her last words were about ${j.pl}${j.sy !== SYS.name ? ' in ' + j.sy : ''}: "it's beautiful, it's moving". Go and see what she saw? Scan whatever is there. ${j.pay} credits.` }; }
    A.done = 1; return { ty: 'tip', arc: 1, text: `I went to ${pickL(SYS.locs).name} myself. Whatever she found, it's gone now. But thank you, ${call()}. She'd have liked you.` };
  }
  return null;
}
// a new pilot sometimes arrives with a story already in motion
function arcFor(ch) { if (ch.arc || Math.random() > .4) return; ch.arc = { id: Math.random() < .55 ? 'debt' : 'lost', step: 0 }; }
function arcNext(ch) { if (!ch.arc) return; ch.arc.step++; if (ch.arc.id === 'debt' && ch.arc.step > 3 || ch.arc.id === 'lost' && ch.arc.step > 2) ch.arc.done = 1; save(); }
// ---- the offer grammar, widened ----
const mkOffer0 = mkOffer;
mkOffer = function (ch) {
  if (ch.arc && !ch.arc.done) { const o = arcOffer(ch); if (o) return o; }
  if (ch.rel <= -20) return { ty: 'grudge' };
  const r = Math.random();
  if (r < .12 && ESC == null) return { ty: 'rescue', pay: Math.round((220 + Math.random() * 180) / 10) * 10, text: `${call()}, a friend of mine is dead in the water two kilometres out, and raiders are circling. I can't fight them. Will you?` };
  if (r < .2 && rp().jobs.length < 3) { const j = mkJobT(0); if (j) { j.smug = 1; j.pay = Math.round(j.pay * 1.8 / 10) * 10; j.title = 'Off-the-books freight'; return { ty: 'job', job: j, text: `Strictly between us: a sealed crate for ${j.pl}${j.sy !== SYS.name ? ' in ' + j.sy : ''}. No questions, no manifest, ${j.pay} credits. Patrols scan now and then, so fly like you mean it.` }; } }
  if (r < .27 && rp().jobs.length < 3) { const j = mkJobT(2); if (j) return { ty: 'job', job: j, text: `There are lights out at ${j.pl}${j.sy !== SYS.name ? ' in ' + j.sy : ''}, and no transponder answers. Go and scan what you find there? ${j.pay} credits.` }; }
  if (r < .33 && rp().jobs.length < 3) { const j = mkJobT(5); if (j) return { ty: 'job', job: j, text: `${j.tn} hit my cousin's hauler last week and laughed about it on open band. There's a bounty, ${j.pay} credits. I'd pay it myself if I could.` }; }
  return mkOffer0(ch);
};
// ---- the rest of an arc's beats, and the new kinds of answer ----
const cmAccept0 = cmAccept;
cmAccept = function () {
  const c = CM; if (!c || c.ph !== 'offer') return false; const o = c.off, ch = c.ch;
  if (o.ty === 'gift') { ST.credits += o.pay; remember(ch, 'helped', 5); pop(`+${o.pay} CR · ${ch.n.toUpperCase()} PAYS A DEBT`, '#ffd84a'); showCargo(); arcNext(ch); cmLine(say(pickL(VOICE.yes[ch.tr]), ch)); cmLeave(); return true; }
  if (o.ty === 'ally') { ch.ally = 1; remember(ch, 'saved', 10); pop(`${ch.n.toUpperCase()} WILL FLY WITH YOU`, '#7fd8ff'); arcNext(ch); cmLine('Count on it.'); cmLeave(); return true; }
  if (o.ty === 'rescue') { cmLine(say(pickL(VOICE.yes[ch.tr]), ch)); rescueStart(c); if (o.arc) arcNext(ch); return true; }
  if (o.ty === 'fuel' && o.pay === 0) { ST.fuel -= 10; remember(ch, 'helped', 15); pop('FUEL −10 · A DEBT IS OWED', '#ffd84a'); showCargo(); arcNext(ch); cmLine(say(pickL(VOICE.yes[ch.tr]), ch)); cmLeave(); return true; }
  const ok = cmAccept0(); if (ok && o.arc) arcNext(ch); return ok;
};
// offers that need no answer move the arc on by themselves
const cmTick0 = cmTick;
cmTick = function (dt) {
  const c = CM, wasPh = c && c.ph; cmTick0(dt);
  if (c && wasPh === 'talk' && c.ph !== 'talk' && c.off.arc && (c.off.ty === 'tip' || c.off.ty === 'grudge')) arcNext(c.ch);
  if (c && wasPh === 'talk' && c.off.ty === 'duel' && c.ph !== 'talk') duelStart(c);
};
// a showdown: your rival comes with friends, and a price on their head
function duelStart(c) {
  const ch = c.ch, a = c.a; a.lead = null; a.comms = 0; a.hunter = 1; a.hpM = a.hp = 160; a.shM = a.sh = 120; a.role = 5; a.size = 10; a.var = 2; a.hue = .02; a.rival = ch.id; CM = null;
  comm(`${ch.n} on open band: "This ends here, ${call()}."`); cmAmbush(2, 'player'); navId = 'n' + a.i; navAuto = 0;
  tip(`${ch.n} has come to settle it · bring them down for the bounty`, 7000);
}
// a rescue: the stricken ship waits under the raiders; drive them off, come alongside, then see it home
function rescueStart(c) {
  const ch = c.ch, o = c.off; cmLeave();
  const rx = sFy * sUz - sFz * sUy, rz = sFx * sUy - sFy * sUx, sd = Math.random() < .5 ? -1 : 1;
  const sx = px + sFx * 2000 + rx * sd * 900, sy = py + 150, sz = pz + sFz * 2000 + rz * sd * 900;
  const st = mkShip(0, sx, sy, sz, pickL(NPN), { esc: 1, pilot: personName(Math.random), fac: ch.fac, hold: 1, sp: 0 }); st.hpM = st.hp = 220; st.shM = st.sh = 0;
  const cand = [[0, 0, 0], ...NPT.far].map((p) => [p, Math.hypot(p[0] - sx, p[1] - sy, p[2] - sz)]).filter((p) => p[1] > 3000).sort((p, q) => p[1] - q[1]);
  const dest = cand.length ? cand[0][0] : [sx + sFx * 5000, sy, sz + sFz * 5000];
  ESC = { ch, ships: [st], n: 1, dest, d0: Math.hypot(dest[0] - sx, dest[1] - sy, dest[2] - sz), pay: o.pay, amb: 2, wave: 1, away: 0, t: 0, raiders: [], dn: dest[0] === 0 && dest[2] === 0 ? 'the warp gate' : 'safe space', wait: 1 };
  ESC.raiders.push(...cmAmbushAt(st, 3)); navId = 'n' + st.i; navAuto = 1;
  tip(`Rescue · drive the raiders off the ${st.name}, then come alongside`, 8000);
}
function cmAmbushAt(o, n) { const out = []; for (let k = 0; k < n; k++) { const g = k / n * 6.283; out.push(mkShip(5, o.x + Math.cos(g) * 500, o.y + 60, o.z + Math.sin(g) * 500, freshRaiderName(Math.random), { escHunt: 1, fac: SYS.fac, sp: 110 + Math.random() * 25, hue: .02 })); } return out; }
const escTick0 = escTick;
escTick = function (dt) {
  const E = ESC; if (!E) return;
  if (E.wait) { const S = E.ships[0]; if (!S || S.dead) return escEnd(0, 'lost'); S.hold = 1; S.sp = 0; S.vx = S.vy = S.vz = 0; S.s = 0;
    const live = E.raiders.some((r) => !r.dead && !r.fled && NPCS.includes(r) && Math.hypot(r.x - S.x, r.y - S.y, r.z - S.z) < 2500), near = Math.hypot(S.x - px, S.y - py, S.z - pz) < 350;
    if (!live && near) { E.wait = 0; S.hold = 0; S.sp = 60; comm(`${S.pilot}, ${S.name}: "Thank you, thank you. Engines are coughing back to life. Making for ${E.dn}."`); }
    else if (!live && !E.toldNear) { E.toldNear = 1; tip(`Raiders driven off · come alongside the ${S.name}`, 6000); }
    E.away = Math.hypot(S.x - px, S.y - py, S.z - pz) > 7000 ? E.away + dt : 0; if (E.away > 40) return escEnd(0, 'left'); return; }
  escTick0(dt);
};
// ---- ships that behave: raiders break off when beaten (and remember you), patrols come when you're under fire, civilians scatter ----
let assistT = 0, allyOn = null;
function behaveTick(dt) {
  if (!flying()) return; assistT -= dt;
  const raiders = NPCS.filter((a) => a.role === 5 && !a.dead && !a.fled);
  for (const a of raiders) {
    if (a.hpM && a.hp < a.hpM * .3 && !a.bounty && !a.rival) {                        // beaten: break off and run
      a.fled = 1; a.escHunt = 0; a.hunter = 0; a.cd = 1e9; a.sp *= 1.5; const ax = a.x - px, az = a.z - pz, l = Math.hypot(ax, az) || 1; a.wp = [a.x + ax / l * 9000, a.y + 800, a.z + az / l * 9000];
      comm(`${a.name} on open band: "${pickL(['I am out, I am out!', 'Not today. You will see me again, ' + call() + '.', 'Breaking off! This is not over.'])}"`);
      if (Math.random() < .5 && !nameBanned(a.name)) { const ch = castNew(); ch.n = a.pilot || a.name; ch.sh = a.name; ch.rel = -45; ch.mem = ['shot']; ch.met = 1; ch.raider = 1; ch.ejected = 1; ch.tr = 1; ch.returns = 1; ch.cool = Date.now() + 8 * 60 * 1000; ch.needJ = (ST.jumps || 0) + 3; ch.arc = { id: 'rival', step: 0 }; save(); }   // ejected, not dead: they come back later, stronger
    }
  }
  for (const a of NPCS) if (a.fled && Math.hypot(a.x - px, a.y - py, a.z - pz) > 6000) { fxAdd(a.x, a.y, a.z, 40, .5, .8, 1); a.dead = 1; }
  const live = raiders.filter((a) => !a.fled), close = live.filter((a) => Math.hypot(a.x - px, a.y - py, a.z - pz) < 2200);
  for (const c of NPCS) if ((c.role === 0 || c.role === 1 || c.role === 3) && !c.esc && !c.comms && !c.scared) {   // civilians scatter from raiders
    for (const r of live) if (Math.hypot(r.x - c.x, r.y - c.y, r.z - c.z) < 900) { c.scared = 1; c.hold = 0; c.sp *= 1.4; const ex = c.x - r.x, ez = c.z - r.z, l = Math.hypot(ex, ez) || 1; c.wp = [c.x + ex / l * 4000, c.y + 300, c.z + ez / l * 4000]; break; } }
  if (close.length && assistT <= 0) {                                                 // under attack: the patrol comes, and so does a friend
    assistT = 45;
    const pat = NPCS.filter((a) => a.role === 2 && !a.lead && !a.ally).sort((p, q) => Math.hypot(p.x - px, p.y - py, p.z - pz) - Math.hypot(q.x - px, q.y - py, q.z - pz))[0];
    if (pat && Math.hypot(pat.x - px, pat.y - py, pat.z - pz) < 7000) { pat.wp = [px, py, pz]; pat.hold = 0; comm(`${ctl()}, patrol ${pat.name} moving to assist ${call()}.`); }
    const al = Object.values(cast()).filter((c) => c.ally && !c.raider);
    if (al.length && !allyOn) { const ch = al[Math.random() * al.length | 0]; const a = mkShip(2, px - sFx * 1500 + 200, py + 100, pz - sFz * 1500, ch.sh, { pilot: ch.n, ally: 1, fac: ch.fac, sp: 160, cast: ch.id }); a.hpM = a.hp = 120; a.shM = a.sh = 90; allyOn = a;
      setTimeout(() => comm(`${ch.n}, ${ch.sh}: "Hang on, ${call()}! I'm coming in!"`), 1500); }
  }
  if (allyOn && (allyOn.dead || !NPCS.includes(allyOn))) allyOn = null;
  if (allyOn && !close.length && !live.some((a) => Math.hypot(a.x - px, a.y - py, a.z - pz) < 4000) && !allyOn.leaving) { allyOn.leaving = 1; comm(`${allyOn.pilot}: "That's the lot of them. Fly safe, friend."`); setTimeout(() => { if (allyOn) { fxAdd(allyOn.x, allyOn.y, allyOn.z, 40, .5, .8, 1); allyOn.dead = 1; allyOn = null; } }, 9000); }
}
const lifeTick0 = lifeTick;
lifeTick = function (dt) { lifeTick0(dt); behaveTick(dt); };
// a new face may bring a story; a rival's death ends theirs
const castNew0 = castNew;
castNew = function () { const ch = castNew0(); arcFor(ch); return ch; };
const npcHit0 = npcHit;
npcHit = function (a, dmg, qd, hx, hy, hz, w) { const was = a.dead; npcHit0(a, dmg, qd, hx, hy, hz, w);
  if (!was && a.dead && a.rival && cast()[a.rival]) { const ch = cast()[a.rival]; ch.arc.done = 1; ch.dead = 1; ch.rel = -100; gain({ cr: 350, xp: 120, rep: 6 }); pop(`${ch.n.toUpperCase()} IS FINISHED · +350 CR BOUNTY`, '#ffd84a'); save(); } };
// smuggled crates: now and then a patrol scans you on delivery
const jobDone0 = jobDone;
jobDone = function (j) { if (j.smug && Math.random() < .3) { j.pay = Math.round(j.pay / 2); gain({ rep: -8, fac: SYS.fac }); comm(`${ctl()} patrol to ${call()}: "That crate isn't on any manifest. We'll take half as a fine. Move along."`); } jobDone0(j); };
