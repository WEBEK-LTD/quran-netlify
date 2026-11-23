#!/usr/bin/env node
// ─── Static, crawlable pages for search engines and AI readers ───────────────
// Runs after `vite build` (npm run build) and writes into dist/:
//
//   /{lang}/                      landing page per language (intro + all 114 surahs)
//   /{lang}/surah/{n}/            one page per surah per language (684)
//   /{lang}/surah/{n}.md          the same content as clean Markdown
//   /seo/seo.css                  self-contained stylesheet (site fonts, light/dark)
//   /seo/app/*.html               copies of index.html with a per-route title/canonical
//   /sitemap.xml                  index → sitemap-pages.xml + sitemap-surahs.xml
//   /llms.txt, /llms-full.txt     summaries for LLMs (https://llmstxt.org)
//   /_headers                     Link: rel=canonical for every .md file
//
// No network: all data comes from scripts/seo-data/ (see seo-fetch-data.mjs).
// lang ∈ ar en tr fr ur id. Al-Fatiha uses the Madani count, as the reader does.
import { readFile, writeFile, mkdir, readdir, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { SITE, LANGS, ui, arDigits, APP_ROUTES, meaningOf } from './seo-i18n.mjs';

const t0 = Date.now();
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const DATA = join(ROOT, 'scripts', 'seo-data');
const readJson = async f => JSON.parse(await readFile(join(DATA, f), 'utf8'));

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('seo-build: dist/index.html not found — run `vite build` first.');
  process.exit(1);
}

// ── data ────────────────────────────────────────────────────────────────────
const NAMES = (await readJson('surah-names.json')).surahs;
const FACTS = await readJson('surah-facts.json');
const QURAN = await readJson('quran-uthmani-hafs.json');
const TEXTS = {
  ar: await readJson('tafsir-ar-muyassar.json'),
  en: await readJson('translation-en-saheeh.json'),
  tr: await readJson('translation-tr-diyanet.json'),
  fr: await readJson('translation-fr-hamidullah.json'),
  ur: await readJson('translation-ur-jalandhry.json'),
  id: await readJson('translation-id-kemenag.json'),
};
// schema.org translator/author of each language's text under the ayahs
const TRANSLATOR = {
  ar: { '@type': 'Organization', name: 'مجمع الملك فهد لطباعة المصحف الشريف', alternateName: 'King Fahd Glorious Quran Printing Complex' },
  en: { '@type': 'Organization', name: 'Saheeh International' },
  tr: { '@type': 'Organization', name: 'Diyanet İşleri Başkanlığı' },
  fr: { '@type': 'Person', name: 'Muhammad Hamidullah' },
  ur: { '@type': 'Person', name: 'فتح محمد جالندھری', alternateName: 'Fateh Muhammad Jalandhry' },
  id: { '@type': 'Organization', name: 'Kementerian Agama Republik Indonesia', alternateName: 'Kemenag' },
};

const TRANSLATOR_EN = {
  en: 'Saheeh International', tr: 'Diyanet İşleri (Presidency of Religious Affairs, Türkiye)', fr: 'Muhammad Hamidullah',
  ur: 'Fateh Muhammad Jalandhry', id: 'Kementerian Agama RI (Indonesian Ministry of Religious Affairs)',
};

for (let i = 0; i < 114; i++) {
  const n = NAMES[i].ayahs;
  if (QURAN[i].length !== n || FACTS[i].n !== i + 1) throw new Error(`data mismatch in surah ${i + 1}`);
  for (const l of LANGS) if (TEXTS[l][i].length !== n) throw new Error(`${l}: wrong ayah count in surah ${i + 1}`);
}

// ── helpers ─────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mdEsc = s => String(s).replace(/([\\`*_<])/g, '\\$1').replace(/\]\(/g, ']\\(');
const surahPath = (lang, n) => `/${lang}/surah/${n}/`;
const surahUrl = (lang, n) => SITE + surahPath(lang, n);
const mdPath = (lang, n) => `/${lang}/surah/${n}.md`;
const landingUrl = lang => `${SITE}/${lang}/`;
const readerHref = (n, kufi = 1) => `/reader?surah=${n}&ayah=${kufi}`;
const jsonLd = obj => JSON.stringify(obj).replace(/</g, '\\u003c');
const BASMALA = QURAN[0][0];

