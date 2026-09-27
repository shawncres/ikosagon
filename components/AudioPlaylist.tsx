"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
export type PlaylistTrack = { title: string; src: string; note?: string };
type Props = { tracks: PlaylistTrack[]; heading?: string };
type Phase = "idle" | "trying" | "playing" | "muted" | "blocked";
function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec \u003c 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function shuffleOrder(n: number, prefer?: number) {
  const order = Array.from({ length: n }, (_, i) =\u003e i);
  for (let i = n - 1; i \u003e 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (prefer !== undefined && n \u003e 1) {
    const at = order.indexOf(prefer);
    if (at \u003e 0) {
      order.splice(at, 1);
      order.unshift(prefer);
    }
  }
  return order;
}
export function AudioPlaylist({ tracks, heading = "Demo playlist" }: Props) {
  const audioRef = useRef\u003cHTMLAudioElement | null\u003e(null);
  const triedRef = useRef(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(true);
  const [order, setOrder] = useState\u003cnumber[]\u003e(() =\u003e (tracks.length ? shuffleOrder(tracks.length, 0) : []));
  const [phase, setPhase] = useState\u003cPhase\u003e("idle");
  const track = tracks[index];
  const orderIndex = useMemo(() =\u003e {
    const at = order.indexOf(index);
    return at \u003e= 0 ? at : 0;
  }, [index, order]);
  const rebuildOrder = useCallback(
    (current: number, on: boolean) =\u003e {
      if (!tracks.length) return setOrder([]);
      setOrder(on ? shuffleOrder(tracks.length, current) : Array.from({ length: tracks.length }, (_, i) =\u003e i));
    },
    [tracks.length],
  );
  useEffect(() =\u003e {
    rebuildOrder(0, true);
  }, [tracks, rebuildOrder]);
  const playIndex = useCallback(
    async (next: number, opts?: { muted?: boolean }) =\u003e {
      const audio = audioRef.current;
      if (!audio || !tracks[next]) return false;
      setIndex(next);
      audio.src = tracks[next].src;
      if (opts?.muted !== undefined) {
        audio.muted = opts.muted;
        setMuted(opts.muted);
      }
      try {
        await audio.play();
        setPlaying(true);
        return true;
      } catch {
        setPlaying(false);
        return false;
      }
    },
    [tracks],
  );
  const unlockAndPlay = useCallback(async () =\u003e {
    const audio = audioRef.current;
    if (!audio || !track) return;
    audio.muted = false;
    setMuted(false);
    audio.volume = volume;
    if (!audio.src || !audio.src.includes(track.src)) audio.src = track.src;
    try {
      await audio.play();
      setPlaying(true);
      setPhase("playing");
    } catch {
      setPlaying(false);
      setPhase("blocked");
    }
  }, [track, volume]);
  const togglePlay = useCallback(async () =\u003e {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    await unlockAndPlay();
  }, [playing, track, unlockAndPlay]);
  const step = useCallback(
    (delta: 1 | -1) =\u003e {
      if (!tracks.length || !order.length) return;
      void playIndex(order[(orderIndex + delta + order.length) % order.length]!);
    },
    [order, orderIndex, playIndex, tracks.length],
  );
  useEffect(() =\u003e {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);
  useEffect(() =\u003e {
    if (!tracks.length || triedRef.current) return;
    triedRef.current = true;
    let cancelled = false;
    (async () =\u003e {
      setPhase("trying");
      const audio = audioRef.current;
      if (!audio || !tracks[0]) return;
      audio.src = tracks[0].src;
      audio.volume = volume;
      audio.muted = false;
      setMuted(false);
      setIndex(0);
      try {
        await audio.play();
        if (!cancelled) {
          setPlaying(true);
          setPhase("playing");
        }
        return;
      } catch {
        /* try muted */
      }
      try {
        audio.muted = true;
        setMuted(true);
        await audio.play();
        if (!cancelled) {
          setPlaying(true);
          setPhase("muted");
        }
      } catch {
        if (!cancelled) {
          setPlaying(false);
          setMuted(false);
          audio.muted = false;
          setPhase("blocked");
        }
      }
    })();
    return () =\u003e {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);
  useEffect(() =\u003e {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () =\u003e setCurrentTime(audio.currentTime);
    const onMeta = () =\u003e setDuration(audio.duration || 0);
    const onEnded = () =\u003e {
      if (!order.length) {
        setPlaying(false);
        setCurrentTime(0);
        return;
      }
      const nextPos = orderIndex + 1;
      if (nextPos \u003c order.length) void playIndex(order[nextPos]!);
      else if (shuffle) {
        const fresh = shuffleOrder(tracks.length);
        setOrder(fresh);
        void playIndex(fresh[0]!);
      } else {
        setPlaying(false);
        setCurrentTime(0);
      }
    };
    const onPause = () =\u003e setPlaying(false);
    const onPlay = () =\u003e setPlaying(true);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () =\u003e {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
    };
  }, [order, orderIndex, playIndex, shuffle, tracks.length]);
  if (!tracks.length || !track) return null;
  const progress = duration \u003e 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const showTap = phase === "muted" || phase === "blocked";
  const btn = "rounded-xl border border-border p-2 text-zinc-200 transition hover:border-accent/50";
  return (
    \u003csection className="card-surface neon-border mb-10 rounded-2xl p-5 md:p-6" aria-label={heading}\u003e
      \u003cdiv className="mb-4 flex flex-wrap items-end justify-between gap-3"\u003e
        \u003cdiv\u003e
          \u003cp className="mb-1 font-mono text-xs text-accent"\u003e{heading}\u003c/p\u003e
          \u003ch2 className="text-xl font-semibold"\u003e{track.title}\u003c/h2\u003e
          {track.note ? \u003cp className="mt-1 text-sm text-zinc-400"\u003e{track.note}\u003c/p\u003e : null}
        \u003c/div\u003e
        \u003cp className="font-mono text-xs text-zinc-500"\u003e
          {fmt(currentTime)} / {fmt(duration)}
        \u003c/p\u003e
      \u003c/div\u003e
      {showTap ? (
        \u003cbutton
          type="button"
          onClick={() =\u003e void unlockAndPlay()}
          className="mb-4 w-full rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-left text-sm text-accent transition hover:bg-accent/15"
        \u003e
          {phase === "muted" ? "Playing muted — tap to unmute" : "Tap to play — browser blocked autoplay"}
        \u003c/button\u003e
      ) : null}
      \u003caudio ref={audioRef} preload="metadata" className="hidden" playsInline /\u003e
      \u003cdiv className="mb-4 h-1.5 overflow-hidden rounded-full bg-border"\u003e
        \u003cdiv className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} /\u003e
      \u003c/div\u003e
      \u003cdiv className="mb-4 flex flex-wrap items-center gap-3"\u003e
        \u003cbutton type="button" onClick={() =\u003e step(-1)} className={btn} aria-label="Previous track"\u003e
          \u003cSkipBack className="h-5 w-5" /\u003e
        \u003c/button\u003e
        \u003cbutton
          type="button"
          onClick={() =\u003e void togglePlay()}
          className="rounded-xl bg-accent px-4 py-2 font-semibold text-black transition hover:opacity-90"
          aria-label={playing ? "Pause" : "Play"}
        \u003e
          \u003cspan className="inline-flex items-center gap-2"\u003e
            {playing ? \u003cPause className="h-5 w-5" /\u003e : \u003cPlay className="h-5 w-5" /\u003e}
            {playing ? "Pause" : "Play"}
          \u003c/span\u003e
        \u003c/button\u003e
        \u003cbutton type="button" onClick={() =\u003e step(1)} className={btn} aria-label="Next track"\u003e
          \u003cSkipForward className="h-5 w-5" /\u003e
        \u003c/button\u003e
        \u003cbutton
          type="button"
          onClick={() =\u003e
            setShuffle((prev) =\u003e {
              const next = !prev;
              rebuildOrder(index, next);
              return next;
            })
          }
          className={`rounded-xl border p-2 transition ${
            shuffle ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-zinc-200 hover:border-accent/50"
          }`}
          aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
          aria-pressed={shuffle}
          title={shuffle ? "Shuffle on (default)" : "Shuffle off"}
        \u003e
          \u003cShuffle className="h-5 w-5" /\u003e
        \u003c/button\u003e
        \u003cdiv className="ml-auto flex min-w-[10rem] flex-1 items-center gap-2 sm:max-w-xs"\u003e
          \u003cbutton
            type="button"
            onClick={() =\u003e setMuted((m) =\u003e !m)}
            className={btn}
            aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
          \u003e
            {muted || volume === 0 ? \u003cVolumeX className="h-5 w-5" /\u003e : \u003cVolume2 className="h-5 w-5" /\u003e}
          \u003c/button\u003e
          \u003clabel className="sr-only" htmlFor="playlist-volume"\u003e
            Volume
          \u003c/label\u003e
          \u003cinput
            id="playlist-volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) =\u003e {
              const next = Number(e.target.value);
              setVolume(next);
              if (next \u003e 0 && muted) setMuted(false);
              if (phase === "muted" && next \u003e 0) void unlockAndPlay();
            }}
            className="h-1.5 w-full cursor-pointer accent-[var(--accent,#22d3ee)]"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((muted ? 0 : volume) * 100)}
          /\u003e
        \u003c/div\u003e
      \u003c/div\u003e
      \u003col className="space-y-2"\u003e
        {tracks.map((entry, i) =\u003e {
          const active = i === index;
          return (
            \u003cli key={entry.src}\u003e
              \u003cbutton
                type="button"
                onClick={() =\u003e {
                  void playIndex(i, { muted: false }).then((ok) =\u003e {
                    if (ok) setPhase("playing");
                  });
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${
                  active
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-border text-zinc-300 hover:border-accent/40"
                }`}
              \u003e
                \u003cspan className="font-medium"\u003e
                  {i + 1}. {entry.title}
                \u003c/span\u003e
                {entry.note ? \u003cspan className="shrink-0 text-xs text-zinc-500"\u003e{entry.note}\u003c/span\u003e : null}
              \u003c/button\u003e
            \u003c/li\u003e
          );
        })}
      \u003c/ol\u003e
    \u003c/section\u003e
  );
}
