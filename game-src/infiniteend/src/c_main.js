// ============================================================================
// Build everything (with a loading bar), then fly
// ============================================================================
await step(.06, 'Igniting stars past the edge…');
noiseTex();
// ---- what is remembered. The universe is regenerated from seeds every time; only the player's own marks on it
// are stored (IndexedDB, falling back to localStorage): cargo, credits, where they are, where they have been,
// which rocks they broke, task progress, discoveries, a courier job in hand.
const BUILD = 'v1.23';                                          // shown on the pause screen. From v1.20 a new value keeps the save.
let draws = 0, verts = 0, frameDraws = 0, frameVerts = 0;
const _dei = gl.drawElementsInstanced.bind(gl), _de = gl.drawElements.bind(gl), _da = gl.drawArrays.bind(gl);
gl.drawElementsInstanced = (m, c, ty, off, n) => { draws++; verts += c * n; return _dei(m, c, ty, off, n); };
gl.drawElements = (m, c, ty, off) => { draws++; verts += c; return _de(m, c, ty, off); };
gl.drawArrays = (m, a, c) => { draws++; verts += c; return _da(m, a, c); };
const ST = { v: 1, hull: 100, cargo: [0, 0, 0, 0, 0, 0], credits: 0, sec: [0, 0, 0], loc: 0, visited: {}, dead: [], missions: {}, found: {}, courier: null };
let idb = null, saveT = 0;
function blankState(seed) {
  return { v: 1, hull: 100, cargo: [0, 0, 0, 0, 0, 0], credits: 0, sec: [0, 0, 0], loc: 0, visited: {}, dead: [], missions: {}, found: {}, courier: null, build: BUILD, seed: seed >>> 0, o2: 100, fuel: 100, wen: 100, spice: 60, spiceV: 1, deadNames: [], jumps: 0, lens: 0 };
}
function migrateState() {
  if (ST.seed == null) ST.seed = (Math.random() * 4294967296) >>> 0;
  const d = blankState(ST.seed >>> 0);
  for (const k of Object.keys(d)) if (ST[k] == null) ST[k] = d[k];
  if (!Array.isArray(ST.cargo)) ST.cargo = [0, 0, 0, 0, 0, 0];
  while (ST.cargo.length < 6) ST.cargo.push(0);
  if (!Array.isArray(ST.deadNames)) ST.deadNames = [];
  if (!Array.isArray(ST.sec) || ST.sec.length < 3) ST.sec = [0, 0, 0];
  if (!ST.chart || typeof ST.chart !== 'object') ST.chart = {};
  if (ST.lens == null) ST.lens = 0;
  if (ST.spice == null) ST.spice = 60;
  ST.build = BUILD; ST.v = 1;
}
async function loadState() {
  idb = await new Promise((r) => { try { const q = indexedDB.open('endless-space', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => r(q.result); q.onerror = () => r(null); } catch { r(null); } });
  let d = null;
  if (idb) d = await new Promise((r) => { try { const q = idb.transaction('kv').objectStore('kv').get('state'); q.onsuccess = () => r(q.result); q.onerror = () => r(null); } catch { r(null); } });
  if (!d) try { d = JSON.parse(localStorage.esState || 'null'); } catch {}
  if (d && d.v === 1) Object.assign(ST, d);
  migrateState();
  MASTER = ST.seed >>> 0; HOME = hs(MASTER ^ 0x40E) >>> 0;
}
function newUniverse() {
  if (!confirm('Start a new universe? This pilot\'s charts, credits and crew will be left behind.')) return;
  CFG.diff = 1; CFG.diffPick = 0; try { localStorage.ibCfg = JSON.stringify(CFG); } catch {}
  for (const q of Object.keys(ST)) delete ST[q];
  Object.assign(ST, blankState((Math.random() * 4294967296) >>> 0));
  try { if (idb) idb.transaction('kv', 'readwrite').objectStore('kv').put(ST, 'state'); else localStorage.esState = JSON.stringify(ST); } catch {}
  setTimeout(() => location.reload(), 400);
}
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { if (idb) idb.transaction('kv', 'readwrite').objectStore('kv').put(ST, 'state'); else localStorage.esState = JSON.stringify(ST); } catch {} }, 1000); }
if (!TEST || QS.has('keep')) await loadState();
SYS = mkSys(sysIdAt(ST.sec[0], ST.sec[1], ST.sec[2])); SYS.sec = ST.sec;
await step(.18, 'Pouring nebulae into the void…');
bakeNebula(SYS.seed);
await step(.36, 'Seeding ore in the rocks…');
const fam = (sub) => [0, 1, 2].map((v) => rockMesh(sub, (x, y, z) => rockR(v, x, y, z)));
const mHi = fam(LV > 1 ? 4 : 5), mMid = fam(4), mFar = fam(LV > 1 ? 2 : 3), mLo = fam(1), mShard = [0, 1].map((v) => rockMesh(3, (x, y, z) => shardR(v, x, y, z)));
await step(.5, 'Waking the leviathans…');
const mSiphon = siphonMesh(), mSpark = sparkMesh(), mCry = crystalMesh(), mJelly = jellyMesh(), mRay = rayMesh(), mDart = dartMesh(), mRing = ringMesh(), mSpire = spireMesh(), mWhale = whaleMesh(), mSerp = serpentMesh(), mTen = tendrilMesh(), mQuad = quadMesh(), mBox = boxMesh(), mCock = cockpitMesh(), mFighter = fighterMesh(), mFrig = [frigateMesh(0), frigateMesh(1)], mDrone = droneMesh(), mGate = gateMesh();
for (const g of ST.dead) dead.add(g);
await step(.62, 'Growing crystal…');
const P_ROCK = prog(ROCK_V, ROCK_F), P_CRY = prog(CRY_V, CRY_F), P_LIFE = prog(LIFE_V, LIFE_F), P_SPR = prog(SPR_V, SPR_F);
const P_SKY = prog(TRI_V, SKY_F), P_BLUR = prog(TRI_V, BLUR_F), P_RAY = prog(TRI_V, RAY_F.replace('precision', `#define NS ${Q.rays}\nprecision`)), P_COMP = prog(TRI_V, COMP_F), P_COCK = prog(COCK_V, COCK_F), P_SHIP = prog(SHIP_V, ROCK_F);
const P_CAB = prog(COCK_V, COCK_F.replace('#version 300 es', '#version 300 es\n#define CABIN'));   // the quarters and the aux screen: their materials stay out of the dash's shader
gl.useProgram(P_CAB.p); gl.uniform1i(P_CAB.u.uPip, 6);   // the aux screen's picture lives in texture slot 6
gl.useProgram(P_SHIP.p); gl.uniform3fv(P_SHIP.u['uTier[0]'], TCOL); gl.uniform1i(P_SHIP.u.uKind, 4); gl.uniform1f(P_SHIP.u.uFlat, 0);
gl.useProgram(P_ROCK.p); gl.uniform3fv(P_ROCK.u['uTier[0]'], TCOL);
await step(.8, 'Rousing the swarms…');

const LTi = Layer(26000, 4, 1, genTitan, 14), LH = Layer(1500, 10, 1, genHuge, 2), LB = Layer(230, 12, 1, genBig, 1), LS = Layer(48, 18, 1, genSmall, 3);
TV = [LTi, Sub(LTi, 1), Sub(LTi, 1)]; HV = [LH, Sub(LH, 1), Sub(LH, 1)]; LTd = Sub(LH, 28);
BF = [LB, Sub(LB, 1), Sub(LB, 1)]; BN = [Sub(LB, 1), Sub(LB, 1), Sub(LB, 1)]; LC = Sub(LB, 7); LTb = Sub(LB, 11);
SV = [LS, Sub(LS, 1), Sub(LS, 1)];
const LG = Layer(700, 6, 1, genGeode, 13), LD = Layer(60, 14, 1, genDebris, 4), LR = Layer(6000, 4, 1, genRing, 12), LMg = Layer(45000, 4, 1, genMega, 15);
RV = [LR, Sub(LR, 1), Sub(LR, 1), Sub(LR, 1)]; MV = [LMg, Sub(LMg, 1)];
const LJ = Layer(800, 6, Math.round(96 * Q.per), genJelly, 5), LQ = Layer(7000, 4, 1, genColossus, 16), LM = Layer(420, 6, Math.round(80 * Q.per), genMinnow, 6);
const LY = Layer(1800, 4, 5, genRay, 7), LWh = Layer(5000, 4, 2, genWhale, 17), LSp = Layer(700, 6, 5, genSerpent, 18);
const LF = Layer(1400, 6, 12, genFleet, 20), LFr = Layer(9000, 4, 2, genFrig, 21), LDr = Layer(600, 6, Math.round(48 * Q.per), genDrone, 22), LDk = Layer(700, 6, 3, genDark, 23);
FV = [LFr, Sub(LFr, 2)];
const LW = Layer(520, 6, 2, genWisp, 8), LU = Layer(14, 28, 1, genDust, 9), LP = Layer(110, 10, 1, genSpore, 10);
const LDs = Layer(600, 6, Math.round(40 * Q.per), genSiphon, 24), LDe = Layer(600, 6, Math.round(40 * Q.per), genSpark, 25);
const LAYERS = [LTi, LH, LB, LS, LG, LD, LR, LMg, LJ, LQ, LM, LY, LWh, LSp, LW, LU, LP, LF, LFr, LDr, LDk, LDs, LDe];
if (typeof v122Boot === 'function') v122Boot();
const SHOOT = [...HV, ...BF, ...BN, ...SV, LG];             // everything the gun can break
const DGt = Dyn(1), DTr = Dyn(1), GATE = 280, DC = [Dyn(420), Dyn(420)], DGm = Dyn(240), DT = Dyn(200), DPa = Dyn(900);

const G = new Float32Array(52), ubo = gl.createBuffer(), VA0 = gl.createVertexArray();
gl.bindBuffer(gl.UNIFORM_BUFFER, ubo); gl.bufferData(gl.UNIFORM_BUFFER, G.byteLength, gl.DYNAMIC_DRAW); gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);
const SUN = nrm([.45, .32, -.83]);
const VAC = gl.createVertexArray(), M3 = new Float32Array(9);
gl.bindVertexArray(VAC); gl.bindBuffer(gl.ARRAY_BUFFER, mCock.vb);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mCock.ib); gl.bindVertexArray(null);

// ---- render targets, rebuilt when the window, the render scale or the eye size changes ----
let W = 0, H = 0, S = 1, T = null, junk = [], stereo = 0;
function ensureT(w, h) {
  if (T && T.w === w && T.h === h) return;
  for (const [k, o] of junk) k === 0 ? gl.deleteTexture(o) : k === 1 ? gl.deleteFramebuffer(o) : gl.deleteRenderbuffer(o);
  junk = [];
  const keepT = (t) => { junk.push([0, t.t], [1, t.f]); return t; };
  const rb = (fmt, n) => { const r = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, r); n ? gl.renderbufferStorageMultisample(gl.RENDERBUFFER, n, fmt, w, h) : gl.renderbufferStorage(gl.RENDERBUFFER, fmt, w, h); junk.push([2, r]); return r; };
  T = { w, h, hdr: keepT(tex2(w, h, true)), bl: [], ms: null };
  const aa = Math.min(Q.aa, gl.getParameter(gl.MAX_SAMPLES));
  if (aa > 1) {
    T.ms = gl.createFramebuffer(); junk.push([1, T.ms]); gl.bindFramebuffer(gl.FRAMEBUFFER, T.ms);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb(HDRI, aa));
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb(gl.DEPTH_COMPONENT24, aa));
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.hdr.f);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb(gl.DEPTH_COMPONENT24, 0));
  }
  for (let i = 1; i < 7; i++) T.bl.push(keepT(tex2(Math.max(1, w >> i), Math.max(1, h >> i), true)));
  T.ray = keepT(tex2(Math.max(1, w >> 2), Math.max(1, h >> 2), true));
}
function resize() {
  const k = Math.min(devicePixelRatio || 1, Q.dpr) * (stereo ? 1 : S);
  W = Math.max(96, Math.round(cv.clientWidth * k)); H = Math.max(54, Math.round(cv.clientHeight * k));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
}
addEventListener('resize', resize);

// ---- ship state and input ----
let syaw = .05, spit = .08, hurtTip = 0, subO = null, subG = null;
let bHold = 0, bRamp = 0, bOd = 0, odOn = 0, QA = null, QAs = null, yawL = 0, pitchL = 0, rollIn = 0, atmWas = 0, rightT = 0, softArr = 0, levelAim = -.28, rollBias = 0;
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qn = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
const qax = (x, y, z, a) => { const s = Math.sin(a / 2); return [x * s, y * s, z * s, Math.cos(a / 2)]; };
const qv = (q, x, y, z) => { const [a, b, c, w] = q, tx = 2 * (b * z - c * y), ty = 2 * (c * x - a * z), tz = 2 * (a * y - b * x); return [x + w * tx + b * tz - c * ty, y + w * ty + c * tx - a * tz, z + w * tz + a * ty - b * tx]; };
const qslerp = (a, b, t) => { const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = d < 0 ? -1 : 1; return qn([a[0] + (b[0] * s - a[0]) * t, a[1] + (b[1] * s - a[1]) * t, a[2] + (b[2] * s - a[2]) * t, a[3] + (b[3] * s - a[3]) * t]); };
const qYP = (y, p) => qmul(qax(0, 1, 0, -y), qax(1, 0, 0, p));   // a heading and a pitch, wings level
let yaw = .05, pitch = .08, roll = 0, vx = 0, vy = 0, vz = 0, bst = 0, thr = 0, flash = 0, fogD = .0004, tm = 0, snap = 1, dyaw = 0, trauma = 0, REG = 0;
let sRx = 1, sRy = 0, sRz = 0, sUx = 0, sUy = 1, sUz = 0, sFx = 0, sFy = 0, sFz = -1;   // the ship's right, up and forward
const pal = new Float32Array(12), skyw = new Float32Array(4), K = {};
let tn = 0, tx0 = 0, ty0 = 0, tdx = 0, tdy = 0, locked = 0, steer = 0, mxn = 0, myn = 0, mFire = 0, tFire = 0, xFire = 0, muted = 0, stats = 0, started = 0;
const flying = () => B.className[0] === 'g';
const cargo = ST.cargo;
function showCargo() {
  let h = '', v = 0;
  for (let i = 5; i > 0; i--) { v += cargo[i] * TVAL[i]; h += `<i style="color:${TCSS[i]}"><b>${cargo[i]}</b>${TIERS[i]}</i>`; }
  $('cargo').innerHTML = h + `<i class=val><b>${v}</b>cargo value</i><i class=val><b>${ST.credits}</b>credits</i>`;
}
showCargo();

