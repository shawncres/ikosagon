"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  QUESTION_LABELS,
  STEP_ORDER,
  STEP_PROMPTS,
  type AnswerRow,
  type StepId,
  type TrackRecommendation,
} from "@/components/talentIntakeConfig";
import { uid } from "@/components/talentIntakeUtils";
import { useTalentIntakeMedia } from "@/components/useTalentIntakeMedia";
import { useTalentIntakeSubmit } from "@/components/useTalentIntakeSubmit";

type ChatRole = "bot" | "user";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type CatalogPayload = {
  asOf: string;
  moods: string[];
  eras: string[];
  regions: string[];
  genres: Record<
    string,
    {
      artists: Array<{ name: string; albums: string[] }>;
      albums: Array<{ name: string; artist: string }>;
    }
  >;
};

export function useTalentIntake() {
  const [step, setStep] = useState<StepId>("intro");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: uid(), role: "bot", content: STEP_PROMPTS.intro },
  ]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedEra, setSelectedEra] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [selectedAlbums, setSelectedAlbums] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<TrackRecommendation[]>([]);
  const [catalogAsOf, setCatalogAsOf] = useState<string | null>(null);
  const [catalogNote, setCatalogNote] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [pending, setPending] = useState(false);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef({
    genres: [] as string[],
    mood: null as string | null,
    era: null as string | null,
    region: null as string | null,
    artists: [] as string[],
    albums: [] as string[],
  });

  profileRef.current = {
    genres: selectedGenres,
    mood: selectedMood,
    era: selectedEra,
    region: selectedRegion,
    artists: selectedArtists,
    albums: selectedAlbums,
  };

  const stepIndex = STEP_ORDER.indexOf(step);
  const progress = Math.round((stepIndex / (STEP_ORDER.length - 1)) * 100);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, error, recommendations]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/music-catalog");
        const payload = await response.json();
        if (cancelled || !payload?.ok || !payload.catalog) return;
        setCatalog(payload.catalog);
        setCatalogAsOf(payload.asOf || payload.catalog.asOf || null);
        setCatalogNote(payload.note || null);
      } catch {
        // Recommendations still run from the server seed.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const artistOptions = useMemo(() => {
    if (!catalog) return [] as string[];
    const names: string[] = [];
    const seen = new Set<string>();
    const keys = selectedGenres.length ? selectedGenres : Object.keys(catalog.genres);
    for (const genre of keys) {
      for (const artist of catalog.genres[genre]?.artists || []) {
        const key = artist.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(artist.name);
        if (names.length >= 16) return names;
      }
    }
    return names;
  }, [catalog, selectedGenres]);

  const albumOptions = useMemo(() => {
    if (!catalog) return [] as Array<{ label: string; album: string }>;
    const out: Array<{ label: string; album: string }> = [];
    const seen = new Set<string>();
    const artistSet = new Set(selectedArtists.map((name) => name.toLowerCase()));
    const keys = selectedGenres.length ? selectedGenres : Object.keys(catalog.genres);

    const push = (album: string, artist: string) => {
      const key = `${album.toLowerCase()}|${artist.toLowerCase()}`;
      if (!album || seen.has(key)) return;
      seen.add(key);
      out.push({ label: `${album} - ${artist}`, album });
    };

    for (const genre of keys) {
      for (const row of catalog.genres[genre]?.albums || []) {
        if (artistSet.size && !artistSet.has(row.artist.toLowerCase())) continue;
        push(row.name, row.artist);
        if (out.length >= 14) return out;
      }
    }
    if (out.length < 6) {
      for (const genre of keys) {
        for (const row of catalog.genres[genre]?.albums || []) {
          push(row.name, row.artist);
          if (out.length >= 14) return out;
        }
      }
    }
    return out;
  }, [catalog, selectedArtists, selectedGenres]);

  const pushBot = useCallback((content: string) => {
    setMessages((current) => [...current, { id: uid(), role: "bot", content }]);
  }, []);

  const pushUser = useCallback((content: string) => {
    setMessages((current) => [...current, { id: uid(), role: "user", content }]);
  }, []);

  const recordAnswer = useCallback((questionKey: StepId, answer: string) => {
    const question = QUESTION_LABELS[questionKey] || questionKey;
    setAnswers((current) => {
      const next = current.filter((row) => row.question !== question);
      next.push({ question, answer });
      return next;
    });
  }, []);

  const goTo = useCallback(
    (next: StepId) => {
      setStep(next);
      setError(null);
      if (next !== "done") pushBot(STEP_PROMPTS[next]);
    },
    [pushBot],
  );

  const loadRecommendations = useCallback(
    async (opts?: { fromSkip?: boolean; recordAlbums?: boolean }) => {
      const profile = profileRef.current;
      if (opts?.recordAlbums && profile.albums.length) {
        pushUser(profile.albums.join(", "));
        recordAnswer("albums", profile.albums.join(", "));
      } else if (opts?.recordAlbums) {
        pushUser("No albums selected - match from earlier clicks");
      }

      setLoadingRecs(true);
      setError(null);
      setStep("recommendations");
      pushBot(STEP_PROMPTS.recommendations);

      try {
        const response = await fetch("/api/music-recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            genres: profile.genres,
            mood: profile.mood,
            era: profile.era,
            region: profile.region,
            artists: profile.artists,
            albums: profile.albums,
          }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          setError(payload.error || "Could not build recommendations.");
          setRecommendations([]);
          return;
        }
        const picks = (payload.picks || []) as TrackRecommendation[];
        setRecommendations(picks);
        if (payload.asOf) setCatalogAsOf(payload.asOf);
        if (picks.length) {
          recordAnswer(
            "recommendations",
            picks.map((pick) => `${pick.title} - ${pick.artist} (${pick.why})`).join(" | "),
          );
          pushBot(
            picks
              .map(
                (pick, index) =>
                  `${index + 1}. ${pick.title} - ${pick.artist}\n   Why: ${pick.why}`,
              )
              .join("\n\n"),
          );
        } else {
          pushBot("No strong matches yet - you can still send contact or skip ahead.");
        }
      } catch {
        setError("Network error while matching tracks.");
      } finally {
        setLoadingRecs(false);
      }
    },
    [pushBot, pushUser, recordAnswer],
  );

  const skip = useCallback(() => {
    if (step === "intro") {
      pushUser("Skipped intro - continue");
      goTo("genres");
      return;
    }
    if (step === "done" || pending || loadingRecs) return;
    pushUser("Skipped");
    const next = STEP_ORDER[stepIndex + 1];
    if (next === "recommendations") {
      void loadRecommendations({ fromSkip: true });
      return;
    }
    if (next) goTo(next);
  }, [goTo, loadRecommendations, loadingRecs, pending, pushUser, step, stepIndex]);

  const advanceFromIntro = () => {
    pushUser("Let's go - anonymous song path");
    goTo("genres");
  };

  const toggleInList = (value: string, list: string[], setList: (next: string[]) => void) => {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const submitChipStep = (current: StepId, values: string[], next: StepId, required = false) => {
    if (required && !values.length) {
      setError("Pick at least one option, or skip.");
      return;
    }
    const answer = values.length ? values.join(", ") : "Skipped";
    pushUser(answer);
    if (values.length) recordAnswer(current, answer);
    goTo(next);
  };

  const submitGenres = () => submitChipStep("genres", selectedGenres, "mood", true);

  const submitMood = (value?: string) => {
    const mood = value || selectedMood;
    if (!mood) {
      setError("Pick a mood, or skip.");
      return;
    }
    setSelectedMood(mood);
    pushUser(mood);
    recordAnswer("mood", mood);
    goTo("era");
  };

  const submitEra = (value?: string) => {
    const era = value || selectedEra;
    if (!era) {
      setError("Pick an era, or skip.");
      return;
    }
    setSelectedEra(era);
    pushUser(era);
    recordAnswer("era", era);
    goTo("region");
  };

  const submitRegion = (value?: string) => {
    const region = value || selectedRegion;
    if (!region) {
      setError("Pick a region lean, or skip.");
      return;
    }
    setSelectedRegion(region);
    pushUser(region);
    recordAnswer("region", region);
    goTo("artists");
  };

  const submitArtists = () => submitChipStep("artists", selectedArtists, "albums", false);

  const continueAfterRecs = () => {
    pushUser("Optional add-ons - voice / photo / email");
    goTo("voice");
  };

  const media = useTalentIntakeMedia({
    setError,
    pushUser,
    recordAnswer,
    goTo,
  });

  const submit = useTalentIntakeSubmit({
    contact,
    answers,
    setAnswers,
    voice: media.voice,
    photo: media.photo,
    recommendations,
    tastePath: {
      genres: selectedGenres,
      mood: selectedMood,
      era: selectedEra,
      region: selectedRegion,
      artists: selectedArtists,
      albums: selectedAlbums,
    },
    catalogAsOf,
    setPending,
    setError,
    setSubmitted,
    setStep,
    pushUser,
    pushBot,
  });

  return {
    step,
    messages,
    selectedGenres,
    selectedMood,
    selectedEra,
    selectedRegion,
    selectedArtists,
    selectedAlbums,
    recommendations,
    catalogAsOf,
    catalogNote,
    artistOptions,
    albumOptions,
    contact,
    setContact,
    voice: media.voice,
    photo: media.photo,
    recording: media.recording,
    recordSeconds: media.recordSeconds,
    pending,
    loadingRecs,
    error,
    submitted,
    listRef,
    fileInputRef,
    progress,
    skip,
    advanceFromIntro,
    toggleGenre: (genre: string) => toggleInList(genre, selectedGenres, setSelectedGenres),
    toggleArtist: (artist: string) => toggleInList(artist, selectedArtists, setSelectedArtists),
    toggleAlbum: (album: string) => toggleInList(album, selectedAlbums, setSelectedAlbums),
    setSelectedMood,
    setSelectedEra,
    setSelectedRegion,
    submitGenres,
    submitMood,
    submitEra,
    submitRegion,
    submitArtists,
    submitAlbums: () => void loadRecommendations({ recordAlbums: true }),
    continueAfterRecs,
    startRecording: media.startRecording,
    stopRecording: media.stopRecording,
    confirmVoice: media.confirmVoice,
    onPhotoSelected: media.onPhotoSelected,
    confirmPhoto: media.confirmPhoto,
    submitIntake: submit.submitIntake,
    submitContactSkip: submit.submitContactSkip,
    finishAnonymous: submit.finishAnonymous,
  };
}
