// ─── The room's shared mushaf («المصحف المشترك», design 09) ─────────────────
// The host/moderators set one position (PUT /rooms/{id}/page {surah, ayah, page});
// everyone sees the whole Madani page around it with that ayah highlighted.
//   host / moderators  every move is shared at once: next/previous ayah, next/previous
//                      page (its first ayah), tap any ayah on the page, or pick surah+ayah.
//   everyone else      follows the host by default. Swiping, the page arrows or the picker
//                      browse locally (nothing is sent); «العودة لموضع المضيف» follows again.
//                      While browsing, a host move shows «المضيف انتقل إلى …» instead of
//                      pulling the page away.
// The Quran text is the site's own Uthmani text (fetchSurahAyahs, cached per surah) and
// goes through the reader's buildItems (basmala line, Al-Fatiha's Madani count).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, n } from './format';
import { RIcon, Sheet, css as s } from './ui';
import { surahName } from '../l10n';
import { SURAHS_META } from '../data';
import { fetchSurahAyahs, cachedSurahAyahs, prefetchSurahAyahs } from '../api';
import { buildItems, BASMALA_TEXT } from '../components/reader/ayahItems';
import { AyahMark } from '../components/ornaments/Ornaments';
import { PAGES, pageOf, pageStart, pageSegments, stepAyah } from './mushafPages';

const ayahCount = (surah) => (SURAHS_META[surah - 1] || [])[2] || 1;
const keyOf = (p) => (p ? `${p.surah}:${p.ayah}` : '');