const lookAt = (x, y, z, d, s) => { px = x + d * .8; py = y + d * .3; pz = z + d * .6; yaw = Math.atan2(x - px, pz - z) + (s || 0); snap = 1; pitch = Math.atan2(y - py, Math.hypot(x - px, z - pz)); };
const unstick = () => { for (let i = 0; i < 4; i++) { collide(LTi, titanAt); collide(LH, hugeAt); collide(LB, bigAt); } vx = vy = vz = 0; snap = 1; };
// find the nearest cell of a layer that holds something, and fly to look at it
function seek(L, ok, d, s) {
  const C = L.C, cx = Math.floor(px / C), cy = Math.floor(py / C), cz = Math.floor(pz / C);
  for (let r = 0; r < 14; r++) for (let k = -r; k <= r; k++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r) continue;
    const v = ok(C, cx + i, cy + j, cz + k);
    if (v) { lookAt((cx + i + gj0) * C, (cy + j + gj1) * C, (cz + k + gj2) * C, d || v * 2.2, s); unstick(); return v; }
  }
}
const cellHas = (salt, p) => (C, x, y, z) => (cellRnd(x, y, z, salt), hx(1) < p ? 1 : 0);
// arrive at a place: a sector's system (new clouds, colours, sky) and one of its locations (what is around you).
// You always come out of that location's warp gate, which sits at the origin of its space.
const hooks = [];
function arrive(sec, loc, quiet) {
  const id = sysIdAt(sec[0], sec[1], sec[2]);
  if (!SYS || SYS.id !== id) SYS = mkSys(id);
  SYS.sec = sec; setLoc(SYS, loc || 0); bakeNebula(SYS.seed);    // each place has its own clouds
  rpgArrive();
  ST.sec = sec; ST.loc = SYS.loc;
  px = 0; py = 30; pz = 760; yaw = Math.PI; pitch = 0; if (!softArr) snap = 1; gateIn = 0; tradeIn = 0;
  for (const L of LAYERS) L.cx = 1e9;
  dKind.fill(0); bL.fill(0); pL.fill(0); mReg = -1;
  if (!palEase) { for (let i = 0; i < 12; i++) pal[i] = SYS.pal[i]; for (let i = 0; i < 4; i++) skyw[i] = SYS.sky[i]; }
  unstick(); thr = Math.min(thr, .3);
  // this place's quiet furniture, all from its seed: a signal beacon some kilometres out, and sometimes a trader by the gate
  const R = mulberry32(SYS.salt ^ 0xBEAC), a = R() * 6.283, e = (R() - .5) * .8, d = 3000 + 4000 * R();
  bcn = [Math.cos(a) * Math.cos(e) * d, Math.sin(e) * d, Math.sin(a) * Math.cos(e) * d]; bcnN = R() * 8 | 0;
  trader = SYS.atm ? 0 : 1;          // a trader waits by the gate, never inside an atmosphere
  // the log of where you have been, and anything that completes by arriving
  const v = ST.visited[SYS.id] || (ST.visited[SYS.id] = { name: SYS.name, sec, locs: [], charted: 0 }), first = !v.locs.includes(SYS.loc);
  if (first) v.locs.push(SYS.loc);
  let note = '';
  if (!v.charted && v.locs.length >= SYS.locs.length) { v.charted = 1; const p = 50 * SYS.locs.length; ST.credits += p; note = `${SYS.name} fully charted · +${p} credits`; }
  const cj = ST.courier;
  if (cj && cj.sec[0] === sec[0] && cj.sec[1] === sec[1] && cj.sec[2] === sec[2] && cj.loc === SYS.loc) { ST.credits += cj.pay; ST.courier = null; note = `Case delivered · +${cj.pay} credits`; }
  mission(); save(); showCargo(); if (typeof navBuild === 'function') navBuild();
  if (!quiet) { flash = TEST ? 0 : 1; tip(note || SYS.locs[SYS.loc].name + ' · ' + SYS.name, 6000); cueStop(); swell(); setTimeout(() => cue(note ? 'outro' : 'intro', 1), 9000); }
  for (const f of hooks) try { f(describe()); } catch (er) { console.error(er); }
}
// what a story layer needs to know about where the player is
const describe = () => ({ sector: SYS.sec, id: SYS.id, name: SYS.name, star: SYS.star, planets: SYS.planets, location: SYS.loc, locations: SYS.locs.map((l) => ({ index: l.i, name: l.name, kind: l.kind, body: l.body < 0 ? null : SYS.planets[l.body].name, description: l.desc })), neighbours: reach(SYS.sec), state: ST });

// ---- quiet things to do. One small task per place, drawn from its seed; nothing is timed and nothing points at it. ----
let bcn = [0, 0, 0], bcnN = 0, trader = 0, tradeIn = 0, pingT = 0;
const mkey = () => SYS.id + ':' + SYS.loc;
function mission() {
  const k = mkey(); let t = ST.missions[k];
  if (!t) { const R = mulberry32(SYS.salt ^ 0x51ED), ty = R() * 3 | 0; t = ST.missions[k] = { ty, tier: 1 + (R() * 2 | 0), n: 3 + (R() * 4 | 0), got: ty ? 0 : [], pay: 40 + (R() * 26 | 0) * 10, done: 0 }; }
  return t;
}
const taskText = (t) => t.done ? 'Task here complete' : t.ty === 0 ? `Survey: bring aboard three different minerals from this place (${t.got.length}/3)` : t.ty === 1 ? `Collect ${t.n} ${TIERS[t.tier]} here (${t.got}/${t.n})` : 'A faint signal repeats somewhere out here. Find its source.';
let hitPing = -9, hitAng = 0, hitFromX = 0, hitFromY = 0, hitFromZ = 0, hullHitT = -9;
function hurt(a) {
  a *= 1 - .2 * upLv('plt');
  const incoming = a;
  a = shieldTake(a);
  if (incoming > .2) {
    hitPing = tm; hullHitT = tm; gFlash[0] = 1.2;
    const dx = hitFromX - px, dy = hitFromY - py, dz = hitFromZ - pz;
    hitAng = Math.atan2(dx * sRx + dy * sRy + dz * sRz, dx * sUx + dy * sUy + dz * sUz);
  }
  if (a <= 0) return;
  ST.hull = Math.max(0, ST.hull - a); save(); if (ST.hull <= 0) return shipLost();
  if (tm > hurtTip) { hurtTip = tm + 4; tip(ST.hull < 25 ? 'Hull critical · boost offline · find a trader to repair' : ST.hull < 60 ? `Hull ${ST.hull | 0}% · thrusters limited` : `Hull ${ST.hull | 0}%`, 3500); }
}
function shipLost() {                                          // the hull gives: the hold is lost, a salvage crew tows the shell to the gate
  for (let i = 1; i < cargo.length; i++) cargo[i] = 0; const fee = Math.round(ST.credits * .15); ST.credits -= fee;
  ST.hull = 55; ST.fuel = Math.max(ST.fuel, 40); ST.wen = Math.max(ST.wen, 50); ST.o2 = Math.max(ST.o2 == null ? 100 : ST.o2, 45); flash = 1; trauma = 1; thr = 0; vx = vy = vz = 0; drift = 0;
  arrive(SYS.sec, SYS.loc, 1); showCargo(); save();
  tip(`Hull breached. A salvage crew towed what was left to the gate. The hold is gone${fee ? ', and ' + fee + ' credits for the tow' : ''}.`, 9000);
}
function finish(t) { t.done = 1; ST.credits += t.pay; tip(`Task complete · +${t.pay} credits`, 5000); cue('outro'); showCargo(); }
function collected(tier) {
  rpgCollected(tier);
  const t = mission();
  if (!t.done) { if (t.ty === 0 && !t.got.includes(tier)) { t.got.push(tier); if (t.got.length >= 3) finish(t); } else if (t.ty === 1 && tier === t.tier && ++t.got >= t.n) finish(t); }
  save();
}
const DISC = ['An old survey buoy. Its log ends mid-sentence.', 'A sealed cache, left by someone who meant to come back.', 'A drifting marker stone, carved by no tool you know.', 'A dead probe, still pointing its dish at home.', 'A memorial light, kept burning by a tiny reactor.', 'A relay that repeats one word in a language of clicks.', 'A lifeboat, empty, its seats still warm-coloured.', 'A garden pod: one plant, alive, turning toward the star.'];
function discover() {
  ST.found[mkey()] = 1; const R = mulberry32(SYS.salt ^ 0xD15C), tier = 2 + (R() * 3 | 0), n = 1 + (R() * 3 | 0);
  cargo[tier] += n; ST.credits += 30; const t = mission(); if (t.ty === 2 && !t.done) { t.done = 1; ST.credits += t.pay; }
  tip(`${DISC[bcnN]} · ${n} ${TIERS[tier]} aboard`, 9000); cue('outro', 1); showCargo(); save();
}

// ---- one panel serves the gate, the trader and the log: a titled list; entries with an action can be picked ----
let items = [], jpOpen = 0, jumpTo = null, jumpT = 0, jumped = 0, gateIn = 0;
function panel(title, sub, list, foot) {
  if (xr && !jpOpen) xrBuzz(.45, 50);   // a short buzz on the Touch Plus, so a panel is not missed
  if (!list.some((d) => d.run)) foot = xr ? 'B to close' : 'Click, or press J, to close'; else if (xr && foot && /number|press/i.test(foot)) foot = 'Right stick to choose · A to select · B to close';
  items = list; psel = Math.max(0, list.findIndex((d) => d.run)); $('jh').textContent = title; $('jc').textContent = sub; $('jk').textContent = foot;
  $('jl').innerHTML = list.map((d, i) => `<li data-i=${i} class="${d.far ? 'far ' : ''}${d.run ? '' : 'ro'}"><b>${d.name}</b><i>${d.kind || ''}</i><span>${d.desc || ''}</span></li>`).join('');
  $('jp').className = 'on'; jpOpen = 1;
}
const closePanel = () => { $('jp').className = ''; jpOpen = 0; };
const pick = (i) => { const d = items[i]; if (d && d.run) { closePanel(); d.run(); } };
const gateDist = () => Math.hypot(px, py, pz);
function gatePanel() {
  if (gateDist() > 2600) { tip(`The warp gate is ${(gateDist() / 1000).toFixed(1)} km away: follow the marker`, 4000); return; }
  // Gates go to the other places in this system; only the system's own gate (its first place) has lanes to other systems.
  // Planet skies aren't on the gate: you fly down to a world (and that's where oxygen comes from).
  const list = [], home = SYS.loc === 0;
  SYS.locs.forEach((l, i) => { if (i !== SYS.loc && !l.atm) list.push({ name: l.name, kind: i === 0 ? 'system gate' : l.kind, desc: l.desc + (ST.visited[SYS.id].locs.includes(i) ? '' : ' · not yet visited') + (i === 0 ? ' · lanes to other systems leave from here' : ''), run: () => startJump({ sec: SYS.sec, loc: i }) }); });
  if (home) for (const n of reach(SYS.sec)) { const s = mkSys(sysIdAt(n[0], n[1], n[2])), v = ST.visited[s.id]; list.push({ far: 1, name: s.name, kind: s.star, desc: `Lane to sector ${n.join(' ')} · ${s.locs.filter((l) => !l.atm).length} places${v ? ' · visited' : ''}`, run: () => startJump({ sec: n, loc: 0 }) }); }
  panel('Warp gate', `${SYS.locs[SYS.loc].name} · ${SYS.name} · ${SYS.star}`, list, home ? 'Press a number to warp · J to close' : `Lanes to other systems leave from ${SYS.locs[0].name} · J to close`);
}
function tradePanel() {
  let v = 0; for (let i = 1; i < 6; i++) v += cargo[i] * TVAL[i];
  const R = mulberry32(SYS.salt ^ 0x7EADE0 ^ Math.floor(Date.now() / 864e5)), others = SYS.locs.filter((l) => l.i !== SYS.loc), to = others[R() * others.length | 0], pay = 60 + (R() * 15 | 0) * 10, list = [];
  list.push({ name: 'Trade', kind: `${slotsUsed()}/${holdSlots()} slots`, desc: 'Open your hold beside the trader\'s stock: ore, fuel cells, energy cells, repair kits', run: () => { closePanel(); invShow('trader'); } });
  list.push(v ? { name: 'Sell all minerals', kind: `${v} credits`, desc: 'Every mineral aboard, at the going rate', run: () => { ST.credits += v; cargo.fill(0); showCargo(); save(); tip(`Hold sold · +${v} credits`, 4000); } } : { name: 'Nothing to sell', desc: 'Your hold is empty' });
  if (ST.hull < 99) { const cost = Math.ceil((100 - ST.hull) * 1.5 * (typeof berthMul === 'function' ? berthMul() : 1)); list.push(ST.credits >= cost ? { name: 'Repair the hull', kind: `${cost} credits`, desc: `Hull is at ${ST.hull | 0}%. ${typeof berthNote === 'function' ? berthNote() : 'The yard will plate it.'}`, run: () => { ST.credits -= cost; ST.hull = 100; gain({ rep: 1, xp: 4 }); save(); showCargo(); tip('Hull repaired', 3000); } } : { name: 'Repair the hull', kind: `${cost} credits`, desc: `Hull is at ${ST.hull | 0}%. Not enough credits yet: sell the hold, or crack ferrite in the field.` }); }
  if (typeof v122Berth === 'function') v122Berth(list);
  list.push(ST.courier ? { name: 'You are carrying a case', kind: ST.courier.name, desc: `${ST.courier.pay} credits on delivery` } : { name: 'Carry a sealed case', kind: to.name, desc: `${pay} credits when it arrives. No hurry.`, run: () => { ST.courier = { sec: SYS.sec, loc: to.i, name: to.name, pay }; save(); tip(`Case aboard for ${to.name}`, 4000); } });
  list.push(...rpgTrade());
  panel('Trader', `A quiet word off ${SYS.locs[SYS.loc].name} · you hold ${ST.credits} credits`, list, 'Press a number · J to close');
}
function logPanel() {
  const vs = Object.values(ST.visited), list = [{ name: 'Here', kind: SYS.locs[SYS.loc].kind, desc: taskText(mission()) }];
  list.push({ name: 'Signal', kind: ST.found[mkey()] ? 'found' : 'unresolved', desc: ST.found[mkey()] ? DISC[bcnN] : `Repeating, about ${(Math.hypot(bcn[0], bcn[1], bcn[2]) / 1000).toFixed(1)} km from the gate. Look for its light.` });
  if (ST.courier) list.push({ name: 'Case aboard', kind: ST.courier.name, desc: `${ST.courier.pay} credits on delivery` });
  list.push({ name: 'Hold', kind: `${ST.credits} credits`, desc: [5, 4, 3, 2, 1].map((i) => `${cargo[i]} ${TIERS[i]}`).join(' · ') });
  list.push({ name: SYS.name, kind: `${ST.visited[SYS.id].locs.length}/${SYS.locs.length} places`, desc: SYS.locs.map((l) => (ST.visited[SYS.id].locs.includes(l.i) ? '● ' : '○ ') + l.name).join('   ') });
  list.push({ name: 'Systems visited', kind: String(vs.length), desc: vs.slice(-8).map((s) => s.name + (s.charted ? ' ✓' : '')).join(' · ') });
  panel('Log', `${Object.keys(ST.found).length} discoveries · ${ST.dead.length} rocks broken`, list, 'L or J to close');
}
function startJump(d) { closePanel(); if (!d || jumpTo || !flying()) return; jumpTo = d; jumpT = 0; jumped = 0; if (AC && AC.state === 'running') burst(AC.currentTime, 2.6, .28, 60, 900, 'lowpass'); note(41, AC.currentTime, .1, 'sine', 2.4, 0); note(mf(60), AC.currentTime + .1, .03, 'sawtooth', 2.3, 1); }
$('jl').onclick = (e) => { const li = e.target.closest('li'); if (li) pick(+li.dataset.i); };
$('jb').onclick = () => jpOpen ? closePanel() : gatePanel();

