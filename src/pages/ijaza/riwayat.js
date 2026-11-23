// ─── The ten imams and their twenty rawis ────────────────────────────────────
// Every Arabic field (except reciter names, which come from mp3quran) is a
// source string translated at render time via src/locales/library.js.
//
// textEdition: a King Fahd Complex text published by fawazahmed0/quran-api
//   (null = no public digital text of this riwaya exists yet → the Hafs text is
//   shown, with a notice).
// audioId: key into GET /v1/riwayat/audio → data.rawis (mp3quran.net recordings).

export const HAFS_EDITION = 'ara-quranuthmanihaf';

export const IMAMS = [
  { id: 'nafi',     n: 1,  name: 'نافع المدني',     city: 'المدينة المنورة', died: 169, rawis: ['qalun', 'warsh'] },
  { id: 'ibnkathir', n: 2, name: 'ابن كثير المكي',  city: 'مكة المكرمة',     died: 120, rawis: ['bazzi', 'qunbul'] },
  { id: 'abuamr',   n: 3,  name: 'أبو عمرو البصري', city: 'البصرة',          died: 154, rawis: ['duri_abuamr', 'susi'] },
  { id: 'ibnamir',  n: 4,  name: 'ابن عامر الشامي', city: 'دمشق',            died: 118, rawis: ['hisham', 'ibndhakwan'] },
  { id: 'asim',     n: 5,  name: 'عاصم الكوفي',     city: 'الكوفة',          died: 127, rawis: ['shuba', 'hafs'] },
  { id: 'hamza',    n: 6,  name: 'حمزة الكوفي',     city: 'الكوفة',          died: 156, rawis: ['khalaf_hamza', 'khallad'] },
  { id: 'kisai',    n: 7,  name: 'الكسائي الكوفي',  city: 'الكوفة',          died: 189, rawis: ['abulharith', 'duri_kisai'] },
  { id: 'abujafar', n: 8,  name: 'أبو جعفر المدني', city: 'المدينة المنورة', died: 130, rawis: ['ibnwardan', 'ibnjammaz'] },
  { id: 'yaqub',    n: 9,  name: 'يعقوب الحضرمي',   city: 'البصرة',          died: 205, rawis: ['ruways', 'rawh'] },
  { id: 'khalaf',   n: 10, name: 'خلف العاشر',      city: 'بغداد',           died: 229, rawis: ['ishaq', 'idris'] },
];

const R = (id, imam, name, full, region, desc, textEdition) => ({ id, imam, name, full, region, desc, textEdition, audioId: id });

