export type StepId =
  | "intro"
  | "genres"
  | "favorites"
  | "age"
  | "location"
  | "tastes"
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

export const AGE_OPTIONS = ["Under 18", "18–24", "25–34", "35–44", "45+"] as const;

export const STEP_ORDER: StepId[] = [
  "intro",
  "genres",
  "favorites",
  "age",
  "location",
  "tastes",
  "voice",
  "photo",
  "contact",
  "done",
];

export const STEP_PROMPTS: Record<StepId, string> = {
  intro:
    "Welcome — this intake is free to start. Answer what you want; everything is skippable. The more you share, the better the fit when Shawn reviews. This is not live Suno/ElevenLabs/Gemini generation or auto star-potential scoring yet — your answers go to Shawn for review before any costed agentic work.",
  genres: "Which genres feel closest to your sound? Pick any that fit, or type your own.",
  favorites: "Favorite artists or songs that shape your taste? A short list is perfect.",
  age: "Age category (optional — helps with taste and trend context, not gatekeeping).",
  location: "Where are you based? City / region / country helps with local trend context.",
  tastes:
    "Anything else about your taste, vibe, goals, or career hopes? Skip if you prefer.",
  voice:
    "Optional: record a short voice sample in the browser (about 15–30 seconds). Skip if you are not ready.",
  photo: "Optional: upload a photo (headshot or vibe shot). Skip anytime.",
  contact:
    "How can Shawn reach you? Email is most useful; name helps; phone is optional. Contact is encouraged so he can follow up.",
  done: "Thanks — your intake was sent for Shawn’s review. Active artist representation comes after approval; nothing costed runs until then.",
};

export const QUESTION_LABELS: Partial<Record<StepId, string>> = {
  genres: "Genres",
  favorites: "Favorite artists / songs",
  age: "Age category",
  location: "Location / geo",
  tastes: "Tastes / goals",
  voice: "Voice sample",
  photo: "Photo",
  contact: "Contact",
};

export const MAX_VOICE_BYTES = 1_800_000;
export const MAX_PHOTO_BYTES = 1_200_000;
export const MAX_RECORD_SECONDS = 45;
