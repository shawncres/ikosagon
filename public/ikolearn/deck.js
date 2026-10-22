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
      tier: g.tier, tierKey: g.tierKey, tierName: g.tierName, level: g.level, progress: g.progress, pips: pipsFor(g.tier, g.level),
      corpus: C.corpusOf(cloud, id), absorbedInto: C.absorbedInto(cloud, id),
      /* v9: prerequisites still to finish (quiet "After X"; the card stays open and learnable) */
      after: n ? C.lockedBy(cloud, id).map(function (x) { return cloud.nodes[x].label; }) : [],
      color: C.cardColor(cloud, id), art: landscape(id, g.detail)
    };
  }
  /* "A", "A and B", "A, B and C" */
  function listOf(xs) { return xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]; }
  /* Rarity, quietly: one corner pip per tier above Sketch, one more per merge level past I (at most 6). */
  function pipsFor(tier, level) { return Math.min(6, tier + Math.max(0, (level || 0) - 1)); }
  /* A number that only goes up as a card evolves (tier, then colour stage, then merge level): the app animates a rise. */
  function evolveKey(spec) { return spec ? spec.tier * 1000 + spec.stage * 100 + Math.min(99, spec.level || 0) : 0; }
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
   * Paper with a folded corner, the landscape set in top-left like a plate, the chain as links, the title, the line
   * under it, and the foot: the tier ("Sketch" .. "Merged II") with its corner pips. The tier sets the frame weight,
   * paper texture and (achieved, merged) a faint sheen in CSS (tier-* classes); colour comes from the stage. No icons.
   */
  function render(doc, spec, opts) {
    opts = opts || {};
    var size = opts.size || "tile";
    var d = doc.createElement(opts.onOpen ? "button" : "div");
    d.className = "gcard size-" + size + " stage-" + spec.stage + " tier-" + spec.tierKey + (spec.achieved ? " achieved" : "") + (spec.level ? " lv-" + Math.min(4, spec.level) : "");
    d.dataset.tier = spec.tierKey;
    if (opts.onOpen) {
      d.type = "button";
      d.setAttribute("aria-label", spec.label + ", " + spec.tierName + (spec.corpus.length ? ", " + spec.corpus.length + " cards inside" : "") + (spec.subject ? ", " + spec.subject : ""));
      d.addEventListener("click", function (e) { e.stopPropagation(); opts.onOpen(spec.id, d); });
    }
    d.dataset.card = spec.id;
    d.style.setProperty("--card-ink", spec.color.ink);
    d.style.setProperty("--card-wash", spec.color.wash);
    d.style.setProperty("--card-soft", spec.color.soft);
    var art = doc.createElement("span"); art.className = "gc-art";
    art.appendChild(artSvg(doc, spec));
    /* the plate: the landscape is set into the card's corner like a printed plate, framed by tier */
    d.appendChild(art);
    /* the colour-evolution layer (an ink wash that bleeds out from the plate) and the sheen (achieved and merged only) */
    d.appendChild(Object.assign(doc.createElement("span"), { className: "gc-bleed" }));
    if (spec.tier >= 3) d.appendChild(Object.assign(doc.createElement("span"), { className: "gc-sheen" }));
    if (size === "mini") return d;
    /* one layout for every size (a 5:7 trading card): plate on top, title, chain, then the tier and pips at the foot */
    var t = doc.createElement("span"); t.className = "gc-title"; t.textContent = spec.label; t.title = spec.label; d.appendChild(t);
    var links = chainLinks(spec.chain, false);
    if (links.length) {
      var c = doc.createElement("span"); c.className = "gc-chain";
      links.forEach(function (l, i) {
        if (i) c.appendChild(Object.assign(doc.createElement("span"), { className: "gc-sep", textContent: " › " }));
        c.appendChild(Object.assign(doc.createElement("span"), { className: "gc-link" + (i === links.length - 1 ? " last" : ""), textContent: l }));
      });
      d.appendChild(c);
    }
    if (size === "full") {
      d.appendChild(Object.assign(doc.createElement("span"), { className: "gc-rule" }));
      if (spec.blurb) { var b = doc.createElement("span"); b.className = "gc-desc"; b.textContent = spec.blurb; d.appendChild(b); }
      if (spec.goal) { var g = doc.createElement("span"); g.className = "gc-goal"; g.textContent = "Goal: " + spec.goal; d.appendChild(g); }
    }
    if (spec.after && spec.after.length) d.appendChild(Object.assign(doc.createElement("span"), { className: "gc-after", textContent: "After " + listOf(spec.after) }));
    if (spec.corpus.length) d.appendChild(Object.assign(doc.createElement("span"), { className: "gc-corpus", textContent: "Holds " + spec.corpus.length + (spec.corpus.length === 1 ? " card" : " cards") }));
    var foot = doc.createElement("span"); foot.className = "gc-foot";
    var f = doc.createElement("span"); f.className = "gc-mark"; f.textContent = spec.tierName; foot.appendChild(f);
    var pips = doc.createElement("span"); pips.className = "gc-pips"; pips.setAttribute("aria-hidden", "true");
    for (var i = 0; i < spec.pips; i++) pips.appendChild(Object.assign(doc.createElement("span"), { className: "pip" }));
    foot.appendChild(pips);
    d.appendChild(foot);
    /* progress toward the next tier: a hairline along the bottom edge (not on achieved or merged cards) */
    if (spec.tier < 3) { var pr = doc.createElement("span"); pr.className = "gc-prog"; pr.style.setProperty("--p", String(Math.round(spec.progress * 100) / 100)); d.appendChild(pr); }
    return d;
  }
  /* The chain as separate links for the card: subject › … › parent (or the full chain with the topic, in the holder). */
  function chainLinks(chain, withTopic) {
    var t = chainText(chain, withTopic);
    return t ? t.split(" → ") : [];
  }
  /*
   * The corpus view: the cards a merged parent holds, as small tiles (each opens its own lesson). Never lost: labels
   * come from the deck entry when a topic is gone (those show as plain, not openable).
   */
  function renderCorpus(doc, cloud, id, opts) {
    opts = opts || {};
    var list = C.corpusOf(cloud, id);
    var w = doc.createElement("div"); w.className = "corpus";
    if (!list.length) return w;
    var lvl = C.mergeLevel(cloud, id);
    w.appendChild(Object.assign(doc.createElement("p"), { className: "l-head corpus-head", textContent: "Corpus · " + list.length + (list.length === 1 ? " card" : " cards") + (lvl ? " · level " + C.roman(lvl) : "") }));
    var row = doc.createElement("div"); row.className = "corpus-row";
    list.forEach(function (c) {
      var sp = c.live ? cardSpec(cloud, c.id) : null;
      if (sp) row.appendChild(render(doc, sp, { size: "tile", onOpen: opts.onOpen }));
      else row.appendChild(Object.assign(doc.createElement("span"), { className: "corpus-gone", textContent: c.label }));
    });
    w.appendChild(row);
    return w;
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
    /* a card absorbed into a merged parent is drawn as that parent (its fuller corpus), not on its own */
    var deck = (cloud.deck || []).filter(function (e) { var p = C.absorbedInto(cloud, e.id); return !(p && C.inDeck(cloud, p)); });
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

  /* ---------- covered vs uncovered (derived from v8 state; nothing new is stored) ---------- */
  /* covered: merged in, Tinted+ or done (C.isDone) · progress: confirmed, decked, opened or engaged · uncovered: the rest */
  function coverage(cloud, id) {
    var n = cloud.nodes[id], e = C.deckEntry(cloud, id);
    if (!n && !e) return null;
    if (C.absorbedInto(cloud, id)) return { state: "covered", how: "merged", text: "Merged in" };
    var g = C.growthOf(cloud, id);
    if (g.tier >= 3) return { state: "covered", how: "achieved", text: "Covered" };
    if (g.tier >= 2 || (n && C.isDone(cloud, id))) return { state: "covered", how: "done", text: "Covered" };
    if (g.tier >= 1 || e || (n && !n.ghost && (n.opened || n.engaged > 0 || n.spent > 0 || n.correct > 0))) return { state: "progress", how: "started", text: "In progress" };
    return { state: "uncovered", how: n && n.ghost ? "ghost" : "new", text: n && n.ghost ? "Suggested" : "Not started" };
  }
  function subtree(cloud, id, ix) {
    ix = ix || C.index(cloud);
    var out = [id], seen = {};
    seen[id] = 1;
    for (var i = 0; i < out.length; i++) (ix[out[i]] || []).forEach(function (k) { if (!seen[k] && cloud.nodes[k]) { seen[k] = 1; out.push(k); } });
    return out;
  }
  function loose(cloud, id) { var p = C.absorbedInto(cloud, id); return !(p && C.inDeck(cloud, p)); }
  function cardRank(cloud, id) { var g = C.growthOf(cloud, id) || { tier: 0, level: 0 }; return g.tier * 10 + (g.level || 0); }
  /*
   * The album: a page per subject, a row per branch (topic under the subject) led by its own card, then its deck cards
   * by rarity, then empty slots for known topics not collected. Gone topics keep their place by their stored chain.
   * -> [{ subject, hue, covered, known, rows: [{ head, label, lead, cards: [id], slots: [id], more }] }]
   */
  var ALBUM = { slots: 6 };
  function albumModel(cloud, opts) {
    opts = opts || {};
    var cap = opts.slots == null ? ALBUM.slots : opts.slots, ix = C.index(cloud), pages = [], bySubject = {};
    var deck = (cloud.deck || []).filter(function (e) { return loose(cloud, e.id); });
    function page(label, hue, sid) {
      if (!bySubject[label]) { bySubject[label] = { subject: label, id: sid || null, hue: hue, covered: 0, known: 0, rows: [], byHead: {} }; pages.push(bySubject[label]); }
      return bySubject[label];
    }
    function row(pg, head, label) {
      var k = head || "~" + label;
      if (!pg.byHead[k]) { pg.byHead[k] = { head: head, label: label, lead: false, cards: [], slots: [], more: 0 }; pg.rows.push(pg.byHead[k]); }
      return pg.byHead[k];
    }
    deck.forEach(function (e) {
      var n = cloud.nodes[e.id];
      if (n) {
        var a = C.ancestry(cloud, e.id), s = cloud.nodes[a[0]], pg = page(s.label, C.hueOf(cloud, e.id), s.id);
        if (a.length < 2) { row(pg, null, "Subject card").cards.push(e.id); return; }
        var hd = cloud.nodes[a[1]];
        row(pg, hd.id, hd.label).cards.push(e.id);
      } else {
        var ch = e.chain && e.chain.length ? e.chain : [e.subject, e.label];
        row(page(e.subject || ch[0] || "Other", e.hue, null), null, ch.length > 2 ? ch[1] : e.label).cards.push(e.id);
      }
    });
    pages.forEach(function (pg) {
      pg.rows.forEach(function (r) {
        r.cards.sort(function (a, b) { return (b === r.head) - (a === r.head) || cardRank(cloud, b) - cardRank(cloud, a) || (C.deckEntry(cloud, a).at - C.deckEntry(cloud, b).at); });
        r.lead = Boolean(r.head && r.cards[0] === r.head);
        if (!r.head) return;
        var empty = subtree(cloud, r.head, ix).filter(function (x) { return !C.inDeck(cloud, x) && !(C.absorbedInto(cloud, x) && C.inDeck(cloud, C.absorbedInto(cloud, x))); });
        empty.sort(function (a, b) { return (coverage(cloud, b).state === "progress") - (coverage(cloud, a).state === "progress"); });
        r.slots = empty.slice(0, cap); r.more = Math.max(0, empty.length - cap);
      });
      pg.rows.sort(function (a, b) { return (b.lead ? cardRank(cloud, b.head) : 0) - (a.lead ? cardRank(cloud, a.head) : 0) || b.cards.length - a.cards.length; });
      /* covered of known: topics under the subject (no ghosts) plus cards whose topic is gone */
      var ids = pg.id ? subtree(cloud, pg.id, ix).slice(1).filter(function (x) { return !cloud.nodes[x].ghost; }) : [];
      pg.rows.forEach(function (r) { r.cards.forEach(function (x) { if (ids.indexOf(x) < 0) ids.push(x); }); });
      pg.known = ids.length;
      pg.covered = ids.filter(function (x) { var cv = coverage(cloud, x); return cv && cv.state === "covered"; }).length;
      delete pg.byHead;
    });
    pages.sort(function (a, b) { return b.rows.reduce(function (t, r) { return t + r.cards.length; }, 0) - a.rows.reduce(function (t, r) { return t + r.cards.length; }, 0); });
    return pages;
  }
  /* A hub's branches with their coverage (order: the orchestrator's), and pending steps -> { core, side, waiting, covered, total } */
  function hubChildren(cloud, id, order) {
    var n = cloud.nodes[id];
    if (!n) return { core: [], side: [], waiting: [], covered: 0, total: 0 };
    var core = (order && order.core) || C.coreChildren(cloud, id).map(function (c) { return c.id; });
    var side = (order && order.side) || C.sidePaths(cloud, id);
    var out = {
      core: core.filter(function (x) { return cloud.nodes[x]; }).map(function (x) { return { id: x, cov: coverage(cloud, x) }; }),
      side: side.filter(function (x) { return cloud.nodes[x.id]; }).map(function (x) { return { id: x.id, off: x.off, cov: coverage(cloud, x.id) }; }),
      waiting: n.pending && Array.isArray(n.pending.steps) ? n.pending.steps.filter(function (l) { var t = C.findTopic(cloud, l, id); return !(t && t.parent === id); }).slice(0, 6) : []
    };
    var all = out.core.concat(out.side);
    out.total = all.length; out.covered = all.filter(function (x) { return x.cov.state === "covered"; }).length;
    return out;
  }
  /* An empty slot: the card's outline, its name and state. */
  function renderSlot(doc, cloud, id, opts) {
    opts = opts || {};
    var n = cloud.nodes[id], cv = coverage(cloud, id) || { state: "uncovered", text: "" };
    var d = doc.createElement(opts.onOpen ? "button" : "div");
    d.className = "gslot is-" + cv.state + (n && n.ghost ? " ghost" : "");
    d.dataset.card = id;
    if (n) d.style.setProperty("--card-ink", C.colorOf(cloud, n));
    d.appendChild(Object.assign(doc.createElement("span"), { className: "gs-title", textContent: n ? n.label : opts.label || "" }));
    d.appendChild(Object.assign(doc.createElement("span"), { className: "gs-state", textContent: opts.text || cv.text }));
    if (opts.onOpen) {
      d.type = "button";
      d.setAttribute("aria-label", (n ? n.label : "") + ", " + cv.text + ", not in your deck yet");
      d.addEventListener("click", function (e) { e.stopPropagation(); opts.onOpen(id, d); });
    }
    return d;
  }

  var api = {
    DETAIL: DETAIL, REVIEW_DAYS: REVIEW_DAYS, DRAW: DRAW,
    seedOf: seedOf, rng: rng, landscape: landscape, cardSpec: cardSpec, listOf: listOf, chainText: chainText, chainLinks: chainLinks, render: render, artSvg: artSvg,
    renderCorpus: renderCorpus, pipsFor: pipsFor, evolveKey: evolveKey,
    coverage: coverage, subtree: subtree, albumModel: albumModel, hubChildren: hubChildren, renderSlot: renderSlot, ALBUM: ALBUM,
    dayOf: dayOf, weigh: weigh, drawSession: drawSession, balance: balance
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IkoDeck = api;
})(typeof window !== "undefined" ? window : this);