addEventListener('keydown', (e) => {
  if (e.code === 'Tab' && flying()) e.preventDefault();   // Tab is the aux display in flight, not focus cycling
  if (e.repeat || e.metaKey || e.ctrlKey) return;
  K[e.code] = 1;
  if (e.code === 'KeyM') setMute(!muted);
  if (e.code === 'KeyC') setCock(!cockpit);
  if (e.code === 'KeyH') { stats = !stats; if (!stats) $('i').textContent = ''; }
  if (e.code === 'KeyX' && !CFG.ctl) thr = 0;
  if (e.code === 'KeyV' && started) vr();
  if (e.code === 'KeyJ' && flying()) jpOpen ? closePanel() : gatePanel();
  if (e.code === 'KeyL' && flying()) jpOpen ? closePanel() : logPanel();
  if (e.code === 'KeyN') starMap();
  if (e.code === 'KeyR') { CFG.radio = CFG.radio ? 0 : 1; setUi(); if (CFG.radio) radioJump(); tip(CFG.radio ? 'Ikosagon radio on: tuning in somewhere new' : 'Radio off: ship\'s score', 3000); }
  if (e.code === 'BracketRight' && CFG.radio) radioJump();
  if (flying() && !jpOpen && !invOpen && /^Digit[1-5]$/.test(e.code)) wpnSet(+e.code[5] - 1);
  if (e.code === 'KeyI' && flying() && !jpOpen) invShow('hold');
  if ((e.code === 'Tab' || e.code === 'KeyU') && flying() && !jpOpen && !invOpen) pipOpen();   // the aux display, full screen (U is a quiet alias)
  if (e.code === 'KeyB' && flying()) jpOpen ? closePanel() : journalPanel();
  if (e.code === 'KeyT' && flying() && !jpOpen) navCycle(e.shiftKey ? -1 : 1);
  if (e.code === 'KeyF' && flying()) interact();
  if (e.code === 'Escape' && flying() && !locked) jpOpen ? closePanel() : menu();
  if (flying() && jpOpen && /^Digit[1-9]$/.test(e.code)) pick(+e.code[5] - 1);
  if (flying() && /^(Key[WASDQEX]|Space|Arrow|Tab)/.test(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { K[e.code] = 0; });
addEventListener('blur', () => { for (const k in K) K[k] = 0; mFire = 0; });
const lock = () => { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {} };
cv.addEventListener('mousedown', (e) => { if (!flying() || e.button) return; mFire = 1; cv.focus(); if (!locked) lock(); });   // a click always tries to capture the mouse again
addEventListener('mouseup', () => { mFire = 0; });
addEventListener('mousemove', (e) => {
  if (!flying()) return;
  if (locked) { yaw += YS() * e.movementX * .0021 * CFG.sens; pitch -= IY() * e.movementY * .0021 * CFG.sens; dyaw += e.movementX * .0021 * CFG.sens; }
  else { const r = cv.getBoundingClientRect(), h = r.height / 2; mxn = (e.clientX - r.left - r.width / 2) / h; myn = (e.clientY - r.top - h) / h; }
});
cv.addEventListener('mouseleave', () => { mxn = myn = 0; });
addEventListener('wheel', (e) => { if (flying()) thr = Math.max(-.25, Math.min(1, thr - e.deltaY * .0007)); }, { passive: true });
document.addEventListener('pointerlockchange', () => {
  const was = locked; locked = document.pointerLockElement === cv;
  if (locked) steer = 0;   // a late capture (after full screen settles) takes over from cursor steering
  if (flying()) { B.className = locked ? 'g p' : 'g'; if (was && !locked) menu(); }
});
const tp = (t) => { const pr = matchMedia('(orientation:portrait) and (pointer:coarse)').matches; return pr ? [t.clientY, -t.clientX] : [t.clientX, t.clientY]; };
const touch = (e) => {
  e.preventDefault(); const n = e.touches.length;
  if (n && (!tn || e.type === 'touchstart' && n === 1)) { [tx0, ty0] = tp(e.touches[0]); tdx = tdy = 0; }
  if (n && e.type === 'touchmove') { const [x, y] = tp(e.touches[0]), k = 1 / Math.min(innerWidth, innerHeight); tdx = (x - tx0) * k; tdy = (y - ty0) * k; }
  tn = n; if (!n) tdx = tdy = 0;
};
for (const t of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) cv.addEventListener(t, touch, { passive: false });
for (const [t, v] of [['touchstart', 1], ['touchend', 0], ['touchcancel', 0]]) $('fire').addEventListener(t, (e) => { e.preventDefault(); tFire = v; }, { passive: false });

const tip = (t, ms = 7000) => { pipLog(t); hudTipS = t; hudTipT = performance.now() + Math.min(ms, 6000); const e = $('tip'); e.textContent = t; e.className = 'on'; clearTimeout(tip.t); tip.t = setTimeout(() => { e.className = ''; }, ms); };
function go() {
  if (!started) setTimeout(() => cue('theme', 1), 9000);     // the first flight opens with the theme
  B.className = 'g'; started = 1; $('launch').textContent = 'Back to the dark'; audio(); cv.focus();
  const fsP = !TEST && !xr && CFG.fs !== 0 && !document.fullscreenElement && document.documentElement.requestFullscreen ? document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}) : null;   // launching goes full screen (Settings can turn it off; F11 works any time)
  if (!mob && !TEST && !xr) {
    lock();
    if (fsP) fsP.then(() => setTimeout(() => { if (!locked && flying()) lock(); }, 60));   // the browser can refuse mouse capture mid-switch to full screen: ask again once it has settled
    // no mouse capture available (e.g. inside a frame): steer with the cursor's position instead, no button needed
    setTimeout(() => { if (!locked && flying()) { steer = 1; tip('Move the mouse to steer · Space to fire · J to jump'); } }, fsP ? 1600 : 700);
  }
}
$('ver').textContent = BUILD;
function menu() { closePanel(); B.className = 'm'; if (document.pointerLockElement) document.exitPointerLock(); for (const k in K) K[k] = 0; mFire = 0; steer = 0; }
$('launch').onclick = go; $('o').onclick = menu; if ($('fresh')) $('fresh').onclick = () => { if (started) menu(); newUniverse(); };
// Installed from the Meta Horizon Store (a packaged web app): VR is the only way in, so the main button enters the headset
// and the desktop-only items (separate VR button, keyboard controls, the full-screen note) step aside.
const PWA = typeof window.getDigitalGoodsService === 'function' || QS.has('pwa');
if (PWA) {
  $('launch').textContent = 'Enter VR';
  $('launch').onclick = async () => { let ok = false; try { ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'); } catch {} if (ok) vr(1); else go(); };
  for (const id of ['vr', 'keys']) $(id).parentNode.style.display = 'none'; const fn = $('fsn'); if (fn) fn.style.display = 'none';
}
let cockpit = 1;
try { cockpit = localStorage.esCock !== '0'; } catch {}
const labels = () => { $('cargo').style.display = cockpit ? 'none' : ''; $('ck').lastChild.textContent = cockpit ? 'on' : 'off'; $('snd').lastChild.textContent = muted ? 'off' : 'on'; $('det').lastChild.textContent = ['high', 'medium', 'low'][LV]; };
const setMute = (v) => { muted = v; if (AG) AG.gain.setTargetAtTime(muted ? 0 : .5, AC.currentTime, .2); labels(); };
const setCock = (v) => { cockpit = v; keep('esCock', v ? 1 : 0); labels(); };
$('ck').onclick = () => setCock(!cockpit); $('snd').onclick = () => setMute(!muted);
$('det').onclick = () => { keep('esLevel', (LV + 1) % 3); location.reload(); };
labels();

// ============================================================================
// Sound. Nothing is recorded: a pad, a walking melody, bass and drums are synthesized, and each region has
// its own key, scale and tempo. Speed adds energy; gunfire brings in the percussion.
// ============================================================================
let AC = null, AG = null, DL = null, NB = null, windG = null, windF = null, boostG = null, boostF = null, gatG = null, padF = null, padO = [], mT = 0, mStep = 0, mReg = -1, mWalk = 5, combat = 0, energy = 0;
const mf = (m) => 440 * 2 ** ((m - 69) / 12);
// the recorded score: five passages cut from the track, laid end to end in one file (start, length, level).
// They are never looped as a soundtrack; one drifts in at a moment that suits it, then leaves.
// the recorded passages that used to ride inside the page are gone: music is the generated score, or the Ikosagon radio
let cueEnd = 0, cueG = null, cueName = '', calmT = 0, fastT = 0, padG = null;
function cue() {}
function cueStop() {}
function audio() {
  if (AC) { AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  AG = AC.createGain(); AG.gain.value = 0; AG.gain.setTargetAtTime(muted ? 0 : .5, AC.currentTime, 1.5);
  // everything passes a gentle compressor, then a fast limiter, with headroom left over: nothing should clip
  const pre = AC.createGain(), lm = AC.createDynamicsCompressor(), og = AC.createGain(); pre.gain.value = .55; og.gain.value = .8;
  lm.threshold.value = -9; lm.knee.value = 6; lm.ratio.value = 8; lm.attack.value = .003; lm.release.value = .15;
  const ws = AC.createWaveShaper(), wc = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; wc[i] = Math.tanh(x * 1.1) / Math.tanh(1.1); } ws.curve = wc; ws.oversample = '2x';
  AG.connect(pre).connect(lm).connect(ws).connect(og).connect(AC.destination);
  AG.sx = AC.createGain(); AG.sx.gain.value = .9; AG.sx.connect(ws);                      // effects that must always be heard join after the limiter
  DL = AC.createDelay(2); const fb = AC.createGain(), lp = AC.createBiquadFilter();
  DL.delayTime.value = .36; fb.gain.value = .55; lp.frequency.value = 1800; DL.connect(lp).connect(fb).connect(DL); DL.connect(AG);
  padF = AC.createBiquadFilter(); padF.frequency.value = 260; padF.Q.value = 1.5; padG = AC.createGain(); padG.gain.value = .11; padF.connect(padG).connect(AG); padG.gain.value = 0;   // the old drone pad is retired: the score has its own
  arpF = AC.createBiquadFilter(); arpF.Q.value = 7; arpF.frequency.value = 500; arpG = AC.createGain(); arpG.gain.value = 1; const as = AC.createGain(); as.gain.value = .35; arpF.connect(arpG).connect(AG); arpG.connect(as).connect(DL);
  for (let i = 0; i < 6; i++) { const o = AC.createOscillator(); o.type = i < 2 ? 'sawtooth' : i < 4 ? 'triangle' : 'sawtooth'; o.detune.value = (i & 1 ? 7 : -7) + Math.random() * 4; o.connect(padF); o.start(); padO.push(o); }
  const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = .06; lg.gain.value = 90; lfo.connect(lg).connect(padF.frequency); lfo.start();
  NB = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const nd = NB.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = () => { const s = AC.createBufferSource(); s.buffer = NB; s.loop = true; s.start(); return s; };
  windF = AC.createBiquadFilter(); windF.type = 'lowpass'; windF.frequency.value = 90; windF.Q.value = .5;
  subO = AC.createOscillator(); subG = AC.createGain(); subO.frequency.value = 34; subG.gain.value = 0; subO.connect(subG).connect(AG); subO.start();   // the engine's body
  windG = AC.createGain(); windG.gain.value = 0; noise().connect(windF).connect(windG).connect(AG);
  boostF = AC.createBiquadFilter(); boostF.type = 'bandpass'; boostF.frequency.value = 420; boostF.Q.value = .6;
  boostG = AC.createGain(); boostG.gain.value = 0; noise().connect(boostF).connect(boostG).connect(AG);
  // the gun: two low oscillators and a little dull noise through a low-pass, struck by a falling ramp at the firing rate,
  // so each round is a short thump with a body and almost nothing above 500 Hz
  const g1 = AC.createOscillator(), g2 = AC.createOscillator(), gf = AC.createBiquadFilter(), am = AC.createGain(), lf = AC.createOscillator(), lg2 = AC.createGain(), gn = AC.createGain(), nf = AC.createBiquadFilter();
  g1.type = 'square'; g1.frequency.value = 52; g2.type = 'triangle'; g2.frequency.value = 78; gf.frequency.value = 380; gf.Q.value = 1.2;
  nf.frequency.value = 520; gn.gain.value = .5; noise().connect(nf).connect(gn).connect(gf);
  am.gain.value = .5; lf.type = 'sawtooth'; lf.frequency.value = 11; lg2.gain.value = -.5; lf.connect(lg2).connect(am.gain);
  g1.connect(gf); g2.connect(gf); gf.connect(am); gatG = AC.createGain(); gatG.gain.value = 0; am.connect(gatG).connect(AG);
  g1.start(); g2.start(); lf.start();
  setInterval(sched, 60);
}
let arpF = null, arpG = null, bar = 0;
function retune(r, rd = 0) {                                  // the pad holds the bar's chord, built from the key's own scale
  const tones = [24 + sn(rd), 24 + sn(rd + 4), 36 + sn(rd), 36 + sn(rd + 2), 36 + sn(rd + 4), 48 + sn(rd)];
  padO.forEach((o, i) => o.frequency.setTargetAtTime(mf(tones[i]), AC.currentTime, .35 + i * .05));
}
function arp(f, t, v, cut) {                                  // two detuned saws; the shared filter snaps open and closes on every note
  const g = AC.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + .19); g.connect(arpF);
  for (const d of [-7, 7]) { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(g); o.start(t); o.stop(t + .22); }
  arpF.frequency.setValueAtTime(cut * 3.2, t); arpF.frequency.exponentialRampToValueAtTime(cut, t + .11);
}
let padMute = false;
function swell() {
  if (radioAir()) return;                                            // arriving somewhere: a slow brass-like rise that opens and falls away
  if (!AC || AC.state !== 'running') return;
  const t = AC.currentTime + .2, f = AC.createBiquadFilter(), g = AC.createGain(); f.Q.value = 1;
  f.frequency.setValueAtTime(180, t); f.frequency.exponentialRampToValueAtTime(1500, t + 3.5); f.frequency.exponentialRampToValueAtTime(200, t + 9);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + 3); g.gain.exponentialRampToValueAtTime(.0001, t + 9.5); f.connect(g); g.connect(AG); g.connect(DL);
  for (const n of [24, 31, 36, 43, 48, 51]) for (const d of [-9, 8]) { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mf(n); o.detune.value = d; o.connect(f); o.start(t); o.stop(t + 10); }
}
function note(f, t, v, type, dur, echo) {
  const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(AG); if (echo) g.connect(DL); o.start(t); o.stop(t + dur + .05);
}
function burst(t, dur, v, f0, f1, type) {                    // filtered noise: explosions, hats
  const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = NB; fl.type = type;
  fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .003); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(fl).connect(g).connect(AG); s.start(t, Math.random()); s.stop(t + dur + .05);
}
function sched() {
  if (!AC || AC.state !== 'running' || document.hidden) return;
  { const air = radioAir(); if (air !== padMute) { padMute = air; const t = AC.currentTime; padG.gain.cancelScheduledValues(t); padG.gain.setTargetAtTime(0, t, .4); if (air && cueG) { cueG.gain.cancelScheduledValues(t); cueG.gain.setTargetAtTime(0, t, .4); cueEnd = t; } }
    if (air) { mT = Math.max(mT, AC.currentTime + .1); scTick(); return; } }   // while the radio is on the air, every part of the ship's own music is silent: sequencer, pad, recorded passages, swells       // the radio has the air: the sequenced score rests and picks up when the song ends
  scTick();
}
// each round: a short low knock with a little body of filtered noise under it
function gunSnd() {
  if (!AC || AC.state !== 'running') return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(); o.type = 'triangle';
  o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(40, t + .09); g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(WPN[wpn][3], t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + .14);
  o.frequency.setValueAtTime(WPN[wpn][4], t); o.frequency.exponentialRampToValueAtTime(WPN[wpn][4] * .35, t + .09);
  o.connect(g).connect(AG.sx || AG); o.start(t); o.stop(t + .16); burst(t, .07, .05, 600, 150, 'lowpass');
}
function thud(v) {
  if (!AC || AC.state !== 'running') return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(), a = Math.min(.3, v / 200);
  o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + .3); g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(.0001, t + .45);
  o.connect(g).connect(AG); o.start(t); o.stop(t + .5); burst(t, .3, a * .6, 400, 60, 'lowpass');
}
function boom(size, dist) {
  if (!AC || AC.state !== 'running') return;
  const v = Math.min(.5, .07 + size * .01) / (1 + (dist || 0) / 420); if (v < .008) return;
  const t = AC.currentTime, dur = .65 + Math.min(1.05, size * .012);
  const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(70 + Math.min(36, 280 / (size + 6)), t); o.frequency.exponentialRampToValueAtTime(24, t + dur * .75);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v * .85, t + .018); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(AG); o.start(t); o.stop(t + dur + .05);
  burst(t, dur * .9, v * .42, 200, 38, 'lowpass');
  burst(t + .04, .28, v * .16, 1600, 280, 'bandpass');
  burst(t + .11, .18, v * .1, 2200, 420, 'highpass');
}
const blip = (tier) => { if (AC && AC.state === 'running') { const t = AC.currentTime, m = MUS[REG < 0 ? 0 : REG], r = m[0] + 12; note(mf(r + m[1][tier % 5]), t, .05, 'sine', .5, 1); note(mf(r + m[1][(tier + 2) % 5] + (tier > 2 ? 12 : 0)), t + .09, .04, 'sine', .7, 1); } };

// ============================================================================
// The gun, and what it does. Rubble, pickups, tracers and sparks are simulated here and drawn as free-moving
// instances. Every hit rock remembers its damage; when it gives way it splits into angular fragments that
// drift apart, and those can be split again until only ore and dust are left.
// ============================================================================
const ND = 420, dX = new Float64Array(ND * 3), dV = new Float32Array(ND * 3), dSz = new Float32Array(ND), dSeed = new Float32Array(ND), dHue = new Float32Array(ND), dHp = new Float32Array(ND), dLife = new Float32Array(ND);
const dKind = new Uint8Array(ND), dTier = new Uint8Array(ND), dType = new Uint8Array(ND);   // kind: 1 fragment, 2 mineral pickup, 3 crumb
let dCur = 0;
function spawnD(kind, x, y, z, ax, ay, az, size, hue, tier, type, life) {
  let i = -1;
  for (let k = 0; k < ND; k++) { const j = (dCur + k) % ND; if (!dKind[j]) { i = j; break; } }
  if (i < 0) { for (let k = 0; k < ND; k++) { const j = (dCur + k) % ND; if (dKind[j] === 3) { i = j; break; } } if (i < 0) { if (kind === 3) return; i = dCur; } }
  dCur = (i + 1) % ND;
  dKind[i] = kind; dX[i * 3] = x; dX[i * 3 + 1] = y; dX[i * 3 + 2] = z; dV[i * 3] = ax; dV[i * 3 + 1] = ay; dV[i * 3 + 2] = az;
  dSz[i] = size; dSeed[i] = Math.random(); dHue[i] = hue; dTier[i] = tier; dType[i] = type; dHp[i] = 2 + size * .3; dLife[i] = life;
}
const NP = 900, pX = new Float64Array(NP * 3), pV = new Float32Array(NP * 3), pC = new Float32Array(NP * 3), pL = new Float32Array(NP), pM = new Float32Array(NP), pS = new Float32Array(NP), pGr = new Float32Array(NP), pK = new Uint8Array(NP);
let pCur = 0;
function spark(x, y, z, ax, ay, az, life, size, grow, r, g, b, kind) {
  const i = pCur; pCur = (pCur + 1) % NP;
  pX[i * 3] = x; pX[i * 3 + 1] = y; pX[i * 3 + 2] = z; pV[i * 3] = ax; pV[i * 3 + 1] = ay; pV[i * 3 + 2] = az;
  pL[i] = pM[i] = life; pS[i] = size; pGr[i] = grow; pC[i * 3] = r; pC[i * 3 + 1] = g; pC[i * 3 + 2] = b; pK[i] = kind;
}
const NBU = 96, bX = new Float64Array(NBU * 3), bV = new Float32Array(NBU * 3), bL = new Float32Array(NBU), bP = new Float32Array(NBU * 6);
let muzzle = 0, bCur = 0, nLive = 0, gunSpin = 0, fireAcc = 0, shotN = 0, broken = 0;
const rd = [0, 0, 0];
const rdir = () => { let x, y, z, l; do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < .01); l = 1 / Math.sqrt(l); rd[0] = x * l; rd[1] = y * l; rd[2] = z * l; };

