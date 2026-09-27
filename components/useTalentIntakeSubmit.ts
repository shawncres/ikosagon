"use client";

import {
  STEP_PROMPTS,
  type AnswerRow,
  type MediaPayload,
  type StepId,
  type TrackRecommendation,
} from "@/components/talentIntakeConfig";

type Contact = { name: string; email: string; phone: string };

type TastePath = {
  genres: string[];
  mood: string | null;
  era: string | null;
  region: string | null;
  artists: string[];
  albums: string[];
};

type SubmitDeps = {
  contact: Contact;
  answers: AnswerRow[];
  setAnswers: (value: AnswerRow[]) => void;
  voice: MediaPayload;
  photo: MediaPayload;
  recommendations: TrackRecommendation[];
  tastePath: TastePath;
  catalogAsOf: string | null;
  setPending: (value: boolean) => void;
  setError: (value: string | null) => void;
  setSubmitted: (value: boolean) => void;
  setStep: (value: StepId) => void;
  pushUser: (content: string) => void;
  pushBot: (content: string) => void;
};

function mediaBody(voice: MediaPayload, photo: MediaPayload) {
  return {
    voice: voice
      ? {
          filename: voice.filename,
          mimeType: voice.mimeType,
          base64: voice.base64 || undefined,
          sizeBytes: voice.sizeBytes,
          durationSeconds: voice.durationSeconds,
        }
      : null,
    photo: photo
      ? {
          filename: photo.filename,
          mimeType: photo.mimeType,
          base64: photo.base64 || undefined,
          sizeBytes: photo.sizeBytes,
        }
      : null,
  };
}

export function useTalentIntakeSubmit({
  contact,
  answers,
  setAnswers,
  voice,
  photo,
  recommendations,
  tastePath,
  catalogAsOf,
  setPending,
  setError,
  setSubmitted,
  setStep,
  pushUser,
  pushBot,
}: SubmitDeps) {
  const finishOk = () => {
    setSubmitted(true);
    setStep("done");
    pushBot(STEP_PROMPTS.done);
  };

  const postIntake = async (answersPayload: AnswerRow[], contactPayload: Contact | Record<string, never>) => {
    const response = await fetch("/api/talent-intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact: contactPayload,
        answers: answersPayload,
        tastePath,
        recommendations,
        catalogAsOf,
        ...mediaBody(voice, photo),
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setError(payload.error || "Could not send intake. Try again or use /contact.");
      setPending(false);
      return false;
    }
    finishOk();
    return true;
  };

  const submitIntake = async () => {
    setError(null);
    const name = contact.name.trim();
    const email = contact.email.trim();
    const phone = contact.phone.trim();

    if (!email && !name && !phone) {
      setError(
        "Leave email only for opportunity follow-ups — or Finish anonymously (your path still feeds the agentic Ikosagon engine).",
      );
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("That email does not look valid.");
      return;
    }

    const contactSummary = [
      name && `Name: ${name}`,
      email && `Email: ${email}`,
      phone && `Phone: ${phone}`,
    ]
      .filter(Boolean)
      .join(" · ");
    pushUser(contactSummary || "Contact skipped");
    const answersWithContact = contactSummary
      ? [...answers.filter((row) => row.question !== "Contact"), { question: "Contact", answer: contactSummary }]
      : answers;
    setAnswers(answersWithContact);

    setPending(true);
    try {
      await postIntake(answersWithContact, { name, email, phone });
    } catch {
      setError("Network error. Try again or email shawn@ikosagon.com.");
    } finally {
      setPending(false);
    }
  };

  const submitContactSkip = async () => {
    pushUser("Skipped contact — path + picks to the agentic Ikosagon engine");
    setPending(true);
    setError(null);
    try {
      await postIntake(answers, {});
    } catch {
      setError("Network error. Try again or email shawn@ikosagon.com.");
    } finally {
      setPending(false);
    }
  };

  const finishAnonymous = async () => {
    pushUser("Finish anonymously — path + leans to the agentic Ikosagon engine");
    setPending(true);
    setError(null);
    try {
      await postIntake(answers, {});
    } catch {
      setError("Network error. Try again or email shawn@ikosagon.com.");
    } finally {
      setPending(false);
    }
  };

  return { submitIntake, submitContactSkip, finishAnonymous };
}
