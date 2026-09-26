"use client";

import { TalentIntakeControls } from "@/components/TalentIntakeControls";
import { useTalentIntake } from "@/components/useTalentIntake";

export function TalentIntakeChat() {
  const intake = useTalentIntake();

  return (
    <section
      className="card-surface neon-border mb-10 rounded-2xl p-5 md:p-6"
      aria-label="Talent intake chatbot"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 font-mono text-xs text-accent">Talent intake · free to start</p>
          <h2 className="text-xl font-semibold">Artist collaboration chatbot</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Guided, skippable questions for Shawn’s review. No public prices. Generation tools and
            career scoring are future — after explicit approval.
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
        ref={intake.listRef}
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
              {message.role === "user" ? "You" : "Intake guide"}
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
          textInput={intake.textInput}
          contact={intake.contact}
          voice={intake.voice}
          photo={intake.photo}
          recording={intake.recording}
          recordSeconds={intake.recordSeconds}
          fileInputRef={intake.fileInputRef}
          onTextInput={intake.setTextInput}
          onContactChange={intake.setContact}
          onToggleGenre={intake.toggleGenre}
          onAdvanceFromIntro={intake.advanceFromIntro}
          onSkip={intake.skip}
          onSubmitGenres={intake.submitGenres}
          onSubmitAge={intake.submitAge}
          onSubmitTextStep={intake.submitTextStep}
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
