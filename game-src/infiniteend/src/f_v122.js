// v1.22: industrial freighters, capital ships, NASA-lineage stations, a Silence biomech layer,
// a creature generator, and meters that choose a route. Quest 3 / Touch Plus controls are unchanged.
const DIFFN = ['Story', 'Pilot', 'Veteran', 'Silence'];
const DIFFHINT = ['Meters sip. Pilots miss. Docks stay kind.', 'The voyage as charted.', 'Sharper guns, thirstier tanks, dearer docks.', 'The dark keeps the books.'];
if (CFG.diff == null) CFG.diff = 1;
if ((CFG.fxMig || 0) < 7) CFG.fxMig = 7;
function diffI() { const i = CFG.diff | 0; return i < 0 ? 0 : i > 3 ? 3 : i; }
function diffK() { return [.45, 1, 1.55, 2.15][diffI()]; }
function diffAi() { return [.55, 1, 1.32, 1.7][diffI()]; }
function encRate() { return [.22, .45, .62, .8][diffI()]; }
function berthMul() {
  const rep = (rp().rep && rp().rep[SYS.fac]) || 0;
  const rm = rep >= 60 ? .72 : rep >= 25 ? .84 : rep >= 8 ? .94 : rep <= -8 ? 1.28 : 1;
  return rm * [.8, 1, 1.18, 1.4][diffI()];
}
function berthNote() {
  const rep = (rp().rep && rp().rep[SYS.fac]) || 0;
  return rep >= 25 ? 'They know your name. The yard is cheaper.' : rep <= -8 ? 'You are posted here. The yard charges extra.' : 'Or crack ferrite into plate yourself, out in the field.';
}
const priceAt121 = priceAt;
priceAt = function (s, loc, g) { return Math.max(2, Math.round(priceAt121(s, loc, g) * [.85, 1, 1.15, 1.35][diffI()])); };

const hurt0 = hurt;
hurt = function (a) { hurt0(a * (.65 + diffK() * .4)); };

let heatAcc = 0, heatTip = 0, scoopTip = 0, cryoT = 0, patchT = 0, patchTold = 0, berthAir = 0, cookT = 0;
function skyKind() { if (!SYS || !SYS.atm) return -1; const L = SYS.locs[SYS.loc]; return L && L.skin != null ? L.skin : -1; }
function nearBerth() { if (!trader || !SYS || SYS.atm) return 0; return Math.hypot(430 - px, -70 - py, 260 - pz) < 280; }
function cook(d) {
  if (d < .15) return;
  ST.hull = Math.max(0, ST.hull - d); hullHitT = tm; gFlash[0] = 1;
  if (ST.hull <= 0) shipLost();
}
o2Tick = function (dt) {
  if (ST.o2 == null) ST.o2 = 100;
  const knd = skyKind(), breath = knd === 0 || knd === 3 || knd === 5, thin = knd === 2 || knd === 6, sour = knd === 4, dock = nearBerth() && ((rp().rep && rp().rep[SYS.fac]) || 0) > -40;
  if (breath || thin || dock) {
    const rate = (breath ? 7.2 : thin ? 3.4 : 4.2) * (knd === 5 ? 1.25 : 1);
    if (ST.o2 < 100) {
      if (!o2Fill) { o2Fill = 1; pop(dock ? 'DOCK AIR' : knd === 5 ? 'ICE SKIM' : knd === 0 ? 'DECK OXYGEN' : 'SCOOPS OPEN', '#7fd8ff'); }
      ST.o2 = Math.min(100, ST.o2 + dt * rate);
      if (ST.o2 >= 100 && o2Fill === 1) { o2Fill = 2; pop('O2 FULL', '#7fd8ff'); save(); }
    }
    o2Out = 0; cryoT = 0;
  } else if (sour) {
    o2Fill = 0;
    if (ST.o2 < 70) ST.o2 = Math.min(70, ST.o2 + dt * .8);
    heatAcc += dt * .22 * diffK();
  } else {
    o2Fill = 0;
    const leak = (ST.hull < 18 ? 2.3 : ST.hull < 40 ? 1.55 : 1) * (bst > .4 ? 1.6 : 1);
    const was = ST.o2;
    ST.o2 = Math.max(0, ST.o2 - dt * (100 / 4200) * diffK() * leak);
    if (Math.floor(was / 10) !== Math.floor(ST.o2 / 10)) save();
    if (ST.o2 < 36 && (cargo[2] || 0) > 0) {
      cryoT += dt;
      if (cryoT > 8) { cryoT = 0; cargo[2]--; ST.o2 = Math.min(100, ST.o2 + 18); showCargo(); pop('PYRITE → AIR +18', '#7fd8ff'); tip('Cryo ore cracked for cabin air. The siphons will miss it.', 4500); }
    }
    if (ST.o2 <= 0) {
      if (!o2Out) tip('Oxygen gone. You have under a minute. A world with air, a dock, or pyrite.', 8000);
      o2Out += dt;
      if (o2Out > 40) {
        o2Out = 0; const fee = Math.round(ST.credits * .1 * diffK()); ST.credits -= fee; ST.o2 = 48; thr = 0; vx = vy = vz = 0;
        if (SYS.loc !== 0) arrive(SYS.sec, 0, 1); showCargo(); save();
        tip(`You blacked out. A rescue tug followed the distress beacon to the ${SYS.name} gate. Air at 48%${fee ? '. Tow ' + fee + ' credits' : ''}.`, 10000);
      }
    } else o2Out = 0;
  }
  const o = ST.o2;
  const want = o <= 0 ? Math.min(1, .4 + o2Out / 40 * .6) : o < 18 ? (18 - o) / 18 * .62 : 0;
  o2Hyp += (want - o2Hyp) * Math.min(1, dt * 1.6);
  if (o < 18 && o > 0 && tm > cookT) { cookT = tm + 7; tip(o < 8 ? 'OXYGEN CRITICAL. Vision is going.' : 'Oxygen ' + (o | 0) + '%. A breathable deck, a dock, or pyrite.', 4200); }
};
const droneTick0 = droneTick;
droneTick = function (dt, fly) {
  droneTick0(dt, fly);
  if (!fly || ST.fuel == null) return;
  const cruise = Math.abs(thr) * .0075 * diffK();
  if (cruise > 0 && ST.fuel > 0) ST.fuel = Math.max(0, ST.fuel - cruise * dt);
};

