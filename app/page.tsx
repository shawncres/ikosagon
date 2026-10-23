import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "@/components/Hero";
import { ProjectCard } from "@/components/ProjectCard";
import { StartSmall } from "@/components/StartSmall";
import { getFeaturedProjects } from "@/lib/projects";

/** Title and description come from the root layout; the home page only sets its own canonical. */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const HOW_WE_WORK = [
  {
    title: "Understand",
    body: "We learn your business the way an expert in your field would: your customers, your team, and where the day gets stuck.",
  },
  {
    title: "Connect",
    body: "We find the right technology to tie your tools and data together, so information flows instead of being typed in twice.",
  },
  {
    title: "Improve",
    body: "We simplify the steps that slow people down, and shape the software around how your team actually works.",
  },
  {
    title: "Deliver",
    body: "You get results you can measure, like time saved, fewer manual steps and fewer mistakes to fix later.",
  },
  {
    title: "Grow safely",
    body: "We bring in new AI where it truly helps, and test it carefully, so the systems, data and processes that already work stay protected.",
  },
];

export default async function Home() {
  const featured = await getFeaturedProjects();

  return (
    <>
      <Hero />
      <section className="section-block border-y border-border/80 py-10 md:py-12">
        <div className="container-shell">
          <article className="card-surface neon-border grid items-center gap-6 rounded-2xl p-6 md:grid-cols-[1fr_1.1fr] md:p-8">
            <div>
              <p className="mb-2 font-mono text-sm text-accent">Featured app</p>
              <h2 className="mb-3 text-3xl font-semibold">IkoLearn</h2>
              <p className="mb-4 max-w-3xl text-zinc-300">
                A thoughtful learning harness for anyone curious, at any age. We at Ikosagon built it so
                curiosity turns into real foundations: say what you enjoy, and IkoLearn grows a learning
                cloud of subjects and topics in a sensible order, with short lessons that teach, then check.
              </p>
              <p className="mb-5 max-w-3xl text-sm text-zinc-400">
                Cards fill in as the learning sticks, and parents can also use it to plan and guide
                homeschool learning. No account needed; your learning stays on your device.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/ikolearn" className="rounded-xl bg-accent px-4 py-2 font-semibold text-black">
                  Open IkoLearn
                </Link>
                <Link href="/projects/ikolearn" className="rounded-xl border border-border px-4 py-2 transition hover:border-accent">
                  About the project
                </Link>
              </div>
            </div>
            <Link href="/ikolearn" aria-label="Open IkoLearn" className="block overflow-hidden rounded-xl border border-border transition hover:border-accent">
              {/* eslint-disable-next-line @next/next/no-img-element -- static public asset, same as project cards */}
              <img
                src="/projects/ikolearn/cover.png"
                alt="IkoLearn: a short lesson with its card, a few cards to pick up next, and a learning cloud with subjects like Ocean Life, Astronomy, Music, Cooking and History."
                width={1600}
                height={840}
                className="h-auto w-full"
              />
            </Link>
          </article>
        </div>
      </section>
      <section className="section-block border-y border-border/80">
        <div className="container-shell">
          <h2 className="mb-6 text-3xl font-semibold">Featured Projects</h2>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {featured.slice(0, 6).map((project) => (
              <ProjectCard key={project.slug} project={project} />
            ))}
          </div>
          <div className="mt-8">
            <Link href="/projects" className="text-accent">
              See all projects →
            </Link>
          </div>
        </div>
      </section>
      <section className="section-block border-b border-border/80">
        <div className="container-shell">
          <article className="card-surface rounded-2xl p-6 md:p-8">
            <h2 className="mb-2 text-3xl font-semibold">How we work</h2>
            <p className="mb-6 max-w-3xl text-zinc-300">
              We at Ikosagon follow the same five steps on every project, big or small.
            </p>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {HOW_WE_WORK.map((step, i) => (
                <li key={step.title} className="rounded-xl border border-border p-4">
                  <p className="mb-1 font-mono text-sm text-accent">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mb-2 font-semibold text-zinc-100">{step.title}</h3>
                  <p className="text-sm text-zinc-300">{step.body}</p>
                </li>
              ))}
            </ol>
          </article>
        </div>
      </section>
      <section className="section-block border-b border-border/80">
        <div className="container-shell">
          <StartSmall />
        </div>
      </section>
      <section className="section-block">
        <div className="container-shell grid gap-6 md:grid-cols-2">
          <article className="card-surface rounded-2xl p-6">
            <h3 className="mb-3 text-2xl font-semibold">What we do</h3>
            <p className="mb-2 text-zinc-300">
              We at Ikosagon build and improve software for small businesses through to larger teams:
              web apps, links between the tools you already use (like the system that holds your
              customer records), and AI assistants that answer from your own documents.
            </p>
            <p className="text-zinc-300">
              We also write software for connected devices, such as sensors and small on-site
              computers, and we test everything carefully before your customers see it. It can run on
              your own servers or in the cloud.
            </p>
          </article>
          <article className="card-surface rounded-2xl p-6">
            <h3 className="mb-3 text-2xl font-semibold">Work with us</h3>
            <p className="mb-4 text-zinc-300">
              Have a process that takes too long, or tools that don&apos;t talk to each other? Tell us
              about it. We&apos;re also open to freelance, contract and selected full-time roles, working
              remotely from anywhere.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/contact?topic=project#build" className="rounded-xl bg-accent px-4 py-2 font-semibold text-black">
                Book a short intro call
              </Link>
              <Link href="/contact#hiring" className="rounded-xl border border-border px-4 py-2 transition hover:border-accent">
                Hiring? Get in touch
              </Link>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
