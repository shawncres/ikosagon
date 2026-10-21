/**
 * Known chains (broadest first, down to the parent) for topics the model names without saying where they sit, or under
 * a parent that is not on the map yet: "Sets" under "Python" -> Computer Science > Programming > Python > Sets.
 * The browser keeps the same table (public/ikolearn/cloud-model.js KNOWN_CHAINS); the check script keeps them equal.
 */
export const KNOWN_CHAINS: Record<string, string[]> = {
  "Programming": ["Computer Science"],
  "Algorithms": ["Computer Science"],
  "Coding": ["Computer Science"],
  "How Computers Work": ["Computer Science"],
  "How AI Works": ["Computer Science"],
  "Web Pages": ["Computer Science"],
  "Python": ["Computer Science","Programming"],
  "JavaScript": ["Computer Science","Programming"],
  "Scratch": ["Computer Science","Programming"],
  "Java": ["Computer Science","Programming"],
  "HTML": ["Computer Science","Web Pages"],
  "Counting": ["Math"],
  "Number Sense": ["Math"],
  "Addition": ["Math"],
  "Subtraction": ["Math"],
  "Multiplication": ["Math"],
  "Division": ["Math"],
  "Fractions": ["Math"],
  "Shapes": ["Math"],
  "Place Value": ["Math","Number Sense"],
  "Decimals": ["Math","Fractions"],
  "Time": ["Math"],
  "Money": ["Math"],
  "Living Things": ["Science"],
  "Space": ["Science"],
  "Weather": ["Science"],
  "Volcanoes": ["Science"],
  "Planets": ["Science","Space"],
  "Plants": ["Science","Living Things"],
  "Animals": ["Science","Living Things"],
  "Stories": ["Reading & Writing"],
  "Vocabulary": ["Reading & Writing"],
  "Poetry": ["Reading & Writing"],
  "Grammar": ["Reading & Writing"],
  "Spelling": ["Reading & Writing"],
  "Phonics": ["Reading & Writing"],
  "History": ["People & Places"],
  "Maps": ["People & Places"],
  "Cultures": ["People & Places"],
  "Drawing": ["Art & Music"],
  "Rhythm": ["Art & Music"],
  "Color Mixing": ["Art & Music"],
  "Painting": ["Art & Music"],
  "Building": ["Making & Coding"],
  "Puzzles": ["Making & Coding"],
  "Robots": ["Making & Coding"],
};

/** Same as the browser's norm(): lower case, "&" as "and", punctuation to spaces, a plural "s" dropped from longer words. */
const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w))
    .join(" ");
let index: Map<string, string[]> | null = null;

/** The known chain above a label, or null. */
export function chainHint(label: string): string[] | null {
  if (!index) index = new Map(Object.entries(KNOWN_CHAINS).map(([k, v]) => [key(k), v]));
  const c = index.get(key(label || ""));
  return c ? c.slice() : null;
}

/**
 * Fills a missing chain for a new topic: the parent's known chain plus the parent, else the topic's own known chain.
 * Leaves a chain the model gave alone (the browser reuses links already on the map).
 */
export function fillChain(name: string, parent: string, chain: string[] | undefined): string[] | undefined {
  if (chain && chain.length) return chain;
  const viaParent = parent ? chainHint(parent) : null;
  if (viaParent) return viaParent.concat([parent]);
  const own = chainHint(name);
  return own && own.length ? own : undefined;
}

const wordIn = (text: string, label: string) => {
  const esc = label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^a-z0-9])" + esc + "s?($|[^a-z0-9])").test(text);
};

/**
 * Deepens a short chain from what the learner wrote: "How do sets work in Python?" with the model's Sets under
 * ["Computer Science"] becomes ["Computer Science","Programming","Python"], because Python is a known topic named in
 * the message whose chain starts with the one given. Only ever extends a chain (never moves a topic to another
 * subject), needs at least one link to start from, and leaves a full chain alone.
 */
export function deepenChain(name: string, parent: string, chain: string[] | undefined, context: string): string[] | undefined {
  const base = chain && chain.length ? chain : parent ? [parent] : [];
  const text = String(context || "").toLowerCase();
  if (!base.length || !text) return chain;
  const k = base.map(key);
  let best: string[] | null = null;
  for (const [label, hint] of Object.entries(KNOWN_CHAINS)) {
    if (key(label) === key(name) || !wordIn(text, label)) continue;
    const cand = hint.concat([label]);
    if (cand.length <= base.length || cand.some((c) => key(c) === key(name))) continue;
    if (!k.every((x, i) => key(cand[i]) === x)) continue;
    if (!best || cand.length > best.length) best = cand;
  }
  return best || chain;
}
