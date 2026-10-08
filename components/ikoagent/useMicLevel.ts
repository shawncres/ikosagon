"use client";

import { useEffect, useState } from "react";

/**
 * Caller mic level (0–1) from a local Web Audio AnalyserNode while `active`.
 * The stream never leaves the browser; if getUserMedia/AudioContext is unavailable
 * or denied, `available` stays false and the meter is simply hidden.
 */
export function useMicLevel(active: boolean): { level: number; available: boolean } {
  const [level, setLevel] = useState(0);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (cancelled) return;
        ctx = new AC();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        setAvailable(true);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) {
            const x = (v - 128) / 128;
            sum += x * x;
          }
          const rms = Math.sqrt(sum / buf.length);
          setLevel(Math.min(1, rms * 4));
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
      setLevel(0);
    };
  }, [active]);

  return { level: active ? level : 0, available };
}
