// v1.23: the crash guard's neighbours, a vista worth arriving to, live events, voices, and loot.
function v123Quiet() {
  const d = typeof diffI === 'function' ? diffI() : 1;
  return [24, 38, 52, 70][d] || 38;
}
function shipMul(k) {
  const s = (ST && ST.ship) | 0;
  if (k === 'sh') return [1, .86, 1.12, 1.4, .94][s] || 1;
  if (k === 'sc') return [1, 1.15, .9, .85, 1.45][s] || 1;
  if (k === 'hold') return [0, -2, 6, -2, 2][s] || 0;
  if (k === 'mine') return s === 1 ? 1.35 : 1;
  return 1;
}

const HULLS = [
  ['Pathfinder', 'The ship you woke in. Balanced.', 0],
  ['Prospector', 'A miner. The laser bites deeper. Less plate.', 900],
  ['Haul', 'A freighter hull. The hold grows. She turns like a barge.', 1400],
  ['Lance', 'A gunship. Shields and little else.', 1600],
  ['Surveyor', 'Long eyes. The scanner reaches.', 1200]
];
function shipyardPanel() {
  const cur = ST.ship | 0;
  panel('Shipyard', HULLS[cur][0] + ' · ' + ST.credits + ' credits', HULLS.map((h, i) => ({
    name: h[0], kind: i === cur ? 'fitted' : h[2] + ' cr', desc: h[1],
    run: i === cur ? undefined : () => {
      if (ST.credits < h[2]) return tip('The yard wants ' + h[2] + ' credits', 3000);
      ST.credits -= h[2]; ST.ship = i; save(); showCargo(); tip(h[0] + ' is yours. She will feel different.', 4000); shipyardPanel();
    }
  })), 'A selects · B closes');
}

let commKind = 'pilot';
function guessVoice(s) {
  const t = s || '';
  if (/silence|alien|it sings|nonhuman/i.test(t)) return 'silence';
  if (/raider|pirate|cut your engines/i.test(t)) return 'pirate';
  if (/control|patrol|combine|mc /i.test(t)) return 'combine';
  if (/lantern|order|rite/i.test(t)) return 'lantern';
  if (/hauler|union|trader/i.test(t)) return 'hauler';
  if (/station|yard|dock/i.test(t)) return 'station';
  return 'pilot';
}
const VOX = {
  combine: { p: 118, rate: .92, f1: 700, f2: 1400, type: 'triangle', grit: .05, verb: 0, gain: .05 },
  lantern: { p: 96, rate: .72, f1: 420, f2: 980, type: 'sine', grit: .02, verb: .35, gain: .045 },
  hauler: { p: 88, rate: 1.05, f1: 500, f2: 1600, type: 'sawtooth', grit: .22, verb: 0, gain: .05 },
  pirate: { p: 74, rate: 1.25, f1: 380, f2: 2100, type: 'square', grit: .45, verb: 0, gain: .05 },
  silence: { p: 54, rate: .45, f1: 240, f2: 640, type: 'sine', grit: .08, verb: .5, gain: .04 },
  station: { p: 132, rate: .85, f1: 800, f2: 1800, type: 'triangle', grit: .04, verb: .08, gain: .048 },
  pilot: { p: 104, rate: 1, f1: 560, f2: 1500, type: 'sawtooth', grit: .1, verb: .05, gain: .046 },
  rival: { p: 90, rate: 1.1, f1: 460, f2: 1900, type: 'square', grit: .3, verb: .1, gain: .05 }
};
let voxNoise = null, voxDelay = null;
function voxBuf() {
  if (voxNoise || !AC) return voxNoise;
  const n = AC.sampleRate * 1, b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  voxNoise = b;
  voxDelay = AC.createDelay(); voxDelay.delayTime.value = .11;
  const g = AC.createGain(); g.gain.value = .28; voxDelay.connect(g); g.connect(voxDelay);
  return b;
}
radioVoice = function (len) {
  if (!AC || AC.state !== 'running' || !CFG.vCht) return;
  const k = VOX[commKind] || VOX.pilot, t0 = AC.currentTime + .04;
  const out = AC.createGain(), bp = AC.createBiquadFilter(), hp = AC.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = .8; hp.type = 'highpass'; hp.frequency.value = 280;
  out.gain.value = k.gain * CFG.vCht;
  bp.connect(hp).connect(out);
  if (k.verb && voxBuf()) { const vg = AC.createGain(); vg.gain.value = k.verb; out.connect(vg).connect(voxDelay); voxDelay.connect(AG); }
  out.connect(AG);
  const src = AC.createBufferSource(); src.buffer = voxBuf(); src.loop = true;
  const ng = AC.createGain(); ng.gain.setValueAtTime(.0001, t0); ng.gain.linearRampToValueAtTime(.02 + k.grit * .05, t0 + .03); ng.gain.linearRampToValueAtTime(.0001, t0 + len);
  const nf = AC.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = .6;
  src.connect(nf).connect(ng).connect(bp); src.start(t0); src.stop(t0 + len + .05);
  let t = t0, n = 0;
  while (t < t0 + len && n < 16) {
    const d = (.06 + Math.random() * .1) / k.rate, o = AC.createOscillator(), g = AC.createGain(), f1 = AC.createBiquadFilter(), f2 = AC.createBiquadFilter();
    const p = k.p * (.82 + Math.random() * .36);
    o.type = k.type; o.frequency.setValueAtTime(p, t); o.frequency.linearRampToValueAtTime(p * (.9 + Math.random() * .2), t + d);
    f1.type = f2.type = 'bandpass'; f1.frequency.value = k.f1 * (.8 + Math.random() * .4); f1.Q.value = 6; f2.frequency.value = k.f2 * (.85 + Math.random() * .3); f2.Q.value = 5;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.8, t + .018); g.gain.linearRampToValueAtTime(.0001, t + d);
    o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(bp); o.start(t); o.stop(t + d + .02);
    t += d + (Math.random() < .2 ? .08 : .012); n++;
  }
};
const comm0 = comm;
comm = function (s, kind) { commKind = kind || guessVoice(s); comm0(s); };

