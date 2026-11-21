/**
 * Grep tags. Put one in the test or describe title (`cloud as home @smoke`).
 * CI runs `@smoke` only. The other tags are reserved so later suites can opt in
 * without a config change: `npm run test:e2e -- --grep @a11y`.
 */
export const Tag = {
  smoke: "@smoke",
  regression: "@regression",
  a11y: "@a11y",
  visual: "@visual",
} as const;
