export type StepId =
  | "intro"
  | "genres"
  | "mood"
  | "era"
  | "region"
  | "artists"
  | "albums"
  | "recommendations"
  | "voice"
  | "photo"
  | "contact"
  | "done";

export type AnswerRow = {
  question: string;
  answer: string;
};

export type MediaPayload = {
  filename: string;
  mimeType: string;
  base64: string;
  sizeBytes: number;
  durationSeconds?: number;
} | null;

export type TrackRecommendation = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: string | null;
  genre?: string;
  why: string;
  previewUrl?: string | null;
};

export const GENRE_OPTIONS = [
  "Pop",
  "Hip-hop / Rap",
  "R&B / Soul",
  "Afrobeats",
  "Rock / Alt",
  "Electronic / Dance",
  "Country / Folk",
  "Jazz / Blues",
  "Gospel / Worship",
  "Latin",
  "Other / Hybrid",
] as const;

export const MOOD_OPTIONS = [
  "Upbeat / energetic",
  "Chill / late-night",
  "Emotional / confessional",
  "Dancefloor",
  "Storytelling",
] as const;

export const ERA_OPTIONS = ["2020s current", "2010s", "2000s", "90s & earlier"] as const;

export const REGION_OPTIONS = [
  "North America",
  "UK / Ireland",
  "Afrobeats / Africa diaspora",
  "Latin America / Spain",
  "Global mix",
] as const;

export const STEP_ORDER: StepId[] = [
  "intro",
  "genres",
  "mood",
  "era",
  "region",
  "artists",
  "albums",
  "recommendations",
  "voice",
  "photo",
  "contact",
  "done",
];

export const STEP_PROMPTS: Record<StepId, string> = {
  intro:
    "Welcome to IkoArtist. Almost anonymous, no account needed. An agentic system produces songs and cycles stronger ones into the player. Click a short taste path so we can make one in your direction — more answers → better match, then 3 track leans. Finish without email anytime; leave email only for opportunity follow-ups. No live auto Suno spend on this page.",
  genres: "Which genres feel closest to you? Tap any that fit.",
  mood: "What mood should the song lean toward?",
  era: "Which era should we weight?",
  region: "Any geo-ish lean? Soft signal only.",
  artists: "Tap related artists that resonate. Options branch from your genres.",
  albums: "Any albums / projects that feel right? Tap a few.",
  recommendations:
    "Here are 3 track leans from your clicks — a taste signal for the agentic song pipeline. Finish anonymously now (path still gets a song made), or optionally leave voice / photo / email for opportunities.",
  voice:
    "Optional: record a short voice sample (about 15–30 seconds). Skip anytime — not required to participate.",
  photo: "Optional: upload a photo (headshot or vibe). Skip anytime.",
  contact:
    "Optional: leave an email only if you want opportunity follow-ups. Anonymous is fine — your path still feeds the agentic pipeline.",
  done: "You're in. Your taste path and 3 leans are in the agentic song pipeline. Stay anonymous, or check back — no account required.",
};

export const QUESTION_LABELS: Partial<Record<StepId, string>> = {
  genres: "Genres",
  mood: "Mood",
  era: "Era",
  region: "Region / geo-ish",
  artists: "Related artists",
  albums: "Related albums",
  recommendations: "Suggested track leans",
  voice: "Voice sample",
  photo: "Photo",
  contact: "Contact (optional)",
};

export const MAX_VOICE_BYTES = 1_800_000;
export const MAX_PHOTO_BYTES = 1_200_000;
export const MAX_RECORD_SECONDS = 45;
