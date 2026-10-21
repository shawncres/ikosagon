/*
 * IkoLearn camera: the pure maths behind the cloud's controls (no DOM), so it is tested in Node.
 *   Input map    1 finger / left-drag: pan · right-drag, Shift-drag or a two-finger twist: turn · pinch / wheel: zoom
 *   Focus        tap a point: the camera eases (cubic in-out, zoom interpolated in log space, turn by the shortest
 *                arc) so the node comes to the front and its branch is framed in the view
 *   Inertia      a released pan glides on and slows exponentially: v(t) = v0·e^(-t/τ), distance v0·τ·(1 - e^(-t/τ))
 * Runs in the browser (window.IkoCamera) and in Node.
 */
(function (root) {
  "use strict";
  var TAU = Math.PI * 2;
  var CAM = { zmin: 0.6, zmax: 60, glideTau: 260, glideStop: 0.02, glideMin: 0.12, focusMs: 650, zoomMs: 220, wheel: 0.0015, wheelStep: [0.82, 1.22], margin: 0.62 };

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
      yaw: a.yaw + wrap(b.yaw - a.yaw) * e, pitch: a.pitch + (b.pitch - a.pitch) * e
    };
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

  var api = { CAM: CAM, gestureFor: gestureFor, hint: hint, easeInOutCubic: easeInOutCubic, wrap: wrap, lerpView: lerpView, forwardYaw: forwardYaw, fitZoom: fitZoom, glide: glide, velocity: velocity, twist: twist, zoomAbout: zoomAbout, wheelFactor: wheelFactor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IkoCamera = api;
})(typeof window !== "undefined" ? window : this);
