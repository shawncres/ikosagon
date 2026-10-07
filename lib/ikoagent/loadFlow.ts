import fs from "node:fs/promises";
import path from "node:path";
import type { Flow, FlowVertical } from "./types";

const FLOWS_DIR = path.join(process.cwd(), "content", "ikoagent", "flows");

const VERTICAL_TO_FILE: Record<FlowVertical, string> = {
  customer_service: "customer_service.json",
  collections: "collections.json",
  sales: "sales.json",
};

const FLOW_ID_ALIASES: Record<string, string> = {
  cs: "customer_service",
  customer_service: "customer_service",
  collections: "collections",
  sales: "sales",
};

export function resolveFlowFileName(flowId: string): string | null {
  const normalized = FLOW_ID_ALIASES[flowId] ?? flowId;
  if (normalized in VERTICAL_TO_FILE) {
    return VERTICAL_TO_FILE[normalized as FlowVertical];
  }
  // Allow loading by exact file stem
  if (/^[a-z0-9_-]+$/i.test(flowId)) return `${flowId}.json`;
  return null;
}

export async function listFlows(): Promise<Pick<Flow, "id" | "title" | "vertical" | "description">[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(FLOWS_DIR);
  } catch {
    return [];
  }
  const jsonFiles = entries.filter((name) => name.endsWith(".json"));
  const flows = await Promise.all(
    jsonFiles.map(async (name) => {
      const raw = await fs.readFile(path.join(FLOWS_DIR, name), "utf8");
      const flow = JSON.parse(raw) as Flow;
      return {
        id: flow.id,
        title: flow.title,
        vertical: flow.vertical,
        description: flow.description,
      };
    }),
  );
  return flows.sort((a, b) => a.title.localeCompare(b.title));
}

export async function loadFlow(flowId: string): Promise<Flow | null> {
  const fileName = resolveFlowFileName(flowId);
  if (!fileName) return null;
  try {
    const raw = await fs.readFile(path.join(FLOWS_DIR, fileName), "utf8");
    const flow = JSON.parse(raw) as Flow;
    if (!flow.id || !flow.start || !flow.nodes) return null;
    return flow;
  } catch {
    return null;
  }
}
