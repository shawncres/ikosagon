/*
 * IkoLearn camera: the pure maths behind the cloud's controls (no DOM), so it is tested in Node.
 *   Input map    1 finger / left-drag: pan · right-drag, Shift-drag or a two-finger twist: turn · pinch / wheel: zoom
 *   Focus        tap a point: the camera eases (cubic in-out, zoom interpolated in log space, turn by the shortest
 *                arc) so the node comes to the front and its branch is framed in the view
 *   Inertia      a released pan glides on and slows exponentially: v(t) = v0·e^(-t/τ), distance v0·τ·(1 - e^(-t/τ))
 *   Idle spin    the big cloud turns slowly on its own (one turn in about 75 s) once nothing has happened for 3.5 s,
 *                easing in over 1.5 s: any pointer, wheel or key stops it at once, a focus glide or a released pan is
 *                waited out, and it comes back after the same idle delay. It keeps turning beside the node panel (about
 *                the focused node, which stays put). Never with reduced motion, while the tab is hidden, while the cloud
 *                is closed (a lesson, card or the Deck covers it) or while the panel covers most of it.
 *   Pivot        the camera turns about a pivot point P (the origin, or the focused node). A point p is drawn at
 *                centre + pan + zoom·s·persp(R(p − P)), so P itself always sits at centre + pan: turning about P
 *                leaves the focused node where it is, and focusing a node is just "pivot = node, pan = target − centre"
 * Runs in the browser (window.IkoCamera) and in Node.
 */
