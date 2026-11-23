// Builds the source images @capacitor/assets needs (store-assets/app/) from the
// brand files, then `npm run app:assets` generates every icon/splash density for
// Android and iOS. Run again whenever the logo changes.
//   node scripts/app-icons.mjs && npx capacitor-assets generate --assetPath store-assets/app ...
import sharp from 'sharp';
import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'store-assets/app');
mkdirSync(out, { recursive: true });

const S = 1024;
const bgSvg = (size) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
     <defs><radialGradient id="g" cx="50%" cy="38%" r="75%">
       <stop offset="0" stop-color="#17503A"/><stop offset="1" stop-color="#06100C"/></radialGradient></defs>
     <rect width="100%" height="100%" fill="url(#g)"/></svg>`);

// 1. full icon (iOS + legacy Android): the store icon, no transparency
copyFileSync(resolve(root, 'store-assets/icons/icon-1024.png'), resolve(out, 'icon-only.png'));

// 2. adaptive icon layers: the gilded mushaf inside the 66/108 safe zone
const mark = readFileSync(resolve(root, 'public/brand/logo-mark.svg'));
const markH = Math.round(S * 0.68);   // the generated adaptive icon insets each layer by 16.7%
const markPng = await sharp(mark, { density: 600 }).resize({ height: markH }).png().toBuffer();
const meta = await sharp(markPng).metadata();
await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: markPng, left: Math.round((S - meta.width) / 2), top: Math.round((S - meta.height) / 2) }])
  .png().toFile(resolve(out, 'icon-foreground.png'));
await sharp(bgSvg(S)).png().toFile(resolve(out, 'icon-background.png'));

// 3. splash (2732², mark + wordmark centred) — dark only: the app opens dark until
//    the web layer applies the visitor's appearance.
copyFileSync(resolve(root, 'store-assets/splash/splash-2732x2732.png'), resolve(out, 'splash.png'));
copyFileSync(resolve(root, 'store-assets/splash/splash-2732x2732.png'), resolve(out, 'splash-dark.png'));
console.log('store-assets/app ready');
