/*
 * IkoLearn orchestrator: decides, on the device and with no model calls, what to offer next.
 *   suggest()      a short set of cards to pick up (a ready test, the next step in an active chain, a deck card, something new)
 *   draw()         one card for the holder: a weighted deck draw with light subject balancing, else the best suggestion
 *   wantChildren() whether a lesson call should also bring this topic's child topics (piggybacked on the same call)
 *   childrenReady() whether child topics that arrived with a lesson may now grow onto the cloud (the topic was engaged)
 *   testState()    whether a parent is ready for a test, built only from what has been completed under it
 *   lessonContext() / testRequest() / createRequest()  the prompt context for the one call that follows
 *   onboarding()   the soft opening (one open question, on the device), needsOnboarding() / reask() when to ask
 *   needsNext()    whether a parent is ready for "what comes next" (one creation call, cached, only when needed)
 * It reads the cloud, the deck, completion, the profile and the ranking (rank.js). It never calls the model itself:
 * it decides when a call is worth making and what context goes with it.
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
    /* Where Next in a lesson: the next step plus up to this many other topics in progress */
    whereNext: 3,
    nearDist: 2, /* Where Next: within 2 steps in the tree (a child, a sibling) is a related branch; anything further is for Also in progress */
    related: 2, /* Where Next: up to 2 related or deeper steps after "continue this path" (3 boxes at most) */
    /* a topic counts as engaged (its waiting child topics grow) after a right answer, "I've got it", a second visit or 2 minutes reading */
    engaged: { correct: 1, visits: 2, seconds: 120 },
    /* a test node appears for a parent once its core children are sufficiently complete: at least half of them and
       at least 2 (so 2 of 2, 2 of 4, 3 of 5); after an attempt it is offered again once 2 more children are completed */
    test: { share: 0.5, min: 2, again: 2, questions: 5 },
    /* a node still waiting on a prerequisite ("after X") ranks this much lower, so unlocked topics come first */
    locked: 2,
    /* chains touched within this many days count as active (their next step is suggested) */
    recentDays: 10,
    depth: 7,
    /* onboarding while the learner has fewer than this many topics; a light re-ask at most every few days when the
       cloud is thin (fewer open topics than this) or they seem stuck (this many visits without opening a lesson) */
    thinTopics: 3,
    reask: { days: 3, open: 3, stuckVisits: 3 },
    /* a child's place in the parent's logical order (foundational first) is worth this much against its rank score */
    orderWeight: 0.6,
    /*
     * Directions (0 calls): the cloud as a map, not one course.
     *   invite: "Want to add another direction?" while the cloud has fewer subjects than this, until it is dismissed
     *     or used `invites` times (a second and a third direction), then quiet.
     *   revisit: on a return visit, up to `max` subjects untouched for `days` days, beside "something new"; a
     *     dismissal rests it for `quietDays`.
     *   insight: one soft note, only after real saved progress: `lessons` finished lessons and `right` right answers,
     *     across at least `subjects` subjects. Then a strength (steadyRight right answers and steadyDone finished in
     *     one subject), a connection (a topic building on one from another subject, or two subjects finished side by
     *     side within togetherDays) or growth (growMin finished in one subject within growDays).
     */
    directions: {
      invite: 3, invites: 2,
      revisit: { days: 5, max: 2, quietDays: 7 },
      insight: { lessons: 4, right: 10, subjects: 2, steadyRight: 8, steadyDone: 3, togetherDays: 7, growDays: 14, growMin: 3 }
    }
  };
  var DAY = 86400000;

  function nodeOf(cloud, id) { return id && cloud.nodes[id] ? cloud.nodes[id] : null; }
  /* rank scores, with topics still waiting on a prerequisite moved behind unlocked ones (they stay visible and learnable) */
  function scores(cloud, now) {
    var sc = RK ? RK.scores(cloud, now) : {};
    cloud.order.forEach(function (id) { if (cloud.nodes[id] && C.lockedBy(cloud, id).length) sc[id] = (sc[id] || 0) - PLAN.locked; });
    return sc;
  }
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
   * A parent's children in the order to offer them: the logical order (its path, foundational first, as the model
   * ordered them) mixed with the ranking (the learner's use, chain heat and the model's importance score from the
   * creation call): key = rank score + PLAN.orderWeight x (1 - place / (steps + 1)), explored ones a little ahead of dotted ones.
   * So the first logical step usually leads, but a much more important or much-used child moves up. Nothing is hidden.
   */
  function orderedChildren(cloud, pid, sc) {
    var n = nodeOf(cloud, pid);
    if (!n) return [];
    sc = sc || scores(cloud);
    var path = n.path ? n.path.ids.filter(function (x) { return nodeOf(cloud, x) && cloud.nodes[x].parent === pid; }) : [];
    var L = path.length;
    /* the core sequence (and children from before roles existed); side paths are listed separately (sidePaths) */
    return C.coreChildren(cloud, pid).map(function (c, i) {
      var pos = path.indexOf(c.id);
      return { id: c.id, i: i, s: (sc[c.id] || 0) + PLAN.orderWeight * (1 - (pos < 0 ? L : pos) / (L + 1)) + (c.ghost ? 0 : 0.2) };
    }).sort(function (a, b) { return b.s - a.s || a.i - b.i; }).map(function (x) { return x.id; });
  }
  /* Side paths of a parent, by rank: [{ id, off }] (off: the core step it branches from). Never block the branch. */
  function sidePaths(cloud, pid, sc) {
    sc = sc || scores(cloud);
    return C.sidePaths(cloud, pid).map(function (x, i) { return { id: x.id, off: x.off, i: i, s: (sc[x.id] || 0) + (cloud.nodes[x.id].ghost ? 0 : 0.2) }; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; }).map(function (x) { return { id: x.id, off: x.off }; });
  }
  /* The next unfinished child of a parent in that order (null when all are done). */
  /*
   * The recommended next step from a topic, the same everywhere it is shown (the lesson's Where Next, Your Path, the
   * parents & teachers view): the learner's own fork pick first, then the best-ranked unfinished child (logical order +
   * use + the model's importance), else the usual walk up the tree. Pure, 0 calls.
   */
  function nextStep(cloud, id) {
    var n = nodeOf(cloud, id);
    if (!n) return null;
    var pick = n.fork && n.fork.picked;
    if (!(pick && nodeOf(cloud, pick) && !C.isDone(cloud, pick))) { var k = nextChild(cloud, id); if (k) return k; }
    return C.nextFor(cloud, id);
  }
  function nextChild(cloud, pid, sc) {
    var ids = orderedChildren(cloud, pid, sc);
    for (var i = 0; i < ids.length; i++) if (!finished(cloud, ids[i])) return ids[i];
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
    var done = C.doneChildren(cloud, pid), cp = C.coreProgress(cloud, pid);
    var want = C.needOf(cp.total, T.share, T.min);
    var enough = cp.total >= T.min && cp.done >= want;
    var t = C.testOf(cloud, pid), tried = Boolean(t && t.attempts);
    var fresh = !tried || done.length >= (t.n || 0) + T.again;
    return {
      id: pid, ready: enough && fresh, done: done, taken: tried, best: t ? t.best || 0 : 0, attempts: t ? t.attempts || 0 : 0,
      need: enough ? 0 : Math.max(0, (cp.total >= T.min ? want : T.min) - cp.done)
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

  /* ---------- onboarding, the light re-ask, and "what comes next" ---------- */
  /* The soft opening: said once, before the first open question. Joint and unhurried; nothing is asked about age or place. */
  var OPENING = "Let's begin making a learning path together. We can add more as we go along.";
  /*
   * The first-run questions, in order, each skippable: the name (only when missing), then one open question answered
   * in the learner's own words, opened by OPENING. There is no topic list and no age or region anywhere: the answer
   * goes to one creation call ("start"), and the model proposes the first parents from it. Skip makes no call: the
   * question stays open (the chat box), and the path starts from the first thing the learner offers.
   */
  function onboarding(cloud, hasName) {
    var name = cloud && cloud.name ? cloud.name : "";
    var qs = [];
    if (!hasName) qs.push({ id: "name", q: "First, what's your first name?", input: true });
    var first = openQuestion(cloud, "curious");
    first.q = (name && hasName ? "Hi " + name + ". " : "") + OPENING + "\n\n" + first.q;
    qs.push(first);
    return qs;
  }
  /*
   * An open question in the learner's own words (a free-text field). "curious": the first one, with easy-click examples
   * (ex: they come only from the API, see examples() below; there is no topic list on the device); "grow": the optional,
   * soft personal-development question, offered once by Iko after the first path has begun (one "more" call, only if answered);
   * "reask": later, when the cloud is thin or they seem stuck. One wording for everyone (no age-based variants).
   */
  function openQuestion(cloud, kind) {
    var Q = {
      curious: ["What are you curious about, or what do you enjoy?", "Anything goes: a hobby, something you've wondered about, a thing you'd like to be better at."],
      grow: ["When you like: is there something you'd like to grow in yourself?", "Optional. A habit, a strength, a way of being."],
      reask: ["What's caught your interest lately?", ""]
    }[kind];
    /* ex: the API's easy-click answers under it ("growth": the second set from the same cached call) */
    return { id: kind, q: Q[0], hint: Q[1], open: true, input: true, ex: kind === "grow" ? "growth" : true, go: kind === "curious" ? "Begin" : kind === "grow" ? "Add it" : "Build my path", ph: "In your own words" };
  }
  /*
   * A learner who has already started is not new: a card in the deck, a lesson in progress, or a topic they opened,
   * spent time on or answered on. They are never sent back through the first questions (their cloud and deck stay as
   * they are); the light re-ask can fill in their interests later.
   */
  function hasStarted(cloud) {
    if ((cloud.deck || []).length || (cloud.active && cloud.nodes[cloud.active])) return true;
    return cloud.order.some(function (id) { var n = cloud.nodes[id]; return n && n.parent && !n.ghost && (n.opened || n.engaged > 0 || n.correct > 0 || n.spent > 0); });
  }
  function needsOnboarding(cloud) { var p = C.profileOf(cloud); return !p.onboarded && C.topicCount(cloud) < PLAN.thinTopics && !hasStarted(cloud); }
  /* Topics still open to learn (not done, not an end), dotted ones included. */
  function openTopics(cloud) { return cloud.order.filter(function (id) { var n = cloud.nodes[id]; return n.parent && !n.end && !C.isDone(cloud, id); }).length; }
  /*
   * One light question when the cloud is thin or the learner seems stuck (and not asked in the last few days).
   * -> { q, chips, why } or null. Answering it is one creation call ("more").
   */
  function reask(cloud, now) {
    now = now || Date.now();
    var p = C.profileOf(cloud), R = PLAN.reask;
    if (!(p.onboarded || hasStarted(cloud)) || (p.askedAt && now - p.askedAt < R.days * DAY)) return null;
    var thin = openTopics(cloud) < R.open, stuck = (p.visits || 0) - (p.lessonVisit || 0) >= R.stuckVisits;
    if (!thin && !stuck) return null;
    var o = openQuestion(cloud, "reask");
    return { q: thin ? o.q : "Want to try something different? What do you enjoy these days?", open: true, ex: true, ph: o.ph, why: thin ? "thin" : "stuck" };
  }
  /*
   * "What comes next" for a parent: when it has no unfinished children left (all done, or none yet after it was
   * engaged), it isn't an end, and we haven't already asked at this point (node.asked = finished children + 1 when
   * asked). Cached that way, so it costs one call per step forward, only when needed.
   */
  function needsNext(cloud, id) {
    var n = nodeOf(cloud, id);
    if (!n || (!n.parent && !n.path) || n.ghost || n.end || n.pending) return false; /* a subject qualifies once it has its own path (made by a creation call) */
    var kids = C.coreChildren(cloud, id), done = C.doneCore(cloud, id).length; /* only the core sequence counts: side paths never block */
    if (kids.some(function (c) { return !C.isDone(cloud, c.id) && !c.end; })) return false;
    if (!kids.length && !engaged(cloud, id)) return false;
    var par = nodeOf(cloud, n.parent);
    if (!kids.length && par && par.path && par.path.ids.indexOf(id) >= 0) return false; /* a finished step hands "what next" to its parent (it still grows through its lessons) */
    if (kids.length && !done) return false;
    return n.asked !== done + 1;
  }
  /*
   * A bridge is needed when a topic the learner just talked about landed right under its subject although the model's
   * chain was shallow (Sets straight under Computer Science). Not for parents made by a creation call (a one-link chain
   * is right for them), not twice for the same topic (node.bridged).
   */
  function needsBridge(cloud, id, chainLen) {
    var n = nodeOf(cloud, id);
    if (!n || !n.parent || n.ghost || n.made || n.bridged) return false;
    var par = nodeOf(cloud, n.parent);
    return Boolean(par && !par.parent) && (chainLen == null || chainLen < 2);
  }
  /* a bounded, relevant set of the learner's subjects for a prompt (C.promptSubjects): flat however big the cloud grows */
  function promptParents(cloud, id, text) { return C.promptSubjects(cloud, id, text).map(function (s) { return s.label; }); }
  function bridgeRequest(cloud, id) {
    var n = nodeOf(cloud, id), subj = n ? C.ancestry(cloud, id).map(function (x) { return cloud.nodes[x]; })[0] : null;
    return n ? { kind: "bridge", focus: n.label, focusParent: subj ? subj.label : "", trail: C.trail(cloud, id), parents: promptParents(cloud, id) } : null;
  }
  /*
   * The one-time repair after a bridge: when the bridged chain is still shallow (fewer than 2 links between the subject
   * and the topic: Computer Science > Python > Sets), ask once more whether a level was skipped. At most once per
   * topic, ever (node.repaired is set before the call and stored).
   */
  function needsRepair(cloud, id) {
    var n = nodeOf(cloud, id);
    if (!n || !n.parent || n.ghost || !n.bridged || n.repaired) return false;
    return C.checkChain(cloud, id, C.chainOf(cloud, id).slice(0, -1)).shallow;
  }
  function repairRequest(cloud, id) {
    var b = bridgeRequest(cloud, id);
    return b ? Object.assign(b, { repair: true }) : null;
  }

  /*
   * Merging: when a parent is ready to form (or upgrade) a higher-valued card. No calls, deterministic, quiet.
   *   form     the parent is Achieved itself AND its core is sufficiently complete: at least MERGE.share of its core
   *            children done and at least MERGE.min (so 2 of 2, 3 of 4, 4 of 5); every completed child not yet absorbed joins
   *   upgrade  a merged parent takes the next batch: >= MERGE.batch newly completed children, or the last ones that
   *            complete its whole core sequence
   *   a passed test never merges on its own any more; when it coincides with a merge, the merge is marked "test"
   * Merges are never undone: absorbed links and merge levels only grow. Plans run deepest first, so a child can merge
   * its own subtopics and then count for its parent.
   */
  var MERGE = { share: 0.75, min: 2, batch: 2 };
  function mergePlan(cloud, pid) {
    var p = nodeOf(cloud, pid);
    if (!p || !p.parent || p.ghost) return null;
    var fresh = C.childrenOf(cloud, pid).filter(function (c) { return !c.ghost && !c.absorbedInto && C.isDone(cloud, c.id); });
    if (!fresh.length) return null;
    var ids = fresh.map(function (c) { return c.id; });
    var t = C.testOf(cloud, pid), tested = Boolean(t && t.passAt && t.passAt > (p.mergedAt || 0));
    if (!p.ml) {
      var cp = C.coreProgress(cloud, pid);
      if (!cp.total || cp.done < C.needOf(cp.total, MERGE.share, MERGE.min) || !C.isAchieved(cloud, pid)) return null;
      return { id: pid, ids: ids, why: tested ? "test" : "core" };
    }
    var coreLeft = C.gateCore(cloud, pid).filter(function (c) { return !c.absorbedInto && ids.indexOf(c.id) < 0; }).length;
    var coreNow = fresh.some(function (c) { return c.role !== "optional"; });
    return fresh.length >= MERGE.batch || (coreNow && !coreLeft) ? { id: pid, ids: ids, why: tested ? "test" : "batch" } : null;
  }
  function mergePlans(cloud) {
    return cloud.order.filter(function (id) { var n = cloud.nodes[id]; return n && n.parent; })
      .sort(function (a, b) { return C.depthOf(cloud, b) - C.depthOf(cloud, a); })
      .map(function (id) { return mergePlan(cloud, id); }).filter(Boolean);
  }
  /* Applies every ready merge (deepest first, re-planning after each, so recursion settles in one pass). -> [{ id, level, ids, why }] */
  function settleMerges(cloud, t) {
    var out = [], guard = 0, plan;
    while (guard++ < 50 && (plan = mergePlans(cloud)[0])) {
      var r = C.mergeInto(cloud, plan.id, plan.ids, t, plan.why);
      if (!r) break;
      r.why = plan.why;
      out.push(r);
    }
    return out;
  }

  /* Parents ready for "what comes next", highest ranked first. */
  function readyNext(cloud, now) {
    var sc = scores(cloud, now);
    return cloud.order.filter(function (id) { return needsNext(cloud, id); }).sort(function (a, b) { return (sc[b] || 0) - (sc[a] || 0); });
  }
  /*
   * The context for a creation call. kind: "start" (first parents), "more" (a new interest), "next" (for parent id).
   * The ranking steers what is asked for: the learner's top topics go along as favorites.
   */
  function createRequest(cloud, kind, id, extra) {
    var p = C.profileOf(cloud), n = nodeOf(cloud, id);
    var req = { kind: kind, interests: (extra && extra.interests) || (p.interests || []).slice(-5), favorites: (RK ? RK.top(cloud, { n: 5 }) : []).map(function (r) { return r.label; }) };
    /* a new direction: it fans out from the learner's own words, so it doesn't lean on their most-used topics */
    if (extra && extra.direction) req.favorites = [];
    /* the learner's own words (start / more): sent once, never stored; the model reads it, nothing on the device matches it */
    if (extra && extra.about) req.about = String(extra.about).slice(0, 300);
    /* start only: the optional personal-development answer, in the same call */
    if (kind === "start" && extra && extra.grow) req.grow = String(extra.grow).slice(0, 200);
    /* subjects to file new parents under: only the learner's own (no subject names are built in) */
    req.parents = promptParents(cloud, n ? id : null, req.about || "");
    if (kind === "next" && n) { req.focus = n.label; req.trail = C.trail(cloud, id); req.known = C.knownUnder(cloud, id); }
    return req;
  }

  /*
   * The easy-click examples, a few at a time (More steps through them on the device, no call). `generic` is the set the
   * API made (one cached call a day, the same for everyone); this file holds no examples of its own. Once a cloud exists
   * they are personalised from the ranking: the learner's next steps and something new in each subject (labels the
   * creation calls made, best ranked first, minus the cards already suggested) come before the generic ones, and
   * generic ones already on the cloud drop out.
   * -> [string]. With no API set and no cloud there is nothing to show (the app offers Try again instead).
   */
  function examples(cloud, generic, now) {
    var out = [], seen = {}, onCloud = {};
    var add = function (t) { t = String(t || "").trim(); var k = t.toLowerCase(); if (t && !seen[k]) { seen[k] = 1; out.push(t); } };
    if (cloud && C.subjects(cloud).length) {
      now = now || Date.now();
      var sc = scores(cloud, now);
      cloud.order.forEach(function (id) { var n = cloud.nodes[id]; if (n && n.parent) onCloud[n.label.toLowerCase()] = 1; });
      var mine = nextSteps(cloud, now, sc).map(function (x) { return x.id; })
        .concat(exploreAll(cloud, now, sc, function (id) { return C.isDone(cloud, id); }, 6).map(function (x) { return x.id; }));
      /* not the cards already offered above (the suggestions): the row adds to them, never repeats them */
      var shown = {}; ((cloud.suggest && cloud.suggest.items) || []).forEach(function (x) { shown[x.id] = 1; });
      mine.forEach(function (id) { var n = nodeOf(cloud, id); if (n && !shown[id]) add(n.label); });
    }
    (Array.isArray(generic) ? generic : []).forEach(function (t) { if (!onCloud[String(t || "").trim().toLowerCase()]) add(t); });
    return out;
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
      if (!x || finished(cloud, x) || skip(x)) x = nextChild(cloud, subs[i].id, sc);
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
    /* a card offered as work is never finished (unfinished(), the same rule as Draw); a test and "what comes next" are
       about finished work by design (an optional check; new topics), so they keep their own rules */
    var taken = function (id) { return !nodeOf(cloud, id) || seen[id] || exclude[id]; };
    var skip = function (id) { return taken(id) || !unfinished(cloud, id); };
    var add = function (id, kind, why) { if (kind === "grow" ? taken(id) : kind !== "test" && skip(id)) return false; if (kind === "test" && seen["t:" + id]) return false; seen[kind === "test" ? "t:" + id : id] = 1; out.push({ id: id, kind: kind, why: why, top: tops[id] || 0 }); return true; };
    var tests = readyTests(cloud, now);
    if (tests[0]) { add(tests[0].id, "test", "Ready for a test"); C.markOffered(cloud, tests[0].id, now); }
    /* a parent whose children are all done: "what comes next" (one creation call when picked) */
    var grow = readyNext(cloud, now);
    if (grow[0]) add(grow[0], "grow", "What comes next in " + cloud.nodes[grow[0]].label + "?");
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
    var head = out.filter(function (x) { return x.kind === "test" || x.kind === "grow"; }).slice(0, 2);
    var rest = out.filter(function (x) { return x.kind !== "test" && x.kind !== "grow"; }).slice(0, n + 1 - head.length);
    /* ranking orders the offer: top-10 topics first (by their place), then by score; the kind order breaks ties */
    rest = rest.map(function (x, i) { return { x: x, i: i, s: (x.top ? 10 - x.top + 2 : 0) + (sc[x.id] || 0) }; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; }).map(function (r) { return r.x; });
    var items = head.concat(rest).slice(0, n);
    /* free exploration stays on the table: something new always keeps the last place */
    var fresh = out.filter(function (x) { return x.kind === "new"; })[0];
    if (fresh && n >= 3 && items.indexOf(fresh) < 0) items[items.length - 1] = fresh;
    items.forEach(function (x) { if (x.top && x.kind !== "test" && x.kind !== "grow") x.why = "In your top 10 · " + x.why; });
    cloud.suggest = { at: now, items: items.map(function (x) { return { id: x.id, kind: x.kind, why: x.why }; }) };
    /* a light question to propose new branches: when the cloud is thin or the learner seems stuck (no call until answered) */
    var ask = opts.noAsk ? null : reask(cloud, now);
    if (ask) { ask.kind = "ask"; ask.id = null; if (items.length >= n) items[items.length - 1] = ask; else items.push(ask); }
    return items;
  }

  /*
   * Draw: one card for the holder, always active work: nothing finished (finished(): completed, achieved, merged,
   * covered) is ever drawn; finished cards stay in the deck. In order:
   *   1. the current path: the next unfinished step after the card in hand (opts.from, else the active card, else the
   *      topic touched last), else that card itself when it is unfinished and not the one already open;
   *   2. the deck (the weighted shuffle: subject balance over the year, review timing, struggles, the top 10), unfinished;
   *   3. the best suggestion (the next step in a chain, something new), unfinished;
   *   4. any unstarted or unfinished topic on the cloud, best score first.
   * The card already open (opts.skip) is never drawn again. The draw is logged for the yearly balance.
   * -> node id, or null when everything is finished (the caller offers a new topic or direction instead).
   */
  function draw(cloud, opts) {
    opts = opts || {};
    var now = opts.now || Date.now(), day = D.dayOf(now), skipId = opts.skip || null;
    var open = function (x) { return Boolean(x) && x !== skipId && unfinished(cloud, x) && !cloud.nodes[x].end; };
    var id = null, from = [opts.from, cloud.active, lastTouched(cloud)].filter(function (x) { return x && nodeOf(cloud, x); })[0] || null;
    if (from) { var nx = pathNext(cloud, from); id = open(nx) ? nx : open(from) ? from : null; }
    if (!id && (cloud.deck || []).length) id = D.drawSession(cloud, { day: day, size: cloud.deck.length, seed: opts.seed }).filter(open)[0] || null;
    if (!id) {
      var ex = {}; if (skipId) ex[skipId] = 1;
      id = (suggest(cloud, { now: now, exclude: ex, n: 3, noAsk: true }).filter(function (x) { return x.kind !== "test" && x.kind !== "grow" && open(x.id); })[0] || {}).id || null;
    }
    if (!id) {
      var sc = scores(cloud, now);
      id = cloud.order.filter(open).sort(function (a, b) { return (sc[b] || 0) - (sc[a] || 0) || cloud.order.indexOf(a) - cloud.order.indexOf(b); })[0] || null;
    }
    if (id) C.logDraw(cloud, day, [id]);
    return id;
  }
  /* Active work, for every place that offers it (Draw, Pick up, Continue, Next up, Waiting for you): a topic (not a
     subject) that isn't finished(). */
  function unfinished(cloud, x) { var n = nodeOf(cloud, x); return Boolean(n && n.parent && !finished(cloud, x)); }
  /* The topic the learner touched last (the current path when no card is in hand). */
  function lastTouched(cloud) {
    var best = null, t = 0;
    cloud.order.forEach(function (x) { var n = cloud.nodes[x]; if (n && n.parent && (n.touched || 0) > t) { t = n.touched; best = x; } });
    return best;
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

  /*
   * Where Next, shown in every lesson (0 calls). When the lesson offered a fork, its choices come first (ranked like
   * before: what this learner uses most, then the model's order), with the learner's own pick or else the top one as
   * the pre-selected next step; otherwise the logical next step (the caller's nextStep: fork pick, best child, else the
   * walk up the tree). Then up to `max` other topics in progress (started, not finished), most recent first, never
   * repeating one above. -> { next: id | null, fork: [{ id, why }], others: [id] }. Nothing opens by itself.
   */
  /*
   * Where Next: up to three clear choices after a lesson, then what's in progress elsewhere. 0 model calls.
   *   path:   continue this path. The lesson's own next step (the same "next" Your Path marks), never outranked by a
   *           global score: a top-10 topic elsewhere is not a continuation.
   *   branch: a related branch or deeper option (near: a child, a sibling, a step on the path). A fork choice first,
   *           else another child or a sibling, nearest in the tree first (the model's order breaks ties).
   *   other:  a different topic path (far: 3+ steps away in the tree, or another subject). Something unfinished in
   *           progress there, else an unstarted topic in another branch (a far fork choice first, then by rank).
   * Nothing finished is ever offered (finished(): completed, achieved, merged, covered; fork choices also by title).
   * A slot with nothing unfinished to offer is left out, never padded.
   * The learner's own earlier fork pick stays pre-selected (it takes the slot it fits). others: in progress, deduped.
   */
  /*
   * Finished, for Where Next and Your Path: never suggested again. Everything v9 counts as done: a completed lesson
   * (C.isDone, doneAt), an achieved card (achievedAt, Achieved tier), a merged card (absorbed into its parent, or a
   * parent at Merged I+), or a card the deck already shows as covered (Tinted or better, also from its deck entry).
   */
  function finished(cloud, x) {
    var n = nodeOf(cloud, x);
    if (!n) return true;
    if (n.doneAt || n.achievedAt || C.isDone(cloud, x) || C.absorbedInto(cloud, x)) return true;
    var cv = D && D.coverage ? D.coverage(cloud, x) : null;
    return Boolean(cv && cv.state === "covered");
  }
  /* Normalised titles of everything finished (nodes and deck cards whose node is gone): a fork choice that only
     matches by name (a new ghost for a topic already learned) is finished too. */
  function finishedNames(cloud) {
    var out = {};
    cloud.order.forEach(function (x) { if (finished(cloud, x)) out[C.norm(cloud.nodes[x].label)] = 1; });
    (cloud.deck || []).forEach(function (e) {
      if (cloud.nodes[e.id]) return;
      var cv = D && D.coverage ? D.coverage(cloud, e.id) : null;
      if (e.label && (e.ach || (e.tb || 0) >= 2 || e.inn || (cv && cv.state === "covered"))) out[C.norm(e.label)] = 1;
    });
    return out;
  }
  function anc(cloud, id) { var out = [], seen = {}, n = nodeOf(cloud, id); while (n && !seen[n.id]) { seen[n.id] = 1; out.unshift(n.id); n = nodeOf(cloud, n.parent); } return out; }
  function treeDist(cloud, a, b) {
    var x = anc(cloud, a), y = anc(cloud, b), k = 0;
    if (!x.length || !y.length || x[0] !== y[0]) return Infinity;
    while (k < x.length && k < y.length && x[k] === y[k]) k++;
    return x.length + y.length - 2 * k;
  }
  /* The lesson's own next step: the learner's pick when it is on this path, else its next child, else the next step
     on the paths above it (the same as Your Path's "next"). */
  function pathNext(cloud, id) {
    var n = nodeOf(cloud, id);
    if (!n) return null;
    var open = function (x) { return x && x !== id && nodeOf(cloud, x) && !finished(cloud, x); };
    var pick = n.fork && n.fork.picked;
    if (open(pick) && ((n.path && n.path.ids.indexOf(pick) >= 0) || nodeOf(cloud, pick).parent === id)) return pick;
    var k = orderedChildren(cloud, id).filter(open)[0];
    if (k) return k;
    var cur = n, guard = 0;
    while (cur && cur.parent && guard++ < 200) {
      var p = nodeOf(cloud, cur.parent);
      if (p && p.path) {
        var i = p.path.ids.indexOf(cur.id);
        var rest = p.path.ids.slice(i + 1).concat(p.path.ids.slice(0, Math.max(0, i))).filter(open);
        if (rest.length) return rest[0];
      }
      cur = p;
    }
    return null;
  }
  /*
   * Where Next (0 calls): only steps that belong to this lesson's own parent. (a) continue this path, then (b) up to two
   * related or deeper steps in the same subject (the fork's choices here first, then children, then siblings, nearest
   * first). Nothing from another branch: other topics in progress go to `others` ("Also in progress"), the place for
   * switching context, with the learner's own pick first when it lies on another path. Finished topics never appear.
   */
  function whereNext(cloud, id, nextId, max) {
    max = max == null ? PLAN.whereNext : max;
    var n = nodeOf(cloud, id), empty = { next: null, path: null, choices: [], others: [] };
    if (!n) return empty;
    var done = finishedNames(cloud);
    var open = function (x) { var m = nodeOf(cloud, x); return Boolean(x && x !== id && m && !finished(cloud, x) && !done[C.norm(m.label)]); };
    var inSubj = function (x) { return treeDist(cloud, id, x) <= PLAN.nearDist; }; /* near enough to be a branch of this lesson */
    var sameParent = function (x) { return treeDist(cloud, id, x) < Infinity; }; /* same subject (the same top parent) */
    var fork = n.fork && n.fork.ids ? n.fork : { ids: [], why: [] };
    var whyOf = function (x) { var i = fork.ids.indexOf(x); return i >= 0 ? fork.why[i] || "" : ""; };
    var picked = open(fork.picked) ? fork.picked : null;
    var near = function (ids) {
      return ids.map(function (x, i) { return { id: x, i: i, d: treeDist(cloud, id, x) }; })
        .sort(function (a, b) { return a.d - b.d || a.i - b.i; }).map(function (o) { return o.id; });
    };
    var used = {}; used[id] = 1;
    var take = function (x) { if (x) used[x] = 1; return x || null; };
    var free = function (x) { return open(x) && !used[x]; };
    /* (a) continue this path */
    var cont = pathNext(cloud, id);
    if (!open(cont) || !sameParent(cont)) cont = null;
    if (!cont && open(nextId) && nextId !== picked && inSubj(nextId)) cont = nextId;
    if (!cont) cont = near(fork.ids.filter(function (x) { return open(x) && inSubj(x); }))[0] || null;
    take(cont);
    /* (b) related or deeper steps in this subject: the learner's pick here, the fork's choices, then children and siblings */
    var kids = C.childrenOf(cloud, id).map(function (c) { return c.id; });
    var sibs = n.parent ? C.childrenOf(cloud, n.parent).map(function (c) { return c.id; }) : [];
    var rel = (picked && inSubj(picked) ? [picked] : []).concat(near(fork.ids.filter(inSubj)), kids, sibs).filter(function (x, i, a) { return a.indexOf(x) === i && free(x) && inSubj(x); });
    var branches = rel.slice(0, PLAN.related);
    branches.forEach(take);
    var choices = [];
    if (cont) choices.push({ id: cont, kind: "path", why: whyOf(cont) });
    branches.forEach(function (x) { choices.push({ id: x, kind: "branch", why: whyOf(x) }); });
    /* Also in progress: other topics started and unfinished, most recent activity first, never on this lesson's own line
       (its ancestors, what lies under it, or the steps of its parent's path: that is Where Next's job); the learner's own
       pick on another path leads. `others` is the short default list (max, 3), `allOthers` the whole list ("more"). */
    var lineIds = {}, par = n.parent ? nodeOf(cloud, n.parent) : null;
    C.ancestry(cloud, id).forEach(function (x) { lineIds[x] = 1; });
    if (par && par.path) par.path.ids.forEach(function (x) { lineIds[x] = 1; });
    var onLine = function (x) { return lineIds[x] || C.ancestry(cloud, x).indexOf(id) >= 0; };
    var touched = function (a, b) { return (nodeOf(cloud, b).touched || 0) - (nodeOf(cloud, a).touched || 0); };
    var others = cloud.order.filter(function (x) {
      var m = nodeOf(cloud, x);
      return m && !used[x] && m.parent && open(x) && !onLine(x) && (m.opened || m.engaged > 0 || m.correct > 0);
    }).sort(touched);
    if (picked && !used[picked] && !onLine(picked)) others = [picked].concat(others.filter(function (x) { return x !== picked; }));
    return { next: picked || cont || (choices[0] && choices[0].id) || null, path: cont, choices: choices, others: others.slice(0, max), allOthers: others };
  }

  /*
   * Chat placement (0 calls): where a topic the learner asked for goes. The chat block's placement and target are the
   * model's advice; this checks them against the cloud and falls back procedurally:
   *   reuse:     the title is already a parent, or the same topic (normalised) exists anywhere: that node, no duplicate.
   *   parent:    a new branch right under the learner's name, beside the other parents.
   *   child:     right under target (an id, or an existing topic's name). Only when it clearly belongs there: a broad
   *              request aimed at the focus is not forced under it.
   *   ambiguous: the learner chooses (Start X as a new branch / Add it under Focus); the plan is kept with the message.
   *   legacy:    no placement given (a topic only talked about): the usual chain placement (applyTopics).
   * Fallback for an invalid target: a new parent when the request is broad, otherwise ambiguous (with a focus).
   */
  function placeTarget(cloud, target) {
    if (!target) return null;
    if (/^n\d+$/.test(target)) return nodeOf(cloud, target);
    return C.findAny(cloud, target) || null;
  }
  /* broad: a subject of its own. Procedural: the model's chain names nothing above it (or only itself, or a subject
     that isn't on the cloud), and it shares no word with the focus's trail. */
  var GENERIC = ["science", "sciences", "studies", "study", "history", "basics", "basic", "skills", "skill", "art", "arts", "and", "the", "for", "intro", "introduction", "advanced", "beginner", "beginners", "learning", "life"];
  function isBroad(cloud, tp, focusId) {
    var label = C.cleanLabel(tp && tp.name), k = C.norm(label);
    var chain = (tp && Array.isArray(tp.chain) ? tp.chain : []).map(C.norm).filter(function (x) { return x && x !== k; });
    var parentK = C.norm(tp && tp.parent);
    var above = chain.length ? chain : parentK && parentK !== k ? [parentK] : [];
    var rootKnown = above.length && C.subjects(cloud).some(function (s) { return s.key === above[0]; });
    /* generic words ("science", "history", "basics") say nothing about belonging: Computer Science is not part of Earth Science */
    var words = function (v) { return C.norm(v).split(" ").filter(function (w) { return w.length > 2 && GENERIC.indexOf(w) < 0; }); };
    var trailWords = focusId && nodeOf(cloud, focusId) ? C.ancestry(cloud, focusId).reduce(function (a, x) { return a.concat(words(cloud.nodes[x].label)); }, []) : [];
    var overlap = words(label).some(function (w) { return trailWords.indexOf(w) >= 0; }) || above.some(function (a) { return trailWords.indexOf(a) >= 0 || words(a).some(function (w) { return trailWords.indexOf(w) >= 0; }); });
    return (!above.length || !rootKnown) && !overlap;
  }
  function placeTopic(cloud, tp, focusId) {
    var label = C.cleanLabel(tp && tp.name), k = C.norm(label);
    if (!label || k === C.norm(cloud.name)) return null;
    var subj = C.subjects(cloud).filter(function (s) { return s.key === k; })[0];
    if (subj) return { how: "reuse", id: subj.id, label: label };
    var hit = C.findTopic(cloud, label, focusId && nodeOf(cloud, focusId) ? focusId : null);
    if (hit) return { how: "reuse", id: hit.id, label: label };
    var focus = focusId && nodeOf(cloud, focusId) ? nodeOf(cloud, focusId) : null;
    var broad = isBroad(cloud, tp, focusId);
    var pl = tp && tp.placement;
    /* there is no cap on subjects: a new subject is always a new parent (never squeezed under the focus) */
    var asParent = function () { return { how: "parent", label: label }; };
    var ask = function () { return focus ? { how: "ambiguous", target: focus.id, label: label } : broad ? asParent() : { how: "legacy", label: label }; };
    if (pl === "parent") return asParent();
    if (pl === "child") {
      var t = placeTarget(cloud, tp.target);
      if (!t) return broad ? asParent() : ask();
      /* a broad subject aimed at the focus (or the focus's own subject) is not clearly a subtopic: ask */
      if (broad && focus && C.ancestry(cloud, focus.id).indexOf(t.id) >= 0) return ask();
      return { how: "child", target: t.id, label: label };
    }
    if (pl === "ambiguous") return ask();
    return { how: "legacy", label: label };
  }
  /*
   * The description backfill batch for a node whose card opens: that node first, then its siblings and its children
   * that have no description yet, skipping any already asked (in flight) or failed this session; at most 8 (one call).
   * Empty = nothing to ask (every one is described already: 0 calls).
   */
  var DESCRIBE = { batch: 8 };
  function describeBatch(cloud, id, skip) {
    var out = [], n = cloud && cloud.nodes[id];
    if (!n) return out;
    var ix = C.index(cloud);
    [id].concat(n.parent ? ix[n.parent] || [] : [], ix[id] || []).forEach(function (x) {
      var m = cloud.nodes[x];
      if (m && !m.blurb && !(skip && skip(x)) && out.indexOf(x) < 0 && out.length < DESCRIBE.batch) out.push(x);
    });
    return out;
  }

  /* The topic for C.applyTopics once placed: a new parent, right under its target, or as it came (reuse, legacy). */
  function placedTopic(tp, plan) {
    var o = {};
    Object.keys(tp || {}).forEach(function (key) { if (key !== "placement" && key !== "target") o[key] = tp[key]; });
    if (!plan) return o;
    if (plan.how === "parent") { o.asSubject = true; o.parent = ""; o.chain = []; }
    if (plan.how === "child") { o.under = plan.target; delete o.chain; }
    return o;
  }

  /*
   * Directions (0 calls, all from the saved cloud): see PLAN.directions.
   * -> { invite: bool, revisit: [subject ids], insight: { key, kind, text } | null, stats }
   */
  function subjectStats(cloud) {
    var root = {}, by = {};
    var rootOf = function (id) {
      if (root[id]) return root[id];
      var n = cloud.nodes[id], seen = 0, x = n;
      while (x && x.parent && cloud.nodes[x.parent] && seen++ < 64) x = cloud.nodes[x.parent];
      return (root[id] = x ? x.id : id);
    };
    C.subjects(cloud).forEach(function (sj) { by[sj.id] = { id: sj.id, label: sj.label, born: sj.born || 0, last: sj.touched || sj.born || 0, started: false, done: 0, right: 0, doneAts: [], open: 0 }; });
    cloud.order.forEach(function (id) {
      var n = cloud.nodes[id];
      if (!n || !n.parent) return;
      var st = by[rootOf(id)];
      if (!st) return;
      st.last = Math.max(st.last, n.touched || 0);
      if (n.opened || (n.engaged || 0) > 0 || (n.correct || 0) > 0 || n.doneAt) st.started = true;
      if (!finished(cloud, id)) st.open += 1;
      st.right += n.correct || 0;
      if (n.doneAt && !n.ghost) { st.done += 1; st.doneAts.push(n.doneAt); }
    });
    return { by: by, rootOf: rootOf };
  }
  function directions(cloud, now) {
    now = now || Date.now();
    var D = PLAN.directions, d = C.dirOf(cloud), p = C.profileOf(cloud);
    var subs = C.subjects(cloud), S = subjectStats(cloud), list = subs.map(function (x) { return S.by[x.id]; });
    var out = { invite: false, revisit: [], insight: null };
    if (!subs.length) return out;
    /* 1. the invite: early only, a second and a third direction, then quiet; a dismissal is for good */
    out.invite = subs.length < D.invite && !d.off && (d.n || 0) < D.invites;
    /* 2. a return visit: branches left alone for a while (the oldest-left started ones first, then ones never opened) */
    if ((p.visits || 0) >= 2 && subs.length >= 2 && !(d.quiet && now - d.quiet < D.revisit.quietDays * DAY)) {
      var stale = list.filter(function (x) { return now - x.last >= D.revisit.days * DAY && x.open > 0; }); /* nothing left to do there: not "waiting" */
      out.revisit = stale.filter(function (x) { return x.started; }).sort(function (a, b) { return a.last - b.last; })
        .concat(stale.filter(function (x) { return !x.started; }).sort(function (a, b) { return a.born - b.born; }))
        .slice(0, D.revisit.max).map(function (x) { return x.id; });
    }
    /* 3. one soft insight, only after real activity across branches */
    var I = D.insight, active = list.filter(function (x) { return x.done > 0 || x.right > 0; });
    var lessons = list.reduce(function (a, x) { return a + x.done; }, 0), right = list.reduce(function (a, x) { return a + x.right; }, 0);
    out.stats = { lessons: lessons, right: right, subjects: active.length };
    if (lessons < I.lessons || right < I.right || active.length < I.subjects) return out;
    var hide = {}, c = [];
    (d.hide || []).forEach(function (k) { hide[k] = 1; });
    /* a connection: a topic that builds on one from another subject, which the learner has done */
    cloud.order.some(function (id) {
      var n = cloud.nodes[id];
      return n && n.doneAt && (n.pre || []).some(function (q) {
        var m = cloud.nodes[q];
        if (!m || !m.doneAt || S.rootOf(q) === S.rootOf(id)) return false;
        c.push({ key: "link:" + id + ":" + q, kind: "connection", text: n.label + " in " + S.by[S.rootOf(id)].label + " builds on " + m.label + " from " + S.by[S.rootOf(q)].label + "." });
        return true;
      });
    });
    /* two subjects learned side by side lately */
    var lately = list.filter(function (x) { return x.doneAts.some(function (t) { return now - t <= I.togetherDays * DAY; }); })
      .sort(function (a, b) { return Math.max.apply(null, b.doneAts) - Math.max.apply(null, a.doneAts); });
    if (lately.length >= 2) c.push({ key: "pair:" + [lately[0].id, lately[1].id].sort().join(":"), kind: "connection", text: "You've been exploring " + lately[0].label + " and " + lately[1].label + " side by side this week." });
    /* growth and a strength, the subject with the most first */
    list.map(function (x) { return { x: x, recent: x.doneAts.filter(function (t) { return now - t <= I.growDays * DAY; }).length }; })
      .filter(function (o) { return o.recent >= I.growMin; }).sort(function (a, b) { return b.recent - a.recent; }).slice(0, 1)
      .forEach(function (o) { c.push({ key: "grow:" + o.x.id, kind: "growing", text: o.x.label + " has been growing: " + o.recent + " topics finished in the last two weeks." }); });
    list.filter(function (x) { return x.right >= I.steadyRight && x.done >= I.steadyDone; }).sort(function (a, b) { return b.right - a.right; }).slice(0, 1)
      .forEach(function (x) { c.push({ key: "steady:" + x.id, kind: "strength", text: "You've built a steady base in " + x.label + ": " + x.right + " right answers so far." }); });
    c = c.filter(function (x) { return !hide[x.key]; });
    /* the same note all day, a different one another day */
    if (c.length) out.insight = c[Math.floor(now / DAY) % c.length];
    return out;
  }

  /*
   * The name's card on the cloud (0 calls): achievements (cards in the Deck, by tier), progress (subjects, topics
   * finished, right answers), recent activity (days with learning in the last 7 and the current run of days, from when
   * topics were last touched or finished: a lower bound, never made up), and #98's one soft insight once its threshold
   * is met (the same note, the same dismissals).
   */
  function homeStats(cloud, now) {
    now = now || Date.now();
    var day = function (t) { var d = new Date(t); return d.getFullYear() * 1e4 + (d.getMonth() + 1) * 100 + d.getDate(); };
    var out = { subjects: C.subjects(cloud).length, topics: 0, done: 0, right: 0, cards: (cloud.deck || []).length, tiers: {}, week: 0, streak: 0, last: 0, insight: null };
    var days = {};
    cloud.order.forEach(function (id) {
      var n = cloud.nodes[id];
      if (!n || !n.parent || n.ghost) return;
      out.topics += 1;
      if (C.isDone(cloud, id)) out.done += 1;
      out.right += n.correct || 0;
      if (!(n.opened || (n.engaged || 0) > 0 || (n.correct || 0) > 0 || n.doneAt)) return;
      [n.touched, n.doneAt, n.achievedAt].forEach(function (t) { if (t && t <= now) { days[day(t)] = 1; out.last = Math.max(out.last, t); } });
    });
    (cloud.deck || []).forEach(function (e) { var t = C.tierOf(cloud, e.id); var k = t ? t.key : "sketch"; out.tiers[k] = (out.tiers[k] || 0) + 1; });
    for (var i = 0; i < 7; i++) if (days[day(now - i * DAY)]) out.week += 1;
    /* a run of days ending today (or yesterday, so it isn't lost before today's first lesson) */
    var k0 = days[day(now)] ? 0 : 1;
    while (days[day(now - (k0 + out.streak) * DAY)] && out.streak < 366) out.streak += 1;
    out.insight = directions(cloud, now).insight;
    return out;
  }

  var api = {
    PLAN: PLAN, engaged: engaged, wantChildren: wantChildren, childrenReady: childrenReady, orderedChildren: orderedChildren, sidePaths: sidePaths, needsBridge: needsBridge, bridgeRequest: bridgeRequest, needsRepair: needsRepair, repairRequest: repairRequest,
    MERGE: MERGE, mergePlan: mergePlan, mergePlans: mergePlans, settleMerges: settleMerges, nextChild: nextChild, nextStep: nextStep,
    orderChoices: orderChoices, testState: testState, readyTests: readyTests, testRequest: testRequest, nextSteps: nextSteps, explore: explore, exploreAll: exploreAll,
    suggest: suggest, draw: draw, lessonContext: lessonContext, aheadOf: aheadOf, whereNext: whereNext, pathNext: pathNext, treeDist: treeDist, finished: finished, unfinished: unfinished, placeTopic: placeTopic, placedTopic: placedTopic, DESCRIBE: DESCRIBE, describeBatch: describeBatch, isBroad: isBroad,
    onboarding: onboarding, openQuestion: openQuestion, examples: examples, hasStarted: hasStarted, needsOnboarding: needsOnboarding, reask: reask, openTopics: openTopics, directions: directions, homeStats: homeStats,
    needsNext: needsNext, readyNext: readyNext, createRequest: createRequest, OPENING: OPENING
  };
  if (node_) module.exports = api;
  else root.IkoPlan = api;
})(typeof window !== "undefined" ? window : this);
