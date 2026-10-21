/*
 * IkoLearn deck: the cards (procedural landscapes, the card face) and the session draw. Pure functions over the cloud
 * (cloud-model.js) plus a small DOM renderer (SVG built with createElementNS, text via textContent). Runs in the browser
 * (window.IkoDeck) and in Node.
 *
 * Every card has a landscape drawn on the device, seeded by the topic id so a card always looks the same: layered ridges,
 * sometimes water, a few trees or birds, in an ink-sketch style. The detail level (from the growth score) adds hatching,
 * trees and birds to the same scene; the colour (from IkoCloud.cardColor) moves from sepia toward the chain's hue as
 * learning is confirmed, and is full when the branch is achieved. No images, no network.
 *
 * The draw: no network, deterministic for a given day, session count and name. See weigh() for the balance rules.
 */
(function (root) {
  "use strict";
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- UMD: Node tests load the model, the browser has window.IkoCloud
  var C = typeof module !== "undefined" && module.exports ? require("./cloud-model.js") : root.IkoCloud;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- UMD, as above
  var RK = typeof module !== "undefined" && module.exports ? require("./rank.js") : root.IkoRank;

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

  /* ---------- the landscape ---------- */
  var LW = 120, LH = 90;
  /* How much of the scene's detail shows at each detail level (0-4): hatching, trees, birds, ripples. */
  var DETAIL = { hatch: [0.15, 0.35, 0.55, 0.8, 1], trees: [0.3, 0.5, 0.7, 0.85, 1], birds: [0, 0.34, 0.67, 1, 1], ripples: [0.3, 0.5, 0.7, 0.85, 1] };

  /* A ridge line across the frame: a few soft waves plus a little jitter, peaks somewhere in the middle. */
  function ridge(R, base, amp) {
    var f1 = 1 + R() * 1.6, f2 = 2.5 + R() * 3, p1 = R() * 6.28, p2 = R() * 6.28, peak = 0.2 + R() * 0.6, pts = [];
    for (var x = 0; x <= LW; x += 4) {
      var u = x / LW, hump = Math.exp(-Math.pow((u - peak) / 0.32, 2));
      var y = base - amp * (0.55 * hump + 0.25 * (0.5 + 0.5 * Math.sin(u * 6.28 * f1 + p1)) + 0.12 * (0.5 + 0.5 * Math.sin(u * 6.28 * f2 + p2))) + (R() - 0.5) * 1.2;
      pts.push([x, r1(y)]);
    }
    return pts;
  }
  function yAt(pts, x) {
    for (var i = 1; i < pts.length; i++) if (pts[i][0] >= x) { var a = pts[i - 1], b = pts[i], t = (x - a[0]) / (b[0] - a[0] || 1); return a[1] + (b[1] - a[1]) * t; }
    return pts[pts.length - 1][1];
  }
  function line(pts) { return "M" + pts.map(function (p) { return p[0] + " " + p[1]; }).join(" L"); }
  function take(list, share) { return list.slice(0, Math.round(list.length * share)); }

  /*
   * The scene for one topic. The whole scene is laid out once from the topic id (same random numbers whatever the
   * detail), then each kind of mark shows the first DETAIL[kind][detail] of its list, so a growing card adds to the
   * same drawing instead of changing it.
   */
  function landscape(id, detail) {
    var d = Math.max(0, Math.min(4, Math.round(Number(detail) || 0)));
    var R = rng(seedOf("land:" + id));
    var horizon = 34 + R() * 14, hasWater = R() < 0.55, hasTrees = R() < 0.8, hasBirds = R() < 0.65, hasSun = R() < 0.4;
    var waterY = hasWater ? r1(Math.min(LH - 12, horizon + 24 + R() * 10)) : LH;
    var n = 3 + (R() < 0.5 ? 1 : 0), layers = [], hatch = [], trees = [], birds = [], ripples = [], i, j;
    for (i = 0; i < n; i++) {
      var depth = i / (n - 1); /* 0 far .. 1 near */
      var base = horizon + i * (hasWater ? 7 : 11) + 6, amp = (1 - depth * 0.6) * (14 + R() * 18);
      var pts = ridge(R, base, amp);
      layers.push({ depth: r1(depth), line: line(pts), fill: line(pts) + " L" + LW + " " + LH + " L0 " + LH + " Z" });
      /* short slanted strokes just under the ridge: the sketch shading */
      for (j = 0; j < 10 + i * 4; j++) {
        var hx = r1(R() * LW), hy = yAt(pts, hx) + 1.5 + R() * 7, len = 2 + R() * 3;
        if (hy < waterY - 1) hatch.push({ depth: r1(depth), x1: hx, y1: r1(hy), x2: r1(hx - len * 0.6), y2: r1(hy + len) });
      }
      if (i === n - 1) {
        for (j = 0; j < 9; j++) {
          var tx = r1(6 + R() * (LW - 12)), ty = yAt(pts, tx), th = 4 + R() * 5;
          if (ty + 1 < waterY) trees.push({ d: "M" + tx + " " + r1(ty - th) + " L" + r1(tx - th * 0.32) + " " + r1(ty + 0.5) + " M" + tx + " " + r1(ty - th) + " L" + r1(tx + th * 0.32) + " " + r1(ty + 0.5) + " M" + tx + " " + r1(ty - th * 0.6) + " L" + tx + " " + r1(ty + 1.5) });
        }
      }
    }
    for (j = 0; j < 3; j++) {
      var bx = r1(20 + R() * 80), by = r1(8 + R() * Math.max(6, horizon - 22)), bw = 1.6 + R() * 1.4;
      birds.push({ d: "M" + r1(bx - bw) + " " + r1(by - bw * 0.5) + " Q" + r1(bx - bw * 0.4) + " " + r1(by - bw * 0.7) + " " + bx + " " + by + " Q" + r1(bx + bw * 0.4) + " " + r1(by - bw * 0.7) + " " + r1(bx + bw) + " " + r1(by - bw * 0.5) });
    }
    if (hasWater) for (j = 0; j < 12; j++) { var ry = r1(waterY + 2 + R() * (LH - waterY - 3)), rx = r1(R() * (LW - 14)); ripples.push({ x1: rx, x2: r1(rx + 4 + R() * 10), y: ry }); }
    var sun = hasSun ? { x: r1(18 + R() * 84), y: r1(10 + R() * 12), r: r1(4 + R() * 3) } : null;
    return {
      id: String(id), detail: d, w: LW, h: LH, layers: layers, water: hasWater ? { y: waterY } : null, sun: sun,
      hatch: take(hatch, DETAIL.hatch[d]), trees: hasTrees ? take(trees, DETAIL.trees[d]) : [], birds: hasBirds ? take(birds, DETAIL.birds[d]) : [], ripples: take(ripples, DETAIL.ripples[d]),
      totals: { hatch: hatch.length, trees: hasTrees ? trees.length : 0, birds: hasBirds ? birds.length : 0, ripples: ripples.length }
    };
  }

  /* Everything a card shows, from the cloud. Works for deck cards whose topic is gone too (from the stored entry). */
  function cardSpec(cloud, id) {
    var g = C.growthOf(cloud, id);
    if (!g) return null;
    var n = cloud.nodes[id], e = C.deckEntry(cloud, id), s = n ? C.subjectOf(cloud, id) : null;
    return {
      id: id, label: n ? n.label : e.label, subject: s && s.id !== id ? s.label : e ? e.subject : "",
      chain: C.chainOf(cloud, id), blurb: (n && n.blurb) || (e && e.blurb) || "", goal: (n && n.goal) || "",
      stage: g.stage, detail: g.detail, stageName: g.name, achieved: g.achieved, toNext: g.toNext, inDeck: g.inDeck, live: Boolean(n),
      color: C.cardColor(cloud, id), art: landscape(id, g.detail)
    };
  }
  /* "Math → Counting → Counting to 20". withTopic: the full chain (the holder); else the links above the topic, kept to subject → … → parent. */
  function chainText(chain, withTopic) {
    var c = (chain || []).slice(0, withTopic ? undefined : -1);
    if (withTopic ? c.length > 4 : c.length > 2) c = [c[0], "…"].concat(c.slice(withTopic ? -2 : -1));
    return c.join(" → ");
  }

  /* ---------- DOM ---------- */
  var NS = "http://www.w3.org/2000/svg";
  function svgEl(doc, tag, attrs) {
    var e = doc.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, String(attrs[k])); });
    return e;
  }
  function hsla(c, a, dl) { return "hsla(" + c.hue + ", " + c.sat + "%, " + Math.max(10, Math.min(92, c.light + (dl || 0))) + "%, " + a.toFixed(2) + ")"; }
  function tint(c, a, l) { return "hsla(" + c.base + ", 50%, " + l + "%, " + a.toFixed(2) + ")"; }
  /* The landscape as SVG: pale far ridges, darker near ones, pen lines over light fills; the chain's hue arrives as a wash. */
  function artSvg(doc, spec) {
    var a = spec.art, c = spec.color, t = c.mix || 0;
    var svg = svgEl(doc, "svg", { viewBox: "0 0 " + a.w + " " + a.h, preserveAspectRatio: "xMidYMid slice", "aria-hidden": "true", focusable: "false", class: "art" });
    svg.appendChild(svgEl(doc, "rect", { x: 0, y: 0, width: a.w, height: a.h, fill: hsla(c, 0.06, 40) }));
    if (t) svg.appendChild(svgEl(doc, "rect", { x: 0, y: 0, width: a.w, height: a.h, fill: tint(c, 0.04 + 0.1 * t, 74) }));
    if (a.sun) svg.appendChild(svgEl(doc, "circle", { cx: a.sun.x, cy: a.sun.y, r: a.sun.r, fill: hsla(c, 0.1 + 0.1 * t, 30), stroke: "none" }));
    a.layers.forEach(function (l) {
      svg.appendChild(svgEl(doc, "path", { d: l.fill, fill: hsla(c, 0.07 + 0.2 * l.depth + 0.06 * t, 26 - 16 * l.depth), stroke: "none" }));
      svg.appendChild(svgEl(doc, "path", { d: l.line, fill: "none", stroke: hsla(c, 0.3 + 0.55 * l.depth, 12 - 14 * l.depth), "stroke-width": 0.45 + 0.4 * l.depth, "stroke-linejoin": "round" }));
    });
    var g = svgEl(doc, "g", { stroke: c.ink, fill: "none", "stroke-width": 0.45, "stroke-linecap": "round" });
    a.hatch.forEach(function (h) { g.appendChild(svgEl(doc, "line", { x1: h.x1, y1: h.y1, x2: h.x2, y2: h.y2, opacity: (0.3 + 0.5 * h.depth).toFixed(2) })); });
    svg.appendChild(g);
    if (a.water) {
      svg.appendChild(svgEl(doc, "rect", { x: 0, y: a.water.y, width: a.w, height: a.h - a.water.y, fill: t ? tint(c, 0.12 + 0.26 * t, 62) : hsla(c, 0.1, 34), stroke: "none" }));
      svg.appendChild(svgEl(doc, "line", { x1: 0, y1: a.water.y, x2: a.w, y2: a.water.y, stroke: hsla(c, 0.55, 0), "stroke-width": 0.5 }));
      var w = svgEl(doc, "g", { stroke: c.ink, "stroke-width": 0.4, "stroke-linecap": "round", opacity: 0.55 });
      a.ripples.forEach(function (r) { w.appendChild(svgEl(doc, "line", { x1: r.x1, y1: r.y, x2: r.x2, y2: r.y })); });
      svg.appendChild(w);
    }
    var tr = svgEl(doc, "g", { stroke: hsla(c, 0.9, -8), fill: "none", "stroke-width": 0.7, "stroke-linecap": "round" });
    a.trees.forEach(function (x) { tr.appendChild(svgEl(doc, "path", { d: x.d })); });
    a.birds.forEach(function (b) { tr.appendChild(svgEl(doc, "path", { d: b.d, "stroke-width": 0.45 })); });
    svg.appendChild(tr);
    return svg;
  }
  /*
   * A card. opts: { onOpen, size: "full" (the holder) | "tile" (deck, draw) | "mini" (art only, in chat) }.
   * Paper with a thin double border and a folded corner, the landscape top-left, the chain, the title, the line under it,
   * and a quiet text mark: the colour stage, or "Achieved". No icons.
   */
  function render(doc, spec, opts) {
    opts = opts || {};
    var size = opts.size || "tile";
    var d = doc.createElement(opts.onOpen ? "button" : "div");
    d.className = "gcard size-" + size + " stage-" + spec.stage + (spec.achieved ? " achieved" : "");
    if (opts.onOpen) {
      d.type = "button";
      d.setAttribute("aria-label", spec.label + ", " + spec.stageName + (spec.subject ? ", " + spec.subject : ""));
      d.addEventListener("click", function (e) { e.stopPropagation(); opts.onOpen(spec.id, d); });
    }
    d.dataset.card = spec.id;
    d.style.setProperty("--card-ink", spec.color.ink);
    d.style.setProperty("--card-wash", spec.color.wash);
    d.style.setProperty("--card-soft", spec.color.soft);
    var art = doc.createElement("span"); art.className = "gc-art";
    art.appendChild(artSvg(doc, spec));
    d.appendChild(art);
    if (size === "mini") return d;
    var ch = chainText(spec.chain, size === "full");
    if (ch) { var c = doc.createElement("span"); c.className = "gc-chain"; c.textContent = ch; d.appendChild(c); }
    var t = doc.createElement("span"); t.className = "gc-title"; t.textContent = spec.label; d.appendChild(t);
    if (size === "full") {
      d.appendChild(Object.assign(doc.createElement("span"), { className: "gc-rule" }));
      if (spec.blurb) { var b = doc.createElement("span"); b.className = "gc-desc"; b.textContent = spec.blurb; d.appendChild(b); }
      if (spec.goal) { var g = doc.createElement("span"); g.className = "gc-goal"; g.textContent = "Goal: " + spec.goal; d.appendChild(g); }
    }
    var f = doc.createElement("span"); f.className = "gc-mark"; f.textContent = spec.achieved ? "Achieved" : spec.stageName; d.appendChild(f);
    return d;
  }

  /* ---------- the session draw ---------- */
  var DAY = 86400000;
  /* Local calendar day number (days since 1970 in this browser's time zone). */
  function dayOf(t) { var d = new Date(t); return Math.floor((t - d.getTimezoneOffset() * 60000) / DAY); }
  /* Spaced review: a card is due again after this many days, longer for brighter (better known) cards. */
  var REVIEW_DAYS = [1, 2, 4, 7, 14];
  var DRAW = { size: 3, sameSubject: 0.3, drawnToday: 0.05, struggle: 1.5, struggleDays: 14, yearDays: 365, ease: 0.05, rank: 0.3 };

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
   *   ranking          x(1 + 0.3 x rank boost): the learner's top 10 (rank.js) comes up a little more often; the balance
   *                    term above still evens subjects out over the year
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
    var boost = RK ? RK.boost(cloud, (day + 0.5) * DAY) : {};
    return deck.map(function (e) {
      var k = subjectKey(cloud, e);
      var share = counted ? (drawn[k] || 0) / counted : target;
      var bal = (target + DRAW.ease) / (share + DRAW.ease);
      var g = C.growthOf(cloud, e.id), stage = g ? g.stage : e.best || 0;
      var since = Math.max(0, day - (last[e.id] != null ? last[e.id] : dayOf(e.at || 0)));
      /* a top-10 card is also due back a little sooner (same factor), so the nudge survives spaced review */
      var rank = 1 + DRAW.rank * (boost[e.id] || 0);
      var review = 0.35 + Math.min(3, (since * rank) / REVIEW_DAYS[stage]);
      var n = cloud.nodes[e.id];
      var struggle = n && n.lastStruggle && dayOf(n.lastStruggle) > day - DRAW.struggleDays ? DRAW.struggle : 1;
      var w = (1 / cardsIn[k]) * bal * review * struggle * rank * (today[e.id] ? DRAW.drawnToday : 1);
      return { id: e.id, subject: k, w: w, balance: bal, review: review, struggle: struggle, rank: rank };
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
    DETAIL: DETAIL, REVIEW_DAYS: REVIEW_DAYS, DRAW: DRAW,
    seedOf: seedOf, rng: rng, landscape: landscape, cardSpec: cardSpec, chainText: chainText, render: render, artSvg: artSvg,
    dayOf: dayOf, weigh: weigh, drawSession: drawSession, balance: balance
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IkoDeck = api;
})(typeof window !== "undefined" ? window : this);
