// v1.24: vertex budget first. Quest (LV >= 1, one eye, home gate) aims for
// <= 1_000_000 vertices and <= 80 draws. Desktop high (LV 0) may spend more.
const QUEST = LV >= 1;
const IE_BUDGET = { questVerts: 1000000, questDraws: 80 };

const packV = pack;
pack = function (L, s, hue, hv, w) {
  if (!L || L.per <= 8) return packV(L, s, hue, hv, w);
  const old = L.per;
  L.per = Math.max(QUEST ? 3 : 6, old * (QUEST ? .38 : .7) | 0);
  packV(L, s, hue, hv, w);
  L.per = old;
};
genMore = function () {};
const growV = grow;
grow = function (L, n, v, sx, sy, sz, s, w) {
  growV(L, QUEST ? Math.max(1, n * .45 | 0) : n, v, sx, sy, sz, s, w);
};

function addTorus(V, I, R, r, nM, nT, mat, uy) {
  const s0 = V.length / 8;
  for (let j = 0; j <= nT; j++) {
    const v = j / nT * 6.2831853, cv = Math.cos(v), sv = Math.sin(v);
    for (let i = 0; i <= nM; i++) {
      const u = i / nM * 6.2831853, cu = Math.cos(u), su = Math.sin(u), rr = R + r * cv;
      V.push(rr * cu, r * sv, rr * su, cv * cu, sv, cv * su, mat, uy || 0);
    }
  }
  const stride = nM + 1;
  for (let j = 0; j < nT; j++) for (let i = 0; i < nM; i++) {
    const a = s0 + j * stride + i, b = a + stride;
    I.push(a, b, a + 1, a + 1, b, b + 1);
  }
}
function smoothStation() {
  const V = [], I = [], nM = QUEST ? 32 : 48, nT = QUEST ? 8 : 10;
  addTorus(V, I, 1, .058, nM, nT, 0, 0);
  addTorus(V, I, .9, .014, Math.max(20, nM - 8), QUEST ? 6 : 8, 11, 0);
  for (let k = 0; k < 6; k++) {
    const g = k / 6 * 6.2831853, c = Math.cos(g), s = Math.sin(g);
    box(V, I, [c * .48, 0, s * .48], [c * .4, 0, s * .4], [0, .016, 0], [-s * .016, 0, c * .016], 0);
    box(V, I, [c * 1.02, s * .02, s * 1.02], [c * .07, 0, s * .07], [-s * .045, .05, c * .045], [-s * .05, 0, c * .05], k % 2 ? 8 : 0);
    if (k % 2 === 0) box(V, I, [c * 1.02, -0.02, s * 1.02], [c * .05, 0, s * .05], [0, .03, 0], [-s * .04, 0, c * .04], 2);
    lamp(V, I, c * 1.12, s * .08, s * 1.12, .018);
  }
  slab(V, I, [[.12, .16, .02], [.95, .42, .03], [.9, .5, .03], [.1, .22, .02]], .006, 10, 0);
  slab(V, I, [[-.12, .16, .02], [-.95, .42, .03], [-.9, .5, .03], [-.1, .22, .02]], .006, 10, 0);
  loft(V, I, [[-.06, .08, .08], [0, .16, .16], [.07, .07, .07]], 10, 8);
  box(V, I, [0, .22, 0], [.008, 0, 0], [0, .16, 0], [0, 0, .008], 0);
  lamp(V, I, 0, .4, 0, .02);
  for (let k = 0; k < 4; k++) {
    const g = k * 1.5708 + .4, c = Math.cos(g), s = Math.sin(g);
    box(V, I, [c * .2, .18, s * .2], [c * .012, 0, s * .012], [0, .05, 0], [-s * .012, 0, c * .012], 0);
    lamp(V, I, c * .2, .24, s * .2, .012);
  }
  return shipOut(V, I);
}
ringMesh = function () { return smoothStation(); };
function v124Must(src, from, to) {
  if (src.indexOf(from) < 0) throw Error('v1.24 shader anchor missing: ' + from.slice(0, 90).replace(/\n/g, '\\n'));
  return src.replace(from, to);
}


function v124HeroDraw(vd) {
  if (!HSta || SYS.atm) return;
  gl.useProgram(P_SHIP.p);
  if (P_SHIP.u.uVd) gl.uniform1f(P_SHIP.u.uVd, vd);
  gl.uniform1i(P_SHIP.u.uShip, 6);
  draw(P_SHIP, HSta, HSta.mesh);
  draw(P_SHIP, HCap, HCap.mesh);
  draw(P_SHIP, HLv, HLv.mesh);
  gl.uniform1i(P_SHIP.u.uShip, 3);
  draw(P_SHIP, HFr, HFr.mesh);
  gl.uniform1i(P_SHIP.u.uShip, 9);
  draw(P_SHIP, HCr, HCr.mesh);
}
function v124EcoDraw(vd) {
  if (!FAU2 || SYS.atm) return;
  gl.useProgram(P_SHIP.p);
  if (P_SHIP.u.uVd) gl.uniform1f(P_SHIP.u.uVd, vd);
  gl.uniform1i(P_SHIP.u.uShip, 9);
  const plans = v124Plans();
  for (let i = 0; i < 3; i++) if (mPlan[plans[i]]) draw(P_SHIP, FAU2[i], mPlan[plans[i]]);
}

