"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_PHOTO_BYTES,
  MAX_RECORD_SECONDS,
  MAX_VOICE_BYTES,
  type MediaPayload,
  type StepId,
} from "@/components/talentIntakeConfig";
import { blobToBase64 } from "@/components/talentIntakeUtils";

type MediaDeps = {
  setError: (value: string | null) => void;
  pushUser: (content: string) => void;
  recordAnswer: (questionKey: StepId, answer: string) => void;
  goTo: (next: StepId) => void;
};

export function useTalentIntakeMedia({ setError, pushUser, recordAnswer, goTo }: MediaDeps) {
  const [voice, setVoice] = useState<MediaPayload>(null);
  const [photo, setPhoto] = useState<MediaPayload>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartedAt = useRef(0);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }, []);

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported in this browser. Skip or use contact instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recordStartedAt.current = Date.now();
      setRecordSeconds(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const durationSeconds = Math.max(1, Math.round((Date.now() - recordStartedAt.current) / 1000));
        if (blob.size > MAX_VOICE_BYTES) {
          setVoice({
            filename: "voice-sample.webm",
            mimeType: blob.type,
            base64: "",
            sizeBytes: blob.size,
            durationSeconds,
          });
          setError(
            `Clip is ~${Math.round(blob.size / 1024)} KB — too large to email on Hobby. We’ll note the length (~${durationSeconds}s) without attaching.`,
          );
          return;
        }
        const base64 = await blobToBase64(blob);
        const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
        setVoice({
          filename: `voice-sample.${ext}`,
          mimeType: blob.type || "audio/webm",
          base64,
          sizeBytes: blob.size,
          durationSeconds,
        });
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
      recordTimerRef.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - recordStartedAt.current) / 1000);
        setRecordSeconds(elapsed);
        if (elapsed >= MAX_RECORD_SECONDS) stopRecording();
      }, 250);
    } catch {
      setError("Microphone permission denied or unavailable. Skip voice if you prefer.");
    }
  };

  const confirmVoice = () => {
    if (!voice) {
      setError("Record a short clip, or skip.");
      return;
    }
    const label = voice.base64
      ? `Voice sample (~${voice.durationSeconds ?? "?"}s, ${Math.round(voice.sizeBytes / 1024)} KB)`
      : `Voice captured (~${voice.durationSeconds ?? "?"}s) — email attach skipped (size)`;
    pushUser(label);
    recordAnswer("voice", label);
    goTo("photo");
  };

  const onPhotoSelected = async (file: File | null) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhoto({ filename: file.name, mimeType: file.type, base64: "", sizeBytes: file.size });
      setError(
        `Photo is ~${Math.round(file.size / 1024)} KB — too large to attach on Hobby email. We’ll note it without attaching.`,
      );
      return;
    }
    const base64 = await blobToBase64(file);
    setPhoto({
      filename: file.name.slice(0, 120) || "artist-photo.jpg",
      mimeType: file.type,
      base64,
      sizeBytes: file.size,
    });
  };

  const confirmPhoto = () => {
    if (!photo) {
      setError("Choose a photo, or skip.");
      return;
    }
    const label = photo.base64
      ? `Photo uploaded (${photo.filename}, ${Math.round(photo.sizeBytes / 1024)} KB)`
      : `Photo selected (${photo.filename}) — email attach skipped (size)`;
    pushUser(label);
    recordAnswer("photo", label);
    goTo("contact");
  };

  return {
    voice,
    photo,
    recording,
    recordSeconds,
    startRecording,
    stopRecording,
    confirmVoice,
    onPhotoSelected,
    confirmPhoto,
  };
}
