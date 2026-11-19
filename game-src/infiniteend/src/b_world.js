// ============================================================================
// Textures built at start-up
// ============================================================================
// tileable 3D noise: R = value, GBA = its gradient (for bump mapping without extra taps)
function noiseTex() {
  const S = 64, v = new Float32Array(S * S * S);
  rs = 4242;
  for (const [P, amp] of [[4, .5], [8, .28], [16, .15], [32, .07]]) {
    const g = new Float32Array(P * P * P); for (let i = 0; i < g.length; i++) g[i] = rnd();
    const k = P / S;
    for (let z = 0, o = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++, o++) {
      const X = x * k, Y = y * k, Z = z * k, xi = X | 0, yi = Y | 0, zi = Z | 0, x1 = (xi + 1) % P, y1 = (yi + 1) % P, z1 = (zi + 1) % P;
      let fx = X - xi, fy = Y - yi, fz = Z - zi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
      const G = (a, b, c) => g[(c * P + b) * P + a];
      const lo = (G(xi, yi, zi) * (1 - fx) + G(x1, yi, zi) * fx) * (1 - fy) + (G(xi, y1, zi) * (1 - fx) + G(x1, y1, zi) * fx) * fy;
      const hi = (G(xi, yi, z1) * (1 - fx) + G(x1, yi, z1) * fx) * (1 - fy) + (G(xi, y1, z1) * (1 - fx) + G(x1, y1, z1) * fx) * fy;
      v[o] += amp * (lo + (hi - lo) * fz);
    }
  }
  const d = new Uint8Array(S * S * S * 4), at = (x, y, z) => v[(((z + S) % S) * S + (y + S) % S) * S + (x + S) % S], c8 = (f) => Math.max(0, Math.min(255, f * 255));
  for (let z = 0, o = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++, o += 4) {
    d[o] = c8((at(x, y, z) - .5) * 1.7 + .5);
    d[o + 1] = c8(.5 + (at(x + 1, y, z) - at(x - 1, y, z)) * 5);
    d[o + 2] = c8(.5 + (at(x, y + 1, z) - at(x, y - 1, z)) * 5);
    d[o + 3] = c8(.5 + (at(x, y, z + 1) - at(x, y, z - 1)) * 5);
  }
  const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, t);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, S, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
  gl.generateMipmap(gl.TEXTURE_3D);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}
let NEB = null;
function bakeNebula(seed) {
  const S = Q.cube;
  if (!NEB) {
    NEB = { t: gl.createTexture(), p: prog(TRI_V, BAKE_F), f: gl.createFramebuffer() };
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, NEB.t);
    gl.texStorage2D(gl.TEXTURE_CUBE_MAP, Math.log2(S) + 1, gl.RGBA8, S, S);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }
  const p = NEB.p;
  gl.useProgram(p.p); gl.uniform3f(p.u.uSeed, seed[0], seed[1], seed[2]); { const st = (SYS && SYS.sty) || [1, 0, 1, .5]; gl.uniform4f(p.u.uSty, st[0], st[1], st[2], st[3]); }
  gl.bindVertexArray(null); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, NEB.t);
  gl.bindFramebuffer(gl.FRAMEBUFFER, NEB.f); gl.viewport(0, 0, S, S); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  const D = [[1, 0, 0, 0, 0, -1, 0, -1, 0], [-1, 0, 0, 0, 0, 1, 0, -1, 0], [0, 1, 0, 1, 0, 0, 0, 0, 1], [0, -1, 0, 1, 0, 0, 0, 0, -1], [0, 0, 1, 1, 0, 0, 0, -1, 0], [0, 0, -1, -1, 0, 0, 0, -1, 0]];
  for (let i = 0; i < 6; i++) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, NEB.t, 0);
    const d = D[i]; gl.uniform3f(p.u.uFa, d[0], d[1], d[2]); gl.uniform3f(p.u.uRa, d[3], d[4], d[5]); gl.uniform3f(p.u.uUa, d[6], d[7], d[8]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
}

// ============================================================================
// Meshes: 8 floats per vertex (position, normal, uv), all built from maths
// ============================================================================
function mesh(V, I) {
  const m = { vb: gl.createBuffer(), ib: gl.createBuffer(), n: I.length };
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW);
  return m;
}
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// a flat-shaded polygon (triangle fan); u = one uv.x per corner
function face(V, I, pts, u, uy = 0) {
  const a = pts[0], b = pts[1], c = pts[2], n = nrm(crs([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]])), s = V.length / 8;
  pts.forEach((p, i) => V.push(p[0], p[1], p[2], n[0], n[1], n[2], u[i], uy));
  for (let i = 1; i < pts.length - 1; i++) I.push(s, s + i, s + i + 1);
}
// the same box with every edge and corner cut back: 6 faces, 12 edge bevels, 8 corner facets. Used for everything in the cabin.
function rbox(V, I, c, ax, ay, az, u = 0, uy = 0) {           // a box whose edges and corners are cut back and shaded smooth, so it reads as rounded
  const A = [ax, ay, az], h = A.map((v) => Math.hypot(v[0], v[1], v[2])), e = A.map((v, i) => v.map((q) => q / (h[i] || 1))), mn = Math.min(h[0], h[1], h[2]), r = Math.min(.07, mn * .42);
  if (mn < .012) return box(V, I, c, ax, ay, az, u, uy);
  const P = (l) => [c[0] + e[0][0] * l[0] + e[1][0] * l[1] + e[2][0] * l[2], c[1] + e[0][1] * l[0] + e[1][1] * l[1] + e[2][1] * l[2], c[2] + e[0][2] * l[0] + e[1][2] * l[1] + e[2][2] * l[2]];
  const W = (d) => [e[0][0] * d[0] + e[1][0] * d[1] + e[2][0] * d[2], e[0][1] * d[0] + e[1][1] * d[1] + e[2][1] * d[2], e[0][2] * d[0] + e[1][2] * d[1] + e[2][2] * d[2]];
  const out = (L, Ns, d) => { let p = L.map(P), n = Ns.map(W); const a = p[0], b = p[1], q = p[2], fn = crs([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [q[0] - a[0], q[1] - a[1], q[2] - a[2]]), D = W(d);
    if (fn[0] * D[0] + fn[1] * D[1] + fn[2] * D[2] < 0) { p = p.reverse(); n = n.reverse(); }
    const s = V.length / 8; p.forEach((pp, i) => V.push(pp[0], pp[1], pp[2], n[i][0], n[i][1], n[i][2], u, uy)); for (let i = 1; i < p.length - 1; i++) I.push(s, s + i, s + i + 1); };
  for (let a = 0; a < 3; a++) { const b = (a + 1) % 3, q = (a + 2) % 3;
    for (const s of [-1, 1]) { const d = [0, 0, 0]; d[a] = s; const L = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sb, sq]) => { const l = [0, 0, 0]; l[a] = s * h[a]; l[b] = sb * (h[b] - r); l[q] = sq * (h[q] - r); return l; }); out(L, L.map(() => d), d); }
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) { const mk = (ia, ib, sq) => { const l = [0, 0, 0]; l[a] = sa * (h[a] - (ia ? r : 0)); l[b] = sb * (h[b] - (ib ? r : 0)); l[q] = sq * (h[q] - r); return l; }, da = [0, 0, 0], db = [0, 0, 0], d = [0, 0, 0]; da[a] = sa; db[b] = sb; d[a] = sa; d[b] = sb;
      out([mk(0, 1, -1), mk(0, 1, 1), mk(1, 0, 1), mk(1, 0, -1)], [da, da, db, db], d); }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out([[sx * h[0], sy * (h[1] - r), sz * (h[2] - r)], [sx * (h[0] - r), sy * h[1], sz * (h[2] - r)], [sx * (h[0] - r), sy * (h[1] - r), sz * h[2]]], [[sx, 0, 0], [0, sy, 0], [0, 0, sz]], [sx, sy, sz]);
}
// a rounded-rectangle panel: front and back faces with true round corners, and a side band shaded smooth
function rpan(V, I, C, R, U, hx, hy, hz, rad, m, part = 0, seg = 5) {
  const Fw = nrm(crs(R, U)), O = [];
  for (const [sx, sy, a0] of [[1, 1, 0], [-1, 1, 1.5708], [-1, -1, 3.1416], [1, -1, 4.7124]]) for (let i = 0; i <= seg; i++) { const g = a0 + i / seg * 1.5708; O.push([sx * (hx - rad) + Math.cos(g) * rad, sy * (hy - rad) + Math.sin(g) * rad, Math.cos(g), Math.sin(g)]); }
  const W = (x, y, z) => [C[0] + R[0] * x + U[0] * y + Fw[0] * z, C[1] + R[1] * x + U[1] * y + Fw[1] * z, C[2] + R[2] * x + U[2] * y + Fw[2] * z], N2 = (nx, ny) => [R[0] * nx + U[0] * ny, R[1] * nx + U[1] * ny, R[2] * nx + U[2] * ny];
  let s = V.length / 8; for (const o of O) { const p = W(o[0], o[1], hz); V.push(p[0], p[1], p[2], Fw[0], Fw[1], Fw[2], m, part); } for (let i = 1; i < O.length - 1; i++) I.push(s, s + i, s + i + 1);
  s = V.length / 8; for (const o of O) { const p = W(o[0], o[1], -hz); V.push(p[0], p[1], p[2], -Fw[0], -Fw[1], -Fw[2], m, part); } for (let i = 1; i < O.length - 1; i++) I.push(s, s + i + 1, s + i);
  for (let i = 0; i < O.length; i++) { const o = O[i], q = O[(i + 1) % O.length], s2 = V.length / 8, no = N2(o[2], o[3]), nq = N2(q[2], q[3]);
    for (const [pt, nn] of [[W(o[0], o[1], hz), no], [W(o[0], o[1], -hz), no], [W(q[0], q[1], -hz), nq], [W(q[0], q[1], hz), nq]]) V.push(pt[0], pt[1], pt[2], nn[0], nn[1], nn[2], m, part);
    I.push(s2, s2 + 1, s2 + 2, s2, s2 + 2, s2 + 3); }
}
// a turned part: a profile of [height, radius] spun round a vertical axis, shaded smooth, capped on top
function lathe(V, I, cx, cz, prof, n, m, part = 0) {
  const s0 = V.length / 8, NR = prof.length;
  for (let j = 0; j < NR; j++) { const a = prof[Math.max(0, j - 1)], b = prof[Math.min(NR - 1, j + 1)], dr = b[1] - a[1], dy = b[0] - a[0], l = Math.hypot(dr, dy) || 1, nr = dy / l, ny = -dr / l;
    for (let k = 0; k < n; k++) { const g = k / n * 6.2832, co = Math.cos(g), si = Math.sin(g); V.push(cx + co * prof[j][1], prof[j][0], cz + si * prof[j][1], co * nr, ny, si * nr, m, part); } }
  for (let j = 0; j < NR - 1; j++) for (let k = 0; k < n; k++) { const k2 = (k + 1) % n, a = s0 + j * n + k, b = s0 + j * n + k2, c = s0 + (j + 1) * n + k2, d = s0 + (j + 1) * n + k; I.push(a, d, c, a, c, b); }
  const top = prof[NR - 1], sc = V.length / 8; V.push(cx, top[0], cz, 0, 1, 0, m, part);
  for (let k = 0; k < n; k++) { const g = k / n * 6.2832; V.push(cx + Math.cos(g) * top[1], top[0], cz + Math.sin(g) * top[1], 0, 1, 0, m, part); }
  for (let k = 0; k < n; k++) I.push(sc, sc + 1 + (k + 1) % n, sc + 1 + k);
}
// a box from a centre and three half-extent axes
function box(V, I, c, ax, ay, az, u = 0, uy = 0) {
  const P = (i, j, k) => [c[0] + ax[0] * i + ay[0] * j + az[0] * k, c[1] + ax[1] * i + ay[1] * j + az[1] * k, c[2] + ax[2] * i + ay[2] * j + az[2] * k], uu = [u, u, u, u];
  face(V, I, [P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)], uu, uy); face(V, I, [P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), P(-1, -1, -1)], uu, uy);
  face(V, I, [P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1)], uu, uy); face(V, I, [P(-1, -1, 1), P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1)], uu, uy);
  face(V, I, [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], uu, uy); face(V, I, [P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1)], uu, uy);
}

