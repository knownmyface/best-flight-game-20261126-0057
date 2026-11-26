# Canyon Thread — 3 Jets · 12 Rings · 9 Drones

[![Make.fun bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/knownmyface/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/knownmyface/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A 3D chase-view flight game for make.fun's **Make the best flight game** bounty.
Thread the glowing canyon rings before your fuel runs dry — then bring her
home onto the strip.

## The game

You fly a jet down a winding red-rock canyon at sunset. Rings hang over the
river in order, drones squat on the course, and the fuel gauge is the real
clock. Three airframes fly differently on purpose, three missions ask
different questions, and the wind never stops pushing.

- **3 selectable jets** — Kestrel (balanced), Falcon (fast, thirsty, agile),
  Albatross (slow, tough, huge tank). Pick in the hangar before you fly.
- **12 rings** threaded in order down the canyon spine, with a beacon on the
  next one and markers that point at it even when it is behind you.
- **9 shootable drones** — two cannon hits pops one: +150 score and a fuel
  cell worth +8.
- **3 missions × 3 difficulties** — Ring Run (12 rings, pure race), Canyon
  Delivery (6 rings + land on the runway), Storm Patrol (8 rings + 9 drones
  in 150 seconds). Cadet / Pilot / Ace change fuel burn, damage and wind.
- **Flight that rewards discipline** — bank-to-turn handling, stall with a
  nose drop, afterburner that gulps fuel, gusting crosswind, scrape damage
  and a PULL UP warning when the rock gets close.
- **Instruments that look flown** — ALT / SPD / HDG / vertical speed, throttle
  / fuel / hull bars, top-down radar, attitude ball, off-screen markers and
  a lead indicator. Synthesised engine, chimes, gunfire and explosions —
  no audio files.

## Controls

| Input | Action |
| --- | --- |
| A / D or ← / → | Bank left / right (banking turns the jet) |
| ↑ / ↓ | Pitch up / down |
| W / S | Throttle up / down |
| Shift | Afterburner |
| Click / Space | Fire the cannon |
| Q / E | Yaw trim |
| Enter | Fly / fly again |

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Static files only: `game/index.html` plus its ES modules, Three.js vendored
under `game/vendor/`, no network request at runtime.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library.

## Layout

- `game/src/world.js` — canyon heightfield, course spine, runway, river, trees
- `game/src/sky.js` — sunset dome, sun, drifting clouds, gusting wind
- `game/src/jets.js` — the three airframes and their procedural meshes
- `game/src/flight.js` — bank-to-turn flight model, stall, afterburner
- `game/src/rings.js` — the ring course and pass detection
- `game/src/drones.js` — the nine drone targets and their explosions
- `game/src/weapons.js` — the cannon and its tracers
- `game/src/missions.js` — missions, difficulties, sortie state and scoring
- `game/src/hud.js` — instruments, radar, attitude ball, markers
- `game/src/audio.js` — synthesised sound, no audio files
- `game/src/input.js` — keyboard and mouse
- `game/src/main.js` — scene, chase camera, menu/hangar, autopilot shots
- `game/src/rng.js` — the fixed seed and deterministic noise

## License

MIT — see [LICENSE](LICENSE).