const bW = new Uint8Array(NBU), WCOL = [[7, 3.6, 1], [1.4, 7, 2.6], [6.5, 1.6, 9], [1.2, 4.5, 6], [8, 4, 1]], WSH = [[1, .007, 1600, 1.4], [6, .07, 1300, .45], [1, .002, 3400, 1.7], [1, .004, 3000, .26]];
let gmx = 0, gmy = 0, lastFire = -99, dryTip = 0, fullTip = 0, palEase = 0;                                         // where the guns are pointing, off the nose: they follow the cursor a little   // each weapon has its own light: amber rounds, green shot, violet lance
function shoot() {
  if (wpn === 4) return seekerFire();
  const sd = shotN++ & 1 ? 1 : -1, ox = sRx * sd * 2.7 - sUx * 1.3 + sFx * 4, oy = sRy * sd * 2.7 - sUy * 1.3 + sFy * 4, oz = sRz * sd * 2.7 - sUz * 1.3 + sFz * 4;   // the guns sit well out on either side
  const [n, spr, v0, life] = WSH[wpn], col = WCOL[wpn];
  for (let k = 0; k < n; k++) {
    const sx = (Math.random() - .5) * spr, sy = (Math.random() - .5) * spr;
    let ax = (sFx + sRx * gmx + sUx * gmy) * 500 - ox, ay = (sFy + sRy * gmx + sUy * gmy) * 500 - oy, az = (sFz + sRz * gmx + sUz * gmy) * 500 - oz; const l = 1 / Math.hypot(ax, ay, az);
    ax = ax * l + sRx * sx + sUx * sy; ay = ay * l + sRy * sx + sUy * sy; az = az * l + sRz * sx + sUz * sy;
    const i = bCur; bCur = (bCur + 1) % NBU; bW[i] = wpn;
    bX[i * 3] = px + ox; bX[i * 3 + 1] = py + oy; bX[i * 3 + 2] = pz + oz; bV[i * 3] = ax * v0 + vx; bV[i * 3 + 1] = ay * v0 + vy; bV[i * 3 + 2] = az * v0 + vz; bL[i] = life;
  }
  spark(px + ox + sFx * .3, py + oy + sFy * .3, pz + oz + sFz * .3, vx, vy, vz, wpn === 2 ? .12 : .05, wpn === 2 ? 1.4 : wpn === 1 ? .9 : .5, 0, col[0] * .7, col[1] * .8, col[2] * 1.2, 0); muzzle = 1;
  trauma = Math.min(1, trauma + (wpn === 2 ? .12 : wpn === 1 ? .08 : wpn === 3 ? .006 : .035)); if (wpn !== 3 || !(shotN & 3)) gunSnd();
}
// where a rock was, leave fragments, crumbs, dust, sparks and (if it held any) minerals
function shatter(x, y, z, size, hue, tier, type, ax, ay, az, ix, iy, iz) {
  const dist = Math.hypot(x - px, y - py, z - pz), geode = type === 6; broken++;
  if (size > 4 && !geode) {
    const n = size > 20 ? 6 : size > 9 ? 5 : 4;
    for (let k = 0; k < n; k++) { rdir(); const s = size * (.3 + .22 * Math.random()), sp = 2 + Math.random() * 6 + 40 / size; spawnD(1, x + rd[0] * size * .42, y + rd[1] * size * .42, z + rd[2] * size * .42, ax + rd[0] * sp + ix * 3, ay + rd[1] * sp + iy * 3, az + rd[2] * sp + iz * 3, s, hue, tier, type, 0); }
  }
  for (let k = 0, n = 6 + Math.min(12, size * .4); k < n; k++) { rdir(); const sp = 6 + Math.random() * 22; spawnD(3, x + rd[0] * size * .5, y + rd[1] * size * .5, z + rd[2] * size * .5, ax + rd[0] * sp, ay + rd[1] * sp, az + rd[2] * sp, Math.max(.12, Math.min(2.2, size * (.03 + .06 * Math.random()))), hue, 0, geode ? 5 : type, 2.5 + Math.random() * 3.5); }
  const gems = geode ? 3 + (Math.random() * 4 | 0) : tier ? (size > 4 ? +(Math.random() < .45) : 1 + (Math.random() < .35)) : +(size <= 4 && Math.random() < .15);
  for (let k = 0; k < gems; k++) { rdir(); const sp = 3 + Math.random() * 7; spawnD(2, x + rd[0] * size * .3, y + rd[1] * size * .3, z + rd[2] * size * .3, ax + rd[0] * sp, ay + rd[1] * sp, az + rd[2] * sp, .55, 0, tier || 1, 0, 90); }
  const o = tier * 3, hot = type === 3, ice = type === 2, dr = hot ? .16 : ice ? .05 : .045, dg = hot ? .06 : ice ? .065 : .04, db = hot ? .02 : ice ? .08 : .034;
  for (let k = 0, n = 6 + Math.min(10, size * .2); k < n; k++) { rdir(); const sp = (2 + Math.random() * 5) * (1 + size * .03); spark(x + rd[0] * size * .4, y + rd[1] * size * .4, z + rd[2] * size * .4, ax + rd[0] * sp, ay + rd[1] * sp, az + rd[2] * sp, 1.8 + Math.random() * 2.2, size * (.5 + .6 * Math.random()), size * .4, dr, dg, db, 1); }
  for (let k = 0, n = 14 + Math.min(26, size); k < n; k++) { rdir(); const sp = 18 + Math.random() * 70, t = tier && k & 1; spark(x, y, z, ax + rd[0] * sp, ay + rd[1] * sp, az + rd[2] * sp, .3 + Math.random() * .6, .1 + .22 * Math.random(), 0, t ? TCOL[o] * 4 : 3.5, t ? TCOL[o + 1] * 4 : 1.8, t ? TCOL[o + 2] * 4 : .5, 0); }
  spark(x, y, z, ax, ay, az, .14, size * 1.6, size * 3, 2.2, 1.5, .8, 0);
  trauma = Math.min(1, trauma + Math.min(.6, size * 6 / (dist + 30)));
  boom(size, dist); combat = 1;
}
const hit = (x, y, z, ix, iy, iz) => { for (let k = 0; k < 5; k++) { rdir(); const sp = 10 + Math.random() * 45; spark(x, y, z, vx + rd[0] * sp - ix * 20, vy + rd[1] * sp - iy * 20, vz + rd[2] * sp - iz * 20, .15 + Math.random() * .3, .07 + .1 * Math.random(), 0, 3.5, 2, .7, 0); } spark(x, y, z, vx, vy, vz, .07, .9, 0, 3, 2, 1, 0); combat = 1;
  for (let k = 0; k < 2; k++) { rdir(); spawnD(3, x, y, z, rd[0] * 16 - ix * 8, rd[1] * 16 - iy * 8, rd[2] * 16 - iz * 8, .1 + .25 * Math.random(), .5, 0, 0, 1.5 + Math.random() * 1.5); }   // chips fly off
  rdir(); spark(x, y, z, rd[0] * 3 - ix * 5, rd[1] * 3 - iy * 5, rd[2] * 3 - iz * 5, 1.2 + Math.random(), 2.2, 3, .04, .036, .03, 1); };
// closest approach of a bullet's path this frame (bP: start xyz, step xyz, relative to the camera) to a sphere
let hT = 0;
function bhit(i, cx, cy, cz, r) {
  const o = i * 6, mx = cx - bP[o], my = cy - bP[o + 1], mz = cz - bP[o + 2], ex = bP[o + 3], ey = bP[o + 4], ez = bP[o + 5];
  let t = (mx * ex + my * ey + mz * ez) / (ex * ex + ey * ey + ez * ez); t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = mx - ex * t, qy = my - ey * t, qz = mz - ez * t; hT = t;
  return qx * qx + qy * qy + qz * qz < r * r;
}
function simulate(dt, fly) {
  // the gun spins up, then fires 24 rounds a second from alternating barrels
  const firing = fly && (K.Space || mFire || tFire || xFire || gpFire);
  gunSpin += ((firing ? 1 : 0) - gunSpin) * (1 - Math.exp(-dt * (firing ? 8 : 3)));
  { const tx = xr || locked ? 0 : Math.max(-1, Math.min(1, mxn)) * .14, ty = xr || locked ? 0 : -Math.max(-1, Math.min(1, myn)) * .14, k = Math.min(1, dt * 10); gmx += (tx - gmx) * k; gmy += (ty - gmy) * k; }   // guns follow the cursor a little; straight ahead in mouse-look
  if (firing) { lastFire = tm; fireAcc += dt * 11 * gunSpin * [1, .32, .2, 3.4, .12][wpn]; while (fireAcc >= 1) { fireAcc -= 1; if (ST.wen < WEN[wpn]) { fireAcc = 0; if (tm > dryTip) { dryTip = tm + 6; tip('Weapons energy spent · it trickles back · sparks (red) charge it fast', 3500); } break; } ST.wen -= WEN[wpn]; shoot(); } }
  combat *= Math.exp(-dt * .35); muzzle *= Math.exp(-dt * 30);
  nLive = 0;
  for (let i = 0; i < NBU; i++) {
    if (bL[i] <= 0) continue;
    bL[i] -= dt; nLive++;
    const o = i * 3, q = i * 6; bP[q] = bX[o] - px; bP[q + 1] = bX[o + 1] - py; bP[q + 2] = bX[o + 2] - pz; bP[q + 3] = bV[o] * dt; bP[q + 4] = bV[o + 1] * dt; bP[q + 5] = bV[o + 2] * dt;
    bX[o] += bV[o] * dt; bX[o + 1] += bV[o + 1] * dt; bX[o + 2] += bV[o + 2] * dt;
  }
  if (nLive) {
    for (let li = 0; li < SHOOT.length; li++) {
      const L = SHOOT[li], D = L.d, C = L.C, N = L.N, Hh = N / 2, geo = L === LG;
      for (let n = L.n, o = 0; n > 0; n--, o += F) {
        const size = D[o + 3]; if (!size) continue;
        const rx = ((D[o] - L.mx + Hh) % N + N) % N - Hh, ry = ((D[o + 1] - L.my + Hh) % N + N) % N - Hh, rz = ((D[o + 2] - L.mz + Hh) % N + N) % N - Hh;
        const cx = (rx + D[o + 4]) * C - L.fx, cy = (ry + D[o + 5]) * C - L.fy, cz = (rz + D[o + 6]) * C - L.fz, r = size * (geo ? 1 : .8), far = 2400 + r;
        if (cx * cx + cy * cy + cz * cz > far * far) continue;
        for (let i = 0; i < NBU; i++) {
          if (bL[i] <= 0 || !bhit(i, cx, cy, cz, r)) continue;
          const q = i * 6, il = 1 / (Math.hypot(bP[q + 3], bP[q + 4], bP[q + 5]) || 1), ix = bP[q + 3] * il, iy = bP[q + 4] * il, iz = bP[q + 5] * il;
          let hxp = bP[q] + bP[q + 3] * hT - cx, hyp = bP[q + 1] + bP[q + 4] * hT - cy, hzp = bP[q + 2] + bP[q + 5] * hT - cz; const hl = r / (Math.hypot(hxp, hyp, hzp) || 1);
          hit(px + cx + hxp * hl, py + cy + hyp * hl, pz + cz + hzp * hl, ix, iy, iz);
          bL[i] = 0;
          cellRnd(L.root.cx + rx, L.root.cy + ry, L.root.cz + rz, L.salt);
          const d = (dmg.get(gh) || 0) + 2;
          if (d >= (geo ? 9 : size < 5 ? 1 : 2 + size * .3)) {
            dead.add(gh); ST.dead.push(gh); if (ST.dead.length > 6000) ST.dead.splice(0, 1000); save(); dmg.delete(gh); D[o + 3] = 0; L.root.cx = 1e9;          // gone for good; rebuild this layer's lists
            shatter(px + cx, py + cy, pz + cz, size, D[o + 8], D[o + 9], D[o + 10], 0, 0, 0, ix, iy, iz);
          } else dmg.set(gh, d);
          break;
        }
      }
    }
  }
  // fragments drift and can be hit again; minerals are drawn in when close; crumbs fade
  DC[0].n = DC[1].n = DGm.n = DT.n = DPa.n = 0;
  for (let i = 0; i < ND; i++) {
    const kd = dKind[i]; if (!kd) continue;
    const o = i * 3; let x = dX[o] - px, y = dX[o + 1] - py, z = dX[o + 2] - pz; const d2 = x * x + y * y + z * z;
    if (kd === 1) {
      if (d2 > 9e6) { dKind[i] = 0; continue; }
      if (nLive) for (let b = 0; b < NBU; b++) if (bL[b] > 0 && bhit(b, x, y, z, dSz[i] * .75)) {
        const q = b * 6, il = 1 / (Math.hypot(bP[q + 3], bP[q + 4], bP[q + 5]) || 1), ix = bP[q + 3] * il, iy = bP[q + 4] * il, iz = bP[q + 5] * il;
        hit(px + bP[q] + bP[q + 3] * hT, py + bP[q + 1] + bP[q + 4] * hT, pz + bP[q + 2] + bP[q + 5] * hT, ix, iy, iz); bL[b] = 0;
        dV[o] += ix * 6 / dSz[i]; dV[o + 1] += iy * 6 / dSz[i]; dV[o + 2] += iz * 6 / dSz[i];
        if ((dHp[i] -= 2) <= 0) { dKind[i] = 0; shatter(dX[o], dX[o + 1], dX[o + 2], dSz[i], dHue[i], dTier[i], dType[i], dV[o], dV[o + 1], dV[o + 2], ix, iy, iz); }
        break;
      }
      if (!dKind[i]) continue;
    } else if (kd === 2) {
      const d = Math.sqrt(d2);
      if (d < 6) { if (!addItem('o' + dTier[i], 1)) { if (tm > fullTip) { fullTip = tm + 8; tip('Hold full · I to open it: jettison, or sell to a trader · swarms turn ore into fuel and repairs', 5000); } continue; }
        if (typeof v123Collect === 'function' && v123Collect(i)) { dKind[i] = 0; continue; }
        dKind[i] = 0; showCargo(); oreCue(dTier[i], 1); if (dTier[i] > 2) cue('outro'); collected(dTier[i]); continue; }
      if (d < 140) { const f = dt * (60 + 9000 / (d + 10)) / d; dV[o] += (vx - dV[o]) * dt * 3 - x * f; dV[o + 1] += (vy - dV[o + 1]) * dt * 3 - y * f; dV[o + 2] += (vz - dV[o + 2]) * dt * 3 - z * f; }
      if ((dLife[i] -= dt) <= 0 || d2 > 4e6) { dKind[i] = 0; continue; }
    } else if ((dLife[i] -= dt) <= 0) { dKind[i] = 0; continue; }
    dX[o] += dV[o] * dt; dX[o + 1] += dV[o + 1] * dt; dX[o + 2] += dV[o + 2] * dt;
    if (kd === 2) put(DGm, x, y, z, dSz[i] * (1 + .12 * dTier[i]), 0, 0, 0, dSeed[i], 0, dTier[i], 0, 0);
    else put(DC[i & 1], x, y, z, dSz[i] * (kd === 3 ? Math.min(1, dLife[i]) : 1), 0, 0, 0, dSeed[i], dHue[i], dTier[i], dType[i], 0);
  }
  for (let i = 0; i < NP; i++) {
    if (pL[i] <= 0) continue;
    pL[i] -= dt; const o = i * 3, f = Math.max(0, pL[i] / pM[i]), a = pK[i] ? f * f * (1 - f) * 4 : f;
    pX[o] += pV[o] * dt; pX[o + 1] += pV[o + 1] * dt; pX[o + 2] += pV[o + 2] * dt; pS[i] += pGr[i] * dt;
    if (pK[i]) { const k = Math.exp(-dt * 1.2); pV[o] *= k; pV[o + 1] *= k; pV[o + 2] *= k; }
    put(DPa, pX[o] - px, pX[o + 1] - py, pX[o + 2] - pz, pS[i], 0, 0, 0, i * .137, pC[o] * a, pC[o + 1] * a, pC[o + 2] * a, pK[i]);
  }
  for (let i = 0; i < NBU; i++) if (bL[i] > 0) { const o = i * 3; const w = bW[i], q = WCOL[w], tl = w === 2 ? .05 : w === 1 ? .018 : w === 3 ? .07 : .03; put(DT, bX[o] - px, bX[o + 1] - py, bX[o + 2] - pz, w === 2 ? .5 : w === 1 ? .15 : w === 3 ? .13 : .22, -bV[o] * tl, -bV[o + 1] * tl, -bV[o + 2] * tl, 0, q[0], q[1], q[2], 0); }
  if (fly && (Math.abs(thr) > .2 || bst > .2)) {
    const len = 4 + Math.abs(thr) * 6 + bst * 16;
    put(DT, -sFx * 3.2, -sFy * 3.2 - .4, -sFz * 3.2, .22 + bst * .2, -sFx * len, -sFy * len, -sFz * len, 0, .35 + bst, .75, 1.3, 0);
    thrustT += dt;
    if (thrustT > .045) { thrustT = 0; spark(px - sFx * 2.4, py - sFy * 2.4, pz - sFz * 2.4, vx - sFx * (40 + bst * 80), vy - sFy * (40 + bst * 80), vz - sFz * (40 + bst * 80), .18, .12 + bst * .15, 0, .4, .8, 1.4, 0); }
  }
  if (fly && bst > .32 && !jumpTo) {
    const n = Math.min(12, 4 + (bst * 8 | 0));
    for (let i = 0; i < n; i++) {
      const a = i * 2.399963 + tm * .12, rad = 7 + (i % 4) * 3.4, back = 9 + (i * 5) % 16, cs = Math.cos(a), sn = Math.sin(a), ln = 12 + bst * 26;
      put(DT, sRx * cs * rad + sUx * sn * rad - sFx * back, sRy * cs * rad + sUy * sn * rad - sFy * back, sRz * cs * rad + sUz * sn * rad - sFz * back, .12 + bst * .12, -sFx * ln, -sFy * ln, -sFz * ln, 0, .75, .9, 1.15, 0);
    }
  }
  // a rich rock gives off a faint breathing glow of its mineral's colour: no beam
  for (let n = LG.n, o = 0, D = LG.d, N = LG.N, Hh = N / 2; n > 0; n--, o += F) {
    if (!D[o + 3]) continue;
    const rx = ((D[o] - LG.mx + Hh) % N + N) % N - Hh, ry = ((D[o + 1] - LG.my + Hh) % N + N) % N - Hh, rz = ((D[o + 2] - LG.mz + Hh) % N + N) % N - Hh, t = D[o + 9], c = t * 3, len = 60 + t * 50, k = .16 + .1 * t;
    { const gl2 = k * (.55 + .25 * Math.sin(tm * 1.3 + o)); put(DPa, (rx + D[o + 4]) * LG.C - LG.fx, (ry + D[o + 5]) * LG.C - LG.fy, (rz + D[o + 6]) * LG.C - LG.fz, 16 + t * 7, 0, 0, 0, .37, TCOL[c] * gl2, TCOL[c + 1] * gl2, TCOL[c + 2] * gl2, 0); }
  }
  const gd = gateDist(), gp = .8 + .2 * Math.sin(tm * 2.3);
  DGt.n = 0;
  if (!SYS.atm && veil < .45) {
    put(DGt, -px, -py, -pz, GATE, 0, 0, 0, .37, 0, 0, 0, 0);
    const gk = (i) => (pal[6 + i] * .5 + [.2, .5, 1][i] * .5) * gp;
    put(DPa, -px, -py, -pz, GATE * .9, 0, 0, 0, .21, .045 * gk(0), .045 * gk(1), .045 * gk(2), 1); put(DPa, -px, -py, -pz, GATE * .7, 0, 0, 0, .64, .03 * gk(0), .03 * gk(1), .03 * gk(2), 1);
    put(DPa, -px, -py, -pz, GATE * .22, 0, 0, 0, .5, .08 * gk(0), .08 * gk(1), .08 * gk(2), 0);
    if (fly && gd < GATE * .6 && !gateIn && !jumpTo) { gateIn = 1; gatePanel(); } else if (gd > GATE * 2) gateIn = 0;
  } else if (gd > GATE * 2) gateIn = 0;
  // the signal beacon: a small steady light and a thin beam until it has been found
  const bx = bcn[0] - px, by = bcn[1] - py, bz = bcn[2] - pz, bd = Math.hypot(bx, by, bz), fnd = ST.found[mkey()], bl = .5 + .5 * Math.sin(tm * 1.7);
  put(DGm, bx, by, bz, 2.5, 0, 0, 0, .4, 0, 3, 0, 0);
  if (!fnd) { { const st = Math.pow(Math.max(0, Math.sin(tm * 2.4)), 24); put(DPa, bx, by, bz, 9, 0, 0, 0, .3, .1 * bl, .22 * bl, .45 * bl, 0); put(DPa, bx, by, bz, 5 + 30 * st, 0, 0, 0, .7, 1.6 * st, 2 * st, 2.6 * st, 0); } if (fly && bd < 70) discover(); else if (fly && bd < 1800 && (pingT -= dt) < 0 && AC && AC.state === 'running') { pingT = 5; note(660, AC.currentTime, .014 * (1 - bd / 1800), 'sine', 1.4, 1); } }
  // the trader, parked off the gate
  DTr.n = 0;
  if (trader) { const tx = 430 - px, ty = -70 - py, tz = 260 - pz, td = Math.hypot(tx, ty, tz); put(DTr, tx, ty, tz, 70, 0, 0, 0, .61, 0, 0, .12, 0); if (fly && td < 190 && !tradeIn && !jumpTo) { tradeIn = 1; tradePanel(); } else if (td > 400) tradeIn = 0; }
  try { rpgSim(dt, fly); } catch (e) { console.error('rpg', e); }
  try { if (typeof v122Sim === 'function') v122Sim(dt, fly); } catch (e) { console.error('v122', e); }
  try { if (typeof v123Sim === 'function') v123Sim(dt, fly); } catch (e) { console.error('v123', e); }
  flush(DC[0]); flush(DC[1]); flush(DGm); flush(DT); flush(DPa); flush(DGt); flush(DTr);
}