// asteroid shapes: three families of lumps and craters, plus two angular fracture shards (a blob cut by random planes).
// The same functions root crystals and tendrils on the surface.
const CR = [[], [], []], PLN = [[], []];
for (let v = 0; v < 3; v++) { rs = 99 + v * 7; for (let i = 0; i < [9, 5, 15][v]; i++) { const d = nrm([rnd() - .5, rnd() - .5, rnd() - .5]); CR[v].push(d[0], d[1], d[2], .05 + .22 * rnd() * rnd(), .5 + .5 * rnd()); } }
for (let v = 0; v < 2; v++) { rs = 55 + v; for (let i = 0; i < 12; i++) { const d = nrm([rnd() - .5, rnd() - .5, rnd() - .5]); PLN[v].push(d[0], d[1], d[2], .45 + .5 * rnd()); } }
function rockR(v, x, y, z) {
  const f = [1.25, .95, 1.6][v], c = CR[v];
  let r = 1 + [.62, .95, .36][v] * (noise(x * f + 7, y * f, z * f, 91 + v * 10) - .5) + .26 * (noise(x * 3.1, y * 3.1, z * 3.1, 92 + v * 10) - .5) + .09 * (noise(x * 8, y * 8, z * 8, 93) - .5);
  if (v === 1) r *= .82 + .4 * x * x;                                         // the long, lumpy family
  for (let i = 0; i < c.length; i += 5) {
    const d = 1 - (x * c[i] + y * c[i + 1] + z * c[i + 2]), w = c[i + 3];
    if (d < w * 1.3) { const t = d / w; r += t < 1 ? -w * .55 * c[i + 4] * (1 - t * t) : w * .12 * (1 - (t - 1) / .3) * ((t - 1) / .3) * 4; }
  }
  return r;
}
function shardR(v, x, y, z) {
  const p = PLN[v]; let r = 1.5;
  for (let i = 0; i < p.length; i += 4) { const d = x * p[i] + y * p[i + 1] + z * p[i + 2]; if (d > .05) { const q = p[i + 3] / d; if (q < r) r = q; } }
  return r * (1 + .06 * (noise(x * 6, y * 6, z * 6, 95) - .5));
}
function rockMesh(sub, fn) {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1];
  let f = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  for (let s = 0; s < sub; s++) {
    const m = new Map(), nf = [];
    const mid = (a, b) => { const k = a < b ? a * 65536 + b : b * 65536 + a; let i = m.get(k); if (i == null) { i = v.length / 3; v.push(v[a * 3] + v[b * 3], v[a * 3 + 1] + v[b * 3 + 1], v[a * 3 + 2] + v[b * 3 + 2]); m.set(k, i); } return i; };
    for (let i = 0; i < f.length; i += 3) { const a = f[i], b = f[i + 1], c = f[i + 2], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca); }
    f = nf;
  }
  const n = v.length / 3, P = new Float32Array(n * 3), N = new Float32Array(n * 3), V = [];
  for (let i = 0; i < n; i++) { const d = nrm([v[i * 3], v[i * 3 + 1], v[i * 3 + 2]]), r = fn(d[0], d[1], d[2]); P[i * 3] = d[0] * r; P[i * 3 + 1] = d[1] * r; P[i * 3 + 2] = d[2] * r; }
  for (let i = 0; i < f.length; i += 3) {
    const a = f[i] * 3, b = f[i + 1] * 3, c = f[i + 2] * 3;
    const x = crs([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]);
    for (const o of [a, b, c]) { N[o] += x[0]; N[o + 1] += x[1]; N[o + 2] += x[2]; }
  }
  for (let i = 0; i < n; i++) { const m = nrm([N[i * 3], N[i * 3 + 1], N[i * 3 + 2]]); V.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], m[0], m[1], m[2], 0, 0); }
  return mesh(V, f);
}
// a cluster of hexagonal crystal shards, uv.x = height along the shard
function crystalMesh() {
  const V = [], I = []; rs = 777;
  for (let c = 0; c < 7; c++) {
    const tl = c ? .3 + .6 * rnd() : 0, az = rnd() * 6.283, len = c ? .45 + .75 * rnd() : 1.5, rad = c ? .06 + .06 * rnd() : .13;
    const a = [Math.sin(tl) * Math.cos(az), Math.cos(tl), Math.sin(tl) * Math.sin(az)], u = nrm(crs(a, [.3, .1, .9])), w = crs(a, u);
    const pt = (i, h, r) => { const g = i * 1.0472; return [a[0] * h + (u[0] * Math.cos(g) + w[0] * Math.sin(g)) * r, a[1] * h + (u[1] * Math.cos(g) + w[1] * Math.sin(g)) * r, a[2] * h + (u[2] * Math.cos(g) + w[2] * Math.sin(g)) * r]; };
    const tip = [a[0] * len, a[1] * len, a[2] * len];
    for (let i = 0; i < 6; i++) {
      face(V, I, [pt(i, 0, rad * .8), pt(i + 1, 0, rad * .8), pt(i + 1, len * .78, rad), pt(i, len * .78, rad)], [0, 0, .78, .78]);
      face(V, I, [pt(i, len * .78, rad), pt(i + 1, len * .78, rad), tip], [.78, .78, 1]);
    }
  }
  return mesh(V, I);
}
// jellyfish: a bell (uv.x 0 crown .. 1 rim, uv.y around) and trailing ribbons (uv.x 1..2 along, uv.y a random phase)
function jellyMesh() {
  const V = [], I = [], A = 12, R = 6;
  for (let j = 0; j <= R; j++) for (let i = 0; i <= A; i++) {
    const t = j / R, ph = t * 1.75, g = i / A * 6.283, r = Math.pow(Math.sin(Math.min(ph, 1.57)), .8) * (ph > 1.57 ? 1 - (ph - 1.57) * .9 : 1), y = Math.cos(ph) * .75;
    const p = [Math.cos(g) * r, y, Math.sin(g) * r], n = nrm([p[0], p[1] + .25, p[2]]);
    V.push(p[0], p[1], p[2], n[0], n[1], n[2], t, i / A);
  }
  for (let j = 0; j < R; j++) for (let i = 0; i < A; i++) { const a = j * (A + 1) + i, b = a + A + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
  rs = 31;
  for (let k = 0; k < 11; k++) {
    const arm = k > 7, g = k * .785 + rnd(), r0 = arm ? .18 : .78, len = arm ? 1.6 + rnd() : 2.6 + 2.2 * rnd(), wd = arm ? .1 : .035, ph = rnd(), S = 7, s = V.length / 8;
    const cx = Math.cos(g), cz = Math.sin(g);
    for (let j = 0; j <= S; j++) {
      const t = j / S, y = -.12 - t * len, w = wd * (1 - .7 * t);
      V.push(cx * r0 - cz * w, y, cz * r0 + cx * w, cx, 0, cz, 1 + t, ph, cx * r0 + cz * w, y, cz * r0 - cx * w, cx, 0, cz, 1 + t, ph);
    }
    for (let j = 0; j < S; j++) { const a = s + j * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  return mesh(V, I);
}
// void ray: a manta-like flying wing, uv.x = -1..1 across the span
function rayMesh() {
  const V = [], I = [], NU = 20, NV = 7;
  for (const sd of [1, -1]) {
    const s = V.length / 8;
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const u = i / NU * 2 - 1, v = j / NV, au = Math.abs(u), ch = Math.pow(1 - Math.pow(au, 1.7), .8) * 1.1 + .02;
      const z = (v - .38) * ch + au * au * .45, y = sd * .13 * ch * Math.pow(Math.sin(v * 3.1416), .7) * (1 - au * .6);
      const n = nrm([u * au * .6, sd, (v - .5) * .8]);
      V.push(u * 1.7, y, z, n[0], n[1], n[2], u, v);
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = s + j * (NU + 1) + i, b = a + NU + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const s = V.length / 8;                                   // whip tail
  for (let j = 0; j <= 8; j++) { const t = j / 8, z = .6 + t * 2.2, w = .03 * (1 - t); V.push(-w, 0, z, 0, 1, 0, 0, 1, w, 0, z, 0, 1, 0, 0, 1); }
  for (let j = 0; j < 8; j++) { const a = s + j * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  return mesh(V, I);
}
function dartMesh() {                                       // star minnow: a stretched octahedron
  const V = [], I = [], p = [[0, 0, -1], [.2, 0, 0], [0, .2, 0], [-.2, 0, 0], [0, -.2, 0], [0, 0, .55]];
  for (let i = 0; i < 4; i++) { const a = p[1 + i], b = p[1 + (i + 1) % 4]; face(V, I, [p[0], b, a], [0, 0, 0]); face(V, I, [p[5], a, b], [0, 0, 0]); }
  return mesh(V, I);
}
// stations are built from boxes. seg = one box of a ring of radius r at height y0
function seg(V, I, r, i, n, hr, hy, k = 1.03, y0 = 0) {
  const g = i / n * 6.283, c = Math.cos(g), s = Math.sin(g), hl = Math.PI * r / n * k;
  box(V, I, [c * r, y0, s * r], [c * hr, 0, s * hr], [0, hy, 0], [-s * hl, 0, c * hl]);
}
function ringMesh() {                                       // a broken outer ring, an inner ring, spokes and a hub
  const V = [], I = [], S = 56;
  for (let i = 0; i < S; i++) {
    if ((i > 8 && i < 14) || i === 33 || i === 34 || i === 47) continue;      // torn away
    seg(V, I, 1, i, S, .05 + .02 * (i % 3 === 0), .085 + .03 * (i % 7 === 0));
    if (i % 4 === 1) seg(V, I, 1.07, i, S, .02, .03, .5);
  }
  for (let i = 0; i < 36; i++) if (i < 22 || i > 25) seg(V, I, .52, i, 36, .022, .03);
  for (const g of [.4, 2.5, 4.6]) { const c = Math.cos(g), s = Math.sin(g); box(V, I, [c * .6, 0, s * .6], [c * .42, 0, s * .42], [0, .016, 0], [-s * .02, 0, c * .02]); }
  for (let i = 0; i < 8; i++) seg(V, I, .12, i, 8, .03, .16);
  box(V, I, [0, 0, 0], [.06, 0, 0], [0, .3, 0], [0, 0, .06]);
  return mesh(V, I);
}
function gateMesh() {                                       // a warp gate: a heavy segmented ring with emitter blocks and four pylons
  const V = [], I = [], S = 40;
  for (let i = 0; i < S; i++) { seg(V, I, 1, i, S, .06 + .03 * (i % 5 === 0), .1 + .05 * (i % 5 === 0)); if (i % 5 === 2) seg(V, I, .9, i, S, .025, .04, .6); if (i % 2) seg(V, I, 1.09, i, S, .012, .16, .4); }
  for (let k = 0; k < 4; k++) { const g = k * 1.571 + .785, c = Math.cos(g), s = Math.sin(g); box(V, I, [c * 1.22, 0, s * 1.22], [c * .16, 0, s * .16], [0, .05, 0], [-s * .05, 0, c * .05]); box(V, I, [c * 1.4, 0, s * 1.4], [c * .04, 0, s * .04], [0, .3, 0], [-s * .07, 0, c * .07]); }
  return mesh(V, I);
}
function hubMesh() {                                        // a core with six arms at two levels, pods at their ends, solar wings, a girdle ring and a mast
  const V = [], I = [];
  box(V, I, [0, 0, 0], [.2, 0, 0], [0, .3, 0], [0, 0, .2]); box(V, I, [0, .37, 0], [.13, 0, 0], [0, .07, 0], [0, 0, .13]); box(V, I, [0, -.37, 0], [.13, 0, 0], [0, .07, 0], [0, 0, .13]);
  for (let k = 0; k < 6; k++) { const g = k * 1.0472, c = Math.cos(g), s = Math.sin(g), y = k & 1 ? .16 : -.16;
    box(V, I, [c * .5, y, s * .5], [c * .3, 0, s * .3], [0, .032, 0], [-s * .032, 0, c * .032]); box(V, I, [c * .86, y, s * .86], [c * .08, 0, s * .08], [0, .11, 0], [-s * .08, 0, c * .08]);
    if (k % 3 === 0) box(V, I, [c * .55, y + .2, s * .55], [c * .26, 0, s * .26], [0, .004, 0], [-s * .12, 0, c * .12]); }
  for (let i = 0; i < 36; i++) seg(V, I, .64, i, 36, .018, .035, 1.03, 0);
  box(V, I, [0, .72, 0], [.022, 0, 0], [0, .3, 0], [0, 0, .022]); for (let i = 0; i < 10; i++) seg(V, I, .1, i, 10, .012, .03, 1.03, .98);
  return mesh(V, I);
}
function dockMesh() {                                       // a yard: one long truss, berths out to both sides with hulls in them, a habitat wheel, tanks at the foot
  const V = [], I = [], R = mulberry32(77);
  box(V, I, [0, 0, 0], [.035, 0, 0], [0, 1, 0], [0, 0, .035]);
  for (let k = 0; k < 9; k++) { const y = -.75 + k * .17; for (const s of [-1, 1]) { box(V, I, [s * .2, y, 0], [.17, 0, 0], [0, .014, 0], [0, 0, .02]); if (R() < .6) box(V, I, [s * .41, y, 0], [.06, 0, 0], [0, .05 + R() * .03, 0], [0, 0, .035 + R() * .03]); } }
  for (let i = 0; i < 30; i++) seg(V, I, .34, i, 30, .028, .06, 1.03, .62); for (let k = 0; k < 4; k++) { const g = k * 1.571, c = Math.cos(g), s = Math.sin(g); box(V, I, [c * .17, .62, s * .17], [c * .17, 0, s * .17], [0, .012, 0], [-s * .012, 0, c * .012]); }
  for (let k = 0; k < 4; k++) { const g = k * 1.571 + .785, c = Math.cos(g), s = Math.sin(g); box(V, I, [c * .12, -.9, s * .12], [.075, 0, 0], [0, .1, 0], [0, 0, .075]); }
  box(V, I, [0, 1.06, 0], [.12, 0, 0], [0, .004, 0], [0, 0, .12]);
  return mesh(V, I);
}
function spireMesh() {                                      // a long spine threaded through three rings, with panels and a dish
  const V = [], I = [];
  box(V, I, [0, 0, 0], [.03, 0, 0], [0, 1, 0], [0, 0, .03]);
  for (const [y, r, n, hr, hy] of [[-.45, .3, 28, .03, .05], [.12, .46, 40, .035, .07], [.62, .2, 20, .02, .04], [.12, .52, 40, .012, .02]])
    for (let i = 0; i < n; i++) { if (r > .4 && i > 5 && i < 9) continue; seg(V, I, r, i, n, hr, hy, 1.03, y); }
  for (const [y, r] of [[-.45, .15], [.12, .23], [.62, .1]]) for (let k = 0; k < 4; k++) { const g = k * 1.571 + y, c = Math.cos(g), s = Math.sin(g); box(V, I, [c * r, y, s * r], [c * r, 0, s * r], [0, .012, 0], [-s * .012, 0, c * .012]); }
  for (const sx of [-1, 1]) for (const y of [-.86, -.72]) box(V, I, [sx * .26, y, 0], [.2, 0, 0], [0, .055, 0], [0, 0, .004]);
  for (let i = 0; i < 10; i++) seg(V, I, .09 + .0 * i, i, 10, .012, .05, 1.03, .93);
  return mesh(V, I);
}
// ---- ships, built from lofted hulls, slabs and boxes ----
// a face wound so its normal points along `out`
function fq(V, I, pts, m, out) {
  const a = pts[0], b = pts[1], c = pts[2], n = crs([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
  face(V, I, n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? pts.slice().reverse() : pts, pts.map(() => m));
}
// a hull lofted through sections [z, half-width, half-height, y, x] with an n-sided cross-section
function loft(V, I, secs, n, m, capA = m, capB = m) {
  const ring = (s) => { const p = []; for (let i = 0; i < n; i++) { const g = (i + .5) / n * 6.283; p.push([Math.cos(g) * s[1] + (s[4] || 0), Math.sin(g) * s[2] + (s[3] || 0), s[0]]); } return p; };
  const R = secs.map(ring);
  for (let i = 0; i < R.length - 1; i++) for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; face(V, I, [R[i][k], R[i][k2], R[i + 1][k2], R[i + 1][k]], [m, m, m, m]); }
  fq(V, I, R[0], capA, [0, 0, -1]); fq(V, I, R[R.length - 1], capB, [0, 0, 1]);
}
// a flat panel of four corners, given thickness
function slab(V, I, P, th, m) {
  const n = nrm(crs([P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]]));
  const T = P.map((p) => [p[0] + n[0] * th, p[1] + n[1] * th, p[2] + n[2] * th]), Bt = P.map((p) => [p[0] - n[0] * th, p[1] - n[1] * th, p[2] - n[2] * th]);
  const c = [0, 1, 2].map((k) => (P[0][k] + P[1][k] + P[2][k] + P[3][k]) / 4);
  fq(V, I, T, m, n); fq(V, I, Bt, m, [-n[0], -n[1], -n[2]]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; fq(V, I, [T[i], T[j], Bt[j], Bt[i]], m, [(P[i][0] + P[j][0]) / 2 - c[0], (P[i][1] + P[j][1]) / 2 - c[1], (P[i][2] + P[j][2]) / 2 - c[2]]); }
}
const mirX = (P) => P.map((p) => [-p[0], p[1], p[2]]);
// materials (uv.x): 0 hull, 1 squadron paint, 2 engine glow, 3 canopy glass, 4 running light. Nose at z = -1.
function fighterMesh() {
  const V = [], I = [];
  loft(V, I, [[-1, .012, .012], [-.72, .06, .045], [-.3, .11, .085, .01], [.2, .13, .09, .01], [.7, .12, .075], [.84, .1, .06]], 6, 0);
  loft(V, I, [[-.56, .012, .012, .055], [-.42, .045, .04, .075], [-.16, .05, .045, .082], [.06, .02, .02, .075]], 6, 3);
  for (const s of [-1, 1]) {
    const mx = (P) => s < 0 ? mirX(P) : P;
    slab(V, I, mx([[.1, 0, -.28], [.78, -.02, .46], [.78, -.02, .62], [.1, 0, .7]]), .012, 0);                 // delta wing
    slab(V, I, mx([[.6, -.015, .3], [.78, -.02, .46], [.78, -.02, .62], [.6, -.015, .62]]), .014, 1);          // painted tip
    slab(V, I, mx([[.1, 0, .56], [.42, 0, .82], [.42, 0, .93], [.1, 0, .9]]), .009, 0);                        // tailplane
    slab(V, I, mx([[.09, .06, .34], [.21, .34, .76], [.21, .34, .89], [.09, .06, .84]]), .009, 0);             // canted fin
    slab(V, I, mx([[.14, -.05, -.35], [.2, -.05, -.05], [.2, -.09, .3], [.12, -.09, .3]]), .012, 0);           // intake
    loft(V, I, [[.5, .055, .055, 0, s * .065], [.9, .05, .05, 0, s * .065], [.96, .04, .04, 0, s * .065]], 6, 0, 0, 2);   // engine
    slab(V, I, mx([[.77, -.02, .5], [.8, -.02, .5], [.8, -.02, .54], [.77, -.02, .54]]), .014, 4);
  }
  return mesh(V, I);
}
// a frigate about two units long (scaled to 1-3 km): v 0 is a tapering warship, v 1 a blocky hauler
function frigateMesh(v) {
  const V = [], I = [], R = mulberry32(900 + v);
  const blk = (z0, z1, w0, h0, w1, h1, y = 0, x = 0, m = 0, n = 4) => loft(V, I, [[z0, w0, h0, y, x], [z1, w1, h1, y, x]], n, m);   // a tapered block
  if (v === 0) {                                             // warship: knife bow, armoured back, citadel, twin nacelles on pylons, a keel
    loft(V, I, [[-1, .012, .02], [-.82, .06, .05], [-.5, .105, .07], [-.05, .12, .08], [.45, .135, .09], [.8, .12, .085], [.88, .09, .07]], 8, 0);
    loft(V, I, [[-.55, .03, .012, .075], [-.2, .075, .03, .09], [.3, .085, .035, .1], [.55, .06, .02, .095]], 6, 0);
    loft(V, I, [[.05, .035, .03, .135], [.18, .05, .04, .15], [.4, .045, .035, .15], [.5, .02, .02, .14]], 6, 0);
    blk(.2, .3, .052, .01, .048, .008, .2, 0, 3, 6);
    for (const s of [-1, 1]) {
      loft(V, I, [[.1, .02, .02, -.02, s * .2], [.3, .045, .04, -.02, s * .21], [.75, .05, .045, -.02, s * .21], [.92, .035, .03, -.02, s * .21]], 8, 0, 0, 2);
      slab(V, I, [[s * .1, -.02, .25], [s * .19, -.02, .3], [s * .19, -.02, .62], [s * .1, -.02, .7]], .012, 0);
      slab(V, I, [[s * .11, 0, -.45], [s * .2, -.015, -.2], [s * .2, -.015, -.05], [s * .11, 0, -.1]], .008, 1);
    }
    slab(V, I, [[0, -.07, -.2], [0, -.2, .25], [0, -.2, .6], [0, -.08, .7]], .01, 0);
    for (const [x, y] of [[-.05, .03], [.05, .03], [0, -.04]]) loft(V, I, [[.88, .035, .035, y, x], [.97, .05, .05, y, x]], 8, 0, 0, 2);
  } else {                                                   // freighter: command module, a spine, cargo drums in frames, engine block
    loft(V, I, [[-1, .03, .025], [-.9, .075, .06], [-.72, .085, .07], [-.64, .05, .045]], 8, 0); blk(-.93, -.86, .05, .012, .06, .012, .062, 0, 3, 6);
    loft(V, I, [[-.64, .03, .03], [.6, .03, .03]], 6, 0);
    for (let i = 0; i < 5; i++) {
      const z = -.52 + i * .22;
      for (const s of [-1, 1]) loft(V, I, [[z, .02, .02, 0, s * .1], [z + .015, .07, .07, 0, s * .1], [z + .165, .07, .07, 0, s * .1], [z + .18, .02, .02, 0, s * .1]], 8, i === 2 ? 1 : 0);
      blk(z + .07, z + .11, .2, .012, .2, .012);
    }
    loft(V, I, [[.58, .05, .05], [.66, .13, .11], [.86, .14, .12], [.92, .1, .09]], 8, 0);
    for (const [x, y] of [[-.07, .045], [.07, .045], [-.07, -.045], [.07, -.045]]) loft(V, I, [[.92, .04, .04, y, x], [1.02, .06, .06, y, x]], 8, 0, 0, 2);
  }
  for (let i = 0; i < 22; i++) { const z = -.5 + 1.2 * R(), q = .006 + .012 * R(); box(V, I, [(R() - .5) * .1, (v ? .035 : .11) + q * .5, z], [q, 0, 0], [0, q * .6, 0], [0, 0, q * (1 + 2 * R())]); }
  box(V, I, [.03, .26, .4], [.002, 0, 0], [0, .09, 0], [0, 0, .002]); box(V, I, [.03, .355, .4], [.004, 0, 0], [0, .004, 0], [0, 0, .004], 4);
  return mesh(V, I);
}
// a drone: a sphere with one glowing eye, three armour shells standing off it, a mast and a tail vane
function droneMesh() {
  const V = [], I = [], secs = [[-.56, .2, .2]];
  for (let i = 1; i < 8; i++) { const t = .38 + i / 8 * 2.76; secs.push([-Math.cos(t) * .6, Math.sin(t) * .6, Math.sin(t) * .6]); }
  loft(V, I, secs, 10, 0, 2, 0);
  for (let j = 0; j < 3; j++) for (let k = 0; k < 4; k++) {
    const a0 = j * 2.094 + .5 + (k - 2) * .36, a1 = a0 + .36, r = .86, p = (a, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
    slab(V, I, [p(a0, -.4), p(a1, -.4), p(a1, .55), p(a0, .55)], .035, 0);
  }
  box(V, I, [0, .8, .1], [.012, 0, 0], [0, .25, 0], [0, 0, .012], 0); box(V, I, [0, 1.06, .1], [.03, 0, 0], [0, .03, 0], [0, 0, .03], 4);
  slab(V, I, [[0, .1, .5], [0, .35, .95], [0, -.1, .95], [0, -.1, .5]], .012, 0);
  loft(V, I, [[-.66, .1, .1], [-.6, .17, .17], [-.55, .19, .19]], 10, 5, 5, 0);          // a mender's lens glows its swarm's colour
  for (const s of [-1, 1]) {                                                             // and two jointed tool arms reach forward under it
    box(V, I, [s * .42, -.42, -.2], [.025, 0, 0], [0, .025, 0], [0, 0, .32], 0);
    box(V, I, [s * .42, -.42, -.55], [.05, 0, 0], [0, .05, 0], [0, 0, .05], 5);
  }
  return mesh(V, I);
}
// a siphon: a long tank drone with a flared intake at the nose, saddle tanks, a glowing band and a lit tail. Nose at z = -1.
function siphonMesh() {
  const V = [], I = [];
  loft(V, I, [[-1, .46, .46], [-.9, .3, .3], [-.75, .2, .2], [-.6, .27, .27], [-.2, .34, .34], [.4, .33, .33], [.8, .24, .24], [.95, .12, .12]], 12, 0, 0, 2);
  loft(V, I, [[-.02, .355, .355], [.06, .355, .355]], 12, 5);                            // the glowing band
  loft(V, I, [[-.32, .345, .345], [-.27, .345, .345]], 12, 1);
  for (const s of [-1, 1]) loft(V, I, [[-.45, .02, .02, -.08, s * .5], [-.35, .15, .13, -.08, s * .5], [.3, .16, .14, -.08, s * .5], [.5, .03, .03, -.08, s * .5]], 8, 1, 0, 0);
  for (const s of [-1, 1]) slab(V, I, [[s * .3, -.08, -.1], [s * .36, -.08, -.1], [s * .36, -.08, .2], [s * .3, -.08, .2]], .02, 0);
  slab(V, I, [[0, .3, .3], [0, .62, .62], [0, .62, .82], [0, .3, .78]], .015, 0);
  box(V, I, [0, .64, .72], [.03, 0, 0], [0, .03, 0], [0, 0, .03], 4);
  return mesh(V, I);
}
// a spark: a cut-crystal capacitor core, six vanes around it and a broken halo of plates. It hums.
function sparkMesh() {
  const V = [], I = [], P = [[0, .5, 0], [0, -.5, 0], [.3, 0, 0], [-.3, 0, 0], [0, 0, .3], [0, 0, -.3]];
  for (const [a, b] of [[2, 4], [4, 3], [3, 5], [5, 2]]) { face(V, I, [P[0], P[a], P[b]], [5, 5, 5]); face(V, I, [P[1], P[b], P[a]], [5, 5, 5]); }
  for (let i = 0; i < 6; i++) { const g = i / 6 * 6.283, c = Math.cos(g), s = Math.sin(g), q = (r, y) => [c * r, y, s * r];
    slab(V, I, [q(.34, -.06), q(.34, .06), q(.78, .02), q(.78, -.02)], .012, i & 1 ? 1 : 0); }
  for (let i = 0; i < 10; i++) { if (i === 3 || i === 8) continue; const g0 = i / 10 * 6.283 + .08, g1 = g0 + .5, r = .95, p = (g, y) => [Math.cos(g) * r, y + Math.sin(g) * .25, Math.sin(g) * r];
    slab(V, I, [p(g0, -.04), p(g1, -.04), p(g1, .04), p(g0, .04)], .02, i % 3 ? 0 : 5); }
  box(V, I, [0, .62, 0], [.015, 0, 0], [0, .1, 0], [0, 0, .015], 0); box(V, I, [0, .74, 0], [.035, 0, 0], [0, .035, 0], [0, 0, .035], 4);
  return mesh(V, I);
}
// leviathan: a whale-like body (nose at z = -1) with tail flukes and fins. uv = along the body, around it
function whaleMesh() {
  const V = [], I = [], NZ = 24, NA = 12;
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NA; i++) {
    const t = j / NZ, g = i / NA * 6.283, r = .2 * Math.pow(Math.sin(Math.PI * Math.pow(t, .6)), .75) * (1 - .3 * t) + .004;
    V.push(Math.cos(g) * r, Math.sin(g) * r * .85, t * 2 - 1, Math.cos(g), Math.sin(g), 0, t, i / NA);
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + NA + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
  for (const sx of [-1, 1]) {
    face(V, I, [[0, 0, .84], [sx * .46, .02, 1.16], [sx * .06, 0, 1.0]], [.9, 1, .95], .25);
    face(V, I, [[sx * .14, -.06, -.42], [sx * .6, -.16, -.02], [sx * .15, -.06, -.14]], [.3, .5, .4], .25);
  }
  face(V, I, [[0, .15, -.05], [0, .3, .25], [0, .13, .3]], [.5, .6, .65], .25);
  return mesh(V, I);
}
function serpentMesh() {                                    // a long tapering tube, bent along its path by the shader
  const V = [], I = [], NZ = 56, NA = 6;
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NA; i++) {
    const t = j / NZ, g = i / NA * 6.283, r = .015 * Math.sin(Math.PI * Math.pow(t, .32)) + .001;
    V.push(Math.cos(g) * r, Math.sin(g) * r, t * 2 - 1, Math.cos(g), Math.sin(g), 0, t, i / NA);
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + NA + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
  return mesh(V, I);
}
function tendrilMesh() {                                    // a ribbon: x = side, y = 0..1 along
  const V = [], I = [], S = 14;
  for (let j = 0; j <= S; j++) V.push(-1, j / S, 0, 0, 0, 1, 0, j / S, 1, j / S, 0, 0, 0, 1, 1, j / S);
  for (let j = 0; j < S; j++) { const a = j * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  return mesh(V, I);
}
// the cockpit: three windows between two pillars, a header with an overhead console, a dash of instruments with
// three screens, side consoles, a throttle lever and a flight stick. The glass panes come last in the index list
// so they can be drawn on their own (m.ng indices).
// Ship space: x right, y up, z back; the pilot's eye is at the origin. m = material, part = moving part (see COCK_V).
function cockpitMesh() {
  const V = [], I = [];
  const ob = (c, hx, hy, hz, yw, pt, m, part = 0) => {         // a box turned by yaw then pitch (radians)
    const cy = Math.cos(yw), sy = Math.sin(yw), cp = Math.cos(pt), sp = Math.sin(pt);
    rbox(V, I, c, [cy * hx, 0, -sy * hx], [sy * sp * hy, cp * hy, cy * sp * hy], [sy * cp * hz, -sp * hz, cy * cp * hz], m, part);
  };
  const beam = (pts, w, h, m) => {
    const sh = [[1, .45], [.45, 1], [-.45, 1], [-1, .45], [-1, -.45], [-.45, -1], [.45, -1], [1, -.45]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], t = nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), u = nrm(crs(t, Math.abs(t[2]) > .9 ? [0, 1, 0] : [0, 0, 1])), v = crs(t, u);
      const ring = (p) => sh.map((s) => [p[0] + u[0] * s[0] * w + v[0] * s[1] * h, p[1] + u[1] * s[0] * w + v[1] * s[1] * h, p[2] + u[2] * s[0] * w + v[2] * s[1] * h]), A = ring(a), B2 = ring(b);
      for (let k = 0; k < 8; k++) { const k2 = (k + 1) % 8, s = sh[k], s2 = sh[k2], ox = (s[0] + s2[0]) * w, oy = (s[1] + s2[1]) * h; fq(V, I, [A[k], A[k2], B2[k2], B2[k]], m, [u[0] * ox + v[0] * oy, u[1] * ox + v[1] * oy, u[2] * ox + v[2] * oy]); }
    }
  };
  const screen = (c, hx, hy, yw, pt, m) => {                   // a housing with a glowing face just proud of it
    const cy = Math.cos(yw), sy = Math.sin(yw), cp = Math.cos(pt), sp = Math.sin(pt), R = [cy, 0, -sy], U = [sy * sp, cp, cy * sp], k = .032;
    rpan(V, I, c, R, U, hx + .035, hy + .03, .028, .05, 1); rpan(V, I, [c[0] + sy * cp * k, c[1] - sp * k, c[2] + cy * cp * k], R, U, hx, hy, .003, .032, m);   // a rounded bezel and a rounded glass face
  };
  const PB = [1.35, -.95, -2.9], PT = [1, 1.25, -2.5], RB = [3.4, -1, -1], RT = [3.1, 1.45, -.8];
  for (const s of [-1, 1]) {
    const m = (q, dz = 0) => [s * q[0], q[1], q[2] + dz];
    const gk = (q, d) => [s * (q[0] + d[0]), q[1] + d[1], q[2] + d[2] + .03];                  // gaskets: the pane's seat in its frame
    ob([s * 1.5, 1.5, -1.75], .34, .05, .45, 0, .18, 0); ob([s * 1.5, 1.44, -1.76], .3, .008, .4, 0, .18, 9);             // overhead side panels
    ob([s * .34, 1.3, -2.3], .05, .012, .05, 0, .2, 5); ob([s * .34, 1.33, -2.05], .05, .012, .05, 0, .2, 5);             // cabin lamps
  }
  beam([[-1, 1.25, -2.5], [1, 1.25, -2.5]], .055, .09, 12); beam([[-1.35, -.95, -2.9], [1.35, -.95, -2.9]], .04, .07, 12);   // header and sill
  beam([[-.94, 1.19, -2.47], [.94, 1.19, -2.47]], .012, .012, 7); beam([[-1.29, -.89, -2.87], [1.29, -.89, -2.87]], .012, .012, 7);
  ob([0, 1.45, -2.05], .72, .1, .52, 0, .2, 0); ob([0, 1.345, -2.07], .62, .008, .44, 0, .2, 9);                          // overhead console
  ob([0, -.97, -2.52], 1.5, .028, .42, 0, 0, 0); ob([0, -1.36, -2.5], 1.5, .36, .36, 0, 0, 0);                            // glare shield and dash
  rpan(V, I, [0, -1.2, -2.13], [1, 0, 0], [0, Math.cos(.35), -Math.sin(.35)], 1.42, .21, .012, .08, 9);                    // instrument face, rounded at its ends
  screen([-.62, -1.2, -2.115], .2, .13, 0, -.35, 3); screen([.62, -1.2, -2.115], .2, .13, 0, -.35, 4); screen([0, -1.18, -2.115], .2, .15, 0, -.35, 2);
  ob([0, -1.52, -1.8], .3, .12, .5, 0, -.2, 0); ob([0, -1.4, -1.83], .26, .008, .46, 0, -.2, 9);                          // pedestal
  // stick on the left, throttle lever on the right (Shawn's layout): turned parts in rubber boots, a grip with a thumb button
  lathe(V, I, .62, -1.95, [[-1.51, .12], [-1.49, .118], [-1.46, .095], [-1.44, .06], [-1.425, .034], [-1.415, .026]], 22, 1); lathe(V, I, -.62, -1.95, [[-1.51, .1], [-1.49, .098], [-1.46, .078], [-1.44, .05], [-1.425, .03], [-1.415, .022]], 22, 1);
  lathe(V, I, .62, -1.95, [[-1.43, .017], [-1.235, .015]], 12, 12, 1); ob([.62, -1.2, -1.95], .17, .038, .038, 0, 0, 7, 1); lathe(V, I, .8, -1.95, [[-1.24, .03], [-1.205, .042], [-1.165, .03]], 16, 6, 1);
  lathe(V, I, -.62, -1.95, [[-1.43, .016], [-1.215, .014]], 12, 12, 2);
  lathe(V, I, -.62, -1.95, [[-1.235, .026], [-1.215, .038], [-1.16, .046], [-1.1, .047], [-1.055, .042], [-1.03, .032], [-1.018, .016]], 20, 7, 2);
  lathe(V, I, -.62, -1.968, [[-1.03, .016], [-1.012, .015], [-1.004, .007]], 14, 8, 2);
  // density: bezels round each bank of instruments, raised key blocks, ribs, light strips, status lamps
  for (const x of [-.94, -.32, .32, .94]) ob([x, -1.2, -2.118], .012, .215, .02, 0, -.35, 1);
  ob([0, -1.0, -2.19], 1.44, .012, .022, 0, -.35, 1); ob([0, -1.4, -2.05], 1.44, .012, .022, 0, -.35, 1);
  for (const s of [-1, 1]) {
    if (s > 0) { ob([s * 1.15, -1.17, -2.1], .17, .07, .012, 0, -.35, 14); ob([s * 1.15, -1.3, -2.055], .17, .035, .02, 0, -.35, 1); ob([s * 1.15, -1.05, -2.15], .15, .006, .006, 0, -.35, 11); }
    ob([s * 2.05, 1.33, -1.65], .012, .012, .8, s * .82, .1, 5); ob([s * 2.22, -1.215, -1.62], .005, .006, .95, s * .82, 0, 11);                 // strips
    ob([s * 2.05, -1.2, -2.3], .12, .03, .1, s * .82, 0, 1); ob([s * 2.42, -1.2, -1.95], .1, .04, .12, s * .82, 0, 0); ob([s * 2.42, -1.155, -1.95], .08, .006, .1, s * .82, 0, 14);
    ob([s * .5, 1.36, -2.18], .1, .008, .03, 0, .2, 11);
  }
  ob([0, -1.385, -1.6], .2, .012, .16, 0, -.2, 1); ob([0, -1.37, -1.6], .16, .006, .12, 0, -.2, 9);
  // ---- the rest of the cabin, so that turning your head in a headset shows a ship and not open space.
  // Kept very dark: hull plates, ribs, a seat, lockers, a hatch, and a few small lights to give it depth.
  ob([0, -3.7, 1.2], 3.6, .06, 4.4, 0, 0, 0); ob([0, 1.68, 1.4], 3.6, .06, 4.2, 0, 0, 0);                                    // deck and overhead
  ob([0, 1.47, -2.56], 1.08, .2, .03, 0, 0, 0); ob([0, -2.4, -3.0], 1.7, 1.35, .05, 0, 0, 0);                                // above the header, below the dash
  ob([0, -3.62, -1.2], .5, .03, 1.4, 0, 0, 1);                                                                               // foot plate
  for (const s of [-1, 1]) {
    ob([s * 3.5, -1, 2.3], .06, 2.75, 3.3, 0, 0, 0);                                                                         // cabin wall
    ob([s * 3.3, -.95, -.86], .16, 2.7, .1, 0, 0, 12);                                                                       // the frame behind the side window
    for (const z of [.6, 2.2, 3.8]) { ob([s * 3.4, -1, z], .07, 2.7, .06, 0, 0, 12); if (s > 0 || z > 3) ob([s * 3.42, .2, z + .8], .012, .5, .6, 0, 0, 14); }
    if (s > 0) { ob([s * 3.2, -2.6, 2.6], .28, 1.05, 1.5, 0, 0, 0); ob([s * 2.915, -2.3, 2.6], .008, .6, 1.3, 0, 0, 14); }   // galley cupboards (right); the bunk takes the left wall
    beam([[s * 3.25, 1.45, -.7], [s * 3.25, 1.45, 5.4]], .07, .07, 1); beam([[s * 2.95, 1.55, -.6], [s * 2.95, 1.55, 5.4]], .03, .03, 12);   // conduits
    ob([s * 1.5, -3.63, 1.6], .014, .006, 3.2, 0, 0, 11);                                                                    // deck strips
    ob([s * 2.2, 1.6, 2.2], .1, .012, .1, 0, 0, 6); ob([s * 1.2, 1.6, .2], .06, .012, .06, 0, 0, 5);                         // lamps
    ob([s * .56, -1.5, .1], .07, .045, .55, 0, 0, 1); ob([s * .56, -2.1, .35], .05, .6, .06, 0, 0, 1);                       // arm rests
    ob([s * .34, -.2, .62], .1, .5, .07, s * -.35, -.1, 7);                                                                  // seat wings
  }
  for (const z of [.6, 2.2, 3.8]) ob([0, 1.6, z], 3.5, .06, .07, 0, 0, 12);
  ob([0, -.9, .68], .4, 1.25, .09, 0, -.1, 7); ob([0, .62, .5], .22, .2, .08, 0, 0, 7);                                      // seat back and head rest
  ob([0, -2.05, .1], .46, .1, .6, 0, 0, 7); ob([0, -2.9, .3], .3, .75, .32, 0, 0, 1); ob([0, -3.6, .3], .6, .05, .7, 0, 0, 12);   // seat pan, column, rails
  ob([0, -1, 5.6], 3.6, 2.75, .06, 0, 0, 0);                                                                                 // rear bulkhead
  ob([0, -1.5, 5.52], .8, 2.1, .04, 0, 0, 1); ob([0, -1.5, 5.47], .68, 1.95, .02, 0, 0, 0); ob([0, .72, 5.5], .5, .02, .02, 0, 0, 11);   // the hatch
  ob([.95, -1.2, 5.5], .06, .1, .02, 0, 0, 9); ob([.95, -1.02, 5.48], .02, .02, .01, 0, 0, 6);
  ob([-2.2, -.6, 5.5], .8, .9, .05, 0, 0, 9); ob([2.2, -.3, 5.5], .7, .5, .05, 0, 0, 1); ob([2.2, -1.9, 5.45], .7, .7, .1, 0, 0, 0);       // equipment racks
  const CN = 28, GJ = 7, cr = (a, v) => { const k = 1 + .07 * Math.sin(Math.PI * v), X = (3.4 - .3 * v) * k, Z = (2.1 - .25 * v) * k; return [X * Math.sin(a), -.97 + 2.47 * v, -1 + .2 * v - Z * Math.cos(a)]; };
  for (let i = 0; i < CN; i++) {
    const a0 = -1.5708 + i / CN * 3.1416, a1 = a0 + 3.1416 / CN, b0 = cr(a0, 0), b1 = cr(a1, 0), t0 = cr(a0, 1), t1 = cr(a1, 1);
    beam([b0, b1], .05, .09, 12); beam([t0, t1], .05, .08, 12); beam([[b0[0] * .985, b0[1] + .09, b0[2] * .985], [b1[0] * .985, b1[1] + .09, b1[2] * .985]], .014, .014, 7);   // sill rail, head rail, gasket
    face(V, I, [[b0[0], -3.7, b0[2]], [b1[0], -3.7, b1[2]], b1, b0], [0, 0, 0, 0]); face(V, I, [t0, t1, [t1[0], 1.7, t1[2]], [t0[0], 1.7, t0[2]]], [0, 0, 0, 0]);          // hull below the sill and above the head
  }
  // a console that follows the curve of the canopy on both sides: a coaming under the glass, an instrument face leaning in toward the pilot, a lit lip, a knee wall
  { const cq = (pts, m, want) => { const p0 = pts[0], p1 = pts[1], p2 = pts[2], n = crs([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]]); if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) pts.reverse(); face(V, I, pts, pts.map(() => m)); };
    const cs = (a, k, y) => { const p = cr(a, 0); return [p[0] * k, y, -1 + (p[2] + 1) * k]; }, SN = 56;
    for (let i = 0; i < SN; i++) { const a0 = -1.5708 + i / SN * 3.1416, a1 = a0 + 3.1416 / SN, am = (a0 + a1) / 2; if (Math.abs(am) < .52) continue; const inw = [-Math.sin(am), .45, Math.cos(am)];
      cq([cs(a0, .995, -.99), cs(a1, .995, -.99), cs(a1, .82, -1.03), cs(a0, .82, -1.03)], 0, [0, 1, 0]);
      cq([cs(a0, .82, -1.03), cs(a1, .82, -1.03), cs(a1, .805, -1.075), cs(a0, .805, -1.075)], 11, inw);
      cq([cs(a0, .805, -1.075), cs(a1, .805, -1.075), cs(a1, .7, -1.6), cs(a0, .7, -1.6)], 14, inw);
      cq([cs(a0, .7, -1.6), cs(a1, .7, -1.6), cs(a1, .66, -3.7), cs(a0, .66, -3.7)], 0, [inw[0], 0, inw[2]]); } }

  const cb0 = I.length;   // from here to the glass: the aux screen, then the quarters
  // the aux screen: a small 16:9 CRT left of the dash (material 15)
  screen([-1.15, -1.16, -2.06], .17, .0956, .28, -.35, 15);
  const qt0 = I.length;   // quarters start here: skipped on desktop unless you glance aft
  // a long-haul berth and a galley ledge. Same cabin size, almost no clutter: one pad, one counter, two light strips.
  ob([-2.72, -2.55, 3.15], .62, .07, 2.2, 0, 0, 14);
  ob([-2.72, -2.44, 3.15], .56, .045, 2.05, 0, 0, 13);
  ob([-2.74, -2.38, 4.55], .5, .03, .48, 0, 0, 13);
  ob([3.05, -1.5, 2.65], .4, .03, 1.5, 0, 0, 14);
  ob([-3.2, .55, 3.2], .015, .012, 1.7, 0, 0, 18);
  ob([3.28, .2, 2.65], .015, .012, 1.35, 0, 0, 18);
  const n0 = I.length, gs = V.length / 8;                       // the glass: one smooth curved sheet
  for (let j = 0; j <= GJ; j++) for (let i = 0; i <= CN; i++) { const p = cr(-1.5708 + i / CN * 3.1416, j / GJ), nx = -p[0] / 11.5, nz = -(p[2] + 1) / 4.4, l = Math.hypot(nx, .12, nz); V.push(p[0], p[1], p[2], nx / l, -.12 / l, nz / l, 10, 0); }
  for (let j = 0; j < GJ; j++) for (let i = 0; i < CN; i++) { const a = gs + j * (CN + 1) + i; I.push(a, a + 1, a + CN + 2, a, a + CN + 2, a + CN + 1); }
  const me = mesh(V, I); me.ng = I.length - n0; me.nv = V.length / 8; me.cb = cb0; me.qt = qt0; if (me.nv > 65535) console.error('cockpit mesh has too many vertices for 16-bit indices', me.nv);
  return me;
}
function quadMesh() { return mesh([-1, -1, 0, 0, 0, 1, 0, 0, 1, -1, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, -1, 1, 0, 0, 0, 1, 0, 1], [0, 1, 2, 0, 2, 3]); }
function boxMesh() { const V = [], I = []; box(V, I, [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]); return mesh(V, I); }

// ============================================================================
// The endless field. Each layer is a lattice of cells (size C, N cells across) centred on the camera.
// When the camera enters a new cell, the layer's instance lists are refilled from the hash of every cell in
// range: nothing is stored, so the same place always looks the same, and there is no edge to reach.
// The only thing remembered is what you have destroyed.
// ============================================================================
const F = 12;
let px = 0, py = 0, pz = 0;                                  // camera position, in doubles
const newBuf = (max) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, max * F * 4, gl.DYNAMIC_DRAW); return b; };
function Layer(C, N, per, gen, salt) {
  N = Math.max(2, Math.round(N * Q.k / 2) * 2);
  const L = { C, N, R: C * N / 2, per, gen, salt, max: N * N * N * per, n: 0, cx: 1e9, cy: 0, cz: 0, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0, slaves: [], vao: new Map() };
  L.root = L; L.d = new Float32Array(L.max * F); L.buf = newBuf(L.max);
  return L;
}
// a second instance list that shares a layer's cells (another mesh, or things growing on its rocks)
function Sub(root, per) {
  const s = { C: root.C, N: root.N, R: root.R, per, salt: root.salt, root, max: root.N ** 3 * per, n: 0, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0, vao: new Map() };
  s.d = new Float32Array(s.max * F); s.buf = newBuf(s.max); root.slaves.push(s);
  return s;
}
// a list of free-moving things (rubble, pickups, tracers, sparks), rebuilt every frame relative to the camera
function Dyn(max) { return { C: 1, N: 0, R: 1e9, max, n: 0, d: new Float32Array(max * F), buf: newBuf(max), fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0, vao: new Map() }; }
function put(L, sx, sy, sz, size, jx, jy, jz, seed, a, b, c, d) {
  if (L.n >= L.max) return;
  const o = L.n++ * F, D = L.d;
  D[o] = sx; D[o + 1] = sy; D[o + 2] = sz; D[o + 3] = size; D[o + 4] = jx; D[o + 5] = jy; D[o + 6] = jz; D[o + 7] = seed; D[o + 8] = a; D[o + 9] = b; D[o + 10] = c; D[o + 11] = d;
}
const flush = (L) => { gl.bindBuffer(gl.ARRAY_BUFFER, L.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, L.d, 0, L.n * F); };
const pm = (a, n) => ((a % n) + n) % n;
let gr2 = 0;
function upd(L) {
  const C = L.C, N = L.N, H = N / 2, cx = Math.floor(px / C), cy = Math.floor(py / C), cz = Math.floor(pz / C);
  L.fx = px - cx * C; L.fy = py - cy * C; L.fz = pz - cz * C;
  for (const s of L.slaves) { s.fx = L.fx; s.fy = L.fy; s.fz = L.fz; }
  if (cx === L.cx && cy === L.cy && cz === L.cz) return;
  L.cx = cx; L.cy = cy; L.cz = cz; L.mx = pm(cx, N); L.my = pm(cy, N); L.mz = pm(cz, N);
  L.n = 0; for (const s of L.slaves) s.n = 0;
  const H2 = (H + .5) * (H + .5);
  for (let k = -H; k < H; k++) for (let j = -H; j < H; j++) for (let i = -H; i < H; i++) {
    if ((gr2 = i * i + j * j + k * k) > H2) continue;
    L.gen(L, cx + i, cy + j, cz + k, pm(cx + i, N), pm(cy + j, N), pm(cz + k, N));
  }
  flush(L);
  for (const s of L.slaves) { s.mx = L.mx; s.my = L.my; s.mz = L.mz; flush(s); }
}
function vaoFor(L, m) {
  let v = L.vao.get(m);
  if (!v) {
    v = gl.createVertexArray(); gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    gl.bindBuffer(gl.ARRAY_BUFFER, L.buf);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(3 + i); gl.vertexAttribPointer(3 + i, 4, gl.FLOAT, false, 48, i * 16); gl.vertexAttribDivisor(3 + i, 1); }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
    L.vao.set(m, v);
  }
  return v;
}