function codexAdd(id, title, text) {
  ST.codex = ST.codex || [];
  if (ST.codex.some((e) => e.id === id)) return;
  ST.codex.push({ id, title, text });
  if (ST.codex.length > 80) ST.codex.shift();
  save();
  tip('Codex · ' + title, 3500);
}

const shatter0 = shatter;
shatter = function (x, y, z, size, hue, tier, type, ax, ay, az, ix, iy, iz) {
  shatter0(x, y, z, size, hue, tier, type, ax, ay, az, ix, iy, iz);
  v123Loot(x, y, z, size, type, ax, ay, az);
};
function v123Loot(x, y, z, size, type, ax, ay, az) {
  const belt = (SYS && SYS.a && SYS.a.cry > .4) ? 2 : (SYS && SYS.t) || 0;
  const ty = type || belt;
  const n = 1 + (size > 14 ? 1 : 0) + (ty === 6 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const R = Math.random(), spec = R < .08 ? 14 : R < .2 ? 13 : R < .38 ? 12 : R < .55 ? 11 : 0;
    let ore = 1;
    if (ty === 2 || ty === 5) ore = R < .5 ? 1 : 2;
    else if (ty === 3) ore = R < .4 ? 1 : R < .75 ? 2 : 3;
    else if (ty === 4) ore = R < .45 ? 2 : 3;
    else if (ty === 6) ore = R < .3 ? 3 : R < .7 ? 4 : 5;
    else if (R < .12) ore = 3; else if (R < .4) ore = 2;
    rdir();
    const sp = 4 + Math.random() * 8;
    spawnD(2, x + rd[0] * size * .2, y + rd[1] * size * .2, z + rd[2] * size * .2, ax + rd[0] * sp, ay + rd[1] * sp, az + rd[2] * sp, .6, ore, ore, spec, 90);
  }
}
function v123Collect(i) {
  const tag = dType[i];
  if (!tag) return false;
  const names = { 11: 'WATER ICE', 12: 'VOLATILES', 13: 'NICKEL-IRON', 14: 'RELIC' };
  if (tag === 11) { ST.o2 = Math.min(100, (ST.o2 == null ? 100 : ST.o2) + 10); pop('WATER ICE · O2 +10', '#7fd8ff'); }
  else if (tag === 12) { ST.fuel = Math.min(100, (ST.fuel || 0) + 8); pop('VOLATILES · FUEL +8', '#ffd84a'); }
  else if (tag === 13) { if (ST.hull < 92) { ST.hull = Math.min(100, ST.hull + 4); pop('NICKEL-IRON · HULL +4', '#c3ccdc'); } else { cargo[1] = (cargo[1] || 0) + 1; pop('+1 FERRITE', '#c3ccdc'); } }
  else if (tag === 14) { const cr = 80 + (Math.random() * 220 | 0); ST.credits += cr; ST.spice = Math.min(100, (ST.spice || 0) + 4); pop('RELIC · +' + cr + ' CR', '#cf6bff'); codexAdd('relic' + (cr % 7), 'A pocket relic', 'Something in the rock was older than the belt.'); }
  else return false;
  showCargo(); save();
  return true;
}

