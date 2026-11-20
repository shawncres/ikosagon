# The Infinite End: QA log

Shawn's QA findings, logged one by one. v1.20 (2026-11-19) worked the previous round. v1.21 is a feature build from Shawn's brief, not a new QA round. New findings stay logged only until Shawn says go.

## v1.24 notes

Visual pass, started with the vertex budget. v1.23 saves migrate. Quest controls, the seat line, A/X panels, pause, the bracket, and difficulty stay.

- Quest preset is detail Medium and Low (`LV >= 1`). Rock shells drop two subdivisions there and one on Desktop High. Large swarms spawn fewer bodies. `ES.budget()` reports the cap: 1,000,000 vertices and 80 draws per eye at the home gate. v1.23 high was about 3.87M vertices. The HUD reticle rebinds its program before drawing the fallback mark, which clears a one-shot WebGL warning. File-URL loads skip the radio fetch.
- Skies: gas-giant bands with a vortex, domain-warped cloud decks and shadows, a Rayleigh/Mie limb and terminator, ocean specular, night-side city lights. Stars use a blackbody ramp. The nebula bake takes a second warp from the system seed.

## v1.23 notes

Shawn's Quest 3 pass on v1.22, plus the `npcTick` crash (`a.wp[0]`).

- Fixed: missing waypoints, and the frame no longer dies if one ship is bad. Stress test: 180 simulated seconds, lead deaths, zero throws.
- Fixed: ship uniforms were applied on the cabin program.
- Fixed: A and X opened panels that drew with alpha 0, so the HUD disappeared. The plate is opaque and, in a headset, visor-locked. Pause is B+Y, left-stick hold, or coming back from the system menu.
- Fixed: seat line is calibrated from the first pose and from recenter.
- Partly: the target mark is a thin bracket at a sensible depth. Very distant targets are clamped so the eyes are not asked to converge at kilometres.
- Partly: megastructure and station shading is richer. The underlying ring mesh is still coarse up close.
- New games and configs with no saved difficulty start on Pilot. HUD brightness and size show Default at the picture v1.22 shipped (the old 70% and 85%).
- Headless Chrome, high detail, 1280×720: about 70 draws and 3.9M vertices in one eye at the home gate. That count is the harness, not a Quest frame time.

## v1.22 notes

No new numbered findings. Decisions taken while building, so the next QA pass can check them:

- Freighters, capitals, NASA stations, and Silence derelicts are procedural meshes in the existing instanced drawers. Capitals and the leviathan yaw in place so they stay where the layer put them; rings, turrets, shuttles, radiators, and fins still move.
- Difficulty defaults to Pilot. Story is gentler. Silence is the harsh end. It is one control in desktop Settings and in the pause list, including the headset plate.
- Oxygen, hull, fuel, and spice stay generous on Pilot. They get expensive when you boost, jump, cook the hull, or play Silence. A dry tank or an empty cabin still ends in a tug, not a soft lock.
- v1.21 saves load. Missing `lens` is filled with 0. The universe seed is kept.

## v1.21 notes

No new numbered findings. Decisions taken while building, so the next QA pass can check them:

- Quest 3 / Touch Plus is the VR control target. The desktop keyboard, mouse and gamepad scheme is separate and was not remapped onto the controllers.
- Snap turn at 30° is the default in VR, because Meta's comfort note prefers snap over smooth yaw. Pitch stays smooth. Smooth yaw is still in the VR menu.
- Grip is boost, not grab. There is nothing in the cab to pick up, and the trigger is already the gun.
- The in-headset menu is drawn on the visor as an opaque plate (alpha blend while it is open) so it can be read over passthrough. It sits in the middle of the glass.
- Fixed foveation defaults to medium. It does not foveate the offscreen world pass. Render scale is the knob if Quest frame time slips. Default refresh is 72 Hz.

## v1.20 resolutions

