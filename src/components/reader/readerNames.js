// ─── Reciter names for the visitor's language ───────────────────────────────
// READERS (src/data.js) carries Arabic names only. Arabic and Urdu readers see
// the Arabic name; everyone else sees a Latin transliteration.
import { READERS } from '../../data';
import { getLang } from '../../i18n';
import { isRtl } from '../../l10n';

const LATIN = {
  'Abdul_Basit_Murattal_192kbps':   'Abdul Basit — Murattal',
  'Abdul_Basit_Mujawwad_128kbps':   'Abdul Basit — Mujawwad',
  'Husary_128kbps':                 'Mahmoud Khalil Al-Husary',
  'Husary_Muallim_128kbps':         'Al-Husary — Muallim',
  'Minshawy_Murattal_128kbps':      'Mohamed Siddiq Al-Minshawi',
  'Mohammad_al_Tablaway_128kbps':   'Mohamed Al-Tablawi',
  'Muhammad_Jibreel_128kbps':       'Muhammad Jibreel',
  'Abdurrahmaan_As-Sudais_192kbps': 'Abdul Rahman Al-Sudais',
  'MaherAlMuaiqly128kbps':          'Maher Al-Muaiqly',
  'Yasser_Ad-Dussary_128kbps':      'Yasser Al-Dosari',
  'Hani_Rifai_192kbps':             'Hani Ar-Rifai',
  'Saood_ash-Shuraym_128kbps':      "Saud Al-Shuraim",
  'Abu_Bakr_Ash-Shaatree_128kbps':  'Abu Bakr Al-Shatri',
  'Ghamadi_40kbps':                 'Saad Al-Ghamdi',
  'Alafasy_128kbps':                'Mishary Rashid Alafasy',
  'Nasser_Alqatami_128kbps':        'Nasser Al-Qatami',
};

// Full name ("Abdul Basit — Murattal").
export function readerName(r, lang = getLang()) {
  if (!r) return '';
  if (isRtl(lang)) return r.name;
  return LATIN[r.id] || r.latin || r.name;
}

// Short name for tight spaces (drops the "— style" suffix).
export function readerShortName(r, lang = getLang()) {
  return readerName(r, lang).split(/\s+—\s+/)[0];
}

export function readerById(id) {
  return READERS.find(r => r.id === id) || null;
}