let EVQ = null, evCool = 50;
function v123Events(dt, fly) {
  if (!fly || SYS.atm || jumpTo || jpOpen) return;
  if (EVQ) { v123EventTick(dt); return; }
  evCool -= dt;
  if (evCool > 0) return;
  const d = typeof diffI === 'function' ? diffI() : 1;
  evCool = [150, 110, 85, 70][d] + Math.random() * 40;
  const kinds = ['distress', 'ambush', 'silence', 'comet', 'flare', 'derelict'];
  const kind = kinds[(Math.random() * kinds.length) | 0];
  v123EventStart(kind);
}
function v123EventStart(kind) {
  const R = Math.random;
  const ang = R() * 6.28, dist = 900 + R() * 700;
  const x = px + Math.cos(ang) * dist, z = pz + Math.sin(ang) * dist, y = py + (R() - .5) * 200;
  if (kind === 'distress') {
    const a = mkShip(0, x, y, z, pickN(Math.random, NPN), { distress: 1, hold: 1, sp: 0, fac: SYS.fac });
    ensureWp(a); a.wp = [a.x, a.y, a.z];
    EVQ = { kind, t: 0, ph: 'warn', a, x, y, z };
    commKind = 'hauler'; comm(a.name + ' on distress: "Engines are cold. Anyone reading, we are drifting."', 'hauler');
  } else if (kind === 'ambush') {
    EVQ = { kind, t: 0, ph: 'warn', x, y, z };
    comm('A tight-beam squeal, then nothing. Something is lining up on your lane.', 'pirate');
  } else if (kind === 'silence') {
    EVQ = { kind, t: 0, ph: 'warn', x, y, z };
    comm('The band fills with a sound that is not a voice. It is coming closer.', 'silence');
    codexAdd('sil' + (SYS.id % 9), 'A Silence on the band', 'It does not use words. The instruments still flinch.');
  } else if (kind === 'comet') {
    EVQ = { kind, t: 0, ph: 'live', x: px + 2000, y: py + 300, z: pz - 400, vx: -80, vy: -6, vz: 30 };
    comm('Survey note: a comet is crossing this lane. Ice, if you can bear the dust.', 'station');
  } else if (kind === 'flare') {
    EVQ = { kind, t: 0, ph: 'warn' };
    comm(SYS.name + ' control: solar flare in a few seconds. Put the hull in shadow. Point away from the star.', 'station');
  } else {
    EVQ = { kind: 'derelict', t: 0, ph: 'live', x, y, z, opened: 0 };
    comm('A dead hull on the scope. No beacon. The hatch light is still drawing power.', 'pilot');
  }
}
function v123EventTick(dt) {
  const E = EVQ; E.t += dt;
  if (E.kind === 'distress' && E.a && !E.a.dead) {
    const d = Math.hypot(E.a.x - px, E.a.y - py, E.a.z - pz);
    if (E.ph === 'warn' && d < 500) {
      E.ph = 'choice';
      panel('Distress', E.a.name, [
        { name: 'Spare fuel and a tow', desc: 'Ten fuel. They pay you back, and the Union hears about it.', run: () => { if ((ST.fuel || 0) < 10) return tip('You do not have ten fuel to spare', 3000); ST.fuel -= 10; ST.credits += 160; gain({ rep: 6, xp: 20 }); pop('+160 CR · UNION', '#ffd84a'); E.a.wp = [E.a.x + 4000, E.a.y, E.a.z]; E.a.hold = 0; E.a.sp = 40; EVQ = null; } },
        { name: 'Strip what you can', desc: 'They cannot stop you. The lane will remember.', run: () => { cargo[1] = (cargo[1] || 0) + 2; ST.credits += 40; gain({ rep: -8 }); pop('+2 FERRITE', '#c3ccdc'); E.a.dead = 1; EVQ = null; } },
        { name: 'Call it in and leave', desc: 'Patrols are slow. You did the decent minimum.', run: () => { gain({ rep: 2, xp: 8 }); EVQ = null; } }
      ], 'A selects · B closes');
    }
    if (E.t > 90 && E.ph === 'warn') { tip(E.a.name + ' goes quiet.', 3000); E.a.dead = 1; EVQ = null; }
  } else if (E.kind === 'ambush') {
    if (E.ph === 'warn' && E.t > 7) {
      E.ph = 'live';
      if (typeof cmAmbush === 'function') cmAmbush(2 + (Math.random() < .4 ? 1 : 0), 'player');
      else mkShip(5, E.x, E.y, E.z, freshRaiderName(Math.random), { hunter: 1 });
      comm('Raiders drop out of the clutter. "That one. Take the hold."', 'pirate');
    }
    if (E.t > 50) EVQ = null;
  } else if (E.kind === 'silence') {
    put(DPa, E.x - px, E.y - py, E.z - pz, 30 + Math.sin(tm * 2) * 8, 0, 0, 0, .2, .15, .9, .55, 0);
    E.x += (px - E.x) * dt * .15; E.z += (pz - E.z) * dt * .15;
    if (E.ph === 'warn' && E.t > 6) {
      E.ph = 'choice';
      panel('The Silence', 'It is alongside', [
        { name: 'Hold still and listen', desc: 'Spice condenses on the canopy. The charts gain a page you cannot read.', run: () => { ST.spice = Math.min(100, (ST.spice || 0) + 12); gain({ xp: 30 }); codexAdd('listen' + (SYS.id % 5), 'What the Silence said', 'Not words. A direction, and the feeling of being measured.'); pop('SPICE +12', '#ff3b5c'); EVQ = null; } },
        { name: 'Burn away', desc: 'It does not chase. It notes the choice.', run: () => { gain({ xp: 8 }); EVQ = null; } },
        { name: 'Fire into it', desc: 'The sound stops. Your standing with everyone nearby drops.', run: () => { gain({ rep: -6, xp: 10 }); EVQ = null; } }
      ], 'A selects · B closes');
    }
    if (E.t > 40 && E.ph !== 'choice') EVQ = null;
  } else if (E.kind === 'comet') {
    E.x += E.vx * dt; E.y += E.vy * dt; E.z += E.vz * dt;
    put(DPa, E.x - px, E.y - py, E.z - pz, 22, 0, 0, 0, .3, .7, .85, 1, 0);
    put(DPa, E.x - px - E.vx * .4, E.y - py, E.z - pz - E.vz * .4, 40, 0, 0, 0, .1, .25, .35, .5, 0);
    const d = Math.hypot(E.x - px, E.y - py, E.z - pz);
    if (d < 180 && !E.got) { E.got = 1; ST.o2 = Math.min(100, (ST.o2 == null ? 100 : ST.o2) + 16); ST.fuel = Math.min(100, (ST.fuel || 0) + 6); pop('COMET ICE · O2 +16 · FUEL +6', '#7fd8ff'); codexAdd('comet' + (SYS.id % 4), 'A comet in ' + SYS.name, 'Ice and a little fuel, if you fly through the dust.'); }
    if (E.t > 40) EVQ = null;
  } else if (E.kind === 'flare') {
    if (E.t > 6 && E.t < 16) {
      const sun = sFx * SUN[0] + sFy * SUN[1] + sFz * SUN[2];
      if (sun > .35) { if (typeof cook === 'function') cook(.35 * dt * 8); }
      else pop('IN SHADOW', '#7fd8ff');
    }
    if (E.t > 18) { tip('The flare passes.', 2500); EVQ = null; }
  } else if (E.kind === 'derelict') {
    put(DPa, E.x - px, E.y - py, E.z - pz, 14, 0, 0, 0, .4, .4, .5, .7, 0);
    const d = Math.hypot(E.x - px, E.y - py, E.z - pz);
    if (d < 160 && !E.opened && !jpOpen) {
      E.opened = 1;
      panel('Derelict', 'The hatch answers', [
        { name: 'Board and search', desc: 'A cache, a log, or a surprise.', run: () => { const r = Math.random(); if (r < .4) { cargo[2] = (cargo[2] || 0) + 2; pop('+2 PYRITE', '#ffd84a'); } else if (r < .75) { ST.credits += 120; pop('+120 CR', '#ffd84a'); } else { ST.spice = Math.min(100, (ST.spice || 0) + 8); pop('SPICE +8', '#ff3b5c'); } codexAdd('der' + (SYS.id % 6), 'A boarded hull', 'Someone left the kettle and the log. The log stops mid-word.'); EVQ = null; } },
        { name: 'Mark it and leave', desc: 'The charts keep the position.', run: () => { gain({ xp: 12 }); EVQ = null; } }
      ], 'A selects · B closes');
    }
    if (E.t > 80) EVQ = null;
  }
}

