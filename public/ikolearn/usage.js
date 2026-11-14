/*
 * IkoLearn anonymous usage counts. Device-wide (beside the theme, outside every learner's cloud and IkoCloud file).
 * Only numbers (and the most recent lesson level, one of three fixed words) are kept: never a name, topic, lesson
 * text or anything typed. Once a browser session the counts go to /api/ikolearn/usage, which emails them to Ikosagon.
 * Any failure is silent: the learner never sees it.
 */
(function () {
  "use strict";
  var KEY = "ikolearn-usage", SENT = "ikolearn-usage-sent", MIN_GAP = 60 * 60 * 1000;
  var NUMS = ["sessions", "lessons_completed", "cards_earned", "subjects_added", "iko_opened", "exports", "generation_retries"];
  var LEVELS = ["simple", "standard", "deeper"];
  function read() {
    var u = {};
    try { u = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { u = {}; }
    NUMS.forEach(function (k) { var v = Number(u[k]); u[k] = v > 0 && isFinite(v) ? Math.floor(v) : 0; });
    if (LEVELS.indexOf(u.level_chosen) < 0) u.level_chosen = "";
    return u;
  }
  function write(u) { try { localStorage.setItem(KEY, JSON.stringify(u)); } catch { /* full or private: no counts */ } }
  function bump(k, n) { if (NUMS.indexOf(k) < 0) return; var u = read(); u[k] += Math.max(0, Math.floor(n == null ? 1 : n) || 0); write(u); }
  function level(b) { if (LEVELS.indexOf(b) < 0) return; var u = read(); u.level_chosen = b; write(u); }
  /* Cards and subjects are counted from the cloud's shape (how many cards in the deck, how many top-level subjects):
     growth since the last look is added. The first look on a device only sets the baseline. */
  function sync(cloud) {
    if (!cloud) return;
    var deck = (cloud.deck || []).length, subj = 0, nodes = cloud.nodes || {};
    Object.keys(nodes).forEach(function (id) { var n = nodes[id]; if (n && !n.parent && !n.ghost) subj++; });
    var u = read();
    if (typeof u._d === "number") u.cards_earned += Math.max(0, deck - u._d);
    if (typeof u._s === "number") u.subjects_added += Math.max(0, subj - u._s);
    u._d = deck; u._s = subj;
    write(u);
    var v = visitOf();
    if (!v.saw) {
      v.saw = true;
      var topics = 0;
      Object.keys(nodes).forEach(function (id) { if (nodes[id] && !nodes[id].ghost) topics++; });
      v.returning = topics > 0 || deck > 0;
      v.topics = topics;
    }
  }
  /* This visit only, in memory: subject names and coarse device facts. Never a learner name, lesson text, or identifier. */
  var visit = null;
  function visitOf() {
    if (!visit) visit = { t0: Date.now(), subjects: [], lessons: {}, done: 0, returning: false, topics: 0, saw: false };
    return visit;
  }
  function noteName(list, name) {
    var s = String(name || "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (s.length < 2 || list.length >= 8 || list.some(function (x) { return x.toLowerCase() === s.toLowerCase(); })) return;
    list.push(s);
  }
  function noteSubject(name) { noteName(visitOf().subjects, name); }
  function noteLesson(name) {
    var s = String(name || "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (s.length < 2) return;
    var bag = visitOf().lessons;
    bag[s] = (bag[s] || 0) + 1;
  }
  function noteDone() { visitOf().done += 1; }
  function widthBucket(w) { return w < 400 ? "under 400" : w <= 800 ? "400 to 800" : "over 800"; }
  function lengthBucket(ms) {
    if (ms < 60000) return "short";
    if (ms < 5 * 60000) return "few";
    if (ms < 20 * 60000) return "ten";
    if (ms < 45 * 60000) return "half";
    if (ms < 90 * 60000) return "hour";
    return "long";
  }
  function send() {
    try {
      if (sessionStorage.getItem(SENT)) return;
      sessionStorage.setItem(SENT, "1");
      var last = Number(localStorage.getItem(SENT)) || 0;
      if (Date.now() - last < MIN_GAP) return;
      localStorage.setItem(SENT, String(Date.now()));
      var u = read(), v = visitOf(), body = { level_chosen: u.level_chosen };
      NUMS.forEach(function (k) { body[k] = u[k]; });
      var w = 0;
      try { w = window.innerWidth || 0; } catch { w = 0; }
      var coarse = false;
      try { coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches; } catch { coarse = false; }
      body.session_length = lengthBucket(Date.now() - v.t0);
      body.device = (coarse || w < 700) ? "mobile" : "desktop";
      body.width_bucket = widthBucket(w);
      body.subjects = v.subjects.slice();
      body.returning = v.returning ? 1 : 0;
      if (v.returning) body.topic_count = v.topics;
      body.low_activity = v.subjects.length === 0 && v.done === 0 ? 1 : 0;
      body.top_subjects = Object.keys(v.lessons).sort(function (a, b) { return v.lessons[b] - v.lessons[a]; }).slice(0, 3);
      fetch("/api/ikolearn/usage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true, credentials: "omit" }).catch(function () {});
    } catch { /* silent */ }
  }
  function start() {
    try { if (!sessionStorage.getItem(KEY)) { sessionStorage.setItem(KEY, "1"); bump("sessions"); } } catch { /* silent */ }
    setTimeout(send, 4000);
  }
  window.IkoUsage = { bump: bump, level: level, sync: sync, send: send, noteSubject: noteSubject, noteLesson: noteLesson, noteDone: noteDone };
  start();
})();
