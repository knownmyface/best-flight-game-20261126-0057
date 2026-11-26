// Canyon Thread v2 — deterministic randomness.
// Every run of the game uses one fixed seed, so the canyon, the course and
// the screenshots are the same for every player and every judge.

// A tiny seeded generator (mulberry32): cheap, stable across browsers.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer lattice hash -> [0, 1). No tables, no imports, fully deterministic.
export function hash2(ix, iy) {
  const h = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

// Smooth value noise over the integer lattice.
export function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  const u = fade(xf);
  const v = fade(yf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

// Fractal Brownian motion: stacked octaves of value noise, normalised.
export function fbm(x, y, octaves = 5) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

// Pick one item from a weighted table [[value, weight], ...] using a 0..1 roll.
export function pickWeighted(table, roll) {
  let r = roll;
  for (const [value, weight] of table) {
    if (r < weight) return value;
    r -= weight;
  }
  return table[table.length - 1][0];
}

// Clamp a number into [lo, hi].
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Linear interpolation.
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Smoothstep 0..1 across an edge.
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// The one fixed seed for the whole game. Same canyon, same course, every time.
export const WORLD_SEED = 20261126;
