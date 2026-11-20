# The Infinite End (formerly Infinite Black): backlog and build log

Standing rule from Shawn: every build takes a selection from this backlog alongside whatever is newly asked. Nothing here is to be dropped silently. Versions use point numbering (v1.0 = first rollback build … v1.4 = old "v5"; current test build v1.22). `BUILD` in `c_main.js`, shown on the title screen, bottom-right of the pause screen and in the Quest pause panel. Increment it on each release. **From v1.20 on, updates keep the player's progress** (Shawn, 2026-11-19) and a fresh universe happens only when the player chooses New universe. (v1.14 was skipped at Shawn's direction.)

## v1.22 (2026-11-19, test site only)

Shawn's showcase brief. v1.21 saves migrate (same seed, `ST.lens` filled, `ST.build` updated). Quest 3 / Touch Plus mapping is unchanged. Boost is still the paced Burnout rush: no extra debris.

- Freighters are generated haulers: spine, cargo drums or containers, radiator fins, tug bells, greebles, running lights, faction paint, scorch plates. Traffic haulers and the gate trader use them. A dreadnought mesh also flies the old frigate lanes.
- Capital ships (carrier, dreadnought, survey ark, faction flagship) are sparse, instanced, and yaw in place. Habitat rings spin, turrets yaw, shuttles orbit, radiators flex. They fade at the layer edge.
- Human stations are NASA-lineage hardware: Stanford torus, Gateway truss with modules and solar wings, O'Neill yard, Bernal sphere. Megastructures use the same meshes at ringworld scale.
- The Silence has a body: biomech ships, broken bone derelicts, pulsing organic stations, and a rare vertebral megastructure. Inspiration only. Human metal stays the hardware you dock with.
- Creatures come from one generator: fish, medusa, worm, manta, and a colossal leviathan. They carry flock, flee, curiosity, and territorial motion, plus bioluminescent bands. Fins flex. The leviathan holds still enough to approach and pulses.
- Meters choose routes. Oxygen drains (faster when the hull leaks or you boost) and refills on ocean, ice, and gas decks, at a friendly dock, or by cracking pyrite. Hull cooks in lava skies, toxic speed, and star coronas; ferrite patches it in the field; yards repair it for credits that follow reputation and difficulty. Fuel is spent by cruise, boost, and especially jumps; docks sell it; gas decks and coronas scoop it and heat the hull; dry tanks drift until a distress tug, for a fee. Spice stays in the hold, gathers in life, clouds, and dust, sells as trade goods, and fixes a long jump. A Silence lens at the outfitter spends spice or credits and makes jumps gentler.
- Difficulty is Story / Pilot / Veteran / Silence, in the desktop settings list and in both pause menus (the headset one included). It scales damage, meter drain, AI, encounter rate, and prices. Pilot is the default.
- Headless software WebGL, low detail, 1280×720, at the home gate: 57 draws and 667k vertices in one eye. v1.21 on the same harness was about 48 draws and 559k. The added draws are the capital, alien, creature, and leviathan passes. That fps number is the harness, not a Quest measurement.

## v1.21 (2026-11-19, test site only)

Shawn's brief: procedural skies, flight, dogfights, and a settings split. Quest 3 / Touch Plus is the VR target.

- Star class, age and metallicity cascade into planet count, orbits, kind (lava, desert, ocean, toxic, ice, tidal, shattered, gas with band palettes), rings and moons. Home always keeps a world with air. Faction name kits: Combine, Lantern, Haulers, Survey.
- First charts pay on a new system. Scanning a world pays by rarity. Reputation moves prices. A faction that wants you gone refuses the berth. Outfitter accepts ore when credits are short. Danger rises with distance from home.
- Cruise thrust is higher. Boost adds a field of view kick, a restrained whoosh, world-space speed streaks (capped) and, on a screen only, a little chromatic fringe. No extra debris.
- Raiders lead the target, jink, break and extend. Difficulty follows sector danger. A shot is telegraphed.
- Settings are split. VR (and the store app) shows comfort, refresh, foveation, render scale, posture, view scale, handedness and haptics, and never a keyboard list. Desktop keeps keys, mouse and a separate gamepad.
- Touch Plus: left stick flies, right stick is throttle and strafe, either trigger fires, either grip boosts, A accepts, B backs out, X journal, Y next weapon, left menu button pauses. Snap 30° is the comfort default. 72 Hz is the default rate.
- Headless software WebGL, low detail, 1280×720: about 48 draws and 559k vertices in one eye. That fps number is the harness, not a Quest measurement.