let HERO = null;
const HST = Dyn(1), HCAP = Dyn(1), HLEV = Dyn(1), HSW = Dyn(8);
function v123LayoutHero() {
  const yaw0 = yaw, fx = Math.sin(yaw0), fz = -Math.cos(yaw0), rdx = -fz, rdz = fx;
  const place = (dist, side, up) => ({ x: px + fx * dist + rdx * side, y: py + up, z: pz + fz * dist + rdz * side });
  const R = mulberry32(((SYS && SYS.salt) || 1) ^ 0xB155);
  HERO = {
    station: place(1500 + R() * 300, -420 - R() * 200, -40),
    capital: place(2400 + R() * 400, 620, 80),
    whale: place(3200 + R() * 200, 180, -200),
    swarm: place(980, -160, 30),
    sail: R()
  };
}
function v123PutHero() {}
function v123Draw(vd) {
  if (!LMore || !mSail || SYS.atm) return;
  gl.useProgram(P_LIFE.p);
  if (P_LIFE.u.uVd) gl.uniform1f(P_LIFE.u.uVd, vd);
  gl.uniform1i(P_LIFE.u.uKind, 1);
  draw(P_LIFE, LMore, mSail);
}

let mSail = null, mBag = null, mCrystal = null, LMore = null;
function sailMesh() {
  const V = [], I = [];
  box(V, I, [0, 0, 0], [.02, 0, 0], [0, .55, 0], [0, 0, .04]);
  box(V, I, [.7, .05, .05], [.62, 0, .2], [0, .015, 0], [.05, 0, .35]);
  box(V, I, [-.7, .05, .05], [.62, 0, -.2], [0, .015, 0], [-.05, 0, .35]);
  box(V, I, [0, -.2, -.55], [.06, 0, 0], [0, .28, 0], [0, 0, .4]);
  return mesh(V, I);
}
function bagMesh() {
  const V = [], I = [];
  box(V, I, [0, .15, 0], [.55, 0, 0], [0, .42, 0], [0, 0, .38]);
  box(V, I, [0, -.35, 0], [.12, 0, 0], [0, .2, 0], [0, 0, .1]);
  for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; box(V, I, [Math.cos(a) * .35, -.55, Math.sin(a) * .25], [Math.cos(a) * .04, 0, Math.sin(a) * .04], [0, .22, 0], [-Math.sin(a) * .03, 0, Math.cos(a) * .03]); }
  return mesh(V, I);
}
function crystalBeast() {
  const V = [], I = [];
  box(V, I, [0, 0, 0], [.18, 0, 0], [0, .18, 0], [0, 0, .28]);
  for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; box(V, I, [Math.cos(a) * .45, Math.sin(a) * .2, 0], [Math.cos(a) * .28, 0, 0], [0, .05, 0], [0, 0, .05]); }
  return mesh(V, I);
}
function genMore(L, wx, wy, wz, sx, sy, sz) {
  if (SYS.atm) return;
  cellRnd(wx, wy, wz, 41);
  const show = (wx | wy | wz) === 0;
  if (!show && hx(1) > .22) return;
  const n = show ? 5 : 1 + (hx(1) > .5 ? 1 : 0);
  for (let k = 0; k < n; k++) put(L, sx, sy, sz, (show ? 18 : 9) + 14 * hx(1), gj0, gj1, gj2, gsd, hx(3), hx(3), hx(1), k);
}
function v123Boot() {
  mSail = sailMesh(); mBag = bagMesh(); mCrystal = crystalBeast();
  LMore = Layer(2800, 4, 3, genMore, 41);
  LAYERS.push(LMore);
}
const v122Boot0 = v122Boot;
v122Boot = function () { v122Boot0(); v123Boot(); };
const v122Draw0 = v122Draw;
v122Draw = function (vd, pass) { v122Draw0(vd, pass); if (!pass && typeof v123Draw === 'function') v123Draw(vd); };

