"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StepId } from "@/components/talentIntakeConfig";
import { buildBrief, THEME_LABEL, themeTally } from "@/lib/music/taste/brief";
import { parseEnrichmentMap } from "@/lib/music/taste/enrich";
import { sanitizeFreeText, sanitizeProfile, sanitizeTrending } from "@/lib/music/taste/sanitize";
import {
  anchorOptions,
  anchorReadout,
  contrastOptions,
  nextQuestions,
  resolveArtists,
  suggestNext,
  targetVector,
} from "@/lib/music/taste/tree";
import {
  AUDIENCE_AGE_BANDS,
  type ArtistEnrichment,
  type Audience,
  type CustomArtist,
  type Dim,
  type ExtraKey,
  type Extras,
  type Level,
  type ProfileInput,
  type ThemeId,
  type TrendingContext,
} from "@/lib/music/taste/types";
import { DIM_COPY } from "@/lib/music/taste/vector";

type Deps = {
  genres: string[];
  era: string | null;
  region: string | null;
  goTo: (next: StepId, prompt?: string) => void;
  pushUser: (content: string) => void;
  pushBot: (content: string) => void;
  recordAnswer: (questionKey: string, answer: string) => void;
  setError: (value: string | null) => void;
};

const EMPTY_AUDIENCE: Audience = { ageBand: null, region: null, languages: [], contexts: [] };
const LEVEL_WORD: Record<Exclude<Level, "any">, string> = { low: "low", mid: "in between", high: "high" };

