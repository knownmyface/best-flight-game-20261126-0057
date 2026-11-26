// Canyon Thread v2 — the three jets.
// Pick your airframe in the hangar: a balanced all-rounder, a fast knife
// that drinks fuel, and a heavy lifter with a tank to match. Each one is
// built from plain geometry, no art assets, and flies differently on
// purpose: the choice is a decision, not a skin.

import * as THREE from 'three';

// speed: cruise / top, in metres per second. turn: bank rate multiplier.
// fuel: tank size. hp: airframe strength. accel: throttle response.
export const JETS = [
  {
    id: 'kestrel',
    name: 'KESTREL',
    tag: 'Balanced interceptor',
    color: 0x7fb4d8,
    trim: 0xe8722a,
    cruise: 96,
    top: 152,
    min: 24,
    turn: 1.0,
    pitch: 1.0,
    fuel: 100,
    hp: 100,
    accel: 26,
    desc: 'The canyon standard. Honest speed, honest fuel, no surprises.',
  },
  {
    id: 'falcon',
    name: 'FALCON',
    tag: 'Fast knife',
    color: 0xc23b3b,
    trim: 0xf2ead8,
    cruise: 118,
    top: 178,
    min: 30,
    turn: 1.28,
    pitch: 1.12,
    fuel: 78,
    hp: 72,
    accel: 34,
    desc: 'A dart. Out-turns everything, drinks fuel like it hates you.',
  },
  {
    id: 'albatross',
    name: 'ALBATROSS',
    tag: 'Heavy lifter',
    color: 0x8a9a5b,
    trim: 0xd8c98a,
    cruise: 82,
    top: 128,
    min: 20,
    turn: 0.78,
    pitch: 0.85,
    fuel: 145,
    hp: 165,
    accel: 20,
    desc: 'Slow, steady, nearly unkillable, and the tank never seems to end.',
  },
];

export function jetById(id) {
  return JETS.find((j) => j.id === id) || JETS[0];
}

// Build a jet out of boxes, cones and a canopy bubble. The three airframes
// share the builder but differ in wing sweep, tail and proportions, so each
// silhouette reads as its own plane at a glance.
export function buildJetMesh(def) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: def.color });
  const trim = new THREE.MeshLambertMaterial({ color: def.trim });
  const dark = new THREE.MeshLambertMaterial({ color: 0x10161f });

  const sweep = def.id === 'falcon' ? 0.62 : def.id === 'albatross' ? 0.18 : 0.38;
  const span = def.id === 'albatross' ? 40 : def.id === 'falcon' ? 28 : 34;
  const len = def.id === 'falcon' ? 30 : 26;

  // Fuselage: a tapered cylinder laid along the flight axis.
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.7, len, 8), skin);
  fus.rotation.x = Math.PI / 2;
  group.add(fus);

  // Nose spike.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(2.6, 8, 8), trim);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -(len / 2 + 4);
  group.add(nose);

  // Swept main wing: two panels angled back from the fuselage, in the
  // airframe colour — the trim stays an accent, not the whole silhouette.
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(span / 2, 0.9, 6.5), skin);
    wing.position.set((side * span) / 4, -0.4, 2 + sweep * 6);
    wing.rotation.y = -side * sweep;
    group.add(wing);
    // Twin tail fins on the fast jet, one tall fin on the others.
    if (def.id === 'falcon') {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6, 4.5), skin);
      fin.position.set(side * 3.4, 3.2, len / 2 - 2);
      fin.rotation.z = -side * 0.22;
      group.add(fin);
    }
  }
  if (def.id !== 'falcon') {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 7.5, 5), skin);
    fin.position.set(0, 3.6, len / 2 - 2);
    group.add(fin);
    // Tailplane.
    const tail = new THREE.Mesh(new THREE.BoxGeometry(13, 0.8, 3.6), trim);
    tail.position.set(0, 0.4, len / 2 - 1);
    group.add(tail);
  } else {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(11, 0.8, 3.2), trim);
    tail.position.set(0, 0.4, len / 2 - 1);
    group.add(tail);
  }

  // Canopy bubble, dark glass.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.3, 10, 8), dark);
  canopy.position.set(0, 2.1, -3.5);
  canopy.scale.set(1, 0.62, 1.9);
  group.add(canopy);

  // Wingtip lights: red port, green starboard, so the bank reads at dusk.
  const portLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  );
  portLight.position.set(-span / 2, -0.4, 2 + sweep * 6);
  group.add(portLight);
  const starLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0x2aff66 }),
  );
  starLight.position.set(span / 2, -0.4, 2 + sweep * 6);
  group.add(starLight);

  // The airframe is built at 34 m span so the parts are easy to shape; the
  // whole jet flies at 0.55 of that, so it fits through a 26 m ring with room.
  group.scale.setScalar(0.55);
  return group;
}