function v123Near() {
  if (SYS.atm || NPCS.length > 34) return;
  const spots = [[520, 40, 980], [-480, -20, 860], [180, 80, 1240], [-220, 10, 1500], [640, -30, 1700], [40, 60, 2100]];
  const roles = [0, 2, 1, 6, 0, 3];
  for (let i = 0; i < spots.length && NPCS.length < 36; i++) {
    const r = roles[i];
    const a = mkShip(r, px + spots[i][0] * .35, py + spots[i][1], pz + spots[i][2] * .25, (r === 2 ? 'Patrol ' : r === 6 ? 'Survey ' : '') + pickN(Math.random, NPN), { fac: SYS.fac, greet: 0 });
    ensureWp(a);
    a.var = (a.fac || 0) % 3;
  }
}
const npcSpawnV = npcSpawn;
npcSpawn = function () { npcSpawnV(); try { v123Near(); for (const a of NPCS) ensureWp(a); } catch (e) { console.error(e); } };

const arriveV = arrive;
arrive = function (sec, loc, quiet) {
  arriveV(sec, loc, quiet);
  try {
    if (!SYS.atm && SYS.pl) {
      let best = 0, bi = 0;
      for (let k = 0; k < 3; k++) if ((SYS.pl[k * 4 + 3] || 0) > best) { best = SYS.pl[k * 4 + 3]; bi = k; }
      if (best > .02) {
        yaw = Math.atan2(SYS.pl[bi * 4], -SYS.pl[bi * 4 + 2]);
        pitch = Math.max(-.22, Math.min(.32, Math.asin(Math.max(-1, Math.min(1, SYS.pl[bi * 4 + 1] * .65)))));
        snap = 1;
      }
    }
    v123LayoutHero();
  } catch (e) { console.error(e); }
};