function gitDate(paths = []) {
  try {
    const out = execSync(`git log -1 --format=%cs -- ${paths.join(' ')}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (out) return out;
  } catch { /* not a git checkout */ }
  return new Date().toISOString().slice(0, 10);
}
const LASTMOD_SEO = gitDate(['scripts/seo-build.mjs', 'scripts/seo-i18n.mjs', 'scripts/seo-data']);
const LASTMOD_APP = gitDate([]);

// Items to show for a surah: { label (shown number), kufi (reader / data index), text, trans }
// Al-Fatiha — Madani count: the basmala is a heading, Madani 1–5 = Kufi 2–6, and
// Kufi 7 is split after the first «عليهم» into Madani 6 and 7; the translation /
// tafsir of Kufi 7 is shown once, under Madani 7.
function items(n, lang) {
  const q = QURAN[n - 1], tx = TEXTS[lang][n - 1];
  if (n !== 1) return q.map((text, i) => ({ label: i + 1, kufi: i + 1, text, trans: tx[i] }));
  const out = [];
  for (let k = 2; k <= 6; k++) out.push({ label: k - 1, kufi: k, text: q[k - 1], trans: tx[k - 1] });
  const words = q[6].split(' ');
  const cut = words.findIndex(w => w.replace(/[^ء-ي]/g, '') === 'عليهم');
  if (cut < 1) throw new Error('Al-Fatiha 7: split point not found');
  out.push({ label: 6, kufi: 7, text: words.slice(0, cut + 1).join(' '), trans: null });
  out.push({ label: 7, kufi: 7, text: words.slice(cut + 1).join(' '), trans: tx[6], transNote: true });
  return out;
}

// ── fonts + stylesheet ─────────────────────────────────────────────────────
const assets = await readdir(join(DIST, 'assets')).catch(() => []);
const copied = [];
async function fontUrl(pkg, file) {
  const stem = file.replace(/\.woff2$/, '');
  const hit = assets.find(a => a.startsWith(stem + '-') && a.endsWith('.woff2') && /^[\w-]+$/.test(a.slice(stem.length + 1, -6)));
  if (hit) return `/assets/${hit}`;
  // not emitted by Vite (e.g. the app stopped using it): ship our own copy
  const src = join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file);
  await mkdir(join(DIST, 'seo', 'fonts'), { recursive: true });
  await copyFile(src, join(DIST, 'seo', 'fonts', file));
  copied.push(file);
  return `/seo/fonts/${file}`;
}
// Read @font-face blocks from @fontsource CSS and point them at the built files.
async function fontFaces(pkg, cssFile, { family, subsets, weight }) {
  const css = await readFile(join(ROOT, 'node_modules', '@fontsource', pkg, cssFile), 'utf8');
  const out = [];
  for (const block of css.match(/@font-face\s*{[^}]*}/g) || []) {
    const file = (block.match(/url\(\.\/files\/([^)]+\.woff2)\)/) || [])[1];
    const range = (block.match(/unicode-range:\s*([^;]+);/) || [])[1];
    const subset = file && (file.match(new RegExp(`^${pkg}-(.+)-\\d+-normal\\.woff2$`)) || [])[1];
    if (!subsets.includes(subset)) continue;
    const url = await fontUrl(pkg, file);
    out.push(`@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:${weight || (block.match(/font-weight:\s*(\d+)/) || [])[1]};src:url(${url}) format('woff2');${range ? `unicode-range:${range.trim()};` : ''}}`);
  }
  return out;
}
const faces = [
  ...await fontFaces('amiri-quran', '400.css', { family: 'Amiri Quran', subsets: ['arabic'] }),
  ...await fontFaces('ibm-plex-sans-arabic', '400.css', { family: 'IBM Plex Sans Arabic', subsets: ['arabic', 'latin', 'latin-ext'] }),
  ...await fontFaces('ibm-plex-sans-arabic', '600.css', { family: 'IBM Plex Sans Arabic', subsets: ['arabic', 'latin', 'latin-ext'] }),
  ...await fontFaces('ibm-plex-sans-arabic', '700.css', { family: 'IBM Plex Sans Arabic', subsets: ['arabic', 'latin', 'latin-ext'] }),
  ...await fontFaces('reem-kufi', '600.css', { family: 'NQ Kufi', subsets: ['arabic', 'latin'], weight: '100 900' }),
];
const QURAN_FONT = (faces.find(f => f.includes("'Amiri Quran'")) || '').match(/url\(([^)]+)\)/)?.[1];

const LIGHT = `--bg:#F4F5F0;--bg2:#EBEFE6;--surface:#FFFFFF;--raise:#F8F9F5;--line:#DBE2D6;--line2:rgba(140,105,30,.32);--text:#13201A;--muted:#4D5B53;--faint:#6F7D74;--gold:#8C6A1E;--gold2:#B08A37;--emerald:#0D6046;--on-gold:#FFFFFF;--hl:rgba(13,96,70,.06);--glow:rgba(176,138,55,.14);--btn:linear-gradient(180deg,#9A7524,#7C5C17);color-scheme:light`;
const CSS = `/* Nur Al-Quran — static surah pages. Generated by scripts/seo-build.mjs */
${faces.join('\n')}
:root{--bg:#060D0A;--bg2:#0A1611;--surface:#0E1C16;--raise:#13251D;--line:#1F3A2E;--line2:rgba(214,178,103,.30);--text:#F1EBDC;--muted:#A9B6AC;--faint:#7E8F84;--gold:#D6B267;--gold2:#F0D89A;--emerald:#3AA57D;--on-gold:#1A1205;--hl:rgba(214,178,103,.07);--glow:rgba(240,216,154,.12);--btn:linear-gradient(180deg,#F0D89A,#D6B267);
--f-brand:'NQ Kufi','IBM Plex Sans Arabic',Tahoma,sans-serif;--f-ui:'IBM Plex Sans Arabic',system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;--f-quran:'Amiri Quran','Amiri','Traditional Arabic',serif;color-scheme:dark}
@media (prefers-color-scheme:light){:root:not([data-scheme="dark"]){${LIGHT}}}
:root[data-scheme="light"]{${LIGHT}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;min-height:100vh;background:var(--bg);background-image:radial-gradient(60rem 28rem at 50% -8rem,var(--glow),transparent 70%);background-repeat:no-repeat;color:var(--text);font:400 1rem/1.75 var(--f-ui);overflow-x:hidden;overflow-wrap:break-word}
a{color:var(--gold)}a:hover{color:var(--gold2)}
:focus-visible{outline:2px solid var(--gold);outline-offset:3px;border-radius:6px}
.wrap{width:100%;max-width:58rem;margin-inline:auto;padding-inline:16px}
.skip{position:absolute;inset-inline-start:8px;top:-80px;z-index:9;background:var(--gold);color:var(--on-gold);padding:6px 12px;border-radius:8px}
.skip:focus{top:8px}
.bar{border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--bg) 86%,transparent)}
.bar-in{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-block:10px}
.brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none;color:var(--text)}
.brand .mark{width:31px;height:36px;flex:none}
.brand .wm{height:28px;width:auto}
.wm-l{display:none}
@media (prefers-color-scheme:light){:root:not([data-scheme="dark"]) .wm-d{display:none}:root:not([data-scheme="dark"]) .wm-l{display:inline}}
:root[data-scheme="light"] .wm-d{display:none}:root[data-scheme="light"] .wm-l{display:inline}
.brand-tl{font:600 1.05rem/1 var(--f-brand);color:var(--gold);letter-spacing:.01em}
.langs{display:flex;flex-wrap:wrap;gap:4px;margin:0;padding:0;list-style:none;font-size:.86rem}
.langs a{display:inline-block;padding:3px 10px;border:1px solid var(--line);border-radius:999px;text-decoration:none;color:var(--muted);line-height:1.6}
.langs a:hover{border-color:var(--line2);color:var(--text)}
.langs a[aria-current]{border-color:var(--gold);color:var(--gold)}
.crumbs ol{display:flex;flex-wrap:wrap;gap:4px 8px;margin:14px 0 0;padding:0;list-style:none;font-size:.85rem;color:var(--faint)}
.crumbs li+li::before{content:"›";margin-inline-end:8px;color:var(--faint)}
[dir="rtl"] .crumbs li+li::before{content:"‹"}
.crumbs a{color:var(--muted);text-decoration:none}.crumbs a:hover{color:var(--gold)}
.hero{position:relative;margin:14px 0 0;padding:clamp(18px,4vw,32px);border:1px solid var(--line2);border-radius:22px;background:linear-gradient(180deg,var(--surface),var(--bg2));box-shadow:0 30px 80px -40px rgba(0,0,0,.55)}
.hero::before{content:"";position:absolute;inset:6px;border:1px solid var(--line2);border-radius:17px;pointer-events:none;opacity:.55}
.kicker{margin:0;color:var(--gold);font-size:.85rem;font-weight:600;letter-spacing:.04em}
h1{margin:.2rem 0 .1rem;font:600 clamp(1.85rem,5.4vw,2.9rem)/1.2 var(--f-brand);text-wrap:balance}
h1 .mean{display:block;margin-top:.35rem;font:400 clamp(1rem,2.6vw,1.2rem)/1.5 var(--f-ui);color:var(--muted)}
.arname{margin:.3rem 0 0;font:400 clamp(1.6rem,5vw,2.2rem)/1.6 var(--f-quran);color:var(--gold)}
.lead{margin:.6rem 0 0;color:var(--muted);font-size:1.05rem;max-width:44rem}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr));gap:8px;margin:18px 0 0;padding:0}
.facts div{padding:8px 12px;border:1px solid var(--line);border-radius:12px;background:var(--raise)}
.facts dt{font-size:.75rem;color:var(--faint)}
.facts dd{margin:0;font-weight:600}
.cta{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin:20px 0 0}
.btn{display:inline-flex;align-items:center;gap:8px;padding:.72rem 1.35rem;border-radius:999px;background:var(--btn);color:var(--on-gold);font-weight:700;text-decoration:none;box-shadow:0 10px 26px -14px var(--gold)}
.btn:hover{color:var(--on-gold);filter:brightness(1.06)}
.btn svg{width:1.15em;height:1.15em;flex:none}
.btn2{display:inline-flex;padding:.62rem 1.1rem;border-radius:999px;border:1px solid var(--line2);color:var(--gold);text-decoration:none;font-weight:600}
.hint{color:var(--faint);font-size:.88rem}
.note{margin:18px 0 0;padding:10px 14px;border-inline-start:3px solid var(--gold);background:var(--hl);border-radius:10px;color:var(--muted);font-size:.92rem}
.note p{margin:0}.note p+p{margin-top:6px}
.text{margin-top:10px}
.basmala{margin:28px 0 0;text-align:center;font:400 clamp(1.6rem,5vw,2.2rem)/2 var(--f-quran);color:var(--gold)}
.bas-t{text-align:center;color:var(--muted);margin:0}
.ayahs{list-style:none;margin:14px 0 0;padding:0}
.ayah{padding:16px 0;border-bottom:1px solid var(--line);scroll-margin-top:12px}
.ayah:target{background:var(--hl);border-radius:12px}
.q{margin:0;font:400 clamp(1.5rem,4.8vw,2.05rem)/2.3 var(--f-quran);text-align:right;color:var(--text)}
.am{display:inline-flex;align-items:center;justify-content:center;min-width:1.75em;height:1.75em;padding:0 .2em;margin-inline-start:.2em;border:2px double var(--gold);border-radius:50%;font:700 .5em/1 var(--f-ui);color:var(--gold);text-decoration:none;vertical-align:.2em}
.t{margin:.35rem 0 0;font-size:1.02rem;line-height:1.8}
[lang="ur"] .t{font-size:1.14rem;line-height:2.15}
.ref{display:inline-block;margin-inline-end:.5em;color:var(--gold);font-size:.8em;font-weight:600;font-variant-numeric:tabular-nums}
.tf{margin:.5rem 0 0;padding:.55rem .9rem;border-radius:12px;background:var(--hl);color:var(--muted);font-size:.98rem;line-height:1.95}
.pn{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:10px;margin:26px 0 0}
.pn a{display:block;padding:12px 16px;border:1px solid var(--line);border-radius:14px;background:var(--surface);text-decoration:none;color:var(--text)}
.pn a:hover{border-color:var(--line2)}
.pn small{display:block;color:var(--faint);font-size:.78rem}
.pn b{font-weight:600}
.pn .nx{text-align:end}
section.more{margin:34px 0 0}
h2{margin:0 0 10px;font:600 clamp(1.25rem,3.4vw,1.6rem)/1.35 var(--f-brand)}
.more p{margin:0 0 10px;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.chips a{display:inline-block;padding:6px 14px;border:1px solid var(--line);border-radius:999px;background:var(--surface);text-decoration:none;color:var(--text);font-size:.93rem}
.chips a:hover{border-color:var(--gold);color:var(--gold)}
.feat{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:10px;margin:0;padding:0;list-style:none}
.feat a{display:block;height:100%;padding:14px 16px;border:1px solid var(--line);border-radius:16px;background:var(--surface);text-decoration:none;color:var(--text)}
.feat a:hover{border-color:var(--line2)}
.feat b{display:block;color:var(--gold);font-weight:600;margin-bottom:2px}
.feat span{color:var(--muted);font-size:.93rem}
.slist{display:grid;grid-template-columns:repeat(auto-fill,minmax(16.5rem,1fr));gap:8px;margin:0;padding:0;list-style:none}
.slist a{display:grid;grid-template-columns:auto 1fr auto;min-height:4.2rem;align-items:center;gap:2px 12px;padding:10px 14px;border:1px solid var(--line);border-radius:14px;background:var(--surface);text-decoration:none;color:var(--text)}
.slist a:hover{border-color:var(--line2)}
.no{grid-column:1;grid-row:1/3;display:inline-grid;place-items:center;width:2.3rem;height:2.3rem;border:2px double var(--gold);border-radius:50%;color:var(--gold);font-weight:700;font-size:.85rem}
.nm{grid-column:2;grid-row:1;font-weight:600}
.sa{grid-column:3;grid-row:1/3;font:400 1.35rem/1.4 var(--f-quran);color:var(--gold)}
.mt{grid-column:2;grid-row:2;color:var(--faint);font-size:.8rem}
.hero-mark{float:inline-end;width:84px;height:auto;margin-inline-start:12px}
.foot{margin-top:44px;padding:22px 0 34px;border-top:1px solid var(--line);color:var(--faint);font-size:.86rem}
.foot p{margin:0 0 8px}
.foot nav{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px}
.foot a{color:var(--muted)}
@media (max-width:480px){.bar-in{justify-content:center;gap:8px}.langs{justify-content:center;font-size:.8rem}.langs a{padding:1px 8px}.facts{grid-template-columns:repeat(auto-fit,minmax(7rem,1fr))}.facts div{padding:6px 10px}.hero{border-radius:18px}.q{line-height:2.2}.hero-mark{width:64px}}
@media print{.bar,.cta,.pn,.more,.foot{display:none}body{background:#fff;color:#000}}
`;
const cssHash = createHash('sha256').update(CSS).digest('hex').slice(0, 10);
await mkdir(join(DIST, 'seo'), { recursive: true });
await writeFile(join(DIST, 'seo', 'seo.css'), CSS);
const CSS_HREF = `/seo/seo.css?v=${cssHash}`;

// Pre-paint: same appearance choice as the app (index.html); and when a visitor
// opens the app from a page, the app starts in that page's language unless they
// already picked one.
const SCRIPT = lang => `<script>(function(){try{var a=JSON.parse(localStorage.getItem("nq_appearance")||"{}")||{},m=a.mode||(localStorage.getItem("nq_theme")==="light"?"light":"auto");if(m!=="auto")document.documentElement.setAttribute("data-scheme",m==="light"||m==="sepia"?"light":"dark")}catch(e){}document.addEventListener("click",function(e){var l=e.target.closest&&e.target.closest("a[data-app]");if(!l)return;try{if(!localStorage.getItem("nq_ui_lang"))localStorage.setItem("nq_ui_lang","${lang}")}catch(e){}})})()</script>`;

const BOOK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z"/><path d="M12 6.5v13"/></svg>';

// ── shared page parts ───────────────────────────────────────────────────────
function head({ t, title, desc, canonical, alternates, mdHref, ogType, ld }) {
  const alt = alternates.map(([hl, href]) => `<link rel="alternate" hreflang="${hl}" href="${esc(href)}">`).join('\n');
  const otherLocales = LANGS.filter(l => l !== t.lang).map(l => `<meta property="og:locale:alternate" content="${ui(l).ogLocale}">`).join('\n');
  return `<!doctype html>
<html lang="${t.htmlLang}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${esc(canonical)}">
${alt}
${mdHref ? `<link rel="alternate" type="text/markdown" href="${esc(mdHref)}" title="Markdown">\n` : ''}<meta name="theme-color" content="#07110D" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F4F5F0" media="(prefers-color-scheme: light)">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${esc(t.brand)}">
<meta property="og:title" content="${esc(title.replace(/ \| [^|]+$/, ''))}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(t.brand)}">
<meta property="og:locale" content="${t.ogLocale}">
${otherLocales}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title.replace(/ \| [^|]+$/, ''))}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/og-image.png">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
${QURAN_FONT ? `<link rel="preload" href="${QURAN_FONT}" as="font" type="font/woff2" crossorigin>\n` : ''}<link rel="stylesheet" href="${CSS_HREF}">
${SCRIPT(t.lang)}
<script type="application/ld+json">${jsonLd(ld)}</script>
</head>`;
}

function topBar(t, langHref) {
  const langs = LANGS.map(l => {
    const u = ui(l);
    return `<li><a href="${langHref(l)}" hreflang="${l}" lang="${l}"${l === t.lang ? ' aria-current="page"' : ''}>${u.label}</a></li>`;
  }).join('');
  return `<a class="skip" href="#main">${esc(t.skip)}</a>
<header class="bar"><div class="wrap bar-in">
<a class="brand" href="/${t.lang}/"><img class="mark" src="/brand/logo-mark-small.svg" width="31" height="36" alt=""><img class="wm wm-d" src="/brand/wordmark-on-dark.svg" width="98" height="28" alt="نور القرآن"><img class="wm wm-l" src="/brand/wordmark-on-light.svg" width="98" height="28" alt="نور القرآن">${t.lang === 'ar' || t.lang === 'ur' ? '' : `<span class="brand-tl">${esc(t.brand)}</span>`}</a>
<nav aria-label="Language"><ul class="langs">${langs}</ul></nav>
</div></header>`;
}

function footer(t, mdHref) {
  const links = ['/', '/help', '/privacy', '/terms'].map(h => `<a href="${h}" data-app>${esc(t.sections[h])}</a>`).join('');
  return `<footer class="foot"><div class="wrap">
<p>${esc(t.footer.text)}${mdHref ? ` · <a href="${esc(mdHref)}" type="text/markdown">${esc(t.md)}</a>` : ''}</p>
<p>${esc(t.footer.free)}</p>
<nav aria-label="${esc(t.brand)}">${links}<a href="/llms.txt">llms.txt</a></nav>
</div></footer>`;
}

const websiteNode = { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'نور القرآن', alternateName: ['Nur Al-Quran', 'Noor Al-Quran'], publisher: { '@id': `${SITE}/#organization` } };
const orgNode = { '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'نور القرآن', alternateName: 'Nur Al-Quran', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/icons/icon-512.png`, width: 512, height: 512 } };
const quranNode = { '@type': 'Book', '@id': `${SITE}/#quran`, name: 'القرآن الكريم', alternateName: ['The Holy Quran', 'Al-Qurʾān al-Karīm'], inLanguage: 'ar' };

// ── surah pages ─────────────────────────────────────────────────────────────
function surahPage(lang, n) {
  const t = ui(lang);
  const s = NAMES[n - 1], f = FACTS[n - 1];
  const url = surahUrl(lang, n);
  const title = t.title(s);
  const desc = t.desc(s, f, t);
  const surahTitle = t.surah(s);
  const meaning = t.meaning(s);
  const list = items(n, lang);
  const isAr = lang === 'ar';
  const alternates = [...LANGS.map(l => [l, surahUrl(l, n)]), ['x-default', surahUrl('ar', n)]];

  const factRows = [
    [t.facts.place, t.place[s.place]],
    [t.facts.ayahs, t.num(s.ayahs)],
    [t.facts.juz, t.range(f.juz)],
    [t.facts.order, t.num(f.order)],
    [t.facts.pages, t.range(f.pages)],
    ...(f.sajda.length ? [[t.facts.sajda, f.sajda.map(a => t.num(a)).join('، ')]] : []),
  ];
  const facts = factRows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');

  const basTrans = TEXTS[lang][0][0];
  let basmala = '';
  if (n !== 9) {
    basmala = `<h2 class="basmala" lang="ar" dir="rtl">${BASMALA}</h2>`;
    if (isAr && n === 1) basmala += `<p class="tf">${esc(basTrans)}</p>`;
    else if (!isAr) basmala += `<p class="t bas-t">${esc(basTrans)}</p>`;
  }

  const ayahs = list.map(it => {
    const ref = `${n}:${it.label}`;
    const num = arDigits(it.label);
    let under = '';
    if (it.trans) {
      if (isAr) under = `<p class="tf">${it.transNote ? `<b>${esc(t.tafsirOf67)}:</b> ` : ''}${esc(it.trans)}</p>`;
      else under = `<p class="t"><span class="ref">${esc(it.transNote ? `${n}:6–7` : t.ayahRef(n, it.label))}</span>${esc(it.trans)}</p>`;
    }
    return `<li class="ayah" id="ayah-${it.label}"><p class="q" lang="ar" dir="rtl">${it.text} <a class="am" href="#ayah-${it.label}" title="${ref}">${num}</a></p>${under}</li>`;
  }).join('\n');

  const prev = n > 1 ? NAMES[n - 2] : null, next = n < 114 ? NAMES[n] : null;
  const pn = `<nav class="pn" aria-label="${esc(t.prev)} / ${esc(t.next)}">${prev ? `<a href="${surahPath(lang, n - 1)}" rel="prev"><small>${esc(t.prev)}</small><b>${esc(t.num(n - 1))}. ${esc(t.surah(prev))}</b></a>` : ''}${next ? `<a class="nx" href="${surahPath(lang, n + 1)}" rel="next"><small>${esc(t.next)}</small><b>${esc(t.num(n + 1))}. ${esc(t.surah(next))}</b></a>` : ''}</nav>`;

  const others = LANGS.filter(l => l !== lang).map(l => {
    const u = ui(l);
    return `<li><a href="${surahPath(l, n)}" hreflang="${l}" lang="${l}">${esc(u.surah(s))} — ${esc(u.label)}</a></li>`;
  }).join('');
  const sections = t.sectionsList.map(x => `<li><a href="${x.href}" data-app>${esc(x.label)}</a></li>`).join('');

  const cta = `<p class="cta"><a class="btn" href="${esc(readerHref(n))}" data-app>${BOOK_ICON}${esc(t.openMushaf)}</a><span class="hint">${esc(t.mushafHint)}</span></p>`;

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title, description: desc, inLanguage: t.htmlLang,
        isPartOf: { '@id': `${SITE}/#website` }, breadcrumb: { '@id': `${url}#breadcrumb` },
        primaryImageOfPage: { '@type': 'ImageObject', url: `${SITE}/og-image.png`, width: 1200, height: 630 },
        mainEntity: { '@id': `${url}#surah` }, hasPart: { '@id': `${url}#${isAr ? 'tafsir' : 'translation'}` }, dateModified: LASTMOD_SEO,
        potentialAction: { '@type': 'ReadAction', target: `${SITE}${readerHref(n)}` },
      },
      {
        '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t.brand, item: landingUrl(lang) },
          { '@type': 'ListItem', position: 2, name: surahTitle, item: url },
        ],
      },
      {
        '@type': 'Chapter', '@id': `${url}#surah`, url,
        name: `سورة ${s.ar}`,
        alternateName: [...new Set([`Surah ${s.tl}`, s.meaning.en, ...(isAr ? [] : [surahTitle, meaning])])].filter(Boolean),
        position: n, inLanguage: 'ar', isPartOf: quranNode,
        description: `${surahTitle}: ${t.facts.ayahs} ${t.num(s.ayahs)} · ${t.place[s.place]} · ${t.facts.juz} ${t.range(f.juz)} · ${t.facts.order} ${t.num(f.order)}`,
        ...(isAr ? {} : { workTranslation: { '@id': `${url}#translation` } }),
      },
      isAr
        ? { '@type': 'CreativeWork', '@id': `${url}#tafsir`, name: `التفسير الميسر — سورة ${s.ar}`, inLanguage: 'ar', about: { '@id': `${url}#surah` }, author: TRANSLATOR.ar }
        : { '@type': 'CreativeWork', '@id': `${url}#translation`, name: `${t.transSource} — ${surahTitle}`, inLanguage: t.htmlLang, translationOfWork: { '@id': `${url}#surah` }, translator: TRANSLATOR[lang] },
      websiteNode, orgNode,
    ],
  };

  const html = `${head({ t, title, desc, canonical: url, alternates, mdHref: mdPath(lang, n), ogType: 'article', ld })}
<body>
${topBar(t, l => surahPath(l, n))}
<main id="main" class="wrap">
<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/${lang}/">${esc(t.brand)}</a></li><li><a href="/${lang}/#surahs">${esc(t.allSurahs)}</a></li><li aria-current="page">${esc(surahTitle)}</li></ol></nav>
<article aria-labelledby="title">
<header class="hero">
<p class="kicker">${esc(t.kicker(n))}</p>
<h1 id="title">${esc(surahTitle)}${meaning ? ` <span class="mean">${esc(meaning)}</span>` : ''}</h1>
${isAr ? '' : `<p class="arname" lang="ar" dir="rtl">سورة ${esc(s.ar)}</p>\n`}<dl class="facts">${facts}</dl>
${cta}
</header>
<div class="note"><p>${esc(t.textNote)}</p>${n === 1 ? `<p>${esc(t.fatihaNote)}</p>` : ''}</div>
<section class="text" aria-label="${esc(surahTitle)}">
${basmala}
<ol class="ayahs">
${ayahs}
</ol>
</section>
${cta}
${pn}
</article>
<section class="more" aria-labelledby="other-langs"><h2 id="other-langs">${esc(t.otherLangs)}</h2><p>${esc(t.otherLangsLead)}</p><ul class="chips">${others}</ul></section>
<section class="more" aria-labelledby="explore"><h2 id="explore">${esc(t.explore)}</h2><ul class="chips">${sections}<li><a href="/${lang}/#surahs">${esc(t.allSurahs)}</a></li></ul></section>
</main>
${footer(t, mdPath(lang, n))}
</body>
</html>
`;

  // Markdown copy
  const md = [];
  md.push(`# ${surahTitle}${meaning ? ` (${meaning})` : ''} — سورة ${s.ar}`, '');
  md.push(`> Source: ${t.brand} — ${url}`);
  md.push('> Arabic text: Uthmani script, Hafs ʿan ʿĀṣim, King Fahd Glorious Quran Printing Complex (qurancomplex.gov.sa); reproduce it without alteration.');
  md.push(isAr
    ? '> Under each ayah: Tafsir al-Muyassar (التفسير الميسر), King Fahd Glorious Quran Printing Complex.'
    : `> Under each ayah: a translation of the meanings (${t.label}) by ${TRANSLATOR_EN[lang]}. A translation of the meanings is not the Quran itself; the Quran is the Arabic text.`);
  md.push('> Texts via the open quran-api dataset (github.com/fawazahmed0/quran-api), from Tanzil, the King Fahd Complex and QuranEnc; copyright of translations and tafsir remains with their authors/publishers (non-commercial use with attribution).');
  if (n === 1) md.push('> Al-Fatiha uses the Madani count: the basmala is unnumbered; ayah 6 = «صِرَٰطَ ٱلَّذِينَ أَنۡعَمۡتَ عَلَيۡهِمۡ», ayah 7 = «غَيۡرِ ٱلۡمَغۡضُوبِ عَلَيۡهِمۡ وَلَا ٱلضَّآلِّينَ».');
  md.push('');
  for (const [k, v] of factRows) md.push(`- ${k}: ${v}`);
  md.push(`- ${t.openMushaf}: ${SITE}${readerHref(n)}`, '');
  if (n !== 9) {
    md.push(`## ${BASMALA}`, '');
    if (!isAr || n === 1) md.push(`*${mdEsc(basTrans)}*`, '');
  }
  for (const it of list) {
    md.push(`**${n}:${it.label}** ${it.text} ﴿${arDigits(it.label)}﴾`, '');
    if (it.trans) md.push(`> ${it.transNote ? (isAr ? `${t.tafsirOf67}: ` : `(${n}:6–7) `) : ''}${mdEsc(it.trans)}`, '');
  }
  if (prev) md.push(`${t.prev}: [${t.surah(prev)}](${surahUrl(lang, n - 1)})`);
  if (next) md.push(`${t.next}: [${t.surah(next)}](${surahUrl(lang, n + 1)})`);
  md.push('', `${t.otherLangs}: ${LANGS.filter(l => l !== lang).map(l => `[${ui(l).label}](${SITE}${mdPath(l, n)})`).join(' · ')}`, '');

  return { html, md: md.join('\n') };
}

