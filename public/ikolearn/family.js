/*
 * IkoLearn for parents & teachers (IkoFamily): a calm, read-only view of one learner's progress on this device.
 *
 *   summary(cloud, { now, lessons })  -> the view model, built only from what the app already stores (the v9 cloud and
 *                                        the lesson cache). Pure: it never changes the cloud and never makes a call.
 *   text(model)                       -> the same, as a short plain-text summary to copy or print.
 *   render(doc, model, root)          -> the page (text nodes only, no innerHTML).
 *
 * Nothing new is stored and nothing is invented: every number is a count of something the learner did. Where Next uses
 * the lesson's own rule (IkoPlan.whereNext with IkoPlan.nextStep), from the topic the learner was last on.
 */
(function (root) {
  "use strict";
  var node_ = typeof module !== "undefined" && module.exports;
  /* eslint-disable @typescript-eslint/no-require-imports -- UMD: Node tests load the model, the browser has window.Iko* */
  var C = node_ ? require("./cloud-model.js") : root.IkoCloud;
  var D = node_ ? require("./deck.js") : root.IkoDeck;
  var P = node_ ? require("./orchestrator.js") : root.IkoPlan;
  /* eslint-enable @typescript-eslint/no-require-imports */
  var DAY = 86400000;
  var LIMIT = { recent: 5, progress: 6, cards: 3, branches: 4 };
  var KIND = { path: "Next on this path", branch: "A related branch" };

  function live(cloud, id) { var n = cloud.nodes[id]; return n && !n.ghost ? n : null; }
  function lastAt(n, lessons) { var l = lessons && lessons[n.id]; return Math.max(n.touched || 0, n.doneAt || 0, n.achievedAt || 0, (l && l.at) || 0); }
  function started(n) { return Boolean(n.opened || (n.engaged || 0) > 0 || (n.correct || 0) > 0 || (n.spent || 0) > 0); }
  function topicsUnder(cloud, sid, ix) { return D.subtree(cloud, sid, ix).slice(1).filter(function (x) { return live(cloud, x); }); }
  function covered(cloud, x) { var cv = D.coverage(cloud, x); return Boolean(cv && cv.state === "covered"); }
  function inProgress(cloud, x) { var cv = D.coverage(cloud, x); return Boolean(cv && cv.state === "progress"); }
  function afterOf(cloud, id) { return C.lockedBy(cloud, id).map(function (x) { return cloud.nodes[x].label; }); }
  function subjectName(cloud, id) { var s = C.subjectOf(cloud, id); return s && s.id !== id ? s.label : ""; }

  /* "today", "yesterday", "3 days ago", "2 weeks ago" (no clock times: a parent wants the rhythm, not a log) */
  function when(t, now) {
    if (!t) return "";
    var d = Math.floor(startOf(now) / DAY) - Math.floor(startOf(t) / DAY);
    if (d <= 0) return "today";
    if (d === 1) return "yesterday";
    if (d < 14) return d + " days ago";
    if (d < 60) return Math.round(d / 7) + " weeks ago";
    return Math.round(d / 30) + " months ago";
  }
  function startOf(t) { var x = new Date(t); return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()); }
  /* minutes with a lesson open, rounded gently: "about 5 minutes", "about 1 hour 20 minutes"; "" under a minute */
  function duration(sec) {
    var m = Math.round((sec || 0) / 60);
    if (m < 1) return "";
    if (m < 60) return "about " + m + (m === 1 ? " minute" : " minutes");
    var h = Math.floor(m / 60), r = Math.round((m % 60) / 5) * 5;
    if (r === 60) { h += 1; r = 0; }
    return "about " + h + (h === 1 ? " hour" : " hours") + (r ? " " + r + " minutes" : "");
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many || one + "s"); }

  function summary(cloud, opts) {
    opts = opts || {};
    var now = opts.now || Date.now(), lessons = opts.lessons || {};
    if (!cloud || !cloud.nodes) return { empty: true, name: "", lede: lede({ empty: true }) };
    var ix = C.index(cloud), name = cloud.name && cloud.name !== "Me" ? cloud.name : "";
    var all = cloud.order.filter(function (x) { var n = live(cloud, x); return n && n.parent; });

    /* subjects (the learner's own parents) and their branches: covered of known, as the album counts them */
    var subjects = C.subjects(cloud).map(function (s) {
      var ids = topicsUnder(cloud, s.id, ix), done = ids.filter(function (x) { return covered(cloud, x); }).length;
      var going = ids.filter(function (x) { return inProgress(cloud, x); }).length;
      var branches = C.childrenOf(cloud, s.id).filter(function (b) { return !b.ghost; }).map(function (b) {
        var sub = [b.id].concat(topicsUnder(cloud, b.id, ix));
        return { id: b.id, label: b.label, covered: sub.filter(function (x) { return covered(cloud, x); }).length, known: sub.length, last: lastAt(b, lessons) };
      }).sort(function (a, b) { return b.covered - a.covered || b.last - a.last; });
      return { id: s.id, label: s.label, hue: C.hueOf(cloud, s.id), known: ids.length, covered: done, going: going, branches: branches.slice(0, LIMIT.branches), moreBranches: Math.max(0, branches.length - LIMIT.branches) };
    }).filter(function (s) { return s.known > 0; })
      .sort(function (a, b) { return b.covered - a.covered || b.going - a.going || a.label.localeCompare(b.label); });

    /* recent lessons: topics the learner opened or worked on, newest first */
    var recent = all.filter(function (x) { return started(cloud.nodes[x]); })
      .map(function (x) { var n = cloud.nodes[x]; return { id: x, label: n.label, subject: subjectName(cloud, x), at: lastAt(n, lessons), when: when(lastAt(n, lessons), now), done: covered(cloud, x) }; })
      .filter(function (r) { return r.at; })
      .sort(function (a, b) { return b.at - a.at; });

    /* activity: only what is counted on the device */
    var spent = all.reduce(function (t, x) { return t + (cloud.nodes[x].spent || 0); }, 0);
    var week = recent.filter(function (r) { return now - r.at < 7 * DAY; }).length;
    var activity = {
      opened: recent.length, week: week, time: duration(spent), seconds: spent,
      visits: (cloud.profile && cloud.profile.visits) || 0, last: recent[0] ? recent[0].when : "", since: cloud.created ? when(cloud.created, now) : ""
    };

    /* the Deck: every card earned, by tier; the three strongest shown */
    var deck = (cloud.deck || []).map(function (e) { return e.id; }).filter(function (id) { return C.growthOf(cloud, id); });
    var tiers = {};
    deck.forEach(function (id) { var g = C.growthOf(cloud, id); var k = g.level ? "Merged" : C.TIER_NAMES[g.tier]; tiers[k] = (tiers[k] || 0) + 1; });
    var order = ["Merged", "Achieved", "Tinted", "Inked", "Sketch"];
    var best = deck.slice().sort(function (a, b) {
      return D.evolveKey(D.cardSpec(cloud, b)) - D.evolveKey(D.cardSpec(cloud, a)) || (C.deckEntry(cloud, b).at || 0) - (C.deckEntry(cloud, a).at || 0);
    }).filter(function (id) { return !C.absorbedInto(cloud, id) || !C.inDeck(cloud, C.absorbedInto(cloud, id)); }).slice(0, LIMIT.cards);
    var cards = { total: deck.length, tiers: order.filter(function (k) { return tiers[k]; }).map(function (k) { return { name: k, n: tiers[k] }; }), best: best };

    /* in progress: started, not finished yet (with a quiet "after X" when a step comes first) */
    var progress = all.filter(function (x) { return inProgress(cloud, x) && !C.subjects(cloud).some(function (s) { return s.id === x; }); })
      .map(function (x) { var n = cloud.nodes[x]; return { id: x, label: n.label, subject: subjectName(cloud, x), after: afterOf(cloud, x), at: lastAt(n, lessons) }; })
      .sort(function (a, b) { return b.at - a.at; });

    /* Where Next, from the topic the learner was last on: the lesson's own rule, 0 calls */
    var anchor = cloud.active && live(cloud, cloud.active) ? cloud.active : recent[0] ? recent[0].id : null;
    var next = null;
    if (anchor) {
      var w = P.whereNext(cloud, anchor, P.nextStep(cloud, anchor));
      next = { from: cloud.nodes[anchor].label, choices: w.choices.map(function (c) { return { id: c.id, label: cloud.nodes[c.id].label, kind: c.kind, why: KIND[c.kind] || "", subject: subjectName(cloud, c.id) }; }) };
    }

    /* tests: taken (passed or not yet) and ready to take */
    var taken = Object.keys(cloud.tests || {}).filter(function (id) { var t = cloud.tests[id]; return cloud.nodes[id] && t && t.attempts; })
      .map(function (id) { var t = cloud.tests[id]; return { id: id, label: cloud.nodes[id].label, passed: Boolean(t.passAt) || (t.best || 0) >= C.TEST_PASS, best: Math.round((t.best || 0) * 100), attempts: t.attempts, at: t.passAt || t.at || 0 }; })
      .sort(function (a, b) { return b.passed - a.passed || b.at - a.at; });
    var ready = cloud.order.filter(function (id) { var s = P.testState(cloud, id); return s && s.ready; }).map(function (id) { return { id: id, label: cloud.nodes[id].label }; });
    var tests = { passed: taken.filter(function (t) { return t.passed; }).length, taken: taken, ready: ready };

    var model = {
      empty: !all.length && !cards.total, name: name, asOf: now, subjects: subjects, recent: recent.slice(0, LIMIT.recent), activity: activity,
      cards: cards, progress: progress.slice(0, LIMIT.progress), moreProgress: Math.max(0, progress.length - LIMIT.progress), next: next, tests: tests
    };
    model.lede = lede(model);
    return model;
  }

  /* One encouraging line, from the counts only (no grades, no comparisons). */
  function lede(m) {
    if (m.empty) return "Nothing here yet. Once learning starts in IkoLearn on this device, a short summary appears here.";
    var who = m.name || "This learner", bits = [];
    var topics = m.activity.opened;
    if (topics) bits.push("explored " + plural(topics, "topic") + (m.subjects.length ? " across " + plural(m.subjects.length, "subject") : ""));
    if (m.cards.total) bits.push("earned " + plural(m.cards.total, "card"));
    if (m.tests.passed) bits.push("passed " + plural(m.tests.passed, "test"));
    if (!bits.length) return who + " has made a start. The first topics are ready to explore.";
    return who + " has " + (bits.length > 1 ? bits.slice(0, -1).join(", ") + " and " + bits[bits.length - 1] : bits[0]) + ".";
  }

  function dateText(t) {
    try { return new Date(t).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric" }); } catch { return ""; }
  }

  /* The plain-text summary (copy or print). Same facts as the page, nothing more. */
  function text(m) {
    var L = [];
    L.push("IkoLearn summary" + (m.name ? " for " + m.name : "") + (m.asOf ? ", " + dateText(m.asOf) : ""));
    L.push("");
    L.push(m.lede);
    if (m.empty) return L.join("\n");
    if (m.subjects.length) {
      L.push(""); L.push("Subjects");
      m.subjects.forEach(function (s) {
        L.push("- " + s.label + ": " + s.covered + " of " + s.known + " topics covered" + (s.going ? ", " + s.going + " in progress" : ""));
      });
    }
    if (m.recent.length) { L.push(""); L.push("Recent lessons"); m.recent.forEach(function (r) { L.push("- " + r.label + (r.subject ? " (" + r.subject + ")" : "") + ", " + r.when); }); }
    var a = m.activity, act = [];
    if (a.time) act.push(a.time + " with lessons open");
    if (a.week) act.push(plural(a.week, "topic") + " worked on in the last 7 days");
    if (act.length) { L.push(""); L.push("Activity: " + act.join("; ")); }
    if (m.cards.total) { L.push(""); L.push("Cards in the Deck: " + m.cards.total + " (" + m.cards.tiers.map(function (t) { return t.n + " " + t.name; }).join(", ") + ")"); }
    if (m.progress.length) { L.push(""); L.push("In progress"); m.progress.forEach(function (p) { L.push("- " + p.label + (p.subject ? " (" + p.subject + ")" : "") + (p.after.length ? " (after " + D.listOf(p.after) + ")" : "")); }); }
    if (m.next && m.next.choices.length) { L.push(""); L.push("Where next, after " + m.next.from); m.next.choices.forEach(function (c) { L.push("- " + c.label + " (" + c.why.toLowerCase() + ")"); }); }
    if (m.tests.taken.length || m.tests.ready.length) {
      L.push(""); L.push("Tests");
      m.tests.taken.forEach(function (t) { L.push("- " + t.label + ": " + (t.passed ? "passed" : "tried, not passed yet") + ", best " + t.best + "%"); });
      m.tests.ready.forEach(function (t) { L.push("- " + t.label + ": ready to take"); });
    }
    L.push(""); L.push("Kept on this device. Nothing here was sent anywhere.");
    return L.join("\n");
  }

  /* ---------- the page ---------- */
  function el(doc, tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function section(doc, title, id) { var s = el(doc, "section", "fam-sec"); s.setAttribute("aria-labelledby", id); var h = el(doc, "h2", "", title); h.id = id; s.appendChild(h); return s; }
  function meter(doc, done, total, hue) {
    var m = el(doc, "span", "fam-meter"); m.setAttribute("aria-hidden", "true");
    var f = el(doc, "span", "fam-fill"); f.style.width = (total ? Math.round(100 * done / total) : 0) + "%";
    if (hue != null) f.style.background = "hsl(" + hue + " 32% 46%)";
    m.appendChild(f); return m;
  }
  function list(doc, items, fn) { var ul = el(doc, "ul", "fam-list"); items.forEach(function (x) { var li = el(doc, "li"); fn(li, x); ul.appendChild(li); }); return ul; }

  function render(doc, m, rootEl, cloud) {
    while (rootEl.firstChild) rootEl.removeChild(rootEl.firstChild);
    var head = el(doc, "header", "fam-head");
    head.appendChild(el(doc, "p", "fam-kicker", "For parents & teachers"));
    head.appendChild(el(doc, "h1", "", m.name ? m.name + "'s learning" : "Learning so far"));
    head.appendChild(el(doc, "p", "fam-lede", m.lede));
    if (m.asOf) head.appendChild(el(doc, "p", "fine", "As of " + dateText(m.asOf) + ". Read from this device only; nothing is sent anywhere."));
    rootEl.appendChild(head);
    if (m.empty) { var back = el(doc, "p"); var a = el(doc, "a", "", "Open IkoLearn"); a.href = "/ikolearn/"; back.appendChild(a); rootEl.appendChild(back); return; }

    if (m.subjects.length) {
      var s = section(doc, "Subjects", "fam-subjects");
      s.appendChild(list(doc, m.subjects, function (li, x) {
        li.className = "fam-subject";
        var row = el(doc, "p", "fam-row"); row.appendChild(el(doc, "span", "fam-name", x.label));
        row.appendChild(el(doc, "span", "fam-count", x.covered + " of " + x.known + " covered"));
        li.appendChild(row); li.appendChild(meter(doc, x.covered, x.known, x.hue));
        var parts = x.branches.map(function (b) { return b.label + " " + b.covered + " of " + b.known; });
        if (x.moreBranches) parts.push("+" + x.moreBranches + " more");
        if (parts.length) li.appendChild(el(doc, "p", "fam-sub", parts.join(" · ")));
        if (x.going) li.appendChild(el(doc, "p", "fam-sub", plural(x.going, "topic") + " in progress"));
      }));
      rootEl.appendChild(s);
    }

    if (m.next && m.next.choices.length) {
      var w = section(doc, "Where next", "fam-next");
      w.appendChild(el(doc, "p", "fam-sub", "What IkoLearn would offer after " + m.next.from + ", the same choices the lesson shows."));
      w.appendChild(list(doc, m.next.choices, function (li, c) {
        li.appendChild(el(doc, "span", "fam-name", c.label));
        li.appendChild(el(doc, "span", "fam-why", c.why + (c.subject && c.kind === "other" ? " · " + c.subject : "")));
      }));
      rootEl.appendChild(w);
    }

    if (m.progress.length) {
      var p = section(doc, "In progress", "fam-progress");
      p.appendChild(list(doc, m.progress, function (li, x) {
        li.appendChild(el(doc, "span", "fam-name", x.label));
        li.appendChild(el(doc, "span", "fam-why", (x.subject || "") + (x.after.length ? (x.subject ? " · " : "") + "after " + D.listOf(x.after) : "")));
      }));
      if (m.moreProgress) p.appendChild(el(doc, "p", "fine", "+" + m.moreProgress + " more"));
      rootEl.appendChild(p);
    }

    if (m.recent.length) {
      var r = section(doc, "Recent lessons", "fam-recent");
      r.appendChild(list(doc, m.recent, function (li, x) {
        li.appendChild(el(doc, "span", "fam-name", x.label));
        li.appendChild(el(doc, "span", "fam-why", x.when + (x.done ? " · covered" : "")));
      }));
      var a2 = m.activity, bits = [];
      if (a2.time) bits.push(a2.time.replace(/^a/, "A") + " with lessons open");
      if (a2.week) bits.push(plural(a2.week, "topic") + " worked on in the last 7 days");
      if (bits.length) r.appendChild(el(doc, "p", "fam-sub", bits.join(" · ")));
      rootEl.appendChild(r);
    }

    if (m.cards.total) {
      var c = section(doc, "Cards in the Deck", "fam-cards");
      c.appendChild(el(doc, "p", "fam-sub", m.cards.total + " earned · " + m.cards.tiers.map(function (t) { return t.n + " " + t.name; }).join(" · ")));
      if (cloud && D.render) {
        var row2 = el(doc, "div", "fam-deck");
        m.cards.best.forEach(function (id) { var spec = D.cardSpec(cloud, id); if (spec) row2.appendChild(D.render(doc, spec, { size: "tile" })); });
        c.appendChild(row2);
      }
      rootEl.appendChild(c);
    }

    if (m.tests.taken.length || m.tests.ready.length) {
      var t = section(doc, "Tests", "fam-tests");
      t.appendChild(list(doc, m.tests.taken.concat(m.tests.ready.map(function (x) { return { label: x.label, ready: true }; })), function (li, x) {
        li.appendChild(el(doc, "span", "fam-name", x.label));
        li.appendChild(el(doc, "span", "fam-why", x.ready ? "ready to take" : x.passed ? "passed · best " + x.best + "%" : "tried · not passed yet"));
      }));
      rootEl.appendChild(t);
    }
  }

  /* ---------- guiding several learners: one line each, every one opening to its own view ---------- */
  /* learners: [{ id, name, active, cloud, lessons }] -> { learners: [{ id, name, active, model, line }], text } */
  function overview(learners, opts) {
    opts = opts || {};
    var now = opts.now || Date.now();
    var rows = (learners || []).map(function (l) {
      var m = summary(l.cloud, { now: now, lessons: l.lessons || {} });
      if (!m.name) m.name = l.name;
      if (m.empty) m.lede = "Hasn't started yet.";
      else m.lede = lede(m);
      var bits = [];
      if (!m.empty) {
        if (m.subjects.length) bits.push(plural(m.subjects.length, "subject"));
        if (m.cards.total) bits.push(plural(m.cards.total, "card"));
        if (m.tests.passed) bits.push(plural(m.tests.passed, "test") + " passed");
        if (m.activity.last) bits.push("last lesson " + m.activity.last);
      }
      return { id: l.id, name: l.name, active: Boolean(l.active), model: m, line: bits.join(" · ") };
    });
    return { asOf: now, learners: rows };
  }
  function overviewText(o) {
    var L = ["IkoLearn summary for " + plural(o.learners.length, "learner") + (o.asOf ? ", " + dateText(o.asOf) : "")];
    o.learners.forEach(function (r) { L.push(""); L.push("== " + r.name + " =="); L.push(r.model.empty ? r.model.lede : text(r.model).split("\n").slice(2, -2).join("\n")); });
    L.push(""); L.push("Kept on this device. Nothing here was sent anywhere.");
    return L.join("\n");
  }
  function renderOverview(doc, o, rootEl, hrefOf) {
    while (rootEl.firstChild) rootEl.removeChild(rootEl.firstChild);
    var head = el(doc, "header", "fam-head");
    head.appendChild(el(doc, "p", "fam-kicker", "For parents & teachers"));
    head.appendChild(el(doc, "h1", "", "Your learners"));
    head.appendChild(el(doc, "p", "fam-lede", plural(o.learners.length, "learner") + " on this device, each with their own cloud, Deck and progress."));
    if (o.asOf) head.appendChild(el(doc, "p", "fine", "As of " + dateText(o.asOf) + ". Read from this device only; nothing is sent anywhere."));
    rootEl.appendChild(head);
    var s = section(doc, "Learners", "fam-learners");
    s.appendChild(list(doc, o.learners, function (li, r) {
      li.className = "fam-learner";
      var row = el(doc, "p", "fam-row"), a = el(doc, "a", "fam-name", r.name); a.href = hrefOf(r.id);
      row.appendChild(a); row.appendChild(el(doc, "span", "fam-why", r.active ? "learning now" : ""));
      li.appendChild(row);
      li.appendChild(el(doc, "p", "fam-sub", r.model.lede));
      if (r.line) li.appendChild(el(doc, "p", "fam-sub", r.line));
    }));
    rootEl.appendChild(s);
  }

  var api = { LIMIT: LIMIT, KIND: KIND, summary: summary, text: text, render: render, when: when, duration: duration, lede: lede, overview: overview, overviewText: overviewText, renderOverview: renderOverview };
  if (node_) { module.exports = api; return; }
  root.IkoFamily = api;

  /* the page: read the saved learner(s) (never written back), draw the view, and offer Copy and Print */
  var doc = root.document, host = doc && doc.getElementById("fam");
  if (!host) return;
  var PR = root.IkoProfiles, S = root.localStorage;
  function read(k) { try { return S.getItem(k); } catch { return null; } }
  var ix = null;
  try { ix = PR ? PR.current(S) : null; } catch { ix = null; }
  /* one learner's stored value: the live keys for the learner learning now, their parked copy otherwise (IkoProfiles) */
  function readOf(id, k) { if (PR && ix) { try { return PR.read(S, id, k); } catch { return null; } } return read("ikolearn.v1." + k); }
  function load(id) {
    var cloud = null, lessons = {};
    try { cloud = readOf(id, "name") ? C.deserialize(readOf(id, "cloud")) : null; } catch { cloud = null; }
    try { lessons = JSON.parse(readOf(id, "lessons") || "{}") || {}; } catch { lessons = {}; }
    return { cloud: cloud, lessons: lessons };
  }
  var want = null;
  try { want = new root.URLSearchParams(root.location.search).get("learner"); } catch { want = null; }
  var guiding = Boolean(ix && ix.mode === "guide"), known = ix ? ix.list.map(function (p) { return p.id; }) : [];
  var hrefOf = function (id) { return "/ikolearn/family?learner=" + encodeURIComponent(id); };
  var summaryText = "", m;
  if (guiding && !(want && known.indexOf(want) >= 0)) {
    var o = overview(PR.learners(S).map(function (p) { var d = load(p.id); return { id: p.id, name: p.name, active: p.active, cloud: d.cloud, lessons: d.lessons }; }));
    renderOverview(doc, o, host, hrefOf);
    summaryText = overviewText(o);
  } else {
    var id = want && known.indexOf(want) >= 0 ? want : ix ? ix.active : null, d = load(id);
    m = summary(d.cloud, { lessons: d.lessons });
    render(doc, m, host, d.cloud);
    if (guiding) { var up = el(doc, "p", "fam-back"), al = el(doc, "a", "", "All learners"); al.href = "/ikolearn/family"; al.id = "fam-all"; up.appendChild(al); host.insertBefore(up, host.firstChild); }
    summaryText = m.empty ? "" : text(m);
  }
  var tools = doc.getElementById("fam-tools"), status = doc.getElementById("fam-status");
  if (!summaryText) { if (tools) tools.hidden = true; return; }
  doc.getElementById("fam-copy").addEventListener("click", function () {
    var done = function (ok) { status.textContent = ok ? "Summary copied." : "Couldn't copy here. Use Print instead."; };
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) root.navigator.clipboard.writeText(summaryText).then(function () { done(true); }, function () { done(false); });
    else done(false);
  });
  doc.getElementById("fam-print").addEventListener("click", function () { root.print(); });
})(typeof window !== "undefined" ? window : this);