// ============================================================================
// Drawing. eye() renders one view (the screen, half of it, or one lens of a headset) from the globals below.
// ============================================================================
let ckx = 0, cky = 0, ckz = 0, ckr = 0, stx = 0, sty = 0, ovx = 0, ovy = 0, ovz = 0, oyaw = 0, opit = 0, jk = 0;
let eRx, eRy, eRz, eUx, eUy, eUz, eFx, eFy, eFz, tL, tR, tB, tT, eox = 0, eoy = 0, eoz = 0, cex = 0, cey = 0, cez = 0;
const CKM = 2.5, CK_FLOOR = -3.64;   // cockpit units per metre in a headset (2.1 m floor to ceiling, seat ~0.65 m, bunk and counter ~0.9 m), and the cabin floor's height
function draw(P, L, m) {
  if (!L || !L.n || !m) return;
  gl.useProgram(P.p);
  const u = P.u;
  gl.uniform3f(u.uCell, L.mx, L.my, L.mz); gl.uniform3f(u.uCam, L.fx + eox, L.fy + eoy, L.fz + eoz); gl.uniform3f(u.uCN, L.C, L.N, L.R);
  gl.bindVertexArray(vaoFor(L, m)); gl.drawElementsInstanced(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0, L.n);
}
const fam3 = (P, Ls, ms) => { draw(P, Ls[0], ms[0]); draw(P, Ls[1], ms[1]); draw(P, Ls[2], ms[2]); };
function pass(P, dst, src) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); gl.viewport(0, 0, dst.w, dst.h);
  gl.useProgram(P.p); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, src.t);
}
function eye(fb, x, y, w, h, tw, th) {
  ensureT(tw, th);
  // globals for every shader
  const zn = NO.includes('n') ? 6 : .4, zf = 4e5, Az = (zf + zn) / (zn - zf), p0 = 2 / (tR - tL), p8 = (tR + tL) / (tR - tL), p5 = 2 / (tT - tB), p9 = (tT + tB) / (tT - tB);
  G[0] = p0 * eRx - p8 * eFx; G[1] = p5 * eUx - p9 * eFx; G[2] = -Az * eFx; G[3] = eFx;
  G[4] = p0 * eRy - p8 * eFy; G[5] = p5 * eUy - p9 * eFy; G[6] = -Az * eFy; G[7] = eFy;
  G[8] = p0 * eRz - p8 * eFz; G[9] = p5 * eUz - p9 * eFz; G[10] = -Az * eFz; G[11] = eFz;
  G[12] = 0; G[13] = 0; G[14] = 2 * zf * zn / (zn - zf); G[15] = 0;
  G[16] = SUN[0]; G[17] = SUN[1]; G[18] = SUN[2]; G[19] = tm;
  G[20] = pal[9] * 1.1; G[21] = pal[10] * 1.1; G[22] = pal[11] * 1.1; G[23] = fogD;
  G[24] = pal[0]; G[25] = pal[1]; G[26] = pal[2]; G[27] = xr || stereo ? 0 : Math.max(bst, jk);
  G[28] = pal[3]; G[29] = pal[4]; G[30] = pal[5]; G[31] = flash;
  G[32] = pal[6]; G[33] = pal[7]; G[34] = pal[8]; G[35] = .85;
  G[36] = vx + sFx * jk * 2500; G[37] = vy + sFy * jk * 2500; G[38] = vz + sFz * jk * 2500; G[39] = tT;
  G[40] = eRx; G[41] = eRy; G[42] = eRz; G[43] = tL; G[44] = eUx; G[45] = eUy; G[46] = eUz; G[47] = tB; G[48] = eFx; G[49] = eFy; G[50] = eFz; G[51] = tR;
  gl.bindBuffer(gl.UNIFORM_BUFFER, ubo); gl.bufferSubData(gl.UNIFORM_BUFFER, 0, G);

  // solid things
  gl.bindFramebuffer(gl.FRAMEBUFFER, T.ms || T.hdr.f); gl.viewport(0, 0, tw, th);
  gl.depthMask(true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  if (cockpit && flying()) {                                 // the cockpit goes in first, at the very front of the depth range
    const k = xr ? 1 / 6 : stereo ? .25 : 1, vib = .0015 + .004 * Math.abs(thr) + .012 * bst + trauma * .04, cg = (i) => Math.min(1, Math.log2(1 + cargo[i]) / 6);
    gl.depthRange(0, .01); pipTick(); gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, PIP.tex); gl.activeTexture(gl.TEXTURE0); gl.bindVertexArray(VAC);
    M3[0] = sRx; M3[1] = sRy; M3[2] = sRz; M3[3] = sUx; M3[4] = sUy; M3[5] = sUz; M3[6] = -sFx; M3[7] = -sFy; M3[8] = -sFz;
    const showQ = xr || Math.abs(hlY) > .42 || Math.abs(hlP) > .28;
    const cabEnd = showQ ? mCock.n - mCock.ng : (mCock.qt || mCock.n - mCock.ng);
    for (const [C, a, b] of [[P_COCK, 0, mCock.cb], [P_CAB, mCock.cb, cabEnd]]) {
      if (b <= a) continue;
      gl.useProgram(C.p);
      gl.uniformMatrix3fv(C.u.uShip, false, M3); if (xr) gl.uniform3f(C.u.uEye, cex, cey, cez); else gl.uniform3f(C.u.uEye, eox * k, eoy * k, eoz * k); gl.uniform1f(C.u.uWd, xr ? 1 : 1.3);
      gl.uniform4f(C.u.uMo, ckx + Math.sin(tm * 53) * vib, cky + Math.sin(tm * 67 + 2) * vib, ckz, ckr);
      gl.uniform4f(C.u.uCk, thr, gunSpin, Math.max(bst, jk), muzzle); gl.uniform4f(C.u.uSt, stx, sty, Math.min(1, Math.hypot(vx, vy, vz) / 660), cg(5)); gl.uniform4f(C.u.uCg, cg(1), cg(2), cg(3), cg(4)); gl.uniform1f(C.u.uDm, 1 - ST.hull / 100); gl.uniform2f(C.u.uAt, Math.asin(Math.max(-1, Math.min(1, sFy))), Math.atan2(sRy, sUy));
      if (C.u.uHt) gl.uniform1f(C.u.uHt, Math.max(0, 1 - (tm - hitPing) / .5));
      if (C.u.uHc) gl.uniform3f(C.u.uHc, PIP.col[0], PIP.col[1], PIP.col[2]);
      gl.drawElements(gl.TRIANGLES, b - a, gl.UNSIGNED_SHORT, a * 2);
    }
    gl.depthRange(0, 1);
  }
  const R = P_ROCK, ru = R.u, vd = Math.min(1, veil || 0);
  gl.useProgram(R.p); if (ru.uVd) gl.uniform1f(ru.uVd, vd); gl.uniform1i(ru.uKind, 0); gl.uniform1f(ru.uFlat, 0);
  gl.uniform1f(ru.uSpin, .002); fam3(R, TV, mHi);
  gl.uniform1f(ru.uSpin, .012); fam3(R, HV, mHi);
  gl.uniform1f(ru.uSpin, .05); fam3(R, BF, mFar); fam3(R, BN, mMid);
  gl.uniform1f(ru.uSpin, .6); fam3(R, SV, mLo);
  gl.uniform1f(ru.uFlat, 1);
  gl.uniform1f(ru.uSpin, .8); draw(R, LG, mShard[0]);
  gl.uniform1f(ru.uSpin, 1.6); draw(R, DC[0], mShard[0]); draw(R, DC[1], mShard[1]);
  gl.uniform1i(ru.uKind, 3); gl.uniform1f(ru.uSpin, 4); draw(R, DGm, mDart);
  gl.uniform1f(ru.uFlat, 0);
  gl.uniform1i(ru.uKind, 2); gl.uniform1f(ru.uSpin, 1.1); draw(R, LD, mBox);
  gl.uniform1i(ru.uKind, 1); gl.uniform1f(ru.uSpin, .02);
  gl.uniform1f(ru.uSpin, 0); draw(R, DGt, mGate);
  gl.useProgram(P_CRY.p); if (P_CRY.u.uVd) gl.uniform1f(P_CRY.u.uVd, vd); gl.uniform1f(P_CRY.u.uSpin, .05); draw(P_CRY, LC, mCry);
  gl.disable(gl.CULL_FACE); gl.useProgram(P_SHIP.p); if (P_SHIP.u.uVd) gl.uniform1f(P_SHIP.u.uVd, vd);
  gl.uniform1i(P_SHIP.u.uShip, 4); for (let i = 0; i < 3; i++) draw(P_SHIP, DAgs[i], mShips[i]); draw(P_SHIP, DAf, mFrig[0]);   // traffic, steered ship by ship
  gl.uniform1i(P_SHIP.u.uShip, 2); draw(P_SHIP, LDr, mDrone); draw(P_SHIP, LDs, mSiphon); draw(P_SHIP, LDe, mSpark);
  gl.uniform1i(P_SHIP.u.uShip, 3); draw(P_SHIP, DTr, mFrig[1]);
  gl.uniform1i(P_SHIP.u.uShip, 1); draw(P_SHIP, LFr, mFrig[1]); if (FV[1]) draw(P_SHIP, FV[1], mFrig[0]);
  gl.uniform1i(P_SHIP.u.uShip, 6); draw(P_SHIP, RV[0], mRing); draw(P_SHIP, RV[1], mSpire); draw(P_SHIP, RV[2], mHubS); draw(P_SHIP, RV[3], mDockS); draw(P_SHIP, MV[0], mRing); draw(P_SHIP, MV[1], mSpire);
  if (typeof v122Draw === 'function') v122Draw(vd, 0);
  // the sky fills whatever is left
  gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
  if (NO.includes('k')) skyw.fill(0);
  gl.useProgram(P_SKY.p); bigStarsSet(); gl.uniform4fv(P_SKY.u.uSky, skyw); gl.uniform4fv(P_SKY.u['uPl[0]'], SYS.pl); gl.uniform4fv(P_SKY.u['uPa[0]'], SYS.pa); gl.uniform3fv(P_SKY.u['uPb[0]'], SYS.pb); gl.uniform3f(P_SKY.u.uSd, SYS.seed[0], SYS.seed[1], SYS.seed[2]); gl.uniform4f(P_SKY.u.uPh, SYS.atm ? 0 : SYS.ph, SYS.phs, 0, 0); gl.uniform3f(P_SKY.u.uPq, SYS.pq[0], SYS.pq[1], SYS.pq[2]);
  { const pk = SYS.pk || [0, 3, 5, 0]; if (P_SKY.u.uPk) gl.uniform4f(P_SKY.u.uPk, pk[0], pk[1], pk[2], 0);
    const k = SYS.atm ? SYS.atm - 1 : 0, skin = SYS.atm && SYS.locs[SYS.loc] ? SYS.locs[SYS.loc].skin : 0;
    const look = !SYS.atm ? 0 : skin === 0 || skin === 4 ? 1 : skin === 5 || skin === 7 ? 3 : 2;
    gl.uniform4f(P_SKY.u.uOrb, look, Math.max(700, Math.min(9000, 2600 + py * .5)), px, pz); gl.uniform3f(P_SKY.u.uOa, SYS.pa[k * 4], SYS.pa[k * 4 + 1], SYS.pa[k * 4 + 2]); gl.uniform3f(P_SKY.u.uOb, SYS.pb[k * 3], SYS.pb[k * 3 + 1], SYS.pb[k * 3 + 2]); } gl.bindVertexArray(VA0); gl.drawArrays(gl.TRIANGLES, 0, 3);
  // glowing things, added on top (alpha is left alone: it marks open sky for the star shafts)
  gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE); gl.disable(gl.CULL_FACE);
  const Lf = P_LIFE, lu = Lf.u;
  gl.useProgram(Lf.p); if (lu.uVd) gl.uniform1f(lu.uVd, vd);
  if (NO.includes('l')) LQ.n = LJ.n = LWh.n = 0;
  gl.uniform1i(lu.uKind, 0); draw(Lf, LJ, mJelly); draw(Lf, LQ, mJelly);
  gl.uniform1i(lu.uKind, 1); draw(Lf, LY, mRay);
  gl.uniform1i(lu.uKind, 2); draw(Lf, LM, mDart);
  gl.uniform1i(lu.uKind, 3); draw(Lf, LWh, mWhale);
  gl.uniform1i(lu.uKind, 4); draw(Lf, LSp, mSerp);
  gl.uniform1i(lu.uKind, 5); gl.uniform1f(lu.uSpin, .012); draw(Lf, LTd, mTen); gl.uniform1f(lu.uSpin, .05); draw(Lf, LTb, mTen);
  if (typeof v122Draw === 'function') v122Draw(vd, 1);
  const Sp = P_SPR;
  gl.useProgram(Sp.p);
  gl.uniform1i(Sp.u.uMode, 2); gl.uniform1f(Sp.u.uDark, 1); gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_COLOR, gl.ZERO, gl.ONE); draw(Sp, LDk, mQuad);
  gl.uniform1f(Sp.u.uDark, 0); gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
  if (!NO.includes('w')) draw(Sp, LW, mQuad);
  if (!NO.includes('d')) { gl.uniform1i(Sp.u.uMode, 0); draw(Sp, LU, mQuad); }
  if (!NO.includes('p')) { gl.uniform1i(Sp.u.uMode, 1); draw(Sp, LP, mQuad); }
  if (!NO.includes('t')) { gl.uniform1i(Sp.u.uMode, 3); draw(Sp, DT, mQuad); }
  if (!NO.includes('a')) { gl.uniform1i(Sp.u.uMode, 4); draw(Sp, DPa, mQuad); }
  if (cockpit && flying()) {                                 // the glass, over everything outside
    gl.depthRange(0, .01); gl.useProgram(P_COCK.p); gl.bindVertexArray(VAC); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);   // glass adds its reflections and takes a little light away
    gl.drawElements(gl.TRIANGLES, mCock.ng, gl.UNSIGNED_SHORT, (mCock.n - mCock.ng) * 2); gl.depthRange(0, 1);
  }
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(VA0);
  if (T.ms) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.hdr.f);
    gl.blitFramebuffer(0, 0, tw, th, 0, 0, tw, th, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  }
  // bloom: blur down a chain of half-size targets, then add them back up
  const bl = T.bl;
  for (let i = 0; i < bl.length; i++) { const s = i ? bl[i - 1] : T.hdr; pass(P_BLUR, bl[i], s); gl.uniform2f(P_BLUR.u.uPx, 1 / s.w, 1 / s.h); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = bl.length - 2; i >= 0; i--) { const s = bl[i + 1]; pass(P_BLUR, bl[i], s); gl.uniform2f(P_BLUR.u.uPx, .5 / s.w, .5 / s.h); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  gl.disable(gl.BLEND);
  // star shafts
  const sw = G[3] * SUN[0] + G[7] * SUN[1] + G[11] * SUN[2], sx = G[0] * SUN[0] + G[4] * SUN[1] + G[8] * SUN[2], sy = G[1] * SUN[0] + G[5] * SUN[1] + G[9] * SUN[2];
  pass(P_RAY, T.ray, T.hdr);
  const sux = sw > .01 ? sx / sw * .5 + .5 : .5, suy = sw > .01 ? sy / sw * .5 + .5 : .5, sus = sm(.05, .5, sw);
  gl.uniform3f(P_RAY.u.uSunS, sux, suy, NO.includes('r') ? 0 : sus * Math.min(.9, .2 + fogD * 600) * (csU[0] ? .15 : 1));   // a close star is a surface to look at, not a searchlight   // dustier space, stronger shafts
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // tone-map into the destination
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(x, y, w, h);
  gl.useProgram(P_COMP.p); gl.uniform2f(P_COMP.u.uPx, 1 / tw, 1 / th); { const v = (k) => xr ? 0 : CFG[k], fb = v('fxBlur') * 1.1, fc = v('fxCA'), vig = xr ? (CFG.vrVig || 0) * (.4 + .6 * Math.min(1, bst)) : v('fxVig'); gl.uniform4f(P_COMP.u.uFx, fc ? fc * 1.9 : 0, v('fxGrain') * .09, mbx * fb, mby * fb); gl.uniform1f(P_COMP.u.uFs, fb * mbs); gl.uniform4f(P_COMP.u.uFy, v('fxScan'), CFG.fxBloom, vig, o2Hyp); gl.uniform4f(P_COMP.u.uFz, v('fxGlass'), 0, 0, 0); } gl.uniform3f(P_COMP.u.uJ, Math.max(jk, dbgJ, scE * .22) * .9, Math.max(tun, dbgT), jumpT + tm); { const fx = sFx * eRx + sFy * eRy + sFz * eRz, fy = sFx * eUx + sFy * eUy + sFz * eUz, fz = Math.max(.15, sFx * eFx + sFy * eFy + sFz * eFz), cl = (v) => Math.max(-.5, Math.min(1.5, v));   // where the ship's nose falls in this eye's picture
    gl.uniform2f(P_COMP.u.uJc, cl((fx / fz - tL) / (tR - tL)), cl((fy / fz - tB) / (tT - tB))); } gl.uniform3f(P_COMP.u.uFl, sux, suy, sux > -.2 && sux < 1.2 && suy > -.2 && suy < 1.2 ? sus * CFG.fxFlare * (csU[0] ? .2 : 1) : 0);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.hdr.t); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, bl[0].t); gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, T.ray.t);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  hudDraw(xr ? 1 / 6 : stereo ? .25 : 1);                     // the display goes on last, over the finished picture, so blur, grain and fringing never touch its text
}

