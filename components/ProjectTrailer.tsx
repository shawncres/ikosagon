type ProjectTrailerProps = {
  src: string;
  poster: string;
  title?: string;
  description?: string;
};

/** Inline project-page trailer: muted by default, controls + poster, 16:9. */
export function ProjectTrailer({
  src,
  poster,
  title = "Watch the 1-minute trailer",
  description = "A short tour of IkoLearn: the curiosity prompt, the learning cloud, lessons and cards, dark mode, and the deck.",
}: ProjectTrailerProps) {
  return (
    <figure className="card-surface mb-10 overflow-hidden rounded-2xl border border-border/80">
      <div className="border-b border-border/80 px-5 py-4 md:px-6">
        <p className="mb-1 font-mono text-xs text-accent">{title}</p>
        <p className="max-w-3xl text-sm text-zinc-400">{description}</p>
      </div>
      <div className="relative aspect-video w-full bg-black">
        <video
          className="h-full w-full rounded-none object-contain"
          controls
          playsInline
          preload="metadata"
          poster={poster}
          muted
          title={title}
          aria-label={title}
        >
          <source src={src} type="video/mp4" />
          Your browser does not support the video tag. {description}
        </video>
      </div>
      <figcaption className="sr-only">{description}</figcaption>
    </figure>
  );
}
