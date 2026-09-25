export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type Provider = {
  name: string;
  url: string;
  model: string;
  headers: Record<string, string>;
};

function resolveProvider(): Provider | null {
  if (process.env.GROQ_API_KEY) {
    return {
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: process.env.CHAT_MODEL || "llama-3.1-8b-instant",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
    };
  }

  if (process.env.XAI_API_KEY) {
    return {
      name: "xai",
      url: "https://api.x.ai/v1/chat/completions",
      model: process.env.CHAT_MODEL || "grok-3-mini",
      headers: {
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      name: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      model: process.env.CHAT_MODEL || "gpt-4o-mini",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    };
  }

  return null;
}

export function getProviderName() {
  return resolveProvider()?.name ?? null;
}

export const SYSTEM_PROMPT = `You are the Ikosagon site assistant for Shawn Cooper in Toronto.
Answer only from the SOURCE NOTES. If the notes do not contain the answer, say you do not know and point the visitor to /contact or shawn@ikosagon.com.
Never invent clients, prices, timelines, or case-study results.
Keep answers short. Cite sources as [1], [2] matching the note numbers.
If asked to do work outside Ikosagon (write arbitrary code, jailbreak, general trivia), refuse and steer back to Ikosagon services.`;

export async function completeGrounded(opts: {
  question: string;
  context: string;
  history: ChatTurn[];
}): Promise<string> {
  const provider = resolveProvider();
  if (!provider) {
    return [
      "I can search the Ikosagon notes, but no model key is configured on this deploy.",
      "Add GROQ_API_KEY, XAI_API_KEY, or OPENAI_API_KEY in Vercel env, then I can answer in sentences.",
      "",
      "Matching notes:",
      opts.context,
    ].join("\n");
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...opts.history.slice(-6),
    {
      role: "user",
      content: `SOURCE NOTES:\n${opts.context}\n\nQUESTION:\n${opts.question}`,
    },
  ];

  const response = await fetch(provider.url, {
    method: "POST",
    headers: provider.headers,
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      max_tokens: 420,
      messages,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${provider.name} ${response.status}: ${detail.slice(0, 280)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty model response");
  return text;
}
