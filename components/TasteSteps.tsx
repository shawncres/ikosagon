"use client";

import { useState } from "react";
import { AddYourOwn } from "@/components/AddYourOwn";
import { SongBriefCard } from "@/components/SongBriefCard";
import { btn, btnGhost, Chip, SkipButton } from "@/components/talentIntakeUi";
import type { StepId } from "@/components/talentIntakeConfig";
import type { TasteApi } from "@/components/useTasteProfile";
import { THEME_LABEL } from "@/lib/music/taste/brief";
import {
  AUDIENCE_AGE_BANDS,
  AUDIENCE_CONTEXTS,
  AUDIENCE_LANGUAGES,
  AUDIENCE_REGIONS,
  THEME_IDS,
} from "@/lib/music/taste/types";
import { DIM_COPY } from "@/lib/music/taste/vector";

function OwnArtist({ stage, taste }: { stage: "anchor" | "second" | "third"; taste: TasteApi }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="font-mono text-[11px] text-zinc-400 hover:text-accent">
        + Add your own artist <span className="text-zinc-600">(optional)</span>
      </button>
    );
  }
  return (
    <div className="space-y-1">
      <label className="block text-xs">
        <span className="mb-1 block font-mono text-[11px] text-zinc-400">
          Type an artist <span className="text-zinc-600">· optional · we read free MusicBrainz tags to size the sound</span>
        </span>
        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            maxLength={60}
            onChange={(e) => setText(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="Artist name"
          />
          <button
            type="button"
            disabled={taste.lookupBusy || text.trim().length < 2}
            onClick={() => void taste.addCustomArtist(text, stage)}
            className={btnGhost}
          >
            {taste.lookupBusy ? "Looking…" : "Use"}
          </button>
        </div>
      </label>
      {taste.lookupNote ? (
        <p className="text-[11px] text-zinc-400" role="status">
          {taste.lookupNote}
        </p>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function TasteSteps({
  step,
  taste,
  pending,
  onSkip,
  onFinishAnonymous,
  onContinueAfterBrief,
}: {
  step: StepId;
  taste: TasteApi;
  pending: boolean;
  onSkip: () => void;
  onFinishAnonymous: () => void;
  onContinueAfterBrief: () => void;
}) {
  if (step === "anchor") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Anchor artist options">
          {taste.anchorOptions.map((a) => (
            <Chip key={a.id} label={a.name} sub={a.genres[0]} onClick={() => taste.pickAnchor(a.id)} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {taste.anchorPages > 1 ? (
            <button type="button" onClick={taste.moreAnchors} className={btnGhost}>
              Show different artists
            </button>
          ) : null}
          <SkipButton onClick={onSkip} />
        </div>
        <OwnArtist stage="anchor" taste={taste} />
        <AddYourOwn stepKey="anchor" value={taste.extras.anchor || ""} onChange={taste.setExtra} label="Why this one?" placeholder="e.g. the voice, one album" />
      </div>
    );
  }

  if (step === "sound") {
    const dim = taste.currentQuestion;
    if (!dim) return null;
    const copy = DIM_COPY[dim];
    return (
      <div className="space-y-3">
        <p className="font-mono text-[11px] text-accent">
          Question {Math.min(taste.questionIndex + 1, taste.questionTotal)} of {taste.questionTotal} · {copy.question}
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={copy.question}>
          <Chip label={copy.low} onClick={() => taste.answerQuestion("low")} />
          <Chip label="Somewhere in between" onClick={() => taste.answerQuestion("mid")} />
          <Chip label={copy.high} onClick={() => taste.answerQuestion("high")} />
          <Chip label="Doesn’t matter" onClick={() => taste.answerQuestion("any")} />
        </div>
        <SkipButton onClick={onSkip} />
        <AddYourOwn stepKey="sound" value={taste.extras.sound || ""} onChange={taste.setExtra} label="Describe the sound" placeholder="e.g. dusty drums, big choir" />
      </div>
    );
  }

  if (step === "second" || step === "third") {
    const options = step === "second" ? taste.secondOptions : taste.thirdOptions;
    const labels = [...new Set(options.map((o) => o.label))];
    return (
      <div className="space-y-3">
        {labels.map((label) => (
          <Group key={label} title={label}>
            {options
              .filter((o) => o.label === label)
              .map((o) => (
                <Chip
                  key={o.artist.id}
                  label={o.artist.name}
                  sub={o.artist.genres[0]}
                  onClick={() => (step === "second" ? taste.pickSecond(o.artist.id) : taste.pickThird(o.artist.id))}
                />
              ))}
          </Group>
        ))}
        <SkipButton onClick={onSkip} />
        <OwnArtist stage={step} taste={taste} />
        <AddYourOwn stepKey={step} value={taste.extras[step] || ""} onChange={taste.setExtra} label="Why this one?" placeholder="e.g. the way they write hooks" />
      </div>
    );
  }

  if (step === "contrast") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Contrast options">
          {taste.contrastData.options.map((o) => (
            <Chip key={`${o.dim}-${o.favors}`} label={o.label} onClick={() => taste.answerContrast(o)} />
          ))}
          <Chip label="Both equally" onClick={() => taste.answerContrast(null)} />
        </div>
        <SkipButton onClick={onSkip} />
        <AddYourOwn stepKey="contrast" value={taste.extras.contrast || ""} onChange={taste.setExtra} label="In your words" placeholder="e.g. her phrasing, his beat choices" />
      </div>
    );
  }

  if (step === "themes") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Theme options">
          {THEME_IDS.map((t) => (
            <Chip key={t} label={THEME_LABEL[t]} active={taste.themes.includes(t)} onClick={() => taste.toggleTheme(t)} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={taste.submitThemes} className={btn}>
            Continue
          </button>
          <SkipButton onClick={onSkip} />
        </div>
        <AddYourOwn stepKey="themes" value={taste.extras.themes || ""} onChange={taste.setExtra} label="Another theme" placeholder="e.g. growing up in a small town" />
      </div>
    );
  }

  if (step === "audience") {
    const a = taste.audience;
    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-border/80 bg-black/30 px-3 py-2 text-xs text-zinc-400">
          <span className="font-mono text-accent">Why we ask:</span> a song for night-shift commuters and a song for a
          festival crowd are not the same song. We keep <strong className="text-zinc-300">bands only</strong>, no account,
          nothing exact, and it stays out of any transcript. Skip it and nothing changes about your brief.
        </p>
        <Group title="Age band">
          {AUDIENCE_AGE_BANDS.map((b) => (
            <Chip key={b} label={b} active={a.ageBand === b} onClick={() => taste.setAudienceBand("ageBand", b)} />
          ))}
        </Group>
        <Group title="Where are the listeners?">
          {AUDIENCE_REGIONS.map((r) => (
            <Chip key={r} label={r} active={a.region === r} onClick={() => taste.setAudienceBand("region", r)} />
          ))}
        </Group>
        <Group title="Language (up to 3)">
          {AUDIENCE_LANGUAGES.map((l) => (
            <Chip key={l} label={l} active={a.languages.includes(l)} onClick={() => taste.toggleAudience("languages", l, 3)} />
          ))}
        </Group>
        <Group title="When do they listen? (up to 4)">
          {AUDIENCE_CONTEXTS.map((c) => (
            <Chip key={c} label={c} active={a.contexts.includes(c)} onClick={() => taste.toggleAudience("contexts", c, 4)} />
          ))}
        </Group>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => taste.finishAudience(false)} className={btn}>
            Save bands &amp; see my brief
          </button>
          <SkipButton onClick={onSkip} label="Skip audience" />
        </div>
        <AddYourOwn stepKey="audience" value={taste.extras.audience || ""} onChange={taste.setExtra} label="Anything about the listener" placeholder="e.g. night-shift nurses" />
      </div>
    );
  }

  if (step === "brief") {
    return (
      <div className="space-y-3">
        <SongBriefCard brief={taste.brief} />
        <AddYourOwn stepKey="final" value={taste.extras.final || ""} onChange={taste.setExtra} label="Anything else for the song?" placeholder="e.g. a line you want in the hook" />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={onFinishAnonymous} className={btn}>
            {pending ? "Sending..." : "Finish anonymously"}
          </button>
          <button type="button" disabled={pending} onClick={onContinueAfterBrief} className={btnGhost}>
            Optional voice / photo / email
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Anonymous is fine — your brief still feeds the agentic Ikosagon engine so a song can get made (takes some time).
          Leave email only if you want opportunity follow-ups.
        </p>
      </div>
    );
  }

  return null;
}
