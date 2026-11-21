# IkoLearn browser tests

Study notes for the offline Playwright harness in `e2e/`. You can run it on a desktop with no API key, no Gemini account, and no network beyond the first `npm install` and the Chromium download.

The older scripts in `scripts/ikolearn-*-e2e.mjs` are still there. This harness is the place new browser coverage should go. Migration is gradual: one flow at a time, when someone is ready to port it.

## Why this harness

IkoLearn in this repo is two layers:

1. A static app in `public/ikolearn/` (`index.html`, `app.js`, the cloud, lessons, the deck). That is the product a learner opens at `/ikolearn`.
2. A Next.js app. Its useful part for IkoLearn is `app/api/ikolearn/**`, which calls a model (Gemini by default) and streams NDJSON back. The key stays on the server.

A browser test of the learner experience has to load the static app and answer those API calls. It does not have to boot Next, and it must not call a live model.

### The pyramid for this app

| Layer                      | Where it lives                                                                          | What it is good for                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure logic                 | `npm run check:ikolearn` (`scripts/ikolearn-check.mjs`) and the other `check:*` scripts | Cloud model, lesson parsing, prompts, ranking. Fast, no browser, no network. This is the wide base.                                                              |
| Offline browser smoke      | `e2e/`, `npm run test:e2e:smoke`                                                        | One real Chromium. The learner can land, begin a cloud, open a lesson, open the deck, and get home. Every model call is a fixture. This is what CI runs.         |
| Offline browser regression | Same harness, tag `@regression` (none yet)                                              | The longer journeys still covered by `scripts/ikolearn-*-e2e.mjs`: chat placement, hints, theme, transfer, and so on. Port them when they earn a permanent home. |
| Accessibility and visual   | Tags `@a11y` and `@visual` (reserved, no suites yet)                                    | Keyboard, names, contrast, and screenshots compared against a baseline. Add them only for screens that already have a stable smoke.                              |
| Live model                 | Not in this harness                                                                     | A person, on a machine that has a key, trying a real lesson. Useful and slow and non-deterministic. It does not belong on a pull request.                        |

Perf budgets are not part of this harness. When you want one, keep it out of the smoke job: a separate script that records a number (lesson bytes, first paint of the static page) and fails on a threshold you chose. Do not mix that with Gemini latency.

### Offline mocks, and live Gemini

The static page only talks to `/api/ikolearn/...`. The harness keeps that path from becoming a live model call:

- `e2e/serve.mjs` serves files from `public/`. It does not start Next, so there is no route handler and no read of `GEMINI_API_KEY` or `.env.local`.
- `e2e/fixtures/api.ts` fulfills `**/api/ikolearn/**` inside the browser. Lesson and the first-cloud create return saved NDJSON. Every other path returns `503` with `{ "ok": false, "reason": "off" }`. The app already treats `off` as "the model is not available" (the same word the server uses when no key is set).
- A second route aborts `generativelanguage.googleapis.com`. If a script ever called the model host directly, the test fails after it otherwise passed.

`GET /examples` is answered with that same `off` and is left out of the call log. The app requests it on open so it can show idea chips. Smoke does not need those chips, and counting them would hide a real extra call.

No test reads an API key. CI does not set one. A key sitting in your own `.env.local` is unused, because Next never starts.

## Folder map

```
e2e/
  playwright.config.ts     # Chromium, baseURL, Toronto, traces, the static server
  serve.mjs                # http://127.0.0.1:4173 serving public/
  tsconfig.json            # types for the harness only (kept out of the Next build)
  tags.ts                  # @smoke @regression @a11y @visual
  fixtures/
    api.ts                 # route mocks and the call log
    test.ts                # the `cloud` fixture tests import
    in-page.mjs            # functions that run inside the page (seed, camera, screen)
    in-page.d.mts          # types for that module
  pages/
    cloud.ts               # one thin helper for the home screen
  tests/
    cloud-home.smoke.spec.ts
.github/workflows/e2e.yml  # pull_request: install, chromium, smoke, upload artifacts
```

`playwright.config.ts` sets `baseURL` to `http://127.0.0.1:4173/ikolearn/`. Tests open the app with `page.goto("./")`. A leading slash would leave `/ikolearn/` and hit the host root, which this server does not treat as the app.

Reports and traces are written at the repo root (`playwright-report/`, `test-results/`) and are gitignored.

### Tags

The token in the title is the tag. `cloud as home (desktop) @smoke` matches `--grep @smoke`. Constants live in `e2e/tags.ts` so the spelling stays in one place.

