/*
 * IkoLearn app: chat harness, learning cards, lessons and the learning cloud. Vanilla JS, no build step.
 * Talks only to our own routes under /api/ikolearn (the server holds the Gemini key). Everything about the learner
 * (first name, recent conversation, cloud, cards, lessons) is kept in this browser's localStorage.
 * Calls: chat turn 1, tap note 1 (cached), card 1, related topics 1, map a path 1, lesson 1 (cached per node; maps the
 * path in the same call when the node has none). Reopening a lesson, finishing it and picking the next step cost nothing.
 */
(function () {
  "use strict";
  var C = window.IkoCloud, V = window.IkoCloudView, L = window.IkoLesson;
  var API = "/api/ikolearn";
  var LS = { name: "ikolearn.v1.name", cloud: "ikolearn.v1.cloud", thread: "ikolearn.v1.thread", notes: "ikolearn.v1.notes", lessons: "ikolearn.v1.lessons" };
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
    pChat: $("p-chat"), pPath: $("p-path"), pCards: $("p-cards"), pClose: $("p-close")
  };

  var state = { name: "", cloud: null, thread: [], notes: {}, lessons: {}, busy: false, focus: null, panelNode: null, lessonNode: null, lessonAt: 0, revealed: false, lifted: 0 };
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
  function pathBlock(id, opts) {
    opts = opts || {};
    var n = nodeOf(id), wrap = mk("div", "path");
    if (!n) return wrap;
    if (!n.path || !n.path.ids.length) {
      if (n.end) wrap.appendChild(mk("p", "fine", "This branch ends here."));
      else if (opts.offer) wrap.appendChild(linkBtn("Map a path for " + n.label, function () { mapPath(id); }));
      return wrap;
    }
    var rec = C.nextFor(state.cloud, id);
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

  function renderMsg(m) {
    var d;
    if (m.role === "card") {
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
    r.created.forEach(function (id) { parts.push(trailOf(id) + " (new)"); });
    r.promoted.forEach(function (id) { parts.push(trailOf(id) + " (explored)"); });
    r.strengthened.forEach(function (id) { var n = nodeOf(id); if (n && n.parent) parts.push(n.label + " (stronger)"); });
    if (g.added.length) parts.push(g.added.length === 1 ? "1 idea to explore" : g.added.length + " ideas to explore");
    var ids = r.created.concat(r.promoted, r.strengthened, r.parentsCreated, g.added);
    refreshViews(ids);
    var fresh = r.created.concat(r.promoted).filter(function (id) { return nodeOf(id) && nodeOf(id).parent; })[0];
    if (parts.length) push({ role: "grow", text: "Your cloud grew: " + parts.join(" · "), open: fresh || null });
    return { topic: topics[0] || null };
  }

  function refreshViews(flashIds) {
    if (mini) { mini.setCloud(state.cloud); mini.flash(flashIds); }
    if (big) { big.setCloud(state.cloud); big.flash(flashIds); }
    if (flashIds && flashIds.length) {
      el.thumb.classList.add("grew");
      setTimeout(function () { el.thumb.classList.remove("grew"); }, 2400);
    }
  }
  /* Paths and mastery show in several places; redraw them all after a change. */
  function refreshAll(flashIds) {
    refreshViews(flashIds);
    renderThread();
    if (state.lessonNode) renderLessonPath();
    if (state.panelNode && !el.panel.hidden) openPanel(state.panelNode, true, true);
  }

  /* ---------- server calls ---------- */
  function history() {
    return state.thread.filter(function (m) { return (m.role === "user" || m.role === "model") && !m.fallback && !m.local && m.text; })
      .slice(-HISTORY).map(function (m) { return { role: m.role, text: m.text.slice(0, 1500) }; });
  }
  function basePayload(focusId) {
    var n = nodeOf(focusId);
    var p = n && n.parent ? nodeOf(n.parent) : null;
    return {
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
    var next = nodeOf(state.cloud.next), ghost = null;
    if (!next) state.cloud.order.some(function (id) { var n = state.cloud.nodes[id]; if (n.ghost) { ghost = n; return true; } return false; });
    var tip = next ? " While we wait, your next step is " + next.label + ". Tap it on your cloud whenever you like."
      : ghost ? " While we wait, " + ghost.label + " is waiting on your cloud as a dotted branch. Want to start there next?" : " Your cloud is saved, so nothing is lost.";
    return reasonLead(reason) + tip;
  }

  function lock(on) {
    state.busy = on;
    [el.send, el.pCard, el.pAdj, el.pLesson, el.lGot, el.lTricky].forEach(function (b) { b.disabled = on; });
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
    });
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

  /* Ordered subtopics for one node (one call, on demand). */
  function mapPath(id, done) {
    var n = nodeOf(id);
    if (!n || state.busy) return;
    lock(true);
    if (state.panelNode === id) paragraphs(el.pNote, "Mapping a path through " + n.label + "...");
    postJson("/path", basePayload(id)).then(function (j) {
      if (j && j.ok && j.path && j.path.end) {
        C.markEnd(state.cloud, id);
        save();
        refreshAll([]);
        var after = nodeOf(C.nextFor(state.cloud, id));
        if (state.panelNode === id) paragraphs(el.pNote, n.label + " is small enough to learn in one go, so this branch ends here." + (after ? " Next up: " + after.label + "." : ""));
      } else if (j && j.ok && j.path) {
        var r = C.applyPath(state.cloud, id, j.path.steps, j.path.next);
        save();
        refreshAll(r.added.concat(r.next ? [r.next] : []));
        if (state.panelNode === id) paragraphs(el.pNote, r.ids.length ? "Here is a path through " + n.label + ". The marked step is a good place to start." : "I couldn't map new steps for " + n.label + " this time.");
      } else if (state.panelNode === id) paragraphs(el.pNote, "I couldn't map a path just now (" + ((j && (j.reason || j.error)) || "error") + "). Try again in a moment.");
      if (done) done();
    }).then(function () { save(); lock(false); });
  }

  /* ---------- lessons ---------- */
  /* Time spent reading a lesson is kept per node (C.track); later features can read it via C.activity. */
  function stopClock() {
    if (state.lessonNode && state.lessonAt) { C.track(state.cloud, state.lessonNode, (Date.now() - state.lessonAt) / 1000); save(); }
    state.lessonAt = 0;
  }
  function startClock() { state.lessonAt = state.lessonNode && !document.hidden ? Date.now() : 0; }
  document.addEventListener("visibilitychange", function () { if (document.hidden) stopClock(); else if (!el.lesson.hidden) startClock(); });
  window.addEventListener("pagehide", stopClock);

  function showLesson(on) {
    if (!on) stopClock();
    el.lesson.hidden = !on;
    el.thread.hidden = on;
    el.dock.hidden = on;
    if (!on) { state.lessonNode = null; renderThread(); }
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
  }

  /* Opens a node as a lesson: from the cache (no call) or streamed once (one call; maps the path too if it has none). */
  function openLesson(id, fresh) {
    var n = nodeOf(id);
    if (!n) return;
    if (!el.cloud.hidden) closeCloud(true);
    stopClock();
    state.lessonNode = id;
    startClock();
    state.revealed = false;
    showLesson(true);
    window.scrollTo(0, 0);
    el.lTrail.textContent = n.parent ? trailOf(n.parent) : "Subject";
    el.lTitle.textContent = n.label;
    el.lStatus.textContent = "";
    el.lDone.hidden = true;
    renderLessonPath();
    var cached = !fresh && state.lessons[id];
    if (cached) {
      renderLessonBody(cached.text, false);
      lessonReady(id, false);
      return;
    }
    if (state.busy) { paragraphs(el.lBody, "One moment, I'm still finishing something else. Try again in a few seconds."); return; }
    lock(true);
    var text = "", wantPath = !n.path;
    el.lBody.textContent = "";
    renderLessonBody("", true);
    stream("/lesson", Object.assign(basePayload(id), { wantPath: wantPath }), {
      delta: function (t) { text += t; if (state.lessonNode === id) renderLessonBody(text, true); },
      path: function (ev) {
        if (ev.end) { C.markEnd(state.cloud, id); return; }
        var r = C.applyPath(state.cloud, id, ev.steps, ev.next);
        refreshViews(r.added.concat(r.next ? [r.next] : []));
        if (state.lessonNode === id) renderLessonPath();
      }
    }).then(function (r) {
      var parsed = L.parse(text);
      if (r.ok && L.usable(parsed)) {
        state.lessons[id] = { text: text.trim(), at: Date.now() };
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
    var was = n.ghost;
    C.engage(state.cloud, id, "open");
    el.lDone.hidden = false;
    if (n.mastery >= C.MASTERED) el.lStatus.textContent = "You've marked this one as done. " + nextLine(id);
    save();
    refreshViews(was || wasNew ? [id] : []);
    renderLessonPath();
  }
  function nextLine(id) {
    var nx = nodeOf(C.nextFor(state.cloud, id));
    return nx ? "Next up: " + nx.label + "." : "";
  }
  function finishLesson(kind) {
    var id = state.lessonNode, n = nodeOf(id);
    if (!n) return;
    var r = C.engage(state.cloud, id, kind);
    save();
    refreshViews([id].concat(r.next ? [r.next] : []));
    el.lStatus.textContent = "";
    var nx = nodeOf(r.next);
    if (kind === "got") {
      el.lStatus.appendChild(document.createTextNode("Nice work. " + n.label + " is growing stronger on your cloud. "));
      if (nx) { el.lStatus.appendChild(document.createTextNode("Next up: ")); el.lStatus.appendChild(linkBtn(nx.label, function () { openLesson(nx.id); })); }
      else if (!n.path) el.lStatus.appendChild(linkBtn("Map what comes next in " + n.label, function () { mapPath(id); }));
      else el.lStatus.appendChild(document.createTextNode("You've covered this path."));
    } else {
      el.lStatus.appendChild(document.createTextNode("That's okay, it takes a few tries. Look at the worked example again, or "));
      el.lStatus.appendChild(linkBtn("ask about it in chat", function () { askInChat(id); }));
      el.lStatus.appendChild(document.createTextNode("."));
    }
    renderLessonPath();
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

  /* ---------- cloud overlay + panel ---------- */
  function openCloud() {
    el.cloud.hidden = false;
    if (!big) big = V.create(el.cloudCanvas, { onPick: pick });
    big.resize();
    big.setCloud(state.cloud);
    if (state.lessonNode) setTimeout(function () { openPanel(state.lessonNode, false, false, true); }, 0);
    el.cloudClose.focus();
  }
  function closeCloud(keepView) {
    liftCloud(false);
    el.cloud.hidden = true; el.panel.hidden = true; state.panelNode = null;
    if (big) big.clearFocus();
    if (!keepView && !state.lessonNode) el.input.focus();
  }

  function pick(hit) {
    if (hit.root) openPanel("root");
    else if (hit.node) openPanel(hit.node.id);
  }

  /* keepNote: leave the note as is; keepView: don't move the camera; quiet: no automatic note call (opened by navigation, not a tap) */
  function openPanel(id, keepNote, keepView, quiet) {
    state.panelNode = id;
    var isRoot = id === "root";
    var n = isRoot ? null : nodeOf(id);
    if (!isRoot && !n) return;
    el.panel.hidden = false;
    el.pKicker.textContent = isRoot ? "Your learning cloud" : n.parent ? (n.ghost ? "Not explored yet · " : "") : "Subject";
    /* the trail above this topic: each step is a quiet link back up the branch */
    if (!isRoot && n.parent) C.ancestry(state.cloud, n.parent).forEach(function (aid, i) {
      if (i) el.pKicker.appendChild(document.createTextNode(" · "));
      el.pKicker.appendChild(linkBtn(nodeOf(aid).label, function () { openPanel(aid, false, false, true); }, "link up"));
    });
    el.pTitle.textContent = isRoot ? state.cloud.name : n.label;
    el.pLesson.hidden = isRoot; el.pCard.hidden = isRoot; el.pAdj.hidden = isRoot;
    el.pLesson.textContent = !isRoot && state.lessons[id] ? "Open lesson" : "Start a lesson";
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
      delta: function (t) { text += t; if (state.panelNode === id) paragraphs(el.pNote, text); },
      cloud: function (ev) { grow({ topics: [], ghosts: ev.ghosts || [] }, id === "root" ? null : id); }
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
  el.pClose.addEventListener("click", function () { liftCloud(false); el.panel.hidden = true; state.panelNode = null; big.clearFocus(); });
  el.cloudClose.addEventListener("click", function () { closeCloud(); });
  el.zin.addEventListener("click", function () { big.zoomBy(1.35); });
  el.zout.addEventListener("click", function () { big.zoomBy(1 / 1.35); });
  el.zreset.addEventListener("click", function () { big.reset(); state.lifted = 0; if (!el.panel.hidden && state.panelNode === "root") liftCloud(true); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!el.cloud.hidden) closeCloud();
    else if (state.lessonNode) showLesson(false);
  });

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
    location.reload();
  });

  /* ---------- start ---------- */
  function startChat() {
    el.welcome.hidden = true;
    el.chat.hidden = false;
    mini = V.create(el.thumbCanvas, { mini: true, onOpen: openCloud });
    mini.setCloud(state.cloud);
    renderThread();
    setTimeout(function () { el.input.focus(); }, 0);
  }

  function greet() {
    push({
      role: "model", local: true,
      text: "Hi " + state.name + ", I'm IkoLearn. Around your name is your learning cloud. As we talk, it grows with the topics you explore, and dotted branches show what you could learn next. Tap any point to open it as a short lesson. What would you like to learn about today?",
      chips: ["Help me with fractions", "How do volcanoes work?", "Give me a story idea"]
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
    greet();
  });

  (function boot() {
    state.name = (load(LS.name) || "").trim();
    if (!state.name) { el.welcome.hidden = false; el.nameIn.focus(); return; }
    state.cloud = C.deserialize(load(LS.cloud)) || C.create(state.name);
    try { state.thread = C.trimThread(JSON.parse(load(LS.thread) || "[]")); } catch { state.thread = []; }
    try { state.notes = JSON.parse(load(LS.notes) || "{}") || {}; } catch { state.notes = {}; }
    try { state.lessons = JSON.parse(load(LS.lessons) || "{}") || {}; } catch { state.lessons = {}; }
    save(); /* writes a migrated (v1 -> v2) cloud back in the compact format */
    startChat();
    if (!state.thread.length) greet();
  })();
})();
