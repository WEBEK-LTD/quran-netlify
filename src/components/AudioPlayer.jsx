// ─── Recitation dock ─────────────────────────────────────────────────────────
// The UI of the recitation engine (src/audio): play / pause, previous / next,
// seek, modes (one ayah · whole surah · repeat ayah ×N · range A–B ×N), what
// to do at the end of a surah, speed, volume, sleep timer, follow-along,
// offline download and the reciter list. Playback itself lives in the engine,
// so it keeps going with the screen locked and is driven by the lock screen too.
//
// Mounted once for the whole app (App.jsx): a recitation started in the mushaf or
// on /listen keeps playing while the visitor moves to another page; the dock
// stays at the bottom with a link back to the recited ayah. Closing it stops.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStoreKeys, setGlobal, savePref } from '../store';
import { SURAHS_META, READERS } from '../data';
import { Icon, toAr } from './ornaments/Ornaments';
import { displayNumber } from './reader/ayahItems';
import { readerName, readerShortName } from './reader/readerNames';
import { useTr, num, surahName, intlLocale } from '../l10n';
import { coreTr } from '../locales/core';
import { engine, initAudio, toggleAudio } from '../audio/controller';
import { refreshMediaSession } from '../audio/mediaSession';
import {
  offlineSupported, onControllerChange, downloadSurahAudio, surahOfflineStatus,
  offlineSummary, removeOfflineAudio, surahUrls,
} from '../audio/offline';
import styles from './AudioPlayer.module.css';

initAudio();

const MODES = [
  { id: 'single', label: 'آية واحدة' },
  { id: 'surah',  label: 'سورة كاملة' },
  { id: 'repeat', label: 'تكرار الآية' },
  { id: 'range',  label: 'تكرار مقطع' },
];
const AFTER = [
  { id: 'next',   label: 'السورة التالية' },
  { id: 'repeat', label: 'إعادة السورة' },
  { id: 'stop',   label: 'توقّف' },
];
const SPEEDS = [1, 1.25, 1.5, 0.75];     // the speed pill cycles in this order
const REPEATS = [2, 3, 5, 10, 0];       // 0 = without end
const SLEEPS = [15, 30, 45, 60];
const SEEK_STEP = 5;

const fmtSpeed = v => { try { return num(new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 2 }).format(v)); } catch { return num(v); } };
function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}
function fmtMB(bytes) {
  const mb = bytes / (1024 * 1024);
  try { return num(new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb)); } catch { return num(Math.round(mb)); }
}

// Keys that belong to whatever has focus
const TYPING = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
const OWN_SPACE = 'button, a[href], [role="button"], [role="slider"], [role="switch"], [role="checkbox"], summary';
const OWN_ARROWS = '[role="slider"], [role="tablist"], [role="radiogroup"], [role="listbox"], [role="menu"]';

// Pages where the dock's keyboard shortcuts (Space, ←/→, N/P) apply; elsewhere
// Space keeps scrolling the page.
const QURAN_PAGES = /^\/(reader|listen|tafsir)(\/|$)/;
const PLAYER_KEYS = ['showAudio', 'currentSurah', 'audioAyah', 'reader', 'followAudio'];