// ── landing pages ───────────────────────────────────────────────────────────
function landingPage(lang) {
  const t = ui(lang);
  const L = t.landing;
  const url = landingUrl(lang);
  const alternates = [...LANGS.map(l => [l, landingUrl(l)]), ['x-default', `${SITE}/`]];
  const feats = t.features.map(x => `<li><a href="${x.href}" data-app><b>${esc(x.title)}</b><span>${esc(x.text)}</span></a></li>`).join('');
  const list = NAMES.map(s => {
    const name = t.name(s);
    const mean = t.meaning(s);
    return `<li><a href="${surahPath(lang, s.n)}"><span class="no">${esc(t.num(s.n))}</span><span class="nm">${esc(t.surah(s))}</span>${t.dir === 'rtl' ? '' : `<span class="sa" lang="ar">${esc(s.ar)}</span>`}<span class="mt">${mean ? `${esc(mean)} · ` : ''}${esc(L.ayahs(s.ayahs))} · ${esc(t.place[s.place])}</span></a></li>`;
  }).join('\n');
  const others = LANGS.filter(l => l !== lang).map(l => `<li><a href="/${l}/" hreflang="${l}" lang="${l}">${esc(ui(l).label)}</a></li>`).join('');

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage', '@id': `${url}#webpage`, url, name: L.title, description: L.desc, inLanguage: t.htmlLang,
        isPartOf: { '@id': `${SITE}/#website` }, breadcrumb: { '@id': `${url}#breadcrumb` }, about: { '@id': `${SITE}/#quran` },
        primaryImageOfPage: { '@type': 'ImageObject', url: `${SITE}/og-image.png`, width: 1200, height: 630 },
        dateModified: LASTMOD_SEO,
        mainEntity: {
          '@type': 'ItemList', name: L.listTitle, numberOfItems: 114,
          itemListElement: NAMES.map(s => ({ '@type': 'ListItem', position: s.n, url: surahUrl(lang, s.n), name: t.surah(s) })),
        },
      },
      { '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: [{ '@type': 'ListItem', position: 1, name: t.brand, item: url }] },
      quranNode, websiteNode, orgNode,
    ],
  };

  return `${head({ t, title: L.title, desc: L.desc, canonical: url, alternates, ogType: 'website', ld })}
<body>
${topBar(t, l => `/${l}/`)}
<main id="main" class="wrap">
<header class="hero">
<img class="hero-mark" src="/brand/logo-mark.svg" width="84" height="100" alt="">
<p class="kicker">${esc(t.brand)}</p>
<h1 id="title">${esc(L.h1)}</h1>
<p class="lead">${esc(L.lead)}</p>
<p class="cta"><a class="btn" href="/" data-app>${BOOK_ICON}${esc(L.openApp)}</a><a class="btn2" href="/reader" data-app>${esc(t.sections['/reader'])}</a></p>
</header>
<section class="more" aria-labelledby="features"><h2 id="features">${esc(L.featuresTitle)}</h2><ul class="feat">${feats}</ul></section>
<section class="more" id="surahs" aria-labelledby="surahs-h"><h2 id="surahs-h">${esc(L.listTitle)}</h2><p>${esc(L.listLead)}</p>
<ol class="slist">
${list}
</ol></section>
<section class="more" aria-labelledby="other-langs"><h2 id="other-langs">${esc(t.siteLangs)}</h2><ul class="chips">${others}</ul></section>
</main>
${footer(t, null)}
</body>
</html>
`;
}

