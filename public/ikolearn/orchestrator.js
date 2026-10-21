/*
 * IkoLearn orchestrator: decides, on the device and with no model calls, what to offer next.
 *   suggest()      a short set of cards to pick up (a ready test, the next step in an active chain, a deck card, something new)
 *   draw()         one card for the holder: a weighted deck draw with light subject balancing, else the best suggestion
 *   wantChildren() whether a lesson call should also bring this topic's child topics (piggybacked on the same call)
 *   childrenReady() whether child topics that arrived with a lesson may now grow onto the cloud (the topic was engaged)
 *   testState()    whether a parent is ready for a test, built only from what has been completed under it
 *   lessonContext() / testRequest() / createRequest()  the prompt context for the one call that follows
 *   onboarding()   the few first-run questions (static, on the device), needsOnboarding() / reask() when to ask
 *   needsNext()    whether a parent is ready for "what comes next" (one creation call, cached, only when needed)
 *   regionFrom()   a coarse region from the browser's time zone and locale (no permission prompt, no lookup service)
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
    /* a topic counts as engaged (its waiting child topics grow) after a right answer, "I've got it", a second visit or 2 minutes reading */
    engaged: { correct: 1, visits: 2, seconds: 120 },
    /* a test is offered for a parent once 3 of its child topics are completed, or every step of its path (at least 2);
       after an attempt it is offered again once 2 more are completed */
    test: { minDone: 3, pathAll: 2, again: 2, questions: 5 },
    /* chains touched within this many days count as active (their next step is suggested) */
    recentDays: 10,
    depth: 7,
    /* onboarding while the learner has fewer than this many topics; a light re-ask at most every few days when the
       cloud is thin (fewer open topics than this) or they seem stuck (this many visits without opening a lesson) */
    thinTopics: 3,
    reask: { days: 3, open: 3, stuckVisits: 3 },
    /* a child's place in the parent's logical order (foundational first) is worth this much against its rank score */
    orderWeight: 0.6
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
   * A parent's children in the order to offer them: the logical order (its path, foundational first, as the model
   * ordered them) mixed with the ranking (the learner's use, chain heat and the model's importance for their age and
   * region): key = rank score + PLAN.orderWeight x (1 - place / (steps + 1)), explored ones a little ahead of dotted ones.
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

  /* ---------- onboarding, the light re-ask, and "what comes next" ---------- */
  /* Interest chips: broad and friendly, generated on the device (no call); the learner can also type their own. */
  var INTERESTS = ["Animals", "Dinosaurs", "Space", "Building things", "Stories", "Numbers & puzzles", "Drawing", "Music", "How things work", "Nature", "Games", "Coding", "People & places", "Cooking", "Sports"];
  var AGE_LABELS = { "4-6": "4 to 6", "7-9": "7 to 9", "10-12": "10 to 12", "13-15": "13 to 15", "16-18": "16 to 18", adult: "Grown-up" };
  /* The first-run questions, static and in order; each is skippable. The name is asked first only when missing. */
  function onboarding(cloud, hasName) {
    var name = cloud && cloud.name ? cloud.name : "";
    var qs = [];
    if (!hasName) qs.push({ id: "name", q: "First, what's your first name?", input: true });
    qs.push({ id: "age", q: "Nice to meet you" + (name ? ", " + name : "") + ". Roughly how old are you? It helps us pick the right level. You can skip this.", chips: C.AGE_BANDS.map(function (a) { return { value: a, label: AGE_LABELS[a] }; }) });
    qs.push({ id: "interests", q: "What are you curious about, or what do you enjoy? Pick a few, or type your own.", chips: interestChips(cloud).map(function (x) { return { value: x, label: x }; }), multi: true, input: true });
    return qs;
  }
  /* Chips for interests, without the ones already given or already parents on the map, in a stable order. */
  function interestChips(cloud, max) {
    var have = {};
    if (cloud) { (C.profileOf(cloud).interests || []).forEach(function (x) { have[C.norm(x)] = 1; }); cloud.order.forEach(function (id) { have[cloud.nodes[id].key] = 1; }); }
    return INTERESTS.filter(function (x) { return !have[C.norm(x)]; }).slice(0, max || 10);
  }
  function needsOnboarding(cloud) { var p = C.profileOf(cloud); return !p.onboarded && C.topicCount(cloud) < PLAN.thinTopics; }
  /* Topics still open to learn (not done, not an end), dotted ones included. */
  function openTopics(cloud) { return cloud.order.filter(function (id) { var n = cloud.nodes[id]; return n.parent && !n.end && !C.isDone(cloud, id); }).length; }
  /*
   * One light question when the cloud is thin or the learner seems stuck (and not asked in the last few days).
   * -> { q, chips, why } or null. Answering it is one creation call ("more").
   */
  function reask(cloud, now) {
    now = now || Date.now();
    var p = C.profileOf(cloud), R = PLAN.reask;
    if (!p.onboarded || (p.askedAt && now - p.askedAt < R.days * DAY)) return null;
    var thin = openTopics(cloud) < R.open, stuck = (p.visits || 0) - (p.lessonVisit || 0) >= R.stuckVisits;
    if (!thin && !stuck) return null;
    return { q: thin ? "What else are you curious about lately?" : "Want to try something different? What do you enjoy these days?", chips: interestChips(cloud, 6), why: thin ? "thin" : "stuck" };
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
  function bridgeRequest(cloud, id) {
    var n = nodeOf(cloud, id), subj = n ? C.ancestry(cloud, id).map(function (x) { return cloud.nodes[x]; })[0] : null;
    return n ? { kind: "bridge", focus: n.label, focusParent: subj ? subj.label : "", trail: C.trail(cloud, id), parents: C.subjectLabels(cloud).slice(0, 12) } : null;
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
   * Merging: when a parent is ready to form (or upgrade) a higher-valued card. No calls, deterministic.
   *   form     >= MERGE.first core children at the Achieved tier (or merged themselves), not yet absorbed
   *   upgrade  a merged parent takes the next batch: >= MERGE.batch newly achieved children, or the last ones that
   *            complete its whole core sequence
   *   test     a test passed since the last merge absorbs every completed child not yet absorbed (>= 1)
   * Plans run deepest first, so a child can merge its own subtopics and then count as achieved for its parent.
   */
  var MERGE = { first: 3, batch: 2 };
  function mergePlan(cloud, pid) {
    var p = nodeOf(cloud, pid);
    if (!p || !p.parent || p.ghost) return null;
    var kids = C.childrenOf(cloud, pid).filter(function (c) { return !c.ghost && !c.absorbedInto; });
    var ready = kids.filter(function (c) { var t = C.tierOf(cloud, c.id); return t && t.rank >= 3; });
    var t = C.testOf(cloud, pid);
    if (t && t.passAt && t.passAt > (p.mergedAt || 0)) {
      var done = kids.filter(function (c) { return C.isDone(cloud, c.id); });
      if (done.length) return { id: pid, ids: done.map(function (c) { return c.id; }), why: "test" };
    }
    if (!ready.length) return null;
    var core = ready.filter(function (c) { return c.role !== "optional"; });
    if (!p.ml) return core.length >= MERGE.first ? { id: pid, ids: ready.map(function (c) { return c.id; }), why: "core" } : null;
    var coreLeft = C.coreChildren(cloud, pid).filter(function (c) { return !c.ghost && !c.absorbedInto && ready.indexOf(c) < 0; }).length;
    return ready.length >= MERGE.batch || (core.length && !coreLeft) ? { id: pid, ids: ready.map(function (c) { return c.id; }), why: "batch" } : null;
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
    var req = { kind: kind, age: p.age || "", region: p.region || "", interests: (extra && extra.interests) || (p.interests || []).slice(-5), favorites: (RK ? RK.top(cloud, { n: 5 }) : []).map(function (r) { return r.label; }) };
    /* broad subjects to file new parents under: the learner's own, then the palette's (data only, no topics) */
    req.parents = C.subjectLabels(cloud).concat(C.PALETTE.map(function (q) { return q.label; })).filter(function (x, i, all) { return all.map(C.norm).indexOf(C.norm(x)) === i; }).slice(0, 12);
    if (kind === "next" && n) { req.focus = n.label; req.trail = C.trail(cloud, id); req.known = C.childrenOf(cloud, id).map(function (c) { return c.label; }).slice(0, 16); }
    return req;
  }

  /*
   * A coarse region from the browser alone (no permission prompt, no lookup service): the time zone gives a
   * province / state / country ("America/Toronto" -> "Canada / Ontario-ish"), the locale's region code fills in a
   * country when the zone is unknown. -> "" when nothing fits. Shown and editable or clearable in the settings spot.
   */
  var ZONES = {
    "America/Toronto": "Canada / Ontario", "America/Montreal": "Canada / Quebec", "America/Halifax": "Canada / Nova Scotia", "America/St_Johns": "Canada / Newfoundland",
    "America/Winnipeg": "Canada / Manitoba", "America/Regina": "Canada / Saskatchewan", "America/Edmonton": "Canada / Alberta", "America/Vancouver": "Canada / British Columbia",
    "America/New_York": "USA / East", "America/Detroit": "USA / East", "America/Chicago": "USA / Central", "America/Denver": "USA / Mountain", "America/Phoenix": "USA / Arizona",
    "America/Los_Angeles": "USA / Pacific", "America/Anchorage": "USA / Alaska", "Pacific/Honolulu": "USA / Hawaii", "America/Mexico_City": "Mexico",
    "Europe/London": "United Kingdom", "Europe/Dublin": "Ireland", "Europe/Paris": "France", "Europe/Berlin": "Germany", "Europe/Madrid": "Spain", "Europe/Rome": "Italy",
    "Europe/Amsterdam": "Netherlands", "Europe/Stockholm": "Sweden", "Europe/Oslo": "Norway", "Europe/Warsaw": "Poland", "Asia/Kolkata": "India", "Asia/Tokyo": "Japan",
    "Asia/Singapore": "Singapore", "Asia/Shanghai": "China", "Asia/Manila": "Philippines", "Africa/Johannesburg": "South Africa", "Africa/Lagos": "Nigeria", "Africa/Nairobi": "Kenya",
    "Australia/Sydney": "Australia / New South Wales", "Australia/Melbourne": "Australia / Victoria", "Australia/Brisbane": "Australia / Queensland", "Australia/Perth": "Australia / Western Australia",
    "Pacific/Auckland": "New Zealand", "America/Sao_Paulo": "Brazil", "America/Argentina/Buenos_Aires": "Argentina"
  };
  function regionFrom(tz, locale) {
    var z = ZONES[String(tz || "")];
    if (z) return z.indexOf(" / ") > 0 ? z + "-ish" : z;
    var m = /[-_]([A-Z]{2})\b/.exec(String(locale || ""));
    if (m) {
      try { var dn = new Intl.DisplayNames(["en"], { type: "region" }).of(m[1]); if (dn && dn !== m[1]) return dn; } catch { /* older browsers */ }
    }
    return "";
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
      id = (suggest(cloud, { now: now, exclude: ex, n: 3, noAsk: true }).filter(function (x) { return x.kind !== "test" && x.kind !== "grow" && x.id; })[0] || {}).id || null;
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
    PLAN: PLAN, engaged: engaged, wantChildren: wantChildren, childrenReady: childrenReady, orderedChildren: orderedChildren, sidePaths: sidePaths, needsBridge: needsBridge, bridgeRequest: bridgeRequest, needsRepair: needsRepair, repairRequest: repairRequest,
    MERGE: MERGE, mergePlan: mergePlan, mergePlans: mergePlans, settleMerges: settleMerges, nextChild: nextChild,
    orderChoices: orderChoices, testState: testState, readyTests: readyTests, testRequest: testRequest, nextSteps: nextSteps, explore: explore, exploreAll: exploreAll,
    suggest: suggest, draw: draw, lessonContext: lessonContext, aheadOf: aheadOf,
    onboarding: onboarding, interestChips: interestChips, needsOnboarding: needsOnboarding, reask: reask, openTopics: openTopics,
    needsNext: needsNext, readyNext: readyNext, createRequest: createRequest, regionFrom: regionFrom, ZONES: ZONES, AGE_LABELS: AGE_LABELS
  };
  if (node_) module.exports = api;
  else root.IkoPlan = api;
})(typeof window !== "undefined" ? window : this);
