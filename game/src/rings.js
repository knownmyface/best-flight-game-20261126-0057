// The glowing target rings: the mission spine. Rings sit along the canyon
// course; threading one in order is the whole game.
import * as THREE from '../vendor/three/three.module.min.js';
import { COURSE, GAME } from './config.js';
import { spinePoint, terrainHeight } from './terrain.js';
import { mulberry32, range } from './random.js';

const RING_COLORS = {
  next: 0x2affd5, // teal: the ring you must fly now
  later: 0x2a7fff, // blue: waiting
  done: 0x35d435, // green: threaded
};

/**
 * Lay rings along the canyon spine. `count` rings, spread from just past the
 * runway to the north ridge, at heights that ride the canyon floor plus a
 * varying clearance so the pilot climbs and dives. Deterministic per count.
 */
export function makeRings(count, seedOffset = 0) {
  const rand = mulberry32(4242 + count * 131 + seedOffset);
  const rings = [];
  for (let i = 0; i < count; i += 1) {
    const t = 0.06 + (0.9 * i) / Math.max(1, count - 1);
    const p = spinePoint(t);
    const ground = terrainHeight(p.x, p.z);
    const clearance = 26 + range(rand, 0, 42) + Math.sin(i * 1.7) * 10;
    rings.push({
      index: i,
      x: p.x,
      y: Math.max(ground + 16, COURSE.canyonFloor + clearance),
      z: p.z,
      radius: 15,
      passed: false,
    });
  }
  return rings;
}

/** Build the torus meshes for a ring list. Returns { group, meshes }. */
export function buildRingMeshes(rings) {
  const group = new THREE.Group();
  group.name = 'rings';
  const meshes = rings.map((ring) => {
    const geo = new THREE.TorusGeometry(ring.radius, 1.1, 10, 40);
    const mat = new THREE.MeshBasicMaterial({ color: RING_COLORS.later });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ring.x, ring.y, ring.z);
    // Face the ring along the course direction (roughly north/south axis).
    mesh.rotation.y = 0;
    mesh.name = `ring-${ring.index}`;
    group.add(mesh);
    // inner glow disc, faint, so the hole reads at distance
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(ring.radius - 1.5, 32),
      new THREE.MeshBasicMaterial({
        color: RING_COLORS.later, transparent: true, opacity: 0.07, side: THREE.DoubleSide,
      }),
    );
    disc.position.copy(mesh.position);
    disc.name = `ring-disc-${ring.index}`;
    group.add(disc);
    return { mesh, disc };
  });
  return { group, meshes };
}

/** Recolour rings: next = teal, later = blue, done = green. */
export function paintRings(meshes, nextIndex) {
  meshes.forEach(({ mesh, disc }, i) => {
    const color = i < nextIndex ? RING_COLORS.done : i === nextIndex ? RING_COLORS.next : RING_COLORS.later;
    mesh.material.color.setHex(color);
    disc.material.color.setHex(color);
    mesh.material.opacity = 1;
  });
}

/**
 * Did the aircraft pass through ring `ring` this step? A pass counts when the
 * aircraft crosses the ring plane within the ring's inner radius. We test the
 * segment from `prev` to `pos` against the ring plane (rings face north, so
 * the plane is x-y at the ring's z).
 */
export function crossedRing(ring, prev, pos) {
  if ((prev.z - ring.z) * (pos.z - ring.z) > 0) return false; // no plane crossing
  const t = (ring.z - prev.z) / (pos.z - prev.z || 1e-6);
  const cx = prev.x + (pos.x - prev.x) * t;
  const cy = prev.y + (pos.y - prev.y) * t;
  const d = Math.hypot(cx - ring.x, cy - ring.y);
  return d < ring.radius - 1.5;
}

/** Horizontal distance to the next ring, for the HUD. */
export function distanceToRing(ring, pos) {
  return Math.hypot(ring.x - pos.x, ring.y - pos.y, ring.z - pos.z);
}

export { GAME };
