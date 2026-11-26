// Meridian Sky Courier — valley edition (make.fun best-flight-game-20261126-0057).
// The game is this directory's game/ folder: plain static files a desktop browser
// loads offline (game/index.html and its ES modules, no library, no network
// request). This program hands it in: it copies game/ and screenshots/ from
// beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Pre-flight validation: fail loudly before copying anything, so a broken
// hand-in never reaches the grader. The entry needs its page, and 3-4
// screenshots, each a real image under the 256 KiB cap.
const gameDir = join(here, 'game');
const shotDir = join(here, 'screenshots');
const indexHtml = join(gameDir, 'index.html');
if (!existsSync(indexHtml)) {
  console.error('pre-flight: game/index.html is missing — nothing to hand in');
  process.exit(1);
}
if (!existsSync(shotDir)) {
  console.error('pre-flight: screenshots/ is missing — the entry needs 3-4 screenshots');
  process.exit(1);
}
const shots = readdirSync(shotDir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
if (shots.length < 3 || shots.length > 4) {
  console.error(`pre-flight: ${shots.length} screenshots — the entry needs 3 or 4`);
  process.exit(1);
}
for (const f of shots) {
  const st = statSync(join(shotDir, f));
  if (st.size === 0) { console.error(`pre-flight: screenshots/${f} is empty`); process.exit(1); }
  if (st.size > 262144) { console.error(`pre-flight: screenshots/${f} is ${st.size} bytes — over the 256 KiB cap`); process.exit(1); }
}
console.log(`pre-flight: game/index.html present, ${shots.length} screenshots ok`);

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
console.log('dossier written');
