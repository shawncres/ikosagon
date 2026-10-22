/*
 * IkoLearn ranking: a light, living top 10 of topics, scored on the device from this learner's use (opens, time spent,
 * correct answers, "I've got it", cards), with recent use counting most (the model's usage heat halves every two weeks).
 *
 * Sources are pluggable. Each returns { key: score } where key is a topic's normalised label (IkoCloud.norm), so a
 * future shared source (popularity across learners, from a server) can join without knowing this device's node ids.
 * Scores are normalised per source (top = 1) and mixed by each source's weight. Three sources are on today:
 *   local    this learner's use of each topic (weight 1)
 *   chain    use of everything under a topic, so the parents of an active chain rank too (weight 0.5)
 *   model    model-informed importance (weight 0.35): the creation call scores each child it makes (0-1, how important
 *            it is as a next step in its topic, given what the learner already has; no age or place is ever sent).
 *            A prior: it only orders things and never puts an
 *            unused topic in the top 10, and it never hides anything (low scores are still offered, just later).
 * A shared, across-learners source can register later with the same shape (register({ name, weight, prior, scores })).
 *
 * The ranking orders what is offered first: suggestions and Draw (orchestrator.js), child topics without a path order,
 * fork choices, and the nearby branch offered when a branch ends. Within a parent, the path's learning order (foundational
 * first) always wins over rank, and it never overrides the yearly subject balance.
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
  /* use under a topic: half of its descendants' heat (its own heat is the local source) */
  var chain = {
    name: "chain", weight: 0.5,
    scores: function (cloud, now) {
      var out = {};
      cloud.order.forEach(function (id) {
        var n = cloud.nodes[id];
        if (!n || !n.parent || n.ghost) return;
        var h = C.heatNow(n, now);
        if (!(h > 0.05)) return;
        C.ancestry(cloud, id).slice(1, -1).forEach(function (a) { var an = cloud.nodes[a]; out[an.key] = (out[an.key] || 0) + h * 0.5; });
      });
      return out;
    }
  };
  /* importance from the creation call, per topic key (the best score when a label appears twice) */
  var model = {
    name: "model", weight: 0.35, prior: true,
    scores: function (cloud) {
      var out = {};
      cloud.order.forEach(function (id) {
        var n = cloud.nodes[id];
        if (!n || !n.parent || n.imp == null) return;
        var v = n.imp;
        if (v > 0) out[n.key] = Math.max(out[n.key] || 0, v);
      });
      return out;
    }
  };
  var sources = [local, chain, model];

  /* Adds a source { name, weight, scores(cloud, now) -> { key: score }, prior? }. A prior only orders things; it can't put a topic in the top 10. Same name replaces. */
  function register(src) {
    if (!src || typeof src.scores !== "function" || !src.name) return false;
    sources = sources.filter(function (s) { return s.name !== src.name; }).concat([{ name: String(src.name), weight: Number(src.weight) > 0 ? Number(src.weight) : 1, scores: src.scores, prior: Boolean(src.prior) }]);
    return true;
  }
  function unregister(name) { if (name === "local" || name === "chain") return false; var before = sources.length; sources = sources.filter(function (s) { return s.name !== name; }); return sources.length < before; }

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

  /* Keys with real use behind them (any source that isn't a prior): only these can be in the top 10. */
  function used(cloud, now) {
    var u = {};
    sources.filter(function (s) { return !s.prior; }).forEach(function (s) {
      var sc; try { sc = s.scores(cloud, now) || {}; } catch { sc = {}; }
      Object.keys(sc).forEach(function (k) { if (sc[k] > 0) u[k] = 1; });
    });
    return u;
  }
  /* The top topics on this device's map: [{ id, label, chain, score, rank }] (a key the map doesn't have is skipped). */
  function top(cloud, opts) {
    opts = opts || {};
    var now = opts.now || Date.now(), n = opts.n || TOP, m = mixed(cloud, now), u = used(cloud, now);
    var rows = [];
    Object.keys(m).forEach(function (k) {
      if (!u[k]) return;
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

  /* id -> mixed score for any node (ghosts included, so unexplored children can be ordered by their importance). */
  function scores(cloud, now) {
    var m = mixed(cloud, now || Date.now()), out = {};
    cloud.order.forEach(function (id) { var nd = cloud.nodes[id]; if (nd && nd.parent && m[nd.key]) out[id] = Math.round(m[nd.key] * 1000) / 1000; });
    return out;
  }
  /* ids sorted by score, highest first; ties keep their given order. */
  function order(cloud, ids, now, sc) {
    sc = sc || scores(cloud, now);
    return (ids || []).map(function (id, i) { return { id: id, i: i, s: sc[id] || 0 }; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; }).map(function (x) { return x.id; });
  }
  /* The busiest chains: topics with the most use under them, [{ id, label, chain, score }]. */
  function chains(cloud, opts) {
    opts = opts || {};
    var sc = chain.scores(cloud, opts.now || Date.now()), rows = [];
    Object.keys(sc).forEach(function (k) { var nd = C.findTopic(cloud, k); if (nd && !nd.ghost) rows.push({ id: nd.id, label: nd.label, chain: C.chainOf(cloud, nd.id), score: Math.round(sc[k] * 1000) / 1000 }); });
    rows.sort(function (a, b) { return b.score - a.score || (a.label < b.label ? -1 : 1); });
    return rows.slice(0, opts.n || 5);
  }

  var api = { TOP: TOP, scores: scores, order: order, chains: chains, register: register, unregister: unregister, mixed: mixed, top: top, boost: boost, sources: function () { return sources.map(function (s) { return s.name; }); } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IkoRank = api;
})(typeof window !== "undefined" ? window : this);
