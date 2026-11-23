#!/usr/bin/env node
/*
 * Screenshots the email previews written by api/tests/email-preview.php.
 *   node api/tools/screenshot-emails.js <preview-dir> <out-dir>
 * Each email → <name>-<600|375>-<light|dark>.png (full page).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error('usage: screenshot-emails.js <preview-dir> <out-dir>');
  process.exit(2);
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
  const browser = await chromium.launch();
  for (const width of [600, 375]) {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: scheme, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      for (const f of files) {
        await page.goto('file://' + path.resolve(dir, f), { waitUntil: 'load' });
        const name = `${f.replace(/\.html$/, '')}-${width}-${scheme}.png`;
        await page.screenshot({ path: path.join(out, name), fullPage: true });
        console.log(name);
      }
      await ctx.close();
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
