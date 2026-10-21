/*
 * IkoLearn cloud data model (no DOM). The learner's knowledge map as a tree of any depth:
 *   root (first name) -> subjects -> topics -> subtopics -> ... ; ghosts are topics not explored yet.
 * Every node has a stable id ("n12", never reused) and a path of labels from its subject ("Math > Addition > Number Bonds").
 * It grows from the structured block the companion appends to each reply, from cards, from lesson paths and from
 * "related topics". Nodes keep weight (how much it came up), mastery (0..1, raised by lessons) and an optional ordered
 * learning path of subtopics with a recommended next step.
 * Works in the browser (window.IkoCloud) and in Node (module.exports) so the check script can test it.
 */
(function (root) {
  "use strict";

  var VERSION = 3;
  /* nodes: stored cap (localStorage stays small). children / ghosts: per node. There is no depth limit. */
  var LIMITS = { nodes: 600, subjects: 12, children: 16, ghostsPerNode: 6, pathSteps: 6, cards: 60, labelChars: 32, choices: 3, draws: 3000, whyChars: 80 };
  var MASTERED = 0.6;
  /* Soft spectrum, one hue per subject in order of creation. */
  var HUES = [4, 28, 48, 96, 150, 188, 214, 252, 286, 322, 70, 170];

  /*
   * Starter map. A string is an explored starter topic; { ghost: true } is a dotted branch; `path` orders a node's
   * subtopics into a suggested learning route. Math is seeded deeper as the worked example; the logic is the same for
   * every subject.
   */
  var STARTERS = [
    { label: "Reading & Writing", children: ["Stories", "Vocabulary", { label: "Poetry", ghost: true }] },
    {
      label: "Math",
      path: ["Counting", "Number Sense", "Addition", "Subtraction", "Multiplication", "Fractions"],
      children: [
        { label: "Counting", path: ["Counting to 20", "Skip Counting"], children: ["Counting to 20", { label: "Skip Counting", ghost: true }] },
        { label: "Number Sense", path: ["Comparing Numbers", "Place Value"], children: [{ label: "Comparing Numbers", ghost: true }, { label: "Place Value", ghost: true }] },
        { label: "Addition", ghost: true, path: ["Adding Within 10", "Number Bonds", "Adding Within 20"], children: [{ label: "Adding Within 10", ghost: true }, { label: "Number Bonds", ghost: true }, { label: "Adding Within 20", ghost: true }] },
        { label: "Subtraction", ghost: true },
        { label: "Multiplication", ghost: true },
        { label: "Fractions", ghost: true },
        "Shapes"
      ]
    },
    { label: "Science", children: ["Living Things", "Space", { label: "Weather", ghost: true }] },
    { label: "People & Places", children: ["History", "Maps", { label: "Cultures", ghost: true }] },
    { label: "Art & Music", children: ["Drawing", "Rhythm", { label: "Color Mixing", ghost: true }] },
    { label: "Making & Coding", children: ["Building", "Puzzles", { label: "Coding", ghost: true }, { label: "How AI Works", ghost: true }] }
  ];

  /* Words that point at an existing subject, so "maths" or "biology" lands under Math or Science. */
  var SUBJECT_ALIASES = {
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
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function now_(t) { return t || Date.now(); }

  /* ---------- tree basics ---------- */
  function node(cloud, id) { return id ? cloud.nodes[id] || null : null; }
  function all(cloud) { return cloud.order.map(function (id) { return cloud.nodes[id]; }).filter(Boolean); }
  function childrenOf(cloud, id) { return all(cloud).filter(function (n) { return n.parent === (id || null); }); }
  function subjects(cloud) { return childrenOf(cloud, null); }

  /* Parent id -> child ids, in creation order (one pass; used by layout and summaries). */
  function index(cloud) {
    var m = { "": [] };
    cloud.order.forEach(function (id) {
      var n = cloud.nodes[id]; if (!n) return;
      var k = n.parent || "";
      (m[k] = m[k] || []).push(id);
    });
    return m;
  }

  /* Ids from the subject down to this node. Cycle-safe. */
  function ancestry(cloud, id) {
    var out = [], seen = {}, n = node(cloud, id);
    while (n && !seen[n.id]) { seen[n.id] = 1; out.unshift(n.id); n = node(cloud, n.parent); }
    return out;
  }
  function depthOf(cloud, id) { return ancestry(cloud, id).length; } /* subject = 1 */
  function subjectOf(cloud, id) { var a = ancestry(cloud, id); return a.length ? cloud.nodes[a[0]] : null; }
  function trail(cloud, id, sep) { return ancestry(cloud, id).map(function (x) { return cloud.nodes[x].label; }).join(sep || " > "); }
  function isAncestor(cloud, maybe, id) { return ancestry(cloud, id).indexOf(maybe) >= 0; }

  function newId(cloud) { cloud.seq = (cloud.seq || 0) + 1; return "n" + cloud.seq; }

  function addNode(cloud, o) {
    var id = newId(cloud);
    var n = {
      id: id, label: cleanLabel(o.label), key: norm(o.label), parent: o.parent || null,
      weight: o.ghost ? 0 : (o.weight == null ? 1 : o.weight), mastery: 0, ghost: Boolean(o.ghost),
      born: o.born == null ? Date.now() : o.born, touched: o.born || 0, cards: [], opened: false,
      spent: 0, engaged: 0, end: false
    };
    if (!n.parent) n.hue = HUES[subjects(cloud).length % HUES.length];
    cloud.nodes[id] = n;
    cloud.order.push(id);
    return n;
  }

  function removeNode(cloud, id) {
    delete cloud.nodes[id];
    cloud.order = cloud.order.filter(function (x) { return x !== id; });
    all(cloud).forEach(function (n) {
      if (n.path) { n.path.ids = n.path.ids.filter(function (x) { return x !== id; }); if (n.path.next === id) n.path.next = null; }
      if (n.fork) { var i = n.fork.ids.indexOf(id); if (i >= 0) { n.fork.ids.splice(i, 1); n.fork.why.splice(i, 1); } if (n.fork.picked === id) n.fork.picked = null; if (n.fork.ids.length < 2) delete n.fork; }
    });
    if (cloud.next === id) cloud.next = null;
  }

  /* On a path or offered as a fork choice: such ghosts are kept when room is needed. */
  function onSomePath(cloud, id) { return all(cloud).some(function (n) { return (n.path && n.path.ids.indexOf(id) >= 0) || (n.fork && n.fork.ids.indexOf(id) >= 0); }); }
  function hasChildren(cloud, id) { return cloud.order.some(function (x) { var n = cloud.nodes[x]; return n && n.parent === id; }); }

  /* ---------- lookup ---------- */
  function findSubject(cloud, label) {
    var k = norm(label);
    if (!k) return null;
    var ss = subjects(cloud), i;
    for (i = 0; i < ss.length; i++) if (ss[i].key === k) return ss[i];
    for (i = 0; i < ss.length; i++) { var al = SUBJECT_ALIASES[ss[i].key]; if (al && al.indexOf(k) >= 0) return ss[i]; }
    /* "Science & Nature" vs "Science": first word match on multi-word subjects */
    for (i = 0; i < ss.length; i++) { var a = ss[i].key.split(" ")[0], b = k.split(" ")[0]; if (a.length > 3 && a === b) return ss[i]; }
    return null;
  }

  /* A topic (any depth) by label; prefers one inside `withinId`'s subject, then the shallowest anywhere. */
  function findTopic(cloud, label, withinId) {
    var k = norm(label);
    if (!k) return null;
    var hits = all(cloud).filter(function (n) { return n.parent && n.key === k; });
    if (!hits.length) return null;
    if (withinId) {
      var subj = subjectOf(cloud, withinId);
      var inside = hits.filter(function (n) { return subj && subjectOf(cloud, n.id) === subj; });
      if (inside.length) hits = inside;
    }
    hits.sort(function (a, b) { return depthOf(cloud, a.id) - depthOf(cloud, b.id); });
    return hits[0];
  }

  /* Exact subject, then exact topic, then alias / first-word subject. Never creates. */
  function findAny(cloud, label) {
    var k = norm(label);
    if (!k) return null;
    var s = subjects(cloud).filter(function (n) { return n.key === k; })[0];
    return s || findTopic(cloud, label) || findSubject(cloud, label);
  }

  /* ---------- growth ---------- */
  /* Children of a full node make room by dropping their oldest ghost leaf that is not on a learning path. */
  function makeRoom(cloud, pid, ghostsOnly, protect) {
    var kids = childrenOf(cloud, pid);
    var ghosts = kids.filter(function (k) { return k.ghost; });
    var needGhostRoom = ghostsOnly && ghosts.length >= LIMITS.ghostsPerNode;
    if (kids.length < LIMITS.children && !needGhostRoom) return true;
    var drop = ghosts.filter(function (g) { return !hasChildren(cloud, g.id) && !onSomePath(cloud, g.id) && !g.cards.length && !(protect && protect.indexOf(g.id) >= 0); })[0];
    if (!drop) return false;
    removeNode(cloud, drop.id);
    return true;
  }

  /* Keeps the stored tree under the node cap: oldest free ghost leaves first, then the lightest old leaves. Never a node with children. */
  function prune(cloud) {
    var guard = 0;
    while (cloud.order.length > LIMITS.nodes && guard++ < 1000) {
      var leaves = all(cloud).filter(function (n) { return n.parent && !hasChildren(cloud, n.id) && !n.cards.length && n.id !== cloud.next && !inDeck(cloud, n.id); });
      var ghosts = leaves.filter(function (n) { return n.ghost && !onSomePath(cloud, n.id); });
      if (!ghosts.length) ghosts = leaves.filter(function (n) { return n.ghost; });
      if (ghosts.length) { removeNode(cloud, ghosts[0].id); continue; }
      leaves.sort(function (a, b) { return a.weight - b.weight || a.touched - b.touched; });
      if (!leaves.length) break;
      removeNode(cloud, leaves[0].id);
    }
  }

  var SIGNAL = {
    explored: { w: 1, m: 0.05 },
    strength: { w: 1, m: 0.2 },
    struggle: { w: 1, m: -0.1 },
    curious: { w: 0.5, m: 0 }
  };

  /* Where a topic goes: the named subject or topic, else a new subject (under the cap), else "Curiosities". */
  function resolveParent(cloud, label, t, res) {
    var p = findAny(cloud, label);
    if (p) return p;
    var plabel = cleanLabel(label);
    if (plabel && norm(plabel) !== norm(cloud.name) && subjects(cloud).length < LIMITS.subjects) {
      p = addNode(cloud, { label: plabel, parent: null, weight: 1, born: t });
      res.parentsCreated.push(p.id);
      return p;
    }
    return findSubject(cloud, "Curiosities") || (subjects(cloud).length < LIMITS.subjects ? addNode(cloud, { label: "Curiosities", parent: null, weight: 1, born: t }) : subjects(cloud)[0]);
  }

  function bumpAncestors(cloud, id, amount, t) {
    var a = ancestry(cloud, id); a.pop();
    a.reverse().forEach(function (x, i) { var n = cloud.nodes[x]; n.weight += amount / (i + 1); n.touched = t; });
  }

  /*
   * Applies the companion's topics. Returns { created, promoted, strengthened, parentsCreated } (node ids),
   * which the views use to highlight what grew.
   */
  function applyTopics(cloud, topics, t) {
    t = now_(t);
    var res = { created: [], promoted: [], strengthened: [], parentsCreated: [] };
    (Array.isArray(topics) ? topics : []).slice(0, 3).forEach(function (tp) {
      if (!tp) return;
      var label = cleanLabel(tp.name);
      if (!label || norm(label) === norm(cloud.name)) return;
      var sig = SIGNAL[tp.signal] || SIGNAL.explored;
      var subj = subjects(cloud).filter(function (s) { return s.key === norm(label); })[0];
      if (subj) { subj.weight += sig.w * 0.5; subj.touched = t; res.strengthened.push(subj.id); return; }
      var hint = findAny(cloud, tp.parent);
      var n = findTopic(cloud, label, hint ? hint.id : null);
      var parent;
      if (!n) {
        parent = resolveParent(cloud, tp.parent, t, res);
        if (!makeRoom(cloud, parent.id, false)) { parent.weight += 0.5; parent.touched = t; res.strengthened.push(parent.id); return; }
        n = addNode(cloud, { label: label, parent: parent.id, weight: 0, born: t });
        res.created.push(n.id);
      } else if (n.ghost) {
        n.ghost = false; n.born = t; res.promoted.push(n.id);
      } else {
        res.strengthened.push(n.id);
      }
      n.weight += sig.w;
      n.mastery = clamp01(n.mastery + sig.m);
      if (tp.signal === "struggle") n.lastStruggle = t;
      n.touched = t;
      bumpAncestors(cloud, n.id, 0.25, t);
    });
    prune(cloud);
    if (res.created.length + res.promoted.length + res.strengthened.length + res.parentsCreated.length) cloud.rev += 1;
    return res;
  }

  /*
   * Related, unexplored topics as ghosts. Each goes under its named subject or topic; when that is unknown it falls back
   * to the subject of `fallbackId` (the node the learner tapped). Ghosts never create subjects.
   * Returns { added: [ids], dupes, unplaced }.
   */
  function addGhosts(cloud, ghosts, t, fallbackId) {
    t = now_(t);
    var out = { added: [], dupes: 0, unplaced: 0 };
    var fallback = fallbackId ? subjectOf(cloud, fallbackId) : null;
    (Array.isArray(ghosts) ? ghosts : []).slice(0, 3).forEach(function (g) {
      if (!g) return;
      var label = cleanLabel(g.name);
      if (!label || norm(label) === norm(cloud.name)) { out.unplaced += 1; return; }
      if (findTopic(cloud, label) || subjects(cloud).some(function (s) { return s.key === norm(label); })) { out.dupes += 1; return; }
      var parent = findAny(cloud, g.parent) || fallback;
      if (!parent || !makeRoom(cloud, parent.id, true)) { out.unplaced += 1; return; }
      out.added.push(addNode(cloud, { label: label, parent: parent.id, ghost: true, born: t }).id);
    });
    prune(cloud);
    if (out.added.length) cloud.rev += 1;
    return out;
  }

  /*
   * An ordered learning path of subtopics for one node, one level at a time. Steps that already exist inside this branch
   * are reused; a topic that already lives elsewhere on the map is skipped (no duplicates); new ones become ghost children.
   * Returns { ids, added, next }.
   */
  function applyPath(cloud, id, steps, nextLabel, t) {
    t = now_(t);
    var n = node(cloud, id);
    var out = { ids: [], added: [], next: null };
    if (!n) return out;
    var anc = ancestry(cloud, id).map(function (x) { return cloud.nodes[x].key; });
    (Array.isArray(steps) ? steps : []).forEach(function (s) {
      if (out.ids.length >= LIMITS.pathSteps) return;
      var label = cleanLabel(s && typeof s === "object" ? s.name : s);
      var k = norm(label);
      if (!k || k === norm(cloud.name) || anc.indexOf(k) >= 0) return;
      var hit = childrenOf(cloud, id).filter(function (c) { return c.key === k; })[0];
      if (!hit) {
        /* already somewhere else on the map: reuse it only if it sits inside this branch, otherwise leave it where it is */
        var other = findTopic(cloud, label, id);
        if (other && isAncestor(cloud, id, other.id)) hit = other;
        else if (other) return;
      }
      if (!hit) {
        if (!makeRoom(cloud, id, true, out.ids)) return;
        hit = addNode(cloud, { label: label, parent: id, ghost: true, born: t });
        out.added.push(hit.id);
      }
      if (out.ids.indexOf(hit.id) < 0) out.ids.push(hit.id);
    });
    if (!out.ids.length) return out;
    var want = norm(nextLabel);
    var pick = out.ids.filter(function (x) { return cloud.nodes[x].key === want && cloud.nodes[x].mastery < MASTERED; })[0];
    n.path = { ids: out.ids, next: pick || null, at: t };
    out.next = nextFor(cloud, id);
    n.path.next = out.next && out.ids.indexOf(out.next) >= 0 ? out.next : n.path.next;
    cloud.next = out.next;
    prune(cloud);
    cloud.rev += 1;
    return out;
  }

  /*
   * The recommended next topic from here: this node's path (the suggested step if not yet mastered, else the first
   * unmastered step), else the next unmastered step on the paths above it. null when there is nothing left to suggest.
   */
  function nextFor(cloud, id) {
    var n = node(cloud, id);
    if (!n) return null;
    var open = function (x) { var m = cloud.nodes[x]; return m && m.mastery < MASTERED && x !== id; };
    if (n.fork && n.fork.picked && open(n.fork.picked)) return n.fork.picked;
    if (!n.end && n.path && n.path.ids.length) {
      if (n.path.next && open(n.path.next)) return n.path.next;
      var first = n.path.ids.filter(open)[0];
      if (first) return first;
    }
    var cur = n, guard = 0;
    while (cur && cur.parent && guard++ < 200) {
      var p = cloud.nodes[cur.parent];
      if (p && p.path) {
        var i = p.path.ids.indexOf(cur.id);
        var rest = p.path.ids.slice(i + 1).concat(p.path.ids.slice(0, Math.max(0, i))).filter(open);
        if (rest.length) return rest[0];
      }
      cur = p;
    }
    return null;
  }

  /* Lesson engagement: "open" (first read), "got" (learner says they've got it), "tricky". Returns ids that changed. */
  function engage(cloud, id, kind, t) {
    t = now_(t);
    var n = node(cloud, id);
    if (!n) return { changed: [], promoted: false, next: null };
    if (kind === "open" && n.opened && !n.ghost) return { changed: [], promoted: false, next: nextFor(cloud, id) };
    var promoted = false;
    if (n.ghost) { n.ghost = false; n.born = t; promoted = true; n.weight = Math.max(n.weight, 1); }
    if (kind === "open") { if (!n.opened) { n.opened = true; n.mastery = clamp01(n.mastery + 0.05); n.weight += 0.5; } }
    else if (kind === "got") { n.mastery = clamp01(Math.max(n.mastery + 0.3, MASTERED)); n.weight += 0.5; n.lastStruggle = undefined; }
    else if (kind === "tricky") { n.mastery = clamp01(n.mastery - 0.05); n.lastStruggle = t; n.weight += 0.25; }
    n.touched = t;
    n.engaged = (n.engaged || 0) + 1;
    bumpAncestors(cloud, id, kind === "got" ? 0.3 : 0.1, t);
    var next = nextFor(cloud, id);
    cloud.next = next;
    cloud.rev += 1;
    return { changed: [id], promoted: promoted, next: next };
  }

  function attachCard(cloud, card, t) {
    t = now_(t);
    var res = applyTopics(cloud, [{ name: card.topic, parent: card.parent, signal: "explored" }], t);
    var n = findTopic(cloud, card.topic, (findAny(cloud, card.parent) || {}).id) || findSubject(cloud, card.topic);
    var c = { id: "c" + t.toString(36) + Math.floor(hash(card.title + t) * 1e4), title: String(card.title).slice(0, 60), body: String(card.body).slice(0, 700), node: n ? n.id : null, at: t };
    cloud.cards.push(c);
    if (n) n.cards.push(c.id);
    while (cloud.cards.length > LIMITS.cards) {
      var old = cloud.cards.shift();
      var on = cloud.nodes[old.node];
      if (on) on.cards = on.cards.filter(function (x) { return x !== old.id; });
    }
    var path = n && !n.path && Array.isArray(card.path) && card.path.length ? applyPath(cloud, n.id, card.path, card.next, t) : null;
    return { card: c, grew: res, path: path };
  }

  function cardsFor(cloud, id) { return cloud.cards.filter(function (c) { return c.node === id; }); }

  /* ---------- summaries for the prompts ---------- */
  function tag(n) {
    if (n.ghost) return n.label + " (ghost)";
    var t = n.mastery >= MASTERED ? ", strong" : (n.lastStruggle ? ", found hard" : "");
    return n.label + " (" + Math.round(n.weight * 10) / 10 + t + ")";
  }
  /* Compact text: strongest subjects first, a few topics each, nested two levels deeper in braces. */
  function summarize(cloud, maxChars) {
    maxChars = maxChars || 1800;
    var ix = index(cloud);
    var kids = function (id, max) {
      return (ix[id] || []).map(function (x) { return cloud.nodes[x]; }).sort(function (a, b) { return b.weight - a.weight || (a.ghost - b.ghost); }).slice(0, max);
    };
    var branch = function (n, depth) {
      var ks = depth < 3 ? kids(n.id, depth === 1 ? 8 : 5) : [];
      return tag(n) + (ks.length ? " {" + ks.map(function (k) { return branch(k, depth + 1); }).join(", ") + "}" : "");
    };
    var lines = subjects(cloud).slice().sort(function (a, b) { return b.weight - a.weight; }).map(function (s) {
      return s.label + " [" + Math.round(s.weight * 10) / 10 + "]: " + kids(s.id, 8).map(function (k) { return branch(k, 2); }).join(", ");
    });
    var out = lines.join("\n");
    return out.length > maxChars ? out.slice(0, maxChars) : out;
  }

  /* What the learner already has under one node (for lessons and paths). */
  function knownUnder(cloud, id) { return childrenOf(cloud, id).slice(0, LIMITS.children).map(function (n) { return n.label; }); }
  function subjectLabels(cloud) { return subjects(cloud).map(function (p) { return p.label; }); }

  /* ---------- look ---------- */
  /* Colours: the subject's hue; each level down and each sibling a slightly different shade of it; ghosts pale. */
  function hueOf(cloud, id) {
    var a = ancestry(cloud, id);
    var s = cloud.nodes[a[0]];
    return s && s.hue != null ? s.hue : 30;
  }
  function colorOf(cloud, n) {
    if (!n) return "hsl(30, 30%, 22%)";
    var a = ancestry(cloud, n.id);
    var h = hueOf(cloud, n.id);
    if (!n.parent) return "hsl(" + h + ", 52%, 50%)";
    var i = Math.floor(hash(n.key) * 4);
    var light = 34 + (((a.length - 2) * 6 + i * 5) % 26);
    return n.ghost ? "hsla(" + h + ", 35%, 55%, 0.55)" : "hsl(" + h + ", 46%, " + light + "%)";
  }

  /*
   * Card colour: every card starts sepia and moves toward its subject's hue as it grows (stage 0 to 4).
   * The only place card colour is worked out; the deck and any card design read it from here.
   */
  var SEPIA = 34;
  function mixHue(a, b, t) { var d = ((b - a + 540) % 360) - 180; return Math.round((a + d * t + 360) % 360); }
  function evolveColor(hue, stage) {
    var st = Math.max(0, Math.min(4, Math.round(Number(stage) || 0))) / 4;
    var h = mixHue(SEPIA, hue == null ? SEPIA : hue, st);
    var sat = Math.round(20 + 52 * st), light = Math.round(36 + 6 * st);
    return {
      stage: st * 4, hue: h,
      ink: "hsl(" + h + ", " + sat + "%, " + light + "%)",
      soft: "hsla(" + h + ", " + sat + "%, " + light + "%, " + (0.2 + 0.25 * st).toFixed(2) + ")",
      wash: "hsla(" + h + ", " + (sat + 10) + "%, 62%, " + (0.03 + 0.17 * st).toFixed(2) + ")"
    };
  }
  function cardColor(cloud, id) {
    var g = growthOf(cloud, id), e = deckEntry(cloud, id);
    return evolveColor(cloud.nodes[id] ? hueOf(cloud, id) : e ? e.hue : SEPIA, g ? g.stage : e ? e.best : 0);
  }

  /* Size of a level in the layout: each level down is 0.6x the one above, so the tree can keep branching. */
  function levelScale(depth) { return Math.pow(0.6, Math.max(0, depth - 1)); }

  /*
   * Deterministic 3D layout: subjects on a sphere; every child sits on a small cone pointing away from its parent,
   * one level smaller each step. Path steps fan out in their learning order.
   */
  function layout(cloud) {
    var pos = { root: { x: 0, y: 0, z: 0, d: 0 } };
    var ix = index(cloud);
    var ss = ix[""] || [];
    var N = Math.max(ss.length, 6);
    var golden = Math.PI * (3 - Math.sqrt(5));
    var stack = [];
    ss.forEach(function (id, i) {
      var y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), th = golden * i;
      var p = { x: Math.cos(th) * r, y: y * 0.8, z: Math.sin(th) * r, d: 1 };
      pos[id] = p;
      stack.push({ id: id, dir: unit(p) });
    });
    var guard = 0;
    while (stack.length && guard++ < 100000) {
      var cur = stack.pop(), P = pos[cur.id], kidsIds = ix[cur.id] || [];
      if (!kidsIds.length) continue;
      var n = cloud.nodes[cur.id];
      var order = n.path ? n.path.ids.filter(function (x) { return kidsIds.indexOf(x) >= 0; }) : [];
      var basis = perp(cur.dir);
      var step = 0.42 * levelScale(P.d + 1) / 0.6;
      var a0 = hash(n.key + "fan") * Math.PI * 2;
      kidsIds.forEach(function (cid) {
        var c = cloud.nodes[cid];
        var oi = order.indexOf(cid);
        var a = oi >= 0 ? a0 + oi * (Math.PI * 2 / Math.max(order.length + 1, 5)) : hash(c.key + "a") * Math.PI * 2;
        var theta = 0.7 + (c.ghost ? 0.2 : 0) + hash(c.key + "t") * 0.25;
        var s = step * (c.ghost ? 1.12 : 1);
        var off = {
          x: cur.dir.x * Math.cos(theta) + (basis[0].x * Math.cos(a) + basis[1].x * Math.sin(a)) * Math.sin(theta),
          y: cur.dir.y * Math.cos(theta) + (basis[0].y * Math.cos(a) + basis[1].y * Math.sin(a)) * Math.sin(theta),
          z: cur.dir.z * Math.cos(theta) + (basis[0].z * Math.cos(a) + basis[1].z * Math.sin(a)) * Math.sin(theta)
        };
        var q = { x: P.x + off.x * s, y: P.y + off.y * s, z: P.z + off.z * s, d: P.d + 1 };
        pos[cid] = q;
        stack.push({ id: cid, dir: unit({ x: q.x - P.x, y: q.y - P.y, z: q.z - P.z }) });
      });
    }
    return pos;
  }
  function unit(v) { var l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; }
  function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
  function perp(d) {
    var ref = Math.abs(d.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    var u = unit(cross(d, ref));
    return [u, unit(cross(d, u))];
  }

  /* ---------- seeds ---------- */
  function seedLabel(s) { return typeof s === "string" ? s : s.label; }
  /* Adds a starter branch. With `onlyMissing`, existing nodes are kept as they are and new seeds arrive as ghosts. */
  function plant(cloud, spec, parentId, t, onlyMissing) {
    var label = seedLabel(spec), ghost = typeof spec === "object" && spec.ghost;
    var k = norm(label);
    var n = parentId ? childrenOf(cloud, parentId).filter(function (c) { return c.key === k; })[0] : subjects(cloud).filter(function (c) { return c.key === k; })[0];
    if (!n && onlyMissing && parentId) n = findTopic(cloud, label, parentId);
    if (!n) {
      if (parentId && !makeRoom(cloud, parentId, true)) return null;
      if (!parentId && subjects(cloud).length >= LIMITS.subjects) return null;
      n = addNode(cloud, { label: label, parent: parentId, ghost: Boolean(parentId) && (ghost || onlyMissing), weight: 1, born: onlyMissing ? t : 0 });
    }
    var kids = (typeof spec === "object" && spec.children) || [];
    kids.forEach(function (c) { plant(cloud, c, n.id, t, onlyMissing); });
    if (typeof spec === "object" && spec.path && !n.path) {
      var ids = spec.path.map(function (l) { var c = childrenOf(cloud, n.id).filter(function (x) { return x.key === norm(l); })[0] || findTopic(cloud, l, n.id); return c && c.id; }).filter(Boolean);
      if (ids.length) n.path = { ids: ids, next: null, at: t };
    }
    return n;
  }

  function create(name, t) {
    t = now_(t);
    var cloud = { v: VERSION, name: cleanLabel(name) || "Me", seq: 0, rev: 0, nodes: {}, order: [], cards: [], created: t, next: null, deck: [], draws: [], sessions: 0 };
    STARTERS.forEach(function (s) { plant(cloud, s, null, 0, false); });
    var math = findSubject(cloud, "Math");
    cloud.next = math ? nextFor(cloud, math.id) : null;
    return cloud;
  }

  /*
   * Time spent on a node (seconds, e.g. while its lesson is open). Kept per node so later features (cards that
   * evolve with time, a deck) can read it; it does not change the shape of the cloud, so rev is not bumped.
   */
  function track(cloud, id, seconds, t) {
    var n = node(cloud, id);
    var add = Math.round(Math.min(Math.max(Number(seconds) || 0, 0), 1800));
    if (!n || !add) return n ? n.spent || 0 : 0;
    n.spent = (n.spent || 0) + add;
    n.seenAt = now_(t);
    return n.spent;
  }

  /* Marks a branch as ending here (no deeper subtopics to map). nextFor then moves on to the steps above it. */
  function markEnd(cloud, id, end) {
    var n = node(cloud, id);
    if (!n || !n.parent) return false;
    n.end = end !== false;
    cloud.rev += 1;
    if (cloud.next === id || !cloud.next) cloud.next = nextFor(cloud, id);
    return true;
  }

  /* Per-node activity in one place: what later features (deck, evolving cards) read. */
  function activity(cloud, id) {
    var n = node(cloud, id);
    if (!n) return null;
    return { spent: n.spent || 0, engaged: n.engaged || 0, mastery: n.mastery, opened: n.opened, end: Boolean(n.end), cards: n.cards.length, subject: (subjectOf(cloud, id) || {}).id || null, hue: hueOf(cloud, id) };
  }

  /* ---------- growth, the deck, forks ---------- */
  /*
   * Growth score: minutes spent + 2 per engagement (lesson opened, got it, still tricky) + 4 x mastery + cards (up to 3).
   * Stages 0..4 at these scores. A card joins the deck for good at GROWTH.join, and its stage never goes back down.
   */
  var GROWTH = { stages: [0, 3, 8, 16, 30], join: 3, names: ["New", "Warming up", "Growing", "Bright", "Full colour"] };
  function scoreOf(n) { return n ? (n.spent || 0) / 60 + 2 * (n.engaged || 0) + 4 * (n.mastery || 0) + Math.min((n.cards || []).length, 3) : 0; }
  function stageFor(score) { var st = 0; for (var i = 1; i < GROWTH.stages.length; i++) if (score >= GROWTH.stages[i]) st = i; return st; }
  function deckEntry(cloud, id) { var d = cloud.deck || []; for (var i = 0; i < d.length; i++) if (d[i].id === id) return d[i]; return null; }
  function inDeck(cloud, id) { return Boolean(deckEntry(cloud, id)); }
  function growthOf(cloud, id) {
    var n = node(cloud, id), e = deckEntry(cloud, id);
    if (!n && !e) return null;
    var score = n ? scoreOf(n) : GROWTH.stages[e.best];
    var stage = Math.max(stageFor(score), e ? e.best : 0), lo = GROWTH.stages[stage], hi = GROWTH.stages[stage + 1];
    return { score: Math.round(score * 10) / 10, stage: stage, name: GROWTH.names[stage], progress: hi == null ? 1 : Math.max(0, Math.min(1, (score - lo) / (hi - lo))), inDeck: Boolean(e) };
  }
  /* Adds every topic past the threshold to the deck (never removes). Keeps each card's best stage and label up to date. Returns ids that joined now. */
  function joinDeck(cloud, t) {
    t = now_(t);
    cloud.deck = cloud.deck || [];
    var joined = [];
    all(cloud).forEach(function (n) {
      if (!n.parent || n.ghost || inDeck(cloud, n.id) || scoreOf(n) < GROWTH.join) return;
      cloud.deck.push({ id: n.id, label: n.label, subject: "", hue: SEPIA, at: t, best: 0 });
      joined.push(n.id);
    });
    cloud.deck.forEach(function (e) {
      var n = cloud.nodes[e.id];
      if (!n) return;
      var s = subjectOf(cloud, n.id);
      e.label = n.label;
      if (s) { e.subject = s.label; e.hue = s.hue == null ? SEPIA : s.hue; }
      e.best = Math.max(e.best || 0, stageFor(scoreOf(n)));
    });
    return joined;
  }
  /* Session draws, for the yearly balance: [day, cardId] pairs, the last 366 days only. */
  function logDraw(cloud, day, ids) {
    cloud.draws = (cloud.draws || []).concat((ids || []).map(function (id) { return [day, id]; }))
      .filter(function (d) { return d[0] > day - 366; }).slice(-LIMITS.draws);
    cloud.sessions = (cloud.sessions || 0) + 1;
    return cloud.draws.length;
  }

  function cleanWhy(v) { return String(v == null ? "" : v).replace(/[<>{}[\]`*_#|\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, LIMITS.whyChars); }
  /*
   * A fork after a lesson: 2 or 3 choices. A choice that already exists anywhere is reused; otherwise "deeper" lands
   * under this topic and "next"/"side" next to it, as ghosts. Fewer than 2 usable choices is not a fork.
   */
  function applyChoices(cloud, id, choices, t) {
    t = now_(t);
    var n = node(cloud, id), out = { ids: [], why: [], added: [] };
    if (!n) return out;
    (Array.isArray(choices) ? choices : []).slice(0, LIMITS.choices).forEach(function (c) {
      var label = cleanLabel(c && c.name), k = norm(label);
      if (!label || k === n.key || k === norm(cloud.name)) return;
      var hit = findTopic(cloud, label, id);
      if (hit && (hit.id === id || out.ids.indexOf(hit.id) >= 0)) return;
      if (!hit) {
        var pid = c.kind === "deeper" || !n.parent ? id : n.parent;
        if (!makeRoom(cloud, pid, true, out.ids)) return;
        hit = addNode(cloud, { label: label, parent: pid, ghost: true, born: t });
        out.added.push(hit.id);
      }
      out.ids.push(hit.id);
      out.why.push(cleanWhy(c.why));
    });
    if (out.ids.length < 2) { out.added.forEach(function (x) { removeNode(cloud, x); }); return { ids: [], why: [], added: [] }; }
    n.fork = { ids: out.ids, why: out.why, picked: null, at: t };
    cloud.rev += 1;
    return out;
  }
  function pickChoice(cloud, id, choiceId) {
    var n = node(cloud, id);
    if (!n || !n.fork || n.fork.ids.indexOf(choiceId) < 0) return false;
    n.fork.picked = choiceId;
    cloud.next = choiceId;
    cloud.rev += 1;
    return true;
  }
  /* A branch has ended when it was marked as an end, or it and every step on its path are mastered. */
  function isTerminal(cloud, id) {
    var n = node(cloud, id);
    if (!n || !n.parent) return false;
    if (n.end) return n.mastery >= MASTERED || !n.path;
    if (n.mastery < MASTERED || !n.path || !n.path.ids.length) return false;
    return n.path.ids.every(function (x) { return !cloud.nodes[x] || cloud.nodes[x].mastery >= MASTERED; });
  }
  /* Other branches, offered only once a branch has ended: unfinished nearby branches first, then one from another subject. Local, no call. */
  function otherBranches(cloud, id, max) {
    max = max || 3;
    var n = node(cloud, id), out = [];
    if (!n) return out;
    var ok = function (x) { var m = cloud.nodes[x]; return m && m.parent && m.mastery < MASTERED && !m.end && x !== id && !isAncestor(cloud, id, x) && ancestry(cloud, id).indexOf(x) < 0 && out.indexOf(x) < 0; };
    ancestry(cloud, id).slice(0, -1).reverse().forEach(function (a) {
      var an = cloud.nodes[a];
      (an.path ? an.path.ids : []).concat(childrenOf(cloud, a).map(function (c) { return c.id; })).forEach(function (x) { if (out.length < max - 1 && ok(x)) out.push(x); });
    });
    var own = (subjectOf(cloud, id) || {}).id;
    subjects(cloud).filter(function (s) { return s.id !== own; }).sort(function (a, b) { return a.weight - b.weight || cloud.order.indexOf(a.id) - cloud.order.indexOf(b.id); })
      .some(function (s) {
        var x = nextFor(cloud, s.id);
        if (!x || !ok(x)) x = (childrenOf(cloud, s.id).filter(function (c) { return ok(c.id); })[0] || {}).id;
        if (x && ok(x)) out.push(x);
        return out.length >= max;
      });
    return out.slice(0, max);
  }

  /* ---------- storage ---------- */
  /*
   * Compact form: one array per node
   * [id, label, parent, flags, weight*10, mastery*100, born(s), touched(s), hue, struggle(s), spent(s), engaged]
   * (flags: 1 ghost, 2 opened, 4 branch ends here). New fields go on the end of the array, so older saves still load.
   * p: paths { id: [stepIds, next, at] }, f: forks { id: [choiceIds, whys, picked, at] },
   * k: the deck [[id, label, subject, hue, joined(s), best stage]], g: draw log [[day, id]], ss: session count.
   * Node.cards and keys are rebuilt on load.
   */
  function serialize(cloud) {
    var s = function (ms) { return ms ? Math.round(ms / 1000) : 0; };
    var paths = {}, forks = {};
    var n = cloud.order.map(function (id) {
      var x = cloud.nodes[id];
      if (x.path && x.path.ids.length) paths[id] = [x.path.ids, x.path.next || 0, s(x.path.at)];
      if (x.fork && x.fork.ids.length) forks[id] = [x.fork.ids, x.fork.why, x.fork.picked || 0, s(x.fork.at)];
      return [id, x.label, x.parent || 0, (x.ghost ? 1 : 0) | (x.opened ? 2 : 0) | (x.end ? 4 : 0), Math.round(x.weight * 10), Math.round(x.mastery * 100), s(x.born), s(x.touched), x.parent ? -1 : (x.hue == null ? 30 : x.hue), s(x.lastStruggle), x.spent || 0, x.engaged || 0];
    });
    return JSON.stringify({ v: VERSION, name: cloud.name, seq: cloud.seq, rev: cloud.rev, created: cloud.created, next: cloud.next || 0, n: n, p: paths, f: forks, cards: cloud.cards,
      k: (cloud.deck || []).map(function (e) { return [e.id, e.label, e.subject, e.hue, s(e.at), e.best || 0]; }), g: cloud.draws || [], ss: cloud.sessions || 0 });
  }

  function finish(c, list, cards, paths, extra) {
    extra = extra || {};
    var nodes = {}, order = [];
    list.forEach(function (n) { if (n && n.id && typeof n.label === "string" && !nodes[n.id]) { nodes[n.id] = n; order.push(n.id); } });
    /* drop orphans and cycles: every chain must reach a subject */
    var ok = {};
    var good = function (id) {
      var seen = {}, cur = nodes[id], chain = [];
      while (cur && !seen[cur.id]) {
        if (ok[cur.id]) break;
        seen[cur.id] = 1; chain.push(cur.id);
        if (!cur.parent) { cur = null; break; }
        cur = nodes[cur.parent];
        if (!cur) return false;
      }
      if (cur && !ok[cur.id]) return false;
      chain.forEach(function (x) { ok[x] = 1; });
      return true;
    };
    order = order.filter(good);
    var out = { v: VERSION, name: c.name, seq: c.seq, rev: c.rev, nodes: {}, order: order, cards: [], created: c.created, next: null };
    order.forEach(function (id) { out.nodes[id] = nodes[id]; });
    var maxSeq = order.reduce(function (m, id) { var k = +String(id).replace(/^\D+/, ""); return Number.isFinite(k) ? Math.max(m, k) : m; }, 0);
    out.seq = Math.max(Number(c.seq) || 0, maxSeq);
    out.cards = (Array.isArray(cards) ? cards : []).filter(function (x) { return x && typeof x.title === "string" && typeof x.body === "string"; }).slice(-LIMITS.cards);
    out.cards.forEach(function (cd) { var on = out.nodes[cd.node]; if (on) on.cards.push(cd.id); else cd.node = null; });
    Object.keys(paths || {}).forEach(function (id) {
      var n = out.nodes[id], p = paths[id];
      if (!n || !p) return;
      var ids = (Array.isArray(p.ids) ? p.ids : p[0] || []).filter(function (x) { return out.nodes[x] && x !== id; }).slice(0, LIMITS.pathSteps);
      if (ids.length) n.path = { ids: ids, next: ids.indexOf(p.next || p[1]) >= 0 ? (p.next || p[1]) : null, at: Number(p.at || p[2] * 1000) || 0 };
    });
    Object.keys(extra.forks || {}).forEach(function (id) {
      var n = out.nodes[id], f = extra.forks[id];
      if (!n || !Array.isArray(f) || !Array.isArray(f[0])) return;
      var ids = [], why = [];
      f[0].forEach(function (x, i) { if (out.nodes[x] && x !== id && ids.indexOf(x) < 0 && ids.length < LIMITS.choices) { ids.push(x); why.push(cleanWhy((f[1] || [])[i])); } });
      if (ids.length >= 2) n.fork = { ids: ids, why: why, picked: ids.indexOf(f[2]) >= 0 ? f[2] : null, at: (Number(f[3]) || 0) * 1000 };
    });
    /* the deck only grows: entries are kept even if their topic is gone (they still show as cards) */
    out.deck = [];
    (Array.isArray(extra.deck) ? extra.deck : []).forEach(function (e) {
      if (!Array.isArray(e) || typeof e[0] !== "string" || out.deck.some(function (d) { return d.id === e[0]; })) return;
      out.deck.push({ id: e[0], label: cleanLabel(e[1]) || "Card", subject: cleanLabel(e[2]), hue: Number.isFinite(e[3]) ? e[3] : SEPIA, at: (Number(e[4]) || 0) * 1000, best: Math.max(0, Math.min(4, Number(e[5]) || 0)) });
    });
    out.draws = (Array.isArray(extra.draws) ? extra.draws : []).filter(function (d) { return Array.isArray(d) && Number.isFinite(d[0]) && typeof d[1] === "string"; }).slice(-LIMITS.draws);
    out.sessions = Math.max(0, Number(extra.sessions) || 0);
    out.next = out.nodes[c.next] ? c.next : null;
    joinDeck(out, Number(c.created) || 0); /* older saves: topics already past the threshold join the deck */
    return out;
  }

  /* Validates stored JSON (v3 or v2, or v1 which is migrated forward without loss); null when unusable. */
  function deserialize(str) {
    var c;
    try { c = typeof str === "string" ? JSON.parse(str) : str; } catch { return null; }
    if (!c || typeof c.name !== "string") return null;
    var base = { name: cleanLabel(c.name) || "Me", seq: Number(c.seq) || 0, rev: Number(c.rev) || 0, created: Number(c.created) || 0, next: c.next || null };
    if ((c.v === 2 || c.v === 3) && Array.isArray(c.n)) {
      var ms = function (s) { return (Number(s) || 0) * 1000; };
      var list = c.n.map(function (a) {
        if (!Array.isArray(a) || typeof a[0] !== "string" || typeof a[1] !== "string") return null;
        return {
          id: a[0], label: cleanLabel(a[1]), key: norm(a[1]), parent: a[2] || null, ghost: Boolean(a[3] & 1), opened: Boolean(a[3] & 2),
          weight: (Number(a[4]) || 0) / 10, mastery: clamp01((Number(a[5]) || 0) / 100), born: ms(a[6]), touched: ms(a[7]),
          hue: a[2] ? undefined : (Number.isFinite(a[8]) && a[8] >= 0 ? a[8] : 30), lastStruggle: a[9] ? ms(a[9]) : undefined, cards: [],
          end: Boolean(a[3] & 4), spent: Math.max(0, Number(a[10]) || 0), engaged: Math.max(0, Number(a[11]) || 0)
        };
      });
      return finish(base, list, c.cards, c.p, { forks: c.f, deck: c.k, draws: c.g, sessions: c.ss });
    }
    if (c.v === 1 && c.nodes && Array.isArray(c.order)) return migrateV1(c, base);
    return null;
  }

  /* v1 (subjects -> topics only, object nodes) -> v2. Everything is kept; the starter seeds that are missing arrive as ghosts. */
  function migrateV1(c, base) {
    var list = c.order.map(function (id) {
      var n = c.nodes[id];
      if (!n || typeof n.label !== "string") return null;
      return {
        id: id, label: cleanLabel(n.label), key: norm(n.label), parent: n.parent || null, ghost: Boolean(n.ghost), opened: false,
        weight: Number(n.weight) || 0, mastery: clamp01(Number(n.mastery) || 0), born: Number(n.born) || 0, touched: Number(n.touched) || 0,
        hue: n.parent ? undefined : (Number.isFinite(n.hue) ? n.hue : 30), lastStruggle: n.lastStruggle || undefined, cards: [],
        spent: 0, engaged: 0, end: false
      };
    });
    var out = finish(base, list, c.cards, {});
    var t = Date.now();
    STARTERS.forEach(function (s) { if (findSubject(out, s.label) && subjects(out).some(function (x) { return x.key === norm(s.label); })) plant(out, s, null, t, true); });
    var math = findSubject(out, "Math");
    out.next = math ? nextFor(out, math.id) : null;
    return out;
  }

  /* Thread persistence: keep the most recent messages only. */
  function trimThread(msgs, max) {
    max = max || 60;
    return (Array.isArray(msgs) ? msgs : []).filter(function (m) { return m && typeof m.text === "string" && /^(user|model|card|grow)$/.test(m.role); }).slice(-max);
  }

  var api = {
    VERSION: VERSION, LIMITS: LIMITS, MASTERED: MASTERED, STARTERS: STARTERS, HUES: HUES,
    create: create, applyTopics: applyTopics, addGhosts: addGhosts, applyPath: applyPath, nextFor: nextFor, engage: engage,
    track: track, markEnd: markEnd, activity: activity, hueOf: hueOf,
    GROWTH: GROWTH, growthOf: growthOf, joinDeck: joinDeck, inDeck: inDeck, deckEntry: deckEntry, logDraw: logDraw,
    evolveColor: evolveColor, cardColor: cardColor, applyChoices: applyChoices, pickChoice: pickChoice, isTerminal: isTerminal, otherBranches: otherBranches, hash: hash,
    attachCard: attachCard, cardsFor: cardsFor, summarize: summarize, knownUnder: knownUnder, subjectLabels: subjectLabels,
    subjects: subjects, childrenOf: childrenOf, ancestry: ancestry, depthOf: depthOf, subjectOf: subjectOf, trail: trail, index: index,
    findSubject: findSubject, findTopic: findTopic, findAny: findAny, norm: norm, cleanLabel: cleanLabel,
    colorOf: colorOf, levelScale: levelScale, layout: layout, serialize: serialize, deserialize: deserialize, trimThread: trimThread
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IkoCloud = api;
})(typeof window !== "undefined" ? window : this);
