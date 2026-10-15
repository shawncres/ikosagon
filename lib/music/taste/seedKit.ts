import type { SeedArtist, SeedTrack, ThemeId, TrackRole } from "./types";
import { vec } from "./vector";

export type T = [title: string, album: string, year: number | null, themes: string, tweak?: SeedTrack["tweak"]];
const ROLES: TrackRole[] = ["signature hit", "fan favorite", "deep cut"];

export function A(
  id: string,
  name: string,
  genres: string[],
  region: string,
  peak: number,
  v: [number, number, number, number, number, number],
  tracks: [T, T, T],
): SeedArtist {
  return {
    id,
    name,
    genres,
    region,
    peak,
    vector: vec(...v),
    tracks: tracks.map(([title, album, year, themes, tweak], i) => ({
      title,
      album,
      year,
      themes: themes.split(",") as ThemeId[],
      role: ROLES[i],
      ...(tweak ? { tweak } : {}),
    })),
  };
}

export const NA = "North America";
export const UK = "UK / Ireland";
export const AF = "Afrobeats / Africa diaspora";
export const LA = "Latin America / Spain";
export const GM = "Global mix";

