#!/usr/bin/env node
/*
 * Screenshots email previews written by api/tests/email-preview.php.
 *   node api/tools/screenshot-emails.js <jobs.json> <out-dir>
 * jobs.json: [{file, width, scheme: 'light'|'dark', out}] — full-page PNGs.
 * File access is allowed so the previews load the web fonts from api/public/email/fonts/.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [jobFile, out] = process.argv.slice(2);
if (!jobFile || !out) {
  console.error('usage: screenshot-emails.js <jobs.json> <out-dir>');
  process.exit(2);
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const jobs = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const contexts = {};
  for (const j of jobs) {
    const key = `${j.width}-${j.scheme}`;
    if (!contexts[key]) {
      const ctx = await browser.newContext({ viewport: { width: j.width, height: 800 }, colorScheme: j.scheme, deviceScaleFactor: 1 });
      contexts[key] = await ctx.newPage();
    }
    const page = contexts[key];
    await page.goto('file://' + path.resolve(j.file), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, j.out), fullPage: true });
    console.log(j.out);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