export function useTasteProfile({ genres, era, region, goTo, pushUser, pushBot, recordAnswer, setError }: Deps) {
  const [anchorPage, setAnchorPage] = useState(0);
  const [artistIds, setArtistIds] = useState<string[]>([]);
  const [custom, setCustom] = useState<CustomArtist[]>([]);
  const [answers, setAnswers] = useState<Partial<Record<Dim, Level>>>({});
  const [qList, setQList] = useState<Dim[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [contrast, setContrast] = useState<ProfileInput["contrast"]>(null);
  const [themes, setThemes] = useState<ThemeId[]>([]);
  const [audience, setAudience] = useState<Audience>(EMPTY_AUDIENCE);
  const [extras, setExtras] = useState<Extras>({});
  const [trending, setTrending] = useState<TrendingContext | null>(null);
  const [enrichment, setEnrichment] = useState<Record<string, ArtistEnrichment>>({});
  // false once the server says it has no Last.fm key, so we stop asking. Kept in a ref: it never drives rendering.
  const lastfmOff = useRef(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/music-trending");
        const json = await res.json();
        if (!cancelled && json?.ok) setTrending(sanitizeTrending(json.trending));
      } catch {
        // Chart context is optional; the brief simply omits it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const picked = useMemo(() => resolveArtists(artistIds, custom), [artistIds, custom]);

  // Optional Last.fm detail (top tracks, similar artists). Fetched through our server so the key never reaches the browser.
  const enrichKey = useMemo(() => {
    const seedIds = picked.filter((a) => !a.custom).map((a) => a.id);
    const names = picked.filter((a) => a.custom).map((a) => a.name);
    return JSON.stringify([seedIds, names]);
  }, [picked]);
  useEffect(() => {
    const [seedIds, names] = JSON.parse(enrichKey) as [string[], string[]];
    if (!seedIds.length && !names.length) return;
    if (lastfmOff.current) return;
    const controller = new AbortController();
    (async () => {
      try {
        const qs = new URLSearchParams({ ids: seedIds.join(","), custom: names.join("|") });
        const res = await fetch(`/api/music-artist-enrich?${qs.toString()}`, { signal: controller.signal });
        const json = await res.json();
        if (!json?.ok) return;
        if (!json.enabled) lastfmOff.current = true;
        else setEnrichment((cur) => ({ ...cur, ...parseEnrichmentMap(json.artists) }));
      } catch {
        // Optional: the brief falls back to our editorial seed picks.
      }
    })();
    return () => controller.abort();
  }, [enrichKey]);

  const anchor = picked[0] ?? null;
  const target = useMemo(() => (anchor ? targetVector(anchor, answers) : null), [anchor, answers]);

  const anchorPageData = useMemo(
    () => anchorOptions({ genres, era, region }, anchorPage),
    [genres, era, region, anchorPage],
  );
  const secondOptions = useMemo(
    () => (anchor && target ? suggestNext(2, [anchor], target, genres, era, enrichment[anchor.id]?.similarSeedIds || []) : []),
    [anchor, target, genres, era, enrichment],
  );
  const thirdOptions = useMemo(
    () => (picked.length && target ? suggestNext(3, picked.slice(0, 2), target, genres, era) : []),
    [picked, target, genres, era],
  );
  const contrastData = useMemo(() => contrastOptions(picked), [picked]);
  const currentQuestion = qList[qIdx] ?? null;

  const profile: ProfileInput = useMemo(
    () =>
      sanitizeProfile({
        genres,
        era,
        region,
        artistIds,
        answers,
        contrast,
        themes,
        audience,
        extras,
        custom,
      }),
    [genres, era, region, artistIds, answers, contrast, themes, audience, extras, custom],
  );
  const brief = useMemo(() => buildBrief(profile, { trending, enrichment }), [profile, trending, enrichment]);

  const artistThemeHint = useMemo(
    () =>
      themeTally(picked)
        .slice(0, 3)
        .map((t) => THEME_LABEL[t.theme]),
    [picked],
  );

  const setExtra = useCallback((key: ExtraKey, text: string) => {
    setExtras((cur) => ({ ...cur, [key]: text }));
  }, []);

  const startQuestions = useCallback(
    (a: NonNullable<typeof anchor>) => {
      const list = nextQuestions(a, genres, []);
      setQList(list);
      setQIdx(0);
      if (!list.length) {
        goTo("second");
        return;
      }
      goTo("sound", `${anchorReadout(a)} Three quick questions about what that pick can’t explain on its own. ${DIM_COPY[list[0]].question}`);
    },
    [genres, goTo],
  );

  const pickAnchor = useCallback(
    (id: string) => {
      const a = resolveArtists([id], custom)[0];
      if (!a) return;
      setArtistIds([id]);
      pushUser(a.name);
      recordAnswer("anchor", a.name);
      startQuestions(a);
    },
    [custom, pushUser, recordAnswer, startQuestions],
  );

  const moreAnchors = useCallback(() => setAnchorPage((p) => p + 1), []);

  const advanceQuestion = useCallback(() => {
    if (qIdx + 1 < qList.length) {
      const next = qList[qIdx + 1];
      setQIdx(qIdx + 1);
      pushBot(DIM_COPY[next].question);
    } else {
      setQIdx(qList.length);
      goTo("second");
    }
  }, [goTo, pushBot, qIdx, qList]);

  const answerQuestion = useCallback(
    (level: Level) => {
      if (!currentQuestion) return;
      const copy = DIM_COPY[currentQuestion];
      const text =
        level === "any"
          ? "Doesn’t matter"
          : level === "mid"
            ? "Somewhere in between"
            : level === "low"
              ? copy.low
              : copy.high;
      pushUser(text);
      setAnswers((cur) => ({ ...cur, [currentQuestion]: level }));
      recordAnswer(`Sound: ${copy.name}`, level === "any" ? "doesn’t matter" : LEVEL_WORD[level]);
      advanceQuestion();
    },
    [advanceQuestion, currentQuestion, pushUser, recordAnswer],
  );

  const pickSecond = useCallback(
    (id: string) => {
      const a = resolveArtists([id], custom)[0];
      if (!a || !anchor) return;
      setArtistIds([anchor.id, id]);
      pushUser(a.name);
      recordAnswer("second", a.name);
      goTo("third");
    },
    [anchor, custom, goTo, pushUser, recordAnswer],
  );

  const pickThird = useCallback(
    (id: string) => {
      const a = resolveArtists([id], custom)[0];
      if (!a) return;
      const next = [...artistIds.slice(0, 2), id];
      setArtistIds(next);
      pushUser(a.name);
      recordAnswer("third", a.name);
      const pair = contrastOptions(resolveArtists(next, custom));
      if (pair.pair && pair.options.length) {
        goTo(
          "contrast",
          `What does ${pair.pair[0].name} have that ${pair.pair[1].name} doesn’t — the part you’d want in your song?`,
        );
      } else {
        goTo("themes", themePrompt(resolveArtists(next, custom)));
      }
    },
    [artistIds, custom, goTo, pushUser, recordAnswer],
  );

  const answerContrast = useCallback(
    (choice: { dim: Dim; favors: string; label: string } | null) => {
      if (choice) {
        setContrast({ dim: choice.dim, favors: choice.favors });
        pushUser(choice.label);
        recordAnswer("contrast", choice.label);
      } else {
        setContrast(null);
        pushUser("Both equally");
        recordAnswer("contrast", "both equally");
      }
      goTo("themes", themePrompt(picked));
    },
    [goTo, picked, pushUser, recordAnswer],
  );

  const toggleTheme = useCallback(
    (t: ThemeId) => {
      setThemes((cur) => {
        if (cur.includes(t)) return cur.filter((x) => x !== t);
        if (cur.length >= 4) {
          setError("Up to four themes — untap one to swap.");
          return cur;
        }
        setError(null);
        return [...cur, t];
      });
    },
    [setError],
  );

  const submitThemes = useCallback(() => {
    if (!themes.length) {
      setError("Pick at least one theme, or skip.");
      return;
    }
    const label = themes.map((t) => THEME_LABEL[t]).join(", ");
    pushUser(label);
    recordAnswer("themes", label);
    goTo("audience");
  }, [goTo, pushUser, recordAnswer, setError, themes]);

  const toggleAudience = useCallback((field: "languages" | "contexts", value: string, max: number) => {
    setAudience((cur) => {
      const list = cur[field];
      if (list.includes(value)) return { ...cur, [field]: list.filter((x) => x !== value) };
      if (list.length >= max) return cur;
      return { ...cur, [field]: [...list, value] };
    });
  }, []);

  const setAudienceBand = useCallback((field: "ageBand" | "region", value: string) => {
    setAudience((cur) => ({ ...cur, [field]: cur[field] === value ? null : value }));
  }, []);

  const finishAudience = useCallback(
    (skipped: boolean) => {
      // Audience answers are deliberately NOT echoed into the chat log or the transcript rows.
      pushUser(skipped ? "Skipped audience" : "Audience bands saved (kept out of the transcript)");
      if (skipped) setAudience(EMPTY_AUDIENCE);
      goTo("brief");
    },
    [goTo, pushUser],
  );

  /** Adds a free-text artist via MusicBrainz tags. Returns the new artist id when a sound profile could be read. */
  const addCustomArtist = useCallback(
    async (raw: string, stage: "anchor" | "second" | "third") => {
      const name = sanitizeFreeText(raw, 60);
      if (name.length < 2) {
        setLookupNote("Type an artist name first.");
        return;
      }
      setLookupBusy(true);
      setLookupNote(null);
      try {
        const res = await fetch(`/api/music-artist-lookup?name=${encodeURIComponent(name)}`);
        const json = await res.json();
        if (!json?.ok) {
          setLookupNote(json?.error || "Couldn’t look that artist up right now — pick from the chips.");
          return;
        }
        if (!json.found || !json.confident || !json.vector) {
          const key: ExtraKey = stage;
          setExtras((cur) => ({ ...cur, [key]: sanitizeFreeText(`${cur[key] ? `${cur[key]}; ` : ""}${name}`, 80) }));
          setLookupNote(
            `We couldn’t read a sound profile for “${name}” from free tags, so we saved it as a note. Please also pick one of the chips.`,
          );
          return;
        }
        const art = sanitizeProfile({
          custom: [{ name: json.name, vector: json.vector, peak: json.peak, tags: json.tags }],
          artistIds: [],
        }).custom[0];
        if (!art) return;
        setCustom((cur) => (cur.some((c) => c.id === art.id) ? cur : [...cur, art].slice(-3)));
        setLookupNote(`Matched ${art.name} (sized from free tags: ${(json.matchedTags as string[]).slice(0, 4).join(", ")}). Approximate.`);
        const list = resolveArtists([art.id], [art]);
        if (!list.length) return;
        if (stage === "anchor") {
          setArtistIds([art.id]);
          pushUser(`${art.name} (your own)`);
          recordAnswer("anchor", `${art.name} (free-text, tags only)`);
          startQuestions(list[0]);
        } else if (stage === "second" && anchor) {
          setArtistIds([anchor.id, art.id]);
          pushUser(`${art.name} (your own)`);
          recordAnswer("second", `${art.name} (free-text, tags only)`);
          goTo("third");
        } else if (stage === "third") {
          const next = [...artistIds.slice(0, 2), art.id];
          setArtistIds(next);
          pushUser(`${art.name} (your own)`);
          recordAnswer("third", `${art.name} (free-text, tags only)`);
          goTo("themes", themePrompt(resolveArtists(next, [...custom, art])));
        }
      } catch {
        setLookupNote("Couldn’t look that artist up right now — pick from the chips.");
      } finally {
        setLookupBusy(false);
      }
    },
    [anchor, artistIds, custom, goTo, pushUser, recordAnswer, startQuestions],
  );

  /** Skip handling for the taste steps. Returns true when it handled the step. */
  const skipStep = useCallback(
    (step: StepId): boolean => {
      if (step === "anchor") {
        pushUser("Skipped");
        goTo("themes", "No artists picked, so no sound range yet. You can still tell us the themes you want.");
        return true;
      }
      if (step === "sound") {
        if (currentQuestion) {
          pushUser("Skipped");
          setAnswers((cur) => ({ ...cur, [currentQuestion]: "any" }));
          advanceQuestion();
        }
        return true;
      }
      if (step === "second") {
        pushUser("Skipped");
        goTo("third");
        return true;
      }
      if (step === "third") {
        pushUser("Skipped");
        goTo("themes", themePrompt(picked));
        return true;
      }
      if (step === "contrast") {
        answerContrast(null);
        return true;
      }
      if (step === "themes") {
        pushUser("Skipped");
        goTo("audience");
        return true;
      }
      if (step === "audience") {
        finishAudience(true);
        return true;
      }
      return false;
    },
    [advanceQuestion, answerContrast, currentQuestion, finishAudience, goTo, picked, pushUser],
  );

  const noteRows = useMemo(
    () =>
      Object.entries(profile.extras).map(([key, text]) => ({ question: `Note (${key})`, answer: text as string })),
    [profile.extras],
  );

  return {
    anchorOptions: anchorPageData.options,
    anchorPages: anchorPageData.pages,
    secondOptions,
    thirdOptions,
    contrastData,
    currentQuestion,
    questionIndex: qIdx,
    questionTotal: qList.length,
    picked,
    anchor,
    answers,
    themes,
    audience,
    ageBands: AUDIENCE_AGE_BANDS,
    extras,
    setExtra,
    trending,
    enrichment,
    artistThemeHint,
    profile,
    brief,
    noteRows,
    lookupBusy,
    lookupNote,
    pickAnchor,
    moreAnchors,
    answerQuestion,
    pickSecond,
    pickThird,
    answerContrast,
    toggleTheme,
    submitThemes,
    toggleAudience,
    setAudienceBand,
    finishAudience,
    addCustomArtist,
    skipStep,
  };
}

function themePrompt(artists: ReturnType<typeof resolveArtists>): string {
  const hint = themeTally(artists)
    .slice(0, 3)
    .map((t) => THEME_LABEL[t.theme]);
  return hint.length
    ? `What do you want the song to be about? Tap up to four themes. Your artists often sing about: ${hint.join(", ")}.`
    : "What do you want the song to be about? Tap up to four themes.";
}

export type TasteApi = ReturnType<typeof useTasteProfile>;
