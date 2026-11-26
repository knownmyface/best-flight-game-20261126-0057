// Canyon Thread v2 — the canyon world.
// A winding canyon cut through a red-rock plateau, a river on its floor, a
// runway at the south end, and the ring course threaded down its spine.
// Terrain is a pure function heightAt(x, z): collisions are one evaluation.

import * as THREE from 'three';
import { fbm, mulberry32, clamp, lerp, smoothstep, WORLD_SEED } from './rng.js';

export const WORLD = {
  half: 1400, // terrain spans -1400..1400 on x and z
  ceiling: 900,
  canyonFloor: 24,
  canyonHalf: 85, // half-width of the carved channel
  wallRise: 230, // distance over which the walls climb to the plateau
  runway: { x: 0, z: 1020, len: 300, wid: 30 },
};

// The canyon centre line, south -> north. The rings and the river follow it.
export const SPINE = [
  [0, 980], [50, 740], [-40, 540], [20, 340], [80, 140],
  [-20, -60], [0, -260], [-60, -460], [30, -680], [70, -880], [0, -1080],
];
// The bends are gentle (heading changes of 25-45 degrees) so a jet at full
// throttle can actually thread the canyon instead of swinging into the walls.

// Distance from a point to one line segment.
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

// Shortest distance to the canyon spine.
export function distToSpine(x, z) {
  let best = Infinity;
  for (let i = 0; i < SPINE.length - 1; i++) {
    const d = segDist(x, z, SPINE[i][0], SPINE[i][1], SPINE[i + 1][0], SPINE[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

// Ground height at any point. Canyon floor inside the channel, red-rock
// plateau outside, flat-topped mesas far out, runway pad flattened.
export function heightAt(x, z) {
  const d = distToSpine(x, z);
  const plateau = 220 + fbm(x * 0.0011 + 3.1, z * 0.0011 - 1.7, 4) * 120;
  const floor = WORLD.canyonFloor + fbm(x * 0.004, z * 0.004, 3) * 6;
  const wall = smoothstep(WORLD.canyonHalf, WORLD.canyonHalf + WORLD.wallRise, d);
  let h = lerp(floor, plateau, wall);
  // Mesas: flat tops that poke out of the plateau far from the course.
  const mesa = fbm(x * 0.0004 + 11.3, z * 0.0004 + 5.7, 3);
  if (mesa > 0.62) h += Math.pow((mesa - 0.62) / 0.38, 2) * 150 * smoothstep(420, 800, d);
  // Runway pad: flatten a strip around the runway so landings read.
  const rx = Math.abs(x - WORLD.runway.x);
  const rz = Math.abs(z - WORLD.runway.z);
  const pad = (1 - smoothstep(WORLD.runway.wid + 30, WORLD.runway.wid + 130, rx))
    * (1 - smoothstep(WORLD.runway.len / 2 + 20, WORLD.runway.len / 2 + 120, rz));
  if (pad > 0) h = lerp(h, WORLD.canyonFloor + 2, pad);
  return h;
}

// Point on the spine at arc-length fraction t in [0, 1], with heading.
export function coursePoint(t) {
  const lens = [];
  let total = 0;
  for (let i = 0; i < SPINE.length - 1; i++) {
    const len = Math.hypot(SPINE[i + 1][0] - SPINE[i][0], SPINE[i + 1][1] - SPINE[i][1]);
    lens.push(len);
    total += len;
  }
  let want = clamp(t, 0, 1) * total;
  for (let i = 0; i < lens.length; i++) {
    if (want <= lens[i] || i === lens.length - 1) {
      const f = lens[i] > 0 ? clamp(want / lens[i], 0, 1) : 0;
      const x = lerp(SPINE[i][0], SPINE[i + 1][0], f);
      const z = lerp(SPINE[i][1], SPINE[i + 1][1], f);
      const heading = Math.atan2(SPINE[i + 1][0] - SPINE[i][0], -(SPINE[i + 1][1] - SPINE[i][1]));
      return { x, z, heading };
    }
    want -= lens[i];
  }
  return { x: SPINE[0][0], z: SPINE[0][1], heading: 0 };
}

// Ring stations: evenly spaced along the spine, floating above the floor.
export function ringStations(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = coursePoint((i + 0.5) / count);
    const alt = heightAt(p.x, p.z) + 52 + Math.sin(i * 1.7) * 10;
    out.push({ x: p.x, y: alt, z: p.z, heading: p.heading });
  }
  return out;
}

// Strata colours: sand floor, red bands on the walls, sage on the plateau.
function groundColor(x, z, h) {
  const d = distToSpine(x, z);
  const band = Math.sin(h * 0.11) * 0.5 + 0.5;
  if (d < WORLD.canyonHalf + 20) {
    // canyon floor: warm sand with a darker wet line near the river
    const wet = 1 - smoothstep(6, 26, Math.abs(d - 0));
    return [0.78 - wet * 0.18, 0.58 - wet * 0.12, 0.34 - wet * 0.05];
  }
  if (h < 90) return [0.74 + band * 0.06, 0.42 + band * 0.05, 0.26];
  if (h < 170) return [0.66 + band * 0.08, 0.3 + band * 0.04, 0.16];
  // plateau: sage scrub fading to pale rock on the tops
  const top = smoothstep(190, 260, h);
  return [lerp(0.38, 0.74, top), lerp(0.44, 0.68, top), lerp(0.22, 0.55, top)];
}

function buildTerrainMesh() {
  const segs = 150;
  const size = WORLD.half * 2;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const c = groundColor(x, z, h);
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  mesh.name = 'canyonTerrain';
  return mesh;
}

function buildRunway() {
  const group = new THREE.Group();
  const r = WORLD.runway;
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(r.wid, r.len),
    new THREE.MeshLambertMaterial({ color: 0x2e3238 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(r.x, WORLD.canyonFloor + 2.6, r.z);
  group.add(strip);
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, r.len - 40),
    new THREE.MeshBasicMaterial({ color: 0xf2f0e4 }),
  );
  line.rotation.x = -Math.PI / 2;
  line.position.set(r.x, WORLD.canyonFloor + 2.8, r.z);
  group.add(line);
  // Threshold bars at both ends.
  for (const dz of [-r.len / 2 + 14, r.len / 2 - 14]) {
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(r.wid - 8, 5),
      new THREE.MeshBasicMaterial({ color: 0xf2f0e4 }),
    );
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(r.x, WORLD.canyonFloor + 2.8, r.z + dz);
    group.add(bar);
  }
  // Edge lights: small amber posts down both sides.
  const lightGeo = new THREE.BoxGeometry(1.4, 2.4, 1.4);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i <= 10; i++) {
      const lamp = new THREE.Mesh(lightGeo, lightMat);
      lamp.position.set(r.x + s * (r.wid / 2 + 3), WORLD.canyonFloor + 3.6, r.z - r.len / 2 + (i * r.len) / 10);
      group.add(lamp);
    }
  }
  return group;
}

