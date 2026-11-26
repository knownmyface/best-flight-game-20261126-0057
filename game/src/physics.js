// Arcade flight model: throttle sets target speed, bank turns the nose,
// pitch climbs or dives, lift needs speed. Throttle and turn discipline
// decide whether a sortie ends on the strip or in the canyon wall.
import * as THREE from '../vendor/three/three.module.min.js';
import { GAME, WORLD_SEED } from './config.js';
import { terrainHeight } from './terrain.js';
import { mulberry32 } from './random.js';

/** Fresh flight state, sitting on the runway threshold, engine idling. */
export function freshFlight() {
  return {
    pos: new THREE.Vector3(0, 26.5, 980),
    prevPos: new THREE.Vector3(0, 26.5, 980),
    heading: 0, // radians, 0 = north (-z), grows clockwise
    pitch: 0, // radians, + = nose up
    bank: 0, // radians, + = right wing down
    speed: 0,
    throttle: 0,
    fuel: GAME.fuelCapacity,
    damage: 0,
    airborne: false,
    landed: false,
    crashed: false,
    ditched: false, // stopped on the ground somewhere that is not the strip
    // smoothed wind gust, metres per second sideways
    wind: 0,
    windTarget: 0,
    windTimer: 0,
    // seeded gust sequence: the same canyon weather every sortie
    rand: mulberry32(WORLD_SEED + 7),
  };
}

/**
 * One fixed step of flight. `input` is { pitch, roll, throttleDelta, brake }
 * with pitch/roll in -1..1. `windStrength` scales the gusts. Returns events:
 * { tookOff, stalled, scraped, crashed, landed, outOfFuel }.
 */
export function stepFlight(f, input, dt, windStrength) {
  const events = {
    tookOff: false, stalled: false, scraped: false,
    crashed: false, landed: false, outOfFuel: false,
  };
  if (f.crashed || f.landed) return events;

  f.prevPos.copy(f.pos);

  // --- Throttle ---
  if (f.fuel > 0) {
    f.throttle = Math.max(0, Math.min(1, f.throttle + input.throttleDelta * dt));
  } else {
    f.throttle = Math.max(0, f.throttle - dt * 0.5);
    if (f.throttle === 0 && !events.outOfFuel) events.outOfFuel = true;
  }
  if (input.brake) f.throttle = Math.max(0, f.throttle - dt * 1.5);

  // --- Speed: chase the throttle's target, drag grows with speed squared ---
  const targetSpeed = f.throttle * GAME.maxSpeed;
  const accel = f.throttle > 0.02 ? 26 : -8;
  f.speed += Math.max(-30 * dt, Math.min(30 * dt, (targetSpeed - f.speed) * 0.55 * dt + accel * dt * 0.2));
  f.speed = Math.max(0, Math.min(GAME.maxSpeed, f.speed));

  // --- Bank / turn: the nose follows the bank, more at speed ---
  // A Kestrel at full bank turns hard: the canyon's bends are tight and
  // the rings are close together, so the jet has to be agile enough to
  // line up on a hoop instead of carving a wide circle past it.
  const bankTarget = input.roll * 1.05;
  f.bank += (bankTarget - f.bank) * Math.min(1, dt * 4.5);
  const turnRate = -Math.sin(f.bank) * (0.55 + (f.speed / GAME.maxSpeed) * 1.1);
  f.heading += turnRate * dt;

  // --- Pitch: climbs bleed speed, dives gain it ---
  const pitchTarget = input.pitch * 0.42;
  f.pitch += (pitchTarget - f.pitch) * Math.min(1, dt * 2.6);
  // gentle auto-level so the jet never holds a climb forever
  f.pitch *= 1 - 0.06 * dt;
  const climbRate = Math.sin(f.pitch) * f.speed;
  f.speed -= Math.sin(f.pitch) * 14 * dt; // climbing costs speed
  f.speed = Math.max(0, f.speed);

  // --- Wind gusts: sideways push that grows and fades ---
  f.windTimer -= dt;
  if (f.windTimer <= 0) {
    f.windTimer = 2 + f.rand() * 3;
    f.windTarget = (f.rand() * 2 - 1) * 9 * windStrength;
  }
  f.wind += (f.windTarget - f.wind) * Math.min(1, dt * 0.8);

  // --- Integrate position ---
  const forward = new THREE.Vector3(
    -Math.sin(f.heading) * Math.cos(f.pitch),
    Math.sin(f.pitch),
    -Math.cos(f.heading) * Math.cos(f.pitch),
  );
  const ground = terrainHeight(f.pos.x, f.pos.z);
  const alt = f.pos.y - ground;

  if (!f.airborne) {
    // Rolling on the strip: only forward motion, no climb until rotation speed.
    f.pos.addScaledVector(forward, f.speed * dt);
    f.pos.y = ground + 2.4;
    if (f.speed > 34 && f.pitch > 0.08) {
      f.airborne = true;
      events.tookOff = true;
    }
  } else {
    // Flying: lift needs speed; below stall speed the nose drops.
    let vy = climbRate;
    if (f.speed < GAME.stallSpeed) {
      vy -= (GAME.stallSpeed - f.speed) * 0.9;
      events.stalled = true;
    }
    f.pos.addScaledVector(forward, f.speed * Math.cos(f.pitch) * dt);
    f.pos.y += vy * dt;
    f.pos.x += f.wind * dt * 0.4; // gusts shove the jet sideways
  }

  // --- Fuel ---
  if (f.airborne || f.speed > 1) {
    f.fuel = Math.max(0, f.fuel - GAME.fuelBurn * (0.25 + f.throttle * 0.75) * dt);
  }

  // --- Ground contact ---
  const newGround = terrainHeight(f.pos.x, f.pos.z);
  const clearance = f.pos.y - newGround;
  if (clearance < 2.2) {
    const onRunway = Math.abs(f.pos.x) < 16 && Math.abs(f.pos.z - 980) < 175;
    const gentle = f.speed < 42 && Math.abs(f.pitch) < 0.16 && Math.abs(f.bank) < 0.3;
    if (onRunway && gentle && f.airborne) {
      // A landing: wheels down, speed bleeding off.
      f.landed = true;
      events.landed = true;
      f.pos.y = newGround + 2.4;
    } else if (onRunway && f.speed < 12 && !f.airborne) {
      f.pos.y = newGround + 2.4; // still rolling out
    } else if (f.airborne && f.speed < 3 && !onRunway) {
      // Ran out of energy on rough ground: ditched, sortie over.
      f.ditched = true;
      f.pos.y = newGround + 2.4;
    } else if (clearance < 0.6) {
      // Terrain strike.
      if (f.speed > 55 || !f.airborne) {
        f.crashed = true;
        events.crashed = true;
      } else {
        f.damage += GAME.scrapeDamage * dt * 8;
        events.scraped = true;
        f.pos.y = newGround + 0.8; // bounce off the rock, bleeding speed
        f.speed *= 0.86;
      }
    } else {
      f.pos.y = newGround + 2.2;
    }
  }
  if (f.damage >= 100) {
    f.damage = 100;
    f.crashed = true;
    events.crashed = true;
  }

  return events;
}

/** Heading in degrees, 0 = north, clockwise. */
export function headingDegrees(heading) {
  return ((heading * 180) / Math.PI % 360 + 360) % 360;
}

/** Compass point for a heading in degrees. */
export function compass(deg) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round(deg / 45) % 8];
}
