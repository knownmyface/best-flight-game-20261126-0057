// Canyon Thread v2 — the flight model.
// Arcade handling with one honest rule: you turn by banking. Hold a key and
// the jet banks to a target angle and stays there; the bank itself yaws the
// nose around. Release and it levels out. Speed is energy: too slow and the
// wings quit, too fast and the canyon comes at you quicker than you can
// think. Throttle, bank and nerve are the whole game.

import * as THREE from 'three';
import { clamp } from './rng.js';
import { WORLD } from './world.js';

const MAX_BANK = 1.08; // ~62 degrees
const ROLL_RATE = 2.6; // radians per second toward the target bank
const PITCH_RATE = 0.85;
const YAW_RATE = 0.22; // weak direct yaw, for fine trim only
const BANK_TURN = 1.6; // how hard a bank yaws the nose around

export class Flight {
  constructor(jet, heightAt) {
    this.jet = jet;
    this.heightAt = heightAt;
    this.pos = new THREE.Vector3(0, 200, 980);
    this.quat = new THREE.Quaternion();
    this.speed = jet.cruise;
    this.roll = 0; // signed bank angle, + = left bank
    this.hp = jet.hp;
    this.fuel = jet.fuel;
    this.alive = true;
    this.cause = '';
    this.stalled = false;
    this.afterburner = false;
    this.groundScrape = 0; // seconds of grace after a scrape
    this.invuln = 0;
    this.mesh = null;
  }

  attach(mesh) {
    this.mesh = mesh;
  }

  get maxHp() {
    return this.jet.hp;
  }

  get maxFuel() {
    return this.jet.fuel;
  }

