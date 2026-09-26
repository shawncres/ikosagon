import fs from "node:fs/promises";
import path from "node:path";
import type { MusicCatalog } from "@/lib/music/types";

const SEED_PATH = path.join(process.cwd(), "data", "music-catalog.json");

export async function loadSeedCatalog(): Promise<MusicCatalog> {
  const raw = await fs.readFile(SEED_PATH, "utf8");
  const parsed = JSON.parse(raw) as MusicCatalog;
  if (!parsed.asOf || !parsed.genres) {
    throw new Error("Invalid music catalog seed.");
  }
  return parsed;
}
