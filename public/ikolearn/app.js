/*
 * IkoLearn app: chat harness, learning cards, lessons and the learning cloud. Vanilla JS, no build step.
 * Talks only to our own routes under /api/ikolearn (the server holds the Gemini key). Everything about the learner
 * (first name, recent conversation, cloud, cards, lessons) is kept in this browser's localStorage.
 * Calls: chat turn 1, tap note 1 (cached), card 1, related topics 1 (only once a branch has ended), map a path 1,
 * lesson 1 (cached per node; the same call brings 2-3 check questions, the fork of 2-3 choices, the card's line, and the
 * topic's child topics when it has none, which grow onto the cloud once the topic is engaged), test 1 (cached until taken).
 * Suggestions, Draw, the orchestrator (orchestrator.js), answering, reopening a lesson, picking a fork choice, the holder,
 * the deck, card colour and the top 10 cost nothing.
 */
(function () {
  "use strict";
  var C = window.IkoCloud, V = window.IkoCloudView, L = window.IkoLesson, D = window.IkoDeck, R = window.IkoRank, P = window.IkoPlan;
  var API = "/api/ikolearn";
  var LS = { name: "ikolearn.v1.name", cloud: "ikolearn.v1.cloud", thread: "ikolearn.v1.thread", notes: "ikolearn.v1.notes", lessons: "ikolearn.v1.lessons", tests: "ikolearn.v1.tests" };
  var VISIT = "ikolearn.v1.visit"; /* sessionStorage: this browser session was counted as a visit */
  var SESSION = "ikolearn.v1.session"; /* sessionStorage: the old once-a-visit draw (no longer written; cleared on reset) */
  var HISTORY = 10, TIMEOUT_MS = 60000, MAX_LESSONS = 30;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    welcome: $("welcome"), nameForm: $("name-form"), nameIn: $("name-in"),
    chat: $("chat"), thread: $("thread"), dock: $("dock"), composer: $("composer"), input: $("input"), send: $("send"),
    thumb: $("thumb"), thumbCanvas: $("thumb-canvas"), reset: $("reset"),
    focusChip: $("focus-chip"), focusText: $("focus-text"), focusClear: $("focus-clear"),
    lesson: $("lesson"), lBack: $("l-back"), lTrail: $("l-trail"), lTitle: $("l-title"), lBody: $("l-body"), lDone: $("l-done"),
    lGot: $("l-got"), lTricky: $("l-tricky"), lStatus: $("l-status"), lPath: $("l-path"), lChat: $("l-chat"), lRedo: $("l-redo"),
    cloud: $("cloud"), cloudCanvas: $("cloud-canvas"), cloudClose: $("cloud-close"), zin: $("zin"), zout: $("zout"), zreset: $("zreset"),
    panel: $("panel"), pKicker: $("p-kicker"), pTitle: $("p-title"), pNote: $("p-note"), pLesson: $("p-lesson"), pCard: $("p-card"), pAdj: $("p-adj"),
    pChat: $("p-chat"), pPath: $("p-path"), pCards: $("p-cards"), pClose: $("p-close"),
    draw: $("draw"), deckBtn: $("deck-btn"), deck: $("deck"), dBack: $("d-back"), dLede: $("d-lede"), dGrid: $("d-grid"), dBalance: $("d-balance"),
    lCard: $("l-card"), lFork: $("l-fork"), lQuiz: $("l-quiz"), hNote: $("h-note"),
    top: $("top"), tLede: $("t-lede"), tList: $("t-list"),
    dSuggest: $("d-suggest"), hKids: $("h-kids"), lPhase: $("l-phase"), phLearn: $("ph-learn"), phCheck: $("ph-check"), pTest: $("p-test"),
    lMain: document.querySelector("#lesson .l-main"),
    youAge: $("you-age"), youRegion: $("you-region"), youGuess: $("you-guess"), youClear: $("you-clear"), youSaved: $("you-saved"), youLink: $("you-link"), you: $("you")
  };
  var reduceMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  var state = { name: "", cloud: null, thread: [], notes: {}, lessons: {}, busy: false, focus: null, panelNode: null, lessonNode: null, lessonAt: 0, revealed: false, lifted: 0, session: null, quiz: null, tests: {}, test: null, mode: "lesson", bridgeQueue: [] };
  var mini = null, big = null;

  /* ---------- storage ---------- */
  function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function store(k, v) { try { localStorage.setItem(k, v); } catch { /* full or blocked: keep working in memory */ } }
  function keepNewest(obj, max) {
    var keys = Object.keys(obj).sort(function (a, b) { return (obj[a].at || 0) - (obj[b].at || 0); }).slice(-max), out = {};
    keys.forEach(function (k) { out[k] = obj[k]; });
    return out;
  }
  function save() {
    C.joinDeck(state.cloud); /* any topic past the threshold joins the deck for good */
    store(LS.cloud, C.serialize(state.cloud));
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
  function nextStep(id) {
    var n = nodeOf(id);
    if (!n) return null;
    var pick = n.fork && n.fork.picked;
    if (!(pick && nodeOf(pick) && !C.isDone(state.cloud, pick))) { var k = P.nextChild(state.cloud, id); if (k) return k; }
    return C.nextFor(state.cloud, id);
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
    var rec = nextStep(id);
    wrap.appendChild(mk("p", "l-head", opts.heading || "Your path"));
    var ol = mk("ol");
    n.path.ids.forEach(function (sid) {
      var s = nodeOf(sid); if (!s) return;
      var li = mk("li", sid === rec ? "next" : "");
      li.appendChild(linkBtn(s.label, function () { (opts.onStep || openLesson)(sid); }));
      if (s.mastery >= C.MASTERED) li.appendChild(mk("span", "tag", " · done"));
      else if (sid === rec) li.appendChild(mk("span", "tag", " · next"));
      ol.appendChild(li);
    });
    wrap.appendChild(ol);
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

  /* A first-run or re-ask question: chips (one, or several for interests), an optional typed answer, and Skip. */
  var askHandlers = {};
  function renderAsk(m) {
    var d = mk("div", "msg model ask");
    var body = mk("div"); paragraphs(body, m.text || ""); d.appendChild(body);
    if (m.done) return d;
    var picked = {}, go = askHandlers[m.id] || function () {};
    var chips = mk("div", "chips ask-chips");
    (m.chips || []).forEach(function (c) {
      var b = linkBtn(c.label, function () {
        if (!m.multi) { go(c.value, c.label); return; }
        picked[c.value] = !picked[c.value];
        b.classList.toggle("on", picked[c.value]); b.setAttribute("aria-pressed", picked[c.value] ? "true" : "false");
      }, "btn chip-q");
      if (m.multi) b.setAttribute("aria-pressed", "false");
      chips.appendChild(b);
    });
    d.appendChild(chips);
    var row = mk("div", "ask-row"), inp = null;
    if (m.input) { inp = mk("input", "ask-in"); inp.maxLength = 40; inp.placeholder = m.multi ? "Or type something you enjoy" : "Type here"; inp.setAttribute("aria-label", m.text); row.appendChild(inp); }
    if (m.multi || m.input) {
      var ok = linkBtn(m.go || "Done", function () {
        var vals = Object.keys(picked).filter(function (k) { return picked[k]; });
        var typed = inp ? C.cleanLabel(inp.value) : "";
        if (typed) vals.push(typed);
        go(m.multi ? vals : typed, (m.multi ? vals.join(", ") : typed) || "Skip");
      }, "btn draw-btn sm");
      row.appendChild(ok);
    }
    row.appendChild(linkBtn("Skip", function () { go(m.multi ? [] : "", "Skip"); }, "link"));
    d.appendChild(row);
    return d;
  }
  /* Asks one question in the chat; cb(value) once answered. The answer shows as the learner's reply. */
  function ask(q, cb) {
    var m = { role: "ask", local: true, text: q.q, chips: q.chips || [], multi: Boolean(q.multi), input: Boolean(q.input), go: q.go };
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
    else if (m.role === "card") {
      d = cardNode(m.card, m.card.node && nodeOf(m.card.node) ? "On " + trailOf(m.card.node) : "");
    } else if (m.role === "grow") {
      d = mk("p", "grow", m.text);
      var on = nodeOf(m.open);
      if (on) { d.appendChild(document.createTextNode(" · ")); d.appendChild(linkBtn("Open a lesson on " + on.label, function () { openLesson(on.id); })); }
    } else {
      d = mk("div", "msg " + m.role + (m.streaming ? " streaming" : ""));
      var body = mk("div"); paragraphs(body, m.text || ""); d.appendChild(body);
      if (m.role === "model" && m.topic && !m.streaming && !m.fallback) {
        var acts = mk("div", "acts");
        acts.appendChild(linkBtn("Make a card on " + m.topic, function () { makeCard(m.topic, m.parent || ""); }));
        d.appendChild(acts);
      }
      if (m.role === "model" && m.opens && m.opens.length && !m.streaming) {
        var go = mk("div", "acts");
        m.opens.forEach(function (id, i) { var n = nodeOf(id); if (!n) return; if (go.childNodes.length) go.appendChild(document.createTextNode(" · ")); go.appendChild(linkBtn(i ? n.label : "Open " + n.label, function () { openCard(id, null); })); });
        d.appendChild(go);
      }
      if (m.chips && m.chips.length) {
        var wrap = mk("div");
        wrap.appendChild(d);
        var chips = mk("div", "chips");
        m.chips.forEach(function (c) { chips.appendChild(linkBtn(c, function () { if (!state.busy) send(c); }, "btn")); });
        wrap.appendChild(chips);
        d = wrap;
      }
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
  }
  function scrollDown() { if (!state.lessonNode) window.scrollTo(0, document.documentElement.scrollHeight); }
  var mid = 0;
  function push(m) { m.id = m.id || ("m" + Date.now().toString(36) + (mid++)); m.at = m.at || Date.now(); state.thread.push(m); upsert(m); scrollDown(); return m; }

  function setFocus(id) {
    state.focus = nodeOf(id) ? id : null;
    el.focusChip.hidden = !state.focus;
    if (state.focus) el.focusText.textContent = "Focus: " + trailOf(state.focus);
  }

  /* ---------- growth ---------- */
  function grow(block, fallbackId) {
    var topics = (block && block.topics) || [], ghosts = (block && block.ghosts) || [];
    var r = C.applyTopics(state.cloud, topics);
    var g = C.addGhosts(state.cloud, ghosts, Date.now(), fallbackId || state.focus || null);
    var parts = [];
    r.parentsCreated.forEach(function (id) { parts.push("new subject " + state.cloud.nodes[id].label); });
    /* a new chain is named once, at its deepest new link: "Making & Coding → Programming → Python → Sets (new)" */
    r.created.filter(function (id) { return !r.created.some(function (o) { return o !== id && C.ancestry(state.cloud, o).indexOf(id) >= 0; }); })
      .forEach(function (id) { parts.push(C.trail(state.cloud, id, " → ") + " (new)"); });
    r.promoted.forEach(function (id) { parts.push(trailOf(id) + " (explored)"); });
    r.strengthened.forEach(function (id) { var n = nodeOf(id); if (n && n.parent) parts.push(n.label + " (stronger)"); });
    if (g.added.length) parts.push(g.added.length === 1 ? "1 idea to explore" : g.added.length + " ideas to explore");
    var ids = r.created.concat(r.promoted, r.strengthened, r.parentsCreated, g.added);
    refreshViews(ids);
    /* offer the topic itself (not a link created on its chain) when it is new or newly explored */
    var grown = r.created.concat(r.promoted), main = topics[0] && C.findTopic(state.cloud, topics[0].name);
    var fresh = main && grown.indexOf(main.id) >= 0 ? main.id : grown.filter(function (id) { return nodeOf(id) && nodeOf(id).parent; })[0];
    if (parts.length) push({ role: "grow", text: "Your cloud grew: " + parts.join(" · "), open: fresh || null });
    /* a topic that landed right under its subject on a shallow chain gets its in-between steps after this reply (one call, once) */
    topics.forEach(function (tp) {
      var hit = C.findTopic(state.cloud, tp.name);
      if (hit && grown.indexOf(hit.id) >= 0 && P.needsBridge(state.cloud, hit.id, (tp.chain || []).length) && state.bridgeQueue.indexOf(hit.id) < 0) state.bridgeQueue.push(hit.id);
    });
    return { topic: topics[0] || null };
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
  function basePayload(focusId) {
    var n = nodeOf(focusId);
    var p = n && n.parent ? nodeOf(n.parent) : null, pr = C.profileOf(state.cloud);
    return {
      age: pr.age || "", region: pr.region || "", /* coarse only: an age band and a rough region, never precise data */
      name: state.name, focus: n ? n.label : "", focusParent: p ? p.label : "", trail: n ? C.trail(state.cloud, n.id) : "",
      known: n ? C.knownUnder(state.cloud, n.id) : [], cloud: C.summarize(state.cloud), parents: C.subjectLabels(state.cloud)
    };
  }

  function post(path, body) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .finally(function () { clearTimeout(timer); });
  }
  function postJson(path, body) {
    return post(path, body).then(function (res) { return res.json().catch(function () { return {}; }); }).catch(function () { return { ok: false, reason: "offline" }; });
  }

  /* Reads an NDJSON event stream. on: { delta(text), cloud(ev), path(ev) }. Resolves { ok, reason }. */
  function stream(path, body, on) {
    return post(path, body).then(function (res) {
      if (!res.ok || !res.body) {
        return res.json().catch(function () { return {}; }).then(function (j) { return { ok: false, reason: j.error || String(res.status) }; });
      }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "", result = { ok: false, reason: "cut" }, got = false;
      function handle(line) {
        if (!line.trim()) return;
        var ev; try { ev = JSON.parse(line); } catch { return; }
        if (ev.t === "delta" && typeof ev.text === "string") { got = true; on.delta(ev.text); }
        else if (ev.t === "cloud" && on.cloud) on.cloud(ev);
        else if (ev.t === "path" && on.path) on.path(ev);
        else if (ev.t === "done") result = { ok: true };
        else if (ev.t === "error") result = { ok: got, reason: ev.reason };
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
    }).catch(function () { return { ok: false, reason: "offline" }; });
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

  function lock(on) {
    state.busy = on;
    [el.send, el.pCard, el.pAdj, el.pLesson, el.pTest, el.lGot, el.lTricky].forEach(function (b) { b.disabled = on; });
    Array.prototype.forEach.call(document.querySelectorAll(".draw-btn"), function (b) { b.disabled = on; });
  }

  /* ---------- chat ---------- */
  function send(text) {
    text = String(text || "").replace(/\s+$/, "").trim().slice(0, 1500);
    if (!text || state.busy) return;
    lock(true);
    push({ role: "user", text: text });
    var m = push({ role: "model", text: "", streaming: true });
    var body = Object.assign(basePayload(state.focus), { mode: "chat", messages: history() });
    stream("/chat", body, {
      delta: function (t) { m.text += t; upsert(m); scrollDown(); },
      cloud: function (ev) { var r = grow(ev); if (r.topic) { m.topic = r.topic.name; m.parent = r.topic.parent; } }
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
    postJson("/create", Object.assign(basePayload(id), { mode: "notice", messages: history().filter(function (m) { return m.role === "user"; }).slice(-1) }, P.bridgeRequest(state.cloud, id))).then(function (j) {
      if (!(j && j.ok && Array.isArray(j.items))) return;
      var before = C.trail(state.cloud, id, " → ");
      var r = C.applyBridge(state.cloud, id, j);
      save();
      if (r.moved) {
        refreshViews(r.created.concat(id));
        push({ role: "grow", text: "Filled in the steps for " + nodeOf(id).label + ": " + C.trail(state.cloud, id, " → ") + " (was " + before + ")", open: id });
      }
    }).then(function () { save(); lock(false); state.bridgeQueue = []; });
  }

  function makeCard(topic, parent) {
    if (state.busy) return;
    lock(true);
    var wait = push({ role: "grow", text: "Making a card on " + topic + "..." });
    var node = C.findTopic(state.cloud, topic) || C.findSubject(state.cloud, topic);
    var body = Object.assign(basePayload(node ? node.id : null), { focus: topic, focusParent: parent || (node && node.parent ? nodeOf(node.parent).label : ""), messages: history() });
    postJson("/card", body).then(function (j) {
      removeMsg(wait);
      if (j && j.ok && j.card) {
        var r = C.attachCard(state.cloud, j.card);
        push({ role: "card", text: r.card.title, card: r.card });
        refreshAll(r.grew.created.concat(r.grew.promoted, r.grew.strengthened, r.grew.parentsCreated, r.path ? r.path.added : []));
      } else {
        push({ role: "grow", text: "I couldn't make that card just now (" + ((j && (j.reason || j.error)) || "error") + "). Try again in a moment." });
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
   * Shows the build: each new parent appears on the cloud, then its child placeholders, a beat apart, so the learner
   * sees their cloud being made. Resolves the ids of the parents.
   */
  function animateBuild(items, focusId) {
    var parents = [];
    openCloud();
    setCloudCaption("Building your cloud...");
    var chain = Promise.resolve();
    items.forEach(function (it) {
      chain = chain.then(function () {
        if (focusId) return;
        var r = C.applyCreate(state.cloud, { items: [{ node: it.node, card: it.card, children: [] }] });
        parents = parents.concat(r.nodes.filter(function (x) { return parents.indexOf(x) < 0; }));
        refreshViews(r.order.length ? r.order : r.nodes);
        return wait(700);
      }).then(function () {
        var r = C.applyCreate(state.cloud, { items: [it] }, focusId ? { focusId: focusId } : {});
        if (focusId) parents = r.nodes;
        refreshViews(r.children);
        return wait(700);
      });
    });
    return chain.then(function () { setCloudCaption(""); save(); return parents; });
  }
  /* A slim caption on the cloud while it is being built. */
  var cloudCaption = null;
  function setCloudCaption(t) {
    if (!cloudCaption) { cloudCaption = mk("p", "cloud-caption"); cloudCaption.setAttribute("aria-live", "polite"); el.cloud.appendChild(cloudCaption); }
    cloudCaption.textContent = t; cloudCaption.hidden = !t;
    if (cloudFlow) cloudFlow.hidden = Boolean(t) || !el.panel.hidden;
    if (!t) renderCloudFlow();
  }
  /* No model (off, offline, or an unusable answer): a few broad subjects from the palette, matched to the interests. */
  function fallbackParents(interests) {
    var labels = [];
    (interests || []).forEach(function (x) { var h = C.paletteHue(x); var p = C.PALETTE.filter(function (q) { return q.hue === h; })[0]; if (p && labels.indexOf(p.label) < 0) labels.push(p.label); });
    ["Reading & Writing", "Math", "Science"].forEach(function (l) { if (labels.length < 3 && labels.indexOf(l) < 0) labels.push(l); });
    return labels.slice(0, 3).map(function (l) { return C.plant(state.cloud, l, null, Date.now(), false); }).filter(Boolean).map(function (n) { return n.id; });
  }
  /*
   * One creation call for new parents: "start" (after the first questions) or "more" (after a light re-ask), then the
   * visible build. Falls back to broad palette subjects when the call can't be made.
   */
  function buildCloud(kind, interests) {
    if (state.busy) return;
    lock(true);
    var m = push({ role: "model", local: true, streaming: true, text: kind === "start" ? "Thanks, " + state.name + ". I'm building your first topics now..." : "Let me build something new around " + (interests.join(", ") || "that") + "..." });
    var req = P.createRequest(state.cloud, kind, null, { interests: interests });
    postJson("/create", Object.assign(basePayload(null), { mode: "notice" }, req)).then(function (j) {
      if (j && j.ok && Array.isArray(j.items) && j.items.length) {
        return animateBuild(j.items, null).then(function (ids) {
          var names = ids.map(function (x) { return nodeOf(x) && nodeOf(x).label; }).filter(Boolean);
          var pr = C.profileOf(state.cloud);
          m.streaming = false;
          m.text = (kind === "start" ? "Here's your cloud to start: " : "New on your cloud: ") + names.join(", ") + ". Each one has a few smaller topics waiting, best first. Pick a card, or draw one." +
            (kind === "start" && pr.region ? " I'm fitting things to " + pr.region + (pr.age ? ", age " + P.AGE_LABELS[pr.age] : "") + ". You can change that under About you." : "");
          m.opens = ids.slice(0, 5);
          upsert(m);
        });
      }
      var ids = kind === "start" ? fallbackParents(interests) : [];
      m.streaming = false;
      m.text = reasonLead(j && (j.reason || j.error)) + (ids.length ? " So I've started you with a few broad areas: " + ids.map(function (x) { return nodeOf(x).label; }).join(", ") + ". Open one for a lesson and it will grow from there." : " Let's try that again a little later.");
      upsert(m);
      refreshViews(ids);
    }).then(function () { save(); lock(false); renderDraw(); });
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
        var first = nodeOf(P.nextChild(state.cloud, id));
        say(r.children.length ? "Next in " + n.label + ": " + r.children.map(function (x) { return nodeOf(x).label; }).join(", ") + "." + (first ? " " + first.label + " is a good place to start." : "") : "Nothing new to add in " + n.label + " right now.");
      } else say("I couldn't work out what comes next just now (" + ((j && (j.reason || j.error)) || "error") + "). Try again in a moment.");
    }).then(function () { save(); lock(false); if (!el.draw.hidden) renderDraw(); });
  }
  /* The first-run questions (static, on the device), then one creation call builds the first parents. */
  function runOnboarding() {
    var qs = P.onboarding(state.cloud, true), answers = {}, i = 0;
    push({ role: "model", local: true, text: "Hi " + state.name + ", welcome to IkoLearn. Around your name is your learning cloud. Before we start, a couple of quick questions so I can build it around you. Each one is optional." });
    var next = function () {
      if (i >= qs.length) {
        C.setProfile(state.cloud, { age: answers.age || "", interests: answers.interests || [], onboarded: true });
        save();
        buildCloud("start", C.profileOf(state.cloud).interests.slice(-5));
        return;
      }
      var q = qs[i++];
      if (q.id === "interests") q.go = "Build my cloud";
      ask(q, function (v) { answers[q.id] = v; if (q.id === "age") C.setProfile(state.cloud, { age: v || "" }); save(); next(); });
    };
    next();
  }
  /* The light re-ask (one question): its answer is one creation call for 1 or 2 new parents. */
  function answerReask(v) {
    var list = (Array.isArray(v) ? v : [v]).map(C.cleanLabel).filter(Boolean);
    C.setProfile(state.cloud, { askedAt: true, interests: list });
    save();
    if (list.length) buildCloud("more", list); else renderDraw();
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
    if (!on) stopClock();
    if (on) el.deck.hidden = true;
    el.lesson.hidden = !on;
    el.thread.hidden = on;
    el.dock.hidden = on;
    if (!on) { state.lessonNode = null; state.mode = "lesson"; state.test = null; renderThread(); renderDraw(); }
    else el.draw.hidden = true;
  }

  function renderLessonBody(text, streaming) {
    var p = L.parse(text);
    L.render(el.lBody, p, { streaming: streaming, revealed: state.revealed, onReveal: function () { state.revealed = true; renderLessonBody(text, false); } });
    return p;
  }
  function renderLessonPath() {
    var id = state.lessonNode;
    el.lPath.textContent = "";
    if (!nodeOf(id)) return;
    el.lPath.appendChild(pathBlock(id, { offer: true }));
    renderLessonCard(false);
  }
  /* The holder: the topic's card sits in its tray beside (or above, on phones) the lesson, filling with colour as learning is confirmed. */
  function renderLessonCard(grew) {
    el.lCard.textContent = "";
    el.hNote.textContent = "";
    var sp = state.lessonNode && D.cardSpec(state.cloud, state.lessonNode);
    if (!sp) return;
    var c = D.render(document, sp, { size: "full" });
    if (grew) c.classList.add("grew");
    el.lCard.appendChild(c);
    el.hNote.textContent = sp.achieved ? "Achieved. This card stays in your deck for good."
      : (sp.inDeck ? "In your deck. " : "") + (sp.stage < 3 ? "Right answers and \u201cI've got it\u201d bring in its colour." : "Finish this branch to complete the card.");
    renderKids();
  }
  /* Under the holder: this card's own branches (its children, in the order they're offered), linked from the card. */
  function renderKids() {
    el.hKids.textContent = "";
    var id = state.lessonNode, n = nodeOf(id);
    if (!n) return;
    var ids = P.orderedChildren(state.cloud, id).slice(0, 6), sides = P.sidePaths(state.cloud, id).slice(0, 4);
    if (!ids.length && !sides.length) {
      if (n.pending) el.hKids.appendChild(mk("p", "fine", "New branches grow here once you've answered a question or said \u201cI've got it\u201d."));
      return;
    }
    el.hKids.appendChild(mk("p", "l-head", "Branches of " + n.label));
    var ul = mk("ul");
    ids.forEach(function (cid) {
      var c = nodeOf(cid), li = mk("li", c.ghost ? "ghost" : C.isDone(state.cloud, cid) ? "done" : "");
      li.appendChild(linkBtn(c.label, function () { openLesson(cid); }));
      var lead = cid === P.nextChild(state.cloud, id);
      li.appendChild(mk("span", "tag", C.isDone(state.cloud, cid) ? " · done" : lead ? " · start here" : c.ghost ? " · new" : ""));
      ul.appendChild(li);
    });
    if (ids.length) el.hKids.appendChild(ul);
    /* side paths: optional aspects off one core step; they never block the branch */
    if (!sides.length) return;
    el.hKids.appendChild(mk("p", "l-head side-head", "Side paths"));
    var sl = mk("ul", "side-paths");
    sides.forEach(function (x) {
      var c = nodeOf(x.id), li = mk("li", c.ghost ? "ghost" : C.isDone(state.cloud, x.id) ? "done" : "");
      li.appendChild(linkBtn(c.label, function () { openLesson(x.id); }));
      li.appendChild(mk("span", "tag", C.isDone(state.cloud, x.id) ? " · done" : x.off && nodeOf(x.off) ? " · off " + nodeOf(x.off).label : " · optional"));
      sl.appendChild(li);
    });
    el.hKids.appendChild(sl);
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
  /* The two phases of a lesson: Learn (the teaching) then Check yourself (the questions). */
  function setPhase(which) {
    el.phLearn.className = which === "learn" ? "on" : "past";
    el.phCheck.className = which === "check" ? "on" : "";
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
    var answered = q.ans.filter(Number.isInteger).length;
    wrap.appendChild(mk("p", "q-lede", answered >= q.qs.length ? "All done. Nice work checking yourself." : (q.qs.length === 1 ? "One quick question" : q.qs.length + " quick questions") + " about what you just learned. No pressure: each right answer brings colour into your card."));
    if (answered) setPhase("check");
    q.qs.forEach(function (item, qi) {
      var set = mk("fieldset", "q"), done = Number.isInteger(q.ans[qi]);
      set.appendChild(mk("legend", null, item.q));
      item.options.forEach(function (o, oi) {
        var lab = mk("label", "opt" + (done && oi === item.answer ? " right" : "") + (done && oi === q.ans[qi] && oi !== item.answer ? " wrong" : ""));
        var inp = mk("input");
        inp.type = "radio"; inp.name = "q" + qi + "-" + q.id; inp.value = String(oi); inp.checked = done && q.ans[qi] === oi; inp.disabled = done;
        inp.addEventListener("change", function () { answerQ(qi, oi); });
        lab.appendChild(inp);
        lab.appendChild(mk("span", "opt-t", String.fromCharCode(65 + oi) + ". " + String(o)));
        set.appendChild(lab);
      });
      if (done) set.appendChild(mk("p", "q-fb", q.ans[qi] === item.answer ? "That's it." : "Not quite. It's " + String.fromCharCode(65 + item.answer) + ": " + item.options[item.answer] + "."));
      wrap.appendChild(set);
    });
    el.lQuiz.appendChild(wrap);
  }
  function answerQ(qi, oi) {
    var q = state.quiz, id = q && q.id;
    if (!q || id !== state.lessonNode || Number.isInteger(q.ans[qi]) || !q.qs[qi]) return;
    var before = C.growthOf(state.cloud, id);
    q.ans[qi] = oi;
    C.confirm(state.cloud, id, oi === q.qs[qi].answer);
    if (state.lessons[id]) state.lessons[id].ans = q.ans.slice();
    var note = growthNote(id, before);
    var kids = oi === q.qs[qi].answer ? growChildren(id) : [];
    save();
    renderQuiz();
    if (note) el.lStatus.textContent = note;
    if (kids.length) el.lStatus.textContent = (el.lStatus.textContent ? el.lStatus.textContent + " " : "") + kidsLine(id, kids);
    renderLessonCard(Boolean(note));
    renderLessonPath();
    refreshViews(kids);
    offerTest(id);
    var fb = el.lQuiz.querySelectorAll(".q")[qi];
    if (fb) { fb.tabIndex = -1; fb.focus({ preventScroll: true }); }
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
    if (C.isTerminal(state.cloud, id)) {
      var others = C.otherBranches(state.cloud, id, 3, topIds()).map(nodeOf).filter(Boolean);
      var w = mk("div", "others");
      w.appendChild(mk("p", "l-head", "This branch is done"));
      w.appendChild(mk("p", null, others.length ? "You've finished " + n.label + ". Here are other branches to try:" : "You've finished " + n.label + ". Ask in chat for something new whenever you like."));
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
    if (!n.fork || n.fork.ids.length < 2) return;
    var f = mk("div", "fork");
    f.appendChild(mk("p", "l-head", "Where next? Pick one"));
    var opts = mk("div", "fork-opts"), tops = topRanks();
    /* ranked: what this learner (and learners generally) use most comes first */
    P.orderChoices(state.cloud, n.fork).forEach(function (o) {
      var cid = o.id, c = nodeOf(cid); if (!c) return;
      var b = mk("button", "fork-opt" + (n.fork.picked === cid ? " picked" : ""));
      b.type = "button";
      b.appendChild(mk("span", null, c.label + (n.fork.picked === cid ? " · your pick" : "")));
      if (o.why || tops[cid]) b.appendChild(mk("span", "why", (tops[cid] ? "In your top 10. " : "") + o.why));
      b.addEventListener("click", function () { C.pickChoice(state.cloud, id, cid); save(); refreshViews([cid]); openLesson(cid); });
      opts.appendChild(b);
    });
    f.appendChild(opts);
    el.lFork.appendChild(f);
  }

  /* Opens a node as a lesson: from the cache (no call) or streamed once (one call; maps the path too if it has none). */
  function openLesson(id, fresh, from) {
    var n = nodeOf(id);
    if (!n) return;
    if (!el.cloud.hidden) closeCloud(true);
    stopClock();
    state.lessonNode = id;
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
    el.lQuiz.textContent = "";
    renderLessonPath();
    animateIn(from);
    var cached = !fresh && state.lessons[id];
    if (cached) {
      state.quiz = { id: id, qs: validQs(cached.qs), ans: Array.isArray(cached.ans) ? cached.ans.slice(0, 2) : [] };
      renderLessonBody(cached.text, false);
      lessonReady(id, false);
      return;
    }
    state.quiz = { id: id, qs: [], ans: [] };
    if (state.busy) { paragraphs(el.lBody, "One moment, I'm still finishing something else. Try again in a few seconds."); return; }
    lock(true);
    /* the orchestrator builds the context: child topics only when wanted, and the planned next step for the fork */
    var ctx = P.lessonContext(state.cloud, id), text = "", wantPath = ctx.wantPath;
    el.lBody.textContent = "";
    renderLessonBody("", true);
    renderQuiz(true);
    stream("/lesson", Object.assign(basePayload(id), ctx), {
      delta: function (t) { text += t; if (state.lessonNode === id) renderLessonBody(text, true); },
      /* the hidden block: check questions, the card's line, path steps (only when asked), the fork, and whether this branch ends here */
      path: function (ev) {
        var flash = [];
        if (ev.blurb) C.setBlurb(state.cloud, id, ev.blurb);
        if (state.quiz && state.quiz.id === id) state.quiz.qs = validQs(ev.questions);
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
    }).then(function (r) {
      var parsed = L.parse(text);
      if (r.ok && L.usable(parsed)) {
        state.lessons[id] = { text: text.trim(), at: Date.now(), qs: state.quiz && state.quiz.id === id ? state.quiz.qs : [], ans: [] };
        if (state.lessonNode === id) { renderLessonBody(text, false); lessonReady(id, true); }
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
    el.lDone.hidden = false;
    var note = growthNote(id, before);
    if (kids.length) note = (note ? note + " " : "") + kidsLine(id, kids);
    if (n.mastery >= C.MASTERED) el.lStatus.textContent = "You've marked this one as done. " + (C.isTerminal(state.cloud, id) || n.fork ? "" : nextLine(id));
    if (note) el.lStatus.textContent = (el.lStatus.textContent ? el.lStatus.textContent + " " : "") + note;
    save();
    refreshViews((was || wasNew ? [id] : []).concat(kids));
    renderLessonPath();
    renderLessonCard(Boolean(note));
    renderQuiz();
    renderFork(id);
    offerTest(id);
  }
  function nextLine(id) {
    var nx = nodeOf(nextStep(id));
    return nx ? "Next up: " + nx.label + "." : "";
  }
  function finishLesson(kind) {
    var id = state.lessonNode, n = nodeOf(id);
    if (!n) return;
    var before = C.growthOf(state.cloud, id);
    var r = C.engage(state.cloud, id, kind);
    var kids = kind === "got" ? growChildren(id) : [];
    var note = growthNote(id, before);
    if (C.isDone(state.cloud, id) && state.cloud.active === id) state.cloud.active = null;
    save();
    refreshViews([id].concat(r.next ? [r.next] : [], kids));
    el.lStatus.textContent = "";
    if (kids.length) el.lStatus.appendChild(document.createTextNode(kidsLine(id, kids) + " "));
    var nx = nodeOf(r.next);
    if (kind === "got") {
      el.lStatus.appendChild(document.createTextNode("Nice work. " + (note || n.label + " is growing stronger on your cloud.") + " "));
      if (C.isTerminal(state.cloud, id)) { /* other branches show below */ }
      else if (n.fork && n.fork.ids.length >= 2) el.lStatus.appendChild(document.createTextNode("Pick where to go next below."));
      else if (nx) { el.lStatus.appendChild(document.createTextNode("Next up: ")); el.lStatus.appendChild(linkBtn(nx.label, function () { openLesson(nx.id); })); }
      else if (!n.path || P.needsNext(state.cloud, id)) el.lStatus.appendChild(linkBtn("What comes next in " + n.label + "?", function () { createNext(id); }));
      else el.lStatus.appendChild(document.createTextNode("You've covered this path."));
    } else {
      if (note) el.lStatus.appendChild(document.createTextNode(note + " "));
      el.lStatus.appendChild(document.createTextNode("That's okay, it takes a few tries. Look at the worked example again, or "));
      el.lStatus.appendChild(linkBtn("ask about it in chat", function () { askInChat(id); }));
      el.lStatus.appendChild(document.createTextNode("."));
    }
    renderLessonPath();
    renderLessonCard(Boolean(note));
    renderFork(id);
    offerTest(id);
  }
  function askInChat(id) {
    var n = nodeOf(id);
    setFocus(id);
    showLesson(false);
    if (n) el.input.value = "Can you help me with " + n.label + "?";
    autosize();
    el.input.focus();
    scrollDown();
  }
  el.lBack.addEventListener("click", function () { showLesson(false); });
  el.lGot.addEventListener("click", function () { finishLesson("got"); });
  el.lTricky.addEventListener("click", function () { finishLesson("tricky"); });
  el.lChat.addEventListener("click", function () { askInChat(state.lessonNode); });
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
    if (!el.cloud.hidden) closeCloud(true);
    stopClock();
    state.lessonNode = pid; state.mode = "test";
    showLesson(true);
    window.scrollTo(0, 0);
    el.lMain.classList.add("testing");
    el.lPhase.hidden = true;
    var labels = req.material.map(function (m) { return m.label; }), ids = {};
    req.ids.forEach(function (x) { var n = nodeOf(x); if (n) ids[C.norm(n.label)] = x; });
    el.lTrail.textContent = "Test · " + trailOf(pid);
    el.lTitle.textContent = "Test: " + p.label;
    el.lStatus.textContent = ""; el.lDone.hidden = true; el.lFork.textContent = ""; el.lPath.textContent = ""; el.lQuiz.textContent = "";
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
    if (state.busy) { el.lQuiz.appendChild(mk("p", "fine", "One moment, I'm still finishing something else. Try again in a few seconds.")); return; }
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
    var p = nodeOf(t.pid), brighter = Object.keys(before).filter(function (x) { var a = C.growthOf(state.cloud, x), b = before[x]; return a && b && a.stage > b.stage; });
    save();
    el.lStatus.textContent = "";
    if (res) {
      el.lStatus.appendChild(document.createTextNode("You got " + res.right + " of " + res.n + " right. " + (res.passed ? "Great work: " + p.label + " is stronger on your cloud. " : "Good try: every attempt makes " + p.label + " stronger, and you can test again once you've finished more. ")));
      if (brighter.length) el.lStatus.appendChild(document.createTextNode("Picked up colour: " + brighter.map(function (x) { return nodeOf(x).label; }).join(", ") + ". "));
    }
    el.lStatus.appendChild(linkBtn("Draw a card", function () { drawCard(null); }));
    el.lStatus.appendChild(document.createTextNode(" · "));
    el.lStatus.appendChild(linkBtn("Back to your cards", function () { showLesson(false); }));
    renderLessonCard(true);
    refreshViews([t.pid].concat(res ? res.touched : []));
  }

  /* ---------- suggestions and Draw (orchestrator.js, no calls) ---------- */
  function topRanks() { var o = {}; (R ? R.top(state.cloud) : []).forEach(function (r) { o[r.id] = r.rank; }); return o; }
  function refreshSuggest() { state.suggest = P.suggest(state.cloud); save(); return state.suggest; }
  /* A test as a card-shaped tile: the parent, how much is finished under it. */
  function testTile(pid, onOpen) {
    var p = nodeOf(pid), st = P.testState(state.cloud, pid), sp = D.cardSpec(state.cloud, pid);
    var b = mk("button", "gcard size-tile test-tile"); b.type = "button";
    if (sp) { b.style.setProperty("--card-ink", sp.color.ink); b.style.setProperty("--card-wash", sp.color.wash); b.style.setProperty("--card-soft", sp.color.soft); }
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
    if (sp) { b.style.setProperty("--card-ink", sp.color.ink); b.style.setProperty("--card-wash", sp.color.wash); b.style.setProperty("--card-soft", sp.color.soft); }
    b.appendChild(mk("span", "gc-chain", "What comes next"));
    b.appendChild(mk("span", "gc-title", p.label));
    b.appendChild(mk("span", "gc-desc", "You've finished its topics. Let's see what's next."));
    b.appendChild(mk("span", "gc-mark", "New branch"));
    b.addEventListener("click", function () { createNext(pid); });
    return b;
  }
  /* The light re-ask, as a quiet tile: one question, a few chips, a typed answer, or not now. */
  function askTile(it) {
    var box = mk("div", "ask-tile");
    box.appendChild(mk("p", "gc-chain", "A quick question"));
    box.appendChild(mk("p", "ask-q", it.q));
    var chips = mk("div", "chips");
    (it.chips || []).slice(0, 4).forEach(function (c) { chips.appendChild(linkBtn(c, function () { answerReask(c); }, "btn chip-q")); });
    box.appendChild(chips);
    var f = mk("form", "ask-row"), inp = mk("input", "ask-in"); inp.maxLength = 40; inp.placeholder = "Or type your own"; inp.setAttribute("aria-label", it.q);
    f.appendChild(inp);
    f.addEventListener("submit", function (e) { e.preventDefault(); if (C.cleanLabel(inp.value)) answerReask(inp.value); });
    box.appendChild(f);
    box.appendChild(linkBtn("Not now", function () { C.setProfile(state.cloud, { askedAt: true }); save(); renderDraw(); }, "link fine"));
    return box;
  }
  /* The always-there next actions: suggested cards, Draw, Continue the active lesson, and the cloud. */
  function flowBlock(where) {
    var items = (state.suggest || []).filter(function (it) { return nodeOf(it.id) || it.kind === "ask"; });
    var box = mk("div", "flow-in");
    box.appendChild(mk("p", "kicker", "Pick up a card"));
    var empty = !state.cloud.order.length;
    box.appendChild(mk("p", "d-head", empty ? "Let's build your cloud, " + state.name + "." : items.length ? "Here are a few good next cards, " + state.name + ". Pick one, or draw one." : "Draw a card to start, " + state.name + ", or ask me anything below."));
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
    if (empty && !state.busy) { var start = linkBtn("Start: a few quick questions", runOnboarding, "btn draw-btn"); box.appendChild(start); return box; }
    if (items.length) box.appendChild(row);
    var acts = mk("div", "flow-acts");
    var draw = mk("button", "btn draw-btn", "Draw a card"); draw.type = "button";
    draw.addEventListener("click", function () { drawCard(draw); });
    acts.appendChild(draw);
    var act = nodeOf(state.cloud.active);
    if (act) acts.appendChild(linkBtn("Continue " + act.label, function () { openLesson(act.id); }, "btn quiet"));
    if (where !== "cloud") acts.appendChild(linkBtn("Your cloud", openCloud, "btn quiet"));
    box.appendChild(acts);
    return box;
  }
  /* Draw: one card into the holder, and its lesson opens right away. */
  function drawCard(src) {
    if (state.busy) return;
    var id = P.draw(state.cloud, { skip: state.lessonNode });
    save();
    if (!id) return;
    openCard(id, src || null);
  }

  /* ---------- cloud overlay + panel ---------- */
  function openCloud() {
    el.cloud.hidden = false;
    if (!big) big = V.create(el.cloudCanvas, { onPick: pick });
    big.resize();
    big.setCloud(state.cloud);
    big.setTests(testMap());
    if (state.lessonNode) setTimeout(function () { openPanel(state.lessonNode, false, false, true); }, 0); /* a lesson or a test: its topic */
    renderCloudFlow();
    el.cloudClose.focus();
  }
  /* Back on the cloud: a slim row of the suggested cards and Draw along the bottom (hidden while a panel is open). */
  var cloudFlow = null;
  function renderCloudFlow() {
    if (!cloudFlow) { cloudFlow = mk("div", "cloud-flow"); el.cloud.appendChild(cloudFlow); }
    cloudFlow.textContent = "";
    cloudFlow.hidden = !el.panel.hidden || Boolean(cloudCaption && !cloudCaption.hidden);
    if (cloudFlow.hidden) return;
    var items = refreshSuggest().filter(function (it) { return nodeOf(it.id); });
    cloudFlow.appendChild(mk("span", "kicker", "Pick up"));
    items.forEach(function (it) {
      var n = nodeOf(it.id);
      cloudFlow.appendChild(linkBtn(it.kind === "test" ? "Test: " + n.label : it.kind === "grow" ? "Next in " + n.label : n.label, function () { if (it.kind === "test") openTest(it.id); else if (it.kind === "grow") createNext(it.id); else openLesson(it.id); }, "chip"));
    });
    var d = mk("button", "btn sm draw-btn", "Draw a card"); d.type = "button";
    d.addEventListener("click", function () { drawCard(d); });
    cloudFlow.appendChild(d);
  }
  function closeCloud(keepView) {
    liftCloud(false);
    el.cloud.hidden = true; el.panel.hidden = true; state.panelNode = null;
    if (big) big.clearFocus();
    if (!keepView && !state.lessonNode) { renderDraw(); el.input.focus(); }
  }

  function pick(hit) {
    if (hit.test) openTest(hit.test);
    else if (hit.root) openPanel("root");
    else if (hit.node) openPanel(hit.node.id);
  }

  /* keepNote: leave the note as is; keepView: don't move the camera; quiet: no automatic note call (opened by navigation, not a tap) */
  function openPanel(id, keepNote, keepView, quiet) {
    state.panelNode = id;
    var isRoot = id === "root";
    var n = isRoot ? null : nodeOf(id);
    if (!isRoot && !n) return;
    el.panel.hidden = false;
    if (cloudFlow) cloudFlow.hidden = true;
    el.pKicker.textContent = isRoot ? "Your learning cloud" : n.parent ? (n.ghost ? "Not explored yet · " : "") : "Subject";
    /* the trail above this topic: each step is a quiet link back up the branch */
    if (!isRoot && n.parent) C.ancestry(state.cloud, n.parent).forEach(function (aid, i) {
      if (i) el.pKicker.appendChild(document.createTextNode(" · "));
      el.pKicker.appendChild(linkBtn(nodeOf(aid).label, function () { openPanel(aid, false, false, true); }, "link up"));
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
    if (isRoot) {
      var nx = nodeOf(state.cloud.next);
      if (nx) {
        var pnx = mk("p", "next-up", "Next up: ");
        pnx.appendChild(linkBtn(nx.label, function () { openPanel(nx.id, false, false, true); }));
        pnx.appendChild(document.createTextNode(" in " + trailOf(nx.parent)));
        el.pPath.appendChild(pnx);
      }
    } else {
      el.pPath.appendChild(pathBlock(id, { offer: true, onStep: function (sid) { openPanel(sid, false, false, true); } }));
      if (ended) {
        var others = C.otherBranches(state.cloud, id, 3, topIds()).map(nodeOf).filter(Boolean);
        if (others.length) {
          var ob = mk("div", "path");
          ob.appendChild(mk("p", "l-head", "Other branches"));
          var ul = mk("ul");
          others.forEach(function (o) { var li = mk("li"); li.appendChild(linkBtn(o.label, function () { openPanel(o.id, false, false, true); })); ul.appendChild(li); });
          ob.appendChild(ul);
          el.pPath.appendChild(ob);
        }
      }
    }
    el.pCards.textContent = "";
    if (!isRoot) C.cardsFor(state.cloud, id).slice().reverse().forEach(function (c) { el.pCards.appendChild(cardNode(c, new Date(c.at).toLocaleDateString())); });
    if (!keepNote) {
      if (quiet && !state.notes[id + ":" + state.cloud.rev]) {
        el.pNote.className = "note"; el.pNote.textContent = "";
        el.pNote.appendChild(linkBtn("What do you notice here?", function () { notice(id); }));
      } else notice(id);
    }
    if (keepView) return;
    if (isRoot) { big.clearFocus(); liftCloud(true); }
    else {
      liftCloud(false);
      var wide = window.innerWidth >= 900, ch = el.cloudCanvas.clientHeight, cw = el.cloudCanvas.clientWidth;
      big.focusNode(id, { cx: wide ? (cw - 400) / 2 : cw / 2, cy: wide ? ch / 2 : Math.max(90, (ch - el.panel.offsetHeight) / 2 + 20) });
    }
  }

  /* On phones the panel covers the lower part of the screen: move the cloud up while it is open (whole-cloud view). */
  function liftCloud(on) {
    if (!big || window.innerWidth >= 900) return;
    var v = big.state();
    if (on && !state.lifted) { state.lifted = el.panel.offsetHeight / 2; big.setView({ panY: v.panY - state.lifted }); }
    else if (!on && state.lifted) { big.setView({ panY: v.panY + state.lifted }); state.lifted = 0; }
  }

  /* Tap on the name or a node: a short personable note, streamed into the panel (cached until the cloud changes). */
  function notice(id) {
    var key = id + ":" + state.cloud.rev;
    var cached = state.notes[key];
    if (cached) { paragraphs(el.pNote, cached); return; }
    if (state.busy) { paragraphs(el.pNote, "One moment, I'm still finishing something."); return; }
    lock(true);
    var text = "";
    el.pNote.className = "note streaming"; paragraphs(el.pNote, "");
    var body = Object.assign(basePayload(id === "root" ? null : id), { mode: "notice", messages: history() });
    stream("/chat", body, {
      delta: function (t) { text += t; if (state.panelNode === id) paragraphs(el.pNote, text); }
    }).then(function (r) {
      el.pNote.className = "note";
      if (!r.ok && !text) text = fallbackText(r.reason);
      else state.notes[id + ":" + state.cloud.rev] = text.trim();
      if (state.panelNode === id) paragraphs(el.pNote, text.trim());
      save(); lock(false);
    });
  }

  el.pLesson.addEventListener("click", function () { if (nodeOf(state.panelNode)) openLesson(state.panelNode); });
  el.pCard.addEventListener("click", function () {
    var n = nodeOf(state.panelNode); if (!n) return;
    makeCard(n.label, n.parent ? nodeOf(n.parent).label : "");
    paragraphs(el.pNote, "Making a card on " + n.label + ". It will appear in your chat and here.");
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
  el.pChat.addEventListener("click", function () {
    var id = state.panelNode;
    var cached = state.notes[id + ":" + state.cloud.rev];
    if (cached) push({ role: "model", text: cached, local: false });
    setFocus(id === "root" ? null : id);
    save();
    if (state.lessonNode) showLesson(false);
    closeCloud();
  });
  el.pTest.addEventListener("click", function () { if (nodeOf(state.panelNode)) openTest(state.panelNode); });
  el.pClose.addEventListener("click", function () { liftCloud(false); el.panel.hidden = true; state.panelNode = null; big.clearFocus(); renderCloudFlow(); });
  el.cloudClose.addEventListener("click", function () { closeCloud(); });
  el.zin.addEventListener("click", function () { big.zoomBy(1.35); });
  el.zout.addEventListener("click", function () { big.zoomBy(1 / 1.35); });
  el.zreset.addEventListener("click", function () { big.reset(); state.lifted = 0; if (!el.panel.hidden && state.panelNode === "root") liftCloud(true); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!el.cloud.hidden) closeCloud();
    else if (state.lessonNode) showLesson(false);
    else if (!el.deck.hidden) showDeck(false);
  });

  /* ---------- the deck and today's draw ---------- */
  function deckIds() {
    var order = {};
    C.subjects(state.cloud).forEach(function (s, i) { order[s.label] = i; });
    return (state.cloud.deck || []).slice().sort(function (a, b) {
      var sa = order[a.subject] == null ? 99 : order[a.subject], sb = order[b.subject] == null ? 99 : order[b.subject];
      return sa - sb || a.at - b.at;
    }).map(function (e) { return e.id; });
  }
  /* A card tapped in the deck or the draw: it slides into the holder and its lesson opens (one call, or none if cached). */
  function openCard(id, src) {
    if (!nodeOf(id)) return;
    var from = src && src.getBoundingClientRect ? src.getBoundingClientRect() : null;
    openLesson(id, false, from);
  }
  function topIds() { return R ? R.top(state.cloud).map(function (r) { return r.id; }) : []; }
  function renderDeckButton() {
    var n = (state.cloud.deck || []).length;
    el.deckBtn.hidden = !n;
    el.deckBtn.textContent = "Your deck · " + n;
  }
  function showDeck(on) {
    if (on && state.lessonNode) showLesson(false);
    el.deck.hidden = !on;
    el.thread.hidden = on;
    el.dock.hidden = on;
    if (on) { el.draw.hidden = true; renderDeck(); window.scrollTo(0, 0); } else { renderDraw(); scrollDown(); }
  }
  /* ---------- About you: the quiet settings spot (age band, rough region) ---------- */
  function renderYou() {
    var pr = C.profileOf(state.cloud);
    if (!el.youAge.options.length) {
      el.youAge.appendChild(new Option("Not set", ""));
      C.AGE_BANDS.forEach(function (a) { el.youAge.appendChild(new Option(P.AGE_LABELS[a], a)); });
    }
    el.youAge.value = pr.age || "";
    el.youRegion.value = pr.region || "";
    el.youSaved.textContent = "";
  }
  function youSaved(patch) {
    C.setProfile(state.cloud, patch);
    save();
    renderYou();
    el.youSaved.textContent = " Saved.";
  }
  el.youAge.addEventListener("change", function () { youSaved({ age: el.youAge.value }); });
  el.youRegion.addEventListener("change", function () { youSaved({ region: el.youRegion.value, regionAuto: false }); });
  el.youGuess.addEventListener("click", function () { youSaved({ region: deviceRegion(), regionAuto: true }); });
  el.youClear.addEventListener("click", function () { youSaved({ region: "", regionAuto: false }); });
  el.youLink.addEventListener("click", function () { showDeck(true); setTimeout(function () { el.you.scrollIntoView({ block: "start" }); el.youAge.focus(); }, 0); });

  function renderDeck() {
    renderYou();
    var ids = deckIds();
    refreshSuggest();
    el.dSuggest.textContent = "";
    el.dSuggest.appendChild(flowBlock("deck"));
    el.dLede.textContent = (ids.length === 1 ? "1 card. " : ids.length + " cards. ") + "Cards stay in your deck for good. Their colour comes in as you show what you've learned, and a card is complete when you finish its branch.";
    el.dGrid.textContent = "";
    ids.forEach(function (id) { var sp = D.cardSpec(state.cloud, id); if (sp) el.dGrid.appendChild(D.render(document, sp, { onOpen: openCard })); });
    var rows = D.balance(state.cloud, D.dayOf(Date.now())).filter(function (r) { return r.draws; });
    el.dBalance.textContent = rows.length ? "Drawn this year: " + rows.map(function (r) { return r.subject + " " + r.draws; }).join(" · ") : "";
    renderTop();
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
  function renderDraw() {
    el.draw.textContent = "";
    el.draw.hidden = !el.lesson.hidden || !el.deck.hidden;
    if (el.draw.hidden) return;
    refreshSuggest();
    el.draw.appendChild(flowBlock("chat"));
  }
  el.deckBtn.addEventListener("click", function () { showDeck(true); });
  el.dBack.addEventListener("click", function () { showDeck(false); });

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
    if (!window.confirm("Start over? This clears your name, chat, cloud and lessons from this device.")) return;
    Object.keys(LS).forEach(function (k) { try { localStorage.removeItem(LS[k]); } catch { /* ignore */ } });
    try { sessionStorage.removeItem(SESSION); sessionStorage.removeItem(VISIT); } catch { /* ignore */ }
    location.reload();
  });

  /* ---------- start ---------- */
  function startChat() {
    el.welcome.hidden = true;
    el.chat.hidden = false;
    mini = V.create(el.thumbCanvas, { mini: true, onOpen: openCloud });
    mini.setCloud(state.cloud);
    renderThread();
    renderDeckButton();
    countVisit();
    if (P.needsOnboarding(state.cloud)) { if (!state.thread.some(function (m) { return m.role === "user"; })) state.thread = []; renderThread(); runOnboarding(); }
    else if (!state.thread.length) greet();
    startSession();
    setTimeout(function () { el.input.focus(); }, 0);
  }
  /* Once per browser session: for "seems stuck" (visits without a lesson). A coarse region guess the first time, unless cleared. */
  function countVisit() {
    var pr = C.profileOf(state.cloud);
    try { if (!sessionStorage.getItem(VISIT)) { sessionStorage.setItem(VISIT, "1"); pr.visits = (pr.visits || 0) + 1; } } catch { /* ignore */ }
    if (!pr.region && pr.regionAuto) C.setProfile(state.cloud, { region: deviceRegion(), regionAuto: true });
    save();
  }
  function deviceRegion() {
    var tz = "", loc = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* ignore */ }
    try { loc = (navigator.languages && navigator.languages[0]) || navigator.language || ""; } catch { /* ignore */ }
    return P.regionFrom(tz, loc);
  }

  function greet() {
    push({
      role: "model", local: true,
      text: "Hi " + state.name + ", welcome back. Your learning cloud grows with the topics you explore. Tap any point to open it as a short lesson. Topics you spend time with become cards in your deck. They start in sepia and fill with colour as you show what you've learned. Pick a card above, tap Draw a card, or tell me what you'd like to learn about today.",
      chips: C.profileOf(state.cloud).interests.slice(-2).map(function (x) { return "Tell me something new about " + x; }).concat(["What could I learn next?"])
    });
    save();
  }

  el.nameForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var n = C.cleanLabel(el.nameIn.value).replace(/[^\p{L}\p{M}' -]/gu, "").trim();
    if (!n) { el.nameIn.focus(); return; }
    state.name = n;
    store(LS.name, n);
    state.cloud = C.create(n);
    state.thread = [];
    startChat();
  });

  (function boot() {
    state.name = (load(LS.name) || "").trim();
    if (!state.name) { el.welcome.hidden = false; el.nameIn.focus(); return; }
    state.cloud = C.deserialize(load(LS.cloud)) || C.create(state.name);
    try { state.thread = C.trimThread(JSON.parse(load(LS.thread) || "[]")); } catch { state.thread = []; }
    try { state.notes = JSON.parse(load(LS.notes) || "{}") || {}; } catch { state.notes = {}; }
    try { state.lessons = JSON.parse(load(LS.lessons) || "{}") || {}; } catch { state.lessons = {}; }
    try { state.tests = JSON.parse(load(LS.tests) || "{}") || {}; } catch { state.tests = {}; }
    save(); /* writes a migrated (older -> v6) cloud back in the compact format, with the deck backfilled */
    startChat();
  })();
})();
