/* The Infinite End: offline trainer for the idle-title AI pilot (v2.00, step 3 of the passive AI track).
   Learns by imitation from recorded flights and writes ai-pilot.json, which the game loads on its own (see the AI pilot contract in index.html).
   No dependencies. Node 18 or newer.
     node train-pilot.mjs --dir flights/ --out ai-pilot.json
     node train-pilot.mjs --server https://ikosagon.com --out ai-pilot.json
   Flights are the JSON files the Flights panel exports, or what /api/ie-flights returns. Only human flights are used unless --all is given.
   Features (16, the same numbers featNow() builds in the game): throttle, speed/660, boost, 0 (hyperlight is not imitated), yaw rate, pitch rate, bank, pitch/1.5, altitude/2e4,
   sin and cos of heading, time in flight/150, clearance ahead / left / right / up. Targets: yaw, pitch, throttle, boost (the game's four outputs).
   Options: --hidden 24 --layers 2 --epochs 300 --lr 0.003 --min-dur 15 --seed 1 */
import fs from 'node:fs'; import path from 'node:path';
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf('--' + k); return i < 0 ? d : (A[i + 1] && !A[i + 1].startsWith('--') ? A[i + 1] : true); };
const KS = [1, 10, 10, 10, 1e6, 1e6, 1e6, 2000, 2000, 2000, 2000, 10, 10, 10, 100, 1, 1, 10, 10, 100, 100, 100, 100, 1, 1, 1, 1, 1, 1, 100, 100, 100, 100, 100, 100, 100];
const NF = 16, NO = 4, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let rs = (+arg('seed', 1) >>> 0) || 1; const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; }, gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(6.283185 * rnd());

/* one flight to rows of [features, targets] at 10 Hz */
export function rowsOf(f) {
  const nc = f.nc || 32, n = Math.floor(f.s.length / nc), c = new Float64Array(nc), P = []; if (n < 12) return [];
  for (let i = 0; i < n; i++) { const r = new Float64Array(36); for (let j = 0; j < nc; j++) { const v = f.s[i * nc + j]; if (j === 15) c[j] = v; else c[j] += v; r[j] = c[j]; } P.push(r); }
  const T = P.map((r) => r[0] / 1000), H = [], Pi = [], Ro = [];
  for (const r of P) { const x = r[7] / 2000, y = r[8] / 2000, z = r[9] / 2000, w = r[10] / 2000, nn = 1 / Math.hypot(x, y, z, w) || 1, X = x * nn, Y = y * nn, Z = z * nn, W = w * nn;
    const sFx = -2 * (X * Z + Y * W), sFy = -2 * (Y * Z - X * W), sFz = -(1 - 2 * (X * X + Y * Y)), sRy = 2 * (X * Y + Z * W), sUy = 1 - 2 * (X * X + Z * Z);
    H.push(Math.atan2(sFx, -sFz)); Pi.push(Math.asin(clamp(sFy, -1, 1))); Ro.push(Math.atan2(sRy, sUy)); }
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)), out = [];
  for (let i = 2; i < n - 2; i++) {
    const dt = T[i + 2] - T[i - 2]; if (dt < .25 || dt > 1.2) continue; const r = P[i], fl = r[15];
    if (fl & (4 | 8 | 16 | 128 | 256 | 512 | 1024)) continue;
    const yr = wrap(H[i + 2] - H[i - 2]) / dt, pr = (Pi[i + 2] - Pi[i - 2]) / dt, spd = Math.hypot(r[11], r[12], r[13]) / 10, cl = nc >= 36 ? [r[32], r[33], r[34], r[35]].map((v) => v / 100) : [1, 1, 1, 1];
    const x = new Float32Array(NF); x[0] = r[14] / 100; x[1] = spd / 660; x[2] = r[20] / 100; x[3] = 0; x[4] = yr; x[5] = pr; x[6] = Ro[i]; x[7] = Pi[i] / 1.5; x[8] = clamp(r[2] / 10 / 2e4, -1, 1);
    x[9] = Math.sin(H[i]); x[10] = Math.cos(H[i]); x[11] = T[i] / 150; x[12] = cl[0]; x[13] = cl[1]; x[14] = cl[2]; x[15] = cl[3];
    const y = new Float32Array(NO); y[0] = clamp(yr / .9, -1, 1); y[1] = clamp(pr / .6, -1, 1); y[2] = clamp(r[14] / 100, 0, 1); y[3] = (fl & 1) || r[20] > 50 ? 1 : 0;
    out.push([x, y]);
  }
  return out;
}

