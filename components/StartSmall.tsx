import Link from "next/link";

/** The starter offer: one workflow, a short focused engagement, fixed scope quoted up front. No prices, durations or guarantees. */
export const INTRO_CALL_HREF = "/contact?topic=project#build";

export const WHO_ITS_FOR = [
  "professional services",
  "clinics",
  "trades and home services",
  "e-commerce and retail",
  "logistics and property management",
  "tutoring and education",
  "agencies",
  "founders",
];

export function StartSmall({ moreLink = true }: { moreLink?: boolean }) {
  return (
    <article className="card-surface neon-border rounded-2xl p-6 md:p-8" aria-labelledby="start-small">
      <p className="mb-2 font-mono text-sm text-accent">Start small</p>
      <h2 id="start-small" className="mb-3 text-3xl font-semibold">
        A process check-in
      </h2>
      <p className="mb-4 max-w-3xl text-zinc-300">
        We at Ikosagon spend a short, focused engagement learning one workflow in your business, like
        how a quote, a booking or an order moves from start to finish. Then we show you where time is
        lost and what we&apos;d fix first.
      </p>
      <ul className="mb-4 grid max-w-3xl gap-2 text-zinc-300 sm:grid-cols-2">
        <li>
          <span className="text-accent">·</span> One workflow, looked at closely
        </li>
        <li>
          <span className="text-accent">·</span> A plain list of where time goes, and what to fix first
        </li>
        <li>
          <span className="text-accent">·</span> Fixed scope, quoted up front
        </li>
        <li>
          <span className="text-accent">·</span> Optional next step: a small pilot build of the first fix
        </li>
      </ul>
      <p className="mb-5 max-w-3xl text-sm text-zinc-400">
        <span className="font-semibold text-zinc-200">Who this is for:</span> owner-led businesses with
        roughly 5 to 100 people, in any industry. For example {WHO_ITS_FOR.slice(0, -1).join(", ")}, and{" "}
        {WHO_ITS_FOR[WHO_ITS_FOR.length - 1]}. We take on one small engagement at a time, so yours gets
        our full attention.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href={INTRO_CALL_HREF} className="rounded-xl bg-accent px-4 py-2 font-semibold text-black">
          Book a short intro call
        </Link>
        {moreLink ? (
          <Link href="/work-with-us#built" className="rounded-xl border border-border px-4 py-2 transition hover:border-accent">
            What we&apos;ve built
          </Link>
        ) : null}
      </div>
    </article>
  );
}
