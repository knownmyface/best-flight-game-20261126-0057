// Canyon Thread — shared tuning constants.
// One-sentence twist: thread the glowing canyon rings in order before your
// fuel runs dry, then bring her home onto the strip.
export const GAME = {
  title: 'CANYON THREAD',
  twist: 'Thread the canyon rings before your fuel runs dry.',
  worldSize: 2600, // terrain spans -1300..1300 on x and z
  seaLevel: 0,
  gravity: 9.8,
  minSpeed: 22, // below this the wings stop flying
  maxSpeed: 148,
  stallSpeed: 26,
  fuelCapacity: 100,
  // fuel burn per second at full throttle, scaled by difficulty
  fuelBurn: 0.62,
  // damage on a hard terrain hit, scaled by impact speed
  crashDamage: 55,
  scrapeDamage: 18,
  // ring pass radius counts as threaded
  ringPassRadius: 13,
};

export const DIFFICULTIES = {
  cadet: { label: 'CADET', fuel: 0.7, damage: 0.5, wind: 0.4, time: 1.25, desc: 'Gentle wind, kind fuel, forgiving airframe.' },
  pilot: { label: 'PILOT', fuel: 1.0, damage: 1.0, wind: 1.0, time: 1.0, desc: 'As the canyon flies. The intended sortie.' },
  ace: { label: 'ACE', fuel: 1.35, damage: 1.6, wind: 1.7, time: 0.85, desc: 'Thirsty engine, hard gusts, thin margins.' },
};

// The canyon course: a winding polyline the rings follow, from the runway
// at the south end up through the canyon to the north ridge.
export const COURSE = {
  start: { x: 0, z: 980 },
  runwayHeading: 0, // runway points north (-z)
  runwayLength: 320,
  runwayWidth: 26,
  // control points of the canyon centre line (x, z), south -> north
  spine: [
    [0, 980], [40, 760], [-90, 560], [-40, 360], [120, 180],
    [60, -20], [-140, -220], [-60, -420], [110, -600], [30, -800], [-40, -980],
  ],
  canyonFloor: 26, // metres above sea level at the canyon bottom
  canyonWidth: 110, // half-width of the carved channel
  canyonDepth: 90, // how far the walls rise above the floor
};

// Fixed seed so every player flies the same canyon and screenshots repeat.
export const WORLD_SEED = 20261126;
