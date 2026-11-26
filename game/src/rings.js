// Canyon Thread v2 — the rings.
// Glowing gates threaded down the canyon spine, one after the other, in
// order. Fly through the hoop and it pops, chimes and counts; skip one and
// the course waits for you — there is no shortcut through the canyon.

import * as THREE from 'three';

const RING_RADIUS = 13;
const PASS_RADIUS = 11.5;

export class RingCourse {
  constructor(scene, stations) {
    this.scene = scene;
    this.stations = stations;
    this.next = 0;
    this.passed = 0;
    this.group = new THREE.Group();
    this.rings = stations.map((st, i) => {
      const ring = new THREE.Group();
      // The hoop itself: a bright torus that reads from a kilometre away.
      const hoop = new THREE.Mesh(
        new THREE.TorusGeometry(RING_RADIUS, 1.1, 10, 40),
        new THREE.MeshBasicMaterial({ color: 0x2affd5 }),
      );
      ring.add(hoop);
      // A faint inner disc so the hole is visible against the rock.
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(RING_RADIUS - 1, 32),
        new THREE.MeshBasicMaterial({
          color: 0x2affd5, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      ring.add(disc);
      // A small beacon light on top, so the next ring winks at you.
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff2a8 }),
      );
      beacon.position.set(0, RING_RADIUS + 2.5, 0);
      ring.add(beacon);
      ring.position.set(st.x, st.y, st.z);
      // Face the ring along the course heading so you fly through it, not at it.
      ring.rotation.y = st.heading || 0;
      ring.userData.index = i;
      this.group.add(ring);
      return { group: ring, hoop, beacon, station: st, done: false };
    });
    scene.add(this.group);
    this.pulse = 0;
    this.flashes = [];
    this.paint();
  }

  // Dim the passed rings, light the next one, leave the rest waiting.
  paint() {
    this.rings.forEach((r, i) => {
      if (r.done) {
        r.hoop.material.color.setHex(0x3d7a6e);
        r.beacon.visible = false;
      } else if (i === this.next) {
        r.hoop.material.color.setHex(0x2affd5);
        r.beacon.visible = true;
      } else {
        r.hoop.material.color.setHex(0x1a8f7d);
        r.beacon.visible = false;
      }
    });
  }

  // The ring the player is chasing right now, or null when the course is done.
  current() {
    return this.next < this.stations.length ? this.stations[this.next] : null;
  }

  get total() {
    return this.stations.length;
  }

  get done() {
    return this.next >= this.stations.length;
  }

  reset() {
    this.next = 0;
    this.passed = 0;
    this.rings.forEach((r) => { r.done = false; });
    this.paint();
  }

  // Returns the index just threaded, or -1. A pass counts only through the
  // hoop, in order, within the pass radius.
  checkPass(pos) {
    if (this.done) return -1;
    const st = this.stations[this.next];
    const dx = pos.x - st.x;
    const dy = pos.y - st.y;
    const dz = pos.z - st.z;
    if (dx * dx + dy * dy + dz * dz < PASS_RADIUS * PASS_RADIUS) {
      const idx = this.next;
      this.rings[idx].done = true;
      this.next++;
      this.passed++;
      this.paint();
      this.burst(st);
      return idx;
    }
    return -1;
  }

  // A flash ring where the pass happened: it blooms outward and fades fast.
  burst(st) {
    const flash = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 0.9, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x9ffff0, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    flash.position.set(st.x, st.y, st.z);
    flash.rotation.y = st.heading || 0;
    this.scene.add(flash);
    this.flashes.push({ mesh: flash, life: 0.5 });
  }

  update(dt) {
    this.pulse += dt;
    // The next ring breathes: its hoop scales gently so the eye finds it.
    if (!this.done) {
      const s = 1 + Math.sin(this.pulse * 3.2) * 0.045;
      this.rings[this.next].group.scale.set(s, s, s);
    }
    // Pass flashes bloom outward and fade.
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      fl.life -= dt;
      const k = 1 + (0.5 - fl.life) * 2.4;
      fl.mesh.scale.set(k, k, k);
      fl.mesh.material.opacity = Math.max(0, fl.life / 0.5) * 0.9;
      if (fl.life <= 0) {
        this.scene.remove(fl.mesh);
        fl.mesh.geometry.dispose();
        fl.mesh.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
  }
}
