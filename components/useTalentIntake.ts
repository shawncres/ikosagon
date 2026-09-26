"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  QUESTION_LABELS,
  STEP_ORDER,
  STEP_PROMPTS,
  type AnswerRow,
  type MediaPayload,
  type StepId,
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

export function useTalentIntake() {
  const [step, setStep] = useState<StepId>("intro");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: uid(), role: "bot", content: STEP_PROMPTS.intro },
  ]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [textInput, setTextInput] = useState("");
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stepIndex = STEP_ORDER.indexOf(step);
  const progress = Math.round((stepIndex / (STEP_ORDER.length - 1)) * 100);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, error]);

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
      setTextInput("");
      setError(null);
      if (next !== "done") pushBot(STEP_PROMPTS[next]);
    },
    [pushBot],
  );

  const skip = useCallback(() => {
    if (step === "intro") {
      pushUser("Skipped intro — continue");
      goTo("genres");
      return;
    }
    if (step === "done" || pending) return;
    pushUser("Skipped");
    const next = STEP_ORDER[stepIndex + 1];
    if (next) goTo(next);
  }, [goTo, pending, pushUser, step, stepIndex]);

  const advanceFromIntro = () => {
    pushUser("Let’s go — free intake");
    goTo("genres");
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres((current) =>
      current.includes(genre) ? current.filter((item) => item !== genre) : [...current, genre],
    );
  };

  const submitGenres = () => {
    const custom = textInput.trim();
    const combined = [...selectedGenres, ...(custom ? [custom] : [])];
    if (!combined.length) {
      setError("Pick a genre, type one, or skip.");
      return;
    }
    const answer = combined.join(", ");
    pushUser(answer);
    recordAnswer("genres", answer);
    goTo("favorites");
  };

  const submitTextStep = (current: StepId, next: StepId) => {
    const value = textInput.trim();
    if (!value) {
      setError("Type a short answer, or skip.");
      return;
    }
    pushUser(value);
    recordAnswer(current, value);
    goTo(next);
  };

  const submitAge = (value: string) => {
    pushUser(value);
    recordAnswer("age", value);
    goTo("location");
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
    textInput,
    setTextInput,
    contact,
    setContact,
    voice: media.voice,
    photo: media.photo,
    recording: media.recording,
    recordSeconds: media.recordSeconds,
    pending,
    error,
    submitted,
    listRef,
    fileInputRef,
    progress,
    skip,
    advanceFromIntro,
    toggleGenre,
    submitGenres,
    submitTextStep,
    submitAge,
    startRecording: media.startRecording,
    stopRecording: media.stopRecording,
    confirmVoice: media.confirmVoice,
    onPhotoSelected: media.onPhotoSelected,
    confirmPhoto: media.confirmPhoto,
    submitIntake: submit.submitIntake,
    submitContactSkip: submit.submitContactSkip,
  };
}