## v1.20 (2026-11-19, test site only)

QA 0–13, as logged in `docs/qa-log.md`. Also from the backlog:

- Sky audit: one headline per place (black hole, ringworld, or a rare phenomenon). A close star or a showpiece sun stands down when a headline is already up. The sky-phenomenon pulsar drifts instead of spinning.
- Saves migrate. New universe, with a confirmation, on the title screen and in Settings.
- Lore of the Silence: the Deepfield Survey sent you past the last reliable gate; the Meridian Combine, the Lantern Order and the Free Haulers Union are named in the title, the journal and the faction lines. The six-part trail is that story.
- Oaths and the dead are listed in the journal. The aux display footer no longer collides with a long place name.
- The weapon name sits on the visor by the weapons bar.
- Quarters draw only on a glance (always in VR). Dash CRT is idle-cheap.

Headless software WebGL on this machine reported about 0.4 fps while the window was 1280×720. That figure is not a desktop or Quest measurement; the same harness is expected to run far slower than a GPU. Structural cuts aimed at the cabin and the aux upload, which the QA log named. Not heard by ear. Not flown in a headset.

Hosting and deploys: live at `ikosagon.com/infiniteend`, file `public/infiniteend/index.html` in Shawn's site repo, deployed by Vercel from `main`. Another builder handles deploys: work on a branch and open a PR, never commit to main. Always start from the current live `index.html`. Each release goes out as `index.html` plus a handoff note (`infiniteend-v1.xx-handoff.md`).

**Release workflow (Shawn, 2026-11-19):**
1. While working together: publish artifact previews only. **Always publish the artifact from `dist/test/index.html`** (the browser test flavour: no store manifest/icon links, noindex on). Shawn hands artifacts to the builder, who deploys them to `public/infiniteendtest/index.html` (ikosagon.com/infiniteendtest, browser only, not for Meta or VR). I don't package test deploys.
2. VR release: only when Shawn says he likes a version and wants to update the VR, deliver the full package **zip/folder** for `public/infiniteend/` (store-app `index.html` with absolute manifest/icon links and noindex, plus manifest, icons and handoff note). The builder's rule: artifact → test; folder → VR. Game-only changes need no store rebuild.

**Every hand-off checklist (Shawn, 2026-11-19, after the v1.19 label was missed):** without being asked, on every build handed to Shawn (test artifact/file or VR folder):
1. Bump `BUILD` in `c_main.js` to the next number (v1.20, v1.21, …) and check it shows on the pause screen.
2. Say the version number when handing it over, alongside the artifact version id.
3. Send the `index.html` file as well as publishing the artifact.
4. Send screenshots of anything visual that changed.
5. Log it in this backlog under its version heading, and note any QA findings it addresses (`claude/infinite-end-qa-log.md`).
While Shawn is in QA mode: log findings only, change nothing until he says go.

`build.sh` writes both: `index.html` (VR/store, goes in release zips) and `dist/test/index.html` (published as the artifact).

**`noindex` stays ON** (Shawn, 2026-11-19, reversing his earlier "no noindex" now that the Quest store is the paid route: keep the free web version out of search). Line 3 of `index.html` is `<head><meta name="robots" content="noindex">`. The manifest and icon links must be absolute (`/infiniteend/manifest.webmanifest`, `/infiniteend/icon-192.png`) because the page is served at `/infiniteend` with no trailing slash. Both are in `head.html` now.

Quest store: app ID 1355086514364997, package `com.ikosagon.infiniteend`, Ikosagon team (organization verified 2026-11-19). The first signed APK is uploaded to the Alpha channel and ran on Shawn's Quest. The store app is a wrapper around the site, so game updates ship by deploying the site; rebuild only for wrapper changes. Guide: `claude/infinite-end-quest-store-guide.md`. Open decisions:
- Price and model: the free website undermines a paid app. Options are a demo split with an IAP unlock, or free with IAP; suggested $9.99 in Early Access.
- Store listing: reuse the copy and images from the hidden promo page, ikosagon.com/infiniteendpromo.
- Age group self-certification.

Working rule learned the hard way (v1.15 bug): never put a `//` comment mid-line before more code. A comment in the composite uniform line silently disabled the warp tunnel and the lens flare for three builds. Before every release, compare the jump sequence and the composite uniforms against the live file (`ES.jumpTest()`).

