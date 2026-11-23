// ─── /tafsir «التفسير»: one ayah and its tafsir, in a calm reading layout ────
// /tafsir?surah=2&ayah=255&src=ar.jalalayn (Kufi ayah numbers, as everywhere).
// The surah text and the chosen tafsir are fetched once per surah (and kept), so
// moving to the next / previous ayah is instant. Sources: the two editions the
// reader's tafsir panel uses (alquran.cloud).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SURAHS_META } from '../data';
import { getGlobal, setGlobal } from '../store';
import { fetchSurahAyahs, cachedSurahAyahs, fetchSurahTafsir, cachedSurahTafsir } from '../api';
import { Icon, AyahMark, Badge8, Divider, toAr } from '../components/ornaments/Ornaments';
import { displayNumber, stripBasmala, BASMALA_TEXT, juzRange } from '../components/reader/ayahItems';
import { preconnectAudio } from '../audio/offline';
import { useTr, num, surahName, revelationLabel } from '../l10n';
import { quranTr, quranTrNow } from '../locales/quran';
import styles from './TafsirPage.module.css';

export const TAFSIR_SOURCES = [
  { id: 'ar.muyassar', name: 'التفسير الميسّر', short: 'الميسّر' },
  { id: 'ar.jalalayn', name: 'تفسير الجلالين', short: 'الجلالين' },
];
const SRC_KEY = 'nq_tafsir_src';
const srcOk = id => TAFSIR_SOURCES.some(s => s.id === id);
const readSrc = () => { try { const v = localStorage.getItem(SRC_KEY); return srcOk(v) ? v : 'ar.muyassar'; } catch { return 'ar.muyassar'; } };
const count = s => SURAHS_META[s - 1][2];
const clampAyah = (s, a) => Math.max(1, Math.min(count(s), a || 1));

// Ayah label as the mushaf shows it (Al-Fatiha: Madani count, Kufi 1 = the basmala).
function ayahLabel(tr, s, k) {
  const d = displayNumber(s, k);
  if (d === null) return tr('البسملة');
  return typeof d === 'string' ? tr('الآيتان {n}', { n: toAr(d) }) : tr('الآية {n}', { n: toAr(d) });
}

// One surah's text + tafsir (cached in src/api.js), for the chosen source.
function useSurahData(surah, src, reloadKey) {
  const pick = () => ({ text: cachedSurahAyahs(surah), tafsir: cachedSurahTafsir(surah, src) });
  const [data, setData] = useState(pick);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const now = pick();
    setData(now);
    setError(false);
    if (now.text && now.tafsir) return undefined;
    Promise.all([fetchSurahAyahs(surah), fetchSurahTafsir(surah, src)])
      .then(([text, tafsir]) => { if (alive) setData({ text, tafsir }); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah, src, reloadKey]);
  return { ...data, error };
}

