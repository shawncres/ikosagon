/*
 * Enhance a .ikolearn file on demand. Nothing is stored and nothing is logged: the file is read, revised in memory,
 * and handed back. This is the full pass (ordinary adds only make the small, obvious corrections in cloud-model.js).
 * Nodes are topics. Edges are parent/child, plus an optional next step and a few related links.
 * The pass merges near-duplicates, re-parents misplaced topics, lifts an over-long chain into siblings, reorders,
 * repairs next and related links, adds a hands-on safety note, and names a few next topics. Progress, cards and
 * lessons move with a node. No outside knowledge base: only the names already on the cloud, and the same small
 * field list the cloud already uses to refuse a parent from another field.
 */
(function (root) {
  "use strict";
  var node_ = typeof module !== "undefined" && module.exports;
  var C = node_ ? require("./cloud-model.js") : root.IkoCloud;
  var NOTES = [
    { re: /\b(coolants?|radiators?|antifreeze)\b/i, has: /hot engine/i, note: "Never open the cap on a hot engine. Wait until it has cooled." },
    { re: /\b(power tools?|saws?|drills?)\b/i, has: /unplug a power tool/i, note: "Keep hands clear of the blade or bit, and unplug a power tool before changing a part." },
    { re: /\b(chemicals?|bleach|solvents?)\b/i, has: /do not mix/i, note: "Read the label, and do not mix chemicals or breathe them in." },
    { re: /\b(electricity|electrical|wiring)\b/i, has: /switch the power off/i, note: "Switch the power off before you touch a wire or an open fitting." },
    { re: /\b(food handling|food safety|raw meat)\b/i, has: /wash your hands/i, note: "Wash your hands, and keep raw meat away from food that is ready to eat." }
  ];
  /* Names to offer beside a thin branch. Only suggested, never inserted: the cloud stays the learner's own topics. */
  var NEARBY = {
    auto: ["Brakes", "Tyres", "Oil"],
    food: ["Food Safety", "Seasoning"],
    myth: ["Heroes", "Temples"],
    tech: ["Debugging", "Testing"],
    health: ["Rest", "Prevention"],
    bird: ["Migration", "Habitats"],
    physics: ["Forces", "Energy"],
    history: ["Daily Life", "Leaders"],
    photo: ["Light", "Composition"],
    storm: ["Clouds", "Safety"],
    measure: ["Units", "Estimating"]
  };
  var LONG = 4; /* subject is depth 1; anything deeper becomes a sibling under the node at depth 3 */

  function mergeLesson(a, b) {
    var o = Object.assign({}, a || {});
    if (!b) return o;
    if (b.text && o.text && b.text !== o.text) o.text = o.text + "\n\n" + b.text;
    else if (b.text && !o.text) o.text = b.text;
    ["earned", "got", "tk", "ra"].forEach(function (k) { if (!o[k] && b[k]) o[k] = b[k]; });
    if (b.ck && (!o.ck || (b.ck.p && !(o.ck && o.ck.p)))) o.ck = b.ck;
    if (Array.isArray(b.ans) && (!o.ans || !o.ans.length)) o.ans = b.ans.slice();
    return o;
  }
  function carryMaps(pack, from, to) {
    if (!pack) return;
    ["lessons", "notes", "tests", "seen"].forEach(function (k) {
      var m = pack[k];
      if (!m || m[from] == null) return;
      if (m[to] == null) m[to] = m[from];
      else if (k === "lessons") m[to] = mergeLesson(m[to], m[from]);
      else if (k === "notes" && String(m[from]).length > String(m[to] || "").length) m[to] = m[from];
      delete m[from];
    });
  }
  function rich(cloud, n, pack) {
    var les = pack && pack.lessons && pack.lessons[n.id];
    return (n.ghost ? 0 : 4) + (n.mastery || 0) * 6 + (n.correct || 0) + ((n.cards && n.cards.length) || 0) * 2 + (C.inDeck(cloud, n.id) ? 3 : 0) + (n.doneAt || n.achievedAt ? 3 : 0) + (les && (les.earned || les.got) ? 4 : 0) + (les && les.text ? 1 : 0);
  }
  /* Every near-duplicate pair. The richer node stays; the other is merged into it, progress and lessons included. */
  function mergeDupes(cloud, pack, cleaned, merged) {
    var guard = 0;
    while (guard++ < 40) {
      var nodes = cloud.order.slice(), did = false;
      for (var i = 0; i < nodes.length && !did; i++) {
        var n = cloud.nodes[nodes[i]];
        if (!n) continue;
        var hits = cloud.order.map(function (id) { return cloud.nodes[id]; }).filter(function (m) {
          return m && m.id !== n.id && (m.key === n.key || C.nearName(m.label, n.label)) && C.ancestry(cloud, m.id).indexOf(n.id) < 0 && C.ancestry(cloud, n.id).indexOf(m.id) < 0;
        });
        if (!hits.length) continue;
        var pool = hits.concat([n]);
        var keep = pool.slice().sort(function (a, b) { return rich(cloud, b, pack) - rich(cloud, a, pack); })[0];
        var drop = pool.filter(function (m) { return m.id !== keep.id; }).sort(function (a, b) { return rich(cloud, a, pack) - rich(cloud, b, pack); })[0];
        if (!drop || drop.id === keep.id) continue;
        var ghost = drop.ghost, label = drop.label, into = keep.label, from = drop.id, to = keep.id;
        if (from === to || !C.mergeNodes(cloud, to, from)) continue;
        carryMaps(pack, from, to);
        if (ghost) cleaned.push(label); else merged.push(label + " into " + into);
        did = true;
      }
      if (!did) break;
    }
  }
  /* A better parent anywhere on the cloud: a closer name, or the same field when the current parent is a different field. */
  function betterParent(cloud, n) {
    var cur = n.parent ? cloud.nodes[n.parent] : null;
    var named = C.closestParent(cloud, n.label);
    if (named && named.id !== n.id && named.id !== (cur && cur.id) && C.ancestry(cloud, named.id).indexOf(n.id) < 0 && C.ancestry(cloud, n.id).indexOf(named.id) < 0) {
      if (!cur || C.familyClash(n.label, cur.label) || C.nameScore(n.label, named.label) > C.nameScore(n.label, cur.label)) return named;
    }
    var fam = C.familiesOf(n.label);
    if (cur && fam.length && C.familyClash(n.label, cur.label)) {
      var best = null, score = -1;
      cloud.order.forEach(function (id) {
        var m = cloud.nodes[id];
        if (!m || m.id === n.id || (cur && m.id === cur.id) || C.ancestry(cloud, m.id).indexOf(n.id) >= 0) return;
        var mf = C.familiesOf(m.label);
        if (!fam.some(function (f) { return mf.indexOf(f) >= 0; })) return;
        var s = C.nameScore(n.label, m.label) + (m.parent ? 0 : 3) + Math.max(0, 3 - C.depthOf(cloud, m.id));
        if (s > score) { score = s; best = m; }
      });
      if (best) return best;
      return { id: null, label: n.label };
    }
    if (!cur && named) return named;
    return null;
  }
  function reparentAll(cloud, moved) {
    var guard = 0, seen = {};
    while (guard++ < cloud.order.length + 4) {
      var again = false;
      cloud.order.slice().forEach(function (id) {
        if (again || seen[id]) return;
        var n = cloud.nodes[id];
        if (!n) return;
        var home = betterParent(cloud, n);
        if (!home || (n.parent || null) === (home.id || null)) return;
        var from = n.parent && cloud.nodes[n.parent] ? cloud.nodes[n.parent].label : "";
        if (!home.id) {
          if (!n.parent) return;
          var old = cloud.nodes[n.parent];
          if (old && old.path) { old.path.ids = old.path.ids.filter(function (x) { return x !== id; }); if (old.path.next === id) old.path.next = null; }
          n.parent = null; n.role = ""; n.off = null;
          if (!Number.isFinite(n.hue)) n.hue = C.subjectHue(cloud, n.label);
          cloud.rev += 1;
          moved.push(n.label + (from ? " out of " + from : ""));
          seen[id] = 1; again = true; return;
        }
        if (C.ancestry(cloud, home.id).indexOf(id) >= 0) return;
        if (!C.moveUnder(cloud, id, home.id)) return;
        cloud.rev += 1;
        moved.push(n.label + " under " + home.label);
        seen[id] = 1; again = true;
      });
      if (!again) break;
    }
  }
  /* A chain longer than LONG is lifted so the tail sits beside the step at that depth, not under it. */
  function liftLong(cloud, lifted) {
    var guard = 0, stuck = {};
    while (guard++ < 40) {
      var deep = cloud.order.filter(function (id) { return cloud.nodes[id] && C.depthOf(cloud, id) > LONG && !stuck[id]; });
      if (!deep.length) break;
      deep.sort(function (a, b) { return C.depthOf(cloud, b) - C.depthOf(cloud, a); });
      var id = deep[0], anc = C.ancestry(cloud, id), pid = anc[LONG - 2];
      var n = cloud.nodes[id];
      if (!pid || !n || n.parent === pid || !C.moveUnder(cloud, id, pid)) { stuck[id] = 1; continue; }
      cloud.rev += 1;
      lifted.push(n.label);
    }
  }
  function reorder(cloud, changed) {
    cloud.order.slice().forEach(function (pid) {
      var n = cloud.nodes[pid];
      if (!n) return;
      var kids = C.childrenOf(cloud, pid).map(function (c) { return c.id; });
      if (kids.length < 2) return;
      var path = (n.path && n.path.ids) || [];
      var rank = function (id) {
        var c = cloud.nodes[id], at = path.indexOf(id);
        if (at >= 0) return at;
        if (c.ghost) return 1000 + (c.mastery || 0);
        if (C.isDone(cloud, id)) return 800;
        return 400 + (c.mastery || 0) * 10;
      };
      var want = kids.slice().sort(function (a, b) { return rank(a) - rank(b) || String(cloud.nodes[a].label).localeCompare(String(cloud.nodes[b].label)); });
      if (want.join() === kids.join()) return;
      var slots = [];
      cloud.order.forEach(function (id, i) { if (want.indexOf(id) >= 0) slots.push(i); });
      slots.forEach(function (at, i) { cloud.order[at] = want[i]; });
      changed.push(n.label);
    });
  }
  function fixLinks(cloud, fixed) {
    cloud.order.forEach(function (id) {
      var n = cloud.nodes[id];
      if (!n) return;
      if (n.path && n.path.ids && n.path.ids.length) {
        var open = n.path.ids.filter(function (x) { return cloud.nodes[x] && !C.isDone(cloud, x); })[0] || n.path.ids.filter(function (x) { return cloud.nodes[x]; })[0] || null;
        if (n.path.next !== open) { n.path.next = open; fixed.push(n.label); }
      }
      if (!n.parent) { n.rel = []; return; }
      var rel = [], sibs = C.childrenOf(cloud, n.parent);
      sibs.forEach(function (s) {
        if (rel.length >= 3 || s.id === id) return;
        if (n.path && n.path.next === s.id) return;
        if (C.nameScore(n.label, s.label) >= 2 || (C.familiesOf(n.label).length && C.familiesOf(n.label).some(function (f) { return C.familiesOf(s.label).indexOf(f) >= 0; }))) rel.push(s.id);
      });
      cloud.order.forEach(function (oid) {
        if (rel.length >= 3) return;
        var o = cloud.nodes[oid];
        if (!o || o.id === id || o.id === n.parent || rel.indexOf(o.id) >= 0) return;
        if (C.ancestry(cloud, o.id).indexOf(id) >= 0 || C.ancestry(cloud, id).indexOf(o.id) >= 0) return;
        if (C.nameScore(n.label, o.label) >= 4 && !C.familyClash(n.label, o.label)) rel.push(o.id);
      });
      var prev = (n.rel || []).join();
      n.rel = rel;
      if (rel.join() !== prev && rel.length) fixed.push(n.label);
    });
  }
  function skillOf(cloud, lessons) {
    lessons = lessons || {};
    var done = {}, checks = 0, passed = 0;
    (cloud.order || []).forEach(function (id) {
      if (C.isDone(cloud, id)) done[id] = 1;
      var t = cloud.tests && cloud.tests[id];
      if (t && t.attempts) { checks += t.attempts; if ((t.best || 0) >= (C.TEST_PASS || 0.6) || t.passAt) passed += t.passAt ? t.attempts : 1; }
      var les = lessons[id];
      if (les && (les.earned || les.got)) done[id] = 1;
      var ck = les && les.ck;
      if (ck && ck.r) { checks += ck.r; if (ck.p) passed += Math.max(1, ck.r - (ck.miss || 0)); }
    });
    var completed = Object.keys(done).length, rate = Math.min(1, checks ? passed / checks : (completed ? 1 : 0));
    var level = completed >= 8 && rate >= 0.75 ? "advanced" : completed >= 4 && rate >= 0.55 ? "comfortable" : completed >= 1 || checks >= 1 ? "developing" : "beginner";
    return { level: level, completed: completed, checks: checks, rate: Math.round(rate * 100) / 100, evidence: completed + checks > 0 };
  }
  /* A rough level from finished lessons and checks. It nudges later lessons only when the learner has not chosen one. */
  function applySkill(cloud, lessons) {
    var s = skillOf(cloud, lessons);
    cloud.skill = s.level;
    if (!s.evidence) return s;
    var band = C.profileOf(cloud).band;
    if (band !== "simple" && band !== "deeper" && band !== "standard") {
      if (s.level === "beginner") C.setProfile(cloud, { band: "simple" });
      else if (s.level === "advanced") C.setProfile(cloud, { band: "deeper" });
    }
    C.subjects(cloud).forEach(function (sub) {
      if (Number.isFinite(sub.ez)) return;
      sub.ez = s.level === "beginner" ? -0.5 : s.level === "advanced" ? 0.7 : s.level === "comfortable" ? 0.35 : 0;
    });
    return s;
  }
  function suggestNext(cloud) {
    var next = [];
    cloud.order.forEach(function (id) {
      var n = cloud.nodes[id];
      if (n && n.parent && !n.ghost && !C.isDone(cloud, id)) next.push(n);
    });
    next.sort(function (a, b) { return (a.mastery || 0) - (b.mastery || 0) || String(a.label).localeCompare(String(b.label)); });
    return next.slice(0, 3).map(function (n) { return n.label; });
  }
  function suggestNearby(cloud) {
    var have = {};
    cloud.order.forEach(function (id) { have[cloud.nodes[id].key] = 1; });
    var out = [];
    C.subjects(cloud).forEach(function (s) {
      C.familiesOf(s.label).forEach(function (f) {
        (NEARBY[f] || []).forEach(function (name) {
          if (out.length >= 3 || have[C.norm(name)] || C.findAny(cloud, name)) return;
          out.push(name); have[C.norm(name)] = 1;
        });
      });
    });
    return out;
  }
  function list(items, max) {
    if (items.length <= max) return items.join(", ");
    return items.slice(0, max).join(", ") + " and " + (items.length - max) + " more";
  }
  /* A suggested re-parent from the model. Only existing ids, never a node under itself, never a cycle. */
  function applyMoves(cloud, moves) {
    (Array.isArray(moves) ? moves : []).slice(0, 40).forEach(function (m) {
      if (!m) return;
      var id = m.id, pid = m.parent;
      if (!cloud.nodes[id] || !cloud.nodes[pid] || id === pid) return;
      if (C.ancestry(cloud, pid).indexOf(id) >= 0) return;
      if (cloud.nodes[id].parent === pid) return;
      C.moveUnder(cloud, id, pid);
    });
  }
  function enhanceCloud(cloud, pack, advice) {
    var cleaned = [], siblings = [], safety = [], moved = [], merged = [], lifted = [], reordered = [], linked = [];
    pack = pack || {};
    if (!cloud || !cloud.order) return { cleaned: cleaned, siblings: siblings, safety: safety, next: [], notice: "Couldn't read that file." };
    if (advice && advice.moves) applyMoves(cloud, advice.moves);
    mergeDupes(cloud, pack, cleaned, merged);
    reparentAll(cloud, moved);
    liftLong(cloud, lifted);
    reorder(cloud, reordered);
    fixLinks(cloud, linked);
    cloud.order.forEach(function (id) {
      var n = cloud.nodes[id];
      if (!n) return;
      for (var i = 0; i < NOTES.length; i++) {
        if (NOTES[i].re.test(n.label) && !NOTES[i].has.test(n.blurb || "")) {
          C.setBlurb(cloud, id, ((n.blurb ? n.blurb + " " : "") + NOTES[i].note).trim());
          safety.push(n.label);
          break;
        }
      }
    });
    C.subjects(cloud).forEach(function (s) {
      var kids = C.childrenOf(cloud, s.id);
      if (kids.length === 1) siblings.push({ parent: s.label, beside: kids[0].label });
    });
    var skill = applySkill(cloud, pack.lessons || {});
    var labels = suggestNext(cloud), nearby = suggestNearby(cloud);
    var bits = [];
    if (cleaned.length) bits.push("Removed " + cleaned.length + " near-duplicate placeholder" + (cleaned.length === 1 ? "" : "s") + ".");
    if (merged.length) bits.push("Merged " + list(merged, 6) + ".");
    if (moved.length) bits.push("Moved " + list(moved, 6) + ".");
    if (lifted.length) bits.push("Brought " + list(lifted, 6) + " up beside a long chain.");
    if (reordered.length) bits.push("Reordered " + reordered.length + (reordered.length === 1 ? " branch." : " branches."));
    if (linked.length) bits.push("Updated next and related links.");
    if (siblings.length) bits.push(siblings.length + (siblings.length === 1 ? " subject has" : " subjects have") + " only one branch.");
    if (safety.length) bits.push("Added a safety note on " + safety.length + (safety.length === 1 ? " topic." : " topics."));
    if (labels.length) bits.push("Suggested next: " + labels.join(", ") + ".");
    if (nearby.length) bits.push("Nearby topics: " + nearby.join(", ") + ".");
    if (skill.evidence) bits.push("Lesson level from what you've finished: " + skill.level + ".");
    return { cleaned: cleaned, siblings: siblings, safety: safety, next: labels, moved: moved, merged: merged, lifted: lifted, skill: skill, notice: bits.length ? bits.join(" ") : "Nothing to add. This file is already in good shape." };
  }
  function outlineOf(text) {
    var raw;
    try { raw = JSON.parse(text); } catch (e) { return null; }
    if (!raw || !raw.data || !raw.data.cloud) return null;
    var cloud = C.deserialize(typeof raw.data.cloud === "string" ? raw.data.cloud : JSON.stringify(raw.data.cloud));
    if (!cloud) return null;
    return cloud.order.slice(0, 80).map(function (id) {
      var n = cloud.nodes[id];
      return n ? { id: n.id, t: n.label, p: n.parent || "" } : null;
    }).filter(Boolean);
  }
  function enhanceText(text, advice) {
    var raw;
    try { raw = JSON.parse(text); } catch (e) { return { ok: false, notice: "Couldn't read that file." }; }
    if (!raw || !raw.data || !raw.data.cloud) return { ok: false, notice: "Couldn't read that file." };
    var cloud = C.deserialize(JSON.stringify(raw.data.cloud));
    if (!cloud) return { ok: false, notice: "Couldn't read that file." };
    var pack = { lessons: raw.data.lessons || {}, notes: raw.data.notes || {}, tests: raw.data.tests || {}, seen: raw.data.seen || {} };
    var report = enhanceCloud(cloud, pack, advice);
    raw.data.cloud = JSON.parse(C.serialize(cloud));
    raw.data.lessons = pack.lessons; raw.data.notes = pack.notes; raw.data.tests = pack.tests; raw.data.seen = pack.seen;
    if (!raw.format) raw.format = "ikolearn";
    var name = String(raw.data.name || "IkoLearn").replace(/\s+/g, "-").replace(/[^\w.'-]+/g, "").slice(0, 40) || "IkoLearn";
    return { ok: true, notice: report.notice, name: name + ".ikolearn", text: JSON.stringify(raw), next: report.next, cleaned: report.cleaned, safety: report.safety, siblings: report.siblings, moved: report.moved, merged: report.merged, skill: report.skill };
  }
  var api = { enhanceCloud: enhanceCloud, enhanceText: enhanceText, outlineOf: outlineOf, skillOf: skillOf, applySkill: applySkill };
  if (node_) module.exports = api;
  else root.IkoEnhance = api;
})(typeof window !== "undefined" ? window : globalThis);
