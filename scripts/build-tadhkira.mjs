// ─── Build the data for «تذكرة من كتاب الله لقلبك اليوم» ─────────────────────
// Reads the curated references in src/tadhkira/ayat.js and writes:
//   src/tadhkira/ayat-data.json      the Uthmani text of each entry (verified
//                                    King Fahd Complex Hafs text, Kufi numbering)
//   src/tadhkira/meaning-<lang>.json the translation of the meanings, one per UI language
// so the browser never loads the whole Quran. Run after editing the list:
//   node scripts/build-tadhkira.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AYAT, THEMES, parseRef } from '../src/tadhkira/ayat.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'scripts', 'seo-data');
const OUT = join(ROOT, 'src', 'tadhkira');
const load = async f => JSON.parse(await readFile(join(DATA, f), 'utf8'));

const MEANINGS = {
  en: { file: 'translation-en-saheeh.json', label: 'Saheeh International' },
  tr: { file: 'translation-tr-diyanet.json', label: 'Diyanet İşleri' },
  fr: { file: 'translation-fr-hamidullah.json', label: 'Muhammad Hamidullah' },
  ur: { file: 'translation-ur-jalandhry.json', label: 'فتح محمد جالندھری' },
  id: { file: 'translation-id-kemenag.json', label: 'Kementerian Agama RI' },
};

// Cuts. Arabic (`from` / `to` at the top level) is cut on whole words of the
// verified text: `from` keeps the first ayah from that phrase on, `to` keeps the
// last ayah up to the end of that phrase. Each language has its own cut on exact
// substrings of its translation (`from`, `to`, `pre` / `add` a quote mark, `drop`
// [substring, replacement] pairs). A ref with an Arabic cut needs all five.
const PARTS = {
  // Diyanet joins several ayat into one sentence and repeats it on each of
  // them; these keep only the words that render the ayat shown.
  '15:49': { tr: { drop: [[', azabımın can yakıcı bir azap olduğunu', '']] } },
  '85:14': { tr: { from: 'çok seven' } },
  '42:25': { tr: { drop: [[', inanıp yararlı işler işleyenlerin duasını kabul eden, lütfuyla onların ecrini arttıran', '']], to: "O'dur." } },
  '7:156': { tr: { pre: '"', drop: [[", yanlarındaki Tevrat ve İncil'de yazılı buldukları, okuyup yazması olmayan peygambere uyanlara", ' …']], to: 'yazacağız.', add: '"' } },
  '15:56': { tr: { to: 'umudunu keser!' } },
  '18:30': { tr: { to: 'zayi etmeyiz.' } },
  '17:9': { tr: { drop: [[', ahirete inanmayanlara can yakıcı bir azap hazırladığımızı', '']] } },
  '41:30': { tr: { pre: '"', drop: [[', biz dünya hayatında da, ahirette de size dostuz. Burada, canlarınızın çektiği, umduğunuz şeyler, bağışlayan ve acıyan Allah katından bir ziyafet olarak size sunulur', '']] } },
  '11:56': { tr: { from: 'Ben, ancak benim de', to: 'doğru yoldadır.' } },
  '3:16': { tr: { from: '"Rabbimiz!', to: 'koru"' } },
  '20:25-26': { tr: { to: 'işimi kolaylaştır', add: '"' } },
  '32:16-17': { tr: { from: 'vücudlarını yataklardan', drop: [[' inanır', '']] } },
  '13:24': { tr: { from: 'Sabretmenize', to: 'sonucudur!' } },
  '7:126': { tr: { from: 'Rabbimizin ayetleri', to: 'müslim olarak al' } },
  '2:45': { tr: { drop: [['Rablerine kavuşacaklarını ve Ona döneceklerini umanlar ve ', '']] } },
  '26:217-219': { tr: { to: "Allah'a güven." } },
  '26:78-82': { tr: { from: 'Beni yaratan da', to: "umduğum O'dur." } },

  // Long ayat shown in part: only the hopeful clause.
  '2:222': {
    from: 'إن الله يحب التوبين',
    en: { from: 'Indeed, Allah loves' }, tr: { from: 'Allah şüphesiz daima tevbe' }, fr: { from: 'Allah aime ceux qui se repentent' },
    ur: { from: 'کچھ شک نہیں کہ خدا توبہ' }, id: { from: 'Sungguh, Allah menyukai' },
  },
  '24:31': {
    from: 'وتوبوا إلى الله جميعا',
    en: { from: 'And turn to Allah in repentance' }, tr: { from: 'Ey inananlar! Saadete' }, fr: { from: 'Et repentez-vous tous' },
    ur: { from: 'اور مومنو! سب خدا' }, id: { from: 'Dan bertobatlah kamu semua' },
  },
  '65:2-3': {
    from: 'ومن يتق الله يجعل',
    en: { from: 'And whoever fears Allah' }, tr: { from: 'Allah, kendisine karşı gelmekten' }, fr: { from: 'Et quiconque craint Allah' },
    ur: { from: 'اور جو کوئی خدا سے ڈرے گا' }, id: { from: 'Barangsiapa bertakwa' },
  },
  '3:159': {
    from: 'فإذا عزمت فتوكل',
    en: { from: 'And when you have decided' }, tr: { from: 'karar verdin mi' }, fr: { from: "une fois que tu t'es décidé" },
    ur: { from: 'اور جب (کسی کام کا) عزم' }, id: { from: 'Kemudian, apabila engkau' },
  },
  '2:216': {
    from: 'وعسى أن تكرهوا',
    en: { from: 'perhaps you hate a thing' }, tr: { from: 'İhtimal ki hoşlanmadığınız' }, fr: { from: "il se peut que vous ayez de l'aversion" },
    ur: { from: 'عجب نہیں کہ ایک چیز تم کو بری لگے' }, id: { from: 'boleh jadi kamu tidak menyenangi' },
  },
  '40:60': {
    to: 'ادعوني أستجب لكم',
    en: { to: 'I will respond to you."' }, tr: { to: 'icabet edeyim.', add: '"' }, fr: { to: 'Je vous répondrai.', add: '»' },
    ur: { to: 'قبول کروں گا۔' }, id: { to: 'Aku perkenankan bagimu.', add: '"' },
  },
};

