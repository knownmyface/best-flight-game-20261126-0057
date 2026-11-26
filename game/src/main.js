// Canyon Thread — entry point. Wires the renderer, the flight model, the
// missions, the HUD and the screens into one loop. The game runs from
// static files only: no network, no build step.
import * as THREE from '../vendor/three/three.module.min.js';
import { GAME, DIFFICULTIES } from './config.js';
import { buildTerrain, terrainHeight, animateClouds } from './terrain.js';
import { buildAircraft } from './aircraft.js';
import { buildRingMeshes, paintRings, crossedRing, distanceToRing } from './rings.js';
import { freshFlight, stepFlight, headingDegrees } from './physics.js';
import {
  MISSIONS, startMission, stepMission, ringThreaded, saveBest, loadBest,
} from './missions.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildHud, titleHtml, resultsHtml } from './hud.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');

// ---------- Renderer / scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.5, 9000);
camera.position.set(0, 60, 1050);

const { clouds } = buildTerrain(scene);
const plane = buildAircraft();
plane.rotation.order = 'YXZ';
scene.add(plane);

// ---------- Game state ----------
const input = createInput();
const audio = createAudio();
const hud = buildHud();

const game = {
  screen: 'title', // title | play | paused | over
  flight: freshFlight(),
  mission: null,
  ringMeshes: null,
  ringGroup: null,
  selectedMission: 0,
  selectedDifficulty: 'pilot',
  frozen: false, // screenshot staging: render the frame, do not advance
  isNewBest: false,
  titleOrbit: 0,
};

function clearRings() {
  if (game.ringGroup) {
    scene.remove(game.ringGroup);
    game.ringGroup = null;
    game.ringMeshes = null;
  }
}

game.startMission = function startMissionByIndex(missionIndex, difficultyKey) {
  clearRings();
  const missionDef = MISSIONS[missionIndex];
  const difficulty = DIFFICULTIES[difficultyKey];
  game.mission = startMission(missionDef, difficulty);
  game.flight = freshFlight();
  game.flight.fuel = missionDef.fuel;
  const { group, meshes } = buildRingMeshes(game.mission.rings);
  game.ringGroup = group;
  game.ringMeshes = meshes;
  scene.add(group);
  paintRings(meshes, 0);
  game.screen = 'play';
  game.isNewBest = false;
  document.getElementById('screen-title').classList.add('hidden');
  document.getElementById('screen-over').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  hud.banner(`${missionDef.name} — ${missionDef.tagline}`, 3.2);
};

function showTitle() {
  game.screen = 'title';
  game.mission = null;
  clearRings();
  game.flight = freshFlight();
  renderTitle();
  document.getElementById('screen-title').classList.remove('hidden');
  document.getElementById('screen-over').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
}

let lastTitleKey = '';
function renderTitle() {
  const key = `${game.selectedMission}|${game.selectedDifficulty}`;
  if (key === lastTitleKey) return;
  lastTitleKey = key;
  document.querySelector('#screen-title .screen-inner').innerHTML =
    titleHtml(game.selectedMission, game.selectedDifficulty);
}

function showResults() {
  game.screen = 'over';
  const { mission, flight } = game;
  if (mission.status === 'won') {
    game.isNewBest = saveBest(mission.bestKey, mission.elapsed);
  }
  document.querySelector('#screen-over .screen-inner').innerHTML = resultsHtml(mission, flight, game.isNewBest);
  document.getElementById('screen-over').classList.remove('hidden');
}

function togglePause() {
  if (game.screen === 'play') {
    game.screen = 'paused';
    hud.banner('PAUSED — press P to fly on', 60);
  } else if (game.screen === 'paused') {
    game.screen = 'play';
    hud.banner('', 0.1);
  }
}

// ---------- Camera: chase view, smoothed, never fighting the pilot ----------
const camPos = new THREE.Vector3(0, 60, 1050);
const camTarget = new THREE.Vector3(0, 30, 980);
function updateCamera(dt) {
  const f = game.flight;
  if (game.screen === 'title') {
    // Slow orbit over the canyon behind the title screen.
    game.titleOrbit += dt * 0.02;
    const r = 700;
    const cx = Math.sin(game.titleOrbit) * r;
    const cz = 200 + Math.cos(game.titleOrbit) * r;
    camPos.lerp(new THREE.Vector3(cx, 260, cz), Math.min(1, dt * 1.2));
    camTarget.lerp(new THREE.Vector3(0, 60, 0), Math.min(1, dt * 1.2));
  } else {
    const forward = new THREE.Vector3(
      -Math.sin(f.heading) * Math.cos(f.pitch),
      Math.sin(f.pitch),
      -Math.cos(f.heading) * Math.cos(f.pitch),
    );
    const want = f.pos.clone()
      .addScaledVector(forward, -15)
      .add(new THREE.Vector3(0, 5.2, 0));
    // keep the camera out of the ground
    want.y = Math.max(want.y, terrainHeight(want.x, want.z) + 3);
    camPos.lerp(want, Math.min(1, dt * 5));
    camTarget.lerp(
      f.pos.clone().addScaledVector(forward, 34).add(new THREE.Vector3(0, 1.5, 0)),
      Math.min(1, dt * 7),
    );
  }
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}

function updatePlane() {
  const f = game.flight;
  plane.position.copy(f.pos);
  plane.rotation.y = f.heading;
  plane.rotation.x = f.pitch;
  plane.rotation.z = -f.bank;
  plane.visible = true;
  // engine glow brightens with throttle
  const glow = plane.getObjectByName('engineGlow');
  if (glow) glow.material.color.setHex(f.throttle > 0.6 ? 0xffd23f : 0xff9a3d);
}

