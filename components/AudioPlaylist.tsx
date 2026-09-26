"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

export type PlaylistTrack = {
  title: string;
  src: string;
  note?: string;
};

type AudioPlaylistProps = {
  tracks: PlaylistTrack[];
  heading?: string;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlaylist({ tracks, heading = "Demo playlist" }: AudioPlaylistProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const track = tracks[index];

  const playIndex = useCallback(async (nextIndex: number) => {
    const audio = audioRef.current;
    if (!audio || !tracks[nextIndex]) return;
    setIndex(nextIndex);
    audio.src = tracks[nextIndex].src;
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [tracks]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    if (!audio.src || !audio.src.includes(track.src)) {
      audio.src = track.src;
    }
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [playing, track]);

  const goPrev = useCallback(() => {
    if (!tracks.length) return;
    const next = (index - 1 + tracks.length) % tracks.length;
    void playIndex(next);
  }, [index, playIndex, tracks.length]);

  const goNext = useCallback(() => {
    if (!tracks.length) return;
    const next = (index + 1) % tracks.length;
    void playIndex(next);
  }, [index, playIndex, tracks.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      const next = index + 1;
      if (next < tracks.length) {
        void playIndex(next);
      } else {
        setPlaying(false);
        setCurrentTime(0);
      }
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
    };
  }, [index, playIndex, tracks.length]);

  if (!tracks.length || !track) return null;

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <section className="card-surface neon-border mb-10 rounded-2xl p-5 md:p-6" aria-label={heading}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 font-mono text-xs text-accent">{heading}</p>
          <h2 className="text-xl font-semibold">{track.title}</h2>
          {track.note ? <p className="mt-1 text-sm text-zinc-400">{track.note}</p> : null}
        </div>
        <p className="font-mono text-xs text-zinc-500">
          {formatTime(currentTime)} / {formatTime(duration)}
        </p>
      </div>

      <audio ref={audioRef} preload="metadata" className="hidden" />

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
      </div>

      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={goPrev}
          className="rounded-xl border border-border p-2 text-zinc-200 transition hover:border-accent/50"
          aria-label="Previous track"
        >
          <SkipBack className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => void togglePlay()}
          className="rounded-xl bg-accent px-4 py-2 font-semibold text-black transition hover:opacity-90"
          aria-label={playing ? "Pause" : "Play"}
        >
          <span className="inline-flex items-center gap-2">
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            {playing ? "Pause" : "Play"}
          </span>
        </button>
        <button
          type="button"
          onClick={goNext}
          className="rounded-xl border border-border p-2 text-zinc-200 transition hover:border-accent/50"
          aria-label="Next track"
        >
          <SkipForward className="h-5 w-5" />
        </button>
      </div>

      <ol className="space-y-2">
        {tracks.map((entry, i) => {
          const active = i === index;
          return (
            <li key={entry.src}>
              <button
                type="button"
                onClick={() => void playIndex(i)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${
                  active
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-border text-zinc-300 hover:border-accent/40"
                }`}
              >
                <span className="font-medium">
                  {i + 1}. {entry.title}
                </span>
                {entry.note ? <span className="shrink-0 text-xs text-zinc-500">{entry.note}</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