let BR = null;
function v123Bracket(c) {
  try { return v123BracketDraw(c); } catch (e) { console.error('bracket', e); try { gl.useProgram(P_HUD.p); } catch (e2) {} BR = null; return false; }
}
function v123BracketDraw(c) {
  if (!BR) {
    const vs = `#version 300 es
    uniform vec3 uC,uR,uU;uniform float uS,uA;uniform mat4 uP;
    layout(location=0)in vec3 aP;void main(){vec3 p=uC+(uR*aP.x+uU*aP.y)*uS;gl_Position=uVP*vec4(p,1.);}`;
    const fs = `#version 300 es
    precision highp float;uniform float uA;out vec4 o;void main(){o=vec4(vec3(.85,.95,1.)*uA,uA);}`;
    const srcV = HD + `uniform vec3 uC,uR,uU;uniform float uS;layout(location=0)in vec3 aP;void main(){vec3 p=uC+uR*aP.x*uS+uU*aP.y*uS;gl_Position=uVP*vec4(p,1.);}`;
    const srcF = HD + `uniform float uA;out vec4 o;void main(){o=vec4(vec3(.8,.92,1.)*uA,uA);}`;
    BR = prog(srcV, srcF);
    const v = [], s = .5, t = .045, c = [[-1, -1, 1, 0], [-1, -1, 0, 1], [1, -1, -1, 0], [1, -1, 0, 1], [-1, 1, 1, 0], [-1, 1, 0, -1], [1, 1, -1, 0], [1, 1, 0, -1]];
    for (const q of c) {
      const x = q[0], y = q[1], dx = q[2], dy = q[3];
      v.push(x * s, y * s, 0, x * s + dx * t, y * s, 0, x * s, y * s + dy * t, 0);
    }
    BR.buf = gl.createBuffer(); BR.vao = gl.createVertexArray(); BR.n = v.length / 3;
    gl.bindVertexArray(BR.vao); gl.bindBuffer(gl.ARRAY_BUFFER, BR.buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0); gl.bindVertexArray(null);
  }
  const tx = c.x - px - eox, ty = c.y - py - eoy, tz = c.z - pz - eoz;
  const dist = Math.hypot(tx, ty, tz) || 1;
  const align = (tx * eFx + ty * eFy + tz * eFz) / dist;
  if (align < .82) return false;
  const depth = Math.max(16, Math.min(dist * .9, 90));
  const k = depth / dist;
  const fade = align > .94 ? 1 : (align - .82) / .12;
  gl.useProgram(BR.p); gl.bindVertexArray(BR.vao);
  gl.uniform3f(BR.u.uC, tx * k, ty * k, tz * k);
  gl.uniform3f(BR.u.uR, eRx, eRy, eRz); gl.uniform3f(BR.u.uU, eUx, eUy, eUz);
  gl.uniform1f(BR.u.uS, depth * .018); gl.uniform1f(BR.u.uA, .55 * fade);
  gl.disable(gl.DEPTH_TEST); gl.drawArrays(gl.TRIANGLES, 0, BR.n);
  gl.useProgram(P_HUD.p);
  return true;
}

