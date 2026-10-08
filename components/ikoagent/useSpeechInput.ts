"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Browser speech-to-text (Web Speech API). Audio never touches our server: the browser
 * turns speech into text (Chrome/Edge do this via the vendor's cloud service) and only
 * the final text is sent as a normal turn.
 */

type RecognitionAlternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; 0: RecognitionAlternative; length: number };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string };

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
};

type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Friendly message for a recognition error code (null = ignore silently) */
export function speechErrorMessage(code: string): string | null {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission was denied — allow it in the address bar, or keep typing.";
    case "no-speech":
      return "Didn't catch that — hold the mic and try again.";
    case "audio-capture":
      return "No microphone found — you can keep typing.";
    case "network":
      return "The browser's speech service is unreachable — please type instead.";
    case "language-not-supported":
      return "Speech input isn't available for this language in your browser.";
    case "aborted":
      return null;
    default:
      return "Speech input stopped — you can try again or type.";
  }
}

export function useSpeechInput(opts: {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  /** Called right before listening starts (barge-in: stop agent TTS) */
  onBeforeStart?: () => void;
  lang?: string;
}) {
  // null during SSR / before hydration, then whether the browser exposes the API
  const supported = useSyncExternalStore<boolean | null>(noopSubscribe, () => Boolean(getRecognitionCtor()), () => null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");
  const optsRef = useRef(opts);

  useEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recRef.current) return;
    optsRef.current.onBeforeStart?.();
    setError(null);
    finalRef.current = "";
    const rec = new Ctor();
    rec.lang = optsRef.current.lang ?? "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      optsRef.current.onInterim((finalRef.current + interim).trim());
    };
    rec.onerror = (e) => {
      const msg = speechErrorMessage(e.error);
      if (msg) setError(msg);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      const text = finalRef.current.trim();
      finalRef.current = "";
      if (text) optsRef.current.onFinal(text);
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
      setError("Speech input couldn't start — you can keep typing.");
    }
  }, []);

  const cancel = useCallback(() => {
    finalRef.current = "";
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
  }, []);

  return { supported, listening, error, start, stop, cancel, clearError: () => setError(null) };
}
