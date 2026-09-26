import type { CatalogTrack, MusicCatalog } from "@/lib/music/types";

const FETCH_MS = 4500;
const MIN_REFRESH_GAP_MS = 60_000;
const UA = "IkosagonMusicCatalog/1.0 (https://ikosagon.com; shawn@ikosagon.com)";

type RateState = { lastAt: number };
const g = globalThis as typeof globalThis & { __ikosagonMusicRefresh?: RateState };
function rateState(): RateState {
  if (!g.__ikosagonMusicRefresh) g.__ikosagonMusicRefresh = { lastAt: 0 };
  return g.__ikosagonMusicRefresh;
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function yearTag(year: string | null | undefined): string | undefined {
  if (!year) return undefined;
  const y = Number(year);
  if (!Number.isFinite(y)) return undefined;
  if (y >= 2020) return "2020s current";
  if (y >= 2010) return "2010s";
  if (y >= 2000) return "2000s";
  return "90s & earlier";
}

type ItunesResult = {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  primaryGenreName?: string;
  releaseDate?: string;
  previewUrl?: string;
};

export async function maybeLiveRefresh(
  seed: MusicCatalog,
  genreHint?: string,
): Promise<MusicCatalog> {
  const state = rateState();
  const now = Date.now();
  if (now - state.lastAt < MIN_REFRESH_GAP_MS) {
    return {
      ...seed,
      liveRefreshed: false,
      liveNote: `Live refresh rate-limited; serving seed as of ${seed.asOf}.`,
    };
  }
  state.lastAt = now;

  const genre =
    genreHint && seed.genres[genreHint] ? genreHint : Object.keys(seed.genres)[0] || "Pop";
  const term = encodeURIComponent(genre.split("/")[0].trim());
  const itunesUrl = `https://itunes.apple.com/search?term=${term}&entity=song&limit=12`;
  const itunes = (await fetchJson(itunesUrl)) as { results?: ItunesResult[] } | null;

  const notes: string[] = [];
  const next: MusicCatalog = structuredClone(seed);
  next.liveRefreshed = false;

  if (itunes?.results?.length) {
    const bucket = next.genres[genre] || {
      artists: [],
      albums: [],
      tracks: [],
    };
    const existing = new Set(
      bucket.tracks.map((t) => `${t.title.toLowerCase()}|${t.artist.toLowerCase()}`),
    );
    let added = 0;
    for (const row of itunes.results) {
      if (row.wrapperType !== "track" || row.kind !== "song") continue;
      const title = row.trackName?.trim();
      const artist = row.artistName?.trim();
      if (!title || !artist) continue;
      const key = `${title.toLowerCase()}|${artist.toLowerCase()}`;
      if (existing.has(key)) continue;
      existing.add(key);
      const year = row.releaseDate ? row.releaseDate.slice(0, 4) : null;
      const tag = yearTag(year);
      const track: CatalogTrack = {
        id: `it-live-${row.trackId || `${title}-${artist}`}`,
        title,
        artist,
        album: row.collectionName || "",
        genre,
        primaryGenre: row.primaryGenreName || genre,
        year,
        previewUrl: row.previewUrl || null,
        tags: tag ? [tag] : [],
      };
      bucket.tracks = [track, ...bucket.tracks].slice(0, 28);
      if (row.collectionName) {
        const albumKey = `${row.collectionName}|${artist}`;
        if (!bucket.albums.some((a) => `${a.name}|${a.artist}` === albumKey)) {
          bucket.albums = [{ name: row.collectionName, artist, year }, ...bucket.albums].slice(0, 14);
        }
      }
      if (!bucket.artists.some((a) => a.name.toLowerCase() === artist.toLowerCase())) {
        bucket.artists = [
          { name: artist, albums: row.collectionName ? [row.collectionName] : [], relatedGenres: [genre] },
          ...bucket.artists,
        ].slice(0, 16);
      }
      added += 1;
      if (added >= 8) break;
    }
    next.genres[genre] = bucket;
    next.asOf = new Date().toISOString().slice(0, 10);
    next.liveRefreshed = true;
    notes.push(`iTunes Search refreshed ${added} ${genre} track(s).`);
  } else {
    notes.push("iTunes live query skipped or failed; seed catalog used.");
  }

  const mbQuery = encodeURIComponent(`tag:${genre.split("/")[0].trim().toLowerCase()}`);
  const mbUrl = `https://musicbrainz.org/ws/2/artist?query=${mbQuery}&fmt=json&limit=5`;
  const mb = (await fetchJson(mbUrl)) as {
    artists?: Array<{ name?: string; country?: string; tags?: Array<{ name?: string }> }>;
  } | null;
  if (mb?.artists?.length) {
    const bucket = next.genres[genre];
    if (bucket) {
      for (const artist of mb.artists) {
        const name = artist.name?.trim();
        if (!name) continue;
        if (bucket.artists.some((a) => a.name.toLowerCase() === name.toLowerCase())) continue;
        bucket.artists = [
          {
            name,
            albums: [],
            relatedGenres: [genre],
          },
          ...bucket.artists,
        ].slice(0, 16);
      }
    }
    notes.push(`MusicBrainz added artist names for ${genre}.`);
    next.liveRefreshed = true;
    next.asOf = new Date().toISOString().slice(0, 10);
  } else {
    notes.push("MusicBrainz live query unavailable; continuing with iTunes/seed.");
  }

  next.liveNote = notes.join(" ");
  next.source = `${seed.source} · live overlay attempted`;
  return next;
}
