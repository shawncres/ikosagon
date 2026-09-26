import fs from "node:fs/promises";
import path from "node:path";
import type { GenreBucket, MusicCatalog } from "@/lib/music/types";

const SEED_PATH = path.join(process.cwd(), "data", "music-catalog.json");
const SEED_DIR = path.join(process.cwd(), "data", "music-catalog");

type SeedMeta = {
  asOf: string;
  source: string;
  moods: string[];
  eras: string[];
  regions: string[];
  musicBrainzNote?: string;
  genreFiles: Record<string, string>;
  genres?: Record<string, GenreBucket>;
};

export async function loadSeedCatalog(): Promise<MusicCatalog> {
  const raw = await fs.readFile(SEED_PATH, "utf8");
  const parsed = JSON.parse(raw) as SeedMeta;
  if (!parsed.asOf) {
    throw new Error("Invalid music catalog seed.");
  }

  if (parsed.genres && Object.keys(parsed.genres).length) {
    return {
      asOf: parsed.asOf,
      source: parsed.source,
      moods: parsed.moods || [],
      eras: parsed.eras || [],
      regions: parsed.regions || [],
      musicBrainzNote: parsed.musicBrainzNote,
      genres: parsed.genres,
    };
  }

  if (!parsed.genreFiles || !Object.keys(parsed.genreFiles).length) {
    throw new Error("Invalid music catalog seed — missing genre files.");
  }

  const genres: Record<string, GenreBucket> = {};
  await Promise.all(
    Object.entries(parsed.genreFiles).map(async ([genre, file]) => {
      const bucketRaw = await fs.readFile(path.join(SEED_DIR, file), "utf8");
      genres[genre] = JSON.parse(bucketRaw) as GenreBucket;
    }),
  );

  return {
    asOf: parsed.asOf,
    source: parsed.source,
    moods: parsed.moods || [],
    eras: parsed.eras || [],
    regions: parsed.regions || [],
    musicBrainzNote: parsed.musicBrainzNote,
    genres,
  };
}
