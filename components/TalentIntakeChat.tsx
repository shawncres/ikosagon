"use client";

import { TalentIntakeControls } from "@/components/TalentIntakeControls";
import { useEffect, useRef } from "react";
import { useTalentIntake } from "@/components/useTalentIntake";
import { SEED_ARTISTS } from "@/lib/music/taste/seed";

export function TalentIntakeChat() {
  const listRef = useRef<HTMLDivElement>(null);
  const intake = useTalentIntake();
  const { messages, pending, error } = intake;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, error]);

  return (
    <section
      className="card-surface neon-border mb-10 rounded-2xl p-5 md:p-6"
      aria-label="Song participation taste path"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 font-mono text-xs text-accent">IkoArtist · leaderboard playlist · anonymous OK</p>
          <h2 className="text-xl font-semibold">IkoArtist — discover your sound, get a song made</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            We at Ikosagon turn your clicks into a song brief: your three favorite artists (the
            sound), the themes you gravitate toward, and — only if you want — who it’s for. Every
            step has a skip and an optional “add your own”. The agentic Ikosagon engine produces the
            hit (takes some time); tracks compete on a view-ranked leaderboard. Finish without email
            anytime.
          </p>
          <p className="mt-2 font-mono text-[10px] text-zinc-500">
            Taste map: Ikosagon editorial seed of {SEED_ARTISTS.length} artists as of {intake.seedAsOf} · estimates, not measured audio features{Object.keys(intake.taste.enrichment).length ? " · track data from Last.fm" : ""}
          </p>
        </div>
        <p className="font-mono text-xs text-zinc-500" aria-live="polite">
          {intake.progress}%
        </p>
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${intake.progress}%` }}
        />
      </div>

      <div
        ref={listRef}
        className="mb-4 max-h-[22rem] space-y-3 overflow-y-auto rounded-xl border border-border/80 bg-black/30 p-3"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {intake.messages.map((message) => (
          <article
            key={message.id}
            className={
              message.role === "user"
                ? "ml-8 rounded-xl bg-accent/10 px-3 py-2 text-sm text-zinc-100"
                : "mr-6 rounded-xl border border-border px-3 py-2 text-sm text-zinc-200"
            }
          >
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
              {message.role === "user" ? "You" : "Guide"}
            </p>
            <p className="whitespace-pre-wrap">{message.content}</p>
          </article>
        ))}
      </div>

      <div className="space-y-2">
        <TalentIntakeControls
          step={intake.step}
          submitted={intake.submitted}
          pending={intake.pending}
          selectedGenres={intake.selectedGenres}
          selectedEra={intake.selectedEra}
          selectedRegion={intake.selectedRegion}
          taste={intake.taste}
          contact={intake.contact}
          voice={intake.voice}
          photo={intake.photo}
          recording={intake.recording}
          recordSeconds={intake.recordSeconds}
          onContactChange={intake.setContact}
          onToggleGenre={intake.toggleGenre}
          onAdvanceFromIntro={intake.advanceFromIntro}
          onSkip={intake.skip}
          onSubmitGenres={intake.submitGenres}
          onSubmitEra={intake.submitEra}
          onSubmitRegion={intake.submitRegion}
          onContinueAfterBrief={intake.continueAfterBrief}
          onFinishAnonymous={() => void intake.finishAnonymous()}
          onStartRecording={() => void intake.startRecording()}
          onStopRecording={intake.stopRecording}
          onConfirmVoice={intake.confirmVoice}
          onPhotoSelected={(file) => void intake.onPhotoSelected(file)}
          onConfirmPhoto={intake.confirmPhoto}
          onSubmitIntake={() => void intake.submitIntake()}
          onSubmitContactSkip={() => void intake.submitContactSkip()}
        />
        {intake.error ? (
          <p className="font-mono text-xs text-amber-300" role="alert">
            {intake.error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