function v124Draw(vd, pass) {
  if (pass) return;
  v124Arc(vd);
  v124HeroDraw(vd);
  v124EcoDraw(vd);
}
const v122DrawPrev = v122Draw;
v122Draw = function (vd, pass) { v122DrawPrev(vd, pass); v124Draw(vd, pass); };

function arm(V, I, x, y, z, dx, dy, dz, mat, part) {
  const len = Math.hypot(dx, dy, dz) || 1, dir = [dx / len, dy / len, dz / len];
  const up = Math.abs(dir[1]) > .85 ? [1, 0, 0] : [0, 1, 0];
  let side = [dir[1] * up[2] - dir[2] * up[1], dir[2] * up[0] - dir[0] * up[2], dir[0] * up[1] - dir[1] * up[0]];
  const sl = Math.hypot(side[0], side[1], side[2]) || 1;
  side = [side[0] / sl, side[1] / sl, side[2] / sl];
  const bin = [dir[1] * side[2] - dir[2] * side[1], dir[2] * side[0] - dir[0] * side[2], dir[0] * side[1] - dir[1] * side[0]];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t = (i + .5) / n, w = .028 * (1 - i / n * .65);
    const c = [x + dx * t, y + dy * t, z + dz * t];
    const uy = part > 2 ? 3 + t : part;
    box(V, I, c, [dir[0] * len / n * .55, dir[1] * len / n * .55, dir[2] * len / n * .55], [side[0] * w, side[1] * w, side[2] * w], [bin[0] * w, bin[1] * w, bin[2] * w], mat, uy);
  }
}
function planRadial() {
  const V = [], I = [];
  loft(V, I, [[-.12, .08, .05], [0, .16, .1], [.14, .06, .04]], 8, 7);
  for (let k = 0; k < 8; k++) {
    const g = k / 8 * 6.2831853;
    arm(V, I, Math.cos(g) * .12, Math.sin(g) * .04, 0, Math.cos(g) * .55, Math.sin(g) * .12, Math.sin(g) * .2, 7, 1);
    lamp(V, I, Math.cos(g) * .62, Math.sin(g) * .14, Math.sin(g) * .18, .02);
  }
  return shipOut(V, I);
}
function planSegment() {
  const V = [], I = [], prof = [];
  for (let j = 0; j <= 16; j++) {
    const t = j / 16, bell = .04 + .07 * Math.sin(t * Math.PI) * (1 + .35 * Math.sin(j * 1.7));
    prof.push([t * 2 - 1, bell, bell * .72]);
  }
  tubeBody(V, I, prof, 8, 7, 0);
  for (let j = 2; j < 14; j += 3) fin(V, I, .05, 0, -1 + j * .12, .16, .03, .06);
  return shipOut(V, I);
}
function planSail() {
  const V = [], I = [];
  loft(V, I, [[-.35, .04, .03], [0, .08, .05], [.4, .03, .025]], 7, 7);
  slab(V, I, [[0, .02, -.15], [.85, .05, .05], [.7, .02, .55], [0, 0, .25]], .008, 7, 2);
  slab(V, I, [[0, .02, -.15], [-.8, -.02, .05], [-.62, .01, .5], [0, 0, .22]], .008, 7, 2);
  fin(V, I, 0, .04, .35, .22, .08, .3);
  return shipOut(V, I);
}
function planColony() {
  const V = [], I = [];
  loft(V, I, [[-.05, .05, .04], [.05, .08, .06], [.12, .03, .03]], 8, 7);
  for (let k = 0; k < 5; k++) {
    const g = k / 5 * 6.2831853, c = Math.cos(g) * .22, s = Math.sin(g) * .16;
    loft(V, I, [[.05 + s * .2, .02 + c, s], [.16 + s * .2, .1 + c, s], [.28 + s * .2, .02 + c, s]], 6, 7);
    arm(V, I, c, -.02, s, c * .3, -.45, s * .2, 7, 3);
  }
  return shipOut(V, I);
}
function planCrystal() {
  const V = [], I = [];
  box(V, I, [0, 0, 0], [.12, 0, 0], [0, .1, 0], [0, 0, .16], 7);
  for (let k = 0; k < 7; k++) {
    const g = k / 7 * 6.2831853, c = Math.cos(g), s = Math.sin(g);
    box(V, I, [c * .34, s * .12, s * .08], [c * .22, 0, 0], [s * .04, .05, 0], [0, 0, .04], k & 1 ? 5 : 7, 1);
  }
  lamp(V, I, 0, .16, 0, .03);
  return shipOut(V, I);
}
function planBag() {
  const V = [], I = [], prof = [];
  for (let j = 0; j <= 10; j++) {
    const t = j / 10, r = Math.sin(t * Math.PI) * .22 + .03;
    prof.push([(t - .35) * .7, r, r * .8]);
  }
  tubeBody(V, I, prof, 10, 7, 0);
  for (let k = 0; k < 6; k++) {
    const g = k / 6 * 6.2831853;
    arm(V, I, Math.cos(g) * .12, -.16, Math.sin(g) * .08, Math.cos(g) * .08, -.5, Math.sin(g) * .05, 7, 3);
  }
  return shipOut(V, I);
}
function planHunter() {
  const V = [], I = [];
  loft(V, I, [[-.4, .03, .05], [-.1, .1, .08], [.15, .08, .06], [.35, .03, .03]], 8, 7);
  for (let k = 0; k < 4; k++) {
    const g = k / 4 * 6.2831853;
    arm(V, I, Math.cos(g) * .08, -.02, .1, Math.cos(g) * .35, -.15 - (k & 1) * .1, .55, 7, 3);
  }
  box(V, I, [0, .08, -.32], [.03, 0, 0], [0, .03, 0], [0, 0, .03], 5);
  return shipOut(V, I);
}
function planSwarm() {
  const V = [], I = [];
  for (let k = 0; k < 9; k++) {
    const g = k * 2.4, r = .08 + (k % 3) * .12, y = ((k % 4) - 1.5) * .1;
    loft(V, I, [[-.04, .03, .025, y, Math.cos(g) * r], [.05, .045, .035, y, Math.cos(g) * r + Math.sin(g) * .04]], 6, k & 1 ? 5 : 7);
  }
  return shipOut(V, I);
}
function planLevi() {
  const V = [], I = [], prof = [];
  for (let j = 0; j <= 18; j++) {
    const t = j / 18, bell = Math.sin(Math.pow(t, .65) * Math.PI);
    prof.push([t * 2 - 1, .03 + .14 * Math.pow(bell, .85), .02 + .08 * bell]);
  }
  tubeBody(V, I, prof, 8, 7, 0);
  fin(V, I, 0, .02, .15, .55, .04, .4);
  fin(V, I, 0, 0, .1, -.5, -.06, .36);
  fin(V, I, 0, 0, .7, .28, .02, .24);
  return shipOut(V, I);
}

