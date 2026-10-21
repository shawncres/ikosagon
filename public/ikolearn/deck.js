/*
 * IkoLearn deck: procedural card art and the session draw. Pure functions over the cloud (cloud-model.js) plus a small
 * DOM renderer (SVG built with createElementNS, text via textContent). Runs in the browser (window.IkoDeck) and in Node.
 *
 * Card art is seeded by the topic id, so a card always looks the same. Colour comes from IkoCloud.cardColor
 * (sepia at first, moving toward the subject's hue as the card grows); ink density follows the same stage.
 *
 * The draw: no network, deterministic for a given day, session count and name. See weigh() for the balance rules.
 */
(function (root) {
  "use strict";
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- UMD: Node tests load the model, the browser has window.IkoCloud
  var C = typeof module !== "undefined" && module.exports ? require("./cloud-model.js") : root.IkoCloud;

  /* ---------- seeded random ---------- */
  function seedOf(str) {
    var h = 2166136261;
    str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function r1(x) { return Math.round(x * 10) / 10; }

  /* ---------- card art ---------- */
  var W = 100, H = 140;
  var PATTERNS = ["dots", "hatch", "rings", "waves", "grid", "rays"];
  /* How much of the pattern is inked at each stage, and how strong the ink is. */
  var INK = { share: [0.3, 0.46, 0.62, 0.8, 1], weight: [0.6, 0.75, 0.9, 1.05, 1.2], opacity: [0.42, 0.55, 0.68, 0.8, 0.92] };

  /*
   * The marks for one card. The full pattern is laid out once from the topic id, in a seeded order; a card at stage s
   * shows the first INK.share[s] of it. Growing adds ink to the same card rather than changing it.
   */
  function design(id, stage) {
    var st = Math.max(0, Math.min(4, Math.round(Number(stage) || 0)));
    var R = rng(seedOf("card:" + id));
    var pattern = PATTERNS[Math.floor(R() * PATTERNS.length)];
    var marks = [], x, y, i;
    var cx = r1(18 + R() * 64), cy = r1(26 + R() * 88), ang = R() * Math.PI;
    if (pattern === "dots") {
      var step = 8 + Math.floor(R() * 5);
      for (y = step / 2; y < H; y += step) for (x = step / 2; x < W; x += step) marks.push({ k: "dot", x: r1(x + (R() - 0.5) * 3), y: r1(y + (R() - 0.5) * 3), r: r1(0.7 + R() * 1.6) });
    } else if (pattern === "hatch") {
      var gap = 5 + R() * 4, ca = Math.cos(ang), sa = Math.sin(ang);
      for (var d = -90; d <= 90; d += gap) {
        var mx = cx - sa * d, my = cy + ca * d, len = 40 + R() * 60;
        marks.push({ k: "line", x1: r1(mx - ca * len), y1: r1(my - sa * len), x2: r1(mx + ca * len), y2: r1(my + sa * len) });
      }
    } else if (pattern === "rings") {
      for (var rr = 3 + R() * 3; rr < 150; rr += 4 + R() * 4) marks.push({ k: "ring", x: cx, y: cy, r: r1(rr) });
    } else if (pattern === "waves") {
      var amp = 1.5 + R() * 4, per = 14 + R() * 18, wgap = 7 + R() * 5, phase = R() * 40;
      for (y = wgap / 2; y < H + amp; y += wgap) {
        var dd = "M0 " + r1(y);
        for (x = 5; x <= W; x += 5) dd += " L" + x + " " + r1(y + amp * Math.sin(((x + phase) / per) * 2 * Math.PI));
        marks.push({ k: "path", d: dd });
      }
    } else if (pattern === "grid") {
      var size = 7 + Math.floor(R() * 5);
      for (y = 2; y < H - 2; y += size) for (x = 2; x < W - 2; x += size) if (R() < 0.6) marks.push({ k: "box", x: x + 1, y: y + 1, s: r1(size * (0.3 + R() * 0.4)) });
    } else {
      var n = 18 + Math.floor(R() * 14), ox = R() < 0.5 ? -4 : W + 4, oy = r1(R() * H), spread = 1.2 + R() * 1.4, a0 = ox < 0 ? -spread / 2 : Math.PI - spread / 2;
      for (i = 0; i < n; i++) {
        var a = a0 + (spread * i) / (n - 1), l = 60 + R() * 110;
        marks.push({ k: "line", x1: ox, y1: oy, x2: r1(ox + Math.cos(a) * l), y2: r1(oy + Math.sin(a) * l) });
      }
    }
    for (i = marks.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)), tmp = marks[i]; marks[i] = marks[j]; marks[j] = tmp; }
    var count = Math.max(3, Math.round(marks.length * INK.share[st]));
    return { id: String(id), pattern: pattern, stage: st, total: marks.length, marks: marks.slice(0, count), weight: INK.weight[st], opacity: INK.opacity[st] };
  }

  /* Everything a card shows, from the cloud. Works for deck cards whose topic is gone too (from the stored entry). */
  function cardSpec(cloud, id) {
    var g = C.growthOf(cloud, id);
    if (!g) return null;
    var n = cloud.nodes[id], e = C.deckEntry(cloud, id), s = n ? C.subjectOf(cloud, id) : null;
    return {
      id: id, label: n ? n.label : e.label, subject: s && s.id !== id ? s.label : e ? e.subject : "",
      stage: g.stage, stageName: g.name, progress: g.progress, inDeck: g.inDeck, live: Boolean(n),
      color: C.cardColor(cloud, id), art: design(id, g.stage)
    };
  }

  /* ---------- DOM ---------- */
  var NS = "http://www.w3.org/2000/svg";
  function svgEl(doc, tag, attrs) {
    var e = doc.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, String(attrs[k])); });
    return e;
  }
  function artSvg(doc, spec) {
    var svg = svgEl(doc, "svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid slice", "aria-hidden": "true", focusable: "false", class: "art" });
    if (spec.stage > 0) svg.appendChild(svgEl(doc, "rect", { x: 0, y: 0, width: W, height: H, fill: spec.color.wash }));
    var g = svgEl(doc, "g", { stroke: spec.color.ink, fill: "none", "stroke-width": spec.art.weight, "stroke-linecap": "round", opacity: spec.art.opacity });
    spec.art.marks.forEach(function (m) {
      if (m.k === "dot") g.appendChild(svgEl(doc, "circle", { cx: m.x, cy: m.y, r: m.r, fill: spec.color.ink, stroke: "none" }));
      else if (m.k === "ring") g.appendChild(svgEl(doc, "circle", { cx: m.x, cy: m.y, r: m.r }));
      else if (m.k === "line") g.appendChild(svgEl(doc, "line", { x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2 }));
      else if (m.k === "path") g.appendChild(svgEl(doc, "path", { d: m.d }));
      else if (m.k === "box") g.appendChild(svgEl(doc, "rect", { x: m.x, y: m.y, width: m.s, height: m.s, fill: spec.color.soft }));
    });
    svg.appendChild(g);
    if (spec.stage >= 4) svg.appendChild(svgEl(doc, "rect", { x: 5, y: 5, width: W - 10, height: H - 10, fill: "none", stroke: spec.color.ink, "stroke-width": 0.6, opacity: 0.7 }));
    return svg;
  }
  /* A card: paper outline with the corner fold, the art, the topic and a quiet line (subject · stage). opts: { onOpen, small, bare } */
  function render(doc, spec, opts) {
    opts = opts || {};
    var d = doc.createElement(opts.onOpen ? "button" : "div");
    d.className = "dcard stage-" + spec.stage + (opts.small ? " small" : "") + (opts.bare ? " bare" : "");
    if (opts.onOpen) {
      d.type = "button";
      d.setAttribute("aria-label", spec.label + ", " + spec.stageName + (spec.subject ? ", " + spec.subject : ""));
      d.addEventListener("click", function (e) { e.stopPropagation(); opts.onOpen(spec.id); });
    }
    d.style.setProperty("--card-ink", spec.color.ink);
    var face = doc.createElement("span"); face.className = "dc-face";
    face.appendChild(artSvg(doc, spec));
    d.appendChild(face);
    if (!opts.bare) {
      var t = doc.createElement("span"); t.className = "dc-label"; t.textContent = spec.label; d.appendChild(t);
      var m = doc.createElement("span"); m.className = "dc-meta"; m.textContent = (spec.subject ? spec.subject + " · " : "") + spec.stageName; d.appendChild(m);
    }
    return d;
  }

  /* ---------- the session draw ---------- */
  var DAY = 86400000;
  /* Local calendar day number (days since 1970 in this browser's time zone). */
  function dayOf(t) { var d = new Date(t); return Math.floor((t - d.getTimezoneOffset() * 60000) / DAY); }
  /* Spaced review: a card is due again after this many days, longer for brighter (better known) cards. */
  var REVIEW_DAYS = [1, 2, 4, 7, 14];
  var DRAW = { size: 3, sameSubject: 0.3, drawnToday: 0.05, struggle: 1.5, struggleDays: 14, yearDays: 365, ease: 0.05 };

  function subjectKey(cloud, e) {
    var s = cloud.nodes[e.id] ? C.subjectOf(cloud, e.id) : null;
    return s ? s.label : e.subject || "Other";
  }

  /*
   * The weight of every deck card for a draw on `day`:
   *   subject balance  (target + 0.05) / (share + 0.05): each subject in the deck should get an equal share of the
   *                    year's draws; a subject drawn less than that is boosted, one drawn more is held back
   *   per subject      1 / cards in that subject, so a subject with many cards does not crowd out the others
   *   review           0.35 + days since last drawn / review interval (capped at 3): overdue cards come back
   *   struggle         x1.5 when the learner found it tricky in the last 14 days
   *   today            x0.05 when it was already drawn today (a second session the same day gets new cards)
   */
  function weigh(cloud, day) {
    var deck = cloud.deck || [];
    var year = (cloud.draws || []).filter(function (d) { return d[0] > day - DRAW.yearDays && d[0] <= day; });
    var drawn = {}, cardsIn = {}, last = {}, today = {};
    deck.forEach(function (e) { var k = subjectKey(cloud, e); cardsIn[k] = (cardsIn[k] || 0) + 1; });
    var counted = 0;
    year.forEach(function (d) {
      var e = C.deckEntry(cloud, d[1]);
      if (!e) return;
      var k = subjectKey(cloud, e);
      drawn[k] = (drawn[k] || 0) + 1; counted += 1;
      last[d[1]] = last[d[1]] == null ? d[0] : Math.max(last[d[1]], d[0]);
      if (d[0] === day) today[d[1]] = 1;
    });
    var subjects = Object.keys(cardsIn), target = subjects.length ? 1 / subjects.length : 1;
    return deck.map(function (e) {
      var k = subjectKey(cloud, e);
      var share = counted ? (drawn[k] || 0) / counted : target;
      var bal = (target + DRAW.ease) / (share + DRAW.ease);
      var g = C.growthOf(cloud, e.id), stage = g ? g.stage : e.best || 0;
      var since = Math.max(0, day - (last[e.id] != null ? last[e.id] : dayOf(e.at || 0)));
      var review = 0.35 + Math.min(3, since / REVIEW_DAYS[stage]);
      var n = cloud.nodes[e.id];
      var struggle = n && n.lastStruggle && dayOf(n.lastStruggle) > day - DRAW.struggleDays ? DRAW.struggle : 1;
      var w = (1 / cardsIn[k]) * bal * review * struggle * (today[e.id] ? DRAW.drawnToday : 1);
      return { id: e.id, subject: k, w: w, balance: bal, review: review, struggle: struggle };
    });
  }

  /* A shuffled, weighted draw without repeats. After a pick, the rest of that subject is down-weighted so one draw mixes subjects. */
  function drawSession(cloud, opts) {
    opts = opts || {};
    var day = opts.day != null ? opts.day : dayOf(Date.now()), size = opts.size || DRAW.size;
    var R = rng(seedOf((opts.seed != null ? String(opts.seed) : day + ":" + (cloud.sessions || 0)) + ":" + cloud.name));
    var pool = weigh(cloud, day).filter(function (x) { return x.w > 0; }), out = [];
    while (out.length < size && pool.length) {
      var sum = pool.reduce(function (a, x) { return a + x.w; }, 0), r = R() * sum, i = 0;
      for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
      var pick = pool.splice(i, 1)[0];
      out.push(pick.id);
      pool.forEach(function (x) { if (x.subject === pick.subject) x.w *= DRAW.sameSubject; });
    }
    return out;
  }

  /* How the last year of draws is spread over the deck's subjects: [{ subject, cards, draws, share }]. */
  function balance(cloud, day) {
    var rows = {}, total = 0;
    (cloud.deck || []).forEach(function (e) { var k = subjectKey(cloud, e); (rows[k] = rows[k] || { subject: k, cards: 0, draws: 0, share: 0 }).cards += 1; });
    (cloud.draws || []).forEach(function (d) {
      if (d[0] <= day - DRAW.yearDays || d[0] > day) return;
      var e = C.deckEntry(cloud, d[1]);
      if (!e) return;
      rows[subjectKey(cloud, e)].draws += 1; total += 1;
    });
    return Object.keys(rows).map(function (k) { rows[k].share = total ? rows[k].draws / total : 0; return rows[k]; })
      .sort(function (a, b) { return b.cards - a.cards || (a.subject < b.subject ? -1 : 1); });
  }

  var api = {
    PATTERNS: PATTERNS, INK: INK, REVIEW_DAYS: REVIEW_DAYS, DRAW: DRAW,
    seedOf: seedOf, rng: rng, design: design, cardSpec: cardSpec, render: render, artSvg: artSvg,
    dayOf: dayOf, weigh: weigh, drawSession: drawSession, balance: balance
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IkoDeck = api;
})(typeof window !== "undefined" ? window : this);