// ── per-route copies of index.html (each app route gets its own canonical) ──
async function appRouteCopies() {
  const index = await readFile(join(DIST, 'index.html'), 'utf8');
  await mkdir(join(DIST, 'seo', 'app'), { recursive: true });
  const set = (html, re, value) => {
    if (!re.test(html)) throw new Error(`index.html: ${re} not found`);
    return html.replace(re, value);
  };
  const out = [];
  for (const [route, title, desc] of APP_ROUTES) {
    let h = index.replace(/\s*<link rel="alternate" hreflang="[^"]+"[^>]*>/g, '');
    h = set(h, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
    h = set(h, /(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`);
    h = set(h, /(<link rel="canonical" href=")[^"]*(")/, `$1${SITE}${route}$2`);
    h = set(h, /(<meta property="og:url"\s+content=")[^"]*(")/, `$1${SITE}${route}$2`);
    h = set(h, /(<meta property="og:title"\s+content=")[^"]*(")/, `$1${esc(title.replace(/ \| [^|]+$/, ''))}$2`);
    h = set(h, /(<meta property="og:description"\s+content=")[^"]*(")/, `$1${esc(desc)}$2`);
    h = h.replace(/(<meta name="twitter:url"\s+content=")[^"]*(")/, `$1${SITE}${route}$2`)
      .replace(/(<meta name="twitter:title"\s+content=")[^"]*(")/, `$1${esc(title.replace(/ \| [^|]+$/, ''))}$2`)
      .replace(/(<meta name="twitter:description"\s+content=")[^"]*(")/, `$1${esc(desc)}$2`);
    const file = `${route.slice(1)}.html`;
    await writeFile(join(DIST, 'seo', 'app', file), h);
    out.push(file);
  }
  // /admin: the same app shell, never indexed
  let admin = index.replace(/\s*<link rel="alternate" hreflang="[^"]+"[^>]*>/g, '').replace(/\s*<link rel="canonical"[^>]*>/, '');
  admin = set(admin, /<meta name="robots" content="[^"]*"\s*\/?>/, '<meta name="robots" content="noindex, nofollow" />');
  await writeFile(join(DIST, 'seo', 'app', 'admin.html'), admin);
  return out.length + 1;
}

// ── sitemaps, llms.txt, _headers ───────────────────────────────────────────
const SITEMAP_PAGES = ['/', '/reader', '/listen', '/tafsir', '/prayer-times', '/qibla', '/adhkar', '/tasbih', '/radio', '/daily-ayah', '/hifz', '/khatma-group', '/search', '/ijaza', '/docs', '/help', '/privacy', '/terms'];
const PRIORITY = { '/': '1.0', '/reader': '0.9', '/listen': '0.8', '/tafsir': '0.8', '/prayer-times': '0.8', '/adhkar': '0.8', '/daily-ayah': '0.7', '/privacy': '0.3', '/terms': '0.3' };

function xmlAlternates(pairs) {
  return pairs.map(([hl, href]) => `<xhtml:link rel="alternate" hreflang="${hl}" href="${esc(href)}"/>`).join('');
}
function sitemaps() {
  const pages = SITEMAP_PAGES.map(p => {
    const alts = p === '/' ? xmlAlternates([...LANGS.map(l => [l, landingUrl(l)]), ['x-default', `${SITE}/`]]) : '';
    return `<url><loc>${SITE}${p}</loc><lastmod>${LASTMOD_APP}</lastmod><priority>${PRIORITY[p] || '0.6'}</priority>${alts}</url>`;
  });
  const surahs = [];
  const landAlts = xmlAlternates([...LANGS.map(l => [l, landingUrl(l)]), ['x-default', `${SITE}/`]]);
  for (const l of LANGS) surahs.push(`<url><loc>${landingUrl(l)}</loc><lastmod>${LASTMOD_SEO}</lastmod><priority>0.9</priority>${landAlts}</url>`);
  for (let n = 1; n <= 114; n++) {
    const alts = xmlAlternates([...LANGS.map(l => [l, surahUrl(l, n)]), ['x-default', surahUrl('ar', n)]]);
    for (const l of LANGS) surahs.push(`<url><loc>${surahUrl(l, n)}</loc><lastmod>${LASTMOD_SEO}</lastmod><priority>0.8</priority>${alts}</url>`);
  }
  const urlset = rows => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${rows.join('\n')}\n</urlset>\n`;
  const index = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>${SITE}/sitemap-pages.xml</loc><lastmod>${LASTMOD_APP}</lastmod></sitemap>
<sitemap><loc>${SITE}/sitemap-surahs.xml</loc><lastmod>${LASTMOD_SEO}</lastmod></sitemap>
</sitemapindex>
`;
  return { index, pages: urlset(pages), surahs: urlset(surahs), count: surahs.length };
}

function llms() {
  const en = ui('en');
  const key = [1, 2, 18, 36, 55, 56, 67, 112];
  const langsLine = LANGS.map(l => `- [${ui(l).label}](${landingUrl(l)}): ${ui(l).landing.h1} — ${l === 'ar' ? 'Arabic text + Tafsir al-Muyassar' : `Arabic text + translation of the meanings by ${TRANSLATOR_EN[l]}`}`).join('\n');
  const keyLines = key.map(n => {
    const s = NAMES[n - 1];
    return `- [Surah ${s.tl}${meaningOf(s, 'en') ? ` (${meaningOf(s, 'en')})` : ''} — سورة ${s.ar}](${surahUrl('en', n)}): ${s.ayahs} ayahs, ${en.place[s.place]}. Markdown: [en](${SITE}${mdPath('en', n)}), [ar](${SITE}${mdPath('ar', n)})`;
  }).join('\n');
  const app = [
    ['/reader', 'Interactive Mushaf: Uthmani text, 16 reciters with ayah highlighting, translations, tafsirs and word meanings. Deep link: /reader?surah={1-114}&ayah={n} (Kufi ayah numbers).'],
    ['/listen', 'Recitations: choose one of 16 reciters, then listen to any surah in full; playback continues across the app and on the lock screen.'],
    ['/tafsir', 'Tafsir ayah by ayah (Tafsir al-Muyassar, Tafsir al-Jalalayn) with the Uthmani text. Deep link: /tafsir?surah={1-114}&ayah={n}&src=ar.muyassar|ar.jalalayn (Kufi ayah numbers).'],
    ['/search', 'Search the Quran without diacritics, by surah name or ayah number (2:255). Query: /search?q={terms}.'],
    ['/prayer-times', 'Prayer times for your city with the official calculation method of your country.'],
    ['/qibla', 'Qibla direction from your location.'],
    ['/adhkar', 'Morning, evening, sleep and after-prayer adhkar.'],
    ['/hifz', 'Memorisation plan, daily portion and revision.'],
    ['/khatma-group', 'Group khatm shared with family and friends.'],
    ['/daily-ayah', 'An ayah of the day with its tafsir.'],
    ['/radio', 'Live Quran radio stations.'],
    ['/ijaza', 'The ten qira’at, ijaza chains and riwaya texts.'],
    ['/docs', 'Feature guide.'],
    ['/help', 'How to use the site.'],
  ].map(([p, d]) => `- [${en.sections[p]}](${SITE}${p}): ${d}`).join('\n');

  const short = `# Nur Al-Quran (نور القرآن)

> Free Quran website and app (no ads, no subscriptions) at ${SITE}: the complete Quran in the Uthmani script (Hafs ʿan ʿĀṣim, King Fahd Complex text), an interactive Mushaf with 16 reciters, translations of the meanings, tafsir, memorisation tools, prayer times, Qibla and adhkar. The interface is available in Arabic, English, Turkish, French, Urdu and Indonesian.

Every surah has a static, readable page per language at \`${SITE}/{lang}/surah/{1-114}/\` (lang = ar, en, tr, fr, ur, id) and a clean Markdown copy at \`${SITE}/{lang}/surah/{1-114}.md\`. Each page gives the full Arabic text ayah by ayah, plus Tafsir al-Muyassar (ar) or a translation of the meanings: Saheeh International (en), Diyanet İşleri (tr), Muhammad Hamidullah (fr), Fateh Muhammad Jalandhry (ur), Kementerian Agama RI (id). Translations convey meanings and are not the Quran itself; quote the Arabic text exactly. Al-Fatiha follows the Madani count (basmala unnumbered, ayah 6/7 split after the first «عليهم»); all other references use the standard Kufi numbering.

## Surah index by language

${langsLine}

## Frequently read surahs

${keyLines}

## App sections

${app}

## Optional

- [Full surah index (all 114 surahs with links)](${SITE}/llms-full.txt)
- [Sitemap](${SITE}/sitemap.xml)
- [Privacy policy](${SITE}/privacy)
- [Terms of use](${SITE}/terms)
`;

  const rows = NAMES.map(s => {
    const f = FACTS[s.n - 1];
    const html = LANGS.map(l => `[${l}](${surahUrl(l, s.n)})`).join(' ');
    const md = LANGS.map(l => `[${l}](${SITE}${mdPath(l, s.n)})`).join(' ');
    return `| ${s.n} | ${s.ar} | ${s.tl} | ${s.meaning.en} | ${s.ayahs} | ${en.place[s.place]} | ${f.juz[0] === f.juz[1] ? f.juz[0] : `${f.juz[0]}–${f.juz[1]}`} | ${f.order} | ${html} | ${md} |`;
  });
  const full = `# Nur Al-Quran (نور القرآن) — surah index

> ${SITE} is a free Quran website and app: the complete Quran in the Uthmani script (Hafs), an interactive Mushaf with 16 reciters, translations of the meanings, tafsir, memorisation, prayer times, Qibla and adhkar, in Arabic, English, Turkish, French, Urdu and Indonesian.

Static pages: \`${SITE}/{lang}/surah/{n}/\`; Markdown: \`${SITE}/{lang}/surah/{n}.md\`; interactive Mushaf: \`${SITE}/reader?surah={n}&ayah=1\`.
Texts under the ayahs: ar = Tafsir al-Muyassar (King Fahd Complex); en = Saheeh International; tr = Diyanet İşleri; fr = Muhammad Hamidullah; ur = Fateh Muhammad Jalandhry; id = Kementerian Agama RI. These are translations/explanations of the meanings, not the Quran itself.
Columns: number, Arabic name, transliteration, meaning of the name, ayahs, Meccan/Medinan, juz, order of revelation (Egyptian standard), HTML pages, Markdown pages.

| # | Name | Transliteration | Meaning | Ayahs | Revelation | Juz | Order | Pages | Markdown |
|---|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}

Total: 114 surahs, 6236 ayahs (Kufi count), 30 juz.
`;
  return { short, full };
}

// ── write everything ────────────────────────────────────────────────────────
let pages = 0, mdCount = 0, bytes = 0;
const headers = ['# Generated by scripts/seo-build.mjs — the HTML page is the canonical URL of each Markdown copy'];
for (const lang of LANGS) {
  await rm(join(DIST, lang), { recursive: true, force: true });
  await mkdir(join(DIST, lang), { recursive: true });
  const land = landingPage(lang);
  await writeFile(join(DIST, lang, 'index.html'), land);
  pages++; bytes += Buffer.byteLength(land);
  for (let n = 1; n <= 114; n++) {
    const { html, md } = surahPage(lang, n);
    const dir = join(DIST, lang, 'surah', String(n));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), html);
    await writeFile(join(DIST, lang, 'surah', `${n}.md`), md);
    pages++; mdCount++; bytes += Buffer.byteLength(html) + Buffer.byteLength(md);
    headers.push(`${mdPath(lang, n)}\n  Content-Type: text/markdown; charset=utf-8\n  X-Content-Type-Options: nosniff\n  Link: <${surahUrl(lang, n)}>; rel="canonical"`);
  }
}
const routeCopies = await appRouteCopies();
const sm = sitemaps();
await writeFile(join(DIST, 'sitemap.xml'), sm.index);
await writeFile(join(DIST, 'sitemap-pages.xml'), sm.pages);
await writeFile(join(DIST, 'sitemap-surahs.xml'), sm.surahs);
const l = llms();
await writeFile(join(DIST, 'llms.txt'), l.short);
await writeFile(join(DIST, 'llms-full.txt'), l.full);
const prevHeaders = existsSync(join(DIST, '_headers')) ? await readFile(join(DIST, '_headers'), 'utf8') : '';
await writeFile(join(DIST, '_headers'), (prevHeaders.includes('seo-build.mjs') ? '' : prevHeaders) + headers.join('\n') + '\n');

console.log(`seo-build: ${pages} HTML pages, ${mdCount} Markdown files (${(bytes / 1048576).toFixed(1)} MB), ${routeCopies} app-route shells, ${sm.count} sitemap URLs; fonts ${copied.length ? `copied: ${copied.join(', ')}` : 'from dist/assets'}; ${((Date.now() - t0) / 1000).toFixed(1)}s`);