export default function AudioPlayer() {
  const state = useStoreKeys(PLAYER_KEYS);
  const tr = coreTr(useTr());
  const x = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef(null);
  const { pathname } = useLocation();
  const onReader = pathname === '/reader';
  const shortcuts = QURAN_PAGES.test(pathname);

  // Off the reader, keep the page's last lines clear of the dock
  useEffect(() => {
    if (!state.showAudio || onReader) return;
    document.body.classList.add('nq-has-dock');
    return () => document.body.classList.remove('nq-has-dock');
  }, [state.showAudio, onReader]);
  // Lock-screen text follows the UI language
  useEffect(() => { refreshMediaSession(); }, [tr.lang]);

  // Close the "more" menu on outside click / Escape
  useEffect(() => {
    if (!showMore) return;
    const onDown = e => { if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false); };
    const onKey = e => { if (e.key === 'Escape') setShowMore(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [showMore]);

  // Keyboard: Space play/pause · ←/→ seek ±5 s (mirrored in RTL) · N / P next / previous ayah
  useEffect(() => {
    if (!state.showAudio || !shortcuts) return;
    function onKey(e) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t && t.closest(TYPING)) return;
      if (e.key === ' ' || e.code === 'Space') {
        if (t && t.closest(OWN_SPACE)) return;
        e.preventDefault();
        if (!e.repeat) toggleAudio();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (t && t.closest(OWN_ARROWS)) return;
        if (!engine.cursor) return;
        const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
        const forward = (e.key === 'ArrowRight') !== rtl;
        e.preventDefault();
        engine.seekBy(forward ? SEEK_STEP : -SEEK_STEP);
        return;
      }
      if (e.repeat || e.shiftKey) return;
      if (e.code === 'KeyN' || e.key === 'n' || e.key === 'N') { e.preventDefault(); engine.cursor ? engine.next() : toggleAudio(); }
      else if (e.code === 'KeyP' || e.key === 'p' || e.key === 'P') { e.preventDefault(); if (engine.cursor) engine.prev(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state.showAudio, shortcuts]);

  // Sleep timer countdown (re-render while it runs, even when paused)
  const [, setTick] = useState(0);
  useEffect(() => {
    if (x.sleep.kind !== 'time') return;
    const id = setInterval(() => setTick(n => n + 1), 15000);
    return () => clearInterval(id);
  }, [x.sleep.kind, x.sleep.endsAt]);

  if (!state.showAudio) return null;

  const c          = x.cursor;
  const aSurah     = c ? c.surah : state.currentSurah;
  const aAyah      = c ? c.ayah : state.audioAyah;
  const basmala    = !!(c && c.basmala);
  const count      = SURAHS_META[aSurah - 1][2];
  const playing    = x.playing;
  const buffering  = playing && x.buffering;
  const duration   = x.duration;
  const current    = x.time;
  const progress   = duration ? Math.min(100, (current / duration) * 100) : 0;
  const mode       = x.settings.mode;
  const speed      = x.rate;
  const volume     = x.volume;
  const sName      = surahName(aSurah);
  const readerObj  = READERS.find(r => r.id === state.reader) || READERS[0];
  const shownAyah  = basmala ? null : displayNumber(aSurah, aAyah);
  const ayahText   = shownAyah === null ? tr('البسملة') : tr('الآية {n}', { n: toAr(shownAyah) });
  const readerFull = readerName(readerObj, tr.lang);
  const readerShort = readerShortName(readerObj, tr.lang);
  const initial    = readerShort.replace(/^(ال|عبد\s*ال|Abd(ul|ur|u)?[\s-]*|A[lrsd]-)/i, '').trim().charAt(0) || readerShort.charAt(0);
  const speedTxt   = `${fmtSpeed(speed)}×`;
  const nTxt       = n => (n === 0 ? '∞' : toAr(n));
  const [rFrom, rTo] = rangeBounds(x.settings, count);
  const sleepLeft  = x.sleep.kind === 'time' ? Math.max(1, Math.ceil((x.sleep.endsAt - Date.now()) / 60000)) : 0;

  const modeLabel = m => {
    if (m === 'repeat') return tr('تكرار ×{n}', { n: nTxt(x.settings.repeatN) });
    if (m === 'range') return tr('مقطع {a}–{b} ×{n}', { a: labelOf(aSurah, rFrom, tr), b: labelOf(aSurah, rTo, tr), n: nTxt(x.settings.rangeN) });
    return tr(MODES.find(o => o.id === m).label);
  };

  function setMode(m) {
    if (m === 'range') {
      // a fresh range starts at the ayah being recited and spans a few ayahs
      const from = Math.max(1, Math.min(count, aAyah));
      engine.configure({ mode: m, rangeFrom: from, rangeTo: Math.min(count, from + 4) });
    } else engine.configure({ mode: m });
  }

  function cycleSpeed() {
    engine.setRate(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]);
  }

  // Click / keyboard on the progress track (role="slider")
  function seekTo(e) {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // The fill grows from the inline-start edge (right in RTL) — measure from the same edge
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const px = rtl ? rect.right - e.clientX : e.clientX - rect.left;
    engine.seek(Math.min(1, Math.max(0, px / rect.width)) * duration);
  }
  function seekKey(e) {
    if (!duration) return;
    const step = e.shiftKey ? 10 : SEEK_STEP;
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const f = rtl ? ['ArrowLeft', 'ArrowUp'] : ['ArrowRight', 'ArrowUp'];
    const b = rtl ? ['ArrowRight', 'ArrowDown'] : ['ArrowLeft', 'ArrowDown'];
    if (f.includes(e.key)) { e.preventDefault(); engine.seekBy(step); }
    else if (b.includes(e.key)) { e.preventDefault(); engine.seekBy(-step); }
    else if (e.key === 'Home') { e.preventDefault(); engine.seek(0); }
    else if (e.key === 'End') { e.preventDefault(); engine.seek(duration - 0.1); }
  }

  function playSurah() {
    if (mode === 'single' || mode === 'range') engine.configure({ mode: 'surah' });
    setGlobal({ playSurah: aSurah, audioAyah: 1, playTrigger: Date.now(), showAudio: true });
  }

  function changeReader(id) {
    setGlobal({ reader: id });   // the controller keeps the ayah and switches reciter
    savePref('nq_reader', id);
    setShowMore(false);
  }

  function close() {
    engine.pause();
    setShowMore(false);
    setGlobal({ showAudio: false, isPlaying: false });
  }

  const playLabel = playing ? tr('إيقاف مؤقت') : tr('تشغيل');

  return (
    <div className={styles.dock} role="region" aria-label={tr('مشغّل التلاوة')}>
      <span className={styles.rc} aria-hidden="true">
        <svg className={styles.rcStar}><use href="#nq-star8" /></svg>
        <b>{initial}</b>
      </span>

      <div className={styles.meta}>
        {onReader ? (
          <b title={`${readerFull} · ${sName} · ${ayahText}`}>
            <span className={styles.rName}>{readerShort} · </span>{sName} · <span className={styles.ayahNo}>{ayahText}</span>
          </b>
        ) : (
          <Link className={styles.metaLink} to={`/reader?surah=${aSurah}&ayah=${aAyah}`}
            title={tr('اقرأ مع التلاوة في المصحف')} aria-label={`${readerFull} · ${sName} · ${ayahText} — ${tr('اقرأ مع التلاوة في المصحف')}`}>
            <span className={styles.rName}>{readerShort} · </span>{sName} · <span className={styles.ayahNo}>{ayahText}</span>
          </Link>
        )}
        <div className={styles.track} onClick={seekTo} onKeyDown={seekKey}
          role="slider" tabIndex={0} aria-label={tr('موضع التلاوة')}
          aria-valuemin={0} aria-valuemax={Math.round(duration) || 0} aria-valuenow={Math.round(current) || 0}
          aria-valuetext={tr('{a} من {b}', { a: fmt(current), b: fmt(duration) })}>
          {/* fill and thumb move with transforms only (no layout while the recitation plays) */}
          <i style={{ '--p': progress }} />
          <span className={styles.thumbRail} style={{ '--p': progress }} aria-hidden="true"><b /></span>
        </div>
        <small className={`nq-num ${styles.timeRow}`}>
          <span>{toAr(fmt(current))} / {toAr(fmt(duration))}</span>
          {buffering && <span className={styles.bufTxt}>{tr('جارٍ التحميل…')}</span>}
          {x.sleep.kind !== 'off' && (
            <span className={styles.sleepTxt}>
              <Icon name="moon" />
              {x.sleep.kind === 'surah' ? tr('حتى نهاية السورة') : tr('{n} د', { n: toAr(sleepLeft) })}
            </span>
          )}
        </small>
        <span className="nq-sr" role="status" aria-live="polite">{buffering ? tr('جارٍ التحميل…') : ''}</span>
      </div>

      <div className={styles.chips}>
        <button type="button" className={`nq-pill ${mode !== 'single' ? 'on' : ''} ${styles.chip}`}
          onClick={() => { const i = MODES.findIndex(m => m.id === mode); setMode(MODES[(i + 1) % MODES.length].id); }}
          aria-label={tr('وضع التشغيل: {mode}', { mode: modeLabel(mode) })} title={tr('تغيير وضع التشغيل')}>
          <Icon name="repeat" />{modeLabel(mode)}
        </button>
        <button type="button" className={`nq-pill ${speed !== 1 ? 'on' : ''} ${styles.chip}`} onClick={cycleSpeed}
          aria-label={tr('سرعة التلاوة {v}', { v: speedTxt })} title={tr('سرعة التلاوة')}>
          {speedTxt}
        </button>
      </div>

      <div className={styles.ctl}>
        <button type="button" className={styles.sm} onClick={() => (engine.cursor ? engine.prev() : toggleAudio())}
          aria-label={tr('الآية السابقة')} title={tr('السابقة')} aria-keyshortcuts="P">
          <Icon name="prev" fill />
        </button>
        <button type="button" className={`${styles.play} ${buffering ? styles.buf : ''}`} onClick={toggleAudio}
          aria-label={playLabel} aria-busy={buffering || undefined} aria-keyshortcuts="Space" title={buffering ? tr('جارٍ التحميل…') : playLabel}>
          <Icon name={playing ? 'pause' : 'play'} fill />
        </button>
        <button type="button" className={styles.sm} onClick={() => (engine.cursor ? engine.next() : toggleAudio())}
          aria-label={tr('الآية التالية')} title={tr('التالية')} aria-keyshortcuts="N">
          <Icon name="next" fill />
        </button>
      </div>

      <div className={styles.moreWrap} ref={moreRef}>
        <button type="button" className={`${styles.sm} ${showMore ? styles.smOn : ''} ${x.sleep.kind !== 'off' ? styles.smDot : ''}`} onClick={() => setShowMore(v => !v)}
          aria-label={tr('خيارات التلاوة')} aria-expanded={showMore} aria-haspopup="dialog" title={tr('خيارات التلاوة')}>
          <Icon name="gear" />
        </button>
        {showMore && (
          <div className={styles.menu} role="dialog" aria-label={tr('خيارات التلاوة')}>
            <div className={styles.menuSec}>
              <span className={styles.menuLbl} id="nqModeLbl">{tr('وضع التشغيل')}</span>
              <div className={`nq-seg ${styles.seg2}`} role="group" aria-labelledby="nqModeLbl">
                {MODES.map(m => (
                  <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{tr(m.label)}</button>
                ))}
              </div>

              {mode === 'repeat' && (
                <div className={styles.subRow}>
                  <span id="nqRepLbl">{tr('عدد مرات التكرار')}</span>
                  <div className="nq-seg" role="group" aria-labelledby="nqRepLbl">
                    {REPEATS.map(n => (
                      <button key={n} type="button" aria-pressed={x.settings.repeatN === n}
                        aria-label={n === 0 ? tr('بلا توقف') : undefined}
                        onClick={() => engine.configure({ repeatN: n })}>{n === 0 ? '∞' : `×${toAr(n)}`}</button>
                    ))}
                  </div>
                </div>
              )}

              {mode === 'range' && (
                <>
                  <div className={styles.rangeRow}>
                    <label>
                      <span>{tr('من الآية')}</span>
                      <select className={styles.select} value={rFrom}
                        onChange={e => { const v = Number(e.target.value); engine.configure({ rangeFrom: v, rangeTo: Math.max(v, rTo) }); }}>
                        {ayahOptions(aSurah, count, tr)}
                      </select>
                    </label>
                    <label>
                      <span>{tr('إلى الآية')}</span>
                      <select className={styles.select} value={rTo}
                        onChange={e => { const v = Number(e.target.value); engine.configure({ rangeTo: v, rangeFrom: Math.min(v, rFrom) }); }}>
                        {ayahOptions(aSurah, count, tr)}
                      </select>
                    </label>
                  </div>
                  <div className={styles.subRow}>
                    <span id="nqRangeNLbl">{tr('عدد مرات التكرار')}</span>
                    <div className="nq-seg" role="group" aria-labelledby="nqRangeNLbl">
                      {REPEATS.map(n => (
                        <button key={n} type="button" aria-pressed={x.settings.rangeN === n}
                          aria-label={n === 0 ? tr('بلا توقف') : undefined}
                          onClick={() => engine.configure({ rangeN: n })}>{n === 0 ? '∞' : `×${toAr(n)}`}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {(mode === 'surah' || mode === 'repeat') && (
                <div className={styles.subRow}>
                  <span id="nqAfterLbl">{tr('عند نهاية السورة')}</span>
                  <div className="nq-seg" role="group" aria-labelledby="nqAfterLbl">
                    {AFTER.map(o => (
                      <button key={o.id} type="button" aria-pressed={x.settings.afterSurah === o.id}
                        onClick={() => engine.configure({ afterSurah: o.id })}>{tr(o.label)}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.menuSec}>
              <span className={styles.menuLbl} id="nqSpeedLbl">{tr('السرعة')}</span>
              <div className="nq-seg" role="group" aria-labelledby="nqSpeedLbl" style={{ display: 'flex' }}>
                {[0.75, 1, 1.25, 1.5].map(v => (
                  <button key={v} type="button" style={{ flex: 1 }} aria-pressed={speed === v} onClick={() => engine.setRate(v)}>
                    {fmtSpeed(v)}×
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.menuSec}>
              <label className={styles.menuLbl} htmlFor="nqVol">{tr('مستوى الصوت')}</label>
              <div className={styles.volRow}>
                <Icon name="head" />
                <input id="nqVol" type="range" min="0" max="1" step="0.05" value={volume}
                  className={styles.range} style={{ '--p': (volume * 100) + '%' }}
                  onChange={e => engine.setVolume(parseFloat(e.target.value))} />
                <span className="nq-num">{tr('{n}٪', { n: toAr(Math.round(volume * 100)) })}</span>
              </div>
            </div>

            <div className={styles.menuSec}>
              <span className={styles.menuLbl} id="nqSleepLbl">
                {tr('مؤقّت النوم')}
                {x.sleep.kind === 'time' && <em className={styles.menuNote}>{tr('يتوقف بعد {n} دقيقة', { n: toAr(sleepLeft) })}</em>}
              </span>
              <div className={`nq-seg ${styles.segWrap}`} role="group" aria-labelledby="nqSleepLbl">
                <button type="button" aria-pressed={x.sleep.kind === 'off'} onClick={() => engine.setSleep('off')}>{tr('إيقاف|off')}</button>
                {SLEEPS.map(m => (
                  <button key={m} type="button" aria-pressed={x.sleep.kind === 'time' && x.sleep.minutes === m}
                    aria-label={tr('{n} دقيقة', { n: num(m) })} onClick={() => engine.setSleep(m)}>{tr('{n} د', { n: toAr(m) })}</button>
                ))}
                <button type="button" aria-pressed={x.sleep.kind === 'surah'} onClick={() => engine.setSleep('surah')}>{tr('نهاية السورة')}</button>
              </div>
            </div>

            <button type="button" className={styles.toggleRow} role="switch" aria-checked={!!state.followAudio}
              onClick={() => { const v = !state.followAudio; setGlobal({ followAudio: v }); savePref('nq_follow_audio', v); }}>
              <span>
                <b>{tr('متابعة الآية مع التلاوة')}</b>
                <small>{tr('تمرير المصحف تلقائياً إلى الآية المتلوّة')}</small>
              </span>
              <i className={styles.switch} aria-hidden="true" />
            </button>

            <OfflineSection reader={state.reader} surah={aSurah} />

            <button type="button" className={`nq-btn ghost sm ${styles.fromStart}`} onClick={() => { playSurah(); setShowMore(false); }}>
              <Icon name="play" />{tr('تشغيل السورة من أولها')}
            </button>
            <button type="button" className={`nq-btn ghost sm ${styles.menuClose}`} onClick={close}>
              <Icon name="x" />{tr('إغلاق المشغّل')}
            </button>
            <div className={styles.menuSec}>
              <span className={styles.menuLbl}>{tr('القارئ')}</span>
              <div className={styles.readers}>
                {READERS.map(r => (
                  <button key={r.id} type="button"
                    className={styles.readerItem} aria-pressed={r.id === state.reader}
                    onClick={() => changeReader(r.id)}>
                    <span>{readerName(r, tr.lang)}</span>
                    {r.id === state.reader && <Icon name="check" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <button type="button" className={`${styles.sm} ${styles.close}`} onClick={close}
        aria-label={tr('إغلاق المشغّل')} title={tr('إغلاق')}>
        <Icon name="x" />
      </button>
    </div>
  );
}

function rangeBounds(settings, count) {
  let from = Math.max(1, Math.min(count, settings.rangeFrom || 1));
  let to = Math.max(1, Math.min(count, settings.rangeTo || count));
  if (to < from) [from, to] = [to, from];
  return [from, to];
}

// Ayah number as the reader shows it (Al-Fatiha: Madani; Kufi 1 = the basmala)
function labelOf(surah, kufi, tr) {
  const d = displayNumber(surah, kufi);
  return d === null ? tr('البسملة') : toAr(d);
}

function ayahOptions(surah, count, tr) {
  const out = [];
  for (let k = 1; k <= count; k++) {
    const d = displayNumber(surah, k);
    out.push(<option key={k} value={k}>{labelOf(surah, k, tr)}</option>);
  }
  return out;
}

// ── Offline listening: keep this surah (this reciter) in the audio cache ─────
function OfflineSection({ reader, surah }) {
  const tr = coreTr(useTr());
  const [supported, setSupported] = useState(offlineSupported);
  const [status, setStatus] = useState(null);     // { have, total }
  const [summary, setSummary] = useState(null);   // { files, bytes }
  const [job, setJob] = useState(null);           // { done, failed, total, cancel }
  const [msg, setMsg] = useState('');
  const jobRef = useRef(null);

  useEffect(() => onControllerChange(() => setSupported(offlineSupported())), []);

  function refresh() {
    if (!offlineSupported()) return;
    surahOfflineStatus(reader, surah).then(setStatus).catch(() => setStatus(null));
    offlineSummary().then(setSummary).catch(() => setSummary(null));
  }
  useEffect(() => { setStatus(null); setMsg(''); refresh(); }, [reader, surah, supported]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (jobRef.current) jobRef.current.cancel(); }, []);

  if (!supported) {
    return (
      <div className={styles.menuSec}>
        <span className={styles.menuLbl}>{tr('الاستماع دون اتصال')}</span>
        <p className={styles.menuHint}>{tr('التنزيل غير متاح في هذا المتصفح حالياً — أعد تحميل الصفحة ثم حاول مرة أخرى.')}</p>
      </div>
    );
  }

  const total = (status && status.total) || surahUrls(reader, surah).length;
  const complete = status && status.have >= status.total;

  function start() {
    setMsg('');
    const d = downloadSurahAudio(reader, surah, p => setJob(j => (j ? { ...j, ...p } : j)));
    jobRef.current = d;
    setJob({ done: 0, failed: 0, total, cancel: d.cancel });
    d.promise
      .then(r => {
        if (r.cancelled) setMsg(tr('أُلغي التنزيل'));
        else if (r.failed) setMsg(tr('تعذّر تنزيل {n} ملف — أعد المحاولة', { n: num(r.failed) }));
        else setMsg(tr('سورة {name} محفوظة للاستماع دون اتصال', { name: surahName(surah) }));
      })
      .catch(() => setMsg(tr('تعذّر التنزيل — تحقّق من اتصالك بالإنترنت')))
      .finally(() => { jobRef.current = null; setJob(null); refresh(); });
  }

  function removeSurah() {
    removeOfflineAudio(surahUrls(reader, surah).filter(u => !u.endsWith('/001001.mp3') || surah === 1))
      .then(() => setMsg(tr('حُذفت تلاوة السورة من الجهاز'))).catch(() => {}).finally(refresh);
  }
  function removeAll() {
    removeOfflineAudio().then(() => setMsg(tr('حُذفت كل التلاوات المنزّلة'))).catch(() => {}).finally(refresh);
  }

  const pct = job ? Math.round(((job.done + job.failed) / (job.total || 1)) * 100) : 0;

  return (
    <div className={styles.menuSec}>
      <span className={styles.menuLbl}>{tr('الاستماع دون اتصال')}</span>
      {job ? (
        <div className={styles.dl}>
          <div className={styles.dlBar} role="progressbar" aria-label={tr('تنزيل سورة {name}', { name: surahName(surah) })}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <i style={{ width: pct + '%' }} />
          </div>
          <div className={styles.dlRow}>
            <span className="nq-num">{tr('{a} من {b}', { a: toAr(job.done), b: toAr(job.total) })}</span>
            <button type="button" className="nq-btn ghost sm" onClick={() => job.cancel()}>{tr('إلغاء')}</button>
          </div>
        </div>
      ) : complete ? (
        <div className={styles.dlRow}>
          <span className={styles.dlOk}><Icon name="check" />{tr('هذه السورة محفوظة على جهازك')}</span>
          <button type="button" className="nq-btn ghost sm" onClick={removeSurah}>{tr('حذف')}</button>
        </div>
      ) : (
        <button type="button" className={`nq-btn ghost sm ${styles.dlBtn}`} onClick={start}>
          <Icon name="download" />
          {status && status.have > 0
            ? tr('أكمل تنزيل سورة {name} ({a} من {b})', { name: surahName(surah), a: toAr(status.have), b: toAr(status.total) })
            : tr('تنزيل سورة {name} للاستماع دون اتصال', { name: surahName(surah) })}
        </button>
      )}
      {msg && <p className={styles.menuHint} role="status">{msg}</p>}
      {summary && summary.files > 0 && !job && (
        <div className={styles.dlRow}>
          <span className={styles.menuHint}>{tr('التلاوات المنزّلة: {n} ملف · {mb} م.ب', { n: toAr(summary.files), mb: fmtMB(summary.bytes) })}</span>
          <button type="button" className="nq-btn ghost sm" onClick={removeAll}><Icon name="x" />{tr('حذف الكل')}</button>
        </div>
      )}
    </div>
  );
}
