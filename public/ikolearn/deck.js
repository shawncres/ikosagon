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
  function landscape(id, detail, motif) {
    var d = Math.max(0, Math.min(4, Math.round(Number(detail) || 0)));
    var R = rng(seedOf("land:" + id)), place = motifPlace(id, motif || "");
    /* with a motif the land sits lower and quieter (the emblem layout lowest), so the drawing reads */
    var horizon = (place ? (place.layout === 1 ? 50 : 42) : 34) + R() * (place ? 8 : 14), hasWater = R() < 0.55, hasTrees = R() < 0.8, hasBirds = R() < 0.65, hasSun = R() < 0.4;
    var waterY = hasWater ? r1(Math.min(LH - 12, horizon + 24 + R() * 10)) : LH;
    var n = 3 + (R() < 0.5 ? 1 : 0), layers = [], hatch = [], trees = [], birds = [], ripples = [], i, j;
    for (i = 0; i < n; i++) {
      var depth = i / (n - 1); /* 0 far .. 1 near */
      var base = horizon + i * (hasWater ? 7 : 11) + 6, amp = (1 - depth * 0.6) * (14 + R() * 18) * (place ? 0.6 : 1);
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
      id: String(id), detail: d, w: LW, h: LH, layers: layers, water: hasWater ? { y: waterY } : null, sun: place ? null : sun, motif: place,
      hatch: take(hatch, DETAIL.hatch[d]), trees: hasTrees ? take(trees, DETAIL.trees[d]) : [], birds: hasBirds ? take(birds, DETAIL.birds[d]) : [], ripples: take(ripples, DETAIL.ripples[d]),
      totals: { hatch: hatch.length, trees: hasTrees ? trees.length : 0, birds: hasBirds ? birds.length : 0, ripples: ripples.length }
    };
  }

  /* ---------- motifs: a small line drawing that hints at the topic ---------- */
  /*
   * One minimal line drawing per motif name (24 x 24 box): "M..." is a path, "c x y r" a circle, "e x y rx ry deg" an
   * ellipse. Drawn in the card's ink over the landscape. The names are IkoCloud.MOTIFS (the creation call picks one).
   */
  var MOTIF_ART = {
    mountain: ["M2 20 L9 8 L13 14 L16 10 L22 20 Z", "M7.6 10.4 L9 8 L10.4 10.4"],
    wave: ["M2 14 C5 10 8 10 10 14 C12 18 15 18 18 14 C19.5 12 21 11.5 22 12", "M2 19 C5 16 8 16 10 19 C12 21 15 21 18 19"],
    leaf: ["M5 19 C5 9 11 4 20 4 C20 13 15 19 5 19 Z", "M5 19 L14 10"],
    tree: ["M12 21 L12 13", "M12 3 C7 3 5 7 6 10 C4 12 6 15 9 14 C10 16 14 16 15 14 C18 15 20 12 18 10 C19 7 17 3 12 3 Z"],
    flower: ["M12 21 L12 12", "M12 12 C9 12 8 9 10 8 C8 6 10 3 12 5 C14 3 16 6 14 8 C16 9 15 12 12 12 Z", "M12 17 C14 15 16 15 17 16"],
    seed: ["M12 21 L12 14", "M12 14 C8 14 6 11 6 8 C9 8 12 10 12 14", "M12 14 C12 10 15 7 19 7 C19 11 16 14 12 14", "M6 21 L18 21"],
    sun: ["c 12 12 4", "M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9"],
    moon: ["M15 3 A9 9 0 1 0 21 15 A7 7 0 1 1 15 3 Z"],
    star: ["M12 3 L14.6 9 L21 9.5 L16 13.6 L17.6 20 L12 16.6 L6.4 20 L8 13.6 L3 9.5 L9.4 9 Z"],
    planet: ["c 12 12 5", "M3.5 15.5 C1 18.5 9 17 14 14 C19 11 23.5 7 20.5 6.2"],
    cloud: ["M7 18 C4 18 3 15 5 13.5 C4.5 10 8 9 9.5 10.5 C10.5 7 16 7 16.5 11 C19.5 10.5 21.5 13 20 15.5 C21 17.5 19 18 18 18 Z"],
    flame: ["M12 3 C13 7 18 9 18 14 C18 18 15 21 12 21 C9 21 6 18 6 14 C6 11 8 10 9 8 C9.5 10 10.5 11 11.5 11 C11 8 11 5 12 3 Z", "M12 21 C10.5 20 10 18 11 16 C11.5 17 12.5 17 13 16 C14 18 13.5 20 12 21"],
    drop: ["M12 3 C15 8 18 11 18 15 A6 6 0 0 1 6 15 C6 11 9 8 12 3 Z", "M9 15 C9 17 10 18 11.5 18.5"],
    gear: ["c 12 12 6", "c 12 12 2.2", "M12 3 L12 6 M12 18 L12 21 M3 12 L6 12 M18 12 L21 12 M5.6 5.6 L7.8 7.8 M16.2 16.2 L18.4 18.4 M5.6 18.4 L7.8 16.2 M16.2 7.8 L18.4 5.6"],
    bridge: ["M2 16 L22 16", "M2 16 C6 9 18 9 22 16", "M6 12.6 L6 16 M9 11 L9 16 M12 10.6 L12 16 M15 11 L15 16 M18 12.6 L18 16", "M4 16 L4 20 M20 16 L20 20"],
    house: ["M3 11 L12 4 L21 11", "M5 9.5 L5 20 L19 20 L19 9.5", "M10 20 L10 14 L14 14 L14 20"],
    book: ["M12 6 C9 4 6 4 3 5 L3 19 C6 18 9 18 12 20 C15 18 18 18 21 19 L21 5 C18 4 15 4 12 6 Z", "M12 6 L12 20"],
    pen: ["M4 20 L5 15 L16 4 L20 8 L9 19 Z", "M14 6 L18 10", "M4 20 L8 19"],
    brush: ["M20 3 L11 12", "M11 12 C8 11 6 13 6 15 C6 18 4 19 3 20 C7 21 11 20 12 17 C13 15 12 13 11 12 Z"],
    note: ["M9 18 L9 5 L19 3 L19 16", "M9 9 L19 7", "e 6.5 18 2.5 2 0", "e 16.5 16 2.5 2 0"],
    atom: ["e 12 12 9 3.4 0", "e 12 12 9 3.4 60", "e 12 12 9 3.4 -60", "c 12 12 1.2"],
    cell: ["e 12 12 9 7 -15", "c 13 11 2.8", "c 7 14 0.8", "c 17 16 0.8", "c 8 9 0.6"],
    eye: ["M2 12 C6 6 18 6 22 12 C18 18 6 18 2 12 Z", "c 12 12 3.2", "c 12 12 1"],
    hand: ["M8 21 L6 14 C5 12 7 11 8 13 L9 15 L9 5 C9 3.5 11 3.5 11 5 L11 12 L11 4 C11 2.5 13 2.5 13 4 L13 12 L13 5 C13 3.5 15 3.5 15 5 L15 12 L15 7 C15 5.5 17 5.5 17 7 L17 15 C17 18 15 21 12 21 Z"],
    heart: ["M12 20 C6 16 3 12 3 8.5 C3 5.5 5.5 4 7.5 4 C9.5 4 11 5.5 12 7 C13 5.5 14.5 4 16.5 4 C18.5 4 21 5.5 21 8.5 C21 12 18 16 12 20 Z"],
    chart: ["M3 3 L3 21 L21 21", "M6 17 L10 12 L13 15 L20 7", "M17 7 L20 7 L20 10"],
    clock: ["c 12 12 9", "M12 7 L12 12 L16 14"],
    map: ["M3 6 L9 4 L15 6 L21 4 L21 18 L15 20 L9 18 L3 20 Z", "M9 4 L9 18 M15 6 L15 20"],
    compass: ["c 12 12 9", "M12 5 L14 12 L12 19 L10 12 Z", "M10 12 L14 12"],
    bulb: ["M9 17 C9 14 6 13 6 9 A6 6 0 0 1 18 9 C18 13 15 14 15 17 Z", "M9.5 20 L14.5 20", "M10 17 L10 13 L12 14.5 L14 13 L14 17"],
    puzzle: ["M4 8 L9 8 C9 5 13 5 13 8 L18 8 L18 12 C21 12 21 16 18 16 L18 20 L4 20 L4 16 C7 16 7 12 4 12 Z"],
    ball: ["c 12 12 9", "M3.5 9 C8 11 16 11 20.5 9", "M3.5 15 C8 13 16 13 20.5 15", "M12 3 C9 8 9 16 12 21"],
    bowl: ["M3 11 L21 11 C21 16 17 20 12 20 C7 20 3 16 3 11 Z", "M9 8 C9 6 10 6 10 4 M13 8 C13 6 14 6 14 4", "M8 20 L16 20"],
    cup: ["M5 8 L17 8 L16 19 C16 20 15 20 14 20 L8 20 C7 20 6 20 6 19 Z", "M17 10 C20 10 20 15 16.5 15", "M9 5 C9 4 10 4 10 3 M13 5 C13 4 14 4 14 3"],
    globe: ["c 12 12 9", "e 12 12 4 9 0", "M3 12 L21 12", "M4.6 7 L19.4 7 M4.6 17 L19.4 17"],
    voice: ["M4 5 L20 5 C21 5 21 6 21 7 L21 14 C21 15 20 16 19 16 L11 16 L6 20 L7 16 L5 16 C4 16 3 15 3 14 L3 7 C3 6 3 5 4 5 Z", "M7 9 L17 9 M7 12 L14 12"],
    people: ["c 8 8 2.5", "c 16 8 2.5", "M3 19 C3 14 13 14 13 19", "M11 19 C11 14 21 14 21 19"],
    code: ["M8 7 L3 12 L8 17", "M16 7 L21 12 L16 17", "M14 4 L10 20"],
    scale: ["M12 3 L12 21 M7 21 L17 21 M4 7 L20 7", "M4 7 L1.5 13 L6.5 13 Z", "M20 7 L17.5 13 L22.5 13 Z"],
    feather: ["M5 21 L18 8", "M18 3 C10 4 6 10 6 18 C14 18 20 14 21 6 C20 4 19 3 18 3 Z", "M10 14 L14 14 M12 11 L16 11"],
    key: ["c 7 12 4", "M11 12 L21 12 M18 12 L18 15 M15 12 L15 14"],
    boat: ["M3 15 L21 15 L18 19 L6 19 Z", "M12 15 L12 3 L19 13 L12 13", "M2 21.5 C5 20.5 7 22.5 10 21.5 C13 20.5 15 22.5 18 21.5"],
    paw: ["e 12 16 4 3.2 0", "c 6.5 10.5 1.8", "c 10 7 1.8", "c 14 7 1.8", "c 17.5 10.5 1.8"]
  };
  /*
   * For topics without a motif from the creation call (older saves, chat-grown topics): a keyword match on the title,
   * then on the chain above it (the first rule that matches wins); none matching is a plain scene ("").
   */
  var MOTIF_WORDS = [
    ["mountain", /volcan|mountain|hik|climb|geolog|rock|magma|lava|earthquake/], ["wave", /ocean|sea\b|wave|swim|surf|tide|river|lake/],
    ["paw", /animal|pet|dog|cat\b|wildlife|zoo|mammal|insect|dinosaur|monkey|horse|whale|\bfish|\bbears?\b/], ["feather", /bird|feather|flight|fly/],
    ["leaf", /plant|garden|leaf|botan|herb|grow(ing)? food|compost/], ["tree", /tree|forest|wood(?!work)/], ["flower", /flower|bloom|petal/],
    ["seed", /seed|sprout|farm|patien|habit|growth/], ["sun", /\bsun|solar|light\b|season/], ["moon", /moon|night|sleep|dream/],
    ["star", /\bstars?\b|constell|astronom|galax/], ["planet", /planet|space|orbit|mars|jupiter|rocket/], ["cloud", /weather|cloud|rain|climate|storm|wind/],
    ["bowl", /bak|bread|cook|recipe|food|kitchen|soup|meal|nutrition|sourdough|pastr/], ["cup", /coffee|\btea\b|drink|brew/],
    ["flame", /fire|flame|heat|burn|energy|candle/], ["drop", /water|drop|liquid|hydrat/], ["atom", /atom|physic|electr|quantum|chemi|molecul/],
    ["cell", /cell|biolog|body|gene|dna|microb|anatom|health/], ["gear", /machin|engine|mechan|robot|gear|tool|repair|fix/],
    ["bridge", /bridge|engineer|construct|build/], ["house", /house|home|architect|room|furniture|shelf|shelves/],
    ["book", /\bread|book|\bstor(y|ies)\b|literat|novel|poem|poetry|librar/], ["pen", /writ|letter|essay|grammar|spell|journal|calligra/],
    ["brush", /paint|draw|\bart\b|\barts\b|sketch|colou?r|watercolo|illustrat|design/], ["note", /music|song|guitar|piano|chord|\bsing|rhythm|melod|drum|violin/],
    ["eye", /see\b|vision|observ|photo|camera|focus|attention|notic/], ["hand", /craft|knit|sew|crochet|origami|clay|pottery|woodwork|hand/],
    ["heart", /kind|emotion|feel|care|heart|calm|gratitude|confiden/], ["chart", /data|statistic|chart|econom|money|financ|budget|graph|percent/],
    ["clock", /time|history|clock|calendar|routine|ancient|century|medieval/], ["map", /map|geograph|travel|countr|cit(y|ies)\b|continent/],
    ["compass", /navig|direction|compass|orient|explor|adventure/], ["bulb", /idea|invent|think|question|curio|creativ|problem solv/],
    ["puzzle", /puzzle|logic|riddle|chess|game|math|number|fraction|algebra|geometr|count/], ["ball", /sport|ball|football|soccer|tennis|basket|\brun|fitness|exercis|yoga|swim/],
    ["globe", /world|global|language|culture|french|spanish|japanese|german|earth\b/], ["voice", /speak|talk|voice|convers|listen|present|debate|speech/],
    ["people", /friend|team|people|social|communit|family|together|collaborat/], ["code", /code|coding|program|python|javascript|software|comput|app\b|web/],
    ["scale", /law|justice|fair|ethic|balance|right(s)?\b|govern/], ["key", /\bkey|secur|lock|crypt|secret|password/], ["boat", /boat|sail|ship|kayak|canoe/]
  ];
  function motifFor(label, chain, own) {
    if (own && MOTIF_ART[own]) return own;
    var texts = [String(label || "")].concat((chain || []).slice().reverse());
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i].toLowerCase();
      for (var j = 0; j < MOTIF_WORDS.length; j++) if (MOTIF_WORDS[j][1].test(t)) return MOTIF_WORDS[j][0];
    }
    return "";
  }
  /*
   * Where the motif sits in the plate, from the topic id: one of three compositions (standing on the land to one side,
   * centred above a low horizon like an emblem, or small beside a higher horizon), a size and a slight tilt.
   */
  function motifPlace(id, motif) {
    if (!motif) return null;
    var R = rng(seedOf("motif:" + id)), v = Math.floor(R() * 3);
    var size = v === 0 ? 44 + R() * 8 : v === 1 ? 40 + R() * 6 : 34 + R() * 6;
    var x = v === 0 ? (R() < 0.5 ? 62 + R() * 10 : 10 + R() * 10) : v === 1 ? (LW - size) / 2 + (R() - 0.5) * 6 : (R() < 0.5 ? 8 + R() * 8 : 74 + R() * 6);
    var y = v === 1 ? 6 + R() * 5 : v === 0 ? 14 + R() * 8 : 10 + R() * 10;
    return { name: motif, layout: v, x: r1(x), y: r1(y), s: r1(size / 24 * 100) / 100, rot: r1((R() - 0.5) * 14) };
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
      color: C.cardColor(cloud, id), art: landscape(id, g.detail, motifFor(n ? n.label : e.label, C.chainOf(cloud, id), n ? n.motif : ""))
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
    if (a.motif && MOTIF_ART[a.motif.name]) svg.appendChild(motifSvg(doc, a.motif, c, t));
    return svg;
  }
  /* The motif: a paper halo under a pen line in the card's ink, the line a touch firmer as the card's colour grows. */
  function motifSvg(doc, m, c, t) {
    var g = svgEl(doc, "g", { class: "motif", "data-motif": m.name, transform: "translate(" + m.x + " " + m.y + ") rotate(" + m.rot + " " + 12 * m.s + " " + 12 * m.s + ") scale(" + m.s + ")", fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" });
    var w = 1 / m.s;
    [["hsla(40, 59%, 90%, 0.85)", 3.2 * w], [hsla(c, 0.72 + 0.25 * t, -8), 1.35 * w]].forEach(function (pen) {
      MOTIF_ART[m.name].forEach(function (p) {
        var a = p.split(" "), at = { stroke: pen[0], "stroke-width": r1(pen[1] * 100) / 100 };
        if (a[0] === "c") g.appendChild(svgEl(doc, "circle", Object.assign(at, { cx: a[1], cy: a[2], r: a[3] })));
        else if (a[0] === "e") g.appendChild(svgEl(doc, "ellipse", Object.assign(at, { cx: a[1], cy: a[2], rx: a[3], ry: a[4], transform: "rotate(" + a[5] + " " + a[1] + " " + a[2] + ")" })));
        else g.appendChild(svgEl(doc, "path", Object.assign(at, { d: p })));
      });
    });
    return g;
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
    seedOf: seedOf, rng: rng, landscape: landscape, motifFor: motifFor, motifPlace: motifPlace, MOTIF_ART: MOTIF_ART, cardSpec: cardSpec, listOf: listOf, chainText: chainText, chainLinks: chainLinks, render: render, artSvg: artSvg,
    renderCorpus: renderCorpus, pipsFor: pipsFor, evolveKey: evolveKey,
    coverage: coverage, subtree: subtree, albumModel: albumModel, hubChildren: hubChildren, renderSlot: renderSlot, ALBUM: ALBUM,
    dayOf: dayOf, weigh: weigh, drawSession: drawSession, balance: balance
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IkoDeck = api;
})(typeof window !== "undefined" ? window : this);