/* a small tanh network, trained with Adam */
function net(sizes) { const w = [], b = []; for (let l = 0; l < sizes.length - 1; l++) { const ni = sizes[l], no = sizes[l + 1], s = Math.sqrt(1 / ni); w.push(Float64Array.from({ length: ni * no }, () => gauss() * s)); b.push(new Float64Array(no)); } return { sizes, w, b }; }
function fwd(m, x, acts) { let a = Float64Array.from(x); acts[0] = a; for (let l = 0; l < m.sizes.length - 1; l++) { const ni = m.sizes[l], no = m.sizes[l + 1], z = new Float64Array(no); for (let r = 0; r < no; r++) { let v = m.b[l][r]; const o = r * ni; for (let c = 0; c < ni; c++) v += m.w[l][o + c] * a[c]; z[r] = Math.tanh(v); } acts[l + 1] = z; a = z; } return a; }
function mse(m, D) { let e = 0; const acts = []; for (const [x, y] of D) { const o = fwd(m, x, acts); for (let k = 0; k < NO; k++) e += (o[k] - y[k]) ** 2; } return e / (D.length * NO || 1); }
export function train(D, opt = {}) {
  const hid = opt.hidden || 24, nl = opt.layers || 2, sizes = [NF, ...Array(nl).fill(hid), NO], m = net(sizes), ep = opt.epochs || 300, lr = opt.lr || .003, bs = 64, L2 = 1e-5;
  const idx = D.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const nv = Math.max(1, Math.floor(D.length * .1)), V = idx.slice(0, nv).map((i) => D[i]), Tr = idx.slice(nv).map((i) => D[i]);
  const mw = m.w.map((a) => new Float64Array(a.length)), vw = m.w.map((a) => new Float64Array(a.length)), mb = m.b.map((a) => new Float64Array(a.length)), vb = m.b.map((a) => new Float64Array(a.length));
  let t = 0, best = null, bestV = 1e9; const acts = [];
  const mean = new Float64Array(NO); for (const [, y] of Tr) for (let k = 0; k < NO; k++) mean[k] += y[k] / Tr.length;
  let base = 0; for (const [, y] of V) for (let k = 0; k < NO; k++) base += (mean[k] - y[k]) ** 2; base /= V.length * NO;
  for (let e = 0; e < ep; e++) {
    for (let i = Tr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [Tr[i], Tr[j]] = [Tr[j], Tr[i]]; }
    for (let s = 0; s < Tr.length; s += bs) {
      const gw = m.w.map((a) => new Float64Array(a.length)), gb = m.b.map((a) => new Float64Array(a.length)), nb = Math.min(bs, Tr.length - s);
      for (let q = 0; q < nb; q++) { const [x, y] = Tr[s + q], o = fwd(m, x, acts); let d = new Float64Array(NO); for (let k = 0; k < NO; k++) d[k] = 2 * (o[k] - y[k]) * (1 - o[k] * o[k]) / NO;
        for (let l = m.sizes.length - 2; l >= 0; l--) { const ni = m.sizes[l], no = m.sizes[l + 1], a = acts[l], nd = new Float64Array(ni);
          for (let r = 0; r < no; r++) { gb[l][r] += d[r]; const o2 = r * ni; for (let c = 0; c < ni; c++) { gw[l][o2 + c] += d[r] * a[c]; nd[c] += d[r] * m.w[l][o2 + c]; } }
          if (l > 0) for (let c = 0; c < ni; c++) nd[c] *= 1 - a[c] * a[c]; d = nd; } }
      t++; const b1 = .9, b2 = .999, c1 = 1 - b1 ** t, c2 = 1 - b2 ** t;
      for (let l = 0; l < m.w.length; l++) { for (let i = 0; i < m.w[l].length; i++) { const g = gw[l][i] / nb + L2 * m.w[l][i]; mw[l][i] = b1 * mw[l][i] + (1 - b1) * g; vw[l][i] = b2 * vw[l][i] + (1 - b2) * g * g; m.w[l][i] -= lr * (mw[l][i] / c1) / (Math.sqrt(vw[l][i] / c2) + 1e-8); }
        for (let i = 0; i < m.b[l].length; i++) { const g = gb[l][i] / nb; mb[l][i] = b1 * mb[l][i] + (1 - b1) * g; vb[l][i] = b2 * vb[l][i] + (1 - b2) * g * g; m.b[l][i] -= lr * (mb[l][i] / c1) / (Math.sqrt(vb[l][i] / c2) + 1e-8); } }
    }
    if (e % 5 === 4 || e === ep - 1) { const v = mse(m, V); if (v < bestV) { bestV = v; best = { w: m.w.map((a) => Array.from(a)), b: m.b.map((a) => Array.from(a)) }; } if (opt.log && (e % 50 === 49 || e === ep - 1)) console.log(`epoch ${e + 1}  train ${mse(m, Tr.slice(0, 2000)).toFixed(4)}  val ${v.toFixed(4)}  (predict-the-mean ${base.toFixed(4)})`); }
  }
  const r4 = (a) => a.map((v) => Math.round(v * 1e5) / 1e5);
  return { model: { v: 1, sizes, w: best.w.map(r4), b: best.b.map(r4) }, val: bestV, base, train: Tr.length, valN: V.length };
}

