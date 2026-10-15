/** IkoArtist taste-range types. Pure data shapes; no I/O. */

export const DIMS = ["energy", "acoustic", "lyric", "polish", "mainstream", "tempo"] as const;
export type Dim = (typeof DIMS)[number];
export type Vector = Record<Dim, number>;

export const THEME_IDS = [
  "heartbreak",
  "love",
  "hustle",
  "nostalgia",
  "faith",
  "party",
  "escapism",
  "social",
  "resilience",
  "rebellion",
  "introspection",
  "roots",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export type TrackRole = "signature hit" | "fan favorite" | "deep cut";

export type SeedTrack = {
  title: string;
  album: string;
  year: number;
  themes: ThemeId[];
  role: TrackRole;
  /** Optional per-track nudges where a track clearly differs from the artist's usual sound. */
  tweak?: Partial<Pick<Vector, "energy" | "tempo" | "acoustic">>;
};

export type SeedArtist = {
  id: string;
  name: string;
  genres: string[];
  region: string;
  /** Year the artist's sound is most associated with. */
  peak: number;
  vector: Vector;
  tracks: SeedTrack[];
};

export type Level = "low" | "mid" | "high" | "any";

export type ContrastChoice = { dim: Dim; favors: string } | null;

export const AUDIENCE_AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55+", "Prefer not to say"] as const;
export const AUDIENCE_REGIONS = [
  "North America",
  "Europe",
  "Africa",
  "Latin America",
  "Asia-Pacific",
  "Middle East",
  "Mixed / everywhere",
] as const;
export const AUDIENCE_LANGUAGES = [
  "English",
  "Spanish",
  "Portuguese",
  "French",
  "Pidgin / West African languages",
  "Hindi / Urdu",
  "Arabic",
  "Korean / Japanese",
  "Instrumental / no preference",
  "Other",
] as const;
export const AUDIENCE_CONTEXTS = [
  "Commute",
  "Gym / run",
  "Work / study",
  "Late night",
  "Party / social",
  "Chill at home",
  "Road trip",
] as const;

export type Audience = {
  ageBand: string | null;
  region: string | null;
  languages: string[];
  contexts: string[];
};

export const EXTRA_KEYS = [
  "genres",
  "anchor",
  "sound",
  "second",
  "third",
  "contrast",
  "themes",
  "audience",
  "final",
] as const;
export type ExtraKey = (typeof EXTRA_KEYS)[number];
export type Extras = Partial<Record<ExtraKey, string>>;

export type CustomArtist = {
  id: string;
  name: string;
  vector: Vector;
  peak: number;
  tags: string[];
};

/** Everything the visitor chose. This is the only input to buildBrief. */
export type ProfileInput = {
  genres: string[];
  era: string | null;
  region: string | null;
  artistIds: string[];
  answers: Partial<Record<Dim, Level>>;
  contrast: ContrastChoice;
  themes: string[];
  audience: Audience | null;
  extras: Extras;
  custom: CustomArtist[];
};

export type TrendingContext = {
  asOf: string;
  source: string;
  matched: number;
  total: number;
  themes: Array<{ theme: ThemeId; artists: number }>;
  genreMix: Array<{ genre: string; count: number }>;
  note: string;
};

export type Lean = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: string | null;
  genre?: string;
  why: string;
  kind: "overlap" | "edge-high" | "edge-low";
  trackRole: TrackRole;
  themes: ThemeId[];
  /** Our editorial assumption of the artist's best tracks, not stream data. */
  assumed: true;
};

export type SongBrief = {
  version: 1;
  asOf: string;
  artists: Array<{ id: string; name: string; custom: boolean; themes: ThemeId[] }>;
  center: { vector: Vector; eraYear: number | null; summary: string };
  range: {
    spread: number;
    label: "single anchor" | "tight" | "balanced" | "wide";
    perDim: Array<{ dim: Dim; min: number; max: number }>;
    widest: Dim | null;
    summary: string;
  };
  themes: {
    chosen: ThemeId[];
    fromArtists: Array<{ theme: ThemeId; count: number }>;
    overlap: ThemeId[];
    blend: ThemeId[];
    trending: TrendingContext | null;
  };
  audience: Audience | null;
  leans: Lean[];
  notes: Extras;
  caveats: string[];
};
