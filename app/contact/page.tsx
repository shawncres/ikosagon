import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Two doors: build with Ikosagon, or hire Shawn Cooper (contract or full-time, remote / work-from-anywhere).",
};

type ContactPageProps = {
  searchParams: Promise<{ sent?: string }>;
};

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const { sent } = await searchParams;
  const showSuccess = sent === "1";

  return (
    <div className="container-shell section-block">
      <h1 className="mb-4 font-[var(--font-space-grotesk)] text-4xl font-bold">Contact</h1>
      <p className="mb-2 max-w-3xl text-zinc-300">
        Two doors. Build with us at Ikosagon on a product or process upgrade — or reach Shawn for a
        role (contract or full-time, remote / work-from-anywhere).
      </p>
      <p className="mb-8 text-zinc-400">
        Email:{" "}
        <a href="mailto:shawn@ikosagon.com" className="text-accent hover:underline">
          shawn@ikosagon.com
        </a>
      </p>

      {showSuccess && (
        <p className="mb-6 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-accent" role="status">
          Thanks. Your message was sent. I will get back to you soon.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section id="build" className="scroll-mt-24">
          <h2 className="mb-2 text-2xl font-semibold">Build</h2>
          <p className="mb-4 text-sm text-zinc-400">
            Studio ops: tell us what process you want to upgrade, where you are stuck, and what success
            looks like.
          </p>
          <form action="/api/contact" method="POST" className="card-surface space-y-4 rounded-2xl p-6">
            <input type="hidden" name="door" value="build" />
            <input name="name" required placeholder="Name" className="w-full rounded-xl border border-border bg-black/40 px-4 py-2" />
            <input
              name="email"
              type="email"
              required
              placeholder="Email"
              className="w-full rounded-xl border border-border bg-black/40 px-4 py-2"
            />
            <input
              name="projectType"
              placeholder="Project type (MVP, redesign, AI workflow, full-stack app...)"
              className="w-full rounded-xl border border-border bg-black/40 px-4 py-2"
            />
            <textarea
              name="message"
              required
              rows={6}
              placeholder="What should we upgrade or build?"
              className="w-full rounded-xl border border-border bg-black/40 px-4 py-2"
            />
            <button type="submit" className="rounded-xl bg-accent px-5 py-2 font-semibold text-black">
              Send build inquiry
            </button>
          </form>
        </section>

        <section id="hiring" className="scroll-mt-24">
          <h2 className="mb-2 text-2xl font-semibold">Hiring</h2>
          <p className="mb-4 text-sm text-zinc-400">
            Role, contract or full-time, remote / work-from-anywhere. No public resume PDF — email or
            use the form.
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
              placeholder="Role title · contract or full-time · remote / WFA"
              className="w-full rounded-xl border border-border bg-black/40 px-4 py-2"
            />
            <textarea
              name="message"
              required
              rows={6}
              placeholder="Team, stack, why Shawn, timeline..."
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
        Prefer a call? Mention your timezone in the message and I will suggest times.
      </p>
    </div>
  );
}
