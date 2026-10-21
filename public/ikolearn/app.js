/*
 * IkoLearn app: chat harness + learning cloud. Vanilla JS, no build step.
 * Talks only to our own routes under /api/ikolearn (the server holds the Gemini key). Everything about the learner
 * (first name, recent conversation, cloud, cards) is kept in this browser's localStorage.
 */
(function () {
  "use strict";
  var C = window.IkoCloud, V = window.IkoCloudView;
  var API = "/api/ikolearn";
  var LS = { name: "ikolearn.v1.name", cloud: "ikolearn.v1.cloud", thread: "ikolearn.v1.thread", notes: "ikolearn.v1.notes" };
  var HISTORY = 10, TIMEOUT_MS = 60000;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    welcome: $("welcome"), nameForm: $("name-form"), nameIn: $("name-in"),
    chat: $("chat"), thread: $("thread"), composer: $("composer"), input: $("input"), send: $("send"),
    thumb: $("thumb"), thumbCanvas: $("thumb-canvas"), reset: $("reset"),
    focusChip: $("focus-chip"), focusText: $("focus-text"), focusClear: $("focus-clear"),
    cloud: $("cloud"), cloudCanvas: $("cloud-canvas"), cloudClose: $("cloud-close"), zin: $("zin"), zout: $("zout"), zreset: $("zreset"),
    panel: $("panel"), pKicker: $("p-kicker"), pTitle: $("p-title"), pNote: $("p-note"), pCard: $("p-card"), pAdj: $("p-adj"), pChat: $("p-chat"), pCards: $("p-cards"), pClose: $("p-close")
  };

  var state = { name: "", cloud: null, thread: [], notes: {}, busy: false, focus: null, panelNode: null };
  var mini = null, big = null;

  /* ---------- storage ---------- */
  function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function store(k, v) { try { localStorage.setItem(k, v); } catch { /* full or blocked: keep working in memory */ } }
  function save() {
    store(LS.cloud, C.serialize(state.cloud));
    store(LS.thread, JSON.stringify(C.trimThread(state.thread.map(function (m) {
      var c = Object.assign({}, m); delete c.streaming; return c;
    }))));
    var keys = Object.keys(state.notes).slice(-30), notes = {};
    keys.forEach(function (k) { notes[k] = state.notes[k]; });
    state.notes = notes;
    store(LS.notes, JSON.stringify(notes));
  }

  /* ---------- rendering ---------- */
  function paragraphs(node, text) {
    node.textContent = "";
    String(text || "").split(/\n{2,}/).forEach(function (para) {
      var p = document.createElement("p");
      para.split("\n").forEach(function (line, i) {
        if (i) p.appendChild(document.createElement("br"));
        p.appendChild(document.createTextNode(line));
      });
      node.appendChild(p);
    });
  }

  function cardNode(card, meta) {
    var d = document.createElement("div");
    d.className = "card";
    var h = document.createElement("h3"); h.textContent = card.title; d.appendChild(h);
    var b = document.createElement("div"); paragraphs(b, card.body); d.appendChild(b);
    if (meta) { var m = document.createElement("p"); m.className = "meta"; m.textContent = meta; d.appendChild(m); }
    return d;
  }

  function nodePath(id) {
    var n = state.cloud.nodes[id];
    if (!n) return "";
    var p = n.parent ? state.cloud.nodes[n.parent] : null;
    return p ? n.label + " in " + p.label : n.label;
  }

  function renderMsg(m) {
    var d;
    if (m.role === "card") {
      d = cardNode(m.card, m.card.node ? "On " + nodePath(m.card.node) : "");
    } else if (m.role === "grow") {
      d = document.createElement("p"); d.className = "grow"; d.textContent = m.text;
    } else {
      d = document.createElement("div");
      d.className = "msg " + m.role + (m.streaming ? " streaming" : "");
      var body = document.createElement("div"); paragraphs(body, m.text || ""); d.appendChild(body);
      if (m.role === "model" && m.topic && !m.streaming && !m.fallback) {
        var acts = document.createElement("div"); acts.className = "acts";
        var b = document.createElement("button"); b.type = "button"; b.className = "link"; b.textContent = "Make a card on " + m.topic;
        b.addEventListener("click", function () { makeCard(m.topic, m.parent || ""); });
        acts.appendChild(b); d.appendChild(acts);
      }
      if (m.chips && m.chips.length) {
        var wrap = document.createElement("div");
        wrap.appendChild(d);
        var chips = document.createElement("div"); chips.className = "chips";
        m.chips.forEach(function (c) {
          var cb = document.createElement("button"); cb.type = "button"; cb.className = "btn"; cb.textContent = c;
          cb.addEventListener("click", function () { if (!state.busy) send(c); });
          chips.appendChild(cb);
        });
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
    scrollDown();
  }
  function upsert(m) {
    var old = el.thread.querySelector('[data-id="' + m.id + '"]');
    var fresh = renderMsg(m);
    if (old) el.thread.replaceChild(fresh, old); else el.thread.appendChild(fresh);
  }
  function scrollDown() { window.scrollTo(0, document.documentElement.scrollHeight); }
  var mid = 0;
  function push(m) { m.id = m.id || ("m" + Date.now().toString(36) + (mid++)); m.at = m.at || Date.now(); state.thread.push(m); upsert(m); scrollDown(); return m; }

  function setFocus(id) {
    state.focus = id && state.cloud.nodes[id] ? id : null;
    el.focusChip.hidden = !state.focus;
    if (state.focus) el.focusText.textContent = "Focus: " + nodePath(state.focus);
  }

  /* ---------- growth ---------- */
  function grow(block) {
    var topics = (block && block.topics) || [], ghosts = (block && block.ghosts) || [];
    var r = C.applyTopics(state.cloud, topics);
    var g = C.addGhosts(state.cloud, ghosts);
    var parts = [];
    r.parentsCreated.forEach(function (id) { parts.push("new subject " + state.cloud.nodes[id].label); });
    r.created.forEach(function (id) { parts.push(nodePath(id) + " (new)"); });
    r.promoted.forEach(function (id) { parts.push(nodePath(id) + " (explored)"); });
    r.strengthened.forEach(function (id) { if (state.cloud.nodes[id] && state.cloud.nodes[id].parent) parts.push(state.cloud.nodes[id].label + " (stronger)"); });
    if (g.length) parts.push(g.length === 1 ? "1 idea to explore" : g.length + " ideas to explore");
    var ids = r.created.concat(r.promoted, r.strengthened, r.parentsCreated, g);
    refreshViews(ids);
    if (parts.length) push({ role: "grow", text: "Your cloud grew: " + parts.join(" · ") });
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

  /* ---------- server calls ---------- */
  function history() {
    return state.thread.filter(function (m) { return (m.role === "user" || m.role === "model") && !m.fallback && !m.local && m.text; })
      .slice(-HISTORY).map(function (m) { return { role: m.role, text: m.text.slice(0, 1500) }; });
  }
  function basePayload(focusId) {
    var n = focusId ? state.cloud.nodes[focusId] : null;
    var p = n && n.parent ? state.cloud.nodes[n.parent] : null;
    return { name: state.name, focus: n ? n.label : "", focusParent: p ? p.label : "", cloud: C.summarize(state.cloud), parents: C.parentLabels(state.cloud) };
  }

  function post(path, body) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .finally(function () { clearTimeout(timer); });
  }

  /* Reads the NDJSON event stream. Resolves { ok, reason }. */
  function stream(body, onDelta, onCloud) {
    return post("/chat", body).then(function (res) {
      if (!res.ok || !res.body) {
        return res.json().catch(function () { return {}; }).then(function (j) { return { ok: false, reason: j.error || String(res.status) }; });
      }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "", result = { ok: false, reason: "cut" }, got = false;
      function handle(line) {
        if (!line.trim()) return;
        var ev; try { ev = JSON.parse(line); } catch { return; }
        if (ev.t === "delta" && typeof ev.text === "string") { got = true; onDelta(ev.text); }
        else if (ev.t === "cloud") onCloud(ev);
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

  /* Local, no-API text when the model cannot be reached: honest, and still points somewhere useful. */
  function fallbackText(reason) {
    var lead = reason === "busy" || reason === "ip_rate" ? "I need a short breather. Please try again in a minute."
      : reason === "budget" ? "I've done a lot of thinking today. Let's pick this up again tomorrow."
      : reason === "offline" ? "I can't reach the internet right now."
      : "I couldn't get an answer just now.";
    var ghost = null;
    state.cloud.order.some(function (id) { var n = state.cloud.nodes[id]; if (n.ghost) { ghost = n; return true; } return false; });
    var tip = ghost ? " While we wait, " + ghost.label + " is waiting on your cloud as a dotted branch. Want to start there next?" : " Your cloud is saved, so nothing is lost.";
    return lead + tip;
  }

  function lock(on) { state.busy = on; el.send.disabled = on; el.pCard.disabled = on; el.pAdj.disabled = on; }

  /* ---------- chat ---------- */
  function send(text) {
    text = String(text || "").replace(/\s+$/, "").trim().slice(0, 1500);
    if (!text || state.busy) return;
    lock(true);
    push({ role: "user", text: text });
    var m = push({ role: "model", text: "", streaming: true });
    var body = Object.assign(basePayload(state.focus), { mode: "chat", messages: history() });
    stream(body, function (t) { m.text += t; upsert(m); scrollDown(); }, function (ev) {
      var r = grow(ev);
      if (r.topic) { m.topic = r.topic.name; m.parent = r.topic.parent; }
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
    var node = C.findChild(state.cloud, topic) || C.findParent(state.cloud, topic);
    var body = Object.assign(basePayload(node ? node.id : null), { focus: topic, focusParent: parent || (node && node.parent ? state.cloud.nodes[node.parent].label : ""), messages: history() });
    post("/card", body).then(function (res) { return res.json().catch(function () { return {}; }); }).then(function (j) {
      removeMsg(wait);
      if (j && j.ok && j.card) {
        var r = C.attachCard(state.cloud, j.card);
        push({ role: "card", text: r.card.title, card: r.card });
        refreshViews(r.grew.created.concat(r.grew.promoted, r.grew.strengthened, r.grew.parentsCreated));
        if (state.panelNode) openPanel(state.panelNode, true);
      } else {
        push({ role: "grow", text: "I couldn't make that card just now (" + ((j && (j.reason || j.error)) || "error") + "). Try again in a moment." });
      }
    }).catch(function () {
      removeMsg(wait);
      push({ role: "grow", text: "I couldn't make that card just now (offline). Try again in a moment." });
    }).then(function () { save(); lock(false); });
  }

  function removeMsg(m) {
    state.thread = state.thread.filter(function (x) { return x !== m; });
    var n = el.thread.querySelector('[data-id="' + m.id + '"]');
    if (n) n.remove();
  }

  /* ---------- cloud overlay + panel ---------- */
  function openCloud() {
    el.cloud.hidden = false;
    if (!big) big = V.create(el.cloudCanvas, { onPick: pick });
    big.resize();
    big.setCloud(state.cloud);
    el.cloudClose.focus();
  }
  function closeCloud() { liftCloud(false); el.cloud.hidden = true; el.panel.hidden = true; state.panelNode = null; el.input.focus(); }

  function pick(hit) {
    if (hit.root) openPanel("root");
    else if (hit.node) openPanel(hit.node.id);
  }

  function openPanel(id, keepNote) {
    state.panelNode = id;
    var isRoot = id === "root";
    var n = isRoot ? null : state.cloud.nodes[id];
    if (!isRoot && !n) return;
    el.panel.hidden = false;
    el.pKicker.textContent = isRoot ? "Your learning cloud" : n.parent ? (n.ghost ? "Not explored yet · " : "Topic · ") + state.cloud.nodes[n.parent].label : "Subject";
    el.pTitle.textContent = isRoot ? state.cloud.name : n.label;
    el.pCard.hidden = isRoot; el.pAdj.hidden = isRoot;
    el.pCards.textContent = "";
    if (!isRoot) C.cardsFor(state.cloud, id).slice().reverse().forEach(function (c) { el.pCards.appendChild(cardNode(c, new Date(c.at).toLocaleDateString())); });
    if (!keepNote) notice(id);
    liftCloud(true);
  }

  /* On phones the panel covers the lower part of the screen: move the cloud up while it is open. */
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
    if (state.busy) { paragraphs(el.pNote, "One moment, I'm still finishing a reply."); return; }
    lock(true);
    var text = "";
    el.pNote.className = "note streaming"; paragraphs(el.pNote, "");
    var body = Object.assign(basePayload(id === "root" ? null : id), { mode: "notice", messages: history() });
    stream(body, function (t) { text += t; if (state.panelNode === id) paragraphs(el.pNote, text); }, function (ev) {
      grow({ topics: [], ghosts: ev.ghosts || [] });
    }).then(function (r) {
      el.pNote.className = "note";
      if (!r.ok && !text) text = fallbackText(r.reason);
      else state.notes[key] = text.trim();
      if (state.panelNode === id) paragraphs(el.pNote, text.trim());
      save(); lock(false);
    });
  }

  el.pCard.addEventListener("click", function () {
    var n = state.cloud.nodes[state.panelNode]; if (!n) return;
    makeCard(n.label, n.parent ? state.cloud.nodes[n.parent].label : "");
    paragraphs(el.pNote, "Making a card on " + n.label + ". It will appear in your chat and here.");
  });
  el.pAdj.addEventListener("click", function () {
    var id = state.panelNode, n = state.cloud.nodes[id]; if (!n || state.busy) return;
    lock(true);
    paragraphs(el.pNote, "Looking for related topics...");
    post("/adjacent", basePayload(id)).then(function (res) { return res.json().catch(function () { return {}; }); }).then(function (j) {
      if (j && j.ok) {
        var added = C.addGhosts(state.cloud, j.ghosts);
        refreshViews(added);
        paragraphs(el.pNote, added.length ? "Added as dotted branches: " + added.map(function (a) { return state.cloud.nodes[a].label; }).join(", ") + ". Tap one to explore it." : "Those ideas are already on your cloud.");
      } else paragraphs(el.pNote, "I couldn't find related topics just now. Try again in a moment.");
    }).catch(function () { paragraphs(el.pNote, "I couldn't find related topics just now (offline)."); })
      .then(function () { save(); lock(false); });
  });
  el.pChat.addEventListener("click", function () {
    var id = state.panelNode;
    var cached = state.notes[id + ":" + state.cloud.rev];
    if (cached) push({ role: "model", text: cached, local: false });
    setFocus(id === "root" ? null : id);
    save();
    closeCloud();
  });
  el.pClose.addEventListener("click", function () { liftCloud(false); el.panel.hidden = true; state.panelNode = null; });
  el.cloudClose.addEventListener("click", closeCloud);
  el.zin.addEventListener("click", function () { big.zoomBy(1.35); });
  el.zout.addEventListener("click", function () { big.zoomBy(1 / 1.35); });
  el.zreset.addEventListener("click", function () { big.reset(); state.lifted = 0; if (!el.panel.hidden) liftCloud(true); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !el.cloud.hidden) closeCloud(); });

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
    if (!window.confirm("Start over? This clears your name, chat and cloud from this device.")) return;
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
      text: "Hi " + state.name + ", I'm IkoLearn. Around your name is your learning cloud: a few starter subjects for now. As we talk, it grows with the topics you explore, and dotted branches show ideas you could try next. What would you like to learn about today?",
      chips: ["How do volcanoes work?", "Help me with fractions", "Give me a story idea"]
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
    startChat();
    if (!state.thread.length) greet();
  })();
})();
