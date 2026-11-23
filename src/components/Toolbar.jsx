// ─── Reader bar: index button, surah title, view switch, listen, display popover, prev/next ──
// Everything the old toolbar had lives here now: font size and style, translation,
// reciter, the daily ward, quick links — plus the highlight setting from Settings.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, setGlobal, savePref, DEFAULT_READER } from '../store';
import { SURAHS_META, TRANSLATIONS, READERS } from '../data';
import { useHifz } from '../hifzStore';
import { Icon, toAr } from './ornaments/Ornaments';
import { juzRange } from './reader/ayahItems';
import { readerName } from './reader/readerNames';
import { useTr, num, surahName, revelationLabel } from '../l10n';
import { coreTr } from '../locales/core';
import styles from './Toolbar.module.css';

const COUNTRY = { '🇪🇬': 'مصر', '🇸🇦': 'السعودية', '🇰🇼': 'الكويت' };
const READER_GROUPS = READERS.reduce((acc, r) => {
  const g = COUNTRY[r.country] || 'قرّاء آخرون';
  (acc[g] = acc[g] || []).push(r);
  return acc;
}, {});

export function changeFontSize(next) {
  const v = Math.max(16, Math.min(48, Math.round(next)));
  setGlobal({ fontSize: v });
  savePref('nq_fontSize', v);
  document.documentElement.style.setProperty('--font-size', v + 'px');
}

function DisplayPopover({ onClose }) {
  const [state] = useStore();
  const tr = coreTr(useTr());
  const { hifz, markWardDone, todayDone, streak } = useHifz();
  const ward = hifz.dailyWard;
  const wardName = ward ? surahName(ward.surah) : null;

  function setFontStyle(style) {
    setGlobal({ fontStyle: style });
    savePref('nq_fontStyle', style);
  }

  return (
    <div className={styles.pop} role="dialog" aria-label={tr('إعدادات العرض')}>
      <div className={styles.popHead}>
        <span className="nq-eyebrow">{tr('العرض والتلاوة')}</span>
        <button type="button" className={styles.popClose} onClick={onClose} aria-label={tr('إغلاق')}><Icon name="x" /></button>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldTop}>
          <label htmlFor="nqFontSize">{tr('حجم الخط')}</label>
          <span className={`${styles.val} nq-num`}>{toAr(state.fontSize)}</span>
        </div>
        <div className={styles.sizeRow}>
          <button type="button" className={styles.step} onClick={() => changeFontSize(state.fontSize - 2)} aria-label={tr('تصغير الخط')} disabled={state.fontSize <= 16}>{tr('أ−')}</button>
          <input id="nqFontSize" type="range" min="16" max="48" step="2" value={state.fontSize}
            className={styles.range} onChange={e => changeFontSize(Number(e.target.value))}
            style={{ '--p': ((state.fontSize - 16) / 32 * 100) + '%' }} />
          <button type="button" className={styles.step} onClick={() => changeFontSize(state.fontSize + 2)} aria-label={tr('تكبير الخط')} disabled={state.fontSize >= 48}>{tr('أ+')}</button>
        </div>
        <p className={styles.preview} lang="ar" dir="rtl" style={{ fontFamily: state.fontStyle === 'uthmani' ? 'var(--f-quran)' : 'var(--f-ui)', fontSize: Math.min(state.fontSize, 34) }}>
          ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ
        </p>
      </div>

      <div className={styles.field}>
        <span className={styles.lbl} id="nqFontStyleLbl">{tr('نوع الخط')}</span>
        <div className="nq-seg" role="group" aria-labelledby="nqFontStyleLbl" style={{ display: 'flex' }}>
          <button type="button" style={{ flex: 1 }} aria-pressed={state.fontStyle === 'uthmani'} onClick={() => setFontStyle('uthmani')}>{tr('عثماني')}</button>
          <button type="button" style={{ flex: 1 }} aria-pressed={state.fontStyle !== 'uthmani'} onClick={() => setFontStyle('simple')}>{tr('مبسّط')}</button>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.lbl} htmlFor="nqTrans">{tr('الترجمة')}</label>
        <div className={styles.selectWrap}>
          <select id="nqTrans" className={styles.select} value={state.translation || 'none'}
            onChange={e => { setGlobal({ translation: e.target.value }); savePref('nq_translation', e.target.value); }}>
            {TRANSLATIONS.map(t => <option key={t.id} value={t.id}>{t.id === 'none' ? tr(t.name) : t.name}</option>)}
          </select>
          <Icon name="chev" className={styles.selectChev} />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.lbl} htmlFor="nqReader">{tr('القارئ')}</label>
        <div className={styles.selectWrap}>
          <select id="nqReader" className={styles.select} value={state.reader || DEFAULT_READER}
            onChange={e => {
              setGlobal({ reader: e.target.value });
              savePref('nq_reader', e.target.value);
              // a recitation in progress switches reciter at the same ayah (src/audio/controller.js)
            }}>
            {Object.entries(READER_GROUPS).map(([g, list]) => (
              <optgroup key={g} label={tr(g)}>
                {list.map(r => <option key={r.id} value={r.id}>{readerName(r, tr.lang)}</option>)}
              </optgroup>
            ))}
          </select>
          <Icon name="chev" className={styles.selectChev} />
        </div>
      </div>

      <button type="button" className={styles.toggleRow} aria-pressed={!!state.highlightMode}
        onClick={() => { const v = !state.highlightMode; setGlobal({ highlightMode: v }); savePref('nq_highlight', v); }}>
        <span>
          <b>{tr('إبقاء تمييز الآية المختارة')}</b>
          <small>{tr('تبقى الآية مظلّلة بعد إغلاق شريط الأدوات')}</small>
        </span>
        <i className={styles.switch} aria-hidden="true" />
      </button>

      <div className={styles.ward}>
        <Icon name="calendar" />
        {ward ? (
          <>
            <span className={styles.wardTxt}>
              <b>{tr('الورد اليومي')}</b>
              <small>{wardName} {toAr(ward.startAyah)}–{toAr(ward.endAyah)}{streak > 0 ? ` · ${tr('{n} يوماً متتالية', { n: num(streak) })}` : ''}</small>
            </span>
            <button type="button" className="nq-btn ghost sm" onClick={markWardDone} disabled={todayDone} aria-pressed={todayDone}>
              {todayDone ? <><Icon name="check" />{tr('تمّ')}</> : tr('أتممت وردي')}
            </button>
          </>
        ) : (
          <>
            <span className={styles.wardTxt}><b>{tr('الورد اليومي')}</b><small>{tr('لم تحدّد ورداً بعد')}</small></span>
            <Link to="/hifz" className="nq-btn ghost sm" onClick={onClose}>{tr('حدّد وردك')}</Link>
          </>
        )}
      </div>

      <nav className={styles.quick} aria-label={tr('روابط سريعة')}>
        <Link to="/search" onClick={onClose}><Icon name="search" />{tr('بحث')}</Link>
        <Link to="/notes" onClick={onClose}><Icon name="pen" />{tr('ملاحظاتي')}</Link>
        <Link to="/hifz" onClick={onClose}><Icon name="scroll" />{tr('الحفظ')}</Link>
      </nav>
    </div>
  );
}

