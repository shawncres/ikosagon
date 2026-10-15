export type StepId =
  | "intro"
  | "genres"
  | "era"
  | "region"
  | "anchor"
  | "sound"
  | "second"
  | "third"
  | "contrast"
  | "themes"
  | "audience"
  | "brief"
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
  "era",
  "region",
  "anchor",
  "sound",
  "second",
  "third",
  "contrast",
  "themes",
  "audience",
  "brief",
  "voice",
  "photo",
  "contact",
  "done",
];

export const STEP_PROMPTS: Record<StepId, string> = {
  intro:
    "Welcome to IkoArtist. No account needed — we at Ikosagon build a song brief from your clicks: three favorite artists (the sound), the themes you gravitate toward, and, if you want, who it’s for. Tap answers; every step has an optional “add your own” and a skip. The agentic Ikosagon engine produces the hit over time (curated choices + adapting processes); results compete on a view-ranked leaderboard playlist. Finish without email anytime.",
  genres: "Which genres feel closest to you? Tap any that fit.",
  era: "Which era should we weight?",
  region: "Any geo-ish lean? Soft signal only.",
  anchor: "Pick the ONE artist whose sound is closest to the song you’d want. Start with the strongest pull.",
  sound: "A few quick questions about what that pick can’t explain on its own.",
  second: "Now a second artist. Some are close to your first pick, some a step away.",
  third: "A third artist — this time we reach further out so your range has some width.",
  contrast: "What do two of your picks do differently? Tap the part you’d want in your song.",
  themes: "What do you want the song to be about? Tap up to four themes.",
  audience:
    "Optional: who is this for? Coarse bands only — skip the whole step if you like.",
  brief:
    "Here’s your song brief: where your sound centers, how wide your range is, your themes, and three track leans with a reason for each. Finish anonymously to send it to the song pipeline, or add optional voice / photo / email.",
  voice:
    "Optional: record a short voice sample (about 15–30 seconds). Skip anytime — not required to participate.",
  photo: "Optional: upload a photo (headshot or vibe). Skip anytime.",
  contact:
    "Optional: leave an email only if you want opportunity follow-ups. Anonymous is fine — your brief still feeds the agentic Ikosagon engine.",
  done: "You’re in. Your song brief is with the agentic Ikosagon engine — it takes some time to produce the hit. Stay anonymous, or check back on the view-ranked leaderboard. No account required.",
};

export const QUESTION_LABELS: Partial<Record<StepId, string>> = {
  genres: "Genres",
  era: "Era",
  region: "Region / geo-ish",
  anchor: "Anchor artist",
  second: "Second artist",
  third: "Third artist",
  contrast: "Contrast",
  themes: "Lyrical themes",
  voice: "Voice sample",
  photo: "Photo",
  contact: "Contact (optional)",
};

export const MAX_VOICE_BYTES = 1_800_000;
export const MAX_PHOTO_BYTES = 1_200_000;
export const MAX_RECORD_SECONDS = 45;