  reset(start) {
    this.pos.set(start.x, start.y, start.z);
    // Heading is atan2(dx, -dz); a Y rotation of -heading puts the nose
    // (local -Z) on it: forward becomes (sin h, 0, -cos h).
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(start.heading || 0));
    this.speed = this.jet.cruise;
    this.roll = 0;
    this.hp = this.jet.hp;
    this.fuel = this.jet.fuel;
    this.alive = true;
    this.cause = '';
    this.stalled = false;
    this.afterburner = false;
    this.invuln = 1.5;
    this.syncMesh();
  }

  forward(out = new THREE.Vector3()) {
    return out.set(0, 0, -1).applyQuaternion(this.quat);
  }

  up(out = new THREE.Vector3()) {
    return out.set(0, 1, 0).applyQuaternion(this.quat);
  }

  right(out = new THREE.Vector3()) {
    return out.set(1, 0, 0).applyQuaternion(this.quat);
  }

  syncMesh() {
    if (!this.mesh) return;
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
    this.mesh.visible = this.alive && !(this.invuln > 0 && Math.floor(this.invuln * 4) % 2 === 0);
  }

  // input: { pitch (-1..1, + = pull up), roll (-1..1, + = bank left),
  // yaw (-1..1), throttle (0..1, -1 = idle cut), fire, boost }
  // env: { wind: Vector3, fuelBurn: number, dt }
  update(dt, input, env) {
    if (!this.alive) return;
    const jet = this.jet;
    if (this.invuln > 0) this.invuln -= dt;

    // --- energy: speed follows the throttle, with a cruise it returns to ---
    const boost = input.boost && this.fuel > 0;
    this.afterburner = boost;
    const top = jet.top * (boost ? 1.32 : 1);
    const cruise = jet.cruise * (boost ? 1.18 : 1);
    const throttle = clamp(input.throttle ?? 0.6, 0, 1);
    const target = throttle * top;
    const rate = jet.accel * (target > this.speed ? 1 : 1.6);
    this.speed += clamp(target - this.speed, -rate * dt, rate * dt);
    if (!boost && this.speed > top) this.speed = Math.max(top, this.speed - rate * dt);
    this.speed = Math.max(0, this.speed);

    // --- stall: below the wing's flying speed the nose drops by itself ---
    const stallSpeed = jet.min + 4;
    this.stalled = this.speed < stallSpeed;
    const agility = clamp(0.45 + 0.55 * (this.speed / jet.top), 0.35, 1) * jet.turn;

    // --- pitch: pull to climb, with the stall dragging the nose down ---
    const e = new THREE.Euler();
    const dq = new THREE.Quaternion();
    let pitchIn = clamp(input.pitch || 0, -1, 1) * PITCH_RATE * jet.pitch * agility;
    if (this.stalled) pitchIn -= 0.55; // the nose falls through the stall
    if (pitchIn !== 0) {
      e.set(pitchIn * dt, 0, 0, 'XYZ');
      dq.setFromEuler(e);
      this.quat.multiply(dq);
    }

    // --- roll: ease toward a target bank, never roll past it ---
    const targetBank = clamp(input.roll || 0, -1, 1) * MAX_BANK;
    const bankDelta = targetBank - this.roll;
    const step = clamp(bankDelta, -ROLL_RATE * agility * dt, ROLL_RATE * agility * dt);
    if (Math.abs(step) > 1e-6) {
      e.set(0, 0, step, 'XYZ');
      dq.setFromEuler(e);
      this.quat.multiply(dq);
      this.roll += step;
    }
    // Measure the real bank from the airframe, so the turn always matches it.
    const rgt = this.right();
    const upv = this.up();
    this.roll = Math.atan2(rgt.y, upv.y);

    // --- bank-to-turn: the bank itself swings the nose around the sky ---
    const bankYaw = Math.sin(this.roll) * BANK_TURN * agility * dt * (0.5 + 0.5 * (this.speed / jet.top));
    if (Math.abs(bankYaw) > 1e-6) {
      const wq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), bankYaw);
      this.quat.premultiply(wq);
    }

    // --- direct yaw trim ---
    const yawIn = clamp(input.yaw || 0, -1, 1);
    if (yawIn !== 0) {
      e.set(0, yawIn * YAW_RATE * agility * dt, 0, 'XYZ');
      dq.setFromEuler(e);
      this.quat.multiply(dq);
    }
    this.quat.normalize();

    // --- motion: velocity follows the nose, plus the wind pushing sideways ---
    const fwd = this.forward();
    this.pos.addScaledVector(fwd, this.speed * dt);
    if (env.wind) this.pos.addScaledVector(env.wind, dt);

    // --- fuel: the throttle drinks, the burner gulps ---
    const burn = env.fuelBurn * (0.35 + 0.65 * throttle) * (boost ? 2.6 : 1) * dt;
    this.fuel -= burn;
    if (this.fuel <= 0) {
      this.fuel = 0;
      // Out of fuel: the engine quits and the jet becomes a glider.
      this.speed = Math.max(this.speed - 26 * dt, 0);
      if (this.speed <= 1 && this.pos.y - this.heightAt(this.pos.x, this.pos.z) < 12) {
        this.die('OUT OF FUEL');
      }
    }

    // --- gravity: a wing with no airspeed sinks, nose-first, toward the rock ---
    if (this.speed < 12) {
      const sink = (12 - this.speed) * 2.4 * dt;
      this.pos.y -= sink;
      if (this.speed < 6) {
        e.set(0.35 * dt, 0, 0, 'XYZ');
        dq.setFromEuler(e);
        this.quat.multiply(dq);
      }
    }

    // --- ceiling: the climb softens, then stops ---
    const soft = WORLD.ceiling - 120;
    if (this.pos.y > soft && fwd.y > 0) {
      this.pos.y -= fwd.y * this.speed * dt * clamp((this.pos.y - soft) / 120, 0, 1);
    }
    if (this.pos.y > WORLD.ceiling) this.pos.y = WORLD.ceiling;

    // --- world edge: a soft wall turns you back ---
    const edge = WORLD.half - 60;
    for (const ax of ['x', 'z']) {
      if (this.pos[ax] > edge) this.pos[ax] = edge;
      if (this.pos[ax] < -edge) this.pos[ax] = -edge;
    }

    // --- ground: a hard hit is a crash, a graze is a scrape and a warning ---
    const ground = this.heightAt(this.pos.x, this.pos.z);
    const clearance = this.pos.y - ground;
    if (clearance < 2.5) {
      const impact = -fwd.y * this.speed;
      if (impact > 14 || clearance < 0.5) {
        this.die('TERRAIN');
      } else if (this.groundScrape <= 0) {
        this.groundScrape = 1.2;
        this.hurt(16, 'SCRAPE');
        this.speed *= 0.82;
        this.pos.y = ground + 3;
      }
    }
    if (this.groundScrape > 0) this.groundScrape -= dt;

    this.syncMesh();
  }

  hurt(amount, cause = 'HIT') {
    if (!this.alive || this.invuln > 0) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(cause);
    }
  }

  die(cause) {
    if (!this.alive) return;
    this.alive = false;
    this.cause = cause;
    this.syncMesh();
  }
}