// ---- what lives in a cell. cellRnd leaves the cell's hash, a position inside it and a seed in globals ----
const dead = new Set(), dmg = new Map();                     // destroyed cells, and damage taken so far
let gh = 0, gj0 = 0, gj1 = 0, gj2 = 0, gsd = 0;
const hx = (k) => hs(gh + k) * U;
function cellRnd(wx, wy, wz, s) { gh = h3(wx, wy, wz, s ^ SYS.salt); gj0 = (gh & 1023) / 1024; gj1 = (gh >>> 10 & 1023) / 1024; gj2 = (gh >>> 20 & 1023) / 1024; gsd = hx(77); }
const gateClear = (C, wx, wy, wz, s, m) => { const x = (wx + gj0) * C, y = (wy + gj1) * C, z = (wz + gj2) * C, r = s + m; return x * x + y * y + z * z < r * r; };
const tierOf = (h) => { const x = h + ((SYS && SYS.oreBias) || 0); return x < .86 ? 0 : x < .94 ? 1 : x < .975 ? 2 : x < .99 ? 3 : x < .997 ? 4 : 5; };
const typeAt = () => SYS.mat[gh >>> 5 & 7];
// lists the generators fill: [shape family] for each size class, things growing on rocks, station kinds
let HV, BF, BN, SV, LC, LTd, LTb, TV, RV, MV, FV;
function titanAt(C, wx, wy, wz) { if (SYS.atm) return 0; cellRnd(wx, wy, wz, 14); if (hx(1) > SYS.a.ti * .6) return 0; const r = hx(5), s = 2200 + 5200 * r * r; return gateClear(C, wx, wy, wz, s, 1500) ? 0 : s; }
function hugeAt(C, wx, wy, wz) { if (SYS.atm || ((wx | wy | wz) & 1)) return 0; cellRnd(wx, wy, wz, 2); const p = hx(1); if (p > .75 ||   // only every other cell on each axis: no two giants side by side
  dead.has(gh) || p > .1 && fM((wx + gj0) * C, (wy + gj1) * C, (wz + gj2) * C) < .82) return 0; const r = hx(5), s = (170 + 400 * r * r) * ((SYS.fz && SYS.fz.kh) || 1); return gateClear(C, wx, wy, wz, s, 700) ? 0 : s; }
