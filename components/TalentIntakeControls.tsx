"use client";
import { useRef } from "react";
import { Camera, Mic, MicOff, SkipForward, Upload } from "lucide-react";
import { AddYourOwn } from "@/components/AddYourOwn";
import { TasteSteps } from "@/components/TasteSteps";
import { btn, Chip, SkipButton } from "@/components/talentIntakeUi";
import {
  ERA_OPTIONS,
  GENRE_OPTIONS,
  REGION_OPTIONS,
  type MediaPayload,
  type StepId,
} from "@/components/talentIntakeConfig";
import type { TasteApi } from "@/components/useTasteProfile";
type Contact = { name: string; email: string; phone: string };
export type TalentIntakeControlsProps = {
  step: StepId;
  submitted: boolean;
  pending: boolean;
  selectedGenres: string[];
  selectedEra: string | null;
  selectedRegion: string | null;
  taste: TasteApi;
  contact: Contact;
  voice: MediaPayload;
  photo: MediaPayload;
  recording: boolean;
  recordSeconds: number;
  onContactChange: (next: Contact) => void;
  onToggleGenre: (genre: string) => void;
  onAdvanceFromIntro: () => void;
  onSkip: () => void;
  onSubmitGenres: () => void;
  onSubmitEra: (value: string) => void;
  onSubmitRegion: (value: string) => void;
  onContinueAfterBrief: () => void;
  onFinishAnonymous: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onConfirmVoice: () => void;
  onPhotoSelected: (file: File | null) => void;
  onConfirmPhoto: () => void;
  onSubmitIntake: () => void;
  onSubmitContactSkip: () => void;
};
function PhotoStep({
  photo,
  onPhotoSelected,
  onConfirmPhoto,
  onSkip,
}: {
  photo: MediaPayload;
  onPhotoSelected: (file: File | null) => void;
  onConfirmPhoto: () => void;
  onSkip: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => onPhotoSelected(e.target.files?.[0] ?? null)}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`inline-flex items-center gap-2 ${btn}`}
        >
          <Camera className="h-4 w-4" /> Choose photo
        </button>
        {photo ? (
          <button
            type="button"
            onClick={onConfirmPhoto}
            className="inline-flex items-center gap-2 rounded-xl border border-accent/50 px-4 py-2 text-sm text-accent"
          >
            <Upload className="h-4 w-4" /> Use this photo
          </button>
        ) : null}
        <SkipButton onClick={onSkip} />
      </div>
      <p className="text-xs text-zinc-500">
        Prefer under ~1.2 MB so Hobby email can attach. Larger files are noted without attach.
      </p>
      {photo ? (
        <p className="font-mono text-xs text-accent" role="status">
          {photo.filename} | {Math.round(photo.sizeBytes / 1024)} KB
          {photo.base64 ? "" : " | attach skipped"}
        </p>
      ) : null}
    </div>
  );
}

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
        <AddYourOwn
          stepKey="genres"
          value={p.taste.extras.genres || ""}
          onChange={p.taste.setExtra}
          label="Another genre"
          placeholder="e.g. highlife, bossa nova"
        />
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
  if (["anchor", "sound", "second", "third", "contrast", "themes", "audience", "brief"].includes(p.step)) {
    return (
      <TasteSteps
        step={p.step}
        taste={p.taste}
        pending={p.pending}
        onSkip={p.onSkip}
        onFinishAnonymous={p.onFinishAnonymous}
        onContinueAfterBrief={p.onContinueAfterBrief}
      />
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
      <PhotoStep
        photo={p.photo}
        onPhotoSelected={p.onPhotoSelected}
        onConfirmPhoto={p.onConfirmPhoto}
        onSkip={p.onSkip}
      />
    );
  }
  if (p.step === "contact") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">
          Email is optional (opportunities only). Finish anonymously anytime — your path still reaches
          the agentic Ikosagon engine. You already have your song brief.
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
