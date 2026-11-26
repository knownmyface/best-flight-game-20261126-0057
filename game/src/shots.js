// Screenshot staging behind ?shot=cover|rings|landing|title. Each scene
// plays the real rules forward from a fresh sortie with a simple autopilot
// (steer at the next ring, or at the runway on final), then freezes the
// frame — so the shot is what a real flight looks like, and the same scene
// always gives the same frame.
import { COURSE } from './config.js';
import { stepFlight } from './physics.js';
import { crossedRing, distanceToRing } from './rings.js';
import { ringThreaded, stepMission } from './missions.js';
import { terrainHeight, spinePoint } from './terrain.js';

const STEP = 1 / 60;

/** Steer the jet at a 3D target point; returns a flight input. */
function steerAt(flight, target, wantThrottle) {
  const dx = target.x - flight.pos.x;
  const dz = target.z - flight.pos.z;
  const dy = target.y - flight.pos.y;
  // Desired heading: 0 = north (-z). atan2(-dx, -dz) gives heading to target.
  const wantHeading = Math.atan2(-dx, -dz);
  let err = wantHeading - flight.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const dist = Math.hypot(dx, dz);
  // A firmer pitch response than the 0.9 a gentle cruise wants: following
  // a descending glide slope on proportional pitch alone settles metres
  // above the slope, and metres are the difference between a landing and
  // floating past the numbers.
  const wantPitch = Math.max(-0.35, Math.min(0.4, Math.atan2(dy, Math.max(30, dist)) * 1.5));
  return {
    pitch: Math.max(-1, Math.min(1, (wantPitch - flight.pitch) * 4)),
    // Bank right (roll > 0) decreases heading, which turns the nose toward
    // a target east of north (negative heading error) — hence the minus.
    // A gentler gain than full stick: the bank catches up fast now, so a
    // hard gain would overshoot the line and wag the jet.
    roll: Math.max(-1, Math.min(1, -err * 1.4)),
    throttleDelta: flight.throttle < wantThrottle ? 0.55 : -0.55,
    // On a slow final, stand on the brake until the speed is down to
    // landing pace instead of floating over the strip too fast to land.
    brake: wantThrottle <= 0.3 && flight.speed > 40,
  };
}

/** Course direction at ring `index`: from the previous ring to the next. */
function courseDir(rings, index) {
  const a = rings[Math.max(0, index - 1)];
  const b = rings[Math.min(rings.length - 1, index + 1)];
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / len, y: dy / len, z: dz / len };
}

/** Signed heading error (radians, -pi..pi) from the jet to a target point. */
function headingErrorTo(flight, target) {
  const want = Math.atan2(-(target.x - flight.pos.x), -(target.z - flight.pos.z));
  let err = want - flight.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  return err;
}

/**
 * Run the autopilot forward for `seconds` of simulated flight on the given
 * mission state, threading rings as it goes. Returns nothing; the flight and
 * mission objects are advanced in place.
 */
