// Canyon Thread v2 — the game itself.
// Wires the world, the sky, the jet, the rings, the drones and the HUD into
// one loop: a chase camera that never fights the pilot, a menu that is also
// the hangar, and sorties that end in a debrief. For screenshots the game
// can fly itself (?shot=cover|rings|drones|hangar) with an autopilot that
// chases the next ring, so every still is a real render of a real flight.

import * as THREE from 'three';
import { buildWorld, heightAt, coursePoint, ringStations, WORLD } from './world.js';
import { SkyDome, WindField } from './sky.js';
import { JETS, jetById, buildJetMesh } from './jets.js';
import { Flight } from './flight.js';
import { RingCourse } from './rings.js';
import { DroneField, droneAnchors } from './drones.js';
import { Cannon } from './weapons.js';
import { MISSIONS, DIFFS, missionById, diffById, Sortie } from './missions.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';
import { Controls } from './input.js';

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot') || '';
const SHOT_AFTER = parseInt(params.get('t') || '7000', 10);

// --- renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe8a86a, 1500, 6800);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 20000);
camera.position.set(0, 260, 1060);

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a5a3a, 0.62);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0b0, 1.35);
sun.position.set(-1400, 900, -700);
scene.add(sun);

// --- world ------------------------------------------------------------------
const world = buildWorld();
scene.add(world.terrain);
scene.add(world.runway);
scene.add(world.river);
scene.add(world.scatter);
const sky = new SkyDome(scene);

// --- game objects -----------------------------------------------------------
const controls = new Controls();
const hud = new Hud();
const sounds = new SoundBank();
const cannon = new Cannon(scene);
const wind = new WindField(1);

let jetDef = jetById(params.get('jet') || 'kestrel');
let missionDef = missionById(params.get('mission') || 'ringrun');
let diffDef = diffById(params.get('diff') || 'pilot');
let flight = null;
let jetMesh = null;
let rings = null;
let drones = null;
let sortie = null;

let screen = 'menu'; // menu | flying | over
let elapsed = 0;
let shotDone = false;
let chaseDist = 42;

// --- menu / hangar ----------------------------------------------------------
const menuEl = document.getElementById('menu');
const endEl = document.getElementById('end');

function buildMenu() {
  const missionBox = document.getElementById('missionList');
  missionBox.innerHTML = '';
  MISSIONS.forEach((m) => {
    const card = document.createElement('button');
    card.className = `pick mission${m.id === missionDef.id ? ' sel' : ''}`;
    card.innerHTML = `<b>${m.name}</b><span>${m.brief}</span><em>${m.rings} rings${m.drones ? ' · 9 drones' : ''}${m.landing ? ' · land it' : ''}${m.timeLimit ? ` · ${m.timeLimit}s` : ''}</em>`;
    card.onclick = () => {
      missionDef = m;
      sounds.ensure();
      sounds.click();
      buildMenu();
    };
    missionBox.appendChild(card);
  });
  const diffBox = document.getElementById('diffList');
  diffBox.innerHTML = '';
  DIFFS.forEach((d) => {
    const b = document.createElement('button');
    b.className = `pick diff${d.id === diffDef.id ? ' sel' : ''}`;
    b.innerHTML = `<b>${d.label}</b><span>${d.desc}</span>`;
    b.onclick = () => {
      diffDef = d;
      sounds.ensure();
      sounds.click();
      buildMenu();
    };
    diffBox.appendChild(b);
  });
  const jetBox = document.getElementById('jetList');
  jetBox.innerHTML = '';
  JETS.forEach((j) => {
    const card = document.createElement('button');
    card.className = `pick jet${j.id === jetDef.id ? ' sel' : ''}`;
    card.innerHTML = `<b>${j.name}</b><span>${j.tag}</span>`
      + `<em>SPD ${j.cruise}–${j.top} · FUEL ${j.fuel} · HULL ${j.hp} · TURN ×${j.turn}</em>`
      + `<span class="bar"><i style="width:${Math.round((j.top / 178) * 100)}%;background:#7fb4d8"></i></span>`
      + `<span class="bar"><i style="width:${Math.round((j.fuel / 145) * 100)}%;background:#ffb347"></i></span>`
      + `<span class="bar"><i style="width:${Math.round((j.hp / 165) * 100)}%;background:#7dff8a"></i></span>`
      + `<span>${j.desc}</span>`;
    card.onclick = () => {
      jetDef = j;
      sounds.ensure();
      sounds.click();
      buildMenu();
    };
    jetBox.appendChild(card);
  });
}

function showMenu() {
  screen = 'menu';
  menuEl.style.display = 'flex';
  endEl.style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  buildMenu();
}