// surah → buildItems() result, from the shared text cache (memory + localStorage)
function useSurahItems(surahs) {
  const [tick, setTick] = useState(0);
  const want = surahs.join(',');
  useEffect(() => {
    let alive = true;
    surahs.forEach(x => { if (!cachedSurahAyahs(x)) fetchSurahAyahs(x).then(() => alive && setTick(v => v + 1)).catch(() => alive && setTick(v => v + 1)); });
    return () => { alive = false; };
  }, [want]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const out = {};
    surahs.forEach(x => { const list = cachedSurahAyahs(x); out[x] = list ? buildItems(x, list) : null; });
    return out;
  }, [want, tick]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function refText(t, pos) {
  if (!pos) return '';
  return `${surahName(pos.surah, t.lang)} · ${n(pos.ayah, t.lang)}`;
}

export default function SharedMushaf({ shared, canSet, onMove }) {
  const t = useT();
  const navigate = useNavigate();
  const hostPage = shared ? pageOf(shared.surah, shared.ayah) : 1;
  const [following, setFollowing] = useState(true);
  const [localPage, setLocalPage] = useState(hostPage);
  const [seenKey, setSeenKey] = useState(keyOf(shared));   // host position when I started browsing
  const [pick, setPick] = useState(false);
  const scrollRef = useRef(null);
  const touch = useRef(null);
  const follow = canSet || following;                      // the host always sees the shared position
  const page = follow ? hostPage : localPage;
  const hostMoved = !follow && shared && keyOf(shared) !== seenKey;

  const segs = useMemo(() => pageSegments(page), [page]);
  const items = useSurahItems(segs.map(x => x.surah));
  const ready = segs.every(x => items[x.surah]);

  // warm the neighbouring pages' surahs so a swipe shows text at once
  useEffect(() => {
    if (!ready) return;
    [page - 1, page + 1].filter(p => p >= 1 && p <= PAGES).forEach(p => pageSegments(p).forEach(x => prefetchSurahAyahs(x.surah)));
  }, [page, ready]);

  // keep the highlighted ayah in view inside the card (never scrolls the room itself);
  // a page I turned myself starts at its top, and a host move never scrolls a page I'm reading
  const shownPage = useRef(0);
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || !ready) return;
    const turned = shownPage.current !== page;
    shownPage.current = page;
    const el = follow && shared ? box.querySelector('[data-cur="1"]') : null;
    if (!el) { if (turned) box.scrollTop = 0; return; }
    const top = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: turned ? 'auto' : 'smooth' });
  }, [page, ready, follow, shared && shared.surah, shared && shared.ayah]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shared) {
    if (!canSet) return null;
    return (
      <>
        <button type="button" className={`${s.card} ${s.cardLink}`} style={{ display: 'flex', gap: 10, alignItems: 'center' }} onClick={() => setPick(true)}>
          <RIcon name="book" style={{ color: 'var(--gold)' }} />
          <span className={s.grow}><b>{t('المصحف المشترك')}</b><span className={s.faint} style={{ display: 'block' }}>{t('اختر آية تظهر لكل من في الغرفة')}</span></span>
        </button>
        <JumpSheet open={pick} onClose={() => setPick(false)} start={{ surah: 1, ayah: 1 }} host onGo={(p) => { setPick(false); onMove(p); }} />
      </>
    );
  }

  // ── moves ──
  const browse = (p) => {
    const next = Math.min(PAGES, Math.max(1, p));
    if (canSet) { onMove(pageStart(next)); return; }
    if (follow) setSeenKey(keyOf(shared));
    setFollowing(false);
    setLocalPage(next);
  };
  const backToHost = () => { setFollowing(true); setSeenKey(keyOf(shared)); };
  const stepHost = (dir) => { const x = stepAyah(shared.surah, shared.ayah, dir); if (x) onMove(x); };
  const go = (p) => {
    setPick(false);
    if (canSet) { onMove(p); return; }
    browse(pageOf(p.surah, p.ayah));
  };

  // swipe like a printed mushaf: finger to the right → next page (pages run right-to-left)
  const onTouchStart = (e) => { const x = e.touches[0]; touch.current = { x: x.clientX, y: x.clientY, at: Date.now() }; };
  const onTouchEnd = (e) => {
    const st = touch.current; touch.current = null;
    if (!st) return;
    const x = e.changedTouches[0];
    const dx = x.clientX - st.x, dy = x.clientY - st.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - st.at > 900) return;
    browse(page + (dx > 0 ? 1 : -1));
  };

  const hostRef = `${surahName(shared.surah, t.lang)} · ${n(shared.ayah, t.lang)} · ${t('ص {n}', { n: n(hostPage, t.lang) })}`;
  const curKey = follow ? keyOf(shared) : null;
  const openAt = follow ? shared : pageStart(page);

  const tapAyah = canSet ? (surah, ayah) => onMove({ surah, ayah }) : null;

  return (
    <section className={s.mushaf} aria-labelledby="mushafH">
      <div className={s.mushafIn}>
        <div className={s.mushafHead}>
          <span className={s.row} style={{ gap: 6 }}><RIcon name="book" size={18} style={{ color: 'var(--gold)' }} /><b id="mushafH">{t('المصحف المشترك')}</b><span>· {t('يحدده المضيف')}</span></span>
          <span aria-live="polite">{hostRef}</span>
        </div>

        {!canSet && (follow ? (
          <span className={s.mFollow}><RIcon name="check" size={15} />{t('تتابع المضيف')}<span className={s.faint}>· {t('اسحب أو استخدم الأسهم لتتصفح وحدك')}</span></span>
        ) : (
          <div className={`${s.mAway}${hostMoved ? ' ' + s.mAwayMoved : ''}`} role="status">
            <span className={s.grow}>{hostMoved
              ? t('المضيف انتقل إلى {ref}', { ref: refText(t, shared) })
              : t('تتصفح وحدك · المضيف عند {ref}', { ref: refText(t, shared) })}</span>
            <button type="button" className={`${s.btn} ${s.btnSm} ${hostMoved ? s.btnGold : s.btnOutline}`} onClick={backToHost}>
              <RIcon name="refresh" size={16} />{hostMoved ? t('تابع المضيف') : t('العودة لموضع المضيف')}
            </button>
          </div>
        ))}

        <div ref={scrollRef} className={s.mPage} dir="rtl" lang="ar" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
          role="region" aria-label={t('صفحة {n} من المصحف', { n: n(page, t.lang) })} tabIndex={0}>
          {!ready ? (
            <div className={s.mWait} aria-busy="true"><i /><i /><i /><i /></div>
          ) : segs.map(seg => {
            const b = items[seg.surah];
            const list = b.items.filter(it => it.kufi >= seg.from && it.kufi <= seg.to);
            const head = seg.from === 1;
            const basmalaCur = curKey === `${seg.surah}:1` && b.basmalaKufi === 1;
            return (
              <div key={seg.surah} className={s.mSeg}>
                {head && <div className={s.mSurah}><span>{`سورة ${surahName(seg.surah, 'ar')}`}</span></div>}
                {head && b.basmala && (
                  <p className={`${s.mBasmala}${basmalaCur ? ' ' + s.mCur : ''}`} data-cur={basmalaCur ? '1' : undefined}>{BASMALA_TEXT}</p>
                )}
                <p className={s.mText}>
                  {list.map(it => {
                    const cur = curKey === `${seg.surah}:${it.kufi}`;
                    const cls = `${s.mAy}${cur ? ' ' + s.mCur : ''}${tapAyah ? ' ' + s.mTap : ''}`;
                    const body = <>{it.text}{' '}<AyahMark n={it.label} /></>;
                    return tapAyah ? (
                      <span key={it.uid} className={cls} data-cur={cur ? '1' : undefined} role="button" tabIndex={0} aria-current={cur ? 'true' : undefined}
                        aria-label={`${t('اعرض هذه الآية للجميع')}: ${surahName(seg.surah, t.lang)} ${n(it.label, t.lang)}`}
                        onClick={() => tapAyah(seg.surah, it.kufi)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapAyah(seg.surah, it.kufi); } }}>{body}{' '}</span>
                    ) : (
                      <span key={it.uid} className={cls} data-cur={cur ? '1' : undefined} aria-current={cur ? 'true' : undefined}>{body}{' '}</span>
                    );
                  })}
                </p>
              </div>
            );
          })}
        </div>

        {/* page arrows (the row follows the mushaf: next page on the left) */}
        <div className={s.mNav} dir="rtl">
          <button type="button" className={s.mNavBtn} disabled={page <= 1} onClick={() => browse(page - 1)} aria-label={t('الصفحة السابقة')}>
            <RIcon name="back" size={20} /><span dir="auto">{t('السابقة')}</span>
          </button>
          <button type="button" className={s.mPageBtn} onClick={() => setPick(true)} aria-haspopup="dialog" aria-label={`${t('ص {n}', { n: n(page, t.lang) })} — ${t('اختر سورة وآية')}`}>
            <b dir="auto">{t('ص {n}', { n: n(page, t.lang) })}</b><RIcon name="chevD" size={16} />
          </button>
          <button type="button" className={s.mNavBtn} disabled={page >= PAGES} onClick={() => browse(page + 1)} aria-label={t('الصفحة التالية')}>
            <span dir="auto">{t('التالية')}</span><RIcon name="next" size={20} />
          </button>
        </div>

        {canSet && (
          <div className={s.mHost} role="group" aria-label={t('تحريك الموضع للجميع')} dir="rtl">
            <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGhost}`} onClick={() => stepHost(-1)} disabled={shared.surah === 1 && shared.ayah === 1}>
              <RIcon name="back" size={16} /><span dir="auto">{t('الآية السابقة')}</span>
            </button>
            <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnGold}`} onClick={() => stepHost(1)} disabled={shared.surah === 114 && shared.ayah === ayahCount(114)} data-host-next>
              <span dir="auto">{t('الآية التالية')}</span><RIcon name="next" size={16} />
            </button>
          </div>
        )}

        <div className={s.mushafFoot}>
          <span className={s.faint}>{canSet ? t('اضغط على أي آية لتظهر لكل من في الغرفة') : (follow ? t('ظاهرة لكل من في الغرفة') : '')}</span>
          <button type="button" className={`${s.btn} ${s.btnSm} ${s.btnOutline}`} onClick={() => navigate(`/reader?surah=${openAt.surah}&ayah=${openAt.ayah}`)}>{t('افتحها في مصحفي')}</button>
        </div>
      </div>
      <JumpSheet open={pick} onClose={() => setPick(false)} start={follow ? shared : pageStart(page)} host={canSet} onGo={go} />
    </section>
  );
}