let mPlan = null, LEco = null, FAU2 = null, HSta = null, HFr = null, HCap = null, HCr = null, HLv = null, mArc = null, DArc = null;
function v124Plans() {
  const R = mulberry32(((SYS && SYS.salt) || 1) ^ 0xE050);
  const a = R() * 9 | 0;
  let b = (a + 2 + (R() * 3 | 0)) % 9; if (b === a) b = (a + 4) % 9;
  let c = (a + 6) % 9; if (c === a || c === b) c = (c + 1) % 9;
  return [a, b, c];
}
function genEco(L, wx, wy, wz, sx, sy, sz) {
  if (!FAU2) return;
  if (SYS.atm) { const y = (wy + .5) * L.C; if (y < 1400 || y > 8600) return; }
  cellRnd(wx, wy, wz, 44);
  const home = (wx | wy | wz) === 0;
  if (!home && hx(1) > (QUEST ? .08 : .18)) return;
  if (!home && QUEST && gr2 > 7) return;
  const plans = v124Plans();
  const n = home ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const pi = plans[i];
    const beh = pi === 6 || pi === 8 ? 3 : pi === 7 ? 1 : i === 2 ? 2 : 0;
    const g0 = home ? .2 + i * .18 : gj0;
    const g1 = home ? .5 + (i - 1) * .06 : gj1;
    const g2 = home ? .42 + i * .12 : gj2;
    const sc = pi === 8 ? (home ? 420 : 260 + hx(5) * 180) : (home ? 26 + i * 8 : 9 + hx(5) * 16);
    put(FAU2[i % 3], sx, sy, sz, sc, g0, g1, g2, gsd, hx(3), hx(3), .12 + ((SYS && SYS.fac) || 0) * .18, beh);
  }
}
function v124Boot() {
  mPlan = [planRadial(), planSegment(), planSail(), planColony(), planCrystal(), planBag(), planHunter(), planSwarm(), planLevi()];
  LEco = Layer(QUEST ? 2000 : 1700, QUEST ? 4 : 4, 1, genEco, 44);
  FAU2 = [LEco, Sub(LEco, 1), Sub(LEco, 1)];
  LAYERS.push(LEco);
  HSta = Dyn(1); HFr = Dyn(1); HCap = Dyn(1); HCr = Dyn(1); HLv = Dyn(1);
  const boot = mesh([0, 0, 0, 0, 1, 0, 0, 0], [0, 0, 0]);
  mArc = boot; DArc = Dyn(1);
}
const v123BootPrev = v123Boot;
v123Boot = function () { v123BootPrev(); v124Boot(); };

