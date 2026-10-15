import { getLastfm, type LastfmClient } from "./lastfm";
import { similarSeedIds } from "./taste/enrich";
import { seedArtist } from "./taste/seed";
import { customIdFor, sanitizeFreeText } from "./taste/sanitize";
import type { ArtistEnrichment } from "./taste/types";

export type EnrichTarget = { id: string; name: string };

/** Resolve ids + free-text names to Last.fm lookup targets. Seed ids use OUR seed name; free text is sanitized. Max 3. */
export function targetsFrom(ids: string[], customNames: string[]): EnrichTarget[] {
  const out: EnrichTarget[] = [];
  for (const id of ids) {
    const a = seedArtist(id);
    if (a && !out.some((t) => t.id === a.id)) out.push({ id: a.id, name: a.name });
  }
  for (const raw of customNames) {
    const name = sanitizeFreeText(raw, 60);
    if (name.length < 2) continue;
    const id = customIdFor(name);
    if (!out.some((t) => t.id === id)) out.push({ id, name });
  }
  return out.slice(0, 3);
}

export type EnrichOutcome = {
  /** False when no key is configured (the seed is used and no Last.fm credit is shown). */
  enabled: boolean;
  artists: Record<string, ArtistEnrichment>;
  /** Targets Last.fm could not supply (unknown artist, error, rate limit, or budget exceeded). */
  missing: string[];
};

/**
 * Look the targets up on Last.fm within a time budget. Anything that does not come back in time is simply
 * missing; the caller falls back to the editorial seed for those artists. Late results still land in the cache.
 */
export async function enrichTargets(
  targets: EnrichTarget[],
  opts: { client?: LastfmClient; budgetMs?: number } = {},
): Promise<EnrichOutcome> {
  const client = opts.client || getLastfm();
  if (!client.enabled) return { enabled: false, artists: {}, missing: targets.map((t) => t.id) };
  const budget = opts.budgetMs ?? 4000;
  const artists: Record<string, ArtistEnrichment> = {};
  const missing: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((r) => {
    timer = setTimeout(() => r("timeout"), budget);
  });
  await Promise.all(
    targets.map(async (t) => {
      const res = await Promise.race([client.enrich(t.name), timeout]);
      if (res === "timeout" || res.status !== "ok") {
        missing.push(t.id);
        return;
      }
      artists[t.id] = {
        ...res.data,
        id: t.id,
        similarSeedIds: similarSeedIds(res.data.similar, t.id),
      };
    }),
  );
  if (timer) clearTimeout(timer);
  return { enabled: true, artists, missing };
}