const startJump0 = startJump;
startJump = function (d) {
  if (!d || jumpTo || !flying()) return;
  const far = d.sec && (d.sec[0] !== SYS.sec[0] || d.sec[1] !== SYS.sec[1] || d.sec[2] !== SYS.sec[2]);
  const cost = (far ? 12 : 6) * (ST.lens ? .62 : 1) * (.7 + diffK() * .32);
  if ((ST.fuel || 0) < cost) { tip('Not enough fuel to light the jump. Dock, or scoop a gas giant.', 5200); return; }
  ST.fuel -= cost;
  const need = far ? (ST.lens ? 2 : 5) : 0;
  if (need && (ST.spice || 0) >= need) { ST.spice -= need; tip('Spice fix on the lane. The jump sits down.', 3200); }
  else if (need) { trauma = Math.min(1, trauma + .4); tip('No spice fix. The lane will kick.', 3600); }
  showCargo(); save();
  startJump0(d);
};

function v122Meters(dt, fly) {
  if (!fly) return;
  const knd = skyKind();
  if (knd === 1) heatAcc += dt * 1.35 * diffK();
  else if (knd === 4 && Math.hypot(vx, vy, vz) > 240) heatAcc += dt * .28 * diffK();
  else if (knd === 0) {
    const push = 1 + bst * 1.8;
    ST.fuel = Math.min(100, (ST.fuel || 0) + dt * 3.4 * push);
    heatAcc += dt * (.12 + bst * .85) * diffK();
    if (!scoopTip) { scoopTip = 1; tip('Scooping the cloud deck. The hull takes heat if you boost through it.', 5600); }
  }
  if (SYS.atm && Math.hypot(vx, vy, vz) > 520 && knd !== 0) heatAcc += dt * .18 * diffK();
  const sun = sFx * SUN[0] + sFy * SUN[1] + sFz * SUN[2];
  if (!SYS.atm && csU[0] > .1 && sun > .84) {
    ST.fuel = Math.min(100, (ST.fuel || 0) + dt * (1.6 + csU[0] * 6));
    heatAcc += dt * (.4 + bst) * diffK() * (1 + csU[0] * 3);
    if (tm > heatTip) { heatTip = tm + 9; tip('Corona scoop. Fuel is coming in. So is the heat.', 4200); }
  }
  if (heatAcc > 1.4) { const h = heatAcc; heatAcc = 0; cook(h); if (tm > heatTip) { heatTip = tm + 6; tip('Hull is taking heat.', 3000); } }
  if (ST.hull < 42 && bst < .25 && (cargo[1] || 0) > 0) {
    patchT += dt;
    if (patchT > 7.5) {
      patchT = 0; cargo[1]--; ST.hull = Math.min(100, ST.hull + 8); showCargo(); pop('FERRITE PLATE +8', '#c3ccdc');
      if (!patchTold) { patchTold = 1; tip('Field patch from ferrite. A yard will finish it, and they remember who pays.', 5000); }
    }
  } else patchT = 0;
  if (LFau) { const r = nearestOf(FAU); if (r && r[0] < 700 * 700 && ST.spice < 100) ST.spice = Math.min(100, ST.spice + dt * 2.2); }
  if (LLev && LLev.n) { const r = nearInst(LLev); if (r[0] < 1600 * 1600 && ST.spice < 100) ST.spice = Math.min(100, ST.spice + dt * 3.1); }
  const wisp = nearInst(LW); if (wisp && wisp[0] < 900 * 900 && ST.spice < 100) ST.spice = Math.min(100, ST.spice + dt * 1.4);
  if (ST.o2 < 16 && ST.o2 > 0 && !sysWarn) { sysWarn = `O2 ${ST.o2 | 0}% · BREATHE AT A DOCK, AN OCEAN OR ICE DECK, OR CRACK PYRITE`; sysWarnC = '#7fd8ff'; }
  else if (ST.hull < 28 && ST.hull > 0 && ST.fuel > 0 && !sysWarn) { sysWarn = `HULL ${ST.hull | 0}% · FERRITE ${cargo[1] || 0} IN THE FIELD · YARD ${nearBerth() ? 'HERE' : 'AT THE TRADER'}`; sysWarnC = '#ff5d4f'; }
}

function v122Berth(list) {
  const mul = berthMul(), missF = 100 - (ST.fuel || 0), missA = 100 - (ST.o2 == null ? 100 : ST.o2);
  if (missF > 3) {
    const cost = Math.max(6, Math.ceil(missF * .42 * mul));
    list.push({ name: 'Fill the tanks', kind: cost + ' cr', desc: 'Station manifold. A gas giant scoops for free if you accept the heat.', run: () => { if (ST.credits < cost) return tip('Not enough credits for fuel', 3000); ST.credits -= cost; ST.fuel = 100; gain({ rep: 1, xp: 3 }); save(); showCargo(); tip('Tanks full', 3000); } });
  }
  if (missA > 3) {
    const cost = Math.max(3, Math.ceil(missA * .14 * mul));
    list.push({ name: 'Top up the air', kind: cost + ' cr', desc: 'Bottled oxygen. Ocean decks and ice worlds skim it.', run: () => { if (ST.credits < cost) return tip('Not enough credits for air', 3000); ST.credits -= cost; ST.o2 = 100; gain({ rep: 1 }); save(); tip('Cabin air full', 2500); } });
  }
  const sp = ST.spice || 0, base = 36 + (SYS.danger || 0) * 16, sell = Math.max(8, Math.round(base * (berthMul() < 1 ? 1.15 : .92)));
  if (sp >= 8) list.push({ name: 'Sell spice', kind: Math.round(sell * Math.min(25, sp)) + ' cr', desc: 'The Order and the Survey navigate on it. Thin lanes pay more.', run: () => { const n = Math.min(25, ST.spice); ST.spice -= n; const pay = Math.round(sell * n); ST.credits += pay; gain({ rep: 1, xp: 6 }); save(); showCargo(); tip(`Spice sold · +${pay}`, 3200); } });
  if (sp < 90) {
    const buy = Math.round(sell * 1.65 * mul);
    list.push({ name: 'Buy 10 spice', kind: buy + ' cr', desc: 'A fix for a long jump, or the Silence lens.', run: () => { if (ST.credits < buy) return tip('Spice is dear here', 3000); ST.credits -= buy; ST.spice = Math.min(100, (ST.spice || 0) + 10); save(); showCargo(); tip('Spice aboard', 2500); } });
  }
}

const outfitPanel121 = outfitPanel;
outfitPanel = function () {
  const lens = ST.lens ? null : { name: 'Silence lens', kind: (ST.spice || 0) >= 25 ? '25 spice' : '480 cr', desc: 'Alien-tech nav. Long jumps burn less fuel and less spice.', run: () => {
    if ((ST.spice || 0) >= 25) ST.spice -= 25;
    else if (ST.credits >= 480) ST.credits -= 480;
    else return tip('The lens wants 25 spice, or 480 credits', 4000);
    ST.lens = 1; save(); showCargo(); tip('Silence lens seated. The lanes sit quieter.', 5000); outfitPanel();
  } };
  const hold = outfitPanel121;
  if (!lens) return hold();
  const panel0 = panel;
  panel = function (title, sub, list, foot) { if (title === 'Outfitter') list = list.concat([lens]); panel0(title, sub, list, foot); };
  hold();
  panel = panel0;
};

