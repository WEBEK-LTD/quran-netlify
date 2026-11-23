// ─── Radio ───────────────────────────────────────────────────────────────────
// The official national Quran radios (Cairo, Saudi Arabia, Sharjah, Kuwait, Abu Dhabi…)
// and the mp3quran.net 24/7 reciter / tafsir channels, from GET /v1/radio: the server
// checks every stream every 6 h and gives the browser the first working https URL.
// A sticky now-playing bar stays at the bottom while a station is on.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import styles from './RadioPage.module.css';
import { PageHero, Icon, Badge8, toAr } from '../components/ornaments/Ornaments';
import { useTr, intlLocale } from '../l10n';
import { TABS, CAT_LABEL, CAT_ICON, loadStations, stationName, countryName, fold, readFavs, writeFavs } from './radio/stations';
import { useRadioPlayer } from './radio/useRadioPlayer';

function fmtTime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  const p = n => String(n).padStart(2, '0');
  return toAr(h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`);
}

function fmtChecked(iso, lang) {
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : intlLocale(lang), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch { return ''; }
}

const ERRORS = {
  connect: 'تعذّر تشغيل هذه المحطة الآن.',
  unsupported: 'متصفحك لا يدعم تشغيل هذا البث.',
  blocked: 'اضغط «إعادة المحاولة» لبدء التشغيل.',
};

function StationCard({ st, tr, isOn, isLoading, isFav, onPlay, onFav, showCat, featured }) {
  const name = stationName(st, tr.lang);
  const country = countryName(st.country, tr.lang);
  const where = country || (st.source === 'mp3quran' ? 'mp3quran.net' : '');
  return (
    <li className={styles.item}>
      <button type="button"
        className={`nq-card ${styles.card} ${featured ? styles.cardFeat : ''} ${isOn ? styles.cardOn : ''} ${st.status === 'down' ? styles.cardDown : ''}`}
        onClick={() => onPlay(st)} aria-pressed={isOn}
        aria-label={where
          ? tr(isOn ? 'إيقاف {name}، {country}' : 'تشغيل {name}، {country}', { name, country: where })
          : tr(isOn ? 'إيقاف {name}' : 'تشغيل {name}', { name })}>
        <span className={styles.cardHead}>
          <Badge8 icon={CAT_ICON[st.category] || 'radio'} size={featured ? 50 : 46} />
        </span>
        <span className={styles.name} dir="auto">{name}</span>
        <span className={styles.desc}>
          {where && <span><Icon name="globe" />{where}</span>}
        </span>
        <span className={styles.cardFoot}>
          <span className={styles.tags}>
            {showCat && <span className="nq-pill">{tr(CAT_LABEL[st.category])}</span>}
            {st.status === 'down' && <span className={`nq-pill ${styles.pillDown}`}>{tr('متوقفة حالياً')}</span>}
            {st.status === 'unknown' && <span className="nq-pill">{tr('لم تُفحص بعد')}</span>}
            {st.bitrate > 0 && !featured && <span className="nq-pill nq-num">{tr('{n} ك.ب/ث', { n: toAr(st.bitrate) })}</span>}
          </span>
          <span className={styles.playWrap}>
            {isOn && !isLoading && <span className={styles.wave} aria-hidden="true"><i /><i /><i /><i /></span>}
            {isLoading && <span className={styles.spinner} aria-hidden="true" />}
            <span className={`${styles.play} ${isOn ? styles.playOn : ''}`} aria-hidden="true">
              <Icon name={isOn ? 'pause' : 'play'} fill />
            </span>
          </span>
        </span>
      </button>
      <button type="button" className={`${styles.fav} ${isFav ? styles.favOn : ''}`} onClick={() => onFav(st.id)} aria-pressed={isFav}
        aria-label={tr(isFav ? 'إزالة {name} من المفضّلة' : 'إضافة {name} إلى المفضّلة', { name })}>
        <Icon name="heart" fill={isFav} />
      </button>
    </li>
  );
}

export default function RadioPage() {
  const tr = useTr();
  const lang = tr.lang;
  const [data, setData] = useState({ stations: [], checkedAt: null, fallback: false, loading: true });
  const [tab, setTab] = useState('quran');
  const [search, setSearch] = useState('');
  const [showDown, setShowDown] = useState(false);
  const [favs, setFavs] = useState(readFavs);

  const load = useCallback(() => {
    setData(d => ({ ...d, loading: true }));
    let alive = true;
    loadStations().then(r => { if (alive) setData({ ...r, loading: false }); });
    return () => { alive = false; };
  }, []);
  useEffect(load, [load]);

  const all = data.stations;
  const visible = useMemo(() => all.filter(s => s.url && (showDown || s.status !== 'down')), [all, showDown]);
  const downCount = all.filter(s => s.status === 'down').length;
  const featured = visible.filter(s => s.featured);
  const favSet = new Set(favs);

  const q = fold(search);
  const matches = s => [s.name_ar, s.name_en, countryName(s.country, lang), countryName(s.country, 'ar'), countryName(s.country, 'en'),
    tr(CAT_LABEL[s.category])].some(x => x && fold(x).includes(q));
  const tabConf = TABS.find(t => t.id === tab) || TABS[0];
  const inTab = s => (tabConf.cats ? tabConf.cats.includes(s.category) : favSet.has(s.id));
  // the national radios already have their own row above the «official» tab
  const list = q ? visible.filter(matches) : visible.filter(s => inTab(s) && !(tab === 'quran' && s.featured && !showDown));
  const count = t => visible.filter(s => (t.cats ? t.cats.includes(s.category) : favSet.has(s.id))).length;

  // next / previous station for «جرّب محطة أخرى» and the lock-screen buttons
  const poolRef = useRef([]);
  poolRef.current = (list.length > 1 ? list : visible).filter(s => s.status !== 'down');
  const neighbour = useCallback((cur, step) => {
    const pool = poolRef.current.length ? poolRef.current : [];
    if (!pool.length) return null;
    const i = cur ? pool.findIndex(s => s.id === cur.id) : -1;
    const n = pool[((i < 0 ? (step > 0 ? -1 : 0) : i) + step + pool.length) % pool.length];
    return n && (!cur || n.id !== cur.id) ? n : null;
  }, []);
  const meta = useCallback(st => ({
    title: stationName(st, lang),
    artist: tr('نور القرآن'),
    album: countryName(st.country, lang) || tr(CAT_LABEL[st.category]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lang]);
  const player = useRadioPlayer({ meta, neighbour });
  const cur = player.station;
  const active = player.phase === 'playing' || player.phase === 'connecting';
  const loading = player.phase === 'connecting' || player.buffering;

  function toggleFav(id) {
    setFavs(f => {
      const next = f.includes(id) ? f.filter(x => x !== id) : [...f, id];
      writeFavs(next);
      return next;
    });
  }
  function tryAnother() {
    const n = neighbour(cur, 1);
    if (n) player.play(n); else player.stop();
  }

  const card = (st, opts = {}) => (
    <StationCard key={st.id} st={st} tr={tr} featured={opts.featured} showCat={opts.showCat}
      isOn={!!cur && cur.id === st.id && active} isLoading={!!cur && cur.id === st.id && active && loading}
      isFav={favSet.has(st.id)} onPlay={player.toggle} onFav={toggleFav} />
  );

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow={tr('بثّ مباشر')}
        title={tr('الإذاعة')}
        sub={tr('إذاعات القرآن الكريم الرسمية من مصر والسعودية والإمارات والكويت وسائر البلاد العربية، وتلاوات متواصلة لكبار القرّاء على مدار الساعة.')}
      />

      <div className={`nq-wrap ${styles.wrap}`}>
        {data.loading && (
          <div className={styles.fetching} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            <span>{tr('جارٍ تحميل المحطات…')}</span>
          </div>
        )}

        {!data.loading && data.fallback && (
          <div className={styles.notice} role="status">
            <Icon name="radio" />
            <span>{tr('تعذّر تحميل قائمة المحطات الكاملة، فنعرض الإذاعات الرئيسية فقط.')}</span>
            <button type="button" className="nq-btn ghost sm" onClick={load}>{tr('إعادة المحاولة')}</button>
          </div>
        )}

        {featured.length > 0 && !q && (
          <section className={styles.featured} aria-labelledby="rd-feat">
            <h2 id="rd-feat" className={styles.h2}><Icon name="star" />{tr('إذاعات القرآن الكريم الوطنية')}</h2>
            <ul className={styles.featGrid}>{featured.map(st => card(st, { featured: true }))}</ul>
          </section>
        )}

        {!data.loading && (
          <div className={styles.tools}>
            <div className={`nq-seg ${styles.cats}`} role="group" aria-label={tr('فئات المحطات')}>
              {TABS.map(t => (
                <button key={t.id} type="button" aria-pressed={!q && tab === t.id} onClick={() => { setTab(t.id); setSearch(''); }}>
                  <Icon name={t.icon} />{tr(t.label)}
                  <small className="nq-num">{toAr(count(t))}</small>
                </button>
              ))}
            </div>
            <label className={`nq-input ${styles.search}`}>
              <Icon name="search" />
              <span className="nq-sr">{tr('ابحث في المحطات')}</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('ابحث باسم المحطة أو القارئ أو البلد…')} dir={tr.dir} type="search" />
              {search && <button type="button" className={styles.clear} onClick={() => setSearch('')} aria-label={tr('مسح البحث')}><Icon name="x" /></button>}
            </label>
          </div>
        )}

        {!data.loading && downCount > 0 && (
          <div className={styles.subTools}>
            {q && <span className={styles.resultsFor}>{tr('نتائج البحث في كل الفئات')}</span>}
            <button type="button" className={`nq-pill ${showDown ? 'on' : ''} ${styles.downToggle}`} aria-pressed={showDown} onClick={() => setShowDown(v => !v)}>
              <span className={styles.box} aria-hidden="true">{showDown && <Icon name="check" />}</span>
              {tr('إظهار المحطات المتوقفة')} <span className="nq-num">({toAr(downCount)})</span>
            </button>
          </div>
        )}

        {!data.loading && list.length === 0 && (
          <div className={`nq-card ${styles.empty}`}>
            <Badge8 icon={tab === 'fav' && !q ? 'heart' : 'radio'} size={64} />
            <p>{q ? tr('لا توجد محطات مطابقة لبحثك.')
              : tab === 'fav' ? tr('لم تُضف محطات إلى المفضّلة بعد. اضغط على القلب في بطاقة أي محطة لإضافتها.')
                : tr('لا توجد محطات في هذه الفئة حالياً. حاول لاحقاً.')}</p>
            {q && <button type="button" className="nq-btn ghost sm" onClick={() => setSearch('')}>{tr('مسح البحث')}</button>}
          </div>
        )}

        {list.length > 0 && <ul className={styles.grid}>{list.map(st => card(st, { showCat: !!q || tab === 'fav' }))}</ul>}

        {!data.loading && (
          <p className={styles.note}>
            <Icon name="shield" />
            <span>
              {tr('نفحص كل محطة على خادم نور القرآن كل ٦ ساعات، ونعرض البث الآمن (HTTPS) الذي يعمل فقط. التلاوات المتواصلة من mp3quran.net.')}
              {data.checkedAt && <> {tr('آخر فحص: {time}', { time: fmtChecked(data.checkedAt, lang) })}</>}
            </span>
          </p>
        )}

        {cur && player.phase !== 'idle' && (
          <div className={`nq-card ${styles.np} ${player.phase === 'error' ? styles.npErr : ''}`} role="region" aria-label={tr('المحطة قيد التشغيل')}>
            <span className={styles.npIcon}>
              {loading ? <span className={styles.spinner} aria-hidden="true" /> : <Badge8 icon={CAT_ICON[cur.category] || 'radio'} size={50} />}
            </span>
            <span className={styles.npInfo}>
              {player.phase === 'error' ? (
                <span className={`${styles.live} ${styles.liveErr}`} role="alert">
                  <i className={styles.dotErr} aria-hidden="true" />{tr(ERRORS[player.error] || ERRORS.connect)}
                </span>
              ) : (
                <span className={styles.live} aria-live="polite">
                  <i className={loading ? styles.dotWait : styles.dot} aria-hidden="true" />
                  {loading ? tr('جارٍ الاتصال…') : tr('يبث الآن')}
                  {!loading && <b className="nq-num">{fmtTime(player.elapsed)}</b>}
                </span>
              )}
              <span className={styles.npName} dir="auto">{stationName(cur, lang)}</span>
              {(cur.country || cur.source === 'mp3quran') && <span className={styles.npDesc}>{countryName(cur.country, lang) || 'mp3quran.net'}</span>}
            </span>
            {player.phase === 'error' ? (
              <span className={styles.npActions}>
                <button type="button" className="nq-btn ghost sm" onClick={player.retry}>{tr('إعادة المحاولة')}</button>
                <button type="button" className="nq-btn gold sm" onClick={tryAnother}>{tr('جرّب محطة أخرى')}</button>
                <button type="button" className="nq-ibtn" onClick={player.stop} aria-label={tr('إغلاق')}><Icon name="x" /></button>
              </span>
            ) : (
              <>
                <span className={styles.vol}>
                  <button type="button" className="nq-ibtn" onClick={() => player.setMuted(m => !m)} aria-pressed={player.muted}
                    aria-label={player.muted ? tr('إلغاء كتم الصوت') : tr('كتم الصوت')}>
                    <Icon name={player.muted ? 'x' : 'head'} />
                  </button>
                  <input type="range" min="0" max="1" step="0.05" aria-label={tr('مستوى الصوت')}
                    value={player.muted ? 0 : player.volume} className={styles.slider} style={{ '--v': `${(player.muted ? 0 : player.volume) * 100}%` }}
                    onChange={e => player.setVolume(+e.target.value)} />
                  <span className={`${styles.volVal} nq-num`}>{tr('{n}٪', { n: toAr(Math.round((player.muted ? 0 : player.volume) * 100)) })}</span>
                </span>
                <button type="button" className={styles.stop} onClick={player.stop} aria-label={tr('إيقاف البث')}>
                  <Icon name="pause" fill />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
