"use client";

import { useMemo, useRef, useState } from "react";

type Source = {
  title: string;
  heading: string;
  source: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

const STARTERS = [
  "What does Ikosagon build for small businesses?",
  "Do you host a model on Vercel?",
  "What is Ikosagon Learn?",
  "How do I start a project?",
];

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Ask about Ikosagon services, projects, or how a small AI tool would fit a GTA business. I only answer from the site notes.",
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  const history = useMemo(
    () => messages.filter((message) => message.content.trim().length > 0),
    [messages],
  );

  async function send(text: string) {
    const question = text.trim();
    if (!question || pending) return;

    setError(null);
    setInput("");
    setPending(true);
    setMessages((current) => [...current, { role: "user", content: question }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          history: history.slice(-6).map(({ role, content }) => ({ role, content })),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        const fallback = typeof payload.fallback === "string" ? payload.fallback : "";
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: payload.error || "Request failed.",
            sources: payload.sources,
          },
          ...(fallback
            ? [{ role: "assistant" as const, content: fallback, sources: payload.sources }]
            : []),
        ]);
        setError(payload.detail || null);
      } else {
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: payload.answer,
            sources: payload.sources,
          },
        ]);
      }
    } catch {
      setError("Network error. Use the contact form if this keeps happening.");
    } finally {
      setPending(false);
      queueMicrotask(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 md:right-6 md:bottom-6">
      {open ? (
        <section className="pointer-events-auto flex h-[min(32rem,78vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background/95 shadow-[0_0_40px_rgba(43,255,232,0.12)] backdrop-blur-md">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="font-mono text-xs text-accent">Grounded notes</p>
              <h2 className="text-sm font-semibold">Ask Ikosagon</h2>
            </div>
            <button
              type="button"
              className="text-sm text-zinc-400 hover:text-accent"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </header>
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={
                  message.role === "user"
                    ? "ml-6 rounded-xl bg-accent/10 px-3 py-2 text-zinc-100"
                    : "mr-4 rounded-xl border border-border px-3 py-2 text-zinc-200"
                }
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.sources?.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {message.sources.map((source) => (
                      <li
                        key={`${source.source}-${source.heading}`}
                        className="rounded-full border border-accent/30 px-2 py-0.5 font-mono text-[10px] text-accent"
                      >
                        {source.title}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
            {pending ? <p className="font-mono text-xs text-muted">Retrieving notes…</p> : null}
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                className="rounded-full border border-border px-2 py-1 text-left text-[11px] text-zinc-400 hover:border-accent hover:text-accent"
                onClick={() => send(starter)}
              >
                {starter}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <label className="sr-only" htmlFor="ikosagon-chat">
              Question
            </label>
            <input
              id="ikosagon-chat"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask from the site notes"
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              Send
            </button>
          </form>
          {error ? <p className="px-3 pb-3 font-mono text-[11px] text-zinc-500">{error}</p> : null}
        </section>
      ) : null}
      <button
        type="button"
        className="pointer-events-auto rounded-full bg-accent px-4 py-3 text-sm font-semibold text-black shadow-[0_0_24px_rgba(43,255,232,0.35)]"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide chat" : "Ask the notes"}
      </button>
    </div>
  );
}
