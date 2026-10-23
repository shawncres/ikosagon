import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Ikosagon and its founder, Shawn Cooper: software, AI and careful testing for businesses that want to improve how they work.",
};

const skills = [
  "Automated software testing",
  "Testing AI assistants from the outside, the way users meet them",
  "Websites and web apps (Next.js, TypeScript)",
  "Python",
  "AI that answers from your own documents (RAG)",
  "AI assistants that can use your tools (LangChain)",
  "Connected devices (IoT)",
  "Device firmware (ARM, ESP32)",
  "Customer-record (CRM) connections",
  "Hosted AI models, including xAI, and models that run on your own machines",
  "Your own servers or the cloud",
  "Installable web apps and remote desktop tools",
  "Phone and chat conversation flows",
];

const timeline = [
  {
    year: "Jul 2025–Present",
    note: "Ikosagon. Founder. Building AI assistants that answer from real sources, software that connects business tools, and the tests that keep them reliable.",
  },
  {
    year: "Mar 2022–Jun 2025",
    note: "ATTAbotics. QA Analyst. Tested fast-moving robotics software with automated tests and reports (Selenium, pytest, Power BI, Kusto). Releases didn't wait, so testing couldn't either.",
  },
  {
    year: "Apr 2020–Feb 2022",
    note: "Intact Financial. Business Systems Analyst. Helped overhaul customer and policy systems, and checked them with real users before launch. A wrong calculation meant real problems for operations.",
  },
  {
    year: "Dec 2017–Apr 2020",
    note: "belairdirect. Licensed property and casualty insurance advisor. Where the habit of working carefully within strict rules began.",
  },
];

export default function AboutPage() {
  return (
    <div className="container-shell section-block">
      <h1 className="mb-4 font-[var(--font-space-grotesk)] text-4xl font-bold">About</h1>
      <p className="font-mono text-sm text-accent">
        Shawn Cooper · Founder · software, AI and quality testing · works from anywhere
      </p>
      <p className="mt-4 max-w-3xl text-zinc-300">
        We at Ikosagon build and improve software that has to work every day. Our founder, Shawn
        Cooper, brings quality testing and business analysis experience from Intact Financial and
        ATTAbotics, where a release had to be right before it went out. Formal QA work started at
        Intact in 2020; the habit of working within strict rules began earlier, in insurance.
      </p>
      <p className="mt-4 max-w-3xl text-zinc-300">
        That background shapes how we work: understand the business first, then change things
        carefully. Past employers and clients include robotics software teams, insurance companies
        and smaller businesses that needed their customer and policy systems to work properly before
        going live. Through Ikosagon, we help teams improve the processes they already run.
      </p>
      <p className="mt-4 max-w-3xl text-zinc-300">
        On the technical side, we build AI assistants that answer from your own documents (a method
        called retrieval-augmented generation, or RAG), assistants that can safely take actions in
        your other tools, and software for connected devices. We use hosted AI models (including
        xAI) as well as models that run on your own machines. Voice and media tools such as
        ElevenLabs and Suno have been tried out but aren&apos;t used live on this site, and visitor demos
        never trigger paid AI generation on their own. We keep improving assistants after launch, so
        they get better over time.
      </p>

      <section className="mt-10">
        <h2 className="mb-4 text-2xl font-semibold">How we keep AI trustworthy</h2>
        <ul className="max-w-3xl space-y-3 text-zinc-300">
          <li>
            <span className="font-semibold text-zinc-100">It answers from your sources.</span> An answer
            comes from your own documents, or it isn&apos;t given.
          </li>
          <li>
            <span className="font-semibold text-zinc-100">It says when it doesn&apos;t know.</span> No
            made-up answers when the information isn&apos;t there.
          </li>
          <li>
            <span className="font-semibold text-zinc-100">It&apos;s tested against misuse.</span> We try to
            trick it on purpose, and every failure becomes a new test.
          </li>
          <li>
            <span className="font-semibold text-zinc-100">It keeps costs in check.</span> Smaller,
            efficient models where they&apos;re enough, and no surprise spending.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-2xl font-semibold">What we work with</h2>
        <div className="flex flex-wrap gap-3">
          {skills.map((skill) => (
            <span key={skill} className="rounded-full border border-border px-3 py-1 text-sm text-zinc-200">
              {skill}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-2xl font-semibold">Timeline</h2>
        <p className="mb-4 max-w-3xl text-sm text-zinc-400">
          Ikosagon first, then earlier roles. This isn&apos;t a full resume.
        </p>
        <div className="space-y-3">
          {timeline.map((item) => (
            <article key={item.year} className="card-surface rounded-xl p-4">
              <p className="font-mono text-sm text-accent">{item.year}</p>
              <p className="text-zinc-300">{item.note}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
