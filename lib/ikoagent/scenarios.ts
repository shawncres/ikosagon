/** Scenario cards per skin: each starts a call and sends the first caller line. */
export type Scenario = { id: string; label: string; blurb: string; firstLine: string };

export const SCENARIOS: Record<string, Scenario[]> = {
  customer_service: [
    { id: "late-package", label: "Late package", blurb: "Order past its delivery date", firstLine: "Hi, my package is late — it was supposed to arrive last week." },
    { id: "charged-twice", label: "Charged twice", blurb: "Duplicate charge on a card", firstLine: "I was charged twice for the same order." },
    { id: "cant-log-in", label: "Can't log in", blurb: "Locked out of the account", firstLine: "I can't log in to my account." },
    { id: "new-customer", label: "New customer", blurb: "No account yet", firstLine: "Hi, I'm a new customer and I don't have an account yet." },
  ],
  collections: [
    { id: "behind-on-bill", label: "Behind on a bill", blurb: "Demo account 1001", firstLine: "This is account 1001 — I'm behind on my bill." },
    { id: "hardship", label: "Hardship", blurb: "Demo account 2044", firstLine: "Account 2044. I lost my job and can't pay right now." },
  ],
  sales: [
    { id: "upgrade-plan", label: "Upgrade my plan", blurb: "Growing team on Basic", firstLine: "I'm on Basic and want to upgrade my plan for my team." },
    { id: "free-trial", label: "Free trial question", blurb: "Trying Pro first", firstLine: "Do you offer a free trial of Pro?" },
  ],
};
