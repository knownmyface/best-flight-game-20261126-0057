// Procedural low-poly island: a canyon carved through high ground, a flat
// runway strip at the south end, sea all around. One height function drives
// both the mesh and the physics, so what you see is what you can hit.
import * as THREE from '../vendor/three/three.module.min.js';
import { COURSE, GAME, WORLD_SEED } from './config.js';
import { makeNoise2D, mulberry32, range } from './random.js';

const noise = makeNoise2D(WORLD_SEED);
const SPINE = COURSE.spine;

/** Distance from (x, z) to the canyon centre polyline, and the segment index. */
export function distanceToSpine(x, z) {
  let best = Infinity; let bestSeg = 0;
  for (let i = 0; i < SPINE.length - 1; i += 1) {
    const [ax, az] = SPINE[i]; const [bx, bz] = SPINE[i + 1];
    const dx = bx - ax; const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 === 0 ? 0 : ((x - ax) * dx + (z - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t; const pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bestSeg = i; }
  }
  return { dist: best, seg: bestSeg };
}

/** Point on the spine at fractional position t (0..1) along its length. */
export function spinePoint(t) {
  const lengths = [];
  let total = 0;
  for (let i = 0; i < SPINE.length - 1; i += 1) {
    const l = Math.hypot(SPINE[i + 1][0] - SPINE[i][0], SPINE[i + 1][1] - SPINE[i][1]);
    lengths.push(l); total += l;
  }
  let want = t * total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (want <= lengths[i] || i === lengths.length - 1) {
      const f = Math.max(0, Math.min(1, want / lengths[i]));
      return {
        x: SPINE[i][0] + (SPINE[i + 1][0] - SPINE[i][0]) * f,
        z: SPINE[i][1] + (SPINE[i + 1][1] - SPINE[i][1]) * f,
        seg: i,
      };
    }
    want -= lengths[i];
  }
  return { x: SPINE[SPINE.length - 1][0], z: SPINE[SPINE.length - 1][1], seg: SPINE.length - 2 };
}

/** Height of the ground at (x, z) in metres. Sea level is 0. */
export function terrainHeight(x, z) {
  const half = GAME.worldSize / 2;
  const edge = Math.max(Math.abs(x), Math.abs(z)) / half; // 0 centre, 1 edge
  // Island mask: high ground in the middle, sinking below the sea at the rim.
  const island = Math.max(0, 1 - Math.pow(Math.max(0, edge - 0.55) / 0.45, 1.6));
  const hills = noise(x * 0.0016 + 7.3, z * 0.0016 + 2.9, 4);
  const ridge = noise(x * 0.004 + 13.1, z * 0.004 + 5.7, 3);
  let h = 14 + hills * 46 + Math.pow(ridge, 2.2) * 95;
  h *= 0.25 + 0.75 * island;
  h -= Math.pow(Math.max(0, edge - 0.8) / 0.2, 2) * 30; // sink the rim under the sea

  // Carve the canyon: near the spine the ground drops to a flat-ish floor.
  // The slot is narrow, so the walls read as a canyon, not a valley.
  const { dist } = distanceToSpine(x, z);
  const w = COURSE.canyonWidth;
  if (dist < w * 1.6) {
    const f = Math.max(0, 1 - dist / (w * 1.6));
    const carve = Math.pow(f, 1.4);
    const floor = 20 + noise(x * 0.01, z * 0.01, 2) * 4;
    h = h * (1 - carve) + floor * carve;
  }
  // Canyon rim: high ground hugging the slot, so the walls stand up
  // against the floor instead of melting into the hills.
  if (dist < w * 2.6) {
    const rim = Math.sin(Math.min(1, dist / (w * 2.6)) * Math.PI);
    h += rim * 32;
  }

  // Flatten the runway apron at the south end: fully level inside the strip
  // footprint (|x| < 30, |z-980| < 180), blending out smoothly beyond it,
  // so the flat strip mesh never sinks into a terrain bump.
  const rx = COURSE.start.x; const rz = COURSE.start.z;
  const rdx = Math.abs(x - rx); const rdz = Math.abs(z - rz);
  if (rdx < 130 && rdz < 260) {
    const ix = Math.max(0, 1 - Math.max(0, rdx - 30) / 100);
    const iz = Math.max(0, 1 - Math.max(0, rdz - 180) / 80);
    const f = ix * iz;
    const pad = 24; // runway sits on a levelled pad
    h = h * (1 - f) + pad * f;
  }
  return h;
}

/** Colour of the ground by height and slope, as a flat low-poly palette. */
function groundColor(h, slope, out) {
  // sandy canyon floor and beaches, grass on the flats, rock on the steep
  // walls and high ground, snow up high — so the canyon reads as a slot
  // of gold between green hills from the air
  if (h < 28) out.setRGB(0.74, 0.64, 0.38); // canyon sand
  else if (h < 60) out.setRGB(0.35, 0.55, 0.28); // canyon grass
  else if (h < 90) out.setRGB(0.42, 0.48, 0.30); // dry scrub
  else if (h < 120) out.setRGB(0.45, 0.38, 0.32); // rock
  else out.setRGB(0.88, 0.88, 0.90); // snow caps
  if (slope > 0.55) out.setRGB(0.48, 0.40, 0.34); // steep = bare rock
  return out;
}

