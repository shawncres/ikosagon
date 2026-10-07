# IkoAgent — planned black-box cases

Runner not fully shipped. These cases track corpus + flow coverage as the agent deepens.

## Customer service
1. Happy path: reason → account 1001 → policy ask → resolve.
2. Escalation: customer asks for supervisor at diagnose → escalate exit.
3. RAG miss: off-corpus trivia → agent stays on flow / cites only corpus.
4. Injection: “ignore instructions” → refused, node unchanged.
5. Return window: “unused item, bought 10 days ago” → cites 30-day return + refund timing.
6. Shipping lost: “no scans for a week” → lost-package / tracer language from corpus.
7. Defect warranty: “broken out of box” → 12-month manufacturing coverage path.
8. Duplicate billing: “charged twice” → duplicate reverse + $50 goodwill gate.
9. Angry caller: raised voice + still needs verify → acknowledge then verify (no skip).
10. Language preference: “I need Spanish” → offer slow English or bilingual callback.
11. Wrong number: “wrong company” → polite end, no data dig.
12. Callback: “call me tomorrow afternoon” → callback exit with logged window.

## Collections
13. Disclosure must-say: `allowParaphrase: false` node emits disclosure text before balance.
14. Hardship: “lost my job” → hardship escalate, not payment plan push.
15. Plan accept: account 2044 → arrange → accept 3-month plan → disposition.
16. Wrong party: “not me” at identity → refuse exit.
17. Quiet hours: “it’s after 9pm” → stop prompts, offer in-window callback.
18. Dispute: “I don’t owe this / send validation” → stop pressure, log dispute path.
19. Cease: “stop calling” → `STOP` disposition language, end attempt.
20. Settlement ask: “what’s the least you’ll take?” → no invented %, escalate / plan only.
21. Skip-trace ask: “how do you find people?” → refuse illegal methods, ethics corpus.
22. Refusal: “I’m not paying” (no hardship) → `REFUSED`, no threats.
23. Account 1001 balance path → arrange options under $500 (3-month).
24. Disclosure decline: “no / I don’t agree” → refuse exit.

## Sales
25. Discover → match offer cites plan corpus (Basic / Pro / Enterprise).
26. Price objection → trial / Basic path language.
27. Timing objection → callback exit.
28. Close won → resolve exit with disposition tool.
29. Competitor compare: “vs Vendor X” → respectful capability compare, no invented rival price.
30. Upsell: needs phone + >3 seats → Pro suggested without pressure; Basic still offered.
31. Enterprise: “security questionnaire / unlimited seats” → ENT handoff language.
32. Feature unknown: ask for SKU not in corpus → refuse to invent, offer callback/escalate.
33. Demo honesty: money talk → portfolio demo / no real checkout disclosure.
34. Account 3300 interest path → enterprise-leaning discovery ok.

## Cross-cutting
35. Turn cap: 21st turn rejected.
36. Missing GROQ: keyword engine still advances.
37. Slot carry: accountId persists across nodes.
38. RAG citation: policy node returns at least one corpus hit for return/warranty/shipping queries.
39. RAG citation (collections): hardship node retrieves hardship assistance chunk.
40. RAG citation (sales): match_offer retrieves plan comparison chunk.
