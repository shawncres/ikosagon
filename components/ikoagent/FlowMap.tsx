"use client";

import type { FlowGraph } from "@/lib/ikoagent/flowGraph";
import { visitedEdges } from "@/lib/ikoagent/flowGraph";

const NODE_W = 118;
const NODE_H = 28;
const GAP_X = 12;
const GAP_Y = 22;
const PAD = 8;
const SIDE_ROOM = 22;

function shortLabel(label: string): string {
  return label.length > 18 ? `${label.slice(0, 17)}…` : label;
}

/** Compact layered flow diagram (hand-rolled SVG): current step lit, visited path traced */
export function FlowMap({
  graph,
  current,
  path,
  ended,
}: {
  graph: FlowGraph;
  current: string;
  path: string[];
  ended: boolean;
}) {
  const visited = new Set(path);
  const walked = visitedEdges(path);
  const layoutW = graph.width * (NODE_W + GAP_X) - GAP_X + PAD * 2;
  /** Room on the right for back-edges (loops back up the graph) */
  const width = layoutW + SIDE_ROOM;
  const height = graph.levels * (NODE_H + GAP_Y) - GAP_Y + PAD * 2;
  const perLevel = new Map<number, number>();
  for (const n of graph.nodes) perLevel.set(n.level, (perLevel.get(n.level) ?? 0) + 1);
  const pos = new Map(
    graph.nodes.map((n) => {
      const count = perLevel.get(n.level) ?? 1;
      const rowW = count * (NODE_W + GAP_X) - GAP_X;
      const x = PAD + (layoutW - PAD * 2 - rowW) / 2 + n.slot * (NODE_W + GAP_X);
      const y = PAD + n.level * (NODE_H + GAP_Y);
      return [n.id, { x, y }];
    }),
  );
  const labelOf = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const pathText = path.map((id) => labelOf.get(id) ?? id).join(" → ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Flow map. Current step: ${labelOf.get(current) ?? current}${ended ? " (call ended)" : ""}. Path: ${pathText || "not started"}.`}
    >
      <defs>
        <marker id="ikoa-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#3f3f46" />
        </marker>
        <marker id="ikoa-arrow-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--accent)" />
        </marker>
      </defs>
      {graph.edges.map((e) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) return null;
        const on = walked.has(`${e.from}>${e.to}`);
        const down = b.y > a.y;
        const x1 = a.x + NODE_W / 2;
        const y1 = down ? a.y + NODE_H : a.y + NODE_H / 2;
        const x2 = b.x + NODE_W / 2;
        const y2 = down ? b.y : b.y + NODE_H / 2;
        const d = down
          ? `M${x1},${y1} C${x1},${y1 + GAP_Y / 1.5} ${x2},${y2 - GAP_Y / 1.5} ${x2},${y2 - 1}`
          : `M${a.x + NODE_W},${y1} C${a.x + NODE_W + 24},${y1} ${b.x + NODE_W + 24},${y2} ${b.x + NODE_W},${y2}`;
        return (
          <path
            key={`${e.from}>${e.to}`}
            d={d}
            fill="none"
            stroke={on ? "var(--accent)" : "#3f3f46"}
            strokeOpacity={on ? 0.9 : 0.7}
            strokeWidth={on ? 1.6 : 1}
            markerEnd={on ? "url(#ikoa-arrow-on)" : "url(#ikoa-arrow)"}
          >
            <title>{`${labelOf.get(e.from)} → ${labelOf.get(e.to)} (${e.on.join(", ")})`}</title>
          </path>
        );
      })}
      {graph.nodes.map((n) => {
        const p = pos.get(n.id)!;
        const isCurrent = n.id === current;
        const wasVisited = visited.has(n.id);
        return (
          <g key={n.id} data-node={n.id} data-state={isCurrent ? "current" : wasVisited ? "visited" : "idle"}>
            <title>
              {`${n.label}${n.mustSay ? " · verbatim compliance line" : ""}${n.exits.length ? ` · can end: ${n.exits.map((x) => x.label).join(", ")}` : ""}`}
            </title>
            <rect
              x={p.x}
              y={p.y}
              width={NODE_W}
              height={NODE_H}
              rx={8}
              fill={isCurrent ? "color-mix(in srgb, var(--accent) 22%, #000)" : wasVisited ? "color-mix(in srgb, var(--accent) 7%, #0a0a0a)" : "#0a0a0a"}
              stroke={isCurrent ? "var(--accent)" : wasVisited ? "color-mix(in srgb, var(--accent) 55%, transparent)" : "#27272a"}
              strokeWidth={isCurrent ? 1.6 : 1}
              style={isCurrent ? { filter: "drop-shadow(0 0 6px rgba(43,255,232,0.55))" } : undefined}
            />
            <text
              x={p.x + NODE_W / 2}
              y={p.y + NODE_H / 2 + 3.5}
              textAnchor="middle"
              fontSize={10}
              fontFamily="var(--font-jetbrains-mono), monospace"
              fill={isCurrent ? "var(--accent)" : wasVisited ? "#d4d4d8" : "#71717a"}
            >
              {shortLabel(n.label)}
            </text>
            {n.mustSay ? <circle cx={p.x + 7} cy={p.y + 7} r={2.2} fill="#fbbf24" /> : null}
            {n.exits.length ? (
              <circle
                cx={p.x + NODE_W - 7}
                cy={p.y + 7}
                r={2.4}
                fill={isCurrent && ended ? "var(--accent)" : "none"}
                stroke={isCurrent && ended ? "var(--accent)" : "#52525b"}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