export default function TafsirPage() {
  const tr = quranTr(useTr());
  const [params, setParams] = useSearchParams();

  // where to start: the link, else the last ayah read in the mushaf
  const g = getGlobal();
  const qs = parseInt(params.get('surah'), 10);
  const surah = qs >= 1 && qs <= 114 ? qs : g.currentSurah || 1;
  const ayah = clampAyah(surah, parseInt(params.get('ayah'), 10) || (qs ? 1 : g.currentAyah));
  const src = srcOk(params.get('src')) ? params.get('src') : readSrc();
  const [reloadKey, setReloadKey] = useState(0);
  const { text, tafsir, error } = useSurahData(surah, src, reloadKey);

  const go = useCallback((s, a, nextSrc = src) => {
    const p = { surah: String(s), ayah: String(clampAyah(s, a)) };
    if (nextSrc !== 'ar.muyassar') p.src = nextSrc;
    setParams(p, { replace: true });
  }, [setParams, src]);

  // keep the URL explicit (shareable) from the first render
  useEffect(() => {
    if (params.get('surah') !== String(surah) || params.get('ayah') !== String(ayah)) go(surah, ayah);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { preconnectAudio(); }, []);

  // near the end of a surah, warm the next one
  useEffect(() => {
    if (surah < 114 && ayah >= count(surah) - 1) {
      fetchSurahAyahs(surah + 1).catch(() => {});
      fetchSurahTafsir(surah + 1, src).catch(() => {});
    }
  }, [surah, ayah, src]);

  const first = surah === 1 && ayah === 1;
  const last = surah === 114 && ayah === count(114);
  const prev = () => (ayah > 1 ? go(surah, ayah - 1) : surah > 1 && go(surah - 1, count(surah - 1)));
  const next = () => (ayah < count(surah) ? go(surah, ayah + 1) : surah < 114 && go(surah + 1, 1));

  // ← / → move between ayahs (mirrored in RTL), unless typing or in a control
  useEffect(() => {
    function onKey(e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target instanceof Element ? e.target : null;
      if (t && t.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="group"]')) return;
      const rtl = document.documentElement.dir === 'rtl';
      const forward = (e.key === 'ArrowLeft') === rtl;
      e.preventDefault();
      if (forward) { if (!last) next(); } else if (!first) prev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // scroll back to the ayah card when the ayah changes (not on first load)
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) { moved.current = true; return; }
    const el = document.getElementById('nq-tafsir-ayah');
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah, ayah]);

  const ayahText = useMemo(() => {
    if (!text) return null;
    const a = text.find(x => x.number === ayah);
    if (!a) return '';
    return ayah === 1 && surah !== 1 && surah !== 9 ? stripBasmala(a.text) : a.text;
  }, [text, surah, ayah]);
  const tafsirText = useMemo(() => {
    if (!tafsir) return null;
    const t = tafsir.find(x => x.number === ayah);
    return t ? String(t.tafsir || '').trim() : '';
  }, [tafsir, ayah]);

  const meta = SURAHS_META[surah - 1];
  const sName = surahName(surah);
  const label = ayahLabel(tr, surah, ayah);
  const shown = displayNumber(surah, ayah);
  const srcObj = TAFSIR_SOURCES.find(s => s.id === src);
  const [j1] = juzRange(surah);

  const ayahOptions = useMemo(() => {
    const out = [];
    for (let k = 1; k <= count(surah); k++) out.push(<option key={k} value={k}>{ayahLabel(tr, surah, k)}</option>);
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah, tr.lang]);
  const surahOptions = useMemo(() => SURAHS_META.map((m, i) => (
    <option key={i + 1} value={i + 1}>{`${num(i + 1)}. ${surahName(i + 1)}`}</option>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  )), [tr.lang]);

  function chooseSrc(id) {
    try { localStorage.setItem(SRC_KEY, id); } catch {}
    go(surah, ayah, id);
  }

  function listen() {
    setGlobal({ audioAyah: ayah, playSurah: surah, showAudio: true, playTrigger: Date.now() });
  }

  function copy() {
    if (!ayahText || !tafsirText) return;
    const ref = shown === null ? 'البسملة' : `الآية ${String(shown).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d])}`;
    const body = `${ayahText}\n\n${srcObj.name}:\n${tafsirText}\n\n— سورة ${meta[0]}، ${ref}`;
    navigator.clipboard.writeText(body)
      .then(() => setGlobal({ toast: quranTrNow('تم نسخ الآية والتفسير') }))
      .catch(() => setGlobal({ toast: quranTrNow('تعذّر النسخ') }));
  }

  const loading = !error && (ayahText === null || tafsirText === null);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={`nq-wrap ${styles.headIn}`}>
          <span className="nq-eyebrow">{tr('التفسير')}</span>
          <h1>{tr('سورة {name}', { name: sName })} <span>· {label}</span></h1>
          <small>{revelationLabel(meta[3])} · {tr('الجزء {n}', { n: num(j1) })} · {tr('{n} آية', { n: num(meta[2]) })}</small>

          <div className={styles.pick}>
            <label className={styles.field}>
              <span>{tr('السورة')}</span>
              <span className={styles.selWrap}>
                <select value={surah} onChange={e => go(Number(e.target.value), 1)}>{surahOptions}</select>
                <Icon name="chev" />
              </span>
            </label>
            <label className={`${styles.field} ${styles.fieldAyah}`}>
              <span>{tr('الآية')}</span>
              <span className={styles.selWrap}>
                <select value={ayah} onChange={e => go(surah, Number(e.target.value))}>{ayahOptions}</select>
                <Icon name="chev" />
              </span>
            </label>
          </div>
          <div className={`nq-seg ${styles.src}`} role="group" aria-label={tr('مصدر التفسير')}>
            {TAFSIR_SOURCES.map(s => (
              <button key={s.id} type="button" aria-pressed={src === s.id} onClick={() => chooseSrc(s.id)}>{tr(s.name)}</button>
            ))}
          </div>
        </div>
      </header>

      <div className={`nq-wrap ${styles.body}`}>
        {/* ── the ayah ── */}
        <section id="nq-tafsir-ayah" className={`nq-card ${styles.ayahCard}`} aria-label={`${tr('سورة {name}', { name: sName })} · ${label}`} aria-busy={loading}>
          <svg className={`${styles.qc} ${styles.qcA}`} aria-hidden="true"><use href="#nq-corner" /></svg>
          <svg className={`${styles.qc} ${styles.qcB}`} aria-hidden="true"><use href="#nq-corner" /></svg>
          {ayah === 1 && surah !== 1 && surah !== 9 && <p className={styles.basm} lang="ar" dir="rtl">{BASMALA_TEXT}</p>}
          {error ? null : ayahText === null ? (
            <div className={styles.skelQ} role="status" aria-label={tr('جاري التحميل…')}><i /><i /><i /></div>
          ) : (
            <p className={styles.ayah} lang="ar" dir="rtl">
              {ayahText}{shown !== null && <>{' '}<AyahMark n={shown} /></>}
            </p>
          )}
          <div className={styles.acts}>
            <button type="button" className="nq-btn ghost sm" onClick={listen}><Icon name="head" />{tr('استمع')}</button>
            <Link className="nq-btn ghost sm" to={`/reader?surah=${surah}&ayah=${ayah}`}><Icon name="book" />{tr('اقرأها في المصحف')}</Link>
            <button type="button" className="nq-btn ghost sm" onClick={copy} disabled={loading}><Icon name="copy" />{tr('نسخ')}</button>
            <button type="button" className="nq-btn ghost sm" disabled={loading}
              onClick={() => window.dispatchEvent(new CustomEvent('shareAyah', { detail: { surah, ayah, text: ayahText || '' } }))}>
              <Icon name="share" />{tr('مشاركة')}
            </button>
          </div>
        </section>

        {/* ── the tafsir ── */}
        <article className={styles.tafsir} aria-live="polite" aria-busy={loading}>
          <div className={styles.tHead}>
            <Badge8 icon="doc" size={44} />
            <div>
              <h2>{tr(srcObj.name)}</h2>
              <small>{tr('{name} · {ayah}', { name: sName, ayah: label })}</small>
            </div>
          </div>
          {error ? (
            <div className={styles.error} role="alert">
              <p>{tr('تعذّر تحميل التفسير — تحقّق من اتصالك بالإنترنت')}</p>
              <button type="button" className="nq-btn gold sm" onClick={() => setReloadKey(k => k + 1)}><Icon name="repeat" />{tr('إعادة المحاولة')}</button>
            </div>
          ) : tafsirText === null ? (
            <div className={styles.skel} role="status" aria-label={tr('جاري تحميل التفسير…')}><i /><i /><i /><i /><i /></div>
          ) : (
            <p className={styles.tText} lang="ar" dir="rtl">{tafsirText || tr('لا يوجد تفسير لهذه الآية في هذا المصدر.')}</p>
          )}
          <p className={styles.note}>{tr('التفسير المعروض منقول من مصادره العلمية المعتمدة.')}</p>
        </article>

        <Divider />

        {/* ── previous / next ── */}
        <nav className={styles.nav} aria-label={tr('التنقل بين الآيات')}>
          <button type="button" className={`nq-card ${styles.navBtn}`} onClick={prev} disabled={first}>
            <Icon name="back" />
            <span><small>{tr('الآية السابقة')}</small><b>{first ? '—' : ayah > 1 ? ayahLabel(tr, surah, ayah - 1) : tr('سورة {name}', { name: surahName(surah - 1) })}</b></span>
          </button>
          <button type="button" className={`nq-card ${styles.navBtn} ${styles.navNext}`} onClick={next} disabled={last}>
            <span><small>{tr('الآية التالية')}</small><b>{last ? '—' : ayah < count(surah) ? ayahLabel(tr, surah, ayah + 1) : tr('سورة {name}', { name: surahName(surah + 1) })}</b></span>
            <Icon name="back" className={styles.flip} />
          </button>
        </nav>
      </div>
    </div>
  );
}
