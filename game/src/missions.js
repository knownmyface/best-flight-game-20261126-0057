// Missions: three sorties with different goals, all flown on the same canyon.
// Scoring: 100 per ring, time bonus for finishing under par, 500 for a
// clean landing on the delivery, minus 2 per point of damage taken.
import { COURSE } from './config.js';
import { makeRings } from './rings.js';

export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'RING RUN',
    tagline: 'Thread all 12 rings before the fuel gauge reads empty.',
    rings: 12,
    timeLimit: 260,
    fuel: 100,
    wind: 0.7,
    needsLanding: false,
    par: 150,
    brief: 'Take off from the strip, follow the teal ring, thread all 12 in order. Fuel is the clock.',
  },
  {
    id: 'delivery',
    name: 'CANYON DELIVERY',
    tagline: 'Thread 6 rings, then put her down on the strip.',
    rings: 6,
    timeLimit: 320,
    fuel: 100,
    wind: 1.0,
    needsLanding: true,
    par: 190,
    brief: 'Six rings down the canyon, then turn back and land on the runway you left. A landing under 42 m/s with wings level counts.',
  },
  {
    id: 'storm-patrol',
    name: 'STORM PATROL',
    tagline: '8 rings in a 150-second storm window. The wind wants you in the wall.',
    rings: 8,
    timeLimit: 150,
    fuel: 90,
    wind: 1.9,
    needsLanding: false,
    par: 110,
    brief: 'A storm is rolling down the canyon. Eight rings, hard gusts, no time to be careful.',
  },
];

/** Fresh mission state for a mission + difficulty multiplier set. */
export function startMission(mission, difficulty) {
  return {
    mission,
    difficulty,
    rings: makeRings(mission.rings),
    nextRing: 0,
    ringsDone: 0,
    timeLeft: mission.timeLimit * difficulty.time,
    elapsed: 0,
    score: 0,
    status: 'flying', // flying | won | lost
    loseReason: '',
    landed: false,
    bestKey: `canyon-thread-best-${mission.id}-${difficulty.label}`,
  };
}

/** Advance the mission clock and score. Returns 'won' | 'lost' | null. */
export function stepMission(m, flight, dt, events) {
  if (m.status !== 'flying') return m.status;
  m.elapsed += dt;
  m.timeLeft -= dt;

  if (events.tookOff) m.score += 25;
  if (m.timeLeft <= 0) {
    m.status = 'lost';
    m.loseReason = 'OUT OF TIME — the window closed with rings still standing.';
    return 'lost';
  }
  if (flight.fuel <= 0 && flight.speed < 2 && !m.landed) {
    m.status = 'lost';
    m.loseReason = 'OUT OF FUEL — the Kestrel glided to a stop short of the strip.';
    return 'lost';
  }
  if (flight.ditched) {
    m.status = 'lost';
    m.loseReason = 'DITCHED — the Kestrel came down in the rough, short of the strip.';
    return 'lost';
  }
  if (flight.crashed) {
    m.status = 'lost';
    m.loseReason = flight.damage >= 100
      ? 'AIRFRAME LOST — damage reached 100%. The canyon keeps another Kestrel.'
      : 'TERRAIN STRIKE — the canyon wall wins this one.';
    return 'lost';
  }
  if (m.mission.needsLanding && flight.landed) {
    m.landed = true;
    m.status = 'won';
    m.score += 500;
    m.score += Math.max(0, Math.round((m.mission.par - m.elapsed) * 2));
    return 'won';
  }
  if (!m.mission.needsLanding && m.ringsDone >= m.mission.rings) {
    m.status = 'won';
    m.score += Math.max(0, Math.round((m.mission.par - m.elapsed) * 3));
    return 'won';
  }
  return null;
}

/** Ring threaded: score it and advance the pointer. */
export function ringThreaded(m) {
  m.ringsDone += 1;
  m.nextRing += 1;
  m.score += 100;
}

/** Final score breakdown lines for the results screen. */
export function scoreLines(m, flight) {
  const lines = [
    `Rings threaded: ${m.ringsDone} / ${m.mission.rings}  (+${m.ringsDone * 100})`,
    `Time: ${m.elapsed.toFixed(1)}s  (par ${m.mission.par}s)`,
    `Fuel left: ${flight.fuel.toFixed(0)}%`,
    `Damage: ${flight.damage.toFixed(0)}%  (−${Math.round(flight.damage * 2)})`,
  ];
  if (m.landed) lines.push('Clean landing: +500');
  lines.push(`TOTAL SCORE: ${Math.max(0, Math.round(m.score - flight.damage * 2))}`);
  return lines;
}

/** Load/save a best time (seconds) for this mission+difficulty, localStorage guarded. */
export function loadBest(key) {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? null : Number(v);
  } catch { return null; }
}
export function saveBest(key, seconds) {
  try {
    const prev = loadBest(key);
    if (prev === null || seconds < prev) {
      window.localStorage.setItem(key, String(seconds));
      return true;
    }
  } catch { /* storage unavailable: best times just do not persist */ }
  return false;
}

/** The runway threshold, for landing guidance and the autopilot. */
export function runwayTarget() {
  return { x: COURSE.start.x, y: 30, z: COURSE.start.z + 140 };
}
