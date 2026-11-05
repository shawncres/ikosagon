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
  }
  function send() {
    try {
      if (sessionStorage.getItem(SENT)) return;
      sessionStorage.setItem(SENT, "1");
      var last = Number(localStorage.getItem(SENT)) || 0;
      if (Date.now() - last < MIN_GAP) return;
      localStorage.setItem(SENT, String(Date.now()));
      var u = read(), body = { level_chosen: u.level_chosen };
      NUMS.forEach(function (k) { body[k] = u[k]; });
      fetch("/api/ikolearn/usage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true, credentials: "omit" }).catch(function () {});
    } catch { /* silent */ }
  }
  function start() {
    try { if (!sessionStorage.getItem(KEY)) { sessionStorage.setItem(KEY, "1"); bump("sessions"); } } catch { /* silent */ }
    setTimeout(send, 4000);
  }
  window.IkoUsage = { bump: bump, level: level, sync: sync, send: send };
  start();
})();
