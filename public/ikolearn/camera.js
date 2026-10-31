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

  /* PR 109: subtler, one turn in about 250 s (was 75 s); maxPx: the outer edge of a large cloud never sweeps faster than this
     (px a second), since the angle's speed alone made a big or zoomed-in cloud look fast */
  var SPIN = { rate: TAU / 250000, resumeMs: 3500, easeMs: 1500, maxDt: 50, maxPx: 12 };
  /* how much of the spin a cloud of this on-screen radius (px) gets: all of it, unless its edge would pass maxPx a second */
  function spinCap(extentPx) { return extentPx > 0 ? Math.min(1, SPIN.maxPx / (SPIN.rate * 1000 * extentPx)) : 1; }
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
   * Where a focused node goes on screen, and the free area to frame its branch in, leaving room for the selection card
   * (card.js-free maths, see cardPlace). Wide screens: the node sits left of centre (38%) so the card fits to its right.
   * Phones: the node sits in the upper part of the view, below the top controls, so the card fits under it.
   */
  var CARD = { gap: 18, gapX: 44, margin: 12, wideAt: 0.38, phoneAt: 0.3, minH: 150 };
  function focusFrame(w, h, o) {
    o = o || {};
    var top = o.top || 64;
    if (o.wide) { var cx = Math.round(w * CARD.wideAt); return { cx: cx, cy: Math.round(top + (h - top) / 2), aw: 2 * (cx - 24), ah: h - top - 60 }; }
    var free = Math.max(120, h - top), cy = Math.round(top + free * CARD.phoneAt);
    return { cx: w / 2, cy: cy, aw: w - 24, ah: Math.max(100, 2 * (cy - top) - 16) };
  }
  /*
   * Where the selection card goes, next to the node at (nx, ny) on screen: to its right, else its left, else below, else
   * above, always inside the view (w x h, below `top`) and never over the node. A card taller than the room is given a
   * max height (it scrolls inside). -> { side, x, y, maxH } (side "sheet": no room anywhere, dock it at the bottom).
   */
  function cardPlace(nx, ny, cw, ch, w, h, top) {
    var m = CARD.margin, g = CARD.gap, gx = CARD.gapX, t = (top || 0) + m, clampY = function (hh) { return Math.max(t, Math.min(h - m - hh, ny - Math.min(hh, 220) / 2)); };
    var roomH = h - m - t;
    if (cw + 2 * m <= w) {
      if (nx + gx + cw <= w - m) { var hr = Math.min(ch, roomH); return { side: "right", x: Math.round(nx + gx), y: Math.round(clampY(hr)), maxH: Math.round(roomH) }; }
      if (nx - gx - cw >= m) { var hl = Math.min(ch, roomH); return { side: "left", x: Math.round(nx - gx - cw), y: Math.round(clampY(hl)), maxH: Math.round(roomH) }; }
    }
    var x = Math.round(Math.max(m, Math.min(w - m - cw, nx - cw / 2)));
    var below = h - m - (ny + g), above = ny - g - t;
    if (below >= Math.min(ch, CARD.minH)) return { side: "below", x: x, y: Math.round(ny + g), maxH: Math.round(below) };
    if (above >= Math.min(ch, CARD.minH)) { var ha = Math.min(ch, above); return { side: "above", x: x, y: Math.round(ny - g - ha), maxH: Math.round(above) }; }
    return { side: "sheet", x: m, y: Math.round(h - m - Math.min(ch, roomH)), maxH: Math.round(roomH) };
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
  /* PR 110: a press becomes a drag once the pointer is clearly away from where it went down (a finger wobbles more than a
     mouse); until then it can still be a tap. g: { far (px from the start, the most so far), touch } */
  var TAP = { touch: 10, mouse: 5 };
  function dragging(g) { return Boolean(g) && g.far >= (g.touch ? TAP.touch : TAP.mouse); }
  /* PR 110: what a two-finger gesture is, decided once: "zoom" when the fingers spread or close, "twist" when they circle
     with the spread steady, "" while it is still unclear (then it only zooms and pans, never turns) */
  var PINCH = { zoom: 0.08, twist: 0.3 };
  function pinchMode(scale, turned) {
    if (Math.abs(Math.log(Math.max(1e-3, scale))) > PINCH.zoom) return "zoom";
    if (Math.abs(turned) > PINCH.twist) return "twist";
    return "";
  }
  function twist(a0, b0, a1, b1) { return wrap(Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x)); }
  /* Zoom by k about a screen point: the point under the cursor stays put. */
  function zoomAbout(view, k, at, w, h) {
    var z = clamp(view.zoom * k, Math.min(CAM.zmin, view.zmin || CAM.zmin), CAM.zmax), real = z / view.zoom; /* a big cloud lowers the floor (view.zmin) */
    var out = { zoom: z, panX: view.panX, panY: view.panY };
    if (at) { out.panX = at.x - w / 2 - (at.x - w / 2 - view.panX) * real; out.panY = at.y - h / 2 - (at.y - h / 2 - view.panY) * real; }
    return out;
  }
  /* One wheel notch, kept deliberate: a capped factor per event (a trackpad pinch sends ctrlKey and a small delta). */
  function wheelFactor(deltaY, ctrl) { return clamp(Math.exp(-deltaY * CAM.wheel * (ctrl ? 4 : 1)), CAM.wheelStep[0], CAM.wheelStep[1]); }

  var api = { CAM: CAM, SPIN: SPIN, spinState: spinState, spinStep: spinStep, spinCap: spinCap, spinEase: spinEase, gestureFor: gestureFor, hint: hint, easeInOutCubic: easeInOutCubic, wrap: wrap, lerpView: lerpView, lerpPoint: lerpPoint, ORIGIN: ORIGIN, fitAround: fitAround, focusFrame: focusFrame, cardPlace: cardPlace, CARD: CARD, forwardYaw: forwardYaw, fitZoom: fitZoom, glide: glide, velocity: velocity, twist: twist, dragging: dragging, pinchMode: pinchMode, TAP: TAP, PINCH: PINCH, zoomAbout: zoomAbout, wheelFactor: wheelFactor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IkoCamera = api;
})(typeof window !== "undefined" ? window : this);
