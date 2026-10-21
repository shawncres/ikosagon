/*
 * IkoLearn cloud view: a small canvas 2D renderer for the 3D knowledge tree (no libraries).
 * Rotate (drag), pan (two fingers, right-drag or shift-drag), zoom (wheel, pinch, buttons), tap a node to pick it.
 * Depth- and zoom-aware: each level of the tree is drawn smaller; deeper levels appear (and get labels) as you zoom in
 * or focus a branch, and higher labels fade back. At most DRAW_CAP points are drawn at once.
 * New or promoted nodes pulse for a few seconds; the recommended next topic carries a quiet ring.
 */
(function (root) {
  "use strict";
  var C = root.IkoCloud;
  var INK = "#2b2118", PAPER = "#f3ead8";
  var FONT = "Georgia, 'Iowan Old Style', serif";
  var DRAW_CAP = 260, ZMIN = 0.6, ZMAX = 60;
  var reduce = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function createView(canvas, opts) {
    opts = opts || {};
    var mini = Boolean(opts.mini);
    var ctx = canvas.getContext("2d");
    var cloud = null, pos = {}, depth = {}, pathRank = {}, highlight = {}, raf = 0, w = 0, h = 0, dpr = 1;
    var yaw = -0.5, pitch = 0.32, zoom = 1, panX = 0, panY = 0;
    var pointers = {}, gesture = null, idleSpin = mini && !reduce, tween = null;
    var focusId = null, focusSet = {};
    var projected = [];
    /* Test nodes: { parentId: "ready" | "taken" } (from orchestrator.js), drawn as a small diamond hanging off the parent */
    var tests = {}, testMarks = [];

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(root.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      request();
    }

    function setCloud(c) {
      cloud = c;
      pos = c ? C.layout(c) : {};
      depth = {}; pathRank = {};
      if (c) {
        Object.keys(pos).forEach(function (id) { depth[id] = pos[id].d; });
        c.order.forEach(function (id) {
          var n = c.nodes[id];
          if (n && n.path) n.path.ids.forEach(function (x, i) { if (c.nodes[x] && c.nodes[x].parent === id) pathRank[x] = i + 1; });
        });
      }
      setFocus(focusId);
      request();
    }
    function flash(ids) {
      var t = performance.now();
      (ids || []).forEach(function (id) { highlight[id] = t; });
      request();
    }

    /* the focused node, its ancestors, and two levels of its subtree are always drawn */
    function setFocus(id) {
      focusId = id && cloud && cloud.nodes[id] ? id : null;
      focusSet = {};
      if (!focusId) return;
      C.ancestry(cloud, focusId).forEach(function (x) { focusSet[x] = 1; });
      var ix = C.index(cloud), level = [focusId];
      for (var d = 0; d < 2; d++) {
        var nextLevel = [];
        level.forEach(function (x) { (ix[x] || []).forEach(function (k) { focusSet[k] = 1; nextLevel.push(k); }); });
        level = nextLevel;
      }
    }

    function project(p) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      var x = p.x * cy - p.z * sy, z = p.x * sy + p.z * cy;
      var y = p.y * cp - z * sp; z = p.y * sp + z * cp;
      var f = 3.2 / (3.2 + z);
      var s = Math.min(w, h) * (mini ? 0.3 : 0.34) * zoom;
      return { x: w / 2 + panX + x * f * s, y: h / 2 + panY - y * f * s, f: f, z: z };
    }

    /* How big a node's level reads on screen right now (1 = a subject at zoom 1). */
    function reads(id) { return zoom * C.levelScale(depth[id] || 1); }

    /* Which nodes to draw: subjects and topics always (thumbnail: those only), deeper ones once their level is legible. */
    function visibleIds(now) {
      var cand = [];
      cloud.order.forEach(function (id) {
        var n = cloud.nodes[id], d = depth[id];
        if (!n || !pos[id]) return;
        var fresh = highlight[id] && now - highlight[id] < 6000;
        var show = mini ? d <= 2 || fresh : d <= 2 || reads(id) >= 0.3 || focusSet[id] || fresh || id === cloud.next;
        if (!show) return;
        cand.push({ id: id, pri: (focusSet[id] ? 0 : 10) + (fresh ? 0 : 1) + d * 2 - Math.min(1.5, (n.weight || 0) / 10) });
      });
      if (cand.length > DRAW_CAP) { cand.sort(function (a, b) { return a.pri - b.pri; }); cand = cand.slice(0, DRAW_CAP); }
      var set = {};
      cand.forEach(function (c) { set[c.id] = 1; });
      return set;
    }

    /* label alpha from legibility: fade in as the level becomes readable, fade back once you are well inside it */
    function labelAlpha(id, n) {
      var v = reads(id);
      var a = v < 0.7 ? 0 : Math.min(1, (v - 0.7) / 0.5);
      if (v > 1.9) a = Math.max(0.18, 1 - (v - 1.9) / 1.4);
      if (!n.parent && zoom < 1.7) a = 1;
      if (n.ghost) a *= 0.65;
      return a;
    }

    function labelRank(l) {
      var n = l.n, v = reads(n.id);
      var legible = v >= 0.9 && v <= 2.2 ? 2 : 1;
      return (l.fresh ? 20 : 0) + (n.id === cloud.next ? 8 : 0) + (focusSet[n.id] ? 4 : 0) + legible + (n.ghost ? 0 : 0.5) + Math.min(0.9, (n.weight || 0) / 20) + l.a * 0.05;
    }

    function draw(now) {
      raf = 0;
      if (!cloud) return;
      if (tween) stepTween(now);
      ctx.clearRect(0, 0, w, h);
      var rootP = project(pos.root);
      var vis = visibleIds(now), items = [], at = { root: rootP };
      Object.keys(vis).forEach(function (id) { var p = project(pos[id]); at[id] = p; items.push({ n: cloud.nodes[id], p: p }); });
      items.sort(function (a, b) { return b.p.z - a.p.z; });
      projected = items;
      var pulsing = false;

      /* edges */
      ctx.lineWidth = 1;
      items.forEach(function (it) {
        var n = it.n, from = n.parent ? at[n.parent] : rootP;
        if (!from) return;
        ctx.save();
        var fade = Math.min(1, 0.5 + reads(n.id));
        if (n.ghost) { ctx.setLineDash([2, 4]); ctx.globalAlpha = 0.3 * it.p.f * fade; ctx.strokeStyle = C.colorOf(cloud, n); }
        else if (n.parent) { ctx.globalAlpha = 0.42 * it.p.f * fade; ctx.strokeStyle = C.colorOf(cloud, n); }
        else { ctx.globalAlpha = 0.22; ctx.strokeStyle = INK; }
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(it.p.x, it.p.y); ctx.stroke();
        ctx.restore();
      });

      /* nodes */
      var labels = [];
      items.forEach(function (it) {
        var n = it.n, p = it.p, d = depth[n.id] || 1;
        var base = !n.parent ? 4.5 + Math.min(6, Math.sqrt(n.weight) * 1.2) : (n.ghost ? 2.2 : 2.4 + Math.min(4, Math.sqrt(n.weight) * 1.1));
        var r = mini ? base * 0.6 : base * Math.max(0.55, Math.min(1.6, reads(n.id) * 0.9 + (d > 1 ? 0.25 : 0))) * p.f;
        var col = C.colorOf(cloud, n);
        ctx.save();
        ctx.globalAlpha = Math.min(1, 0.45 + 0.55 * p.f);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        if (n.ghost) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); }
        else { ctx.fillStyle = col; ctx.fill(); }
        if (!mini && n.mastery >= C.MASTERED && !n.ghost) {
          ctx.globalAlpha = 0.5; ctx.strokeStyle = INK; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 1.8, 0, Math.PI * 2); ctx.stroke();
        }
        if (!mini && n.id === cloud.next) {
          ctx.globalAlpha = 0.38; ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.setLineDash([1, 3]);
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        }
        var t0 = highlight[n.id], age = t0 ? now - t0 : 1e9;
        if (age < 6000) {
          pulsing = true;
          var k = (age % 1500) / 1500;
          ctx.globalAlpha = (1 - k) * (1 - age / 6000) * 0.9;
          ctx.strokeStyle = col; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 3 + k * 14, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();

        if (mini) return;
        var la = labelAlpha(n.id, n);
        if (age < 6000 || n.id === cloud.next || n.id === focusId) la = Math.max(la, 0.92);
        la *= Math.min(1, 0.35 + 0.65 * p.f);
        if (la < 0.03) return;
        var size = !n.parent ? 14 + Math.min(3, n.weight * 0.2) : 12.5;
        var text = (pathRank[n.id] && reads(n.id) >= 0.8 ? pathRank[n.id] + ". " : "") + n.label;
        labels.push({ n: n, text: text, x: p.x, y: p.y - r - 5, a: la, fresh: age < 6000,
          font: (n.ghost ? "italic " : "") + (n.parent ? "" : "600 ") + Math.round(size * Math.max(0.85, Math.min(1.2, p.f))) + "px " + FONT });
      });

      /* test nodes: a dotted diamond while offered, inked once taken, on a short dotted link from their parent */
      testMarks = [];
      items.forEach(function (it) {
        var st = tests[it.n.id];
        if (!st) return;
        var p = it.p, off = mini ? 5 : 20 * Math.max(0.75, p.f), x = p.x + off, y = p.y + off * 0.8, sz = mini ? 2.4 : 5.5 * Math.max(0.8, p.f);
        var col = C.colorOf(cloud, it.n);
        ctx.save();
        ctx.globalAlpha = 0.55; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([1.5, 2.5]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - sz); ctx.lineTo(x + sz, y); ctx.lineTo(x, y + sz); ctx.lineTo(x - sz, y); ctx.closePath();
        ctx.globalAlpha = 0.95;
        if (st === "taken") { ctx.setLineDash([]); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = INK; ctx.globalAlpha = 0.5; ctx.stroke(); }
        else { ctx.setLineDash([2, 2]); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke(); }
        ctx.restore();
        testMarks.push({ id: it.n.id, x: x, y: y });
        if (!mini) labels.push({ n: it.n, text: st === "taken" ? "Test · taken" : "Test", x: x, y: y + sz + 13, a: 0.95, fresh: st === "ready", font: "italic " + Math.round(11.5 * Math.max(0.9, Math.min(1.15, p.f))) + "px " + FONT });
      });

      /* labels: most important first; skip any that would collide with one already placed */
      var placed = [];
      ctx.save();
      ctx.font = "600 20px " + FONT;
      var nw = ctx.measureText(cloud.name).width;
      placed.push({ x0: rootP.x - nw / 2 - 8, x1: rootP.x + nw / 2 + 8, y0: rootP.y - 16, y1: rootP.y + 16 });
      labels.sort(function (a, b) { return labelRank(b) - labelRank(a); });
      ctx.textAlign = "center"; ctx.fillStyle = INK;
      labels.forEach(function (l) {
        ctx.font = l.font;
        var tw = ctx.measureText(l.text).width, fs = +(/(\d+)px/.exec(l.font) || [0, 12])[1];
        var box = { x0: l.x - tw / 2 - 2, x1: l.x + tw / 2 + 2, y0: l.y - fs, y1: l.y + 3 };
        if (box.x1 < 0 || box.x0 > w || box.y1 < 0 || box.y0 > h) return;
        for (var i = 0; i < placed.length; i++) {
          var q = placed[i];
          if (box.x0 < q.x1 && box.x1 > q.x0 && box.y0 < q.y1 && box.y1 > q.y0) return;
        }
        placed.push(box);
        ctx.globalAlpha = l.a;
        ctx.fillText(l.text, l.x, l.y);
      });
      ctx.restore();

      /* the learner's name, always on top */
      ctx.save();
      ctx.fillStyle = PAPER; ctx.globalAlpha = 0.85;
      ctx.font = (mini ? "600 9px " : "600 20px ") + FONT;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      var tw = ctx.measureText(cloud.name).width;
      ctx.fillRect(rootP.x - tw / 2 - 6, rootP.y - (mini ? 7 : 14), tw + 12, mini ? 14 : 28);
      ctx.globalAlpha = 1; ctx.fillStyle = INK;
      ctx.fillText(cloud.name, rootP.x, rootP.y);
      ctx.restore();

      if (idleSpin) yaw += 0.0025;
      if (pulsing || idleSpin || gesture || tween) request();
    }

    function request() { if (!raf) raf = root.requestAnimationFrame(draw); }

    function pick(x, y) {
      var rp = project(pos.root);
      if (Math.hypot(rp.x - x, rp.y - y) < 22) return { root: true };
      for (var t = 0; t < testMarks.length; t++) if (Math.hypot(testMarks[t].x - x, testMarks[t].y - y) < 11) return { test: testMarks[t].id };
      var best = null, bd = 20;
      projected.forEach(function (it) {
        var d = Math.hypot(it.p.x - x, it.p.y - y) - (focusSet[it.n.id] ? 3 : 0);
        if (d < bd) { bd = d; best = it.n; }
      });
      return best ? { node: best } : null;
    }

    function setZoom(z) { zoom = Math.max(ZMIN, Math.min(ZMAX, z)); request(); }

    /* Glide so a node sits at (cx, cy) with its children legible. */
    function focusNode(id, o) {
      o = o || {};
      if (!cloud || !pos[id]) return;
      setFocus(id);
      var d = depth[id] || 1;
      var targetZoom = o.zoom || Math.max(1, Math.min(ZMAX, 1.25 / C.levelScale(d + 1)));
      var cx = o.cx == null ? w / 2 : o.cx, cy = o.cy == null ? h / 2 : o.cy;
      var from = { zoom: zoom, panX: panX, panY: panY };
      var saved = { zoom: zoom, panX: panX, panY: panY };
      zoom = targetZoom; panX = 0; panY = 0;
      var pr = project(pos[id]);
      var to = { zoom: targetZoom, panX: cx - pr.x, panY: cy - pr.y };
      zoom = saved.zoom; panX = saved.panX; panY = saved.panY;
      if (reduce || o.instant) { zoom = to.zoom; panX = to.panX; panY = to.panY; tween = null; request(); return; }
      tween = { t0: performance.now(), ms: 450, from: from, to: to };
      request();
    }
    function stepTween(now) {
      var k = Math.min(1, (now - tween.t0) / tween.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      var lz = Math.log(tween.from.zoom) + (Math.log(tween.to.zoom) - Math.log(tween.from.zoom)) * e;
      zoom = Math.exp(lz);
      panX = tween.from.panX + (tween.to.panX - tween.from.panX) * e;
      panY = tween.from.panY + (tween.to.panY - tween.from.panY) * e;
      if (k >= 1) tween = null;
    }

    /* ---------- input ---------- */
    function local(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function zoomAt(k, at) {
      var before = zoom;
      setZoom(zoom * k);
      var real = zoom / before;
      if (at) { panX = at.x - w / 2 - (at.x - w / 2 - panX) * real; panY = at.y - h / 2 - (at.y - h / 2 - panY) * real; }
    }

    if (mini) {
      canvas.addEventListener("click", function () { if (opts.onOpen) opts.onOpen(); });
    } else {
      canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      canvas.addEventListener("pointerdown", function (e) {
        tween = null;
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
          zoomAt((gesture.zoom * d / Math.max(1, gesture.dist)) / zoom, mid);
          panX += mid.x - gesture.mid.x; panY += mid.y - gesture.mid.y; gesture.mid = mid;
        } else if (ids.length === 1 && gesture.type !== "pinch") {
          var p = local(e), dx = p.x - gesture.last.x, dy = p.y - gesture.last.y;
          gesture.moved += Math.abs(dx) + Math.abs(dy);
          gesture.last = p;
          if (gesture.type === "pan" || zoom > 3) { panX += dx; panY += dy; }
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
      canvas.addEventListener("wheel", function (e) { e.preventDefault(); tween = null; zoomAt(Math.exp(-e.deltaY * 0.0015), local(e)); }, { passive: false });
    }

    root.addEventListener("resize", resize);
    resize();

    return {
      setCloud: setCloud,
      setTests: function (map) { tests = map || {}; request(); },
      flash: flash,
      resize: resize,
      zoomBy: function (k) { tween = null; zoomAt(k, null); },
      reset: function () { yaw = -0.5; pitch = 0.32; zoom = 1; panX = 0; panY = 0; tween = null; setFocus(null); request(); },
      state: function () { return { yaw: yaw, pitch: pitch, zoom: zoom, panX: panX, panY: panY, focus: focusId, drawn: projected.length }; },
      setView: function (v) { if (v.zoom) setZoom(v.zoom); if (v.yaw != null) yaw = v.yaw; if (v.pitch != null) pitch = v.pitch; if (v.panX != null) panX = v.panX; if (v.panY != null) panY = v.panY; request(); },
      focusNode: focusNode,
      clearFocus: function () { setFocus(null); request(); }
    };
  }

  root.IkoCloudView = { create: createView, DRAW_CAP: DRAW_CAP };
})(window);