Design principles (Shawn):
- (v1.11) Fuel, hull, weapons energy and spice are passive systems. Gauges should be generous; new players shouldn't have to worry about them.
- (v1.13) Assume players boost a lot and for long stretches: make boosting the engaging core (dodging, spice blooms). Mining and swarms are what players turn to once they need repairs or fuel: "necessity is the mother of invention". Shawn likes the boost feel and how the music follows speed.
- (v1.18) But nearby asteroids must not rush past too fast or appear out of nowhere at boost; massive objects must not bunch up close together. Yet slowing boost to ~620 with full assist removed the challenge ("can we do better?"): challenge should come from escalation the player chooses (overdrive), never from surprise.
- (PR #162) No NEAR MISS text. Keep spice blooms and gathering near creatures. Leave the particles alone. Open space should give relief from "endless bombardment". R is the radio key; number keys pick weapons.
- (v1.15) No radio slowdown in slow time.
- (v1.16–v1.18) Rejected:
  - lens streaks, visor smudges and strong motion blur;
  - the pillar nebulae;
  - star streaks when boosting;
  - long screen-crossing diffraction spikes ("looks stupid");
  - too many phenomena in one sky;
  - the first close-star attempt (a pale moon-like disc: "horrible");
  - a pulsar whose beams spun visibly fast ("unrealistic");
  - fake procedural dials and gauges on the sides of the dash ("shitty graphics").

  Acceptable: the curved visor at subtle. **Show Shawn screenshots of any new visual before it goes to the builder.** Keep skies restrained: one standout at a time, and slow sky motion. What he wants in the sky: big, individual stars with real presence ("sizes and stages of life"), and occasionally a super-sized close-up star with surface relief (reference: an orange giant with granulation, active regions and prominences).
- (v1.18) Cockpit: flight stick on the LEFT, throttle on the RIGHT (Shawn's call). The cabin behind should feel like a liveable long-haul trucker's cab, seen only when glancing round or in VR.
- (v1.18) Aux display: a small 16:9 monochrome CRT in the HUD colour (Pip-Boy feel). Tab (U as an alias) opens it full screen as the ship's universal display, with tabs picked by 1–5. Its frame should be able to host a whole working game later (reference: Shawn's "Future War" tactical display, 16:9, tabbed panels, CRT frame; the promo roadmap's card duels on a dash screen and handheld console).
- (v1.18) Default display: Amber HUD, 70% brightness, 85% size, cinematic bars OFF. Launching goes full screen (a setting), with an F11 note on the title screen. The title menu has View controls (built from live key bindings) instead of the old always-on pilot's card.
- (2026-11-19) VR is the product (the Quest store). The store app opens in VR; VR has no roll, so the game levels the ship planet-side.
- (2026-11-19) Every new place should look and feel distinct ("samey looking things and places"). Asteroid fields should look realistic, with large rocks never popping in close. Menus: slightly transparent, in the chosen HUD colour.
- (v1.18) Music: the Tron/Justice attempt (distorted wobble bass, stabs, impacts) was "obnoxious" in its deep sounds. Shawn likes The Weeknd's music and sent a softer Tone.js sketch: 112–128 BPM, deep soft low-passed kick, gentle pump, restrained snare, sparse dark hats, clean low-passed sub on quarter notes, sine pads with chorus and slow attack/release, a soft filtered triangle lead, 4.5 s reverb, 8th-note delay, quiet limiter. Keep the energy-driven arrangement (he likes how it follows speed). The game implements this in raw Web Audio. He heard something like clipping in the soft set: never step a gain in one sample (pump), and keep compressor attacks slow on sub content.

## Variety, fields, menus and story arcs (2026-11-19, test artifact only, version 1795118420-ff01)
- Variety: each place has its own field genome (`SYS.fg`): one of four structures (sheets, clusters, rings/discs, sparse), its own offsets and scale, rock material mix (`SYS.mat`), rock size (`SYS.fz`), nebula style (`SYS.sty` → `uSty` in the bake), brightness/saturation and sky features. Before this, every place shared one belt layout.
- Asteroid fields: giant rocks now fade in from ~7.5 km (`LH` layer range), reading as far landmarks rather than popping in close.
- Menus: gate and settings panels are translucent with blur, and follow the HUD colour (`--hc`, `--hcr`, set in `setUi`).
- Story arcs on recurring pilots (`ch.arc`, `arcOffer`, `arcNext`): Debt (fuel on credit → repaid with a tip → rescue their brother → ally who joins your fights), Rival (a raider who fled returns, then a showdown with a bounty), Lost ship (recorder → what she saw → an ending).
- New work: rescue (drive raiders off a stranded ship, come alongside, see it home), off-the-books freight (pays ~1.8×, 30% chance of a patrol fine), investigate lights (scan), pilot-told bounties.
- NPC behaviour (`behaveTick`): beaten raiders break off and flee (half come back as rivals); civilians scatter from raiders; the nearest patrol answers when you're under attack; allies fly in to help.
- Debug: `ES.life('arc:debt:2' | 'arc:rival:2' | 'ty:job' | 'hurt' | 'raid')`.
- Next: an arc journal tab on the aux screen; salvage jobs; faction wars between systems; wrecks of pilots you knew; NPC flanking and regrouping.

## Living universe round (2026-11-19, preview only; see the handoff)
- Shawn: NPCs felt "dead"; the old names were "horrible", so use Earth names with a futuristic touch; gates offered too many systems; wants oxygen refilled at planets as a gameplay loop. He wants deep stories, persistent characters and near-infinite missions, generated.
- Built:
  - Earth names (`NM`, `nameRng`).
  - Sparse lanes, only from a system's first place; planet skies off the gate list.
  - Oxygen (`ST.o2`), with refill below the clouds, hypoxia and a tow.
  - Persistent cast (`ST.cast`) with temperaments and memories.
  - Non-modal comms fly-ins (`CM`) with offers (escort, contract, fuel, tip, grudge).
  - Escort missions with ambushes (`ESC`).
  - Livelier traffic, with known pilots greeting you.
- Next steps: longer story arcs and storylets built on the cast; more mission types in the grammar (rescue, smuggle, investigate, rival bids); smarter combat (morale, flanking); persistent consequences for factions and routes; voiced radio lines.

## VR fixes after headset testing (PR #169, 2026-11-19)
- Store app (`PWA`): the title button is Enter VR, and desktop-only items are hidden.
- Cockpit at real-world size in VR (`CKM = 3` units per metre); head position moves the cockpit eye.
- Per-hand menu stick latch with repeat.
- Warp tunnel centred per eye (`uJc`).
- The ship rights itself below planet clouds (`rightT`; continuous in VR, pitch clamped ±72°).
- Earlier the same day: cockpit split into a lean dash shader plus a cabin shader (`P_CAB`, `#define CABIN`) for frame rate; pointer lock retried after full screen settles; Tab opens the aux display.

## v1.18 (2026-11-18; handoff `infiniteend-v1.18-handoff.md`, covers v1.15–v1.17)
- Star streaks removed.
- Big stars (`bigStar()`, `BSK`, `bigStarsSet()`): one or two per place, a showpiece in about half; thin, short, faint spikes. Pulsar beams now drift slowly with a soft pulse (was a fast spin and strobe).
- Close stars (`closeStar()`, `uCS`/`uCC`, `CSC`): ~32% of places show the system's own sun up close. Reworked to glow with saturated colour, fine granulation, small grouped spots, a tight corona and prominences; the binary companion is a bright point.
- Display defaults Amber / 70% / 85% (`fxMig` 4); cinematic bars off (`fxMig` 5). Full screen on launch (`CFG.fs`, Settings toggle).
- Score (`SC`, `scTick`, `scTrack`, `scStep`, `SECS`): soft sound set per Shawn's sketch, with a click fix.
- Warp tunnel and lens flare restored (the v1.15 comment bug).
- Huge rocks only on alternate cells (`hugeAt`).
- Local boost rush tops out near 620. Overdrive (`bOd`): hold boost past 7 s and over 18 s local speed climbs toward ~960, with the assist fading out. Debug `ES.bh(s)`.
- Cockpit: stick left, throttle right; clean panelling (`plate()`, material 14).
- Aux display (`PIP`, `pipPaint`, `pipTick`, `pipOpen`; material 15, texture slot 6). Debug `ES.pip(tab)`.
- Living quarters: bunk (left), galley with cubbies (right), and more; materials 13–23.

## v1.17 · v1.16 · v1.15 (2026-11-18, all inside v1.18)
- v1.17: pulled pillars and the v1.16 sky changes, lens streaks and smudges; calmer motion blur; subtle visor default.
- v1.16: effect settings; curved visor HUD (`visVA`); visor glass rim; twinkling stars.
- v1.15: `noindex` removed (reversed 2026-11-19: it's back on); no radio slowdown; R retunes the radio; slow time holds longer for big rocks; lens effects split into settings; smoother planet exit (`palEase`); horizon haze (`hcol`).

## PR #162 (merged 2026-11-17, squash 1e03464, made by another chat; labelled v1.13)
- Open space pockets `fC`. Spice drain/gain retune; slow-time cost 6–50; easing slow time. Radio keeps its song on launch and warps; R toggles radio; 1–5 pick weapons.

## v1.13 · v1.12 · v1.11 · v1.10 · v1.9
- v1.13: earlier scale-based score (replaced), rarer drone colonies, lighter rock assist, spice blooms.
- v1.12: renamed The Infinite End.
- v1.11: colour language and top-bar meters, spice meter, NPC fly-bys.
- v1.10: HUD font fix, boost-only fuel, mining laser, survival advisor, cues, cargo hold (I), trading.
- v1.9: rock assist, slow time, weapons energy, hull can fail, swarm types, volume settings.

## v1.8 · v1.7 · v1.6 · v1.4–v1.0
- v1.8: HUD declutter.
- v1.7: standard controls + space-sim setting; radio sounds like a radio on ikosagon.com.
- v1.6: quaternion attitude; G removed; reticle fix; planet haze shader.
- v1.4–v1.0: recording removed, banner hidden in flight, auto-target, boost covers distance, drift, climb-out orientation, rollback base with dashboard/gyro/black hole/materials and version label.

## Backlog (not built)
- Monetization build, once Shawn decides: a website demo split and/or IAP unlock (Horizon Billing needs a wrapper rebuild with billing on).
- Store listing: description from the promo copy, cover art (replaces the letter placeholder), screenshots, trailer, privacy policy. App icon: replace the eclipse placeholder with promo key art if Shawn wants.
- Aux display next steps: a game inside it (card duels); richer panels in the style of Shawn's Future War display; the hold tab as an actual inventory to act on; a contracts/journal tab; a zoom animation; show it inside the Quest headset too.
- VR comfort: a seat-height adjustment if `CKM`/eye height needs per-player tuning.
- Overdrive next steps, if it lands well: denser rock lanes on long runs (must thicken far ahead, never pop in close), an overdrive meter or streak counter, a music lift when overdrive starts.
- Cabin: more life if Shawn wants it; the centre dash bank and overhead console still use the procedural instrument material.
- Spacing for other massive things too (titans, megastructures, stations near huge rocks), if Shawn still sees bunching.
- Sky audit: v1.20 gives each place one headline and slows the phenomenon pulsar. Still worth a pass if a close star and a planet disc crowd one view.
- Music next steps: tune by ear; key changes between systems; counter-melodies.
- Close stars: v1.22 adds corona heat and a fuel scoop when you hold the nose in a close star. A slow swell in the score is still open.
- Nebula variety: if revisited, prototype in a screenshot first.
- Visor: pull the DOM elements onto the curved visor too.
- Boost-run layer: a run distance/streak counter, bloom trails that lead somewhere.
- Collision detection for small rocks and NPCs.
- NPC docking.
- Ship generator: freighters and four capital hulls landed in v1.22. Fighters and raiders are still the older three forms.
- Space atmospherics: aurora, dust lanes, light shafts through fields.
- Planet exit: crossfade the nebula texture too.
- Quest: star map, full settings, controller remapping and the hold/trade screens inside the headset; gimballed aim; weapon pick on the controller.
- Phone: roll control in space-sim mode; weapon pick by tap; a touch button for the aux display.
- Trader stock limits. Yards already repair, refuel, and sell air and spice (v1.22).
- Spice also fixes a long jump and buys the Silence lens (v1.22). It is still not a crafting tree.
- Weapon name somewhere unobtrusive.
- Carry the new voice into in-game text to match the title screen.

## Backlog (built thin, to deepen)
- RPG: no skills; branching story only through the pilot arcs.
- Economy: no NPC trade or supply chains.
- Wars and mining: small skirmishes; beams are dots.
- Glass: visor rim only.
- Planet flyovers: short of the reference image.
- Phone: layout not designed for touch.
- Drone swarms: up close the types read mainly by glow colour.

## Never verified
- All audio by ear.
- Real GPU performance (after the shader split).
- Boost and overdrive feel in real time.
- Full screen on launch in real browsers.
- The VR fixes of 2026-11-19 in the headset (cockpit scale, tunnel depth, levelling, menu repeat).
- iPhone; NPC traffic in real play.
- Story arcs across real play sessions (tested only with debug hooks).
- Balance.
