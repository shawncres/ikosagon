"use client";

import type { FormEvent } from "react";

const CONTACT_EMAIL = "shawn@ikosagon.com";

export function ContactForm() {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const projectType = String(data.get("projectType") ?? "").trim();
    const message = String(data.get("message") ?? "").trim();

    const subject = encodeURIComponent(`Ikosagon inquiry from ${name}`);
    const body = encodeURIComponent(
      [
        `Name: ${name}`,
        `Email: ${email}`,
        `Project type: ${projectType || "(not specified)"}`,
        "",
        message,
      ].join("\n"),
    );

    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <form onSubmit={handleSubmit} className="card-surface max-w-2xl space-y-4 rounded-2xl p-6">
      <input
        name="name"
        required
        placeholder="Name"
        className="w-full rounded-xl border border-border bg-black/40 px-4 py-2"
      />
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
        Open email draft
      </button>
      <p className="text-sm text-zinc-500">
        Opens your mail app with a draft to {CONTACT_EMAIL}. Review it there, then send.
      </p>
    </form>
  );
}
