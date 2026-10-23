/*
 * IkoLearn learners (IkoProfiles): learning for yourself, or guiding other learners, each with their own cloud, Deck and
 * progress on this device. No accounts: a first name per learner.
 *
 * Storage is additive; the v9 save is never rewritten:
 *   - the usual keys (ikolearn.v1.name, .cloud, .thread, .notes, .lessons, .tests, .view, .seen) always hold the learner
 *     who is learning now, exactly as before, so the app, its checks, and an older version after a rollback read them
 *     unchanged;
 *   - every other learner is parked under ikolearn.v1.p.<id>.<key> (the same values, byte for byte);
 *   - ikolearn.v1.profiles is a small index: { v: 1, mode: "self" | "guide", active: id, seq, list: [{ id, name, at }] }.
 * A save with no index is a single learner learning for themselves (nothing is written until something changes).
 * Switching writes the parked copy first, then the index, then the live keys, so an interrupted switch is finished (or
 * undone) by reconcile() on the next load and nothing is lost. Pure apart from the store it is given (localStorage, or
 * any { getItem, setItem, removeItem } in tests).
 */
(function (root) {
  "use strict";
  var INDEX = "ikolearn.v1.profiles";
  var KEYS = ["name", "cloud", "thread", "notes", "lessons", "tests", "view", "seen"];
  var MAX = 12; /* learners per device: plenty for a family or a small group, and well inside storage limits */
  var live = function (k) { return "ikolearn.v1." + k; };
  var slot = function (id, k) { return "ikolearn.v1.p." + id + "." + k; };

  function get(s, k) { try { return s.getItem(k); } catch { return null; } }
  function set(s, k, v) { s.setItem(k, v); } /* a full store throws: the caller stops before anything is removed */
  function del(s, k) { try { s.removeItem(k); } catch { /* ignore */ } }

  /* first names only: letters, marks, apostrophes, hyphens and spaces, at most 30 characters (as the welcome) */
  function cleanName(n) { return String(n == null ? "" : n).normalize("NFC").replace(/[^\p{L}\p{M}' -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 30).trim(); }
  function same(a, b) { return cleanName(a).toLocaleLowerCase() === cleanName(b).toLocaleLowerCase(); }

  /* The stored index, validated (or null). */
  function index(s) {
    var raw = get(s, INDEX), x;
    if (!raw) return null;
    try { x = JSON.parse(raw); } catch { return null; }
    if (!x || typeof x !== "object" || !Array.isArray(x.list)) return null;
    var seen = {}, list = x.list.filter(function (p) { var ok = p && typeof p.id === "string" && /^p\d+$/.test(p.id) && !seen[p.id]; if (ok) seen[p.id] = 1; return ok; })
      .map(function (p) { return { id: p.id, name: cleanName(p.name) || "Learner", at: Number(p.at) || 0 }; });
    var active = typeof x.active === "string" && seen[x.active] ? x.active : null;
    var seq = Math.max(Number(x.seq) || 0, list.reduce(function (m, p) { return Math.max(m, Number(p.id.slice(1))); }, 0));
    return { v: 1, mode: x.mode === "guide" ? "guide" : "self", active: active, seq: seq, list: list };
  }
  /* The index, or the implicit one for a save from before learners existed (the current learner, learning for themselves). */
  function current(s) {
    var ix = index(s);
    if (ix) return ix;
    var n = cleanName(get(s, live("name")));
    return n ? { v: 1, mode: "self", active: "p1", seq: 1, list: [{ id: "p1", name: n, at: 0 }], implicit: true } : null;
  }
  function write(s, ix) { var o = { v: 1, mode: ix.mode, active: ix.active, seq: ix.seq, list: ix.list }; set(s, INDEX, JSON.stringify(o)); return o; }
  function mode(s) { var ix = current(s); return ix ? ix.mode : null; }
  function newId(ix) { ix.seq = (ix.seq || 0) + 1; return "p" + ix.seq; }
  function hasSlot(s, id) { return KEYS.some(function (k) { return get(s, slot(id, k)) != null; }); }

  /* Parked copy -> live keys (live keys the parked learner doesn't have are cleared), then the parked copy goes. */
  function unpark(s, id) {
    KEYS.forEach(function (k) { var v = get(s, slot(id, k)); if (v == null) del(s, live(k)); else set(s, live(k), v); });
    KEYS.forEach(function (k) { del(s, slot(id, k)); });
  }
  /* Live keys -> a parked copy (the live keys stay until the next learner's are written over them). */
  function park(s, id) { KEYS.forEach(function (k) { var v = get(s, live(k)); if (v == null) del(s, slot(id, k)); else set(s, slot(id, k), v); }); }

  /* On load: finish or undo an interrupted switch. If the learner the index says is learning now still has a parked
     copy, that copy is the truth (the live keys may be half written): put it back. -> true when something was repaired. */
  function reconcile(s) {
    var ix = index(s);
    if (!ix || !ix.active || !hasSlot(s, ix.active)) return false;
    unpark(s, ix.active);
    return true;
  }

  /* The welcome's answer: a new learner (the guide's first learner, or yourself) becomes the one learning now. Learners
     kept from before (after a Start over) stay parked and listed. The app writes the live name and cloud itself. */
  function begin(s, m, name) {
    var ix = index(s) || { v: 1, mode: "self", active: null, seq: 0, list: [] };
    var n = cleanName(name);
    if (!n) return null;
    var id = newId(ix);
    ix.list.push({ id: id, name: n, at: Date.now() });
    ix.mode = m === "guide" ? "guide" : "self";
    ix.active = id;
    return write(s, ix);
  }

  /* Who's learning now: park the current learner, then bring the chosen one in. */
  function switchTo(s, id) {
    var ix = current(s);
    if (!ix || !ix.list.some(function (p) { return p.id === id; })) return null;
    if (ix.active === id) { if (ix.implicit) write(s, ix); return ix; }
    if (ix.active) park(s, ix.active);
    ix.active = id;
    write(s, ix);
    unpark(s, id);
    return index(s);
  }

  /* A new learner (guide mode): parked with just a first name, then switched in, so their onboarding starts fresh. */
  function add(s, name) {
    var ix = current(s), n = cleanName(name);
    if (!n) return { ok: false, why: "name" };
    if (!ix) { begin(s, "guide", n); return { ok: true, id: index(s).active, fresh: true }; }
    if (ix.list.some(function (p) { return same(p.name, n); })) return { ok: false, why: "taken" };
    if (ix.list.length >= MAX) return { ok: false, why: "full" };
    var id = newId(ix);
    set(s, slot(id, "name"), n);
    ix.list.push({ id: id, name: n, at: Date.now() });
    ix.mode = "guide";
    write(s, ix);
    switchTo(s, id);
    return { ok: true, id: id };
  }

  /* Learning for yourself <-> guiding. Nobody is removed: in "self" the others stay parked and come back with "guide". */
  function setMode(s, m) {
    var ix = current(s);
    if (!ix) return null;
    ix.mode = m === "guide" ? "guide" : "self";
    return write(s, ix);
  }

  /* After Start over (the live keys were cleared): that learner leaves the list. A guide with others carries on with the
     next learner; otherwise the welcome shows (the others, if any, stay parked and listed). */
  function dropActive(s) {
    var ix = index(s);
    if (!ix) return null;
    ix.list = ix.list.filter(function (p) { return p.id !== ix.active; });
    ix.active = null;
    if (!ix.list.length) { del(s, INDEX); return null; }
    if (ix.mode === "guide") { ix.active = ix.list[0].id; write(s, ix); unpark(s, ix.active); return index(s); }
    return write(s, ix);
  }

  /* Read-only access for the parents & teachers view: a learner's stored value, wherever it lives. */
  function read(s, id, k) { var ix = current(s); return ix && ix.active === id ? get(s, live(k)) : get(s, slot(id, k)); }
  function learners(s) { var ix = current(s); return ix ? ix.list.map(function (p) { return { id: p.id, name: p.name, active: p.id === ix.active }; }) : []; }

  var api = { INDEX: INDEX, KEYS: KEYS, MAX: MAX, slot: slot, live: live, cleanName: cleanName, index: index, current: current, mode: mode, reconcile: reconcile, begin: begin, switchTo: switchTo, add: add, setMode: setMode, dropActive: dropActive, read: read, learners: learners };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IkoProfiles = api;
})(typeof window !== "undefined" ? window : this);
