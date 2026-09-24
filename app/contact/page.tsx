import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Start a project with Ikosagon: process upgrades, products, and AI-backed systems.",
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
        Tell me what process you want to upgrade, where you are stuck, and what success looks like.
      </p>
      <p className="mb-8 text-zinc-400">
        Or email directly:{" "}
        <a href="mailto:shawn@ikosagon.com" className="text-accent hover:underline">
          shawn@ikosagon.com
        </a>
      </p>

      {showSuccess && (
        <p className="mb-6 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-accent" role="status">
          Thanks. Your message was sent. I will get back to you soon.
        </p>
      )}

      <form action="/api/contact" method="POST" className="card-surface max-w-2xl space-y-4 rounded-2xl p-6">
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
          Send inquiry
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-500">
        Prefer a call? Mention your timezone in the message and I will suggest times.
      </p>
    </div>
  );
}