export const RAWIS = [
  R('qalun',        'nafi',      'قالون',      'رواية قالون عن نافع',         'المدينة',     'المنتشرة في ليبيا وجزء من تونس',                       'ara-quranqaloon'),
  R('warsh',        'nafi',      'ورش',        'رواية ورش عن نافع',           'المدينة',     'المنتشرة في المغرب والجزائر وتونس وغرب أفريقيا',      'ara-quranwarsh'),
  R('bazzi',        'ibnkathir', 'البزّي',     'رواية البزي عن ابن كثير',     'مكة المكرمة', 'قراءة أهل مكة، وراويها البزّي مؤذّن المسجد الحرام',     'ara-quranbazzi'),
  R('qunbul',       'ibnkathir', 'قنبل',       'رواية قنبل عن ابن كثير',      'مكة المكرمة', 'الرواية الثانية عن ابن كثير، وقنبل شيخ القرّاء بمكة في زمانه', 'ara-quranqumbul'),
  R('duri_abuamr',  'abuamr',    'الدوري',     'رواية الدوري عن أبي عمرو',    'البصرة',      'قراءة أهل البصرة، منتشرة في السودان وأجزاء من أفريقيا', 'ara-qurandoori'),
  R('susi',         'abuamr',    'السوسي',     'رواية السوسي عن أبي عمرو',    'البصرة',      'الرواية الثانية عن أبي عمرو، ويُنسب إليها الإدغام الكبير', 'ara-quransoosi'),
  R('hisham',       'ibnamir',   'هشام',       'رواية هشام عن ابن عامر',      'الشام',       'قراءة أهل الشام، وراويها هشام خطيب دمشق',             null),
  R('ibndhakwan',   'ibnamir',   'ابن ذكوان',  'رواية ابن ذكوان عن ابن عامر', 'الشام',       'الرواية الثانية عن ابن عامر، وراويها إمام جامع دمشق',  null),
  R('shuba',        'asim',      'شعبة',       'رواية شعبة عن عاصم',          'الكوفة',      'الرواية الثانية عن الإمام عاصم الكوفي',                'ara-quranshouba'),
  R('hafs',         'asim',      'حفص',        'رواية حفص عن عاصم',           'الكوفة',      'أكثر القراءات انتشاراً في العالم الإسلامي اليوم',       HAFS_EDITION),
  R('khalaf_hamza', 'hamza',     'خلف',        'رواية خلف عن حمزة',           'الكوفة',      'إحدى القراءات الكوفية المعروفة بالمدّ والإمالة',        null),
  R('khallad',      'hamza',     'خلّاد',      'رواية خلاد عن حمزة',          'الكوفة',      'الرواية الثانية عن حمزة الكوفي',                       null),
  R('abulharith',   'kisai',     'أبو الحارث', 'رواية أبي الحارث عن الكسائي', 'الكوفة',      'قراءة إمام النحو والقراءة الكسائي',                    null),
  R('duri_kisai',   'kisai',     'الدوري',     'رواية الدوري عن الكسائي',     'الكوفة',      'رواها الدوري نفسه الذي روى عن أبي عمرو',               null),
  R('ibnwardan',    'abujafar',  'ابن وردان',  'رواية ابن وردان عن أبي جعفر', 'المدينة',     'قراءة أبي جعفر المدني، من شيوخ الإمام نافع',            null),
  R('ibnjammaz',    'abujafar',  'ابن جمّاز',  'رواية ابن جماز عن أبي جعفر',  'المدينة',     'الرواية الثانية عن أبي جعفر المدني',                   null),
  R('ruways',       'yaqub',     'رُويس',      'رواية رويس عن يعقوب',         'البصرة',      'قراءة يعقوب الحضرمي، إمام أهل البصرة بعد أبي عمرو',     null),
  R('rawh',         'yaqub',     'روح',        'رواية روح عن يعقوب',          'البصرة',      'الرواية الثانية عن يعقوب الحضرمي',                     null),
  R('ishaq',        'khalaf',    'إسحاق',      'رواية إسحاق عن خلف العاشر',   'بغداد',       'قراءة خلف العاشر، وهو نفسه راوي حمزة',                  null),
  R('idris',        'khalaf',    'إدريس',      'رواية إدريس عن خلف العاشر',   'بغداد',       'الرواية الثانية عن خلف العاشر',                        null),
];

export const RAWI_BY_ID = Object.fromEntries(RAWIS.map(r => [r.id, r]));
export const IMAM_BY_ID = Object.fromEntries(IMAMS.map(i => [i.id, i]));
export const rawi = id => RAWI_BY_ID[id] || RAWI_BY_ID.hafs;
export const isHafs = r => r.id === 'hafs';
export const hasText = r => !!r.textEdition;

// The basmala as each edition writes it (al-Fatiha 1:1 of the same text), shown
// above every surah but al-Fatiha and at-Tawba.
export const BASMALA = {
  'ara-quranuthmanihaf': 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ',
  'ara-quranshouba':     'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ',
  'ara-quranbazzi':      'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ',
  'ara-quranqumbul':     'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ',
  'ara-quranwarsh':      'بِسْمِ اِ۬للَّهِ اِ۬لرَّحْمَٰنِ اِ۬لرَّحِيمِ',
  'ara-quranqaloon':     'بِسْمِ اِ۬للَّهِ اِ۬لرَّحْمَٰنِ اِ۬لرَّحِيمِ',
  'ara-qurandoori':      'بِسۡمِ اِ۬للَّهِ اِ۬لرَّحۡمَٰنِ اِ۬لرَّحِيمِ',
  'ara-quransoosi':      'بِسۡمِ اِ۬للَّهِ اِ۬لرَّحۡمَٰنِ اِ۬لرَّحِيمِ',
};

// Warsh and Qalun (Maghribi dabt) use ے (U+06D2), which Amiri Quran lacks;
// Amiri has it and every other mark these texts use.
export const MAGHRIBI_EDITIONS = new Set(['ara-quranwarsh', 'ara-quranqaloon']);