const factionDress0 = factionDress;
factionDress = function () {
  factionDress0();
  for (const a of NPCS) {
    if (a.role === 5 || a.big) continue;
    if (a.role === 0 || a.role === 1 || a.role === 6) a.var = (a.fac || 0) % 2;
  }
};

const genFrig0 = genFrig;
genFrig = function (L, wx, wy, wz, sx, sy, sz) { cellRnd(wx, wy, wz, 21); if (hx(1) > .4) return; genFrig0(L, wx, wy, wz, sx, sy, sz); };

function shipOut(V, I) { const m = mesh(V, I); m.nv = V.length / 8 | 0; if (m.nv > 65000) console.error('mesh overflow', m.nv); return m; }
function wheel(V, I, z, r, th, n, m, part) {
  for (let i = 0; i < n; i++) {
    if (part === 9 && (i % 11 === 4 || i % 11 === 5)) continue;
    const am = (i + .5) / n * 6.283, c = Math.cos(am), s = Math.sin(am), len = r * Math.sin(Math.PI / n) * .9;
    box(V, I, [c * r, s * r, z], [-s * len, c * len, 0], [c * th, s * th, 0], [0, 0, th * .8], m, part === 9 ? 0 : part);
  }
}
function bell(V, I, x, y, z, s) { loft(V, I, [[z, s * .45, s * .45, y, x], [z + s * 1.35, s * .72, s * .72, y, x]], 7, 0, 0, 2); }
function lamp(V, I, x, y, z, s) { box(V, I, [x, y, z], [s, 0, 0], [0, s, 0], [0, 0, s], 4); }
function scorch(V, I, R, n, y) { for (let i = 0; i < n; i++) { const q = .02 + R() * .03; box(V, I, [(R() - .5) * .2, y, -.4 + R() * .9], [q, 0, 0], [0, q * .35, 0], [0, 0, q * 1.4], 6); } }
function shuttle(V, I, ph) { loft(V, I, [[-.06, .012, .008], [0, .028, .016], [.05, .02, .012]], 5, 1, 1, 2, 3 + ph); }
function turret(V, I, ph) { box(V, I, [0, 0, 0], [.02, 0, 0], [0, .028, 0], [0, 0, .02], 0, 2 + ph); box(V, I, [0, .01, -.06], [.008, 0, 0], [0, .008, 0], [0, 0, .05], 1, 2 + ph); }

function haulMesh(seed, style) {
  const R = mulberry32(seed >>> 0), V = [], I = [];
  const pods = style ? 5 : 4 + (R() * 2 | 0);
  loft(V, I, [[-1.05, .02, .016], [-.94, .07, .05], [-.8, .09, .062], [-.72, .04, .034]], 8, 0);
  loft(V, I, [[-.98, .015, .01, .05], [-.86, .05, .026, .064], [-.76, .028, .014, .056]], 6, 3);
  box(V, I, [0, .07, -.86], [.07, 0, 0], [0, .006, 0], [0, 0, .05], 1);
  loft(V, I, [[-.72, .026, .024], [.7, .03, .026]], 6, 0);
  for (let i = 0; i < pods; i++) {
    const z = -.55 + i * (1.15 / pods), skip = R() < .14;
    for (const s of [-1, 1]) {
      if (skip && s < 0 && i === 1) continue;
      const m = R() < .2 ? 6 : (i & 1 ? 1 : 0);
      if (style) loft(V, I, [[z - .08, .02, .02, 0, s * .16], [z - .05, .08, .07, 0, s * .16], [z + .07, .08, .07, 0, s * .16], [z + .1, .018, .018, 0, s * .16]], 8, m);
      else box(V, I, [s * .16, 0, z], [.075, 0, 0], [0, .06, 0], [0, 0, .07], m);
      box(V, I, [s * .08, 0, z], [.045, 0, 0], [0, .012, 0], [0, 0, .01], 0);
      box(V, I, [s * .08, 0, z], [.01, 0, 0], [0, .07, 0], [0, 0, .01], 0);
    }
  }
  for (let i = 0; i < 3; i++) {
    const z = -.35 + i * .28, s = i & 1 ? 1 : -1;
    slab(V, I, [[s * .04, .05, z], [s * .24, .055, z + .02], [s * .24, .05, z + .12], [s * .04, .045, z + .1]], .004, 12, 4);
  }
  loft(V, I, [[.66, .05, .045], [.78, .12, .1], [.92, .11, .09]], 8, 0);
  bell(V, I, -.09, .02, .9, .08); bell(V, I, .09, .02, .9, .08);
  if (!style) { bell(V, I, -.09, -.05, .9, .06); bell(V, I, .09, -.05, .9, .06); }
  for (let i = 0; i < 12; i++) { const q = .008 + R() * .012; box(V, I, [(R() - .5) * .08, .045, -.5 + R() * 1.1], [q, 0, 0], [0, q * .6, 0], [0, 0, q * 1.6], R() < .16 ? 6 : 0); }
  scorch(V, I, R, 4, .02);
  lamp(V, I, -.1, .04, -1.02, .012); lamp(V, I, .1, .04, -1.02, .012); lamp(V, I, 0, .12, .2, .01); lamp(V, I, -.2, 0, .4, .01); lamp(V, I, .2, 0, .4, .01);
  box(V, I, [0, .11, .15], [.012, 0, 0], [0, .05, 0], [0, 0, .012], 0); lamp(V, I, 0, .17, .15, .012);
  return shipOut(V, I);
}
frigateMesh = function (v) { return v ? haulMesh(0xF1A7, 1) : capMesh(1); };
function capMesh(kind) {
  const R = mulberry32(0xC0A9 + kind * 97), V = [], I = [], ark = kind === 2, flag = kind === 3, carrier = kind === 0;
  loft(V, I, [[-1, .015, .02], [-.75, .08, .05], [-.2, .1, .06], [.35, .12, .07], [.7, .1, .06]], ark ? 8 : 8, ark ? 8 : 0);
  if (!ark) loft(V, I, [[-.55, .02, .012, .07], [-.25, .06, .03, .09], [.05, .04, .02, .08]], 6, 3);
  else loft(V, I, [[-.2, .05, .05, .02], [.15, .08, .08, .03]], 8, 8);
  box(V, I, [0, .09, -.15], [.09, 0, 0], [0, .008, 0], [0, 0, .22], 1);
  const ringR = carrier ? .4 : ark ? .46 : flag ? .36 : .28;
  wheel(V, I, ark ? .05 : 0, ringR, ark ? .05 : .035, ark ? 28 : 22, ark ? 8 : 0, 1);
  wheel(V, I, ark ? .05 : 0, ringR * .82, .012, 16, 11, 1);
  for (let k = 0; k < 4; k++) { const g = k * 1.57 + .4, c = Math.cos(g), s = Math.sin(g); box(V, I, [c * ringR * .55, s * ringR * .55, 0], [c * ringR * .4, s * ringR * .4, 0], [-s * .01, c * .01, 0], [0, 0, .01], ark ? 8 : 0); }
  if (carrier) slab(V, I, [[-.05, .02, -.7], [.34, .01, .15], [.34, .01, .55], [-.05, .02, .35]], .01, 0);
  if (carrier) slab(V, I, [[.05, .02, -.7], [-.34, .01, .15], [-.34, .01, .55], [.05, .02, .35]], .01, 0);
  turret(V, I, .05); turret(V, I, .22);
  if (!ark) { turret(V, I, .38); turret(V, I, .55); }
  shuttle(V, I, .15); shuttle(V, I, .48);
  if (carrier || flag) shuttle(V, I, .77);
  const fins = ark ? 2 : 3;
  for (let i = 0; i < fins; i++) {
    const z = -.15 + i * .22, s = i & 1 ? 1 : -1;
    slab(V, I, [[s * .08, .02, z], [s * .42, .03, z + .04], [s * .4, .02, z + .16], [s * .06, .01, z + .12]], .005, ark || flag ? 10 : 12, 4);
    if (ark) slab(V, I, [[s * .1, -.02, z], [s * .36, -.03, z + .05], [s * .34, -.02, z + .14], [s * .08, -.01, z + .1]], .004, 9, 4);
  }
  loft(V, I, [[.62, .06, .05], [.78, .16, .12], [.9, .14, .1]], 8, ark ? 8 : 0);
  bell(V, I, -.12, .03, .88, kind === 1 ? .1 : .07); bell(V, I, .12, .03, .88, kind === 1 ? .1 : .07);
  bell(V, I, -.12, -.04, .88, .06); bell(V, I, .12, -.04, .88, .06);
  for (let i = 0; i < 16; i++) { const q = .01 + R() * .014; box(V, I, [(R() - .5) * .16, .1, -.6 + R()], [q, 0, 0], [0, q * .5, 0], [0, 0, q * 1.5], R() < .22 ? 6 : 0); }
  scorch(V, I, R, kind === 1 ? 6 : 3, .04);
  lamp(V, I, 0, .14, -.9, .016); lamp(V, I, -.15, 0, .2, .012); lamp(V, I, .15, 0, .2, .012); lamp(V, I, 0, ringR + .02, 0, .014);
  if (flag) { slab(V, I, [[0, .12, -.4], [.02, .34, -.15], [.02, .34, .15], [0, .12, .25]], .006, 1); }
  return shipOut(V, I);
}

