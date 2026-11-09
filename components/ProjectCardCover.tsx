"use client";

import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

type ProjectCardCoverProps = {
  cover: string;
  coverFit?: "contain" | "cover";
  coverLoop?: string;
  coverLoopPoster?: string;
  title: string;
  /** Wrapper/media height classes. Default matches ProjectCard (h-40). */
  className?: string;
  /** Accessible alt for the static image (featured hero). Empty for decorative card covers. */
  alt?: string;
};

/**
 * Project card / featured media: static cover, or a muted autoplay loop when coverLoop is set.
 * prefers-reduced-motion shows the poster/cover only (no autoplay).
 */
export function ProjectCardCover({
  cover,
  coverFit,
  coverLoop,
  coverLoopPoster,
  title,
  className = "h-40 w-full",
  alt = "",
}: ProjectCardCoverProps) {
  const reduced = usePrefersReducedMotion();
  const fitClass =
    coverFit === "cover" ? "object-cover object-center" : "object-contain object-top";
  const poster = coverLoopPoster || cover;
  const sizeClass = className;

  if (!coverLoop || reduced) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static public covers
      <img
        src={coverLoop && reduced ? poster : cover}
        alt={alt}
        width={coverFit === "cover" ? 1600 : 800}
        height={coverFit === "cover" ? 840 : 480}
        className={`pointer-events-none transition group-hover:scale-[1.02] ${sizeClass} ${fitClass}`}
      />
    );
  }

  return (
    <div className={`relative overflow-hidden ${sizeClass}`}>
      {/* Poster underneath while the loop loads */}
      {/* eslint-disable-next-line @next/next/no-img-element -- static public covers */}
      <img
        src={poster}
        alt=""
        width={1600}
        height={840}
        className={`absolute inset-0 h-full w-full ${fitClass}`}
        aria-hidden
      />
      <video
        className={`pointer-events-none absolute inset-0 h-full w-full transition group-hover:scale-[1.02] ${fitClass}`}
        src={coverLoop}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={alt || `${title} preview`}
      />
    </div>
  );
}