function v123Sim(dt, fly) {
  try { v123PutHero(); } catch (e) { console.error(e); }
  try { v123Events(dt, fly); } catch (e) { console.error('event', e); EVQ = null; }
}

const panelV = panel;
panel = function (title, sub, list, foot) {
  if (title === 'Trader' && list && !list.some((d) => d.name === 'Shipyard')) list.push({ name: 'Shipyard', kind: HULLS[ST.ship | 0][0], desc: 'A different hull. The yard keeps your charts.', run: shipyardPanel });
  if (title === 'Journal' && ST.codex && ST.codex.length) list.push({ name: 'Codex', kind: ST.codex.length + ' entries', desc: ST.codex.slice(-3).map((e) => e.title).join(' · ') });
  panelV(title, sub, list, foot);
};

function v123Hooks() {
  if (ST.ship == null) ST.ship = 0;
  if (!ST.codex) ST.codex = [];
  const E = window.ES;
  E.stressNpc = (sec) => {
    const secs = sec || 180, errs = [];
    npcSpawn();
    for (let i = 0; i < 4; i++) {
      const lead = mkShip(2, px + i * 40, py, pz + 200, 'Lead ' + i, {});
      const wing = mkShip(2, lead.x + 30, lead.y, lead.z + 20, 'Wing ' + i, { lead, off: [30, 0, 24] });
      ensureWp(wing);
    }
    let t = 0;
    while (t < secs) {
      try {
        if ((t * 20 | 0) % 30 === 0) {
          const lead = NPCS.find((a) => NPCS.some((b) => b.lead === a));
          if (lead) { lead.dead = 1; lead.hp = 0; }
        }
        npcTick(.05);
        for (let i = NPCS.length - 1; i >= 0; i--) if (NPCS[i].dead) NPCS.splice(i, 1);
        if (NPCS.length < 6) npcSpawn();
      } catch (e) { errs.push(String(e && e.message || e)); if (errs.length > 8) break; }
      t += .05;
    }
    const bad = NPCS.filter((a) => !a.lead && !wpOk(a)).length;
    return { sec: t, errs, bad, n: NPCS.length };
  };
  E.xrPress = (name) => {
    if (name === 'a' || name === 'A') interact();
    else if (name === 'x' || name === 'X') journalPanel();
    else if (name === 'pause') pausePanel();
    return [!!jpOpen, $('jh') && $('jh').textContent];
  };
  E.recenter = () => { if (typeof xrRecenter === 'function') xrRecenter(); return 1; };
  E.event = (k) => { v123EventStart(k || 'distress'); return EVQ && EVQ.kind; };
  E.loot = () => v123Loot(px + 5, py, pz + 5, 8, 0, 0, 0, 0);
}