function nasaTorus() {
  const V = [], I = [];
  wheel(V, I, 0, 1, .055, 32, 8, 0);
  wheel(V, I, 0, .9, .016, 28, 11, 0);
  wheel(V, I, .02, 1.12, .008, 20, 10, 4);
  slab(V, I, [[.15, .2, 0], [1.15, .55, 0], [1.15, -.15, 0], [.15, -.35, 0]], .01, 10, 0);
  slab(V, I, [[-.15, .2, 0], [-1.15, .55, 0], [-1.15, -.15, 0], [-.15, -.35, 0]], .01, 9, 0);
  for (let k = 0; k < 6; k++) { const g = k / 6 * 6.283, c = Math.cos(g), s = Math.sin(g); box(V, I, [c * .5, s * .5, 0], [c * .42, s * .42, 0], [-s * .012, c * .012, 0], [0, 0, .012], 0); }
  loft(V, I, [[-.08, .05, .05], [0, .14, .14], [.08, .05, .05]], 10, 8);
  loft(V, I, [[.02, .06, .06], [.07, .045, .045]], 8, 3);
  for (let k = 0; k < 4; k++) { const g = k * 1.57, c = Math.cos(g), s = Math.sin(g); box(V, I, [c * .15, s * .15, -.16], [c * .12, s * .12, 0], [-s * .04, c * .04, 0], [0, 0, .05], 8); }
  slab(V, I, [[.2, .15, .015], [.7, .55, .02], [.66, .62, .02], [.16, .22, .015]], .004, 12, 4);
  slab(V, I, [[-.2, .15, .015], [-.7, .55, .02], [-.66, .62, .02], [-.16, .22, .015]], .004, 12, 4);
  for (let k = 0; k < 8; k++) { const g = k / 8 * 6.283, c = Math.cos(g), s = Math.sin(g); lamp(V, I, c * 1.08, s * 1.08, 0, .016); }
  return shipOut(V, I);
}
function nasaGateway() {
  const V = [], I = [];
  box(V, I, [0, 0, 0], [.035, 0, 0], [0, .035, 0], [0, 0, .85], 0);
  for (let i = 0; i < 7; i++) { const z = -.7 + i * .22; box(V, I, [0, 0, z], [.08, 0, 0], [0, .012, 0], [0, 0, .012], 0); box(V, I, [0, 0, z], [.012, 0, 0], [0, .08, 0], [0, 0, .012], 0); }
  loft(V, I, [[-.55, .07, .07], [-.28, .09, .09], [-.02, .07, .07]], 10, 8);
  loft(V, I, [[.08, .06, .06], [.32, .08, .08], [.5, .05, .05]], 10, 8);
  loft(V, I, [[-.42, .03, .03, .1], [-.36, .045, .045, .11]], 8, 3);
  box(V, I, [0, 0, .72], [.05, 0, 0], [0, .05, 0], [0, 0, .04], 8);
  wheel(V, I, .78, .1, .012, 10, 8, 0);
  slab(V, I, [[.08, .02, -.35], [.62, .02, -.32], [.62, .02, .25], [.08, .02, .22]], .006, 10, 0);
  slab(V, I, [[-.08, .02, -.35], [-.62, .02, -.32], [-.62, .02, .25], [-.08, .02, .22]], .006, 9, 0);
  slab(V, I, [[.05, -.02, -.2], [.4, -.02, -.18], [.4, -.02, .15], [.05, -.02, .12]], .004, 12, 4);
  for (const z of [-.7, 0, .7]) { lamp(V, I, .05, .05, z, .012); lamp(V, I, -.05, -.04, z, .012); }
  return shipOut(V, I);
}
function oneillYard() {
  const V = [], I = [];
  loft(V, I, [[-.7, .22, .22], [-.55, .28, .28], [.45, .28, .28], [.6, .2, .2]], 12, 8);
  loft(V, I, [[-.15, .29, .29], [.15, .29, .29]], 12, 11);
  loft(V, I, [[-.72, .1, .1], [-.62, .16, .16]], 10, 8);
  for (let k = 0; k < 6; k++) { const g = k / 6 * 6.283, c = Math.cos(g), s = Math.sin(g); box(V, I, [c * .46, s * .2, -.1], [c * .16, s * .04, 0], [-s * .02, c * .05, 0], [0, 0, .02], k & 1 ? 0 : 8); }
  slab(V, I, [[.05, .3, -.4], [.08, .72, -.35], [.08, .72, .3], [.05, .3, .35]], .008, 10, 0);
  slab(V, I, [[-.05, .3, -.4], [-.08, .72, -.35], [-.08, .72, .3], [-.05, .3, .35]], .008, 9, 0);
  box(V, I, [.2, -.34, 0], [.06, 0, 0], [0, .08, 0], [0, 0, .1], 8);
  box(V, I, [-.2, -.34, 0], [.06, 0, 0], [0, .08, 0], [0, 0, .1], 8);
  lamp(V, I, .3, 0, .62, .02); lamp(V, I, -.3, 0, .62, .02); lamp(V, I, 0, .3, -.65, .016);
  return shipOut(V, I);
}
function bernalSpine() {
  const V = [], I = [];
  const secs = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10, y = (t - .5) * .7, r = Math.sin(t * Math.PI) * .34 + .02; secs.push([y, r, r]); }
  loft(V, I, secs, 12, 8);
  wheel(V, I, 0, .4, .02, 20, 11, 1);
  slab(V, I, [[.02, .36, -.15], [.02, .7, -.12], [.02, .7, .12], [.02, .36, .15]], .008, 10, 0);
  slab(V, I, [[-.02, .36, -.15], [-.02, .7, -.12], [-.02, .7, .12], [-.02, .36, .15]], .008, 9, 0);
  box(V, I, [0, 0, 0], [.02, 0, 0], [0, .5, 0], [0, 0, .02], 0);
  loft(V, I, [[.42, .04, .04], [.5, .01, .01]], 8, 0);
  lamp(V, I, 0, .52, 0, .02); lamp(V, I, .42, 0, 0, .014);
  return shipOut(V, I);
}
ringMesh = function () { return nasaTorus(); };
spireMesh = function () { return bernalSpine(); };

