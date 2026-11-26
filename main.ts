// Canyon Thread v2 — the hand-in program.
// This file runs on Node 22 inside the grader's container (and locally with
// MAKEFUN_OUTPUT_DIR set). It takes the game as it stands in this repo — the
// static files under game/ and the screenshots under screenshots/ — and lays
// them out under the output directory with the dossier the judge reads,
// built by the vendored make.fun library. It does no building, no network
// and no guessing: a plain copy plus the dossier, twice the same bytes.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const gameSrc = join(repoRoot, 'game');
const shotsSrc = join(repoRoot, 'screenshots');

function countFiles(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    n += statSync(p).isDirectory() ? countFiles(p) : 1;
  }
  return n;
}

function main() {
  if (!existsSync(gameSrc)) throw new Error('game/ is missing from the repository');
  mkdirSync(outDir, { recursive: true });

  // A clean output directory: stale files from an earlier run must not leak in.
  for (const name of readdirSync(outDir)) {
    rmSync(join(outDir, name), { recursive: true, force: true });
  }

  cpSync(gameSrc, join(outDir, 'game'), { recursive: true });

  const shotsOut = join(outDir, 'screenshots');
  mkdirSync(shotsOut, { recursive: true });
  if (existsSync(shotsSrc)) {
    cpSync(shotsSrc, shotsOut, { recursive: true });
  }

  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  // Prove the dossier round-trips before calling the hand-in done: a corrupt
  // dossier would fail the gate silently, so refuse to finish with one.
  const roundTrip = JSON.parse(readFileSync(join(outDir, 'dossier.json'), 'utf8'));
  if (!roundTrip || typeof roundTrip !== 'object') throw new Error('dossier.json did not parse back');
  if (!existsSync(join(outDir, 'game', 'index.html'))) throw new Error('game/index.html missing from output');

  const shots = existsSync(shotsSrc) ? readdirSync(shotsSrc).filter((f) => !f.startsWith('.')) : [];
  console.log(`handed in: ${countFiles(join(outDir, 'game'))} game files, ${shots.length} screenshots, dossier ${dossier.length} bytes`);
}

main();
