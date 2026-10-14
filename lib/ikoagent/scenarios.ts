/** Scenario cards per skin: each starts a call and sends the first caller line. */
export type Scenario = { id: string; label: string; blurb: string; firstLine: string };

export const SCENARIOS: Record<string, Scenario[]> = {
  customer_service: [
    { id: "late-package", label: "Late package", blurb: "Order past its delivery date", firstLine: "Hi, my package is late — it was supposed to arrive last week." },
    { id: "charged-twice", label: "Charged twice", blurb: "Duplicate charge on a card", firstLine: "I was charged twice for the same order." },
    { id: "cant-log-in", label: "Can't log in", blurb: "Locked out of the account", firstLine: "I can't log in to my account." },
    { id: "new-customer", label: "New customer", blurb: "No account yet", firstLine: "Hi, I'm a new customer and I don't have an account yet." },
    { id: "cancel", label: "Cancel my plan", blurb: "Retention, then honor it", firstLine: "I want to cancel my subscription. My account is 1001." },
    { id: "repeat-caller", label: "Third call about this", blurb: "Frustrated repeat caller", firstLine: "This is the third time I'm calling about my package — account 2044." },
  ],
  collections: [
    { id: "behind-on-bill", label: "Behind on a bill", blurb: "Demo account 1001", firstLine: "This is account 1001 — I'm behind on my bill." },
    { id: "hardship", label: "Hardship", blurb: "Demo account 2044", firstLine: "Account 2044. I lost my job and can't pay right now." },
    { id: "plan-negotiation", label: "Longer plan", blurb: "Asks past policy limits", firstLine: "This is account 2044. Can I spread this over twelve months?" },
    { id: "promise-to-pay", label: "Promise to pay", blurb: "Partial payment + date", firstLine: "Account 1001 — I can pay $100 on Friday." },
    { id: "dispute", label: "I don't owe this", blurb: "Dispute → validation", firstLine: "Account 1001, and I don't owe this." },
    { id: "third-party", label: "Third party answers", blurb: "No details shared", firstLine: "He's not here — this is his wife. Can I take a message?" },
  ],
  sales: [
    { id: "upgrade-plan", label: "Upgrade my plan", blurb: "Growing team on Basic", firstLine: "I'm on Basic and want to upgrade my plan for my team." },
    { id: "free-trial", label: "Free trial question", blurb: "Trying Pro first", firstLine: "Do you offer a free trial of Pro?" },
    { id: "sso-team", label: "SSO for 12 people", blurb: "Discovery → plan fit", firstLine: "We need SSO for a team of about twelve people." },
    { id: "boss-approval", label: "Need my boss's OK", blurb: "Authority objection", firstLine: "We're looking for better support, but I'd need my manager to approve anything." },
  ],
};
