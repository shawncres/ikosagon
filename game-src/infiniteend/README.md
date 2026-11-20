# The Infinite End: handoff brief (v1.21)

You're taking over development of **The Infinite End**, a single-file WebGL/WebXR space flight, mining, trading and story game by Shawn (Ikosagon). v1.22 is the current test build (`BUILD` in `c_main.js`). The next handoff is v1.23: faster, fixes whatever Shawn logs next, and adds from the backlog. Deliver it the same way: one self-contained `index.html` on the test site.

v1.21 targets **Meta Quest 3 and newer** (Quest 3 / 3S, Touch Plus). Desktop keyboard, mouse and gamepad stay a separate scheme. See "Quest 3 controls" below.

This is a trial. Shawn will compare your v1.20 against the previous developer's work on fidelity, performance and polish.

---

## 1. Where things live, and what you may change

| Path in Shawn's site repo | URL | What it is | You may change it? |
|---|---|---|---|
| `public/infiniteendtest/index.html` | ikosagon.com/infiniteendtest | **Browser test build.** Where all work-in-progress goes. | **Yes. This is your only deploy target.** |
| `public/infiniteend/` (index.html, manifest, icons) | ikosagon.com/infiniteend | **Live Quest store app (VR).** Paying players reach it through the Meta Horizon Store wrapper. | **No.** Only when Shawn explicitly says "update the VR" and hands over a release folder. |
| `public/infiniteendpromo/` | ikosagon.com/infiniteendpromo | Hidden promo page. | **No.** |
| Everything else on the site | | Shawn's site | **No.** |

Deploy rules:
- Work on a branch and open a PR. Never commit straight to `main` (Vercel deploys `main`).
- The test page must keep `<meta name="robots" content="noindex">` on line 3 of the `<head>`, and must NOT contain the manifest / icon / apple-touch-icon links. `src/build.sh` produces exactly this as `dist/test/index.html`.
- Don't touch the Quest wrapper (Android/TWA project, signing, `assetlinks.json`). Game updates reach the store app by redeploying the site, not by rebuilding the wrapper.

## 2. What's in this folder

```
README.md                         this brief
src/                              the source, the only thing you edit
  head.html                       page shell: CSS, DOM, menus, <head> (noindex + store links)
  a_core.js                       core: seeds, names (NM), systems/places (mkSys, setLoc), fields (fM fC fL fG), shaders (bake, composite)
  b_world.js                      world geometry: rocks, giants, cockpit/cabin meshes
  bz_game.js                      game: jobs, NPCs, comms, escorts, story arcs, HUD, settings, aux display (PIP), oxygen, audio score
  e_v121.js                       v1.21 layer: charts, reputation prices, dogfight, faction kits, split settings
  f_v122.js                       v1.22 layer: freighters, capitals, NASA stations, Silence biomech, creatures, meters, difficulty
  c_main.js                       main loop, rendering passes, input, XR, save/load, BUILD label, debug hooks (window.ES)
  build.sh                        joins them → src/index.html (store flavour) and src/dist/test/index.html (test flavour)
current/infiniteendtest-index.html   the build Shawn was testing before v1.20 (v1.19 content, mislabelled v1.18).
docs/qa-log.md                    Shawn's QA findings 0–13: your primary to-do list
docs/backlog.md                   standing rules, design principles (incl. what Shawn REJECTED), build history, backlog
docs/previous-handoff-v1.18.md    detailed notes on recent systems (search the source for the names it mentions)
tools/shot.mjs                    Playwright harness: runs the game headless, runs JS steps, saves screenshots
```

Build: `sh src/build.sh` (needs only a POSIX shell). Sources are concatenated inside one async IIFE, so all top-level names share one scope.

Syntax check before every build:
```
(printf "(async()=>{"; cat src/a_core.js src/b_world.js src/bz_game.js src/e_v121.js src/f_v122.js src/c_main.js; printf "})()") > /tmp/chk.js && node --check /tmp/chk.js
```

## 3. v1.20 is in the tree. The next build (v1.21) starts from new QA.

v1.20 already did the list below. Do not repeat it. Read `docs/qa-log.md` for what landed, then take new findings and a slice of `docs/backlog.md`.

## 3b. What v1.20 was required to do

