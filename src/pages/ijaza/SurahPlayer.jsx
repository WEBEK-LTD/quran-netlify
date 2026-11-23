// ─── Whole-surah player for the riwayat that have no per-ayah audio ──────────
// Plays an mp3quran.net recording of the chosen riwaya (never a Hafs stand-in).
// The ayat stay plain text: no highlighting, since the recording isn't synced.
import { useEffect, useRef, useState } from 'react';
import { Icon, toAr } from '../../components/ornaments/Ornaments';
import { useTr, surahName } from '../../l10n';
import { scoped } from '../../locales/library';
import { audioUrl, recitersFor, nearestSurah } from './sources';
import { IMAM_BY_ID, RAWI_BY_ID, RAWIS } from './riwayat';
import { recitersLabel } from './labels';
import styles from '../IjazaPage.module.css';

const PREF = id => `nq_ijaza_reciter_${id}`;
const readPref = id => { try { return localStorage.getItem(PREF(id)) || ''; } catch { return ''; } };
const writePref = (id, v) => { try { localStorage.setItem(PREF(id), v); } catch {} };

function clock(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60), m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return toAr(`${h ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`);
}

export default function SurahPlayer({ rawi, surah, onSurah, audio, onRetry, onPickRawi }) {
  const tr = scoped(useTr());
  const ltr = tr.dir === 'ltr';
  const el = useRef(null);
  const resume = useRef(false);            // keep playing after a surah change
  const [server, setServer] = useState(() => readPref(rawi.audioId));
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [err, setErr] = useState(false);
  const [autoNext, setAutoNext] = useState(true);

  const map = audio.status === 'ready' ? audio.map : null;
  const list = map ? recitersFor(map, rawi.audioId, surah) : [];
  const entry = list.find(e => e.server === server) || list[0] || null;
  const src = entry ? audioUrl(entry, surah) : '';
  const nextS = entry ? entry.surahs.find(s => s > surah) : undefined;
  const prevS = entry ? [...entry.surahs].reverse().find(s => s < surah) : undefined;

  // new recording: load it, and keep playing if we were
  useEffect(() => {
    const a = el.current;
    if (!a) return;
    setErr(false); setTime(0); setDur(0);
    if (!src) { a.removeAttribute('src'); a.load(); setPlaying(false); return; }
    a.src = src;
    if (resume.current) {
      resume.current = false;
      setBusy(true);
      a.play().then(() => setPlaying(true)).catch(() => { setPlaying(false); setBusy(false); });
    } else {
      setPlaying(false);
    }
  }, [src]);

  useEffect(() => () => { try { el.current && el.current.pause(); } catch {} }, []);

  function toggle() {
    const a = el.current;
    if (!a || !src) return;
    if (!a.paused) { a.pause(); return; }
    setErr(false); setBusy(true);
    a.play().catch(() => { setBusy(false); setPlaying(false); });
  }
  function go(s) {
    if (!s) return;
    resume.current = playing || resume.current;
    onSurah(s);
  }
  function pick(v) {
    resume.current = playing;
    setServer(v);
    writePref(rawi.audioId, v);
  }
  function seek(v) {
    const a = el.current;
    if (a && Number.isFinite(a.duration)) { a.currentTime = Number(v); setTime(Number(v)); }
  }

  const audioEl = (
    <audio ref={el} preload="none"
      onPlay={() => setPlaying(true)}
      onPause={() => { setPlaying(false); setBusy(false); }}
      onPlaying={() => setBusy(false)}
      onWaiting={() => setBusy(true)}
      onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
      onLoadedMetadata={e => setDur(e.currentTarget.duration)}
      onDurationChange={e => setDur(e.currentTarget.duration)}
      onEnded={() => { setPlaying(false); if (autoNext && nextS) { resume.current = true; onSurah(nextS); } }}
      onError={() => { if (el.current && el.current.getAttribute('src')) { setErr(true); setPlaying(false); setBusy(false); } }} />
  );

  // ── states without a playable recording ──
  if (audio.status !== 'ready') {
    return (
      <div className={`nq-card ${styles.player} ${styles.playerMsg}`} aria-live="polite">
        {audioEl}
        <Icon name="head" />
        {audio.status === 'error' ? (
          <>
            <span>{tr('تعذّر تحميل قائمة القرّاء — تحقق من الاتصال')}</span>
            <button type="button" className="nq-btn ghost sm" onClick={onRetry}><Icon name="repeat" />{tr('إعادة المحاولة')}</button>
          </>
        ) : <span>{tr('جارٍ تحميل قائمة القرّاء…')}</span>}
      </div>
    );
  }

  if (!entry) {
    const any = (map.rawis[rawi.audioId] || []).length > 0;
    const near = any ? nearestSurah(map, rawi.audioId, surah) : null;
    const imam = IMAM_BY_ID[rawi.imam];
    const sibling = imam.rawis.map(id => RAWI_BY_ID[id]).find(r => r.id !== rawi.id && recitersFor(map, r.audioId, surah).length);
    const other = sibling || RAWIS.find(r => r.id !== rawi.id && r.id !== 'hafs' && recitersFor(map, r.audioId, surah).length);
    const rawiName = <strong>{tr(rawi.name)}</strong>;
    return (
      <div className={`nq-card ${styles.player} ${styles.playerMsg}`} role="status">
        {audioEl}
        <Icon name="head" />
        <span>
          {any
            ? withParts(tr('لا تتوفر تلاوة سورة {name} برواية {rawi} حالياً.'), { name: surahName(surah, tr.lang), rawi: rawiName })
            : withParts(tr('لا توجد تلاوة مسجّلة متاحة لرواية {rawi} حالياً.'), { rawi: rawiName })}
        </span>
        <span className={styles.playerActs}>
          {near && (
            <button type="button" className="nq-btn ghost sm" onClick={() => onSurah(near)}>
              <Icon name="book" />{tr('أقرب سورة متاحة: سورة {name}', { name: surahName(near, tr.lang) })}
            </button>
          )}
          {other && (
            <button type="button" className="nq-btn ghost sm" onClick={() => onPickRawi(other.id)}>
              <Icon name="head" />{tr('استمع برواية {rawi}', { rawi: tr(other.name) })}
            </button>
          )}
        </span>
      </div>
    );
  }

  const max = Number.isFinite(dur) && dur > 0 ? dur : 0;
  return (
    <div className={`nq-card ${styles.player}`}>
      {audioEl}
      <div className={styles.playerRow}>
        <div className={styles.audioCtrls}>
          <button type="button" className="nq-ibtn" onClick={() => go(prevS)} disabled={!prevS} aria-label={tr('السورة السابقة')} title={tr('السورة السابقة')}>
            <Icon name={ltr ? 'prev' : 'next'} />
          </button>
          <button type="button" className={styles.playBtn} onClick={toggle} aria-label={playing ? tr('إيقاف مؤقت') : tr('تشغيل')} aria-busy={busy || undefined}>
            <Icon name={playing ? 'pause' : 'play'} fill />
          </button>
          <button type="button" className="nq-ibtn" onClick={() => go(nextS)} disabled={!nextS} aria-label={tr('السورة التالية')} title={tr('السورة التالية')}>
            <Icon name={ltr ? 'next' : 'prev'} />
          </button>
          <button type="button" className={`nq-ibtn ${styles.repeat}`} aria-pressed={autoNext} onClick={() => setAutoNext(v => !v)}
            aria-label={tr('تشغيل مستمر')} title={tr('تشغيل مستمر')}>
            <Icon name="repeat" />
          </button>
        </div>
        <div className={styles.audioInfo} aria-live="polite">
          <b>{tr('سورة {name}', { name: surahName(surah, tr.lang) })} — {tr('برواية {rawi}', { rawi: tr(rawi.name) })}</b>
          <span><bdi lang="ar">{entry.reciter} · {entry.moshaf}</bdi></span>
          {err && <span className={styles.audioErr} role="alert">{tr('تعذّر تشغيل هذا التسجيل — جرّب قارئاً آخر أو تحقق من الاتصال')}</span>}
        </div>
        <label className={styles.reciterPick}>
          <span className={styles.ctrlLabel}>{tr('القارئ')} · {recitersLabel(tr, list.length)}</span>
          <select value={entry.server} onChange={e => pick(e.target.value)} lang="ar" dir="rtl">
            {list.map(e => <option key={e.server} value={e.server}>{e.reciter} — {e.moshaf}</option>)}
          </select>
        </label>
      </div>

      <div className={styles.seekRow}>
        <span className="nq-num">{clock(time)}</span>
        <input type="range" className={styles.seek} min={0} max={max || 1} step={1} value={Math.min(time, max || 0)} disabled={!max}
          onChange={e => seek(e.target.value)} aria-label={tr('موضع التشغيل')}
          aria-valuetext={`${clock(time)} / ${clock(max)}`} dir={tr.dir}
          style={{ '--p': max ? `${(Math.min(time, max) / max) * 100}%` : '0%' }} />
        <span className="nq-num">{max ? clock(max) : '–:––'}</span>
      </div>

    </div>
  );
}

// Fill {placeholders} in a translated sentence with React nodes.
export function withParts(str, parts) {
  return str.split(/(\{\w+\})/).map((p, i) => {
    const k = p.match(/^\{(\w+)\}$/)?.[1];
    return k && parts[k] !== undefined ? <span key={i} style={{ display: 'contents' }}>{parts[k]}</span> : p;
  });
}
