import type { Metadata } from "next";
import { cleanPrefill } from "@/lib/contact-prefill";

export const metadata: Metadata = {
  alternates: { canonical: "/contact" },
  title: "Contact",
  description:
    "Start a project with Ikosagon, or get in touch about a role (contract or selected full-time, Toronto hybrid or remote).",
};

type ContactPageProps = {
  searchParams: Promise<{ sent?: string; topic?: string; name?: string | string[]; subject?: string | string[] }>;
};


export default async function ContactPage({ searchParams }: ContactPageProps) {
  const { sent, topic, name: rawName, subject: rawSubject } = await searchParams;
  const prefillName = cleanPrefill(rawName, 60), prefillSubject = cleanPrefill(rawSubject, 80);
  const showSuccess = sent === "1";
  /* "Book a short intro call" links here with ?topic=project: the Start a project form is the one to use */
  const introCall = topic === "project";

  return (
    <div className="container-shell section-block">
      <h1 className="mb-4 font-[var(--font-space-grotesk)] text-4xl font-bold">Contact</h1>
      <p className="mb-2 max-w-3xl text-zinc-300">
        Two ways to reach us. Start a project with us at Ikosagon, or get in touch about a role
        (contract or selected full-time, Toronto hybrid or remote).
      </p>
      <p className="mb-8 text-zinc-400">
        Email:{" "}
        <a href="mailto:shawn@ikosagon.com" className="text-accent hover:underline">
          shawn@ikosagon.com
        </a>
      </p>

      {showSuccess && (
        <p className="mb-6 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-accent" role="status">
          Thanks. Your message was sent. We&apos;ll get back to you soon.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section id="build" className="scroll-mt-24">
          <h2 className="mb-2 text-2xl font-semibold">Start a project</h2>
          <p className="mb-4 text-sm text-zinc-400">
            Tell us how things work today, where they get stuck, and what a good result would look
            like. We&apos;ll take it from there.
          </p>
          {introCall ? (
            <p className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent" role="note">
              Booking a short intro call: share a line or two about your business and the workflow you&apos;d
              like to improve, and we&apos;ll suggest a time to talk.
            </p>
          ) : null}
          <form action="/api/contact" method="POST" className="card-surface space-y-4 rounded-2xl p-6">
            <input type="hidden" name="door" value="build" />
            {prefillSubject ? (
              <p className="text-sm text-zinc-400" role="note">
                About: {prefillSubject}
              </p>
            ) : null}
            <input name="name" required placeholder="Name" defaultValue={prefillName || undefined} className="w-full rounded-xl border border-border bg-black/40 px-4 py-2" />
            <input
              name="email"
              type="email"
              required
              placeholder="Email"
              className="w-full rounded-xl border border-border bg-black/40 px-4 py-2"
            />
            <input
              name="projectType"
              placeholder="Project type (new app, linking tools, AI helper...)"
              defaultValue={prefillSubject || (introCall ? "Short intro call" : undefined)}
              className="w-full rounded-xl border border-border bg-black/40 px-4 py-2"
            />
            <textarea
              name="message"
              required
              rows={6}
              placeholder="What would you like to improve or build?"
              className="w-full rounded-xl border border-border bg-black/40 px-4 py-2"
            />
            <button type="submit" className="rounded-xl bg-accent px-5 py-2 font-semibold text-black">
              Send project details
            </button>
          </form>
        </section>

        <section id="hiring" className="scroll-mt-24">
          <h2 className="mb-2 text-2xl font-semibold">Hiring</h2>
          <p className="mb-4 text-sm text-zinc-400">
            Have a role in mind? Contract or selected full-time, Toronto hybrid or remote. There&apos;s no
            public resume, so email us or use the form.
          </p>
          <form action="/api/contact" method="POST" className="card-surface space-y-4 rounded-2xl p-6">
            <input type="hidden" name="door" value="hiring" />
            <input name="name" required placeholder="Your name" className="w-full rounded-xl border border-border bg-black/40 px-4 py-2" />
            <input
              name="email"
              type="email"
              required
              placeholder="Work email"
              className="w-full rounded-xl border border-border bg-black/40 px-4 py-2"
            />
            <input
              name="projectType"
              placeholder="Role title · contract or full-time · Toronto hybrid or remote"
              className="w-full rounded-xl border border-border bg-black/40 px-4 py-2"
            />
            <textarea
              name="message"
              required
              rows={6}
              placeholder="The team, the tools you use, and your timeline..."
              className="w-full rounded-xl border border-border bg-black/40 px-4 py-2"
            />
            <button type="submit" className="rounded-xl bg-accent px-5 py-2 font-semibold text-black">
              Send hiring note
            </button>
          </form>
          <p className="mt-4 text-sm text-zinc-400">
            Prefer inbox:{" "}
            <a href="mailto:shawn@ikosagon.com?subject=Hiring%20%2F%20role" className="text-accent hover:underline">
              shawn@ikosagon.com
            </a>
          </p>
        </section>
      </div>

      <p className="mt-6 text-sm text-zinc-500">
        Prefer a call? Mention your timezone in the message and we&apos;ll suggest times.
      </p>
    </div>
  );
}
