// Canyon Thread v2 — missions and the sortie.
// Three ways to fly the same canyon, each one a different decision: a pure
// race against the fuel gauge, a delivery that ends with a landing, and a
// patrol where the clock and the drones both want your attention. Fuel and
// damage turn every sortie into a budget — spend speed, or save the tank.

export const DIFFS = [
  {
    id: 'cadet', label: 'CADET', fuelBurn: 0.55, damage: 0.55, wind: 0.3, timeMul: 1.3,
    desc: 'Kind fuel, gentle wind, a forgiving airframe.',
  },
  {
    id: 'pilot', label: 'PILOT', fuelBurn: 0.8, damage: 1.0, wind: 0.7, timeMul: 1.0,
    desc: 'As the canyon flies. The intended sortie.',
  },
  {
    id: 'ace', label: 'ACE', fuelBurn: 1.1, damage: 1.6, wind: 1.2, timeMul: 0.85,
    desc: 'Thirsty engine, hard gusts, thin margins.',
  },
];

export const MISSIONS = [
  {
    id: 'ringrun',
    name: 'RING RUN',
    rings: 12,
    drones: false,
    landing: false,
    timeLimit: 0,
    brief: 'Thread all 12 rings in order before the tank runs dry. No landing, no mercy.',
  },
  {
    id: 'delivery',
    name: 'CANYON DELIVERY',
    rings: 6,
    drones: true,
    landing: true,
    timeLimit: 0,
    brief: 'Thread 6 rings, clear the drones, then bring her home onto the strip.',
  },
  {
    id: 'patrol',
    name: 'STORM PATROL',
    rings: 8,
    drones: true,
    landing: false,
    timeLimit: 150,
    brief: '8 rings and 9 drones in 150 seconds, under a gusting crosswind.',
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || MISSIONS[0];
}

export function diffById(id) {
  return DIFFS.find((d) => d.id === id) || DIFFS[1];
}

// One sortie: the live state of a mission from takeoff to debrief.
export class Sortie {
  constructor(mission, diff, jet) {
    this.mission = mission;
    this.diff = diff;
    this.jet = jet;
    this.state = 'flying'; // flying | won | lost
    this.time = 0;
    this.rings = 0;
    this.drones = 0;
    this.score = 0;
    this.cause = '';
    this.landed = false;
    this.ringTimes = [];
  }

  get timeLeft() {
    if (!this.mission.timeLimit) return Infinity;
    return Math.max(0, this.mission.timeLimit * this.diff.timeMul - this.time);
  }

  ringPassed(index) {
    this.rings++;
    this.ringTimes.push(this.time);
    this.score += 100;
  }

  droneDown() {
    this.drones++;
    this.score += 150;
  }

  // Called every frame while flying. Returns 'won' | 'lost' | 'flying'.
  update(dt, flight) {
    if (this.state !== 'flying') return this.state;
    this.time += dt;
    if (!flight.alive) {
      this.state = 'lost';
      this.cause = flight.cause || 'CRASH';
      return this.state;
    }
    if (this.mission.timeLimit && this.timeLeft <= 0) {
      this.state = 'lost';
      this.cause = 'TIME UP';
      return this.state;
    }
    return this.state;
  }

  // The delivery ends when the jet settles on the runway strip, slow.
  tryLand(flight, runway, speed) {
    if (this.state !== 'flying' || !this.mission.landing) return false;
    const dx = Math.abs(flight.pos.x - runway.x);
    const dz = Math.abs(flight.pos.z - runway.z);
    const onStrip = dx < runway.wid / 2 + 4 && dz < runway.len / 2;
    const low = flight.pos.y < 34;
    if (onStrip && low && speed < 42) {
      this.landed = true;
      this.state = 'won';
      this.score += Math.round(flight.fuel) * 5 + 250;
      return true;
    }
    return false;
  }

  // Ring-only missions end the moment the last ring pops.
  checkRingWin(ringsDone) {
    if (this.state !== 'flying') return false;
    if (!this.mission.landing && ringsDone) {
      this.state = 'won';
      this.score += 250;
      return true;
    }
    return false;
  }

  // Patrol ends when rings are done and every drone is down — or the clock dies.
  checkPatrolWin(ringsDone, dronesLeft) {
    if (this.state !== 'flying') return false;
    if (this.mission.id === 'patrol' && ringsDone && dronesLeft === 0) {
      this.state = 'won';
      this.score += Math.round(this.timeLeft) * 4 + 250;
      return true;
    }
    return false;
  }

  debrief() {
    const mm = String(Math.floor(this.time / 60)).padStart(2, '0');
    const ss = String(Math.floor(this.time % 60)).padStart(2, '0');
    return {
      mission: this.mission.name,
      jet: this.jet.name,
      diff: this.diff.label,
      state: this.state,
      cause: this.cause,
      time: `${mm}:${ss}`,
      rings: this.rings,
      ringTotal: this.mission.rings,
      drones: this.drones,
      score: this.score,
      landed: this.landed,
    };
  }
}
