// ─── Today's reminder: which ref, is it opened, and its text ─────────────────
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getVisitorId, addBookmark, removeBookmark, errorMessage } from '../backend';
import { getGlobal, setGlobal } from '../store';
import { coreTrNow } from '../locales/core';
import { num, surahName } from '../l10n';
import { AYAT, THEMES, parseRef } from './ayat';
import { localDateKey, openedToday, markOpened, pickRef } from './select';

// The person's seed: the account when signed in (same ayah on every device),
// else this browser's anonymous visitor id.
export function seedFor(user) {
  return user && user.id ? `u:${user.id}` : getVisitorId();
}

// Local date, refreshed at midnight and when the tab comes back.
function useToday() {
  const [key, setKey] = useState(localDateKey);
  useEffect(() => {
    const check = () => setKey(k => { const n = localDateKey(); return n === k ? k : n; });
    const now = new Date();
    const t = setTimeout(check, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2) - now);
    const vis = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', vis);
    return () => { clearTimeout(t); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', vis); };
  }, [key]);
  return key;
}

export function useTadhkira() {
  const { user, loading } = useAuth();
  const dateKey = useToday();
  const [openedRef, setOpenedRef] = useState(() => openedToday(dateKey));
  useEffect(() => { setOpenedRef(openedToday(dateKey)); }, [dateKey]);
  const ref = openedRef || pickRef(seedFor(user), dateKey);
  const theme = (AYAT.find(([r]) => r === ref) || [])[1];
  const open = useCallback(() => { markOpened(ref, dateKey); setOpenedRef(ref); }, [ref, dateKey]);
  return { ref, theme, themeName: THEMES[theme] || '', opened: !!openedRef, open, dateKey, ready: !loading };
}

// ── data (lazy chunks, so the home page stays light) ──
let dataP = null;
const meaningP = {};
export const MEANING_LANGS = ['en', 'tr', 'fr', 'ur', 'id'];
function loadData() {
  if (!dataP) dataP = import('./ayat-data.json').then(m => m.default || m).catch(e => { dataP = null; throw e; });
  return dataP;
}
function loadMeaning(lang) {
  if (!MEANING_LANGS.includes(lang)) return Promise.resolve(null);
  if (!meaningP[lang]) meaningP[lang] = import(`./meaning-${lang}.json`).then(m => m.default || m).catch(e => { meaningP[lang] = null; throw e; });
  return meaningP[lang];
}

// { entry: { ref, seg: [[ayah, text, 0?]], part? }, meaning: { label, parts: [[label, text]] } | null }
export function useTadhkiraEntry(ref, lang) {
  const [st, setSt] = useState({ entry: null, meaning: null, error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setSt(s => (s.entry && s.entry.ref === ref ? { ...s, error: false } : { entry: null, meaning: null, error: false }));
    const i = AYAT.findIndex(([r]) => r === ref);
    Promise.all([loadData(), loadMeaning(lang).catch(() => null)]).then(([d, m]) => {
      if (!alive) return;
      const entry = d.items[i] && d.items[i].ref === ref ? d.items[i] : d.items.find(x => x.ref === ref);
      if (!entry) throw new Error('missing');
      setSt({ entry, meaning: m ? { label: m.label, parts: m.t[i] || [] } : null, error: false });
    }).catch(() => { if (alive) setSt({ entry: null, meaning: null, error: true }); });
    return () => { alive = false; };
  }, [ref, lang, attempt]);
  return { ...st, retry: () => setAttempt(n => n + 1) };
}

// Plain text of an entry for sharing: ayat joined with their numbers.
const AR = '٠١٢٣٤٥٦٧٨٩';
export const arDigits = n => String(n).replace(/\d/g, d => AR[d]);
export function entryText(entry) {
  if (!entry) return '';
  return entry.seg.map(([n, t], k) => (k < entry.seg.length - 1 ? `${t} (${arDigits(n)})` : t)).join(' ');
}

// ── favorites: the reader's own way (nq_bookmarks + the account when signed in) ──
export function refAyat(ref) {
  const { s, a, b } = parseRef(ref);
  return Array.from({ length: b - a + 1 }, (_, k) => ({ surah: s, ayah: a + k }));
}
export function isSaved(bookmarks, ref) {
  return refAyat(ref).every(x => (bookmarks || []).some(b => b.surah === x.surah && b.ayah === x.ayah));
}
export function toggleSaved(ref, user) {
  const list = getGlobal().bookmarks || [];
  const ayat = refAyat(ref);
  const saved = isSaved(list, ref);
  const has = x => list.some(b => b.surah === x.surah && b.ayah === x.ayah);
  const next = saved
    ? list.filter(b => !ayat.some(x => x.surah === b.surah && x.ayah === b.ayah))
    : [...list, ...ayat.filter(x => !has(x))];
  setGlobal({ bookmarks: next, toast: saved ? coreTrNow('تم الحذف من المفضلة') : coreTrNow('تم الحفظ في المفضلة') });
  try { localStorage.setItem('nq_bookmarks', JSON.stringify(next)); } catch {}
  if (user) {
    const changed = saved ? ayat : ayat.filter(x => !has(x));
    (async () => {
      try {
        let res = null;
        for (const x of changed) res = saved ? await removeBookmark(x.surah, x.ayah) : await addBookmark(x.surah, x.ayah);
        if (res) { setGlobal({ bookmarks: res }); try { localStorage.setItem('nq_bookmarks', JSON.stringify(res)); } catch {} }
      } catch (e) {
        setGlobal({ toast: errorMessage(e, coreTrNow('تعذّرت مزامنة المفضلة مع حسابك')) + coreTrNow(' — حُفظ التغيير على هذا الجهاز') });
      }
    })();
  }
  return !saved;
}

// "سورة الشرح · الآيتان ٥–٦" in the visitor's language (tr = tadTr(useTr())).
export function refLabel(tr, ref, part) {
  const { s, a, b } = parseRef(ref);
  const name = surahName(s);
  if (a === b) return tr(part ? 'سورة {name} · من الآية {n}' : 'سورة {name} · الآية {n}', { name, n: num(a) });
  return tr(b === a + 1 ? 'سورة {name} · الآيتان {a}–{b}' : 'سورة {name} · الآيات {a}–{b}', { name, a: num(a), b: num(b) });
}
