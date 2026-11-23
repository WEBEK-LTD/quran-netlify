#!/usr/bin/env node
/*
 * Renders the PNG images used in emails (email clients do not render SVG) from the real
 * brand SVGs in public/brand/. Output: public/brand/email/{header,divider,footer-mark}.png
 *
 *   node api/tools/render-email-assets.js
 *
 * Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`,
 * or a global install). Images are rendered at deviceScaleFactor 2 (retina) and, if ImageMagick
 * is available, the opaque header is palette-reduced to stay small.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const BRAND = path.join(ROOT, 'public', 'brand');
const OUT = path.join(BRAND, 'email');

/** Inline a brand SVG at a given size (keeps its own viewBox and gradients). */
function svg(file, height, extra = '') {
  const src = fs.readFileSync(path.join(BRAND, file), 'utf8').trim();
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(src);
  const w = (parseFloat(vb[1]) / parseFloat(vb[2])) * height;
  return src
    .replace(/<title>.*?<\/title>/, '')
    .replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${w.toFixed(2)}" height="${height}" ${extra}`);
}

/** Eight-point star (square + rotated square) as an SVG path centred at cx,cy with radius r. */
function star8(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.7654; // regular {8/2} star: inner radius = r·cos(45°)/cos(22.5°)
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

const page = (body, w, h, bg = 'transparent') => `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:${bg}}#c{width:${w}px;height:${h}px;position:relative;overflow:hidden}</style>
</head><body><div id="c">${body}</div></body></html>`;

// ── header.png (600×200) ──────────────────────────────────────────────────────
function header() {
  const W = 600, H = 200;
  // girih-style tile: an eight-point star with a square rosette, joined by lines to its neighbours
  const T = 50;
  const tile = `
    <pattern id="girih" width="${T}" height="${T}" patternUnits="userSpaceOnUse">
      <path d="${star8(T / 2, T / 2, 13)}" fill="none" stroke="#D6B267" stroke-width=".7"/>
      <path d="${star8(T / 2, T / 2, 6.5)}" fill="none" stroke="#D6B267" stroke-width=".45"/>
      <path d="M0 0L${T / 2 - 9.2} ${T / 2 - 9.2}M${T} 0L${T / 2 + 9.2} ${T / 2 - 9.2}M0 ${T}L${T / 2 - 9.2} ${T / 2 + 9.2}M${T} ${T}L${T / 2 + 9.2} ${T / 2 + 9.2}" stroke="#D6B267" stroke-width=".55"/>
      <path d="M${T / 2} 0V${T / 2 - 13}M${T / 2} ${T}V${T / 2 + 13}M0 ${T / 2}H${T / 2 - 13}M${T} ${T / 2}H${T / 2 + 13}" stroke="#D6B267" stroke-width=".35"/>
      <path d="${star8(0, 0, 5)}" fill="none" stroke="#D6B267" stroke-width=".45"/>
      <path d="${star8(T, 0, 5)}" fill="none" stroke="#D6B267" stroke-width=".45"/>
      <path d="${star8(0, T, 5)}" fill="none" stroke="#D6B267" stroke-width=".45"/>
      <path d="${star8(T, T, 5)}" fill="none" stroke="#D6B267" stroke-width=".45"/>
    </pattern>`;
  // mihrab: pointed arch on two short columns, base at the frieze line
  const cx = W / 2, base = 184, half = 118, spring = 92, apex = 14;
  const arch = (dx, top) => {
    const l = cx - dx, r = cx + dx;
    const c1 = spring - (spring - top) * 0.62;
    return `M${l} ${base}V${spring}C${l} ${c1} ${cx - dx * 0.34} ${top + 20} ${cx} ${top}C${cx + dx * 0.34} ${top + 20} ${r} ${c1} ${r} ${spring}V${base}`;
  };
  const markH = 62;
  const body = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0">
    <defs>
      <radialGradient id="bg" cx="50%" cy="45%" r="70%">
        <stop offset="0" stop-color="#14402F"/><stop offset=".55" stop-color="#0B231A"/><stop offset="1" stop-color="#050C09"/>
      </radialGradient>
      <radialGradient id="fade" cx="50%" cy="50%" r="62%">
        <stop offset="0" stop-color="#000"/><stop offset=".28" stop-color="#000"/><stop offset=".62" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff"/>
      </radialGradient>
      <mask id="m"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#F6DFA0"/><stop offset=".45" stop-color="#D4AE5C"/><stop offset=".75" stop-color="#B8893A"/><stop offset="1" stop-color="#E7C77E"/>
      </linearGradient>
      <linearGradient id="frieze" x1="0" x2="1">
        <stop offset="0" stop-color="#D6B267" stop-opacity="0"/><stop offset=".18" stop-color="#D6B267" stop-opacity=".75"/>
        <stop offset=".5" stop-color="#F0D89A"/><stop offset=".82" stop-color="#D6B267" stop-opacity=".75"/><stop offset="1" stop-color="#D6B267" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="niche" cx="50%" cy="40%" r="60%">
        <stop offset="0" stop-color="#F0D89A" stop-opacity=".13"/><stop offset="1" stop-color="#F0D89A" stop-opacity="0"/>
      </radialGradient>
      ${tile}
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#girih)" opacity=".16" mask="url(#m)"/>
    <path d="${arch(half, apex)}Z" fill="#050E0A" opacity=".55"/>
    <path d="${arch(half, apex)}Z" fill="url(#niche)"/>
    <path d="${arch(half, apex)}" fill="none" stroke="url(#gold)" stroke-width="1.6"/>
    <path d="${arch(half - 7, apex + 9)}" fill="none" stroke="#D6B267" stroke-opacity=".55" stroke-width=".7"/>
    <path d="${star8(cx, apex - 1, 4.2)}" fill="url(#gold)"/>
    <path d="${star8(cx - half, spring - 6, 3.4)}" fill="url(#gold)"/>
    <path d="${star8(cx + half, spring - 6, 3.4)}" fill="url(#gold)"/>
    <rect x="0" y="${base}" width="${W}" height="1.2" fill="url(#frieze)"/>
    <rect x="0" y="${base + 4}" width="${W}" height=".6" fill="url(#frieze)" opacity=".6"/>
    ${Array.from({ length: 23 }, (_, i) => {
      const x = 36 + i * 24.0;
      const op = Math.max(0, 1 - Math.abs(x - cx) / 290) * 0.85;
      return `<path d="M${x} ${base + 7.6}l3 3-3 3-3-3z" fill="#D6B267" opacity="${op.toFixed(2)}"/>`;
    }).join('')}
    <path d="${star8(cx, base + 2.4, 5.2)}" fill="url(#gold)" stroke="#071510" stroke-width=".8"/>
  </svg>
  <div style="position:absolute;left:0;right:0;top:44px;text-align:center">${svg('logo-mark.svg', markH)}</div>
  <div style="position:absolute;left:0;right:0;top:${44 + markH + 10}px;text-align:center">${svg('wordmark-on-dark.svg', 46)}</div>`;
  return page(body, W, H, '#060D0A');
}

// ── divider.png (240×24) ──────────────────────────────────────────────────────
function divider() {
  const W = 240, H = 24, cx = W / 2, cy = H / 2;
  const body = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="l" x1="0" x2="1"><stop offset="0" stop-color="#B8893A" stop-opacity="0"/><stop offset="1" stop-color="#B8893A"/></linearGradient>
      <linearGradient id="r" x1="1" x2="0"><stop offset="0" stop-color="#B8893A" stop-opacity="0"/><stop offset="1" stop-color="#B8893A"/></linearGradient>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E2BF6E"/><stop offset=".55" stop-color="#B8893A"/><stop offset="1" stop-color="#D4AE5C"/></linearGradient>
    </defs>
    <rect x="6" y="${cy - 0.6}" width="${cx - 26}" height="1.2" fill="url(#l)"/>
    <rect x="${cx + 20}" y="${cy - 0.6}" width="${cx - 26}" height="1.2" fill="url(#r)"/>
    <path d="M${cx - 18} ${cy}l2.6 2.6-2.6 2.6-2.6-2.6z" transform="translate(0 -2.6)" fill="#B8893A"/>
    <path d="M${cx + 18} ${cy}l2.6 2.6-2.6 2.6-2.6-2.6z" transform="translate(0 -2.6)" fill="#B8893A"/>
    <path d="${star8(cx, cy, 9.5)}" fill="url(#g)"/>
    <path d="${star8(cx, cy, 5.2)}" fill="none" stroke="#FFF6DD" stroke-width=".8" opacity=".85"/>
    <circle cx="${cx}" cy="${cy}" r="1.6" fill="#FFF6DD"/>
  </svg>`;
  return page(body, W, H);
}

// ── footer-mark.png (48×48) ───────────────────────────────────────────────────
function footerMark() {
  const body = `<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">${svg('logo-mark-small.svg', 46)}</div>`;
  return page(body, 48, 48);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 700, height: 300 } });
  const pg = await ctx.newPage();
  const jobs = [
    ['header.png', header(), false],
    ['divider.png', divider(), true],
    ['footer-mark.png', footerMark(), true],
  ];
  for (const [name, html, transparent] of jobs) {
    await pg.setContent(html, { waitUntil: 'load' });
    const file = path.join(OUT, name);
    await pg.locator('#c').screenshot({ path: file, omitBackground: transparent });
    if (!transparent) {
      try { // palette-reduce the opaque banner (keeps it well under 120 KB)
        execFileSync('convert', [file, '-strip', '+dither', '-colors', '192', 'PNG8:' + file]);
      } catch { /* ImageMagick not installed: keep the full-colour PNG */ }
    }
    console.log(name, (fs.statSync(file).size / 1024).toFixed(1) + ' KB');
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