| # | What v1.20 did |
|---|---|
| 0 | `BUILD` is `v1.20`. It shows on the title screen and the pause screen. |
| 1 | Planets are placed on a wide triangle, away from the sun. Apparent size is real radius ÷ distance, so a giant, a rocky world and an ice world no longer share one blotchy look. Gas giants have broad bands, rocky worlds have seas and night cities, ice worlds have cracks. Rings are a few broad ice lanes that fade before they alias. |
| 2 | Entering an atmosphere no longer snaps the quaternion. Wings ease level over about six seconds, shortest way, and do not reverse mid-turn. VR keeps a gentler hand on the roll. |
| 3 | Encounters and trail beats open when you come near their subject, not on arrival. The header row no longer consumes a number (choices start at 1). The panel sits low-left so it does not cover the view. |
| 4 | Any time in an atmosphere counts as near spice, with a stronger gather and blooms in the cloud band. Cloud-layer jellies and minnows can spawn there. |
| 5 | The warp gate mesh, its glow and its nav target exist only in open space. Atmosphere objectives say to climb out. Rock, station and titan generators do not place solids in the air. |
| 6 | Each planet's light walks slowly around it (terminator, night side, city lights on rocky worlds). Below the clouds the sun's altitude follows the same slow day. |
| 7 | Chose fade, not a hard swap: world instances scale out with the entry veil, and solids are not generated on the atmosphere side, so nothing pops into the path at the cloud layer. |
| 8 | Living quarters are a berth, a counter and two light strips. On a screen they draw only when you glance aft; the headset always draws them. Cabin vertex count is about 13.5k. |
| 9 | A destroyed pilot is dead and that name stays retired. Known pilots need real time and jumps before they call again. A rival who returns ejected, waits, and comes back with more hull, shields and sometimes a wingman. No fly-in for about two minutes after a jump, an atmosphere exit or a kill. Raider shields are real (about 300, more on a return). |
| 10 | Kills use a low sine boom, a falling noise body and a short debris crackle, scaled by size and distance. |
| 11 | Hits flash the shield and hull bars, flicker the dash screens, and put a red chevron on the visor toward the shooter or the rock. |
| 12 | The dash CRT uploads about every 2.2 s and not at all while the full display is open. The full display is an opaque screen in place of the HUD. |
| 13 | Saves from v1.18/v1.19 migrate: same seed, missing fields filled, `ST.build` updated. **New universe** is on the title screen and in Settings, and it asks before it replaces the save. |

## QA round 1 (2026-11-19, test build 1795118420-ff01, mislabelled v1.18; should have been v1.19)

### 0. Version label not incremented
The build under test still shows v1.18. Claude should have bumped `BUILD` to v1.19 when it handed over this round. Fix: the next build is labelled v1.20 (covering this round plus the QA fixes), and every hand-off from now on gets a new number.

### 1. Planets: spacing, scale and look
Seen at Erebus Wreck Field, Outer Marrakesh (yellow star).
- **Too close together:** planets are generated bunched up, sometimes overlapping on screen (a ringed giant with two smaller planets nearby).
- **Size doesn't match distance:** two planets that look the same size on screen show very different distances in the HUD when targeted. Apparent size should follow real size ÷ distance, so similar-looking planets at very different ranges reads as wrong.
- **Too similar:** the planets share the same blotchy patterning and colour treatment.
- **Grainy, not vibrant:** surfaces look noisy and washed out ("grainy and crappy") rather than rich and striking.
- Also seen in the same screenshot (Claude's note, for Shawn to confirm): the ring system shows rainbow moiré/aliasing streaks, and large rocks drift across the HUD's target and distance readout.

### 2. Planet entry: the ship flips into level flight too abruptly
Seen entering Cloud Tops, Quetzal (Outer Marrakesh).
- After passing through the cloud layer into a planet's gravity well, the auto-levelling snaps and flip-flops in awkward directions.
- Wanted: a gentle, continuous ease into level flight, like a plane settling into its approach. It should never swing the long way round or reverse direction mid-turn. Matters most in VR (no manual roll, nausea risk).

### 3. Encounter pop-ups fire as soon as you arrive
- Encounter panels (e.g. "On arrival … a patrol offers to look you over · Accept the inspection / Wave them off") appear almost immediately on entering a place.
- Wanted: encounters should be triggered by approaching their subject (the patrol ship, an NPC, a station), not by arrival itself.
- Claude's note, for Shawn to confirm: the "On arrival" row shows a stray dot where its number should be (the choices start at 2), and the panel covers the middle of the view.

### 4. No spice in planet atmospheres
- Spice blooms only appear in space near living creatures; inside a planet's atmosphere there is none.
- Wanted: spice to gather in atmospheres too (e.g. in cloud layers or around atmospheric life), so planets are worth flying in beyond the oxygen refill.

### 5. Warp gates sit above planets
Seen at Cloud Tops, Quetzal: the warp gate hangs in the sky 3.2 km away at 3.3 km altitude, with the planet surface behind it.
- Wanted: warp gates belong in open space, never inside or just above a planet's atmosphere.
- Claude's note, for Shawn to confirm: an asteroid also floats inside the atmosphere in the same shot.

### 6. Planets are always in daylight
- Every planet looks like it's midday, all the time.
- Wanted: a day/night cycle, so planets show a lit side and a night side (terminator, darkened surface, maybe city lights) from space, and skies that shift between day, dusk and night when you're below the clouds.

### 7. Objects pop in and out at the cloud/fog layer
- Approaching a planet, stations and other bodies suddenly vanish or appear as you pass through the fog layer.
- You can also crash abruptly into an object that pops in during that transition.
- Wanted: consistency across the transition. Options to weigh: don't place objects in or near the fog layer at all; fade objects with the fog instead of switching them; keep anything solid near the transition on both sides of it, so nothing appears in your path.

### 8. Game feels slower: simplify the cabin
- Cabin sizing is good now (keep it).
- The game doesn't feel as snappy as it once did. The cabin is the prime suspect (it was the last big addition to the frame, alongside this round's variety and NPC work).
- Wanted: a simpler cabin, futuristic and minimalist rather than retro, with less clutter, mainly to win back performance.
- Claude's note: measure before and after (cabin on/off, the new NPC behaviour tick, the extended giant-rock range) so the fix targets the real cost, not just the likeliest one.

