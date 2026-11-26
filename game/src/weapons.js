// Canyon Thread v2 — the cannon.
// A nose gun with a visible tracer: hold fire and a line of light reaches
// out from the jet to wherever the nose is pointing. Short range, fast
// cycle, honest aim — the tracer shows exactly where the round went, so a
// miss teaches the next shot.

import * as THREE from 'three';

const FIRE_INTERVAL = 0.14; // seconds between rounds
const TRACER_LIFE = 0.16;
const RANGE = 900;

export class Cannon {
  constructor(scene) {
    this.scene = scene;
    this.cooldown = 0;
    this.tracers = [];
  }

  get ready() {
    return this.cooldown <= 0;
  }

  // Fire one round along a normalised direction from the nose.
  // Returns the tracer end point (where the round stops).
  fire(origin, dir) {
    if (this.cooldown > 0) return null;
    this.cooldown = FIRE_INTERVAL;
    const end = origin.clone().addScaledVector(dir, RANGE);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      origin.x, origin.y, origin.z,
      end.x, end.y, end.z,
    ]), 3));
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }),
    );
    line.frustumCulled = false;
    this.scene.add(line);
    this.tracers.push({ line, life: TRACER_LIFE });
    return end;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / TRACER_LIFE) * 0.95;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}