// ---------- Main loop ----------
let lastNow = performance.now();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;
  elapsed += dt;
  animateClouds(clouds, dt);

  if (game.screen === 'title') {
    // Title-screen keys: pick mission / difficulty / start.
    if (input.wasPressed('1')) game.selectedMission = 0;
    if (input.wasPressed('2')) game.selectedMission = 1;
    if (input.wasPressed('3')) game.selectedMission = 2;
    if (input.wasPressed('q')) game.selectedDifficulty = 'cadet';
    if (input.wasPressed('w')) game.selectedDifficulty = 'pilot';
    if (input.wasPressed('e')) game.selectedDifficulty = 'ace';
    if (input.wasPressed('enter') || input.wasPressed(' ')) {
      audio.unlock();
      game.startMission(game.selectedMission, game.selectedDifficulty);
    }
    renderTitle();
  } else if (game.screen === 'play' && !game.frozen) {
    const f = game.flight; const m = game.mission;
    if (input.wasPressed('p') || input.wasPressed('escape')) togglePause();
    if (input.wasPressed('r')) game.startMission(game.selectedMission, game.selectedDifficulty);
    if (input.wasPressed('m')) { const on = audio.toggle(); hud.banner(on ? 'SOUND ON' : 'SOUND OFF', 1.2); }

    const ctl = input.poll();
    const wind = m.mission.wind * m.difficulty.wind;
    const events = stepFlight(f, ctl, dt, wind);
    audio.update(f.throttle, f.speed, f.airborne);
    if (events.tookOff) hud.banner('AIRBORNE — follow the teal ring', 2.5);
    if (events.scraped) { audio.thud(false); hud.banner('SCRAPE — the canyon bit back', 1.6); }
    if (events.outOfFuel) hud.banner('FUEL EMPTY — gliding now', 2.5);

    // Ring threading: only the next ring in order counts.
    const ring = m.rings[m.nextRing];
    if (ring && crossedRing(ring, f.prevPos, f.pos)) {
      ring.passed = true;
      ringThreaded(m);
      paintRings(game.ringMeshes, m.nextRing);
      audio.ring();
      hud.banner(
        m.nextRing >= m.rings.length ? 'ALL RINGS THREADED' : `RING ${m.ringsDone} / ${m.mission.rings} — +100`,
        2.0,
      );
    }

    // World edge: nudge the pilot back toward the canyon.
    if (Math.abs(f.pos.x) > 1300 || Math.abs(f.pos.z) > 1300) {
      hud.banner('LEAVING THE CANYON — turn back', 1.5);
      f.heading += (Math.atan2(f.pos.x, f.pos.z) - f.heading) * dt * 0.4;
    }

    const outcome = stepMission(m, f, dt, events);
    if (outcome) {
      if (events.crashed) audio.thud(true);
      showResults();
    }
  } else if (game.screen === 'paused') {
    if (input.wasPressed('p') || input.wasPressed('escape')) togglePause();
    if (input.wasPressed('r')) game.startMission(game.selectedMission, game.selectedDifficulty);
  } else if (game.screen === 'over') {
    if (input.wasPressed('r') || input.wasPressed('enter')) {
      game.startMission(game.selectedMission, game.selectedDifficulty);
    }
    if (input.wasPressed('t')) showTitle();
  }

  // HUD + aircraft + camera every frame, even frozen (for screenshots).
  if (game.mission && game.screen !== 'title') {
    const f = game.flight; const m = game.mission;
    const ring = m.rings[m.nextRing];
    const alt = f.pos.y - terrainHeight(f.pos.x, f.pos.z);
    hud.update(f, m, alt, ring ? distanceToRing(ring, f.pos) : null, dt);
  }
  updatePlane();
  updateCamera(dt);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Clicking a mission/difficulty row on the title screen selects it;
// clicking anywhere on the title starts the flight.
document.getElementById('screen-title').addEventListener('click', (e) => {
  const row = e.target.closest('[data-mission]');
  if (row) { game.selectedMission = Number(row.dataset.mission); return; }
  const diff = e.target.closest('[data-diff]');
  if (diff) { game.selectedDifficulty = diff.dataset.diff; return; }
  audio.unlock();
  game.startMission(game.selectedMission, game.selectedDifficulty);
});
document.getElementById('screen-over').addEventListener('click', () => {
  game.startMission(game.selectedMission, game.selectedDifficulty);
});

// ---------- Screenshot staging ----------
if (SHOT) {
  const screen = stageShot(SHOT, game);
  game.frozen = true;
  game.screen = screen === 'title' ? 'title' : 'play';
  if (screen === 'title') {
    showTitle();
  } else {
    // Repaint the rings for the staged state: threaded ones green, the
    // next one teal (the autopilot threads rings without going through
    // the frame loop that normally repaints them).
    if (game.ringMeshes) paintRings(game.ringMeshes, game.mission.nextRing);
    document.getElementById('screen-title').classList.add('hidden');
    document.getElementById('screen-over').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    const f = game.flight; const m = game.mission;
    const ring = m.rings[m.nextRing];
    const alt = f.pos.y - terrainHeight(f.pos.x, f.pos.z);
    hud.update(f, m, alt, ring ? distanceToRing(ring, f.pos) : null, 0);
    hud.banner(SHOT === 'landing' ? 'FINAL APPROACH — strip ahead' : `RING ${m.ringsDone + 1} / ${m.mission.rings}`, 60);
  }
  // Settle the camera on the staged frame before the first paint.
  for (let i = 0; i < 90; i += 1) updateCamera(1 / 60);
  updatePlane();
} else {
  showTitle();
}

// Test hook: play-tests and the screenshot driver read live state here.
window.__game = game;
window.__headingDegrees = headingDegrees;

frame();