function aliShip() {
  const V = [], I = [], R = mulberry32(0xA11E);
  loft(V, I, [[-1, .01, .02], [-.7, .05, .08], [-.35, .07, .14], [.1, .05, .1], [.55, .03, .05]], 7, 7, 7, 7, 5);
  loft(V, I, [[-.85, .02, .03, .06], [-.55, .04, .05, .1], [-.3, .015, .02, .08]], 6, 7, 7, 7, 5);
  for (let i = 0; i < 6; i++) {
    const z = -.6 + i * .18;
    slab(V, I, [[.02, .02, z], [.2, .12, z + .02], [.18, .1, z + .1], [.01, .01, z + .08]], .008, 7, 5);
    slab(V, I, [[-.02, -.01, z], [-.16, -.14, z + .03], [-.14, -.1, z + .09], [-.01, 0, z + .07]], .008, i === 2 ? 6 : 7, 5);
  }
  box(V, I, [.12, .16, -.72], [.02, 0, 0], [0, .08, 0], [0, 0, .02], 7, 5);
  bell(V, I, .16, -.02, .5, .07); bell(V, I, -.14, .02, .52, .06);
  for (let i = 0; i < 5; i++) lamp(V, I, Math.sin(i) * .05, .02, -.8 + i * .3, .01);
  scorch(V, I, R, 3, 0);
  return shipOut(V, I);
}
function aliDerelict() {
  const V = [], I = [];
  wheel(V, I, 0, 1, .06, 26, 7, 9);
  wheel(V, I, .04, .72, .03, 18, 6, 0);
  for (let k = 0; k < 5; k++) {
    if (k === 2) continue;
    const g = k / 5 * 6.283, c = Math.cos(g), s = Math.sin(g);
    box(V, I, [c * .45, s * .45, (k - 2) * .02], [c * .3, s * .3, 0], [-s * .02, c * .02, 0], [0, 0, .025], k & 1 ? 6 : 7);
  }
  loft(V, I, [[-.15, .08, .1], [.05, .02, .04], [.2, .1, .06]], 7, 6);
  lamp(V, I, .2, .15, 0, .02); lamp(V, I, -.4, -.2, .05, .014);
  box(V, I, [.05, -.08, .12], [.04, 0, 0], [0, .015, 0], [0, 0, .05], 5);
  return shipOut(V, I);
}
function aliStation() {
  const V = [], I = [];
  loft(V, I, [[-.35, .05, .08], [-.1, .22, .2], [.15, .26, .18], [.4, .08, .1]], 9, 7, 7, 7, 5);
  for (let k = 0; k < 5; k++) {
    const g = k / 5 * 6.283, c = Math.cos(g), s = Math.sin(g);
    loft(V, I, [[c * .2, s * .15, 0, s * .05, c * .05], [c * .55, s * .4, .04, s * .08, c * .08], [c * .7, s * .5, .02, s * .02, c * .02]], 6, 7, 7, 5, 5);
    lamp(V, I, c * .62, s * .42, 0, .016);
  }
  box(V, I, [0, 0, 0], [.04, 0, 0], [0, .04, 0], [0, 0, .04], 5);
  return shipOut(V, I);
}
function aliMega() {
  const V = [], I = [];
  for (let i = 0; i < 9; i++) {
    const z = -1 + i * .24, r = .18 + Math.sin(i * .7) * .08;
    wheel(V, I, z, r, .03, 12, i % 3 === 1 ? 6 : 7, i === 4 ? 5 : 0);
    if (i % 2 === 0) { box(V, I, [r, 0, z], [r * .7, 0, 0], [0, .015, 0], [0, 0, .02], 7, 5); box(V, I, [-r * .6, .04, z], [.02, 0, 0], [0, r * .5, 0], [0, 0, .015], 7, 5); }
  }
  loft(V, I, [[-.2, .04, .05], [.3, .06, .08], [.8, .02, .03]], 6, 7, 7, 7, 5);
  lamp(V, I, 0, .05, 0, .03);
  return shipOut(V, I);
}