// ---- VR: a headset through WebXR where there is one, otherwise a side-by-side stereo view ----
let xr = null, xrRef = null, xrFloor = 0, xrCal = null, xrNeedCal = 1, xrBlur = 0;
function xrRecenter() { xrNeedCal = 1; xrCal = null; }
function foveationLevel() { const v = CFG.vrFov || 0; return v >= .9 ? 1 : v >= .4 ? .66 : 0; }
function applyFoveation() { if (xrLayer && 'fixedFoveation' in xrLayer) { try { xrLayer.fixedFoveation = foveationLevel(); } catch (e) {} } }
function applyVrRate() {
  if (!xr || !xr.updateTargetFrameRate || !xr.supportedFrameRates) return;
  const rates = Array.from(xr.supportedFrameRates), want = CFG.vrHz || 72;
  if (!rates.length) return;
  let best = rates[0];
  for (const r of rates) if (Math.abs(r - want) < Math.abs(best - want)) best = r;
  xr.updateTargetFrameRate(best).catch(() => {});
}
function xrBuzz(strength, ms) {
  if (!xr || !CFG.vrHap) return;
  const s = Math.min(1, strength * (CFG.vrHap > 1 ? 1 : .45));
  for (const src of xr.inputSources) { try { const ha = src.gamepad && src.gamepad.hapticActuators && src.gamepad.hapticActuators[0]; if (ha && ha.pulse) ha.pulse(s, ms); } catch (e) {} }
}
let xrLayer = null;
async function vr(auto) {
  if (xr) { xr.end(); return; }
  let ok = 0;
  try { ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'); } catch {}
  if (ok) {
    try {
      await gl.makeXRCompatible();
      const feats = ['local-floor', 'hand-tracking'];
      const fv = foveationLevel();
      if (fv >= .9) feats.push('high-fixed-foveation-level'); else if (fv >= .4) feats.push('medium-fixed-foveation-level');
      const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: feats });
      const rs = CFG.vrRs == null ? 1 : CFG.vrRs, layer = new XRWebGLLayer(s, gl, { antialias: false, depth: false, stencil: false, framebufferScaleFactor: rs });
      xrLayer = layer; applyFoveation();
      s.updateRenderState({ baseLayer: layer });
      xrFloor = 0; xrNeedCal = 1; xrCal = null;
      try { xrRef = await s.requestReferenceSpace('local-floor'); xrFloor = 1; }
      catch (e) { xrRef = await s.requestReferenceSpace('local'); xrFloor = 0; }
      xrRef.addEventListener('reset', () => { xrNeedCal = 1; });
      s.addEventListener('visibilitychange', () => {
        const st = s.visibilityState;
        if (st === 'hidden' || st === 'visible-blurred') xrBlur = 1;
        else if (xrBlur) { xrBlur = 0; if (flying() && !jpOpen) pausePanel(); }
      });
      s.addEventListener('end', () => { xr = null; xrLayer = null; xFire = 0; requestAnimationFrame(frame); });
      xr = s; applyVrRate(); if (document.pointerLockElement) document.exitPointerLock();
      go(); s.requestAnimationFrame(frame);
      return;
    } catch (e) { console.warn(e); if (auto) return; tip('The headset did not start: ' + e.message); }
  }
  if (auto) return;   // the store app never falls back to side-by-side 3D: it stays on the menu
  stereo = !stereo; resize(); go();
  if (stereo) { tip(ok ? 'Side-by-side 3D' : 'No VR headset found: showing side-by-side 3D. Press V to leave.'); try { const r = document.documentElement.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } catch {} }
}
$('vr').onclick = () => vr();

const SYL = ['ka', 'zu', 'ren', 'vo', 'ix', 'tal', 'mer', 'yth', 'ano', 'bel', 'qua', 'dri', 'sol', 'ven', 'ur', 'eth'];
const NO = QS.get('no') || '';
let slow = 1, tun = 0, dbgJ = 0, dbgT = 0, hlY = 0, hlP = 0, hlF = null;
let slowTip = 0, last = 0, acc = 0, nf = 0, fps = 0, hold = 0, cool = 4000, hudN = 0;
const YS = () => Math.cos(pitch) < 0 ? -1 : 1;                // past vertical the ship is on its back, so left and right swap: this keeps the stick's sense
const curve = (v) => { const a = Math.min(1, Math.abs(v)) - .08; return a > 0 ? Math.sign(v) * a * Math.sqrt(a) : 0; };

