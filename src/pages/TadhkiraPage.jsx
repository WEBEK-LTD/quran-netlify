// ─── «تذكرة من كتاب الله لقلبك اليوم» ────────────────────────────────────────
// A closed gift; opening it (about 2.5 s: the lid lifts off, light spreads, a
// gilded card rises) shows today's ayah for this person, with its reference,
// a theme, the muyassar tafsir, listen / share / save, and — outside Arabic —
// the translation of its meaning. One ayah per person per day: see
// src/tadhkira/select.js. The home card links here with ?open=1.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PageHero, Icon, Badge8, Corners, Pattern, Divider, AyahMark } from '../components/ornaments/Ornaments';
import { useTr, num, isRtl } from '../l10n';
import { tadTr } from '../locales/tadhkira';
import { useStore } from '../store';
import { useAuth } from '../hooks/useAuth';
import { fetchAyahWithTafsir } from '../api';
import Gift from '../tadhkira/Gift';
import { AYAT, parseRef } from '../tadhkira/ayat';
import { useTadhkira, useTadhkiraEntry, entryText, isSaved, toggleSaved, refLabel } from '../tadhkira/useTadhkira';
import styles from './TadhkiraPage.module.css';

const OPEN_MS = 2500;

const reducedMotion = () => {
  try {
    return document.documentElement.dataset.reduce === 'on' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
};

export default function TadhkiraPage() {
  const tr = tadTr(useTr());
  const lang = tr.lang;
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTadhkira();
  // closed → opening (animation) → open
  const [phase, setPhase] = useState(() => (t.opened ? 'open' : 'closed'));
  const [said, setSaid] = useState('');
  const cardRef = useRef(null);
  const timer = useRef(null);
  const { entry, meaning, error, retry } = useTadhkiraEntry(t.ref, lang);

  // a new day while the page is open: back to a closed gift
  useEffect(() => { if (!t.opened && phase === 'open') setPhase('closed'); }, [t.opened, phase]);

  function open() {
    if (phase !== 'closed') return;
    t.open();
    if (reducedMotion()) { setPhase('open'); return; }
    setPhase('opening');
    timer.current = setTimeout(() => setPhase('open'), OPEN_MS);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  // from the home card: open straight away (once auth has settled, so the
  // signed-in seed is used), then drop ?open=1 from the address
  const autoOpen = new URLSearchParams(location.search).get('open') === '1';
  useEffect(() => {
    if (!autoOpen || !t.ready) return;
    navigate('/tadhkira', { replace: true });
    if (!t.opened) open();
  }, [autoOpen, t.ready]);   // eslint-disable-line react-hooks/exhaustive-deps

  // announce + move focus to the card once it is shown
  const label = refLabel(tr, t.ref, entry?.part);
  useEffect(() => {
    if (phase === 'open' && entry) {
      setSaid(tr('فُتحت تذكرتك: {ref}', { ref: label }));
      if (document.activeElement === document.body || document.activeElement?.dataset?.gift) cardRef.current?.focus({ preventScroll: false });
    }
  }, [phase, entry]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow={tr('تذكرتك اليوم')}
        title={tr('تذكرة من كتاب الله لقلبك اليوم')}
        sub={tr('آيةٌ من كتاب الله تُفتح لك كل يوم، فيها رجاءٌ وطمأنينة.')}
      />

      <div className={`nq-wrap ${styles.body}`}>
        <section className={`${styles.scene} ${styles[phase]}`} aria-label={tr('تذكرة من كتاب الله لقلبك اليوم')}>
          <div className={styles.rays} aria-hidden="true" />
          {phase !== 'open' && (
            <button type="button" className={styles.giftBtn} onClick={open} disabled={phase === 'opening'} data-gift="1"
              aria-label={tr('افتح تذكرتك اليوم')}>
              <Gift opening={phase === 'opening'} className={styles.gift} />
              <span className={styles.hint}>{phase === 'opening' ? tr('تُفتح تذكرتك…') : tr('اضغط لتفتح تذكرتك اليوم')}</span>
            </button>
          )}

          {phase !== 'closed' && (
            <TadhkiraCard ref_={cardRef} tr={tr} t={t} entry={entry} meaning={meaning} error={error} retry={retry} label={label} rising={phase === 'opening'} />
          )}
          <p className="nq-sr" aria-live="polite" role="status">{said}</p>
        </section>

        <p className={styles.rule}>
          <Icon name="star" />
          {tr('كل يوم آية جديدة من {n} آية مختارة في الرجاء، لا تتكرر عليك حتى تمرّ بها كلها.', { n: num(AYAT.length) })}
        </p>
      </div>
    </div>
  );
}

function TadhkiraCard({ ref_, tr, t, entry, meaning, error, retry, label, rising }) {
  const [state] = useStore();
  const { user } = useAuth();
  const { s, a } = parseRef(t.ref);
  const saved = isSaved(state.bookmarks, t.ref);
  const [tafsirOpen, setTafsirOpen] = useState(false);
  const rtl = isRtl(tr.lang);

  function share() {
    if (!entry) return;
    const { b } = parseRef(t.ref);
    window.dispatchEvent(new CustomEvent('shareAyah', { detail: { surah: s, ayah: a === b ? a : `${a}-${b}`, text: entryText(entry) } }));
  }

  return (
    <article ref={ref_} tabIndex={-1} className={`nq-card ${styles.card} ${rising ? styles.rise : ''}`} aria-labelledby="tadh-ref" aria-busy={!entry && !error}>
      <Pattern />
      <Corners />
      <div className={styles.cardIn}>
        <span className={styles.theme} aria-label={tr('تذكرة اليوم: {theme}', { theme: tr(t.themeName) })}>
          <Badge8 icon="heart" size={30} />{tr(t.themeName)}
        </span>

        {entry ? (
          <p className={`nq-q ${styles.ayah}`} lang="ar" dir="rtl">
            {entry.seg.map(([n, text, whole]) => (
              <span key={n}>{text}{whole !== 0 ? <>{' '}<AyahMark n={n} /></> : null}{' '}</span>
            ))}
          </p>
        ) : error ? (
          <div className={styles.err} role="alert">
            <p>{tr('تعذّر تحميل التذكرة. تحقّق من اتصالك ثم أعد المحاولة.')}</p>
            <button type="button" className="nq-btn ghost sm" onClick={retry}><Icon name="repeat" />{tr('أعد المحاولة')}</button>
          </div>
        ) : (
          <div className={styles.waitQ} aria-hidden="true"><span /><span /></div>
        )}

        <Divider />
        <h2 id="tadh-ref" className={styles.ref}>{label}</h2>

        {meaning && meaning.parts.length > 0 && (
          <blockquote className={styles.meaning} lang={tr.lang} dir={rtl ? 'rtl' : 'ltr'}>
            <p>
              {meaning.parts.map(([n, text], k) => (
                <span key={n}>{text}{meaning.parts.length > 1 || entry?.seg.length > 1 ? <span className={styles.mnum}> ({num(n.replace('-', '–'))})</span> : null}{k < meaning.parts.length - 1 ? ' ' : ''}</span>
              ))}
            </p>
            <small>{tr('ترجمة معاني الآية: {name}', { name: meaning.label })}</small>
          </blockquote>
        )}

        <div className={styles.actions}>
          <button type="button" className={`nq-btn ghost ${tafsirOpen ? styles.on : ''}`} aria-expanded={tafsirOpen} aria-controls="tadh-tafsir"
            onClick={() => setTafsirOpen(v => !v)}>
            <Icon name="doc" />{tr('التفسير الميسّر')}
          </button>
          <Link className="nq-btn ghost" to={`/reader?surah=${s}&ayah=${a}`} aria-label={tr('استمع إلى التلاوة في المصحف')}>
            <Icon name="head" />{tr('استمع')}
          </Link>
          <button type="button" className="nq-btn ghost" onClick={share} disabled={!entry}>
            <Icon name="share" />{tr('شارك كصورة')}
          </button>
          <button type="button" className={`nq-btn ghost ${saved ? styles.on : ''}`} aria-pressed={saved}
            aria-label={saved ? tr('إزالة من المفضلة') : tr('احفظ في المفضلة')}
            onClick={() => toggleSaved(t.ref, user)}>
            <Icon name="bookmark" fill={saved} />{saved ? tr('محفوظة') : tr('احفظ')}
          </button>
        </div>

        {tafsirOpen && <Tafsir tr={tr} refStr={t.ref} />}

        <p className={styles.renew}><Icon name="calendar" />{tr('تذكرتك لهذا اليوم — تتجدد غداً')}</p>
      </div>
    </article>
  );
}

// التفسير الميسّر, from the site's tafsir source (api.alquran.cloud, ar.muyassar)
function Tafsir({ tr, refStr }) {
  const [st, setSt] = useState({ state: 'loading', items: [] });
  const [attempt, setAttempt] = useState(0);
  const ayat = useMemo(() => { const { s, a, b } = parseRef(refStr); return Array.from({ length: b - a + 1 }, (_, k) => [s, a + k]); }, [refStr]);
  useEffect(() => {
    let alive = true;
    setSt({ state: 'loading', items: [] });
    Promise.all(ayat.map(([s, n]) => fetchAyahWithTafsir(s, n).then(r => [n, String(r.tafsir || '').trim()])))
      .then(rows => {
        if (!alive) return;
        // the muyassar often explains several ayat in one passage, repeated on each
        const items = [];
        for (const [n, text] of rows) {
          if (!text) continue;
          const last = items[items.length - 1];
          if (last && last.text === text) last.to = n; else items.push({ from: n, to: n, text });
        }
        setSt({ state: items.length ? 'ready' : 'error', items });
      })
      .catch(() => { if (alive) setSt({ state: 'error', items: [] }); });
    return () => { alive = false; };
  }, [ayat, attempt]);

  return (
    <section id="tadh-tafsir" className={styles.tafsir} aria-labelledby="tadh-tafsir-h" aria-busy={st.state === 'loading'}>
      <h3 id="tadh-tafsir-h" className={styles.tafsirH}><Badge8 icon="doc" size={34} />{tr('التفسير الميسّر')}</h3>
      {st.state === 'loading' && <div className={styles.waitLines} aria-label={tr('جارٍ تحميل التفسير')} role="img"><span /><span /><span /></div>}
      {st.state === 'ready' && st.items.map(it => (
        <p key={it.from} className={styles.tafsirText} lang="ar" dir="rtl">
          {st.items.length > 1 && <b className={styles.tnum}>({num(it.from, 'ar')}{it.to !== it.from ? `–${num(it.to, 'ar')}` : ''}) </b>}
          {it.text}
        </p>
      ))}
      {st.state === 'error' && (
        <div className={styles.err} role="alert">
          <p>{tr('تعذّر تحميل التفسير الآن.')}</p>
          <button type="button" className="nq-btn ghost sm" onClick={() => setAttempt(n => n + 1)}><Icon name="repeat" />{tr('أعد المحاولة')}</button>
        </div>
      )}
      <p className={styles.source}>{tr('المصدر: التفسير الميسّر — مجمع الملك فهد لطباعة المصحف الشريف.')}{tr.lang !== 'ar' && <> · {tr('التفسير بالعربية')}</>}</p>
    </section>
  );
}
