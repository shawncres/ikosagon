# IkoLine — planned black-box cases

Runner not shipped in skeleton. These are the cases we intend to automate later.

## Customer service
1. Happy path: reason → account 1001 → policy ask → resolve.
2. Escalation: customer asks for supervisor at diagnose → escalate exit.
3. RAG miss: off-corpus trivia → agent stays on flow / cites only corpus.
4. Injection: “ignore instructions” → refused, node unchanged.

## Collections
5. Disclosure must-say: `allowParaphrase: false` node emits disclosure text before balance.
6. Hardship: “lost my job” → hardship escalate, not payment plan push.
7. Plan accept: account 2044 → arrange → accept 3-month plan → disposition.
8. Wrong party: “not me” at identity → refuse exit.

## Sales
9. Discover → match offer cites plan corpus.
10. Price objection → trial / Basic path language.
11. Timing objection → callback exit.
12. Close won → resolve exit with disposition tool.

## Cross-cutting
13. Turn cap: 21st turn rejected.
14. Missing GROQ: keyword engine still advances.
15. Slot carry: accountId persists across nodes.