function tubeBody(V, I, prof, na, mat, part) {
  const s0 = V.length / 8, nz = prof.length;
  for (let j = 0; j < nz; j++) {
    const z = prof[j][0], rx = prof[j][1], ry = prof[j][2] || rx;
    for (let i = 0; i < na; i++) {
      const g = i / na * 6.283, c = Math.cos(g), s = Math.sin(g);
      const m = (j % 4 === 2 && i % 3 === 0) ? 5 : mat;
      V.push(c * rx, s * ry, z, c, s, 0, m, part || 0);
    }
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < na; i++) {
    const i2 = (i + 1) % na, a = s0 + j * na + i, b = s0 + (j + 1) * na + i, a2 = s0 + j * na + i2, b2 = s0 + (j + 1) * na + i2;
    I.push(a, b, a2, a2, b, b2);
  }
}
function fin(V, I, x, y, z, dx, dy, dz) {
  face(V, I, [[x, y, z], [x + dx, y + dy, z + dz * .2], [x + dx * .2, y + dy * .2, z + dz]], [7, 5, 7], 6);
}
function fishMesh(seed) {
  const R = mulberry32(seed), V = [], I = [], fat = .08 + R() * .06, prof = [];
  for (let j = 0; j <= 14; j++) { const t = j / 14, bell = Math.sin(Math.pow(t, .8) * Math.PI); prof.push([t * 2 - 1, (.02 + fat * Math.pow(bell, .85)) * (1 - t * .35), (.015 + fat * .7 * bell)]); }
  tubeBody(V, I, prof, 8, 7, 0);
  fin(V, I, 0, 0, .55, .35, .04, .4); fin(V, I, 0, 0, .55, -.32, -.02, .38);
  fin(V, I, .05, .02, -.1, .28, -.08, .2); fin(V, I, -.05, .02, -.1, -.26, -.06, .18);
  return shipOut(V, I);
}
function medusaMesh() {
  const V = [], I = [], prof = [];
  for (let j = 0; j <= 8; j++) { const t = j / 8; prof.push([(t - .2) * .6, (.05 + Math.sin(t * 2.2) * .22) * (1 - t * .4), .04 + Math.sin(t * 2) * .16]); }
  tubeBody(V, I, prof, 10, 7, 5);
  for (let k = 0; k < 6; k++) {
    const g = k / 6 * 6.283, c = Math.cos(g) * .12, s = Math.sin(g) * .12;
    tubeBody(V, I, [[.15, .012, .012, 0], [.45, .008, .008], [.9, .003, .003]].map((p, i) => [p[0], p[1], p[2]]), 4, k & 1 ? 5 : 7, 5);
    for (let q = V.length / 8 - 12; q < V.length / 8; q++) if (q >= 0) { V[q * 8] += c; V[q * 8 + 1] += s; }
  }
  return shipOut(V, I);
}
function wormMesh() {
  const V = [], I = [], prof = [];
  for (let j = 0; j <= 18; j++) { const t = j / 18, r = .03 + .045 * Math.sin(t * Math.PI) * (1 + .25 * Math.sin(j * 1.7)); prof.push([t * 2 - 1, r, r * .8]); }
  tubeBody(V, I, prof, 7, 7, 5);
  for (let j = 2; j < 16; j += 3) fin(V, I, .04, 0, -1 + j * .12, .12, .04, .05);
  return shipOut(V, I);
}
function mantaMesh() {
  const V = [], I = [], prof = [];
  for (let j = 0; j <= 10; j++) { const t = j / 10; prof.push([t * 1.4 - .7, .03 + .05 * Math.sin(t * Math.PI), .02 + .03 * Math.sin(t * Math.PI)]); }
  tubeBody(V, I, prof, 8, 7, 0);
  slab(V, I, [[0, 0, -.4], [.7, -.02, .1], [.55, 0, .45], [0, .01, .2]], .01, 7, 6);
  slab(V, I, [[0, 0, -.4], [-.7, -.02, .1], [-.55, 0, .45], [0, .01, .2]], .01, 7, 6);
  fin(V, I, 0, .02, .5, .2, .05, .25); fin(V, I, 0, .02, .5, -.18, .04, .22);
  return shipOut(V, I);
}
function scarabMesh() {
  const V = [], I = [];
  loft(V, I, [[-.45, .04, .03], [-.1, .16, .1], [.25, .14, .08], [.5, .04, .03]], 8, 7);
  loft(V, I, [[-.15, .12, .04, .08], [.2, .1, .03, .09]], 6, 6);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const z = -.2 + i * .18;
    box(V, I, [s * .14, -.08, z], [s * .1, 0, 0], [0, .02, 0], [0, 0, .015], 7, 6);
  }
  lamp(V, I, .08, .06, -.4, .016); lamp(V, I, -.08, .06, -.4, .016);
  return shipOut(V, I);
}
function anglerMesh() {
  const V = [], I = [], prof = [];
  for (let j = 0; j <= 12; j++) { const t = j / 12, bell = Math.sin(Math.pow(t, .55) * Math.PI); prof.push([t * 1.6 - .9, .03 + .12 * bell, .025 + .08 * bell]); }
  tubeBody(V, I, prof, 8, 7, 0);
  box(V, I, [0, .12, -.7], [.008, 0, 0], [0, .1, 0], [0, 0, .008], 7);
  box(V, I, [0, .24, -.78], [.03, 0, 0], [0, .03, 0], [0, 0, .03], 5);
  fin(V, I, 0, 0, .4, .22, .02, .2); fin(V, I, 0, 0, .4, -.2, -.01, .18);
  return shipOut(V, I);
}
function leviMesh() {
  const V = [], I = [], prof = [];
  for (let j = 0; j <= 26; j++) { const t = j / 26, bell = Math.sin(Math.pow(t, .7) * Math.PI); prof.push([t * 2 - 1, .02 + .16 * Math.pow(bell, .8) * (1 - t * .2), .015 + .1 * bell]); }
  tubeBody(V, I, prof, 10, 7, 5);
  fin(V, I, 0, .02, .2, .45, .05, .35); fin(V, I, 0, 0, .15, -.4, -.08, .3);
  fin(V, I, 0, 0, .72, .3, .02, .22); fin(V, I, 0, 0, .72, -.28, .01, .2);
  box(V, I, [0, .08, -.85], [.02, 0, 0], [0, .04, 0], [0, 0, .08], 5);
  return shipOut(V, I);
}

