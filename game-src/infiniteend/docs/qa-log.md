# The Infinite End: QA log

Shawn's QA findings, logged one by one. Nothing here is being worked on until Shawn says to start.

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
