"use client";

import { useCallback, useMemo, useState } from "react";
import {
  QUESTION_LABELS,
  STEP_ORDER,
  STEP_PROMPTS,
  type AnswerRow,
  type StepId,
} from "@/components/talentIntakeConfig";
import { uid } from "@/components/talentIntakeUtils";
import { useTalentIntakeMedia } from "@/components/useTalentIntakeMedia";
import { useTalentIntakeSubmit } from "@/components/useTalentIntakeSubmit";
import { useTasteProfile } from "@/components/useTasteProfile";
import { SEED_AS_OF } from "@/lib/music/taste/seed";

type ChatRole = "bot" | "user";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export function useTalentIntake() {
  const [step, setStep] = useState<StepId>("intro");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: uid(), role: "bot", content: STEP_PROMPTS.intro },
  ]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedEra, setSelectedEra] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const stepIndex = STEP_ORDER.indexOf(step);
  const progress = Math.round((stepIndex / (STEP_ORDER.length - 1)) * 100);

  const pushBot = useCallback((content: string) => {
    setMessages((current) => [...current, { id: uid(), role: "bot", content }]);
  }, []);

  const pushUser = useCallback((content: string) => {
    setMessages((current) => [...current, { id: uid(), role: "user", content }]);
  }, []);

  const recordAnswer = useCallback((questionKey: string, answer: string) => {
    const question = QUESTION_LABELS[questionKey as StepId] || questionKey;
    setAnswers((current) => {
      const next = current.filter((row) => row.question !== question);
      next.push({ question, answer });
      return next;
    });
  }, []);

  const goTo = useCallback(
    (next: StepId, prompt?: string) => {
      setStep(next);
      setError(null);
      if (next !== "done") pushBot(prompt || STEP_PROMPTS[next]);
    },
    [pushBot],
  );

  const taste = useTasteProfile({
    genres: selectedGenres,
    era: selectedEra,
    region: selectedRegion,
    goTo,
    pushUser,
    pushBot,
    recordAnswer,
    setError,
  });

  const advanceFromIntro = () => {
    pushUser("Let's go - anonymous song path");
    goTo("genres");
  };

  const toggleGenre = (value: string) =>
    setSelectedGenres((list) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]));

  const submitGenres = () => {
    if (!selectedGenres.length) {
      setError("Pick at least one genre, or skip.");
      return;
    }
    const answer = selectedGenres.join(", ");
    pushUser(answer);
    recordAnswer("genres", answer);
    goTo("era");
  };

  const submitEra = (value: string) => {
    setSelectedEra(value);
    pushUser(value);
    recordAnswer("era", value);
    goTo("region");
  };

  const submitRegion = (value: string) => {
    setSelectedRegion(value);
    pushUser(value);
    recordAnswer("region", value);
    goTo("anchor");
  };

  const skip = useCallback(() => {
    if (step === "intro") {
      pushUser("Skipped intro - continue");
      goTo("genres");
      return;
    }
    if (step === "done" || pending) return;
    if (taste.skipStep(step)) return;
    pushUser("Skipped");
    const next = STEP_ORDER[stepIndex + 1];
    if (next) goTo(next);
  }, [goTo, pending, pushUser, step, stepIndex, taste]);

  const continueAfterBrief = () => {
    pushUser("Optional add-ons - voice / photo / email");
    goTo("voice");
  };

  const media = useTalentIntakeMedia({
    setError,
    pushUser,
    recordAnswer,
    goTo,
  });

  const transcript = useMemo<AnswerRow[]>(() => [...answers, ...taste.noteRows], [answers, taste.noteRows]);

  const submit = useTalentIntakeSubmit({
    contact,
    answers: transcript,
    setAnswers,
    voice: media.voice,
    photo: media.photo,
    profile: taste.profile,
    trending: taste.trending,
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
    selectedEra,
    selectedRegion,
    taste,
    seedAsOf: SEED_AS_OF,
    contact,
    setContact,
    voice: media.voice,
    photo: media.photo,
    recording: media.recording,
    recordSeconds: media.recordSeconds,
    pending,
    error,
    submitted,
    progress,
    skip,
    advanceFromIntro,
    toggleGenre,
    submitGenres,
    submitEra,
    submitRegion,
    continueAfterBrief,
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
