/*
 * IkoLearn ranking: a light, living top 10 of topics, scored on the device from this learner's use (opens, time spent,
 * correct answers, "I've got it", cards), with recent use counting most (the model's usage heat halves every two weeks).
 *
 * Sources are pluggable. Each returns { key: score } where key is a topic's normalised label (IkoCloud.norm), so a
 * future shared source (popularity across learners, from a server) can join without knowing this device's node ids.
 * Scores are normalised per source (top = 1) and mixed by each source's weight. Only the local source is on today.
 *
 * The ranking nudges: the session draw (a modest weight, see IkoDeck.weigh) and which nearby branch is offered first
 * when a branch ends. It never overrides the yearly subject balance.
 */
(function (root) {
  "use strict";
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- UMD: Node tests load the model, the browser has window.IkoCloud
  var C = typeof module !== "undefined" && module.exports ? require("./cloud-model.js") : root.IkoCloud;

  var TOP = 10;
  var local = {
    name: "local", weight: 1,
    scores: function (cloud, now) {
      var out = {};
      cloud.order.forEach(function (id) {
        var n = cloud.nodes[id];
        if (!n || !n.parent || n.ghost) return;
        var h = C.heatNow(n, now);
        if (h > 0.05) out[n.key] = Math.max(out[n.key] || 0, h);
      });
      return out;
    }
  };
  var sources = [local];

  /* Adds a source { name, weight, scores(cloud, now) -> { key: score } }. A source with the same name is replaced. */
  function register(src) {
    if (!src || typeof src.scores !== "function" || !src.name) return false;
    sources = sources.filter(function (s) { return s.name !== src.name; }).concat([{ name: String(src.name), weight: Number(src.weight) > 0 ? Number(src.weight) : 1, scores: src.scores }]);
    return true;
  }
  function unregister(name) { if (name === "local") return false; var before = sources.length; sources = sources.filter(function (s) { return s.name !== name; }); return sources.length < before; }

  /* Mixed score per topic key: sum over sources of weight x (score / that source's best). */
  function mixed(cloud, now) {
    var total = {};
    sources.forEach(function (s) {
      var sc;
      try { sc = s.scores(cloud, now) || {}; } catch { sc = {}; }
      var max = 0;
      Object.keys(sc).forEach(function (k) { if (sc[k] > max) max = sc[k]; });
      if (!(max > 0)) return;
      Object.keys(sc).forEach(function (k) { if (sc[k] > 0) total[k] = (total[k] || 0) + s.weight * (sc[k] / max); });
    });
    return total;
  }

  /* The top topics on this device's map: [{ id, label, chain, score, rank }] (a key the map doesn't have is skipped). */
  function top(cloud, opts) {
    opts = opts || {};
    var now = opts.now || Date.now(), n = opts.n || TOP, m = mixed(cloud, now);
    var rows = [];
    Object.keys(m).forEach(function (k) {
      var node = C.findTopic(cloud, k);
      if (node && !node.ghost) rows.push({ id: node.id, label: node.label, chain: C.chainOf(cloud, node.id), score: m[k] });
    });
    rows.sort(function (a, b) { return b.score - a.score || (a.label < b.label ? -1 : 1); });
    return rows.slice(0, n).map(function (r, i) { r.score = Math.round(r.score * 1000) / 1000; r.rank = i + 1; return r; });
  }

  /* id -> 0..1 for the session draw: 1 for the top topic, falling off with rank; topics outside the top 10 get 0. */
  function boost(cloud, now) {
    var out = {};
    top(cloud, { now: now }).forEach(function (r) { out[r.id] = Math.round((1 - (r.rank - 1) / TOP) * 1000) / 1000; });
    return out;
  }

  var api = { TOP: TOP, register: register, unregister: unregister, mixed: mixed, top: top, boost: boost, sources: function () { return sources.map(function (s) { return s.name; }); } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IkoRank = api;
})(typeof window !== "undefined" ? window : this);
