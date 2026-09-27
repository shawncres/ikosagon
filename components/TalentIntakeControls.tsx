"use client";
import type { RefObject } from "react";
import { Camera, Mic, MicOff, SkipForward, Upload } from "lucide-react";
import {
  ERA_OPTIONS,
  GENRE_OPTIONS,
  MOOD_OPTIONS,
  REGION_OPTIONS,
  type MediaPayload,
  type StepId,
  type TrackRecommendation,
} from "@/components/talentIntakeConfig";
type Contact = { name: string; email: string; phone: string };
function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? "border-accent/60 bg-accent/15 text-accent"
          : "border-border text-zinc-300 hover:border-accent/40"
      }`}
    >
      {label}
    </button>
  );
}
function SkipButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-sm text-zinc-300 hover:border-accent/40 disabled:opacity-50"
    >
      <SkipForward className="h-4 w-4" /> Skip
    </button>
  );
}
const btn =
  "rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-50";
const btnGhost =
  "rounded-xl border border-border px-4 py-2 text-sm text-zinc-300 hover:border-accent/40 disabled:opacity-50";
export type TalentIntakeControlsProps = {
  step: StepId;
  submitted: boolean;
  pending: boolean;
  loadingRecs: boolean;
  selectedGenres: string[];
  selectedMood: string | null;
  selectedEra: string | null;
  selectedRegion: string | null;
  selectedArtists: string[];
  selectedAlbums: string[];
  artistOptions: string[];
  albumOptions: Array<{ label: string; album: string }>;
  recommendations: TrackRecommendation[];
  catalogAsOf: string | null;
  contact: Contact;
  voice: MediaPayload;
  photo: MediaPayload;
  recording: boolean;
  recordSeconds: number;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onContactChange: (next: Contact) => void;
  onToggleGenre: (genre: string) => void;
  onToggleArtist: (artist: string) => void;
  onToggleAlbum: (album: string) => void;
  onAdvanceFromIntro: () => void;
  onSkip: () => void;
  onSubmitGenres: () => void;
  onSubmitMood: (value?: string) => void;
  onSubmitEra: (value?: string) => void;
  onSubmitRegion: (value?: string) => void;
  onSubmitArtists: () => void;
  onSubmitAlbums: () => void;
  onContinueAfterRecs: () => void;
  onFinishAnonymous: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onConfirmVoice: () => void;
  onPhotoSelected: (file: File | null) => void;
  onConfirmPhoto: () => void;
  onSubmitIntake: () => void;
  onSubmitContactSkip: () => void;
};
export function TalentIntakeControls(p: TalentIntakeControlsProps) {
  if (p.submitted || p.step === "done") {
    return (
      <p className="text-sm text-zinc-400">
        Optional follow-up anytime via{" "}
        <a href="/contact" className="text-accent hover:underline">
          /contact
        </a>
        . No account required to have participated.
      </p>
    );
  }
  if (p.step === "intro") {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={p.onAdvanceFromIntro} className={btn.replace("text-sm ", "")}>
          Start - no account needed
        </button>
        <SkipButton onClick={p.onSkip} />
      </div>
    );
  }
  if (p.step === "genres") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Genre options">
          {GENRE_OPTIONS.map((g) => (
            <Chip key={g} label={g} active={p.selectedGenres.includes(g)} onClick={() => p.onToggleGenre(g)} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={p.onSubmitGenres} className={btn}>
            Continue
          </button>
          <SkipButton onClick={p.onSkip} />
        </div>
      </div>
    );
  }
  if (p.step === "mood") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Mood options">
          {MOOD_OPTIONS.map((m) => (
            <Chip key={m} label={m} active={p.selectedMood === m} onClick={() => p.onSubmitMood(m)} />
          ))}
        </div>
        <SkipButton onClick={p.onSkip} />
      </div>
    );
  }
  if (p.step === "era") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Era options">
          {ERA_OPTIONS.map((e) => (
            <Chip key={e} label={e} active={p.selectedEra === e} onClick={() => p.onSubmitEra(e)} />
          ))}
        </div>
        <SkipButton onClick={p.onSkip} />
      </div>
    );
  }
  if (p.step === "region") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Region options">
          {REGION_OPTIONS.map((r) => (
            <Chip key={r} label={r} active={p.selectedRegion === r} onClick={() => p.onSubmitRegion(r)} />
          ))}
        </div>
        <SkipButton onClick={p.onSkip} />
      </div>
    );
  }
  if (p.step === "artists") {
    const opts = p.artistOptions.length ? p.artistOptions : ["Catalog loading..."];
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Artist options">
          {opts.map((a) => (
            <Chip
              key={a}
              label={a}
              active={p.selectedArtists.includes(a)}
              onClick={() => {
                if (a !== "Catalog loading...") p.onToggleArtist(a);
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={p.onSubmitArtists} className={btn}>
            Continue
          </button>
          <SkipButton onClick={p.onSkip} />
        </div>
      </div>
    );
  }
  if (p.step === "albums") {
    const opts = p.albumOptions.length
      ? p.albumOptions
      : [{ label: "Catalog loading...", album: "__loading__" }];
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Album options">
          {opts.map((row) => (
            <Chip
              key={row.label}
              label={row.label}
              active={p.selectedAlbums.includes(row.album)}
              onClick={() => {
                if (row.album !== "__loading__") p.onToggleAlbum(row.album);
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={p.loadingRecs} onClick={p.onSubmitAlbums} className={btn}>
            {p.loadingRecs ? "Matching..." : "Show 3 track leans"}
          </button>
          <SkipButton onClick={p.onSkip} disabled={p.loadingRecs} />
        </div>
      </div>
    );
  }
  if (p.step === "recommendations") {
    return (
      <div className="space-y-3">
        {p.loadingRecs ? (
          <p className="text-sm text-zinc-400">Scoring your click path against the catalog...</p>
        ) : (
          <ul className="space-y-2">
            {p.recommendations.map((pick, i) => (
              <li key={pick.id} className="rounded-xl border border-border/80 bg-black/30 px-3 py-2 text-sm">
                <p className="font-medium text-zinc-100">
                  {i + 1}. {pick.title} <span className="text-zinc-400">- {pick.artist}</span>
                </p>
                <p className="mt-1 text-xs text-accent">Why: {pick.why}</p>
                {pick.album ? (
                  <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
                    {pick.album}
                    {pick.year ? ` | ${pick.year}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {p.catalogAsOf ? (
          <p className="font-mono text-[10px] text-zinc-500">Catalog as of {p.catalogAsOf}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={p.loadingRecs || p.pending}
            onClick={p.onFinishAnonymous}
            className={btn}
          >
            {p.pending ? "Sending..." : "Finish anonymously"}
          </button>
          <button
            type="button"
            disabled={p.loadingRecs || p.pending}
            onClick={p.onContinueAfterRecs}
            className={btnGhost}
          >
            Optional voice / photo / email
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Anonymous is fine — your path + 3 leans still feed the agentic pipeline so a song can get
          made. Leave email only if you want opportunity follow-ups.
        </p>
      </div>
    );
  }
  if (p.step === "voice") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {!p.recording ? (
            <button type="button" onClick={p.onStartRecording} className={`inline-flex items-center gap-2 ${btn}`}>
              <Mic className="h-4 w-4" /> Record short clip
            </button>
          ) : (
            <button
              type="button"
              onClick={p.onStopRecording}
              className="inline-flex items-center gap-2 rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-2 text-sm text-red-200"
            >
              <MicOff className="h-4 w-4" /> Stop ({p.recordSeconds}s)
            </button>
          )}
          {p.voice ? (
            <button type="button" onClick={p.onConfirmVoice} className="rounded-xl border border-accent/50 px-4 py-2 text-sm text-accent">
              Use this clip
            </button>
          ) : null}
          <SkipButton onClick={p.onSkip} />
        </div>
        <p className="text-xs text-zinc-500">
          Max ~45s. Clips over ~1.8 MB are noted in the email without attachment (Vercel Hobby limit).
        </p>
        {p.voice ? (
          <p className="font-mono text-xs text-accent" role="status">
            Ready: ~{p.voice.durationSeconds ?? "?"}s | {Math.round(p.voice.sizeBytes / 1024)} KB
            {p.voice.base64 ? "" : " | attach skipped"}
          </p>
        ) : null}
      </div>
    );
  }
  if (p.step === "photo") {
    return (
      <div className="space-y-3">
        <input
          ref={p.fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => p.onPhotoSelected(e.target.files?.[0] ?? null)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => p.fileInputRef.current?.click()}
            className={`inline-flex items-center gap-2 ${btn}`}
          >
            <Camera className="h-4 w-4" /> Choose photo
          </button>
          {p.photo ? (
            <button
              type="button"
              onClick={p.onConfirmPhoto}
              className="inline-flex items-center gap-2 rounded-xl border border-accent/50 px-4 py-2 text-sm text-accent"
            >
              <Upload className="h-4 w-4" /> Use this photo
            </button>
          ) : null}
          <SkipButton onClick={p.onSkip} />
        </div>
        <p className="text-xs text-zinc-500">
          Prefer under ~1.2 MB so Hobby email can attach. Larger files are noted without attach.
        </p>
        {p.photo ? (
          <p className="font-mono text-xs text-accent" role="status">
            {p.photo.filename} | {Math.round(p.photo.sizeBytes / 1024)} KB
            {p.photo.base64 ? "" : " | attach skipped"}
          </p>
        ) : null}
      </div>
    );
  }
  if (p.step === "contact") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">
          Email is optional (opportunities only). Finish anonymously anytime — your path still reaches
          the agentic song pipeline. You already have your 3 leans.
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          {(
            [
              ["Name", "name", "text", "name"],
              ["Email (optional | opportunities)", "email", "email", "email"],
              ["Phone (optional)", "phone", "tel", "tel"],
            ] as const
          ).map(([label, key, type, auto]) => (
            <label key={key} className="block text-sm">
              <span className="mb-1 block text-zinc-400">{label}</span>
              <input
                type={type}
                value={p.contact[key]}
                onChange={(e) => p.onContactChange({ ...p.contact, [key]: e.target.value })}
                className="w-full rounded-xl border border-border bg-black/40 px-3 py-2 outline-none focus:border-accent"
                autoComplete={auto}
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={p.pending} onClick={p.onSubmitIntake} className={btn}>
            {p.pending ? "Sending..." : "Send with email (optional follow-up)"}
          </button>
          <button
            type="button"
            disabled={p.pending}
            onClick={p.onSubmitContactSkip}
            className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-sm text-zinc-300 disabled:opacity-50"
          >
            <SkipForward className="h-4 w-4" /> Finish anonymously
          </button>
        </div>
      </div>
    );
  }
  return null;
}