let LCap, LAli, LFau, LLev, CAP, ALI, FAU, mCap, mAli, mFau, mLev, V122N = {};
function capAt(C, wx, wy, wz) {
  if (SYS.atm) return 0;
  cellRnd(wx, wy, wz, 31);
  const gate = (wx | wy | wz) === 0;
  if (!gate && hx(1) > .04 + (SYS.danger || 0) * .008) return 0;
  if (!gate && gateClear(C, wx, wy, wz, 2800, 1400)) return 0;
  if (gate) { gj0 = .2; gj1 = .03; gj2 = .18; }
  return gate ? 1100 : 1800 + 2000 * hx(5);
}
function genCap(L, wx, wy, wz, sx, sy, sz) {
  const s = capAt(L.C, wx, wy, wz); if (!s) return;
  const gate = (wx | wy | wz) === 0, k = gate ? (SYS.fac || 0) % 4 : (gh >>> 8) % 4;
  const hue = [.55, .1, .04, .46][SYS.fac || 0];
  put(CAP[k], sx, sy, sz, s, gj0, gj1, gj2, gsd, hx(3), .35, hue, k);
}
function aliAt(C, wx, wy, wz) {
  if (SYS.atm) return 0;
  cellRnd(wx, wy, wz, 32);
  const show = (wx | wy | wz) === 0;
  if (!show && hx(1) > .035 + (SYS.dead ? .12 : 0) + (SYS.danger || 0) * .01) return 0;
  if (!show && gateClear(C, wx, wy, wz, 2200, 900)) return 0;
  if (show) { gj0 = .78; gj1 = .05; gj2 = .42; }
  return show ? 720 : 1;
}
function genAli(L, wx, wy, wz, sx, sy, sz) {
  if (!aliAt(L.C, wx, wy, wz)) return;
  const show = (wx | wy | wz) === 0;
  let k = show ? 1 : (gh >>> 9) % 4;
  if (!show && k === 3 && hx(1) > .22) k = 2;
  const szs = [320, 780, 960, 4600];
  const s = show ? 840 : szs[k] * (.75 + hx(5) * .4);
  put(ALI[k], sx, sy, sz, s, gj0, gj1, gj2, gsd, hx(3), hx(3), .08 + hx(1) * .25, k);
}
function genFau(L, wx, wy, wz, sx, sy, sz) {
  if (SYS.atm) { const y = (wy + .5) * L.C; if (y < 1800 || y > 8000) return; }
  cellRnd(wx, wy, wz, 33);
  const show = (wx | wy | wz) === 0;
  if (!show && hx(1) > .1 + ((SYS.a && SYS.a.life && SYS.a.life[0]) || 0) * .12) return;
  if (show) { gj0 = .7; gj1 = .12; gj2 = .22; }
  const plan = (gh >>> 7) % 4, beh = (gh >>> 13) % 4;
  const n = Math.min(L.per, show ? 4 : 2 + (hx(1) > .5 ? 1 : 0));
  gsx = sx; gsy = sy; gsz = sz; rs = gh;
  for (let k = 0; k < n; k++) put(FAU[plan], gsx, gsy, gsz, (show ? 14 : 8) + 22 * rnd(), gj0, gj1, gj2, gsd, rnd(), rnd(), rnd(), beh);
}
function genLev(L, wx, wy, wz, sx, sy, sz) {
  if (SYS.atm) return;
  cellRnd(wx, wy, wz, 34);
  const show = (wx | wy | wz) === 0;
  if (!show && hx(1) > .03 + ((SYS.a && SYS.a.life && SYS.a.life[4]) || 0) * .08) return;
  if (!show && gateClear(L.C, wx, wy, wz, 4000, 2000)) return;
  if (show) { gj0 = .62; gj1 = .04; gj2 = .7; }
  put(L, sx, sy, sz, show ? 680 : 520 + 900 * hx(5), gj0, gj1, gj2, gsd, hx(3), hx(3), .12 + hx(1) * .4, (gh >>> 6) % 4);
}
function nearestOf(arr) {
  let best = null;
  for (const L of arr) { if (!L || !L.n) continue; const r = nearInst(L); if (!best || r[0] < best[0]) best = r; }
  return best;
}
function v122Boot() {
  mShips = [haulMesh(11, 0), haulMesh(29, 1), mShips[2]];
  mHubS = nasaGateway();
  mDockS = oneillYard();
  mCap = [0, 1, 2, 3].map(capMesh);
  mAli = [aliShip(), aliDerelict(), aliStation(), aliMega()];
  mFau = [fishMesh(3), medusaMesh(), wormMesh(), mantaMesh()];
  mLev = leviMesh();
  LCap = Layer(26000, 6, 1, genCap, 31); CAP = [LCap, Sub(LCap, 1), Sub(LCap, 1), Sub(LCap, 1)];
  LAli = Layer(22000, 6, 1, genAli, 32); ALI = [LAli, Sub(LAli, 1), Sub(LAli, 1), Sub(LAli, 1)];
  LFau = Layer(2400, 4, 4, genFau, 33); FAU = [LFau, Sub(LFau, 4), Sub(LFau, 4), Sub(LFau, 4)];
  LLev = Layer(18000, 6, 1, genLev, 34);
  LAYERS.push(LCap, LAli, LFau, LLev);
  V122N = { haul: mShips[0].nv, tanker: mShips[1].nv, frig: mFrig.map((m) => m.nv), cap: mCap.map((m) => m.nv), ali: mAli.map((m) => m.nv), fau: mFau.map((m) => m.nv), lev: mLev.nv, nasa: [mRing.nv, mSpire.nv, mHubS.nv, mDockS.nv] };
}
function v122Draw(vd, pass) {
  if (pass) return;
  gl.useProgram(P_SHIP.p);
  if (P_SHIP.u.uVd) gl.uniform1f(P_SHIP.u.uVd, vd);
  gl.uniform1i(P_SHIP.u.uShip, 6);
  for (let i = 0; i < 4; i++) draw(P_SHIP, CAP[i], mCap[i]);
  gl.uniform1i(P_SHIP.u.uShip, 7);
  for (let i = 0; i < 4; i++) draw(P_SHIP, ALI[i], mAli[i]);
  gl.uniform1i(P_SHIP.u.uShip, 8);
  for (let i = 0; i < 4; i++) draw(P_SHIP, FAU[i], mFau[i]);
  gl.uniform1i(P_SHIP.u.uShip, 6);
  draw(P_SHIP, LLev, mLev);
}
let puffT = 0;
function v122Sim(dt, fly) {
  v122Meters(dt, fly);
  puffT -= dt;
  if (puffT > 0) return;
  puffT = .35;
  for (const a of NPCS) {
    if (a.big) { const s = a.size * .05; put(DPa, a.x - px - a.fx * a.size * .9, a.y - py - a.fy * a.size * .9, a.z - pz - a.fz * a.size * .9, s, 0, 0, 0, .2, .35, .75, 1.1, 0); continue; }
    if (a.s > 8) continue;
    const bl = .4 + .6 * Math.sin(tm * 2.2 + a.i);
    put(DPa, a.x - px - a.fx * a.size, a.y - py - a.fy * a.size, a.z - pz - a.fz * a.size, a.size * .18, 0, 0, 0, .3, .45 * bl, .7 * bl, 1.1 * bl, 0);
  }
}

