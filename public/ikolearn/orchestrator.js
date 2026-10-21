/*
 * IkoLearn orchestrator: decides, on the device and with no model calls, what to offer next.
 *   suggest()      a short set of cards to pick up (a ready test, the next step in an active chain, a deck card, something new)
 *   draw()         one card for the holder: a weighted deck draw with light subject balancing, else the best suggestion
 *   wantChildren() whether a lesson call should also bring this topic's child topics (piggybacked on the same call)
 *   childrenReady() whether child topics that arrived with a lesson may now grow onto the cloud (the topic was engaged)
 *   testState()    whether a parent is ready for a test, built only from what has been completed under it
 *   lessonContext() / testRequest()  the prompt context for the one call that follows
 * It reads the cloud, the deck, completion and the ranking (rank.js). It never calls the model itself.
 */
(function (root) {
  "use strict";
  /* eslint-disable @typescript-eslint/no-require-imports -- UMD: Node tests load the modules, the browser has globals */
  var node_ = typeof module !== "undefined" && module.exports;
  var C = node_ ? require("./cloud-model.js") : root.IkoCloud;
  var D = node_ ? require("./deck.js") : root.IkoDeck;
  var RK = node_ ? require("./rank.js") : root.IkoRank;
  /* eslint-enable @typescript-eslint/no-require-imports */

  var PLAN = {
    suggest: 3,
    /* a topic counts as engaged (its waiting child topics grow) after a right answer, "I've got it", a second visit or 2 minutes reading */
    engaged: { correct: 1, visits: 2, seconds: 120 },
    /* a test is offered for a parent once 3 of its child topics are completed, or every step of its path (at least 2);
       after an attempt it is offered again once 2 more are completed */
    test: { minDone: 3, pathAll: 2, again: 2, questions: 5 },
    /* chains touched within this many days count as active (their next step is suggested) */
    recentDays: 10,
    depth: 7
  };
  var DAY = 86400000;

  function nodeOf(cloud, id) { return id && cloud.nodes[id] ? cloud.nodes[id] : null; }
  function scores(cloud, now) { return RK ? RK.scores(cloud, now) : {}; }
  function topRank(cloud, now) { var out = {}; (RK ? RK.top(cloud, { now: now }) : []).forEach(function (r) { out[r.id] = r.rank; }); return out; }

  function engaged(cloud, id) {
    var n = nodeOf(cloud, id), E = PLAN.engaged;
    if (!n || n.ghost) return false;
    return (n.correct || 0) >= E.correct || n.mastery >= C.MASTERED || (n.engaged || 0) >= E.visits || (n.spent || 0) >= E.seconds;
  }
  /* Ask the lesson call for child topics when the topic has none yet, isn't an end, and nothing is already waiting. */
  function wantChildren(cloud, id) {
    var n = nodeOf(cloud, id);
    return Boolean(n && !n.path && !n.end && !n.pending && C.depthOf(cloud, id) < PLAN.depth);
  }
  function childrenReady(cloud, id) { var n = nodeOf(cloud, id); return Boolean(n && n.pending && engaged(cloud, id)); }

  /*
   * A parent's children in the order to offer them: its path in learning order first (foundational before advanced, as
   * mapped), then any other children by rank (usage and popularity), explored ones before dotted ones.
   */
  function orderedChildren(cloud, pid, sc) {
    var n = nodeOf(cloud, pid);
    if (!n) return [];
    sc = sc || scores(cloud);
    var path = n.path ? n.path.ids.filter(function (x) { return nodeOf(cloud, x); }) : [];
    var rest = C.childrenOf(cloud, pid).map(function (c) { return c.id; }).filter(function (x) { return path.indexOf(x) < 0; });
    rest = rest.map(function (x, i) { var c = cloud.nodes[x]; return { id: x, i: i, s: (sc[x] || 0) + (c.ghost ? 0 : 0.5) }; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; }).map(function (x) { return x.id; });
    return path.concat(rest);
  }
  /* The next unfinished child of a parent in that order (null when all are done). */
  function nextChild(cloud, pid, sc) {
    var ids = orderedChildren(cloud, pid, sc);
    for (var i = 0; i < ids.length; i++) if (!C.isDone(cloud, ids[i])) return ids[i];
    return null;
  }
  /* Fork choices in display order: by rank, keeping each choice's reason with it. */
  function orderChoices(cloud, fork, sc) {
    if (!fork || !fork.ids) return [];
    sc = sc || scores(cloud);
    return fork.ids.map(function (id, i) { return { id: id, why: fork.why[i] || "", i: i, s: sc[id] || 0 }; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; });
  }

  /* ---------- tests ---------- */
  function testState(cloud, pid) {
    var p = nodeOf(cloud, pid), T = PLAN.test;
    if (!p || p.ghost) return null;
    var done = C.doneChildren(cloud, pid);
    var steps = p.path ? p.path.ids.filter(function (x) { return nodeOf(cloud, x); }) : [];
    var pathAll = steps.length >= T.pathAll && steps.every(function (x) { return C.isDone(cloud, x); });
    var enough = done.length >= T.minDone || pathAll;
    var t = C.testOf(cloud, pid), tried = Boolean(t && t.attempts);
    var fresh = !tried || done.length >= (t.n || 0) + T.again;
    return {
      id: pid, ready: enough && fresh, done: done, taken: tried, best: t ? t.best || 0 : 0, attempts: t ? t.attempts || 0 : 0,
      need: enough ? 0 : Math.max(0, Math.min(T.minDone - done.length, steps.length ? steps.filter(function (x) { return !C.isDone(cloud, x); }).length : T.minDone))
    };
  }
  /* Every parent with a test ready, highest ranked first. */
  function readyTests(cloud, now) {
    var sc = scores(cloud, now), out = [];
    cloud.order.forEach(function (id) { var s = testState(cloud, id); if (s && s.ready) out.push(s); });
    return out.sort(function (a, b) { return (sc[b.id] || 0) - (sc[a.id] || 0) || b.done.length - a.done.length; });
  }
  /* What a test may be built from: the parent (if its lesson was opened) and its completed children, with their card lines. */
  function testRequest(cloud, pid) {
    var p = nodeOf(cloud, pid), st = testState(cloud, pid);
    if (!p || !st) return null;
    var items = [];
    if (p.opened || C.isDone(cloud, pid)) items.push({ label: p.label, line: p.blurb || "" });
    st.done.forEach(function (x) { var c = cloud.nodes[x]; items.push({ label: c.label, line: c.blurb || "" }); });
    return { focus: p.label, trail: C.trail(cloud, pid), material: items.slice(0, 8), ids: [pid].concat(st.done) };
  }

  /* ---------- suggestions and Draw ---------- */
  /* Next steps in chains the learner is working in (touched lately), the busiest chain first. */
  function nextSteps(cloud, now, sc) {
    var out = [], since = now - PLAN.recentDays * DAY;
    cloud.order.forEach(function (pid) {
      var p = cloud.nodes[pid];
      if (!p || p.ghost || !p.touched || p.touched < since || C.isTerminal(cloud, pid)) return;
      var x = nextChild(cloud, pid, sc);
      if (!x || x === pid) return;
      out.push({ id: x, pid: pid, s: (sc[pid] || 0) + (sc[x] || 0) * 0.5 + p.touched / 1e14 });
    });
    return out.sort(function (a, b) { return b.s - a.s; });
  }
  /* Something new, lightly balanced: the next topic in the subject with the least going on (yearly draws, then weight). */
  function explore(cloud, now, sc, skip) { return exploreAll(cloud, now, sc, skip, 1)[0] || null; }
  /* One pick per subject, quietest subject first (up to max). */
  function exploreAll(cloud, now, sc, skip, max) {
    var day = D.dayOf(now), drawn = {}, out = [];
    D.balance(cloud, day).forEach(function (r) { drawn[r.subject] = r.draws; });
    var subs = C.subjects(cloud).slice().sort(function (a, b) { return (drawn[a.label] || 0) - (drawn[b.label] || 0) || a.weight - b.weight || cloud.order.indexOf(a.id) - cloud.order.indexOf(b.id); });
    for (var i = 0; i < subs.length && out.length < max; i++) {
      var x = C.nextFor(cloud, subs[i].id);
      if (!x || C.isDone(cloud, x) || skip(x)) x = nextChild(cloud, subs[i].id, sc);
      if (x && !skip(x)) out.push({ id: x, subject: subs[i].label });
    }
    return out;
  }

  /*
   * A short set of cards to pick up: a ready test first, then the next step in the busiest chain, a deck card (the
   * weighted, balanced draw), and something new; the rest ordered by rank so the top 10 visibly comes first.
   * -> [{ id, kind: "test"|"next"|"deck"|"new", why, top }] and kept on the cloud (cloud.suggest). No calls.
   */
  function suggest(cloud, opts) {
    opts = opts || {};
    var now = opts.now || Date.now(), n = opts.n || PLAN.suggest, sc = scores(cloud, now), tops = topRank(cloud, now);
    var out = [], seen = {}, exclude = opts.exclude || {};
    var skip = function (id) { return !nodeOf(cloud, id) || seen[id] || exclude[id]; };
    var add = function (id, kind, why) { if (skip(id) && kind !== "test") return false; if (kind === "test" && seen["t:" + id]) return false; seen[kind === "test" ? "t:" + id : id] = 1; out.push({ id: id, kind: kind, why: why, top: tops[id] || 0 }); return true; };
    var tests = readyTests(cloud, now);
    if (tests[0]) { add(tests[0].id, "test", "Ready for a test"); C.markOffered(cloud, tests[0].id, now); }
    var steps = nextSteps(cloud, now, sc);
    if (steps[0]) add(steps[0].id, "next", "Next in " + cloud.nodes[steps[0].pid].label);
    var deck = (cloud.deck || []).length ? D.drawSession(cloud, { day: D.dayOf(now), size: 4, seed: opts.seed }) : [];
    deck.some(function (id) { return add(id, "deck", "From your deck"); });
    var ex = exploreAll(cloud, now, sc, skip, n + 1);
    if (ex[0]) add(ex[0].id, "new", "Something new in " + ex[0].subject);
    steps.slice(1).forEach(function (s) { if (out.length < n + 1) add(s.id, "next", "Next in " + cloud.nodes[s.pid].label); });
    deck.forEach(function (id) { if (out.length < n + 1) add(id, "deck", "From your deck"); });
    /* a new learner: more first steps, each from a different subject */
    ex.slice(1).forEach(function (e) { if (out.length < n) add(e.id, "new", "A first step in " + e.subject); });
    var head = out.filter(function (x) { return x.kind === "test"; }).slice(0, 1);
    var rest = out.filter(function (x) { return x.kind !== "test"; }).slice(0, n + 1 - head.length);
    /* ranking orders the offer: top-10 topics first (by their place), then by score; the kind order breaks ties */
    rest = rest.map(function (x, i) { return { x: x, i: i, s: (x.top ? 10 - x.top + 2 : 0) + (sc[x.id] || 0) }; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; }).map(function (r) { return r.x; });
    var items = head.concat(rest).slice(0, n);
    /* free exploration stays on the table: something new always keeps the last place */
    var fresh = out.filter(function (x) { return x.kind === "new"; })[0];
    if (fresh && n >= 3 && items.indexOf(fresh) < 0) items[items.length - 1] = fresh;
    items.forEach(function (x) { if (x.top && x.kind !== "test") x.why = "In your top 10 · " + x.why; });
    cloud.suggest = { at: now, items: items.map(function (x) { return { id: x.id, kind: x.kind, why: x.why }; }) };
    return items;
  }

  /*
   * Draw: one card for the holder. From the deck (the weighted shuffle: subject balance over the year, review timing,
   * struggles, a nudge from the top 10), skipping the card already open; with an empty deck, the best suggestion.
   * The draw is logged for the yearly balance. -> node id or null.
   */
  function draw(cloud, opts) {
    opts = opts || {};
    var now = opts.now || Date.now(), day = D.dayOf(now), skipId = opts.skip || null;
    var picks = (cloud.deck || []).length ? D.drawSession(cloud, { day: day, size: 3, seed: opts.seed }) : [];
    var id = picks.filter(function (x) { return x !== skipId && nodeOf(cloud, x); })[0] || null;
    if (!id) {
      var ex = {}; if (skipId) ex[skipId] = 1;
      id = (suggest(cloud, { now: now, exclude: ex, n: 3 }).filter(function (x) { return x.kind !== "test"; })[0] || {}).id || null;
    }
    if (id) C.logDraw(cloud, day, [id]);
    return id;
  }

  /* The prompt context for a lesson call: ask for child topics only when wanted; the planned next step, for the fork. */
  function lessonContext(cloud, id) {
    return { wantPath: wantChildren(cloud, id), ahead: aheadOf(cloud, id) };
  }
  /* The planned next step after this topic: the following unfinished step on a path above it. */
  function aheadOf(cloud, id) {
    var cur = nodeOf(cloud, id), guard = 0;
    while (cur && cur.parent && guard++ < 50) {
      var p = nodeOf(cloud, cur.parent);
      if (p && p.path) {
        var i = p.path.ids.indexOf(cur.id);
        var rest = p.path.ids.slice(i + 1).filter(function (x) { var m = nodeOf(cloud, x); return m && x !== id && !C.isDone(cloud, x); });
        if (rest.length) return cloud.nodes[rest[0]].label;
      }
      cur = p;
    }
    return "";
  }

  var api = {
    PLAN: PLAN, engaged: engaged, wantChildren: wantChildren, childrenReady: childrenReady, orderedChildren: orderedChildren, nextChild: nextChild,
    orderChoices: orderChoices, testState: testState, readyTests: readyTests, testRequest: testRequest, nextSteps: nextSteps, explore: explore, exploreAll: exploreAll,
    suggest: suggest, draw: draw, lessonContext: lessonContext, aheadOf: aheadOf
  };
  if (node_) module.exports = api;
  else root.IkoPlan = api;
})(typeof window !== "undefined" ? window : this);
