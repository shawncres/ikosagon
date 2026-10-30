/*
 * IkoLearn cloud view: a small canvas 2D renderer for the 3D knowledge tree (no libraries).
 * Input (camera.js): drag pans (with a short glide), right-drag / Shift-drag / two-finger twist turns, pinch / wheel /
 * buttons zoom; tapping a node picks it and the app eases it into focus (focusNode), which also moves the turn centre
 * (the pivot) to that node, so turning orbits the node you are looking at; Recentre puts the pivot back. Merged parents are drawn brighter
 * with a ring per level; the cards they absorbed sit close round them as a tighter constellation.
 * Depth- and zoom-aware: each level of the tree is drawn smaller; deeper levels appear (and get labels) as you zoom in
 * or focus a branch, and higher labels fade back. At most DRAW_CAP points are drawn at once.
 * New or promoted nodes pulse for a few seconds; the recommended next topic carries a quiet ring.
 */
(function (root) {
  "use strict";
  var C = root.IkoCloud, CAM = root.IkoCamera;
  var INK = "#2b2118", PAPER = "#f3ead8";
  /* light and dark (theme.js): the canvas takes the page's ink and paper, and node colours toned for the page; on the
     dark page an open path is a light ink (never black) and a finished line keeps its node's colour */
  var TH = root.IkoTheme;
  function retheme() { if (!TH) return; var k = TH.inks(); INK = k.ink; PAPER = k.paper; }
  retheme();
  if (TH && root.addEventListener) root.addEventListener("ikotheme", retheme);
  var FONT = "Georgia, 'Iowan Old Style', serif";
  var DRAW_CAP = 260, ZMIN = CAM.CAM.zmin, ZMAX = CAM.CAM.zmax, HOME = { yaw: -0.5, pitch: 0.32, zoom: 1, panX: 0, panY: 40 }; /* panY: the home view sits a little low, so the top branches stay clear of the controls and the hint line */
  var reduce = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function createView(canvas, opts) {
    opts = opts || {};
    var mini = Boolean(opts.mini);
    var ctx = canvas.getContext("2d");
    var cloud = null, pos = {}, depth = {}, pathRank = {}, highlight = {}, kids = {}, raf = 0, w = 0, h = 0, dpr = 1;
    var yaw = HOME.yaw, pitch = HOME.pitch, zoom = HOME.zoom, panX = HOME.panX, panY = HOME.panY, pivot = CAM.ORIGIN;
    var pointers = {}, gesture = null, idleSpin = mini && !reduce, tween = null, glideV = null;
    var focusId = null, focusSet = {}, selectAt = 0; /* selectAt: when the focused node was picked (its ring eases in) */
    /* the big cloud's idle spin (camera.js spinState): on only while the overlay is open (spinOn) and nothing covers it (spinHeld) */
    var spinOn = false, spinHeld = false, lastInput = 0, lastFrame = 0, spinning = false, spinFrom = 0, resumeTimer = 0;
    var doc = root.document;
    function touch() { lastInput = performance.now(); }
    var projected = [];
    /* Test nodes: { parentId: "ready" | "taken" } (from orchestrator.js), drawn as a small diamond hanging off the parent */
    var tests = {}, testMarks = [];
    /* a cloud of any size: the camera stands further back (camD) and Recentre frames the whole cloud (home) once
       subjects reach the outer shells; a cloud of up to 12 subjects is exactly as before (camD 3.2, zoom 1) */
    var camD = 3.2, home = HOME, zfloor = ZMIN, colors = {}, done = {}, rootBox = null, hideRoot = false;
    /* PR 103: a little more life as the cloud grows: vivid (0..1, from how many topics are finished), each subject's fill (its
       finished share: a soft halo of its own colour that warms as the branch fills in), and fadeK, a branch left alone
       for weeks drawn a little quieter (C.fadeOf; never removed, back at once with any activity) */
    var vivid = 0, fill = {}, fadeK = {}, subOf = {};

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(root.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      request();
    }

    function setCloud(c) {
      var first = !cloud;
      cloud = c;
      pos = c ? C.layout(c) : {};
      depth = {}; pathRank = {}; kids = {}; colors = {}; done = {}; fill = {}; fadeK = {}; subOf = {}; vivid = 0;
      var ext = 1;
      if (c) C.subjects(c).forEach(function (s) { var p = pos[s.id]; if (p) ext = Math.max(ext, Math.hypot(p.x, p.y, p.z)); });
      camD = Math.max(3.2, ext * 1.7);
      home = Object.assign({}, HOME, { zoom: Math.min(1, 1.15 / ext) });
      zfloor = Math.min(ZMIN, home.zoom * 0.7);
      if (first && c) zoom = home.zoom; /* a restored view (setView) still wins */
      if (c) {
        c.order.forEach(function (id) { var n = c.nodes[id]; if (n && n.parent) kids[n.parent] = 1; });
        Object.keys(pos).forEach(function (id) { depth[id] = pos[id].d; });
        /* finished topics (worked out once per cloud, not per frame): their lines take the node's own colour */
        c.order.forEach(function (id) { if (c.nodes[id] && c.nodes[id].parent && C.isDone(c, id)) done[id] = 1; });
        var tally = {}, now = Date.now(), nDone = 0;
        var last = {};
        C.subjects(c).forEach(function (sj) { tally[sj.id] = { all: 0, done: 0 }; subOf[sj.id] = sj.id; last[sj.id] = Math.max(sj.touched || 0, sj.heatAt || 0, sj.born || 0); });
        c.order.forEach(function (id) {
          var n = c.nodes[id];
          if (!n || !n.parent) return;
          var sid = C.ancestry(c, id)[0], t = tally[sid];
          subOf[id] = sid;
          if (sid in last) last[sid] = Math.max(last[sid], n.touched || 0, n.heatAt || 0, n.born || 0);
          if (!t || n.ghost) return;
          t.all += 1; if (done[id]) { t.done += 1; nDone += 1; }
        });
        /* one pass for every branch's last activity (the same rule as C.fadeOf) */
        Object.keys(last).forEach(function (sid) { fadeK[sid] = 1 - (C.fadeAfter ? C.fadeAfter(last[sid], now) : 0); });
        Object.keys(subOf).forEach(function (id) { if (fadeK[id] == null) fadeK[id] = fadeK[subOf[id]] == null ? 1 : fadeK[subOf[id]]; });
        Object.keys(tally).forEach(function (sid) { fill[sid] = tally[sid].all ? tally[sid].done / tally[sid].all : 0; });
        vivid = Math.min(1, nDone / 12);
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
      var was = focusId;
      focusId = id && cloud && cloud.nodes[id] ? id : null;
      if (focusId && focusId !== was) selectAt = performance.now();
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

    /* p − pivot, turned (yaw about the vertical axis, then pitch), in perspective; the pivot lands at centre + pan */
    function project(p) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      var px = p.x - pivot.x, py = p.y - pivot.y, pz = p.z - pivot.z;
      var x = px * cy - pz * sy, z = px * sy + pz * cy;
      var y = py * cp - z * sp; z = py * sp + z * cp;
      var f = camD / (camD + Math.max(z, -camD * 0.8));
      var s = Math.min(w, h) * (mini ? 0.3 : 0.34) * zoom;
      return { x: w / 2 + panX + x * f * s, y: h / 2 + panY - y * f * s, f: f, z: z };
    }

    /* The selected node's ring and size ease in over 420 ms (smoothstep); instantly with reduced motion. */
    function selEase(now) { if (reduce) return 1; var k = Math.max(0, Math.min(1, (now - selectAt) / 420)); return k * k * (3 - 2 * k); }

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
      else if (kids[id] && v >= 0.42 && v <= 1.9) a = Math.max(a, 0.72); /* a branch's parent stays readable zoomed out */
      if (n.ghost) a *= 0.65;
      return a;
    }

    function labelRank(l) {
      var n = l.n, v = reads(n.id);
      var legible = v >= 0.9 && v <= 2.2 ? 2 : 1;
      return (l.fresh ? 20 : 0) + (n.id === cloud.next ? 8 : 0) + (focusSet[n.id] ? 4 : 0) + legible + (n.ghost ? 0 : 0.5) + Math.min(0.9, (n.weight || 0) / 20) + l.a * 0.05;
    }

    var drawMs = 0; /* how long the last frame took to draw (state().drawMs: the perf checks read it) */
    function draw(now) {
      raf = 0;
      if (!cloud) return;
      var t0 = performance.now();
      if (tween) stepTween(now);
      if (glideV) stepGlide(now);
      ctx.clearRect(0, 0, w, h);
      var rootP = project(pos.root);
      var vis = visibleIds(now), items = [], at = { root: rootP };
      Object.keys(vis).forEach(function (id) { var p = project(pos[id]); at[id] = p; items.push({ n: cloud.nodes[id], p: p }); });
      items.sort(function (a, b) { return b.p.z - a.p.z; });
      projected = items;
      var pulsing = false;

      /* edges: a line leading to a finished topic takes that topic's colour; an open or unfinished path is drawn in dark
         sepia ink so it reads clearly; dotted lines (a side path, a suggested branch) stay dotted */
      items.forEach(function (it) {
        var n = it.n, side = n.role === "optional" && n.off && at[n.off], from = side ? at[n.off] : n.parent ? at[n.parent] : rootP;
        if (!from) return;
        ctx.save();
        var fade = Math.min(1, 0.55 + reads(n.id)) * (!mini && focusId && !focusSet[n.id] ? 0.5 : 1) * (fadeK[n.id] == null ? 1 : fadeK[n.id]), fin = done[n.id], k = mini ? 0.8 : 1;
        if (n.absorbedInto && n.absorbedInto === n.parent) { ctx.globalAlpha = 0.7 * it.p.f * fade; ctx.lineWidth = 1 * k; ctx.strokeStyle = colorOf(n); from = at[n.parent] || from; }
        else if (side) { ctx.setLineDash([1.5, 3]); ctx.globalAlpha = (fin ? 0.75 : 0.5) * it.p.f * fade; ctx.lineWidth = 1.1 * k; ctx.strokeStyle = fin ? colorOf(n) : INK; }
        else if (n.ghost) { ctx.setLineDash([2, 4]); ctx.globalAlpha = 0.42 * it.p.f * fade; ctx.lineWidth = 1 * k; ctx.strokeStyle = INK; }
        else if (n.parent && fin) { ctx.globalAlpha = 0.92 * it.p.f * fade; ctx.lineWidth = (1.7 + 0.7 * vivid) * k; ctx.strokeStyle = colorOf(n); }
        else if (n.parent) { ctx.globalAlpha = 0.66 * it.p.f * fade; ctx.lineWidth = 1.2 * k; ctx.strokeStyle = INK; }
        else { ctx.globalAlpha = 0.5 * fade; ctx.lineWidth = 1.2 * k; ctx.strokeStyle = INK; }
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(it.p.x, it.p.y); ctx.stroke();
        ctx.restore();
      });

      /* nodes */
      var labels = [];
      items.forEach(function (it) {
        var n = it.n, p = it.p, d = depth[n.id] || 1;
        /* a clear hierarchy: the name (its plate), then subjects, then branches, then their leaves, a little smaller each step */
        var base = !n.parent ? 5.2 + Math.min(6.5, Math.sqrt(n.weight) * 1.25) : (n.ghost ? 2.2 : (2.4 + Math.min(4, Math.sqrt(n.weight) * 1.1)) * (d >= 3 ? 0.9 : 1));
        var ml = Math.min(3, n.ml || 0), absorbed = Boolean(n.absorbedInto);
        base *= (1 + 0.16 * ml) * (absorbed ? 0.72 : 1); /* merged: a stronger node; absorbed: a small star of its constellation */
        var r = mini ? base * 0.6 : base * Math.max(0.55, Math.min(1.6, reads(n.id) * 0.9 + (d > 1 ? 0.25 : 0))) * p.f;
        var col = colorOf(n);
        var sel = !mini && n.id === focusId, sk = sel ? selEase(now) : 0;
        if (sel) { r *= 1 + 0.28 * sk; if (sk < 1) pulsing = true; }
        /* quiet: with a node selected, everything off its branch steps back */
        var quiet = (!mini && focusId && !focusSet[n.id] ? 0.55 : 1) * (fadeK[n.id] == null ? 1 : fadeK[n.id]);
        ctx.save();
        if (!n.parent && !mini && !n.ghost) {
          /* a subject's halo, in its own colour: stronger as its branch fills in and as the cloud grows; calm, never a glare */
          var fl = fill[n.id] || 0, ha = (0.07 + 0.2 * fl) * (0.55 + 0.45 * vivid) * quiet, hr = r + 7 + 10 * fl;
          if (ha > 0.02) { /* two soft discs (no gradient: cheap on a cloud of any size) */
            ctx.fillStyle = col;
            ctx.globalAlpha = ha * 0.45; ctx.beginPath(); ctx.arc(p.x, p.y, hr, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = ha * 0.6; ctx.beginPath(); ctx.arc(p.x, p.y, (r + hr) / 2, 0, Math.PI * 2); ctx.fill();
          }
          if (fl >= 0.5) { ctx.globalAlpha = 0.28 * quiet; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, r + 3.5, 0, Math.PI * 2); ctx.stroke(); } /* half its branch done: a fine ring of its colour */
        }
        if (sel) {
          /* the selected node: a soft glow of its own colour and a fine ink ring that fade in (no motion with reduced motion) */
          var gl = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r + 16);
          gl.addColorStop(0, col); gl.addColorStop(1, "rgba(0,0,0,0)");
          ctx.globalAlpha = 0.2 * sk; ctx.fillStyle = gl;
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 16, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.6 * sk; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 4 + 3 * (1 - sk), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = Math.min(1, 0.45 + 0.55 * p.f) * (absorbed ? 0.85 : 1) * (n.ghost ? 0.7 : 1) * quiet;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        if (n.ghost) { ctx.setLineDash([1.5, 2]); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
        else { ctx.fillStyle = col; ctx.fill(); }
        /* a merged parent: one quiet ring per level (I, II, III) */
        for (var mr = 0; mr < ml; mr++) {
          ctx.globalAlpha = (0.42 - mr * 0.1) * Math.min(1, 0.5 + p.f * 0.5); ctx.strokeStyle = col; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 3 + mr * 2.8, 0, Math.PI * 2); ctx.stroke();
        }
        if (!mini && n.mastery >= C.MASTERED && !n.ghost && !ml) {
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
        if (absorbed && !focusSet[n.id]) la *= 0.55; /* the constellation reads as one: its labels stay quiet until focused */
        if (age < 6000 || n.id === cloud.next || n.id === focusId) la = Math.max(la, 0.92);
        if (focusId && !focusSet[n.id]) la *= 0.6;
        la *= Math.min(1, 0.35 + 0.65 * p.f) * (fadeK[n.id] == null ? 1 : Math.max(0.7, fadeK[n.id]));
        if (la < 0.03) return;
        var size = !n.parent ? 14 + Math.min(3, n.weight * 0.2) : 12.5;
        var text = (pathRank[n.id] && reads(n.id) >= 0.8 ? pathRank[n.id] + ". " : "") + n.label + (ml ? " " + C.roman(n.ml) : "");
        labels.push({ n: n, text: text, x: p.x, y: p.y - r - 5, a: la, fresh: age < 6000,
          font: (n.ghost ? "italic " : "") + (n.parent && n.id !== focusId ? "" : "600 ") + Math.round(size * Math.max(0.85, Math.min(1.2, p.f))) + "px " + FONT });
      });

      /* test nodes: a dotted diamond while offered, inked once taken, on a short dotted link from their parent */
      testMarks = [];
      items.forEach(function (it) {
        var st = tests[it.n.id];
        if (!st) return;
        var p = it.p, off = mini ? 5 : 20 * Math.max(0.75, p.f), x = p.x + off, y = p.y + off * 0.8, sz = mini ? 2.4 : 5.5 * Math.max(0.8, p.f);
        var col = colorOf(it.n);
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
      if (!hideRoot) placed.push({ x0: rootP.x - nw / 2 - 20, x1: rootP.x + nw / 2 + 20, y0: rootP.y - 23, y1: rootP.y + 23 }); /* the name plate and its ring */
      labels.sort(function (a, b) { return labelRank(b) - labelRank(a); });
      ctx.textAlign = "center"; ctx.fillStyle = INK;
      labels.forEach(function (l) {
        ctx.font = l.font;
        var tw = ctx.measureText(l.text).width, fs = +(/(\d+)px/.exec(l.font) || [0, 12])[1];
        var box = { x0: l.x - tw / 2 - 5, x1: l.x + tw / 2 + 5, y0: l.y - fs - 1, y1: l.y + 4 };
        if (box.x1 < 0 || box.x0 > w || box.y1 < 0 || box.y0 > h) return;
        for (var i = 0; i < placed.length; i++) {
          var q = placed[i];
          if (box.x0 < q.x1 && box.x1 > q.x0 && box.y0 < q.y1 && box.y1 > q.y0) return;
        }
        placed.push(box);
        /* a paper halo keeps labels readable over edges at every zoom */
        ctx.globalAlpha = l.a * 0.9; ctx.strokeStyle = PAPER; ctx.lineWidth = 3.2; ctx.lineJoin = "round";
        ctx.strokeText(l.text, l.x, l.y);
        ctx.globalAlpha = l.a;
        ctx.fillText(l.text, l.x, l.y);
      });
      ctx.restore();

      /* the learner's name, always on top: the root of the cloud, on a paper plate with a fine double ink ring, so it reads
         as the node everything grows from (not drawn while the page shows it itself: the opening question) */
      ctx.save();
      if (!hideRoot) {
        ctx.font = (mini ? "600 9px " : "600 20px ") + FONT;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        var tw = ctx.measureText(cloud.name).width, px = mini ? 5 : 15, ph = mini ? 8 : 18, bw = tw + 2 * px;
        rootBox = { hw: bw / 2, hh: ph };
        ctx.globalAlpha = 0.94; ctx.fillStyle = PAPER;
        pill(rootP.x - bw / 2, rootP.y - ph, bw, 2 * ph); ctx.fill();
        ctx.globalAlpha = 0.62; ctx.strokeStyle = INK; ctx.lineWidth = mini ? 0.8 : 1.3;
        pill(rootP.x - bw / 2, rootP.y - ph, bw, 2 * ph); ctx.stroke();
        if (!mini) {
          ctx.globalAlpha = 0.2; ctx.lineWidth = 1;
          pill(rootP.x - bw / 2 - 4, rootP.y - ph - 4, bw + 8, 2 * ph + 8); ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.fillStyle = INK;
        ctx.fillText(cloud.name, rootP.x, rootP.y + (mini ? 0 : 1));
      }
      ctx.restore();

      if (idleSpin) yaw += 0.0025;
      var sp = { on: false, wait: Infinity };
      if (!mini) {
        if (tween) lastInput = now; /* a focus glide (it follows a click) is waited out; a drag, pan, pinch or glide keeps the spin going */
        sp = CAM.spinState({ reduce: reduce, hidden: Boolean(doc && doc.hidden), active: spinOn, paused: spinHeld, busy: Boolean(tween), now: now, lastInput: lastInput });
        if (sp.on && !spinning) spinFrom = now; /* eases in from here */
        if (sp.on) yaw += CAM.spinStep(spinning ? now - lastFrame : 16, now - spinFrom);
      }
      spinning = sp.on; lastFrame = now;
      drawMs = performance.now() - t0;
      if (opts.onDraw) opts.onDraw(); /* the app keeps the selection card attached to its node */
      if (pulsing || idleSpin || sp.on || gesture || tween || glideV) request();
      else if (sp.wait !== Infinity && !resumeTimer) resumeTimer = setTimeout(function () { resumeTimer = 0; request(); }, sp.wait + 30);
    }

    function request() { if (!raf) raf = root.requestAnimationFrame(draw); }
    /* a rounded plate (a pill) as the current path */
    function pill(x, y, bw, bh) {
      var r = bh / 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.lineTo(x + bw - r, y); ctx.arc(x + bw - r, y + r, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x + r, y + bh); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
    }

    function pick(x, y) {
      var rp = project(pos.root);
      /* the whole name plate picks the root, except right on a node peeking out from under it */
      var onPlate = hideRoot ? false : rootBox ? Math.abs(rp.x - x) <= rootBox.hw + 6 && Math.abs(rp.y - y) <= rootBox.hh + 6 : Math.hypot(rp.x - x, rp.y - y) < 22;
      for (var t = 0; t < testMarks.length; t++) if (Math.hypot(testMarks[t].x - x, testMarks[t].y - y) < 11) return { test: testMarks[t].id };
      var best = null, bd = 20;
      projected.forEach(function (it) {
        var d = Math.hypot(it.p.x - x, it.p.y - y) - (focusSet[it.n.id] ? 3 : 0);
        if (d < bd) { bd = d; best = it.n; }
      });
      if (onPlate && !(best && bd < 9)) return { root: true };
      return best ? { node: best } : null;
    }

    function setZoom(z) { zoom = Math.max(zfloor, Math.min(ZMAX, z)); request(); }
    /* colours only change with the cloud (setCloud): worked out once per node, not three times a frame */
    function colorOf(n) { var c = colors[n.id]; if (!c) c = colors[n.id] = TH ? TH.tone(C.colorOf(cloud, n)) : C.colorOf(cloud, n); return c; }
    if (TH && root.addEventListener) root.addEventListener("ikotheme", function () { colors = {}; request(); });

    function view() { return { zoom: zoom, panX: panX, panY: panY, yaw: yaw, pitch: pitch, pivot: pivot, zmin: zfloor }; }
    function apply(v) { zoom = v.zoom; panX = v.panX; panY = v.panY; yaw = v.yaw; pitch = v.pitch; pivot = v.pivot || CAM.ORIGIN; }
    function pointOf(id) { var p = pos[id]; return { x: p.x, y: p.y, z: p.z }; }
    function animateTo(to, ms) {
      glideV = null;
      if (reduce || !ms) { apply(to); tween = null; request(); changed(); return; }
      tween = { t0: performance.now(), ms: ms, from: view(), to: to };
      request();
    }
    /*
     * Brings a node into focus: it turns to the front (shortest arc) and becomes the pivot, so it is pinned at
     * (cx, cy) and any later turn orbits it. The zoom fits its children around it inside the free area aw x ah, kept
     * where their labels are legible. The tween eases yaw, zoom (log space), pan and the pivot together (cubic in-out).
     */
    function focusNode(id, o) {
      o = o || {};
      if (!cloud || !pos[id]) return;
      setFocus(id);
      var d = depth[id] || 1, saved = view();
      var fy = o.keepYaw ? null : CAM.forwardYaw(pos[id]);
      yaw = fy == null ? yaw : fy; zoom = 1; panX = 0; panY = 0; pivot = pointOf(id);
      /* the root (the learner's name): its subjects are framed around it, never closer than the home view */
      var isRoot = id === "root", pts = (isRoot ? C.subjects(cloud).map(function (x) { return x.id; }) : C.index(cloud)[id] || []).filter(function (k) { return pos[k]; }), box = { x0: 0, x1: 0, y0: 0, y1: 0 };
      pts.forEach(function (k) { var q = project(pos[k]), x = q.x - w / 2, y = q.y - h / 2; box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y); });
      var lo = isRoot ? zfloor : Math.max(1, 0.75 / C.levelScale(d + 1)), hi = isRoot ? Math.max(home.zoom, 1) : Math.max(lo, 1.6 / C.levelScale(d + 1));
      var z = o.zoom || CAM.fitAround(box, o.aw || w, o.ah || h, lo, hi);
      var cx = o.cx == null ? w / 2 : o.cx, cy = o.cy == null ? h / 2 : o.cy;
      var to = { zoom: z, panX: cx - w / 2, panY: cy - h / 2, yaw: yaw, pitch: saved.pitch, pivot: pivot };
      apply(saved);
      animateTo(to, o.instant ? 0 : CAM.CAM.focusMs);
    }
    function stepTween(now) {
      var k = Math.min(1, (now - tween.t0) / tween.ms);
      apply(CAM.lerpView(tween.from, tween.to, CAM.easeInOutCubic(k)));
      if (k >= 1) { tween = null; changed(); }
    }
    /* A released pan glides on, slowing exponentially (camera.js glide), until it is too slow to see. */
    function stepGlide(now) {
      var dt = Math.min(64, now - glideV.t);
      var gx = CAM.glide(glideV.x, dt), gy = CAM.glide(glideV.y, dt);
      panX += gx.d; panY += gy.d; glideV.x = gx.v; glideV.y = gy.v; glideV.t = now;
      if (Math.hypot(glideV.x, glideV.y) < CAM.CAM.glideStop) { glideV = null; changed(); }
    }
    /* Tells the app the view settled (it stores it, so the focus and camera come back next time). */
    var changeTimer = 0;
    function changed() {
      if (!opts.onView || mini) return;
      clearTimeout(changeTimer);
      changeTimer = setTimeout(function () { opts.onView({ yaw: yaw, pitch: pitch, zoom: zoom, panX: panX, panY: panY, pivot: { x: pivot.x, y: pivot.y, z: pivot.z }, focus: focusId }); }, 250);
    }

    /* ---------- input ---------- */
    function local(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function zoomAt(k, at) { var v = CAM.zoomAbout(view(), k, at, w, h); zoom = v.zoom; panX = v.panX; panY = v.panY; request(); }

    if (mini) {
      canvas.addEventListener("click", function () { if (opts.onOpen) opts.onOpen(); });
    } else {
      canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      canvas.addEventListener("pointerdown", function (e) {
        tween = null; glideV = null;
        canvas.setPointerCapture(e.pointerId);
        pointers[e.pointerId] = local(e);
        var ids = Object.keys(pointers);
        if (ids.length === 1) gesture = { type: CAM.gestureFor({ pointers: 1, button: e.button, shift: e.shiftKey, alt: e.altKey }), start: local(e), last: local(e), t: performance.now(), vx: 0, vy: 0, moved: 0 };
        else if (ids.length === 2) {
          var a = pointers[ids[0]], b = pointers[ids[1]];
          gesture = { type: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, zoom: zoom, a: a, b: b, moved: 99 };
        }
        canvas.classList.toggle("turning", gesture && gesture.type === "rotate");
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
          yaw += CAM.twist(gesture.a, gesture.b, a, b); /* a two-finger twist turns the cloud */
          gesture.a = { x: a.x, y: a.y }; gesture.b = { x: b.x, y: b.y };
        } else if (ids.length === 1 && gesture.type !== "pinch") {
          var p = local(e), dx = p.x - gesture.last.x, dy = p.y - gesture.last.y, t = performance.now(), dt = t - gesture.t;
          gesture.moved += Math.abs(dx) + Math.abs(dy);
          gesture.last = p;
          if (gesture.type === "pan") { panX += dx; panY += dy; gesture.vx = CAM.velocity(gesture.vx, dx, dt); gesture.vy = CAM.velocity(gesture.vy, dy, dt); gesture.t = t; }
          else { yaw += dx * 0.008; pitch = Math.max(-1.3, Math.min(1.3, pitch + dy * 0.008)); }
        }
        request();
      });
      var end = function (e) {
        var g = gesture;
        delete pointers[e.pointerId];
        if (!Object.keys(pointers).length) {
          gesture = null;
          canvas.classList.remove("turning");
          if (g && g.type !== "pinch" && g.moved < 6 && opts.onPick) {
            var hit = pick(g.start.x, g.start.y);
            if (hit) { touch(); opts.onPick(hit); } /* a click on a node pauses the spin */
            else if (opts.onEmpty) opts.onEmpty(); /* a tap on empty sky: dismiss the card */
          } else if (g && g.type === "pan" && !reduce && performance.now() - g.t < 90 && Math.hypot(g.vx, g.vy) > CAM.CAM.glideMin) {
            glideV = { x: g.vx, y: g.vy, t: performance.now() };
          } else changed();
        } else if (g && g.type === "pinch") gesture = null;
        request();
      };
      canvas.addEventListener("pointerup", end);
      canvas.addEventListener("pointercancel", end);
      canvas.addEventListener("wheel", function (e) { e.preventDefault(); tween = null; glideV = null; zoomAt(CAM.wheelFactor(e.deltaY, e.ctrlKey), local(e)); changed(); }, { passive: false });
    }

    if (!mini) {
      /* the idle spin goes on through drags, pans, pinches and the wheel; only a click (a node here, a control via pause())
         stops it, and it comes back after a few idle seconds */
      /* battery: nothing turns while the tab is hidden; coming back counts as a fresh start (idle a while first) */
      if (doc) doc.addEventListener("visibilitychange", function () { if (!doc.hidden) { touch(); request(); } });
    }
    root.addEventListener("resize", resize);
    resize();

    return {
      setCloud: setCloud,
      setTests: function (map) { tests = map || {}; request(); },
      /* the idle spin: on while the big cloud is open; hold(true) while something covers most of it (no change: no restart) */
      spin: function (on) { spinOn = Boolean(on) && !mini; touch(); request(); },
      /* a click on a control: pause the spin (it comes back after the idle delay) */
      pause: function () { touch(); request(); },
      hold: function (on) { if (spinHeld === Boolean(on)) return; spinHeld = Boolean(on); touch(); request(); },
      flash: flash,
      resize: resize,
      /* the zoom buttons: a short eased zoom about the centre */
      zoomBy: function (k) { var v = view(), z = CAM.zoomAbout(v, k, null, w, h); animateTo({ zoom: z.zoom, panX: v.panX * (z.zoom / v.zoom), panY: v.panY * (z.zoom / v.zoom), yaw: v.yaw, pitch: v.pitch }, CAM.CAM.zoomMs); },
      reset: function () { apply(Object.assign({ pivot: CAM.ORIGIN }, home)); tween = null; glideV = null; setFocus(null); request(); changed(); },
      /* Recentre: ease back to the whole cloud, the pivot back to the origin, and let go of the focus */
      recentre: function () { setFocus(null); animateTo(Object.assign({ pivot: CAM.ORIGIN }, home), CAM.CAM.focusMs); },
      state: function () { return { yaw: yaw, pitch: pitch, zoom: zoom, panX: panX, panY: panY, pivot: { x: pivot.x, y: pivot.y, z: pivot.z }, focus: focusId, drawn: projected.length, drawMs: drawMs, moving: Boolean(tween || glideV), spinning: spinning, held: spinHeld, vivid: vivid, fill: Object.assign({}, fill), fade: Object.assign({}, fadeK) }; },
      setView: function (v) { if (v.zoom) setZoom(v.zoom); if (v.yaw != null) yaw = v.yaw; if (v.pitch != null) pitch = v.pitch; if (v.panX != null) panX = v.panX; if (v.panY != null) panY = v.panY; if (v.pivot && isFinite(v.pivot.x) && isFinite(v.pivot.y) && isFinite(v.pivot.z)) pivot = { x: v.pivot.x, y: v.pivot.y, z: v.pivot.z }; if (v.focus !== undefined) setFocus(v.focus); request(); },
      project: function (id) { return pos[id] ? project(pos[id]) : null; },
      focusNode: focusNode,
      clearFocus: function () { setFocus(null); request(); },
      /* the name plate off the canvas (the opening question shows the name in the page, above the question) */
      rootHidden: function (on) { if (hideRoot === Boolean(on)) return; hideRoot = Boolean(on); request(); }
    };
  }

  root.IkoCloudView = { create: createView, DRAW_CAP: DRAW_CAP };
})(window);