const tidy = s => s.replace(/^\s*[۞۩]\s*/, '').replace(/\s*۩\s*$/, '').trim();

// Arabic cut points are written as plain words and matched on a letter
// skeleton (no diacritics, Quranic marks, alif or hamza), word by word, so the
// cut always falls between two words of the verified text.
const skel = w => w
  .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g, '')
  .replace(/[اأإآٱءؤئ]/g, '').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
function findWords(words, phrase, where) {
  const want = phrase.split(/\s+/).map(skel);
  for (let i = 0; i + want.length <= words.length; i++) {
    if (want.every((w, k) => skel(words[i + k]) === w)) return i;
  }
  throw new Error(`${where}: «${phrase}» not found`);
}
function cutArabic(text, spec, where) {
  let words = text.split(' ');
  if (spec.from) words = words.slice(findWords(words, spec.from, where));
  if (spec.to) {
    const n = spec.to.split(/\s+/).length;
    words = words.slice(0, findWords(words, spec.to, where) + n);
    words[words.length - 1] = words[words.length - 1].replace(/[\u06D6-\u06DC]+$/, '');   // no pause sign at the cut
  }
  return words.join(' ');
}

function cut(text, spec, where) {
  let t = text;
  for (const [what, by] of spec?.drop || []) {
    if (!t.includes(what)) throw new Error(`${where}: «${what}» not found`);
    t = t.replace(what, by);
  }
  if (spec?.from) {
    const i = t.indexOf(spec.from);
    if (i < 0) throw new Error(`${where}: «${spec.from}» not found`);
    t = t.slice(i);
  }
  if (spec?.to) {
    const i = t.indexOf(spec.to);
    if (i < 0) throw new Error(`${where}: «${spec.to}» not found`);
    t = t.slice(0, i + spec.to.length) + (spec.add || '');
  }
  return t;
}

