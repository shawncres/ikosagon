/**
 * Public, caller-safe shape of a call flow for the live flow map: node ids/labels,
 * edges, exits and a hand-rolled layered layout. Never includes scripts, corpus text,
 * prompts, or tool configuration.
 */
import type { Flow } from "./types";

export type FlowGraphNode = {
  id: string;
  label: string;
  /** Layer (distance from the start node) and position within the layer */
  level: number;
  slot: number;
  /** Exit outcomes this node can end the call with */
  exits: { type: string; label: string }[];
  /** Verbatim compliance node (allowParaphrase: false) */
  mustSay: boolean;
};

export type FlowGraphEdge = { from: string; to: string; on: string[] };

export type FlowGraph = {
  flowId: string;
  start: string;
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
  levels: number;
  /** Widest layer (for sizing) */
  width: number;
};

export function flowGraph(flow: Flow): FlowGraph {
  const ids = Object.keys(flow.nodes);
  // Layer = BFS distance from start over node→node transitions (exits excluded)
  const level = new Map<string, number>([[flow.start, 0]]);
  const queue = [flow.start];
  while (queue.length) {
    const id = queue.shift()!;
    for (const t of flow.nodes[id]?.transitions ?? []) {
      if (t.to.startsWith("exit:") || !flow.nodes[t.to] || level.has(t.to)) continue;
      level.set(t.to, (level.get(id) ?? 0) + 1);
      queue.push(t.to);
    }
  }
  // Unreachable nodes go on a final layer so they still show
  const maxLevel = Math.max(0, ...level.values());
  for (const id of ids) if (!level.has(id)) level.set(id, maxLevel + 1);

  const byLevel = new Map<number, string[]>();
  for (const id of ids) {
    const l = level.get(id)!;
    byLevel.set(l, [...(byLevel.get(l) ?? []), id]);
  }

  const nodes: FlowGraphNode[] = ids.map((id) => {
    const n = flow.nodes[id];
    const l = level.get(id)!;
    return {
      id,
      label: n.label,
      level: l,
      slot: byLevel.get(l)!.indexOf(id),
      exits: (n.exits ?? []).map((e) => ({ type: e.type, label: e.label })),
      mustSay: n.allowParaphrase === false,
    };
  });

  const edgeMap = new Map<string, FlowGraphEdge>();
  for (const id of ids) {
    for (const t of flow.nodes[id].transitions) {
      if (t.to.startsWith("exit:") || t.to === id || !flow.nodes[t.to]) continue;
      const key = `${id}>${t.to}`;
      const e = edgeMap.get(key) ?? { from: id, to: t.to, on: [] };
      if (!e.on.includes(t.on)) e.on.push(t.on);
      edgeMap.set(key, e);
    }
  }

  return {
    flowId: flow.id,
    start: flow.start,
    nodes,
    edges: [...edgeMap.values()],
    levels: Math.max(...nodes.map((n) => n.level)) + 1,
    width: Math.max(...[...byLevel.values()].map((v) => v.length)),
  };
}

/** Edges walked by a sequence of visited node ids (consecutive distinct pairs) */
export function visitedEdges(path: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 1; i < path.length; i++) {
    if (path[i] !== path[i - 1]) out.add(`${path[i - 1]}>${path[i]}`);
  }
  return out;
}
