// The aircraft: a home-built single-seat jet, the "Kestrel", assembled from
// primitives — fuselage, swept wings, tail, canopy, wingtip lights. No
// borrowed model, no commercial name.
import * as THREE from '../vendor/three/three.module.min.js';

export const AIRCRAFT_NAME = 'Kestrel';

/** Build the aircraft mesh. Forward is -z in local space. Returns a group. */
export function buildAircraft() {
  const plane = new THREE.Group();
  plane.name = 'kestrel';

  const hull = new THREE.MeshLambertMaterial({ color: 0xe8541d }); // kestrel orange
  const white = new THREE.MeshLambertMaterial({ color: 0xf2ede2 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x18242e, shininess: 90, specular: 0x88aacc });

  // Fuselage: nose cone + body + tail cone
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.7, 5.6, 10), hull);
  body.rotation.x = Math.PI / 2;
  plane.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.2, 10), white);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.9;
  plane.add(nose);
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 10), dark);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 3.5;
  plane.add(tailCone);

  // Canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), glass);
  canopy.scale.set(0.85, 0.75, 1.9);
  canopy.position.set(0, 0.72, -0.9);
  plane.add(canopy);

  // Main wings: swept, slightly tapered boxes
  const wingGeo = new THREE.BoxGeometry(4.6, 0.14, 1.5);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, white);
    wing.position.set(side * 2.6, -0.1, 0.4);
    wing.rotation.y = side * -0.28; // sweep back
    plane.add(wing);
    // wingtip light: red port, green starboard
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff2222 : 0x22ff66 }),
    );
    tip.position.set(side * 4.9, -0.1, 1.05);
    plane.add(tip);
  }

  // Tailplane + fin
  const tailGeo = new THREE.BoxGeometry(2.2, 0.12, 0.9);
  for (const side of [-1, 1]) {
    const stab = new THREE.Mesh(tailGeo, white);
    stab.position.set(side * 1.25, 0.12, 2.9);
    stab.rotation.y = side * -0.25;
    plane.add(stab);
  }
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 1.3), hull);
  fin.position.set(0, 0.8, 2.9);
  fin.rotation.x = 0.25;
  plane.add(fin);

  // Engine glow at the tail
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 12),
    new THREE.MeshBasicMaterial({ color: 0xffc266 }),
  );
  glow.position.set(0, 0, 4.32);
  glow.rotation.y = Math.PI;
  glow.name = 'engineGlow';
  plane.add(glow);

  // Landing gear: two small wheels, tucked visually under the fuselage
  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10);
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 0.7, -0.95, 0.6);
    plane.add(wheel);
  }

  plane.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return plane;
}