function showEnd() {
  screen = 'over';
  sounds.engine(0, 0, false); // the engine note stops with the sortie
  const d = sortie.debrief();
  document.getElementById('endTitle').textContent = d.state === 'won' ? 'SORTIE COMPLETE' : `SORTIE LOST — ${d.cause}`;
  document.getElementById('endTitle').className = d.state === 'won' ? 'win' : 'lose';
  document.getElementById('endStats').innerHTML =
    `<div><b>${d.score}</b><span>SCORE</span></div>`
    + `<div><b>${d.rings}/${d.ringTotal}</b><span>RINGS</span></div>`
    + `<div><b>${d.drones}</b><span>DRONES</span></div>`
    + `<div><b>${d.time}</b><span>TIME</span></div>`
    + `<div><b>${d.jet} · ${d.diff}</b><span>AIRFRAME</span></div>`;
  endEl.style.display = 'flex';
  document.getElementById('hud').style.display = 'none';
  if (d.state === 'won') sounds.win();
}

document.getElementById('flyBtn').addEventListener('click', () => {
  sounds.ensure();
  sounds.click();
  startSortie();
});
document.getElementById('againBtn').addEventListener('click', () => {
  sounds.ensure();
  sounds.click();
  startSortie();
});
document.getElementById('changeBtn').addEventListener('click', () => {
  sounds.ensure();
  sounds.click();
  showMenu();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && screen === 'menu') startSortie();
  if (e.code === 'Enter' && screen === 'over') startSortie();
});

// --- sortie -----------------------------------------------------------------
function startSortie() {
  if (jetMesh) scene.remove(jetMesh);
  jetMesh = buildJetMesh(jetDef);
  scene.add(jetMesh);
  flight = new Flight(jetDef, heightAt);
  flight.attach(jetMesh);
  const start = coursePoint(0);
  flight.reset({ x: start.x, y: heightAt(start.x, start.z) + 58, z: start.z, heading: start.heading });
  if (rings) scene.remove(rings.group);
  rings = new RingCourse(scene, ringStations(missionDef.rings));
  if (drones) scene.remove(drones.group);
  drones = new DroneField(scene, missionDef.drones ? droneAnchors(ringStations(missionDef.rings)) : []);
  sortie = new Sortie(missionDef, diffDef, jetDef);
  wind.strength = diffDef.wind;
  menuEl.style.display = 'none';
  endEl.style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  screen = 'flying';
  elapsed = 0;
  hud.message(`${missionDef.name} — ${jetDef.name}`, 2.6, missionDef.brief);
  sounds.engine(0.4, 0.6, true);
}

// --- autopilot (screenshot mode): chase the next ring, shoot what is ahead --
function autopilotInput() {
  const input = { pitch: 0, roll: 0, yaw: 0, throttle: 0.72, boost: false, fire: false };
  const target = rings && rings.current();
  if (!target || !flight.alive) return input;
  const to = new THREE.Vector3(target.x - flight.pos.x, target.y - flight.pos.y, target.z - flight.pos.z);
  const dist = to.length();
  to.normalize();
  const lx = to.dot(flight.right());
  const ahead = to.dot(flight.forward());
  if (ahead < 0.1) {
    // Target behind: level turn to re-acquire, never pitch up into a spiral.
    input.roll = Math.max(-0.9, Math.min(0.9, -Math.sign(lx || 1) * 0.9));
    input.pitch = 0;
  } else {
    // Hard steering: the canyon zigzags ~70 degrees every 250 m, so the
    // autopilot banks near the limit to stay on the course.
    input.roll = Math.max(-1, Math.min(1, -lx * 2.4));
    // Pitch by flight-path angle, not by the tilted body frame: the angle the
    // target sits above the horizon, minus the angle the jet is already
    // climbing at. A steep bank can no longer command a climb into the wall.
    const horiz = Math.max(20, Math.hypot(to.x, to.z));
    const wantAngle = Math.atan2(to.y, horiz);
    // Velocity follows the nose, so the nose's elevation is the path angle.
    const pathAngle = Math.asin(Math.max(-1, Math.min(1, flight.forward().y)));
    input.pitch = Math.max(-1, Math.min(1, (wantAngle - pathAngle) * 2.0));
  }
  // Ease off the throttle in a hard turn so the turn radius stays inside the
  // canyon; open it up again on a straight, distant leg.
  input.throttle = Math.abs(input.roll) > 0.5 || dist < 120 ? 0.55 : 0.8;
  // Shoot a drone that wanders into the nose cone.
  for (const d of drones.drones) {
    if (!d.alive) continue;
    const dv = d.body.position.clone().sub(flight.pos);
    const dd = dv.length();
    if (dd < 420 && dv.normalize().dot(flight.forward()) > 0.94) {
      input.fire = true;
      break;
    }
  }
  return input;
}

// --- main loop ---------------------------------------------------------------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();