| Tag           | Status                                 | How to run                               |
| ------------- | -------------------------------------- | ---------------------------------------- |
| `@smoke`      | The cloud-as-home suite. CI runs this. | `npm run test:e2e:smoke`                 |
| `@regression` | Reserved.                              | `npm run test:e2e -- --grep @regression` |
| `@a11y`       | Reserved.                              | `npm run test:e2e -- --grep @a11y`       |
| `@visual`     | Reserved.                              | `npm run test:e2e -- --grep @visual`     |

`npm run test:e2e` runs every tag. A test that should not run on every pull request simply omits `@smoke`. A test can carry two tags in the title (`@smoke @a11y`) and then it runs in both greps.

## Local setup

Requirements match the rest of the repo: Node.js 20.9 or newer, npm 10 or newer. Node 22 is what CI uses, and it is the comfortable choice on a desktop. Check with `node -v` and `npm -v`.

From the repo root:

```bash
npm install
npx playwright install chromium
npm run test:e2e:smoke
```

The first command installs `@playwright/test` from `package.json`. The second downloads Chromium into the Playwright cache. On a fresh Linux machine the browser may also need system libraries. The command CI uses is:

```bash
npx playwright install --with-deps chromium
```

That needs a package manager that can install those libraries (apt on Ubuntu). On macOS, `npx playwright install chromium` is usually enough.

### Environment variables

None are required. There is no key to export.

| Variable   | Default       | Effect                                                                                                                                   |
| ---------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E_PORT` | `4173`        | Port for `e2e/serve.mjs`. The config passes it through.                                                                                  |
| `E2E_HOST` | `127.0.0.1`   | Bind address. Keep it on localhost.                                                                                                      |
| `CI`       | unset locally | When set, Playwright retries once, uses one worker, and refuses to reuse a server you already started. GitHub Actions sets this for you. |

`IKOLEARN_PW` is only for the old `scripts/ikolearn-*-e2e.mjs` files. The new harness does not read it.

### Commands

| Command                                                        | What it does                              |
| -------------------------------------------------------------- | ----------------------------------------- |
| `npm run test:e2e:smoke`                                       | Tests whose title contains `@smoke`.      |
| `npm run test:e2e`                                             | Every test under `e2e/tests`.             |
| `npm run test:e2e:smoke -- --headed`                           | Same smoke, with a visible browser.       |
| `npm run test:e2e:smoke -- e2e/tests/cloud-home.smoke.spec.ts` | One file.                                 |
| `npm run test:e2e:smoke -- --debug`                            | Playwright Inspector on the smoke tests.  |
| `npm run test:e2e:report`                                      | Serves the last HTML report and opens it. |

The HTML report is also a folder of files: `playwright-report/index.html`. You can open that file directly. `npm run test:e2e:report` is the comfortable way, because the report links to traces.

A passing local run prints one line per test and writes the report even when everything passed. Screenshots, video, and traces are kept when a test fails (`trace: "retain-on-failure"`, `screenshot: "only-on-failure"`, `video: "retain-on-failure"` in the config).

## How fixtures work

Three pieces cooperate. You normally touch only the test.

### 1. The route mock

`e2e/fixtures/test.ts` turns on `installApiMocks` for every test before navigation (`auto: true`). A test that forgets to opt in is still offline.

The interesting part of `e2e/fixtures/api.ts`:

```ts
await page.route("**/api/ikolearn/**", async (route) => {
  const rel = relPath(route.request().url());
  // GET /examples is not recorded. Everything else is, so a test can assert "one /create".
  if (!rel.endsWith("/examples"))
    calls.push({ path: rel, method: route.request().method() });

  if (rel.endsWith("/lesson")) {
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: LESSON,
    });
    return;
  }
  if (rel.endsWith("/create")) {
    await new Promise((resolve) => setTimeout(resolve, 800)); // "Growing your cloud" stays on screen
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: CREATE,
    });
    return;
  }
  await route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ ok: false, reason: "off" }),
  });
});
```

`LESSON` and `CREATE` are NDJSON, one JSON object per line, ending in `{ "t": "done" }`. That is the shape `app.js` already parses. The create body is the two first subjects from `scripts/ikolearn-home-e2e.mjs` (Ocean Life, Drawing). The lesson body is the short magma lesson from that same script.

After the test, the fixture attaches `api-calls.json` to the HTML report: the call list, any blocked model URLs, and page errors. Open a test in the report and look at Attachments.

### 2. The localStorage seed

A returning learner is not built through the UI. The app keeps the cloud in `localStorage` under `ikolearn.v1.*`, and the pure model is `window.IkoCloud` after the scripts load. The seed runs in the page, then the test reloads so the app boots from that save.

`CloudPage.seedReturning()` does this:

1. `goto("./")` and wait until "Learning for yourself" is on screen (scripts have run, `IkoCloud` exists).
2. `page.evaluate(seedReturningLearner)` from `e2e/fixtures/in-page.mjs`.
3. Reload, and wait until `#cloud` is shown.

