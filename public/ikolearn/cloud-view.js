/*
 * IkoLearn cloud view: a small canvas 2D renderer for the 3D cloud (no libraries).
 * Rotate (drag), pan (two fingers, right-drag or shift-drag), zoom (wheel, pinch, buttons), tap a node to pick it.
 * Labels are zoom-aware: subjects dominate when zoomed out; topic labels fade in and subjects fade back as you zoom in.
 * New or promoted nodes pulse for a few seconds so growth is visible.
 */
(function (root) {
  "use strict";
  var C = root.IkoCloud;
  var INK = "#2b2118", PAPER = "#f3ead8";
  var reduce = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function createView(canvas, opts) {
    opts = opts || {};
    var mini = Boolean(opts.mini);
    var ctx = canvas.getContext("2d");
    var cloud = null, pos = {}, highlight = {}, raf = 0, w = 0, h = 0, dpr = 1;
    var yaw = -0.5, pitch = 0.32, zoom = mini ? 1 : 1, panX = 0, panY = 0;
    var pointers = {}, gesture = null, idleSpin = mini && !reduce;
    var projected = [];

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(root.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      request();
    }

    function setCloud(c) { cloud = c; pos = c ? C.layout(c) : {}; request(); }
    function flash(ids) {
      var t = performance.now();
      (ids || []).forEach(function (id) { highlight[id] = t; });
      request();
    }

    function project(p) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      var x = p.x * cy - p.z * sy, z = p.x * sy + p.z * cy;
      var y = p.y * cp - z * sp; z = p.y * sp + z * cp;
      var f = 3.2 / (3.2 + z);
      var s = Math.min(w, h) * (mini ? 0.3 : 0.34) * zoom;
      return { x: w / 2 + panX + x * f * s, y: h / 2 + panY - y * f * s, f: f, z: z };
    }

    /* fresh growth first, then whichever kind of label this zoom level favours, then the heavier node */
    function labelRank(l) {
      var n = l.n, kind = !n.parent ? (zoom < 1.7 ? 3 : 1) : n.ghost ? 0 : (zoom < 1.7 ? 1 : 2);
      return (l.fresh ? 10 : 0) + kind + Math.min(0.9, (n.weight || 0) / 20) + l.a * 0.05;
    }

    function alphaParentLabel() { return zoom < 1.7 ? 1 : Math.max(0.18, 1 - (zoom - 1.7) / 1.3); }
    function alphaChildLabel() { return zoom < 1.25 ? 0 : Math.min(1, (zoom - 1.25) / 0.75); }

    function draw(now) {
      raf = 0;
      if (!cloud) return;
      ctx.clearRect(0, 0, w, h);
      var rootP = project(pos.root);
      var items = [];
      cloud.order.forEach(function (id) {
        var n = cloud.nodes[id], p = pos[id];
        if (!n || !p) return;
        items.push({ n: n, p: project(p) });
      });
      items.sort(function (a, b) { return b.p.z - a.p.z; });
      projected = items;
      var pulsing = false;

      /* edges */
      ctx.lineWidth = 1;
      items.forEach(function (it) {
        var n = it.n, from = n.parent ? project(pos[n.parent]) : rootP;
        if (!from) return;
        ctx.save();
        if (n.ghost) { ctx.setLineDash([2, 4]); ctx.globalAlpha = 0.28 * it.p.f; ctx.strokeStyle = C.colorOf(cloud, n); }
        else if (n.parent) { ctx.globalAlpha = 0.4 * it.p.f; ctx.strokeStyle = C.colorOf(cloud, n); }
        else { ctx.globalAlpha = 0.22; ctx.strokeStyle = INK; }
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(it.p.x, it.p.y); ctx.stroke();
        ctx.restore();
      });

      /* nodes */
      var pa = alphaParentLabel(), ca = alphaChildLabel(), labels = [];
      items.forEach(function (it) {
        var n = it.n, p = it.p;
        var r = n.parent ? (n.ghost ? 2.2 : 2.4 + Math.min(4, Math.sqrt(n.weight) * 1.1)) : 4.5 + Math.min(6, Math.sqrt(n.weight) * 1.2);
        r *= mini ? 0.6 : Math.max(0.8, Math.min(1.5, zoom * 0.75)) * p.f;
        var col = C.colorOf(cloud, n);
        ctx.save();
        ctx.globalAlpha = Math.min(1, 0.45 + 0.55 * p.f);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        if (n.ghost) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); }
        else { ctx.fillStyle = col; ctx.fill(); }
        var t0 = highlight[n.id];
        var age = t0 ? now - t0 : 1e9;
        if (age < 6000) {
          pulsing = true;
          var k = (age % 1500) / 1500;
          ctx.globalAlpha = (1 - k) * (1 - age / 6000) * 0.9;
          ctx.strokeStyle = col; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 3 + k * 14, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();

        if (mini) return;
        var la = n.parent ? (n.ghost ? ca * 0.6 : ca) : pa;
        if (age < 6000) la = Math.max(la, 0.95);
        la *= Math.min(1, 0.35 + 0.65 * p.f);
        if (la < 0.03) return;
        var size = n.parent ? 12 : 14 + Math.min(3, n.weight * 0.2);
        labels.push({ n: n, x: p.x, y: p.y - r - 5, a: la, fresh: age < 6000,
          font: (n.ghost ? "italic " : "") + (n.parent ? "" : "600 ") + Math.round(size * Math.max(0.85, Math.min(1.25, p.f))) + "px Georgia, 'Iowan Old Style', serif" });
      });

      /* labels: most important first; skip any that would collide with one already placed */
      var placed = [];
      ctx.save();
      ctx.font = "600 20px Georgia, 'Iowan Old Style', serif";
      var nw = ctx.measureText(cloud.name).width;
      placed.push({ x0: rootP.x - nw / 2 - 8, x1: rootP.x + nw / 2 + 8, y0: rootP.y - 16, y1: rootP.y + 16 });
      labels.sort(function (a, b) { return labelRank(b) - labelRank(a); });
      ctx.textAlign = "center"; ctx.fillStyle = INK;
      labels.forEach(function (l) {
        ctx.font = l.font;
        var tw = ctx.measureText(l.n.label).width, fs = +(/(\d+)px/.exec(l.font) || [0, 12])[1];
        var box = { x0: l.x - tw / 2 - 2, x1: l.x + tw / 2 + 2, y0: l.y - fs, y1: l.y + 3 };
        for (var i = 0; i < placed.length; i++) {
          var q = placed[i];
          if (box.x0 < q.x1 && box.x1 > q.x0 && box.y0 < q.y1 && box.y1 > q.y0) return;
        }
        placed.push(box);
        ctx.globalAlpha = l.a;
        ctx.fillText(l.n.label, l.x, l.y);
      });
      ctx.restore();

      /* the learner's name, always on top */
      ctx.save();
      ctx.fillStyle = PAPER; ctx.globalAlpha = 0.85;
      ctx.font = (mini ? "600 9px " : "600 20px ") + "Georgia, 'Iowan Old Style', serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      var tw = ctx.measureText(cloud.name).width;
      ctx.fillRect(rootP.x - tw / 2 - 6, rootP.y - (mini ? 7 : 14), tw + 12, mini ? 14 : 28);
      ctx.globalAlpha = 1; ctx.fillStyle = INK;
      ctx.fillText(cloud.name, rootP.x, rootP.y);
      ctx.restore();

      if (idleSpin) yaw += 0.0025;
      if (pulsing || idleSpin || gesture) request();
    }

    function request() { if (!raf) raf = root.requestAnimationFrame(draw); }

    function pick(x, y) {
      var rp = project(pos.root);
      if (Math.hypot(rp.x - x, rp.y - y) < 22) return { root: true };
      var best = null, bd = 20;
      projected.forEach(function (it) {
        var d = Math.hypot(it.p.x - x, it.p.y - y);
        if (d < bd) { bd = d; best = it.n; }
      });
      return best ? { node: best } : null;
    }

    function setZoom(z) { zoom = Math.max(0.6, Math.min(4.5, z)); request(); }

    /* ---------- input ---------- */
    function local(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    if (mini) {
      canvas.addEventListener("click", function () { if (opts.onOpen) opts.onOpen(); });
    } else {
      canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      canvas.addEventListener("pointerdown", function (e) {
        canvas.setPointerCapture(e.pointerId);
        pointers[e.pointerId] = local(e);
        var ids = Object.keys(pointers);
        if (ids.length === 1) gesture = { type: e.button === 2 || e.shiftKey ? "pan" : "rotate", start: local(e), last: local(e), moved: 0 };
        else if (ids.length === 2) {
          var a = pointers[ids[0]], b = pointers[ids[1]];
          gesture = { type: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, zoom: zoom, moved: 99 };
        }
        request();
      });
      canvas.addEventListener("pointermove", function (e) {
        if (!pointers[e.pointerId] || !gesture) return;
        pointers[e.pointerId] = local(e);
        var ids = Object.keys(pointers);
        if (gesture.type === "pinch" && ids.length >= 2) {
          var a = pointers[ids[0]], b = pointers[ids[1]];
          var d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          setZoom(gesture.zoom * d / Math.max(1, gesture.dist));
          panX += mid.x - gesture.mid.x; panY += mid.y - gesture.mid.y; gesture.mid = mid;
        } else if (ids.length === 1 && gesture.type !== "pinch") {
          var p = local(e), dx = p.x - gesture.last.x, dy = p.y - gesture.last.y;
          gesture.moved += Math.abs(dx) + Math.abs(dy);
          gesture.last = p;
          if (gesture.type === "pan") { panX += dx; panY += dy; }
          else { yaw += dx * 0.008; pitch = Math.max(-1.3, Math.min(1.3, pitch + dy * 0.008)); }
        }
        request();
      });
      var end = function (e) {
        var g = gesture;
        delete pointers[e.pointerId];
        if (!Object.keys(pointers).length) {
          gesture = null;
          if (g && g.type !== "pinch" && g.moved < 6 && opts.onPick) {
            var hit = pick(g.start.x, g.start.y);
            if (hit) opts.onPick(hit);
          }
        } else if (g && g.type === "pinch") gesture = null;
        request();
      };
      canvas.addEventListener("pointerup", end);
      canvas.addEventListener("pointercancel", end);
      canvas.addEventListener("wheel", function (e) { e.preventDefault(); setZoom(zoom * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    }

    root.addEventListener("resize", resize);
    resize();

    return {
      setCloud: setCloud,
      flash: flash,
      resize: resize,
      zoomBy: function (k) { setZoom(zoom * k); },
      reset: function () { yaw = -0.5; pitch = 0.32; zoom = 1; panX = 0; panY = 0; request(); },
      state: function () { return { yaw: yaw, pitch: pitch, zoom: zoom, panX: panX, panY: panY }; },
      setView: function (v) { if (v.zoom) setZoom(v.zoom); if (v.yaw != null) yaw = v.yaw; if (v.pitch != null) pitch = v.pitch; if (v.panX != null) panX = v.panX; if (v.panY != null) panY = v.panY; request(); },
      focusNode: function (id) {
        var p = pos[id]; if (!p) return;
        var pr = project(p); panX += w / 2 - pr.x; panY += h / 2 - pr.y; request();
      }
    };
  }

  root.IkoCloudView = { create: createView };
})(window);