/** Build the terrain mesh, runway, sea, sky dome and clouds. Returns a group. */
export function buildTerrain(scene) {
  const group = new THREE.Group();
  group.name = 'terrain';

  // --- Heightfield mesh, low-poly flat shading ---
  const SEG = 150;
  const size = GAME.worldSize;
  const geo = new THREE.PlaneGeometry(size, size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const heights = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) {
    const h = terrainHeight(pos.getX(i), pos.getZ(i));
    pos.setY(i, h);
    heights[i] = h;
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i += 1) {
    const slope = 1 - Math.abs(nrm.getY(i));
    groundColor(heights[i], slope, c);
    // subtle per-vertex jitter so the flats read as facets, not plastic
    const j = 0.94 + 0.06 * noise(pos.getX(i) * 0.05, pos.getZ(i) * 0.05, 1);
    colors[i * 3] = c.r * j; colors[i * 3 + 1] = c.g * j; colors[i * 3 + 2] = c.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  terrain.name = 'canyonTerrain';
  group.add(terrain);

  // --- Runway: dark strip + white centre dashes + threshold bars ---
  const runway = new THREE.Group();
  runway.name = 'runway';
  const stripMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(COURSE.runwayWidth, COURSE.runwayLength),
    stripMat,
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(COURSE.start.x, 24.4, COURSE.start.z);
  runway.add(strip);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
  for (let d = -COURSE.runwayLength / 2 + 20; d < COURSE.runwayLength / 2 - 10; d += 32) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 14), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(COURSE.start.x, 24.55, COURSE.start.z + d);
    runway.add(dash);
  }
  // threshold bars at both ends
  for (const end of [-1, 1]) {
    for (let k = -2; k <= 2; k += 1) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 10), dashMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(COURSE.start.x + k * 4.6, 24.55, COURSE.start.z + end * (COURSE.runwayLength / 2 - 12));
      runway.add(bar);
    }
  }
  // windsock pole beside the strip
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 12, 6),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  );
  pole.position.set(COURSE.start.x + 22, 30, COURSE.start.z + 120);
  runway.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 6, 8),
    new THREE.MeshLambertMaterial({ color: 0xff5a1f }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(COURSE.start.x + 25, 35, COURSE.start.z + 120);
  runway.add(sock);
  group.add(runway);

  // --- Sea plane ---
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(GAME.worldSize * 3, GAME.worldSize * 3),
    new THREE.MeshLambertMaterial({ color: 0x1d6f8e }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = GAME.seaLevel;
  sea.name = 'sea';
  group.add(sea);

  // --- Sky dome (gradient via vertex colours) + sun disc ---
  const skyGeo = new THREE.SphereGeometry(4200, 24, 12);
  const skyColors = new Float32Array(skyGeo.attributes.position.count * 3);
  const top = new THREE.Color(0x2f6fb2); const horizon = new THREE.Color(0xcfe8f2);
  for (let i = 0; i < skyGeo.attributes.position.count; i += 1) {
    const y = skyGeo.attributes.position.getY(i) / 4200; // -1..1
    const t = Math.max(0, Math.min(1, (y + 0.08) / 0.7));
    c.copy(horizon).lerp(top, t);
    skyColors[i * 3] = c.r; skyColors[i * 3 + 1] = c.g; skyColors[i * 3 + 2] = c.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }),
  );
  sky.name = 'skyDome';
  group.add(sky);

  // --- Clouds: flattened white blobs drifting slowly ---
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
  const rand = mulberry32(WORLD_SEED + 99);
  const clouds = new THREE.Group();
  clouds.name = 'clouds';
  for (let i = 0; i < 26; i += 1) {
    const puff = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 3);
    for (let p = 0; p < puffs; p += 1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(range(rand, 14, 30), 8, 6), cloudMat);
      s.position.set(range(rand, -40, 40), range(rand, -4, 6), range(rand, -14, 14));
      s.scale.y = 0.45;
      puff.add(s);
    }
    puff.position.set(range(rand, -1200, 1200), range(rand, 190, 320), range(rand, -1200, 1200));
    clouds.add(puff);
  }
  group.add(clouds);

  // --- Lighting: sun + sky bounce ---
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(600, 900, 300);
  sun.name = 'sunLight';
  group.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd9ee, 0x5a6b4a, 1.1);
  hemi.name = 'skyLight';
  group.add(hemi);

  scene.add(group);
  scene.fog = new THREE.Fog(0xcfe0ea, 500, 3400);
  return { group, clouds };
}

/** Drift the clouds slowly; call once per frame with elapsed seconds. */
export function animateClouds(clouds, dt) {
  clouds.children.forEach((puff, i) => {
    puff.position.x += dt * (1.2 + (i % 3) * 0.5);
    if (puff.position.x > 1350) puff.position.x = -1350;
  });
}
