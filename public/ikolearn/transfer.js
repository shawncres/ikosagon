/*
 * IkoCloud files (IkoTransfer): a learner's whole cloud as one file, [firstname].ikocloud, to keep or to carry to
 * another device. No server, no account: the file is made and read in the browser.
 *
 * The file is plain JSON:
 *   { format: "ikocloud", version: 1, exportedAt: ISO time, storageVersion: 9, app: "IkoLearn",
 *     data: { name, cloud, notes, lessons, tests, seen } }
 *   Downloaded as application/json (safe to email) under the .ikocloud name. Earlier files (format "ikolearn", saved as
 *   .ikolearn, the same layout otherwise) still open, as does the same JSON saved as .json.
 *   - name     the learner's first name
 *   - cloud    the v9 cloud exactly as saved (nodes with their parents, children, positions and colours, cards and their
 *              progress, the deck, paths and forks, Where Next and Also in progress, the profile with #98's directions
 *              and their dismissals, descriptions, merges, prerequisites, tests, events)
 *   - notes    the short notes already written for a topic (cached, so they aren't written again)
 *   - lessons  the cached lessons with their answers, "I've got it" and clarifications (so nothing is asked again)
 *   - tests    the cached tests and their results
 *   - seen     what each card looked like when last shown, and the tips already dismissed
 * Left out on purpose: the conversation (ikolearn.v1.thread: a raw chat transcript, not needed to resume; a fresh
 * "welcome back" starts it), the camera (ikolearn.v1.view: an opened cloud lands on the name in the centre), the
 * learners index (ikolearn.v1.profiles: this device's own list) and other learners' parked copies. There are no keys or
 * secrets anywhere in this browser's storage (the server holds the Gemini key), so none can be written to the file.
 *
 * Opening a file is checked in full before anything is written (parse), then written in one go (apply): every IkoLearn
 * key is copied first and, if any write fails (a full store), put back exactly as it was. Learners:
 *   - no learner on this device yet (a fresh device, or after Start over): the file's learner becomes the one learning
 *   - learning for yourself: the file replaces the learner on this device (the name follows the file)
 *   - guiding: a learner with the same first name is replaced (and becomes the one learning now); a new name is added
 *     as another learner (up to IkoProfiles.MAX), the others kept as they were
 * Pure apart from the store it is given (localStorage, or any { getItem, setItem, removeItem, key, length } in tests).
 */
