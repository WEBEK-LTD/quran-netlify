#!/usr/bin/env node
// ─── One-off: download the Quran text, translations and tafsir used by the
// static SEO pages, clean them and save them as compact JSON in scripts/seo-data/.
//
// The build (scripts/seo-build.mjs) never touches the network: it only reads the
// files this script writes, which are committed with the repository.
//
//   node scripts/seo-fetch-data.mjs                 # download from GitHub (raw)
//   node scripts/seo-fetch-data.mjs --from <dir>    # use already-downloaded <edition>.json files
//
// Behind a proxy (Node 22+): NODE_USE_ENV_PROXY=1 node scripts/seo-fetch-data.mjs
//
// Sources: https://github.com/fawazahmed0/quran-api (branch "1"), whose editions
// come from Tanzil, the King Fahd Complex (qurancomplex.gov.sa) and QuranEnc.
// Revelation order: quran.com API v4 /chapters data (mirrored on GitHub).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'scripts', 'seo-data');
const RAW = 'https://raw.githubusercontent.com/fawazahmed0/quran-api/1';
const CHAPTERS_URL = 'https://raw.githubusercontent.com/yunusefendi52/quran_app/HEAD/assets/quran-data/chapters/chapters.en.json';

const args = process.argv.slice(2);
const FROM = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;

// edition id → output file and the cleaning it needs
const EDITIONS = [
  { id: 'ara-quranuthmanihaf', file: 'quran-uthmani-hafs.json', kind: 'quran',
    name: 'Uthmani Hafs text (King Fahd Glorious Quran Printing Complex, v13)' },
  { id: 'ara-kingfahadquranc', file: 'tafsir-ar-muyassar.json', kind: 'muyassar',
    name: 'التفسير الميسر (مجمع الملك فهد لطباعة المصحف الشريف)' },
  { id: 'eng-ummmuhammad', file: 'translation-en-saheeh.json', kind: 'plain',
    name: 'Saheeh International (Umm Muhammad)' },
  { id: 'tur-diyanetisleri', file: 'translation-tr-diyanet.json', kind: 'plain',
    name: 'Diyanet İşleri' },
  { id: 'fra-muhammadhamidul', file: 'translation-fr-hamidullah.json', kind: 'plain',
    name: 'Muhammad Hamidullah' },
  { id: 'urd-fatehmuhammadja', file: 'translation-ur-jalandhry.json', kind: 'plain',
    name: 'Fateh Muhammad Jalandhry' },
  { id: 'ind-indonesianislam', file: 'translation-id-kemenag.json', kind: 'kemenag',
    name: 'Kementerian Agama Republik Indonesia (via QuranEnc)' },
];

const INVISIBLE = /[‎‏﻿­]/g;
const TANWEEN = 'ً-ࣰٍ-ࣲ';
const MARKS = 'ً-ٰٟۖ-ࣰۭ-ࣿ';
// The quran-api copy of the Hafs text has a stray space between an open tanween
// and the alef / alef maksura that carries it («هُدࣰ ى» → «هُدࣰى»). The fix only
// joins a lone ا/ى (plus marks) to the word before it; checked against Khaled
// Hosny's Uthmani text: word counts then match in all 6236 ayahs but 3 known
// rasm differences (15:7 لَّوۡمَا, 27:20 مَالِيَ, 36:22 وَمَالِيَ).
const TANWEEN_SPLIT = new RegExp(`([${TANWEEN}][${MARKS}]*) ([اى][${MARKS}]*)(?=\\s|$)`, 'g');

function clean(kind, text) {
  let t = String(text || '').replace(INVISIBLE, '');
  if (kind === 'quran') {
    t = t.replace(TANWEEN_SPLIT, '$1$2');
    t = t.replace(/۞(?=\S)/g, '۞ ');                   // rub el-hizb sign, kept apart from the word
  } else if (kind === 'kemenag') {
    t = t.replace(/(?<![(\d])\s?\d+\)/g, '');           // QuranEnc footnote markers «…kan6)»
    t = t.replace(/[¹²³⁰-⁹]/g, '');
    t = t.replace(/([.,;:!?"])(?=[A-Za-z(])/g, '$1 ');
  } else if (kind === 'muyassar') {
    t = t.replace(/(?<=[ء-ْ])\d+(?=\s)/g, ''); // two stray digits glued to words
    t = t.replace(/\{/g, '﴿').replace(/\}/g, '﴾');      // Quranic quotations
  }
  return t.replace(/\s+/g, ' ').trim();
}

async function getJson(url, local) {
  if (FROM && local && existsSync(join(FROM, local))) return JSON.parse(await readFile(join(FROM, local), 'utf8'));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const meta = JSON.parse(await readFile(join(ROOT, 'scripts', 'seo-data', 'surah-names.json'), 'utf8'));
const AYAHS = meta.surahs.map(s => s.ayahs);

await mkdir(OUT, { recursive: true });
const sources = { fetched: new Date().toISOString().slice(0, 10), editions: {} };

for (const ed of EDITIONS) {
  const url = `${RAW}/editions/${ed.id}.min.json`;
  const data = await getJson(url, `${ed.id}.json`);
  const verses = data.quran || data;
  const out = AYAHS.map(n => new Array(n).fill(null));
  for (const v of verses) out[v.chapter - 1][v.verse - 1] = clean(ed.kind, v.text);
  out.forEach((arr, i) => arr.forEach((t, j) => {
    if (!t) throw new Error(`${ed.id}: missing ${i + 1}:${j + 1}`);
  }));
  const json = JSON.stringify(out);
  await writeFile(join(OUT, ed.file), json + '\n');
  sources.editions[ed.file] = { edition: ed.id, name: ed.name, url };
  console.log(`${ed.file.padEnd(32)} ${(Buffer.byteLength(json) / 1024).toFixed(0).padStart(6)} KB`);
}

// Surah facts: juz range, Madinah-mushaf pages and sajda ayahs from quran-api's
// info.json; revelation order from quran.com's chapter data.
const info = await getJson(`${RAW}/info.json`, 'info.json');
const chapters = (await getJson(CHAPTERS_URL, 'chapters.en.json')).chapters;
const facts = info.chapters.map((c, i) => {
  const vs = c.verses;
  const qc = chapters[i];
  if (qc.id !== i + 1 || qc.verses_count !== vs.length) throw new Error(`chapter data mismatch at ${i + 1}`);
  return {
    n: i + 1,
    place: qc.revelation_place === 'madinah' ? 'madinah' : 'makkah',
    order: qc.revelation_order,
    juz: [vs[0].juz, vs[vs.length - 1].juz],
    pages: [vs[0].page, vs[vs.length - 1].page],
    sajda: vs.filter(v => v.sajda).map(v => v.verse),
  };
});
await writeFile(join(OUT, 'surah-facts.json'), JSON.stringify(facts) + '\n');
sources.facts = { info: `${RAW}/info.json`, revelationOrder: CHAPTERS_URL };
await writeFile(join(OUT, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
console.log('surah-facts.json, sources.json written');
