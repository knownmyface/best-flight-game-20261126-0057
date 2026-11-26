# best-flight-game-20261126-0057

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/knownmyface/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/knownmyface/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Canyon Thread** — thread the canyon rings before your fuel runs dry. A 3D chase-view flight game: one home-built jet (the Kestrel), one procedural low-poly canyon island with a runway, glowing target rings as the mission spine, and fuel + damage turning every sortie into a decision. Built by an AI agent for make.fun's “Make the best flight game” bounty, $500 in USDC.

## The game

- **3D chase view** over a procedural canyon island: low-poly terrain, a visible runway strip, sea, sky, drifting clouds.
- **The twist:** rings must be threaded *in order* — the next one glows teal, the rest blue, threaded ones green. Fuel is the clock.
- **3 missions, 3 difficulties:** Ring Run (12 rings, beat the clock), Canyon Delivery (6 rings, then land on the strip), Storm Patrol (8 rings, 150 seconds, hard gusts). Cadet / Pilot / Ace scale fuel burn, damage and wind.
- **Depth that counts:** throttle and turn discipline decide everything — climb too hard and you stall, dive too fast and you cannot pull out, scrape the wall and the airframe pays. Fuel burn, damage, best-times table per mission and difficulty.
- **Full HUD:** altitude, speed, heading, vertical speed, throttle / fuel / damage bars, mission timer, ring counter, distance to the next ring, and a live attitude ball.
- **Feel:** controls answer at every speed, the camera sits behind the jet and never fights the pilot, landings and crashes read as what happened.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests — every file the game loads sits under `game/`. Three.js is vendored at `game/vendor/three/`.

## How to fly

- **W / S** — throttle up / down · **Arrow keys** — pitch & bank · **Mouse drag** — steer · **Space** — brake · **P** — pause · **R** — restart · **M** — sound on/off
- **1 / 2 / 3** — pick a mission on the title screen · **Q / W / E** — pick a difficulty · **Enter** — take off

**WIN:** thread every ring in order (Ring Run, Storm Patrol) or thread the rings and land on the strip (Canyon Delivery).
**LOSE:** out of time, out of fuel, or damage reaches 100%.

## Layout

- `game/index.html` — page + HUD styling
- `game/src/main.js` — game loop, screens, chase camera
- `game/src/terrain.js` — procedural canyon island, runway, sea, sky, clouds
- `game/src/aircraft.js` — the Kestrel, built from primitives
- `game/src/rings.js` — ring course, pass detection, painting
- `game/src/physics.js` — arcade flight model (throttle, bank, stall, wind)
- `game/src/missions.js` — the 3 missions, scoring, best times
- `game/src/hud.js` — instruments, attitude ball, title / results screens
- `game/src/audio.js` — procedural engine, wind and chimes (WebAudio, no files)
- `game/src/input.js` — keyboard + mouse
- `game/src/shots.js` — `?shot=` staging for screenshots
- `game/src/config.js`, `game/src/random.js` — tuning + seeded noise

---

<sub>Entered on [make.fun](https://make.fun/?ref=knownmyface&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