(function (root) {
  "use strict";
  /* eslint-disable @typescript-eslint/no-require-imports -- UMD: Node tests load the modules, the browser has globals */
  var node_ = typeof module !== "undefined" && module.exports;
  var C = node_ ? require("./cloud-model.js") : root.IkoCloud;
  var PR = node_ ? require("./profiles.js") : root.IkoProfiles;
  /* eslint-enable @typescript-eslint/no-require-imports */
  var FORMAT = "ikocloud", LEGACY = ["ikolearn"], VERSION = 1, EXT = ".ikocloud", MAX_BYTES = 8e6;
  /* the file picker: our names, the old one, JSON, and any file at all (mobile pickers grey out extensions they don't
     know; the contents are checked in full instead) */
  var ACCEPT = ".ikocloud,.ikolearn,.json,application/json,application/octet-stream,text/plain";
  var KEYS = ["name", "cloud", "notes", "lessons", "tests", "seen"]; /* what a file carries (ikolearn.v1.<key>) */
  var DROP = ["thread", "view"]; /* cleared when a file is opened: the old conversation and camera aren't the file's */
  var live = function (k) { return "ikolearn.v1." + k; };
  var MSG = {
    saved: function (f) { return "Your IkoCloud has been saved as " + f + ". Keep this file if you want to continue on another device."; },
    confirm: "This will replace the IkoCloud currently on this device with the one in the file. Continue?",
    newer: "This IkoCloud comes from a newer version of IkoLearn, so it can't be opened here yet. Nothing was changed.",
    bad: "That file couldn't be opened as an IkoCloud. Nothing was changed.",
    full: "This device already has the most learners it can hold. Nothing was changed.",
    store: "There wasn't room to open that IkoCloud on this device. Nothing was changed.",
    none: "Nothing was changed."
  };

  function get(s, k) { try { return s.getItem(k); } catch { return null; } }
  function obj(x) { return x && typeof x === "object" && !Array.isArray(x) ? x : null; }
  function json(raw, fallback) { if (raw == null || raw === "") return fallback; try { var v = JSON.parse(raw); return v == null ? fallback : v; } catch { return fallback; } }

  /* The download's name: the first name (letters, marks, digits, apostrophes and hyphens; spaces become hyphens), then .ikocloud */
  function fileName(name) {
    var n = String(name == null ? "" : name).normalize("NFC").replace(/[^\p{L}\p{M}\p{N}' -]/gu, "").trim().replace(/\s+/g, "-").replace(/^[.'-]+|[.'-]+$/g, "").slice(0, 40);
    return (n || "IkoCloud") + EXT;
  }

  /* The file for the learner learning now, from the store (call it after the app's own save). -> { name, text, file } or null */
  function build(s, now) {
    var name = C.cleanLabel(get(s, live("name")) || ""), raw = get(s, live("cloud"));
    var cloud = raw ? C.deserialize(raw) : null;
    if (!name || !cloud) return null;
    var data = { name: name, cloud: json(raw, null), notes: obj(json(get(s, live("notes")), {})) || {}, lessons: obj(json(get(s, live("lessons")), {})) || {}, tests: obj(json(get(s, live("tests")), {})) || {}, seen: obj(json(get(s, live("seen")), {})) || {} };
    var file = { format: FORMAT, version: VERSION, exportedAt: new Date(now || Date.now()).toISOString(), storageVersion: C.VERSION, app: "IkoLearn", data: data };
    return { name: fileName(name), text: JSON.stringify(file), file: file };
  }

  /*
   * A file's text, checked in full: -> { ok: true, name, values: { key: stored string } } or { ok: false, why } where why
   * is "json" | "format" | "newer" | "version" | "fields". Nothing is written here.
   */
  function parse(text) {
    if (typeof text !== "string" || !text.trim() || text.length > MAX_BYTES) return { ok: false, why: "json" };
    var f;
    try { f = JSON.parse(text); } catch { return { ok: false, why: "json" }; }
    if (!obj(f) || (f.format !== FORMAT && LEGACY.indexOf(f.format) < 0)) return { ok: false, why: "format" };
    if (typeof f.version !== "number" || !Number.isInteger(f.version) || f.version < 1) return { ok: false, why: "version" };
    if (f.version > VERSION) return { ok: false, why: "newer" };
    if (f.storageVersion != null && (typeof f.storageVersion !== "number" || !(f.storageVersion >= 1))) return { ok: false, why: "version" };
    if (f.storageVersion > C.VERSION) return { ok: false, why: "newer" };
    var d = obj(f.data);
    if (!d) return { ok: false, why: "fields" };
    var name = PR ? PR.cleanName(d.name) : C.cleanLabel(d.name || "");
    var cloud = obj(d.cloud);
    if (!name || !cloud || typeof cloud.v !== "number" || !Array.isArray(cloud.n)) return { ok: false, why: "fields" };
    if (cloud.v > C.VERSION) return { ok: false, why: "newer" };
    var back = C.deserialize(JSON.stringify(cloud));
    if (!back) return { ok: false, why: "fields" };
    var extra = {};
    for (var i = 0; i < 4; i++) {
      var k = ["notes", "lessons", "tests", "seen"][i];
      if (d[k] != null && !obj(d[k])) return { ok: false, why: "fields" };
      extra[k] = obj(d[k]) || (k === "seen" ? { c: {}, ev: 0 } : {});
    }
    var values = { name: name, cloud: JSON.stringify(cloud) };
    Object.keys(extra).forEach(function (k) { values[k] = JSON.stringify(extra[k]); });
    return { ok: true, name: name, values: values };
  }
  function message(why) { return why === "newer" ? MSG.newer : why === "full" ? MSG.full : why === "store" ? MSG.store : MSG.bad; }

  /* Every IkoLearn key and its value now (for a roll back). */
  function snapshot(s) {
    var out = {};
    try { for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && k.indexOf("ikolearn.") === 0) out[k] = s.getItem(k); } } catch { /* a store without key(): the touched keys below */ }
    KEYS.concat(DROP).forEach(function (k) { if (!(live(k) in out)) out[live(k)] = get(s, live(k)); });
    if (PR && !(PR.INDEX in out)) out[PR.INDEX] = get(s, PR.INDEX);
    return out;
  }
  function restore(s, snap) {
    var now = [];
    try { for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && k.indexOf("ikolearn.") === 0) now.push(k); } } catch { /* ignore */ }
    now.forEach(function (k) { if (!(k in snap) || snap[k] == null) { try { s.removeItem(k); } catch { /* ignore */ } } });
    Object.keys(snap).forEach(function (k) { try { if (snap[k] == null) s.removeItem(k); else s.setItem(k, snap[k]); } catch { /* ignore */ } });
  }

  /*
   * Writes a parsed file (parse(...).ok) into the store as the learner learning now. -> { ok: true, how: "fresh" |
   * "replaced" | "added", name } or { ok: false, why: "full" | "store" } (and then the store is exactly as it was).
   */
  function apply(s, parsed) {
    if (!parsed || !parsed.ok) return { ok: false, why: "fields" };
    var name = parsed.name, ix = PR ? PR.current(s) : null, how = "replaced";
    var same = function (p) { return p.name.toLocaleLowerCase() === name.toLocaleLowerCase(); };
    if (PR && ix && ix.mode === "guide" && ix.active && !ix.list.some(same) && ix.list.length >= PR.MAX) return { ok: false, why: "full" };
    var snap = snapshot(s);
    try {
      if (!PR) { /* no learners module: the live keys only */ }
      else if (!ix || !ix.active) { how = "fresh"; }
      else if (ix.mode === "guide") {
        var hit = ix.list.filter(same)[0];
        if (hit) { if (hit.id !== ix.active) PR.switchTo(s, hit.id); }
        else { var r = PR.add(s, name); if (!r || !r.ok) throw new Error("add"); how = "added"; }
      }
      KEYS.forEach(function (k) { s.setItem(live(k), parsed.values[k]); });
      DROP.forEach(function (k) { s.removeItem(live(k)); });
      if (PR && how === "fresh") { if (!PR.begin(s, ix ? ix.mode : "self", name)) throw new Error("begin"); }
      else if (PR && ix && !ix.implicit && how === "replaced") PR.rename(s, PR.index(s).active, name);
      if (s.getItem(live("cloud")) !== parsed.values.cloud) throw new Error("verify");
    } catch {
      restore(s, snap);
      return { ok: false, why: "store" };
    }
    return { ok: true, how: how, name: name };
  }

  var api = { FORMAT: FORMAT, LEGACY: LEGACY, VERSION: VERSION, EXT: EXT, ACCEPT: ACCEPT, KEYS: KEYS, DROP: DROP, MSG: MSG, fileName: fileName, build: build, parse: parse, apply: apply, message: message, snapshot: snapshot, restore: restore };
  if (node_) module.exports = api;
  else root.IkoTransfer = api;
})(typeof window !== "undefined" ? window : this);