1. **Version:** set `BUILD = 'v1.20'` in `c_main.js`. It shows on the pause screen and in the Quest pause panel.
2. **Saves must survive updates (Shawn's decision).** At present `loadState()` in `c_main.js` wipes the save and makes a new universe whenever `ST.build !== BUILD`. Change it so existing saves (from v1.18/v1.19) load and migrate: fill missing fields with defaults and update `ST.build`. Keep `ST.seed`, so the player's universe is unchanged. Add a **New game** option in the menus (with a confirmation) that starts a fresh universe with a new random seed.
3. **Performance first** (QA 8, 12). Measure before you cut: frame time with the cabin on and off, the aux display (PIP) on and off, the NPC behaviour tick, and the giant-rock layer range (`LH`). Then:
   - simplify the cabin to a clean, minimalist, futuristic interior (keep its current size and proportions; they're right);
   - make the small console screen cheap when idle, and load the full display only when opened, replacing the HUD like a widescreen TV.
4. **Fix every QA finding** in `docs/qa-log.md`, items 1–13. Where the log lists "options to weigh", choose and say which.
5. Then **backlog items** of your choice from `docs/backlog.md`, favouring ones that raise visual fidelity and the feeling of a living universe.

## 3c. Quest 3 controls (v1.21)

Mapped from Meta's Touch button guide and the `meta-quest-touch-plus` WebXR profile (xr-standard). The right-hand Meta button is reserved by the system and is not used.

| Touch Plus | In flight | In a menu |
|---|---|---|
| Left stick (the cab's stick) | Yaw and pitch. Snap 30° by default, pitch stays smooth. | Still flies the ship |
| Right stick | Throttle, and strafe sideways. Click zeros the throttle. | Moves the row |
| Either trigger | Fire. A normal squeeze is enough. The hard second stage is not required. | Select (A is preferred) |
| Either grip | Boost. Nothing in the cab is grabbable, so grip is boost. | — |
| A | Hail, dock, accept | Select |
| B | Next target | Back |
| X | Journal | — |
| Y | Next weapon | Back |
| Menu (≡), left controller | Pause | Close |

Handedness swaps the sticks. Empty hands are ignored. Comfort defaults: snap turn, seated, subtle vignette while boosting, subtle haptics, 72 Hz (13.9 ms; 90 is 11.1 ms, 120 is 8.3 ms and Quest 3 only; Quest 3S has no 120), render scale 1, medium fixed foveation. Foveation only cheapens the final eye pass, because the world is drawn to an offscreen buffer first. The in-headset menu is an opaque plate on the visor so it stays readable if passthrough shows the room. Keyboard bindings are not shown in VR.

## 4. Non-negotiables

- One self-contained HTML file. No external runtime dependencies, CDNs or asset fetches (fonts/images are inline or generated).
- **VR is the product.** It must keep working in WebXR on Meta Quest:
  - no roll in VR;
  - the ship levels itself in planet skies;
  - menus are usable with controllers;
  - nothing modal may block steering;
  - keep frame time inside the Quest budget (aim for 72 fps).

  Test the desktop flow too, since the test site is browser-first.
- **Respect the rejected list** in `docs/backlog.md` → "Design principles": no lens streaks, smudges, star streaks, long diffraction spikes, fast-spinning pulsars, fake dials, or busy skies. Keep one standout feature per sky.
- Defaults: Amber HUD, 70% brightness, 85% size, cinematic bars off. Flight stick on the LEFT, throttle on the RIGHT. R = radio, 1–5 = weapons, Tab (U) = aux display, J = gate/journal panel, F = interact/accept.
- Never put a `//` comment mid-line before more code. A past bug silently disabled the warp tunnel this way.
- Keep the debug hooks on `window.ES` (with `?test` in the URL). Extend them for anything new.

## 5. Testing

- `?test` skips loading the save; `?test&keep` keeps it; `?lv=2` sets the quality level; `?pwa` simulates the store app (VR-first title screen).
- Harness:
  ```
  cd <this folder> && npm i playwright && npx playwright install chromium
  VW=1280 VH=720 node tools/shot.mjs '[["",12000,""],["ES.closePanel(); ES.life(\"call\")",3000,"comms"]]'
  ```
  Each step is `[js, waitMs, screenshotName]`. Screenshots go to `shots/`. Headless software WebGL runs about 10× slower than real time, so judge speed on real hardware.
- Useful hooks:
  - `ES.goto(sec, loc)`, `ES.jumpTest(loc)`, `ES.closePanel()`, `ES.sys()`, `ES.setSys({...})`;
  - `ES.life('call'|'near'|'talk'|'accept'|'esc'|'amb'|'hurt'|'raid'|'arc:debt:2'|'arc:rival:2'|'ty:job')`;
  - `ES.o2(h)`, `ES.pip(tab)`, `ES.bh(s)`, `ES.bigLook(i)`, `ES.closeStar(...)`.
- Before handing off, jump between at least 6 places (`ES.jumpTest()`) and check the warp tunnel, lens flare, planet entry/exit and the comms/escort flow. There must be no console errors.

## 6. Hand-off (what Shawn expects back)

Every build, without being asked:
1. `BUILD` bumped (v1.20, then v1.21, …).
2. The `dist/test/index.html` file, plus a PR that puts it at `public/infiniteendtest/index.html`.
3. Screenshots of every visual change, before vs after where possible.
4. A short changelog listing each QA finding number with what you did (fixed / partly / not done, and why), plus backlog items added.
5. Anything you measured (frame times before and after).

Don't create a VR release folder or touch `public/infiniteend/` unless Shawn asks for one.
