"use client";

import type { RefObject } from "react";
import { Camera, Mic, MicOff, SkipForward, Upload } from "lucide-react";
import { AGE_OPTIONS, GENRE_OPTIONS, type MediaPayload, type StepId } from "@/components/talentIntakeConfig";

type Contact = { name: string; email: string; phone: string };

export type TalentIntakeControlsProps = {
  step: StepId;
  submitted: boolean;
  pending: boolean;
  selectedGenres: string[];
  textInput: string;
  contact: Contact;
  voice: MediaPayload;
  photo: MediaPayload;
  recording: boolean;
  recordSeconds: number;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onTextInput: (value: string) => void;
  onContactChange: (next: Contact) => void;
  onToggleGenre: (genre: string) => void;
  onAdvanceFromIntro: () => void;
  onSkip: () => void;
  onSubmitGenres: () => void;
  onSubmitAge: (value: string) => void;
  onSubmitTextStep: (current: StepId, next: StepId) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onConfirmVoice: () => void;
  onPhotoSelected: (file: File | null) => void;
  onConfirmPhoto: () => void;
  onSubmitIntake: () => void;
  onSubmitContactSkip: () => void;
};

export function TalentIntakeControls(props: TalentIntakeControlsProps) {
  const {
    step,
    submitted,
    pending,
    selectedGenres,
    textInput,
    contact,
    voice,
    photo,
    recording,
    recordSeconds,
    fileInputRef,
    onTextInput,
    onContactChange,
    onToggleGenre,
    onAdvanceFromIntro,
    onSkip,
    onSubmitGenres,
    onSubmitAge,
    onSubmitTextStep,
    onStartRecording,
    onStopRecording,
    onConfirmVoice,
    onPhotoSelected,
    onConfirmPhoto,
    onSubmitIntake,
    onSubmitContactSkip,
  } = props;

  if (submitted || step === "done") {
    return (
      <p className="text-sm text-zinc-400">
        Want to add more later? Use{" "}
        <a href="/contact" className="text-accent hover:underline">
          /contact
        </a>{" "}
        and mention AI Recording Artist.
      </p>
    );
  }

  if (step === "intro") {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onAdvanceFromIntro} className="rounded-xl bg-accent px-4 py-2 font-semibold text-black">
          Start free intake
        </button>
        <button type="button" onClick={onSkip} className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-sm text-zinc-300 hover:border-accent/40">
          <SkipForward className="h-4 w-4" /> Skip intro
        </button>
      </div>
    );
  }

  if (step === "genres") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Genre options">
          {GENRE_OPTIONS.map((genre) => {
            const active = selectedGenres.includes(genre);
            return (
              <button key={genre} type="button" aria-pressed={active} onClick={() => onToggleGenre(genre)} className={`rounded-full border px-3 py-1.5 text-sm transition ${active ? "border-accent/60 bg-accent/15 text-accent" : "border-border text-zinc-300 hover:border-accent/40"}`}>
                {genre}
              </button>
            );
          })}
        </div>
        <label className="sr-only" htmlFor="intake-genre-custom">Custom genre</label>
        <input id="intake-genre-custom" value={textInput} onChange={(event) => onTextInput(event.target.value)} placeholder="Or type a custom genre / hybrid" className="w-full rounded-xl border border-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent" />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onSubmitGenres} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black">Continue</button>
          <button type="button" onClick={onSkip} className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-sm text-zinc-300"><SkipForward className="h-4 w-4" /> Skip</button>
        </div>
      </div>
    );
  }

  if (step === "age") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Age category">
          {AGE_OPTIONS.map((option) => (
            <button key={option} type="button" onClick={() => onSubmitAge(option)} className="rounded-full border border-border px-3 py-1.5 text-sm text-zinc-300 hover:border-accent/40">{option}</button>
          ))}
        </div>
        <button type="button" onClick={onSkip} className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-sm text-zinc-300"><SkipForward className="h-4 w-4" /> Skip</button>
      </div>
    );
  }

  if (step === "voice") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {!recording ? (
            <button type="button" onClick={onStartRecording} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black"><Mic className="h-4 w-4" /> Record short clip</button>
          ) : (
            <button type="button" onClick={onStopRecording} className="inline-flex items-center gap-2 rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-2 text-sm text-red-200"><MicOff className="h-4 w-4" /> Stop ({recordSeconds}s)</button>
          )}
          {voice ? (<button type="button" onClick={onConfirmVoice} className="rounded-xl border border-accent/50 px-4 py-2 text-sm text-accent">Use this clip</button>) : null}
          <button type="button" onClick={onSkip} className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-sm text-zinc-300"><SkipForward className="h-4 w-4" /> Skip</button>
        </div>
        <p className="text-xs text-zinc-500">Max ~45s. Clips over ~1.8 MB are noted in the email without attachment (Vercel Hobby limit).</p>
        {voice ? (<p className="font-mono text-xs text-accent" role="status">Ready: ~{voice.durationSeconds ?? "?"}s · {Math.round(voice.sizeBytes / 1024)} KB{voice.base64 ? "" : " · attach skipped"}</p>) : null}
      </div>
    );
  }

  if (step === "photo") {
    return (
      <div className="space-y-3">
        <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={(event) => onPhotoSelected(event.target.files?.[0] ?? null)} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black"><Camera className="h-4 w-4" /> Choose photo</button>
          {photo ? (<button type="button" onClick={onConfirmPhoto} className="inline-flex items-center gap-2 rounded-xl border border-accent/50 px-4 py-2 text-sm text-accent"><Upload className="h-4 w-4" /> Use this photo</button>) : null}
          <button type="button" onClick={onSkip} className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-sm text-zinc-300"><SkipForward className="h-4 w-4" /> Skip</button>
        </div>
        <p className="text-xs text-zinc-500">Prefer under ~1.2 MB so Hobby email can attach. Larger files are noted without attach.</p>
        {photo ? (<p className="font-mono text-xs text-accent" role="status">{photo.filename} · {Math.round(photo.sizeBytes / 1024)} KB{photo.base64 ? "" : " · attach skipped"}</p>) : null}
      </div>
    );
  }

  if (step === "contact") {
    return (
      <div className="space-y-3">
        <div className="grid gap-2 md:grid-cols-3">
          <label className="block text-sm"><span className="mb-1 block text-zinc-400">Name</span><input value={contact.name} onChange={(event) => onContactChange({ ...contact, name: event.target.value })} className="w-full rounded-xl border border-border bg-black/40 px-3 py-2 outline-none focus:border-accent" autoComplete="name" /></label>
          <label className="block text-sm"><span className="mb-1 block text-zinc-400">Email (encouraged)</span><input type="email" value={contact.email} onChange={(event) => onContactChange({ ...contact, email: event.target.value })} className="w-full rounded-xl border border-border bg-black/40 px-3 py-2 outline-none focus:border-accent" autoComplete="email" /></label>
          <label className="block text-sm"><span className="mb-1 block text-zinc-400">Phone (optional)</span><input type="tel" value={contact.phone} onChange={(event) => onContactChange({ ...contact, phone: event.target.value })} className="w-full rounded-xl border border-border bg-black/40 px-3 py-2 outline-none focus:border-accent" autoComplete="tel" /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={onSubmitIntake} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">{pending ? "Sending…" : "Send intake to Shawn"}</button>
          <button type="button" disabled={pending} onClick={onSubmitContactSkip} className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-sm text-zinc-300 disabled:opacity-50"><SkipForward className="h-4 w-4" /> Send without contact</button>
        </div>
      </div>
    );
  }

  const nextMap: Partial<Record<StepId, StepId>> = { favorites: "age", location: "tastes", tastes: "voice" };
  const placeholders: Partial<Record<StepId, string>> = { favorites: "e.g. Burna Boy, SZA, early Drake…", location: "e.g. Toronto, ON · GTA · Nigeria diaspora…", tastes: "Vibe, themes, career hopes…" };

  return (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); const next = nextMap[step]; if (next) onSubmitTextStep(step, next); }}>
      <label className="sr-only" htmlFor="intake-text">Your answer</label>
      <textarea id="intake-text" rows={3} value={textInput} onChange={(event) => onTextInput(event.target.value)} placeholder={placeholders[step] || "Your answer"} className="w-full rounded-xl border border-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent" />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black">Continue</button>
        <button type="button" onClick={onSkip} className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-sm text-zinc-300"><SkipForward className="h-4 w-4" /> Skip</button>
      </div>
    </form>
  );
}