const navBuild121 = navBuild;
navBuild = function () {
  navBuild121();
  const add = (arr, name, id) => { const r = nearestOf(arr); if (!r || r[0] > 1e12) return; NAV.push({ id, name, kind: 'ship', x: px + r[1], y: py + r[2], z: pz + r[3] }); };
  if (CAP) add(CAP, 'CAPITAL', 'cap');
  if (ALI) add(ALI, 'ALIEN CONTACT', 'ali');
  if (LLev && LLev.n) { const r = nearInst(LLev); if (r[0] < 1e12) NAV.push({ id: 'lev', name: 'LEVIATHAN', kind: 'ship', x: px + r[1], y: py + r[2], z: pz + r[3] }); }
};

const panel121 = panel;
panel = function (title, sub, list, foot) {
  if (title === 'Paused' && !list.some((d) => d.name === 'Difficulty')) {
    const d = diffI();
    list.splice(1, 0, { name: 'Difficulty', kind: DIFFN[d], desc: DIFFHINT[d], run: () => { CFG.diff = (d + 1) % 4; keep('ibCfg', JSON.stringify(CFG)); setUi(); if (xr || hudForce) vrMenu(); else pausePanel(); } });
  }
  panel121(title, sub, list, foot);
};
function v122Settings() {
  if (setP.style.display === 'none') return;
  const host = setP.querySelector('div');
  if (!host || host.querySelector('[data-k="diff"]')) return;
  const d = diffI(), el = document.createElement('div');
  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1px solid rgb(var(--hcr) / .35);padding:10px 0"><span>Difficulty</span><button data-k="diff" style="min-width:168px;padding:7px 14px;background:rgb(var(--hcr) / .06);color:var(--hc);border:1px solid rgb(var(--hcr) / .5);font:inherit;cursor:pointer">${DIFFN[d]}</button></div><p style="color:rgb(var(--hcr) / .75);margin:6px 0 12px;font-size:13px">${DIFFHINT[d]}</p>`;
  const tabs = host.children[1];
  if (tabs && tabs.nextSibling) host.insertBefore(el, tabs.nextSibling); else host.appendChild(el);
}
const setUi121 = setUi;
setUi = function () { setUi121(); v122Settings(); };
const setClick121 = setP.onclick;
setP.onclick = (e) => {
  const k = e.target.dataset && e.target.dataset.k;
  if (k === 'diff') { CFG.diff = (diffI() + 1) % 4; setUi(); return; }
  if (setClick121) setClick121(e);
};

function findLayer(L, ok) {
  const C = L.C, cx = Math.floor(px / C), cy = Math.floor(py / C), cz = Math.floor(pz / C);
  for (let r = 0; r < 10; r++) for (let k = -r; k <= r; k++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r) continue;
    const v = ok(C, cx + i, cy + j, cz + k);
    if (v) return { x: (cx + i + gj0) * C, y: (cy + j + gj1) * C, z: (cz + k + gj2) * C, s: v };
  }
  return null;
}
function v122Hooks() {
  const E = window.ES;
  E.frame = (x, y, z, dist) => {
    const l = dist || 80;
    px = x + l * .62; py = y + l * .28; pz = z + l * .55;
    const dx = x - px, dy = y - py, dz = z - pz, h = Math.hypot(dx, dy, dz) || 1;
    yaw = Math.atan2(dx, -dz); pitch = Math.asin(Math.max(-1, Math.min(1, dy / h))); snap = 1; vx = vy = vz = 0; thr = 0;
    for (const L of LAYERS) L.cx = 1e9;
  };
  E.cap = () => { const h = findLayer(LCap, capAt); if (!h) return 0; E.frame(h.x, h.y, h.z, h.s * 2.5); return h.s | 0; };
  E.ali = () => { const h = findLayer(LAli, aliAt); if (!h) return 0; E.frame(h.x, h.y, h.z, (h.s > 2 ? h.s : 840) * 2.4); return 1; };
  const closest = (arr) => { let best = null; for (const L of arr) { if (!L || !L.n) continue; const r = nearInst(L); if (r && r[0] < 1e14 && (!best || r[0] < best[0])) best = r; } return best; };
  E.nasa = () => { const h = closest(RV); if (!h) return 0; E.frame(px + h[1], py + h[2], pz + h[3], 1100); return 1; };
  E.mega = () => { const h = closest(MV); if (!h) return 0; E.frame(px + h[1], py + h[2], pz + h[3], 14000); return 1; };
  E.fauna = () => { const h = findLayer(LFau, (C, x, y, z) => { cellRnd(x, y, z, 33); if ((x | y | z) === 0) { gj0 = .7; gj1 = .12; gj2 = .22; return 28; } return hx(1) < .3 ? 20 : 0; }); if (!h) return 0; E.frame(h.x, h.y, h.z, 90); return 1; };
  E.levi = () => { const h = nearInst(LLev); if (!h || h[0] > 1e14) return 0; E.frame(px + h[1], py + h[2], pz + h[3], 1600); return 1; };
  E.bigShip = () => { const a = NPCS.find((q) => q.big); if (!a) return 0; E.frame(a.x, a.y, a.z, a.size * 2.3); return a.name; };
  E.haul = () => { const a = NPCS.find((q) => q.role === 0); if (!a) return 0; E.frame(a.x, a.y, a.z, 48); return a.name; };
  E.traderCam = () => { E.frame(430, -70, 260, 150); return 1; };
  E.air = (v) => { if (v != null) { ST.o2 = v; o2Hyp = v < 18 ? (18 - v) / 18 * .9 : 0; if (v < 16) { sysWarn = `OXYGEN ${v | 0}% · VISION NARROWING · FIND AIR`; sysWarnC = '#ff5d4f'; hudLast = 0; } } return [ST.o2 | 0, +o2Hyp.toFixed(2), sysWarn]; };
  E.diff = (i) => { if (i != null) { CFG.diff = i; keep('ibCfg', JSON.stringify(CFG)); } return [DIFFN[diffI()], diffK()]; };
  E.meters = () => ({ o2: ST.o2 | 0, hull: ST.hull | 0, fuel: +(ST.fuel || 0).toFixed(1), spice: (ST.spice || 0) | 0, diff: DIFFN[diffI()], lens: ST.lens || 0, warn: sysWarn });
  E.v122 = () => ({ draws: frameDraws, verts: frameVerts, cap: CAP.map((L) => L.n), ali: ALI.map((L) => L.n), fau: FAU.map((L) => L.n), lev: LLev.n, nv: V122N });
  E.openSet = () => { setP.style.display = 'block'; setUi(); };
  E.hideSet = () => { setP.style.display = 'none'; };
  E.vrSet = () => { hudForce = 1; vrMenu(); };
}
