/*
 * IkoLearn app: chat harness, learning cards, lessons and the learning cloud. Vanilla JS, no build step.
 * Talks only to our own routes under /api/ikolearn (the server holds the Gemini key). Everything about the learner
 * (first name, recent conversation, cloud, cards, lessons) is kept in this browser's localStorage.
 * Calls: chat turn 1, tap note 1 (cached), card 1, related topics 1 (only once a branch has ended), map a path 1,
 * lesson 1 (cached per node; the same call brings 2-3 check questions, the fork of 2-3 choices, the card's line, and the
 * topic's child topics when it has none, which grow onto the cloud once the topic is engaged), test 1 (cached until taken).
 * Suggestions, Draw, the orchestrator (orchestrator.js), answering, reopening a lesson, picking a fork choice, the holder,
 * the deck, card colour and tiers, merging cards into a parent, the cloud's camera and the top 10 cost nothing.
 * A bridge (a topic that landed too close to its subject) is 1 call after the chat reply, plus at most 1 repair call per
 * topic, ever, when its chain is still shallow.
 */
(function () {
  "use strict";
  var PR = window.IkoProfiles; /* learners: yourself, or guiding others (additive storage; the v1 keys stay the learner learning now) */
  var C = window.IkoCloud, V = window.IkoCloudView, L = window.IkoLesson, D = window.IkoDeck, R = window.IkoRank, P = window.IkoPlan, CAM = window.IkoCamera;
  var TH = window.IkoTheme; /* light and dark (theme.js): colours set from script are toned for the page */
  function tint(el, props) { if (TH) return TH.paint(el, props); Object.keys(props).forEach(function (k) { el.style.setProperty(k, props[k]); }); }
  var T = window.IkoTransfer; /* the cloud as one file: Save IkoCloud / Open IkoCloud (transfer.js) */
  var API = "/api/ikolearn";
  var LS = { name: "ikolearn.v1.name", cloud: "ikolearn.v1.cloud", thread: "ikolearn.v1.thread", notes: "ikolearn.v1.notes", lessons: "ikolearn.v1.lessons", tests: "ikolearn.v1.tests", view: "ikolearn.v1.view", seen: "ikolearn.v1.seen" };
  var VISIT = "ikolearn.v1.visit"; /* sessionStorage: this browser session was counted as a visit */
  var CUES = "ikolearn.v1.cues"; /* sessionStorage: the screens whose Iko bubble was shown this visit (each once a visit) */
  var IKO_MEM = "ikolearn-iko"; /* localStorage, this device only (beside the theme, outside every learner's cloud and IkoCloud file): the tips and reactions Iko has shown, per learner */
  var SESSION = "ikolearn.v1.session"; /* sessionStorage: the old once-a-visit draw (no longer written; cleared on reset) */
  var HISTORY = 10, TIMEOUT_MS = 60000, CREATE_TIMEOUT_MS = 95000, MAX_LESSONS = 30;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    welcome: $("welcome"), nameForm: $("name-form"), nameIn: $("name-in"), who: $("who"), nameLabel: $("name-label"), nameHint: $("name-hint"), whoNow: $("who-now"),
    chat: $("chat"), thread: $("thread"), dock: $("dock"), composer: $("composer"), input: $("input"), send: $("send"),
    thumb: $("thumb"), thumbCanvas: $("thumb-canvas"), reset: $("reset"),
    focusChip: $("focus-chip"), focusText: $("focus-text"), focusClear: $("focus-clear"),
    lesson: $("lesson"), lBack: $("l-back"), lTrail: $("l-trail"), lTitle: $("l-title"), lBody: $("l-body"), lDone: $("l-done"),
    lGot: $("l-got"), lConf: $("l-conf"), lCont: $("l-cont"), phEarn: $("ph-earn"), lStatus: $("l-status"), lPath: $("l-path"), lClar: $("l-clar"), lNext: $("l-next"), lChat: $("l-chat"), lRedo: $("l-redo"),
    cloud: $("cloud"), cloudCanvas: $("cloud-canvas"), cloudDeck: $("cloud-deck"), cloudRet: $("cloud-ret"), barRet: $("bar-ret"), cloudWho: $("cloud-who"), chatBack: $("chat-back"),
    ageLink: $("age-link"),
    cs: $("cloud-start"), csName: $("cs-name"), csAges: $("cs-ages"), csHi: $("cs-hi"), csQ: $("cs-q"), csFew: $("cs-few"), csForm: $("cs-form"), csIn: $("cs-in"), csEx: $("cs-ex"), csStatus: $("cs-status"),
    youHint: $("you-hint"), nameEdit: $("name-edit"), nameEditIn: $("name-edit-in"), addSub: $("add-sub"), addIn: $("add-sub-in"), addStatus: $("add-status"),
    start: $("start-layer"), slHi: $("sl-hi"), slForm: $("sl-form"), slName: $("sl-name"), slKeep: $("sl-keep"), slIn: $("sl-in"), slEx: $("sl-ex"), slSkip: $("sl-skip"), slStatus: $("sl-status"),
    zoomList: $("zoom-list"), zoomKicker: $("zoom-kicker"), zoomTitle: $("zoom-title"), zoomItems: $("zoom-items"),
    ikoWrap: $("iko-wrap"), iko: $("iko"), ikoLine: $("iko-line"), ikoSheet: $("iko-sheet"), ikoAbout: $("iko-about"), ikoX: $("iko-x"), ikoSay: $("iko-say"), ikoActs: $("iko-acts"), ikoGot: $("iko-got"), ikoBody: $("iko-body"), ikoSlot: $("iko-slot"), ikoLog: $("iko-log"), ikoForm: $("iko-form"), ikoIn: $("iko-in"), ikoAll: $("iko-all"), zin: $("zin"), zout: $("zout"), zreset: $("zreset"),
    panel: $("panel"), cloudTop: document.querySelector(".cloud-top"), pKicker: $("p-kicker"), pTitle: $("p-title"), pDesc: $("p-desc"), pNote: $("p-note"), pLesson: $("p-lesson"), pCard: $("p-card"), pAdj: $("p-adj"),
    pChat: $("p-chat"), pPath: $("p-path"), pClose: $("p-close"),
    draw: $("draw"), deckBtn: $("deck-btn"), deck: $("deck"), dBack: $("d-back"), dLede: $("d-lede"), dAlbum: $("d-album"),
    hub: $("hub"), hubBack: $("hub-back"), hubCrumb: $("hub-crumb"), hubCard: $("hub-card"), hubTitle: $("hub-title"), hubState: $("hub-state"),
    hubNote: $("hub-note"), hubLesson: $("hub-lesson"), hubTest: $("hub-test"), hubCloud: $("hub-cloud"), hubCorpus: $("hub-corpus"), hubKids: $("hub-kids"), dBalance: $("d-balance"),
    lCard: $("l-card"), lFork: $("l-fork"), lQuiz: $("l-quiz"), hNote: $("h-note"),
    top: $("top"), tLede: $("t-lede"), tList: $("t-list"),
    dSuggest: $("d-suggest"), hKids: $("h-kids"), lPhase: $("l-phase"), phLearn: $("ph-learn"), phCheck: $("ph-check"), pTest: $("p-test"),
    lMain: document.querySelector("#lesson .l-main"), cloudHint: document.querySelector("#cloud .cloud-hint"),
    ctFile: $("ct-file"), dTools: $("d-tools"), wOpen: $("w-open"), wStatus: $("w-status"),
    ikc: $("ik-confirm"), ikcText: $("ikc-text"), ikcYes: $("ikc-yes"), ikcNo: $("ikc-no")
  };
  var reduceMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  var state = { name: "", cloud: null, thread: [], notes: {}, lessons: {}, busy: false, focus: null, panelNode: null, lessonNode: null, lessonAt: 0, revealed: false, lifted: 0, session: null, quiz: null, tests: {}, test: null, mode: "lesson", bridgeQueue: [], queued: null, pick: null, glide: null, view: null, dirForm: null, dirText: "", allDone: false, seen: { c: {}, ev: 0 }, ex: { list: [], growth: [], at: 0, gat: 0, status: "idle" }, zoomId: null, zoomAt: 0, zoomQ: "", zoomSort: "recent", zoomDone: "", zoomPage: 0, topicQ: "", topicSort: "recent", topicDone: "", topicPage: 0 };
  var mini = null, big = null;

  /* ---------- storage ---------- */
  function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
  /* true when written. A full store (QuotaExceeded) or a blocked one throws, and setItem leaves the old value as it was,
     so a failed write never corrupts a save: the app keeps working in memory. */
  function store(k, v) { if (frozen) return false; try { localStorage.setItem(k, v); return true; } catch { return false; } }
  /* set once a cloud file has been written (just before the reload): nothing from this page may write over it */
  var frozen = false;
  /* Rough use of this origin's storage (chars of keys + values, every learner in guide mode included). */
  function storeUse() { var t = 0; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); t += k.length + (localStorage.getItem(k) || "").length; } } catch { return 0; } return t; }
  /* One quiet line from Iko, at most once a visit: the browser's storage is nearly full, or full. */
  var storeNote = { warned: false, full: false, saves: 0, text: "" };
  function storeSay(full) {
    if (full ? storeNote.full : storeNote.warned) return;
    storeNote.warned = true; if (full) storeNote.full = true;
    storeNote.text = full ? "This browser's storage is full, so your latest changes are kept for this visit only." : "This browser's storage is nearly full. Your cloud is fine; older lessons may be let go to make room.";
    if (iko.open) storeInSheet(); else ikoLine(storeNote.text, 12000);
  }
  /* with Iko's sheet open (or opening while the line shows), the note goes in the sheet instead of the line */
  function storeInSheet() { var t = storeNote.text; storeNote.text = ""; if (t) push({ role: "model", local: true, text: t }); }
  /* The cloud comes first: when its write doesn't fit, the cached lessons and notes make room (they can be written
     again), then the cloud tries once more. If it still doesn't fit, the last good save stays as it was, nothing else
     is written over it (so the saved pieces stay in step), and Iko says so once. */
  function storeCloud(text) {
    if (store(LS.cloud, text)) return true;
    var ids = Object.keys(state.lessons);
    state.lessons = keepNewest(state.lessons, Math.min(5, Math.floor(ids.length / 2)));
    store(LS.lessons, JSON.stringify(state.lessons));
    var nk = Object.keys(state.notes).slice(-5), notes = {};
    nk.forEach(function (k) { notes[k] = state.notes[k]; });
    state.notes = notes; store(LS.notes, JSON.stringify(notes));
    return store(LS.cloud, text);
  }
  function keepNewest(obj, max) {
    var keys = Object.keys(obj).sort(function (a, b) { return (obj[a].at || 0) - (obj[b].at || 0); }).slice(-max), out = {};
    keys.forEach(function (k) { out[k] = obj[k]; });
    return out;
  }
  function save() {
    C.joinDeck(state.cloud); /* any topic past the threshold joins the deck for good */
    if (window.IkoUsage) window.IkoUsage.sync(state.cloud); /* anonymous counts only (usage.js) */
    var text = C.serialize(state.cloud);
    if (text.length > C.STORE.softChars && C.prune(state.cloud)) text = C.serialize(state.cloud); /* past the byte ceiling: old placeholders go */
    if (!storeCloud(text)) { storeSay(true); return; }
    if (storeNote.saves++ % 25 === 0 && storeUse() > C.STORE.warnChars) storeSay(false);
    store(LS.thread, JSON.stringify(C.trimThread(state.thread.map(function (m) {
      var c = Object.assign({}, m); delete c.streaming; return c;
    }))));
    var keys = Object.keys(state.notes).slice(-30), notes = {};
    keys.forEach(function (k) { notes[k] = state.notes[k]; });
    state.notes = notes;
    store(LS.notes, JSON.stringify(notes));
    Object.keys(state.lessons).forEach(function (id) { if (!state.cloud.nodes[id]) delete state.lessons[id]; });
    state.lessons = keepNewest(state.lessons, MAX_LESSONS);
    store(LS.lessons, JSON.stringify(state.lessons));
    Object.keys(state.tests).forEach(function (id) { if (!state.cloud.nodes[id]) delete state.tests[id]; });
    store(LS.tests, JSON.stringify(state.tests));
    saveSeen();
  }
  /* The camera and focus of the big cloud, so they come back next time (UI state, kept apart from the cloud). */
  function saveView(v) {
    state.view = { y: +v.yaw.toFixed(4), p: +v.pitch.toFixed(4), z: +v.zoom.toFixed(4), x: Math.round(v.panX), q: Math.round(v.panY), f: v.focus && state.cloud.nodes[v.focus] ? v.focus : 0 };
    /* the turn centre (the focused node, or the origin): kept so a restored view orbits the same point */
    if (v.pivot && (v.pivot.x || v.pivot.y || v.pivot.z)) state.view.o = [v.pivot.x, v.pivot.y, v.pivot.z].map(function (k) { return +k.toFixed(4); });
    store(LS.view, JSON.stringify(state.view));
  }
  /* What each card looked like when last shown (D.evolveKey), so a rise in tier or colour plays its transition once. */
  function saveSeen() {
    var ids = Object.keys(state.seen.c).filter(function (id) { return state.cloud.nodes[id] || C.inDeck(state.cloud, id); }), c = {};
    ids.slice(-400).forEach(function (id) { c[id] = state.seen.c[id]; });
    state.seen.c = c;
    store(LS.seen, JSON.stringify(state.seen));
  }
  /*
   * The colour-evolution transition: the first time a card is shown at a higher tier, colour stage or merge level than
   * before, it plays a short ink wash that bleeds out from its plate (and the sheen passes once on achieved and merged
   * cards). The first sighting of a card only records it. Respects prefers-reduced-motion (a still, final state).
   */
  function markEvolve(card, spec) {
    if (!card || !spec) return false;
    var key = D.evolveKey(spec), was = state.seen.c[spec.id];
    if (was == null || key > was) state.seen.c[spec.id] = key;
    if (was == null || key <= was) return false;
    var prev = { tier: Math.floor(was / 1000), level: was % 100 };
    card.classList.add("evolve");
    if (spec.tier > prev.tier) card.classList.add("tier-up");
    if (spec.level > prev.level) card.classList.add("merged-up");
    return true;
  }
  /*
   * Merges: after any progress (an answer, "I've got it", a test), the orchestrator decides which parents are ready to
   * form or upgrade a higher-valued card, and the model applies it (pure, idempotent). No calls.
   */
  function settleMerges() {
    var done = P.settleMerges(state.cloud);
    if (!done.length) return done;
    save();
    done.forEach(function (m) {
      var p = nodeOf(m.id), names = m.ids.map(nodeOf).filter(Boolean).map(function (c) { return c.label; });
      if (!p) return;
      push({ role: "grow", open: m.id, text: (m.level === 1 ? names.join(", ") + (names.length === 1 ? " merged into " : " merged into ") + p.label + ". It's a Merged I card now, holding them all." : p.label + " took in " + names.join(", ") + ". It rises to Merged " + C.roman(m.level) + ".") + (m.why === "test" ? " Your test result sealed it." : "") });
    });
    refreshViews(done.map(function (m) { return m.id; }));
    renderDeckButton();
    return done;
  }

  /* ---------- small DOM helpers ---------- */
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function linkBtn(text, fn, cls) { var b = mk("button", cls || "link", text); b.type = "button"; b.addEventListener("click", function (e) { e.stopPropagation(); fn(); }); return b; }
  function paragraphs(node, text) {
    node.textContent = "";
    /* PR 107: text with code (a clarification can carry it): code blocks and inline code, never HTML */
    if (/`/.test(text || "")) {
      L.segments(text).forEach(function (sg) { if (sg.code != null) node.appendChild(L.codeBlock(document, sg.code, sg.lang)); else if (sg.text.trim()) textParas(node, sg.text.replace(/^\n+|\n+$/g, "")); });
      return;
    }
    textParas(node, text);
  }
  function textParas(node, text) {
    String(text || "").split(/\n{2,}/).forEach(function (para) {
      var p = mk("p");
      para.split("\n").forEach(function (line, i) {
        if (i) p.appendChild(mk("br"));
        L.inline(document, p, line);
      });
      node.appendChild(p);
    });
  }
  function nodeOf(id) { return id && state.cloud.nodes[id] ? state.cloud.nodes[id] : null; }
  function trailOf(id) { return C.trail(state.cloud, id, " · "); }

  /*
   * "Your path": the node's subtopics in learning order. Mastered steps say so; the recommended one is marked.
   * opts: { onStep(id), offer (show "Map a path" when there is none), heading }
   */
  /*
   * The recommended next step from a topic, the same everywhere it is shown: the learner's own fork pick first, then
   * the best-ranked unfinished child (logical order + use + the model's importance), else the usual walk up the tree.
   */
  function nextStep(id) { return P.nextStep(state.cloud, id); } /* one shared rule (orchestrator), also used by the parents & teachers view */
  /* v9 prerequisites still to finish, as quiet text: "after Eruptions" ("" when unlocked) */
  function afterOf(id) {
    var l = C.lockedBy(state.cloud, id).map(function (x) { return nodeOf(x) ? nodeOf(x).label : ""; }).filter(Boolean);
    return l.length ? "after " + D.listOf(l) : "";
  }
  function pathBlock(id, opts) {
    opts = opts || {};
    var n = nodeOf(id), wrap = mk("div", "path");
    if (!n) return wrap;
    if (!n.path || !n.path.ids.length) {
      if (n.end) wrap.appendChild(mk("p", "fine", "This branch ends here."));
      else if (opts.offer) wrap.appendChild(linkBtn("What comes next in " + n.label + "?", function () { createNext(id); }));
      return wrap;
    }
    var rec = P.pathNext(state.cloud, id); /* the same "next" Where Next continues with */
    wrap.appendChild(mk("p", "l-head", opts.heading || "Your path"));
    var ol = mk("ol"), ids = n.path.ids.filter(nodeOf), from = 0;
    /* short: three steps around the next one (the selection card); the whole path is on its card */
    if (opts.short && ids.length > 3) { from = Math.max(0, Math.min(ids.length - 3, ids.indexOf(rec) - 1)); ol.start = from + 1; }
    var shown = opts.short ? ids.slice(from, from + 3) : ids;
    if (opts.short) wrap.classList.add("short");
    shown.forEach(function (sid) {
      var s = nodeOf(sid); if (!s) return;
      var li = mk("li", sid === rec ? "next" : "");
      li.appendChild(linkBtn(s.label, function () { (opts.onStep || openLesson)(sid); }));
      if (s.mastery >= C.MASTERED && C.isDone(state.cloud, sid)) li.appendChild(mk("span", "tag", " · done"));
      else if (afterOf(sid)) li.appendChild(mk("span", "tag after", " · " + afterOf(sid)));
      else if (sid === rec) li.appendChild(mk("span", "tag", " · next"));
      ol.appendChild(li);
    });
    wrap.appendChild(ol);
    if (shown.length < ids.length) wrap.appendChild(mk("p", "path-more fine", ids.length + " steps in all · the whole path is on its card"));
    return wrap;
  }

  /* A learning card: paper outline, folded corner. Tapping it opens the topic as a lesson. */
  function cardNode(card, meta) {
    var d = mk("div", "card");
    d.appendChild(mk("h3", null, card.title));
    var b = mk("div"); paragraphs(b, card.body); d.appendChild(b);
    var n = nodeOf(card.node);
    if (n) {
      var sp = D.cardSpec(state.cloud, n.id);
      if (sp) d.insertBefore(D.render(document, sp, { size: "mini" }), d.firstChild);
      d.classList.add("open");
      d.tabIndex = 0;
      d.setAttribute("role", "button");
      d.setAttribute("aria-label", "Open the lesson on " + n.label);
      var go = function () { openLesson(n.id); };
      d.addEventListener("click", go);
      d.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      d.appendChild(pathBlock(n.id, { heading: "Your path" }));
      var acts = mk("p", "meta");
      acts.appendChild(document.createTextNode((meta || "On " + trailOf(n.id)) + " · "));
      acts.appendChild(linkBtn("Open the lesson", go));
      d.appendChild(acts);
    } else if (meta) d.appendChild(mk("p", "meta", meta));
    return d;
  }

  /* A first-run question: an open question answered in a free-text field, with the API's easy-click examples when it has them (m.ex); Skip either way. */
  var askHandlers = {};
  function renderAsk(m) {
    var d = mk("div", "msg model ask");
    var body = mk("div"); paragraphs(body, m.text || ""); d.appendChild(body);
    if (m.done) return d;
    var go = askHandlers[m.id] || function () {};
    if (m.hint) d.appendChild(mk("p", "ask-hint", m.hint));
    /* tapping an example is exactly typing it and pressing the button */
    if (m.ex) d.appendChild(exRow(function (t) { go(m.open ? cleanAbout(t) : C.cleanLabel(t), t); }, function () { return !m.done; }, m.ex === "growth" ? "growth" : ""));
    var row = mk("div", "ask-row" + (m.open ? " ask-open" : "")), inp = null;
    if (m.open) inp = openField(m.text, m.ph, function () { ok.click(); });
    else if (m.input) { inp = mk("input", "ask-in"); inp.maxLength = 40; inp.placeholder = "Type here"; inp.setAttribute("aria-label", m.text); }
    if (inp) row.appendChild(inp);
    var ok = null;
    if (m.input) {
      ok = linkBtn(m.go || "Done", function () {
        var typed = inp ? (m.open ? cleanAbout(inp.value) : C.cleanLabel(inp.value)) : "";
        go(typed, typed || "Skip");
      }, "btn draw-btn sm");
      row.appendChild(ok);
    }
    row.appendChild(linkBtn("Skip", function () { go("", "Skip"); }, "link"));
    d.appendChild(row);
    return d;
  }

  /*
   * Easy-click examples. The set comes only from the API (GET /examples: generic, cached on the server and the CDN for
   * the day, about one model call a day); P.examples personalises it from the ranking once a cloud exists. It is
   * fetched once per page (when a row first shows) and More steps through it here, with no call. When it can't be
   * fetched there is no list, just Try again. Each row re-checks live() so a row whose moment has passed empties.
   */
  var EX_SHOW = 3, exRows = [];
  /* set: "" (the first question's list, personalised once a cloud exists) or "growth" (the second question's, as it came) */
  /* multi (the intake): a tap adds the idea to the field and the chip cycles on to another (PR 103: no pile-up) */
  function exRow(pick, live, set, quiet, multi) {
    var r = { node: mk("div", "ex-row"), pick: pick, live: live || function () { return true; }, set: set || "", quiet: Boolean(quiet), multi: multi || null };
    exRows.push(r);
    /* after this tick, once the row is on the page (refreshEx drops rows that aren't) */
    if (state.ex.status === "idle" && r.live()) { state.ex.status = "wait"; setTimeout(loadExamples, 0); }
    fillEx(r);
    return r.node;
  }
  function fillEx(r) {
    var box = r.node;
    box.textContent = "";
    if (!r.live()) return;
    if (state.ex.status === "off") {
      if (r.quiet) return; /* the intake: free text is the way in; no note, no retry */
      box.appendChild(mk("span", "ex-note", "Examples couldn't load just now."));
      box.appendChild(linkBtn("Try again", function () { if (window.IkoUsage) window.IkoUsage.bump("generation_retries"); loadExamples(); }, "link ex-retry"));
      return;
    }
    var grow = r.set === "growth", key = grow ? "gat" : "at";
    var list = state.ex.status !== "ok" ? [] : grow ? state.ex.growth : P.mixStarters(state.cloud, P.examples(state.cloud, state.ex.list, Date.now()), coarseArea());
    if (!list.length) return;
    var at = state.ex[key] % list.length;
    if (r.multi) {
      /* the intake (PR 103): 2 or 3 ideas; a tap adds one to the field and that chip moves on to an idea not yet used (no
         chip stays selected, none pile up) */
      var used = (el.csIn.value || "").toLowerCase().split(/\s*,\s*/), shown = [];
      for (var j = 0; j < list.length && shown.length < EX_SHOW; j++) { var c = list[(at + j) % list.length]; if (used.indexOf(c.toLowerCase()) < 0) shown.push(c); }
      shown.forEach(function (t, slot) {
        var b = linkBtn(t, function () {
          if (state.busy || !r.live()) return;
          r.pick(t);
          fillEx(r);
          var again = r.node.querySelectorAll(".ex-chip")[slot] || r.node.querySelector(".ex-chip, .ex-more");
          if (again) again.focus();
        }, "btn ex-chip");
        b.setAttribute("aria-label", "Add " + t);
        box.appendChild(b);
      });
    } else for (var k = 0; k < Math.min(EX_SHOW, list.length); k++) {
      (function (t) { box.appendChild(linkBtn(t, function () { if (!state.busy && r.live()) r.pick(t); }, "btn ex-chip")); })(list[(at + k) % list.length]);
    }
    if (list.length > EX_SHOW) box.appendChild(linkBtn("More", function () { state.ex[key] = (at + EX_SHOW) % list.length; refreshEx(); }, "link ex-more"));
  }
  /* PR 107: a coarse area for starter ideas only, from the browser's own settings each time (never stored, sent or shown) */
  function coarseArea() {
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { tz = ""; }
    return P.areaOf(tz, navigator.language || "");
  }
  function refreshEx() {
    exRows = exRows.filter(function (r) { return r.node.isConnected; });
    exRows.forEach(fillEx);
  }
  function loadExamples() {
    if (state.ex.status === "loading") return;
    state.ex.status = "loading";
    refreshEx();
    getJson("/examples").then(function (j) {
      var clean = function (a, n) { return Array.isArray(a) ? a.map(function (x) { return cleanAbout(x).slice(0, 40); }).filter(Boolean).slice(0, n) : []; };
      var list = j && j.ok ? clean(j.examples, 24) : [];
      state.ex.list = list;
      state.ex.growth = list.length ? clean(j.growth, 12) : [];
      state.ex.status = list.length ? "ok" : "off";
      state.ex.at = 0; state.ex.gat = 0;
      refreshEx();
      if (intakeOn) rotatePh();
      if (startLayerOpen()) paintChips();
    });
  }
  /* An open answer in the learner's own words: one line of plain text, at most 300 characters. */
  function cleanAbout(v) { return String(v || "").replace(/[\u0000-\u001f\u007f<>{}[\]`*_#|\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300); }
  /* The free-text field for an open question (Enter answers, Shift+Enter is a new line). */
  function openField(label, ph, onEnter) {
    var t = mk("textarea", "ask-in ask-open-in");
    t.rows = 2; t.maxLength = 300; t.placeholder = ph || "In your own words"; t.setAttribute("aria-label", label);
    t.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); onEnter(); } });
    return t;
  }
  /* Asks one question in the chat; cb(value) once answered. The answer shows as the learner's reply. */
  function ask(q, cb) {
    var m = { role: "ask", local: true, kind: q.id || "", text: q.q, hint: q.hint || "", ex: q.ex === "growth" ? "growth" : Boolean(q.ex), input: Boolean(q.input), open: Boolean(q.open), ph: q.ph || "", go: q.go };
    askHandlers[(m.id = "a" + Date.now().toString(36) + (mid++))] = function (val, label) {
      if (m.done) return;
      m.done = true; upsert(m); delete askHandlers[m.id];
      push({ role: "user", local: true, text: label || "Skip" });
      cb(val);
    };
    push(m);
  }

  function renderMsg(m) {
    var d;
    if (m.role === "ask") d = renderAsk(m);
    else if (m.role === "place") d = renderPlace(m);
    else if (m.role === "del") d = renderDel(m);
    else if (m.role === "age") d = renderAge(m);
    else if (m.role === "card") {
      d = cardNode(m.card, m.card.node && nodeOf(m.card.node) ? "On " + trailOf(m.card.node) : "");
    }     else if (m.role === "grow") {
      d = mk("p", "grow", m.text);
      lessonLinks(d, m.opens && m.opens.length ? m.opens : (m.open ? [m.open] : []));
    } else {
      d = mk("div", "msg " + m.role + (m.streaming ? " streaming" : ""));
      var body = mk("div"); paragraphs(body, m.text || ""); d.appendChild(body);
      /* while a build is being written: the parents that have arrived, then quiet placeholders for the ones still coming */
      if (m.role === "model" && m.streaming && (m.pending || (m.got && m.got.length))) {
        var gen = mk("div", "gen"); gen.setAttribute("aria-hidden", "true");
        (m.got || []).forEach(function (t) { gen.appendChild(mk("span", "gen-got", t)); });
        for (var g = (m.got || []).length; g < (m.pending || 0); g++) gen.appendChild(mk("span", "gen-ph"));
        d.appendChild(gen);
      }
      if (m.role === "model" && m.topic && !m.streaming && !m.fallback) {
        var acts = mk("div", "acts");
        acts.appendChild(linkBtn("Save a note on " + m.topic, function () { makeCard(m.topic, m.parent || ""); }));
        d.appendChild(acts);
      }
      if (m.role === "model" && m.opens && m.opens.length && !m.streaming) {
        var go = mk("div", "acts");
        m.opens.forEach(function (id, i) { var n = nodeOf(id); if (!n) return; if (go.childNodes.length) go.appendChild(document.createTextNode(" · ")); go.appendChild(linkBtn(i ? n.label : "Open " + n.label, function () { openCard(id, null); })); });
        d.appendChild(go);
      }
      /* a creation call that couldn't run: try it again (a first build only while the cloud is still empty) */
      /* (an old save's empty start, from the retired Skip call, has nothing to retry: typing below starts the path) */
      if (m.role === "model" && m.retry && !m.streaming && (m.retry.kind !== "start" || (!state.cloud.order.length && m.retry.about))) {
        var again = mk("div", "acts"), rt = m.retry;
        again.appendChild(linkBtn("Try again", function () { if (!state.busy) { if (window.IkoUsage) window.IkoUsage.bump("generation_retries"); m.retry = null; upsert(m); buildCloud(rt.kind, [], rt.about || "", rt.grow || ""); } }, "btn draw-btn sm"));
        d.appendChild(again);
      }
      /* the API's examples under the Skip message ("start": the first one tapped starts the path) or the welcome back ("chat"); an old save's own chips are not shown */
      if (m.role === "model" && m.ex) d.appendChild(exRow(function (t) { send(t); }, function () { return m.ex === "start" ? waitingForStart() : state.thread[state.thread.length - 1] === m; }));
    }
    d.dataset.id = m.id;
    return d;
  }

  function renderThread() {
    el.thread.textContent = "";
    state.thread.forEach(function (m) { el.thread.appendChild(renderMsg(m)); });
    if (!state.lessonNode) scrollDown();
  }
  function upsert(m) {
    var old = el.thread.querySelector('[data-id="' + m.id + '"]');
    var fresh = renderMsg(m);
    if (old) el.thread.replaceChild(fresh, old); else el.thread.appendChild(fresh);
    if (iko.open) renderIkoLog();
  }
  function scrollDown() { if (!state.lessonNode) window.scrollTo(0, document.documentElement.scrollHeight); }
  var mid = 0;
  function push(m) { m.id = m.id || ("m" + Date.now().toString(36) + (mid++)); m.at = m.at || Date.now(); state.thread.push(m); upsert(m); refreshEx(); scrollDown(); return m; }

  function setFocus(id) {
    state.focus = nodeOf(id) ? id : null;
    el.focusChip.hidden = !state.focus;
    if (state.focus) el.focusText.textContent = "Focus: " + trailOf(state.focus);
  }

  /* ---------- growth ---------- */
  /* focusId: the focus the request was sent with (what was on screen), never a node from an earlier screen */
  function grow(block, focusId) {
    var raw = (block && block.topics) || [], ghosts = (block && block.ghosts) || [];
    focusId = nodeOf(focusId) ? focusId : null;
    /* placement first (orchestrator, 0 calls): reuse a node that's already there, start a new parent, go under a node,
       or ask the learner when it could be either (the plan is kept with the question; a tap applies it) */
    var topics = [], asks = [], placed = {}, reused = [];
    raw.forEach(function (tp) {
      var plan = P.placeTopic(state.cloud, tp, focusId);
      if (!plan) return;
      if (plan.how === "ambiguous") { asks.push({ tp: tp, plan: plan }); return; }
      if (plan.how === "reuse") reused.push(plan.id);
      var o = P.placedTopic(tp, plan);
      if (plan.how === "parent" || plan.how === "child") placed[C.norm(o.name)] = 1;
      topics.push(o);
    });
    var r = C.applyTopics(state.cloud, topics);
    var g = C.addGhosts(state.cloud, ghosts, Date.now(), focusId);
    var facts = topics.map(function (tp) { return P.addFact(tp.name, r, state.cloud); });
    var parts = [];
    r.parentsCreated.forEach(function (id) { parts.push("new subject " + state.cloud.nodes[id].label); });
    /* a new chain is named once, at its deepest new link: "Making & Coding → Programming → Python → Sets (new)" */
    r.created.filter(function (id) { return !r.created.some(function (o) { return o !== id && C.ancestry(state.cloud, o).indexOf(id) >= 0; }); })
      .forEach(function (id) { parts.push(C.trail(state.cloud, id, " → ") + " (new)"); });
    r.promoted.forEach(function (id) { parts.push(trailOf(id) + " (explored)"); });
    reused.forEach(function (id) { var n = nodeOf(id); if (n && !n.parent) parts.push(n.label + " (already a branch)"); });
    r.strengthened.forEach(function (id) { var n = nodeOf(id); if (n && n.parent) parts.push(n.label + " (stronger)"); });
    if (g.added.length) parts.push(g.added.length === 1 ? "1 idea to explore" : g.added.length + " ideas to explore");
    var ids = r.created.concat(r.promoted, r.strengthened, r.parentsCreated, g.added);
    refreshViews(ids);
    /* offer the topic itself (not a link created on its chain) when it is new or newly explored */
    var grown = r.created.concat(r.promoted), main = topics[0] && C.findTopic(state.cloud, topics[0].name);
    var fresh = main && grown.indexOf(main.id) >= 0 ? main.id : grown.filter(function (id) { return nodeOf(id) && nodeOf(id).parent; })[0];
    /* a new or existing parent, or a topic that was already there: offer that one */
    if (!fresh && main && reused.indexOf(main.id) >= 0) fresh = main.id;
    if (!fresh && topics[0]) { var sb = C.subjects(state.cloud).filter(function (x) { return x.key === C.norm(topics[0].name); })[0]; if (sb && (r.parentsCreated.indexOf(sb.id) >= 0 || reused.indexOf(sb.id) >= 0)) fresh = sb.id; }
    var opens = r.parentsCreated.filter(function (id) { return nodeOf(id); });
    if (!opens.length && fresh) opens = [fresh];
    if (parts.length) push({ role: "grow", text: "Your cloud grew: " + parts.join(" · "), open: opens[0] || null, opens: opens });
    /* a new parent (or a topic placed where the learner asked): the camera glides to it */
    var landed = r.parentsCreated.concat(r.created).filter(function (id) { return placed[C.norm(nodeOf(id) ? nodeOf(id).label : "")]; })[0];
    /* a subject that was asked for and is already there: that one is shown (no duplicate) */
    if (!landed) landed = reused.filter(function (id) { return raw.some(function (tp) { return tp.placement && C.norm(C.cleanLabel(tp.name)) === C.norm(nodeOf(id) ? nodeOf(id).label : ""); }); })[0];
    if (landed) revealNode(landed);
    /* a new parent from Iko arrives with starter children when the reply named good ones */
    raw.forEach(function (tp) {
      if (!tp || !tp.children || tp.children.length < 3) return;
      var sub = C.subjects(state.cloud).filter(function (s) { return s.key === C.norm(C.cleanLabel(tp.name)); })[0];
      if (!sub || C.childrenOf(state.cloud, sub.id).length) return;
      var kids = tp.children.filter(function (name) { return goodChild(name, sub.label); });
      if (kids.length >= 3) C.addStarters(state.cloud, sub.id, kids);
    });
    asks.forEach(function (a) {
      push({ role: "place", plan: { name: C.cleanLabel(a.tp.name), signal: a.tp.signal || "curious", target: a.plan.target, blurb: a.tp.blurb || "" } });
    });
    /* a topic that landed right under its subject on a shallow chain gets its in-between steps after this reply (one call, once) */
    topics.forEach(function (tp) {
      if (placed[C.norm(tp.name)]) return; /* placed on purpose (a new parent, or right where it was asked for): no bridge call */
      var hit = C.findTopic(state.cloud, tp.name);
      if (hit && grown.indexOf(hit.id) >= 0 && P.needsBridge(state.cloud, hit.id, (tp.chain || []).length) && state.bridgeQueue.indexOf(hit.id) < 0) state.bridgeQueue.push(hit.id);
    });
    return { topic: topics[0] || (asks[0] && asks[0].tp) || null, parents: r.parentsCreated.slice(), facts: facts };
  }
  /* Subjects the learner named that the reply did not add. Each one is a parent. A name already anywhere is left as it is. */
  function ensureAsked(names) {
    var made = [], facts = [];
    (names || []).forEach(function (raw) {
      var label = titleTopic(raw);
      if (!label || junkSubject(label)) return;
      if (C.findAny(state.cloud, label) || C.findClose(state.cloud, label)) {
        facts.push(P.addFact(label, { created: [], parentsCreated: [] }, state.cloud));
        return;
      }
      var tp = { name: label, signal: "curious", placement: "parent", chain: [], parent: "" };
      var plan = P.placeTopic(state.cloud, tp, null);
      if (!plan || plan.how === "reuse") {
        facts.push(P.addFact(label, { created: [], parentsCreated: [] }, state.cloud));
        return;
      }
      var gr = C.applyTopics(state.cloud, [P.placedTopic(tp, { how: "parent", label: label })]);
      facts.push(P.addFact(label, gr, state.cloud));
      var id = gr.parentsCreated[0];
      if (id) { made.push(id); C.setProfile(state.cloud, { interests: [nodeOf(id).label] }); }
    });
    if (made.length) {
      refreshViews(made);
      push({ role: "grow", text: "Your cloud grew: " + made.map(function (id) { return "new subject " + nodeOf(id).label; }).join(" · "), open: made[0], opens: made.slice() });
      revealNode(made[0]);
    }
    return { made: made, facts: facts };
  }
  /* New subjects with no children: one creation call for 3 or 4 real parts, then a clean placeholder set. */
  function fillStarter(id) {
    var n = nodeOf(id);
    if (!n || n.parent || C.childrenOf(state.cloud, id).length >= 3) return Promise.resolve();
    state.starterTried = state.starterTried || {};
    if (state.starterTried[id]) { C.addStarters(state.cloud, id, []); return Promise.resolve(); }
    state.starterTried[id] = 1;
    return postJson("/create", Object.assign(basePayload(id), { mode: "notice" }, P.createRequest(state.cloud, "next", id))).then(function (j) {
      if (!nodeOf(id) || C.childrenOf(state.cloud, id).length) return;
      var names = [];
      if (j && j.ok && j.items && j.items[0] && Array.isArray(j.items[0].children)) {
        j.items[0].children.forEach(function (c) { if (c && goodChild(c.name, nodeOf(id).label)) names.push(c.name); });
      }
      C.addStarters(state.cloud, id, names.length >= 3 ? names : []);
      refreshViews(C.childrenOf(state.cloud, id).map(function (c) { return c.id; }));
    });
  }
  function fillStarters(ids) {
    var seq = Promise.resolve();
    (ids || []).slice(0, 3).forEach(function (id) { seq = seq.then(function () { return fillStarter(id); }); });
    return seq;
  }
  /*
   * A node just made (or found) from a request: the camera glides to it and its selection card opens, calmly. Not on
   * the cloud right now: it happens when the cloud opens. On a phone, while Iko's sheet covers the lower half, the
   * camera glides now and the card waits until the sheet closes; on wider screens the card opens beside the sheet and
   * Iko stays open on that node. Its description came with the reply, so opening the card makes no call.
   */
  function revealNode(id) {
    if (!nodeOf(id)) return;
    state.glide = id; /* the cloud isn't on screen: it glides there (and opens the card) when it opens */
    if (!big || el.cloud.hidden || state.lessonNode) return;
    state.glide = null;
    /* no description yet: the camera glides only (opening its card would write one: a call the learner didn't ask for) */
    if (!nodeOf(id).blurb || (iko.open && window.innerWidth < 700)) { state.reveal = nodeOf(id).blurb ? id : null; focusInView(id, false); return; }
    state.reveal = null;
    openPanel(id);
    if (iko.open) { iko.ctx = screenCtx(); el.ikoAbout.textContent = ikoAbout(iko.ctx); setFocus(id); }
  }
  /*
   * "Start X as a new branch, or add it under Focus?": the planned topic is kept with the message, so a tap applies it
   * on the device (0 calls). Checked again on tap: if it's on the cloud by now it is reused; a target that's gone means
   * a new branch.
   */
  /* Every new subject from this turn, including two at once, gets its own lesson link straight away. */
  function lessonLinks(parent, ids) {
    var list = [];
    (ids || []).forEach(function (id) { var n = nodeOf(id); if (n && list.indexOf(n.id) < 0) list.push(n.id); });
    list.forEach(function (id) {
      if (parent.childNodes.length) parent.appendChild(document.createTextNode(" · "));
      var n = nodeOf(id);
      parent.appendChild(linkBtn("Open a lesson on " + n.label, function () { openLesson(n.id); }));
    });
  }
  function renderPlace(m) {
    var d = mk("div", "place"), p = m.plan || {}, f = nodeOf(p.target);
    if (m.done) {
      d.appendChild(mk("p", "grow", m.done));
      var on = nodeOf(m.open);
      if (on) { d.lastChild.appendChild(document.createTextNode(" · ")); d.lastChild.appendChild(linkBtn("Open a lesson on " + on.label, function () { openLesson(on.id); })); }
      return d;
    }
    d.appendChild(mk("p", "place-q", "Where should " + p.name + " go?"));
    var row = mk("div", "place-opts");
    row.appendChild(linkBtn("New branch", function () { applyPlace(m, "parent"); }, "btn sm place-opt"));
    if (f) row.appendChild(linkBtn("Under " + f.label, function () { applyPlace(m, "child"); }, "btn sm place-opt"));
    d.appendChild(row);
    return d;
  }
  function applyPlace(m, how) {
    if (m.done || !m.plan) return;
    var p = m.plan, f = nodeOf(p.target), tp = { name: p.name, signal: p.signal || "curious" };
    if (p.blurb) tp.blurb = p.blurb; /* its description came with the reply (0 calls) */
    var plan = P.placeTopic(state.cloud, tp, null);
    if (!plan) return;
    if (plan.how !== "reuse") plan = how === "child" && f ? { how: "child", target: f.id } : { how: "parent" }; /* no cap on subjects */
    var r = C.applyTopics(state.cloud, [P.placedTopic(tp, plan)]);
    var id = r.parentsCreated[0] || r.created[0] || (plan.how === "reuse" ? plan.id : r.strengthened[0]) || null;
    save();
    refreshViews([id].filter(Boolean));
    var n = nodeOf(id);
    var fact = n ? P.addFact(n.label, r, state.cloud) : { label: p.name, status: "failed", parent: "" };
    if (plan.how === "reuse" && fact.status !== "new") fact = { label: n ? n.label : p.name, status: n ? "existing" : "failed", parent: "" };
    m.done = P.addLine(fact.label, fact.status, fact.parent);
    m.open = n ? n.id : null;
    upsert(m);
    save();
    if (n) revealNode(n.id);
  }

  /*
   * Asked of Iko in plain words (PR 105, 0 calls): light or dark mode (the same quiet switch as the toggle, kept like it),
   * and deleting a branch: first a gentle word for leaving it, and it goes only on a clear tap of "Delete". Anything else
   * goes to the model as usual.
   */
  /*
   * PR chat-complete: clear "I want to learn X" / "add X" / "teach me X" lines. Used after a chat turn when the
   * model cut off before the cloud block, so the cloud still grows (anything, any time) without a second call.
   */
  function learnRest(text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 160) return "";
    t = t.replace(/[.!?]+$/g, "").trim();
    var m = t.match(/^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:(?:i(?:'d| would)?\s+like\s+to|i\s+want\s+to|i\s+wanna|let'?s|help\s+me)\s+)?(?:learn|study|start|add|explore|teach\s+me)\s+(.+)$/i);
    if (!m) return "";
    var topic = m[1].replace(/^(?:about|more\s+about|how\s+to)\s+/i, "").replace(/\s+please$/i, "").trim().replace(/^(?:a|an|the)\s+/i, "").trim();
    if (topic.length < 2 || topic.length > 100) return "";
    if (/^(something|anything|everything|this|that|it)$/i.test(topic)) return "";
    return topic;
  }
  function interestPhrase(part) {
    var p = String(part || "").replace(/^(?:a|an|the|about|more about|how to|and|or)\s+/i, "").replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
    if (p.length < 2 || p.length > 40) return "";
    var words = p.split(" ");
    if (words.length > 4) return "";
    if (/^(how|what|why|when|where|whether|who|which)\b/i.test(p)) return "";
    if (/\b(is|are|was|were|handle|handling|topic)\b/i.test(p)) return "";
    if (/^(something|anything|everything|this|that|it|both|please|yes|them|those|these|all|one)$/i.test(p)) return "";
    return words.some(function (w) { return !/^(a|an|the|of|to|on|in|for|with|and|or)$/i.test(w); }) ? p : "";
  }
  function splitSubjects(phrase) {
    var out = [], push = function (p) { if (p && !out.some(function (y) { return y.toLowerCase() === p.toLowerCase(); })) out.push(p); };
    String(phrase || "").split(/\s*(?:,|;|\/|&)\s*/).forEach(function (chunk) {
      var bits = chunk.split(/\s+\band\b\s+|\s+\bor\b\s+/i);
      if (bits.length >= 2) {
        var interests = bits.map(interestPhrase);
        if (interests.every(Boolean)) interests.forEach(push);
        return;
      }
      push(interestPhrase(chunk));
    });
    return out.slice(0, 4);
  }
  function clarifyingNow(text) {
    if (state.mode !== "lesson" || !state.lessonNode) return false;
    var ph = lessonPhase(state.lessonNode), step = iko.ctx && iko.ctx.step;
    if (ph !== "check" && ph !== "missed" && step !== "check" && step !== "tricky") return false;
    return !learnTopicsFrom(text).length;
  }
  function junkSubject(name) {
    var n = String(name || "").replace(/\s+/g, " ").trim().toLowerCase();
    return !n || n.split(" ").length > 6 || /\b(topic on what|handle one|how to handle|what a \w+ is)\b/.test(n);
  }
  function learnTopicFrom(text) {
    var topic = learnRest(text);
    if (!topic) return "";
    var parts = splitSubjects(topic);
    if (parts.length <= 1 && topic.length > 40) return "";
    return parts[0] || "";
  }
  function learnTopicsFrom(text) {
    var topic = learnRest(text);
    if (!topic) return [];
    var parts = splitSubjects(topic);
    if (parts.length <= 1 && topic.length > 40) return [];
    return parts;
  }
  function affirmSeveral(text) {
    var t = String(text || "").toLowerCase().replace(/[.!?\s]+$/g, "").trim();
    return /^(?:please\s+)?(?:yes[, ]+)?(?:both(?:\s+of\s+(?:them|those|these))?|all of (?:them|these|those)|the both|yes to both)(?:\s+please)?$/.test(t);
  }
  function subjectsOffered(text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return [];
    var m = t.match(/(?:would you like|how about|we could (?:do|add|start)|either|choose|between|want(?: to learn)?)\s+([^?]{3,140})/i);
    return splitSubjects((m ? m[1] : t).replace(/\b(?:or both|both of them|both)\b/gi, " "));
  }
  function wantedSubjects(text) {
    var many = learnTopicsFrom(text);
    if (many.length > 1) return many;
    if (affirmSeveral(text)) {
      var prev = "";
      for (var i = state.thread.length - 1; i >= 0; i--) {
        var msg = state.thread[i];
        if (msg.role === "model" && msg.text && !msg.streaming && !msg.local) { prev = msg.text; break; }
      }
      var off = subjectsOffered(prev);
      if (off.length > 1) return off;
    }
    return many;
  }
  function replyThin(text, asked) {
    var t = String(text || "").trim();
    if (!t) return true;
    var words = t.split(/\s+/).filter(Boolean);
    if (!replyLooksComplete(t) && !finishSpoken(t)) return true;
    if (words.length <= 1 && asked && asked.length) return true;
    return false;
  }
  /* A child name worth planting: plain spelling, and not from a different subject than its parent. */
  function goodChild(name, parent) {
    var n = C.cleanLabel(name);
    if (!n || n.length < 2 || n.length > 32 || n.split(/\s+/).length > 4) return false;
    if (/^(?:(?:a|an|the)\s+)?(overview|introduction|intro)$/i.test(n) || /^deeper\b/i.test(n) || /\bdeeper$/i.test(n)) return false;
    if (/\b(jointery|recieve|seperate|app logic|asdf)\b/i.test(n) || /(.)\1{2,}/i.test(n)) return false;
    var domain = function (s) {
      if (/\b(vaccine|vaccination|fever|health|medicine|medical|disease|immune|virus|doctor)\b/i.test(s)) return "health";
      if (/\b(app|software|code|coding|website|programming|algorithm|html)\b/i.test(s)) return "tech";
      if (/\b(rome|roman|empire|ancient|dynasty|medieval)\b/i.test(s)) return "history";
      return "";
    };
    var a = domain(n), b = domain(parent || "");
    if (a && b && a !== b) return false;
    return true;
  }
  function toAdult(text) {
    return String(text || "")
      .replace(/ask an adult to help contact a doctor/gi, "A high or persistent fever should be checked by a doctor")
      .replace(/ask a trusted adult[^.!?]*/gi, "")
      .replace(/your little brother/gi, "someone else")
      .replace(/a game at the park/gi, "an ordinary example");
  }
  function appendNote(src, note) {
    if (/EXPLAIN\s*:/i.test(src)) return src.replace(/\s*$/, "") + "\nEXPLAIN: " + note;
    return src.replace(/\s*$/, "") + (src.trim() ? "\n\n" : "") + note;
  }
  function handsNote(focus, src) {
    var blob = focus + "\n" + src;
    var rules = [
      { about: /\b(coolants?|radiators?|antifreeze)\b/i.test(blob), has: /never open the cap on a hot engine/i, note: "Never open the cap on a hot engine. Wait until it has cooled." },
      { about: /\b(engines?|oil changes?|brake pads?|brakes?|cars?|automobiles?|vehicles?|spark plugs?)\b/i.test(blob), has: /support the car safely|let the engine and the brakes cool/i, note: "Let the engine and the brakes cool before you touch them, and support the car safely." },
      { about: /\b(power tools?|circular saws?|table saws?|drills?|angle grinders?)\b/i.test(blob) || /\btools?\b/i.test(focus), has: /unplug a power tool|keep hands clear of the blade/i, note: "Keep hands clear of the blade or bit, and unplug a power tool before changing a part." },
      { about: /\b(chemicals?|chemical safety|solvents?|bleach|caustic|reagents?)\b/i.test(blob), has: /do not mix them or breathe them in/i, note: "Read the label, and do not mix chemicals or breathe them in." },
      { about: /\b(electricity|electrical|wiring|mains|live wire|circuit breaker)\b/i.test(blob), has: /switch the power off/i, note: "Switch the power off before you touch a wire or an open fitting." },
      { about: /\b(food handling|food safety|raw meat|cross-contamination|kitchen hygiene)\b/i.test(blob), has: /wash your hands/i, note: "Wash your hands, and keep raw meat away from food that is ready to eat." }
    ];
    for (var i = 0; i < rules.length; i++) if (rules[i].about && !rules[i].has.test(src)) return rules[i].note;
    return "";
  }
  function withHealthNote(focus, text) {
    var src = toAdult(text);
    if ((/\bfever\b/i.test(focus) || /turn(?:ing|s)? up the heat|body (?:runs|running) hot/i.test(src)) && !/\b(doctor|clinician|medical care|checked by)\b/i.test(src)) {
      src = appendNote(src, "A fever is more than the body turning up the heat. A high or persistent fever should be checked by a doctor.");
    }
    var hand = handsNote(focus, src);
    if (hand) src = appendNote(src, hand);
    return src;
  }
  function titleTopic(s) {
    return String(s || "").split(/\s+/).map(function (w) {
      if (!w) return w;
      if (/^[A-Z0-9]+$/.test(w) && w.length <= 4) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(" ");
  }
  function replyLooksComplete(text) {
    var t = String(text || "").replace(/\s+$/, "").trim();
    return Boolean(t) && /[.!?…]["')\]]*$/.test(t);
  }
  /* Drop a trailing unfinished sentence so a mid-token cut never shows as "Would". */
  function finishSpoken(text) {
    var t = String(text || "").replace(/\s+$/, "").trim();
    if (!t || replyLooksComplete(t)) return t;
    var cut = Math.max(t.lastIndexOf(". "), t.lastIndexOf("! "), t.lastIndexOf("? "), t.lastIndexOf(".\n"), t.lastIndexOf("!\n"), t.lastIndexOf("?\n"));
    if (cut > 12) return t.slice(0, cut + 1).trim();
    return "";
  }
  var IT_THIS = ["this", "it", "this one", "that", "that one", "branch", "this branch", "that branch", "this topic"];
  function localIntent(text) {
    var t = String(text || "").toLowerCase().replace(/[.!?\s]+$/, "").trim();
    if (t.length <= 60) {
      var th = t.match(/\b(dark|light|night|day)\s*(?:mode|theme)\b/) || t.match(/^(?:please\s+)?(?:go|switch|turn|make it|change|set it)\s+(?:to\s+|it\s+)?(dark|light)(?:er)?(?:\s+please)?$/);
      if (th && (/\b(switch|turn|go|make|change|set|use|put|enable|want|can you|could you|please)\b/.test(t) || /^(dark|light|night|day)\s*(mode|theme)$/.test(t))) {
        var mode = /^(dark|night)$/.test(th[1]) ? "dark" : "light";
        if (/\b(off|disable|stop)\b/.test(t)) mode = mode === "dark" ? "light" : "dark";
        return { kind: "theme", mode: mode };
      }
    }
    var sn = t.length <= 60 && t.match(/\b(?:turn|switch|put|set)?\s*(?:the\s+)?(?:sounds?|audio)\s*(on|off)\b|\b(mute|unmute)\s+(?:the\s+)?(?:sounds?|audio)\b|\b(?:turn|switch)\s+(on|off)\s+(?:the\s+)?(?:sounds?|audio)\b/);
    if (sn) return { kind: "sound", on: /\bon\b|unmute/.test(sn[0]) && !/\boff\b/.test(sn[0].replace("unmute", "")) || sn[2] === "unmute" || (sn[1] || sn[3]) === "on" };
    var hn = t.length <= 70 && t.match(/\b(?:be quiet|quiet mode|stop (?:the )?hints?|mute (?:the )?hints?|hide (?:the )?hints?|minimize (?:yourself|iko)|turn hints? off)\b|\b(?:talk more|unmute hints?|turn hints? on|show hints?)\b/);
    if (hn) return { kind: "hints", on: /\b(talk more|unmute|turn hints? on|show hints?)\b/.test(t) };
    var ag = ageIntent(t);
    if (ag) return ag;
    var rn = t.match(/^(?:please\s+)?(?:my name is|call me|rename me(?: to)?|change my name to)\s+([a-z][a-z'’ -]{0,28})$/);
    if (rn) return { kind: "rename", name: rn[1] };
    var d = t.match(/^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:delete|remove|get rid of|erase)\s+(?:the\s+|my\s+)?(.+?)(?:\s+(?:branch|topic|subject|node))?(?:\s+from\s+(?:my\s+|the\s+)?cloud)?(?:\s+please)?$/);
    if (d && d[1]) return { kind: "delete", name: d[1].trim() };
    return null;
  }
  function doIntent(text, it) {
    push({ role: "user", local: true, text: text });
    if (it.kind === "age") {
      if (it.forget) { setBand("none"); push({ role: "model", local: true, text: "Okay, I've forgotten it. Lessons go back to an everyday level for anyone." }); }
      else if (it.n) { var b = bandFor(it.n); setBand(b); push({ role: "model", local: true, text: bandSaid(b) }); }
      else push({ role: "age", local: true, text: "" });
      save(); return;
    }
    if (it.kind === "hints") {
      setHints(it.on);
      push({ role: "model", local: true, text: it.on ? "I'll chime in with short tips again. Ask me to be quiet any time." : "Okay, I'll stay quiet unless you tap me. Ask me to talk more any time." });
      save(); return;
    }
    if (it.kind === "sound") {
      if (window.IkoSound) { IkoSound.set(it.on); if (it.on && !el.cloud.hidden) IkoSound.ambient(true); }
      push({ role: "model", local: true, text: it.on ? "Sounds are back on, kept quiet." : "Sounds are off. Ask me any time to turn them back on." });
      save(); return;
    }
    if (it.kind === "rename") {
      var named = renameLearner(it.name);
      push({ role: "model", local: true, text: named ? "You're " + state.cloud.name + " on your cloud now." : "Tell me \"call me\" and the name you'd like on your cloud." });
      save(); return;
    }
    if (it.kind === "theme") {
      var already = TH && TH.mode() === it.mode && TH.saved() === it.mode;
      if (TH && !already) TH.set(it.mode);
      push({ role: "model", local: true, text: already ? "We're already in " + it.mode + " mode." : it.mode === "dark" ? "Dark mode it is." : "Light mode it is." });
      save(); return;
    }
    var here = iko.open && iko.ctx ? iko.ctx.id : state.focus;
    var n = IT_THIS.indexOf(it.name) >= 0 ? nodeOf(here) : C.findAny(state.cloud, it.name);
    if (!n || n.id === "root" || C.norm(n.label) === C.norm(state.name)) {
      push({ role: "model", local: true, text: n ? "That's you, in the middle. I'll keep you right where you are." : IT_THIS.indexOf(it.name) >= 0 ? "Which branch? Tell me its name." : "I couldn't find " + it.name + " on your cloud." });
      save(); return;
    }
    push({ role: "del", local: true, target: n.id, label: n.label });
    save();
  }
  /*
   * PR 107: the optional age band, on the device only. Asked lightly in the opening (a quiet "optional" link), or any
   * time via Iko ("I'm 12", "change my age") or the cloud's footer. It changes how lessons are written (P.withBand), never
   * which topics are open; it goes along only inside the teaching calls and is never kept on a server.
   */
  var BAND_LABEL = { simple: "Keep it simple", standard: "Standard", deeper: "Go deeper" }; /* PR 114: a lesson level, not an age */
  function ageIntent(t) {
    if (t.length > 60) return null;
    return null; /* PR 114: no age questions */
    var n = t.match(/^(?:hi,?\s+)?(?:i'?m|i am|im|my age is|age)\s*(\d{1,3})(?:\s*(?:years?|yrs?)(?:\s*old)?|\s*y\/?o)?$/);
    if (n) return { kind: "age", n: Number(n[1]) };
    if (/^(?:please\s+)?(?:forget|remove|clear|delete|erase)\s+my\s+age$/.test(t)) return { kind: "age", forget: true };
    if (/^(?:(?:can|could) (?:i|you)\s+)?(?:please\s+)?(?:change|set|update|edit|fix|add|enter)\s+my\s+age(?:\s+(?:band|range))?(?:\s+please)?$|^(?:my\s+)?age(?:\s+(?:band|range))?$/.test(t)) return { kind: "age" };
    return null;
  }
  function bandFor(n) { return n < 10 ? "u10" : n <= 13 ? "10-13" : n <= 17 ? "14-17" : "18+"; }
  function bandSaid(b) {
    return "Okay. Lessons are now written " + (b === "simple" ? "simply, in everyday words." : b === "deeper" ? "with more depth and detail." : "at a standard level.") + " You can change this any time.";
  }
  function setBand(b) { C.setProfile(state.cloud, { band: b }); save(); renderAgeBits(); if (window.IkoUsage) window.IkoUsage.level(b); }
  function bandRow(onPick) {
    var cur = C.levelOf(state.cloud), row = mk("div", "place-opts age-opts");
    row.setAttribute("role", "group"); row.setAttribute("aria-label", "Lesson level");
    C.LEVELS.forEach(function (b) {
      var x = linkBtn(BAND_LABEL[b], function () { onPick(b); }, "btn sm age-opt");
      x.setAttribute("data-band", b); x.setAttribute("aria-pressed", String(cur === b)); if (cur === b) x.classList.add("on");
      row.appendChild(x);
    });
    return row;
  }
  function renderAge(m) {
    var d = mk("div", "place age");
    if (m.done) { d.appendChild(mk("p", "grow", m.done)); return d; }
    d.appendChild(mk("p", "place-q", "How would you like lessons written? You can change this any time."));
    d.appendChild(bandRow(function (b) { setBand(b); m.done = bandSaid(b); upsert(m); save(); if (iko.open) renderIkoLog(); }));
    return d;
  }
  /* the opening's quiet line and the cloud footer's link show the choice (or that it's optional) */
  function renderAgeBits() {
    var b = state.cloud ? C.profileOf(state.cloud).band : "";
    if (el.ageLink) { el.ageLink.textContent = "Lesson level: " + BAND_LABEL[C.levelOf(state.cloud)]; }
  }

  if (el.ageLink) el.ageLink.addEventListener("click", function () { openAge(); });
  function openAge() {
    if (!iko.open) openIko(); /* first: the sheet shows what is said from its opening on */
    push({ role: "age", local: true, text: "" });
    save();
    renderIkoLog();
  }

  /* the gentle word and the two buttons; done: what happened */
  function renderDel(m) {
    var d = mk("div", "place del");
    if (m.done) { d.appendChild(mk("p", "grow", m.done)); return d; }
    var n = nodeOf(m.target), kids = n ? state.cloud.order.filter(function (x) { return x !== n.id && C.ancestry(state.cloud, x).indexOf(n.id) >= 0; }).length : 0;
    if (!n) { d.appendChild(mk("p", "grow", m.label + " isn't on your cloud any more.")); return d; }
    d.appendChild(mk("p", "place-q", "We could leave " + n.label + " be. Branches you don't use fade slowly as your cloud grows, and you can always come back to them later." + (kids ? " Deleting it also removes the " + kids + (kids === 1 ? " topic" : " topics") + " under it." : "")));
    var row = mk("div", "place-opts");
    row.appendChild(linkBtn("Keep it", function () { m.done = "Kept " + n.label + "."; upsert(m); save(); }, "btn sm place-opt"));
    row.appendChild(linkBtn("Delete " + n.label, function () { deleteBranch(m); }, "btn sm place-opt del-yes"));
    d.appendChild(row);
    return d;
  }
  function deleteBranch(m) {
    var n = nodeOf(m.target);
    if (m.done || !n) return;
    var gone = dropGhost(n.id), was = function (x) { return x && gone.indexOf(x) >= 0; };
    if (was(state.lessonNode)) showLesson(false);
    if (was(state.panelNode)) closeCard();
    if (was(state.focus)) setFocus(null);
    if (iko.ctx && was(iko.ctx.id)) { iko.ctx = screenCtx(); el.ikoAbout.textContent = ikoAbout(iko.ctx); }
    m.done = n.label + " is gone from your cloud.";
    save();
    refreshAll([]); /* the thread too, this message with it */
    if (iko.open) renderIkoLog();
  }

  /* Test nodes on the cloud: offered (ready) or taken, from the orchestrator */
  function testMap() {
    var out = {};
    state.cloud.order.forEach(function (id) {
      var st = P.testState(state.cloud, id);
      if (st && st.ready) out[id] = "ready"; else if (st && st.taken) out[id] = "taken";
    });
    return out;
  }
  function refreshViews(flashIds) {
    var tm = testMap();
    if (mini) { mini.setCloud(state.cloud); mini.setTests(tm); mini.flash(flashIds); }
    if (big) { big.setCloud(state.cloud); big.setTests(tm); big.flash(flashIds); }
    if (flashIds && flashIds.length) {
      el.thumb.classList.add("grew");
      setTimeout(function () { el.thumb.classList.remove("grew"); }, 2400);
    }
  }

  /*
   * PR 120: tidy the cloud. When the cloud has grown by about 8 topics since the last tidy (at most once a day), on idle
   * and only on the cloud (never mid-lesson), or when the learner taps "Tidy my cloud" in Preferences: the top of the
   * tree goes to /restructure, the device checks the proposal fully (C.applyRestructure) and keeps the old tree when
   * anything is off, silently. Nodes glide to their new places; Iko says one calm line with Undo (one snapshot).
   */
  var tidy = { busy: false, t: 0 };
  var TIDY_LINE = "I tidied your cloud so related topics sit together.";
  function tidyQuiet() { return !state.busy && state.mode !== "lesson" && !intakeOn && !document.hidden && /^(cloud|home|topic|)$/.test(iko.tipKey || ""); }
  function maybeTidy() {
    if (!tidy || tidy.busy || !state.cloud || !C.restructureDue(state.cloud)) return;
    clearTimeout(tidy.t);
    tidy.t = setTimeout(function () {
      var go = function () { if (tidyQuiet() && C.restructureDue(state.cloud)) tidyCloud(false); };
      if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 4000 }); else go();
    }, 6000);
  }
  function tidyCloud(manual, done) {
    if (tidy.busy || !state.cloud) { if (done) done(false); return; }
    var cloud = state.cloud, sent = C.restructureTree(cloud);
    if (sent.length < 6) { if (done) done(false, "small"); return; }
    tidy.busy = true;
    C.noteRestructure(cloud); save(); /* stamped first: at most one try a day, whatever happens */
    var body = basePayload(null); body.focus = state.name || "cloud"; body.tree = sent;
    postJson("/restructure", body).then(function (j) {
      tidy.busy = false;
      if (state.cloud !== cloud) { if (done) done(false); return; }
      var r = j && j.ok && j.proposal ? C.applyRestructure(cloud, sent, j.proposal) : { ok: false };
      if (!r.ok) { if (done) done(false, r.why === "same" ? "neat" : ""); return; } /* the old tree stays, quietly */
      save();
      if (big) big.setCloud(state.cloud, { morph: 1400 });
      if (mini) mini.setCloud(state.cloud, { morph: 1400 });
      refreshAll();
      tidySay();
      if (done) done(true);
    });
  }
  function tidySay() {
    ikoLine(TIDY_LINE, 14000);
    el.ikoLine.setAttribute("data-say", "tidy");
    var u = mk("button", "iko-yes", "Undo");
    u.type = "button"; u.setAttribute("aria-label", "Undo the tidy");
    u.addEventListener("click", function (e) { e.stopPropagation(); ikoLine(""); undoTidy(); });
    el.ikoLine.appendChild(document.createTextNode(" ")); el.ikoLine.appendChild(u);
  }
  function undoTidy() {
    if (!state.cloud || !C.undoRestructure(state.cloud)) return false;
    save();
    if (big) big.setCloud(state.cloud, { morph: 1100 });
    if (mini) mini.setCloud(state.cloud, { morph: 1100 });
    refreshAll();
    return true;
  }
  window.__ikoTidy = { run: tidyCloud, undo: undoTidy, say: tidySay }; /* tests */
  /* Paths and mastery show in several places; redraw them all after a change. */
  function refreshAll(flashIds) {
    refreshViews(flashIds);
    maybeTidy();
    renderThread();
    renderDeckButton();
    if (state.lessonNode && state.mode === "lesson") { renderLessonPath(); renderFork(state.lessonNode); }
    if (state.panelNode && !el.panel.hidden) openPanel(state.panelNode, true, true);
  }

  /* ---------- server calls ---------- */
  function history() {
    return state.thread.filter(function (m) { return (m.role === "user" || m.role === "model") && !m.fallback && !m.local && m.text; })
      .slice(-HISTORY).map(function (m) { return { role: m.role, text: m.text.slice(0, 1500) }; });
  }
  /* text: the learner's message, so subjects it names are among those the prompt sees (C.promptView: a bounded set) */
  function basePayload(focusId, text) {
    var n = nodeOf(focusId), pv = C.promptView(state.cloud, n ? n.id : null, text || "");
    var p = n && n.parent ? nodeOf(n.parent) : null; /* nothing about where the learner is goes along; the optional age band joins only the teaching calls (P.withBand) */
    return {
      name: state.name, focus: n ? n.label : "", focusId: n ? n.id : "", focusParent: p ? p.label : "", trail: n ? C.trail(state.cloud, n.id) : "",
      known: n ? C.knownUnder(state.cloud, n.id) : [], cloud: pv.cloud, parents: pv.parents
    };
  }

  /*
   * Calls that belong to what's on screen (the note, the bridge and its repair, a lesson or clarification being written)
   * carry a signal: moving on cancels them (cancelNav), so nothing stale holds the app busy. A cancelled call resolves
   * with reason "aborted", which is never shown as a failure.
   */
  var calls = {};
  function callSignal(name) {
    cancelCall(name);
    var c = window.AbortController ? new AbortController() : null;
    calls[name] = c;
    return c ? c.signal : undefined;
  }
  function cancelCall(name) { var c = calls[name]; calls[name] = null; if (c) c.abort(); }
  function cancelNav() { cancelCall("notice"); cancelCall("bridge"); }
  function post(path, body, signal, timeoutMs) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, timeoutMs || TIMEOUT_MS);
    if (signal && ctl) { if (signal.aborted) ctl.abort(); else signal.addEventListener("abort", function () { ctl.abort(); }); }
    return fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .finally(function () { clearTimeout(timer); });
  }
  /* A GET for the shared, cached answers (the examples): no body, nothing about the learner. */
  function getJson(path) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return fetch(API + path, { method: "GET", headers: { Accept: "application/json" }, signal: ctl ? ctl.signal : undefined })
      .then(function (res) { return res.json().catch(function () { return {}; }); })
      .catch(function () { return { ok: false, reason: "offline" }; })
      .finally(function () { clearTimeout(timer); });
  }
  function postJson(path, body, signal) {
    return post(path, body, signal).then(function (res) { return res.json().catch(function () { return {}; }); })
      .catch(function () { return { ok: false, reason: signal && signal.aborted ? "aborted" : "offline" }; });
  }

  /* Reads an NDJSON event stream. on: { delta(text), cloud(ev), path(ev) }. Resolves { ok, reason }. */
  function stream(path, body, on, signal, timeoutMs) {
    return post(path, body, signal, timeoutMs).then(function (res) {
      if (!res.ok || !res.body) {
        return res.json().catch(function () { return {}; }).then(function (j) { return { ok: false, reason: j.reason || j.error || String(res.status) }; });
      }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "", result = { ok: false, reason: "cut" }, got = false;
      function handle(line) {
        if (!line.trim()) return;
        var ev; try { ev = JSON.parse(line); } catch { return; }
        if (ev.t === "delta" && typeof ev.text === "string") { got = true; on.delta(ev.text); }
        else if (ev.t === "reset") { got = false; if (on.reset) on.reset(); }
        else if (ev.t === "cloud" && on.cloud) on.cloud(ev);
        else if (ev.t === "path" && on.path) on.path(ev);
        else if (ev.t === "item" && on.item && ev.item) { got = true; on.item(ev.item); }
        else if (ev.t === "done") result = { ok: true, items: ev.items, later: ev.later };
        else if (ev.t === "error") result = { ok: got, reason: ev.reason };
        /* a plain JSON answer (a server without streaming): the same as one "done" */
        else if (ev.ok === true && Array.isArray(ev.items)) result = { ok: true, items: ev.items, later: ev.later };
        else if (ev.ok === false) result = { ok: false, reason: ev.reason || ev.error };
      }
      function pump() {
        return reader.read().then(function (r) {
          if (r.value) {
            buf += dec.decode(r.value, { stream: true });
            var i;
            while ((i = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
          }
          if (r.done) { handle(buf); return got && !result.ok && result.reason === "cut" ? { ok: true } : result; }
          return pump();
        });
      }
      return pump();
    }).catch(function () { return { ok: false, reason: signal && signal.aborted ? "aborted" : "offline" }; });
  }

  function reasonLead(reason) {
    return reason === "busy" || reason === "ip_rate" ? "I need a short breather. Please try again in a minute."
      : reason === "budget" ? "I've done a lot of thinking today. Let's pick this up again tomorrow."
      : reason === "offline" ? "I can't reach the internet right now."
      : "I couldn't get an answer just now.";
  }
  /* Local, no-API text when the model cannot be reached: honest, and still points somewhere useful. */
  function fallbackText(reason) {
    var next = nodeOf(state.cloud.next);
    var tip = next ? " While we wait, your next step is " + next.label + ". Tap it on your cloud whenever you like." : " Your cloud is saved, so nothing is lost.";
    return reasonLead(reason) + tip;
  }

  /* One call at a time. A lesson, test or clarification asked for meanwhile waits in state.queued and starts here. */
  function lock(on) {
    state.busy = on;
    [el.send, el.pCard, el.pAdj, el.pLesson, el.pTest, el.lGot, el.lCont, el.ikoGot].forEach(function (b) { b.disabled = on; });
    Array.prototype.forEach.call(document.querySelectorAll(".draw-btn, .clar-opt"), function (b) { b.disabled = on; });
    if (!on && state.queued) { var q = state.queued; state.queued = null; setTimeout(q, 0); }
    renderStart();
  }

  /* ---------- chat ---------- */
  function send(text) {
    text = String(text || "").replace(/\s+$/, "").trim().slice(0, 1500);
    if (!text || state.busy) return;
    if (waitingForStart()) { var about = cleanAbout(text); push({ role: "user", text: text }); buildCloud("start", splitInterests(text), about); return; }
    var it = localIntent(text);
    if (it) { doIntent(text, it); return; } /* light or dark, or deleting a branch: done here (0 calls) */
    lock(true);
    push({ role: "user", text: text });
    var m = push({ role: "model", text: "", streaming: true });
    /* the focus is what is on screen: in Iko's sheet, the node of the screen it was opened on (none on the cloud with
       nothing selected); in the whole conversation, the focus shown above the composer. Never an earlier screen's node. */
    var fid = iko.open && iko.ctx ? (nodeOf(iko.ctx.id) ? iko.ctx.id : null) : state.focus;
    var asked = wantedSubjects(text);
    var learn = asked[0] || learnTopicFrom(text), grew = false, attempt = 0, bare = [], facts = [], madeIds = {};
    var body = Object.assign(basePayload(fid, text), { mode: "chat", messages: history(), screen: iko.open && iko.ctx ? screenOf(iko.ctx) : { view: "chat" } });
    function noteBare(id) {
      if (id && bare.indexOf(id) < 0 && nodeOf(id) && !nodeOf(id).parent && !C.childrenOf(state.cloud, id).length) bare.push(id);
    }
    function absorb(list) {
      (list || []).forEach(function (f) {
        if (!f || !f.label) return;
        var n = C.findAny(state.cloud, f.label);
        if (f.status === "new" && n) madeIds[n.id] = { label: n.label, parent: f.parent || "" };
        if (n && madeIds[n.id] && f.status !== "failed") f = { label: n.label, status: "new", parent: madeIds[n.id].parent };
        var i = -1;
        facts.forEach(function (x, k) { if (C.norm(x.label) === C.norm(f.label)) i = k; });
        if (i < 0) facts.push(f);
        else if (f.status === "new" || (f.status === "existing" && facts[i].status === "failed")) facts[i] = f;
      });
    }
    function turn() {
      facts = [];
      return stream("/chat", body, {
        delta: function (t) { m.text += t; upsert(m); scrollDown(); },
        cloud: function (ev) {
          if (clarifyingNow(text)) return; /* a hint during a check is not a new subject */
          var r = grow(ev, fid);
          absorb(r.facts);
          if ((ev.topics && ev.topics.length) || (ev.ghosts && ev.ghosts.length)) grew = true;
          if (r.topic) { m.topic = r.topic.name; m.parent = r.topic.parent; grew = true; }
          (r.parents || []).forEach(noteBare);
        }
      }).then(finishTurn);
    }
    function finishTurn(r) {
      m.streaming = false;
      if (!r.ok && !m.text) { m.text = fallbackText(r.reason); m.fallback = true; }
      /* a mid-sentence cut (token cap): keep only finished sentences so "Would" never sticks on screen */
      if (!m.fallback && m.text && !replyLooksComplete(m.text)) {
        var kept = finishSpoken(m.text);
        m.text = kept || "";
        m.cut = !kept;
      } else {
        m.text = (m.text || "").trim();
      }
      /* every subject they named, not only the first; a name already on the cloud is reused */
      var askedOut = !m.fallback && !clarifyingNow(text) ? ensureAsked(asked) : { made: [], facts: [] };
      var made = askedOut.made || [];
      absorb(askedOut.facts);
      if (made.length) {
        grew = true;
        made.forEach(noteBare);
      }
      /* learn intent, but the reply never carried a cloud block (cut off or skipped): grow on the device, 0 extra calls */
      if (learn && !grew && !m.fallback && !clarifyingNow(text)) {
        var label = titleTopic(learn), tp = { name: label, signal: "curious", placement: "parent", chain: [], parent: "" };
        var plan = P.placeTopic(state.cloud, tp, fid);
        if (plan) {
          if (plan.how === "reuse") {
            var reused = P.addFact(plan.label, { created: [], parentsCreated: [] }, state.cloud);
            absorb([reused]);
            if (reused.status !== "failed") {
              grew = true;
              m.topic = plan.label;
              revealNode(plan.id);
            }
          } else {
            if (plan.how === "ambiguous") plan = { how: "parent", label: label }; /* prefer growing the cloud over asking when recovering from a cut */
            var placed = P.placedTopic(tp, plan);
            var gr = C.applyTopics(state.cloud, [placed]);
            var fact = P.addFact(label, gr, state.cloud);
            absorb([fact]);
            var id = gr.parentsCreated[0] || gr.created[0] || null;
            if (fact.status === "new" && id) {
              grew = true;
              noteBare(id);
              m.topic = label;
              if (!nodeOf(id).parent) C.setProfile(state.cloud, { interests: [nodeOf(id).label] });
              refreshViews([id]);
              revealNode(id);
              push({ role: "grow", text: "Your cloud grew: " + (!nodeOf(id).parent ? "new subject " + nodeOf(id).label : C.trail(state.cloud, id, " → ") + " (new)") + ". Open it whenever you like — you can learn anything, any time.", open: id });
            }
          }
        }
      }
      (asked.length ? asked : (learn ? [learn] : [])).forEach(function (raw) {
        var name = titleTopic(raw);
        if (!name || facts.some(function (f) { return C.norm(f.label) === C.norm(name); })) return;
        absorb([P.addFact(name, { created: [], parentsCreated: [] }, state.cloud)]);
      });
      var failedAdd = facts.some(function (f) { return f.status === "failed"; });
      var canRetry = attempt < 1 && r.reason !== "budget" && r.reason !== "busy" && r.reason !== "aborted" && r.reason !== "offline";
      /* an add that did not land is tried once more, then the wording says it could not be added */
      if (!m.fallback && failedAdd && (asked.length || learn) && canRetry && !clarifyingNow(text)) {
        attempt += 1;
        m.text = "";
        m.cut = false;
        m.streaming = true;
        upsert(m);
        turn();
        return;
      }
      if (facts.length && !m.fallback) m.text = P.honestReply(m.text, facts);
      else if (!m.fallback) m.text = P.hideInternal(m.text);
      /* a cut or a one-word reply that added nothing: one more try, then a short question instead of the fragment */
      if (!m.fallback && replyThin(m.text, asked) && !grew && !failedAdd && attempt < 1 && r.reason !== "budget" && r.reason !== "busy" && r.reason !== "aborted" && r.reason !== "offline") {
        attempt += 1;
        m.text = "";
        m.cut = false;
        m.streaming = true;
        upsert(m);
        turn();
        return;
      }
      if (!m.fallback && grew && !m.text) m.text = "That's on your cloud now. Open it whenever you like.";
      if (!m.fallback && m.text) m.text = withHealthNote(m.topic || (asked && asked[0]) || (nodeOf(fid) ? nodeOf(fid).label : ""), m.text);
      if (!m.fallback && !grew && (!m.text || replyThin(m.text, asked))) {
        m.text = asked.length > 1 ? "Which of those should I add? You can name more than one." : "I didn't catch that. What would you like to learn about?";
        m.cut = false;
      }
      upsert(m);
      save();
      fillStarters(bare).then(function () {
        save();
        lock(false);
        scrollDown();
        runBridge();
      });
    }
    turn();
  }
  /*
   * The bridge (procedural, no table): one creation call ("bridge") for the in-between steps of a topic that landed too
   * close to its subject; the links appear as new (sepia) cards and the topic moves under the deepest one. Cached per topic.
   */
  function runBridge() {
    var id = state.bridgeQueue.shift();
    if (!id || state.busy || !P.needsBridge(state.cloud, id)) { state.bridgeQueue = []; return; }
    lock(true);
    var sig = callSignal("bridge"), aborted = false;
    postJson("/create", Object.assign(basePayload(id), { mode: "notice", messages: history().filter(function (m) { return m.role === "user"; }).slice(-1) }, P.bridgeRequest(state.cloud, id)), sig).then(function (j) {
      if (j && j.reason === "aborted") { aborted = true; return; }
      if (!(j && j.ok && Array.isArray(j.items))) return;
      var r = C.applyBridge(state.cloud, id, j);
      save();
      if (r.moved) refreshViews(r.created.concat(id)); /* the steps land quietly: no internal restructuring line */
      return runRepair(id, sig);
    }).then(function (r) {
      /* moved on before it finished: the bridge waits for the next chat turn */
      state.bridgeQueue = aborted || r === "aborted" ? [id] : [];
      save(); lock(false);
    });
  }
  /*
   * The validation pass after a bridge: if the chain is still shallow (fewer than 2 links under the subject), one repair
   * re-ask names the chain so far and asks for a skipped level. node.repaired is set (and saved) before the call, so a
   * topic gets at most 1 repair, ever, whatever happens to the call.
   */
  function runRepair(id, sig) {
    if (!P.needsRepair(state.cloud, id)) return null;
    var n = nodeOf(id);
    n.repaired = Date.now();
    save();
    return postJson("/create", Object.assign(basePayload(id), { mode: "notice", messages: history().filter(function (m) { return m.role === "user"; }).slice(-1) }, P.repairRequest(state.cloud, id)), sig).then(function (j) {
      if (j && j.reason === "aborted") return "aborted"; /* still counts as its one repair (the call may have been made) */
      if (!(j && j.ok && Array.isArray(j.items))) return;
      var r = C.applyRepair(state.cloud, id, j);
      save();
      if (r.moved || r.created.length) refreshViews(r.created.concat(id)); /* a repair stays off the learner's thread */
    });
  }

  function makeCard(topic, parent) {
    if (state.busy) return;
    lock(true);
    var wait = push({ role: "grow", text: "Writing a short note on " + topic + "..." });
    var node = C.findTopic(state.cloud, topic) || C.findSubject(state.cloud, topic);
    var body = Object.assign(basePayload(node ? node.id : null), { focus: topic, focusParent: parent || (node && node.parent ? nodeOf(node.parent).label : ""), messages: history() });
    postJson("/card", body).then(function (j) {
      removeMsg(wait);
      if (j && j.ok && j.card) {
        var r = C.attachCard(state.cloud, j.card);
        push({ role: "card", text: r.card.title, card: r.card });
        refreshAll(r.grew.created.concat(r.grew.promoted, r.grew.strengthened, r.grew.parentsCreated, r.path ? r.path.added : []));
      } else {
        push({ role: "grow", text: "I couldn't write that note just now (" + ((j && (j.reason || j.error)) || "error") + "). Try again in a moment." });
      }
    }).then(function () { save(); lock(false); });
  }

  function removeMsg(m) {
    state.thread = state.thread.filter(function (x) { return x !== m; });
    var n = el.thread.querySelector('[data-id="' + m.id + '"]');
    if (n) n.remove();
  }

  /* ---------- procedural growth: the creation call ---------- */
  function wait(ms) { return new Promise(function (r) { setTimeout(r, reduceMotion && reduceMotion.matches ? 0 : ms); }); }
  /*
   * Shows the build as it arrives: each new parent appears on the cloud, then its child placeholders, a beat apart, so
   * the learner sees their cloud being made while the rest is still being written (the creation call streams its items).
   * add(item) queues one; done() resolves the ids of the parents once every queued item is on the cloud.
   */
  var BUILD_BEAT = 380;
  function cloudBuilder() {
    var parents = [], chain = Promise.resolve(), opened = false;
    return {
      add: function (it) {
        if (!it || !it.node) return;
        if (!opened) { opened = true; openCloud(); setCloudCaption("Building your cloud..."); }
        chain = chain.then(function () {
          var r = C.applyCreate(state.cloud, { items: [{ node: it.node, card: it.card, children: [] }] });
          parents = parents.concat(r.nodes.filter(function (x) { return parents.indexOf(x) < 0; }));
          refreshViews(r.order.length ? r.order : r.nodes);
          return wait(BUILD_BEAT);
        }).then(function () {
          var r = C.applyCreate(state.cloud, { items: [it] });
          refreshViews(r.children);
          save();
          prefetchFirstLesson(); /* the first suggested card's lesson, while the rest of the cloud is still being written */
          return wait(BUILD_BEAT);
        });
      },
      done: function () { return chain.then(function () { if (opened) setCloudCaption(""); save(); return parents; }); }
    };
  }
  /* A slim caption on the cloud while it is being built. */
  var cloudCaption = null;
  function setCloudCaption(t) {
    if (!cloudCaption) { cloudCaption = mk("p", "cloud-caption"); cloudCaption.setAttribute("aria-live", "polite"); el.cloud.appendChild(cloudCaption); }
    cloudCaption.textContent = t; cloudCaption.hidden = !t; placeIkoSoon();
    if (cloudFlow) cloudFlow.hidden = Boolean(t) || !el.panel.hidden;
    if (!t) renderCloudFlow();
  }
  /*
   * One creation call for new parents: "start" (the learner's first answer, or the first thing they type after a Skip)
   * or "more" (after a light re-ask), then the visible build. `about` is always the learner's own words: nothing is
   * built without them (Skip makes no call). Nothing is seeded on the device: when the call can't be made, the
   * message says why and offers Try again (and the chat box stays open for typing a topic).
   */
  function buildCloud(kind, interests, about, grow, direction) {
    if (state.busy) return;
    interests = interests || [];
    if (kind === "start" && !about && !interests.length) return; /* nothing offered yet: never a call */
    lock(true);
    var m = push({ role: "model", local: true, streaming: true, pending: kind === "start" ? 3 : 1, got: [], text: kind === "start" ? "Thanks, " + state.name + ". I'm building your first topics now..." : "Let me build something new around " + (about || interests.join(", ") || "that") + "..." });
    var req = P.createRequest(state.cloud, kind, null, { interests: interests, about: about || "", grow: grow || "", direction: Boolean(direction) });
    var build = cloudBuilder(), seen = 0;
    var take = function (it) { if (!it || !it.node) return; seen += 1; m.got.push(C.cleanLabel(it.node.name)); upsert(m); build.add(it); };
    /* streamed: each parent goes on the cloud as soon as it is written; a plain JSON answer arrives all at once */
    var laterOf = null;
    /* a first cloud (several interests) can outlast one try: wait longer, then retry twice with backoff before the calm line */
    var CREATE_BACKOFF = [1500, 3500];
    var startBuildOk = false;
    var attemptCreate = function (n) {
      return stream("/create", Object.assign(basePayload(null), { mode: "notice", stream: true }, req), { delta: function () {}, item: take }, undefined, CREATE_TIMEOUT_MS).then(function (r) {
        if (r.ok && Array.isArray(r.items)) r.items.slice(seen).forEach(take);
        if (r.ok && Array.isArray(r.later)) laterOf = r.later;
        if (seen) return { ok: true };
        if (r.reason === "aborted" || r.reason === "budget" || r.reason === "busy" || r.reason === "ip_rate" || n + 1 >= 3) return { ok: false, reason: r.reason || "offline" };
        return new Promise(function (res) { setTimeout(res, CREATE_BACKOFF[n] || 3500); }).then(function () { return attemptCreate(n + 1); });
      });
    };
    attemptCreate(0).then(function (j) {
      m.pending = 0;
      startBuildOk = Boolean(j && j.ok);
      if (j && j.ok) {
        return build.done().then(function (ids) {
          var names = ids.map(function (x) { return nodeOf(x) && nodeOf(x).label; }).filter(Boolean);
          /* what they enjoy, as the model read it: the new parents become the profile's interests (later asks build on them) */
          C.setProfile(state.cloud, { interests: names.slice(0, 5) });
          C.setProfile(state.cloud, { onboarded: true });
          trimOffers(ids);
          /* start: ideas past the intake's caps wait as "Also on your mind" (each one a direction to add, one call each) */
          if (kind === "start" && laterOf) C.setLater(state.cloud, laterOf);
          m.streaming = false;
          m.text = (kind === "start" ? "Here's where your path begins: " : "New on your cloud: ") + names.join(", ") + ". Each one has a few smaller topics waiting, best first. Pick a card, or draw one. We can add more as we go along.";
          m.opens = ids.slice(0, 5);
          upsert(m);
          if (kind === "start") state.offerGrow = true; /* asked once the build settles (below) */
          ikoReact(kind === "start" ? "start" : "grow"); /* the first cloud: Iko reassures (more can come later, no wrong picks) */
        });
      }
      m.streaming = false;
      m.got = [];
      m.text = reasonLead(j && (j.reason || j.error)) + (kind === "start" ? " So I couldn't build your first topics yet. Try again in a moment, or type something you'd like to learn about below." : " Let's try that again a little later.");
      m.retry = { kind: kind, about: about || "", grow: grow || "" };
      upsert(m);
    }).then(function () { prefetchFirstLesson(); save(); lock(false); refreshEx(); renderDraw(); if (!el.cloud.hidden && !el.cloud.querySelector(".cloud-caption:not([hidden])")) renderCloudFlow(); if (state.offerGrow) { state.offerGrow = false; offerGrow(); } onStartSettled(startBuildOk); });
  }
  /*
   * The second, optional question ("something you'd like to grow in yourself"): no longer part of the opening. Once the
   * first path has begun, Iko offers it one time, quietly: a line by the pebble and the question in the conversation
   * (Skip-able, with the growth examples from the same cached call). Answering it is one "more" creation call; skipping
   * or ignoring it is none, and it is never asked again.
   */
  function offerGrow() {
    if (hintSeen("grow")) return;
    dismissHint("grow");
    var q = P.openQuestion(state.cloud, "grow");
    ask(q, function (v) { dismissHint("growSaid"); if (el.ikoLine.getAttribute("data-say") === "grow") ikoLine(""); /* answered or skipped: its line goes */ if (v) buildCloud("more", [], cleanAbout("Something I'd like to grow in myself: " + v)); });
    save();
    /* never beside the "another direction" invite: while one is on the cloud, Iko's line waits until it is gone
       (used, closed, or the cloud has its 3 subjects), this visit or a later one. The question is in the conversation already. */
    if (dirInviting()) dismissHint("growWait");
    else sayGrow();
  }
  function sayGrow() {
    if (!el.ikoLine.hidden && el.ikoLine.getAttribute("data-react") === "start") { iko.after = sayGrow; return; } /* after Iko's reassurance */
    dismissHint("growSaid");
    ikoLine("Your path has begun. When you like, tell me something you'd like to grow in yourself too.", 0); /* PR 107: stays until tapped or answered */
    el.ikoLine.setAttribute("data-say", "grow");
  }
  function dirInviting() { return Boolean(state.cloud && (P.directions(state.cloud).invite || (C.dirOf(state.cloud).later || []).length)); }
  function maybeGrowLine() {
    if (hintSeen("growWait") && !hintSeen("growSaid") && !el.cloud.hidden && !dirInviting()) sayGrow();
  }
  /* "What comes next" for a parent: one creation call (the orchestrator only offers it when needed, and it is cached). */
  var aheadBusy = {};
  /* Put a lesson block's steps and choices on the cloud now. A path already there is left alone; a later open reuses the same nodes. */
  function plantBlock(id, ev) {
    var n = nodeOf(id), added = [];
    if (!n || !ev) return added;
    if (n.pending) {
      var p = C.applyPending(state.cloud, id);
      if (p && p.added) added = added.concat(p.added);
    } else if (ev.steps && ev.steps.length && !n.path) {
      added = added.concat(C.applyPath(state.cloud, id, ev.steps, ev.next).added || []);
    }
    n = nodeOf(id);
    if (n && ev.choices && ev.choices.length && !(n.fork && n.fork.ids && n.fork.ids.length >= 2)) added = added.concat(C.applyChoices(state.cloud, id, ev.choices).added || []);
    return added.filter(function (x, i, a) { return x && nodeOf(x) && a.indexOf(x) === i; });
  }
  function placeNext(id, opts) {
    opts = opts || {};
    var n = nodeOf(id);
    var bail = function () { if (opts.unlock) lock(false); };
    if (!n || aheadBusy[id]) { bail(); return; }
    if (P.capped(state.cloud, id) && !opts.deeper) { bail(); return; } /* capped() is empty: depth never stops a next topic */
    if (!opts.force && !P.needsNext(state.cloud, id)) { bail(); return; }
    aheadBusy[id] = 1;
    if (opts.say) opts.say("Working out what comes next in " + n.label + "...");
    var askNext = function (ntry) {
      return postJson("/create", Object.assign(basePayload(id), { mode: "notice" }, P.createRequest(state.cloud, "next", id))).then(function (j) {
        if (j && j.ok && Array.isArray(j.items) && j.items.length) return j;
        if (ntry >= 1 || (j && (j.reason === "budget" || j.reason === "busy" || j.reason === "aborted" || j.reason === "offline"))) return j;
        return askNext(ntry + 1);
      });
    };
    askNext(0).then(function (j) {
      if (j && j.ok && Array.isArray(j.items) && j.items.length) {
        var r = C.applyCreate(state.cloud, { items: j.items.slice(0, 1) }, { focusId: id });
        save();
        refreshAll(r.children);
        if (r.children.length) ikoReact("grow");
        var first = nodeOf(P.nextChild(state.cloud, id));
        if (opts.say) opts.say(r.children.length ? "Next in " + n.label + ": " + r.children.map(function (x) { return nodeOf(x).label; }).join(", ") + "." + (first ? " " + first.label + " is a good place to start." : "") : "Nothing new to add in " + n.label + " right now.");
      } else if (opts.say) opts.say("I couldn't work out what comes next just now (" + ((j && (j.reason || j.error)) || "error") + "). Try again in a moment.");
    }).then(function () {
      delete aheadBusy[id];
      save();
      if (opts.unlock) { lock(false); if (!el.draw.hidden) renderDraw(); }
      if (state.mode === "lesson" && state.lessonNode) renderLessonPath();
      if (state.mode === "test") renderTestNext(state.lessonNode);
    }, function () { delete aheadBusy[id]; if (opts.unlock) lock(false); });
  }
  function createNext(id) {
    var n = nodeOf(id);
    if (!n || state.busy || aheadBusy[id]) return;
    var first = nodeOf(P.nextChild(state.cloud, id));
    if (first && !P.needsNext(state.cloud, id)) { openLesson(first.id); return; }
    lock(true);
    var say = function (t) { if (state.panelNode === id && !el.panel.hidden) paragraphs(el.pNote, t); else push({ role: "grow", text: t, open: null }); };
    placeNext(id, { say: say, unlock: true, force: true });
  }
  /* After an earn, or a test that moves the card on: the next related branches land on the cloud without another click.
     Tapping one still opens its lesson. */
  function ensureAhead(id) {
    var n = nodeOf(id);
    if (!n) return;
    var added = growChildren(id).slice();
    var w = P.whereNext(state.cloud, id, nextStep(id));
    var rel = [];
    if (w.path) rel.push(w.path);
    (w.choices || []).forEach(function (c) { if (c && rel.indexOf(c.id) < 0) rel.push(c.id); });
    rel.forEach(function (rid) {
      var m = nodeOf(rid);
      if (!m) return;
      if (m.pending) {
        var p = C.applyPending(state.cloud, rid);
        if (p && p.added) added = added.concat(p.added);
      }
      var slot = pre[rid];
      if (slot && slot.ev) added = added.concat(plantBlock(rid, slot.ev));
    });
    if (added.length) { save(); refreshViews(added); }
    [id, n.parent].filter(function (h, i, a) { return h && nodeOf(h) && a.indexOf(h) === i && P.needsNext(state.cloud, h); }).forEach(function (h) { placeNext(h); });
    prefetchNext(id);
    if (state.mode === "lesson" && state.lessonNode === id) renderLessonPath();
    if (state.mode === "test") renderTestNext(state.lessonNode);
  }
  /*
   * The soft opening: P.OPENING and one open question in the learner's own words (with the API's examples) and, when
   * they answered it, an optional, soft personal-development question. Then ONE creation call ("start") builds the
   * first parents from both answers. Onboarding makes at most 2 calls: the shared examples (GET, cached) and the start.
   * Skip makes no call: the question stays open, gently, and the first thing they type (or tap) starts the path
   * (waitingForStart). The light re-ask is held back for its usual few days.
   */
  function runOnboarding() {
    var qs = P.onboarding(state.cloud, true), about = "", grow = "", i = 0;
    var next = function () {
      if (i >= qs.length) {
        C.setProfile(state.cloud, { onboarded: true, askedAt: true });
        save();
        if (about) buildCloud("start", splitInterests(about), about, grow);
        else { push({ role: "model", local: true, text: waitingText(), ex: "start" }); save(); renderDraw(); }
        return;
      }
      var q = qs[i++];
      ask(q, function (v) {
        if (q.open && v) about = v; /* one question at a time: the second ("grow") comes later, from Iko (offerGrow) */
        save(); next();
      });
    };
    next();
  }
  /* After a Skip, or when the cloud is still empty: the question stays open, with no call and no list of topics. */
  function waitingText() {
    return "That's fine, " + state.name + ". There's no rush. Whenever something comes to mind, a hobby, a question, anything you'd like to get better at, write it in the box below and we'll begin your path from there.";
  }
  /* After a Skip the waiting message already invites them to type below, so the Begin panel would only repeat it */
  function skipWaiting() { return waitingForStart() && !state.busy && state.thread.some(function (m) { return m.role === "model" && m.ex === "start"; }); }
  /* Nothing on the cloud yet: what they type is what the path starts from (one creation call), not a chat turn. */
  function waitingForStart() { return Boolean(state.cloud) && !C.subjects(state.cloud).length && !P.needsOnboarding(state.cloud); }
  /* The light re-ask (one open question): its answer is one creation call for 1 or 2 new parents. */
  function answerReask(v) {
    var about = cleanAbout(v);
    C.setProfile(state.cloud, { askedAt: true });
    save();
    if (about) buildCloud("more", [], about); else renderDraw();
  }

  /* ---------- lessons ---------- */
  /* Time spent reading a lesson is kept per node (C.track); later features can read it via C.activity. */
  function stopClock() {
    if (state.lessonNode && state.lessonAt) { C.track(state.cloud, state.lessonNode, (Date.now() - state.lessonAt) / 1000); save(); renderDeckButton(); }
    state.lessonAt = 0;
  }
  function startClock() { state.lessonAt = state.lessonNode && !document.hidden ? Date.now() : 0; }
  document.addEventListener("visibilitychange", function () { if (document.hidden) stopClock(); else if (!el.lesson.hidden) startClock(); });
  window.addEventListener("pagehide", stopClock);

  /* PR 110: the cloud widget is always in the header here, so a "Back to your cloud" link beside it is only noise: hidden
     (Escape and the widget still go back); a way back anywhere else (its card, the deck, Iko) stays */
  function cloudBack(b) { b.hidden = b.textContent === "Back to your cloud" && Boolean(el.thumb); }
  function showLesson(on) {
    if (!on) { stopClock(); cancelNav(); }
    if (on) { el.deck.hidden = true; el.hub.hidden = true; }
    el.lesson.hidden = !on;
    el.thread.hidden = on;
    el.dock.hidden = on;
    renderRet();
    if (!on) { state.lessonNode = null; state.mode = "lesson"; state.test = null; renderThread(); renderDraw(); }
    else { el.draw.hidden = true; el.lBack.textContent = state.lessonFrom && nodeOf(state.lessonFrom) ? "Back to its card" : "Back to your cloud"; cloudBack(el.lBack); viewIn(el.lesson); }
  }

  /* "Further reading & viewing" under the lesson: collapsed, allowlisted search links only (lesson.js) */
  function showReading(list) {
    if (!el.lRead) { el.lRead = mk("div", "l-read"); el.lPath.parentNode.insertBefore(el.lRead, el.lPath.nextSibling); }
    el.lRead.textContent = "";
    var d = list ? L.renderReading(document, list) : null;
    if (d) el.lRead.appendChild(d);
  }
  function renderLessonBody(text, streaming) {
    var p = L.parse(text);
    L.render(el.lBody, p, { streaming: streaming, revealed: state.revealed, onReveal: function () { state.revealed = true; renderLessonBody(text, false); } });
    return p;
  }
  function renderLessonPath() {
    var id = state.lessonNode;
    el.lPath.textContent = "";
    renderWhereNext();
    if (!nodeOf(id)) return;
    el.lPath.appendChild(pathBlock(id, { offer: true }));
    renderLessonCard(false);
  }
  /* The holder: the topic's card sits in its tray beside (or above, on phones) the lesson, filling with colour as learning is confirmed. */
  /*
   * The card in the holder. It is only rebuilt when its spec changed, so a transition that just started (the ink wash,
   * the pulse) is not cut short by a later redraw in the same turn (renderLessonPath redraws the card too).
   */
  function renderLessonCard(grew) {
    el.hNote.textContent = "";
    var sp = state.lessonNode && D.cardSpec(state.cloud, state.lessonNode);
    if (!sp) { el.lCard.textContent = ""; el.lCard.removeAttribute("data-sig"); return; }
    var sig = JSON.stringify(sp), old = el.lCard.firstElementChild;
    if (!old || el.lCard.getAttribute("data-sig") !== sig) {
      el.lCard.textContent = "";
      var c = D.render(document, sp, { size: "full", onOpen: function (cid, src) { var back = state.lessonFrom; state.lessonFrom = null; showLesson(false); openHub(cid, src, back || "cloud"); } });
      if (!markEvolve(c, sp) && grew) c.classList.add("grew");
      el.lCard.appendChild(c);
      el.lCard.setAttribute("data-sig", sig);
      saveSeen();
    } else if (grew && !old.classList.contains("evolve")) {
      old.classList.remove("grew"); void old.offsetWidth; old.classList.add("grew"); /* restart the pulse */
    }
    var take = takeawayOf(state.lessonNode), confSays = lessonDone(state.lessonNode) && take; /* Earn already says "You learned" once */
    el.hNote.textContent = sp.level ? "Merged " + C.roman(sp.level) + ". It holds " + sp.corpus.length + " cards and rises a level with each new batch you finish."
      : confSays ? (sp.achieved ? "Achieved: it stays in your deck for good." : (sp.inDeck ? "In your deck." : ""))
      : sp.inDeck && take ? "You learned: " + take + (sp.achieved ? " Achieved: it stays in your deck for good." : "") /* PR 108: the key idea, not a generic line */
      : sp.achieved ? "Achieved. This card stays in your deck for good. Finish a few of its branches and they merge into it."
      : sp.after.length ? "Best after " + D.listOf(sp.after) + ". You can explore it now; it completes once " + (sp.after.length === 1 ? "that's" : "those are") + " done."
      : (sp.inDeck ? "In your deck. " : "") + (sp.tier < 2 && coreLeftNote(state.lessonNode) || ["Its first right answer inks it in.", "Finish it (\u201cI've got it\u201d or two right answers) to tint it.", "Three right answers and it's Achieved, in full colour."][sp.tier]);
    renderKids();
  }
  /* a parent tints once enough of its core branches are done too: "Finish 1 more of its branches to tint it." */
  function coreLeftNote(id) {
    var cp = C.coreProgress(state.cloud, id), k = cp.need - cp.done;
    return k > 0 ? "Finish it, and " + k + " more of its branches, to tint it." : "";
  }
  /* Under the holder: this card's own branches (its children, in the order they're offered), linked from the card. */
  /*
   * Under the holder: the card's branches (the core sequence, numbered), its side paths, and (merged cards) its corpus.
   * On phones the docked holder is slim, so this is a disclosure: a one-line summary that opens to the full lists.
   */
  var kidsOpen = false;
  function renderKids() {
    el.hKids.textContent = "";
    var id = state.lessonNode, n = nodeOf(id);
    if (!n) return;
    var ids = P.orderedChildren(state.cloud, id).filter(function (x) { return !nodeOf(x).absorbedInto; }).slice(0, 6), sides = P.sidePaths(state.cloud, id).filter(function (x) { return !nodeOf(x.id).absorbedInto; }).slice(0, 4);
    var corpus = C.corpusOf(state.cloud, id);
    if (!ids.length && !sides.length && !corpus.length) {
      if (n.pending) el.hKids.appendChild(mk("p", "fine", "New branches grow here once you've answered a question or said \u201cI've got it\u201d."));
      return;
    }
    var fold = mk("details", "h-fold"), sum = mk("summary", "h-sum");
    var lead = nodeOf(P.nextChild(state.cloud, id));
    sum.appendChild(mk("span", "h-sum-t", "Branches of " + n.label));
    var doneN = ids.filter(function (x) { return C.isDone(state.cloud, x); }).length;
    sum.appendChild(mk("span", "h-sum-n", [ids.length ? ids.length + " core" + (doneN ? " (" + doneN + " done)" : "") : "", sides.length ? sides.length + (sides.length === 1 ? " side path" : " side paths") : "", corpus.length ? corpus.length + " merged" : ""].filter(Boolean).join(" · ") + (lead ? " · next: " + lead.label : "")));
    fold.appendChild(sum);
    fold.open = kidsOpen || window.innerWidth >= 900;
    fold.addEventListener("toggle", function () { if (window.innerWidth < 900) kidsOpen = fold.open; });
    el.hKids.appendChild(fold);
    var box = mk("div", "h-lists");
    fold.appendChild(box);
    if (corpus.length) box.appendChild(D.renderCorpus(document, state.cloud, id, { onOpen: function (cid, src) { openCard(cid, src); } }));
    if (!ids.length && !sides.length) return;
    var ul = mk("ol", "core-path");
    ids.forEach(function (cid) {
      var c = nodeOf(cid), li = mk("li", c.ghost ? "ghost" : C.isDone(state.cloud, cid) ? "done" : "");
      li.appendChild(linkBtn(c.label, function () { openLesson(cid); }));
      var lead = cid === P.nextChild(state.cloud, id);
      var aft = C.isDone(state.cloud, cid) ? "" : afterOf(cid);
      li.appendChild(mk("span", aft ? "tag after" : "tag", C.isDone(state.cloud, cid) ? " · done" : aft ? " · " + aft : lead ? " · start here" : c.ghost ? " · new" : ""));
      ul.appendChild(li);
    });
    if (ids.length) { box.appendChild(mk("p", "l-head", "Core path")); box.appendChild(ul); }
    /* side paths: optional aspects off one core step; they never block the branch */
    if (!sides.length) return;
    box.appendChild(mk("p", "l-head side-head", "Side paths"));
    var sl = mk("ul", "side-paths");
    sides.forEach(function (x) {
      var c = nodeOf(x.id), li = mk("li", c.ghost ? "ghost" : C.isDone(state.cloud, x.id) ? "done" : "");
      li.appendChild(linkBtn(c.label, function () { openLesson(x.id); }));
      li.appendChild(mk("span", "tag", C.isDone(state.cloud, x.id) ? " · done" : x.off && nodeOf(x.off) ? " · off " + nodeOf(x.off).label : " · optional"));
      sl.appendChild(li);
    });
    box.appendChild(sl);
  }
  /* Slides the card into the holder: from where it was tapped (a deck or draw card), or a short drop-in. */
  function animateIn(from) {
    var card = el.lCard.firstElementChild;
    if (!card || !card.animate || (reduceMotion && reduceMotion.matches)) return;
    var to = card.getBoundingClientRect();
    if (from && from.width && to.width) {
      card.style.transformOrigin = "0 0";
      card.animate([
        { transform: "translate(" + Math.round(from.left - to.left) + "px, " + Math.round(from.top - to.top) + "px) scale(" + (from.width / to.width).toFixed(3) + ")", opacity: 0.7 },
        { transform: "none", opacity: 1 }
      ], { duration: 520, easing: "cubic-bezier(.2,.7,.2,1)" });
    } else card.animate([{ transform: "translateY(-18px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 380, easing: "ease-out" });
  }
  /* What changed on this topic's card after an action: achieved, joined the deck, or moved up a tier. */
  function growthNote(id, before) {
    var joined = C.joinDeck(state.cloud).indexOf(id) >= 0, after = C.growthOf(state.cloud, id), n = nodeOf(id);
    if (!after || !n) return "";
    if (after.achieved && !(before && before.achieved)) return "You've completed " + n.label + ". Its card is in full colour now, marked Achieved, and kept in your deck for good.";
    if (joined) return n.label + " joined your deck. It stays there for good, and its colour comes in as you show what you've learned.";
    /* The mark on the card is the tier name. Name that tier when it changes, so the line matches the status. */
    if (before && after.tier > before.tier && after.tierName && after.tierName !== before.tierName) return "Your " + n.label + " card is " + after.tierName + " now.";
    return "";
  }

  /* A stored question with fewer than 3 options is not a check. One of them makes the saved set incomplete. */
  function shortSet(qs) {
    return (Array.isArray(qs) ? qs : []).some(function (q) { return q && Array.isArray(q.options) && q.options.length < 3; });
  }
  function wordsOf(s) { return String(s || "").trim().split(/\s+/).filter(Boolean).length; }
  /* The right option is strictly the longest, by words, in every question. A tie is not a tell. */
  function longestTell(qs) {
    var v = Array.isArray(qs) ? qs : [];
    if (v.length < 2) return false;
    return v.every(function (q) {
      if (!q || !Array.isArray(q.options) || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) return false;
      var right = wordsOf(q.options[q.answer]);
      return q.options.every(function (o, i) { return i === q.answer || wordsOf(o) < right; });
    });
  }
  var JOKE_OPT = /\b(made of cheese|none of the above|all of the above|none of these|all of these|lol|lmao|shoe sizes?|for a laugh|just kidding|as a joke)\b/i;
  /* The same bar as a first check: exactly 3 questions, one of each kind, exactly 3 options, no joke option, and the right one is not the longest every time. */
  function fullCheck(qs) {
    var v = (Array.isArray(qs) ? qs : []).filter(function (q) {
      return q && typeof q.q === "string" && Array.isArray(q.options) && q.options.length === 3 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 3 && (q.kind === "recall" || q.kind === "apply" || q.kind === "mistake") && !q.options.some(function (o, i) { return i !== q.answer && JOKE_OPT.test(o); });
    });
    if (v.length !== 3 || !["recall", "apply", "mistake"].every(function (k) { return v.some(function (q) { return q.kind === k; }); })) return [];
    if (longestTell(v)) return [];
    return v;
  }
  /* Check questions from the lesson's hidden block: radio-style options; the first answer to each counts. Every kind needs 3 options. */
  function validQs(qs) {
    return (Array.isArray(qs) ? qs : []).filter(function (q) {
      return q && typeof q.q === "string" && Array.isArray(q.options) && q.options.length >= 3 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length;
    }).map(function (q) { return typeof q.code === "string" && q.code.length <= 600 ? q : Object.assign({}, q, { code: undefined }); }).slice(0, 3);
  }
  /* A saved lesson is kept only when it is whole: worked example, check, a finished sentence, balanced fences, and no short question. */
  function lessonBodyOk(les) {
    if (!les || typeof les.text !== "string" || !les.text.trim()) return false;
    if (shortSet(les.qs) || shortSet(les.cur) || shortSet(les.rq)) return false;
    return L.complete(les.text, { check: validQs(les.qs).length > 0 || validQs(les.cur).length > 0 });
  }
  /*
   * Read -> check -> earn (PR 103). A lesson opens on its reading (Learn) with Continue; Continue opens Check yourself in
   * its own pane. A round counts when every question is answered: all right is a pass (the right answers are confirmed
   * then, the card can grow and be earned with "I've got it", and Where next opens); anything wrong is a miss: nothing is
   * earned, a clearer telling comes first (the "Still tricky" one prepared with the lesson, 0 calls; after a second miss a
   * fresh, gentler version of the lesson, 1 call), then a fresh set of questions (the lesson's spare set, 0 calls, or the
   * new version's own). Each finished round tells the orchestrator how easily this branch is going (C.noteEase).
   * Kept with the lesson (ikolearn.v1.lessons): ck = { r: rounds finished, p: passed at, miss: misses, c: this round is
   * open (Continue tapped), set: which set is on screen (0 its own, 1 the spare, 2+ reshuffled) }.
   */
  function hasQs(id) { var q = state.quiz; return Boolean(q && q.id === id && q.qs.length); }
  function ckOf(id) { var les = state.lessons[id]; if (!les) return null; if (!les.ck || typeof les.ck !== "object") les.ck = { r: 0, p: 0, miss: 0, c: 0, set: 0 }; return les.ck; }
  function passed(id) {
    var les = state.lessons[id], ck = les && les.ck;
    if (ck && ck.p) return true;
    /* a lesson answered in full before PR 103, every answer right: that was a pass */
    var qs = les ? validQs(les.qs) : [], ans = les && Array.isArray(les.ans) ? les.ans : [];
    if (!(ck && ck.r) && qs.length && ans.length >= qs.length && qs.every(function (q, i) { return ans[i] === q.answer; })) return true;
    /* "I've got it" only counts when there is no check. A check that arrives is still offered. */
    return Boolean(les && les.got && !qs.length);
  }
  /* no questions yet, but a check is being written or its last try failed: not a skip */
  function checkGate(id) {
    var q = state.quiz, les = state.lessons[id];
    if (hasQs(id)) return "";
    if ((les && les.ckWait) || (q && q.id === id && q.wait)) return "wait";
    if (q && q.id === id && q.fail) return "fail";
    return "";
  }
  /* what the lesson shows now: learn (reading + Continue), check (the questions), missed (a clearer telling, then a fresh set), passed */
  function lessonPhase(id) {
    if (state.mode !== "lesson" || state.lessonNode !== id) return "learn";
    if (hasQs(id)) {
      if (passed(id)) return "passed";
      var ck = ckOf(id);
      return !ck || !ck.c ? "learn" : state.quiz.missed ? "missed" : "check";
    }
    if (checkGate(id)) { var ck2 = ckOf(id); return ck2 && ck2.c ? "check" : "learn"; }
    return "passed";
  }
  function nextOpen(id) { return state.mode === "lesson" && lessonPhase(id) === "passed"; }
  function setPhase(which) {
    el.phLearn.className = which === "learn" ? "on" : "past";
    el.phCheck.className = which === "check" ? "on" : which === "earn" ? "past" : "";
    if (el.phEarn) el.phEarn.className = which === "earn" ? "on" : "";
  }
  /* the lesson's controls for its phase: Continue while reading; the earn buttons once passed (or with no questions) */
  function applyPhase() {
    var id = state.lessonNode;
    if (!nodeOf(id) || state.mode !== "lesson") return;
    var ph = lessonPhase(id), qs = hasQs(id);
    setPhase(ph === "learn" ? "learn" : ph === "passed" ? (qs ? "earn" : "learn") : "check");
    el.lQuiz.hidden = ph === "learn" || ph === "passed"; /* PR 108: the reading or the check, never both; passed: the check is put away */
    el.lQuiz.classList.toggle("l-pane-on", ph !== "learn" && qs);
    /* PR 109: a check earns the card itself; "I've got it" is only for a lesson with no questions, until it's earned */
    var dn = lessonDone(id), solo = ph === "passed" && !qs && !dn;
    el.lDone.hidden = !(ph === "learn" || solo);
    el.lCont.hidden = ph !== "learn";
    el.lGot.hidden = !solo;
    el.lMain.setAttribute("data-phase", ph);
    el.lMain.setAttribute("data-done", dn ? "1" : "");
    if (!dn) el.lMain.classList.remove("reread");
    renderConf(id);
    ikoActs();
  }
  /* Continue: the reading is done, the questions open in their own pane (their first question focused) */
  function startCheck() {
    var id = state.lessonNode, ck = ckOf(id);
    if (!ck) return;
    if (!hasQs(id)) {
      if (!checkGate(id)) return;
      ck.c = 1; save();
      renderQuiz(); applyPhase();
      var wait = el.lQuiz.querySelector(".quiz");
      if (wait) { wait.tabIndex = -1; showNear(wait); try { wait.focus({ preventScroll: true }); } catch (e) { wait.focus(); } }
      return;
    }
    ck.c = 1; save();
    renderQuiz();
    applyPhase();
    renderIko();
    var f = el.lQuiz.querySelector(".quiz");
    if (f) { f.tabIndex = -1; showNear(f); try { f.focus({ preventScroll: true }); } catch { f.focus(); } }
  }
  function renderQuiz(streaming) {
    var q = state.quiz;
    el.lQuiz.textContent = "";
    if (state.mode !== "lesson") return;
    var wrap = mk("section", "quiz");
    wrap.appendChild(mk("h3", "phase-head", "Check yourself"));
    if (q && q.id === state.lessonNode && !q.qs.length && (q.wait || q.fail)) {
      var cl = mk("p", "fine calm-fail", q.wait ? "Writing a few quick questions for this lesson…" : "Iko is still writing this one. Try another card while you wait. ");
      if (q.fail) cl.appendChild(linkBtn("Retry", function () { if (window.IkoUsage) window.IkoUsage.bump("generation_retries"); q.fail = false; ensureCheck(q.id); }, "link calm-retry"));
      wrap.appendChild(cl);
      el.lQuiz.appendChild(wrap);
      return;
    }
    if (!q || q.id !== state.lessonNode || !q.qs.length) {
      wrap.appendChild(mk("p", "fine", streaming ? "A few quick questions come once the lesson is written." : "No questions this time. Tell me how it went with the buttons below."));
      el.lQuiz.appendChild(wrap);
      return;
    }
    var answered = q.ans.filter(Number.isInteger).length, ok = passed(q.id), ck = ckOf(q.id) || {};
    wrap.appendChild(mk("p", "q-lede", ok && answered >= q.qs.length ? "All done. Nice work checking yourself."
      : q.missed ? "Not quite yet. That's how learning goes."
      : (ck.r ? "A fresh set: " : "") + (q.qs.length === 1 ? "One quick question" : q.qs.length + " quick questions") + " about what you just learned. Get " + (q.qs.length === 1 ? "it" : "them all") + " right and the card is yours to grow."));
    q.qs.forEach(function (item, qi) {
      var set = mk("fieldset", "q"), done = Number.isInteger(q.ans[qi]);
      set.appendChild(L.inline(document, mk("legend"), item.q));
      if (item.code) set.appendChild(L.codeBlock(document, item.code)); /* PR 107: a question about code shows it, as code */
      item.options.forEach(function (o, oi) {
        var lab = mk("label", "opt" + (done && oi === item.answer ? " right" : "") + (done && oi === q.ans[qi] && oi !== item.answer ? " wrong" : ""));
        var inp = mk("input");
        inp.type = "radio"; inp.name = "q" + qi + "-" + q.id + "-" + (ck.r || 0); inp.value = String(oi); inp.checked = done && q.ans[qi] === oi; inp.disabled = done;
        inp.addEventListener("change", function () { answerQ(qi, oi); });
        lab.appendChild(inp);
        lab.appendChild(L.inline(document, mk("span", "opt-t"), String.fromCharCode(65 + oi) + ". " + String(o)));
        set.appendChild(lab);
      });
      if (done) set.appendChild(mk("p", "q-fb", q.ans[qi] === item.answer ? "That's it." : "Not quite. It's " + String.fromCharCode(65 + item.answer) + ": " + item.options[item.answer] + "."));
      /* PR 113: after a wrong pick, why that option was tempting (one short line) */
      if (done && q.ans[qi] !== item.answer && item.why && item.why[q.ans[qi]]) set.appendChild(mk("p", "q-why", "Why it's tempting: " + item.why[q.ans[qi]]));
      wrap.appendChild(set);
    });
    if (q.missed) wrap.appendChild(missBox(q.id));
    el.lQuiz.appendChild(wrap);
    if (quizSaidIt()) { var dup = el.lStatus.querySelector("strong.yes"); if (dup) dup.parentNode.removeChild(dup); }
  }
  /* a missed round: a clearer telling first, then a fresh set of questions (never the card) */
  function missBox(id) {
    var les = state.lessons[id], ck = ckOf(id), box = mk("div", "q-miss"), n = nodeOf(id);
    /* PR 109: one quiet Refresh: a new attempt at the card, the reading first, then a fresh check */
    box.appendChild(mk("p", "l-head", "Not passed yet"));
    box.appendChild(mk("p", null, refreshLocal(id) ? "Refresh for a new attempt: another way to see " + n.label + ", then a fresh set of questions."
      : "Refresh for a new attempt: I'll write " + n.label + " again, more clearly and in smaller steps, with fresh questions."));
    var rb = linkBtn("Refresh", function () { refreshAttempt(id); }, "btn sm q-refresh");
    rb.setAttribute("aria-label", "Refresh: a new attempt at " + n.label);
    box.appendChild(rb);
    return box;
  }
  /* options in a new order (the right one moves), questions in a new order: a fallback set when nothing new is to hand */
  function shuffled(qs, seed) {
    var r = function (i) { return C.hash(seed + ":" + i) % 1000; };
    return qs.map(function (q, qi) {
      var idx = q.options.map(function (_, i) { return i; }).sort(function (a, b) { return r(qi * 10 + a) - r(qi * 10 + b); });
      if (idx[q.answer] === q.answer && idx.length > 1) idx.push(idx.shift());
      return { q: q.q, options: idx.map(function (i) { return q.options[i]; }), answer: idx.indexOf(q.answer), code: q.code, kind: q.kind, why: Array.isArray(q.why) ? idx.map(function (i) { return q.why[i] || ""; }) : undefined };
    }).sort(function (a, b) { return r(a.q.length) - r(b.q.length); });
  }
  /* PR 113: checks of the new kind (recall / apply / spot-the-mistake) get a fresh random option order */
  function mixQs(qs) { return qs.length && qs.every(function (q) { return q.kind; }) ? shuffled(qs, String(Math.random())) : qs; }
  /* the next set: the lesson's spare set (written with it, 0 calls), else the questions once more in a new order */
  function freshCheck(id) {
    var les = state.lessons[id], ck = ckOf(id), q = state.quiz;
    if (!les || !q || q.id !== id) return;
    var spare = fullCheck(les.rq);
    var base = fullCheck(les.qs);
    ck.set = (ck.set || 0) + 1;
    var again = base.length === 3 ? shuffled(base, id + ":" + ck.r + ":" + ck.set) : [];
    q.qs = ck.set === 1 && spare.length === 3 ? spare : again.length === 3 ? again : spare;
    les.cur = q.qs; /* the set on screen, kept so a return shows the same questions */
    q.ans = []; les.ans = []; q.missed = false; ck.c = 1;
    save();
    renderQuiz(); applyPhase(); renderLessonPath(); renderIko();
    var f = el.lQuiz.querySelector(".quiz");
    if (f) { f.tabIndex = -1; showNear(f); try { f.focus({ preventScroll: true }); } catch { f.focus(); } }
  }
  /* a second miss: the lesson written again, clearer and gentler, with its own fresh questions (1 call) */
  function retell(id) { openLesson(id, true, null, { again: true }); }
  /*
   * PR 109: Refresh, after a missed check: a new attempt at the card. The first time, on the device (0 calls): the
   * clearer telling the lesson call prepared leads the reading and the spare questions wait behind Continue. After that
   * (or with nothing prepared) the lesson is written again, gentler, with its own questions (1 call, as before). Either
   * way the learner starts on the reading again, then the check. The ease already noted from the miss stays.
   */
  function refreshLocal(id) {
    var les = state.lessons[id], ck = ckOf(id) || {};
    return Boolean(les && les.tk && (ck.miss || 0) <= 1 && fullCheck(les.rq).length === 3 && (ck.set || 0) < 1);
  }
  function refreshAttempt(id) {
    var les = state.lessons[id], ck = ckOf(id), q = state.quiz;
    if (!les || !ck || !q || q.id !== id || state.busy) return;
    if (!refreshLocal(id)) { retell(id); return; }
    ck.set = 1; q.qs = fullCheck(les.rq); les.cur = q.qs;
    q.ans = []; les.ans = []; q.missed = false; ck.c = 0; les.ra = 1;
    save();
    renderLessonBody(les.text, false); againBox(id);
    renderQuiz(); applyPhase(); renderLessonPath(); renderFork(id); renderIko();
    var top = el.lTitle; top.tabIndex = -1;
    try { top.scrollIntoView({ block: "start", behavior: motionOK() ? "smooth" : "auto" }); top.focus({ preventScroll: true }); } catch { /* old browsers */ }
  }
  /* a local new attempt: the prepared clearer telling, at the top of the reading */
  function againBox(id) {
    var les = state.lessons[id];
    if (!les || !les.ra || !les.tk || el.lBody.querySelector(".q-again")) return;
    var cl = mk("div", "clar q-again"); cl.appendChild(mk("p", "kicker", "Another way to see it")); paragraphs(cl, les.tk);
    el.lBody.insertBefore(cl, el.lBody.firstChild);
  }
  /* PR 109: the card is earned (its check passed, or "I've got it" where there are no questions) */
  function lessonDone(id) {
    var les = state.lessons[id];
    return state.mode === "lesson" && state.lessonNode === id && (hasQs(id) ? passed(id) : Boolean(les && les.got));
  }
  /* PR 109: once earned, a short confirmation in place of the lesson (what was learned), then Where next; the lesson
     itself one quiet tap away */
  var confWas = {};
  function renderConf(id) {
    if (state.mode === "test") { el.lConf.hidden = true; el.lConf.textContent = ""; return; }
    var dn = lessonDone(id);
    if (dn && confWas[id] === false) { if (window.IkoUsage) window.IkoUsage.bump("lessons_completed"); } /* counted once, as it turns done */
    confWas[id] = dn;
    el.lConf.hidden = !dn;
    if (!dn) { el.lConf.textContent = ""; return; }
    var n = nodeOf(id), tk = takeawayOf(id), inDeck = C.inDeck(state.cloud, id);
    el.lConf.textContent = "";
    el.lConf.appendChild(mk("p", "l-head", inDeck ? "Card earned \u00b7 in your deck" : "Passed"));
    el.lConf.appendChild(mk("p", "conf-take", tk ? "You learned: " + tk : "You've shown you understand " + n.label + "."));
    if (state.lessons[id] && state.lessons[id].text) {
      var re = el.lMain.classList.contains("reread");
      var p = mk("p", "fine");
      p.appendChild(linkBtn(re ? "Hide the lesson" : "Reread the lesson", function () { el.lMain.classList.toggle("reread"); renderConf(id); }, "link conf-reread"));
      el.lConf.appendChild(p);
    }
    dedupeStatus();
  }
  /* PR 113: each sentence once per earn: the status line drops repeats and anything the confirmation already says */
  function dedupeStatus() {
    var t = el.lStatus.textContent || "";
    if (!t || el.lStatus.children.length) return;
    var said = (el.lConf.hidden ? "" : el.lConf.textContent || "").toLowerCase(), seen = {};
    var parts = t.match(/[^.!?]+[.!?]*/g) || [];
    var kept = parts.map(function (x) { return x.trim(); }).filter(function (x) {
      var k = x.toLowerCase(); if (!k || seen[k] || (said && said.indexOf(k) >= 0)) return false; seen[k] = 1; return true;
    });
    var nt = kept.join(" ");
    if (nt !== t.trim()) el.lStatus.textContent = nt;
  }
  /* "That's it." is said once: a right quiz answer already says it, so the status line doesn't repeat it */
  function quizSaidIt() { return !el.lQuiz.hidden && [].some.call(el.lQuiz.querySelectorAll(".q-fb"), function (x) { return x.textContent === "That's it."; }); }
  function answerQ(qi, oi) {
    var q = state.quiz, id = q && q.id;
    if (!q || id !== state.lessonNode || Number.isInteger(q.ans[qi]) || !q.qs[qi] || lessonPhase(id) !== "check") return;
    q.ans[qi] = oi;
    if (oi === q.qs[qi].answer) { C.markInk(state.cloud, id); renderLessonCard(true); } /* the first right answer inks it, even if the round is later missed */
    if (state.lessons[id]) state.lessons[id].ans = q.ans.slice();
    var all = q.qs.every(function (_, i) { return Number.isInteger(q.ans[i]); });
    if (all) { endRound(id); return; }
    save();
    renderQuiz();
    var fb = el.lQuiz.querySelectorAll(".q")[qi];
    if (fb) { fb.tabIndex = -1; fb.focus({ preventScroll: true }); }
  }
  /* every question answered: a pass confirms the right answers (colour, children, the deck); a miss earns nothing */
  function endRound(id) {
    var q = state.quiz, ck = ckOf(id), right = q.qs.filter(function (it, i) { return q.ans[i] === it.answer; }).length, all = right === q.qs.length;
    if (all) { setTimeout(function () { prefetchNext(id); }, 4000); setTimeout(function () { maybeNeo(id); }, 2500); } /* PR 113: the next lesson on the path, written ahead once this one is passed */
    var before = C.growthOf(state.cloud, id), kids = [];
    ck.r = (ck.r || 0) + 1; ck.c = 0;
    /* how easily it went: a first-time pass is easy, a pass after misses less so, a miss by how many were right */
    C.noteEase(state.cloud, id, all ? (ck.miss ? 0.6 : 1) : 0.8 * right / q.qs.length);
    if (all) {
      q.qs.forEach(function () { C.confirm(state.cloud, id, true); });
      ck.p = Date.now(); ck.c = 1;
      kids = growChildren(id);
    } else {
      q.qs.forEach(function (it, i) { if (q.ans[i] !== it.answer) C.confirm(state.cloud, id, false); });
      ck.miss = (ck.miss || 0) + 1; ck.c = 1;
      q.missed = true;
    }
    var note = growthNote(id, before);
    save();
    renderQuiz();
    el.lStatus.textContent = "";
    var pre = "";
    if (all) {
      /* PR 109: passing the check earns the card (no "I've got it" step) */
      pre = (note ? note + " " : "") + (kids.length ? kidsLine(id, kids) + " " : "");
      settleMerges().forEach(function (m) { var pn = nodeOf(m.id); if (pn) pre += pn.label + " is now a Merged " + C.roman(m.level) + " card, holding " + C.corpusOf(state.cloud, m.id).length + " cards. "; });
      var les1 = state.lessons[id];
      if (les1 && (les1.earned || les1.got)) ikoReact("pass"); /* (a first earn has its own word) */
    }
    applyPhase();
    renderLessonCard(Boolean(note));
    renderLessonPath();
    renderFork(id);
    refreshViews(kids);
    offerTest(id);
    if (kids.length) ikoReact("grow");
    renderIko();
    if (all) { finishLesson("got", { auto: true, pre: pre.trim() }); ensureAhead(id); return; }
    var f = el.lQuiz.querySelector(".q-miss");
    if (f) { f.tabIndex = -1; showNear(f); try { f.focus({ preventScroll: true }); } catch { f.focus(); } }
  }

  /*
   * The fork: 2 or 3 directions after a lesson (from the lesson call, kept on the node). Once a branch has ended,
   * other branches are suggested instead (chosen on the device, no call). Nowhere else suggests other branches.
   */
  /* Child topics that came with the lesson grow onto the cloud once the topic is engaged (orchestrator rule). -> new ids */
  function growChildren(id) {
    if (!P.childrenReady(state.cloud, id)) return [];
    var r = C.applyPending(state.cloud, id);
    return r ? r.added : [];
  }
  function kidsLine(id, added) {
    var n = nodeOf(id), names = added.map(nodeOf).filter(Boolean).map(function (c) { return c.label; });
    return names.length ? "New branches of " + n.label + " on your cloud: " + names.join(", ") + "." : "";
  }
  /* When a test is ready for this topic's parent (or the topic itself), say so under the lesson. */
  function offerTest(id) {
    var old = el.lStatus.querySelector(".test-offer");
    if (old) old.remove();
    var n = nodeOf(id);
    if (!n) return;
    var pid = [id, n.parent].filter(function (x) { var st = x && P.testState(state.cloud, x); return st && st.ready; })[0];
    if (!pid) return;
    var p = nodeOf(pid), sp = mk("span", "test-offer");
    sp.appendChild(document.createTextNode(" You've finished enough of " + p.label + " for a short test. "));
    sp.appendChild(linkBtn("Take the " + p.label + " test", function () { openTest(pid); }));
    sp.appendChild(document.createTextNode(" (optional)"));
    el.lStatus.appendChild(sp);
    C.markOffered(state.cloud, pid);
  }

  function renderFork(id) {
    el.lFork.textContent = "";
    var n = nodeOf(id);
    if (!n || state.mode !== "lesson") return;
    var cap = P.depthChoices(state.cloud, id);
    if (cap) {
      var subj = nodeOf(cap.test), sib = nodeOf(cap.sibling);
      var box = mk("div", "others");
      box.appendChild(mk("p", "l-head", "This branch can keep going"));
      box.appendChild(mk("p", null, "You can try a sibling, or continue deeper. Nothing stops you."));
      var ul = mk("ul");
      if (subj) { var li = mk("li"); li.appendChild(linkBtn("Test on " + subj.label, function () { openTest(subj.id); })); ul.appendChild(li); }
      if (sib) { var sli = mk("li"); sli.appendChild(linkBtn(sib.label, function () { openLesson(sib.id); })); ul.appendChild(sli); }
      if (cap.deeper) {
        var dli = mk("li");
        dli.appendChild(linkBtn("Continue deeper", function () {
          if (!P.goDeeper(state.cloud, id)) return;
          save();
          placeNext(id, { deeper: true, force: true });
          renderFork(id);
        }));
        ul.appendChild(dli);
      }
      box.appendChild(ul);
      el.lFork.appendChild(box);
    }
    if (C.isTerminal(state.cloud, id) && nextOpen(id)) {
      var others = C.otherBranches(state.cloud, id, 3, topIds()).map(nodeOf).filter(Boolean);
      var w = mk("div", "others");
      w.appendChild(mk("p", "l-head", "This branch is done"));
      w.appendChild(mk("p", null, others.length ? "You've finished " + n.label + ". Here are other branches to try:" : "You've finished " + n.label + ". Ask Iko for something new whenever you like."));
      if (others.length) {
        var ul = mk("ul");
        others.forEach(function (o) {
          var li = mk("li");
          li.appendChild(linkBtn(o.label, function () { openLesson(o.id); }));
          li.appendChild(mk("span", "tag", " · " + trailOf(o.parent)));
          ul.appendChild(li);
        });
        w.appendChild(ul);
      }
      el.lFork.appendChild(w);
      return;
    }
    /* a fork's choices are shown in Where Next (renderWhereNext), with its top pick pre-selected */
  }

  /* Opens a node as a lesson: from the cache (no call) or streamed once (one call; maps the path too if it has none). */
  function openLesson(id, fresh, from, opts) {
    var n = nodeOf(id);
    if (!n) return;
    opts = opts || {};
    /* moving on cancels what belonged to the last view (the note, a bridge, another lesson or clarification still being written) */
    cancelNav();
    if (calls.lessonFor !== id) { cancelCall("lesson"); cancelCall("clarify"); }
    if (state.lessonNode !== id) state.pick = null;
    if (!el.cloud.hidden) closeCloud(true);
    stopClock();
    state.lessonNode = id;
    state.lessonFrom = state.pendingFrom || null; state.pendingFrom = null; /* opened from a card's hub: Back returns there */
    state.mode = "lesson"; state.test = null;
    if (!C.isDone(state.cloud, id)) state.cloud.active = id; /* "Continue" brings the learner back here */
    markLast(id, "lesson"); /* PR 107: "Return to" */
    C.profileOf(state.cloud).lessonVisit = C.profileOf(state.cloud).visits || 0; /* not stuck: a lesson was opened this visit */
    startClock();
    state.revealed = false;
    showLesson(true);
    window.scrollTo(0, 0);
    el.lMain.classList.remove("testing");
    el.lPhase.hidden = false; setPhase("learn");
    el.lTrail.textContent = n.parent ? trailOf(n.parent) : "Subject";
    el.lTitle.textContent = n.label;
    el.lStatus.textContent = "";
    el.lDone.hidden = true;
    el.lFork.textContent = "";
    el.lQuiz.textContent = ""; el.lQuiz.hidden = true;
    el.lClar.textContent = "";
    el.lCont.hidden = true;
    showReading(null);
    renderLessonPath();
    animateIn(from);
    var cached = !fresh && lessonBodyOk(state.lessons[id]) ? state.lessons[id] : null;
    if (cached) {
      /* every saved answer comes back (one per question: 2 or 3) */
      var qs = validQs(cached.cur).length ? validQs(cached.cur) : validQs(cached.qs), ck = cached.ck || {};
      state.quiz = { id: id, qs: qs, ans: Array.isArray(cached.ans) ? cached.ans.slice(0, qs.length) : [] };
      /* a round answered in full and missed: its clearer telling is still waiting */
      state.quiz.missed = Boolean(qs.length && !passed(id) && ck.c && state.quiz.ans.length >= qs.length && qs.every(function (_, i) { return Number.isInteger(state.quiz.ans[i]); }));
      var storedQs = validQs(cached.cur).length ? cached.cur : cached.qs;
      var wantCk = needCheck(storedQs) && !passed(id);
      if (wantCk) { state.quiz.qs = []; state.quiz.wait = true; state.quiz.fail = false; }
      renderLessonBody(cached.text, false);
      lessonReady(id, false);
      showReading(cached.rd);
      if (wantCk) ensureCheck(id);
      return;
    }
    state.quiz = { id: id, qs: [], ans: [] };
    if (state.busy) {
      /* something else is still being written: this lesson waits its turn and starts by itself (no "try again") */
      el.lBody.textContent = "";
      el.lBody.appendChild(mk("p", "l-intro wait", "Getting this lesson ready. It starts as soon as the last answer is finished."));
      state.queued = function () { if (state.lessonNode === id && state.mode === "lesson" && (!lessonBodyOk(state.lessons[id]) || opts.again)) openLesson(id, fresh, null, opts); };
      return;
    }
    lock(true);
    calls.lessonFor = id;
    /* the orchestrator builds the context: child topics only when wanted, and the planned next step for the fork */
    var ctx = P.lessonContext(state.cloud, id), text = "", wantPath = ctx.wantPath, reading = [], tricky = "", retry = [], key = "";
    var prevCk = state.lessons[id] && state.lessons[id].ck; /* a fresh version keeps the lesson's check rounds (never a free pass) */
    if (opts.again) { ctx.again = true; ctx.pace = "gentle"; }
    el.lBody.textContent = "";
    renderLessonBody("", true);
    renderQuiz(true);
    var lessonBody = Object.assign(basePayload(id), ctx);
    var nst = neoGet(); if (P.neoTaken(nst, nodeOf(id).label)) neoPut(nst); /* PR 119: a suggestion opened is a suggestion taken */
    lessonStream(id, lessonBody, {
      reset: function () { text = ""; if (state.lessonNode === id) renderLessonBody("", true); },
      delta: function (t) { text += t; if (state.lessonNode === id) renderLessonBody(text, true); },
      /* the hidden block: check questions, the card's line, path steps (only when asked), the fork, and whether this branch ends here */
      path: function (ev) {
        var flash = [];
        if (ev.blurb) C.setBlurb(state.cloud, id, ev.blurb);
        reading = L.cleanReading(ev.reading); /* titles and search phrases only; links are built on the device (allowlist) */
        tricky = typeof ev.tricky === "string" ? ev.tricky.trim().slice(0, 600) : ""; /* "Still tricky", prepared in this same call: shown only if asked */
        if (state.quiz && state.quiz.id === id) state.quiz.qs = mixQs(validQs(ev.questions)); /* PR 113: a new option order each time */
        retry = mixQs(validQs(ev.retry));
        key = typeof ev.key === "string" ? ev.key.trim().slice(0, 220) : ""; /* the spare set for a second try (0 calls) */
        if (ev.end) C.markEnd(state.cloud, id);
        if (wantPath && ev.steps && ev.steps.length) {
          /* child topics: straight onto the cloud if the topic is already engaged, else they wait for a right answer or "I've got it" */
          if (P.engaged(state.cloud, id)) { var r = C.applyPath(state.cloud, id, ev.steps, ev.next); flash = flash.concat(r.added, r.next ? [r.next] : []); }
          else C.setPending(state.cloud, id, ev.steps, ev.next);
        }
        if (ev.choices && ev.choices.length) flash = flash.concat(C.applyChoices(state.cloud, id, ev.choices).added);
        refreshViews(flash);
        if (state.lessonNode === id) renderLessonPath();
      }
    }, callSignal("lesson")).then(function (r) {
      calls.lessonFor = null;
      var keepLesson = L.complete(text, { check: Boolean((state.quiz && validQs(state.quiz.qs).length) || /\n?\s*CHECK\s*[:.-]/i.test(text)) });
      if (r.ok && keepLesson) {
        text = withHealthNote(nodeOf(id) ? nodeOf(id).label : "", text.trim());
        var prevL = state.lessons[id];
        state.lessons[id] = { text: text.trim(), at: Date.now(), qs: state.quiz && state.quiz.id === id ? state.quiz.qs : [], ans: [] };
        if (prevL && prevL.earned) { state.lessons[id].earned = prevL.earned; if (prevL.take) state.lessons[id].take = prevL.take; } /* PR 108: earned once, for good */
        if (retry.length >= 2) state.lessons[id].rq = retry;
        if (prevCk && (prevCk.r || prevCk.p)) state.lessons[id].ck = { r: prevCk.r || 0, p: prevCk.p || 0, miss: prevCk.miss || 0, c: 0, set: 0, again: opts.again ? 1 : 0 };
        if (reading.length) state.lessons[id].rd = reading;
        if (tricky) state.lessons[id].tk = tricky;
        if (key) state.lessons[id].key = key; /* PR 113: the lesson's own key idea, for "You learned:" */
        if (state.lessonNode === id) {
          renderLessonBody(text, false);
          if (needCheck(state.lessons[id].qs) && state.quiz && state.quiz.id === id) { state.quiz.qs = []; state.quiz.wait = true; state.quiz.fail = false; }
          lessonReady(id, true);
          showReading(reading);
        }
        if (needCheck(state.lessons[id].qs)) ensureCheck(id); /* the hidden block was missing or partial: a real check, not "I've got it" */
      } else if (r.reason === "aborted") {
        /* cancelled because the learner moved on: not a failure; it is written next time it's opened */
      } else if (state.lessonNode === id) {
        /* a cut-off lesson is not shown as finished and is not saved; it is written again next time */
        el.lBody.textContent = "";
        var calm = mk("p", "l-intro calm-fail", "Iko is still writing this one. Try another card while you wait. ");
        calm.appendChild(linkBtn("Retry", function () { if (window.IkoUsage) window.IkoUsage.bump("generation_retries"); openLesson(id, true); }, "link calm-retry"));
        el.lBody.appendChild(calm);
      }
      save(); lock(false);
    });
  }

  /*
   * PR 113: a lesson stream with one automatic, stricter retry when the first try gives nothing usable, and the
   * "Next on this path" lesson written ahead in the background (kept in memory on this device) so it opens at once.
   */
  /*
   * PR 114: the weekly recap, written to the learner in four sentences (what was explored, one check passed, a question to
   * think about, a next step). Made on this device from the saved lessons (no call), kept a day (ikolearn.v1.recap).
   */
  var RECAP = "ikolearn.v1.recap";
  function weeklyRecap() {
    var day = new Date().toDateString(), key = (state.cloud && state.cloud.name) || "";
    try { var c = JSON.parse(load(RECAP) || "null"); if (c && c.day === day && c.who === key && typeof c.t === "string") return c.t; } catch (x) { /* rebuilt below */ }
    var wk = Date.now() - 7 * 864e5, ids = Object.keys(state.lessons || {}).filter(function (id) { var l = state.lessons[id]; return l && (l.at || 0) >= wk && nodeOf(id); });
    if (!ids.length) return "";
    ids.sort(function (a, b) { return (state.lessons[b].at || 0) - (state.lessons[a].at || 0); });
    var items = ids.map(function (id) { return { label: nodeOf(id).label, passed: Boolean(passed(id) || state.lessons[id].earned), key: takeawayOf(id) }; });
    var first = ids.filter(function (id) { return passed(id) || state.lessons[id].earned; })[0] || ids[0];
    var nx = P.pathNext(state.cloud, first), nn = nx && nodeOf(nx);
    var t = P.weekRecap(items, nn ? nn.label : "");
    var nl = P.neoLine(state.cloud, neoGet()); if (nl) t += " " + nl; /* PR 119: only when gated in */
    store(RECAP, JSON.stringify({ day: day, who: key, t: t }));
    return t;
  }
  var pre = {};
  /* PR 119 NEO-IKIGAI: one optional, quiet "this could connect to..." branch next to a topic the learner has, only once
     gated in by history (P.neoDue), through the existing adjacent call; taken or left alone is noted on this device */
  var NEO = "ikolearn.v1.neo";
  function neoGet() { try { return P.neoState(JSON.parse(load(NEO) || "null")); } catch (x) { return P.neoState(null); } }
  function neoPut(st) { store(NEO, JSON.stringify(st)); }
  var neoBusy = false;
  function maybeNeo(id) {
    var st = neoGet(), n = nodeOf(id);
    if (neoBusy || !n || !P.neoDue(state.cloud, st) || state.busy || document.hidden) return;
    var host = n.parent && nodeOf(n.parent) && nodeOf(n.parent).parent ? n.parent : id; /* next to a topic the learner already has */
    neoBusy = true;
    postJson("/adjacent", Object.assign(basePayload(host), { neo: P.neoThemes(st) })).then(function (j) {
      neoBusy = false;
      var g = j && j.ok && j.ghosts && j.ghosts[0];
      if (!g || !g.theme) return;
      var r = C.addGhosts(state.cloud, [{ name: g.name, parent: nodeOf(host).label, blurb: g.blurb }], Date.now(), host);
      if (!r.added.length) return;
      neoPut(P.neoAdd(state.cloud, neoGet(), { name: nodeOf(r.added[0]).label, parent: nodeOf(host).label, theme: g.theme }, Date.now()));
      save(); refreshViews(r.added);
    }, function () { neoBusy = false; });
  }
  /* matches LEARN_LIMITS.lessonExcerptChars: a check or a clarification needs the example, not only the opening */
  var LESSON_EXCERPT = 5000;
  /* PR 118: a check is usable when it has a valid question; a new-style one (kinds) only when it is the full three */
  function needCheck(qs) {
    if (shortSet(qs) || longestTell(qs)) return true; /* a short question, or a set whose right option is always the longest, is written again */
    var v = validQs(qs);
    if (!v.length) return true;
    var kinds = v.filter(function (q) { return q.kind; }).length;
    return kinds > 0 && !(v.length === 3 && ["recall", "apply", "mistake"].every(function (k) { return v.some(function (q) { return q.kind === k; }); }));
  }
  function revealCheck(id) {
    if (state.lessonNode === id && state.mode === "lesson") { renderQuiz(); applyPhase(); }
  }
  function markCheckFail(id) {
    if (state.quiz && state.quiz.id === id) { state.quiz.wait = false; state.quiz.fail = true; }
    revealCheck(id);
    if (state.lessonNode === id && state.mode === "lesson" && el.lStatus && !String(el.lStatus.textContent || "").trim()) el.lStatus.textContent = "The check didn't come through. Continue to try it again.";
  }
  /* the check written on its own from the lesson text (one call, the server retries once); shown when it succeeds, never swapped for "I've got it" */
  function ensureCheck(id, n) {
    var les = state.lessons[id];
    n = n || 0;
    if (!les || !les.text || les.ckWait) return;
    if (!needCheck(les.qs) && validQs(les.qs).length) {
      if (state.quiz && state.quiz.id === id && !hasQs(id)) { state.quiz.qs = mixQs(validQs(les.qs)); state.quiz.ans = []; state.quiz.wait = false; state.quiz.fail = false; }
      revealCheck(id);
      return;
    }
    les.ckWait = 1;
    if (state.quiz && state.quiz.id === id) { state.quiz.qs = []; state.quiz.wait = true; state.quiz.fail = false; renderQuiz(true); applyPhase(); }
    postJson("/check", Object.assign(basePayload(id), P.withBand(state.cloud, {}), { mode: "notice", messages: [], lesson: String(les.text).slice(0, LESSON_EXCERPT) })).then(function (j) {
      delete les.ckWait;
      var qs = j && j.ok ? fullCheck(j.questions) : [];
      if (qs.length === 3 && !needCheck(qs)) {
        les.qs = mixQs(qs); les.ans = [];
        var rq = fullCheck(j.retry); if (rq.length === 3) les.rq = mixQs(rq);
        if (typeof j.key === "string" && j.key.trim()) les.key = j.key.trim().slice(0, 220);
        if (state.quiz && state.quiz.id === id) { state.quiz.qs = les.qs; state.quiz.ans = []; state.quiz.wait = false; state.quiz.fail = false; }
        if (el.lStatus && String(el.lStatus.textContent || "").indexOf("didn't come through") >= 0) el.lStatus.textContent = "";
        save();
        revealCheck(id);
      } else if (n < 1) ensureCheck(id, 1);
      else { save(); markCheckFail(id); }
    }, function () { delete les.ckWait; if (n < 1) ensureCheck(id, 1); else { save(); markCheckFail(id); } });
  }
  function lessonHasCheck(ev) { return Boolean(ev && Array.isArray(ev.questions) && ev.questions.length); }
  /* A lesson written ahead (finished, or still arriving) plays instead of a second call. A cut-off lesson is not kept. */
  function playPrepared(id, on) {
    var p = pre[id];
    if (!p) return null;
    var done = function () {
      if (!p.ok) return null;
      delete pre[id];
      if (on.reset) on.reset();
      if (on.delta) on.delta(p.text);
      if (p.ev && on.path) on.path(p.ev);
      return { ok: true };
    };
    return p.ok ? Promise.resolve(done()) : p.p ? p.p.then(done) : null;
  }
  function lessonStream(id, body, on, signal) {
    var again = function () { if (on.reset) on.reset(); return stream("/lesson", Object.assign({}, body, { strict: true }), on, signal); };
    var ready = playPrepared(id, on);
    if (ready) return ready.then(function (r) { return r && r.ok ? r : again(); }).catch(function () { return { ok: false, reason: "error" }; });
    var got = "", sawCheck = false;
    var wrap = {
      delta: function (t) { got += t; on.delta(t); },
      path: function (ev) { if (lessonHasCheck(ev)) sawCheck = true; if (on.path) on.path(ev); },
      reset: function () { got = ""; sawCheck = false; if (on.reset) on.reset(); }
    };
    return stream("/lesson", body, wrap, signal).then(function (r) {
      if (r.reason === "aborted") return r;
      if (r.ok && L.complete(got, { check: sawCheck })) return r;
      if (["busy", "ip_rate", "budget", "offline", "off", "no_key", "429", "503", "incomplete"].indexOf(String(r.reason)) >= 0) return r;
      return again();
    }).catch(function () {
      if (wrap.retried) return { ok: false, reason: "error" };
      wrap.retried = true;
      return again().catch(function () { return { ok: false, reason: "error" }; });
    });
  }
  /* One lesson kept in memory. plant: put its steps on the cloud when it arrives (the next card on a path). */
  function prepareAhead(id, plant) {
    if (!id || !nodeOf(id) || lessonBodyOk(state.lessons[id]) || pre[id]) return;
    var slot = pre[id] = { ok: false, text: "", ev: null };
    var pull = function (strict) {
      slot.text = ""; slot.ev = null;
      return stream("/lesson", Object.assign(basePayload(id), P.lessonContext(state.cloud, id), { pre: true }, strict ? { strict: true } : {}), {
        delta: function (t) { slot.text += t; },
        path: function (ev) { slot.ev = ev; },
        reset: function () { slot.text = ""; slot.ev = null; }
      }).then(function (r) {
        slot.ok = Boolean(r && r.ok && L.complete(slot.text, { check: lessonHasCheck(slot.ev) }));
        if (slot.ok) {
          if (plant && slot.ev) {
            var a = plantBlock(id, slot.ev);
            if (a.length) { save(); refreshViews(a); if (state.mode === "lesson") renderLessonPath(); if (state.mode === "test") renderTestNext(state.lessonNode); }
          }
          return true;
        }
        if (!strict && r && r.reason !== "aborted" && r.reason !== "budget" && r.reason !== "busy" && r.reason !== "offline") return pull(true);
        delete pre[id];
        return false;
      }, function () { if (!strict) return pull(true); delete pre[id]; return false; });
    };
    slot.p = pull(false);
  }
  function prefetchNext(id) { if (!state.busy && !document.hidden) prepareAhead(P.pathNext(state.cloud, id), true); }
  /* The first Pick up card, written while the cloud is built and again when the build finishes. */
  function prefetchFirstLesson() {
    if (document.hidden || !state.cloud) return;
    var items; try { items = P.suggest(state.cloud, { noAsk: true }); } catch (e) { return; }
    var it = (items || []).filter(function (x) { return x && x.id && x.kind !== "test" && x.kind !== "grow" && x.kind !== "ask" && nodeOf(x.id) && !lessonBodyOk(state.lessons[x.id]) && P.unfinished(state.cloud, x.id); })[0];
    if (it) prepareAhead(it.id);
  }

  /* Reading a lesson counts a little toward mastery; the learner says how it went with the two buttons. */
  function lessonReady(id, wasNew) {
    var n = nodeOf(id);
    var was = n.ghost, before = C.growthOf(state.cloud, id);
    C.engage(state.cloud, id, "open");
    var kids = growChildren(id);
    var note = growthNote(id, before);
    if (kids.length) note = (note ? note + " " : "") + kidsLine(id, kids);
    var les = state.lessons[id], marked = n.mastery >= C.MASTERED || Boolean(les && les.got); /* earned: kept with the lesson */
    if (les && les.ra) againBox(id);
    if (note) el.lStatus.textContent = (el.lStatus.textContent ? el.lStatus.textContent + " " : "") + note;
    save();
    settleMerges();
    refreshViews((was || wasNew ? [id] : []).concat(kids));
    renderLessonPath();
    renderLessonCard(Boolean(note));
    renderQuiz();
    applyPhase();
    renderFork(id);
    if (state.lessons[id] && state.lessons[id].cl) renderClarify(id, !marked); /* clarifications already written: shown again, 0 calls (options only while not done) */
    offerTest(id);
    renderIko();
    if (hasQs(id) && passed(id) && les && !les.got) finishLesson("got", { auto: true, quiet: true }); /* PR 109: passed before this change, never tapped: earned now */
  }
  /*
   * "I've got it": confirmed on the device (0 calls). Progress is marked, a short note says so, and the learner stays
   * here; Where Next (below) has the next step pre-selected, nothing opens by itself.
   * "Still tricky": stays on the topic with a clarification already there: the simpler explanation the lesson call
   * prepared (0 calls), or, for a lesson saved before that, one call that writes it. The worked example and a targeted
   * question stay one tap away (one call each, kept), and chat is one tap away with the topic in focus.
   */
  /*
   * PR 108: what the learner actually learned, in one line, from the lesson they read (no call): its first explanation's
   * first sentence (or the intro's). Kept with the lesson (state.lessons[id].take, additive) and shown on the earned card.
   */
  function takeawayOf(id) {
    var les = state.lessons[id];
    if (!les) return "";
    if (les.key) return les.key;
    if (les.take) return les.take;
    var lp = les.text ? L.parse(les.text) : null;
    if (!lp) return "";
    var first = function (list) { for (var i = 0; i < (list || []).length; i++) if (typeof list[i] === "string" && list[i].trim()) return list[i]; return ""; };
    var t = first(lp.explain) || (typeof lp.intro === "string" ? lp.intro : first(lp.intro)) || first(lp.steps);
    t = String(t || "").replace(/`([^`]*)`/g, "$1").replace(/\s+/g, " ").trim();
    var m = t.match(/^.{12,}?[.!?](?=\s|$)/);
    t = (m ? m[0] : t).trim();
    if (t.length > 160) t = t.slice(0, 157).replace(/\s+\S*$/, "") + "\u2026";
    return t.length >= 8 ? t : "";
  }
  function finishLesson(kind, o) {
    var id = state.lessonNode, n = nodeOf(id);
    o = o || {};
    if (!n) return;
    if (kind !== "got" || lessonPhase(id) !== "passed") return; /* earned only once the check is passed (PR 103) */
    var keep = o.auto ? null : holdScroll(); /* PR 107: the earn never moves the page (it used to jump to the top on a phone); PR 109: a pass brings Where next up instead */
    var les0 = state.lessons[id], wasEarned = Boolean(les0 && (les0.earned || les0.got)); /* PR 108: the card's flight plays only the first time it is earned */
    var before = C.growthOf(state.cloud, id);
    var r = C.engage(state.cloud, id, kind);
    var kids = kind === "got" ? growChildren(id) : [];
    var note = growthNote(id, before);
    if (state.lessons[id]) { state.lessons[id].got = Date.now(); var tk = takeawayOf(id); if (tk) state.lessons[id].take = tk; } /* kept with the lesson: shown again on return; PR 108: its one-line takeaway too */
    if (C.isDone(state.cloud, id) && state.cloud.active === id) state.cloud.active = null;
    save();
    settleMerges();
    refreshViews([id].concat(r.next ? [r.next] : [], kids));
    el.lStatus.textContent = "";
    /* understood: the clarify options go; an answer already shown stays */
    [".clar-opts", ".clar-chat"].forEach(function (q) { var co = el.lClar.querySelector(q); if (co) co.parentNode.removeChild(co); });
    if (!o.quiet) {
      if (!quizSaidIt()) el.lStatus.appendChild(mk("strong", "yes", "That's it. ")); /* said once: the quiz may already have */
      el.lStatus.appendChild(document.createTextNode((o.pre ? o.pre + " " : "") + (note || n.label + " is growing stronger on your cloud.") + (kids.length ? " " + kidsLine(id, kids) : "")));
    }
    renderLessonPath();
    renderLessonCard(Boolean(note));
    renderFork(id);
    offerTest(id);
    ikoActs();
    applyPhase();
    /* the pressed button (or the check) is gone now: the focus moves to the confirmation, without a jump */
    el.lConf.tabIndex = -1; try { el.lConf.focus({ preventScroll: true }); } catch { /* old browsers: leave it */ }
    if (keep) keep();
    if (o.auto && !o.quiet) showConf();
    if (!wasEarned && C.inDeck(state.cloud, id)) { flyToDeck(id); ikoReact("earn"); if (window.IkoSound) IkoSound.earn(); if (state.lessons[id]) { state.lessons[id].earned = Date.now(); save(); } } /* kept (additive) */
    else renderDeckButton();
    if (keep) { keep(); requestAnimationFrame(keep); setTimeout(keep, 1000); } /* after the redraws and the card's flight too */
  }
  /* PR 109: after a pass the confirmation and Where next come into view, gently (never a jump to the top) */
  function showConf() {
    var r = el.lConf.getBoundingClientRect(), head = 72;
    if (r.top >= head && r.top < window.innerHeight * 0.5) return; /* already where the eye is */
    var se = document.scrollingElement || document.documentElement, y = Math.max(0, se.scrollTop + r.top - head - 8);
    try { window.scrollTo({ top: y, behavior: motionOK() ? "smooth" : "auto" }); } catch { window.scrollTo(0, y); }
  }
  /*
   * PR 107: the page's scroll position, put back if anything moved it. The cause of the jump on phones: the card flew from
   * its tray at the top of the lesson, and an off-screen card was scrolled into view first (scrollIntoView), which took
   * the page back to the top. Now the flight starts from where the learner is, and the position is kept regardless.
   */
  function holdScroll() {
    var se = document.scrollingElement || document.documentElement, y = se.scrollTop, at = Date.now();
    return function () { if (Date.now() - at < 2500 && Math.abs(se.scrollTop - y) > 2) se.scrollTop = y; };
  }
  /* the next step (the fork, Where next) is below the fold: Iko says so with the earn */
  function nextBelow() {
    var t = [el.lFork, el.lNext].filter(function (x) { return x && x.firstElementChild && x.getClientRects().length; })[0];
    return Boolean(t) && t.getBoundingClientRect().top > window.innerHeight - 40;
  }

  /* ---------- "Still tricky": prepared clarifications, inline ---------- */
  /* The simpler explanation, straight away: prepared with the lesson (0 calls), already written (0 calls), or written now (1 call) */
  function prepareClarify(id) {
    var les = state.lessons[id];
    if (les && les.tk && !(les.cl && les.cl.simpler)) { les.cl = les.cl || {}; les.cl.simpler = les.tk; save(); }
    renderClarify(id, true);
    if (les && les.cl && les.cl.simpler) focusClar("simpler");
    else clarify(id, "simpler");
  }
  /* in Iko's sheet only the sheet scrolls (scrolling the page would slide the lesson's buttons under the sheet or the header) */
  function showNear(b) {
    if (!el.ikoSheet.contains(b)) { b.scrollIntoView({ block: "nearest" }); return; }
    var s = el.ikoBody, r = b.getBoundingClientRect(), sr = s.getBoundingClientRect();
    if (r.bottom > sr.bottom) s.scrollTop += Math.min(r.bottom - sr.bottom, r.top - sr.top);
    else if (r.top < sr.top) s.scrollTop -= sr.top - r.top;
  }
  function focusClar(style) {
    var b = el.lClar.querySelector('.clar[data-style="' + style + '"]');
    if (!b) return;
    b.tabIndex = -1;
    showNear(b);
    try { b.focus({ preventScroll: true }); } catch { b.focus(); }
  }
  var CLARIFY = [["simpler", "Explain it more simply"], ["example", "Show me a worked example"], ["question", "Ask me a question"]];
  function clarifyLabel(style) { return (CLARIFY.filter(function (c) { return c[0] === style; })[0] || ["", ""])[1]; }
  /* the three options, plus any answers already written for this lesson (kept with it: asking again is 0 calls) */
  function renderClarify(id, offer) {
    el.lClar.textContent = "";
    if (state.lessonNode !== id) return;
    var les = state.lessons[id], done = (les && les.cl) || {};
    if (offer) {
      var row = mk("div", "clar-opts");
      CLARIFY.forEach(function (c) {
        var b = mk("button", "btn sm clar-opt", c[1]);
        b.type = "button"; b.disabled = state.busy;
        b.setAttribute("data-style", c[0]);
        b.addEventListener("click", function () { clarify(id, c[0]); });
        row.appendChild(b);
      });
      el.lClar.appendChild(row);
    }
    CLARIFY.forEach(function (c) { if (done[c[0]]) clarBox(c[0], done[c[0]]); });
    if (offer) {
      /* still stuck: chat, with this topic in focus and the question started */
      var talk = mk("p", "fine clar-chat");
      talk.appendChild(linkBtn("Talk it through with Iko", function () {
        var t = "I'm still finding " + nodeOf(id).label + " tricky. Can you help me with it?";
        if (iko.open) { el.ikoIn.value = t; ikoSize(); el.ikoIn.focus(); } else askInChat(id, t);
      }));
      el.lClar.appendChild(talk);
    }
  }
  function clarBox(style, text) {
    var old = el.lClar.querySelector('.clar[data-style="' + style + '"]');
    if (old) old.parentNode.removeChild(old);
    var box = mk("div", "clar");
    box.setAttribute("data-style", style);
    box.appendChild(mk("p", "kicker", clarifyLabel(style)));
    var body = mk("div", "clar-body");
    box.appendChild(body);
    if (text) paragraphs(body, text);
    el.lClar.insertBefore(box, el.lClar.querySelector(".clar-chat"));
    return { box: box, body: body };
  }
  function hintWords(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(function (w) {
      return w.length > 3 && !/^(that|this|with|from|they|them|have|what|when|your|into|than|then|also|only|just|about|does|mean|means|which|their|there|here|some|more|most|very|like|been|being|were|will|would|could|should|something|anything)$/.test(w);
    });
  }
  /* A definition hint echoes the correct option when most of its content words show up in the hint. */
  function echoesOption(text, right) {
    var rw = hintWords(right);
    if (!rw.length) return String(right || "").length >= 8 && String(text || "").toLowerCase().indexOf(String(right).toLowerCase()) >= 0;
    var hw = hintWords(text);
    var hit = rw.filter(function (w) { return hw.indexOf(w) >= 0; }).length;
    return rw.length === 1 ? hit === 1 : hit / rw.length >= 0.5;
  }
  function isDefinition(item) {
    if (!item) return false;
    if (item.kind === "recall") return true;
    return /\b(what is|what are|what does|what do we call|which term|defined as|mean by|meaning of)\b/i.test(item.q || "");
  }
  /* Drop any sentence that quotes a correct check option. A definition hint that still echoes the right wording becomes an example. */
  function stripAnswers(id, text) {
    var rights = [], defs = [];
    var add = function (qs) {
      (qs || []).forEach(function (item) {
        var r = item && item.options && item.options[item.answer];
        if (r && String(r).length >= 4) rights.push(String(r));
        if (isDefinition(item) && r) defs.push(String(r));
      });
    };
    if (state.quiz && state.quiz.id === id) add(state.quiz.qs);
    var les = state.lessons[id];
    if (les) { add(les.qs); add(les.cur); add(les.rq); }
    if (!rights.length) return text;
    var quotes = function (s) { return rights.some(function (r) { return s.toLowerCase().indexOf(r.toLowerCase()) >= 0; }); };
    var echoes = function (s) { return defs.some(function (r) { return echoesOption(s, r); }); };
    var bits = String(text || "").split(/([.!?])\s+/), kept = [], cur = "";
    bits.forEach(function (p, i) {
      if (i % 2 === 0) cur = p;
      else {
        var s = (cur + p).trim();
        if (s && !quotes(s) && !echoes(s)) kept.push(s);
        cur = "";
      }
    });
    if (cur.trim() && !quotes(cur) && !echoes(cur)) kept.push(cur.trim());
    var out = kept.join(" ").trim();
    if (defs.length && (!out || echoes(out))) return "Here's an example instead: picture one ordinary situation where the idea shows up, and match the choice to what happens there.";
    return out || "Here's a hint: think about the main idea, and look for the choice that matches it.";
  }
  function clarify(id, style) {
    var les = state.lessons[id];
    if (state.lessonNode !== id || !nodeOf(id)) return;
    if (les && les.cl && les.cl[style]) { showNear(clarBox(style, les.cl[style]).box); return; }
    if (state.busy) { state.queued = function () { clarify(id, style); }; return; }
    lock(true);
    var ui = clarBox(style, ""), text = "";
    ui.body.className = "clar-body streaming";
    focusClar(style);
    var body = P.withBand(state.cloud, Object.assign(basePayload(id), { mode: "clarify", clarify: style, lesson: les ? String(les.text).slice(0, LESSON_EXCERPT) : "", messages: [] }));
    stream("/chat", body, {
      delta: function (t) { text += t; paragraphs(ui.body, text); }
    }, callSignal("clarify")).then(function (r) {
      ui.body.className = "clar-body";
      if (r.reason === "aborted") { if (ui.box.parentNode) ui.box.parentNode.removeChild(ui.box); }
      else if (text.trim()) {
        text = stripAnswers(id, withHealthNote(nodeOf(id) ? nodeOf(id).label : "", text.trim()));
        if (state.lessons[id]) { state.lessons[id].cl = state.lessons[id].cl || {}; state.lessons[id].cl[style] = text.trim(); }
        paragraphs(ui.body, text.trim());
      } else {
        /* a real failure: the only place this offers Try again */
        ui.body.textContent = "";
        ui.body.appendChild(mk("p", "l-intro", reasonLead(r.reason)));
        ui.body.appendChild(linkBtn("Try again", function () { clarify(id, style); }));
      }
      save(); lock(false);
    });
  }

  /* ---------- Where Next (in every lesson, 0 calls) ---------- */
  /*
   * Two quiet groups of equal boxes. Where next: only this lesson's own parent (continue this path, then related or
   * deeper steps). Also in progress: other branches, the place for switching context. One box is selected (the next
   * step, or the learner's own tap); its action ("Continue" for the path, "Open" otherwise) sits inside that box, so
   * the choice and the action stay together. Every box keeps the same size: the action's room is kept in each one.
   */
  function renderWhereNext() {
    var id = state.lessonNode, n = nodeOf(id);
    var oldList = el.lNext.querySelector("#wn-alt.wn-all"), keepTop = oldList ? oldList.scrollTop : 0; /* a pick in the long list keeps its place */
    el.lNext.textContent = "";
    if (!n || state.mode !== "lesson") return;
    var w = P.whereNext(state.cloud, id, nextStep(id));
    var forkIds = n.fork && n.fork.ids ? n.fork.ids : [];
    /* Also in progress: the 3 most recent by default; "more · N" shows the rest inline (in its own scrolling area), "fewer"
       folds it again. Open per lesson (state.aipMore holds the lesson's id); nothing is fetched (0 calls). */
    var more = w.allOthers.length > w.others.length, expanded = more && state.aipMore === id;
    var others = expanded ? w.allOthers : w.others;
    var items = w.choices.map(function (c) { return c.id; }).concat(others);
    var grow = !w.path && !n.end && !C.isTerminal(state.cloud, id) && (!n.path || P.needsNext(state.cloud, id));
    /* PR 103: the next paths open once the check is passed; Also in progress (switching to other work) is always here */
    if (!nextOpen(id)) { w = Object.assign({}, w, { choices: [], next: null }); grow = false; items = others.slice(); }
    if (!items.length && !grow) return;
    /* the learner's own tap wins; otherwise the computed pick (it can change, e.g. when the fork arrives) */
    var sel = items.indexOf(state.pick) >= 0 ? state.pick : w.next || items[0];
    var onPath = P.pathNext(state.cloud, id);
    var go = function (to) {
      if (!nodeOf(to)) return;
      /* a fork choice: remember it as the learner's pick (it becomes the planned next step) */
      if (forkIds.indexOf(to) >= 0) { C.pickChoice(state.cloud, id, to); save(); }
      openLesson(to);
    };
    var group = function (label, cls) {
      var g = mk("div", "wn-opts" + (cls ? " " + cls : ""));
      g.setAttribute("role", "radiogroup");
      g.setAttribute("aria-label", label);
      return g;
    };
    var box = function (list, x, kind, why) {
      var m = nodeOf(x), on = x === sel, cont = kind === "path";
      var b = mk("div", "wn-opt " + kind + (on ? " on" : ""));
      b.setAttribute("data-id", x);
      b.setAttribute("data-kind", kind);
      var pick = mk("button", "wn-pick");
      pick.type = "button";
      pick.setAttribute("role", "radio");
      pick.setAttribute("aria-checked", on ? "true" : "false");
      pick.appendChild(mk("span", "wn-label", m.label + (n.fork && n.fork.picked === x ? " · your pick" : "")));
      pick.appendChild(mk("span", "why", why));
      pick.addEventListener("click", function () { state.pick = x; renderWhereNext(); var f = el.lNext.querySelector('.wn-opt[data-id="' + x + '"] .wn-act'); if (f) f.focus(); });
      b.appendChild(pick);
      /* the action lives in the box; unselected boxes keep its room (hidden, not focusable) so every box is the same size */
      var act = mk("button", "btn sm wn-act", cont ? "Continue" : "Open");
      act.type = "button";
      act.setAttribute("aria-label", (cont ? "Continue with " : "Open ") + m.label);
      if (!on) { act.tabIndex = -1; act.setAttribute("aria-hidden", "true"); }
      act.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        /* Open always opens that topic's lesson. It does not only move the cloud. */
        go(x);
      });
      b.appendChild(act);
      list.appendChild(b);
    };
    /* honest reasons, from the cloud itself; the model's own reason only for choices in this subject */
    var join = function (a, c) { return c ? a + " · " + c : a; };
    if (w.choices.length || grow) el.lNext.appendChild(mk("p", "l-head", "Where next"));
    if (w.choices.length) {
      var main = group("Where next");
      w.choices.forEach(function (c) {
        var m = nodeOf(c.id), par = nodeOf(m.parent), why;
        if (c.kind === "path") why = join(join(c.id === onPath ? "Next on this path" : "Closest to this lesson", afterOf(c.id)), c.why);
        else why = join(m.parent === id ? "Goes deeper into " + n.label : par ? "Related · in " + par.label : "Related", c.why);
        box(main, c.id, c.kind, why);
      });
      el.lNext.appendChild(main);
    }
    if (grow) el.lNext.appendChild(mk("p", "fine")).appendChild(linkBtn("What comes next in " + n.label + "?", function () { createNext(id); }));
    if (others.length) {
      el.lNext.appendChild(mk("p", "wn-sub", "Also in progress"));
      var alt = group("Also in progress", "wn-alt" + (expanded ? " wn-all" : ""));
      alt.id = "wn-alt";
      others.forEach(function (x) {
        var m = nodeOf(x), pick = n.fork && n.fork.picked === x;
        box(alt, x, "progress", (pick && !(m.opened || m.engaged > 0 || m.correct > 0) ? "Your pick · " : "In progress · ") + trailOf(m.parent || x));
      });
      el.lNext.appendChild(alt);
      if (expanded) {
        var sb = alt.offsetWidth - alt.clientWidth; /* a scrollbar that takes room: given back on the right, so the boxes stay as wide as Where Next's */
        if (sb > 0) { alt.style.marginRight = -sb + "px"; alt.style.paddingRight = "0"; }
        if (keepTop) alt.scrollTop = keepTop;
      }
      if (more) {
        /* a quiet link: how many more there are, or fold them away again; focus stays on it */
        var tg = linkBtn(expanded ? "fewer" : "more · " + (w.allOthers.length - w.others.length), function () {
          state.aipMore = expanded ? null : id;
          renderWhereNext();
          var again = el.lNext.querySelector(".wn-more");
          if (again) again.focus();
          if (!expanded) { var list = el.lNext.querySelector("#wn-alt"); if (list) list.scrollTop = 0; }
        }, "link wn-more");
        tg.setAttribute("aria-expanded", expanded ? "true" : "false");
        tg.setAttribute("aria-controls", "wn-alt");
        tg.setAttribute("aria-label", expanded ? "Show fewer topics in progress" : "Show all " + w.allOthers.length + " topics in progress");
        el.lNext.appendChild(mk("p", "fine wn-more-row")).appendChild(tg);
      }
    }
  }
  function askInChat(id, ask) {
    var n = nodeOf(id);
    setFocus(id);
    showLesson(false);
    if (n) el.input.value = ask || "Can you help me with " + n.label + "?";
    autosize();
    el.input.focus();
    scrollDown();
  }
  /* Back from a lesson: to the card it was opened from, else home to the cloud, on that topic */
  el.lBack.addEventListener("click", function () {
    var back = state.lessonFrom, id = state.lessonNode;
    state.lessonFrom = null;
    if (back && nodeOf(back)) { showLesson(false); openHub(back, null, "deck"); return; }
    home(id);
  });
  el.lGot.addEventListener("click", function () { finishLesson("got"); ensureAhead(state.lessonNode); });
  el.lCont.addEventListener("click", startCheck);
  el.ikoGot.addEventListener("click", function () {
    if (el.lGot.disabled) return;
    closeIko();
    finishLesson("got");
    ensureAhead(state.lessonNode);
    el.lStatus.scrollIntoView({ block: "nearest" }); /* the note, clear of the sticky header (scroll-margin) */
  });
  el.lChat.addEventListener("click", function () { openIko(); });
  el.lRedo.addEventListener("click", function () { if (state.lessonNode) openLesson(state.lessonNode, true); });

  /* ---------- tests ---------- */
  /*
   * A Test for a parent: offered by the orchestrator once enough under it is completed. Built only from that completed
   * material (one call, cached until taken). Each answer colours its own topic's card; the attempt strengthens the parent.
   */
  function validTestQs(qs, labels) {
    var ok = labels.map(C.norm);
    return (Array.isArray(qs) ? qs : []).filter(function (q) {
      return validQs([q]).length && typeof q.topic === "string" && ok.indexOf(C.norm(q.topic)) >= 0;
    }).slice(0, 5);
  }
  function openTest(pid, from) {
    var p = nodeOf(pid), req = P.testRequest(state.cloud, pid);
    if (!p || !req || req.material.length < 2) return;
    cancelNav(); cancelCall("lesson"); cancelCall("clarify");
    if (!el.cloud.hidden) closeCloud(true);
    stopClock();
    state.lessonNode = pid; state.mode = "test";
    state.lessonFrom = state.pendingFrom || null; state.pendingFrom = null;
    showLesson(true);
    window.scrollTo(0, 0);
    el.lMain.classList.add("testing");
    el.lPhase.hidden = true;
    var labels = req.material.map(function (m) { return m.label; }), ids = {};
    req.ids.forEach(function (x) { var n = nodeOf(x); if (n) ids[C.norm(n.label)] = x; });
    el.lTrail.textContent = "Test · " + trailOf(pid);
    el.lTitle.textContent = "Test: " + p.label;
    el.lStatus.textContent = ""; el.lDone.hidden = true; el.lFork.textContent = ""; el.lPath.textContent = ""; el.lQuiz.textContent = ""; el.lClar.textContent = ""; el.lNext.textContent = "";
    /* the previous lesson's "Card earned" box does not sit under a subject test */
    el.lConf.hidden = true; el.lConf.textContent = ""; el.lMain.classList.remove("reread"); el.lMain.setAttribute("data-done", "");
    markLast(pid, "lesson");
    el.lQuiz.hidden = false; el.lQuiz.classList.remove("l-pane-on"); el.lMain.setAttribute("data-phase", "test");
    el.lBody.textContent = "";
    el.lBody.appendChild(mk("p", "l-intro", "This test only covers what you've finished: " + labels.join(", ") + ". It's optional and there's no timer. Right answers bring colour into those cards, and every attempt makes " + p.label + " stronger."));
    renderLessonCard(false);
    animateIn(from);
    C.markOffered(state.cloud, pid);
    var cached = state.tests[pid];
    if (cached && cached.n === labels.length && !shortSet(cached.qs) && validTestQs(cached.qs, labels).length >= 2) {
      state.test = { pid: pid, qs: validTestQs(cached.qs, labels), ans: Array.isArray(cached.ans) ? cached.ans.slice() : [], ids: ids };
      renderTest();
      return;
    }
    if (state.busy) {
      el.lQuiz.appendChild(mk("p", "fine wait", "Getting your test ready. It starts as soon as the last answer is finished."));
      state.queued = function () { if (state.lessonNode === pid && state.mode === "test") openTest(pid); };
      return;
    }
    lock(true);
    el.lQuiz.appendChild(mk("p", "fine streaming", "Writing your questions..."));
    var askTest = function (ntry) {
      return postJson("/test", P.withBand(state.cloud, Object.assign(basePayload(pid), { material: req.material }))).then(function (j) {
        var qs = j && j.ok ? validTestQs(j.questions, labels) : [];
        if (qs.length >= 2 || ntry >= 1 || (j && (j.reason === "budget" || j.reason === "busy" || j.reason === "aborted" || j.reason === "offline"))) return j;
        return askTest(ntry + 1);
      });
    };
    askTest(0).then(function (j) {
      if (state.lessonNode !== pid || state.mode !== "test") return;
      var qs = j && j.ok ? validTestQs(j.questions, labels) : [];
      if (qs.length >= 2) {
        state.tests[pid] = { qs: qs, ans: [], n: labels.length, at: Date.now() };
        state.test = { pid: pid, qs: qs, ans: [], ids: ids };
        renderTest();
      } else {
        el.lQuiz.textContent = "";
        el.lQuiz.appendChild(mk("p", "l-intro", (j && j.ok ? "I couldn't write a good test this time." : reasonLead(j && (j.reason || j.error))) + " Your test will be here when you come back."));
        el.lQuiz.appendChild(linkBtn("Try again", function () { openTest(pid); }));
      }
    }).then(function () { save(); lock(false); });
  }
  function renderTest() {
    var t = state.test;
    el.lQuiz.textContent = "";
    if (!t) return;
    var wrap = mk("section", "quiz test");
    wrap.appendChild(mk("h3", "phase-head", t.qs.length + " questions"));
    t.qs.forEach(function (item, qi) {
      var set = mk("fieldset", "q"), done = Number.isInteger(t.ans[qi]);
      var lg = L.inline(document, mk("legend"), item.q);
      lg.appendChild(mk("span", "q-topic", "On " + item.topic));
      set.appendChild(lg);
      if (typeof item.code === "string" && item.code) set.appendChild(L.codeBlock(document, item.code.slice(0, 600)));
      item.options.forEach(function (o, oi) {
        var lab = mk("label", "opt" + (done && oi === item.answer ? " right" : "") + (done && oi === t.ans[qi] && oi !== item.answer ? " wrong" : ""));
        var inp = mk("input");
        inp.type = "radio"; inp.name = "t" + qi + "-" + t.pid; inp.value = String(oi); inp.checked = done && t.ans[qi] === oi; inp.disabled = done;
        inp.addEventListener("change", function () { answerTest(qi, oi); });
        lab.appendChild(inp);
        lab.appendChild(L.inline(document, mk("span", "opt-t"), String.fromCharCode(65 + oi) + ". " + String(o)));
        set.appendChild(lab);
      });
      if (done) set.appendChild(mk("p", "q-fb", t.ans[qi] === item.answer ? "That's it." : "Not quite. It's " + String.fromCharCode(65 + item.answer) + ": " + item.options[item.answer] + "."));
      wrap.appendChild(set);
    });
    el.lQuiz.appendChild(wrap);
  }
  function answerTest(qi, oi) {
    var t = state.test;
    if (!t || state.mode !== "test" || Number.isInteger(t.ans[qi]) || !t.qs[qi]) return;
    t.ans[qi] = oi;
    if (state.tests[t.pid]) state.tests[t.pid].ans = t.ans.slice();
    renderTest();
    var fb = el.lQuiz.querySelectorAll(".q")[qi];
    if (fb) { fb.tabIndex = -1; fb.focus({ preventScroll: true }); }
    if (t.ans.filter(Number.isInteger).length < t.qs.length) { save(); return; }
    /* all answered: record it once; each answer colours its topic, the attempt strengthens the parent */
    var before = {}, results = t.qs.map(function (q, i) { return { id: t.ids[C.norm(q.topic)], right: t.ans[i] === q.answer }; }).filter(function (r) { return r.id; });
    results.concat([{ id: t.pid }]).forEach(function (r) { before[r.id] = C.growthOf(state.cloud, r.id); });
    var res = C.recordTest(state.cloud, t.pid, results);
    delete state.tests[t.pid];
    var merged = settleMerges().filter(function (m) { return m.id === t.pid; })[0]; /* a passed test can form or upgrade the parent card */
    var p = nodeOf(t.pid), brighter = Object.keys(before).filter(function (x) { var a = C.growthOf(state.cloud, x), b = before[x]; return a && b && a.stage > b.stage; });
    save();
    el.lStatus.textContent = "";
    if (res) {
      el.lStatus.appendChild(document.createTextNode("You got " + res.right + " of " + res.n + " right. " + (res.passed ? "Great work: " + p.label + " is stronger on your cloud. " : "Good try: every attempt makes " + p.label + " stronger, and you can test again once you've finished more. ")));
      if (brighter.length) el.lStatus.appendChild(document.createTextNode("Picked up colour: " + brighter.map(function (x) { return nodeOf(x).label; }).join(", ") + ". "));
      if (merged) el.lStatus.appendChild(document.createTextNode(p.label + " is now a Merged " + C.roman(merged.level) + " card. "));
    }
    el.lStatus.appendChild(linkBtn("Draw a card", function () { drawCard(null); }));
    el.lStatus.appendChild(document.createTextNode(" · "));
    el.lStatus.appendChild(linkBtn("Back to your cloud", function () { home(t.pid); }));
    renderLessonCard(true);
    refreshViews([t.pid].concat(res ? res.touched : []));
    if (res && res.passed) { ensureAhead(t.pid); renderTestNext(t.pid); }
  }
  /* After a passed test: the next path and related branches, each one opening its lesson. Not a dead end. */
  function renderTestNext(id) {
    if (state.mode !== "test" || !nodeOf(id)) return;
    el.lNext.textContent = "";
    var w = P.whereNext(state.cloud, id, nextStep(id));
    var choices = (w.choices || []).slice();
    if (!choices.length && nodeOf(id).parent) choices = (P.whereNext(state.cloud, nodeOf(id).parent, nextStep(nodeOf(id).parent)).choices || []).slice();
    if (!choices.length) {
      var sug = (P.suggest(state.cloud) || []).filter(function (it) { return it && it.id !== id && nodeOf(it.id) && it.kind !== "ask" && it.kind !== "test"; })[0];
      if (sug) choices = [{ id: sug.id, kind: "branch", why: sug.why || "" }];
    }
    var busy = aheadBusy[id] || (nodeOf(id).parent && aheadBusy[nodeOf(id).parent]);
    if (!choices.length) {
      if (busy) el.lNext.appendChild(mk("p", "fine", "Next branches are growing on your cloud."));
      return;
    }
    el.lNext.appendChild(mk("p", "l-head", "Where next"));
    var g = mk("div", "wn-opts");
    choices.forEach(function (c) {
      var m = nodeOf(c.id);
      if (!m) return;
      var b = mk("button", "btn sm", (c.kind === "path" ? "Continue " : "Open ") + m.label);
      b.type = "button";
      b.addEventListener("click", function () { openLesson(c.id); });
      g.appendChild(b);
    });
    el.lNext.appendChild(g);
  }

  /* ---------- suggestions and Draw (orchestrator.js, no calls) ---------- */
  /* a suggestion still worth offering: a card only while it's unfinished (P.unfinished, as Draw); a test and "what comes
     next" are about finished work by design. Also guards a list saved before the card was finished. */
  function offerable(it) { return it.kind === "test" || it.kind === "grow" || P.unfinished(state.cloud, it.id); }
  function refreshSuggest() { state.suggest = P.suggest(state.cloud); save(); return state.suggest; }
  /* A test as a card-shaped tile: the parent, how much is finished under it. */
  function testTile(pid, onOpen) {
    var p = nodeOf(pid), st = P.testState(state.cloud, pid), sp = D.cardSpec(state.cloud, pid);
    var b = mk("button", "gcard size-tile test-tile"); b.type = "button";
    if (sp) tint(b, { "--card-ink": sp.color.ink, "--card-wash": sp.color.wash, "--card-soft": sp.color.soft });
    b.appendChild(mk("span", "gc-chain", "Test"));
    b.appendChild(mk("span", "gc-title", p.label));
    b.appendChild(mk("span", "gc-desc", (st ? st.done.length : 0) + " topics finished. Optional."));
    b.appendChild(mk("span", "gc-mark", st && st.taken ? "Taken before" : "Ready"));
    b.setAttribute("aria-label", "Take the test on " + p.label);
    b.addEventListener("click", function (e) { e.stopPropagation(); (onOpen || openTest)(pid, b); });
    return b;
  }
  /* "What comes next" for a parent whose topics are all done (one creation call when tapped). */
  function growTile(pid) {
    var p = nodeOf(pid), sp = D.cardSpec(state.cloud, pid);
    var b = mk("button", "gcard size-tile grow-tile"); b.type = "button";
    if (sp) tint(b, { "--card-ink": sp.color.ink, "--card-wash": sp.color.wash, "--card-soft": sp.color.soft });
    b.appendChild(mk("span", "gc-chain", "What comes next"));
    b.appendChild(mk("span", "gc-title", p.label));
    b.appendChild(mk("span", "gc-desc", "You've finished its topics. Let's see what's next."));
    b.appendChild(mk("span", "gc-mark", "New branch"));
    b.addEventListener("click", function () { createNext(pid); });
    return b;
  }
  /* The light re-ask, as a quiet tile: one open question, answered in their own words, or not now. */
  function askTile(it) {
    var box = mk("div", "ask-tile");
    box.appendChild(mk("p", "gc-chain", "A quick question"));
    box.appendChild(mk("p", "ask-q", it.q));
    if (it.ex) box.appendChild(exRow(function (t) { answerReask(t); }));
    var f = mk("form", "ask-row ask-open"), inp = openField(it.q, it.ph, function () { f.requestSubmit(); });
    f.appendChild(inp);
    f.appendChild(linkBtn("Build", function () { f.requestSubmit(); }, "btn draw-btn sm"));
    f.addEventListener("submit", function (e) { e.preventDefault(); if (cleanAbout(inp.value)) answerReask(inp.value); });
    box.appendChild(f);
    box.appendChild(linkBtn("Not now", function () { C.setProfile(state.cloud, { askedAt: true }); save(); renderDraw(); }, "link fine"));
    return box;
  }
  /* The always-there next actions: suggested cards, Draw, Continue the active lesson, and the cloud. */
  function flowBlock(where) {
    var items = (state.suggest || []).filter(function (it) { return it.kind === "ask" || (nodeOf(it.id) && offerable(it)); });
    var box = mk("div", "flow-in");
    box.appendChild(mk("p", "kicker", "Pick up a card"));
    var empty = !state.cloud.order.length;
    box.appendChild(mk("p", "d-head", empty ? "Let's begin your path together, " + state.name + "." : items.length ? "Here are a few good next cards, " + state.name + ". Pick one, or draw one." : "Draw a card to start, " + state.name + ", or ask me anything below."));
    var row = mk("div", "draw-row");
    items.forEach(function (it) {
      var cell = mk("div", "sg sg-" + it.kind);
      if (it.kind === "test") cell.appendChild(testTile(it.id));
      else if (it.kind === "grow") cell.appendChild(growTile(it.id));
      else if (it.kind === "ask") cell.appendChild(askTile(it));
      else { var sp = D.cardSpec(state.cloud, it.id); if (!sp) return; cell.appendChild(D.render(document, sp, { onOpen: openCard })); }
      if (it.kind !== "ask") cell.appendChild(mk("p", "sg-why", it.why));
      row.appendChild(cell);
    });
    if (empty && state.thread.some(function (m) { return m.role === "ask" && !m.done; })) return box; /* the questions are already on screen */
    if (empty && !state.busy) { var start = linkBtn("Begin", runOnboarding, "btn draw-btn"); box.appendChild(start); return box; }
    if (where === "chat") {
      /* one tip at a time: picking cards first, then (once a card is in the deck) what cards are */
      var tip = hintEl("card", renderDraw) || ((state.cloud.deck || []).length ? hintEl("deck", renderDraw) : null);
      if (tip) box.insertBefore(tip, box.children[1] || null);
    }
    if (items.length) box.appendChild(row);
    var acts = mk("div", "flow-acts");
    var draw = mk("button", "btn draw-btn", "Draw a card"); draw.type = "button";
    draw.addEventListener("click", function () { drawCard(draw); });
    acts.appendChild(draw);
    var act = nodeOf(state.cloud.active) && !P.finished(state.cloud, state.cloud.active) ? nodeOf(state.cloud.active) : null; /* never a finished lesson as "Continue" (a subject's own lesson can be active too) */
    if (act) acts.appendChild(linkBtn("Continue " + act.label, function () { openLesson(act.id); }, "btn quiet"));
    if (where !== "cloud") acts.appendChild(linkBtn("Your cloud", openCloud, "btn quiet"));
    box.appendChild(acts);
    return box;
  }
  /* Draw: one card into the holder, and its lesson opens right away. */
  /* Never a finished card (P.draw): the current path's next unfinished step first, else the deck, else something new.
     When everything is finished, the cloud offers a new topic or direction instead of re-opening finished work. */
  function drawCard(src) {
    if (state.busy) return;
    var id = P.draw(state.cloud, { skip: state.lessonNode, from: state.lessonNode || state.panelNode || null });
    dismissHint("card");
    save();
    if (!id) { allDone(); return; }
    state.allDone = false;
    openCard(id, src || null);
  }
  function allDone() {
    state.allDone = true;
    if (el.cloud.hidden || state.lessonNode || !el.deck.hidden || !el.hub.hidden) home(); else if (!el.panel.hidden) closeCard();
    renderCloudFlow();
    var a = cloudFlow && cloudFlow.querySelector(".dir-done .dir-ask");
    if (a) a.focus();
  }

  /* ---------- cloud overlay + panel ---------- */
  /*
   * Home: the cloud is the main view. Lessons, the deck, a card's hub and the chat with Iko open from it, and their
   * Back / close returns here. The cloud stays clear: a topic card is not opened over the middle.
   */
  function home(id) {
    if (state.lessonNode) showLesson(false);
    if (state.zoomId) { state.zoomId = null; if (el.zoomList) el.zoomList.hidden = true; if (big) big.recentre(); }
    el.deck.hidden = true; el.hub.hidden = true; state.hubNode = null; el.thread.hidden = false; el.dock.hidden = false;
    renderRet();
    openPanel.keep = true;
    openPanel.keep = false; /* a return does not open a topic card over the cloud */
    if (!el.panel.hidden) closeCard();
    openCloud();
    if (id && nodeOf(id) && el.topicNav && !el.topicNav.hidden) { el.topicNav.hidden = true; if (el.topicBtn) el.topicBtn.setAttribute("aria-expanded", "false"); }
  }
  /* landing: the first view after the name, or a returning visit (no focus moves, so no keyboard pops up on phones) */
  function openCloud(landing) {
    el.cloud.hidden = false; if (window.IkoSound) IkoSound.ambient(true);
    var fresh = !big;
    if (!big) big = V.create(el.cloudCanvas, { onPick: pick, onView: saveView, onDraw: placeCard, onEmpty: closeCard, onGesture: moved });
    big.resize();
    big.setCloud(state.cloud);
    /* every load (a visit, a learner switched in, a cloud opened from a file, after Start over) begins at home: the name in
       its home place in the middle, the whole cloud around it. The camera is still kept (ikolearn.v1.view) as it moves. */
    if (fresh) big.reset();
    big.setTests(testMap());
    renderCloudHint();
    big.spin(true); /* a slow idle turn on every view of the cloud; it goes on through drags and pans, a click pauses it a few seconds (not with reduced motion; paused while the tab is hidden or the cloud is closed) */
    if (state.glide && nodeOf(state.glide)) { var gl = state.glide; state.glide = null; setTimeout(function () { revealNode(gl); }, 0); } /* a new parent: the camera glides to it, its card opens */
    renderCloudFlow();
    ensureTopicList();
    ensureSettings();
    renderHomeNav();
    renderRet();
    renderIko();
    if (landing !== true && !el.ikoWrap.hidden) el.iko.focus();
  }
  /* Support & feedback opens the contact form with the subject filled in. The name stays on this device. */
  function feedbackHref() {
    return "https://ikosagon.com/contact?subject=IkoLearn%20Feedback";
  }
  function renderFeedback() { [].forEach.call(document.querySelectorAll("a.fb-link"), function (a) { a.href = feedbackHref(); }); }
  /* the cloud's own quiet links: Talk to Iko, the deck (once there is a card), and the learner switch when guiding */
  function renderHomeNav() {
    renderFeedback();
    var n = (state.cloud && state.cloud.deck || []).length;
    el.cloudDeck.hidden = !n;
    if (n) deckFan(el.cloudDeck, miniDeckCards(), n); /* the Deck's own icon and count, as in the header (PR 103) */
    var ix = PR && PR.current(localStorage);
    el.cloudWho.hidden = !(ix && ix.mode === "guide");
    if (!el.cloudWho.hidden) { el.cloudWho.textContent = state.name + " · switch"; el.cloudWho.setAttribute("aria-label", state.name + " is learning now. Switch learner"); }
  }
  /*
   * A brand-new cloud (no subjects yet): the name in the centre and, under it, one quiet way to begin: a line in the
   * learner's own words (the same open question as the chat's first one; no topic list, no age), or a talk with Iko.
   * Begin answers that question (skipping the optional follow-up) and the cloud grows here, as the start call streams.
   */
  function renderStart() {
    if (!el.cs) return;
    /* The cloud is the start. The old question column stays in the page for older markup, and is never shown. */
    el.cs.hidden = true;
    intakeMode(!el.cs.hidden);
    renderStartLayer();
    renderYouHint();
    if (el.cs.hidden) return;
    var empty = Boolean(state.cloud) && !C.subjects(state.cloud).length;
    var wasStart = !el.cs.hidden;
    el.cs.hidden = !empty || el.cloud.hidden;
    if (wasStart && el.cs.hidden && big && big.rearm) { big.rearm(); setTimeout(function () { if (big) big.rearm(); }, 450); } /* PR 113: taps work right after intake */
    if (el.cloudHint) el.cloudHint.hidden = empty; /* nothing to drag yet: no input tips over the start */
    intakeMode(!el.cs.hidden);
    if (el.cs.hidden) return;
    el.csName.textContent = (state.cloud && state.cloud.name) || state.name || "";
    var building = state.busy, last = state.thread.filter(function (m) { return m.role === "model"; }).pop(), failed = !building && last && last.retry && last.retry.kind === "start";
    /* one calm step: a short hello, the one question, the field and Begin; a few light ideas (from the API, cycling with More) */
    el.csHi.textContent = building ? "" : "Hi " + state.name + ". Let's begin your learning cloud together.";
    /* PR 108: before the first question, Iko asks the optional age range in the same place (band chips and Skip), once */
    var ageStep = false; /* PR 114: no age step */
    el.csQ.textContent = ageStep ? "First, if you like: how old are you? It only changes how lessons are written." : CS_Q;
    el.csQ.hidden = building;
    el.csFew.hidden = building || ageStep;
    el.csForm.hidden = building || ageStep;
    el.csEx.hidden = ageStep;
    el.csAges.hidden = !ageStep;
    el.cs.classList.toggle("band-step", ageStep); /* PR 109: calmer and centred on a desktop (styles.css) */
    if (ageStep && !el.csAges.firstChild) {
      var row = bandRow(function (b) { setBand(b); ageDone(); });
      var skip = linkBtn("Skip", ageDone, "link cs-age-skip"); skip.id = "cs-age-skip";
      row.appendChild(skip);
      el.csAges.appendChild(row);
    }
    if (!ageStep) el.csAges.textContent = "";
    /* the ideas can be picked together; Begin sends them with whatever was typed, as one answer (the same one start call) */
    if (!csEx) { csEx = exRow(addIdea, function () { return !el.cs.hidden && !state.busy; }, "", true, true); el.csEx.appendChild(csEx); }
    else refreshEx();
    renderAgeBits();
    el.csStatus.textContent = building ? "Growing your cloud…" : failed ? "Iko is still writing this one. Try again in a moment, or talk it over with Iko." : "";
    el.cs.classList.toggle("busy", building);
    placeStart();
    placeIkoSoon();
  }
  var csEx = null, CS_Q = el.csQ.textContent;
  function ageDone() {
    dismissHint("ageAsked");
    intakeAt = null; need0 = 1; /* the column is placed afresh for the question (the age step was shorter); its ideas are already in, so no extra room is kept for them */
    renderStart(); /* no focus jump into the field (as when the opening first shows) */
  }
  /*
   * The opening question (#100, reworked in #101 after QA on an iPhone in WhatsApp's in-app browser). A still column in
   * the room between Iko and the fine print, a little above the middle, its name on a plate above the question that can be
   * dragged (within the free space above the greeting, so it never covers Iko, the text or the ideas). Nothing in it ever
   * clips: no scroll box, no fixed height. With the keyboard up (visualViewport, compared with the tallest view seen at
   * this width, since an in-app web view shrinks the page itself rather than overlaying it), the field sits just above the
   * keyboard with the question in view; the name, the fine print and, on a short screen, the greeting step aside. The
   * column's place is worked out afresh each time (nothing about a keyboard or a scrolled view is kept), and it only
   * stays put while that is within a small step of the fresh place, so it never jumps when the hello folds or the
   * ideas change.
   */
  var intakeOn = false, intakeAt = null, need0 = 0, tallest = { w: 0, h: 0 }, nameOff = { x: 0, y: 0 }, nameShown = { x: 0, y: 0 }, nameDrag = null;
  function intakeMode(on) {
    on = Boolean(on);
    document.body.classList.toggle("intake", on);
    if (big && big.rootHidden) big.rootHidden(on);
    if (big && on !== intakeOn) big.hold(on);
    var was = intakeOn;
    intakeOn = on;
    if (on !== was) rotatePh();
    if (on !== was && iko) renderIko(); /* Iko moves into the question's column, or back to the header */
    if (!on) { intakeAt = null; need0 = 0; nameOff = { x: 0, y: 0 }; nameShown = { x: 0, y: 0 }; el.csName.style.transform = ""; document.body.classList.remove("kbd"); el.cs.classList.remove("tight"); el.cs.style.top = ""; }
  }
  function placeStart() {
    if (!big || el.cs.hidden) return;
    var vv = window.visualViewport, vh = vv ? vv.height : window.innerHeight, vt = vv ? Math.max(0, vv.offsetTop) : 0;
    var typing = document.activeElement === el.csIn;
    if (tallest.w !== window.innerWidth) tallest = { w: window.innerWidth, h: 0 };
    if (!typing || !tallest.h) tallest.h = Math.max(tallest.h, vh, window.innerHeight);
    var kbd = typing && tallest.h - vh > 120; /* the on-screen keyboard is up (it overlays the page, or shrinks it) */
    document.body.classList.toggle("kbd", kbd);
    el.cs.classList.remove("tight");
    var at;
    if (kbd) {
      /* the field just above the keyboard; the question above it, in view (Iko steps away while the keyboard is up) */
      var low = vt + vh - 10, minTop = vt + 8;
      var lift = function () { var q = el.csHi.textContent && !el.csHi.hidden && el.csHi.offsetHeight ? el.csHi : el.csQ, c0 = el.cs.getBoundingClientRect().top; return { form: el.csForm.offsetTop + el.csForm.offsetHeight, q: Math.min(q.getBoundingClientRect().top, el.cs.querySelector(".cs-ask").getBoundingClientRect().top) - c0 }; };
      var L = lift();
      at = low - L.form;
      if (at + L.q < minTop) { el.cs.classList.add("tight"); L = lift(); at = low - L.form; }
      if (at + L.q < minTop) at = minTop - L.q;
    } else {
      var foot = el.cloud.querySelector(".cloud-foot"), fr = foot && foot.getClientRects().length ? foot.getBoundingClientRect() : null;
      /* the fine print's visible top (its links and the sun/moon icon), not its line box: the toggle's 44px target reaches
         above and below its line, and the line sits clear of Iko's room (PR 103), so measuring the box would push the name off centre */
      if (fr) { var ink = [].map.call(foot.querySelectorAll("a, .theme-tg svg"), function (x) { return x.getBoundingClientRect().top; }).filter(function (t) { return t > 0; }); if (ink.length) fr = { top: Math.min.apply(null, ink) }; }
      var top = vt + 12, bottom = Math.min(fr ? fr.top - 10 : Infinity, vt + vh - 10);
      var need = el.cs.offsetHeight;
      if (need > bottom - top) { el.cs.classList.add("tight"); need = el.cs.offsetHeight; }
      /* the name at the middle of the screen, as it is on the cloud; as near it as the column fits between Iko and the footer */
      var nameMid = el.csName.offsetParent !== null ? el.csName.offsetTop + el.csName.offsetHeight / 2 : 0;
      /* room kept below for one more row of ideas (More), so it needn't rise; the same answer however often it's asked */
      if (!need0) need0 = need;
      var keep = Math.min(bottom - top, Math.max(need, need0 + 56));
      var fresh = need <= bottom - top ? Math.min(Math.max(vt + vh / 2 - nameMid, top), bottom - keep) : top;
      /* still while only the column changes (the hello folds, the ideas arrive) and it still fits; fresh when the screen changes
         (a turn, the keyboard gone with the page panned): never left low after the keyboard */
      var key = Math.round(vt) + "/" + Math.round(vh) + "/" + window.innerWidth;
      at = intakeAt && intakeAt.key === key && intakeAt.at >= top ? Math.max(top, Math.min(intakeAt.at, bottom - need)) : fresh; /* when it grows past the room, it rises only as far as it must */
      intakeAt = { key: key, at: at };
    }
    el.cs.style.top = Math.round(at) + "px";
    clampName();
  }
  /* the name's plate can be dragged, like the name on the cloud: anywhere across, and up into the free space under Iko;
     never over Iko, the greeting, the question or the ideas */
  function clampName() {
    if (!intakeOn || el.csName.offsetParent === null) return;
    var r = el.csName.getBoundingClientRect(), bx = r.left - nameShown.x, by = r.top - nameShown.y, /* where it sits undragged */ w = r.width, h = r.height;
    var first = [el.csHi, el.csQ].filter(function (x) { return x.textContent && !x.hidden && x.offsetHeight; })[0];
    var vv = window.visualViewport, vt = vv ? Math.max(0, vv.offsetTop) : 0;
    var minY = vt + 8, maxY = first ? first.getBoundingClientRect().top - 6 - h : by;
    nameOff.x = Math.min(Math.max(nameOff.x, 8 - bx), window.innerWidth - 8 - w - bx);
    nameOff.y = Math.min(Math.max(nameOff.y, Math.min(0, minY - by)), Math.max(0, maxY - by));
    nameShown = { x: Math.round(nameOff.x), y: Math.round(nameOff.y) };
    el.csName.style.transform = nameOff.x || nameOff.y ? "translate(" + Math.round(nameOff.x) + "px, " + Math.round(nameOff.y) + "px)" : "";
  }
  el.csName.addEventListener("pointerdown", function (e) {
    if (!intakeOn || (e.pointerType === "mouse" && e.button !== 0)) return;
    nameDrag = { id: e.pointerId, x: e.clientX - nameOff.x, y: e.clientY - nameOff.y };
    try { el.csName.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    el.csName.classList.add("dragging");
    e.preventDefault();
  });
  el.csName.addEventListener("pointermove", function (e) {
    if (!nameDrag || e.pointerId !== nameDrag.id) return;
    nameOff = { x: e.clientX - nameDrag.x, y: e.clientY - nameDrag.y };
    clampName();
  });
  var nameUp = function (e) { if (!nameDrag || e.pointerId !== nameDrag.id) return; nameDrag = null; el.csName.classList.remove("dragging"); };
  el.csName.addEventListener("pointerup", nameUp);
  el.csName.addEventListener("pointercancel", nameUp);
  window.addEventListener("resize", function () { placeStart(); if (startLayerOpen()) { liftYou(); placeStartLayer(); } });
  if (window.visualViewport) { window.visualViewport.addEventListener("resize", function () { placeStart(); placeStartLayer(); }); window.visualViewport.addEventListener("scroll", function () { placeStart(); placeStartLayer(); }); }
  el.csIn.addEventListener("focus", function () { setTimeout(placeStart, 60); setTimeout(placeStart, 400); });
  el.csIn.addEventListener("blur", function () { setTimeout(placeStart, 60); setTimeout(placeStart, 400); });
  if (window.ResizeObserver && el.cs) new ResizeObserver(function () { placeStart(); }).observe(el.cs); /* the ideas arrive after it is placed */
  function startFromCloud(t) {
    var text = cleanAbout(t);
    if (!text || state.busy) return;
    var open = state.thread.filter(function (m) { return m.role === "ask" && !m.done && m.open && askHandlers[m.id]; })[0];
    el.csIn.value = "";
    if (open) askHandlers[open.id](text, t);
    else send(t);
    renderStart();
  }
  /* one intake: the typed words first, then the picked ideas ("the ocean, Rain, Stars") */
  /* PR 113: several interests at once ("octopuses, music, and how volcanoes work"): split on commas and "and", trimmed, de-duplicated, up to 5 */
  function splitInterests(text) {
    var out = [];
    String(text || "").split(/\s*(?:,|;|\/|\band\b|&|\+)\s*/i).forEach(function (x) {
      x = x.replace(/^(i like|i love|i enjoy|about|also)\s+/i, "").replace(/[.!?]+$/, "").trim().slice(0, 40);
      if (x.length >= 2 && !out.some(function (y) { return y.toLowerCase() === x.toLowerCase(); })) out.push(x);
    });
    return out.length > 1 ? out.slice(0, 5) : [];
  }
  function intakeText() { return cleanAbout(el.csIn.value.replace(/[,\s]+$/, "")); }
  /* an idea chip tapped (PR 103): it goes into the field, in the learner's own list, and the chip moves on to another idea */
  function addIdea(t) {
    var v = el.csIn.value.replace(/[,\s]+$/, "");
    if (v.toLowerCase().split(/\s*,\s*/).indexOf(String(t).toLowerCase()) >= 0) return;
    el.csIn.value = (v ? v + ", " : "") + t;
    rotatePh();
  }
  /* the field's placeholder: a few of the ideas, rotating ("fishing, statistics, anime"), until something is typed */
  var phAt = 0, phT = 0;
  function rotatePh() {
    clearInterval(phT); phT = 0;
    if (!intakeOn || el.cs.hidden) return;
    var list = state.ex.status === "ok" ? state.ex.list : [], step = function () {
      if (!list.length) { el.csIn.placeholder = "In your own words"; return; }
      var g = [];
      for (var i = 0; i < 3 && g.length < list.length; i++) { var t = list[(phAt + i) % list.length].toLowerCase(); if ((g.concat([t]).join(", ")).length > 34 && g.length >= 2) break; g.push(t); }
      phAt = (phAt + g.length) % list.length;
      el.csIn.placeholder = g.join(", ");
    };
    step();
    if (list.length > 3) phT = setInterval(step, 3800);
  }
  el.csForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = intakeText();
    if (!t || state.busy) return;
    startFromCloud(t);
  });
  /*
   * A thin first moment on the cloud (not a page, and not the old question column). Iko greets, asks for a first name
   * (or to keep "You") and one to three interests, in the same step. Skip leaves the cloud as it is. A name updates the
   * centre at once. Interests are shown as pending nodes, then go through the usual creation call (placement and
   * near-duplicates included). The layer stays away once there is a name, a subject, or it has been dismissed.
   */
  var slAt = 0, slTimer = 0, startPending = [], startAsked = [], startTry = 0;
  function startLayerOpen() { return Boolean(el.start && !el.start.hidden); }
  function startLearnerKey() {
    var ix = PR && PR.current(localStorage);
    return "ikolearn.v1.start:" + ((ix && ix.active) || "me");
  }
  function startDismissed() { try { return localStorage.getItem(startLearnerKey()) === "1"; } catch (e) { return false; } }
  function wantsStartLayer() {
    var c = state.cloud;
    if (!c || !el.start || el.cloud.hidden) return false;
    if (startDismissed()) return false;
    if (c.named || c.name !== "You") return false;
    if (C.subjects(c).length) return false;
    return true;
  }
  function splitStart(text) {
    var out = [];
    String(text || "").split(/\s*(?:,|;|\/|\band\b|&|\+)\s*/i).forEach(function (x) {
      x = x.replace(/^(i like|i love|i enjoy|about|also)\s+/i, "").replace(/[.!?]+$/, "").trim().slice(0, 40);
      if (x.length >= 2 && !out.some(function (y) { return y.toLowerCase() === x.toLowerCase(); })) out.push(x);
    });
    if (!out.length) {
      var one = cleanAbout(text).replace(/[.!?]+$/, "").trim().slice(0, 40);
      if (one.length >= 2) out.push(one);
    }
    return out;
  }
  function startInterests(text) { return splitStart(text).slice(0, 3); }
  function startIdeas() {
    var list = state.ex.status === "ok" ? state.ex.list : [];
    var have = startInterests(el.slIn ? el.slIn.value : "");
    return P.mixStarters(state.cloud, list, coarseArea()).filter(function (t) {
      return !have.some(function (x) { return x.toLowerCase() === String(t).toLowerCase(); });
    });
  }
  function paintChips() {
    var box = el.slEx;
    if (!box) return;
    var list = startIdeas();
    box.textContent = "";
    if (!list.length) return;
    var n = Math.min(3, list.length);
    for (var i = 0; i < n; i++) {
      (function (t) {
        var b = linkBtn(t, function () { addStartIdea(t); }, "btn ex-chip");
        b.setAttribute("aria-label", "Add " + t);
        box.appendChild(b);
      })(list[(slAt + i) % list.length]);
    }
  }
  function cycleChips() {
    clearInterval(slTimer); slTimer = 0;
    if (!startLayerOpen()) return;
    if (state.ex.status === "idle") { state.ex.status = "wait"; setTimeout(loadExamples, 0); }
    paintChips();
    slTimer = setInterval(function () {
      if (!startLayerOpen()) { clearInterval(slTimer); slTimer = 0; return; }
      if (el.slEx && el.slEx.contains(document.activeElement)) return;
      var list = startIdeas();
      if (list.length <= 3) return;
      var step = function () { slAt = (slAt + 1) % list.length; paintChips(); };
      if (reduceMotion && reduceMotion.matches) { step(); return; }
      el.slEx.classList.add("sl-dim");
      setTimeout(function () { if (!startLayerOpen()) return; step(); if (el.slEx) el.slEx.classList.remove("sl-dim"); }, 220);
    }, 4200);
  }
  function stopChips() { clearInterval(slTimer); slTimer = 0; if (el.slEx) el.slEx.classList.remove("sl-dim"); }
  function addStartIdea(t) {
    if (!el.slIn) return;
    var cur = startInterests(el.slIn.value);
    if (cur.some(function (x) { return x.toLowerCase() === String(t).toLowerCase(); })) return;
    if (cur.length >= 3) { if (el.slStatus) el.slStatus.textContent = "Three is a good start. You can add more any time."; return; }
    var v = el.slIn.value.replace(/[,\s]+$/, "");
    el.slIn.value = (v ? v + ", " : "") + t;
    if (el.slStatus) el.slStatus.textContent = "";
    paintChips();
  }
  function liftYou() {
    if (!big || !startLayerOpen()) return;
    var ch = el.cloudCanvas.clientHeight, cw = el.cloudCanvas.clientWidth, card = el.start.offsetHeight || 280;
    var cy = Math.max(108, Math.round((ch - card) * 0.42));
    big.focusNode("root", { cx: Math.round(cw / 2), cy: cy, aw: Math.round(Math.max(160, cw * 0.62)), ah: Math.max(120, ch - card - 72), keepYaw: true });
  }
  function placeStartLayer() {
    if (!el.start || !startLayerOpen()) { if (el.start) el.start.style.bottom = ""; if (el.start) el.start.style.maxHeight = ""; return; }
    var vv = window.visualViewport;
    if (!vv) { el.start.style.bottom = ""; el.start.style.maxHeight = ""; return; }
    var below = Math.max(0, window.innerHeight - (vv.offsetTop + vv.height));
    var kbd = below > 80;
    var base = window.innerWidth < 430 ? 80 : 56;
    el.start.style.bottom = (kbd ? below + 8 : base) + "px";
    /* leave the centre node in view; on a phone the actions stay inside this height */
    var room = Math.max(240, vv.height - (kbd ? 20 : 176));
    el.start.style.maxHeight = Math.max(220, Math.min(room, 560)) + "px";
  }
  function closeStart(opts) {
    opts = opts || {};
    try { localStorage.setItem(startLearnerKey(), "1"); } catch (e) { /* the cloud is still usable this visit */ }
    if (el.start) { el.start.hidden = true; el.start.style.bottom = ""; el.start.style.maxHeight = ""; }
    document.body.classList.remove("start-open");
    stopChips();
    if (big && big.recentre) big.recentre();
    renderYouHint();
    if (!opts.quiet && !state.busy) { iko.tipKey = ""; ikoTip(screenCtx()); }
  }
  function renderStartLayer() {
    if (!el.start) return;
    var show = wantsStartLayer();
    var was = startLayerOpen();
    el.start.hidden = !show;
    document.body.classList.toggle("start-open", show);
    if (show && !was) {
      if (el.slKeep) { el.slKeep.setAttribute("aria-pressed", "false"); el.slKeep.classList.remove("on"); }
      if (el.slName) el.slName.disabled = false;
      if (el.slStatus) el.slStatus.textContent = "";
      cycleChips();
      requestAnimationFrame(function () {
        liftYou();
        placeStartLayer();
        if (startLayerOpen() && !coarse() && el.slName) { try { el.slName.focus({ preventScroll: true }); } catch (e) { el.slName.focus(); } }
      });
    }
    if (!show) stopChips();
    renderYouHint();
  }
  function plantPending(labels) {
    startAsked = labels.slice();
    startPending = [];
    labels.forEach(function (label) {
      var plan = P.placeTopic(state.cloud, { name: label, signal: "curious", placement: "parent", target: "" }, null);
      if (plan && plan.how === "reuse") return;
      if (C.findClose(state.cloud, label)) return;
      var r = C.applyTopics(state.cloud, [{ name: label, signal: "curious", asSubject: true }]);
      var id = (r.parentsCreated && r.parentsCreated[0]) || (r.created && r.created[0]);
      var n = id && nodeOf(id);
      if (!n) return;
      n.ghost = true;
      n.awaiting = 1;
      startPending.push({ id: n.id, label: label });
    });
    save();
    if (big) big.setCloud(state.cloud);
    if (mini) mini.setCloud(state.cloud);
  }
  function onStartSettled(ok) {
    if (!startAsked.length && !startPending.length) return;
    var asked = startAsked.slice(), pending = startPending.slice();
    startPending = [];
    startAsked = [];
    pending.forEach(function (p) {
      var n = nodeOf(p.id);
      if (!n) return;
      if (n.ghost && n.awaiting) dropGhost(n.id);
      else n.awaiting = 0;
    });
    if (big) big.setCloud(state.cloud);
    if (mini) mini.setCloud(state.cloud);
    save();
    renderYouHint();
    if (ok) { startTry = 0; return; }
    if (startTry < 1) {
      startTry += 1;
      plantPending(asked);
      buildCloud("start", asked, asked.join(", "));
      return;
    }
    startTry = 0;
    ikoLine(asked.map(function (l) { return P.addLine(l, "failed", ""); }).join(" "));
  }
  function submitStart(e) {
    if (e) e.preventDefault();
    if (!el.slIn || state.busy) return;
    var keep = el.slKeep && el.slKeep.getAttribute("aria-pressed") === "true";
    var name = keep ? "" : cleanPerson(el.slName.value);
    var all = splitStart(el.slIn.value), interests = all.slice(0, 3), extra = all.slice(3);
    if (!name && !keep && !interests.length) {
      if (el.slStatus) el.slStatus.textContent = "Add a first name, an interest, or skip for now.";
      if (el.slName) el.slName.focus();
      return;
    }
    if (name) renameLearner(name);
    if (extra.length && state.cloud) C.setLater(state.cloud, extra);
    closeStart({ quiet: interests.length > 0 });
    if (!interests.length) return;
    plantPending(interests);
    buildCloud("start", interests, interests.join(", "));
  }
  if (el.slForm) el.slForm.addEventListener("submit", submitStart);
  if (el.slSkip) el.slSkip.addEventListener("click", function () { closeStart(); });
  if (el.slKeep) el.slKeep.addEventListener("click", function () {
    var on = el.slKeep.getAttribute("aria-pressed") !== "true";
    el.slKeep.setAttribute("aria-pressed", on ? "true" : "false");
    el.slKeep.classList.toggle("on", on);
    if (el.slName) { el.slName.disabled = on; if (on) el.slName.value = ""; else el.slName.focus(); }
  });
  if (el.slName) el.slName.addEventListener("input", function () {
    if (el.slName.value.trim() && el.slKeep) { el.slKeep.setAttribute("aria-pressed", "false"); el.slKeep.classList.remove("on"); el.slName.disabled = false; }
  });
  if (el.slIn) el.slIn.addEventListener("input", function () { if (el.slStatus) el.slStatus.textContent = ""; paintChips(); });
  if (el.start) el.start.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    closeStart();
  });
  if (el.nameEdit) el.nameEdit.addEventListener("submit", function (e) {
    e.preventDefault();
    if (renameLearner(el.nameEditIn.value)) { el.nameEdit.hidden = true; el.nameEditIn.blur(); }
  });
  if (el.addSub) el.addSub.addEventListener("submit", function (e) {
    e.preventDefault();
    submitAdd(el.addIn.value);
  });
  el.cloudDeck.addEventListener("click", function () { closeCloud(true); showDeck(true); });
  /* Back on the cloud: a slim row of the suggested cards and Draw along the bottom (hidden while a panel is open). */
  var cloudFlow = null;
  function closeTopicList() {
    if (!el.topicNav) return;
    el.topicNav.hidden = true;
    if (el.topicBtn) el.topicBtn.setAttribute("aria-expanded", "false");
  }
  /* Search, sort and the completed filter. The caret stays put while the field is being typed in. */
  function listTools(prefix, st, redraw) {
    var bar = mk("div", "list-tools");
    var typing = document.activeElement && document.activeElement.id === prefix + "-q";
    var caret = typing ? document.activeElement.selectionStart : 0;
    var s = mk("input", "list-q");
    s.type = "search"; s.id = prefix + "-q"; s.placeholder = "Search"; s.setAttribute("aria-label", "Search topics"); s.value = st.q || "";
    s.addEventListener("input", function () { st.q = s.value; st.page = 0; redraw(); });
    var sort = mk("select", "list-sort");
    sort.id = prefix + "-sort"; sort.setAttribute("aria-label", "Sort topics");
    [["recent", "Recent"], ["alpha", "Alphabetical"], ["progress", "Progress"]].forEach(function (x) {
      var o = document.createElement("option"); o.value = x[0]; o.textContent = x[1]; if ((st.sort || "recent") === x[0]) o.selected = true; sort.appendChild(o);
    });
    sort.addEventListener("change", function () { st.sort = sort.value; st.page = 0; redraw(); });
    var filt = mk("select", "list-filt");
    filt.id = prefix + "-filt"; filt.setAttribute("aria-label", "Completed filter");
    [["", "All"], ["open", "In progress"], ["done", "Finished"]].forEach(function (x) {
      var o = document.createElement("option"); o.value = x[0]; o.textContent = x[1]; if ((st.done || "") === x[0]) o.selected = true; filt.appendChild(o);
    });
    filt.addEventListener("change", function () { st.done = filt.value; st.page = 0; redraw(); });
    bar.appendChild(s); bar.appendChild(sort); bar.appendChild(filt);
    bar.restore = function () { if (!typing) return; var inp = document.getElementById(prefix + "-q"); if (inp) { inp.focus(); try { inp.setSelectionRange(caret, caret); } catch (e) { /* old browsers */ } } };
    return bar;
  }
  function topicQuery(parentId, st, all) {
    var res = P.listTopics(state.cloud, parentId, { q: st.q, sort: st.sort || "recent", done: st.done || "", page: st.page || 0, size: 20, all: all });
    st.page = res.page;
    return res;
  }
  function listEmpty(st, res) {
    return mk("p", "fine list-empty", (st.q || st.done) && !res.total ? "No matches." : "No topics yet.");
  }
  function listPager(st, res, redraw) {
    if (res.pages < 2) return null;
    var row = mk("div", "list-pager");
    var prev = mk("button", "btn sm", "Previous"); prev.type = "button"; prev.disabled = res.page < 1;
    prev.addEventListener("click", function () { st.page = Math.max(0, res.page - 1); redraw(); });
    var next = mk("button", "btn sm", "More"); next.type = "button"; next.disabled = res.page >= res.pages - 1;
    next.addEventListener("click", function () { st.page = res.page + 1; redraw(); });
    row.appendChild(prev); row.appendChild(mk("span", "fine", (res.page + 1) + " of " + res.pages)); row.appendChild(next);
    return row;
  }
  function topicJump(n) {
    var b = mk("button", "topic-open", "Open");
    b.type = "button";
    b.setAttribute("aria-label", "Open the lesson on " + n.label);
    b.addEventListener("click", function () {
      closeTopicList();
      openLesson(n.id);
      if (el.lTitle) { el.lTitle.tabIndex = -1; try { el.lTitle.focus(); } catch (e) { /* old browsers */ } }
    });
    return b;
  }
  function fillTopicList() {
    if (!el.topicNav) return;
    var st = { q: state.topicQ, sort: state.topicSort, done: state.topicDone, page: state.topicPage };
    el.topicNav.textContent = "";
    var tools = listTools("topic", st, function () { state.topicQ = st.q; state.topicSort = st.sort; state.topicDone = st.done; state.topicPage = st.page; fillTopicList(); });
    el.topicNav.appendChild(tools);
    var res = topicQuery(null, st, true);
    state.topicPage = st.page;
    if (!res.total) el.topicNav.appendChild(listEmpty(st, res));
    else {
      var ul = mk("ul");
      res.items.forEach(function (n, i) {
        var li = mk("li", "topic-row");
        var name = mk("button", "topic-jump-item", n.label);
        name.type = "button"; name.tabIndex = i === 0 ? 0 : -1;
        name.addEventListener("click", function () { closeTopicList(); enterZoom(n.id); });
        li.appendChild(name); li.appendChild(topicJump(n)); ul.appendChild(li);
      });
      el.topicNav.appendChild(ul);
      var pager = listPager(st, res, function () { state.topicPage = st.page; fillTopicList(); });
      if (pager) el.topicNav.appendChild(pager);
    }
    tools.restore();
  }
  /* A keyboard list of the same topics as the canvas, with search, sort and a completed filter. Choosing a name focuses it; Open starts its lesson. */
  function ensureTopicList() {
    var host = el.cloud && el.cloud.querySelector(".top-r");
    if (!host || !state.cloud) return;
    if (!el.topicBtn) {
      el.topicBtn = mk("button", "btn sm topic-jump", "Topics");
      el.topicBtn.type = "button";
      el.topicBtn.id = "topic-jump";
      el.topicBtn.setAttribute("aria-expanded", "false");
      el.topicBtn.setAttribute("aria-controls", "topic-list");
      el.topicBtn.setAttribute("aria-label", "Topics, a list you can open from the keyboard");
      el.topicNav = mk("nav", "topic-list");
      el.topicNav.id = "topic-list";
      el.topicNav.hidden = true;
      el.topicNav.setAttribute("aria-label", "Topics");
      el.topicBtn.addEventListener("click", function () {
        var open = el.topicNav.hidden;
        el.topicNav.hidden = !open;
        el.topicBtn.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) { fillTopicList(); var b = el.topicNav.querySelector("button"); if (b) b.focus(); }
      });
      el.topicNav.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { e.stopPropagation(); closeTopicList(); el.topicBtn.focus(); return; }
        var items = [].slice.call(el.topicNav.querySelectorAll(".topic-jump-item"));
        if (!items.length || (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter")) return;
        var field = document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "SELECT");
        if (field && e.key !== "ArrowDown") return;
        e.preventDefault();
        if (e.key === "Enter") { if (document.activeElement && document.activeElement.click) document.activeElement.click(); return; }
        var i = Math.max(0, items.indexOf(document.activeElement));
        var n = items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length];
        if (field) n = items[0];
        if (n) n.focus();
      });
      host.insertBefore(el.topicBtn, host.firstChild);
      el.cloud.appendChild(el.topicNav);
    }
    var has = Boolean(C.subjects(state.cloud).length) && !el.cloud.hidden;
    el.topicBtn.hidden = !has;
    if (!has) closeTopicList();
    else if (!el.topicNav.hidden) fillTopicList();
  }
  function renderCloudFlow() {
    if (!cloudFlow) {
      cloudFlow = mk("div", "cloud-flow"); el.cloud.appendChild(cloudFlow);
      /* the zoom controls sit just above whatever the Pick up row holds (a note can wrap to a few lines) */
      if (window.ResizeObserver) new ResizeObserver(function () { el.cloud.style.setProperty("--flow-h", (cloudFlow.hidden ? 0 : cloudFlow.offsetHeight) + "px"); }).observe(cloudFlow);
    }
    var had = document.activeElement && cloudFlow.contains(document.activeElement) && document.activeElement.classList.contains("dir-in");
    cloudFlow.textContent = "";
    cloudFlow.hidden = !el.panel.hidden || Boolean(cloudCaption && !cloudCaption.hidden);
    renderStart();
    ensureTopicList();
    if (cloudFlow.hidden || !C.subjects(state.cloud).length) { cloudFlow.hidden = true; return; } /* an empty cloud: its start invite instead */
    var note = dirNote();
    if (note) cloudFlow.appendChild(note);
    var din = note && note.querySelector(".dir-in");
    if (din && (had || state.dirForm !== state.dirFocused)) { din.focus(); state.dirFocused = state.dirForm; }
    var items = refreshSuggest().filter(function (it) { return nodeOf(it.id) && offerable(it); });
    if (items.length) cloudFlow.appendChild(mk("span", "kicker", "Pick up")); /* nothing to pick up: just Draw (and its all-done nudge) */
    items.forEach(function (it) {
      var n = nodeOf(it.id);
      cloudFlow.appendChild(linkBtn(it.kind === "test" ? "Test: " + n.label : it.kind === "grow" ? "Next in " + n.label : n.label, function () { if (it.kind === "test") openTest(it.id); else if (it.kind === "grow") createNext(it.id); else openLesson(it.id); }, "chip"));
    });
    var d = mk("button", "btn sm draw-btn", "Draw a card"); d.type = "button";
    d.addEventListener("click", function () { drawCard(d); });
    cloudFlow.appendChild(d);
    maybeGrowLine();
    placeIkoSoon();
  }
  /*
   * Directions (P.directions, 0 calls): one quiet line above Pick up, at most one at a time. Early on, "Want to add
   * another direction?" (a second and a third subject, then quiet); on a return visit, one or two branches left alone
   * for a while beside "something new"; after real progress, one soft note. Each can be closed, and that is kept in
   * the profile (the invite for good, the return row for a while, a note for good). Adding a direction is one "more"
   * creation call in the learner's own words; where it lands is the creation call's usual placement (new subjects
   * are new parents under the name), never the branch they were last in.
   */
  function dirClose(label, fn) {
    var b = linkBtn("\u00d7", function () { fn(); save(); renderCloudFlow(); var f = cloudFlow && cloudFlow.querySelector(".draw-btn"); if (f) f.focus(); }, "link cf-x");
    b.setAttribute("aria-label", label);
    return b;
  }
  function dirNote() {
    var d = C.dirOf(state.cloud), now = Date.now(), dr = P.directions(state.cloud, now);
    var box = mk("div", "cf-note");
    if (state.dirForm) {
      var f = mk("form", "dir-form"), inp = mk("input", "dir-in");
      f.setAttribute("autocomplete", "off");
      inp.maxLength = 300; inp.value = state.dirText || ""; inp.placeholder = "Something else you enjoy";
      inp.addEventListener("input", function () { state.dirText = inp.value; }); inp.setAttribute("aria-label", "Another direction, in your own words");
      var add = mk("button", "btn sm", "Add"); add.type = "submit";
      f.appendChild(inp); f.appendChild(add);
      f.appendChild(dirClose("Close", function () { state.dirForm = null; state.dirFocused = null; }));
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var t = cleanAbout(inp.value);
        if (!t || state.busy) return;
        if (state.dirForm === "invite") d.n = (d.n || 0) + 1;
        state.dirForm = null; state.dirText = ""; state.dirFocused = null; state.allDone = false;
        save();
        buildCloud("more", [], t, "", true);
      });
      inp.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); state.dirForm = null; state.dirFocused = null; renderCloudFlow(); var a = cloudFlow.querySelector(".dir-ask, .dir-new"); if (a) a.focus(); } });
      box.appendChild(f);
      return box;
    }
    var open = function (why) { return function () { state.dirForm = why; renderCloudFlow(); }; };
    if (state.allDone) {
      /* a draw found nothing unfinished: a new topic or direction, never finished work again */
      box.classList.add("dir-done");
      box.appendChild(mk("span", "dir-done-t", "Every card here is finished."));
      var dend = mk("span", "dir-end"); /* the link and its close stay together on a narrow screen */
      dend.appendChild(linkBtn("Add a new topic or direction?", open("done"), "link dir-ask"));
      dend.appendChild(dirClose("Not now", function () { state.allDone = false; }));
      box.appendChild(dend);
      return box;
    }
    if ((d.later || []).length) {
      /* ideas from the intake beyond its first few subjects: each one is a direction to add when they like */
      box.classList.add("dir-later");
      box.appendChild(mk("span", "kicker", "Also on your mind"));
      var lend = mk("span", "dir-end"); /* the last idea and the close stay together on a narrow screen */
      d.later.forEach(function (t, i) {
        var b = linkBtn(t, function () { if (state.busy) return; d.later = d.later.filter(function (x) { return x !== t; }); save(); buildCloud("more", [], t, "", true); }, "chip dir-chip");
        (i === d.later.length - 1 ? lend : box).appendChild(b);
      });
      lend.appendChild(dirClose("Not now", function () { d.later = []; }));
      box.appendChild(lend);
      return box;
    }
    if (dr.invite) {
      box.classList.add("dir-invite");
      box.appendChild(linkBtn("Want to add another direction?", open("invite"), "link dir-ask"));
      box.appendChild(dirClose("Not now", function () { d.off = now; }));
      return box;
    }
    if (dr.revisit.length) {
      box.classList.add("dir-back");
      box.appendChild(mk("span", "kicker", "Waiting for you"));
      dr.revisit.forEach(function (id) { var n = nodeOf(id); if (n) box.appendChild(linkBtn(n.label, function () { openPanel(id); }, "chip dir-chip")); });
      var end = mk("span", "dir-end"); /* the link and its close stay together on a narrow screen */
      end.appendChild(linkBtn("or something new", open("new"), "link dir-new"));
      end.appendChild(dirClose("Not now", function () { d.quiet = now; }));
      box.appendChild(end);
      return box;
    }
    if (dr.insight) {
      box.classList.add("dir-insight");
      /* the close sits at the end of the sentence: the last word and the close never part on a narrow screen */
      var key = dr.insight.key, words = dr.insight.text.split(" "), last = words.pop();
      var tx = mk("span", "dir-text", words.join(" ") + " "), tail = mk("span", "dir-tail", last + "\u00a0");
      tail.appendChild(dirClose("Hide this note", function () { d.hide = (d.hide || []).concat([key]).slice(-24); }));
      tx.appendChild(tail);
      box.appendChild(tx);
      return box;
    }
    return null;
  }
  function closeCloud(keepView) {
    if (window.IkoSound) IkoSound.ambient(false);
    el.cloud.hidden = true; el.panel.hidden = true; state.panelNode = null; cardSig = ""; if (big && big.lightRoot) big.lightRoot(false);
    if (big) { big.spin(false); big.hold(false); }
    if (!keepView && !state.lessonNode) { renderDraw(); el.input.focus(); }
  }

  function closeSettings() {
    if (!el.settings) return;
    el.settings.hidden = true;
    if (el.settingsBtn) el.settingsBtn.setAttribute("aria-expanded", "false");
  }
  function choiceRow(label, opts, current, onPick) {
    var g = mk("div", "place-opts"), paint;
    g.setAttribute("role", "group"); g.setAttribute("aria-label", label);
    opts.forEach(function (x) {
      var b = linkBtn(x[1], function () { onPick(x[0]); paint(); }, "btn sm age-opt");
      b.setAttribute("data-v", String(x[0]));
      g.appendChild(b);
    });
    paint = function () { var cur = String(current()); g.querySelectorAll("button").forEach(function (b) { var on = b.getAttribute("data-v") === cur; b.setAttribute("aria-pressed", String(on)); b.classList.toggle("on", on); }); };
    paint();
    return g;
  }
  function fillSettings() {
    var box = el.settings;
    if (!box) return;
    box.textContent = "";
    box.appendChild(mk("h2", null, "Settings"));
    box.appendChild(mk("p", "hc-ph", "Your name"));
    box.appendChild(linkBtn("Rename " + ((state.cloud && state.cloud.name) || "You"), function () { closeSettings(); startRename(); }, "btn sm"));
    box.appendChild(mk("p", "hc-ph", "Lesson level"));
    box.appendChild(bandRow(function (b) { setBand(b); fillSettings(); }));
    if (TH) {
      box.appendChild(mk("p", "hc-ph", "Theme"));
      box.appendChild(choiceRow("Theme", [["light", "Light"], ["dark", "Dark"], ["ikosagon", "Ikosagon"]], function () { return TH.saved() || TH.mode(); }, function (v) { TH.set(v); }));
      box.appendChild(mk("p", "hc-ph", "Font"));
      box.appendChild(choiceRow("Font", [["current", "Current"], ["futura", "Futura"], ["sans", "System"], ["palatino", "Palatino"]], function () { return TH.font(); }, function (v) { TH.setFont(v); }));
      box.appendChild(mk("p", "hc-hint fine", "Futura, or the closest geometric sans on this device. Cloud labels stay as they are."));
    }
    box.appendChild(mk("p", "hc-ph", "Sounds"));
    box.appendChild(choiceRow("Card and button sounds", [["on", "On"], ["off", "Off"]], function () { return window.IkoSound && IkoSound.on() ? "on" : "off"; }, function (v) { if (window.IkoSound) IkoSound.set(v === "on"); }));
    box.appendChild(mk("p", "hc-hint fine", "Card and button sounds. The cloud stays quiet."));
    box.appendChild(mk("p", "hc-ph", "Iko"));
    box.appendChild(choiceRow("Iko verbosity", [["off", "Quiet"], ["on", "Brief"], ["more", "Chatty"]], hintsMode, setHints));
    var st = mk("p", "fine ct-status"); st.setAttribute("role", "status"); st.setAttribute("aria-live", "polite");
    box.appendChild(mk("p", "hc-ph", "Your file"));
    var file = mk("p");
    file.appendChild(linkBtn("Save .ikolearn", function () { exportCloud(st, ".ikolearn"); }, "btn sm"));
    file.appendChild(document.createTextNode(" "));
    file.appendChild(linkBtn("Open .ikolearn", function () { pickCloud(st); }, "btn sm"));
    file.appendChild(document.createTextNode(" "));
    file.appendChild(linkBtn("Enhance this file", function () { enhanceFile(st); }, "btn sm"));
    box.appendChild(file); box.appendChild(st);
    box.appendChild(mk("p", "hc-ph", "About"));
    var links = mk("p"), priv = document.querySelector('.cloud-foot a[href="/ikolearn/privacy"]'), fb = document.querySelector("a.fb-link");
    if (priv) links.appendChild(priv.cloneNode(true));
    links.appendChild(document.createTextNode(" · "));
    if (fb) links.appendChild(fb.cloneNode(true));
    box.appendChild(links);
  }
  function ensureSettings() {
    if (el.settingsBtn) return;
    el.settingsBtn = $("settings-btn");
    if (!el.settingsBtn || !el.cloud) return;
    el.settings = mk("div", "settings-menu");
    el.settings.id = "settings-menu"; el.settings.hidden = true;
    el.settings.setAttribute("role", "dialog"); el.settings.setAttribute("aria-label", "Settings");
    el.cloud.appendChild(el.settings);
    el.settingsBtn.addEventListener("click", function () {
      if (!el.settings.hidden) { closeSettings(); return; }
      closeTopicList();
      fillSettings();
      el.settings.hidden = false;
      el.settingsBtn.setAttribute("aria-expanded", "true");
      var b = el.settings.querySelector("button, a"); if (b) b.focus();
    });
    el.settings.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      e.stopPropagation(); closeSettings(); el.settingsBtn.focus();
    });
  }
  function wantsNameHint() {
    var c = state.cloud;
    return Boolean(c) && !c.named && c.name === "You" && !C.subjects(c).length && !startLayerOpen();
  }
  function renderYouHint() {
    if (!el.youHint) return;
    el.youHint.hidden = !(wantsNameHint() && el.nameEdit && el.nameEdit.hidden && !el.cloud.hidden);
    if (!el.youHint.hidden) placeYouHint();
  }
  function placeYouHint() {
    if (!big || !el.youHint || el.youHint.hidden) return;
    var q = big.project("root");
    if (!q) return;
    el.youHint.style.left = q.x + "px";
    el.youHint.style.top = (q.y + 24) + "px";
  }
  function placeFloat(node, x, y) {
    if (!node) return;
    node.style.left = x + "px";
    node.style.top = y + "px";
  }
  function cleanPerson(v) { return C.cleanLabel(v).replace(/[^\p{L}\p{M}' -]/gu, "").trim().slice(0, 30); }
  function renameLearner(raw) {
    var n = cleanPerson(raw);
    if (!n || !state.cloud) return false;
    state.name = n;
    state.cloud.name = n;
    state.cloud.named = true;
    store(LS.name, n);
    if (PR) { try { var ix = PR.current(localStorage); if (ix && !ix.implicit && ix.active) PR.rename(localStorage, ix.active, n); } catch (e) { /* the cloud name is still kept */ } }
    save();
    if (big) big.setCloud(state.cloud);
    if (mini) mini.setCloud(state.cloud);
    renderHomeNav();
    renderYouHint();
    if (state.panelNode === "root" && !el.panel.hidden) el.pTitle.textContent = n;
    return true;
  }
  function startRename() {
    if (!state.cloud || !el.nameEdit) return;
    el.nameEdit.hidden = false;
    el.nameEditIn.value = state.cloud.named ? state.cloud.name : "";
    renderYouHint();
    var q = big && big.project("root");
    if (q) placeFloat(el.nameEdit, q.x, q.y + 16);
    el.nameEditIn.focus();
  }
  function openAddSubject() {
    if (state.busy || !el.addSub) return;
    el.addSub.hidden = false;
    if (el.addStatus) el.addStatus.textContent = state.busy ? "Growing your cloud…" : "";
    var a = big && big.addAt && big.addAt();
    if (a) placeFloat(el.addSub, a.x, a.y + 36);
    el.addIn.focus();
  }
  function submitAdd(text) {
    var t = cleanAbout(text);
    if (!t || state.busy) return;
    el.addIn.value = "";
    el.addSub.hidden = true;
    if (!C.subjects(state.cloud).length) buildCloud("start", splitInterests(t), t);
    else buildCloud("more", [], t, "", true);
  }
  /* One removal path. The Delete button is the only place a learner's branch is removed; unpicked ghosts use it too. */
  function dropGhost(id) { return C.removeBranch(state.cloud, id); }
  /* The first subject's model children stay ghosts (2–3). They are not real nodes and are not counted. */
  function trimOffers(ids) {
    (ids || []).forEach(function (id) {
      if (!nodeOf(id)) return;
      var kids = C.childrenOf(state.cloud, id);
      if (kids.some(function (c) { return !c.ghost; })) return;
      kids.filter(function (c) { return c.ghost; }).slice(3).forEach(function (c) {
        if (!C.childrenOf(state.cloud, c.id).length) dropGhost(c.id);
      });
    });
  }
  /* Tapping a ghost uses the same placement and near-duplicate rules as a typed topic. Unpicked siblings fade. */
  function settleGhost(id) {
    var n = nodeOf(id);
    if (!n || !n.ghost) return id;
    var exact = C.findTopic(state.cloud, n.label), close = C.findClose(state.cloud, n.label);
    var other = exact && exact.id !== id ? exact : close && close.id !== id ? close : null;
    var parentId = n.parent;
    if (!other) {
      var tp = { name: n.label, signal: "curious", placement: parentId ? "child" : "parent", target: parentId || "", parent: parentId && nodeOf(parentId) ? nodeOf(parentId).label : "" };
      var plan = P.placeTopic(state.cloud, tp, parentId);
      if (plan && plan.how === "reuse" && plan.id !== id) other = nodeOf(plan.id);
      else if (plan && plan.how === "parent") {
        var gr = C.applyTopics(state.cloud, [P.placedTopic(tp, plan)]);
        var nid = gr.parentsCreated[0] || gr.created[0] || gr.promoted[0] || id;
        if (nid !== id && nodeOf(id) && nodeOf(id).ghost && !C.childrenOf(state.cloud, id).length) dropGhost(id);
        fadeUnpicked(parentId, nid);
        save();
        if (big) big.setCloud(state.cloud);
        return nid;
      }
    }
    if (other) {
      fadeUnpicked(parentId, other.id);
      if (nodeOf(id) && nodeOf(id).ghost && !C.childrenOf(state.cloud, id).length) dropGhost(id);
      if (other.ghost) { other.ghost = false; other.weight = Math.max(other.weight || 0, 1); }
      save();
      if (big) big.setCloud(state.cloud);
      return other.id;
    }
    n.ghost = false;
    n.weight = Math.max(n.weight || 0, 1);
    n.born = Date.now();
    fadeUnpicked(parentId, id);
    save();
    if (big) big.setCloud(state.cloud);
    return id;
  }
  function fadeUnpicked(parentId, keep) {
    if (!parentId) return;
    var gone = C.childrenOf(state.cloud, parentId).filter(function (c) {
      return c.id !== keep && c.ghost && !c.opened && !(c.engaged > 0) && !C.childrenOf(state.cloud, c.id).length;
    });
    gone.forEach(function (c) { c.leaving = 1; });
    if (big) big.setCloud(state.cloud);
    setTimeout(function () {
      var changed = false;
      gone.forEach(function (c) { if (nodeOf(c.id) && nodeOf(c.id).ghost) { dropGhost(c.id); changed = true; } });
      if (!changed) return;
      save();
      if (big) big.setCloud(state.cloud);
      if (state.zoomId) renderZoom();
    }, reduceMotion && reduceMotion.matches ? 0 : 640);
  }
  function zoomKids(id) { return id === "root" ? C.subjects(state.cloud) : C.childrenOf(state.cloud, id); }
  function zoomState() { return { q: state.zoomQ, sort: state.zoomSort, done: state.zoomDone, page: state.zoomPage }; }
  function renderZoom() {
    if (!el.zoomList) return;
    var id = state.zoomId;
    if (!id || el.cloud.hidden) { el.zoomList.hidden = true; return; }
    el.zoomList.hidden = false;
    var parent = id === "root" ? null : nodeOf(id);
    if (id !== "root" && !parent) { state.zoomId = null; el.zoomList.hidden = true; return; }
    el.zoomTitle.textContent = parent ? parent.label : state.cloud.name;
    el.zoomKicker.textContent = parent && parent.parent && nodeOf(parent.parent) ? nodeOf(parent.parent).label : parent ? "You" : "Your cloud";
    var oldTools = el.zoomList.querySelector(".list-tools"); if (oldTools) oldTools.remove();
    var oldEmpty = el.zoomList.querySelector(".list-empty"); if (oldEmpty) oldEmpty.remove();
    var oldOpen = el.zoomList.querySelector(".zoom-open"); if (oldOpen) oldOpen.remove();
    var oldPager = el.zoomList.querySelector(".list-pager"); if (oldPager) oldPager.remove();
    var st = zoomState();
    var tools = listTools("zoom", st, function () { state.zoomQ = st.q; state.zoomSort = st.sort; state.zoomDone = st.done; state.zoomPage = st.page; state.zoomAt = 0; renderZoom(); });
    el.zoomTitle.insertAdjacentElement("afterend", tools);
    if (id !== "root") {
      var open = mk("button", "btn sm zoom-open", state.lessons[id] ? "Open lesson" : "Start a lesson");
      open.type = "button";
      open.addEventListener("click", function () { openLesson(id); });
      var about = linkBtn("About", function () { var keep = id; exitZoom(); openPanel(keep); }, "link zoom-about");
      var row = mk("div", "zoom-open"); row.appendChild(open); row.appendChild(about);
      tools.insertAdjacentElement("afterend", row);
    }
    el.zoomItems.textContent = "";
    var res = topicQuery(id, st, false);
    state.zoomQ = st.q; state.zoomSort = st.sort; state.zoomDone = st.done; state.zoomPage = st.page;
    if (!res.total) el.zoomItems.insertAdjacentElement("beforebegin", listEmpty(st, res));
    else res.items.forEach(function (n, i) {
      var li = mk("li"), b = mk("button", n.ghost ? "ghost" : "", n.label);
      b.type = "button"; b.id = "zoom-opt-" + i; b.setAttribute("role", "option"); b.tabIndex = i === state.zoomAt ? 0 : -1;
      b.setAttribute("aria-selected", i === state.zoomAt ? "true" : "false");
      b.addEventListener("click", function () { state.zoomAt = i; activateZoom(n.id); });
      li.appendChild(b); el.zoomItems.appendChild(li);
    });
    var pager = listPager(st, res, function () { state.zoomPage = st.page; state.zoomAt = 0; renderZoom(); });
    if (pager) el.zoomList.appendChild(pager);
    var cur = el.zoomItems.querySelector('[aria-selected="true"]');
    if (cur) el.zoomItems.setAttribute("aria-activedescendant", cur.id);
    tools.restore();
  }
  /* A pinch or scroll that comes in close opens the list. The + button does the same. Phones hide + and −. */
  function maybeZoomList() {
    if (state.zoomId || state.zoomLock || !big) return;
    var st = big.state();
    if (!st || st.zoom < 1.55) return;
    var id = state.panelNode && (state.panelNode === "root" || nodeOf(state.panelNode)) ? state.panelNode : (st.focus && (st.focus === "root" || nodeOf(st.focus)) ? st.focus : "root");
    state.zoomLock = true;
    enterZoom(id);
    setTimeout(function () { state.zoomLock = false; }, 900);
  }
  function enterZoom(id) {
    if (!big || (id !== "root" && !nodeOf(id))) return;
    if (state.zoomId !== id) { state.zoomQ = ""; state.zoomPage = 0; state.zoomAt = 0; }
    state.zoomId = id;
    if (!el.panel.hidden) closeCard();
    renderZoom();
    /* parent on the left, this node in focus, its children in the list. The camera eases. */
    var cw = el.cloudCanvas.clientWidth, ch = el.cloudCanvas.clientHeight, wide = cw >= 700, top = cloudTop();
    var node = id === "root" ? null : nodeOf(id);
    var parentId = node && node.parent ? node.parent : id === "root" ? null : "root";
    big.focusNode(id, wide
      ? { cx: Math.round(cw * 0.34), cy: Math.round(top + (ch - top) * 0.46), aw: Math.round(cw * 0.34), ah: Math.round((ch - top) * 0.55), keepYaw: false }
      : { cx: Math.round(Math.min(cw * 0.42, 150)), cy: Math.round(top + 78), aw: Math.round(cw * 0.5), ah: 120, keepYaw: false });
    if (big.pinParent) big.pinParent(parentId);
    if (el.zoomItems) el.zoomItems.focus();
  }
  function exitZoom() {
    if (!state.zoomId) return;
    state.zoomId = null;
    if (el.zoomList) el.zoomList.hidden = true;
    if (big) big.recentre();
  }
  function activateZoom(id) {
    var n = nodeOf(id);
    if (!n) return;
    if (n.ghost) id = settleGhost(id);
    n = nodeOf(id);
    if (!n) return;
    enterZoom(id); /* the same parent-left / children-right view, including a topic with no children yet */
  }
  function pick(hit) {
    if (hit.add) { openAddSubject(); return; }
    if (hit.node && !hintSeen("cloud")) { dismissHint("cloud"); renderCloudHint(); } /* they found it: the tip has done its job */
    if (hit.test) openTest(hit.test);
    else if (hit.root) {
      if (wantsNameHint()) startRename();
      else if (state.panelNode === "root" && !el.panel.hidden) startRename();
      else openPanel("root");
    }     else if (hit.node && hit.node.ghost) enterZoom(settleGhost(hit.node.id));
    else if (hit.node) enterZoom(hit.node.id);
  }

  /* keepNote: leave the note as is; keepView: don't move the camera. The note is never written by opening a panel (see below). */
  function openPanel(id, keepNote, keepView) {
    var keep = openPanel.keep;
    openPanel.keep = false;
    if (state.panelNode !== id) cancelCall("notice");
    if (state.panelNode !== id) homeTab = "story"; /* the name's card opens on its story */
    state.panelNode = id;
    var isRoot = id === "root";
    var n = isRoot ? null : nodeOf(id);
    if (!isRoot && !n) return;
    el.panel.hidden = false; cardSig = "";
    if (cloudFlow) cloudFlow.hidden = true;
    el.pKicker.textContent = isRoot ? "Your learning cloud" : n.parent ? (n.ghost ? "Not explored yet · " : "") : "Subject";
    /* the trail above this topic: each step is a quiet link back up the branch */
    if (!isRoot && n.parent) C.ancestry(state.cloud, n.parent).forEach(function (aid, i) {
      if (i) el.pKicker.appendChild(document.createTextNode(" · "));
      el.pKicker.appendChild(linkBtn(nodeOf(aid).label, function () { openPanel(aid); }, "link up"));
    });
    el.pTitle.textContent = isRoot ? state.cloud.name : n.label;
    var ended = !isRoot && C.isTerminal(state.cloud, id);
    el.pLesson.hidden = isRoot; el.pCard.hidden = isRoot; el.pAdj.hidden = !ended; /* new branches only once this one has ended */
    el.pLesson.textContent = !isRoot && state.lessons[id] ? "Open lesson" : "Start a lesson";
    var tst = !isRoot && P.testState(state.cloud, id);
    el.pTest.hidden = !(tst && (tst.ready || tst.taken));
    if (tst) el.pTest.textContent = tst.ready ? (tst.taken ? "Test again" : "Take the test") : "Test taken";
    el.pTest.disabled = state.busy || !(tst && tst.ready);
    el.pPath.textContent = "";
    el.panel.classList.toggle("is-root", isRoot);
    if (big && big.lightRoot) big.lightRoot(isRoot); /* PR 111: the name glows a little warmer while its card is open */
    if (isRoot) renderStats();
    /* compact: the title, its description, the main actions and a short path (no cards, no long lists: its card has those) */
    else el.pPath.appendChild(pathBlock(id, { offer: true, short: true, onStep: function (sid) { openPanel(sid); } }));
    /* the note is never written by a tap: shown when already written for this stage; offered as a link only where there
       is no description (a description that could not be written). The name (the root) has its stats instead. */
    if (isRoot) { el.pNote.className = "note"; el.pNote.textContent = ""; }
    else if (!keepNote) {
      if (!state.notes[noteKey(id)]) noteLine(id);
      else notice(id);
    }
    renderDesc(id);
    placeCard();
    if (!isRoot && !keep) markLast(id, C.inDeck(state.cloud, id) ? "card" : "lesson");
    if (keepView) return;
    focusInView(isRoot ? "root" : id, isRoot); /* the name too: the camera eases it into view, its card beside it */
  }
  /*
   * PR 111: the name's card, a quiet glass pane in three parts (0 calls, all from what is on the device). Story (first):
   * a short account, spoken to the learner, of what they have built (P.homeStory, PR 112). Stats: days visited, the streak,
   * cards earned, topics finished, lessons completed. Preferences (the small gear): the age range and light or dark.
   * Save IkoCloud / Open IkoCloud stay underneath every part, quietly.
   */
  var homeTab = "story";
  function lessonsDone() { return Object.keys(state.lessons || {}).filter(function (id) { var l = state.lessons[id]; return Boolean(l && (l.earned || passed(id))); }).length; }
  function homeNumbers(now) {
    var st = P.homeStats(state.cloud, now || Date.now()), pr = C.profileOf(state.cloud);
    return { st: st, days: Math.max(pr.days || 0, st.active || 0, st.last || st.cards ? 1 : 0), streak: st.streak, cards: st.cards, topics: st.done, lessons: lessonsDone() };
  }
  function renderStats() {
    var now = Date.now(), num = homeNumbers(now), st = num.st, box = mk("div", "stats home-card");
    var tabs = mk("div", "hc-tabs"), panes = {};
    tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "About your IkoCloud");
    var show = function (k, focus) {
      homeTab = k;
      Object.keys(panes).forEach(function (x) { panes[x].hidden = x !== k; var t = tabs.querySelector('[data-tab="' + x + '"]'); t.setAttribute("aria-selected", String(x === k)); t.tabIndex = x === k ? 0 : -1; t.classList.toggle("on", x === k); if (x === k && focus) t.focus(); });
    };
    [["story", "Story"], ["stats", "Stats"], ["prefs", "Preferences"]].forEach(function (x) {
      var t = mk("button", "hc-tab" + (x[0] === "prefs" ? " hc-gear" : ""), x[0] === "prefs" ? "" : x[1]);
      t.type = "button"; t.id = "hc-t-" + x[0]; t.setAttribute("role", "tab"); t.setAttribute("data-tab", x[0]); t.setAttribute("aria-controls", "hc-" + x[0]);
      if (x[0] === "prefs") { t.setAttribute("aria-label", "Preferences"); t.title = "Preferences"; }
      t.addEventListener("click", function (e) { e.stopPropagation(); show(x[0]); });
      tabs.appendChild(t);
      var pane = mk("div", "hc-pane hc-" + x[0]); pane.id = "hc-" + x[0]; pane.setAttribute("role", "tabpanel"); pane.setAttribute("aria-labelledby", t.id);
      panes[x[0]] = pane;
    });
    tabs.addEventListener("keydown", function (e) { /* arrow keys move between the tabs */
      var keys = ["story", "stats", "prefs"], k = keys.indexOf(homeTab), d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (d) { e.preventDefault(); show(keys[(k + d + 3) % 3], true); }
    });
    box.appendChild(tabs);
    /* Story */
    var story = P.homeStory(state.cloud, { name: state.cloud.name, now: now, lessons: num.lessons, neo: neoGet() });
    var nn = story.next && nodeOf(story.next);
    story.lines.forEach(function (line) {
      var pl = mk("p", "hc-line"), at = nn ? line.indexOf(nn.label) : -1;
      if (at >= 0 && !box.querySelector(".hc-next")) { /* the suggested next step is a link to it */
        pl.appendChild(document.createTextNode(line.slice(0, at)));
        pl.appendChild(linkBtn(nn.label, function () { openPanel(nn.id); }, "link hc-next"));
        pl.appendChild(document.createTextNode(line.slice(at + nn.label.length)));
      } else pl.textContent = line;
      panes.story.appendChild(pl);
    });
    if (story.empty) panes.story.classList.add("is-empty");
    /* Stats */
    var rc = weeklyRecap();
    if (rc) {
      var rb = mk("div", "hc-recap");
      rb.appendChild(mk("p", "hc-ph", "Your week"));
      rb.appendChild(mk("p", "hc-recap-t", rc));
      var cp = linkBtn("Copy", function () { try { navigator.clipboard.writeText(rc); cp.textContent = "Copied"; } catch (x) { /* no clipboard: the text can still be selected */ } }, "link hc-copy");
      rb.appendChild(cp);
      rb.appendChild(document.createTextNode(" \u00b7 "));
      rb.appendChild(linkBtn("Print", function () { document.body.classList.add("print-recap"); window.print(); setTimeout(function () { document.body.classList.remove("print-recap"); }, 500); }, "link hc-print"));
      panes.stats.appendChild(rb);
    }
    var dl = mk("dl", "hc-nums");
    [["days", "Days visited", num.days], ["cards", "Cards earned", num.cards], ["topics", "Topics finished", num.topics], ["lessons", "Lessons completed", num.lessons]].forEach(function (x) {
      var d = mk("div", "hc-num"); d.setAttribute("data-k", x[0]);
      d.appendChild(mk("dt", "hc-k", x[1])); d.appendChild(mk("dd", "hc-n", String(x[2]))); /* the number shows above its label */
      dl.appendChild(d);
    });
    panes.stats.appendChild(dl);
    var tiers = [["merged", "Merged"], ["achieved", "Achieved"], ["tinted", "Tinted"], ["inked", "Inked"], ["sketch", "Sketch"]].filter(function (x) { return st.tiers[x[0]]; }).map(function (x) { return st.tiers[x[0]] + " " + x[1]; });
    var sub = mk("p", "hc-sub", (st.subjects === 1 ? "1 subject" : st.subjects + " subjects") + " · " + st.done + " of " + st.topics + (st.topics === 1 ? " topic" : " topics") + " finished" + (tiers.length ? " · " + tiers.slice(0, 3).join(", ") : "") + ".");
    panes.stats.appendChild(sub);
    if (st.cards) { var od = mk("p", "hc-sub"); od.appendChild(linkBtn("Open your Deck", function () { closeCloud(true); showDeck(true); }, "link st-link")); panes.stats.appendChild(od); }
    if (st.insight) panes.stats.appendChild(mk("p", "st-insight", st.insight.text));
    /* Preferences */
    panes.prefs.appendChild(mk("p", "hc-ph", "Lesson level"));
    panes.prefs.appendChild(mk("p", "hc-hint fine", "Changes how lessons are written: simpler words or more depth. Kept on this device."));
    var paintBands = function () { var r = bandRow(function (b) { setBand(b); var nr = paintBands(); old.replaceWith(nr); old = nr; }); return r; }, old = paintBands();
    panes.prefs.appendChild(old);
    if (TH) {
      panes.prefs.appendChild(mk("p", "hc-ph", "Appearance"));
      var tr = mk("div", "place-opts hc-theme"); tr.setAttribute("role", "group"); tr.setAttribute("aria-label", "Appearance");
      var paintTheme = function () { tr.querySelectorAll("button").forEach(function (b) { var on = (TH.saved() || "") === b.getAttribute("data-mode"); b.setAttribute("aria-pressed", String(on)); b.classList.toggle("on", on); }); };
      [["light", "Light"], ["dark", "Dark"], ["ikosagon", "Ikosagon"], ["", "Match device"]].forEach(function (x) {
        var b = linkBtn(x[1], function () { TH.set(x[0] || null); paintTheme(); }, "btn sm age-opt"); b.setAttribute("data-mode", x[0]); tr.appendChild(b);
      });
      paintTheme(); panes.prefs.appendChild(tr);
    }
    /* PR 120: tidy the cloud by hand */
    panes.prefs.appendChild(mk("p", "hc-ph", "Your cloud"));
    panes.prefs.appendChild(mk("p", "hc-hint fine", "Re-files topics so related ones sit together. Nothing you've learned changes, and you can undo it."));
    var tst = mk("p", "hc-hint fine tidy-status"); tst.setAttribute("role", "status"); tst.setAttribute("aria-live", "polite");
    var tb = linkBtn("Tidy my cloud", function () {
      tb.disabled = true; tst.textContent = "Tidying…";
      tidyCloud(true, function (ok, why) { tb.disabled = false; var ts = document.querySelector(".tidy-status") || tst; ts.textContent = ok ? "Done. Related topics now sit together." : why === "small" ? "Your cloud is still small and neat." : why === "neat" ? "Your cloud is already tidy." : "Your cloud stays as it is for now."; });
    }, "btn sm tidy-btn");
    panes.prefs.appendChild(tb); panes.prefs.appendChild(tst);
    if (window.IkoSound && IkoSound.cloudAudio) {
      panes.prefs.appendChild(mk("p", "hc-ph", "Sound"));
      var sr = mk("div", "place-opts hc-sound"); sr.setAttribute("role", "group"); sr.setAttribute("aria-label", "Sound");
      var paintSnd = function () { sr.querySelectorAll("button").forEach(function (b) { var v = b.getAttribute("data-snd-v") === "on", p = v === IkoSound.on(); b.setAttribute("aria-pressed", String(p)); b.classList.toggle("on", p); }); };
      [["on", "Quiet sounds"], ["off", "Off"]].forEach(function (x) { var b = linkBtn(x[1], function () { IkoSound.set(x[0] === "on"); if (x[0] === "on" && !el.cloud.hidden) IkoSound.ambient(true); paintSnd(); }, "btn sm age-opt"); b.setAttribute("data-snd-v", x[0]); sr.appendChild(b); });
      paintSnd(); panes.prefs.appendChild(sr);
    }
    panes.prefs.appendChild(mk("p", "hc-ph", "Iko"));
    panes.prefs.appendChild(mk("p", "hc-hint fine", "Short tips beside Iko. You can also say \"be quiet\" or \"talk more\"."));
    var hr = mk("div", "place-opts hc-hints"); hr.setAttribute("role", "group"); hr.setAttribute("aria-label", "Iko hints");
    var paintHints = function () { hr.querySelectorAll("button").forEach(function (b) { var v = b.getAttribute("data-hints-v") === "on", p = v === hintsOn(); b.setAttribute("aria-pressed", String(p)); b.classList.toggle("on", p); }); };
    [["on", "Tips on"], ["off", "Quiet"]].forEach(function (x) { var b = linkBtn(x[1], function () { setHints(x[0] === "on"); paintHints(); }, "btn sm age-opt"); b.setAttribute("data-hints-v", x[0]); hr.appendChild(b); });
    paintHints(); panes.prefs.appendChild(hr);
    Object.keys(panes).forEach(function (k) { box.appendChild(panes[k]); });
    show(homeTab);
    box.appendChild(cloudTools());
    el.pPath.appendChild(box);
  }
  function agoText(t) { var d = Math.floor((Date.now() - t) / 864e5); return d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago"; }

  /* Focus a node where it is visible (CAM.focusFrame), leaving room for its card (right of it wide, under it on phones). */
  function cloudTop() { return el.cloudTop ? el.cloudTop.getBoundingClientRect().bottom - el.cloudCanvas.getBoundingClientRect().top + 8 : 64; }
  function focusInView(id, keepYaw) {
    var wide = window.innerWidth >= 900, ch = el.cloudCanvas.clientHeight, cw = el.cloudCanvas.clientWidth;
    big.focusNode(id, Object.assign({ keepYaw: keepYaw }, CAM.focusFrame(cw, ch, { wide: wide, top: cloudTop() })));
  }
  /*
   * The selection card: a quiet rounded card next to its node (CAM.cardPlace: right of it, else left, below or above,
   * inside the view, never over the node). It is placed again on every frame the cloud draws, so it stays attached as
   * the cloud turns, pans or zooms. Dismissed by its close control, a tap on empty sky, or Escape.
   */
  var cardSig = "";
  function placeCard() {
    placeYouHint();
    if (el.nameEdit && !el.nameEdit.hidden && big) { var qn = big.project("root"); if (qn) placeFloat(el.nameEdit, qn.x, qn.y + 16); }
    if (el.addSub && !el.addSub.hidden && big && big.addAt) { var qa = big.addAt(); if (qa) placeFloat(el.addSub, qa.x, qa.y + 36); }
    if (!big || el.panel.hidden || !state.panelNode) return;
    var q = big.project(state.panelNode === "root" ? "root" : state.panelNode);
    if (!q) return;
    var cw = el.cloudCanvas.clientWidth, ch = el.cloudCanvas.clientHeight, box = el.panel.firstElementChild;
    var pw = el.panel.offsetWidth, ph = (box ? box.offsetHeight : el.panel.scrollHeight) + 2;
    /* Iko's chat open as a panel at the left (PR 104): the card is placed in the sky to its right */
    var off = document.body.classList.contains("iko-side") && !el.ikoSheet.hidden ? Math.max(0, Math.round(el.ikoSheet.getBoundingClientRect().right + 12 - el.cloudCanvas.getBoundingClientRect().left)) : 0;
    var at = CAM.cardPlace(q.x - off, q.y, pw, ph, cw - off, ch, cloudTop());
    at.x += off;
    var x = Math.max(CAM.CARD.margin + off, Math.min(cw - CAM.CARD.margin - pw, at.x)), y = Math.max(CAM.CARD.margin, at.y);
    var sig = x + "," + y + "," + at.maxH + "," + at.side;
    if (sig === cardSig) return;
    cardSig = sig;
    el.panel.style.left = x + "px"; el.panel.style.top = y + "px"; el.panel.style.maxHeight = at.maxH + "px";
    el.panel.setAttribute("data-side", at.side);
    placeIkoSoon();
  }
  function closeCard() {
    if (el.panel.hidden) return;
    cancelCall("notice");
    el.panel.hidden = true; state.panelNode = null; cardSig = ""; if (big && big.lightRoot) big.lightRoot(false);
    if (big) big.clearFocus();
    renderCloudFlow();
  }
  if (window.ResizeObserver) new ResizeObserver(function () { cardSig = ""; placeCard(); }).observe(el.panel);
  window.addEventListener("resize", function () { cardSig = ""; placeCard(); });
  /* PR 110: the cloud's fine print is two lines on a phone (Support & feedback is there too): the Pick up row and the zoom keep above it */
  (function () { var f = el.cloud.querySelector(".cloud-foot"); if (f && window.ResizeObserver) new ResizeObserver(function () { if (f.offsetHeight) el.cloud.style.setProperty("--foot-h", f.offsetHeight + "px"); }).observe(f); })();

  /*
   * The node's description under the card's title: its blurb, written in the same call that made the node (0 extra
   * calls). A node without one (an older save, a topic from before descriptions) gets it lazily: opening its card asks
   * once for it together with its siblings and children that lack one (one call for up to 8, never twice in flight,
   * never again once written; the answer is saved with the cloud). While it is written a faint placeholder shows; if
   * it can't be, the old "What do you notice here?" link takes its place for this session, no "Try again".
   */
  var descWait = {}, descFail = {};
  function noteLine(id) {
    el.pNote.className = "note"; el.pNote.textContent = "";
    var n = nodeOf(id);
    if (!n || (!n.blurb && descFail[id])) el.pNote.appendChild(linkBtn("What do you notice here?", function () { notice(id); })); /* never on the name: it has its stats */
  }
  function renderDesc(id) {
    var n = id === "root" ? null : nodeOf(id), d = el.pDesc;
    if (!d) return;
    d.removeAttribute("aria-busy");
    if (!n || (!n.blurb && descFail[id])) { d.hidden = true; d.textContent = ""; return; }
    d.hidden = false;
    if (n.blurb) { d.className = "desc"; d.textContent = n.blurb; return; }
    d.className = "desc loading"; d.textContent = ""; d.setAttribute("aria-busy", "true");
    describe(id);
  }
  function describe(id) {
    var ids = P.describeBatch(state.cloud, id, function (x) { return descWait[x] || descFail[x]; }); /* this node, its siblings and children without one */
    if (!ids.length) return;
    ids.forEach(function (x) { descWait[x] = 1; });
    var body = basePayload(id), cloud = state.cloud;
    body.material = ids.map(function (x) { var m = nodeOf(x); return { label: m.label, line: m.parent ? C.trail(state.cloud, m.parent) : "" }; });
    postJson("/describe", body).then(function (j) {
      var got = 0;
      if (state.cloud !== cloud) { ids.forEach(function (x) { delete descWait[x]; }); return; } /* another learner now (guide mode): not theirs */
      ids.forEach(function (x) {
        var m = nodeOf(x), hit = m && j && j.ok && Array.isArray(j.items) ? j.items.filter(function (it) { return it && String(it.name || "").toLowerCase() === m.label.toLowerCase(); })[0] : null;
        delete descWait[x];
        if (hit && C.setBlurb(state.cloud, x, hit.blurb)) got += 1;
        else if (m && !m.blurb) descFail[x] = 1;
      });
      if (got) save();
      var open = state.panelNode;
      if (open && ids.indexOf(open) >= 0 && !el.panel.hidden) { renderDesc(open); if (!state.notes[noteKey(open)]) noteLine(open); }
    });
  }

  /* Tap on the name or a node: a short personable note, streamed into the panel (cached until the cloud changes). */
  /*
   * The note's cache key: the topic and how far along it is (not the whole cloud's revision), so confirming or
   * answering elsewhere doesn't throw it away; it is written again once this topic itself moves on a stage.
   */
  function noteKey(id) {
    if (id === "root") return "root:" + C.subjectLabels(state.cloud).length;
    var n = nodeOf(id);
    return id + ":" + (n ? (C.isDone(state.cloud, id) ? "d" : "") + Math.floor((n.mastery || 0) * 3) : 0);
  }
  /*
   * Only when asked ("What do you notice here?"): never by itself on a tap. It doesn't hold the app busy (navigation,
   * lessons and chat stay available); moving on cancels it.
   */
  function notice(id) {
    var key = noteKey(id);
    var cached = state.notes[key];
    if (cached) { paragraphs(el.pNote, cached); return; }
    if (calls.notice) return; /* already being written */
    var text = "";
    el.pNote.className = "note streaming"; paragraphs(el.pNote, "");
    var body = Object.assign(basePayload(id === "root" ? null : id), { mode: "notice", messages: history() }), sig = callSignal("notice");
    stream("/chat", body, {
      delta: function (t) { text += t; if (state.panelNode === id) paragraphs(el.pNote, text); }
    }, sig).then(function (r) {
      if (calls.notice && calls.notice.signal === sig) calls.notice = null;
      el.pNote.className = "note";
      if (r.reason === "aborted") return; /* moved on: nothing to show, nothing failed */
      if (!r.ok && !text) text = fallbackText(r.reason);
      else state.notes[key] = text.trim();
      if (state.panelNode === id) paragraphs(el.pNote, text.trim());
      save();
    });
  }

  el.pLesson.addEventListener("click", function () { if (nodeOf(state.panelNode)) openLesson(state.panelNode); });
  /* Open its card: the topic's hub (its card, chain, lesson and test, and its branches with what is covered). No model call. */
  el.pCard.addEventListener("click", function () {
    var id = state.panelNode; if (!nodeOf(id)) return;
    openHub(id, null, "cloud");
  });
  /* Related topics: suggestions whose subject we don't know land under the tapped node's subject. */
  el.pAdj.addEventListener("click", function () {
    var id = state.panelNode, n = nodeOf(id); if (!n || state.busy) return;
    lock(true);
    paragraphs(el.pNote, "Looking for related topics...");
    postJson("/adjacent", basePayload(id)).then(function (j) {
      if (j && j.ok) {
        var g = C.addGhosts(state.cloud, j.ghosts, Date.now(), id);
        refreshViews(g.added);
        if (state.panelNode === id) {
          paragraphs(el.pNote, g.added.length ? "Added as dotted branches: " + g.added.map(function (a) { return state.cloud.nodes[a].label; }).join(", ") + ". Tap one to explore it."
            : g.dupes && !g.unplaced ? "Those ideas are already on your cloud. Try a lesson, or map a path to go deeper."
            : "I couldn't fit new ideas on your cloud this time. Try again from a different point.");
          openPanel(id, true, true);
        }
      } else paragraphs(el.pNote, "I couldn't find related topics just now (" + ((j && (j.reason || j.error)) || "error") + "). Try again in a moment.");
    }).then(function () { save(); lock(false); });
  });
  el.pChat.addEventListener("click", function () { openIko(); });
  el.pTest.addEventListener("click", function () { if (nodeOf(state.panelNode)) openTest(state.panelNode); });
  el.pClose.addEventListener("click", closeCard);
  /* a click on any control over the cloud (zoom, Recentre, the card's actions, the suggestions) pauses the spin a moment */
  el.cloud.addEventListener("click", function (e) { if (big && e.target.closest && e.target.closest("button, a")) big.pause(); });
  el.zin.addEventListener("click", function () {
    moved("zoom");
    if (state.zoomId) {
      var kids = zoomKids(state.zoomId), cur = kids[state.zoomAt];
      if (cur) activateZoom(cur.id);
      return;
    }
    var id = state.panelNode && (state.panelNode === "root" || nodeOf(state.panelNode)) ? state.panelNode : "root";
    enterZoom(id);
  });
  el.zout.addEventListener("click", function () { moved("zoom"); if (state.zoomId) { exitZoom(); return; } big.zoomBy(1 / 1.35); });
  el.zreset.addEventListener("click", function () { if (state.zoomId) state.zoomId = null; if (el.zoomList) el.zoomList.hidden = true; big.recentre(); });
  /* one faint line documents the input map, for touch or for a mouse */
  renderCloudHint();
  document.addEventListener("keydown", function (e) {
    if (state.zoomId && el.zoomList && !el.zoomList.hidden && el.zoomList.contains(document.activeElement) && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")) {
      var opts = [].slice.call(el.zoomItems.querySelectorAll('[role="option"]'));
      var field = document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "SELECT");
      if (field && e.key !== "ArrowDown") return;
      if (!opts.length) return;
      if (e.key === "Enter") { e.preventDefault(); var b = el.zoomItems.querySelector('[aria-selected="true"]'); if (b) b.click(); return; }
      e.preventDefault();
      if (field) { opts[0].focus(); return; }
      state.zoomAt = (state.zoomAt + (e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length;
      renderZoom();
      var nxt = document.getElementById("zoom-opt-" + state.zoomAt); if (nxt) nxt.focus();
      return;
    }
    if (e.key !== "Escape") return;
    if (el.settings && !el.settings.hidden) { closeSettings(); return; }
    if (el.nameEdit && !el.nameEdit.hidden) { el.nameEdit.hidden = true; renderYouHint(); return; }
    if (el.addSub && !el.addSub.hidden) { el.addSub.hidden = true; return; }
    if (state.zoomId) { exitZoom(); return; }
    if (startLayerOpen()) { closeStart(); return; }
    if (el.ikc && !el.ikc.hidden) { confirmDone(false); return; } /* a confirm: Escape is Cancel */
    if (iko.open) { closeIko(); if (!el.ikoWrap.hidden) el.iko.focus(); return; }
    if (!el.cloud.hidden) { if (!el.panel.hidden) closeCard(); return; } /* the cloud is home: Escape only closes its card */
    if (state.lessonNode) el.lBack.click();
    else if (!el.hub.hidden) hubBack();
    else if (!el.deck.hidden) el.dBack.click();
    else if (state.back) goBack(); /* the whole conversation, opened from Iko: back where it was opened */
    else home(); /* the chat with Iko: back to the cloud */
  });

  /* ---------- Iko: the companion ---------- */
  /*
   * A soft pebble (inline SVG, no image) on every screen except the whole conversation, where the composer already is.
   * Tapping it opens a small sheet over the screen (nothing underneath closes): the text field, a line about what is on
   * screen, and the replies. The screen context (view, step, topic) goes with each message from the sheet (compact,
   * validated on the server, part of the same chat call). "Still tricky" opens it with the prepared clarification.
   * It moves clear of the selection card, the start, the Pick up row and the fine print; it never nags: its hello shows
   * for a few seconds on the first two visits only, and later just the pebble. Markup has a face group (eyes, mouth) so
   * a light blink or an occasional tip can be added later; reduced motion keeps it still.
   */
  var iko = { open: false, ctx: null, from: 0, lineT: 0, tipKey: "", tipT: 0, pendingReact: null, quietAt: Date.now(), poolT: 0, poolN: 0, poolLast: "" };
  /* PR 126: mute Iko's proactive hints (pebble and chat stay). Preferences or "be quiet" / "mute hints". */
  var IKO_HINTS = "ikolearn-iko-hints";
  function hintsMode() { try { var v = localStorage.getItem(IKO_HINTS); return v === "off" || v === "more" ? v : "on"; } catch (e) { return "on"; } }
  function hintsOn() { return hintsMode() !== "off"; }
  function setHints(on) {
    var v = on === "more" ? "more" : on === "off" || on === false ? "off" : "on";
    try { localStorage.setItem(IKO_HINTS, v); } catch (e) {}
    if (v === "off") { clearTimeout(iko.tipT); clearTimeout(iko.poolT); if (!el.ikoLine.hidden) ikoLine(""); }
  }
  function ikoPop(kind) {
    if (!motionOK() || el.ikoWrap.hidden) return;
    var cls = kind === "earn" ? "react-earn" : kind === "grow" ? "react-grow" : "pop";
    el.iko.classList.remove("pop", "react-earn", "react-grow");
    void el.iko.offsetWidth;
    el.iko.classList.add(cls);
    clearTimeout(iko.popT);
    iko.popT = setTimeout(function () { el.iko.classList.remove("pop", "react-earn", "react-grow"); }, 700);
  }
  function openAsk() { return state.thread.filter(function (m) { return m.role === "ask" && !m.done && m.open && askHandlers[m.id]; })[0] || null; }
  /* what is on screen: { view, step?, topic?, id? } */
  function screenCtx() {
    var n;
    /* the cloud is on top of whatever it was opened over */
    if (!el.cloud.hidden) {
      var a = openAsk();
      if (a && (a.kind === "curious" || a.kind === "grow")) return { view: "intake", step: a.kind === "grow" ? "grow" : "first" };
      if (!el.panel.hidden && (n = nodeOf(state.panelNode))) return { view: "cloud", topic: n.label, id: n.id }; /* a topic or a subject: the focused parent */
      return { view: "cloud" };
    }
    if (!el.lesson.hidden && (n = nodeOf(state.lessonNode))) {
      if (state.mode === "test") return { view: "test", topic: n.label, id: n.id };
      var tricky = el.lClar.querySelector(".clar, .clar-opts"), check = el.phCheck.className === "on";
      return { view: "lesson", step: tricky ? "tricky" : check ? "check" : "learn", topic: n.label, id: n.id };
    }
    if (!el.hub.hidden && (n = nodeOf(state.hubNode))) return { view: "card", topic: n.label, id: n.id };
    if (!el.deck.hidden) return { view: "deck" };
    return { view: "chat" };
  }
  /* the part that is sent: the view, its step and the topic's label (no ids, nothing about the learner) */
  function screenOf(c) { var o = { view: c.view }; if (c.step) o.step = c.step; if (c.topic) o.topic = c.topic; return o; }
  function ikoAbout(c) {
    return c.view === "lesson" ? "On " + c.topic + " · lesson" : c.view === "test" ? "On " + c.topic + " · test" : c.view === "card" ? "On " + c.topic + " · its card"
      : c.view === "deck" ? "On your deck" : c.view === "intake" ? (c.step === "grow" ? "When you like" : "Getting started") : c.topic ? "On your cloud · " + c.topic : "On your cloud";
  }
  function ikoGreeting(c, o) {
    var a = openAsk();
    if (o.tricky) return "That's okay, it takes a few tries. Here's another way to see it. Tell me which part feels tricky, if you like.";
    if (a && c.step === "grow") return a.text;
    if (c.view === "intake") return "Not sure yet? Tell me a little about what you like or wonder about, or ask me anything, and we'll find a first step together.";
    if (c.topic) return "We're on " + c.topic + ". What would you like to know, or talk through?";
    if (c.view === "deck") return "Here's your deck. Ask me about any card, or what to pick up next.";
    return "Hi " + state.name + ". What's on your mind?";
  }
  function openIko(o) {
    o = o || {};
    var c = screenCtx();
    if (o.tricky && c.view === "lesson") c.step = "tricky"; /* the clarification is about to show */
    iko.ctx = c; iko.from = state.thread.length; iko.open = true;
    if (window.IkoUsage) window.IkoUsage.bump("iko_opened");
    dismissHint("iko");
    var note = storeNote.text && !el.ikoLine.hidden && el.ikoLine.textContent === storeNote.text; /* a storage note still showing */
    ikoLine("");
    if (note) storeInSheet();
    setFocus(c.id || null); /* the screen's node, or none: a node from an earlier screen never stays the focus */
    el.ikoAbout.textContent = ikoAbout(c);
    el.ikoSay.textContent = ikoGreeting(c, o);
    el.ikoSheet.classList.toggle("tricky", Boolean(o.tricky));
    if (o.tricky) el.ikoSlot.appendChild(el.lClar); /* the lesson's clarification box, moved here (it goes back on close) */
    renderIkoLog();
    el.ikoSheet.hidden = false;
    el.iko.setAttribute("aria-expanded", "true");
    renderIko();
    sideIko();
    fitIko();
    /* opens the text field on a mouse and keyboard; on touch the keyboard waits for a tap in the field (so it doesn't
       cover the sheet as it opens). Still tricky focuses the clarification instead. */
    if (!o.tricky && !coarse()) { try { el.ikoIn.focus({ preventScroll: true }); } catch { el.ikoIn.focus(); } }
  }
  /*
   * The chat's frame (PR 104): on a phone a sheet rising from below; on a wide screen a panel hanging from Iko at the top
   * left, under the header, and the page steps right to make room for it, so it never covers the reading or the deck.
   */
  var SIDE_MIN = 1100;
  function sideIko() {
    var side = iko.open && window.innerWidth >= SIDE_MIN && !el.ikoWrap.hidden && !intakeOn;
    var was = document.body.classList.contains("iko-side");
    document.body.classList.toggle("iko-side", side);
    if (was !== side && !el.panel.hidden) { cardSig = ""; requestAnimationFrame(placeCard); }
    if (!side) return;
    var bar = el.cloud.hidden ? el.chat.querySelector(".bar") : el.cloudTop, b = bar ? bar.getBoundingClientRect().bottom : 0;
    var top = Math.max(8, Math.round(Math.min(b, el.iko.getBoundingClientRect().bottom + 16)));
    document.documentElement.style.setProperty("--iko-top", top + "px");
  }
  function coarse() { return Boolean(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); }
  /*
   * The on-screen keyboard (visualViewport): the sheet sits on top of it, no taller than the visible part, so its field
   * and the latest messages stay in view; the messages scroll to the end when the keyboard comes or goes.
   */
  var ikoKbd = false;
  function fitIko() {
    var s = el.ikoSheet.style, vv = window.visualViewport;
    if (el.ikoSheet.hidden || !vv) { s.bottom = ""; s.maxHeight = ""; ikoKbd = false; return; }
    var below = Math.max(0, window.innerHeight - (vv.offsetTop + vv.height)), kbd = below > 80 && document.activeElement === el.ikoIn;
    if (kbd) { s.bottom = (below + 8) + "px"; s.maxHeight = Math.max(160, Math.min(vv.height - 16, 560)) + "px"; }
    else { s.bottom = ""; s.maxHeight = ""; }
    if (kbd !== ikoKbd) { ikoKbd = kbd; el.ikoBody.scrollTop = el.ikoBody.scrollHeight; }
  }
  if (window.visualViewport) { window.visualViewport.addEventListener("resize", fitIko); window.visualViewport.addEventListener("scroll", fitIko); }
  el.ikoIn.addEventListener("focus", function () { fitIko(); setTimeout(fitIko, 300); });
  el.ikoIn.addEventListener("blur", function () { setTimeout(fitIko, 0); });
  function closeIko() {
    if (!iko.open) return;
    iko.open = false;
    el.ikoSheet.hidden = true;
    sideIko();
    fitIko();
    el.iko.setAttribute("aria-expanded", "false");
    if (el.lClar.parentNode === el.ikoSlot) el.lFork.parentNode.insertBefore(el.lClar, el.lFork); /* back into the lesson, answers kept */
    renderIko();
    var rv = state.reveal; state.reveal = null;
    if (rv && nodeOf(rv) && !el.cloud.hidden && !state.lessonNode) openPanel(rv); /* the new node's card, now there's room */
  }
  /* the replies since the sheet opened: plain text (the whole conversation, with its chips and cards, is one tap away) */
  function renderIkoLog() {
    el.ikoLog.textContent = "";
    state.thread.slice(iko.from).forEach(function (m) {
      /* where a new topic should go (two quiet buttons) and what grew: here too, not only in the whole conversation */
      if (m.role === "place") { var pl = renderPlace(m); pl.classList.add("iko-msg"); el.ikoLog.appendChild(pl); return; }
      if (m.role === "del") { var dl = renderDel(m); dl.classList.add("iko-msg"); el.ikoLog.appendChild(dl); return; }
      if (m.role === "age") { var ag = renderAge(m); ag.classList.add("iko-msg"); el.ikoLog.appendChild(ag); return; }
      if (m.role === "grow") {
        var gp = mk("p", "iko-msg grow", m.text);
        lessonLinks(gp, m.opens && m.opens.length ? m.opens : (m.open ? [m.open] : []));
        el.ikoLog.appendChild(gp);
        return;
      }
      if (m.role !== "user" && m.role !== "model") return;
      var d = mk("div", "iko-msg " + m.role + (m.streaming ? " streaming" : ""));
      paragraphs(d, m.text || (m.streaming ? "…" : ""));
      el.ikoLog.appendChild(d);
    });
    if (el.ikoLog.lastChild) showNear(el.ikoLog.lastChild);
  }
  function ikoSize() { el.ikoIn.style.height = "auto"; el.ikoIn.style.height = Math.min(el.ikoIn.scrollHeight, 120) + "px"; }
  el.ikoIn.addEventListener("input", ikoSize);
  el.ikoIn.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ikoSubmit(); } });
  function ikoSubmit(e) {
    if (e) e.preventDefault();
    var t = el.ikoIn.value.trim();
    if (!t || state.busy) return;
    el.ikoIn.value = ""; ikoSize();
    var a = openAsk();
    if (a && a.kind === "grow" && iko.ctx && iko.ctx.step === "grow") { askHandlers[a.id](cleanAbout(t), t); renderIkoLog(); return; } /* Iko's later question, answered here */
    send(t);
  }
  el.ikoForm.addEventListener("submit", ikoSubmit);
  el.iko.addEventListener("click", function () { if (iko.open) closeIko(); else openIko(); });
  el.ikoX.addEventListener("click", function () { closeIko(); if (!el.ikoWrap.hidden) el.iko.focus(); });
  /* the whole conversation: the chat view, with its composer */
  el.ikoAll.addEventListener("click", function () {
    /* where it was opened from: Back (and Escape) return there (PR 106) */
    var back = state.lessonNode ? { v: "lesson", id: state.lessonNode } : !el.deck.hidden ? { v: "deck" } : !el.hub.hidden && state.hubNode ? { v: "hub", id: state.hubNode } : { v: "cloud" };
    closeIko();
    if (state.lessonNode) showLesson(false);
    if (!el.deck.hidden) showDeck(false);
    if (!el.hub.hidden) { el.hub.hidden = true; state.hubNode = null; el.thread.hidden = false; el.dock.hidden = false; }
    if (!el.cloud.hidden) closeCloud(); else { renderDraw(); el.input.focus(); }
    state.back = back; el.chatBack.hidden = false; /* set last: leaving those screens resets it */
    scrollDown();
  });
  function goBack() {
    var b = state.back; state.back = null;
    el.chatBack.hidden = true;
    if (!b || b.v === "cloud" || (b.id && !nodeOf(b.id))) openCloud();
    else if (b.v === "lesson") openLesson(b.id);
    else if (b.v === "hub") openHub(b.id);
    else showDeck(true);
  }
  el.chatBack.addEventListener("click", goBack);
  /*
   * Iko's bubble beside the pebble ("" hides it); it folds away on its own. Tapping it opens the full chat, like the pebble.
   * One thing at a time: a reaction or a note replaces the screen's tip, and a tip held back gets its turn afterwards.
   */
  function ikoLine(t, ms) {
    clearTimeout(iko.lineT);
    el.ikoLine.textContent = t || "";
    el.ikoLine.hidden = !t; if (t) placeIkoSoon(); /* PR 120: a new line is checked against the content at once */
    if (t) el.ikoLine.setAttribute("aria-label", "Dismiss hint: " + t);
    el.ikoLine.removeAttribute("data-tip"); el.ikoLine.removeAttribute("data-react"); el.ikoLine.removeAttribute("data-say"); el.ikoLine.removeAttribute("data-pool");
    iko.quietAt = Date.now(); poolLater(); /* PR 108: a silence starts (or is reset) here */
    if (t) clearTimeout(iko.tipT);
    if (t && ms !== 0) iko.lineT = setTimeout(function () { el.ikoLine.hidden = true; iko.quietAt = Date.now(); placeIko(); var nx = iko.after; iko.after = null; if (nx) nx(); else tipAgain(); }, ms || readMs(t)); /* 0: it stays (a hint) */
    placeIko();
  }
  /* PR 107: long enough to read, by length: about 65 ms a character, 7 to 20 s (a line that guides stays until tapped) */
  function readMs(t) { return Math.min(20000, Math.max(7000, 3500 + 65 * String(t || "").length)); }
  /* PR 106: tapping the bubble dismisses it (Enter or Space too); tapping Iko himself opens the chat. PR 107: whatever
     was waiting behind it (the grow question after the first reassurance) comes next */
  function dismissLine() { var nx = iko.after; iko.after = null; ikoLine(""); if (nx) nx(); else tipAgain(); }
  el.ikoLine.addEventListener("click", dismissLine);
  el.ikoLine.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); dismissLine(); if (!el.ikoWrap.hidden) el.iko.focus(); } });
  /* shown on the cloud (and its opening question), a lesson or test, a card and the deck; hidden in the whole conversation and on the welcome */
  function ikoScreen() { return el.welcome.hidden && !el.chat.hidden && (!el.cloud.hidden || !el.lesson.hidden || !el.deck.hidden || !el.hub.hidden); }
  function renderIko() {
    var on = ikoScreen();
    if (on) state.back = null; /* left the whole conversation some other way */
    el.chatBack.hidden = !state.back;
    var nextCtx = screenCtx();
    if (iko.open && nextCtx.view === "chat") closeIko();
    else if (iko.open && iko.ctx && nextCtx.view === iko.ctx.view && nextCtx.view !== "chat" && (nextCtx.id || "") !== (iko.ctx.id || "")) { iko.ctx = nextCtx; el.ikoAbout.textContent = ikoAbout(iko.ctx); }
    else if (iko.open && (!on || (nextCtx.id || "") !== (iko.ctx.id || ""))) closeIko(); /* the screen changed under it */
    dockIko(on);
    el.ikoWrap.hidden = !on;
    el.iko.classList.toggle("glow", on && !hintSeen("iko")); /* the first visits' cue: until Iko has been opened once (seen.h.iko, v9) */
    if (iko.open) clearTimeout(iko.tipT); /* the sheet is open: no tip (and none again on closing it) */
    else ikoTip(on ? screenCtx() : null);
    document.body.classList.toggle("iko-on", on && el.cloud.hidden);
    document.body.classList.toggle("iko-home", on && !el.cloud.hidden);
    ikoActs();
    placeIko();
  }
  /*
   * Where Iko sits (PR 104): in the header's top-left corner, as the button, beside "Your cloud" on the lesson, deck and card
   * pages and before the brand on the cloud; in the opening question's column while he asks it. His bubble hangs just
   * under him (on the cloud, over the sky; on the pages, a line of the header itself, so it never covers the page). Both
   * live in the page's own flow, so nothing drifts or leaves a gap; off screen they wait, hidden, in #iko-wrap's place.
   */
  function dockIko(on) {
    var asking = on && intakeOn, home = on && !asking && !el.cloud.hidden;
    var slot = !on ? null : asking ? $("cs-iko") : home ? $("home-iko") : $("bar-iko");
    if (slot && el.ikoWrap.parentNode !== slot) slot.appendChild(el.ikoWrap);
    if (!slot && el.ikoWrap.parentNode !== document.body) document.body.appendChild(el.ikoWrap);
    var lineAt = !on || asking ? document.body : home ? el.cloudTop : el.chat.querySelector(".bar");
    if (lineAt && el.ikoLine.parentNode !== lineAt) {
      if (!el.ikoLine.hidden && el.ikoLine.hasAttribute("data-tip")) { clearTimeout(iko.lineT); el.ikoLine.hidden = true; } /* a screen's own tip stays with its screen */
      if (lineAt === document.body) lineAt.insertBefore(el.ikoLine, el.ikoWrap.parentNode === document.body ? el.ikoWrap : null);
      else lineAt.appendChild(el.ikoLine);
    }
    document.body.classList.toggle("iko-asks", asking);
  }
  /*
   * Iko's guidance (PR 103, more of it in PR 106): a short line on each screen and stage about what to do next, or light
   * feedback, from local templates (0 calls). A screen's line shows when it opens, again on a later visit to it after a
   * pause (GAP, sessionStorage CUES), the least shown first and never the line shown last (ikolearn-iko), so it guides
   * every stage without repeating. Nudges (n) stay light: once a visit, a few times each, on return visits.
   */
  var deckN = function () { return (state.cloud.deck || []).length; }, quiet = function () { return !el.cloudHint.classList.contains("newcomer"); };
  var TIPS = {
    /* the opening question is Iko's own speech (PR 104): no bubble there. PR 126: lines know the screen, the selected node, progress, level and interests (local only). */
    cloud: [{ t: "{Tap} a node to start, or pick up where you left off.", ok: quiet },
      { t: "Pick any node to begin. {Tap} me if you'd like ideas.", ok: quiet },
      { t: "I like your cloud, it's growing!", ok: function () { return C.subjects(state.cloud).length >= 2 || deckN() >= 1; } }, "I can add new topics anytime. Just {tap} me and tell me what you're curious about.",
      { t: function () { var k = C.subjects(state.cloud).length, n = deckN(); return k + (k === 1 ? " subject" : " subjects") + " and " + n + (n === 1 ? " card" : " cards") + " so far. Your deck is up top."; }, ok: function () { return deckN() >= 1; } },
      { t: "Want to check your deck? It's up top.", n: 1, ok: function () { return deckN() >= 1; } },
      { t: nearIdea, n: 1, ok: function () { return back() && Boolean(nearIdea()); } },
      { t: function () { var ints = (C.profileOf(state.cloud).interests || []).slice(0, 2); return ints.length ? "I see " + ints.join(" and ") + " in your cloud. {Tap} me to add something beside them." : "Anything new you'd like to explore?"; }, n: 1, ok: back },
      { t: starterLine, n: 1, ok: function () { return Boolean(starterLine()); } },
      { t: function () { var lv = C.levelOf(state.cloud); return lv === "simple" ? "Lessons are kept simple for now. Change that any time in Preferences." : lv === "deeper" ? "You're on the deeper level. Say if you'd like things lighter." : ""; }, n: 1, ok: function () { return back() && C.levelOf(state.cloud) !== "standard"; } }],
    home: ["That's you, in the middle. Your subjects grow around you.", "Everything you learn grows out from here."],
    topic: [{ t: function () { var n = nodeOf(state.panelNode); return n && n.id !== "root" ? "Ready to open " + n.label + ", or want to look at something else?" : "Start a lesson when you're ready."; } },
      "Curious about this one? {Tap} me and ask anything.", "Want to go another way? {Tap} me to add another direction."],
    learn: [{ t: function () { var n = nodeOf(state.lessonNode); return n ? "Take your time with " + n.label + ". {Tap} me if a part feels unclear." : "Read along and {click} me if you have questions."; } },
      "Read the lesson first, then start the check. No rush."],
    next: [{ t: function () { var n = nodeOf(state.lessonNode); return n && C.inDeck(state.cloud, n.id) ? "That one's in your Deck now. Want to keep going on this path?" : "Nicely done! Scroll down to pick your next topic."; } },
      "Pick a path below when you're ready."],
    check: ["Get them all right and the card is yours to grow.", "No rush. Each question is about what you just read."],
    missed: ["Take it slowly. You've got this.", "Here's a fresh look. Then try the new questions."],
    test: ["An optional test on what you've finished. No pressure.", "Take your time. It's just for you."],
    deck: [{ t: "Wow, your deck is coming along.", ok: function () { return deckN() >= 2; } },
      { t: "You've got a few cards here. Any of these you want to revisit?", ok: function () { return deckN() >= 4; } },
      "{Tap} any card to keep it growing.",
      { t: function () { var n = deckN(); return n + (n === 1 ? " card" : " cards") + " so far. {Tap} me for ideas on the next."; }, ok: function () { return deckN() >= 1; } }]
  };
  var GAP = 90000; /* a screen's line comes back on a later visit to it, not on every quick hop */
  function tipWords(t) { var c = coarse(); return t.replace("{tap}", c ? "tap" : "click").replace("{Tap}", c ? "Tap" : "Click").replace("{click}", c ? "tap" : "click"); }
  var NUDGE_MAX = 3;
  function ikoMem() {
    var who = (PR && PR.current(localStorage) || {}).active || "me", all = {};
    try { all = JSON.parse(localStorage.getItem(IKO_MEM) || "{}") || {}; } catch { all = {}; }
    var m = all[who] && typeof all[who] === "object" ? all[who] : {};
    return { who: who, all: all, t: m.t && typeof m.t === "object" ? m.t : {}, r: m.r && typeof m.r === "object" ? m.r : {}, last: typeof m.last === "string" ? m.last : "" };
  }
  function ikoKeep(m) { m.all[m.who] = { t: m.t, r: m.r, last: m.last }; try { localStorage.setItem(IKO_MEM, JSON.stringify(m.all)); } catch { /* full: Iko just repeats less carefully */ } }
  function back() { return (C.profileOf(state.cloud).visits || 0) >= 2; } /* a return visit */
  /* a quiet idea from the cloud itself: the top unfinished topic next to something already there */
  function starterLine() {
    if (C.subjects(state.cloud).length >= P.STARTER.maxSubjects) return "";
    var t = P.mixStarters(state.cloud, [], coarseArea())[0];
    return t ? "Curious about " + t + "? {Tap} me and tell me, and I'll add it." : "";
  }
  function nearIdea() {
    var n = topIds().map(nodeOf).filter(function (x) { return x && x.parent && nodeOf(x.parent) && !C.inDeck(state.cloud, x.id); })[0];
    return n ? "Maybe " + n.label + " next? It's right beside " + nodeOf(n.parent).label + "." : "";
  }
  function tipOf(c) {
    if (!c) return "";
    if (c.view === "cloud") return state.panelNode === "root" && !el.panel.hidden ? "home" : c.topic ? "topic" : "cloud";
    if (c.view === "lesson") { var ph = lessonPhase(c.id); return c.step === "tricky" ? "" : ph === "learn" ? "learn" : ph === "check" ? "check" : ph === "missed" ? "missed" : ph === "passed" ? "next" : ""; }
    return TIPS[c.view] ? c.view : "";
  }
  function tipsShown() { try { return JSON.parse(sessionStorage.getItem(CUES) || "{}") || {}; } catch { return {}; } }
  function pickTip(key) {
    var m = ikoMem(), list = TIPS[key] || [], best = -1;
    var nudged = tipsShown().n;
    list.forEach(function (x, i) { var id = key + i, n = m.t[id] || 0; if ((x.n && (n >= NUDGE_MAX || nudged)) || id === m.last || (x.ok && !x.ok())) return; if (best < 0 || n < (m.t[key + best] || 0)) best = i; });
    var b = list[best];
    return best < 0 ? null : { id: key + best, nudge: Boolean(b.n), text: tipWords(String(typeof b.t === "function" ? b.t() : b.t || b).replace("{name}", state.name || "there")), m: m };
  }
  function ikoTip(c) {
    if (startLayerOpen()) { clearTimeout(iko.tipT); return; }
    var key = tipOf(c);
    if (key === iko.tipKey) return;
    iko.tipKey = key;
    if (!el.ikoLine.hidden && el.ikoLine.hasAttribute("data-tip")) { iko.after = null; ikoLine(""); } /* past its step: the hint goes */
    else if (!el.ikoLine.hidden && el.ikoLine.getAttribute("data-react") === "start" && key && !/^(cloud|home)$/.test(key)) { var nx = iko.after; iko.after = null; ikoLine(""); if (nx) nx(); } /* the first reassurance: until tapped or the learner starts */
    clearTimeout(iko.tipT);
    if (!key) return;
    iko.tipT = setTimeout(function () { showTip(key); }, 450); /* once the new screen has settled */
  }
  var ABOUT = {
    cloud: { k: "aboutCloud", t: "This is your cloud: everything you learn grows here, around your name. {Tap} a node to start." },
    lesson: { k: "aboutLesson", t: "This is a lesson: read it, check yourself with a few questions, then earn its card." },
    deck: { k: "aboutDeck", t: "This is your deck: every card you earn lives here, and it keeps growing as you learn." }
  };
  function tipFresh(k) { return Date.now() - (Number(tipsShown()[k]) || 0) >= (hintsMode() === "more" ? 30000 : GAP); }
  function tipAgain() { var k = iko.tipKey; if (k && !iko.open && tipFresh(k)) { clearTimeout(iko.tipT); iko.tipT = setTimeout(function () { showTip(k); }, 700); } }
  /* a hint stays until it is tapped away or the learner moves past its step (PR 105, PR 106) */
  function tipLine(t, id) {
    if (!hintsOn()) return;
    ikoLine(t, 0);
    el.ikoLine.setAttribute("data-tip", id);
    ikoPop("hint");
  }
  function showTip(key) {
    if (startLayerOpen()) return;
    if (!hintsOn()) return;
    if (key !== iko.tipKey || iko.open || el.ikoWrap.hidden || !el.ikoLine.hidden || !state.cloud || !tipFresh(key)) return; /* Iko is speaking (or gone), or this screen had its line a moment ago */
    /* PR 107: the first visit to the cloud, a lesson or the deck: one short line on what that screen is for (once each, seen.h) */
    var ab = ABOUT[/^(cloud|home|topic)$/.test(key) ? "cloud" : key === "deck" ? "deck" : /^(learn|check|missed|next|test)$/.test(key) ? "lesson" : ""];
    if (ab && !hintSeen(ab.k)) {
      dismissHint(ab.k);
      var d0 = tipsShown(); d0[key] = Date.now();
      try { sessionStorage.setItem(CUES, JSON.stringify(d0)); } catch { /* ignore */ }
      tipLine(tipWords(ab.t), ab.k);
      return;
    }
    var tip = pickTip(key);
    if (!tip) return;
    var d = tipsShown(); d[key] = Date.now(); if (tip.nudge) d.n = 1;
    try { sessionStorage.setItem(CUES, JSON.stringify(d)); } catch { /* ignore */ }
    tip.m.t[tip.id] = (tip.m.t[tip.id] || 0) + 1; tip.m.last = tip.id; ikoKeep(tip.m);
    tipLine(tip.text, tip.id);
  }
  /*
   * PR 108: fewer long silences. After POOL.gapMs with nothing said on a screen Iko is on (not mid-check, not while his
   * sheet is open), one short line from a local pool: a deck reminder, how to find or add topics, an idea right beside
   * something already learned or a popular starter for the learner's age band and coarse area (both taken with a tap on
   * "Yes"), or what this screen is for. Never the same line twice in a row, at most POOL.max a visit, tap to dismiss.
   * 0 calls: all from local templates and what is already on the device (a "Yes" asks Iko, like typing it would).
   */
  var POOL = { gapMs: Number(window.__IKO_POOL_MS) || 45000, max: 8 }; /* (the e2e shortens the wait) */
  function poolLines(key) {
    var out = [], n = deckN(), k = C.subjects(state.cloud).length, cloudish = /^(cloud|home|topic)$/.test(key);
    if (n >= 1) out.push({ id: "deck", t: n + (n === 1 ? " card" : " cards") + " in your deck. Each one keeps growing when you go back to it." });
    if (n >= 3) out.push({ id: "deck2", t: "Look at that deck go. Nice steady work." });
    out.push({ id: "tell", t: "Into something new lately? {Tap} me and say it, and I'll grow a branch for it." });
    if (cloudish) out.push({ id: "find", t: "The faint nodes are ideas waiting. {Tap} one to start it." });
    if (cloudish && k >= 1) {
      var nb = topIds().map(nodeOf).filter(function (x) { return x && x.parent && nodeOf(x.parent) && !C.inDeck(state.cloud, x.id); })[0];
      if (nb) out.push({ id: "near:" + nb.id, t: "Maybe " + nb.label + " next? It's right beside " + nodeOf(nb.parent).label + ".", yes: function () { openPanel(nb.id); } });
    }
    var pop = (P.mixStarters ? P.mixStarters(state.cloud, [], coarseArea()) : []).filter(function (x) { return typeof x === "string" && x; });
    if (pop.length) { var pt = pop[Math.floor(Math.random() * Math.min(4, pop.length))]; out.push({ id: "pop:" + pt, t: "Lots of learners enjoy " + pt + ". Want it in your cloud?", yes: function () { openIko(); el.ikoIn.value = "I'm curious about " + pt; ikoSubmit(); } }); }
    var ab = ABOUT[cloudish ? "cloud" : key === "deck" ? "deck" : /^(learn|next)$/.test(key) ? "lesson" : ""];
    if (ab) out.push({ id: "about:" + key, t: ab.t });
    if (key === "learn") out.push({ id: "learn", t: "Take your time with this one. Continue when it clicks." });
    if (key === "next") out.push({ id: "next", t: "Good going. Another topic is waiting just below." });
    return out;
  }
  function poolLater() { if (!POOL) return; clearTimeout(iko.poolT); iko.poolT = setTimeout(poolSay, Math.max(1000, POOL.gapMs - (Date.now() - iko.quietAt))); } /* (not before the pool exists) */
  function poolSay() {
    var key = iko.tipKey;
    if (!hintsOn()) { iko.quietAt = Date.now(); poolLater(); return; }
    if (!el.ikoLine.hidden || Date.now() - iko.quietAt < POOL.gapMs - 50) { poolLater(); return; }
    if (iko.poolN >= POOL.max || iko.open || el.ikoWrap.hidden || intakeOn || startLayerOpen() || !state.cloud || state.busy || !key || /^(check|missed|test)$/.test(key) || (document.hidden)) { iko.quietAt = Date.now(); poolLater(); return; }
    var m = ikoMem(), list = poolLines(key).filter(function (x) { return x.id !== iko.poolLast && x.id !== m.last; });
    if (!list.length) { iko.quietAt = Date.now(); poolLater(); return; }
    var pick = list[Math.floor(Math.random() * list.length)];
    iko.poolN += 1; iko.poolLast = pick.id; m.last = pick.id; ikoKeep(m);
    ikoLine(tipWords(pick.t));
    el.ikoLine.setAttribute("data-pool", pick.id);
    ikoPop("hint");
    if (pick.yes) {
      var y = mk("button", "iko-yes", "Yes");
      y.type = "button"; y.setAttribute("aria-label", "Yes: " + pick.t);
      y.addEventListener("click", function (e) { e.stopPropagation(); ikoLine(""); pick.yes(); });
      el.ikoLine.appendChild(document.createTextNode(" ")); el.ikoLine.appendChild(y);
    }
  }
  /*
   * Short reactions to real moments (PR 103): the cloud grows, a card is earned, a check is passed. Every time at first, then
   * less often as they become familiar: the first REACT_EVERY[0] times, then every 3rd up to 12, then every 8th.
   */
  var REACT = {
    grow: ["Your cloud just grew.", "New branches to explore.", "Look, more room to grow."],
    earn: ["A new card for your deck!", "That card is yours now.", "Another one in your deck."],
    pass: ["All right! Well done.", "You've got it. Nicely done.", "That's understanding."],
    start: ["Lovely start. You can add more any time, and there are no wrong picks: your cloud grows and changes with you. Add things a few at a time and watch here to see what's growing."]
  };
  var REACT_EVERY = [3, 12];
  function reactWanted(n) { return n <= REACT_EVERY[0] || (n <= REACT_EVERY[1] ? n % 3 === 0 : n % 8 === 0); }
  function ikoReact(kind) {
    var m = ikoMem(), n = (m.r[kind] = (m.r[kind] || 0) + 1);
    ikoKeep(m);
    var list = REACT[kind] || [];
    if (!list.length || !(kind === "earn" || reactWanted(n)) || (kind === "start" && n > 1)) return false; /* a card earned: always a light word (PR 106) */
    if (!hintsOn() && kind !== "start") { ikoPop(kind === "earn" || kind === "grow" ? kind : "hint"); return false; } /* muted: still a quiet nod on earn/grow */
    var t = list[(n - 1) % list.length];
    if (kind === "earn" && nextBelow()) t += " Scroll down to pick another topic.";
    if (!el.ikoLine.hidden && !el.ikoLine.hasAttribute("data-tip") && !el.ikoLine.hasAttribute("data-react")) return false; /* Iko is saying something that matters (the grow question): no reaction over it */
    if (iko.open || el.ikoWrap.hidden) { iko.pendingReact = t; return true; } /* said once the pebble is back */
    var held = !el.ikoLine.hidden && el.ikoLine.getAttribute("data-tip"), was = { t: el.ikoLine.textContent, k: iko.tipKey };
    ikoLine(t, kind === "start" ? 0 : Math.max(6500, Math.min(14000, 3000 + 60 * t.length))); /* PR 107: the first reassurance stays until tapped (or the learner starts); others fold, a little later */
    if (held) iko.after = function () { if (iko.tipKey === was.k && !iko.open) tipLine(was.t, held); }; /* the hint wasn't dismissed: it comes back */
    el.ikoLine.setAttribute("data-react", kind);
    ikoPop(kind === "earn" || kind === "grow" ? kind : "hint");
    return true;
  }

  /* opened by Still tricky, the sheet covers the lesson's buttons on a phone, so it carries "I've got it" itself */
  function ikoActs() { el.ikoActs.hidden = !(iko.open && el.ikoSheet.classList.contains("tricky") && !el.lesson.hidden && !el.lDone.hidden && !el.lGot.hidden && Boolean(el.lClar.querySelector(".clar-opts"))); }
  /* the bubble steps aside at once if it would touch the selection card or a confirm, and waits while Iko asks the opening question */
  function placeIko() {
    var on = !el.ikoWrap.hidden && el.ikoWrap.getClientRects().length, talking = false;
    if (on && !el.ikoLine.hidden) {
      var line = el.ikoLine.getBoundingClientRect(), over = function (e) { if (!e || e.hidden || !e.getClientRects().length) return false; var r = e.getBoundingClientRect(); return r.width && r.left < line.right && r.right > line.left && r.top < line.bottom && r.bottom > line.top; };
      /* PR 120: never over lesson or check text: any visible heading, paragraph, question or option under the line hides it */
      var overText = function (root) { if (!root || root.hidden || !root.getClientRects().length) return false; return [].some.call(root.querySelectorAll("h1, h2, h3, p, legend, label, li, pre, button"), over); };
      if (intakeOn || (line.width && (over(el.cloud.hidden ? null : el.panel) || over(el.ikc) || overText(el.lesson) || overText(el.deck) || overText(el.hub)))) { clearTimeout(iko.lineT); el.ikoLine.hidden = true; }
      else talking = true;
    }
    if (on && !intakeOn && iko.pendingReact && !iko.open) { var pr = iko.pendingReact; iko.pendingReact = null; setTimeout(function () { ikoLine(pr, 4500); }, 300); }
    document.body.classList.toggle("iko-talking", talking);
    if (iko.open) sideIko();
  }
  var ikoRaf = 0;
  function placeIkoSoon() { if (!ikoRaf) ikoRaf = requestAnimationFrame(function () { ikoRaf = 0; placeIko(); }); }
  window.addEventListener("resize", placeIkoSoon);
  window.addEventListener("scroll", placeIkoSoon, { passive: true, capture: true }); /* PR 120: re-check as the lesson scrolls under it */
  /* every change of screen (a view shown or hidden, the card opened or closed) re-checks Iko */
  if (window.MutationObserver) {
    var ikoWatch = new MutationObserver(function () { renderIko(); });
    [el.welcome, el.chat, el.cloud, el.lesson, el.deck, el.hub, el.panel, el.cs].forEach(function (e) { if (e) ikoWatch.observe(e, { attributes: true, attributeFilter: ["hidden"] }); });
  }

  /* ---------- the deck and today's draw ---------- */
  function deckIds() {
    var order = {};
    C.subjects(state.cloud).forEach(function (s, i) { order[s.label] = i; });
    /* a card merged into a parent card lives in that card's corpus, not loose in the grid */
    return (state.cloud.deck || []).filter(function (e) { var p = C.absorbedInto(state.cloud, e.id); return !(p && C.inDeck(state.cloud, p)); }).sort(function (a, b) {
      var sa = order[a.subject] == null ? 99 : order[a.subject], sb = order[b.subject] == null ? 99 : order[b.subject];
      return sa - sb || a.at - b.at;
    }).map(function (e) { return e.id; });
  }
  /* A card tapped in the deck or the draw: it slides into the holder and its lesson opens (one call, or none if cached). */
  function openCard(id, src) {
    if (!nodeOf(id)) return;
    dismissHint("card"); /* they picked a card: the tip has done its job */
    var from = src && src.getBoundingClientRect ? src.getBoundingClientRect() : null;
    openLesson(id, false, from);
  }
  function topIds() { return R ? R.top(state.cloud).map(function (r) { return r.id; }) : []; }
  function renderDeckButton() {
    var n = (state.cloud.deck || []).length;
    el.deckBtn.hidden = true; /* PR 108: the mini-Deck's icon and count say it (with its aria-label); no "Your deck · n" beside it */
    el.deckBtn.textContent = "Your deck · " + n;
    if (el.cloudDeck) renderHomeNav();
    renderMiniDeck();
  }
  /*
   * The mini-Deck in the header, beside the cloud thumbnail: a small fanned stack of the learner's best cards (highest
   * tier, colour and merge level first), drifting gently; a soft pulse when a card joins or rises. Tapping it opens the
   * album. With no cards yet it is an empty dashed slot. Motion respects prefers-reduced-motion (CSS).
   */
  var miniSig = null;
  function miniDeckCards() {
    return deckIds().map(function (id) { return D.cardSpec(state.cloud, id); }).filter(Boolean)
      .sort(function (a, b) { return D.evolveKey(b) - D.evolveKey(a); }).slice(0, 3);
  }
  function renderMiniDeck() {
    if (!el.miniDeck) {
      el.miniDeck = mk("button", "minideck");
      el.miniDeck.type = "button";
      el.miniDeck.addEventListener("click", function () { showDeck(true); });
      el.thumb.parentNode.insertBefore(el.miniDeck, el.barRet); /* PR 107: the deck is always the far-right widget */
    }
    var cards = miniDeckCards(), n = (state.cloud.deck || []).length;
    var sig = n + ":" + cards.map(function (c) { return D.evolveKey(c); }).join(",");
    var rise = miniSig !== null && sig !== miniSig && (n > Number(miniSig.split(":")[0]) || cards.reduce(function (a, c) { return a + D.evolveKey(c); }, 0) > miniSig.split(":")[1].split(",").reduce(function (a, k) { return a + (Number(k) || 0); }, 0));
    miniSig = sig;
    deckFan(el.miniDeck, cards, n);
    renderRet();
    if (rise && motionOK() && !state.flying) pulseDeck(); /* a card in flight pulses it when it lands */
  }
  /* the fanned stack with its count: the header's mini-Deck and (PR 103) the same on the cloud */
  function deckFan(btn, cards, n) {
    btn.textContent = "";
    btn.classList.toggle("empty", !cards.length);
    btn.setAttribute("aria-label", n ? "Your deck, " + n + (n === 1 ? " card" : " cards") + ". Open the album" : "Your deck (no cards yet). Open the album");
    btn.title = n ? "Your deck · " + n : "Your deck";
    var fan = mk("span", "md-fan");
    if (!cards.length) fan.appendChild(mk("span", "md-card md-slot"));
    cards.slice().reverse().forEach(function (sp, i, all) {
      var c = mk("span", "md-card t" + sp.tier + (sp.level ? " merged" : ""));
      c.style.setProperty("--i", String(all.length - 1 - i)); /* 0 = the front card */
      c.style.setProperty("--n", String(all.length));
      var art = D.artSvg(document, sp);
      if (art) c.appendChild(art);
      fan.appendChild(c);
    });
    btn.appendChild(fan);
    if (n) btn.appendChild(mk("span", "md-n", String(n)));
  }
  /*
   * PR 107: "Return to <topic>", the way back to the last lesson or card. It takes the place of the widget for the screen
   * you are on: on the cloud, where the cloud's thumbnail would be (left of the deck); on the deck, where the deck would
   * be. Every other screen has the cloud and the deck in the same places. Hidden until there is a lesson or card to go
   * back to (C.lastOf: the profile's pointer, kept in the cloud).
   */
  function retTarget() {
    var l = state.cloud && C.lastOf(state.cloud), n = l && nodeOf(l.id);
    return n ? { id: l.id, card: l.kind === "card" && C.inDeck(state.cloud, l.id), label: n.label } : null;
  }
  function renderRet() {
    if (!el.barRet) return;
    var r = retTarget(), onDeck = !el.deck.hidden;
    [el.cloudRet, el.barRet].forEach(function (b) {
      b.textContent = r ? "Return to " + r.label : "";
      if (r) { b.title = "Return to " + r.label; b.setAttribute("aria-label", "Return to " + r.label + (r.card ? " (its card)" : " (its lesson)")); }
    });
    el.cloudRet.hidden = !r;
    el.barRet.hidden = !(r && onDeck);
    if (el.miniDeck) el.miniDeck.hidden = onDeck;
  }
  function goRet() {
    var r = retTarget();
    if (!r) return;
    if (r.card) openHub(r.id, null, el.deck.hidden ? "cloud" : "deck");
    else openLesson(r.id, false);
  }
  function markLast(id, kind) {
    if (!nodeOf(id) || id === "root") return;
    C.setLast(state.cloud, id, kind, Date.now());
    save();
    renderRet();
  }
  el.cloudRet.addEventListener("click", goRet);
  el.barRet.addEventListener("click", goRet);
  function pulseDeck() { if (!el.miniDeck || !motionOK()) return; el.miniDeck.classList.remove("pulse"); void el.miniDeck.offsetWidth; el.miniDeck.classList.add("pulse"); }
  /*
   * Earned: after "I've got it", the lesson's card (in the Deck now) flies up and shrinks into the Deck in the header,
   * then the Deck gives a small pulse. Only a copy flies: the real card stays in the holder, and the progress was saved
   * before it starts. With reduced motion there is no flight and no pulse; the count in the Deck simply updates.
   */
  function flyToDeck(id) {
    var card = el.lCard.firstElementChild;
    state.flying = Boolean(card && card.animate && C.inDeck(state.cloud, id) && motionOK());
    renderDeckButton(); /* the Deck's count goes up now; its pulse waits for the card */
    var to = el.miniDeck && el.miniDeck.getClientRects().length ? el.miniDeck : null;
    if (!state.flying) return;
    var a = card.getBoundingClientRect();
    /* PR 107: never scroll for it (that was the jump to the top on phones): off screen, it flies in from the button instead */
    if (a.bottom < 0 || a.top > window.innerHeight) {
      var g = el.lStatus.getBoundingClientRect(), cw = Math.min(a.width, 120), ch = a.height * cw / (a.width || 1);
      a = { left: Math.max(8, g.left), top: Math.max(8, Math.min(window.innerHeight - ch - 8, g.top - ch / 2)), width: cw, height: ch, bottom: g.top + ch / 2 };
    }
    var b = to ? to.getBoundingClientRect() : null;
    if (!b || !a.width || !b.width || a.bottom < 0 || a.top > window.innerHeight) { state.flying = false; pulseDeck(); return; }
    var ghost = card.cloneNode(true);
    ghost.removeAttribute("id"); [].forEach.call(ghost.querySelectorAll("[id]"), function (x) { x.removeAttribute("id"); });
    ghost.classList.add("fly-card"); ghost.setAttribute("aria-hidden", "true");
    ghost.style.cssText = "position:fixed;left:" + a.left + "px;top:" + a.top + "px;width:" + a.width + "px;height:" + a.height + "px;margin:0;z-index:40;pointer-events:none;transform-origin:0 0;overflow:hidden";
    document.body.appendChild(ghost);
    var k = Math.min(b.width / a.width, b.height / a.height) * 0.9, dx = b.left + b.width / 2 - (a.left + (a.width * k) / 2), dy = b.top + b.height / 2 - (a.top + (a.height * k) / 2);
    state.flying = true;
    var anim = ghost.animate([
      { transform: "translate(0px, 0px) scale(1) rotate(0deg)", opacity: 1 },
      { transform: "translate(" + Math.round(dx * 0.35) + "px, " + Math.round(dy * 0.35 - 36) + "px) scale(" + ((1 + k) / 2).toFixed(3) + ") rotate(-5deg)", opacity: 1, offset: 0.4 },
      { transform: "translate(" + Math.round(dx) + "px, " + Math.round(dy) + "px) scale(" + k.toFixed(3) + ") rotate(0deg)", opacity: 0.2 }
    ], { duration: 950, easing: "cubic-bezier(.45,.05,.3,1)" });
    var land = function () { if (!ghost.isConnected) return; ghost.remove(); state.flying = false; pulseDeck(); };
    anim.onfinish = land; anim.oncancel = land;
  }

  /* ---------- newcomer hints: three, each shown once at its moment, dismissible; remembered in ikolearn.v1.seen (h) ---------- */
  var HINTS = {
    cloud: "Tap a branch and the cloud grows with you.",
    card: "Pick or draw a card to open a short lesson.",
    deck: "Cards are achievements: they stay in your Deck and gain colour as you learn."
  };
  function hintSeen(k) { return Boolean(state.seen.h && state.seen.h[k]); }
  function dismissHint(k) {
    if (hintSeen(k)) return;
    state.seen.h = state.seen.h || {};
    state.seen.h[k] = 1;
    saveSeen();
  }
  function hintEl(k, onGone) {
    if (hintSeen(k)) return null;
    var p = mk("p", "hint");
    p.setAttribute("data-hint", k);
    p.appendChild(mk("span", null, HINTS[k]));
    var x = linkBtn("Got it", function () { dismissHint(k); p.remove(); if (onGone) onGone(); }, "link hint-x");
    x.setAttribute("aria-label", "Got it, hide this tip");
    p.appendChild(x);
    return p;
  }
  /*
   * The movement line (PR 106): a tap hides it for good, and so does trying both gestures (a drag, and a zoom by
   * pinch, wheel or the buttons). Kept on this device (ikolearn-moves), outside every learner's data.
   */
  function moves() { try { return JSON.parse(localStorage.getItem("ikolearn-moves") || "{}") || {}; } catch { return {}; } }
  function movesDone() { var m = moves(); return Boolean(m.x || (m.drag && m.zoom)); }
  function moved(k) {
    if (k === "zoom") maybeZoomList(); /* a pinch or scroll that comes in close opens the list (phones hide + and −) */
    var m = moves();
    if (m[k]) return;
    m[k] = 1;
    try { localStorage.setItem("ikolearn-moves", JSON.stringify(m)); } catch { /* private mode: this visit only */ }
    if (movesDone()) renderCloudHint();
    renderZoomHint();
  }
  /* PR 107: on a phone the controls are one small quiet icon (it recentres); it moves softly until the gestures are known */
  function renderZoomHint() { var z = el.zreset && el.zreset.parentNode; if (z) z.classList.toggle("learnt", movesDone()); }
  renderZoomHint();
  el.cloudHint.addEventListener("click", function (e) { if (!el.cloudHint.classList.contains("newcomer") && !(e.target.closest && e.target.closest("button"))) moved("x"); });
  el.cloudHint.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && el.cloudHint.classList.contains("moves")) { e.preventDefault(); moved("x"); } });
  /* the cloud's own line: the first tip until it is dismissed (or a branch is tapped), then the controls line */
  function renderCloudHint() {
    if (!el.cloudHint) return;
    el.cloudHint.textContent = "";
    var h = state.cloud && C.subjects(state.cloud).length ? hintEl("cloud", renderCloudHint) : null; /* (at load there is no cloud yet) */
    el.cloudHint.classList.toggle("newcomer", Boolean(h));
    if (h) { while (h.firstChild) el.cloudHint.appendChild(h.firstChild); return; }
    el.cloudHint.textContent = CAM && !movesDone() ? CAM.hint(Boolean(window.matchMedia && window.matchMedia("(pointer: coarse)").matches)) : "";
    el.cloudHint.classList.toggle("moves", Boolean(el.cloudHint.textContent));
    if (el.cloudHint.textContent) { el.cloudHint.title = "Tap to hide"; el.cloudHint.setAttribute("role", "button"); el.cloudHint.tabIndex = 0; el.cloudHint.setAttribute("aria-label", el.cloudHint.textContent + ". Dismiss"); }
    else { el.cloudHint.removeAttribute("title"); el.cloudHint.removeAttribute("role"); el.cloudHint.removeAttribute("tabindex"); el.cloudHint.removeAttribute("aria-label"); }
  }
  function showDeck(on) {
    if (on && state.lessonNode) showLesson(false);
    if (on) el.hub.hidden = true;
    var was = !el.deck.hidden;
    el.deck.hidden = !on;
    el.thread.hidden = on;
    el.dock.hidden = on;
    if (on) { el.draw.hidden = true; renderDeck(!was); window.scrollTo(0, 0); } else { renderDraw(); scrollDown(); }
    renderRet();
  }
  var motionOK = function () { return !(reduceMotion && reduceMotion.matches); };
  function viewIn(node) {
    if (!motionOK()) return;
    node.classList.remove("view-in"); void node.offsetWidth; node.classList.add("view-in");
  }
  /* Card lift (FLIP): measure where it was tapped and where it lands, play the difference back to none. */
  function liftCard(card, from) {
    if (!card || !card.animate || !from || !from.width || !motionOK()) return;
    var to = card.getBoundingClientRect();
    if (!to.width) return;
    card.style.transformOrigin = "0 0";
    card.animate([
      { transform: "translate(" + Math.round(from.left - to.left) + "px, " + Math.round(from.top - to.top) + "px) scale(" + (from.width / to.width).toFixed(3) + ")", filter: "drop-shadow(0 10px 12px rgba(60,40,20,.25))" },
      { transform: "translateY(-6px) scale(1.01)", filter: "drop-shadow(0 12px 14px rgba(60,40,20,.22))", offset: 0.7 },
      { transform: "none", filter: "drop-shadow(0 1px 1px rgba(60,40,20,0))" }
    ], { duration: 560, easing: "cubic-bezier(.2,.7,.2,1)" });
  }

  /* ---------- the card hub ---------- */
  /* from: where Back goes ("deck", "cloud", "chat", or the card's id you came from) */
  function openHub(id, src, from) {
    if (!nodeOf(id) && !C.inDeck(state.cloud, id)) return;
    cancelNav();
    var rect = src && src.getBoundingClientRect ? src.getBoundingClientRect() : null;
    if (!el.cloud.hidden) closeCloud(true);
    if (state.lessonNode) showLesson(false);
    state.hubNode = id; state.hubFrom = from || "deck";
    el.deck.hidden = true; el.thread.hidden = true; el.dock.hidden = true; el.draw.hidden = true;
    el.hub.hidden = false;
    markLast(id, "card");
    renderRet();
    renderHub(true);
    window.scrollTo(0, 0);
    viewIn(el.hub.querySelector(".hub-info"));
    liftCard(el.hubCard.firstElementChild, rect);
  }
  function hubBack() {
    var from = state.hubFrom, id = state.hubNode;
    el.hub.hidden = true; state.hubNode = null;
    if (from && from !== "deck" && from !== "cloud" && from !== "chat" && (nodeOf(from) || C.inDeck(state.cloud, from))) return openHub(from, null, "deck");
    if (from === "cloud" && nodeOf(id)) { el.thread.hidden = false; el.dock.hidden = false; openCloud(); return; }
    if (from === "chat") { el.thread.hidden = false; el.dock.hidden = false; renderDraw(); scrollDown(); return; }
    showDeck(true);
  }
  el.hubBack.addEventListener("click", hubBack);
  function hubKidAction(cid, cv) {
    var lesson = state.lessons[cid];
    return cv.state === "covered" ? (lesson ? "Review" : "Lesson") : lesson || cv.state === "progress" ? "Continue" : "Start";
  }
  function renderHub(opening) {
    var id = state.hubNode, n = nodeOf(id), sp = D.cardSpec(state.cloud, id);
    if (!sp) return;
    el.hubBack.textContent = state.hubFrom === "cloud" ? "Back to your cloud" : state.hubFrom === "chat" ? "Back to Iko" : state.hubFrom && state.hubFrom !== "deck" && nodeOf(state.hubFrom) ? "Back to " + nodeOf(state.hubFrom).label : "Back to your deck";
    cloudBack(el.hubBack);
    el.hubCrumb.textContent = "";
    var anc = n ? C.ancestry(state.cloud, id).slice(0, -1) : [];
    el.hubCrumb.appendChild(linkBtn("Deck", function () { el.hub.hidden = true; state.hubNode = null; showDeck(true); }));
    anc.forEach(function (aid) {
      el.hubCrumb.appendChild(mk("span", "sep", "›"));
      el.hubCrumb.appendChild(linkBtn(nodeOf(aid).label, function () { openHub(aid, null, id); }));
    });
    if (!n && sp.chain.length > 1) el.hubCrumb.appendChild(mk("span", "sep", "› " + sp.chain.slice(0, -1).join(" › ")));
    el.hubCard.textContent = "";
    var card = D.render(document, sp, { size: "full" });
    markEvolve(card, sp);
    el.hubCard.appendChild(card);
    saveSeen();
    el.hubTitle.textContent = sp.label;
    var cv = D.coverage(state.cloud, id) || { state: "uncovered", text: "" };
    el.hubState.textContent = "";
    var st = mk("span"); st.appendChild(mk("span", "cov-dot " + cv.state)); st.appendChild(document.createTextNode(cv.text)); el.hubState.appendChild(st);
    el.hubState.appendChild(mk("span", null, sp.tierName + (sp.inDeck ? " · in your deck" : " · not in your deck yet")));
    if (sp.after.length) el.hubState.appendChild(mk("span", "after", "Best after " + D.listOf(sp.after)));
    if (sp.absorbedInto && nodeOf(sp.absorbedInto)) { var mi = mk("span", null, "Merged into "); mi.appendChild(linkBtn(nodeOf(sp.absorbedInto).label, function () { openHub(sp.absorbedInto, null, id); })); el.hubState.appendChild(mi); }
    var took = sp.inDeck && takeawayOf(id);
    el.hubNote.textContent = took ? "You learned: " + took : sp.blurb || (n && n.ghost ? "A suggested branch you haven't opened yet." : ""); /* PR 108: the key idea, not a generic line */
    el.hubLesson.hidden = !n;
    el.hubLesson.textContent = state.lessons[id] ? (cv.state === "covered" ? "Review the lesson" : "Continue the lesson") : "Start the lesson";
    var tst = n && P.testState(state.cloud, id);
    el.hubTest.hidden = !(tst && (tst.ready || tst.taken));
    if (tst) { el.hubTest.textContent = tst.ready ? (tst.taken ? "Test again" : "Take the test") : "Test taken"; el.hubTest.disabled = state.busy || !tst.ready; }
    el.hubCloud.hidden = !n;
    el.hubCorpus.textContent = "";
    /* the corpus, unless every card in it is already listed below as a merged-in branch */
    var kidIds = n ? C.childrenOf(state.cloud, id).map(function (k) { return k.id; }) : [];
    if (sp.corpus.some(function (x) { return kidIds.indexOf(x.id) < 0; })) el.hubCorpus.appendChild(D.renderCorpus(document, state.cloud, id, { onOpen: function (cid, src) { openHub(cid, src, id); } }));
    renderHubKids(id, opening);
  }
  function renderHubKids(id, opening) {
    el.hubKids.textContent = "";
    el.hubKids.classList.toggle("opening", Boolean(opening) && motionOK());
    if (!nodeOf(id)) return;
    var hk = D.hubChildren(state.cloud, id, { core: P.orderedChildren(state.cloud, id), side: P.sidePaths(state.cloud, id) });
    var head = mk("div", "hk-head"), h3 = mk("h3", null, "Branches");
    head.appendChild(h3);
    head.appendChild(mk("span", "fine", hk.total ? hk.covered + " of " + hk.total + " covered" : ""));
    el.hubKids.appendChild(head);
    var leg = mk("p", "hk-legend");
    [["covered", "Covered"], ["progress", "In progress"], ["uncovered", "Not started"]].forEach(function (x) { var s = mk("span"); s.appendChild(mk("span", "cov-dot " + x[0])); s.appendChild(document.createTextNode(x[1])); leg.appendChild(s); });
    if (hk.total) el.hubKids.appendChild(leg);
    if (!hk.total && !hk.waiting.length) { el.hubKids.appendChild(mk("p", "fine", "No branches yet. They grow from this card once you've answered a question in its lesson or said “I've got it”.")); return; }
    var j = 0;
    function grid(list, label) {
      if (!list.length) return;
      if (label) el.hubKids.appendChild(mk("p", "hk-sub", label));
      var g = mk("div", "hk-grid");
      list.forEach(function (x) {
        var cell = mk("div", "hk-cell is-" + x.cov.state), go = function (cid, src) { openHub(cid, src, id); };
        cell.style.setProperty("--j", String(Math.min(j++, 12)));
        var csp = x.cov.state !== "uncovered" && C.inDeck(state.cloud, x.id) ? D.cardSpec(state.cloud, x.id) : null;
        cell.appendChild(csp ? D.render(document, csp, { onOpen: go }) : D.renderSlot(document, state.cloud, x.id, { onOpen: go }));
        var row = mk("span", "hk-cov"), lab = mk("span");
        lab.appendChild(mk("span", "cov-dot " + x.cov.state));
        lab.appendChild(document.createTextNode(x.cov.text + (x.cov.state !== "covered" && afterOf(x.id) ? " · " + afterOf(x.id) : "")));
        row.appendChild(lab);
        row.appendChild(linkBtn(hubKidAction(x.id, x.cov), function () { state.pendingFrom = id; openLesson(x.id); }));
        cell.appendChild(row);
        g.appendChild(cell);
      });
      el.hubKids.appendChild(g);
    }
    grid(hk.core, hk.side.length ? "Core path" : "");
    grid(hk.side, "Side paths");
    if (hk.waiting.length) {
      el.hubKids.appendChild(mk("p", "hk-sub", "Grow after its next lesson"));
      var w = mk("div", "hk-wait");
      hk.waiting.forEach(function (l) { w.appendChild(mk("span", null, l)); });
      el.hubKids.appendChild(w);
    }
  }
  el.hubLesson.addEventListener("click", function () { var id = state.hubNode; if (nodeOf(id)) { state.pendingFrom = id; openLesson(id, false, el.hubCard.firstElementChild && el.hubCard.firstElementChild.getBoundingClientRect()); } });
  el.hubTest.addEventListener("click", function () { var id = state.hubNode; if (nodeOf(id)) { state.lessonFrom = id; openTest(id); } });
  el.hubCloud.addEventListener("click", function () {
    var id = state.hubNode; if (!nodeOf(id)) return;
    el.hub.hidden = true; state.hubNode = null; el.thread.hidden = false; el.dock.hidden = false;
    openCloud(); openPanel(id);
  });
  function renderDeck(opening) {
    var ids = deckIds();
    refreshSuggest();
    el.dSuggest.textContent = "";
    /* (the deck's own lede says what cards are: no second tip here, PR 104) */
    el.dSuggest.appendChild(flowBlock("deck"));
    var held = (state.cloud.deck || []).length - ids.length;
    el.dLede.textContent = (ids.length === 1 ? "1 card you've earned" : ids.length + " cards you've earned") + (held ? " (plus " + held + " merged into parent cards)" : "") + ", by subject. Cards move from Sketch to Inked, Tinted and Achieved as you learn, and finished subtopics merge into their parent.";
    renderAlbum(opening);
    saveSeen();
    var rows = D.balance(state.cloud, D.dayOf(Date.now())).filter(function (r) { return r.draws; });
    el.dBalance.textContent = rows.length ? "Drawn this year: " + rows.map(function (r) { return r.subject + " " + r.draws; }).join(" · ") : "";
    renderTop();
    if (el.dTools) { el.dTools.textContent = ""; el.dTools.appendChild(cloudTools()); }
  }
  /* The album (D.albumModel): binder pages by subject; a merged lead card at double size; tap opens the hub. */
  function renderAlbum(opening) {
    el.dAlbum.textContent = "";
    el.dAlbum.classList.toggle("opening", Boolean(opening) && motionOK());
    var pages = D.albumModel(state.cloud), go = function (cid, src) { openHub(cid, src, "deck"); };
    /* PR 103: the album holds the earned cards; topics not collected yet live apart, under Still to collect */
    var collect = [];
    pages.forEach(function (pg) { pg.rows.forEach(function (r) { if (r.slots.length || r.more) collect.push({ pg: pg, r: r }); }); });
    renderCollect(collect, go);
    pages = pages.filter(function (pg) { return pg.rows.some(function (r) { return r.cards.length; }); });
    if (!pages.length) { el.dAlbum.appendChild(mk("p", "album-empty", "Your album is empty for now. Pass a lesson's check and its card joins your deck.")); return; }
    pages.forEach(function (pg, i) {
      var page = mk("section", "album-page");
      page.style.setProperty("--i", String(Math.min(i, 6)));
      if (pg.hue != null) tint(page, { "--page-ink": "hsl(" + pg.hue + ", 42%, 36%)" });
      var head = mk("div", "ap-head");
      head.appendChild(mk("h3", null, pg.subject));
      head.appendChild(mk("span", "ap-count", pg.covered + " of " + pg.known + (pg.known === 1 ? " topic" : " topics") + " covered"));
      page.appendChild(head);
      var bar = mk("div", "ap-bar");
      bar.style.setProperty("--p", "0");
      page.appendChild(bar);
      setTimeout(function () { bar.style.setProperty("--p", String(pg.known ? Math.round((pg.covered / pg.known) * 100) / 100 : 0)); }, 30);
      var j = 0;
      pg.rows.forEach(function (r) {
        if (!r.cards.length) return;
        var row = mk("div", "ap-row"), rh = mk("p", "ap-row-head");
        if (r.head && nodeOf(r.head)) rh.appendChild(linkBtn(r.label, function () { go(r.head); }));
        else rh.appendChild(mk("span", null, r.label));
        rh.appendChild(mk("span", null, r.cards.length + (r.cards.length === 1 ? " card" : " cards")));
        row.appendChild(rh);
        var g = mk("div", "ap-grid");
        r.cards.forEach(function (cid, k) {
          var sp = D.cardSpec(state.cloud, cid);
          if (!sp) return;
          var c = D.render(document, sp, { onOpen: go });
          if (k === 0 && r.lead && sp.level) c.classList.add("prominent");
          c.style.setProperty("--i", String(Math.min(i, 6))); c.style.setProperty("--j", String(Math.min(j++, 14)));
          markEvolve(c, sp);
          g.appendChild(c);
        });
        row.appendChild(g);
        page.appendChild(row);
      });
      el.dAlbum.appendChild(page);
    });
  }
  /* Still to collect: the dashed slots of topics on the cloud that aren't cards yet, by branch, apart from the earned album */
  function renderCollect(rows, go) {
    var box = $("d-slots"), sec = $("d-collect");
    if (!box || !sec) return;
    box.textContent = "";
    sec.hidden = !rows.length;
    rows.forEach(function (x) {
      var row = mk("div", "ap-row collect-row"), rh = mk("p", "ap-row-head");
      rh.appendChild(mk("span", null, x.pg.subject === x.r.label ? x.r.label : x.pg.subject + " · " + x.r.label));
      rh.appendChild(mk("span", null, (x.r.slots.length + x.r.more) + " to collect"));
      row.appendChild(rh);
      var g = mk("div", "ap-grid");
      x.r.slots.forEach(function (sid) { g.appendChild(D.renderSlot(document, state.cloud, sid, { onOpen: go })); });
      if (x.r.more) {
        var more = mk("button", "gslot more");
        more.type = "button";
        more.appendChild(mk("span", "gs-title", "+" + x.r.more + " more"));
        more.appendChild(mk("span", "gs-state", "in " + x.r.label));
        more.addEventListener("click", function () { go(x.r.head, more); });
        g.appendChild(more);
      }
      row.appendChild(g);
      box.appendChild(row);
    });
  }
  /* The top 10: what this learner has used most lately (rank.js). A quiet list; it nudges the draw, never decides it. */
  function renderTop() {
    var rows = R ? R.top(state.cloud) : [];
    el.top.hidden = !rows.length;
    el.tList.textContent = "";
    if (!rows.length) return;
    el.tLede.textContent = "What you've spent the most time on lately, and the chains you're working in. The top ones are offered first in your suggestions, draws and choices, and your draws stay balanced across subjects.";
    rows.forEach(function (r) {
      var li = mk("li");
      li.appendChild(linkBtn(r.label, function () { openLesson(r.id); }));
      var ch = D.chainText(r.chain, false);
      if (ch) li.appendChild(mk("span", "tag", " · " + ch));
      el.tList.appendChild(li);
    });
    /* the busiest chains, without one that sits inside another (Programming inside Programming → Python) */
    var ch = R.chains ? R.chains(state.cloud, { n: 5 }) : [];
    ch = ch.filter(function (c) { return !ch.some(function (o) { return o.id !== c.id && C.ancestry(state.cloud, o.id).indexOf(c.id) >= 0; }); }).slice(0, 3);
    var old = el.top.querySelector(".chains");
    if (old) old.remove();
    if (ch.length) el.top.appendChild(mk("p", "fine chains", "Busiest chains: " + ch.map(function (c) { return D.chainText(c.chain, true); }).join(" · ")));
  }
  /* On session start and whenever the learner comes back to the chat, deck or cloud: fresh suggestions (on the device). */
  function startSession() { renderDraw(); }
  /* The first questions are on screen (an onboarding question not yet answered): they are the next step, nothing else. */
  function onboardingOpen() { return state.thread.some(function (m) { return m.role === "ask" && !m.done && m.kind !== "grow"; }); } /* Iko's later grow question hides nothing */
  function renderDraw() {
    el.draw.textContent = "";
    el.draw.hidden = !el.lesson.hidden || !el.deck.hidden || !el.hub.hidden || onboardingOpen() || skipWaiting();
    if (el.draw.hidden) return;
    refreshSuggest();
    el.draw.appendChild(flowBlock("chat"));
  }
  el.deckBtn.addEventListener("click", function () { showDeck(true); });
  el.dBack.addEventListener("click", function () { home(); });

  /* ---------- composer ---------- */
  function autosize() { el.input.style.height = "auto"; el.input.style.height = Math.min(el.input.scrollHeight, 180) + "px"; }
  el.input.addEventListener("input", autosize);
  el.input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (el.composer.requestSubmit) el.composer.requestSubmit(); else submit(e); }
  });
  function submit(e) { if (e) e.preventDefault(); var t = el.input.value; if (!t.trim() || state.busy) return; el.input.value = ""; autosize(); send(t); }
  el.composer.addEventListener("submit", submit);
  el.focusClear.addEventListener("click", function () { setFocus(null); });
  el.thumb.addEventListener("click", openCloud);
  el.reset.addEventListener("click", function () {
    var guiding = PR && PR.mode(localStorage) === "guide";
    if (!window.confirm(guiding ? "Start over for " + state.name + "? This clears " + state.name + "'s chat, cloud and lessons from this device. Other learners are kept." : "Start over? This clears your name, chat, cloud and lessons from this device.")) return;
    try { localStorage.removeItem(startLearnerKey()); } catch { /* ignore */ }
    Object.keys(LS).forEach(function (k) { try { localStorage.removeItem(LS[k]); } catch { /* ignore */ } });
    try { sessionStorage.removeItem(SESSION); sessionStorage.removeItem(VISIT); sessionStorage.removeItem(CUES); } catch { /* ignore */ }
    if (PR) PR.dropActive(localStorage); /* this learner leaves the list; a guide carries on with the next one */
    location.reload();
  });

  /* ---------- the cloud as one file, an IkoCloud: Save IkoCloud / Open IkoCloud (transfer.js; no server, no account) ---------- */
  /* the quiet pair, with its own status line (the stats card, the Deck); the welcome has its own Open IkoCloud */
  function cloudTools() {
    var d = mk("div", "cloud-tools"), st = mk("p", "ct-status fine");
    st.setAttribute("role", "status"); st.setAttribute("aria-live", "polite");
    d.appendChild(linkBtn("Save IkoCloud", function () { exportCloud(st); }, "link ct-save"));
    d.appendChild(document.createTextNode(" · "));
    d.appendChild(linkBtn("Open IkoCloud", function () { pickCloud(st); }, "link ct-open"));
    d.appendChild(st);
    return d;
  }
  /* Save IkoCloud: this learner's whole cloud as [firstname].ikocloud (application/json, safe to email), made here and downloaded (0 calls) */
  function exportCloud(st, ext) {
    if (!T || !state.cloud) return;
    save();
    var f = T.build(localStorage, Date.now());
    if (!f) { st.textContent = "Your IkoCloud couldn't be saved just now."; return; }
    var url = URL.createObjectURL(new Blob([f.text], { type: "application/json" })), a = mk("a");
    a.href = url; a.download = ext ? f.name.replace(/\.ikocloud$/, ext) : f.name; a.hidden = true;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    st.textContent = T.MSG.saved(f.name);
    if (window.IkoUsage) window.IkoUsage.bump("exports");
    placeCard();
  }
  var ctStatus = null;
  function pickCloud(st) { if (!T || !el.ctFile) return; el.ctFile.accept = T.ACCEPT; ctStatus = st; if (st) st.textContent = ""; el.ctFile.value = ""; el.ctFile.click(); }
  /* Enhance stays on this device: the file is read here and a new file is downloaded. Nothing is sent or logged. */
  function enhanceFile(st) {
    if (!window.IkoEnhance) { if (st) st.textContent = "Couldn't enhance that file."; return; }
    var input = document.createElement("input");
    input.type = "file"; input.accept = ".ikolearn,.ikocloud,.json,application/json";
    input.addEventListener("change", function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var out = window.IkoEnhance.enhanceText(String(reader.result || ""));
        if (st) st.textContent = out && out.notice ? out.notice : "Couldn't enhance that file.";
        if (!out || !out.ok || !out.text) return;
        var url = URL.createObjectURL(new Blob([out.text], { type: "application/json" })), a = mk("a");
        a.href = url; a.download = out.name || "enhanced.ikolearn"; a.hidden = true;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      };
      reader.readAsText(f);
    });
    input.click();
  }
  function ctSay(t) { if (ctStatus) ctStatus.textContent = t; placeCard(); }
  if (el.ctFile) el.ctFile.addEventListener("change", function () {
    var f = el.ctFile.files && el.ctFile.files[0];
    el.ctFile.value = "";
    if (!f) return;
    if (f.size > 8e6) { ctSay(T.MSG.bad); return; }
    f.text().then(function (text) {
      /* nothing on this device yet: nothing to replace, so nothing to confirm */
      if (!state.name) { openCloudFile(text); return; }
      askConfirm(T.MSG.confirm, function (yes) { if (yes) openCloudFile(text); else ctSay(T.MSG.none); });
    }, function () { ctSay(T.MSG.bad); });
  });
  /* checked in full, then written in one go (rolled back on any failure); then the page starts again on the restored cloud */
  function openCloudFile(text) {
    var parsed = T.parse(text);
    if (!parsed.ok) { ctSay(T.message(parsed.why)); return; }
    stopClock(); /* this visit's lesson time goes to the cloud being replaced, before it is */
    var r = T.apply(localStorage, parsed);
    if (!r.ok) { ctSay(T.message(r.why)); return; }
    frozen = true;
    try { sessionStorage.setItem(VISIT, "1"); } catch { /* ignore */ } /* the same visit carries on: the file's profile is kept as it was */
    location.reload();
  }
  /* a quiet confirm on the page (Continue / Cancel; Escape or a tap outside cancels) */
  var ikcDone = null;
  function askConfirm(text, cb) {
    ikcDone = cb; el.ikcText.textContent = text; el.ikc.hidden = false;
    el.ikcNo.focus();
  }
  function confirmDone(yes) { if (el.ikc.hidden) return; el.ikc.hidden = true; var cb = ikcDone; ikcDone = null; if (cb) cb(yes); }
  if (el.ikc) {
    el.ikcYes.addEventListener("click", function () { confirmDone(true); });
    el.ikcNo.addEventListener("click", function () { confirmDone(false); });
    el.ikc.addEventListener("click", function (e) { if (e.target === el.ikc) confirmDone(false); });
  }
  if (el.wOpen) el.wOpen.addEventListener("click", function () { pickCloud(el.wStatus); });

  /* ---------- start ---------- */
  function startChat() {
    el.welcome.hidden = true;
    el.chat.hidden = false;
    mini = V.create(el.thumbCanvas, { mini: true, onOpen: openCloud });
    mini.setCloud(state.cloud);
    renderThread();
    renderDeckButton();
    countVisit();
    if (P.needsOnboarding(state.cloud) && !C.subjects(state.cloud).length) { C.setProfile(state.cloud, { onboarded: true }); save(); } /* the cloud is the start: no intake question */
    else if (P.needsOnboarding(state.cloud)) { if (!state.thread.some(function (m) { return m.role === "user"; })) state.thread = []; renderThread(); runOnboarding(); }
    else if (!state.thread.length) greet();
    startSession();
    openCloud(true); /* home: the cloud, with the name in the centre (a first visit, a guide's learner, a return) */
  }
  /* Once per browser session: for "seems stuck" (visits without a lesson). */
  function countVisit() {
    var pr = C.profileOf(state.cloud);
    var t = new Date(), today = t.getFullYear() * 1e4 + (t.getMonth() + 1) * 100 + t.getDate(); /* PR 111: days visited */
    if (pr.vday !== today) { pr.vday = today; pr.days = (pr.days || 0) + 1; }
    try { if (!sessionStorage.getItem(VISIT)) { sessionStorage.setItem(VISIT, "1"); pr.visits = (pr.visits || 0) + 1; var d = C.dirOf(state.cloud); d.prev = d.seen || 0; d.seen = Date.now(); } } catch { /* ignore */ }
    save();
  }
  function greet() {
    if (!C.subjects(state.cloud).length) { push({ role: "model", local: true, ex: "start", text: "Hi " + state.name + ", welcome back. " + P.OPENING + " " + waitingText().replace(/^That's fine, [^.]*\. /, "") }); save(); return; }
    push({
      role: "model", local: true,
      text: "Hi " + state.name + ", welcome back. Your learning cloud grows with the topics you explore. Tap any point to open it as a short lesson. Topics you spend time with become cards in your deck. They start in sepia and fill with colour as you show what you've learned. Pick a card above, tap Draw a card, or tell me what you'd like to learn about today.",
      ex: "chat" /* the API's examples, led by this learner's best-ranked next steps; no chips made up on the device */
    });
    save();
  }

  /* The first question: learning for yourself (the name question as always) or guiding other learners (their first
     learner's name). A tap, no form; 0 calls. The answer is kept in the learners index only. */
  var who = "self";
  Array.prototype.forEach.call(document.querySelectorAll(".who-opt"), function (b) {
    b.addEventListener("click", function () {
      who = b.getAttribute("data-who") === "guide" ? "guide" : "self";
      Array.prototype.forEach.call(document.querySelectorAll(".who-opt"), function (x) { x.setAttribute("aria-pressed", String(x === b)); x.classList.toggle("on", x === b); });
      el.nameLabel.textContent = who === "guide" ? "Your learners' first names" : "What's your first name?";
      el.nameHint.hidden = who !== "guide";
      el.nameIn.maxLength = who === "guide" ? 160 : 30; /* guiding: one name or a few, "Maya, Leo" (PR 103) */
      el.nameForm.hidden = false;
      el.nameIn.focus();
    });
  });
  function showWelcome() {
    el.welcome.hidden = false;
    if (!el.who || !PR) { el.nameForm.hidden = false; el.nameIn.focus(); }
  }
  function showWho() {
    renderFeedback();
    var ix = PR && PR.current(localStorage);
    if (!el.whoNow || !ix || ix.mode !== "guide") return;
    el.whoNow.textContent = state.name + " · switch";
    el.whoNow.setAttribute("aria-label", state.name + " is learning now. Switch learner");
    el.whoNow.hidden = false;
  }
  el.nameForm.addEventListener("submit", function (e) {
    e.preventDefault();
    /* guiding: several learners at once ("Maya, Leo and Sam"): the first starts now, the others are listed, each with their own cloud (PR 103) */
    var names = who === "guide" && PR && PR.splitNames ? PR.splitNames(el.nameIn.value) : [];
    var n = C.cleanLabel(names[0] || el.nameIn.value).replace(/[^\p{L}\p{M}' -]/gu, "").trim();
    if (!n) { el.nameIn.focus(); return; }
    state.name = n;
    store(LS.name, n);
    if (PR) { try { PR.begin(localStorage, who, n); names.slice(1).forEach(function (x) { PR.addParked(localStorage, x); }); } catch { /* storage full: carries on as one learner */ } }
    showWho();
    state.cloud = C.create(n);
    state.thread = [];
    startChat();
  });

  (function boot() {
    if (PR) { try { PR.reconcile(localStorage); } catch { /* keep going with what is there */ } }
    state.name = (load(LS.name) || "").trim();
    if (!state.name) {
      state.name = "You";
      store(LS.name, "You");
      if (PR) { try { PR.begin(localStorage, "self", "You"); } catch (e) { /* a full store still opens this cloud */ } }
      showWho();
      state.cloud = C.create("You");
      state.thread = [];
      startChat();
      return;
    }
    showWho();
    state.cloud = C.deserialize(load(LS.cloud)) || C.create(state.name);
    try { state.thread = C.trimThread(JSON.parse(load(LS.thread) || "[]")); } catch { state.thread = []; }
    try { state.notes = JSON.parse(load(LS.notes) || "{}") || {}; } catch { state.notes = {}; }
    try { state.lessons = JSON.parse(load(LS.lessons) || "{}") || {}; } catch { state.lessons = {}; }
    Object.keys(state.lessons).forEach(function (id) {
      var les = state.lessons[id];
      if (les && les.text && !lessonBodyOk(les)) { delete les.text; delete les.qs; delete les.cur; les.ans = []; } /* a cut-off lesson, or one with a short question, is written again when opened */
    });
    try { state.tests = JSON.parse(load(LS.tests) || "{}") || {}; } catch { state.tests = {}; }
    Object.keys(state.tests).forEach(function (id) { var t = state.tests[id]; if (t && shortSet(t.qs)) delete state.tests[id]; }); /* a saved test with a 2-option question is written again */
    try { var v = JSON.parse(load(LS.view) || "null"); state.view = v && Number.isFinite(v.z) ? v : null; } catch { state.view = null; }
    try { var sn = JSON.parse(load(LS.seen) || "null"); if (sn && sn.c && typeof sn.c === "object") state.seen = { c: sn.c, ev: Number(sn.ev) || 0, h: sn.h && typeof sn.h === "object" ? { cloud: sn.h.cloud ? 1 : 0, card: sn.h.card ? 1 : 0, deck: sn.h.deck ? 1 : 0, iko: sn.h.iko ? 1 : 0, grow: sn.h.grow ? 1 : 0, aboutCloud: sn.h.aboutCloud ? 1 : 0, aboutLesson: sn.h.aboutLesson ? 1 : 0, aboutDeck: sn.h.aboutDeck ? 1 : 0, askAge: sn.h.askAge ? 1 : 0, ageAsked: sn.h.ageAsked ? 1 : 0 } : {} }; } catch { /* keep the empty default */ }
    save(); /* writes a migrated (older -> v9) cloud back in the compact format, with the deck backfilled */
    startChat();
    settleMerges(); /* existing completion data can already form parent cards (0 calls) */
  })();
})();