let gpFire = 0, gpBoost = 0, thrustT = 0, snapL = 0, snapR = 0;
function readPad(dt) {
  gpFire = 0; gpBoost = 0;
  if (!navigator.getGamepads) return;
  const map = CFG.gp || { fire: 7, boost: 5 }, racer = CFG.padL !== 0;
  const fireB = racer ? (map.fire == null ? 7 : map.fire) : 7, boostB = racer ? (map.boost == null ? 5 : map.boost) : 6;
  const dead = (v) => Math.abs(v) < .18 ? 0 : v;
  for (const gp of navigator.getGamepads()) {
    if (!gp || !gp.connected) continue;
    const ax = dead(gp.axes[0] || 0), ay = dead(gp.axes[1] || 0), ry = dead(gp.axes[3] || 0);
    if (!CFG.ctl) { yaw += YS() * ax * dt * 1.45; pitch -= IY() * ay * dt * 1.2; dyaw += ax * dt * 1.45; }
    else { pitch -= IY() * ay * dt * 1.15; rollIn += ax * dt * 1.5; }
    thr = Math.max(-.25, Math.min(1, thr - ry * dt * .85));
    if (gp.buttons[fireB] && (gp.buttons[fireB].pressed || gp.buttons[fireB].value > .45)) gpFire = 1;
    if (gp.buttons[boostB] && (gp.buttons[boostB].pressed || gp.buttons[boostB].value > .45)) gpBoost = 1;
  }
}
function frame(now, xf) {
  if (!xf !== !xr) return;                                   // a callback left over from the other display loop
  (xr || window).requestAnimationFrame(frame);
  frameDraws = draws; frameVerts = verts; draws = 0; verts = 0;
  const raw = (now - last) / 1000; last = now;
  const rdt = Math.min(.05, Math.max(.001, raw)); btT = Math.max(0, btT - rdt); slow += (((jpOpen || invOpen || PIP.big) && flying() ? .12 : btT > 0 ? .14 + .86 * Math.pow(1 - btT / btMax, 2.4) : 1) - slow) * Math.min(1, rdt * (btT > 0 ? 14 : 4));
  const dt = rdt * slow; tm += dt;                             // with a panel open the world all but stops, and eases back when it closes
  acc += raw; nf++;
  if (nf >= 40) {                                            // hold the frame rate by trading resolution
    const a = acc / nf * 1000; fps = 1000 / a; acc = 0; nf = 0;
    if (!TEST && !document.hidden && !xr) {
      if (a > 21 && S > .45) { S = Math.max(.45, S * .86); hold = now + (cool = Math.min(cool * 2, 120000)); resize(); }
      else if (LV < 2 && !started && tm > 4 && (a > 45 || a > 30 && S <= .45)) { keep('esLevel', LV + 1); location.reload(); }   // far too slow: step the detail down while the menu is still up
      else if (LV < 2 && a > 34 && S <= .45 && !slowTip) { slowTip = 1; tip('Running slow: try a lower detail level in the menu', 8000); }
      else if (a < 17.6 && S < 1 && now > hold) { S = Math.min(1, S * 1.1); hold = now + 3000; resize(); }
    }
  }
  const fly = flying(); hudTick(now);

  // steer and throttle
  const eff = (.48 + .52 * Math.min(1, ST.hull / 78)) * (ST.hull < 32 ? .74 : 1);          // a damaged hull gives less thrust, and a failing one slurs the controls
  let ms = 0, mu = 0, boost = 0, fwd = 9;
  if (fly) {
    const fw = K.KeyW || K.ArrowUp ? 1 : 0, bk = K.KeyS || K.ArrowDown ? 1 : 0, rt = K.KeyD || K.ArrowRight ? 1 : 0, lf = K.KeyA || K.ArrowLeft ? 1 : 0;
    if (CFG.ctl) {                                                   // space sim: W S pitch, A D roll, Q E throttle, Z X altitude
      thr = Math.max(-.25, Math.min(1, thr + ((K.KeyE ? 1 : 0) - (K.KeyQ ? 1 : 0)) * dt * .75));
      pitch -= IY() * (fw - bk) * dt * 1.2; rollIn += (rt - lf) * dt * 1.9; mu = (K.KeyX ? 1 : 0) - (K.KeyZ ? 1 : 0);
    } else {                                                         // standard: W S throttle, A D slide, Q E down and up
      thr = Math.max(-.25, Math.min(1, thr + (fw - bk) * dt * .75));
      ms = rt - lf; mu = (K.KeyE ? 1 : 0) - (K.KeyQ ? 1 : 0);
    }
    boost = K.ShiftLeft || K.ShiftRight ? 1 : 0;
    if (tn) { thr = 1; boost = tn > 1 ? 1 : 0; yaw += YS() * tdx * dt * 2.4; pitch -= IY() * tdy * dt * 2.4; dyaw += tdx * dt * 2.4; }
    if (steer && !locked) { const sx = curve(mxn) * dt * 1.9; yaw += YS() * sx; pitch -= IY() * curve(myn) * dt * 1.6; dyaw += sx; }
    gpFire = 0; gpBoost = 0; if (!xr) readPad(dt);
    if (xr) { xFire = 0; for (const src of xr.inputSources) {             // Touch Plus. Sticks are axes 2 and 3. Triggers fire, grips boost. The steer hand never gives up the nose.
      const gp = src.gamepad; if (!gp || (src.handedness !== 'left' && src.handedness !== 'right')) continue;
      const consumed = xrPad(src, gp);
      const ax = Math.abs(gp.axes[2] || 0) < .12 ? 0 : gp.axes[2], ay = Math.abs(gp.axes[3] || 0) < .12 ? 0 : gp.axes[3];
      const trig = gp.buttons[0] && (gp.buttons[0].pressed || gp.buttons[0].value > .65);
      const grip = gp.buttons[1] && (gp.buttons[1].pressed || gp.buttons[1].value > .4);
      if (trig && !jpOpen) xFire = 1;
      if (grip && !jpOpen) boost = 1;
      if (consumed) continue;
      const onSteer = src.handedness === (CFG.vrHand ? 'right' : 'left');
      if (onSteer) {
        if ((CFG.vrTurn || 0) > 0) {
          const step = CFG.vrTurn === 2 ? .78 : .52, held = src.handedness === 'left' ? snapL : snapR;
          if (ax > .65 && !held) { yaw += YS() * step; if (src.handedness === 'left') snapL = 1; else snapR = 1; xrBuzz(.4, 28); }
          else if (ax < -.65 && !held) { yaw -= YS() * step; if (src.handedness === 'left') snapL = 1; else snapR = 1; xrBuzz(.4, 28); }
          else if (Math.abs(ax) < .3) { if (src.handedness === 'left') snapL = 0; else snapR = 0; }
          pitch -= IY() * ay * dt * 1.05;
        } else { yaw += YS() * ax * dt * 1.35; pitch -= IY() * ay * dt * 1.15; dyaw += ax * dt * 1.35; }
      } else { thr = Math.max(-.25, Math.min(1, thr - ay * dt * .85)); ms += ax; }
    } if (typeof xrPauseWatch === 'function') xrPauseWatch(dt); }
    if (gpBoost) boost = 1;
    fwd = thr * 230 * eff * (1 + .12 * upLv('eng'));
  } else { yaw += dt * .018; gpFire = 0; }
  if (ST.hull < 25 || ST.fuel <= 0) boost = 0;
  if (fly && ST.fuel <= 0) fwd *= .18;                              // dry tanks: emergency thrusters only
  bst += (boost - bst) * (1 - Math.exp(-dt * 2.5));
  bHold = boost && fly ? bHold + dt : 0; bRamp = Math.min(1, Math.max(0, (bHold - 1) / 5));   // keep holding boost and it keeps building, to the top of the range
  bOd = SYS.atm ? 0 : Math.min(1, Math.max(0, (bHold - 7) / 18)); if (bOd > 0 && !odOn && !drift) { odOn = 1; pop('OVERDRIVE · ASSIST OFF', '#ffb347'); } if (!boost) odOn = 0;   // hold on past full boost: faster and faster, and the rocks are yours to dodge
  // the ship's attitude is a free rotation: every input turns it about its own axes, so it can roll, loop and fly inverted; code that points the ship sets yaw and pitch and raises snap
  roll += ((CFG.ctl ? 0 : -dyaw / dt * .1 - ms * .14) - roll) * (1 - Math.exp(-dt * 4)); roll = Math.max(-.5, Math.min(.5, roll));   // standard flight banks into turns
  dyaw = 0; trauma = Math.max(0, trauma - dt * 1.6);
  if (!QA || snap || !CFG.ctl) { QA = qYP(yaw, pitch); if (!QAs || snap) QAs = QA.slice(); rollIn = 0; yawL = yaw; pitchL = pitch; }
  else { const dY = yaw - yawL, dP = pitch - pitchL; if (dY || dP || rollIn) QA = qn(qmul(qmul(qmul(QA, qax(0, 1, 0, -dY)), qax(1, 0, 0, dP)), qax(0, 0, 1, -rollIn))); }
  if (CFG.ctl) { rollIn = 0; const F = qv(QA, 0, 0, -1); pitch = Math.asin(Math.max(-1, Math.min(1, F[1]))); yaw = Math.atan2(F[0], -F[2]); yawL = yaw; pitchL = pitch; }
  // Below the clouds the wings ease level, shortest way, without pitching the long way round or reversing mid-turn.
  // On entry this takes several seconds, like a plane settling. In a headset it keeps a gentle hand on the roll.
  if (fly && SYS.atm && QA) {
    if (!atmWas) { rightT = 6.2; rollBias = 0; }
    if (rightT > 0 || xr) {
      const F = qv(QA, 0, 0, -1), y = Math.atan2(F[0], -F[2]);
      let p = Math.asin(Math.max(-1, Math.min(1, F[1])));
      const pCap = rightT > 0 ? .95 : 1.15;
      const pWant = rightT > 0 ? p + (levelAim - p) * .18 : p;
      const pT = Math.max(-pCap, Math.min(pCap, pWant));
      let target = qYP(y, pT);
      let dot = QA[0] * target[0] + QA[1] * target[1] + QA[2] * target[2] + QA[3] * target[3];
      if (dot < 0) { target = [-target[0], -target[1], -target[2], -target[3]]; dot = -dot; }
      if (dot < .08) { if (!rollBias) rollBias = 1; target = qn(qmul(target, qax(0, 0, 1, rollBias * .2))); }
      const rate = rightT > 0 ? .62 : .38;
      QA = qslerp(QA, target, 1 - Math.exp(-dt * rate));
      const F2 = qv(QA, 0, 0, -1);
      pitch = Math.asin(Math.max(-1, Math.min(1, F2[1]))); yaw = Math.atan2(F2[0], -F2[2]); yawL = yaw; pitchL = pitch; rollIn = 0;
    }
  }
  rightT = Math.max(0, rightT - dt); atmWas = fly && SYS.atm ? 1 : 0;
  { const tk = 1 - Math.exp(-dt * (rightT > 0 ? 2.6 : 6.5)); QAs = qslerp(QAs, QA, tk); }                              // the ship turns with a little lag: it has mass (more gently while righting)
  const sh = trauma * trauma * .02 + (xr ? 0 : bst * bst * .0035), Qb = roll ? qmul(QAs, qax(0, 0, 1, roll)) : QAs, Qv = sh > 0 ? qmul(Qb, qmul(qax(0, 1, 0, Math.sin(tm * 71) * sh), qax(1, 0, 0, Math.sin(tm * 93 + 1) * sh))) : Qb;
  { const R = qv(Qv, 1, 0, 0), U = qv(Qv, 0, 1, 0), F = qv(Qv, 0, 0, -1); sRx = R[0]; sRy = R[1]; sRz = R[2]; sUx = U[0]; sUy = U[1]; sUz = U[2]; sFx = F[0]; sFy = F[1]; sFz = F[2];
    spit = Math.asin(Math.max(-1, Math.min(1, F[1]))); syaw = Math.atan2(F[0], -F[2]); }
  fwd += bst * 400 * eff * (1 + .55 * bRamp + .85 * bOd * (2 - bOd) * (drift ? 0 : 1));                                            // local rush tops out near 620; overdrive (held 7 s+) climbs toward ~960 over the next 18 s; the long-range drive carries you across the system                                          // Shift is thrust on its own: no need to hold forward
  const k = 1 - Math.exp(-dt * (bst > .3 ? 1.5 : 1.05));
  vx += (sFx * fwd + (sRx * ms + sUx * mu) * 45 - vx) * k; vy += (sFy * fwd + (sRy * ms + sUy * mu) * 45 - vy) * k; vz += (sFz * fwd + (sRz * ms + sUz * mu) * 45 - vz) * k;
  if (fly) rockAssist(dt);
  px += vx * dt; py += vy * dt; pz += vz * dt;
  cHit = 0; collide(LTi, titanAt); collide(LH, hugeAt); collide(LB, bigAt);
  if (cHit) {                                                // a real knock: the ship rebounds, shakes, and above a gentle touch the hull pays for it
    const vn = vx * cNx + vy * cNy + vz * cNz;
    if (vn < 0) {
      vx -= cNx * vn * 1.45; vy -= cNy * vn * 1.45; vz -= cNz * vn * 1.45; vx *= .82; vy *= .82; vz *= .82; trauma = Math.min(1, trauma - vn / 90);
      if (vn < -16) { hurtSrc = 'rock'; hurtSrcT = tm; hitFromX = px - cNx * 30; hitFromY = py - cNy * 30; hitFromZ = pz - cNz * 30; hurt(Math.min(35, (-vn - 16) * .12)); thud(-vn); for (let i = 0; i < 12; i++) { rdir(); spark(px - cNx * 3, py - cNy * 3, pz - cNz * 3, vx + rd[0] * 30, vy + rd[1] * 30, vz + rd[2] * 30, .3 + Math.random() * .5, .1 + .15 * Math.random(), 0, 3.5, 1.8, .5, 0); } }
    }
  }
  if (ST.hull < 50) ST.hull = Math.min(50, ST.hull + dt * .045); // a quiet ship creeps back toward half; real plate comes from ferrite or a yard
  const speed = Math.hypot(vx, vy, vz);

  simulate(dt, fly);

  // the jump: the drive winds up, space stretches, and the new system is there when the flash clears
  if (jumpTo) {
    // wind-up (the view stretches and the stars smear), the tunnel (the new place is loaded behind it), and the drop out
    jumpT += rdt; jk = sm(0, 1.6, jumpT) * (1 - sm(3.3, 4.1, jumpT)); tun = sm(1.4, 2, jumpT) * (1 - sm(3.1, 3.7, jumpT));
    trauma = Math.min(1, trauma + rdt * (1.2 * jk + 1.5 * tun)); thr = Math.max(thr, .5 * jk);
    if (jumpT > 2.5 && !jumped) { jumped = 1; arrive(jumpTo.sec, jumpTo.loc); flash = TEST ? 0 : .3; trauma = 1; if (AC && AC.state === 'running') { note(32, AC.currentTime, .18, 'sine', 2.5, 0); burst(AC.currentTime, 1.4, .2, 700, 50, 'lowpass'); } }
    if (jumpT > 4.1) { jumpTo = null; jk = 0; tun = 0; }
  }
  // the cockpit rides on the ship: it lags behind hard acceleration, leans into turns, and the stick follows your hand
  const il = 1 / dt, axl = ((vx - ovx) * sRx + (vy - ovy) * sRy + (vz - ovz) * sRz) * il, ayl = ((vx - ovx) * sUx + (vy - ovy) * sUy + (vz - ovz) * sUz) * il, azl = ((vx - ovx) * sFx + (vy - ovy) * sFy + (vz - ovz) * sFz) * il;
  const yr = Math.max(-3, Math.min(3, (syaw - oyaw) * il)), pr = Math.max(-3, Math.min(3, (spit - opit) * il)), ck = Math.min(1, dt * 5), cl = (v, a) => Math.max(-a, Math.min(a, v));
  ovx = vx; ovy = vy; ovz = vz; oyaw = syaw; opit = spit;
  ckx += (cl(-axl * .0015, .12) - yr * .05 - ckx) * ck; cky += (cl(-ayl * .0015, .1) + pr * .04 - cky) * ck; ckz += (cl(-azl * .0009, .22) - jk * .25 - ckz) * ck;
  ckr += (cl(-yr * .035, .09) - ckr) * ck; stx += (cl(-yr * .35, .45) - stx) * Math.min(1, dt * 9); sty += (cl(-pr * .35, .4) - sty) * Math.min(1, dt * 9);
  palEase = Math.max(0, palEase - rdt * .25); const pk = snap && !palEase ? 1 : Math.min(1, dt * (palEase ? .55 : 2));   // after a climb-out the colours drift over a few seconds instead of cutting
  REG = SYS.t;
  for (let i = 0; i < 12; i++) pal[i] += (SYS.pal[i] - pal[i]) * pk;
  for (let i = 0; i < 4; i++) skyw[i] += (SYS.sky[i] - skyw[i]) * pk;
  fogD += ((.00024 + .0012 * sm(.42, .75, fG(px, py, pz))) * SYS.a.fog + fogX - fogD) * pk; snap = 0;
  flash *= Math.exp(-dt * 2.2);
  energy += (Math.min(1, speed / 420) * .8 + combat * .3 - energy) * Math.min(1, dt * 2);

  for (let i = 0; i < LAYERS.length; i++) upd(LAYERS[i]);

  // views
  const fov = Math.tan((64 + 6 * Math.abs(thr) + 30 * bst * bst + 6 * bRamp + 34 * jk) * Math.PI / 360);
  if (xr) {
    const pose = xf.getViewerPose(xrRef), bl = xr.renderState.baseLayer;
    if (pose) for (const v of pose.views) {
      const vp = bl.getViewport(v), m = v.transform.matrix, p = v.projectionMatrix, hp = pose.transform.position, ep = v.transform.position;
      // the headset's orientation rides on the ship's: its axes are expressed in the ship's right / up / back
      eRx = sRx * m[0] + sUx * m[1] - sFx * m[2]; eRy = sRy * m[0] + sUy * m[1] - sFy * m[2]; eRz = sRz * m[0] + sUz * m[1] - sFz * m[2];
      eUx = sRx * m[4] + sUx * m[5] - sFx * m[6]; eUy = sRy * m[4] + sUy * m[5] - sFy * m[6]; eUz = sRz * m[4] + sUz * m[5] - sFz * m[6];
      eFx = -(sRx * m[8] + sUx * m[9] - sFx * m[10]); eFy = -(sRy * m[8] + sUy * m[9] - sFy * m[10]); eFz = -(sRz * m[8] + sUz * m[9] - sFz * m[10]);
      tL = (p[8] - 1) / p[0]; tR = (p[8] + 1) / p[0]; tB = (p[9] - 1) / p[5]; tT = (p[9] + 1) / p[5];
      const ipd = CFG.vrIpd == null ? 1 : CFG.vrIpd, ox = (ep.x - hp.x) * 6 * ipd, oy = (ep.y - hp.y) * 6 * ipd, oz = (ep.z - hp.z) * 6 * ipd;   // eyes set wide apart, so the asteroids nearby have depth. View scale stays near 1 so it never fights the headset's IPD.
      eox = sRx * ox + sUx * oy - sFx * oz; eoy = sRy * ox + sUy * oy - sFy * oz; eoz = sRz * ox + sUz * oy - sFz * oz;
      { if (xrNeedCal || !xrCal) { xrCal = { x: hp.x, y: hp.y, z: hp.z }; xrNeedCal = 0; }
        const lift = (CFG.vrH || 0) * CKM;
        const dx = (ep.x - xrCal.x) * CKM, dy = (ep.y - xrCal.y) * CKM, dz = (ep.z - xrCal.z) * CKM;
        const cx = Math.max(-2.6, Math.min(2.6, dx)), cz = Math.max(-1.4, Math.min(3.4, .12 + dz));
        const cy = Math.max(-.72, Math.min(1.28, .22 + dy + lift));
        cex = sRx * cx + sUx * cy - sFx * cz; cey = sRy * cx + sUy * cy - sFy * cz; cez = sRz * cx + sUz * cy - sFz * cz; }
      eye(bl.framebuffer, vp.x, vp.y, vp.width, vp.height, Math.round(vp.width * .8), Math.round(vp.height * .8));
    }
  } else {
    eRx = sRx; eRy = sRy; eRz = sRz; eUx = sUx; eUy = sUy; eUz = sUz; eFx = sFx; eFy = sFy; eFz = sFz;
    { const ty = hlF != null ? hlF[0] : K.Slash ? 3.1 : ((K.Period ? 1 : 0) - (K.Comma ? 1 : 0)) * 1.75, tp = hlF != null ? hlF[1] : 0, k = Math.min(1, rdt * 6); hlY += (ty - hlY) * k; hlP += (tp - hlP) * k;   // glance round the cabin
      if (Math.abs(hlY) + Math.abs(hlP) > .002) { const cy2 = Math.cos(hlY), sy2 = Math.sin(hlY), cp2 = Math.cos(hlP), sp2 = Math.sin(hlP);
        eFx = sFx * cy2 * cp2 + sRx * sy2 * cp2 + sUx * sp2; eFy = sFy * cy2 * cp2 + sRy * sy2 * cp2 + sUy * sp2; eFz = sFz * cy2 * cp2 + sRz * sy2 * cp2 + sUz * sp2;
        eRx = sRx * cy2 - sFx * sy2; eRy = sRy * cy2 - sFy * sy2; eRz = sRz * cy2 - sFz * sy2;
        eUx = eRy * eFz - eRz * eFy; eUy = eRz * eFx - eRx * eFz; eUz = eRx * eFy - eRy * eFx; } }
    if (stereo) {
      const hw = W >> 1, a = hw / H, t = Math.tan(45 * Math.PI / 180); tT = t; tB = -t; tR = t * a; tL = -t * a;
      for (let e = 0; e < 2; e++) { const o = (e ? .25 : -.25); eox = sRx * o; eoy = sRy * o; eoz = sRz * o; eye(null, e * hw, 0, hw, H, Math.round(hw * S), Math.round(H * S)); }
    } else { tT = fov; tB = -fov; tR = fov * W / H; tL = -tR; eox = eoy = eoz = 0; eye(null, 0, 0, W, H, W, H); }
  }

  // moments for the recorded score: a long quiet drift, and a long fast run (which ends when you slow down)
  if (fly && speed < 30 && combat < .1) { if ((calmT += dt) > 45) { calmT = 0; cue('calm'); } } else calmT = 0;
  if (speed > 380) { if ((fastT += dt) > 9) { fastT = 0; cue('surge'); } } else { fastT = 0; if (cueName === 'surge') { cueStop(); cueName = ''; } }
  {                                                          // a small marker shows where the gate is, and how far
    const e = $('gm'), X = -px, Y = -py, Z = -pz, d = Math.hypot(X, Y, Z);
    if (!fly || xr || stereo || jpOpen || SYS.atm || veil > .4 || d < GATE * 1.6) e.style.opacity = 0;
    else {
      let w = G[3] * X + G[7] * Y + G[11] * Z, x = G[0] * X + G[4] * Y + G[8] * Z, y = G[1] * X + G[5] * Y + G[9] * Z;
      if (w > 0) { x /= w; y /= w; }
      if (w <= 0 || Math.abs(x) > .92 || Math.abs(y) > .86) { const k = 1 / Math.max(Math.abs(x) / .92, Math.abs(y) / .86, 1e-6) * (w <= 0 ? 1 : 1); x *= k; y *= k; if (w <= 0) { const l = Math.max(Math.abs(x) / .92, Math.abs(y) / .86) || 1; x /= l; y /= l; } }
      e.style.opacity = .85; e.style.left = (x * 50 + 50) + '%'; e.style.top = (50 - y * 50) + '%'; e.textContent = d > 1000 ? 'GATE ' + (d / 1000).toFixed(1) + ' km' : 'GATE ' + Math.round(d) + ' m';
    }
  }
  if (windG) {
    const t = AC.currentTime;
    const at = fly ? Math.abs(thr) : 0;                      // thrust is a low rumble that swells with throttle and boost; no whine
    windG.gain.setTargetAtTime(Math.min(.9, .1 * at + .75 * bst) * CFG.vEng, t, .25); windF.frequency.setTargetAtTime(70 + 50 * at + 170 * bst, t, .3);
    if (boostG) { boostG.gain.setTargetAtTime(Math.min(.2, bst * bst * .26) * CFG.vEng, t, .16); boostF.frequency.setTargetAtTime(260 + bst * 980, t, .2); }
    subG.gain.setTargetAtTime((.035 * at + .22 * bst) * CFG.vEng, t, .3); subO.frequency.setTargetAtTime(34 + 18 * bst, t, .4);
    padF.frequency.setTargetAtTime(240 + energy * 1100, t, .5);
  }
  if (++hudN >= 12) {
    hudN = 0;
    $('sec').innerHTML = `<span>${SYS.name} · ${SYS.star}</span><b>${SYS.locs[SYS.loc].name}</b>${Math.round(speed)} u/s${ST.hull < 99.5 ? ' · hull ' + (ST.hull | 0) + '%' : ''}`;
    $('tf').style.transform = `scaleY(${Math.abs(thr)})`; $('tf').className = thr < 0 ? 'rev' : bst > .3 ? 'bst' : '';
    if (stats) $('i').textContent = `${fps.toFixed(0)} fps  ${frameDraws} draws  ${(frameVerts / 1000).toFixed(0)}k verts  ${T.w}×${T.h}  scale ${S.toFixed(2)}  detail ${['High', 'Medium', 'Low'][LV]}\nasteroids ${TV[0].n + TV[1].n + TV[2].n} titans + ${HV[0].n + HV[1].n + HV[2].n} + ${BF[0].n + BF[1].n + BF[2].n + BN[0].n + BN[1].n + BN[2].n} + ${SV[0].n + SV[1].n + SV[2].n}  crystals ${LC.n}  tendrils ${LTd.n + LTb.n}  geodes ${LG.n}\njellyfish ${LJ.n + LQ.n}  rays ${LY.n}  minnows ${LM.n}  leviathans ${LWh.n}  serpents ${LSp.n}\nstations ${RV[0].n + RV[1].n} + ${MV[0].n + MV[1].n} mega  rubble ${DC[0].n + DC[1].n}  broken ${broken}\nposition ${px.toFixed(0)} ${py.toFixed(0)} ${pz.toFixed(0)}`;
  }
}

