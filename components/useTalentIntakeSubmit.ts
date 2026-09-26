"use client";

import { STEP_PROMPTS, type AnswerRow, type MediaPayload, type StepId } from "@/components/talentIntakeConfig";

type Contact = { name: string; email: string; phone: string };

type SubmitDeps = {
  contact: Contact;
  answers: AnswerRow[];
  setAnswers: (value: AnswerRow[]) => void;
  voice: MediaPayload;
  photo: MediaPayload;
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

  const submitIntake = async () => {
    setError(null);
    const name = contact.name.trim();
    const email = contact.email.trim();
    const phone = contact.phone.trim();

    if (!email && !name && !phone) {
      setError(
        "Add an email (preferred), name, or phone so Shawn can follow up — or skip to send answers only.",
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
      const response = await fetch("/api/talent-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact: { name, email, phone },
          answers: answersWithContact,
          ...mediaBody(voice, photo),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setError(payload.error || "Could not send intake. Try again or use /contact.");
        setPending(false);
        return;
      }
      finishOk();
    } catch {
      setError("Network error. Try again or email shawn@ikosagon.com.");
    } finally {
      setPending(false);
    }
  };

  const submitContactSkip = async () => {
    pushUser("Skipped contact — send answers only");
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/talent-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact: {},
          answers,
          ...mediaBody(voice, photo),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setError(payload.error || "Could not send intake. Try again or use /contact.");
        setPending(false);
        return;
      }
      finishOk();
    } catch {
      setError("Network error. Try again or email shawn@ikosagon.com.");
    } finally {
      setPending(false);
    }
  };

  return { submitIntake, submitContactSkip };
}