// ── pick a surah and an ayah ────────────────────────────────────────────────
function JumpSheet({ open, onClose, start, host, onGo }) {
  const t = useT();
  const [surah, setSurah] = useState(start.surah);
  const [ayah, setAyah] = useState(start.ayah);
  useEffect(() => { if (open) { setSurah(start.surah); setAyah(start.ayah); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = ayahCount(surah);
  const surahs = useMemo(() => SURAHS_META.map((m, i) => ({ v: i + 1, l: `${n(i + 1, t.lang)} · ${surahName(i + 1, t.lang)}` })), [t.lang]);
  const ayahs = useMemo(() => Array.from({ length: max }, (_, i) => i + 1), [max]);
  return (
    <Sheet open={open} onClose={onClose} title={t('اختر سورة وآية')} sub={host ? t('تظهر لكل من في الغرفة') : t('للتصفح وحدك — لا يتغيّر شيء عند الآخرين')}>
      <div className={s.grid2} style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }}>
        <label className={s.field}><span className={s.faint}>{t('السورة')}</span>
          <span className={s.selectWrap}>
            <select className={s.select} value={surah} onChange={e => { setSurah(+e.target.value); setAyah(1); }} data-autofocus>
              {surahs.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}
            </select><RIcon name="chevD" size={16} />
          </span>
        </label>
        <label className={s.field}><span className={s.faint}>{t('الآية')}</span>
          <span className={s.selectWrap}>
            <select className={s.select} value={ayah} onChange={e => setAyah(+e.target.value)}>
              {ayahs.map(x => <option key={x} value={x}>{n(x, t.lang)}</option>)}
            </select><RIcon name="chevD" size={16} />
          </span>
        </label>
      </div>
      <p className={s.faint} style={{ marginTop: 10 }}>{t('ص {n}', { n: n(pageOf(surah, ayah), t.lang) })}</p>
      <div className={s.rowEnd}>
        <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onClose}>{t('إلغاء')}</button>
        <button type="button" className={`${s.btn} ${s.btnGold}`} onClick={() => onGo({ surah, ayah })}>{host ? t('اعرضها للجميع') : t('اذهب إليها')}</button>
      </div>
    </Sheet>
  );
}
