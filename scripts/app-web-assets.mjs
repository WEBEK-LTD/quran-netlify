// Adds the app-only files to dist/ after `vite build` (never part of the website):
//   dist/adhan/<id>.mp3        full adhan recordings (played in the adhan screen)
//   dist/nq_adhan_<id>.caf     iOS notification sounds (≤ 30 s). The local-notifications
//                              plugin looks them up at the root of the web assets.
// Only recordings listed in src/native/adhan/available.json are copied.
import { readFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
if (!existsSync(resolve(dist, 'index.html'))) { console.error('dist/ missing — run vite build first'); process.exit(1); }
const { ids = [] } = JSON.parse(readFileSync(resolve(root, 'src/native/adhan/available.json'), 'utf8'));
mkdirSync(resolve(dist, 'adhan'), { recursive: true });
let n = 0;
for (const id of ids) {
  const full = resolve(root, 'store-assets/adhan/full', `${id}.mp3`);
  const caf = resolve(root, 'store-assets/adhan/ios', `nq_adhan_${id}.caf`);
  if (!existsSync(full) || !existsSync(caf)) { console.error(`missing processed audio for "${id}" — run scripts/fetch-adhan.sh`); process.exit(1); }
  copyFileSync(full, resolve(dist, 'adhan', `${id}.mp3`));
  copyFileSync(caf, resolve(dist, `nq_adhan_${id}.caf`));
  n++;
}
console.log(`app web assets: ${n} adhan recording(s) copied into dist/`);