export default function Toolbar({ view, onView, onPrev, onNext, onListen }) {
  const [state] = useStore();
  const tr = coreTr(useTr());
  const [pop, setPop] = useState(false);
  const popRef = useRef(null);
  const s = state.currentSurah;
  const meta = SURAHS_META[s - 1];
  const [j1, j2] = juzRange(s);

  useEffect(() => {
    if (!pop) return;
    function onDown(e) { if (popRef.current && !popRef.current.contains(e.target)) setPop(false); }
    function onKey(e) { if (e.key === 'Escape') setPop(false); }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [pop]);

  return (
    <div className={styles.bar}>
      <button type="button" className={`nq-ibtn ${styles.indexBtn}`} aria-label={tr('فهرس السور')}
        aria-expanded={!!state.sidebarOpen} onClick={() => setGlobal({ sidebarOpen: !state.sidebarOpen })}>
        <Icon name="list" />
      </button>

      <div className={styles.title}>
        <h1>{tr('سورة {name}', { name: surahName(s) })}</h1>
        <small>
          {j1 === j2 ? tr('الجزء {n}', { n: num(j1) }) : tr('الأجزاء {a}–{b}', { a: num(j1), b: num(j2) })}
          {' · '}{revelationLabel(meta[3])}{' · '}{tr('آياتها {n}', { n: num(meta[2]) })}
        </small>
      </div>

      <div className={`nq-seg ${styles.views}`} role="group" aria-label={tr('طريقة العرض')}>
        <button type="button" aria-pressed={view === 'mushaf'} onClick={() => onView('mushaf')}><Icon name="book" />{tr('مصحف')}</button>
        <button type="button" aria-pressed={view === 'ayah'} onClick={() => onView('ayah')}><Icon name="list" />{tr('آية بآية')}</button>
      </div>

      <div className={styles.acts}>
        <button type="button" className="nq-ibtn" onClick={onListen}
          aria-label={state.isPlaying ? tr('إيقاف التلاوة مؤقتاً') : tr('الاستماع للسورة')} title={state.isPlaying ? tr('إيقاف مؤقت') : tr('استماع للسورة')}>
          <Icon name={state.isPlaying ? 'pause' : 'head'} />
        </button>
        <div className={styles.popWrap} ref={popRef}>
          <button type="button" className={`nq-ibtn ${pop ? styles.on : ''}`} aria-label={tr('حجم الخط والعرض')}
            title={tr('حجم الخط والعرض')} aria-expanded={pop} aria-haspopup="dialog" onClick={() => setPop(v => !v)}>
            <Icon name="aa" />
          </button>
          {pop && <DisplayPopover onClose={() => setPop(false)} />}
        </div>
        <span className={styles.navPair}>
          <button type="button" className="nq-ibtn" onClick={onPrev} disabled={s <= 1}
            aria-label={s > 1 ? tr('السورة السابقة: {name}', { name: surahName(s - 1) }) : tr('السورة السابقة')} title={tr('السورة السابقة')}>
            <Icon name="back" />
          </button>
          <button type="button" className="nq-ibtn" onClick={onNext} disabled={s >= 114}
            aria-label={s < 114 ? tr('السورة التالية: {name}', { name: surahName(s + 1) }) : tr('السورة التالية')} title={tr('السورة التالية')}>
            <Icon name="back" className={styles.flip} />
          </button>
        </span>
      </div>
    </div>
  );
}
