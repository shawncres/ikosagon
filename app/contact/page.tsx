import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Start a project with Ikosagon: process upgrades, products, and AI-backed systems.",
};

export default function ContactPage() {
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

      <ContactForm />

      <p className="mt-6 text-sm text-zinc-500">
        Prefer a call? Mention your timezone in the message and I will suggest times.
      </p>
    </div>
  );
}