(function (root) {
  "use strict";
  var TAU = Math.PI * 2;
  var CAM = { zmin: 0.6, zmax: 60, glideTau: 260, glideStop: 0.02, glideMin: 0.12, focusMs: 650, zoomMs: 220, wheel: 0.0015, wheelStep: [0.82, 1.22], margin: 0.62 };

  var SPIN = { rate: TAU / 75000, resumeMs: 3500, easeMs: 1500, maxDt: 50 };
  /* -> { on, wait }: spinning now, or how many ms until it may resume (Infinity while it cannot spin at all). */
  function spinState(o) {
    o = o || {};
    if (o.reduce || o.hidden || !o.active || o.paused) return { on: false, wait: Infinity };
    if (o.busy) return { on: false, wait: SPIN.resumeMs };
    var left = SPIN.resumeMs - Math.max(0, (o.now || 0) - (o.lastInput || 0));
    return left > 0 ? { on: false, wait: left } : { on: true, wait: 0 };
  }
  /* The ease-in: 0 -> 1 over SPIN.easeMs from the moment the spin starts (smoothstep, so it never lurches). */
  function spinEase(since) { var k = since == null ? 1 : Math.max(0, Math.min(1, since / SPIN.easeMs)); return k * k * (3 - 2 * k); }
  /* The turn for one frame, `since` ms after the spin started (a long gap, e.g. after a dropped frame, never jumps). */
  function spinStep(dt, since) { return SPIN.rate * spinEase(since) * Math.max(0, Math.min(SPIN.maxDt, dt || 0)); }
  /* Which gesture a pointer starts: two pointers pinch (zoom, twist, two-finger pan); right, Shift or Alt turns; else pan. */
  function gestureFor(o) {
    o = o || {};
    if ((o.pointers || 1) >= 2) return "pinch";
    if (o.button === 2 || o.shift || o.alt) return "rotate";
    return "pan";
  }
  /* The one faint line on the page that documents the input map, for touch or for a mouse. */
  function hint(coarse) {
    return coarse
      ? "Drag to move · Pinch to zoom · Twist with two fingers to turn · Tap a point to bring it close"
      : "Drag to move · Scroll to zoom · Right-drag or Shift-drag to turn · Click a point to bring it close";
  }

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function easeInOutCubic(k) { k = clamp(k, 0, 1); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  /* Angle into (-π, π]. */
  function wrap(a) { a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a === -Math.PI ? Math.PI : a; }
  /* A view between two views: zoom in log space (each doubling takes the same time), pan linear, yaw the short way. */
  function lerpView(a, b, e) {
    return {
      zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * e),
      panX: a.panX + (b.panX - a.panX) * e, panY: a.panY + (b.panY - a.panY) * e,
      yaw: a.yaw + wrap(b.yaw - a.yaw) * e, pitch: a.pitch + (b.pitch - a.pitch) * e,
      pivot: lerpPoint(a.pivot || ORIGIN, b.pivot || ORIGIN, e)
    };
  }
  var ORIGIN = { x: 0, y: 0, z: 0 };
  /* The pivot moves in a straight line during a focus or recentre tween, so the turn centre slides with the camera. */
  function lerpPoint(a, b, e) { return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z: a.z + (b.z - a.z) * e }; }
  /*
   * The zoom that keeps a box of offsets (measured at zoom 1, relative to the pivot node, which stays put) inside w x h
   * when the node is pinned in the middle: the box is mirrored about the node, so the far side decides.
   */
  function fitAround(box, w, h, lo, hi, margin) {
    var hx = Math.max(Math.abs(box.x0), Math.abs(box.x1)), hy = Math.max(Math.abs(box.y0), Math.abs(box.y1));
    return fitZoom({ x0: -hx, x1: hx, y0: -hy, y1: hy }, w, h, lo, hi, margin);
  }
  /*
   * Where a focused node goes on screen, and the free area to frame its branch in. Wide screens: right of the 400px
   * side panel (it sits on the left), centred in the free area. Phones: the bottom sheet (sheet px tall) covers the lower part, so the node sits in the middle of the
   * strip above it (never above the top controls) and the branch is fitted to that strip.
   */
  function focusFrame(w, h, o) {
    o = o || {};
    if (o.wide) { var side = o.side || 400; return { cx: side + (w - side) / 2, cy: h / 2, aw: w - side - 20, ah: h - 80 }; }
    var top = o.top || 64, free = Math.max(120, h - (o.sheet || 0) - top);
    return { cx: w / 2, cy: top + free / 2, aw: w - 24, ah: Math.max(100, free - 24) };
  }
  /* The yaw that brings a point to the front (on the near side, centred left-right): x' = 0, z' = -hypot(x, z). */
  function forwardYaw(p) { return Math.hypot(p.x, p.z) < 1e-9 ? null : Math.atan2(-p.x, -p.z); }
  /*
   * The zoom that frames a box of screen offsets measured at zoom 1 (relative to the view centre) inside w x h with a
   * margin, kept between lo and hi (legibility bounds).
   */
  function fitZoom(box, w, h, lo, hi, margin) {
    var m = margin || CAM.margin, bw = Math.max(1e-6, box.x1 - box.x0), bh = Math.max(1e-6, box.y1 - box.y0);
    var z = Math.min((w * m) / bw, (h * m) / bh);
    return clamp(z, Math.max(CAM.zmin, lo || CAM.zmin), Math.min(CAM.zmax, hi || CAM.zmax));
  }
  /* Exact exponential decay over dt ms: the new velocity and the distance travelled (px). */
  function glide(v, dt, tau) {
    tau = tau || CAM.glideTau;
    var k = Math.exp(-dt / tau);
    return { v: v * k, d: v * tau * (1 - k) };
  }
  /* Smoothed pointer velocity (px/ms): an exponential moving average of the latest samples. */
  function velocity(prev, dx, dt, alpha) { if (!(dt > 0)) return prev; var a = alpha == null ? 0.35 : alpha; return prev * (1 - a) + (dx / dt) * a; }
  /* The twist between two finger pairs (radians, the short way). */
  function twist(a0, b0, a1, b1) { return wrap(Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x)); }
  /* Zoom by k about a screen point: the point under the cursor stays put. */
  function zoomAbout(view, k, at, w, h) {
    var z = clamp(view.zoom * k, CAM.zmin, CAM.zmax), real = z / view.zoom;
    var out = { zoom: z, panX: view.panX, panY: view.panY };
    if (at) { out.panX = at.x - w / 2 - (at.x - w / 2 - view.panX) * real; out.panY = at.y - h / 2 - (at.y - h / 2 - view.panY) * real; }
    return out;
  }
  /* One wheel notch, kept deliberate: a capped factor per event (a trackpad pinch sends ctrlKey and a small delta). */
  function wheelFactor(deltaY, ctrl) { return clamp(Math.exp(-deltaY * CAM.wheel * (ctrl ? 4 : 1)), CAM.wheelStep[0], CAM.wheelStep[1]); }

  var api = { CAM: CAM, SPIN: SPIN, spinState: spinState, spinStep: spinStep, spinEase: spinEase, gestureFor: gestureFor, hint: hint, easeInOutCubic: easeInOutCubic, wrap: wrap, lerpView: lerpView, lerpPoint: lerpPoint, ORIGIN: ORIGIN, fitAround: fitAround, focusFrame: focusFrame, forwardYaw: forwardYaw, fitZoom: fitZoom, glide: glide, velocity: velocity, twist: twist, zoomAbout: zoomAbout, wheelFactor: wheelFactor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IkoCamera = api;
})(typeof window !== "undefined" ? window : this);
