/*
 * IkoLearn cloud data model (no DOM). The learner's profile as a small graph:
 *   root (first name) -> subjects (parents) -> topics (children); ghosts are related topics not explored yet.
 * Grows from the structured block the companion appends to each reply: topics are added or strengthened under the
 * right subject, ghosts are promoted to real nodes when explored, weight and a light mastery signal are tracked.
 * Works in the browser (window.IkoCloud) and in Node (module.exports) so the check script can test it.
 */
(function (root) {
  "use strict";

  var VERSION = 1;
  var LIMITS = { nodes: 160, parents: 12, childrenPerParent: 16, ghostsPerParent: 4, cards: 60, labelChars: 32 };
  /* Soft spectrum, one hue per subject in order of creation. */
  var HUES = [4, 28, 48, 96, 150, 188, 214, 252, 286, 322, 70, 170];

  var STARTERS = [
    { label: "Reading & Writing", children: ["Stories", "Vocabulary"], ghosts: ["Poetry"] },
    { label: "Math", children: ["Numbers", "Shapes"], ghosts: ["Fractions"] },
    { label: "Science", children: ["Living Things", "Space"], ghosts: ["Weather"] },
    { label: "People & Places", children: ["History", "Maps"], ghosts: ["Cultures"] },
    { label: "Art & Music", children: ["Drawing", "Rhythm"], ghosts: ["Color Mixing"] },
    { label: "Making & Coding", children: ["Building", "Puzzles"], ghosts: ["Coding", "How AI Works"] }
  ];

  /* Words that point at an existing subject, so "maths" or "biology" lands under Math or Science. */
  var PARENT_ALIASES = {
    "reading and writing": ["reading", "writing", "english", "literacy", "language", "language arts", "spelling", "grammar", "literature"],
    math: ["maths", "mathematic", "mathematics", "arithmetic", "numeracy", "geometry", "algebra"],
    science: ["sciences", "biology", "physic", "physics", "chemistry", "nature", "earth science"],
    "people and places": ["history", "geography", "social studies", "social study", "civics", "world"],
    "art and music": ["art", "arts", "music", "drawing and music", "creative arts"],
    "making and coding": ["coding", "computing", "computer science", "technology", "tech", "engineering", "making", "programming"]
  };

  function cleanLabel(v) {
    return String(v == null ? "" : v)
      .replace(/[\u0000-\u001f\u007f"<>{}[\]`*_#|\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, LIMITS.labelChars)
      .trim();
  }

  /* Normalized key: lower case, & -> and, punctuation out, simple singular. */
  function norm(v) {
    return cleanLabel(v)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^\p{L}\p{N} ]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .map(function (w) { return w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w; })
      .join(" ");
  }

  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }

  function newId(cloud) { cloud.seq = (cloud.seq || 0) + 1; return "n" + cloud.seq; }

  function create(name, now) {
    now = now || Date.now();
    var cloud = { v: VERSION, name: cleanLabel(name) || "Me", seq: 0, rev: 0, nodes: {}, order: [], cards: [], created: now };
    STARTERS.forEach(function (s) {
      var p = addNode(cloud, { label: s.label, parent: null, weight: 1, born: 0 });
      s.children.forEach(function (c) { addNode(cloud, { label: c, parent: p.id, weight: 1, born: 0 }); });
      s.ghosts.forEach(function (g) { addNode(cloud, { label: g, parent: p.id, ghost: true, born: 0 }); });
    });
    return cloud;
  }

  function parents(cloud) {
    return cloud.order.map(function (id) { return cloud.nodes[id]; }).filter(function (n) { return n && !n.parent; });
  }
  function children(cloud, pid) {
    return cloud.order.map(function (id) { return cloud.nodes[id]; }).filter(function (n) { return n && n.parent === pid; });
  }

  function addNode(cloud, o) {
    var id = newId(cloud);
    var n = {
      id: id,
      label: cleanLabel(o.label),
      key: norm(o.label),
      parent: o.parent || null,
      weight: o.ghost ? 0 : (o.weight == null ? 1 : o.weight),
      mastery: 0,
      ghost: Boolean(o.ghost),
      born: o.born == null ? Date.now() : o.born,
      touched: o.born || 0,
      cards: []
    };
    if (!n.parent) n.hue = HUES[parents(cloud).length % HUES.length];
    cloud.nodes[id] = n;
    cloud.order.push(id);
    return n;
  }

  function removeNode(cloud, id) {
    delete cloud.nodes[id];
    cloud.order = cloud.order.filter(function (x) { return x !== id; });
  }

  function findParent(cloud, label) {
    var k = norm(label);
    if (!k) return null;
    var ps = parents(cloud);
    for (var i = 0; i < ps.length; i++) if (ps[i].key === k) return ps[i];
    for (var j = 0; j < ps.length; j++) {
      var al = PARENT_ALIASES[ps[j].key];
      if (al && al.indexOf(k) >= 0) return ps[j];
    }
    /* "Science & Nature" vs "Science": first word match on multi-word subjects */
    for (var m = 0; m < ps.length; m++) {
      var a = ps[m].key.split(" ")[0], b = k.split(" ")[0];
      if (a.length > 3 && a === b) return ps[m];
    }
    return null;
  }

  function findChild(cloud, label) {
    var k = norm(label);
    if (!k) return null;
    for (var i = 0; i < cloud.order.length; i++) {
      var n = cloud.nodes[cloud.order[i]];
      if (n && n.parent && n.key === k) return n;
    }
    return null;
  }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  /* Keeps the graph under the node cap: oldest ghosts go first, then the lightest old topics. */
  function prune(cloud) {
    var guard = 0;
    while (cloud.order.length > LIMITS.nodes && guard++ < 500) {
      var ghosts = cloud.order.map(function (id) { return cloud.nodes[id]; }).filter(function (n) { return n.ghost; });
      if (ghosts.length) { removeNode(cloud, ghosts[0].id); continue; }
      var kids = cloud.order.map(function (id) { return cloud.nodes[id]; }).filter(function (n) { return n.parent && !n.cards.length; });
      kids.sort(function (a, b) { return a.weight - b.weight || a.touched - b.touched; });
      if (!kids.length) break;
      removeNode(cloud, kids[0].id);
    }
  }

  var SIGNAL = {
    explored: { w: 1, m: 0.05 },
    strength: { w: 1, m: 0.2 },
    struggle: { w: 1, m: -0.1 },
    curious: { w: 0.5, m: 0 }
  };

  /*
   * Applies the companion's topics. Returns { created, promoted, strengthened, parentsCreated } (node ids),
   * which the view uses to highlight what grew.
   */
  function applyTopics(cloud, topics, now) {
    now = now || Date.now();
    var res = { created: [], promoted: [], strengthened: [], parentsCreated: [] };
    (Array.isArray(topics) ? topics : []).slice(0, 3).forEach(function (t) {
      if (!t) return;
      var label = cleanLabel(t.name);
      if (!label || norm(label) === norm(cloud.name)) return;
      var sig = SIGNAL[t.signal] || SIGNAL.explored;
      var asParent = findParent(cloud, label);
      if (asParent && asParent.key === norm(label)) {
        asParent.weight += sig.w * 0.5; asParent.touched = now; res.strengthened.push(asParent.id); return;
      }
      var node = findChild(cloud, label);
      var parent = node ? cloud.nodes[node.parent] : findParent(cloud, t.parent);
      if (!parent) {
        var plabel = cleanLabel(t.parent);
        if (plabel && norm(plabel) !== norm(cloud.name) && parents(cloud).length < LIMITS.parents) {
          parent = addNode(cloud, { label: plabel, parent: null, weight: 1, born: now });
          res.parentsCreated.push(parent.id);
        } else {
          parent = findParent(cloud, "Curiosities") || (parents(cloud).length < LIMITS.parents ? addNode(cloud, { label: "Curiosities", parent: null, weight: 1, born: now }) : parents(cloud)[0]);
        }
      }
      if (!node) {
        var kids = children(cloud, parent.id);
        if (kids.length >= LIMITS.childrenPerParent) {
          var ghost = kids.filter(function (k) { return k.ghost; })[0];
          if (ghost) removeNode(cloud, ghost.id);
          else { parent.weight += 0.5; parent.touched = now; res.strengthened.push(parent.id); return; }
        }
        node = addNode(cloud, { label: label, parent: parent.id, weight: 0, born: now });
        res.created.push(node.id);
      } else if (node.ghost) {
        node.ghost = false; node.born = now; res.promoted.push(node.id);
      } else {
        res.strengthened.push(node.id);
      }
      node.weight += sig.w;
      node.mastery = clamp01(node.mastery + sig.m);
      if (t.signal === "struggle") node.lastStruggle = now;
      node.touched = now;
      parent.weight += 0.25; parent.touched = now;
    });
    prune(cloud);
    if (res.created.length + res.promoted.length + res.strengthened.length + res.parentsCreated.length) cloud.rev += 1;
    return res;
  }

  /* Adds related, unexplored topics as ghosts under existing subjects (ghosts never create subjects). */
  function addGhosts(cloud, ghosts, now) {
    now = now || Date.now();
    var added = [];
    (Array.isArray(ghosts) ? ghosts : []).slice(0, 3).forEach(function (g) {
      if (!g) return;
      var label = cleanLabel(g.name);
      if (!label || norm(label) === norm(cloud.name) || findChild(cloud, label) || findParent(cloud, label)) return;
      var parent = findParent(cloud, g.parent);
      if (!parent) return;
      var existing = children(cloud, parent.id).filter(function (k) { return k.ghost; });
      if (existing.length >= LIMITS.ghostsPerParent) removeNode(cloud, existing[0].id);
      if (children(cloud, parent.id).length >= LIMITS.childrenPerParent) return;
      added.push(addNode(cloud, { label: label, parent: parent.id, ghost: true, born: now }).id);
    });
    prune(cloud);
    if (added.length) cloud.rev += 1;
    return added;
  }

  function attachCard(cloud, card, now) {
    now = now || Date.now();
    var res = applyTopics(cloud, [{ name: card.topic, parent: card.parent, signal: "explored" }], now);
    var node = findChild(cloud, card.topic) || findParent(cloud, card.topic);
    var c = { id: "c" + now.toString(36) + Math.floor(hash(card.title + now) * 1e4), title: String(card.title).slice(0, 60), body: String(card.body).slice(0, 700), node: node ? node.id : null, at: now };
    cloud.cards.push(c);
    if (node) node.cards.push(c.id);
    while (cloud.cards.length > LIMITS.cards) {
      var old = cloud.cards.shift();
      var on = cloud.nodes[old.node];
      if (on) on.cards = on.cards.filter(function (x) { return x !== old.id; });
    }
    return { card: c, grew: res };
  }

  function cardsFor(cloud, id) {
    return cloud.cards.filter(function (c) { return c.node === id; });
  }

  /* Compact text for the prompts: strongest subjects first, a few topics each. */
  function summarize(cloud, maxChars) {
    maxChars = maxChars || 1800;
    var ps = parents(cloud).slice().sort(function (a, b) { return b.weight - a.weight; });
    var lines = ps.map(function (p) {
      var kids = children(cloud, p.id).sort(function (a, b) { return b.weight - a.weight; }).slice(0, 8);
      var parts = kids.map(function (k) {
        if (k.ghost) return k.label + " (ghost)";
        var tag = k.mastery >= 0.4 ? ", strong" : (k.lastStruggle ? ", found hard" : "");
        return k.label + " (" + Math.round(k.weight * 10) / 10 + tag + ")";
      });
      return p.label + " [" + Math.round(p.weight * 10) / 10 + "]: " + parts.join(", ");
    });
    var out = lines.join("\n");
    return out.length > maxChars ? out.slice(0, maxChars) : out;
  }

  function parentLabels(cloud) { return parents(cloud).map(function (p) { return p.label; }); }

  /* Colours: the subject's hue, children in lighter or deeper shades of it; ghosts pale. */
  function colorOf(cloud, n) {
    if (!n) return "hsl(30, 30%, 22%)";
    var p = n.parent ? cloud.nodes[n.parent] : n;
    var h = p && p.hue != null ? p.hue : 30;
    if (!n.parent) return "hsl(" + h + ", 52%, 50%)";
    var i = children(cloud, n.parent).indexOf(n);
    var light = 36 + (i % 4) * 7;
    return n.ghost ? "hsla(" + h + ", 35%, 55%, 0.55)" : "hsl(" + h + ", 46%, " + light + "%)";
  }

  /* Deterministic 3D layout: subjects on a sphere, topics in a small shell around their subject. */
  function layout(cloud) {
    var pos = { root: { x: 0, y: 0, z: 0 } };
    var ps = parents(cloud);
    var N = Math.max(ps.length, 6);
    var golden = Math.PI * (3 - Math.sqrt(5));
    ps.forEach(function (p, i) {
      var y = 1 - (i + 0.5) / N * 2;
      var r = Math.sqrt(1 - y * y);
      var th = golden * i;
      pos[p.id] = { x: Math.cos(th) * r, y: y * 0.8, z: Math.sin(th) * r };
      var kids = children(cloud, p.id);
      kids.forEach(function (k, j) {
        var a = hash(k.key + "a") * Math.PI * 2;
        var b = (hash(k.key + "b") - 0.5) * Math.PI;
        var d = (k.ghost ? 0.5 : 0.36) + 0.04 * (j % 3);
        var base = pos[p.id];
        pos[k.id] = {
          x: base.x * 1.18 + Math.cos(a) * Math.cos(b) * d,
          y: base.y * 1.18 + Math.sin(b) * d,
          z: base.z * 1.18 + Math.sin(a) * Math.cos(b) * d
        };
      });
    });
    return pos;
  }

  function serialize(cloud) { return JSON.stringify(cloud); }

  /* Validates stored JSON; returns null when it is not a usable cloud (the app then starts a fresh one). */
  function deserialize(str) {
    var c;
    try { c = typeof str === "string" ? JSON.parse(str) : str; } catch { return null; }
    if (!c || c.v !== VERSION || typeof c.name !== "string" || !c.nodes || !Array.isArray(c.order)) return null;
    var nodes = {}, order = [];
    c.order.forEach(function (id) {
      var n = c.nodes[id];
      if (!n || typeof n.label !== "string" || (n.parent && !c.nodes[n.parent])) return;
      nodes[id] = {
        id: id, label: cleanLabel(n.label), key: norm(n.label), parent: n.parent || null,
        weight: Number(n.weight) || 0, mastery: clamp01(Number(n.mastery) || 0), ghost: Boolean(n.ghost),
        born: Number(n.born) || 0, touched: Number(n.touched) || 0, cards: Array.isArray(n.cards) ? n.cards.filter(function (x) { return typeof x === "string"; }) : [],
        hue: n.parent ? undefined : (Number.isFinite(n.hue) ? n.hue : 30), lastStruggle: n.lastStruggle || undefined
      };
      order.push(id);
    });
    var cards = (Array.isArray(c.cards) ? c.cards : []).filter(function (x) { return x && typeof x.title === "string" && typeof x.body === "string"; }).slice(-LIMITS.cards);
    return { v: VERSION, name: cleanLabel(c.name) || "Me", seq: Number(c.seq) || order.length, rev: Number(c.rev) || 0, nodes: nodes, order: order, cards: cards, created: Number(c.created) || 0 };
  }

  /* Thread persistence: keep the most recent messages only. */
  function trimThread(msgs, max) {
    max = max || 60;
    return (Array.isArray(msgs) ? msgs : []).filter(function (m) { return m && typeof m.text === "string" && /^(user|model|card|grow)$/.test(m.role); }).slice(-max);
  }

  var api = {
    VERSION: VERSION, LIMITS: LIMITS, STARTERS: STARTERS, HUES: HUES,
    create: create, applyTopics: applyTopics, addGhosts: addGhosts, attachCard: attachCard, cardsFor: cardsFor,
    summarize: summarize, parentLabels: parentLabels, parents: parents, children: children,
    findParent: findParent, findChild: findChild, norm: norm, cleanLabel: cleanLabel,
    colorOf: colorOf, layout: layout, serialize: serialize, deserialize: deserialize, trimThread: trimThread
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.IkoCloud = api;
})(typeof self !== "undefined" ? self : this);