The seed itself is the Maya cloud from the legacy home script: Volcanoes, Sourdough Bread, and Stargazing, with Kneading and Constellations touched enough to join the deck, Magma active, and the first-visit hints marked seen. Hints marked seen keep the smoke test on the cloud journey instead of the hint tour.

`in-page.mjs` is plain JavaScript on purpose. Playwright sends the function source into the browser. The file must not import anything, and it must not close over Node values.

### 3. Timezone

`playwright.config.ts` sets `timezoneId: "America/Toronto"` and `locale: "en-CA"` on every context. Weekly recap text and anything else that formats a date then uses Toronto, in CI and on a desktop in another zone. You do not set this per test.

The `cloud` fixture records `pageerror` and console errors (a failed static file is ignored, matching the legacy scripts). Tests assert `cloud.errors` is empty when the journey itself should be clean.

## What the first suite does

`e2e/tests/cloud-home.smoke.spec.ts` runs the same two journeys at desktop (1280×860) and phone (390×844), in Chromium only:

1. **New learner.** Choose "Learning for yourself", enter Maya, land on an empty cloud with the universal opening line, and make no API calls. Begin with "the ocean and drawing". The status reads "Growing your cloud", one `POST /create` runs, and the thread names Ocean Life and Drawing.
2. **Returning learner.** Seed Maya, reload onto the cloud with the Pick up row and the deck button. Open the first lesson chip (the mocked lesson mentions melted rock). The "Back to your cloud" link is still in the page, and it is hidden while the header shows the cloud thumbnail (that is the current app: the thumbnail and Escape are the way home). The test presses the thumbnail, lands on that topic's card, opens the deck, comes back with the camera where it was, and presses Escape without leaving the cloud. The only calls are `/lesson` and, when the lesson has no check questions, `/check`.

The age step is off in the current app (`ageStep` is false in `app.js`). `startAsSelf` clicks `#cs-age-skip` only when that button is actually visible, so a later optional step does not require a rewrite, and this suite does not assert age bands. Family and guide journeys stay in `scripts/ikolearn-family-e2e.mjs` and the guide half of `scripts/ikolearn-home-e2e.mjs`.

`e2e/pages/cloud.ts` is one class: open, start, begin, seed, read the screen, read the camera, open a lesson, open the deck, go back. It is a place for selectors, not a framework of its own. If a helper is only used once, leave it in the test.

## Add a test without copy-pasting

1. Decide the tag. Smoke is for a short journey you would want on every pull request. Longer or older journeys use `@regression` in the title and stay out of CI until you choose otherwise.
2. Create `e2e/tests/<flow>.smoke.spec.ts` (or `.regression.spec.ts`). Import `test` and `expect` from `../fixtures/test`, not from `@playwright/test`, so the mock is the one this repo owns.
3. Ask for the `cloud` fixture in the test arguments. That also installs the camera hook and the error collector. Use `cloud.page` when you need the raw Playwright page.
4. Reuse `CloudPage` methods. Add a method only when a second test would otherwise copy the same selector sequence.
5. Need a different saved learner? Add a function next to `seedReturningLearner` in `e2e/fixtures/in-page.mjs`, and a one-line wrapper on `CloudPage`. Build the save with `window.IkoCloud` (`create`, `applyCreate`, `serialize`). Do not hand-write a JSON blob of the current storage version.
6. Need a new API response? Add a branch in `installApiMocks` before the `503` fallback. Keep the body small and deterministic. Record the path in `calls` (the fallback already does, except `/examples`).
7. Assert what the learner sees and which paths were called. A good assert is "the lesson title is the chip I clicked" or "the call list is `['/create']`". Leave pixel positions in the legacy scripts unless a bug was specifically about overlap.
8. Run it: `npm run test:e2e:smoke -- e2e/tests/your-file.spec.ts` or, for a regression tag, `npm run test:e2e -- --grep @regression`.
9. If it fails, open the report (`npm run test:e2e:report`) before changing the product. The attachment `api-calls.json` shows the calls the test actually saw.

Do not point `webServer` at `next dev` for a new test unless the behavior under test only exists in a Next route. If you ever do, still mock `/api/ikolearn/**` in the browser. A missed mock against a live dev server is how a key gets spent.

## How to read a CI failure