const v123LayoutPrev = v123LayoutHero;
v123LayoutHero = function () {
  v123LayoutPrev();
  const R = mulberry32(((SYS && SYS.salt) || 1) ^ 0x51A7);
  const yaw0 = yaw, fx = Math.sin(yaw0), fz = -Math.cos(yaw0), rx = -fz, rz = fx;
  const place = (dist, side, up) => ({ x: px + fx * dist + rx * side, y: py + up, z: pz + fz * dist + rz * side });
  HERO.freighter = place(680 + R() * 40, -170 - R() * 40, -10);
  HERO.creature = place(520 + R() * 30, 90, 24);
  HERO.station = place(1560 + R() * 80, 340, 20);
  HERO.capital = place(2360 + R() * 120, -420, 70);
  HERO.whale = place(2920 + R() * 80, 120, -30);
  HERO.pick = R();
};
function heroPut(L, p, sc, mat, hue, beh) {
  L.n = 0;
  if (!p) return;
  L.sz = sc; L.hue = hue;
  put(L, p.x - px, p.y - py, p.z - pz, sc, 0, 0, 0, ((SYS.salt || 1) % 997) / 997, hue, mat, hue, beh);
  flush(L);
}
v123PutHero = function () {
  if (!HSta || !HERO || SYS.atm) {
    if (HSta) { HSta.n = HFr.n = HCap.n = HCr.n = HLv.n = 0; }
    return;
  }
  const fac = (SYS.fac || 0) % 4, alien = !!(SYS.dead || ((SYS.salt >>> 3) % 6 === 0));
  const stations = [mRing, mHubS, mDockS, mSpire];
  HSta.mesh = alien && mAli ? mAli[2] : stations[(SYS.salt >>> 2) % 4];
  HFr.mesh = mShips[(SYS.salt >>> 1) % 2];
  HCap.mesh = mCap[fac];
  const plans = v124Plans();
  HCr.mesh = mPlan[plans[0]];
  HLv.mesh = mLev;
  const hue = [.55, .08, .62, .15][fac];
  heroPut(HSta, HERO.station, alien ? 640 : 280, alien ? 7 : 0, hue, 0);
  heroPut(HFr, HERO.freighter, 62, 0, hue, 0);
  heroPut(HCap, HERO.capital, 520, 0, hue, 0);
  heroPut(HCr, HERO.creature, plans[0] === 8 ? 90 : 34, 7, .2 + fac * .15, 10);
  heroPut(HLv, HERO.whale, 460, 7, .25, 0);
};

function v124Arc(vd) {
  if (!mArc || !RV || SYS.atm) return;
  let best = null;
  for (const L of [RV[0], MV[0]]) {
    if (!L || !L.n) continue;
    const D = L.d, N = L.N, C = L.C;
    const w = (v, m) => ((v - m + N * 1.5) % N) - N * .5;
    for (let i = 0; i < L.n; i++) {
      const o = i * 12;
      const x = (w(D[o], L.mx) + D[o + 4]) * C - L.fx;
      const y = (w(D[o + 1], L.my) + D[o + 5]) * C - L.fy;
      const z = (w(D[o + 2], L.mz) + D[o + 6]) * C - L.fz;
      const sc = D[o + 3], horiz = Math.hypot(x, z), tube = Math.hypot(horiz - sc, y);
      if (sc > 120 && tube < Math.min(1600, sc * .42) && (!best || tube < best.tube)) best = { x, y, z, sc, sd: D[o + 7], tube };
    }
  }
  DArc.n = 0;
  if (!best) return;
  const g = tm * .02 + best.sd * 5, cs = Math.cos(g), sn = Math.sin(g);
  const lx = (-best.x * cs - best.z * sn) / best.sc, lz = (best.x * sn - best.z * cs) / best.sc;
  const ang = Math.atan2(lz, lx);
  const span = Math.max(.4, Math.min(2.4, 3400 / best.sc));
  const arcLen = 2 * span * best.sc;
  const nM = Math.max(28, Math.min(QUEST ? 72 : 120, arcLen / 22 | 0));
  const nT = QUEST ? 12 : 16;
  const key = ang.toFixed(2) + ':' + span.toFixed(2) + ':' + nM + ':' + (best.sc | 0);
  if (key !== mArc.key) {
    const V = [], I = [], a0 = ang - span, a1 = ang + span, s0 = 0;
    for (let j = 0; j <= nT; j++) {
      const v = j / nT * 6.2831853, cv = Math.cos(v), sv = Math.sin(v);
      for (let i = 0; i <= nM; i++) {
        const u = a0 + (a1 - a0) * (i / nM), cu = Math.cos(u), su = Math.sin(u), rr = 1 + .058 * cv;
        V.push(rr * cu, .058 * sv, rr * su, cv * cu, sv, cv * su, 0, 0);
      }
    }
    const stride = nM + 1;
    for (let j = 0; j < nT; j++) for (let i = 0; i < nM; i++) {
      const a = s0 + j * stride + i, b = a + stride;
      I.push(a, b, a + 1, a + 1, b, b + 1);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, mArc.vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mArc.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.DYNAMIC_DRAW);
    mArc.n = I.length; mArc.key = key;
  }
  put(DArc, best.x, best.y, best.z, best.sc, 0, 0, 0, best.sd, 0, 0, 0, 0);
  flush(DArc);
  gl.useProgram(P_SHIP.p);
  if (P_SHIP.u.uVd) gl.uniform1f(P_SHIP.u.uVd, vd);
  gl.uniform1i(P_SHIP.u.uShip, 6);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(-2, -2);
  draw(P_SHIP, DArc, mArc);
  gl.disable(gl.POLYGON_OFFSET_FILL);
}