export function autopilotRun(game, seconds) {
  const { flight, mission } = game;
  const steps = Math.floor(seconds / STEP);
  // Once the jet commits to final approach it never goes back to the fix:
  // chasing a point fix in a turn only ever orbits it. The latch lives on
  // the game object so it survives runUntil's one-second chunks.
  if (game.committedToFinal === undefined) game.committedToFinal = false;
  for (let i = 0; i < steps; i += 1) {
    const ring = mission.rings[mission.nextRing];
    let target; let wantThrottle = 0.78;
    if (mission.mission.needsLanding && mission.nextRing >= mission.rings.length) {
      // Final approach: fly to a fix south of the strip, turn onto the
      // centreline, then ride a 3-degree glide slope down to the threshold
      // slow — a landing only counts under 42 m/s with wings level.
      const fix = { x: COURSE.start.x, y: 60, z: COURSE.start.z + 520 };
      const errToThreshold = Math.abs(headingErrorTo(flight, { x: COURSE.start.x, y: 27, z: COURSE.start.z - 200 }));
      const distToFix = Math.hypot(fix.x - flight.pos.x, fix.z - flight.pos.z);
      const pastFix = flight.pos.z > fix.z - 20;
      if (!game.committedToFinal && (pastFix || distToFix < 150) && errToThreshold < 1.2) {
        game.committedToFinal = true;
      }
      if (game.committedToFinal) {
        // Glide slope down to the strip, then flat at strip level for the
        // last 150 m: the proportional pitch settles a few metres above
        // the slope, so the slope ends at the ground and the jet is
        // firmly on the numbers by mid-strip instead of floating past.
        const distToThreshold = Math.hypot(
          COURSE.start.x - flight.pos.x,
          (COURSE.start.z - 200) - flight.pos.z,
        );
        target = {
          x: COURSE.start.x,
          y: 24 + Math.max(0, distToThreshold - 150) * 0.08,
          z: COURSE.start.z - 200,
        };
        wantThrottle = 0.28;
      } else {
        target = fix;
        wantThrottle = distToFix < 400 ? 0.45 : 0.6;
      }
    } else if (ring) {
      // Line up first, then fly straight through. The setup point 300 m
      // behind the ring on the course axis only matters once the jet is
      // level with or past the hoop with its nose off-axis — while it is
      // still behind the ring on the approach, it just flies at the hoop.
      // Chasing the hoop from a hard turn only ever orbits it, and flying
      // to a setup point behind the jet only ever flies it away.
      const dir = courseDir(mission.rings, mission.nextRing);
      const distToRing = Math.hypot(ring.x - flight.pos.x, ring.z - flight.pos.z);
      const along = (flight.pos.x - ring.x) * dir.x
        + (flight.pos.y - ring.y) * dir.y
        + (flight.pos.z - ring.z) * dir.z;
      const errToRing = Math.abs(headingErrorTo(flight, ring));
      if (along > -60 && errToRing > 0.08 && distToRing < 350) {
        target = {
          x: ring.x - dir.x * 300,
          y: ring.y,
          z: ring.z - dir.z * 300,
        };
      } else if (distToRing < 200) {
        target = { x: ring.x, y: ring.y, z: ring.z };
      } else if (distToRing > 250) {
        // Far out, fly the canyon, not the straight line: a waypoint on
        // the spine just short of the ring keeps the jet inside the slot
        // instead of cutting corners over the rim walls.
        const ringT = 0.06 + (0.9 * mission.nextRing) / Math.max(1, mission.rings.length - 1);
        const wp = spinePoint(Math.max(0, ringT - 0.07));
        target = { x: wp.x, y: ring.y, z: wp.z };
      } else {
        target = { x: ring.x + dir.x * 90, y: ring.y, z: ring.z + dir.z * 90 };
      }
      wantThrottle = distToRing < 260 ? 0.45 : 0.78;
    } else {
      target = { x: COURSE.start.x, y: 60, z: COURSE.start.z };
    }
    const input = steerAt(flight, target, wantThrottle);
    // Terrain safety: never fly the canyon floor into a wall. If the
    // ground is coming up fast and this is not a landing final, climb.
    const onFinal = mission.mission.needsLanding && mission.nextRing >= mission.rings.length;
    const clearance = flight.pos.y - terrainHeight(flight.pos.x, flight.pos.z);
    if (!onFinal && clearance < 28) input.pitch = Math.max(input.pitch, 0.7);
    const events = stepFlight(flight, input, STEP, mission.mission.wind * mission.difficulty.wind);
    if (ring && crossedRing(ring, flight.prevPos, flight.pos)) {
      ring.passed = true;
      ringThreaded(mission);
    }
    // Keep the mission clock honest so the staged HUD reads true.
    const outcome = stepMission(mission, flight, STEP, events);
    if (outcome || flight.crashed || flight.landed) break;
  }
}

/**
 * Run the autopilot in 1-second chunks until `good(game)` is true or `cap`
 * seconds pass. Screenshots freeze on a good moment — wings level, nose on
 * the next ring — instead of mid-turn with the canyon wall filling the frame.
 */
function runUntil(game, cap, good) {
  for (let s = 0; s < cap; s += 1) {
    autopilotRun(game, 1);
    if (good(game)) return;
    if (game.flight.crashed || game.flight.landed || game.mission.status !== 'flying') return;
  }
}

function wingsLevel(game, maxBank) {
  return Math.abs(game.flight.bank) < maxBank;
}

function clearanceOf(game) {
  return game.flight.pos.y - terrainHeight(game.flight.pos.x, game.flight.pos.z);
}

/**
 * Stage a named shot on a fresh game object. Returns the screen to show:
 * 'title' | 'play' | 'over'. The game is left frozen on that frame.
 */
export function stageShot(name, game) {
  // title: no flight, camera orbits the canyon over the title screen
  if (name === 'title') return 'title';
  // cover: mid-flight chase view, a few rings threaded, the next one dead
  // ahead, wings level, canyon walls around the jet
  if (name === 'cover') {
    game.startMission(0, 'pilot');
    runUntil(game, 100, (g) => {
      const ring = g.mission.rings[g.mission.nextRing];
      return g.mission.ringsDone >= 3 && wingsLevel(g, 0.18)
        && ring && Math.abs(headingErrorTo(g.flight, ring)) < 0.12
        && clearanceOf(g) > 20;
    });
    return 'play';
  }
  // rings: deep in the canyon, closing on a ring with the next ones in view
  if (name === 'rings') {
    game.startMission(0, 'pilot');
    runUntil(game, 140, (g) => {
      const ring = g.mission.rings[g.mission.nextRing];
      return g.mission.ringsDone >= 4 && wingsLevel(g, 0.3)
        && ring && distanceToRing(ring, g.flight.pos) < 160
        && clearanceOf(g) > 20;
    });
    return 'play';
  }
  // landing: delivery mission, rings done, on final approach to the strip —
  // freeze on a straight, wings-level final with the strip ahead
  if (name === 'landing') {
    game.startMission(1, 'pilot');
    runUntil(game, 300, (g) => {
      const done = g.mission.nextRing >= g.mission.rings.length;
      // On the straight final, low over the island's south shore with the
      // strip ahead — not still out over the sea on the way to the fix.
      return done && wingsLevel(g, 0.35) && clearanceOf(g) < 50
        && g.flight.pos.z > 1050 && g.flight.pos.z < 1250
        && g.flight.speed < 55;
    });
    return 'play';
  }
  return 'title';
}