function bigAt(C, wx, wy, wz) {
  if (SYS.atm) return 0; cellRnd(wx, wy, wz, 1); if (dead.has(gh)) return 0;
  const a = fM((wx + gj0) * C, (wy + gj1) * C, (wz + gj2) * C) - .82 - SYS.a.rock - (hx(1) - .5) * .3;
  if (a <= 0) return 0;
  const r = hx(5), s = (13 + 66 * r * r * r) * Math.min(1, a * 8) * ((SYS.fz && SYS.fz.kb) || 1);
  return gateClear(C, wx, wy, wz, s, 420) ? 0 : s;
}
const grow = (L, n, v, sx, sy, sz, s, w) => { rs = gh; for (let k = 0; k < n; k++) { const d = nrm([rnd() - .5, rnd() - .5, rnd() - .5]), r = rockR(v, d[0], d[1], d[2]) * .97; put(L, sx, sy, sz, s, gj0, gj1, gj2, gsd, d[0] * r, d[1] * r, d[2] * r, w * .25 + rnd() * .75); } };
function genTitan(L, wx, wy, wz, sx, sy, sz) { const s = titanAt(L.C, wx, wy, wz); if (s) put(TV[(gh >>> 3) % 3], sx, sy, sz, s, gj0, gj1, gj2, gsd, hx(6), 0, typeAt(), 0); }
function genHuge(L, wx, wy, wz, sx, sy, sz) {
  const s = hugeAt(L.C, wx, wy, wz); if (!s) return;
  const v = (gh >>> 3) % 3, ty = typeAt();
  put(HV[v], sx, sy, sz, s, gj0, gj1, gj2, gsd, hx(6), tierOf(hx(7)), ty, 0);
  if (hx(12) < SYS.a.ten * .7) grow(LTd, 10 + (hx(13) * 18 | 0), v, sx, sy, sz, s, hx(11));   // forests of glowing tendrils
}
function genBig(L, wx, wy, wz, sx, sy, sz) {
  const s = bigAt(L.C, wx, wy, wz); if (!s) return;
  const v = (gh >>> 3) % 3, ty = typeAt();
  put((gr2 <= 6 ? BN : BF)[v], sx, sy, sz, s, gj0, gj1, gj2, gsd, hx(6), tierOf(hx(7)), ty, 0);   // the nearest ones get the detailed mesh
  if (hx(9) < SYS.a.cry * .8) grow(LC, 2 + (hx(10) * 5 | 0), v, sx, sy, sz, s, hx(11));
  else if (hx(12) < SYS.a.ten * .3) grow(LTb, 4 + (hx(13) * 7 | 0), v, sx, sy, sz, s, hx(11));
}
function smallAt(C, wx, wy, wz) {
  if (SYS.atm) return 0; cellRnd(wx, wy, wz, 3); if (dead.has(gh)) return 0;
  const a = fM((wx + gj0) * C, (wy + gj1) * C, (wz + gj2) * C) - .64 - SYS.a.rock - (hx(1) - .5) * .5;
  if (a <= 0 && hx(2) > .006) return 0;
  const r = hx(5); return .35 + 4.6 * r * r * r;
}
function genSmall(L, wx, wy, wz, sx, sy, sz) {
  const s = smallAt(L.C, wx, wy, wz); if (!s) return;
  put(SV[(gh >>> 3) % 3], sx, sy, sz, s, gj0, gj1, gj2, gsd, hx(6), hx(8) < .4 ? tierOf(hx(7)) : 0, typeAt(), 0);
}
// rarities: lone geodes, glowing in the colour of what is inside. Rarer minerals are rarer finds.
function geodeAt(C, wx, wy, wz) { if (SYS.atm) return 0; cellRnd(wx, wy, wz, 13); return hx(1) < SYS.a.geo * .5 && !dead.has(gh) ? 4 + 5 * hx(5) : 0; }
const geodeTier = () => { const h = hx(7); return h < .4 ? 1 : h < .7 ? 2 : h < .88 ? 3 : h < .97 ? 4 : 5; };
function genGeode(L, wx, wy, wz, sx, sy, sz) { const s = geodeAt(L.C, wx, wy, wz); if (s) { const t = geodeTier(); put(L, sx, sy, sz, s + t, gj0, gj1, gj2, gsd, hx(6), t, 6, 0); } }
function genDebris(L, wx, wy, wz, sx, sy, sz) {
  if (SYS.atm) return; cellRnd(wx, wy, wz, 4); const C = L.C, dk = SYS.a.deb;
  if (!dk || fW((wx + gj0) * C, (wy + gj1) * C, (wz + gj2) * C) - .78 + .3 * dk - (hx(1) - .5) * .25 - .6 * fC((wx + gj0) * C, (wy + gj1) * C, (wz + gj2) * C) <= 0) return;
  const r = hx(5); put(L, sx, sy, sz, .4 + 3.2 * r * r, gj0, gj1, gj2, gsd, 0, 0, 0, 0);
}
function genRing(L, wx, wy, wz, sx, sy, sz) { if (SYS.atm) return; cellRnd(wx, wy, wz, 12); if (hx(1) < SYS.a.st * .6) put(RV[gh >>> 4 & 3], sx, sy, sz, 320 + 520 * hx(5), gj0, gj1, gj2, gsd, 0, 0, 0, 0); }
function genMega(L, wx, wy, wz, sx, sy, sz) { if (SYS.atm) return; cellRnd(wx, wy, wz, 15); if (hx(1) < SYS.a.mega * .6) put(MV[gh >>> 4 & 1], sx, sy, sz, 7000 + 11000 * hx(5), gj0, gj1, gj2, gsd, 0, 0, 0, 0); }
function swarmAt(C, wx, wy, wz) { cellRnd(wx, wy, wz, 5); return fL((wx + gj0) * C, (wy + gj1) * C, (wz + gj2) * C) + (hx(1) - .5) * .4 > .8 - .3 * SYS.a.life[0] && SYS.a.life[0] > 0; }
const pack = (L, s, hue, hv, w) => { rs = gh; for (let k = 0; k < L.per; k++) put(L, gsx, gsy, gsz, s, gj0, gj1, gj2, gsd, rnd(), rnd(), hue + (rnd() - .5) * hv, w < 0 ? k : w); };
let gsx = 0, gsy = 0, gsz = 0;
function genJelly(L, wx, wy, wz, sx, sy, sz) { if (SYS.atm) { const y = (wy + .5) * L.C; if (y < 2200 || y > 7600) return; } if (swarmAt(L.C, wx, wy, wz)) { gsx = sx; gsy = sy; gsz = sz; pack(L, 1.8 + 3 * hx(5), hx(3), .18, -1); } }
function genColossus(L, wx, wy, wz, sx, sy, sz) { cellRnd(wx, wy, wz, 16); if (hx(1) < SYS.a.life[1] * .7) { gsx = sx; gsy = sy; gsz = sz; pack(L, 45 + 60 * hx(5), hx(3), 0, 0); } }
function genMinnow(L, wx, wy, wz, sx, sy, sz) { if (SYS.atm) { const y = (wy + .5) * L.C; if (y < 1800 || y > 8200) return; } cellRnd(wx, wy, wz, 6); if (hx(1) < SYS.a.life[2] * .7) { gsx = sx; gsy = sy; gsz = sz; pack(L, .9 + hx(5), hx(3), .1, -1); } }
function genRay(L, wx, wy, wz, sx, sy, sz) { cellRnd(wx, wy, wz, 7); if (hx(1) < SYS.a.life[3]) { gsx = sx; gsy = sy; gsz = sz; pack(L, 26 + 50 * hx(5), hx(3), 0, -1); } }
function genWhale(L, wx, wy, wz, sx, sy, sz) { cellRnd(wx, wy, wz, 17); if (hx(1) < SYS.a.life[4] * .8) { gsx = sx; gsy = sy; gsz = sz; pack(L, 220 + 420 * hx(5), hx(3), .05, -1); } }
function genSerpent(L, wx, wy, wz, sx, sy, sz) { cellRnd(wx, wy, wz, 18); if (hx(1) < SYS.a.life[5] * .6) { gsx = sx; gsy = sy; gsz = sz; pack(L, 45 + 90 * hx(5), hx(3), .2, -1); } }
const home = (wx, wy, wz, on, j) => { if (wx | wy | wz || !on) return 0; gj0 = gj1 = gj2 = j; return 1; };   // the cell that holds the gate
function genFleet(L, wx, wy, wz, sx, sy, sz) { cellRnd(wx, wy, wz, 20); if (home(wx, wy, wz, SYS.a.fl >= .25, .06) || hx(1) < SYS.a.fl * .8 * (1 - fC((wx + .5) * L.C, (wy + .5) * L.C, (wz + .5) * L.C))) { gsx = sx; gsy = sy; gsz = sz; pack(L, 8 + 6 * hx(5), hx(3), 0, -1); } }
function genFrig(L, wx, wy, wz, sx, sy, sz) { cellRnd(wx, wy, wz, 21); if (home(wx, wy, wz, SYS.a.fr >= .15, .05) || hx(1) < SYS.a.fr * .8 * (1 - fC((wx + .5) * L.C, (wy + .5) * L.C, (wz + .5) * L.C))) { gsx = sx; gsy = sy; gsz = sz; pack(FV[gh >>> 4 & 1], 450 + 900 * hx(5), hx(3), .3, -1); } }
function genDrone(L, wx, wy, wz, sx, sy, sz) { cellRnd(wx, wy, wz, 22); if (home(wx, wy, wz, SYS.a.dr >= .25, .5) || hx(1) < SYS.a.dr * .16 + .008) { gsx = sx; gsy = sy; gsz = sz; pack(L, 1.6 + 1.8 * hx(5), .67, .02, -1); } }   // menders: silver
function genSiphon(L, wx, wy, wz, sx, sy, sz) { cellRnd(wx, wy, wz, 24); if (hx(1) < SYS.a.dr * .13 + .008) { gsx = sx; gsy = sy; gsz = sz; pack(L, 2 + 1.6 * hx(5), .85, .02, -1); } }      // siphons: yellow, make fuel
function genSpark(L, wx, wy, wz, sx, sy, sz) { cellRnd(wx, wy, wz, 25); if (hx(1) < SYS.a.dr * .13 + .008) { gsx = sx; gsy = sy; gsz = sz; pack(L, 1.4 + 1.4 * hx(5), .95, .02, -1); } }     // sparks: orange-red, charge the guns
function genDark(L, wx, wy, wz, sx, sy, sz) {                // banks of dark dust that dim whatever is behind them
  cellRnd(wx, wy, wz, 23); const C = L.C;
  const a = (fG((wx + .5) * C + 900, (wy + .5) * C, (wz + .5) * C) - .45) * 4; if (a <= 0) return;
  rs = gh; for (let k = 0; k < L.per; k++) put(L, sx, sy, sz, 300 + 500 * rnd(), rnd(), rnd(), rnd(), rnd(), Math.min(1, a), rnd(), rnd(), 0);
}
function genWisp(L, wx, wy, wz, sx, sy, sz) {
  cellRnd(wx, wy, wz, 8); const C = L.C;
  const a = (fG((wx + .5) * C, (wy + .5) * C, (wz + .5) * C) - .4) * 3.5; if (a <= 0) return;
  rs = gh;
  for (let k = 0; k < L.per; k++) put(L, sx, sy, sz, 260 + 480 * rnd(), rnd(), rnd(), rnd(), rnd(), Math.min(1, a), rnd(), rnd(), 0);
}
function genDust(L, wx, wy, wz, sx, sy, sz) { cellRnd(wx, wy, wz, 9); const r = hx(5); put(L, sx, sy, sz, .025 + .11 * r * r, gj0, gj1, gj2, gsd, hx(6), 0, 0, 0); }
function genSpore(L, wx, wy, wz, sx, sy, sz) { cellRnd(wx, wy, wz, 10); if (hx(1) < .2) put(L, sx, sy, sz, .5 + 1.4 * hx(5), gj0, gj1, gj2, gsd, .4 + .6 * hx(6), 0, 0, 0); }

let cHit = 0, cNx = 0, cNy = 0, cNz = 0;                         // the last contact, and its surface normal
// keep the camera outside the solid asteroids of a layer
function collide(L, at) {
  const C = L.C, cx = Math.floor(px / C), cy = Math.floor(py / C), cz = Math.floor(pz / C);
  for (let k = -1; k < 2; k++) for (let j = -1; j < 2; j++) for (let i = -1; i < 2; i++) {
    const s = at(C, cx + i, cy + j, cz + k); if (!s) continue;
    const x = px - (cx + i + gj0) * C, y = py - (cy + j + gj1) * C, z = pz - (cz + k + gj2) * C, d = Math.hypot(x, y, z), r = s * .93 + 2;
    if (d < r && d > 0) { const f = r / d; px += x * (f - 1); py += y * (f - 1); pz += z * (f - 1); cHit = 1; cNx = x / d; cNy = y / d; cNz = z / d; }
  }
}
