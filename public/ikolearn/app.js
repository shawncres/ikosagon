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
  var HISTORY = 10, TIMEOUT_MS = 60000, MAX_LESSONS = 30;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    welcome: $("welcome"), nameForm: $("name-form"), nameIn: $("name-in"), who: $("who"), nameLabel: $("name-label"), nameHint: $("name-hint"), whoNow: $("who-now"),
    chat: $("chat"), thread: $("thread"), dock: $("dock"), composer: $("composer"), input: $("input"), send: $("send"),
    reset: $("reset"),
    focusChip: $("focus-chip"), focusText: $("focus-text"), focusClear: $("focus-clear"),
    lesson: $("lesson"), lBack: $("l-back"), lTrail: $("l-trail"), lTitle: $("l-title"), lBody: $("l-body"), lDone: $("l-done"),
    lGot: $("l-got"), lTricky: $("l-tricky"), lCont: $("l-cont"), phEarn: $("ph-earn"), lStatus: $("l-status"), lPath: $("l-path"), lClar: $("l-clar"), lNext: $("l-next"), lChat: $("l-chat"), lRedo: $("l-redo"),
    cloud: $("cloud"), cloudCanvas: $("cloud-canvas"), cloudDeck: $("cloud-deck"), cloudWho: $("cloud-who"), toCloud: $("to-cloud"),
    cs: $("cloud-start"), csName: $("cs-name"), csHi: $("cs-hi"), csQ: $("cs-q"), csFew: $("cs-few"), csForm: $("cs-form"), csIn: $("cs-in"), csEx: $("cs-ex"), csStatus: $("cs-status"),
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

  var state = { name: "", cloud: null, thread: [], notes: {}, lessons: {}, busy: false, focus: null, panelNode: null, lessonNode: null, lessonAt: 0, revealed: false, lifted: 0, session: null, quiz: null, tests: {}, test: null, mode: "lesson", bridgeQueue: [], queued: null, pick: null, glide: null, view: null, dirForm: null, dirText: "", allDone: false, seen: { c: {}, ev: 0 }, ex: { list: [], growth: [], at: 0, gat: 0, status: "idle" } };
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
    String(text || "").split(/\n{2,}/).forEach(function (para) {
      var p = mk("p");
      para.split("\n").forEach(function (line, i) {
        if (i) p.appendChild(mk("br"));
        p.appendChild(document.createTextNode(line));
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
      box.appendChild(linkBtn("Try again", function () { loadExamples(); }, "link ex-retry"));
      return;
    }
    var grow = r.set === "growth", key = grow ? "gat" : "at";
    var list = state.ex.status !== "ok" ? [] : grow ? state.ex.growth : P.examples(state.cloud, state.ex.list, Date.now());
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
    else if (m.role === "card") {
      d = cardNode(m.card, m.card.node && nodeOf(m.card.node) ? "On " + trailOf(m.card.node) : "");
    } else if (m.role === "grow") {
      d = mk("p", "grow", m.text);
      var on = nodeOf(m.open);
      if (on) { d.appendChild(document.createTextNode(" · ")); d.appendChild(linkBtn("Open a lesson on " + on.label, function () { openLesson(on.id); })); }
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
        again.appendChild(linkBtn("Try again", function () { if (!state.busy) { m.retry = null; upsert(m); buildCloud(rt.kind, [], rt.about || "", rt.grow || ""); } }, "btn draw-btn sm"));
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
    if (parts.length) push({ role: "grow", text: "Your cloud grew: " + parts.join(" · "), open: fresh || null });
    /* a new parent (or a topic placed where the learner asked): the camera glides to it */
    var landed = r.parentsCreated.concat(r.created).filter(function (id) { return placed[C.norm(nodeOf(id) ? nodeOf(id).label : "")]; })[0];
    /* a subject that was asked for and is already there: that one is shown (no duplicate) */
    if (!landed) landed = reused.filter(function (id) { return raw.some(function (tp) { return tp.placement && C.norm(C.cleanLabel(tp.name)) === C.norm(nodeOf(id) ? nodeOf(id).label : ""); }); })[0];
    if (landed) revealNode(landed);
    asks.forEach(function (a) {
      push({ role: "place", plan: { name: C.cleanLabel(a.tp.name), signal: a.tp.signal || "curious", target: a.plan.target, blurb: a.tp.blurb || "" } });
    });
    /* a topic that landed right under its subject on a shallow chain gets its in-between steps after this reply (one call, once) */
    topics.forEach(function (tp) {
      if (placed[C.norm(tp.name)]) return; /* placed on purpose (a new parent, or right where it was asked for): no bridge call */
      var hit = C.findTopic(state.cloud, tp.name);
      if (hit && grown.indexOf(hit.id) >= 0 && P.needsBridge(state.cloud, hit.id, (tp.chain || []).length) && state.bridgeQueue.indexOf(hit.id) < 0) state.bridgeQueue.push(hit.id);
    });
    return { topic: topics[0] || (asks[0] && asks[0].tp) || null };
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
    row.appendChild(linkBtn("A new subject", function () { applyPlace(m, "parent"); }, "btn sm place-opt"));
    if (f) row.appendChild(linkBtn("Part of " + f.label, function () { applyPlace(m, "child"); }, "btn sm place-opt"));
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
    m.done = !n ? p.name + " wasn't added." : plan.how === "reuse" ? n.label + " is already on your cloud." : !n.parent ? n.label + " is a new branch on your cloud." : n.label + " is now under " + nodeOf(n.parent).label + ".";
    m.open = n ? n.id : null;
    upsert(m);
    save();
    if (n) revealNode(n.id);
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
  }
  /* Paths and mastery show in several places; redraw them all after a change. */
  function refreshAll(flashIds) {
    refreshViews(flashIds);
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
    var p = n && n.parent ? nodeOf(n.parent) : null; /* no age, no region: nothing about who or where the learner is goes along */
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
  function post(path, body, signal) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
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
  function stream(path, body, on, signal) {
    return post(path, body, signal).then(function (res) {
      if (!res.ok || !res.body) {
        return res.json().catch(function () { return {}; }).then(function (j) { return { ok: false, reason: j.reason || j.error || String(res.status) }; });
      }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "", result = { ok: false, reason: "cut" }, got = false;
      function handle(line) {
        if (!line.trim()) return;
        var ev; try { ev = JSON.parse(line); } catch { return; }
        if (ev.t === "delta" && typeof ev.text === "string") { got = true; on.delta(ev.text); }
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
    [el.send, el.pCard, el.pAdj, el.pLesson, el.pTest, el.lGot, el.lTricky, el.lCont, el.ikoGot].forEach(function (b) { b.disabled = on; });
    Array.prototype.forEach.call(document.querySelectorAll(".draw-btn, .clar-opt"), function (b) { b.disabled = on; });
    if (!on && state.queued) { var q = state.queued; state.queued = null; setTimeout(q, 0); }
    renderStart();
  }

  /* ---------- chat ---------- */
  function send(text) {
    text = String(text || "").replace(/\s+$/, "").trim().slice(0, 1500);
    if (!text || state.busy) return;
    if (waitingForStart()) { var about = cleanAbout(text); push({ role: "user", text: text }); buildCloud("start", [], about); return; }
    lock(true);
    push({ role: "user", text: text });
    var m = push({ role: "model", text: "", streaming: true });
    /* the focus is what is on screen: in Iko's sheet, the node of the screen it was opened on (none on the cloud with
       nothing selected); in the whole conversation, the focus shown above the composer. Never an earlier screen's node. */
    var fid = iko.open && iko.ctx ? (nodeOf(iko.ctx.id) ? iko.ctx.id : null) : state.focus;
    var body = Object.assign(basePayload(fid, text), { mode: "chat", messages: history(), screen: iko.open && iko.ctx ? screenOf(iko.ctx) : { view: "chat" } });
    stream("/chat", body, {
      delta: function (t) { m.text += t; upsert(m); scrollDown(); },
      cloud: function (ev) { var r = grow(ev, fid); if (r.topic) { m.topic = r.topic.name; m.parent = r.topic.parent; } }
    }).then(function (r) {
      m.streaming = false;
      if (!r.ok && !m.text) { m.text = fallbackText(r.reason); m.fallback = true; }
      m.text = m.text.trim();
      upsert(m);
      save();
      lock(false);
      scrollDown();
      runBridge();
    });
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
      var before = C.trail(state.cloud, id, " → ");
      var r = C.applyBridge(state.cloud, id, j);
      save();
      if (r.moved) {
        refreshViews(r.created.concat(id));
        push({ role: "grow", text: "Filled in the steps for " + nodeOf(id).label + ": " + C.trail(state.cloud, id, " → ") + " (was " + before + ")", open: id });
      }
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
    var before = C.trail(state.cloud, id, " → ");
    return postJson("/create", Object.assign(basePayload(id), { mode: "notice", messages: history().filter(function (m) { return m.role === "user"; }).slice(-1) }, P.repairRequest(state.cloud, id)), sig).then(function (j) {
      if (j && j.reason === "aborted") return "aborted"; /* still counts as its one repair (the call may have been made) */
      if (!(j && j.ok && Array.isArray(j.items))) return;
      var r = C.applyRepair(state.cloud, id, j);
      save();
      if (r.moved || r.created.length) {
        refreshViews(r.created.concat(id));
        push({ role: "grow", text: "Added a missing step for " + nodeOf(id).label + ": " + C.trail(state.cloud, id, " → ") + " (was " + before + ")", open: id });
      }
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
    stream("/create", Object.assign(basePayload(null), { mode: "notice", stream: true }, req), { delta: function () {}, item: take }).then(function (r) {
      if (r.ok && Array.isArray(r.items)) r.items.slice(seen).forEach(take);
      if (r.ok && Array.isArray(r.later)) laterOf = r.later;
      return r.ok && seen ? { ok: true } : { ok: false, reason: r.reason };
    }).then(function (j) {
      m.pending = 0;
      if (j && j.ok) {
        return build.done().then(function (ids) {
          var names = ids.map(function (x) { return nodeOf(x) && nodeOf(x).label; }).filter(Boolean);
          /* what they enjoy, as the model read it: the new parents become the profile's interests (later asks build on them) */
          C.setProfile(state.cloud, { interests: names.slice(0, 5) });
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
    }).then(function () { save(); lock(false); refreshEx(); renderDraw(); if (!el.cloud.hidden && !el.cloud.querySelector(".cloud-caption:not([hidden])")) renderCloudFlow(); if (state.offerGrow) { state.offerGrow = false; offerGrow(); } });
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
    ask(q, function (v) { dismissHint("growSaid"); if (v) buildCloud("more", [], cleanAbout("Something I'd like to grow in myself: " + v)); });
    save();
    /* never beside the "another direction" invite: while one is on the cloud, Iko's line waits until it is gone
       (used, closed, or the cloud has its 3 subjects), this visit or a later one. The question is in the conversation already. */
    if (dirInviting()) dismissHint("growWait");
    else sayGrow();
  }
  function sayGrow() {
    if (!el.ikoLine.hidden && el.ikoLine.getAttribute("data-react") === "start") { iko.after = sayGrow; return; } /* after Iko's reassurance */
    dismissHint("growSaid");
    ikoLine("Your path has begun. When you like, tell me something you'd like to grow in yourself too.", 12000);
  }
  function dirInviting() { return Boolean(state.cloud && (P.directions(state.cloud).invite || (C.dirOf(state.cloud).later || []).length)); }
  function maybeGrowLine() {
    if (hintSeen("growWait") && !hintSeen("growSaid") && !el.cloud.hidden && !dirInviting()) sayGrow();
  }
  /* "What comes next" for a parent: one creation call (the orchestrator only offers it when needed, and it is cached). */
  function createNext(id) {
    var n = nodeOf(id);
    if (!n || state.busy) return;
    lock(true);
    var say = function (t) { if (state.panelNode === id && !el.panel.hidden) paragraphs(el.pNote, t); else push({ role: "grow", text: t, open: null }); };
    say("Working out what comes next in " + n.label + "...");
    postJson("/create", Object.assign(basePayload(id), { mode: "notice" }, P.createRequest(state.cloud, "next", id))).then(function (j) {
      if (j && j.ok && Array.isArray(j.items) && j.items.length) {
        var r = C.applyCreate(state.cloud, { items: j.items.slice(0, 1) }, { focusId: id });
        save();
        refreshAll(r.children);
        if (r.children.length) ikoReact("grow");
        var first = nodeOf(P.nextChild(state.cloud, id));
        say(r.children.length ? "Next in " + n.label + ": " + r.children.map(function (x) { return nodeOf(x).label; }).join(", ") + "." + (first ? " " + first.label + " is a good place to start." : "") : "Nothing new to add in " + n.label + " right now.");
      } else say("I couldn't work out what comes next just now (" + ((j && (j.reason || j.error)) || "error") + "). Try again in a moment.");
    }).then(function () { save(); lock(false); if (!el.draw.hidden) renderDraw(); });
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
        if (about) buildCloud("start", [], about, grow);
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

  function showLesson(on) {
    if (!on) { stopClock(); cancelNav(); }
    if (on) { el.deck.hidden = true; el.hub.hidden = true; }
    el.lesson.hidden = !on;
    el.thread.hidden = on;
    el.dock.hidden = on;
    if (!on) { state.lessonNode = null; state.mode = "lesson"; state.test = null; renderThread(); renderDraw(); }
    else { el.draw.hidden = true; el.lBack.textContent = state.lessonFrom && nodeOf(state.lessonFrom) ? "Back to its card" : "Back to your cloud"; viewIn(el.lesson); }
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
    el.hNote.textContent = sp.level ? "Merged " + C.roman(sp.level) + ". It holds " + sp.corpus.length + " cards and rises a level with each new batch you finish."
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
  /* What changed on this topic's card after an action: achieved, joined the deck, or picked up colour. */
  function growthNote(id, before) {
    var joined = C.joinDeck(state.cloud).indexOf(id) >= 0, after = C.growthOf(state.cloud, id), n = nodeOf(id);
    if (!after || !n) return "";
    if (after.achieved && !(before && before.achieved)) return "You've completed " + n.label + ". Its card is in full colour now, marked achieved, and kept in your deck for good.";
    if (joined) return n.label + " joined your deck. It stays there for good, and its colour comes in as you show what you've learned.";
    if (before && after.stage > before.stage) return "Your " + n.label + " card picked up more colour.";
    return "";
  }

  /* Check questions from the lesson's hidden block: radio-style options; the first answer to each counts. */
  function validQs(qs) {
    return (Array.isArray(qs) ? qs : []).filter(function (q) {
      return q && typeof q.q === "string" && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length;
    }).slice(0, 3);
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
    if (les && les.got) return true;
    /* a lesson answered in full before PR 103, every answer right: that was a pass */
    var qs = les ? validQs(les.qs) : [], ans = les && Array.isArray(les.ans) ? les.ans : [];
    return Boolean(!(ck && ck.r) && qs.length && ans.length >= qs.length && qs.every(function (q, i) { return ans[i] === q.answer; }));
  }
  /* what the lesson shows now: learn (reading + Continue), check (the questions), missed (a clearer telling, then a fresh set), passed */
  function lessonPhase(id) {
    if (state.mode !== "lesson" || state.lessonNode !== id) return "learn";
    if (!hasQs(id) || passed(id)) return "passed";
    var ck = ckOf(id);
    return !ck || !ck.c ? "learn" : state.quiz.missed ? "missed" : "check";
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
    el.lQuiz.hidden = ph === "learn";
    el.lQuiz.classList.toggle("l-pane-on", ph !== "learn" && qs);
    el.lDone.hidden = !(ph === "learn" || ph === "passed");
    el.lCont.hidden = ph !== "learn";
    el.lGot.hidden = ph !== "passed";
    el.lTricky.hidden = false;
    el.lMain.setAttribute("data-phase", ph);
    ikoActs();
  }
  /* Continue: the reading is done, the questions open in their own pane (their first question focused) */
  function startCheck() {
    var id = state.lessonNode, ck = ckOf(id);
    if (!ck || !hasQs(id)) return;
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
      set.appendChild(mk("legend", null, item.q));
      item.options.forEach(function (o, oi) {
        var lab = mk("label", "opt" + (done && oi === item.answer ? " right" : "") + (done && oi === q.ans[qi] && oi !== item.answer ? " wrong" : ""));
        var inp = mk("input");
        inp.type = "radio"; inp.name = "q" + qi + "-" + q.id + "-" + (ck.r || 0); inp.value = String(oi); inp.checked = done && q.ans[qi] === oi; inp.disabled = done;
        inp.addEventListener("change", function () { answerQ(qi, oi); });
        lab.appendChild(inp);
        lab.appendChild(mk("span", "opt-t", String.fromCharCode(65 + oi) + ". " + String(o)));
        set.appendChild(lab);
      });
      if (done) set.appendChild(mk("p", "q-fb", q.ans[qi] === item.answer ? "That's it." : "Not quite. It's " + String.fromCharCode(65 + item.answer) + ": " + item.options[item.answer] + "."));
      wrap.appendChild(set);
    });
    if (q.missed) wrap.appendChild(missBox(q.id));
    el.lQuiz.appendChild(wrap);
    if (quizSaidIt()) { var dup = el.lStatus.querySelector("strong.yes"); if (dup) dup.parentNode.removeChild(dup); }
  }
  /* a missed round: a clearer telling first, then a fresh set of questions (never the card) */
  function missBox(id) {
    var les = state.lessons[id], ck = ckOf(id), box = mk("div", "q-miss"), n = nodeOf(id);
    box.appendChild(mk("p", "l-head", "Let's look at it another way"));
    var spare = les && validQs(les.rq).length >= 2 && (ck.set || 0) < 1;
    if (ck.miss <= 1 && les && les.tk) {
      var cl = mk("div", "clar q-again"); paragraphs(cl, les.tk); box.appendChild(cl);
      box.appendChild(mk("p", "fine", "Then try a fresh set of questions on " + n.label + "."));
      box.appendChild(linkBtn("Try a fresh check", function () { freshCheck(id); }, "btn sm draw-btn q-fresh"));
    } else {
      box.appendChild(mk("p", null, "I'll write " + n.label + " again, more clearly and in smaller steps. Read it through, then a fresh set of questions comes."));
      box.appendChild(linkBtn("Read a clearer version", function () { retell(id); }, "btn sm draw-btn q-retell"));
      if (spare) box.appendChild(linkBtn("Or try a fresh check now", function () { freshCheck(id); }, "link q-fresh"));
    }
    return box;
  }
  /* options in a new order (the right one moves), questions in a new order: a fallback set when nothing new is to hand */
  function shuffled(qs, seed) {
    var r = function (i) { return C.hash(seed + ":" + i) % 1000; };
    return qs.map(function (q, qi) {
      var idx = q.options.map(function (_, i) { return i; }).sort(function (a, b) { return r(qi * 10 + a) - r(qi * 10 + b); });
      if (idx[q.answer] === q.answer && idx.length > 1) idx.push(idx.shift());
      return { q: q.q, options: idx.map(function (i) { return q.options[i]; }), answer: idx.indexOf(q.answer) };
    }).sort(function (a, b) { return r(a.q.length) - r(b.q.length); });
  }
  /* the next set: the lesson's spare set (written with it, 0 calls), else the questions once more in a new order */
  function freshCheck(id) {
    var les = state.lessons[id], ck = ckOf(id), q = state.quiz;
    if (!les || !q || q.id !== id) return;
    var spare = validQs(les.rq);
    ck.set = (ck.set || 0) + 1;
    q.qs = ck.set === 1 && spare.length >= 2 ? spare : shuffled(validQs(les.qs).length ? validQs(les.qs) : q.qs, id + ck.r + ck.set);
    les.cur = q.qs; /* the set on screen, kept so a return shows the same questions */
    q.ans = []; les.ans = []; q.missed = false; ck.c = 1;
    save();
    renderQuiz(); applyPhase(); renderLessonPath(); renderIko();
    var f = el.lQuiz.querySelector(".quiz");
    if (f) { f.tabIndex = -1; showNear(f); try { f.focus({ preventScroll: true }); } catch { f.focus(); } }
  }
  /* a second miss: the lesson written again, clearer and gentler, with its own fresh questions (1 call) */
  function retell(id) { openLesson(id, true, null, { again: true }); }
  /* "That's it." is said once: a right quiz answer already says it, so the status line doesn't repeat it */
  function quizSaidIt() { return [].some.call(el.lQuiz.querySelectorAll(".q-fb"), function (x) { return x.textContent === "That's it."; }); }
  function answerQ(qi, oi) {
    var q = state.quiz, id = q && q.id;
    if (!q || id !== state.lessonNode || Number.isInteger(q.ans[qi]) || !q.qs[qi] || lessonPhase(id) !== "check") return;
    q.ans[qi] = oi;
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
    if (all) {
      el.lStatus.textContent = (note ? note + " " : "") + "You've shown you understand " + nodeOf(id).label + ". Tap \u201cI've got it\u201d to keep it, or pick where to go next.";
      if (kids.length) el.lStatus.textContent += " " + kidsLine(id, kids);
      settleMerges().forEach(function (m) { var pn = nodeOf(m.id); if (pn) el.lStatus.textContent += " " + pn.label + " is now a Merged " + C.roman(m.level) + " card, holding " + C.corpusOf(state.cloud, m.id).length + " cards."; });
      ikoReact("pass");
    }
    applyPhase();
    renderLessonCard(Boolean(note));
    renderLessonPath();
    renderFork(id);
    refreshViews(kids);
    offerTest(id);
    if (kids.length) ikoReact("grow");
    renderIko();
    var f = el.lQuiz.querySelector(all ? ".q-lede" : ".q-miss");
    if (!all && f) { f.tabIndex = -1; showNear(f); try { f.focus({ preventScroll: true }); } catch { f.focus(); } }
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
    var cached = !fresh && state.lessons[id];
    if (cached) {
      /* every saved answer comes back (one per question: 2 or 3) */
      var qs = validQs(cached.cur).length ? validQs(cached.cur) : validQs(cached.qs), ck = cached.ck || {};
      state.quiz = { id: id, qs: qs, ans: Array.isArray(cached.ans) ? cached.ans.slice(0, qs.length) : [] };
      /* a round answered in full and missed: its clearer telling is still waiting */
      state.quiz.missed = Boolean(qs.length && !passed(id) && ck.c && state.quiz.ans.length >= qs.length && qs.every(function (_, i) { return Number.isInteger(state.quiz.ans[i]); }));
      renderLessonBody(cached.text, false);
      lessonReady(id, false);
      showReading(cached.rd);
      return;
    }
    state.quiz = { id: id, qs: [], ans: [] };
    if (state.busy) {
      /* something else is still being written: this lesson waits its turn and starts by itself (no "try again") */
      el.lBody.textContent = "";
      el.lBody.appendChild(mk("p", "l-intro wait", "Getting this lesson ready. It starts as soon as the last answer is finished."));
      state.queued = function () { if (state.lessonNode === id && state.mode === "lesson" && (!state.lessons[id] || opts.again)) openLesson(id, fresh, null, opts); };
      return;
    }
    lock(true);
    calls.lessonFor = id;
    /* the orchestrator builds the context: child topics only when wanted, and the planned next step for the fork */
    var ctx = P.lessonContext(state.cloud, id), text = "", wantPath = ctx.wantPath, reading = [], tricky = "", retry = [];
    var prevCk = state.lessons[id] && state.lessons[id].ck; /* a fresh version keeps the lesson's check rounds (never a free pass) */
    if (opts.again) { ctx.again = true; ctx.pace = "gentle"; }
    el.lBody.textContent = "";
    renderLessonBody("", true);
    renderQuiz(true);
    stream("/lesson", Object.assign(basePayload(id), ctx), {
      delta: function (t) { text += t; if (state.lessonNode === id) renderLessonBody(text, true); },
      /* the hidden block: check questions, the card's line, path steps (only when asked), the fork, and whether this branch ends here */
      path: function (ev) {
        var flash = [];
        if (ev.blurb) C.setBlurb(state.cloud, id, ev.blurb);
        reading = L.cleanReading(ev.reading); /* titles and search phrases only; links are built on the device (allowlist) */
        tricky = typeof ev.tricky === "string" ? ev.tricky.trim().slice(0, 600) : ""; /* "Still tricky", prepared in this same call: shown only if asked */
        if (state.quiz && state.quiz.id === id) state.quiz.qs = validQs(ev.questions);
        retry = validQs(ev.retry); /* the spare set for a second try (0 calls) */
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
      var parsed = L.parse(text);
      if (r.ok && L.usable(parsed)) {
        state.lessons[id] = { text: text.trim(), at: Date.now(), qs: state.quiz && state.quiz.id === id ? state.quiz.qs : [], ans: [] };
        if (retry.length >= 2) state.lessons[id].rq = retry;
        if (prevCk && (prevCk.r || prevCk.p)) state.lessons[id].ck = { r: prevCk.r || 0, p: prevCk.p || 0, miss: prevCk.miss || 0, c: 0, set: 0, again: opts.again ? 1 : 0 };
        if (reading.length) state.lessons[id].rd = reading;
        if (tricky) state.lessons[id].tk = tricky;
        if (state.lessonNode === id) { renderLessonBody(text, false); lessonReady(id, true); showReading(reading); }
      } else if (r.reason === "aborted") {
        /* cancelled because the learner moved on: not a failure; it is written next time it's opened */
      } else if (state.lessonNode === id) {
        if (text && L.usable(parsed)) { renderLessonBody(text, false); lessonReady(id, true); }
        else {
          el.lBody.textContent = "";
          el.lBody.appendChild(mk("p", "l-intro", reasonLead(r.reason) + " Your path below still works, and I'll write this lesson when you come back."));
          el.lBody.appendChild(linkBtn("Try again", function () { openLesson(id, true); }));
        }
      }
      save(); lock(false);
    });
  }

  /* Reading a lesson counts a little toward mastery; the learner says how it went with the two buttons. */
  function lessonReady(id, wasNew) {
    var n = nodeOf(id);
    var was = n.ghost, before = C.growthOf(state.cloud, id);
    C.engage(state.cloud, id, "open");
    var kids = growChildren(id);
    var note = growthNote(id, before);
    if (kids.length) note = (note ? note + " " : "") + kidsLine(id, kids);
    var les = state.lessons[id], marked = n.mastery >= C.MASTERED || Boolean(les && les.got); /* "I've got it" is kept with the lesson */
    if (marked) el.lStatus.textContent = "You've marked this one as done.";
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
  }
  /*
   * "I've got it": confirmed on the device (0 calls). Progress is marked, a short note says so, and the learner stays
   * here; Where Next (below) has the next step pre-selected, nothing opens by itself.
   * "Still tricky": stays on the topic with a clarification already there: the simpler explanation the lesson call
   * prepared (0 calls), or, for a lesson saved before that, one call that writes it. The worked example and a targeted
   * question stay one tap away (one call each, kept), and chat is one tap away with the topic in focus.
   */
  function finishLesson(kind) {
    var id = state.lessonNode, n = nodeOf(id);
    if (!n) return;
    if (kind === "got" && lessonPhase(id) !== "passed") return; /* earned only once the check is passed (PR 103) */
    var before = C.growthOf(state.cloud, id);
    var r = C.engage(state.cloud, id, kind);
    var kids = kind === "got" ? growChildren(id) : [];
    var note = growthNote(id, before);
    if (state.lessons[id]) { if (kind === "got") state.lessons[id].got = Date.now(); else delete state.lessons[id].got; } /* kept with the lesson: shown again on return */
    if (C.isDone(state.cloud, id) && state.cloud.active === id) state.cloud.active = null;
    save();
    settleMerges();
    refreshViews([id].concat(r.next ? [r.next] : [], kids));
    el.lStatus.textContent = "";
    if (kind === "got") {
      /* understood: the clarify options go; an answer already shown stays */
      [".clar-opts", ".clar-chat"].forEach(function (q) { var co = el.lClar.querySelector(q); if (co) co.parentNode.removeChild(co); });
      if (!quizSaidIt()) el.lStatus.appendChild(mk("strong", "yes", "That's it. ")); /* said once: the quiz may already have */
      el.lStatus.appendChild(document.createTextNode((note || n.label + " is growing stronger on your cloud.") + (kids.length ? " " + kidsLine(id, kids) : "")));
    } else {
      el.lStatus.appendChild(document.createTextNode((note ? note + " " : "") + "That's okay, it takes a few tries. Iko has another way to see it."));
      openIko({ tricky: true }); /* the clarification lives in Iko's sheet now: prepared with the lesson, so 0 calls */
      prepareClarify(id);
    }
    renderLessonPath();
    renderLessonCard(Boolean(note));
    renderFork(id);
    offerTest(id);
    ikoActs();
    applyPhase();
    if (kind === "got") { flyToDeck(id); if (C.inDeck(state.cloud, id)) ikoReact("earn"); } /* saved above: the flight is only a picture of it */
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
  function clarify(id, style) {
    var les = state.lessons[id];
    if (state.lessonNode !== id || !nodeOf(id)) return;
    if (les && les.cl && les.cl[style]) { showNear(clarBox(style, les.cl[style]).box); return; }
    if (state.busy) { state.queued = function () { clarify(id, style); }; return; }
    lock(true);
    var ui = clarBox(style, ""), text = "";
    ui.body.className = "clar-body streaming";
    focusClar(style);
    var body = Object.assign(basePayload(id), { mode: "clarify", clarify: style, lesson: les ? String(les.text).slice(0, 1500) : "", messages: [] });
    stream("/chat", body, {
      delta: function (t) { text += t; paragraphs(ui.body, text); }
    }, callSignal("clarify")).then(function (r) {
      ui.body.className = "clar-body";
      if (r.reason === "aborted") { if (ui.box.parentNode) ui.box.parentNode.removeChild(ui.box); }
      else if (text.trim()) {
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
      if (forkIds.indexOf(to) >= 0) { C.pickChoice(state.cloud, id, to); save(); refreshViews([to]); }
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
      act.addEventListener("click", function () { if (x === sel) go(x); });
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
  el.lGot.addEventListener("click", function () { finishLesson("got"); });
  el.lCont.addEventListener("click", startCheck);
  el.lTricky.addEventListener("click", function () { finishLesson("tricky"); });
  el.ikoGot.addEventListener("click", function () {
    if (el.lGot.disabled) return;
    closeIko();
    finishLesson("got");
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
    el.lQuiz.hidden = false; el.lQuiz.classList.remove("l-pane-on"); el.lMain.setAttribute("data-phase", "test");
    el.lBody.textContent = "";
    el.lBody.appendChild(mk("p", "l-intro", "This test only covers what you've finished: " + labels.join(", ") + ". It's optional and there's no timer. Right answers bring colour into those cards, and every attempt makes " + p.label + " stronger."));
    renderLessonCard(false);
    animateIn(from);
    C.markOffered(state.cloud, pid);
    var cached = state.tests[pid];
    if (cached && cached.n === labels.length && validTestQs(cached.qs, labels).length >= 2) {
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
    postJson("/test", Object.assign(basePayload(pid), { material: req.material })).then(function (j) {
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
      var lg = mk("legend", null, item.q);
      lg.appendChild(mk("span", "q-topic", "On " + item.topic));
      set.appendChild(lg);
      item.options.forEach(function (o, oi) {
        var lab = mk("label", "opt" + (done && oi === item.answer ? " right" : "") + (done && oi === t.ans[qi] && oi !== item.answer ? " wrong" : ""));
        var inp = mk("input");
        inp.type = "radio"; inp.name = "t" + qi + "-" + t.pid; inp.value = String(oi); inp.checked = done && t.ans[qi] === oi; inp.disabled = done;
        inp.addEventListener("change", function () { answerTest(qi, oi); });
        lab.appendChild(inp);
        lab.appendChild(mk("span", "opt-t", String.fromCharCode(65 + oi) + ". " + String(o)));
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
   * Back / close returns here (to the topic they were about, when there is one: its card opens beside it).
   */
  function home(id) {
    if (state.lessonNode) showLesson(false);
    el.deck.hidden = true; el.hub.hidden = true; state.hubNode = null; el.thread.hidden = false; el.dock.hidden = false;
    openCloud();
    if (id && nodeOf(id)) openPanel(id);
  }
  /* landing: the first view after the name, or a returning visit (no focus moves, so no keyboard pops up on phones) */
  function openCloud(landing) {
    el.cloud.hidden = false;
    var fresh = !big;
    if (!big) big = V.create(el.cloudCanvas, { onPick: pick, onView: saveView, onDraw: placeCard, onEmpty: closeCard });
    big.resize();
    big.setCloud(state.cloud);
    /* every load (a visit, a learner switched in, a cloud opened from a file, after Start over) begins at home: the name in
       its home place in the middle, the whole cloud around it. The camera is still kept (ikolearn.v1.view) as it moves. */
    if (fresh) big.reset();
    big.setTests(testMap());
    renderCloudHint();
    big.spin(true); /* a slow idle turn on every view of the cloud; it goes on through drags and pans, a click pauses it a few seconds (not with reduced motion; paused while the tab is hidden or the cloud is closed) */
    if (state.lessonNode) setTimeout(function () { openPanel(state.lessonNode); }, 0); /* a lesson or a test: its topic */
    else if (state.glide && nodeOf(state.glide)) { var gl = state.glide; state.glide = null; setTimeout(function () { revealNode(gl); }, 0); } /* a new parent: the camera glides to it, its card opens */
    renderCloudFlow();
    renderHomeNav();
    renderIko();
    if (landing !== true && !el.ikoWrap.hidden) el.iko.focus();
  }
  /* the cloud's own quiet links: Talk to Iko, the deck (once there is a card), and the learner switch when guiding */
  function renderHomeNav() {
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
    var empty = Boolean(state.cloud) && !C.subjects(state.cloud).length;
    el.cs.hidden = !empty || el.cloud.hidden;
    if (el.cloudHint) el.cloudHint.hidden = empty; /* nothing to drag yet: no input tips over the start */
    intakeMode(!el.cs.hidden);
    if (el.cs.hidden) return;
    el.csName.textContent = (state.cloud && state.cloud.name) || state.name || "";
    var building = state.busy, last = state.thread.filter(function (m) { return m.role === "model"; }).pop(), failed = !building && last && last.retry && last.retry.kind === "start";
    /* one calm step: a short hello, the one question, the field and Begin; a few light ideas (from the API, cycling with More) */
    el.csHi.textContent = building ? "" : "Hi " + state.name + ". Let's begin your learning cloud together.";
    el.csQ.hidden = building;
    el.csFew.hidden = building;
    el.csForm.hidden = building;
    /* the ideas can be picked together; Begin sends them with whatever was typed, as one answer (the same one start call) */
    if (!csEx) { csEx = exRow(addIdea, function () { return !el.cs.hidden && !state.busy; }, "", true, true); el.csEx.appendChild(csEx); }
    else refreshEx();
    el.csStatus.textContent = building ? "Growing your cloud…" : failed ? "That didn't work just now. Try again in a moment, or talk it over with Iko." : "";
    el.cs.classList.toggle("busy", building);
    placeStart();
    placeIkoSoon();
  }
  var csEx = null;
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
  window.addEventListener("resize", function () { placeStart(); });
  if (window.visualViewport) { window.visualViewport.addEventListener("resize", function () { placeStart(); }); window.visualViewport.addEventListener("scroll", function () { placeStart(); }); }
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
  el.toCloud.addEventListener("click", function () { home(); });
  el.cloudDeck.addEventListener("click", function () { closeCloud(true); showDeck(true); });
  /* Back on the cloud: a slim row of the suggested cards and Draw along the bottom (hidden while a panel is open). */
  var cloudFlow = null;
  function renderCloudFlow() {
    if (!cloudFlow) { cloudFlow = mk("div", "cloud-flow"); el.cloud.appendChild(cloudFlow); }
    var had = document.activeElement && cloudFlow.contains(document.activeElement) && document.activeElement.classList.contains("dir-in");
    cloudFlow.textContent = "";
    cloudFlow.hidden = !el.panel.hidden || Boolean(cloudCaption && !cloudCaption.hidden);
    renderStart();
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
    el.cloud.hidden = true; el.panel.hidden = true; state.panelNode = null; cardSig = "";
    if (big) { big.spin(false); big.hold(false); }
    if (!keepView && !state.lessonNode) { renderDraw(); el.input.focus(); }
  }

  function pick(hit) {
    if (hit.node && !hintSeen("cloud")) { dismissHint("cloud"); renderCloudHint(); } /* they found it: the tip has done its job */
    if (hit.test) openTest(hit.test);
    else if (hit.root) openPanel("root");
    else if (hit.node) openPanel(hit.node.id);
  }

  /* keepNote: leave the note as is; keepView: don't move the camera. The note is never written by opening a panel (see below). */
  function openPanel(id, keepNote, keepView) {
    if (state.panelNode !== id) cancelCall("notice");
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
    if (keepView) return;
    focusInView(isRoot ? "root" : id, isRoot); /* the name too: the camera eases it into view, its card beside it */
  }
  /*
   * The name's card: a compact look at the whole cloud (0 calls). Achievements (the cards in the Deck, by tier), a
   * progress summary (subjects, topics finished, right answers), recent activity when there is some, one soft insight
   * (#98's notes, only once their threshold is met), what's next, and Save IkoCloud / Open IkoCloud.
   */
  function renderStats() {
    var st = P.homeStats(state.cloud, Date.now()), box = mk("div", "stats");
    var row = function (head, text, extra) { var r = mk("div", "st-row"); r.appendChild(mk("p", "st-head", head)); var t = mk("p", "st-text", text); if (extra) { t.appendChild(document.createTextNode(" ")); t.appendChild(extra); } r.appendChild(t); box.appendChild(r); return r; };
    var tiers = [["merged", "Merged"], ["achieved", "Achieved"], ["tinted", "Tinted"], ["inked", "Inked"], ["sketch", "Sketch"]].filter(function (x) { return st.tiers[x[0]]; }).map(function (x) { return st.tiers[x[0]] + " " + x[1]; });
    var deck = st.cards ? linkBtn("Open your Deck", function () { closeCloud(true); showDeck(true); }, "link st-link") : null;
    row("Achievements", st.cards ? (st.cards === 1 ? "1 card" : st.cards + " cards") + " in your Deck" + (tiers.length ? " · " + tiers.slice(0, 3).join(", ") : "") + "." : "No cards yet. Open a lesson and its card joins your Deck.", deck);
    row("Progress", (st.subjects === 1 ? "1 subject" : st.subjects + " subjects") + " · " + st.done + " of " + st.topics + (st.topics === 1 ? " topic" : " topics") + " finished · " + (st.right === 1 ? "1 right answer" : st.right + " right answers") + ".");
    var act = st.streak >= 2 ? st.streak + " days in a row, and " + st.week + " of the last 7." : st.week ? "Learning on " + st.week + (st.week === 1 ? " day" : " days") + " of the last 7." : st.last ? "Last time you learned was " + agoText(st.last) + "." : "";
    if (act) row("Lately", act);
    if (st.insight) box.appendChild(mk("p", "st-insight", st.insight.text));
    var nx = nodeOf(state.cloud.next);
    if (nx && !P.unfinished(state.cloud, nx.id)) nx = nodeOf(P.pathNext(state.cloud, nx.id)); /* finished since: the next unfinished step after it */
    if (nx) {
      var pnx = mk("p", "next-up", "Next up: ");
      pnx.appendChild(linkBtn(nx.label, function () { openPanel(nx.id); }));
      pnx.appendChild(document.createTextNode(" in " + trailOf(nx.parent)));
      box.appendChild(pnx);
    }
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
    if (!big || el.panel.hidden || !state.panelNode) return;
    var q = big.project(state.panelNode === "root" ? "root" : state.panelNode);
    if (!q) return;
    var cw = el.cloudCanvas.clientWidth, ch = el.cloudCanvas.clientHeight, box = el.panel.firstElementChild;
    var pw = el.panel.offsetWidth, ph = (box ? box.offsetHeight : el.panel.scrollHeight) + 2;
    var at = CAM.cardPlace(q.x, q.y, pw, ph, cw, ch, cloudTop());
    var x = Math.max(CAM.CARD.margin, Math.min(cw - CAM.CARD.margin - pw, at.x)), y = Math.max(CAM.CARD.margin, at.y);
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
    el.panel.hidden = true; state.panelNode = null; cardSig = "";
    if (big) big.clearFocus();
    renderCloudFlow();
  }
  if (window.ResizeObserver) new ResizeObserver(function () { cardSig = ""; placeCard(); }).observe(el.panel);
  window.addEventListener("resize", function () { cardSig = ""; placeCard(); });

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
  el.zin.addEventListener("click", function () { big.zoomBy(1.35); });
  el.zout.addEventListener("click", function () { big.zoomBy(1 / 1.35); });
  el.zreset.addEventListener("click", function () { big.recentre(); });
  /* one faint line documents the input map, for touch or for a mouse */
  renderCloudHint();
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (el.ikc && !el.ikc.hidden) { confirmDone(false); return; } /* a confirm: Escape is Cancel */
    if (iko.open) { closeIko(); if (!el.ikoWrap.hidden) el.iko.focus(); return; }
    if (!el.cloud.hidden) { if (!el.panel.hidden) closeCard(); return; } /* the cloud is home: Escape only closes its card */
    if (state.lessonNode) el.lBack.click();
    else if (!el.hub.hidden) hubBack();
    else if (!el.deck.hidden) el.dBack.click();
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
  var iko = { open: false, ctx: null, from: 0, lineT: 0, tipKey: "", tipT: 0, pendingReact: null };
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
   * The chat's frame (#104): on a phone a sheet rising from below; on a wide screen a panel hanging from Iko at the top
   * left, under the header, and the page steps right to make room for it, so it never covers the reading or the deck.
   */
  var SIDE_MIN = 900;
  function sideIko() {
    var side = iko.open && window.innerWidth >= SIDE_MIN && !el.ikoWrap.hidden;
    document.body.classList.toggle("iko-side", side);
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
      if (m.role === "grow") { el.ikoLog.appendChild(mk("p", "iko-msg grow", m.text)); return; }
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
    closeIko();
    if (state.lessonNode) showLesson(false);
    if (!el.deck.hidden) showDeck(false);
    if (!el.hub.hidden) { el.hub.hidden = true; state.hubNode = null; el.thread.hidden = false; el.dock.hidden = false; }
    if (!el.cloud.hidden) closeCloud(); else { renderDraw(); el.input.focus(); }
    scrollDown();
  });
  /*
   * Iko's bubble beside the pebble ("" hides it); it folds away on its own. Tapping it opens the full chat, like the pebble.
   * One thing at a time: a reaction or a note replaces the screen's tip, and a tip held back gets its turn afterwards.
   */
  function ikoLine(t, ms) {
    clearTimeout(iko.lineT);
    el.ikoLine.textContent = t || "";
    el.ikoLine.hidden = !t;
    el.ikoLine.removeAttribute("data-tip"); el.ikoLine.removeAttribute("data-react");
    if (t) clearTimeout(iko.tipT);
    if (t) iko.lineT = setTimeout(function () { el.ikoLine.hidden = true; placeIko(); var nx = iko.after; iko.after = null; if (nx) nx(); else tipAgain(); }, ms || 9000);
    placeIko();
  }
  el.ikoLine.addEventListener("click", function () { if (!iko.open) openIko(); });
  /* shown on the cloud (and its opening question), a lesson or test, a card and the deck; hidden in the whole conversation and on the welcome */
  function ikoScreen() { return el.welcome.hidden && !el.chat.hidden && (!el.cloud.hidden || !el.lesson.hidden || !el.deck.hidden || !el.hub.hidden); }
  function renderIko() {
    var on = ikoScreen();
    if (iko.open && (!on || (screenCtx().id || "") !== (iko.ctx.id || "") || (screenCtx().view === "chat"))) closeIko(); /* the screen changed under it */
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
   * Where Iko sits (#104): in the header's top-left corner, as the button, beside "Your cloud" on the lesson, deck and card
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
      if (lineAt === document.body) lineAt.insertBefore(el.ikoLine, el.ikoWrap.parentNode === document.body ? el.ikoWrap : null);
      else lineAt.appendChild(el.ikoLine);
    }
    document.body.classList.toggle("iko-asks", asking);
  }
  /*
   * A short bubble for each screen (PR 103): light context and what to do next, from local templates (0 calls). Each screen
   * has a few variants; one shows when the screen opens (at most once a visit per screen, sessionStorage CUES), the least
   * shown first, never the one shown last, and each variant at most TIP_MAX times for this learner (ikolearn-iko): so the
   * guidance never repeats across pages and grows quiet as the learner gets comfortable.
   */
  var TIPS = {
    /* the opening question is Iko's own speech (#104): no bubble there. Lines that would repeat a page's own words are gone. */
    cloud: [{ t: "I like your cloud, it's growing!", ok: function () { return C.subjects(state.cloud).length >= 2 || (state.cloud.deck || []).length >= 1; } }, "I can add new topics anytime. Just {tap} me and tell me what you're curious about."],
    home: ["That's you, in the middle. Your subjects grow around you."],
    topic: ["Curious about this one? {Tap} me and ask anything."],
    learn: ["Read along and {click} me if you have questions."],
    check: ["Get them all right and the card is yours to grow.", "No rush. Each question is about what you just read."],
    missed: ["Take it slowly. You've got this."],
    test: ["An optional test on what you've finished. No pressure."],
    deck: [{ t: "Wow, your deck is coming along.", ok: function () { return (state.cloud.deck || []).length >= 2; } }, "{Tap} any card to keep it growing."]
  };
  function tipWords(t) { var c = coarse(); return t.replace("{tap}", c ? "tap" : "click").replace("{Tap}", c ? "Tap" : "Click").replace("{click}", c ? "tap" : "click"); }
  var TIP_MAX = 1;
  function ikoMem() {
    var who = (PR && PR.current(localStorage) || {}).active || "me", all = {};
    try { all = JSON.parse(localStorage.getItem(IKO_MEM) || "{}") || {}; } catch { all = {}; }
    var m = all[who] && typeof all[who] === "object" ? all[who] : {};
    return { who: who, all: all, t: m.t && typeof m.t === "object" ? m.t : {}, r: m.r && typeof m.r === "object" ? m.r : {}, last: typeof m.last === "string" ? m.last : "" };
  }
  function ikoKeep(m) { m.all[m.who] = { t: m.t, r: m.r, last: m.last }; try { localStorage.setItem(IKO_MEM, JSON.stringify(m.all)); } catch { /* full: Iko just repeats less carefully */ } }
  function tipOf(c) {
    if (!c) return "";
    if (c.view === "cloud") return state.panelNode === "root" && !el.panel.hidden ? "home" : c.topic ? "topic" : "cloud";
    if (c.view === "lesson") { var ph = lessonPhase(c.id); return c.step === "tricky" ? "" : ph === "learn" ? "learn" : ph === "check" ? "check" : ph === "missed" ? "missed" : ""; }
    return TIPS[c.view] ? c.view : "";
  }
  function tipsShown() { try { return JSON.parse(sessionStorage.getItem(CUES) || "{}") || {}; } catch { return {}; } }
  function pickTip(key) {
    var m = ikoMem(), list = TIPS[key] || [], best = -1;
    list.forEach(function (x, i) { var id = key + i, n = m.t[id] || 0; if (n >= TIP_MAX || id === m.last || (x.ok && !x.ok())) return; if (best < 0 || n < (m.t[key + best] || 0)) best = i; });
    return best < 0 ? null : { id: key + best, text: tipWords(String(list[best].t || list[best]).replace("{name}", state.name || "there")), m: m };
  }
  function ikoTip(c) {
    var key = tipOf(c);
    if (key === iko.tipKey) return;
    iko.tipKey = key;
    clearTimeout(iko.tipT);
    if (!key) return;
    iko.tipT = setTimeout(function () { showTip(key); }, 450); /* once the new screen has settled */
  }
  function tipAgain() { var k = iko.tipKey; if (k && !iko.open && !tipsShown()[k]) { clearTimeout(iko.tipT); iko.tipT = setTimeout(function () { showTip(k); }, 700); } }
  function showTip(key) {
    if (key !== iko.tipKey || iko.open || el.ikoWrap.hidden || !el.ikoLine.hidden || !state.cloud || tipsShown()[key]) return; /* Iko is speaking (or gone), or this screen had its tip this visit */
    var tip = pickTip(key);
    if (!tip) return;
    var d = tipsShown(); d[key] = 1;
    try { sessionStorage.setItem(CUES, JSON.stringify(d)); } catch { /* ignore */ }
    tip.m.t[tip.id] = (tip.m.t[tip.id] || 0) + 1; tip.m.last = tip.id; ikoKeep(tip.m);
    ikoLine(tip.text, 8000);
    el.ikoLine.setAttribute("data-tip", tip.id);
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
    if (!list.length || !reactWanted(n) || (kind === "start" && n > 1)) return false;
    var t = list[(n - 1) % list.length];
    if (!el.ikoLine.hidden && !el.ikoLine.hasAttribute("data-tip") && !el.ikoLine.hasAttribute("data-react")) return false; /* Iko is saying something that matters (the grow question): no reaction over it */
    if (iko.open || el.ikoWrap.hidden) { iko.pendingReact = t; return true; } /* said once the pebble is back */
    ikoLine(t, kind === "start" ? 9000 : 4500);
    el.ikoLine.setAttribute("data-react", kind);
    return true;
  }

  /* opened by Still tricky, the sheet covers the lesson's buttons on a phone, so it carries "I've got it" itself */
  function ikoActs() { el.ikoActs.hidden = !(iko.open && el.ikoSheet.classList.contains("tricky") && !el.lesson.hidden && !el.lDone.hidden && !el.lGot.hidden && Boolean(el.lClar.querySelector(".clar-opts"))); }
  /* the bubble steps aside at once if it would touch the selection card or a confirm, and waits while Iko asks the opening question */
  function placeIko() {
    var on = !el.ikoWrap.hidden && el.ikoWrap.getClientRects().length, talking = false;
    if (on && !el.ikoLine.hidden) {
      var line = el.ikoLine.getBoundingClientRect(), over = function (e) { if (!e || e.hidden || !e.getClientRects().length) return false; var r = e.getBoundingClientRect(); return r.width && r.left < line.right && r.right > line.left && r.top < line.bottom && r.bottom > line.top; };
      if (intakeOn || (line.width && (over(el.cloud.hidden ? null : el.panel) || over(el.ikc)))) { clearTimeout(iko.lineT); el.ikoLine.hidden = true; }
      else talking = true;
    }
    if (on && !intakeOn && iko.pendingReact && !iko.open) { var pr = iko.pendingReact; iko.pendingReact = null; setTimeout(function () { ikoLine(pr, 4500); }, 300); }
    document.body.classList.toggle("iko-talking", talking);
    if (iko.open) sideIko();
  }
  var ikoRaf = 0;
  function placeIkoSoon() { if (!ikoRaf) ikoRaf = requestAnimationFrame(function () { ikoRaf = 0; placeIko(); }); }
  window.addEventListener("resize", placeIkoSoon);
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
    el.deckBtn.hidden = !n;
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
      el.deckBtn.parentNode.appendChild(el.miniDeck);
    }
    var cards = miniDeckCards(), n = (state.cloud.deck || []).length;
    var sig = n + ":" + cards.map(function (c) { return D.evolveKey(c); }).join(",");
    var rise = miniSig !== null && sig !== miniSig && (n > Number(miniSig.split(":")[0]) || cards.reduce(function (a, c) { return a + D.evolveKey(c); }, 0) > miniSig.split(":")[1].split(",").reduce(function (a, k) { return a + (Number(k) || 0); }, 0));
    miniSig = sig;
    deckFan(el.miniDeck, cards, n);
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
    /* earned at the end of a check, the card can be scrolled out of view: bring it back so its flight is seen (PR 103) */
    if (a.bottom < 0 || a.top > window.innerHeight) { card.scrollIntoView({ block: "nearest" }); a = card.getBoundingClientRect(); }
    var b = to ? to.getBoundingClientRect() : null;
    if (!b || !a.width || !b.width || a.bottom < 0 || a.top > window.innerHeight) { state.flying = false; pulseDeck(); return; }
    var ghost = card.cloneNode(true);
    ghost.removeAttribute("id"); [].forEach.call(ghost.querySelectorAll("[id]"), function (x) { x.removeAttribute("id"); });
    ghost.classList.add("fly-card"); ghost.setAttribute("aria-hidden", "true");
    ghost.style.cssText = "position:fixed;left:" + a.left + "px;top:" + a.top + "px;width:" + a.width + "px;height:" + a.height + "px;margin:0;z-index:40;pointer-events:none;transform-origin:0 0";
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
  /* the cloud's own line: the first tip until it is dismissed (or a branch is tapped), then the controls line */
  function renderCloudHint() {
    if (!el.cloudHint) return;
    el.cloudHint.textContent = "";
    var h = state.cloud && C.subjects(state.cloud).length ? hintEl("cloud", renderCloudHint) : null; /* (at load there is no cloud yet) */
    el.cloudHint.classList.toggle("newcomer", Boolean(h));
    if (h) { while (h.firstChild) el.cloudHint.appendChild(h.firstChild); return; }
    el.cloudHint.textContent = CAM ? CAM.hint(Boolean(window.matchMedia && window.matchMedia("(pointer: coarse)").matches)) : "";
  }
  function showDeck(on) {
    if (on && state.lessonNode) showLesson(false);
    if (on) el.hub.hidden = true;
    var was = !el.deck.hidden;
    el.deck.hidden = !on;
    el.thread.hidden = on;
    el.dock.hidden = on;
    if (on) { el.draw.hidden = true; renderDeck(!was); window.scrollTo(0, 0); } else { renderDraw(); scrollDown(); }
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
    renderHub(true);
    window.scrollTo(0, 0);
    viewIn(el.hub.querySelector(".hub-info"));
    liftCard(el.hubCard.firstElementChild, rect);
  }
  function hubBack() {
    var from = state.hubFrom, id = state.hubNode;
    el.hub.hidden = true; state.hubNode = null;
    if (from && from !== "deck" && from !== "cloud" && from !== "chat" && (nodeOf(from) || C.inDeck(state.cloud, from))) return openHub(from, null, "deck");
    if (from === "cloud" && nodeOf(id)) { el.thread.hidden = false; el.dock.hidden = false; openCloud(); openPanel(id); return; }
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
    el.hubNote.textContent = sp.blurb || (n && n.ghost ? "A suggested branch you haven't opened yet." : "");
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
    /* (the deck's own lede says what cards are: no second tip here, #104) */
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
  el.reset.addEventListener("click", function () {
    var guiding = PR && PR.mode(localStorage) === "guide";
    if (!window.confirm(guiding ? "Start over for " + state.name + "? This clears " + state.name + "'s chat, cloud and lessons from this device. Other learners are kept." : "Start over? This clears your name, chat, cloud and lessons from this device.")) return;
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
  function exportCloud(st) {
    if (!T || !state.cloud) return;
    save();
    var f = T.build(localStorage, Date.now());
    if (!f) { st.textContent = "Your IkoCloud couldn't be saved just now."; return; }
    var url = URL.createObjectURL(new Blob([f.text], { type: "application/json" })), a = mk("a");
    a.href = url; a.download = f.name; a.hidden = true;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    st.textContent = T.MSG.saved(f.name);
    placeCard();
  }
  var ctStatus = null;
  function pickCloud(st) { if (!T || !el.ctFile) return; el.ctFile.accept = T.ACCEPT; ctStatus = st; if (st) st.textContent = ""; el.ctFile.value = ""; el.ctFile.click(); }
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
    renderThread();
    renderDeckButton();
    countVisit();
    if (P.needsOnboarding(state.cloud)) { if (!state.thread.some(function (m) { return m.role === "user"; })) state.thread = []; renderThread(); runOnboarding(); }
    else if (!state.thread.length) greet();
    startSession();
    openCloud(true); /* home: the cloud, with the name in the centre (a first visit, a guide's learner, a return) */
  }
  /* Once per browser session: for "seems stuck" (visits without a lesson). */
  function countVisit() {
    var pr = C.profileOf(state.cloud);
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
    if (!state.name) { showWelcome(); return; }
    showWho();
    state.cloud = C.deserialize(load(LS.cloud)) || C.create(state.name);
    try { state.thread = C.trimThread(JSON.parse(load(LS.thread) || "[]")); } catch { state.thread = []; }
    try { state.notes = JSON.parse(load(LS.notes) || "{}") || {}; } catch { state.notes = {}; }
    try { state.lessons = JSON.parse(load(LS.lessons) || "{}") || {}; } catch { state.lessons = {}; }
    try { state.tests = JSON.parse(load(LS.tests) || "{}") || {}; } catch { state.tests = {}; }
    try { var v = JSON.parse(load(LS.view) || "null"); state.view = v && Number.isFinite(v.z) ? v : null; } catch { state.view = null; }
    try { var sn = JSON.parse(load(LS.seen) || "null"); if (sn && sn.c && typeof sn.c === "object") state.seen = { c: sn.c, ev: Number(sn.ev) || 0, h: sn.h && typeof sn.h === "object" ? { cloud: sn.h.cloud ? 1 : 0, card: sn.h.card ? 1 : 0, deck: sn.h.deck ? 1 : 0, iko: sn.h.iko ? 1 : 0, grow: sn.h.grow ? 1 : 0 } : {} }; } catch { /* keep the empty default */ }
    save(); /* writes a migrated (older -> v9) cloud back in the compact format, with the deck backfilled */
    startChat();
    settleMerges(); /* existing completion data can already form parent cards (0 calls) */
  })();
})();
