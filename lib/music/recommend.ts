import type { CatalogTrack, MusicCatalog, TasteProfile, TrackPick } from "@/lib/music/types";

const MOOD_BOOST: Record<string, string[]> = {
  "Upbeat / energetic": ["Pop", "Afrobeats", "Electronic / Dance", "Latin", "Hip-hop / Rap"],
  "Chill / late-night": ["R&B / Soul", "Jazz / Blues", "Other / Hybrid", "Electronic / Dance"],
  "Emotional / confessional": ["Pop", "R&B / Soul", "Country / Folk", "Other / Hybrid", "Gospel / Worship"],
  Dancefloor: ["Electronic / Dance", "Afrobeats", "Latin", "Pop", "Hip-hop / Rap"],
  Storytelling: ["Country / Folk", "Hip-hop / Rap", "Rock / Alt", "Gospel / Worship", "Jazz / Blues"],
};

const REGION_BOOST: Record<string, string[]> = {
  "North America": ["Hip-hop / Rap", "Pop", "Country / Folk", "R&B / Soul", "Rock / Alt"],
  "UK / Ireland": ["Pop", "Electronic / Dance", "Rock / Alt", "Other / Hybrid"],
  "Afrobeats / Africa diaspora": ["Afrobeats", "R&B / Soul", "Gospel / Worship"],
  "Latin America / Spain": ["Latin", "Pop", "Electronic / Dance"],
  "Global mix": [],
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function scoreTrack(track: CatalogTrack, profile: TasteProfile): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const genreSet = new Set(profile.genres.map(normalize));
  const artistSet = new Set(profile.artists.map(normalize));
  const albumSet = new Set(profile.albums.map(normalize));

  if (genreSet.has(normalize(track.genre))) {
    score += 40;
    reasons.push(`matches your ${track.genre} pick`);
  } else if (profile.genres.length === 0) {
    score += 5;
  } else {
    score -= 20;
  }

  if (artistSet.has(normalize(track.artist))) {
    score += 35;
    reasons.push(`from ${track.artist}, who you clicked`);
  }

  if (track.album && albumSet.has(normalize(track.album))) {
    score += 25;
    reasons.push(`off ${track.album}`);
  }

  if (profile.era && (track.tags || []).includes(profile.era)) {
    score += 18;
    reasons.push(`fits your ${profile.era} era`);
  } else if (profile.era && track.year) {
    const year = Number(track.year);
    if (profile.era === "2020s current" && year >= 2020) {
      score += 14;
      reasons.push("recent release for your 2020s lean");
    } else if (profile.era === "2010s" && year >= 2010 && year < 2020) {
      score += 14;
      reasons.push("lands in your 2010s window");
    } else if (profile.era === "2000s" && year >= 2000 && year < 2010) {
      score += 14;
      reasons.push("lands in your 2000s window");
    } else if (profile.era === "90s & earlier" && year < 2000) {
      score += 14;
      reasons.push("classic-leaning for your era pick");
    }
  }

  if (profile.mood) {
    const boostGenres = MOOD_BOOST[profile.mood] || [];
    if (boostGenres.some((g) => normalize(g) === normalize(track.genre))) {
      score += 12;
      reasons.push(`pairs with a ${profile.mood.toLowerCase()} mood`);
    }
  }

  if (profile.region) {
    const boostGenres = REGION_BOOST[profile.region] || [];
    if (!boostGenres.length) {
      score += 4;
    } else if (boostGenres.some((g) => normalize(g) === normalize(track.genre))) {
      score += 10;
      reasons.push(`geo-ish lean toward ${profile.region}`);
    }
  }

  let hash = 0;
  for (let i = 0; i < track.id.length; i += 1) hash = (hash + track.id.charCodeAt(i) * (i + 1)) % 7;
  score += hash;

  return { score, reasons };
}

export function recommendTracks(catalog: MusicCatalog, profile: TasteProfile, limit = 3): TrackPick[] {
  const pool: CatalogTrack[] = [];
  const genres = profile.genres.length ? profile.genres : Object.keys(catalog.genres);

  for (const genre of genres) {
    const bucket = catalog.genres[genre];
    if (bucket?.tracks?.length) pool.push(...bucket.tracks);
  }

  if (!profile.genres.length) {
    for (const bucket of Object.values(catalog.genres)) {
      pool.push(...(bucket.tracks || []).slice(0, 4));
    }
  }

  const ranked = pool
    .map((track) => {
      const { score, reasons } = scoreTrack(track, profile);
      return { track, score, reasons };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  const picks: TrackPick[] = [];
  const usedArtists = new Set<string>();

  for (const row of ranked) {
    if (picks.length >= limit) break;
    const artistKey = normalize(row.track.artist);
    if (usedArtists.has(artistKey) && picks.length < limit && ranked.length > limit + 2) {
      continue;
    }
    usedArtists.add(artistKey);
    const why =
      row.reasons.slice(0, 2).join("; ") ||
      `aligned with your click path in ${row.track.genre}`;
    picks.push({
      id: row.track.id,
      title: row.track.title,
      artist: row.track.artist,
      album: row.track.album,
      year: row.track.year,
      genre: row.track.genre,
      why,
      previewUrl: row.track.previewUrl,
    });
  }

  if (!picks.length && pool.length) {
    for (const track of pool.slice(0, limit)) {
      picks.push({
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        year: track.year,
        genre: track.genre,
        why: `a starter pick from the ${track.genre} catalog`,
        previewUrl: track.previewUrl,
      });
    }
  }

  return picks;
}

export function artistsForGenres(catalog: MusicCatalog, genres: string[], limit = 16): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const keys = genres.length ? genres : Object.keys(catalog.genres);
  for (const genre of keys) {
    for (const artist of catalog.genres[genre]?.artists || []) {
      const key = normalize(artist.name);
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(artist.name);
      if (names.length >= limit) return names;
    }
  }
  return names;
}

export function albumsForSelection(
  catalog: MusicCatalog,
  genres: string[],
  artists: string[],
  limit = 14,
): { label: string; album: string; artist: string }[] {
  const artistSet = new Set(artists.map(normalize));
  const out: { label: string; album: string; artist: string }[] = [];
  const seen = new Set<string>();
  const keys = genres.length ? genres : Object.keys(catalog.genres);

  const pushAlbum = (album: string, artist: string) => {
    const key = `${normalize(album)}|${normalize(artist)}`;
    if (!album || seen.has(key)) return;
    seen.add(key);
    out.push({ label: `${album} — ${artist}`, album, artist });
  };

  for (const genre of keys) {
    const bucket = catalog.genres[genre];
    if (!bucket) continue;
    for (const album of bucket.albums || []) {
      if (artistSet.size && !artistSet.has(normalize(album.artist))) continue;
      pushAlbum(album.name, album.artist);
      if (out.length >= limit) return out;
    }
  }

  if (out.length < 6) {
    for (const genre of keys) {
      for (const album of catalog.genres[genre]?.albums || []) {
        pushAlbum(album.name, album.artist);
        if (out.length >= limit) return out;
      }
    }
  }

  return out;
}
