import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { AudioPlaylist } from "@/components/AudioPlaylist";
import { TalentIntakeChat } from "@/components/TalentIntakeChat";
import { IkoAgentDemo } from "@/components/IkoAgentDemo";
import { getAllProjects, getProjectBySlug, getProjects } from "@/lib/projects";

type Params = { slug: string };

export async function generateStaticParams() {
  const projects = await getAllProjects();
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) return {};
  const description = project.description ?? project.summary;
  const url = `/projects/${project.slug}`;
  const images = project.ogImage
    ? [{ url: project.ogImage, width: 1200, height: 630, alt: `${project.title} by Ikosagon` }]
    : [{ url: "/opengraph-image" }];
  return {
    title: project.title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${project.title} | Ikosagon`, description, url, siteName: "Ikosagon", type: "website", images },
    twitter: { card: "summary_large_image", title: `${project.title} | Ikosagon`, description, images: images.map((i) => i.url) },
    ...(project.unlisted ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function ProjectDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const projects = await getProjects();
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  // Unlisted pages are not part of the prev/next sequence.
  const index = project.unlisted ? -1 : projects.findIndex((entry) => entry.slug === slug);
  const prev = index > 0 ? projects[index - 1] : null;
  const next = index >= 0 && index < projects.length - 1 ? projects[index + 1] : null;
  const isIkoArtist = project.slug === "ikoartist";
  const isIkoAgent = project.slug === "ikoagent";

  return (
    <article className="container-shell section-block">
      <header className="mb-8 border-b border-border/80 pb-6">
        <p className="mb-2 font-mono text-sm text-accent">{project.year}</p>
        <h1 className="mb-3 font-[var(--font-space-grotesk)] text-4xl font-bold">{project.title}</h1>
        <p className="max-w-3xl text-zinc-300">{project.summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-border px-3 py-1 text-xs text-zinc-300">
              {tag}
            </span>
          ))}
        </div>
      </header>

      {project.tracks?.length ? (
        <AudioPlaylist
          tracks={project.tracks}
          heading={isIkoArtist ? "Leaderboard playlist · ranked by views" : "Demo playlist"}
        />
      ) : null}

      {isIkoArtist ? <TalentIntakeChat /> : null}

      {isIkoAgent ? <IkoAgentDemo /> : null}

      {isIkoAgent ? (
        <Link
          href="/projects/ikoagent/evals"
          className="card-surface mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 p-5 no-underline hover:border-accent"
        >
          <span>
            <span className="block font-mono text-xs text-accent">Evals</span>
            <span className="text-zinc-200">See how we test every release: pass rates by flow, safety guards, and example cases.</span>
          </span>
          <span className="font-mono text-sm text-accent">View eval report →</span>
        </Link>
      ) : null}

      <div className="prose-project max-w-none">
        <MDXRemote source={project.content} />
      </div>

      {isIkoArtist ? (
        <section className="card-surface mt-10 rounded-2xl border border-dashed border-accent/35 p-6">
          <p className="mb-2 font-mono text-xs text-accent">Optional next step</p>
          <h2 className="mb-3 text-2xl font-semibold">Want opportunity follow-up?</h2>
          <p className="mb-4 max-w-3xl text-zinc-300">
            Anonymous is fine: answer as many questions as you want, get 3 track leans, and that
            signal still feeds the agentic Ikosagon engine so a song can get made. Leave an email
            only if you want opportunity follow-ups. This page does not auto-spend on Suno,
            ElevenLabs, or Gemini.
          </p>
          <p className="text-sm text-zinc-400">
            Low commitment — more answers → clearer signal. Tracks compete on a view-ranked
            leaderboard. No account. No invented public prices.
          </p>
        </section>
      ) : null}

      <footer className="mt-10 flex flex-wrap items-center gap-5 border-t border-border/80 pt-6">
        {project.repo ? (
          <a href={project.repo} target="_blank" rel="noreferrer" className="text-accent">
            Repository
          </a>
        ) : null}
        {project.demo ? (
          <a href={project.demo} className="text-accent">
            Open the demo
          </a>
        ) : null}
        {project.live ? (
          <a href={project.live} target="_blank" rel="noreferrer" className="text-accent">
            Live Site
          </a>
        ) : null}
      </footer>

      <nav className="mt-10 grid gap-3 border-t border-border/80 pt-6 md:grid-cols-2">
        <div>{prev ? <Link href={`/projects/${prev.slug}`}>← {prev.title}</Link> : null}</div>
        <div className="text-left md:text-right">{next ? <Link href={`/projects/${next.slug}`}>{next.title} →</Link> : null}</div>
      </nav>
    </article>
  );
}