// One simulation step: wind, flight, cannon, rings, drones, sky, camera,
// HUD. The live loop calls it once a frame; screenshot mode calls it many
// times up front to pre-roll the flight to a staged moment.
function stepGame(dt, updateHud = true) {
  elapsed += dt;
  wind.update(dt);
  const windVec = wind.velocity();
  const input = SHOT ? autopilotInput() : controls.read();
  if (!SHOT) sounds.ensure();
  flight.update(dt, input, { wind: windVec, fuelBurn: 0.62 * diffDef.fuelBurn });

  // Cannon: fire along the nose, test the drones.
  if (input.fire && cannon.ready) {
    const origin = flight.pos.clone().addScaledVector(flight.forward(), 14);
    const dir = flight.forward();
    cannon.fire(origin, dir);
    sounds.shot();
    const hit = drones.rayHit(origin, dir);
    if (hit) {
      const result = drones.damage(hit);
      if (result === 'down') {
        sortie.droneDown();
        flight.fuel = Math.min(flight.maxFuel, flight.fuel + 8);
        hud.message('DRONE DOWN  +150', 1.6, 'Fuel cell recovered +8');
        sounds.boom();
      }
    }
  }
  cannon.update(dt);

  // Rings.
  const passed = rings.checkPass(flight.pos);
  if (passed >= 0) {
    sortie.ringPassed(passed);
    hud.message(`RING ${sortie.rings}/${rings.total}`, 1.4, passed === rings.total - 1 ? 'Last one — bring her home' : '');
    sounds.chime();
  }
  rings.update(dt);
  drones.update(dt);
  sky.update(dt, camera, windVec.x);

  // Landing / win / lose.
  if (missionDef.landing && rings.done) sortie.tryLand(flight, WORLD.runway, flight.speed);
  if (missionDef.id === 'patrol') sortie.checkPatrolWin(rings.done, drones.aliveCount);
  else sortie.checkRingWin(rings.done);
  const outcome = sortie.update(dt, flight);
  if (outcome !== 'flying') {
    if (outcome === 'lost') sounds.boom();
    showEnd();
    return;
  }

  // Chase camera: level with the horizon, never tilted by the jet's pitch.
  // The jet banks and dives inside the frame; the camera stays calm so the
  // canyon walls and the sky stay where the eye expects them.
  const fwd = flight.forward();
  const level = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
  camTarget.copy(flight.pos).addScaledVector(level, 55).add(new THREE.Vector3(0, -2, 0));
  camPos.copy(flight.pos).addScaledVector(level, -chaseDist).add(new THREE.Vector3(0, 10, 0));
  camera.position.lerp(camPos, 1 - Math.exp(-dt * 4.2));
  camera.lookAt(camTarget);
  camera.up.set(0, 1, 0);

  sounds.engine(flight.speed / (jetDef.top * 1.32), input.throttle, flight.alive);
  if (updateHud) {
    hud.update(dt, {
      flight, sortie, rings, drones, wind, camera, heightAt, runway: WORLD.runway,
    });
  }
}

// Put the camera exactly on the chase position (no lerp): the first rendered
// frame after a pre-roll is already the staged shot.
function snapCamera() {
  const fwd = flight.forward();
  const level = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
  camera.position.copy(flight.pos).addScaledVector(level, -chaseDist).add(new THREE.Vector3(0, 10, 0));
  camera.lookAt(flight.pos.clone().addScaledVector(level, 55).add(new THREE.Vector3(0, -2, 0)));
  camera.up.set(0, 1, 0);
}

// Run the simulation forward without rendering: the screenshot modes stage a
// real flight (rings passed, HUD live, message faded) before the first frame.
function preroll(seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    if (screen !== 'flying') break;
    stepGame(1 / 60, i === steps - 1);
  }
  if (screen === 'flying') {
    snapCamera();
    document.title = 'SHOT READY';
    window.__shotReady = true;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (screen === 'flying' && flight) {
    stepGame(dt);
  } else {
    // Menu backdrop: a slow orbit over the canyon so the hangar never sits on black.
    const t = clock.elapsedTime * 0.04;
    camera.position.set(Math.sin(t) * 900, 420, Math.cos(t) * 900);
    camera.lookAt(0, 60, 0);
    sky.update(dt, camera, 4);
    if (rings) rings.update(dt);
    if (drones) drones.update(dt);
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Shot modes pick their own staging; the hangar shot stays on the menu.
if (SHOT === 'hangar') {
  chaseDist = 42;
  showMenu();
} else if (SHOT) {
  chaseDist = SHOT === 'rings' ? 38 : 42;
  // The autopilot needs a live sortie from the first frame, pre-rolled to the
  // staged moment so the first render is already the shot.
  startSortie();
  preroll(SHOT_AFTER / 1000);
} else {
  showMenu();
}

animate();