arrive(ST.sec, ST.loc, 1);
resize();
window.ES = { warpLook: (a, b) => { dbgJ = a; dbgT = b; }, zero: (i) => { const L = LAYERS[i]; L.n = 0; for (const s of L.slaves) s.n = 0; return LAYERS.length; }, dbg: (z) => { if (z) for (let i = 0; i < 3; i++) SYS.pl[i * 4 + 3] = 0; return Array.from(SYS.pl).map((v) => +v.toFixed(2)).concat(Array.from(SYS.pa).map((v) => +v.toFixed(2))); },
  build: () => BUILD, perf: () => ({ fps: +fps.toFixed(1), draws: frameDraws, verts: frameVerts, w: W, h: H, scale: +S.toFixed(2), lv: LV }), gen: () => ({ name: SYS.name, star: SYS.star, temp: SYS.temp | 0, fac: SYS.fac, danger: SYS.danger, belt: SYS.belt, dead: !!SYS.dead, planets: (SYS.planets || []).filter((p) => p.type !== 'none').map((p) => ({ name: p.name, type: p.type, rare: p.rare, au: p.orbit, moons: p.moons, anomaly: p.anomaly || '' })) }), cabin: () => ({ nv: mCock.nv, cb: mCock.cb, qt: mCock.qt, n: mCock.n, ng: mCock.ng }), newGame: newUniverse, goto: (sec, loc) => arrive(sec, loc || 0, 1), market: marketPanel, ph: (t) => { SYS.ph = t; SYS.pq = [sFx, sFy, sFz]; }, bh: () => { SYS.sky[0] = 1; pitch = Math.asin(-.22); yaw = Math.atan2(.58, -.78); snap = 1; }, seeNpc: (i) => { const a = NPCS.filter((q) => !q.big && q.var === i)[0]; if (!a) return -1; px = a.x + 22; py = a.y + 7; pz = a.z + 22; const dx = a.x - px, dy = a.y - py, dz = a.z - pz, l = Math.hypot(dx, dy, dz); pitch = Math.asin(dy / l); yaw = Math.atan2(dx, -dz); snap = 1; vx = vy = vz = 0; thr = 0; return a.var; }, linger: () => { for (let i = 0; i < 90; i++) lingerTick(.05); return [lingT, lingId, jpOpen]; }, tp: (x, y, z) => { px = x; py = y; pz = z; vx = vy = vz = 0; thr = 0; }, navCur, interact, map: starMap, drift: driftToggle, near: (k, f) => { const P = sysP[k]; sysS = [P[0] * f, P[1] * f, P[2] * f]; }, dsys: () => [sysS.map((v) => v | 0), driftV | 0, +SYS.pl[3].toFixed(3), SYS.atm, +veil.toFixed(2)], aim: (k, s) => { const d = SYS.pl, q = s || 1; pitch = Math.asin(q * d[k * 4 + 1]); yaw = Math.atan2(q * d[k * 4], -q * d[k * 4 + 2]); snap = 1; }, good: goodPanel, sc: (k, t) => { scP = k; scT = t; }, scOut: (t) => { scOut = t; vy = 120; thr = 1; }, host: (v) => { hostLv = v; npcSpawn(); }, rp: () => ST.rp, head: (y, p) => { hlF = y == null ? null : [y, p || 0]; }, nav: () => NAV.map((n) => n.id), npcs: () => NPCS.length, journal: journalPanel, board: boardPanel, hail: () => hailPanel(NPCS[0]), cycle: navCycle, atm: () => arrive(SYS.sec, SYS.locs.findIndex((l) => l.atm), 1), vrPanel: (v) => { hudForce = v; }, jt: () => [jumpT, !!jumpTo, SYS.loc, SYS.name, slow], system: describe, on: (f) => hooks.push(f), kind: (t) => { for (let x = 1; x < 400; x++) if ((sysIdAt(x, 0, 0) & 7) === t) return arrive([x, 0, 0], 0, 1); }, place: (t) => { const l = SYS.locs.find((q) => q.t === t); if (l) arrive(SYS.sec, l.i, 1); return !!l; }, startJump, gatePanel, logPanel, tradePanel, closePanel, hull: () => ST.hull, beacon: () => { px = bcn[0] + 200; py = bcn[1]; pz = bcn[2]; }, trader: () => trader, go, vr, cock: setCock, thr: (v) => { thr = v; }, key: (c, v) => { K[c] = v; }, look: (y, p) => { yaw = y; pitch = p; snap = 1; }, at: (x, y, z) => { px = x; py = y; pz = z; snap = 1; }, stereo: (v) => { stereo = v; resize(); },
  jelly: (d = 60, s = 0) => seek(LJ, swarmAt, d, s), rock: (d) => seek(LH, hugeAt, d), big: (d) => seek(LB, bigAt, d), titan: (d) => seek(LTi, titanAt, d), geode: (d = 40) => seek(LG, geodeAt, d),
  fleet: (d = 60) => seek(LF, cellHas(20, SYS.a.fl * .6), d), frig: (d = 1) => seek(LFr, cellHas(21, SYS.a.fr * .7), d), siph: (d = 40) => seek(LDs, cellHas(24, SYS.a.dr * .13 + .008), d), spark: (d = 40) => seek(LDe, cellHas(25, SYS.a.dr * .13 + .008), d), inv: (m) => invShow(m), closeStar: (sc, giant, rad) => { bigStarsSet(); csU = [rad || .2, sc, 1.3, giant ? 1 : 0]; csC = giant ? [1, .34, .1] : CSC[sc]; yaw = Math.atan2(SUN[0], -SUN[2]); pitch = Math.asin(SUN[1]); snap = 1; }, bigLook: (i, ty) => { bigStarsSet(); if (ty != null) bsS[i * 4 + 3] = ty; const x = bsS[i * 4], y = bsS[i * 4 + 1], z = bsS[i * 4 + 2]; yaw = Math.atan2(x, -z); pitch = Math.asin(y); snap = 1; return [bsS[i * 4 + 3], bsC[i * 4 + 3]]; }, musMeter: () => { if (!SC.an) { SC.an = AC.createAnalyser(); SC.an.fftSize = 2048; SC.lim.connect(SC.an); } if (!SC.mi) { const b = new Float32Array(2048); SC.mm = { pk: 0, ss: 0, n: 0 }; SC.mi = setInterval(() => { SC.an.getFloatTimeDomainData(b); for (const x of b) { SC.mm.pk = Math.max(SC.mm.pk, Math.abs(x)); SC.mm.ss += x * x; SC.mm.n++; } }, 20); } const r = { pk: +SC.mm.pk.toFixed(3), rms: +Math.sqrt(SC.mm.ss / Math.max(1, SC.mm.n)).toFixed(3), sec: SC.sec }; SC.mm = { pk: 0, ss: 0, n: 0 }; return r; }, musSec: (s) => { SC.sec = s; SC.secBar = 0; SC.secLen = SECS[s].len; }, jumpTest: (l) => startJump({ sec: SYS.sec, loc: l == null ? (SYS.loc + 1) % SYS.locs.length : l }), mus: () => { if (!SC.an && SC.lim) { SC.an = AC.createAnalyser(); SC.an.fftSize = 2048; SC.lim.connect(SC.an); } const T = SC.trk, b = new Float32Array(2048); let pk = 0, rms = 0; if (SC.an) { SC.an.getFloatTimeDomainData(b); for (const x of b) { pk = Math.max(pk, Math.abs(x)); rms += x * x; } rms = Math.sqrt(rms / 2048); } return { sec: SC.sec, bar: SC.bar, secBar: SC.secBar, e: +energy.toFixed(2), bpm: T && T.bpm, mode: T && T.mode, style: T && T.style, root: T && T.root, pk: +pk.toFixed(3), rms: +rms.toFixed(3), ac: AC && AC.state }; }, vel: (s) => { vx = sFx * s; vy = sFy * s; vz = sFz * s; bst = 1; }, bloomNow: () => { bloomT = 0; }, life: (cmd) => { if (cmd === 'call') { cmT = 0; } if (cmd === 'near' && CM) { const rx = sFy * sUz - sFz * sUy, rz = sFx * sUy - sFy * sUx; CM.a.x = px + rx * 75 + sFx * 150; CM.a.y = py + 12 + sFy * 150; CM.a.z = pz + rz * 75 + sFz * 150; CM.a.fx = sFx; CM.a.fy = sFy; CM.a.fz = sFz; } if (cmd === 'talk' && CM && CM.ph !== 'offer') CM.t = 99; if (cmd === 'esc' && CM) { for (let i = 0; i < 60 && CM.off.ty !== 'escort'; i++) CM.off = mkOffer(CM.ch); } if (cmd === 'accept') cmAccept(); if (CM && /^arc:/.test(cmd)) { const [, id, st] = cmd.split(':'); CM.ch.arc = { id, step: +st }; if (id === 'rival') CM.ch.raider = 1; CM.off = mkOffer(CM.ch); } if (CM && /^ty:/.test(cmd)) { const w = cmd.slice(3); for (let i = 0; i < 200 && !(CM.off.ty === w && (w !== 'job' || /scan|bounty|crate/i.test(CM.off.text))); i++) CM.off = mkOffer(CM.ch); } if (cmd === 'hurt') for (const a of NPCS) if (a.role === 5 && !a.dead) a.hp = a.hpM * .2; if (cmd === 'raid') cmAmbush(2, 'player'); if (cmd === 'amb' && ESC) { ESC.amb = 0; } return JSON.stringify({ cm: CM && { ph: CM.ph, ty: CM.off.ty, who: CM.ch.n, ship: CM.ch.sh, d: Math.round(Math.hypot(CM.a.x - px, CM.a.y - py, CM.a.z - pz)) }, esc: ESC && { n: ESC.ships.filter((s) => !s.dead).length, wave: ESC.wave, raiders: ESC.raiders.filter((r) => !r.dead).length, wait: ESC.wait }, off: CM && CM.off.text, npc: NPCS.filter((a) => a.role === 5 && !a.dead).map((a) => a.name + (a.fled ? '(fled)' : '') + (a.rival ? '(rival)' : '')).join(','), ally: NPCS.filter((a) => a.ally).length, cast: Object.keys(ST.cast || {}).length, comm: commS }); }, o2: (h) => { if (h != null) { o2Hyp = h; o2Out = 30; ST.o2 = 0; } return [ST.o2, o2Hyp, o2Out, flying()]; }, pip: (tab) => { if (tab != null) { PIP.tab = tab; if (!PIP.big) pipOpen(); } return [flying(), jpOpen, invOpen, PIP.big]; }, bh: (h) => { bHold = h; return [bRamp, bOd]; }, sys: () => ({ bl: BLOOMS.length, grv: grooveAt(bar), arp: ARPS.indexOf(arpAt(bar)), chord: chordAt(bar), ac: AC && AC.state, spd: Math.round(Math.hypot(vx, vy, vz)), thr: raThr && { t: raThr.t | 0, m: raThr.m | 0, R: raThr.R | 0 }, hull: ST.hull, fuel: ST.fuel, wen: ST.wen, spice: ST.spice, cargo: ST.cargo.slice(), warn: sysWarn, sw: swOn, slow, btT }), setSys: (o) => { if (o.cargo) { o.cargo.forEach((v, i) => cargo[i] = v); delete o.cargo; } Object.assign(ST, o); }, drone: (d = 40) => seek(LDr, cellHas(22, SYS.a.dr * .16 + .008), d),
  whale: (d = 900) => seek(LWh, cellHas(17, .55), d), serpent: (d = 250) => seek(LSp, cellHas(18, .4), d), colossus: (d = 900) => seek(LQ, cellHas(16, .4), d), ray: (d = 300) => seek(LY, cellHas(7, .65), d),
  info: () => ({ cue: cueName, up: [sUx, sUy, sUz].map((v) => +v.toFixed(2)), fw: [sFx, sFy, sFz].map((v) => +v.toFixed(2)), fps, W, H, S, pos: [px, py, pz], reg: REG, sys: SYS.name, broken, cargo, live: nLive, dyn: DC[0].n + DC[1].n + DGm.n, n: LAYERS.map((l) => l.n) }),
};
if (typeof v122Hooks === 'function') v122Hooks();
if (typeof v123Hooks === 'function') v123Hooks();
requestAnimationFrame((t) => { last = t; frame(t); });
await step(1, 'The dark is ready');
B.className = 'm';
// Installed from the Meta Horizon Store (a packaged web app): open straight into the headset. Launching the app counts as the user's
// tap, so the session is allowed without one. Ordinary website visits never auto-enter. If the headset won't start, the menu stays up.
if (PWA && !TEST) (async () => { try { if (navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')) await vr(1); } catch {} })();
if (TEST) go();