function v124Shaders() {
  let rock = ROCK_F;
  rock = v124Must(rock, `else if(big>.5&&ap.y<.6){vec2 wg=q/(ps*.22),wi=floor(wg),wf=fract(wg);
   em=mix(vec3(1.,.8,.5),vec3(.6,.8,1.),step(.6,hh(wi+3.)))*step(.88,hh(wi*vec2(1.,.37)))*step(.45,hh(vec2(wi.y,7.)))*step(.25,wf.x)*step(wf.x,.75)*step(.3,wf.y)*step(wf.y,.7)*2.2;}
  if(big>.5){
   float dq=length(vP),det=1.-smoothstep(900.,4200.,dq);
   vec3 wp=q3;
   float nA=texture(uNz,wp*.0045).r,nB=texture(uNz,wp*.02).g;
   vec3 cell=abs(fract(wp*vec3(.035,.028,.02))-.5);
   float seam=smoothstep(.42,.49,max(cell.x,max(cell.y,cell.z)));
   float fine=smoothstep(.455,.49,max(abs(fract(wp.x*.11)-.5),abs(fract(wp.z*.09)-.5)));
   alb=mix(alb,alb*vec3(.55,.42,.32),smoothstep(.58,.86,nA)*.55);
   alb=mix(alb,vec3(.02,.022,.028),seam*(.45+.35*det));
   alb*=mix(1.,.62,fine*det);
   float win=step(.62,nB)*step(.28,fract(wp.y*.015+nA))*step(.22,fract(wp.x*.012));
   em+=mix(vec3(1.,.78,.45),vec3(.45,.7,1.),step(.55,nA))*win*(.35+.9*det)*(.65+.35*step(.15,fract(TIME*.04+nA*6.)));
   vec3 tn=normalize(cross(N,vec3(.21,1.,.07)));
   N=normalize(N+tn*(nA-.5)*det*.55+cross(N,tn)*(nB-.5)*det*.35);
   sp=mix(sp,.22+.85*nB,.5);gs=mix(gs,16.+80.*nB,.45);
   float stripe=step(.92,fract(wp.y*.008+wp.x*.001));
   alb=mix(alb,vec3(.55,.32,.05),stripe*.35);em+=vec3(1.,.45,.05)*stripe*.15;
  }`, `float dq=length(vP),reach=big>.5?4200.:520.;
  float det=1.-smoothstep(reach*.22,reach,dq);
  vec3 wp=q3;float nA=texture(uNz,wp*(big>.5?.0045:.02)).r,nB=texture(uNz,wp*(big>.5?.018:.06)).g,nC=texture(uNz,wp.yzx*(big>.5?.009:.03)).b;
  vec3 tn=normalize(cross(N,vec3(.21,1.,.07)));
  N=normalize(N+tn*(nA-.5)*det*(mid>6.5?.85:.55)+cross(N,tn)*(nB-.5)*det*.4);
  bool org=mid>6.5&&mid<7.5;
  if(org){
   float vein=pow(abs(sin(wp.x*.05+nA*6.+TIME*.35)),18.)+pow(abs(sin(wp.z*.04-nB*5.)),14.);
   em+=mix(vec3(.15,.85,.55),vec3(.55,.2,.75),nC)*vein*1.6*(.6+.4*sin(TIME*1.2+nA*8.));
   alb=mix(alb,vec3(.03,.015,.02),smoothstep(.62,.9,nA)*.45);
   sp=mix(sp,1.15,.6);gs=mix(gs,28.,.5);
   float pore=smoothstep(.72,.9,nB);alb=mix(alb,alb*.35,pore*.5);em+=vec3(.2,.9,.7)*pore*.25;
  }else{
   vec3 cell=abs(fract(wp*vec3(.04,.03,.025)*(big>.5?1.:4.))-.5);
   float seam=smoothstep(.4,.49,max(cell.x,max(cell.y,cell.z)));
   float fine=smoothstep(.46,.495,max(abs(fract(wp.x*(big>.5?.1:.4))-.5),abs(fract(wp.z*(big>.5?.08:.35))-.5)));
   alb=mix(alb,alb*vec3(.5,.4,.32),smoothstep(.55,.88,nA)*.6);
   float streak=smoothstep(.58,.9,texture(uNz,vec3(wp.x*.0015,wp.y*.02,wp.z*.0015)).r);
   alb=mix(alb,alb*vec3(.42,.4,.38),streak*.4);
   alb=mix(alb,vec3(.015,.016,.02),seam*(.55+.35*det));
   alb*=mix(1.,.6,fine*det);
   vec2 wg=wp.xz*vec2(big>.5?.035:.12,big>.5?.012:.05);
   float win=step(.58,fract(wg.x))*step(.22,fract(wg.y))*step(fract(wg.y),.74)*step(.6,nB);
   float bay=step(.92,nA)*step(.4,fract(wp.y*(big>.5?.004:.02)))*step(.15,fract(wp.x*(big>.5?.003:.015)));
   em+=mix(vec3(1.,.8,.5),vec3(.45,.7,1.),step(.5,nC))*win*det*(1.1+.5*step(.18,fract(TIME*.05+nA*7.)));
   em+=vec3(1.,.55,.2)*bay*1.4;
   float hz=step(.78,fract(wp.y*(big>.5?.01:.04)+abs(wp.x)*.15));
   float chev=step(.45,fract(wp.z*(big>.5?.02:.08)+wp.x*.4));
   alb=mix(alb,vec3(.75,.5,.08),hz*chev*det*.7);
   em+=vec3(1.,.45,.05)*hz*chev*.12;
   vec2 ant=abs(fract(wp.xy*vec3(.008,.02,0).xy)-.5);float mast=step(.96,nC)*step(.47,ant.x)*step(ant.x,.5);
   em+=vec3(.6,.85,1.)*mast*.8;
   sp=mix(sp,.25+.8*nB,.55);gs=mix(gs,18.+70.*nB,.4);
   if(big>.5&&ap.y<.6){vec2 g2=q/(ps*.22),wi=floor(g2),wf=fract(g2);
    em+=mix(vec3(1.,.8,.5),vec3(.6,.8,1.),step(.6,hh(wi+3.)))*step(.88,hh(wi*vec2(1.,.37)))*step(.45,hh(vec2(wi.y,7.)))*step(.25,wf.x)*step(wf.x,.75)*step(.3,wf.y)*step(wf.y,.7)*1.6*det;}
  }`);
  rock = v124Must(rock, 'col+=fr*fr*fr*neb(N,6.)*.85*rim+uSunC.rgb*pow(fr,2.2)*.22*rim+em', 'col+=fr*fr*fr*neb(N,6.)*.95*rim+uSunC.rgb*pow(fr,2.2)*.48*rim+em');
    let ship = SHIP_V;
  ship = v124Must(ship, `lp.y+=sin(TIME*(1.5+a*1.6)-lp.z*4.2)*.1*(.25+abs(lp.z));lp.x+=cos(TIME*1.05+lp.z*3.)*.05;
 }else{`, `lp.y+=sin(TIME*(1.5+a*1.6)-lp.z*4.2)*.1*(.25+abs(lp.z));lp.x+=cos(TIME*1.05+lp.z*3.)*.05;
 }else if(uShip==9){
  float beh=k,hold=step(9.5,beh);
  vec3 nn=normalize(h3(sd*2.6)-.5+vec3(0.,1.25,0.)),uu=normalize(cross(nn,vec3(.19,1.,.05))),ww=cross(nn,uu);
  float ro=max(80.,uCN.x*(.14+.1*a)),spd=beh>2.5&&hold<.5?11.:beh<1.5?7.:9.;
  float an=sd*6.283+b*2.2+TIME*spd/ro;
  P0=c;
  if(hold<.5){P0=c+(uu*cos(an)+ww*sin(an))*ro*.35+nn*(b-.5)*40.;
   float pd=length(P0);
   if(beh<1.5&&pd<520.)P0+=normalize(P0+vec3(.01))* (520.-pd)*.4;
   else if(beh>2.5&&pd>80.&&pd<1400.)P0=mix(P0,normalize(P0)*90.,.3);
  }
  float yg=hold>.5?TIME*.15+sd*3.:an;float cs=cos(yg),sn=sin(yg);
  X=vec3(cs,0.,sn);Y=vec3(0.,1.,0.);Z=vec3(-sn,0.,cs);
  lp.y+=sin(TIME*1.8+lp.z*4.2+sd)*.07*(.3+abs(lp.z));
  lp.x+=sin(TIME*1.1+lp.z*2.5)*.03;
  float part=aU.y;
  if(part>.5&&part<1.5){float s=sin(TIME*1.45+sd+aP.x);lp.y+=s*.04;lp.x+=aP.z*s*.12;}
  else if(part>1.5&&part<2.5){lp.y+=sin(TIME*.8+lp.x*2.2+sd)*abs(lp.x)*.2;lp.z+=cos(TIME*.6+lp.x)*lp.x*.04;}
  else if(part>2.5){float t=clamp(part-3.,0.,1.25);lp.x+=sin(TIME*1.7-t*4.4+sd)*t*t*.45;lp.y+=cos(TIME*1.2-t*3.2+b*2.)*t*.25;}
 }else{`);
  ship = v124Must(ship, 'if(uShip==8&&sz>180.)fd*=smoothstep(sz*.28,sz*1.15,d);', 'if((uShip==8||uShip==9)&&sz>180.)fd*=smoothstep(sz*.28,sz*1.15,d);');
  const shipP = prog(ship, rock);
  P_SHIP.p = shipP.p; P_SHIP.u = shipP.u;
  gl.useProgram(P_SHIP.p); gl.uniform3fv(P_SHIP.u['uTier[0]'], TCOL); gl.uniform1i(P_SHIP.u.uKind, 4); gl.uniform1f(P_SHIP.u.uFlat, 0);

  let sky = SKY_F;
  sky = v124Must(sky, 'if(k==0){float freq=6.+5.*fract(abs(P.x)*7.3+P.z*2.1);float bd=.5+.5*sin(n.y*freq+w2*1.6),bd2=.5+.5*sin(n.y*(freq*.42)+1.1+w);s=mix(ca*.62,cb*1.45,smoothstep(.15,.85,bd));s=mix(s,ca*vec3(1.35,.95,.7),smoothstep(.45,.9,bd2)*.7);\n   float sx=n.x*2.1,sy=(n.y-.12)*5.5;s=mix(s,cb*vec3(1.35,.8,.5),exp(-(sx*sx+sy*sy))*1.15);cl=smoothstep(.52,.8,w*.5+w2*.5)*.38;land=0.;}',
    'if(k==0){float freq=7.+6.*fract(abs(P.x)*7.3+P.z*2.1);vec3 nw=n+vec3(tn(n*1.8+3.),tn(n*2.2+9.),tn(n*1.6+1.))*.22;float bd=.5+.5*sin(nw.y*freq+w2*1.8),bd2=.5+.5*sin(nw.y*(freq*.37)+1.4+w);s=mix(ca*.55,cb*1.55,smoothstep(.12,.88,bd));s=mix(s,ca*vec3(1.4,.9,.55),smoothstep(.4,.92,bd2)*.75);float sx=nw.x*2.4,sy=(nw.y-.2)*6.;s=mix(s,cb*vec3(1.2,.7,.45),exp(-(sx*sx+sy*sy))*1.3);vec2 st=vec2(atan(n.z,n.x)+P.x*6.,n.y*5.5);float vr=length(st-vec2(.8,.15));float arm=.5+.5*sin(atan(st.y-.15,st.x-.8)*4.-vr*18.);s=mix(s,cb*vec3(1.35,.8,.5),exp(-vr*vr*8.)*(.45+.55*arm));cl=smoothstep(.48,.78,w*.45+w2*.55)*.28;land=0.;}');
  sky = v124Must(sky, 's*=.93+.07*w3;', 's=mix(vec3(dot(s,vec3(.3,.5,.2))),s,1.22);s*=.94+.06*w3;if(k!=1&&k!=7){vec3 cw=n+vec3(tn(n*2.+5.),tn(n*2.3+11.),tn(n*1.8+2.))*.32;float cA=smoothstep(.52,.84,tn(cw*1.3)),cB=smoothstep(.52,.84,tn((cw+L*.07)*1.3));s=mix(s,mix(vec3(.94,.96,.98),ca,.22),cA*(k==0?.4:.82));s*=1.-clamp(cB-cA,0.,1.)*(k==3?.35:.5);}');
  sky = v124Must(sky, 'col+=atm*rim*pow(max(dot(d,Ls0),0.),4.)*1.15;', 'col+=atm*rim*pow(max(dot(d,Ls0),0.),4.)*1.35;{float ray=pow(1.-mu,2.5);vec3 rayC=mix(vec3(.18,.38,1.),vec3(1.,.52,.25),pow(max(dot(d,Ls0),0.),2.2));col+=rayC*ray*(.2+.95*max(nl,0.))*1.25+uSunC.rgb*pow(max(dot(d,Ls0),0.),7.)*ray*.5;}if(k==3){vec3 Rv=reflect(-L,n);col+=uSunC.rgb*pow(max(dot(Rv,-d),0.),48.)*(1.-land)*lit*(1.4+.8*w3);}if((k==2||k==3||k==5)&&nl<.08){float ct=step(.74,tn(n*22.))*step(.58,tn(n*6.5+2.));col+=mix(vec3(1.,.74,.38),vec3(.5,.72,1.),tn(n*3.))*ct*smoothstep(.2,-.5,nl)*2.6;}');
  sky = v124Must(sky, 'c=vec4(atm*a*1.25,min(.8,a));', 'c=vec4(mix(atm,vec3(.4,.62,1.),.4)*a*1.55+vec3(1.,.62,.32)*pow(max(dot(d,Ls0),0.),5.)*a*.8,min(.88,a*1.2));');
  sky = v124Must(sky, 'vec3 scol=hc<.14?vec3(1.,.35,.2):hc<.5?vec3(.55,.72,1.):vec3(1.,.95,.9);', 'float Tk=mix(2800.,18000.,pow(hc,1.15));vec3 scol=mix(vec3(1.,.42,.16),mix(vec3(1.,.9,.7),vec3(.55,.7,1.),smoothstep(5200.,11000.,Tk)),smoothstep(3000.,5600.,Tk));');
  const skyP = prog(TRI_V, sky);
  P_SKY.p = skyP.p; P_SKY.u = skyP.u;

  let bake = v124Must(BAKE_F, 'vec3 w=(vec3(fbm(d*2.+3.),fbm(d*2.+11.),fbm(d*2.+19.))-.5)*(0.55+uSty.w*1.35);', 'vec3 w=(vec3(fbm(d*2.+3.),fbm(d*2.+11.),fbm(d*2.+19.))-.5)*(0.55+uSty.w*1.35);w+=(vec3(n3(d*2.6+w*1.7+uSeed),n3(d*2.4+w.yzx*1.8+uSeed.yxy+4.),n3(d*2.1+w.zxy+uSeed.z+9.))-.5)*(0.7+uSty.y*1.4);');
  if (NEB) { const nb = prog(TRI_V, bake); NEB.p = nb; }

  let cock = COCK_F;
  cock = v124Must(cock, `void plate(inout vec3 alb,inout vec3 em,inout float sp,inout float gs,vec3 AM){   // clean panelling: matte composite plates, fine seams, recessed fasteners, the odd status light
 vec2 q=abs(vM.y)>.5?vL.xz:abs(vM.x)>.7?vL.zy:vL.xy,g=q*vec2(2.4,3.),f=fract(g),e=min(f,1.-f);
 float seam=smoothstep(.016,.004,min(e.x,e.y)),bolt=smoothstep(.022,.012,length(e-.07));
 alb=vec3(.012,.013,.015)*(.85+.3*texture(uNz,vL*22.).r)*(1.-.7*seam)+.006*bolt;sp=.3;gs=22.;
 em=AM*step(.88,hh(floor(g)+3.1))*smoothstep(.025,.012,length((f-vec2(.86,.16))*vec2(1.,1.4)))*.9;}`,
    `void plate(inout vec3 alb,inout vec3 em,inout float sp,inout float gs,vec3 AM){
 vec2 q=abs(vM.y)>.5?vL.xz:abs(vM.x)>.7?vL.zy:vL.xy,g=q*vec2(3.2,4.4),f=fract(g),e=min(f,1.-f);
 float n=texture(uNz,vL*16.).r,br=texture(uNz,vL*vec3(2.5,48.,2.5)).r;
 float seam=smoothstep(.022,.003,min(e.x,e.y)),bolt=smoothstep(.03,.012,length(e-vec2(.055,.07)));
 float soft=smoothstep(.2,.7,n);
 alb=mix(vec3(.018,.019,.022),vec3(.05,.053,.058),soft*.4)*(.8+.25*n)*(1.-seam*.8);
 alb=mix(alb,vec3(.012,.013,.016),bolt*.8);alb*=.82+.18*br;
 sp=mix(.08,.62,soft);gs=mix(8.,64.,soft);
 float trim=smoothstep(.014,.002,min(e.x,e.y*.55))*step(.4,f.y);
 em=AM*trim*(.45+.55*step(.25,fract(TIME*.12+n*5.)));
 em+=mix(AM,vec3(.3,.85,1.),.35)*step(.91,hh(floor(g)+2.))*smoothstep(.028,.008,length(f-vec2(.8,.22)))*(.35+.65*step(.55,fract(TIME*.07+hh(floor(g)))));}`);
  cock = v124Must(cock, 'else if(id>11.5){alb=vec3(.03,.032,.037)*(.75+.5*texture(uNz,vL*vec3(3.,60.,3.)).r);sp=1.1;gs=45.;}',
    'else if(id>11.5){float br=texture(uNz,vL*vec3(1.5,70.,1.5)).r;alb=vec3(.055,.058,.062)*(.7+.45*br);sp=.95;gs=70.;}');
  cock = v124Must(cock, 'else if(id<.5){alb=vec3(.011,.0115,.014)*(.85+.3*texture(uNz,vL*40.).r);sp=.2;gs=20.;}',
    'else if(id<.5){float n=texture(uNz,vL*28.).r,fib=texture(uNz,vL*vec3(8.,36.,8.)).r;alb=vec3(.02,.021,.024)*(.75+.4*n)*(.9+.1*fib);sp=.1;gs=12.;}');
  cock = v124Must(cock, ` col+=vec3(1.,.15,.08)*warn*uDm*.04;
 o=vec4(col,-1.);}`, ` col+=vec3(1.,.15,.08)*warn*uDm*.04;
 float ao=mix(.78,1.,clamp(N.y*.5+.6,0.,1.))*mix(.86,1.,texture(uNz,vL*2.4).r);
 col*=ao;
 if(id>11.2&&id<12.6){vec3 T=normalize(cross(N,vec3(.04,1.,.02)));float an=1.-abs(dot(T,normalize(L+V)));col+=uSunC.rgb*pow(an,6.)*.28;}
 if(id>1.5&&id<4.5){float hs=fract(vL.x*22.+TIME*.45)+fract(vL.y*30.-TIME*.3);col+=vec3(.35,.85,1.)*smoothstep(1.15,1.7,hs)*.16;col+=vec3(.55,.9,1.)*pow(1.-max(dot(N,V),0.),1.5)*.25;}
 col+=vec3(1.,.58,.22)*uCk.z*pow(1.-max(dot(N,V),0.),2.)*.2;
 col+=vec3(.4,.8,1.)*max(uCk.w,0.)*.05;
 col+=vec3(1.,.06,.04)*warn*(.03+.1*pow(1.-max(dot(N,V),0.),2.));
 o=vec4(col,-1.);}`);
  const c1 = prog(COCK_V, cock), c2 = prog(COCK_V, cock.replace('#version 300 es', '#version 300 es\n#define CABIN'));
  P_COCK.p = c1.p; P_COCK.u = c1.u;
  P_CAB.p = c2.p; P_CAB.u = c2.u;
  gl.useProgram(P_CAB.p); gl.uniform1i(P_CAB.u.uPip, 6);

}
function v124Hooks() {
  try { v124Shaders(); if (NEB && SYS) bakeNebula(SYS.seed); }
  catch (e) { console.error('v124 shader', e); }
  const E = window.ES;
  E.budget = () => ({ questVerts: IE_BUDGET.questVerts, questDraws: IE_BUDGET.questDraws, quest: QUEST, lv: LV, perf: E.perf() });

  E.hero = () => HERO;
  E.plans = () => (typeof v124Plans === 'function' ? v124Plans() : []);
  E.beast = (i) => {
    const pi = ((i == null ? (E.plans()[0] || 0) : i) | 0) % 9;
    if (!HCr || !HERO || !HERO.creature) return pi;
    HCr.mesh = mPlan[pi];
    const q = HERO.creature;
    E.frame(q.x, q.y, q.z, pi === 8 ? 160 : 42);
    return pi;
  };
}