const quran = await load('quran-uthmani-hafs.json');
if (quran.length !== 114) throw new Error('quran: expected 114 surahs');

const seen = new Set();
const items = AYAT.map(([ref, theme]) => {
  if (seen.has(ref)) throw new Error(`duplicate ${ref}`);
  seen.add(ref);
  if (!THEMES[theme]) throw new Error(`${ref}: unknown theme ${theme}`);
  const { s, a, b } = parseRef(ref);
  if (s === 1) throw new Error(`${ref}: Al-Fatiha is not used (Madani numbering)`);
  const sura = quran[s - 1];
  if (!sura || a < 1 || b < a || b > sura.length) throw new Error(`${ref}: out of range`);
  const part = PARTS[ref] || {};
  const seg = [];
  for (let n = a; n <= b; n++) {
    let t = tidy(sura[n - 1]);
    let whole = true;
    if (n === a && part.from) t = cutArabic(t, { from: part.from }, ref);
    if (n === b && part.to) { t = cutArabic(t, { to: part.to }, ref); whole = false; }
    seg.push(whole ? [n, t] : [n, t, 0]);        // [ayah, text, 0 = ends mid-ayah (no marker)]
  }
  return part.from || part.to ? { ref, seg, part: 1 } : { ref, seg };   // part: shown in part
});
for (const r of Object.keys(PARTS)) if (!seen.has(r)) throw new Error(`PARTS ${r} is not in the list`);

await writeFile(join(OUT, 'ayat-data.json'), JSON.stringify({
  source: 'Uthmani Hafs text, King Fahd Glorious Quran Printing Complex (scripts/seo-data/quran-uthmani-hafs.json)',
  items,
}) + '\n');

// Meanings: per entry a list of [ayah label, text]; ayat that the edition
// renders with one joined text become one item labelled "a-b".
for (const [lang, { file, label }] of Object.entries(MEANINGS)) {
  const tr = await load(file);
  const t = AYAT.map(([ref]) => {
    const { s, a, b } = parseRef(ref);
    const parts = [];
    for (let n = a; n <= b; n++) {
      const x = String(tr[s - 1][n - 1] || '').trim();
      if (!x) throw new Error(`${lang} ${ref}: empty translation`);
      const last = parts[parts.length - 1];
      if (last && last.text === x && !(lang === 'fr' && s === 94)) last.to = n;   // Hamidullah renders 94:5 and 94:6 alike
      else parts.push({ from: n, to: n, text: x });
    }
    const part = PARTS[ref];
    const spec = part?.[lang];
    if (part && (part.from || part.to) && !spec) throw new Error(`${lang} ${ref}: missing cut`);
    if (spec) {
      const first = parts[0], last = parts[parts.length - 1];
      if (spec.drop) for (const p of parts) if (spec.drop.some(([w]) => p.text.includes(w))) p.text = cut(p.text, { drop: spec.drop }, `${lang} ${ref}`);
      if (spec.from) first.text = cut(first.text, { from: spec.from }, `${lang} ${ref}`);
      if (spec.pre) first.text = spec.pre + first.text;
      if (spec.to) last.text = cut(last.text, { to: spec.to, add: spec.add }, `${lang} ${ref}`);
    }
    return parts.map(p => {
      let x = p.text;
      if (x.endsWith('»') && !x.includes('«')) x = x.slice(0, -1);    // a quote opened in an earlier ayah
      if (x.startsWith('(') && (x.match(/\(/g) || []).length > (x.match(/\)/g) || []).length) x = x.slice(1);   // stray bracket in the source
      if (lang !== 'ur') x = x.charAt(0).toLocaleUpperCase(lang) + x.slice(1);
      return [p.from === p.to ? String(p.from) : `${p.from}-${p.to}`, x];
    });
  });
  await writeFile(join(OUT, `meaning-${lang}.json`), JSON.stringify({ label, t }) + '\n');
}

console.log(`tadhkira: ${items.length} entries, ${items.reduce((n, i) => n + i.seg.length, 0)} ayat`);