async function main() {
  const dir = arg('dir', ''), server = arg('server', ''), out = arg('out', 'ai-pilot.json'), all = !!arg('all', false), minDur = +arg('min-dur', 15);
  const flights = [];
  if (dir) for (const fn of fs.readdirSync(dir)) if (fn.endsWith('.json')) { try { const f = JSON.parse(fs.readFileSync(path.join(dir, fn), 'utf8')); if (f && f.s) flights.push(f); } catch {} }
  if (server) {
    const H = { referer: server.replace(/\/$/, '') + '/infiniteenddev/' }, list = await (await fetch(server.replace(/\/$/, '') + '/api/ie-flights', { headers: H })).json();
    for (const m of list) { if (!all && m.pilot && m.pilot !== 'human') continue; try { const f = await (await fetch(server.replace(/\/$/, '') + '/api/ie-flights?id=' + encodeURIComponent(m.id), { headers: H })).json(); if (f && f.s) flights.push(f); } catch {} }
  }
  const use = flights.filter((f) => (all || !f.pilot || f.pilot === 'human') && f.dur >= minDur);
  console.log(`flights read ${flights.length}, used ${use.length}`);
  const D = []; for (const f of use) D.push(...rowsOf(f));
  console.log(`training rows ${D.length} (10 Hz, hyperlight, atmosphere and menus skipped)`);
  if (D.length < 200) { console.error('Not enough flying to learn from yet (need about 200 rows, 20 s). Fly more, or pass more flights.'); process.exit(1); }
  const r = train(D, { hidden: +arg('hidden', 24), layers: +arg('layers', 2), epochs: +arg('epochs', 300), lr: +arg('lr', .003), log: true });
  fs.writeFileSync(out, JSON.stringify(r.model));
  console.log(`wrote ${out}: sizes ${r.model.sizes.join('-')}, validation error ${r.val.toFixed(4)} vs ${r.base.toFixed(4)} for always predicting the average (${(100 * (1 - r.val / r.base)).toFixed(0)}% better)`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