function buildRiver() {
  // A ribbon of water following the canyon floor.
  const pts = [];
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const p = coursePoint(i / N);
    pts.push(new THREE.Vector3(p.x, WORLD.canyonFloor + 1.2, p.z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 120, 7, 6, false);
  geo.scale(1, 0.22, 1);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ color: 0x2f7fa8, transparent: true, opacity: 0.85 }),
  );
  mesh.name = 'canyonRiver';
  return mesh;
}

function scatterProps() {
  const rand = mulberry32(WORLD_SEED ^ 0x51ab);
  const trees = [];
  const rocks = [];
  let guard = 0;
  while (trees.length < 650 && guard++ < 9000) {
    const x = (rand() * 2 - 1) * WORLD.half;
    const z = (rand() * 2 - 1) * WORLD.half;
    const h = heightAt(x, z);
    const d = distToSpine(x, z);
    if (d < WORLD.canyonHalf + 40) continue; // keep the course clear
    if (Math.abs(x - WORLD.runway.x) < 90 && Math.abs(z - WORLD.runway.z) < 260) continue;
    if (h < 40 || h > 210) continue;
    trees.push({ x, z, y: h, s: 0.7 + rand() * 0.9 });
  }
  guard = 0;
  while (rocks.length < 260 && guard++ < 6000) {
    const x = (rand() * 2 - 1) * WORLD.half;
    const z = (rand() * 2 - 1) * WORLD.half;
    const h = heightAt(x, z);
    if (distToSpine(x, z) < WORLD.canyonHalf + 15) continue;
    rocks.push({ x, z, y: h, s: 0.8 + rand() * 2.4, r: rand() * Math.PI });
  }
  return { trees, rocks };
}

function buildScatter() {
  const group = new THREE.Group();
  const { trees, rocks } = scatterProps();
  const trunkGeo = new THREE.CylinderGeometry(0.9, 1.4, 7, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3524 });
  const leafGeo = new THREE.ConeGeometry(5.5, 15, 6);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e6b34 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, trees.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  trees.forEach((t, i) => {
    m.compose(new THREE.Vector3(t.x, t.y + 3.5 * t.s, t.z), q, s.set(t.s, t.s, t.s));
    trunks.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(t.x, t.y + (7 + 7) * t.s, t.z), q, s.set(t.s, t.s, t.s));
    leaves.setMatrixAt(i, m);
  });
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  group.add(trunks);
  group.add(leaves);
  const rockGeo = new THREE.DodecahedronGeometry(4, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x6e6258 });
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
  const eq = new THREE.Euler();
  rocks.forEach((r, i) => {
    eq.set(0, r.r, 0);
    q.setFromEuler(eq);
    m.compose(new THREE.Vector3(r.x, r.y + 1.5 * r.s, r.z), q, s.set(r.s, r.s * 0.7, r.s));
    rockMesh.setMatrixAt(i, m);
  });
  rockMesh.instanceMatrix.needsUpdate = true;
  group.add(rockMesh);
  return group;
}

// Build every static piece of the world at once.
export function buildWorld() {
  return {
    terrain: buildTerrainMesh(),
    runway: buildRunway(),
    river: buildRiver(),
    scatter: buildScatter(),
    heightAt,
    coursePoint,
    ringStations,
    distToSpine,
  };
}
