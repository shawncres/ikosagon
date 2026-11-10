/*
 * Enhance a .ikolearn file on demand. Nothing is stored and nothing is logged: the file is read, adjusted in memory,
 * and handed back. Near-duplicate placeholders go, a hands-on topic gains a short safety note, and the result names
 * a few unfinished topics plus any subject that has only one branch.
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
  function enhanceCloud(cloud) {
    var cleaned = [], siblings = [], safety = [], next = [];
    if (!cloud || !cloud.order) return { cleaned: cleaned, siblings: siblings, safety: safety, next: next, notice: "Couldn't read that file." };
    cloud.order.slice().forEach(function (id) {
      var n = cloud.nodes[id];
      if (!n || !n.ghost || n.opened) return;
      var close = C.findClose(cloud, n.label);
      if (close && close.id !== id) { C.removeBranch(cloud, id); cleaned.push(n.label); }
    });
    C.subjects(cloud).forEach(function (s) {
      var kids = C.childrenOf(cloud, s.id);
      if (kids.length === 1) siblings.push({ parent: s.label, beside: kids[0].label });
    });
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
      if (n.parent && !n.ghost && !C.isDone(cloud, id)) next.push(n);
    });
    next.sort(function (a, b) { return (a.mastery || 0) - (b.mastery || 0) || String(a.label).localeCompare(String(b.label)); });
    var labels = next.slice(0, 3).map(function (n) { return n.label; });
    var bits = [];
    if (cleaned.length) bits.push("Removed " + cleaned.length + " near-duplicate placeholder" + (cleaned.length === 1 ? "" : "s") + ".");
    if (siblings.length) bits.push(siblings.length + (siblings.length === 1 ? " subject has" : " subjects have") + " only one branch.");
    if (safety.length) bits.push("Added a safety note on " + safety.length + (safety.length === 1 ? " topic." : " topics."));
    if (labels.length) bits.push("Suggested next: " + labels.join(", ") + ".");
    return { cleaned: cleaned, siblings: siblings, safety: safety, next: labels, notice: bits.length ? bits.join(" ") : "Nothing to add. This file is already in good shape." };
  }
  function enhanceText(text) {
    var raw;
    try { raw = JSON.parse(text); } catch (e) { return { ok: false, notice: "Couldn't read that file." }; }
    if (!raw || !raw.data || !raw.data.cloud) return { ok: false, notice: "Couldn't read that file." };
    var cloud = C.deserialize(JSON.stringify(raw.data.cloud));
    if (!cloud) return { ok: false, notice: "Couldn't read that file." };
    var report = enhanceCloud(cloud);
    raw.data.cloud = JSON.parse(C.serialize(cloud));
    if (!raw.format) raw.format = "ikolearn";
    var name = String(raw.data.name || "IkoLearn").replace(/\s+/g, "-").replace(/[^\w.'-]+/g, "").slice(0, 40) || "IkoLearn";
    return { ok: true, notice: report.notice, name: name + ".ikolearn", text: JSON.stringify(raw), next: report.next, cleaned: report.cleaned, safety: report.safety, siblings: report.siblings };
  }
  var api = { enhanceCloud: enhanceCloud, enhanceText: enhanceText };
  if (node_) module.exports = api;
  else root.IkoEnhance = api;
})(typeof window !== "undefined" ? window : globalThis);
