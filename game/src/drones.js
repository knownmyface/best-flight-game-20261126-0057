// Canyon Thread v2 — the drones.
// Nine rogue survey drones squatting on the course, each one a red target
// begging to be shot down. Two cannon hits pops one: a burst of sparks, a
// score bonus, and a fuel cell drifting down to whoever collects it. They
// bob and weave just enough that a snapshot takes aim, not luck.

import * as THREE from 'three';
import { mulberry32 } from './rng.js';

const DRONE_HP = 2;
const HIT_RADIUS = 7;

export class DroneField {
  constructor(scene, anchors) {
    this.scene = scene;
    this.group = new THREE.Group();
    const rand = mulberry32(0xd906e5);
    this.drones = anchors.map((a, i) => {
      const body = new THREE.Group();
      // A faceted core with a red eye: it has to read as hostile at a glance.
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(3.4, 0),
        new THREE.MeshLambertMaterial({ color: 0x3a3f46 }),
      );
      body.add(core);
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(1.3, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
      );
      eye.position.set(0, 0, -3.2);
      body.add(eye);
      // Rotor ring spinning above the core.
      const rotor = new THREE.Mesh(
        new THREE.TorusGeometry(4.4, 0.35, 6, 24),
        new THREE.MeshBasicMaterial({ color: 0x8a929c }),
      );
      rotor.rotation.x = Math.PI / 2;
      rotor.position.y = 2.2;
      body.add(rotor);
      body.position.set(a.x, a.y, a.z);
      this.group.add(body);
      return {
        index: i,
        body,
        rotor,
        base: { x: a.x, y: a.y, z: a.z },
        phase: rand() * Math.PI * 2,
        amp: 3 + rand() * 4,
        speed: 0.7 + rand() * 0.6,
        hp: DRONE_HP,
        alive: true,
      };
    });
    scene.add(this.group);
    this.sparks = [];
    this.time = 0;
  }

  get aliveCount() {
    return this.drones.filter((d) => d.alive).length;
  }

  get total() {
    return this.drones.length;
  }

  reset() {
    this.drones.forEach((d) => {
      d.hp = DRONE_HP;
      d.alive = true;
      d.body.visible = true;
    });
    this.clearSparks();
  }

  // Ray-sphere test against every living drone. Returns the drone hit, or null.
  // origin + dir must be a normalised ray; maxDist caps the range.
  rayHit(origin, dir, maxDist = 900) {
    let best = null;
    let bestT = maxDist;
    for (const d of this.drones) {
      if (!d.alive) continue;
      const cx = d.body.position.x - origin.x;
      const cy = d.body.position.y - origin.y;
      const cz = d.body.position.z - origin.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t < 0 || t > bestT) continue;
      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      const pz = origin.z + dir.z * t;
      const dx = px - d.body.position.x;
      const dy = py - d.body.position.y;
      const dz = pz - d.body.position.z;
      if (dx * dx + dy * dy + dz * dz < HIT_RADIUS * HIT_RADIUS) {
        best = d;
        bestT = t;
      }
    }
    return best;
  }

  // One cannon hit on a drone. Returns 'down' when it pops, 'hit' otherwise.
  damage(drone) {
    if (!drone || !drone.alive) return null;
    drone.hp -= 1;
    drone.flinch = 0.14; // the airframe jolts on a hit
    if (drone.hp <= 0) {
      drone.alive = false;
      drone.body.visible = false;
      this.burst(drone.body.position);
      return 'down';
    }
    return 'hit';
  }

  // A quick spark burst where a drone died: orange points that fly out and fade.
  burst(pos) {
    const count = 26;
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array(count * 3);
    const vels = [];
    for (let i = 0; i < count; i++) {
      verts[i * 3] = pos.x;
      verts[i * 3 + 1] = pos.y;
      verts[i * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const sp = 26 + Math.random() * 42;
      vels.push(new THREE.Vector3(
        Math.sin(ph) * Math.cos(th) * sp,
        Math.cos(ph) * sp,
        Math.sin(ph) * Math.sin(th) * sp,
      ));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xffa63d, size: 3.2, transparent: true, opacity: 1 }),
    );
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.sparks.push({ pts, vels, life: 0.9 });
  }

  clearSparks() {
    for (const s of this.sparks) {
      this.scene.remove(s.pts);
      s.pts.geometry.dispose();
      s.pts.material.dispose();
    }
    this.sparks = [];
  }

  update(dt) {
    this.time += dt;
    for (const d of this.drones) {
      if (!d.alive) continue;
      // Bob up and down, drift sideways: a moving target, never a sitting one.
      d.body.position.y = d.base.y + Math.sin(this.time * d.speed + d.phase) * d.amp;
      d.body.position.x = d.base.x + Math.sin(this.time * d.speed * 0.6 + d.phase * 2) * 6;
      d.rotor.rotation.z += dt * 14;
      d.body.rotation.y += dt * 0.4;
      // A hit makes the drone jolt bigger for a blink.
      if (d.flinch > 0) {
        d.flinch -= dt;
        const k = 1 + Math.max(0, d.flinch / 0.14) * 0.22;
        d.body.scale.set(k, k, k);
      } else {
        d.body.scale.set(1, 1, 1);
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      const arr = s.pts.geometry.attributes.position.array;
      for (let k = 0; k < s.vels.length; k++) {
        arr[k * 3] += s.vels[k].x * dt;
        arr[k * 3 + 1] += s.vels[k].y * dt;
        arr[k * 3 + 2] += s.vels[k].z * dt;
        s.vels[k].y -= 30 * dt;
      }
      s.pts.geometry.attributes.position.needsUpdate = true;
      s.pts.material.opacity = Math.max(0, s.life / 0.9);
      if (s.life <= 0) {
        this.scene.remove(s.pts);
        s.pts.geometry.dispose();
        s.pts.material.dispose();
        this.sparks.splice(i, 1);
      }
    }
  }
}

// Drone anchors: offset from the ring stations so the player meets a target
// on the way to every other ring.
export function droneAnchors(stations) {
  const out = [];
  const rand = mulberry32(0xd201e5);
  for (let i = 0; i < 9; i++) {
    const st = stations[Math.min(stations.length - 1, Math.floor((i + 0.5) * stations.length / 9))];
    out.push({
      x: st.x + (rand() * 2 - 1) * 70,
      y: st.y + 18 + rand() * 26,
      z: st.z + (rand() * 2 - 1) * 70,
    });
  }
  return out;
}