### 9. A named enemy came back too soon, and was too easy
- A raider Shawn destroyed showed up again under the same name almost immediately after he left a planet's atmosphere, acting as if he remembered. It was far too soon to be believable.
- The fight was too easy: the ship seemed to have no shield.
- Likely causes (Claude, to verify when fixing):
  - Leaving an atmosphere respawns the place's NPCs, which also resets the fly-in timer to 45–85 s, so a known pilot can call almost straight away.
  - Raider names come from a short list, so a *different* raider can reuse a name you just killed. And a rival who returns is a new ship, built with basic raider stats.
- Wanted: rules for persistent characters, e.g.
  - Destroyed means dead: a pilot you kill never returns (or, if they survive, it's for a stated reason, such as ejecting, and it costs them).
  - A long cooldown before any known pilot reappears: a minimum real time *and* travel (other places or systems visited), longer still for enemies.
  - Names are unique while their owner is alive or recently dead.
  - A returning rival is stronger and better equipped each time (shields, more hull, wingmen), and says why they're back.
  - No hostile fly-ins right after an atmosphere exit, a jump or a fight.

### 10. Enemy destruction sounds like a bubble pop
- Destroying an enemy plays a weird pop rather than an explosion.
- Wanted: a weighty kill sound: a low boom with debris crackle and a short tail, scaled by ship size and distance, sitting under the music.

### 11. No feedback when you take damage
- There's no HUD indication when the ship is hit.
- Wanted: clear hit feedback: the hull and shield bars flash, a direction cue shows where the fire is coming from, and the dashboard elements flicker or flash when damaged (Shawn likes this idea), getting worse as hull drops.

### 12. Aux console screen: possible slowdown, and a better full-screen mode
- The small dash console screen may be adding to the slowdown (it's redrawn while you fly).
- Wanted: the small screen stays cheap while idle (rarely updated, or a static flicker), and the full display only loads when activated. When opened, it takes the place of the HUD, like a widescreen TV, instead of drawing on top of everything.

### 13. Is every player's universe new? (question answered, two gaps logged)
- Answer: yes. Each new save gets its own random universe seed (about 4.3 billion possibilities), so names, systems, places, fields, skies and NPCs differ for every player. Since this round, each place's field layout, rocks, nebula and sky are also seeded from it.
- Gap 1: there is no "New game" option. A player keeps one universe until the build number changes; they can't start a fresh one themselves.
- Gap 2 (Claude, important before more store releases): bumping the build number wipes every player's save and gives them a new universe. That's fine while testing, but on the Quest store every update would erase paying players' progress. Wanted: separate "new universe" from "new version": keep saves across updates (migrating them), and give players a New game / new universe button instead.
- **Decision (Shawn, 2026-11-19): a new version must no longer destroy a player's progress.** Saves carry across updates (migrated as needed); a fresh universe only when the player chooses to start fresh (a New game / new universe option, with a confirmation). Applies from the next build, v1.20: it reads existing v1.18/v1.19 saves rather than wiping them.
- Finite parts to deepen later: the name lists and encounter text are fixed tables, so on a long playthrough repeats will show (see finding 9 on names).