The workflow is `.github/workflows/e2e.yml`. On every pull request it checks out the repo, installs Node 22, runs `npm ci`, installs Chromium with its system libraries, and runs `npm run test:e2e:smoke`. A second push to the same branch cancels the in-flight run.

The job always uploads an artifact named `playwright-smoke` (unless the run was cancelled) with:

- `playwright-report/` — the HTML report, including attachments
- `test-results/` — per-test traces, screenshots, and video when the test failed

CI retries a failed test once (`retries: 1` when `CI` is set). A test that fails and then passes is marked **flaky** in the report. The job is green, and the flake is still visible. Treat a flake as a bug in the test or in a timing assumption. Do not raise the retry count to hide it.

### On your machine, after downloading the artifact

Unzip it. From the folder that contains `playwright-report`:

```bash
npx playwright show-report playwright-report
```

Or open `playwright-report/index.html`.

| Artifact                                  | What to look at                                                                                                                                                                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTML report                               | Which test, which assert, and the attachment `api-calls.json`. The call list is often the whole story ("expected `['/create']`, saw `['/create','/chat']`").                                                                                             |
| Screenshot                                | The viewport at the moment of failure. Phone and desktop are separate tests, so the file name includes the project and the test title.                                                                                                                   |
| Video                                     | The whole test, only after a failure. Watch the second before the assert.                                                                                                                                                                                |
| Trace (`trace.zip` under `test-results/`) | Open from the report ("Traces") or with `npx playwright show-trace path/to/trace.zip`. The trace has the DOM before and after each action, the network (mocked calls included), and the console. This is the one to use when a screenshot is not enough. |

Screenshots and video are absent on a fully passed run. The HTML report is still there.

## Flaky-test hygiene

- Prefer `expect(...)` and `locator.waitFor` over `page.waitForTimeout`. The cloud build is the exception that is already encoded as `waitForFunction(cloudSettled)`, because the app reveals subjects on a short timer.
- Do not use `networkidle`. The page is done when the selector you care about is visible.
- One assertion of "no console errors" at the end of a journey. A new error should fail the test, not get filtered, unless it is the browser's own "Failed to load resource" line for a deliberate `503`.
- Keep bodies deterministic. No random names, no `Date` in an assertion. The seed may use `Date.now()` for timestamps inside the save; the assertions do not read those numbers.
- Viewport belongs on the describe (`test.use`) so desktop and phone share one function. Do not copy the test body.
- `test.only` is rejected when `CI` is set (`forbidOnly`).
- Locally, retries are off, so a flake fails the first time. Fix it before raising retries.
- If a test depends on animation settling (the camera, after returning from the deck), compare the value the product promises (the camera is restored), with a small tolerance, and read it after the screen you returned to is visible.

## Migration from `scripts/ikolearn-*-e2e.mjs`

Leave those files. They still run with `IKOLEARN_PW` pointed at a `playwright-core` install, and a few of them cover journeys this suite does not (guide landing, family, hints, transfer, theme).

When you port one:

1. Read the script's header comment. It says what the journey is.
2. Keep the fixture data if it is still the right cloud. The home script's lesson NDJSON and Maya seed are already in `e2e/fixtures`.
3. Drop screenshot directories and pixel equality unless you are starting an `@visual` suite with an explicit baseline.
4. Add `@regression` first if the journey is long. Promote a short slice to `@smoke` only when it protects something a pull request could break in under a minute.
5. After the new test is the one people run, the old script can stay as a pointer. Deleting it is a separate change, not part of adding the harness.

`scripts/ikolearn-family-e2e.mjs` and the age-skip helper in the home script are legacy relative to the current product (a learning app for any curious person). Do not make them the next smoke suite.

## Later, when you want them

- **Regression.** Port the next journey (a good candidate is the placement and "0 calls" checks in `scripts/ikolearn-qa-e2e.mjs`) as `@regression`, reusing `installApiMocks`. Extend the mock with the chat NDJSON that script already builds. Keep it out of the pull-request job until it is as stable as smoke.
- **Accessibility.** `@a11y` on a focused test: names and roles for the cloud start, the lesson back button, and the deck button, plus a keyboard pass on the opening form. The app is custom controls, so start with the elements a learner must use, not a whole-page scanner dump.
- **Visual.** `@visual` with Playwright snapshots only after the smoke screens stop moving. Pin one or two regions (the start column, a card), and expect to update baselines on purpose.
- **Perf budgets.** A separate npm script, still offline, that fails if `public/ikolearn/app.js` or the lesson fixture grows past a number you write down. Do not assert wall-clock time of a mocked round trip in CI. That number moves with the runner.
