// Canyon Thread v2 — sky, sun, clouds and wind.
// A warm sunset dome that stays glued to the camera, a low sun with a glow,
// instanced cloud puffs drifting with the wind, and a gust model that pushes
// the jet sideways so the air itself is part of the flying.

import * as THREE from 'three';
import { mulberry32, clamp } from './rng.js';

const CLOUD_CLUSTERS = 56;
const PUFFS_PER_CLUSTER = 5;
const CLOUD_SPREAD = 6200;
const CLOUD_ALT = [640, 1150];

// Sunset palette: peach at the horizon, deep blue overhead.
const HORIZON = new THREE.Color(0xf7b267);
const ZENITH = new THREE.Color(0x2e5f9e);

export class SkyDome {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.SphereGeometry(8800, 32, 16);
    const count = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.domeGeo = geo;
    this.dome = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    this.dome.renderOrder = -10;
    // Low sun and its halo, parked in the west so the canyon walls catch it.
    this.sunDir = new THREE.Vector3(-0.55, 0.32, -0.4).normalize();
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(170, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff2cf, fog: false }),
    );
    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(560, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0xffdf9e, transparent: true, opacity: 0.2, fog: false, depthWrite: false }),
    );
    // Clouds: one instanced mesh of flattened octahedra, clustered in puffs.
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xfff4e6, emissive: 0x9aa0a8 });
    this.clouds = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 2),
      this.cloudMat,
      CLOUD_CLUSTERS * PUFFS_PER_CLUSTER,
    );
    this.clouds.frustumCulled = false;
    const rand = mulberry32(0xca770d);
    this.puffs = [];
    for (let c = 0; c < CLOUD_CLUSTERS; c++) {
      const cx = (rand() * 2 - 1) * CLOUD_SPREAD;
      const cz = (rand() * 2 - 1) * CLOUD_SPREAD;
      const cy = CLOUD_ALT[0] + rand() * (CLOUD_ALT[1] - CLOUD_ALT[0]);
      const size = 70 + rand() * 110;
      for (let k = 0; k < PUFFS_PER_CLUSTER; k++) {
        this.puffs.push({
          x: cx + (rand() - 0.5) * size * 2.4,
          y: cy + (rand() - 0.5) * size * 0.3,
          z: cz + (rand() - 0.5) * size * 1.4,
          s: size * (0.5 + rand() * 0.7),
        });
      }
    }
    this.drift = 0;
    this.paintDome();
    scene.add(this.dome);
    scene.add(this.sun);
    scene.add(this.halo);
    scene.add(this.clouds);
  }

  // Colour the dome by height: peach at the horizon, blue straight up.
  paintDome() {
    const pos = this.domeGeo.attributes.position;
    const col = this.domeGeo.attributes.color;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = clamp(pos.getY(i) / 8800, 0, 1);
      c.copy(HORIZON).lerp(ZENITH, Math.pow(h, 0.55));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  update(dt, camera, windX) {
    this.dome.position.copy(camera.position);
    this.sun.position.copy(camera.position).addScaledVector(this.sunDir, 8200);
    this.halo.position.copy(this.sun.position);
    this.drift += dt * (6 + windX * 0.35);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < this.puffs.length; i++) {
      const puff = this.puffs[i];
      let x = puff.x + this.drift;
      x = ((x + CLOUD_SPREAD) % (2 * CLOUD_SPREAD) + 2 * CLOUD_SPREAD) % (2 * CLOUD_SPREAD) - CLOUD_SPREAD;
      m.compose(p.set(x, puff.y, puff.z), q, s.set(puff.s, puff.s * 0.42, puff.s * 0.68));
      this.clouds.setMatrixAt(i, m);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }
}

// Gusting crosswind: a slow swell plus a faster ripple, always sideways to
// the course so the player feels it on the stick but can always correct it.
export class WindField {
  constructor(strength = 1) {
    this.strength = strength; // difficulty multiplier
    this.time = 0;
    this.dir = new THREE.Vector3(0.8, 0, 0.6).normalize();
  }

  update(dt) {
    this.time += dt;
  }

  // Current wind velocity in world units per second.
  velocity(out = new THREE.Vector3()) {
    const swell = 0.75 + 0.25 * Math.sin(this.time * 0.45);
    const ripple = 0.12 * Math.sin(this.time * 2.1) + 0.08 * Math.sin(this.time * 3.7);
    const speed = 8 * this.strength * swell + 3 * this.strength * ripple;
    return out.copy(this.dir).multiplyScalar(speed);
  }

  // Headline number for the HUD: knots, rounded.
  knots() {
    return Math.round(this.velocity().length() * 1.94);
  }
}
