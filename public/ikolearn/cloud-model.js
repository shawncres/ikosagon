/*
 * IkoLearn cloud data model (no DOM). The learner's knowledge map as a tree of any depth:
 *   root (first name) -> subjects -> topics -> subtopics -> ... ; ghosts are topics not explored yet.
 * Every node has a stable id ("n12", never reused) and a path of labels from its subject ("Math > Addition > Number Bonds").
 * It starts empty (just the learner's name) and grows procedurally: from the creation call (the first parents a new
 * learner gets, and "what comes next" for a parent), from the structured block the companion appends to each reply,
 * from cards, from lesson paths and from "related topics". Nothing is pre-seeded and no subject names are built in (HUES is colour data only). Nodes keep weight (how much it came up), mastery (0..1, raised by lessons) and an optional ordered
 * learning path of subtopics with a recommended next step.
 * Works in the browser (window.IkoCloud) and in Node (module.exports) so the check script can test it.
 */
(function (root) {
  "use strict";

  var VERSION = 9;
  /* nodes: stored cap (localStorage stays small). children / ghosts: per node. There is no depth limit. */
  /*
   * No fixed count of subjects, children or nodes: the cloud keeps growing. The only ceiling is real bytes (STORE): a
   * cloud whose save passes STORE.softChars first lets go of old unexplored placeholders (never the learner's own
   * topics). `known` / `promptParents` bound what goes into a prompt, not what the cloud holds.
   */
  var STORE = { softChars: 1500000, checkNodes: 3000, warnChars: 4000000, quotaChars: 5000000 };
  var LIMITS = { known: 16, promptParents: 12, ghostsPerNode: 6, pathSteps: 6, cards: 60, labelChars: 32, choices: 3, draws: 3000, whyChars: 80, chain: 4, blurbChars: 140 };
  var MASTERED = 0.6;
  /* Soft spectrum: colour data only. A new subject takes a stable hue from its name (subjectHue), never from a list of subject names. */
  var HUES = [4, 28, 48, 96, 150, 188, 214, 252, 286, 322, 70, 170];

  /* Migration only: the labels the old starter map (v1-v5) planted. Untouched ones are pruned from older saves (pruneSeeds). */
  var OLD_SEEDS = ["Reading & Writing", "Stories", "Vocabulary", "Poetry", "Math", "Counting", "Counting to 20", "Skip Counting", "Number Sense", "Comparing Numbers",
    "Place Value", "Addition", "Adding Within 10", "Number Bonds", "Adding Within 20", "Subtraction", "Multiplication", "Fractions", "Shapes", "Science", "Living Things",
    "Space", "Weather", "People & Places", "History", "Maps", "Cultures", "Art & Music", "Drawing", "Rhythm", "Color Mixing", "Making & Coding", "Building", "Puzzles",
    "Robots", "Computer Science", "Algorithms", "Programming", "How Computers Work", "How AI Works"];

  /* Topics that belong to Computer Science, not Making & Coding (moved once, on load, from older clouds). */
  var CS_TOPICS = ["Coding", "Programming", "Python", "JavaScript", "Scratch", "Java", "Algorithms", "How AI Works", "How Computers Work", "Computers", "Web Pages", "HTML", "Internet", "Data", "Apps", "Code"];

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
      spent: 0, engaged: 0, end: false, correct: 0, heat: 0, heatAt: 0, blurb: "", achievedAt: 0, pending: null, doneAt: 0,
      imp: null, impAt: 0, goal: "", asked: 0,
      /* v7: role among its siblings (core = the main sequence, optional = a side path off one core step), made by a creation call, bridge cached; absorb groundwork */
      role: o.role === "core" || o.role === "optional" ? o.role : "", off: o.off || null, made: Boolean(o.made), bridged: 0, absorbedInto: null, absorbed: [],
      /* v8: merge level (0 = not merged, 1 = I, 2 = II ...), when it last merged, the one-time chain repair */
      ml: 0, mergedAt: 0, repaired: 0,
      /* v9: prerequisites, node ids that should be done first (from the creation call); none by default */
      pre: [],
      /* the card's line drawing (one of MOTIFS, from the creation call); "" = the device picks by keyword (deck.js) */
      motif: ""
    };
    if (!n.parent) {
      n.hue = Number.isFinite(o.hue) && !hueUsed(cloud, o.hue) ? o.hue : subjectHue(cloud, o.label); /* the name the model gave is kept as is */
    }
    cloud.nodes[id] = n;
    cloud.order.push(id);
    return n;
  }

  /*
   * Each subject keeps its own hue (stored on the subject, so a save's colours never change). A new subject's hue comes
   * from its name: a stable hash picks a starting slot in HUES and the first free hue from there is taken, so the same
   * name gets the same colour for every learner (unless that hue is already taken in this cloud). No subject names are
   * built in, and nothing is renamed.
   */
  function hueUsed(cloud, h) { return subjects(cloud).some(function (s) { return s.hue === h; }); }
  function subjectHue(cloud, label) {
    var start = Math.floor(hash(norm(label) || "subject") * HUES.length) % HUES.length;
    for (var i = 0; i < HUES.length; i++) { var h = HUES[(start + i) % HUES.length]; if (!hueUsed(cloud, h)) return h; }
    /* the palette is used up (more than 12 subjects): the free whole hue furthest from every subject's, ties broken
       from the name's slot, so each new subject still reads as its own colour */
    var used = subjects(cloud).map(function (s) { return s.hue; }).filter(Number.isFinite), best = HUES[start], bd = -1;
    for (var k = 0; k < 360; k++) {
      var hh = (HUES[start] + k) % 360, d = 360;
      used.forEach(function (u) { var x = Math.abs(u - hh) % 360; d = Math.min(d, x, 360 - x); });
      if (d > bd) { bd = d; best = hh; }
    }
    return best;
  }

  function removeNode(cloud, id) {
    delete cloud.nodes[id];
    cloud.order = cloud.order.filter(function (x) { return x !== id; });
    all(cloud).forEach(function (n) {
      if (n.path) { n.path.ids = n.path.ids.filter(function (x) { return x !== id; }); if (n.path.next === id) n.path.next = null; }
      if (n.fork) { var i = n.fork.ids.indexOf(id); if (i >= 0) { n.fork.ids.splice(i, 1); n.fork.why.splice(i, 1); } if (n.fork.picked === id) n.fork.picked = null; if (n.fork.ids.length < 2) delete n.fork; }
      if (n.off === id) n.off = null;
      if (n.absorbedInto === id) n.absorbedInto = null;
      if (n.absorbed && n.absorbed.indexOf(id) >= 0) n.absorbed = n.absorbed.filter(function (x) { return x !== id; });
    });
    if (cloud.next === id) cloud.next = null;
    if (cloud.tests) delete cloud.tests[id];
    if (cloud.active === id) cloud.active = null;
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
  /* A node's placeholders make room for a new one by dropping their oldest ghost leaf that is not on a learning path. */
  function makeRoom(cloud, pid, ghostsOnly, protect) {
    var kids = childrenOf(cloud, pid);
    var ghosts = kids.filter(function (k) { return k.ghost; });
    /* no cap on children: only dotted placeholders are limited per node (they make room for each other) */
    if (!ghostsOnly || ghosts.length < LIMITS.ghostsPerNode) return true;
    var drop = ghosts.filter(function (g) { return !hasChildren(cloud, g.id) && !onSomePath(cloud, g.id) && !g.cards.length && !(protect && protect.indexOf(g.id) >= 0); })[0];
    if (!drop) return false;
    removeNode(cloud, drop.id);
    return true;
  }

  /*
   * Keeps the save under STORE.softChars of real bytes (no node count): past it, unexplored placeholder leaves go first,
   * oldest first, those on a learning path last. The learner's own topics (explored, carded, in the deck, with children)
   * are never dropped here; a cloud of only those simply stays, and a full browser store is handled by the app.
   * Cheap below STORE.checkNodes nodes (nothing is measured).
   */
  function freeGhost(cloud, n) { return n.parent && n.ghost && !hasChildren(cloud, n.id) && !n.cards.length && n.id !== cloud.next && !inDeck(cloud, n.id); }
  function prune(cloud, soft) {
    soft = soft || STORE.softChars;
    if (cloud.order.length < STORE.checkNodes && !(soft < STORE.softChars)) return 0;
    var len = serialize(cloud).length, dropped = 0, guard = 0;
    while (len > soft && guard++ < 40) {
      var ghosts = all(cloud).filter(function (n) { return freeGhost(cloud, n); });
      if (!ghosts.length) break;
      ghosts.sort(function (a, b) { return (onSomePath(cloud, a.id) - onSomePath(cloud, b.id)) || (a.born - b.born); });
      var per = Math.max(1, len / cloud.order.length), want = Math.max(1, Math.ceil((len - soft) / per));
      ghosts.slice(0, want).forEach(function (g) { removeNode(cloud, g.id); dropped++; });
      len = serialize(cloud).length;
    }
    return dropped;
  }

  var SIGNAL = {
    explored: { w: 1, m: 0.05 },
    strength: { w: 1, m: 0.2 },
    struggle: { w: 1, m: -0.1 },
    curious: { w: 0.5, m: 0 }
  };

  /* Where a topic goes: the named subject or topic, else a new subject (there is no cap on subjects). No fixed catch-all subject: every parent comes from the learner's own topics. */
  function resolveParent(cloud, label, t, res) {
    var p = findAny(cloud, label);
    if (p) return p;
    var plabel = cleanLabel(label);
    if (plabel && norm(plabel) !== norm(cloud.name)) {
      p = addNode(cloud, { label: plabel, parent: null, weight: 1, born: t });
      res.parentsCreated.push(p.id);
      return p;
    }
    return subjects(cloud)[0];
  }

  /*
   * A chain of broader topics, broadest first (e.g. Computer Science, Programming, Python), so a new topic lands at the
   * right depth with explicit parent -> child links. The deepest link that already exists anywhere is reused; the links
   * below it are created. Returns the deepest node, or null for an empty chain.
   */
  function placeChain(cloud, labels, t, res) {
    var list = [], keys = [];
    (Array.isArray(labels) ? labels : []).forEach(function (l) {
      var c = cleanLabel(l), k = norm(c);
      if (c && k !== norm(cloud.name) && keys.indexOf(k) < 0) { list.push(c); keys.push(k); }
    });
    list = list.slice(-LIMITS.chain); keys = keys.slice(-LIMITS.chain);
    if (!list.length) return null;
    var cur = null, at = -1;
    for (var i = list.length - 1; i >= 0; i--) {
      cur = i === 0 ? findAny(cloud, list[0]) : findTopic(cloud, list[i]);
      if (cur) { at = i; break; }
    }
    /* a seeded (dotted) link that now carries a topic becomes explored */
    if (cur && cur.ghost) { cur.ghost = false; cur.born = t; cur.weight = Math.max(cur.weight, 0.5); if (res) res.promoted.push(cur.id); }
    var start = at + 1;
    if (!cur) {
      cur = resolveParent(cloud, list[0], t, res);
      start = cur.key === keys[0] || findSubject(cloud, list[0]) === cur ? 1 : 0;
    }
    for (var j = start; j < list.length; j++) {
      var k = keys[j], hit = null;
      childrenOf(cloud, cur.id).forEach(function (c) { if (!hit && c.key === k) hit = c; });
      if (!hit) {
        if (!makeRoom(cloud, cur.id, false)) break;
        hit = addNode(cloud, { label: list[j], parent: cur.id, weight: 0.5, born: t });
        res.created.push(hit.id);
      } else if (hit.ghost) { hit.ghost = false; hit.born = t; res.promoted.push(hit.id); }
      cur = hit;
    }
    return cur;
  }

  /*
   * A short chain deepened from the learner's own map: when what they wrote names a topic already on their map
   * ("How do sets work in Python?" with Python on the map) and that topic's chain starts with the links given, the
   * new topic goes under it. Only ever extends a chain inside the same subject; no tables, no call. null when nothing fits.
   */
  function deepenChain(cloud, links, label, said) {
    var text = " " + norm(said) + " ", k = norm(label), base = (links || []).map(norm);
    if (!base.length || text.length < 3) return null;
    var best = null;
    all(cloud).forEach(function (n) {
      if (!n.parent || n.key === k || text.indexOf(" " + n.key + " ") < 0) return;
      var ch = ancestry(cloud, n.id).map(function (x) { return cloud.nodes[x]; });
      if (ch.length <= base.length || ch.some(function (c) { return c.key === k; })) return;
      if (!base.every(function (b, i) { return ch[i].key === b || (i === 0 && findSubject(cloud, links[0]) === ch[0]); })) return;
      if (!best || ch.length > best.length) best = ch;
    });
    return best ? best.map(function (c) { return c.label; }) : null;
  }

  function bumpAncestors(cloud, id, amount, t) {
    var a = ancestry(cloud, id); a.pop();
    a.reverse().forEach(function (x, i) { var n = cloud.nodes[x]; n.weight += amount / (i + 1); n.touched = t; });
  }

  /*
   * Applies the companion's topics. Returns { created, promoted, strengthened, parentsCreated } (node ids),
   * which the views use to highlight what grew.
   */
  /* said: what the learner just wrote (optional), used only to deepen a short chain from their own map. */
  function applyTopics(cloud, topics, t, said) {
    t = now_(t);
    var res = { created: [], promoted: [], strengthened: [], parentsCreated: [] };
    (Array.isArray(topics) ? topics : []).slice(0, 3).forEach(function (tp) {
      if (!tp) return;
      var label = cleanLabel(tp.name);
      if (!label || norm(label) === norm(cloud.name)) return;
      var sig = SIGNAL[tp.signal] || SIGNAL.explored;
      var subj = subjects(cloud).filter(function (s) { return s.key === norm(label); })[0];
      if (subj) { subj.weight += sig.w * 0.5; subj.touched = t; res.strengthened.push(subj.id); return; }
      /* placed by the orchestrator (chat placement, checked on the device): a new branch under the learner's name ... */
      if (tp.asSubject && !findTopic(cloud, label)) {
        var sn = addNode(cloud, { label: label, parent: null, weight: 1, born: t });
        sn.weight += sig.w * 0.5; sn.touched = t; warm(sn, HEAT.chat * sig.w, t);
        if (tp.blurb) setBlurb(cloud, sn.id, tp.blurb);
        res.parentsCreated.push(sn.id);
        return;
      }
      /* ... or right under a given node (by id: never a same-named node elsewhere) */
      var under = tp.under ? node(cloud, tp.under) : null;
      var hint = under || findAny(cloud, tp.parent);
      var n = findTopic(cloud, label, hint ? hint.id : null);
      var parent;
      if (!n && under) {
        if (!makeRoom(cloud, under.id, false)) { under.weight += 0.5; under.touched = t; res.strengthened.push(under.id); return; }
        if (under.ghost) { under.ghost = false; under.born = t; res.promoted.push(under.id); }
        n = addNode(cloud, { label: label, parent: under.id, weight: 0, born: t });
        res.created.push(n.id);
      } else if (!n) {
        /* an explicit chain (from chat or a card) builds the missing links between the subject and this topic */
        var links = (Array.isArray(tp.chain) ? tp.chain.slice(0, LIMITS.chain) : []);
        if (links.length && tp.parent && norm(links[links.length - 1]) !== norm(tp.parent)) links.push(tp.parent);
        /* a short chain: deepen it from a topic on the learner's map that they named (no call) */
        if (links.length <= 1 && said) links = deepenChain(cloud, links.length ? links : [tp.parent], label, said) || links;
        links = links.filter(function (l) { return norm(l) !== norm(label); });
        /* nothing names a subject above it: the topic is a subject of its own, under the learner's name (never a
           fixed catch-all, never the last branch) */
        if (!links.length && !cleanLabel(tp.parent)) {
          var own = addNode(cloud, { label: label, parent: null, weight: 1, born: t });
          own.weight += sig.w * 0.5; own.touched = t; warm(own, HEAT.chat * sig.w, t);
          if (tp.blurb) setBlurb(cloud, own.id, tp.blurb);
          res.parentsCreated.push(own.id);
          return;
        }
        parent = (links.length > 1 && placeChain(cloud, links, t, res)) || resolveParent(cloud, links.length ? links[0] : tp.parent, t, res);
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
      if (tp.blurb && !n.blurb) setBlurb(cloud, n.id, tp.blurb); /* its description, written in the same call (an existing one is kept) */
      n.touched = t;
      warm(n, HEAT.chat * sig.w, t);
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
      var gn = addNode(cloud, { label: label, parent: parent.id, ghost: true, born: t });
      if (g.blurb) setBlurb(cloud, gn.id, g.blurb);
      out.added.push(gn.id);
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
    out.ids.forEach(function (x) { var k = cloud.nodes[x]; if (k.parent === id && k.role !== "optional") k.role = "core"; }); /* a path is the core sequence */
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
    /* re-opening a lesson changes nothing on the map, but it is use: it warms the topic for the top 10 */
    if (kind === "open" && n.opened && !n.ghost) { warm(n, HEAT.open, t); return { changed: [], promoted: false, next: nextFor(cloud, id) }; }
    var promoted = false;
    if (n.ghost) { n.ghost = false; n.born = t; promoted = true; n.weight = Math.max(n.weight, 1); }
    if (kind === "open") { if (!n.opened) { n.opened = true; n.mastery = clamp01(n.mastery + 0.05); n.weight += 0.5; } }
    else if (kind === "got") { n.mastery = clamp01(Math.max(n.mastery + 0.3, MASTERED)); n.weight += 0.5; n.lastStruggle = undefined; }
    else if (kind === "tricky") { n.mastery = clamp01(n.mastery - 0.05); n.lastStruggle = t; n.weight += 0.25; }
    n.touched = t;
    n.engaged = (n.engaged || 0) + 1;
    warm(n, HEAT[kind] || 0, t);
    bumpAncestors(cloud, id, kind === "got" ? 0.3 : 0.1, t);
    var next = nextFor(cloud, id);
    cloud.next = next;
    cloud.rev += 1;
    return { changed: [id], promoted: promoted, next: next };
  }

  function attachCard(cloud, card, t) {
    t = now_(t);
    var res = applyTopics(cloud, [{ name: card.topic, parent: card.parent, chain: card.chain, signal: "explored" }], t);
    var n = findTopic(cloud, card.topic, (findAny(cloud, card.parent) || {}).id) || findSubject(cloud, card.topic);
    var c = { id: "c" + t.toString(36) + Math.floor(hash(card.title + t) * 1e4), title: String(card.title).slice(0, 60), body: String(card.body).slice(0, 700), node: n ? n.id : null, at: t };
    cloud.cards.push(c);
    if (n) { n.cards.push(c.id); warm(n, HEAT.card, t); if (!n.blurb) setBlurb(cloud, n.id, c.body); }
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
  function summarize(cloud, maxChars, only) {
    maxChars = maxChars || 1800;
    var ix = index(cloud);
    var kids = function (id, max) {
      return (ix[id] || []).map(function (x) { return cloud.nodes[x]; }).sort(function (a, b) { return b.weight - a.weight || (a.ghost - b.ghost); }).slice(0, max);
    };
    var branch = function (n, depth) {
      var ks = depth < 3 ? kids(n.id, depth === 1 ? 8 : 5) : [];
      return tag(n) + (ks.length ? " {" + ks.map(function (k) { return branch(k, depth + 1); }).join(", ") + "}" : "");
    };
    var lines = subjects(cloud).filter(function (s) { return !only || only.indexOf(s.id) >= 0; }).sort(function (a, b) { return only ? only.indexOf(a.id) - only.indexOf(b.id) : b.weight - a.weight; }).map(function (s) {
      return s.label + " [" + Math.round(s.weight * 10) / 10 + "]: " + kids(s.id, 8).map(function (k) { return branch(k, 2); }).join(", ");
    });
    var out = lines.join("\n");
    return out.length > maxChars ? out.slice(0, maxChars) : out;
  }

  /* What the learner already has under one node (for lessons and paths). */
  function knownUnder(cloud, id) { return childrenOf(cloud, id).slice(0, LIMITS.known).map(function (n) { return n.label; }); }
  function subjectLabels(cloud) { return subjects(cloud).map(function (p) { return p.label; }); }
  /*
   * What a prompt sees of a cloud of any size: a bounded, relevant set of subjects (at most LIMITS.promptParents), so
   * tokens stay flat as the cloud grows. In order: the focused node's subject, subjects named in the learner's message
   * (or holding a topic it names), the most recently active, then the strongest. The summary covers the same subjects.
   * Everything else stays on the device: placement and dedupe are checked there against the whole cloud.
   */
  function promptSubjects(cloud, focusId, text, max) {
    max = max || LIMITS.promptParents;
    var ss = subjects(cloud), out = [], add = function (s) { if (s && out.indexOf(s) < 0 && out.length < max) out.push(s); };
    if (focusId && cloud.nodes[focusId]) add(cloud.nodes[ancestry(cloud, focusId)[0]]);
    var said = " " + norm(text || "") + " ";
    if (said.trim()) {
      var hit = function (n) { return n.key.length > 2 && said.indexOf(" " + n.key + " ") >= 0; };
      ss.filter(hit).forEach(add);
      if (out.length < max) all(cloud).forEach(function (n) { if (n.parent && !n.ghost && hit(n)) add(cloud.nodes[ancestry(cloud, n.id)[0]]); });
    }
    var heat = {};
    all(cloud).forEach(function (n) { var s0 = ancestry(cloud, n.id)[0]; heat[s0] = Math.max(heat[s0] || 0, n.touched || 0, n.heatAt || 0); });
    ss.slice().sort(function (a, b) { return (heat[b.id] || 0) - (heat[a.id] || 0) || b.weight - a.weight; }).slice(0, Math.ceil(max / 2)).forEach(add);
    ss.slice().sort(function (a, b) { return b.weight - a.weight; }).forEach(add);
    return out;
  }
  function promptView(cloud, focusId, text) {
    var ss = promptSubjects(cloud, focusId, text), total = subjects(cloud).length;
    var sum = summarize(cloud, 1800, ss.map(function (s) { return s.id; }));
    if (total > ss.length) sum = (sum + "\n(+" + (total - ss.length) + " more subjects on the cloud, not listed)").slice(0, 1990);
    return { parents: ss.map(function (s) { return s.label; }), cloud: sum, total: total };
  }

  /* ---------- look ---------- */
  /* Colours: the subject's hue; each level down and each sibling a slightly different shade of it; ghosts pale. */
  function hueOf(cloud, id) {
    var a = ancestry(cloud, id);
    var s = cloud.nodes[a[0]];
    return s && s.hue != null ? s.hue : 30;
  }
  /* A node's own colour on the cloud as { h, s, l } (a dotted placeholder gets the colour it will have): cards use it too. */
  function toneOf(cloud, n) {
    if (!n) return { h: SEPIA, s: 30, l: 22 };
    var h = hueOf(cloud, n.id);
    if (!n.parent) return { h: h, s: 52, l: 50 };
    var a = ancestry(cloud, n.id), i = Math.floor(hash(n.key) * 4);
    return { h: h, s: 46, l: 34 + (((a.length - 2) * 6 + i * 5) % 26) };
  }
  function colorOf(cloud, n) {
    if (!n) return "hsl(30, 30%, 22%)";
    var t = toneOf(cloud, n);
    if (n.ghost) return "hsla(" + t.h + ", 35%, 55%, 0.55)";
    return "hsl(" + t.h + ", " + t.s + "%, " + t.l + "%)";
  }

  /*
   * Card colour: a card always carries its node's colour on the cloud (the same hue), quiet and sepia-toned while it is
   * new, and fuller as it grows (stage 0 to 4); at stage 4 it is the node's own colour. The only place card colour is
   * worked out; the deck and any card design read it from here.
   */
  var SEPIA = 34;
  /* How far the ink has moved from sepia toward the chain's hue at each stage (mixed in RGB, so it never passes through other hues). */
  var MIX = [0.38, 0.55, 0.7, 0.85, 1];
  var WASH = [0.06, 0.1, 0.17, 0.25, 0.32];
  /*
   * tone: the node's colour on the cloud ({ h, s, l }, from toneOf); without one, the subject hue at a standard tone.
   * The hue never changes (so a card always matches its node); saturation and lightness move from quiet sepia-toned
   * (stage 0) to the node's own (stage 4), with the ink kept dark enough to read.
   */
  function evolveColor(hue, stage, tone) {
    var st = Math.max(0, Math.min(4, Math.round(Number(stage) || 0))), t = MIX[st];
    var h = tone ? Math.round(tone.h) : hue == null ? SEPIA : Math.round(hue);
    var ts = tone ? tone.s : 58, tl = Math.max(30, Math.min(46, tone ? tone.l : 42));
    var sat = Math.round(QUIET.s + (ts - QUIET.s) * t), light = Math.round(QUIET.l + (tl - QUIET.l) * t);
    return {
      stage: st, hue: h, sat: sat, light: light, mix: t, base: h,
      ink: "hsl(" + h + ", " + sat + "%, " + light + "%)",
      soft: "hsla(" + h + ", " + sat + "%, " + light + "%, " + (0.2 + 0.25 * t).toFixed(2) + ")",
      wash: "hsla(" + h + ", " + Math.round(30 + 25 * t) + "%, 60%, " + WASH[st].toFixed(2) + ")"
    };
  }
  /* where a new card starts: sepia's quiet saturation and lightness (in the node's own hue) */
  var QUIET = { s: 16, l: 38 };
  function cardColor(cloud, id) {
    var g = growthOf(cloud, id), e = deckEntry(cloud, id), n = cloud.nodes[id];
    return evolveColor(n ? hueOf(cloud, id) : e ? e.hue : SEPIA, g ? g.stage : e ? e.best : 0, n ? toneOf(cloud, n) : null);
  }

  /*
   * The card motifs (the fixed vocabulary the creation call picks from; lib/ikolearn/prompts.ts MOTIFS and deck.js
   * MOTIF_ART carry the same list, the checks keep them equal). Anything else is "".
   */
  var MOTIFS = ["mountain", "wave", "leaf", "tree", "flower", "seed", "sun", "moon", "star", "planet", "cloud", "flame", "drop", "gear",
    "bridge", "house", "book", "pen", "brush", "note", "atom", "cell", "eye", "hand", "heart", "chart", "clock", "map",
    "compass", "bulb", "puzzle", "ball", "bowl", "cup", "globe", "voice", "people", "code", "scale", "feather", "key", "boat", "paw"];
  function cleanMotif(v) { var m = String(v == null ? "" : v).trim().toLowerCase(); return MOTIFS.indexOf(m) >= 0 ? m : ""; }

  /* Size of a level in the layout: each level down is 0.6x the one above, so the tree can keep branching. */
  function levelScale(depth) { return Math.pow(0.6, Math.max(0, depth - 1)); }

  /*
   * Deterministic 3D layout: subjects on a sphere; every child sits on a small cone pointing away from its parent,
   * one level smaller each step. Path steps fan out in their learning order.
   */
  /*
   * A subject's fixed slot round the root, by its place among the subjects (creation order). The first 6 are the
   * original golden spiral; subjects 7-12 take their own in-between spiral. Past 12 there is no cap: subjects fill
   * shells further out (shell s at radius 1 + SHELL.gap * s, room for 12 * (s + 1)), each a fixed golden (Fibonacci)
   * sphere whose slots are taken in a coprime stride, so a half-full shell is already spread round the whole sphere.
   * A slot depends only on its index, so adding a subject never moves the others.
   */
  var SHELL = { gap: 0.85, first: 12 };
  function shellOf(i) {
    var j = i - SHELL.first, s = 1, cap = 24;
    while (j >= cap) { j -= cap; s++; cap = 12 * (s + 1); }
    return { s: s, j: j, cap: cap };
  }
  function strideFor(cap) {
    var gcd = function (a, b) { return b ? gcd(b, a % b) : a; };
    for (var st = Math.round(cap * 0.382); st < cap; st++) if (gcd(st, cap) === 1) return st;
    return 1;
  }
  function subjectSlot(i, golden) {
    golden = golden || Math.PI * (3 - Math.sqrt(5));
    if (i >= SHELL.first) {
      var sh = shellOf(i), m = (sh.j * strideFor(sh.cap)) % sh.cap, R = 1 + SHELL.gap * sh.s;
      var yy = (1 - (m + 0.5) / sh.cap * 2) * 0.92, rr = Math.sqrt(Math.max(0, 1 - yy * yy)), tt = golden * m + sh.s * 0.9;
      return { x: Math.cos(tt) * rr * R, y: yy * 0.8 * R, z: Math.sin(tt) * rr * R, d: 1 };
    }
    var k = i < 6 ? i : i - 6, M = 6;
    var y = i < 6 ? 1 - (k + 0.5) / M * 2 : 0.9 - (k + 1) / (M + 1) * 1.8;
    var r = Math.sqrt(Math.max(0, 1 - y * y)), th = golden * k + (i < 6 ? 0 : golden / 2 + Math.PI / 6);
    return { x: Math.cos(th) * r, y: y * 0.8, z: Math.sin(th) * r, d: 1 };
  }
  var RING = 16;
  function layout(cloud) {
    var pos = { root: { x: 0, y: 0, z: 0, d: 0 } };
    var ix = index(cloud);
    var ss = ix[""] || [];
    var golden = Math.PI * (3 - Math.sqrt(5));
    var stack = [];
    ss.forEach(function (id, i) {
      var p = subjectSlot(i, golden);
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
      var rank = {};
      kidsIds.forEach(function (x, ri) { rank[x] = ri; }); /* creation order among siblings: append-only, so rings never reshuffle */
      kidsIds = kidsIds.filter(function (x) { return cloud.nodes[x].role !== "optional"; }).concat(kidsIds.filter(function (x) { return cloud.nodes[x].role === "optional"; }));
      kidsIds.forEach(function (cid) {
        var c = cloud.nodes[cid];
        if (c.role === "optional" && c.off && pos[c.off] && kidsIds.indexOf(c.off) >= 0) {
          /* a side path sits just off its core step, a little further out */
          var O = pos[c.off], dir = unit({ x: O.x - P.x, y: O.y - P.y, z: O.z - P.z }), b2 = perp(dir), a2 = hash(c.key + "side") * Math.PI * 2, sd = step * 0.55 * (c.absorbedInto === cur.id ? 0.5 : 1);
          var so = { x: dir.x * 0.5 + (b2[0].x * Math.cos(a2) + b2[1].x * Math.sin(a2)) * 0.85, y: dir.y * 0.5 + (b2[0].y * Math.cos(a2) + b2[1].y * Math.sin(a2)) * 0.85, z: dir.z * 0.5 + (b2[0].z * Math.cos(a2) + b2[1].z * Math.sin(a2)) * 0.85 };
          var sq = { x: O.x + so.x * sd, y: O.y + so.y * sd, z: O.z + so.z * sd, d: P.d + 1 };
          pos[cid] = sq;
          stack.push({ id: cid, dir: unit({ x: sq.x - P.x, y: sq.y - P.y, z: sq.z - P.z }) });
          return;
        }
        var oi = order.indexOf(cid);
        /* no cap on children: every RING more (by creation rank) sits on a wider, further ring of the cone, spread by the
           golden angle of its rank (the first ring keeps its old placement, so old saves look the same) */
        var ring = Math.floor(rank[cid] / RING);
        var a = oi >= 0 ? a0 + oi * (Math.PI * 2 / Math.max(order.length + 1, 5)) : ring ? a0 + rank[cid] * 2.39996323 : hash(c.key + "a") * Math.PI * 2;
        var theta = 0.7 + (c.ghost ? 0.2 : 0) + hash(c.key + "t") * 0.25 + Math.min(0.35, ring * 0.12);
        /* absorbed into this (merged) parent: a tighter constellation round it */
        var s = step * (c.ghost ? 1.12 : 1) * (c.absorbedInto === cur.id ? 0.45 : 1) * (1 + 0.55 * ring);
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

  /* ---------- branches from a spec ---------- */
  function seedLabel(s) { return typeof s === "string" ? s : s.label; }
  /*
   * Adds a branch from a nested spec ({ label, ghost, path, children }). Nothing calls this for new learners any more;
   * it stays for fixtures and tools. With `onlyMissing`, existing nodes are kept and new ones arrive as ghosts.
   */
  function plant(cloud, spec, parentId, t, onlyMissing) {
    var label = seedLabel(spec), ghost = typeof spec === "object" && spec.ghost;
    var k = norm(label);
    var n = parentId ? childrenOf(cloud, parentId).filter(function (c) { return c.key === k; })[0] : subjects(cloud).filter(function (c) { return c.key === k; })[0];
    if (!n && onlyMissing && parentId) n = findTopic(cloud, label, parentId);
    if (!n) {
      if (parentId && !makeRoom(cloud, parentId, true)) return null;
      n = addNode(cloud, { label: label, parent: parentId, ghost: Boolean(parentId) && (ghost || onlyMissing), weight: 1, born: onlyMissing ? t : 0, hue: typeof spec === "object" ? spec.hue : undefined });
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
    /* nothing pre-seeded: the orchestrator asks a few questions and the creation call builds the first parents */
    return { v: VERSION, name: cleanLabel(name) || "Me", seq: 0, rev: 0, nodes: {}, order: [], cards: [], created: t, next: null, deck: [], draws: [], sessions: 0, tests: {}, suggest: null, active: null, profile: newProfile(), events: [] };
  }

  /* ---------- the learner's profile (v6) ---------- */
  /*
   * interests: what they said they enjoy. onboarded: when the first question was answered or skipped; askedAt: the last
   * light re-ask; visits / lessonVisit: for "seems stuck". There is no age and no region: IkoLearn never asks for either,
   * and nothing about the learner's age or place is kept or sent. Older (v6-v8) saves carry an age band, a region and a
   * changedAt in the first slots of the profile row: they are ignored on read and written back empty (the row keeps its
   * v8 shape, so no version bump).
   */
  function newProfile() { return { interests: [], onboarded: 0, askedAt: 0, visits: 0, lessonVisit: 0, dir: newDir() }; }
  /*
   * Directions (an additive v9 slot, profile row [9]; older readers ignore it, older saves read as all zero):
   * off: when the "another direction" invite was dismissed (never shown again); n: directions added from it;
   * seen / prev: this visit's and the previous visit's start; quiet: when the return-visit row was dismissed (it
   * rests a while); hide: insight keys the learner closed (never shown again).
   */
  function newDir() { return { off: 0, n: 0, seen: 0, prev: 0, quiet: 0, hide: [], later: [] }; }
  /* later: ideas from the intake past its caps (the server's `later`), offered as directions to add; never ones already on the cloud */
  function setLater(cloud, list) {
    var d = dirOf(cloud), out = [];
    (Array.isArray(list) ? list : []).map(cleanLabel).filter(Boolean).forEach(function (x) { if (out.length < 4 && !out.some(function (y) { return norm(y) === norm(x); }) && !findAny(cloud, x)) out.push(x); });
    d.later = out;
    return out;
  }
  function dirOf(cloud) { var p = profileOf(cloud); if (!p.dir) p.dir = newDir(); return p.dir; }
  function cleanInterest(v) { return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f"<>{}[\]`*_#|\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40).trim(); }
  function profileOf(cloud) { if (!cloud.profile) cloud.profile = newProfile(); return cloud.profile; }
  function setProfile(cloud, patch, t) {
    t = now_(t);
    var p = profileOf(cloud); /* any age or region in a patch is ignored */
    if (patch && Array.isArray(patch.interests)) {
      patch.interests.map(cleanInterest).filter(Boolean).forEach(function (x) { if (!p.interests.some(function (y) { return norm(y) === norm(x); })) p.interests.push(x); });
      p.interests = p.interests.slice(-12);
    }
    if (patch && patch.onboarded) p.onboarded = p.onboarded || t;
    if (patch && patch.askedAt) p.askedAt = t;
    return p;
  }
  /* Topics the learner has (explored, below a subject). */
  function topicCount(cloud) { return all(cloud).filter(function (n) { return n.parent && !n.ghost; }).length; }

  function cleanGoal(v) { return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>{}[\]`*_#|\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100).trim(); }
  /*
   * Applies one creation result (the "create" call): { items: [{ node: { name, chain }, card: { title, blurb, goal },
   * children: [{ name, order, score }] }] }. Each node is placed through its chain (missing links are created, a broad
   * subject takes its stable hue), gets its card line and goal, and its children arrive as dotted placeholders in
   * their logical order (its path) with the model's importance score (imp) for the ranking. opts.focusId: "what comes
   * next" for that existing parent. Never removes anything. -> { nodes: [ids], children: [ids], order: [ids as created] }
   */
  function applyCreate(cloud, result, opts) {
    opts = opts || {};
    var t = now_(opts.t), out = { nodes: [], children: [], order: [] }, res = { created: [], promoted: [], strengthened: [], parentsCreated: [] };
    var needs = []; /* v9: [node id, names it needs first], resolved once every item is placed */
    (result && Array.isArray(result.items) ? result.items : []).forEach(function (it) {
      if (!it || !it.node) return;
      var label = cleanLabel(it.node.name), k = norm(label), n = null;
      if (opts.focusId) n = node(cloud, opts.focusId);
      else if (label && k !== norm(cloud.name)) {
        var links = (Array.isArray(it.node.chain) ? it.node.chain : []).map(cleanLabel).filter(function (l) { return l && norm(l) !== k && norm(l) !== norm(cloud.name); }).slice(-LIMITS.chain);
        var parent = links.length ? placeChain(cloud, links, t, res) : null;
        /* new links of the chain appear first, broadest first, then the node */
        res.parentsCreated.concat(res.created).forEach(function (x) { if (out.order.indexOf(x) < 0) out.order.push(x); });
        res.created = []; res.parentsCreated = [];
        if (parent) {
          n = childrenOf(cloud, parent.id).filter(function (c) { return c.key === k; })[0] || findTopic(cloud, label, parent.id);
          if (!n && makeRoom(cloud, parent.id, false)) { n = addNode(cloud, { label: label, parent: parent.id, weight: 0.5, born: t }); out.order.push(n.id); }
        } else {
          n = subjects(cloud).filter(function (x) { return x.key === k; })[0] || findTopic(cloud, label) || findSubject(cloud, label);
          if (!n) { n = addNode(cloud, { label: label, parent: null, weight: 1, born: t }); out.order.push(n.id); }
        }
      }
      if (!n) return;
      if (n.ghost) { n.ghost = false; n.born = t; n.weight = Math.max(n.weight, 0.5); }
      if (!n.motif) n.motif = cleanMotif(it.node.motif);
      var card = it.card || {};
      if (card.blurb && (!n.blurb || !opts.focusId)) setBlurb(cloud, n.id, card.blurb);
      if (card.goal && (!n.goal || !opts.focusId)) n.goal = cleanGoal(card.goal); /* "what comes next" never rewrites a parent's card */
      var kids = (Array.isArray(it.children) ? it.children : []).slice().sort(function (a, b) { return (Number(a.order) || 99) - (Number(b.order) || 99); });
      /* core children are the ordered main sequence (its path); optional ones hang off one core step as side paths */
      var core = kids.filter(function (c) { return c.role !== "optional"; }), side = kids.filter(function (c) { return c.role === "optional"; });
      if (!core.length && side.length) core = [side.shift()];
      var before = childrenOf(cloud, n.id).map(function (c) { return c.id; });
      var r = core.length ? applyPath(cloud, n.id, core.map(function (c) { return c.name; }), core[0].name, t) : { ids: [], added: [] };
      var coreIds = (n.path ? n.path.ids : []).filter(function (x) { return cloud.nodes[x] && cloud.nodes[x].parent === n.id; });
      coreIds.forEach(function (x) { if (cloud.nodes[x].role !== "optional") cloud.nodes[x].role = "core"; });
      side.forEach(function (c) {
        var lbl = cleanLabel(c.name), kk = norm(lbl);
        if (!kk || kk === norm(cloud.name) || kk === n.key) return;
        var hit = childrenOf(cloud, n.id).filter(function (x) { return x.key === kk; })[0];
        if (!hit && findTopic(cloud, lbl, n.id) && !isAncestor(cloud, n.id, findTopic(cloud, lbl, n.id).id)) return; /* lives elsewhere: leave it there */
        if (!hit) {
          if (!makeRoom(cloud, n.id, true, coreIds)) return;
          hit = addNode(cloud, { label: lbl, parent: n.id, ghost: true, born: t, role: "optional" });
          r.added.push(hit.id);
        }
        if (hit.role !== "core") {
          hit.role = "optional";
          var at = coreIds.filter(function (x) { return cloud.nodes[x].key === norm(c.after); })[0];
          hit.off = at || hit.off || coreIds[0] || null;
        }
      });
      kids.forEach(function (c) {
        var hit = childrenOf(cloud, n.id).filter(function (x) { return x.key === norm(c.name); })[0];
        if (!hit) return;
        var sc = Number(c.score);
        if (Number.isFinite(sc)) { hit.imp = clamp01(sc > 1 ? sc / 100 : sc); hit.impAt = t; }
        if (Array.isArray(c.needs) && c.needs.length) needs.push([hit.id, c.needs]);
        if (!hit.motif) hit.motif = cleanMotif(c.motif);
        if (c.blurb && !hit.blurb) setBlurb(cloud, hit.id, c.blurb); /* the child's description, from the same creation call */
        if (before.indexOf(hit.id) < 0 && out.children.indexOf(hit.id) < 0) out.children.push(hit.id);
      });
      r.added.forEach(function (x) { if (out.order.indexOf(x) < 0) out.order.push(x); });
      if (Array.isArray(it.node.needs) && it.node.needs.length) needs.push([n.id, it.node.needs]);
      n.pending = null;
      if (opts.focusId) n.asked = doneCore(cloud, n.id).length + 1;
      else n.made = true;
      n.touched = Math.max(n.touched || 0, t);
      if (out.nodes.indexOf(n.id) < 0) out.nodes.push(n.id);
    });
    if (out.nodes.length) { cloud.rev += 1; prune(cloud); }
    needs.forEach(function (x) { if (cloud.nodes[x[0]]) addPrereqs(cloud, x[0], x[1]); });
    return out;
  }

  /*
   * v6 migration: the old starter map is gone. Seeded topics the learner never touched (no visit, time, answers, card,
   * deck entry, heat, path pick or test, and nothing of theirs under them) are pruned, deepest first; a seeded subject
   * goes once it has nothing left under it and was never strengthened. Learned or engaged nodes are never removed, and
   * neither are the remaining steps on the path of a topic the learner worked on (so no branch is marked finished by it).
   */
  function pruneSeeds(cloud) {
    var seeds = OLD_SEEDS.map(norm), removed = [], guard = 0, again = true;
    var untouched = function (n) {
      return seeds.indexOf(n.key) >= 0 && !n.opened && !(n.spent > 0) && !(n.engaged > 0) && !(n.correct > 0) && !(n.mastery > 0) && !(n.heat > 0) &&
        !n.cards.length && !inDeck(cloud, n.id) && !n.blurb && !n.achievedAt && !n.doneAt && !n.pending && !n.lastStruggle && !(cloud.tests && cloud.tests[n.id]) &&
        n.weight <= 1.0001 && !hasChildren(cloud, n.id) && !(n.fork && n.fork.picked) && !onEngagedPath(n);
    };
    /* a step on the path of a topic the learner worked on stays: it's the rest of their branch (pruning it would mark the branch finished) */
    var onEngagedPath = function (n) {
      var par = cloud.nodes[n.parent];
      return Boolean(par && par.path && par.path.ids.indexOf(n.id) >= 0 && (par.opened || par.engaged > 0 || par.correct > 0 || par.spent > 0 || inDeck(cloud, par.id)));
    };
    while (again && guard++ < 50) {
      again = false;
      cloud.order.slice().reverse().forEach(function (id) {
        var n = cloud.nodes[id];
        if (n && untouched(n)) { removeNode(cloud, id); removed.push(n.label); again = true; }
      });
    }
    if (removed.length) cloud.rev += 1;
    return removed;
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
    warm(n, (add / 60) * HEAT.minute, t);
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
    return { spent: n.spent || 0, engaged: n.engaged || 0, correct: n.correct || 0, mastery: n.mastery, opened: n.opened, end: Boolean(n.end), achieved: Boolean(n.achievedAt), cards: n.cards.length, subject: (subjectOf(cloud, id) || {}).id || null, hue: hueOf(cloud, id) };
  }

  /* ---------- growth, the deck, forks ---------- */
  /*
   * Two things grow on a card:
   *  - detail (ink): the growth score = minutes spent + 2 per engagement + 3 per correct answer + 4 x mastery + cards (up to 3),
   *    at the GROWTH.stages scores. A topic joins the deck for good at GROWTH.join (or when achieved).
   *  - colour: earned only by confirmed learning. Confirmations = correct answers to lesson questions + 2 for "I've got it".
   *    Colour stages 1-3 at GROWTH.confirm; stage 4 (full colour, "Achieved") only when the branch has ended. A card's colour
   *    never goes back down, and an achieved card stays achieved.
   */
  var GROWTH = { stages: [0, 3, 8, 16, 30], join: 3, confirm: [0, 1, 3, 5], names: ["New", "Warming up", "Growing", "Bright", "Achieved"] };
  function scoreOf(n) { return n ? (n.spent || 0) / 60 + 2 * (n.engaged || 0) + 3 * (n.correct || 0) + 4 * (n.mastery || 0) + Math.min((n.cards || []).length, 3) : 0; }
  function stageFor(score) { var st = 0; for (var i = 1; i < GROWTH.stages.length; i++) if (score >= GROWTH.stages[i]) st = i; return st; }
  function confirmedOf(n) { return n ? (n.correct || 0) + (n.mastery >= MASTERED ? 2 : 0) : 0; }
  function tintFor(n) { var c = confirmedOf(n), st = 0; for (var i = 1; i < GROWTH.confirm.length; i++) if (c >= GROWTH.confirm[i]) st = i; return st; }
  function deckEntry(cloud, id) { var d = cloud.deck || []; for (var i = 0; i < d.length; i++) if (d[i].id === id) return d[i]; return null; }
  function inDeck(cloud, id) { return Boolean(deckEntry(cloud, id)); }
  /* The chain shown on a card: the labels from the subject down to the topic (stored on deck entries too). */
  function chainOf(cloud, id) {
    if (cloud.nodes[id]) return ancestry(cloud, id).map(function (x) { return cloud.nodes[x].label; });
    var e = deckEntry(cloud, id);
    return e ? (e.chain && e.chain.length ? e.chain.slice() : [e.subject, e.label].filter(Boolean)) : [];
  }
  /*
   * Card tiers (v8), a monotonic ladder derived from confirmed learning (never from time spent):
   *   0 Sketch    nothing confirmed yet
   *   1 Inked     the first confirmation (a right answer, or "I've got it")
   *   2 Tinted    the topic is completed (isDone: mastered, or 2 right answers)
   *   3 Achieved  completed and confirmed: 3+ right answers, or its whole branch has ended
   *   4 Merged    a parent that has absorbed completed subtopic cards; its level (I, II, III ...) rises with each batch
   * The colour stage (0-4, how far the ink has moved from sepia to the chain's hue) is at least TIER_STAGE[tier], so a
   * card's colour is earned on the card itself as its tier rises. A deck entry keeps the best tier (tb), so a card never
   * goes back down, even after its topic is gone.
   */
  var TIERS = ["sketch", "inked", "tinted", "achieved", "merged"], TIER_NAMES = ["Sketch", "Inked", "Tinted", "Achieved", "Merged"];
  var TIER_STAGE = [0, 1, 2, 4, 4], ACHIEVE_RIGHT = 3;
  function roman(k) { k = Math.max(0, Math.floor(Number(k) || 0)); var r = "", t = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]; t.forEach(function (x) { while (k >= x[0]) { r += x[1]; k -= x[0]; } }); return r; }
  function mergeLevel(cloud, id) { var n = node(cloud, id), e = deckEntry(cloud, id); return Math.max(n ? n.ml || 0 : 0, e ? e.ml || 0 : 0); }
  function tierRank(cloud, id, n, e, branchEnded) {
    if (mergeLevel(cloud, id)) return 4;
    var r = 0;
    if (n && !n.ghost) {
      var c = confirmedOf(n);
      if (c >= 1) r = 1;
      if (isDone(cloud, id)) r = 2;
      if (r === 2 && ((n.correct || 0) >= ACHIEVE_RIGHT || branchEnded)) r = 3;
    }
    if (branchEnded) r = Math.max(r, 3);
    return Math.max(r, e ? Math.min(3, e.tb || 0) : 0);
  }
  function growthOf(cloud, id) {
    var n = node(cloud, id), e = deckEntry(cloud, id);
    if (!n && !e) return null;
    var ended = Boolean((n && (n.achievedAt || (!n.ghost && isTerminal(cloud, id) && completable(cloud, id)))) || (e && e.ach));
    var tier = tierRank(cloud, id, n, e, ended), ml = mergeLevel(cloud, id);
    var stage = Math.max(TIER_STAGE[tier], n ? tintFor(n) : 0, e ? Math.min(e.best || 0, 4) : 0);
    var score = n ? scoreOf(n) : 0, c = n ? confirmedOf(n) : 0, want = GROWTH.confirm[stage + 1];
    return {
      score: Math.round(score * 10) / 10, stage: stage, detail: Math.max(stageFor(score), stage), name: GROWTH.names[stage],
      achieved: tier >= 3, ended: ended, confirmed: c, toNext: tier >= 3 || want == null ? 0 : Math.max(0, want - c), inDeck: Boolean(e),
      tier: tier, tierKey: TIERS[tier], tierName: TIER_NAMES[tier] + (ml ? " " + roman(ml) : ""), level: ml, progress: tierProgress(n, tier)
    };
  }
  /* How far a card is toward its next tier, 0..1 (merged cards: 0, their next level comes with the next batch). */
  function tierProgress(n, tier) {
    if (!n || tier >= 3) return 0;
    if (tier === 0) return clamp01(n.mastery / MASTERED * 0.5);
    if (tier === 1) return clamp01(Math.max((n.correct || 0) / 2, n.mastery / MASTERED));
    return clamp01((n.correct || 0) / ACHIEVE_RIGHT);
  }
  function tierOf(cloud, id) { var g = growthOf(cloud, id); return g ? { rank: g.tier, key: g.tierKey, name: g.tierName, level: g.level, progress: g.progress } : null; }
  function isAchieved(cloud, id) { var g = growthOf(cloud, id); return Boolean(g && g.achieved); }
  /*
   * Marks topics whose branch has ended as achieved (once, for good), adds every topic past the threshold to the deck
   * (never removes), and keeps each entry's label, chain, description and best colour up to date. Returns ids that joined now.
   */
  function joinDeck(cloud, t) {
    t = now_(t);
    cloud.deck = cloud.deck || [];
    var joined = [];
    all(cloud).forEach(function (n) {
      if (!n.parent || n.ghost) return;
      if (!n.achievedAt && isTerminal(cloud, n.id) && completable(cloud, n.id)) n.achievedAt = t;
      if (!n.doneAt && isDone(cloud, n.id)) n.doneAt = t; /* completion is kept for good, even if mastery later dips */
      if (inDeck(cloud, n.id) || (scoreOf(n) < GROWTH.join && !n.achievedAt && !n.ml)) return; /* a merged parent is always in the deck */
      cloud.deck.push({ id: n.id, label: n.label, subject: "", hue: SEPIA, at: t, best: 0, chain: [], blurb: "", ach: 0, tb: 0, ml: 0, inn: null, co: [] });
      joined.push(n.id);
    });
    cloud.deck.forEach(function (e) {
      var n = cloud.nodes[e.id];
      if (!n) return;
      var s = subjectOf(cloud, n.id);
      e.label = n.label;
      if (s) { e.subject = s.label; e.hue = s.hue == null ? SEPIA : s.hue; }
      e.chain = chainOf(cloud, n.id);
      if (n.blurb) e.blurb = n.blurb;
      if (n.achievedAt && !e.ach) e.ach = n.achievedAt;
      var g = growthOf(cloud, n.id);
      e.best = Math.max(e.best || 0, n.achievedAt ? 4 : g.stage);
      e.tb = Math.max(e.tb || 0, g.tier); /* best tier, kept for good */
      e.ml = Math.max(e.ml || 0, n.ml || 0);
      e.inn = n.absorbedInto || e.inn || null; /* absorbed into a parent card: shown in its corpus */
      /* the corpus: every card this one has absorbed, labels kept even if a topic is later removed */
      (n.absorbed || []).forEach(function (x) { var k = cloud.nodes[x]; if (k && !(e.co || []).some(function (c) { return c[0] === x; })) (e.co = e.co || []).push([x, k.label]); });
    });
    return joined;
  }
  /* A multiple-choice answer from a lesson: a right one is confirmed learning (colour); either way it counts as use. */
  function confirm(cloud, id, right, t) {
    t = now_(t);
    var n = node(cloud, id);
    if (!n) return false;
    if (n.ghost) { n.ghost = false; n.born = t; n.weight = Math.max(n.weight, 1); }
    if (right) { n.correct = (n.correct || 0) + 1; n.mastery = clamp01(n.mastery + 0.1); }
    warm(n, right ? HEAT.correct : HEAT.wrong, t);
    n.touched = t;
    return true;
  }
  /* The short line under a card's title (from the lesson's hidden block, or a card's first sentence). */
  function cleanBlurb(v) {
    var x = String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>{}[\]`*_#|\\]/g, " ").replace(/\s+/g, " ").trim();
    var m = /^(.{20,}?[.!?])(\s|$)/.exec(x);
    x = m ? m[1] : x;
    return x.length > LIMITS.blurbChars ? x.slice(0, LIMITS.blurbChars).replace(/\s+\S*$/, "") + "..." : x;
  }
  function setBlurb(cloud, id, text) {
    var n = node(cloud, id), b = cleanBlurb(text);
    if (!n || b.length < 8) return false;
    n.blurb = b;
    return true;
  }
  /*
   * Usage heat for the ranking (rank.js): points per use, halving every HEAT.halfDays days, so the top 10 follows what the
   * learner does lately. Kept per node as { heat, heatAt }.
   */
  var HEAT = { halfDays: 14, open: 1, minute: 0.25, correct: 1.5, wrong: 0.3, got: 2, tricky: 0.5, card: 1, chat: 0.5, test: 2 };
  function heatNow(n, t) {
    if (!n || !n.heat) return 0;
    var dt = Math.max(0, now_(t) - (n.heatAt || 0));
    return n.heat * Math.pow(2, -dt / (HEAT.halfDays * 86400000));
  }
  function warm(n, pts, t) {
    if (!n || !(pts > 0)) return;
    t = now_(t);
    n.heat = heatNow(n, t) + pts;
    n.heatAt = t;
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
      if (c.blurb && !hit.blurb) setBlurb(cloud, hit.id, c.blurb);
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
  /* ---------- completion, children waiting for engagement, tests (v5); prerequisites and the completion gate (v9) ---------- */
  /*
   * A completed topic: done once (doneAt or achievedAt, kept for good), or now: mastered, or 2+ right answers, or its
   * branch has ended, AND it is completable (v9 gate). Ghosts never are.
   */
  function isDone(cloud, id) {
    var n = node(cloud, id);
    if (!n || !n.parent || n.ghost) return false;
    if (n.doneAt || n.achievedAt) return true;
    return Boolean((n.mastery >= MASTERED || (n.correct || 0) >= 2 || isTerminal(cloud, id)) && completable(cloud, id));
  }
  /*
   * The completion gate (v9). A topic can only reach done (Tinted) or Achieved once
   *   1. every prerequisite (node.pre: ids from the creation call) is done, and
   *   2. when it has core children, enough of them are done: GATE.share of them, at least GATE.min (all of them when it
   *      has fewer).
   * A leaf with no prerequisites completes exactly as before. Locked topics stay visible and learnable (lessons,
   * answers, colour up to Inked); completion simply waits. Completion already recorded (doneAt, achievedAt) is never
   * taken back, and saves from before v9 are stamped with the old rules on load, so nothing regresses.
   */
  var GATE = { share: 0.5, min: 2 };
  /* how many of `total` are needed for a share, at least `min` (never more than total; 0 of 0) */
  function needOf(total, share, min) { return total > 0 ? Math.min(total, Math.max(min, Math.ceil(share * total - 1e-9))) : 0; }
  /* core children of a topic and how many are done: { total, done, need } (need: for the completion gate) */
  /* the core the v9 gate counts: the main sequence (role core, placeholders included) and opened children from before roles;
     a dotted suggestion with no role yet never blocks completion */
  function gateCore(cloud, id) { return coreChildren(cloud, id).filter(function (c) { return c.role === "core" || !c.ghost; }); }
  function coreProgress(cloud, id) {
    var core = gateCore(cloud, id), done = 0;
    core.forEach(function (c) { if (isDone(cloud, c.id)) done++; });
    return { total: core.length, done: done, need: needOf(core.length, GATE.share, GATE.min) };
  }
  /* live prerequisites of a topic (ids) */
  function prereqs(cloud, id) { var n = node(cloud, id); return n && n.pre ? n.pre.filter(function (x) { return x !== id && cloud.nodes[x]; }) : []; }
  /* the prerequisites still to finish: [] when unlocked ("after X" uses these) */
  function lockedBy(cloud, id) {
    var n = node(cloud, id);
    if (!n || n.doneAt || n.achievedAt) return [];
    return prereqs(cloud, id).filter(function (x) { return !isDone(cloud, x); });
  }
  var gateOff = false, gating = {};
  function completable(cloud, id) {
    if (gateOff) return true; /* loading a pre-v9 save: completion is stamped with the old rules first */
    if (gating[id]) return false; /* a cycle that slipped in: nothing in it completes until it is cut */
    gating[id] = 1;
    try {
      if (lockedBy(cloud, id).length) return false;
      var cp = coreProgress(cloud, id);
      return cp.done >= cp.need;
    } finally { delete gating[id]; }
  }
  /* every prerequisite reachable from id (to keep the graph acyclic) */
  function preClosure(cloud, id) {
    var seen = {}, stack = prereqs(cloud, id).slice();
    while (stack.length) { var x = stack.pop(); if (seen[x]) continue; seen[x] = 1; prereqs(cloud, x).forEach(function (y) { stack.push(y); }); }
    return seen;
  }
  /*
   * Sets a topic's prerequisites (ids, or labels resolved among its siblings first, then anywhere on the cloud). Never
   * itself, an ancestor or a descendant (that would deadlock with the core gate), nothing that would make a cycle, at
   * most PRE_MAX. Adds to what is there. -> the ids added.
   */
  var PRE_MAX = 3;
  function addPrereqs(cloud, id, refs) {
    var n = node(cloud, id), added = [];
    if (!n || !n.parent) return added;
    n.pre = n.pre || [];
    (Array.isArray(refs) ? refs : []).forEach(function (r) {
      if (n.pre.length >= PRE_MAX) return;
      var x = cloud.nodes[r] ? r : null;
      if (!x) {
        var k = norm(r);
        var sib = k ? childrenOf(cloud, n.parent).filter(function (c) { return c.key === k; })[0] : null;
        var any = sib || (k ? findTopic(cloud, cleanLabel(r)) : null);
        x = any ? any.id : null;
      }
      if (!x || x === id || n.pre.indexOf(x) >= 0 || !cloud.nodes[x].parent) return;
      if (isAncestor(cloud, x, id) || isAncestor(cloud, id, x)) return;
      if (preClosure(cloud, x)[id]) return;
      n.pre.push(x);
      added.push(x);
    });
    return added;
  }
  /* The completed children of a topic (its direct children, path steps first). */
  function doneChildren(cloud, id) {
    var n = node(cloud, id);
    if (!n) return [];
    var ids = (n.path ? n.path.ids.slice() : []);
    childrenOf(cloud, id).forEach(function (c) { if (ids.indexOf(c.id) < 0) ids.push(c.id); });
    return ids.filter(function (x) { return cloud.nodes[x] && cloud.nodes[x].parent === id && isDone(cloud, x); });
  }
  /* Core children: the main sequence (and children from before roles existed). Optional ones are side paths and never block. */
  function coreChildren(cloud, id) { return childrenOf(cloud, id).filter(function (c) { return c.role !== "optional"; }); }
  function doneCore(cloud, id) { return doneChildren(cloud, id).filter(function (x) { return cloud.nodes[x].role !== "optional"; }); }
  /* Side paths of a topic: its optional children, each with the core step it branches off. */
  function sidePaths(cloud, id) {
    return childrenOf(cloud, id).filter(function (c) { return c.role === "optional"; }).map(function (c) { return { id: c.id, off: c.off && cloud.nodes[c.off] && cloud.nodes[c.off].parent === id ? c.off : null }; });
  }
  /* Completed core children not yet merged into this parent (node.absorbed: child ids, child.absorbedInto: parent id). */
  function absorbable(cloud, id) { return doneCore(cloud, id).filter(function (x) { return !cloud.nodes[x].absorbedInto; }); }

  /*
   * Merging (v8): completed subtopic cards combine into a higher-valued parent card. A pure, deterministic state
   * transition; orchestrator.js decides when (mergePlans) and this applies it:
   *   child.absorbedInto = parent, parent.absorbed += children, parent.ml += 1 (Merged I, II, III ...), parent.mergedAt,
   *   and one entry in the event log (cloud.events). Children are never removed: they stay on the cloud (a tighter
   *   constellation round the parent) and in the deck data, shown in the parent card's corpus.
   * Idempotent: children already absorbed (or not under this parent) are ignored, and nothing changes when none are
   * left, so the same plan applied twice merges once. Repeatable: a new batch raises the level again.
   * -> { id, level, ids } or null when nothing changed.
   */
  var EVENTS_MAX = 120;
  function mergeInto(cloud, pid, ids, t, why) {
    t = now_(t);
    var p = node(cloud, pid);
    if (!p || !p.parent || p.ghost) return null;
    var fresh = [];
    (Array.isArray(ids) ? ids : []).forEach(function (x) {
      var c = cloud.nodes[x];
      if (c && x !== pid && c.parent === pid && !c.absorbedInto && fresh.indexOf(x) < 0) fresh.push(x);
    });
    if (!fresh.length) return null;
    fresh.forEach(function (x) { cloud.nodes[x].absorbedInto = pid; if (p.absorbed.indexOf(x) < 0) p.absorbed.push(x); });
    p.ml = (p.ml || 0) + 1;
    p.mergedAt = t;
    p.weight += 0.5 * fresh.length;
    p.touched = t;
    logEvent(cloud, { t: t, k: "merge", id: pid, lv: p.ml, ids: fresh, why: why || "" });
    joinDeck(cloud, t);
    cloud.rev += 1;
    return { id: pid, level: p.ml, ids: fresh };
  }
  /* The event log: what changed and when (merges for now), newest last, capped. */
  function logEvent(cloud, ev) { cloud.events = (cloud.events || []).concat([ev]).slice(-EVENTS_MAX); }
  /* A card's corpus: the cards it has absorbed, [{ id, label, live }] (labels kept on the deck entry if a topic is gone). */
  function corpusOf(cloud, id) {
    var n = node(cloud, id), e = deckEntry(cloud, id), out = [], seen = {};
    (n ? n.absorbed : []).forEach(function (x) { if (cloud.nodes[x]) { seen[x] = 1; out.push({ id: x, label: cloud.nodes[x].label, live: true }); } });
    ((e && e.co) || []).forEach(function (c) { if (!seen[c[0]]) { seen[c[0]] = 1; out.push({ id: c[0], label: c[1], live: Boolean(cloud.nodes[c[0]]) }); } });
    return out;
  }
  /* Absorbed into a parent card (node or stored entry). */
  function absorbedInto(cloud, id) { var n = node(cloud, id), e = deckEntry(cloud, id); return (n && n.absorbedInto) || (e && e.inn) || null; }

  /*
   * Chain validation (no tables): a chain of labels from the model is cleaned before it is placed. Dropped: duplicates,
   * the topic itself, the learner's name, a link that is one of the topic's own descendants (a cycle), and any link that
   * is a different subject of this learner (a chain never crosses subjects). The first label may be the subject.
   * -> { chain, dropped: [labels], shallow } where shallow = fewer than 2 links between the subject and the topic.
   */
  function checkChain(cloud, id, labels) {
    var n = node(cloud, id), subj = n ? subjectOf(cloud, id) : null, out = [], dropped = [], keys = [];
    var below = {};
    if (n) all(cloud).forEach(function (m) { if (m.id !== id && isAncestor(cloud, id, m.id)) below[m.key] = 1; });
    (Array.isArray(labels) ? labels : []).forEach(function (l, i) {
      var c = cleanLabel(l), k = norm(c);
      if (!c) return;
      /* exact names only: an alias ("Programming" for Computer Science, "Biology" for Science) is a fine topic inside it */
      var other = subjects(cloud).filter(function (x) { return x.key === k; })[0];
      var bad = keys.indexOf(k) >= 0 || (n && k === n.key) || k === norm(cloud.name) || below[k] || (other && subj && other.id !== subj.id) || (i > 0 && other === subj);
      if (bad) { dropped.push(c); return; }
      out.push(c); keys.push(k);
    });
    var links = out.filter(function (c, i) { return !(i === 0 && subj && (norm(c) === subj.key || findSubject(cloud, c) === subj)); });
    return { chain: out, dropped: dropped, shallow: links.length < 2 };
  }
  /* Moves a node (with its branch) under a new parent; it leaves its old parent's path and side-path role. */
  function moveUnder(cloud, x, pid) {
    var m = node(cloud, x), old = m ? node(cloud, m.parent) : null;
    if (!m || !node(cloud, pid) || m.parent === pid || x === pid || isAncestor(cloud, x, pid)) return false;
    if (old && old.path) { old.path.ids = old.path.ids.filter(function (y) { return y !== x; }); if (old.path.next === x) old.path.next = null; }
    m.parent = pid; m.role = ""; m.off = null;
    if (m.absorbedInto && m.absorbedInto !== pid) { var a = node(cloud, m.absorbedInto); if (a) a.absorbed = a.absorbed.filter(function (y) { return y !== x; }); m.absorbedInto = null; }
    return true;
  }
  /*
   * The one-time chain repair (after a bridge that is still shallow): the model's corrected chain is walked from the
   * subject down along the topic's own ancestry. A missing level is inserted above the existing ancestor it belongs
   * over (Computer Science > Python > Sets + "Programming" -> Computer Science > Programming > Python > Sets; Python
   * moves with its branch, ids kept); new links are created (sepia cards); the topic moves under the deepest link.
   * Cached on the topic (repaired) whatever the answer, so it happens at most once per topic, ever.
   * -> { moved, created: [ids], chain: [labels] }
   */
  function applyRepair(cloud, id, result, t) {
    t = now_(t);
    var n = node(cloud, id), out = { moved: false, created: [], chain: [] };
    if (!n || !n.parent) return out;
    n.repaired = n.repaired || t;
    var subj = subjectOf(cloud, id), it = result && Array.isArray(result.items) ? result.items[0] : null;
    if (!subj || !it || !it.node) return out;
    var raw = Array.isArray(it.node.chain) ? it.node.chain.slice() : [];
    if (raw.length && findSubject(cloud, raw[0]) !== subj && norm(raw[0]) !== subj.key) raw.unshift(subj.label);
    var links = checkChain(cloud, id, raw).chain.slice(1).slice(0, LIMITS.chain); /* below the subject (raw starts at it) */
    var anc = ancestry(cloud, id).slice(0, -1).map(function (x) { return cloud.nodes[x]; });
    if (links.length + 1 <= anc.length) { out.chain = chainOf(cloud, id); return out; } /* not deeper than what is there: keep */
    var blurbs = {};
    (it.links || []).forEach(function (l) { if (l && l.name) blurbs[norm(l.name)] = l.blurb; });
    var cur = subj;
    for (var i = 0; i < links.length; i++) {
      var k = norm(links[i]), hit = null;
      childrenOf(cloud, cur.id).forEach(function (c) { if (!hit && c.key === k) hit = c; });
      if (!hit) {
        var a = anc.filter(function (m) { return m.key === k && m.id !== cur.id && !isAncestor(cloud, m.id, cur.id); })[0];
        if (a && moveUnder(cloud, a.id, cur.id)) { hit = a; out.moved = true; }
        else {
          if (!makeRoom(cloud, cur.id, false)) break;
          hit = addNode(cloud, { label: links[i], parent: cur.id, weight: 0.5, born: t });
          hit.bridged = t;
          if (blurbs[k]) setBlurb(cloud, hit.id, blurbs[k]);
          out.created.push(hit.id);
        }
      } else if (hit.ghost) { hit.ghost = false; hit.born = t; }
      cur = hit;
    }
    if (cur.id !== id && n.parent !== cur.id && moveUnder(cloud, id, cur.id)) out.moved = true;
    out.chain = chainOf(cloud, id);
    if (out.moved || out.created.length) cloud.rev += 1;
    return out;
  }

  /*
   * A bridge (the creation call, kind "bridge"): the logical in-between topics for a topic that landed too close to its
   * subject ("Sets" right under Computer Science -> Computer Science > Programming > Python > Sets). Links are placed
   * through placeChain (existing nodes reused by name and alias), get their card line, and the topic moves under the
   * deepest one with its whole branch (ids kept). Cached on the topic (bridged), whatever the answer.
   * -> { moved, created: [ids], chain: [labels] }
   */
  function applyBridge(cloud, id, result, t) {
    t = now_(t);
    var n = node(cloud, id), out = { moved: false, created: [], chain: [] };
    if (!n || !n.parent) return out;
    n.bridged = t;
    var it = result && Array.isArray(result.items) ? result.items[0] : null;
    var subj = subjectOf(cloud, id);
    var chain = (it && it.node && Array.isArray(it.node.chain) ? it.node.chain : []).map(cleanLabel).filter(function (l) { return l && norm(l) !== n.key && norm(l) !== norm(cloud.name); });
    if (subj && chain.length && !findSubject(cloud, chain[0]) && norm(chain[0]) !== subj.key) chain.unshift(subj.label);
    chain = checkChain(cloud, id, chain).chain; /* validation pass: no cycles, no other subjects, no repeats */
    if (chain.length < 2) return out;
    var res = { created: [], promoted: [], strengthened: [], parentsCreated: [] };
    var deep = placeChain(cloud, chain, t, res);
    if (!deep || deep.id === n.id || isAncestor(cloud, n.id, deep.id)) return out;
    var blurbs = {};
    ((it && it.links) || []).forEach(function (l) { if (l && l.name) blurbs[norm(l.name)] = l.blurb; });
    ancestry(cloud, deep.id).concat(deep.id).forEach(function (x) { var m = cloud.nodes[x]; if (m.parent && !m.blurb && blurbs[m.key]) setBlurb(cloud, x, blurbs[m.key]); if (m.parent) m.bridged = m.bridged || t; });
    if (n.parent !== deep.id) {
      var old = node(cloud, n.parent);
      if (old && old.path) old.path.ids = old.path.ids.filter(function (x) { return x !== id; });
      n.parent = deep.id; n.role = ""; n.off = null; out.moved = true;
    }
    if (it && it.card && it.card.blurb && !n.blurb) setBlurb(cloud, id, it.card.blurb);
    out.created = res.parentsCreated.concat(res.created, res.promoted);
    out.chain = chainOf(cloud, id);
    cloud.rev += 1;
    return out;
  }

  /*
   * Child topics that arrived with a lesson (the same call) but wait until the learner has engaged with the topic
   * (orchestrator.js decides when); applyPending then grows them onto the cloud as dotted branches.
   */
  function setPending(cloud, id, steps, nextLabel) {
    var n = node(cloud, id);
    if (!n || n.path) return false;
    var list = [];
    (Array.isArray(steps) ? steps : []).forEach(function (x) { var l = cleanLabel(x); if (l && list.length < LIMITS.pathSteps && list.every(function (y) { return norm(y) !== norm(l); })) list.push(l); });
    if (!list.length) return false;
    n.pending = { steps: list, next: cleanLabel(nextLabel) };
    return true;
  }
  function applyPending(cloud, id, t) {
    var n = node(cloud, id);
    if (!n || !n.pending) return null;
    var p = n.pending;
    n.pending = null;
    if (n.path) return { ids: [], added: [], next: null };
    return applyPath(cloud, id, p.steps, p.next, t);
  }
  var TEST_PASS = 0.6;
  function testOf(cloud, id) { return (cloud.tests || {})[id] || null; }
  function markOffered(cloud, id, t) {
    if (!node(cloud, id)) return;
    cloud.tests = cloud.tests || {};
    var x = cloud.tests[id] || { at: 0, n: 0, best: 0, attempts: 0, offeredAt: 0, passAt: 0 };
    if (!x.offeredAt) x.offeredAt = now_(t);
    cloud.tests[id] = x;
  }
  /*
   * A test result: results = [{ id, right }] for completed topics under (or equal to) the parent. Each answer colours its
   * own topic (confirm); any attempt strengthens the parent a little, a pass (TEST_PASS of answers right) more.
   */
  function recordTest(cloud, pid, results, t) {
    t = now_(t);
    var p = node(cloud, pid);
    if (!p) return null;
    var n = 0, right = 0, touched = [];
    (Array.isArray(results) ? results : []).forEach(function (r) {
      if (!r || !cloud.nodes[r.id] || (r.id !== pid && ancestry(cloud, r.id).indexOf(pid) < 0)) return;
      n++; if (r.right) right++;
      confirm(cloud, r.id, Boolean(r.right), t);
      if (touched.indexOf(r.id) < 0) touched.push(r.id);
    });
    if (!n) return null;
    var score = right / n, passed = score >= TEST_PASS;
    p.weight += 0.5; p.touched = t;
    warm(p, HEAT.test, t);
    if (passed) { p.correct = (p.correct || 0) + 2; p.mastery = clamp01(p.mastery + 0.15); }
    else if (right) p.correct = (p.correct || 0) + 1;
    cloud.tests = cloud.tests || {};
    var prev = cloud.tests[pid] || { at: 0, n: 0, best: 0, attempts: 0, offeredAt: 0 };
    cloud.tests[pid] = { at: t, n: doneChildren(cloud, pid).length, best: Math.max(prev.best || 0, score), attempts: (prev.attempts || 0) + 1, offeredAt: prev.offeredAt || t, passAt: passed ? t : prev.passAt || 0 }; /* passAt: the last passing attempt (a merge trigger) */
    cloud.rev += 1;
    return { score: score, right: right, n: n, passed: passed, touched: touched };
  }

  /*
   * v5: Computer Science is its own subject. Older clouds get it (with its own hue), and the clearly-CS topics under
   * Making & Coding move across with everything they hold (ids, paths, cards, deck entries). Nothing is seeded: the
   * subject is only created when there is something to move.
   */
  function adoptComputerScience(cloud, t) {
    t = now_(t);
    var label = "Computer Science";
    var cs = subjects(cloud).filter(function (x) { return x.key === norm(label); })[0];
    var making = subjects(cloud).filter(function (x) { return x.key === norm("Making & Coding"); })[0];
    var keys = CS_TOPICS.map(norm), moved = [], created = false;
    var movable = making ? childrenOf(cloud, making.id).filter(function (c) { return keys.indexOf(c.key) >= 0; }) : [];
    if (!cs) {
      if (!movable.length) return { moved: moved, created: false };
      cs = addNode(cloud, { label: label, parent: null, weight: 1, born: t });
      created = true;
    }
    if (making) childrenOf(cloud, making.id).filter(function (c) { return keys.indexOf(c.key) >= 0; }).forEach(function (c) {
      var twin = childrenOf(cloud, cs.id).filter(function (x) { return x.key === c.key; })[0];
      if (twin) { if (twin.ghost && !childrenOf(cloud, twin.id).length) removeNode(cloud, twin.id); else return; }
      c.parent = cs.id;
      moved.push(c.id);
      cs.weight += Math.max(0, c.weight) * 0.5;
    });
    if (making && making.path) {
      making.path.ids = making.path.ids.filter(function (x) { return moved.indexOf(x) < 0; });
      if (moved.indexOf(making.path.next) >= 0) making.path.next = null;
      if (!making.path.ids.length) making.path = null;
    }
    if (moved.length || created) cloud.rev += 1;
    return { moved: moved, created: created };
  }

  /* Other branches, offered only once a branch has ended: unfinished nearby branches first, then one from another subject. Local, no call. */
  /* prefer: ids in ranked order (the top 10); the first nearby one of them moves to the front. */
  function otherBranches(cloud, id, max, prefer) {
    max = max || 3;
    var n = node(cloud, id), out = [], near = [];
    if (!n) return out;
    var ok = function (x) { var m = cloud.nodes[x]; return m && m.parent && m.mastery < MASTERED && !m.end && x !== id && !isAncestor(cloud, id, x) && ancestry(cloud, id).indexOf(x) < 0 && out.indexOf(x) < 0; };
    ancestry(cloud, id).slice(0, -1).reverse().forEach(function (a) {
      var an = cloud.nodes[a];
      (an.path ? an.path.ids : []).concat(childrenOf(cloud, a).map(function (c) { return c.id; })).forEach(function (x) { if (near.indexOf(x) < 0 && ok(x)) near.push(x); });
    });
    var pref = (Array.isArray(prefer) ? prefer : []).filter(function (x) { return near.indexOf(x) >= 0; })[0];
    if (pref) near = [pref].concat(near.filter(function (x) { return x !== pref; }));
    near.slice(0, max - 1).forEach(function (x) { out.push(x); });
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
   * [id, label, parent, flags, weight*10, mastery*100, born(s), touched(s), hue, struggle(s), spent(s), engaged,
   *  then only when set: correct answers, heat*100, heatAt(s), blurb, achieved(s)]
   * (flags: 1 ghost, 2 opened, 4 branch ends here). New fields go on the end of the array, so older saves still load.
   * p: paths { id: [stepIds, next, at] }, f: forks { id: [choiceIds, whys, picked, at] },
   * k: the deck [[id, label, subject, hue, joined(s), best stage, chain labels, blurb, achieved(s)]], g: draw log [[day, id]], ss: session count.
   * Node.cards and keys are rebuilt on load.
   */
  function serialize(cloud) {
    var s = function (ms) { return ms ? Math.round(ms / 1000) : 0; };
    var paths = {}, forks = {};
    var n = cloud.order.map(function (id) {
      var x = cloud.nodes[id];
      if (x.path && x.path.ids.length) paths[id] = [x.path.ids, x.path.next || 0, s(x.path.at)];
      if (x.fork && x.fork.ids.length) forks[id] = [x.fork.ids, x.fork.why, x.fork.picked || 0, s(x.fork.at)];
      var row = [id, x.label, x.parent || 0, (x.ghost ? 1 : 0) | (x.opened ? 2 : 0) | (x.end ? 4 : 0), Math.round(x.weight * 10), Math.round(x.mastery * 100), s(x.born), s(x.touched), x.parent ? -1 : (x.hue == null ? 30 : x.hue), s(x.lastStruggle), x.spent || 0, x.engaged || 0];
      /* v4 and v5 fields only when set, so most rows stay short */
      var v9 = x.pre && x.pre.length;
      var v8 = v9 || x.ml || x.mergedAt || x.repaired;
      var v7 = v8 || x.role || x.off || x.made || x.bridged || x.absorbedInto || (x.absorbed && x.absorbed.length);
      var v6 = v7 || x.imp != null || x.goal || x.asked, v5 = v6 || x.pending || x.doneAt;
      if (v5 || x.correct || x.heat || x.blurb || x.achievedAt) row.push(x.correct || 0, Math.round((x.heat || 0) * 100), s(x.heatAt), x.blurb || "", s(x.achievedAt));
      if (v5) row.push(x.pending ? [x.pending.steps, x.pending.next || ""] : 0, s(x.doneAt));
      if (v6) row.push(x.imp == null ? -1 : Math.round(x.imp * 100), s(x.impAt), x.goal || "", x.asked || 0);
      if (v7) row.push(x.role === "core" ? 1 : x.role === "optional" ? 2 : 0, x.off || 0, x.made ? 1 : 0, s(x.bridged), x.absorbedInto || 0, x.absorbed && x.absorbed.length ? x.absorbed : 0);
      if (v8) row.push(x.ml || 0, s(x.mergedAt), s(x.repaired));
      if (v9) row.push(x.pre.slice());
      return row;
    });
    var tests = {};
    Object.keys(cloud.tests || {}).forEach(function (id) { var x = cloud.tests[id]; if (cloud.nodes[id]) tests[id] = [s(x.at), x.n || 0, Math.round((x.best || 0) * 100), x.attempts || 0, s(x.offeredAt), s(x.passAt)]; });
    var sg = cloud.suggest && Array.isArray(cloud.suggest.items) ? [s(cloud.suggest.at), cloud.suggest.items.map(function (i) { return [i.id, i.kind, i.why || ""]; })] : 0;
    return JSON.stringify({ v: VERSION, name: cloud.name, seq: cloud.seq, rev: cloud.rev, created: cloud.created, next: cloud.next || 0, n: n, p: paths, f: forks, cards: cloud.cards,
      k: (cloud.deck || []).map(function (e) { var r = [e.id, e.label, e.subject, e.hue, s(e.at), e.best || 0, e.chain || [], e.blurb || "", s(e.ach)]; if (e.tb || e.ml || e.inn || (e.co && e.co.length)) r.push(e.tb || 0, e.ml || 0, e.inn || 0, e.co && e.co.length ? e.co : 0); return r; }), g: cloud.draws || [], ss: cloud.sessions || 0,
      t: tests, sg: sg, fl: cloud.active || 0, pr: profileRow(cloud.profile),
      ev: (cloud.events || []).map(function (e) { return [s(e.t), e.k, e.id, e.lv || 0, e.ids || [], e.why || ""]; }), mo: motifMap(cloud) });
  }
  /* the card motifs, { id: motif }, only for nodes that have one (an optional v9 field: older v9 readers ignore it) */
  function motifMap(cloud) {
    var m = {};
    cloud.order.forEach(function (id) { var x = cloud.nodes[id]; if (x.motif) m[id] = x.motif; });
    return Object.keys(m).length ? m : undefined;
  }
  function profileRow(p) {
    p = p || newProfile();
    var s = function (ms) { return ms ? Math.round(ms / 1000) : 0; };
    /* v8 row shape; slots 0-2 and 8 (the old age band, region, region-guess flag and changedAt) are always written empty */
    var d = p.dir || newDir();
    return ["", "", 0, p.interests || [], s(p.onboarded), s(p.askedAt), p.visits || 0, p.lessonVisit || 0, 0,
      [s(d.off), d.n || 0, s(d.seen), s(d.prev), s(d.quiet), (d.hide || []).slice(-24), (d.later || []).slice(0, 4)]];
  }
  function profileFrom(a) {
    var p = newProfile();
    if (!Array.isArray(a)) return p;
    /* a[0..2] and a[8] (age band, region, region-guess flag, changedAt from older saves) are ignored */
    p.interests = (Array.isArray(a[3]) ? a[3] : []).map(cleanInterest).filter(Boolean).slice(-12);
    var ms = function (x) { return (Number(x) || 0) * 1000; };
    p.onboarded = ms(a[4]); p.askedAt = ms(a[5]); p.visits = Math.max(0, Number(a[6]) || 0); p.lessonVisit = Math.max(0, Number(a[7]) || 0);
    var d = Array.isArray(a[9]) ? a[9] : [];
    p.dir = { off: ms(d[0]), n: Math.max(0, Math.min(9, Math.floor(Number(d[1]) || 0))), seen: ms(d[2]), prev: ms(d[3]), quiet: ms(d[4]),
      hide: (Array.isArray(d[5]) ? d[5] : []).filter(function (k) { return typeof k === "string" && k.length <= 80; }).slice(-24),
      later: (Array.isArray(d[6]) ? d[6] : []).map(cleanLabel).filter(Boolean).slice(0, 4) };
    return p;
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
      if (ids.length) n.path = { ids: ids, next: ids.indexOf(p.next || p[1]) >= 0 ? (p.next || p[1]) : null, at: Number(Array.isArray(p) ? p[2] * 1000 : p.at) || 0 }; /* arrays have an .at() method, so check the form first */
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
      out.deck.push({
        id: e[0], label: cleanLabel(e[1]) || "Card", subject: cleanLabel(e[2]), hue: Number.isFinite(e[3]) ? e[3] : SEPIA, at: (Number(e[4]) || 0) * 1000, best: Math.max(0, Math.min(4, Number(e[5]) || 0)),
        chain: (Array.isArray(e[6]) ? e[6] : []).map(cleanLabel).filter(Boolean).slice(-8), blurb: cleanBlurb(e[7] || ""), ach: (Number(e[8]) || 0) * 1000,
        tb: Math.max(0, Math.min(4, Math.floor(Number(e[9]) || 0))), ml: Math.max(0, Math.min(99, Math.floor(Number(e[10]) || 0))), inn: typeof e[11] === "string" ? e[11] : null,
        co: (Array.isArray(e[12]) ? e[12] : []).filter(function (x) { return Array.isArray(x) && typeof x[0] === "string"; }).map(function (x) { return [x[0], cleanLabel(x[1]) || "Card"]; }).slice(0, 60)
      });
    });
    out.draws = (Array.isArray(extra.draws) ? extra.draws : []).filter(function (d) { return Array.isArray(d) && Number.isFinite(d[0]) && typeof d[1] === "string"; }).slice(-LIMITS.draws);
    out.sessions = Math.max(0, Number(extra.sessions) || 0);
    out.next = out.nodes[c.next] ? c.next : null;
    out.tests = {};
    Object.keys(extra.tests || {}).forEach(function (id) {
      var x = extra.tests[id];
      if (!out.nodes[id] || !Array.isArray(x)) return;
      out.tests[id] = { at: (Number(x[0]) || 0) * 1000, n: Math.max(0, Number(x[1]) || 0), best: clamp01((Number(x[2]) || 0) / 100), attempts: Math.max(0, Number(x[3]) || 0), offeredAt: (Number(x[4]) || 0) * 1000, passAt: (Number(x[5]) || 0) * 1000 };
    });
    var sg = extra.suggest;
    out.suggest = Array.isArray(sg) && Array.isArray(sg[1]) ? { at: (Number(sg[0]) || 0) * 1000, items: sg[1].filter(function (i) { return Array.isArray(i) && out.nodes[i[0]] && /^(deck|next|test|new|continue|grow)$/.test(i[1]); }).slice(0, 6).map(function (i) { return { id: i[0], kind: i[1], why: cleanWhy(i[2]) }; }) } : null;
    out.active = out.nodes[extra.active] ? extra.active : null;
    out.profile = profileFrom(extra.profile);
    out.events = (Array.isArray(extra.events) ? extra.events : []).filter(function (e) { return Array.isArray(e) && typeof e[1] === "string" && typeof e[2] === "string"; }).slice(-EVENTS_MAX)
      .map(function (e) { return { t: (Number(e[0]) || 0) * 1000, k: e[1], id: e[2], lv: Math.max(0, Number(e[3]) || 0), ids: (Array.isArray(e[4]) ? e[4] : []).filter(function (x) { return typeof x === "string"; }), why: String(e[5] || "").slice(0, 12) }; });
    joinDeck(out, Number(c.created) || 0); /* older saves: topics already past the threshold join the deck */
    return out;
  }

  /* Validates stored JSON (v4, v3 or v2, or v1 which is migrated forward without loss); null when unusable. */
  function deserialize(str) {
    var c;
    try { c = typeof str === "string" ? JSON.parse(str) : str; } catch { return null; }
    if (!c || typeof c.name !== "string") return null;
    var base = { name: cleanLabel(c.name) || "Me", seq: Number(c.seq) || 0, rev: Number(c.rev) || 0, created: Number(c.created) || 0, next: c.next || null };
    if (c.v >= 2 && c.v <= 9 && Array.isArray(c.n)) {
      var ms = function (s) { return (Number(s) || 0) * 1000; };
      var list = c.n.map(function (a) {
        if (!Array.isArray(a) || typeof a[0] !== "string" || typeof a[1] !== "string") return null;
        return {
          id: a[0], label: cleanLabel(a[1]), key: norm(a[1]), parent: a[2] || null, ghost: Boolean(a[3] & 1), opened: Boolean(a[3] & 2),
          weight: (Number(a[4]) || 0) / 10, mastery: clamp01((Number(a[5]) || 0) / 100), born: ms(a[6]), touched: ms(a[7]),
          hue: a[2] ? undefined : (Number.isFinite(a[8]) && a[8] >= 0 ? a[8] : 30), lastStruggle: a[9] ? ms(a[9]) : undefined, cards: [],
          end: Boolean(a[3] & 4), spent: Math.max(0, Number(a[10]) || 0), engaged: Math.max(0, Number(a[11]) || 0),
          correct: Math.max(0, Number(a[12]) || 0), heat: Math.max(0, Number(a[13]) || 0) / 100, heatAt: ms(a[14]), blurb: cleanBlurb(a[15] || ""), achievedAt: ms(a[16]),
          pending: Array.isArray(a[17]) && Array.isArray(a[17][0]) && a[17][0].length ? { steps: a[17][0].map(cleanLabel).filter(Boolean).slice(0, LIMITS.pathSteps), next: cleanLabel(a[17][1]) } : null,
          doneAt: ms(a[18]),
          imp: Number.isFinite(a[19]) && a[19] >= 0 ? clamp01(a[19] / 100) : null, impAt: ms(a[20]), goal: cleanGoal(a[21] || ""), asked: Math.max(0, Number(a[22]) || 0),
          role: a[23] === 1 ? "core" : a[23] === 2 ? "optional" : "", off: typeof a[24] === "string" ? a[24] : null, made: a[25] === 1, bridged: ms(a[26]),
          absorbedInto: typeof a[27] === "string" ? a[27] : null, absorbed: Array.isArray(a[28]) ? a[28].filter(function (x) { return typeof x === "string"; }) : [],
          ml: Math.max(0, Math.min(99, Math.floor(Number(a[29]) || 0))), mergedAt: ms(a[30]), repaired: ms(a[31]),
          pre: Array.isArray(a[32]) ? a[32].filter(function (x) { return typeof x === "string"; }).slice(0, PRE_MAX) : [],
          motif: ""
        };
      });
      /* v8 and older: no prerequisites; completion is stamped with the rules it was earned under (no gate), so nothing regresses */
      gateOff = c.v < 9;
      var out;
      try { out = finish(base, list, c.cards, c.p, { forks: c.f, deck: c.k, draws: c.g, sessions: c.ss, tests: c.t, suggest: c.sg, active: c.fl, profile: c.pr, events: c.ev }); } finally { gateOff = false; }
      if (c.mo && typeof c.mo === "object") Object.keys(c.mo).forEach(function (id) { if (out.nodes[id]) out.nodes[id].motif = cleanMotif(c.mo[id]); });
      var nowS = Math.round(Date.now() / 1000) * 1000; /* whole seconds, as stored, so a migrated cloud round-trips exactly */
      if (c.v < 5) adoptComputerScience(out, nowS); /* v4 and older: Computer Science becomes its own subject */
      if (c.v < 6) { pruneSeeds(out); joinDeck(out, nowS); } /* v5 and older: untouched starter seeds go; everything learned stays */
      if (c.v < 7) markCore(out); /* v6 and older: the steps of each path become its core sequence */
      tidyRefs(out);
      return out;
    }
    if (c.v === 1 && c.nodes && Array.isArray(c.order)) return migrateV1(c, base);
    return null;
  }

  /* v1 (subjects -> topics only, object nodes). Everything the learner touched is kept; untouched starter seeds are pruned. */
  function migrateV1(c, base) {
    var list = c.order.map(function (id) {
      var n = c.nodes[id];
      if (!n || typeof n.label !== "string") return null;
      return {
        id: id, label: cleanLabel(n.label), key: norm(n.label), parent: n.parent || null, ghost: Boolean(n.ghost), opened: false,
        weight: Number(n.weight) || 0, mastery: clamp01(Number(n.mastery) || 0), born: Number(n.born) || 0, touched: Number(n.touched) || 0,
        hue: n.parent ? undefined : (Number.isFinite(n.hue) ? n.hue : 30), lastStruggle: n.lastStruggle || undefined, cards: [],
        spent: 0, engaged: 0, end: false, correct: 0, heat: 0, heatAt: 0, blurb: "", achievedAt: 0, pending: null, doneAt: 0, imp: null, impAt: 0, goal: "", asked: 0,
        role: "", off: null, made: false, bridged: 0, absorbedInto: null, absorbed: [], ml: 0, mergedAt: 0, repaired: 0, pre: [], motif: ""
      };
    });
    gateOff = true;
    var out;
    try { out = finish(base, list, c.cards, {}); } finally { gateOff = false; }
    var t = Date.now();
    adoptComputerScience(out, t);
    pruneSeeds(out);
    joinDeck(out, t);
    return out;
  }

  /* v7 migration: a path's steps are its core sequence; every other child keeps no role (shown and counted as before). */
  function markCore(cloud) {
    all(cloud).forEach(function (n) { if (n.path) n.path.ids.forEach(function (x) { var k = cloud.nodes[x]; if (k && k.parent === n.id && !k.role) k.role = "core"; }); });
  }
  /* References that must point at a live node of the right kind (side path step, absorb links). */
  function tidyRefs(cloud) {
    all(cloud).forEach(function (n) {
      if (n.off && (!cloud.nodes[n.off] || cloud.nodes[n.off].parent !== n.parent || n.role !== "optional")) n.off = null;
      if (n.absorbedInto && (!cloud.nodes[n.absorbedInto] || n.parent !== n.absorbedInto)) n.absorbedInto = null;
      n.absorbed = (n.absorbed || []).filter(function (x) { return cloud.nodes[x] && cloud.nodes[x].absorbedInto === n.id; });
    });
    /* v9: prerequisites must be live topics, never the topic, its ancestors or descendants, and never a cycle (re-added in order) */
    all(cloud).forEach(function (n) { var want = n.pre || []; n.pre = []; if (want.length) addPrereqs(cloud, n.id, want.filter(function (x) { return cloud.nodes[x]; })); });
  }

  /* Thread persistence: keep the most recent messages only. */
  function trimThread(msgs, max) {
    max = max || 60;
    return (Array.isArray(msgs) ? msgs : []).filter(function (m) { return m && typeof m.text === "string" && (/^(user|model|card|grow)$/.test(m.role) || (m.role === "ask" && m.done)); }).slice(-max); /* answered questions stay; open ones are asked again */
  }

  var api = {
    VERSION: VERSION, LIMITS: LIMITS, STORE: STORE, subjectSlot: subjectSlot, promptSubjects: promptSubjects, promptView: promptView, prune: prune, MASTERED: MASTERED, OLD_SEEDS: OLD_SEEDS, HUES: HUES, subjectHue: subjectHue, plant: plant,
    newProfile: newProfile, profileOf: profileOf, dirOf: dirOf, setLater: setLater, setProfile: setProfile, topicCount: topicCount,
    TIERS: TIERS, TIER_NAMES: TIER_NAMES, TIER_STAGE: TIER_STAGE, ACHIEVE_RIGHT: ACHIEVE_RIGHT, roman: roman, tierOf: tierOf, mergeLevel: mergeLevel, mergeInto: mergeInto, corpusOf: corpusOf, absorbedInto: absorbedInto,
    GATE: GATE, needOf: needOf, gateCore: gateCore, coreProgress: coreProgress, prereqs: prereqs, lockedBy: lockedBy, completable: completable, addPrereqs: addPrereqs, PRE_MAX: PRE_MAX,
    checkChain: checkChain, applyRepair: applyRepair, moveUnder: moveUnder, EVENTS_MAX: EVENTS_MAX,
    applyCreate: applyCreate, pruneSeeds: pruneSeeds, deepenChain: deepenChain, applyBridge: applyBridge, coreChildren: coreChildren, doneCore: doneCore, sidePaths: sidePaths, absorbable: absorbable, markCore: markCore,
    create: create, applyTopics: applyTopics, addGhosts: addGhosts, applyPath: applyPath, nextFor: nextFor, engage: engage,
    track: track, markEnd: markEnd, activity: activity, hueOf: hueOf,
    GROWTH: GROWTH, growthOf: growthOf, joinDeck: joinDeck, chainOf: chainOf, confirm: confirm, setBlurb: setBlurb, cleanBlurb: cleanBlurb,
    isAchieved: isAchieved, placeChain: placeChain, HEAT: HEAT, heatNow: heatNow, inDeck: inDeck, deckEntry: deckEntry, logDraw: logDraw,
    isDone: isDone, doneChildren: doneChildren, setPending: setPending, applyPending: applyPending, TEST_PASS: TEST_PASS, testOf: testOf,
    markOffered: markOffered, recordTest: recordTest, adoptComputerScience: adoptComputerScience, CS_TOPICS: CS_TOPICS,
    evolveColor: evolveColor, cardColor: cardColor, toneOf: toneOf, MOTIFS: MOTIFS, cleanMotif: cleanMotif, applyChoices: applyChoices, pickChoice: pickChoice, isTerminal: isTerminal, otherBranches: otherBranches, hash: hash,
    attachCard: attachCard, cardsFor: cardsFor, summarize: summarize, knownUnder: knownUnder, subjectLabels: subjectLabels,
    subjects: subjects, childrenOf: childrenOf, ancestry: ancestry, depthOf: depthOf, subjectOf: subjectOf, trail: trail, index: index,
    findSubject: findSubject, findTopic: findTopic, findAny: findAny, norm: norm, cleanLabel: cleanLabel,
    colorOf: colorOf, levelScale: levelScale, layout: layout, serialize: serialize, deserialize: deserialize, trimThread: trimThread
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IkoCloud = api;
})(typeof window !== "undefined" ? window : this);
