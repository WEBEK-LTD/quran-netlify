// «اكتشف الجروبات» — public groups of my type and mixed ones, with search.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { capi, qs } from './api';
import { useT } from './format';
import { errText } from './errors';
import { Spinner, ErrorBox, TopBar, css as s } from './ui';
import { GroupRow } from './cards';

export default function GroupsDiscover() {
  const t = useT();
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState(null);
  const timer = useRef(null);
  const load = async (p, query) => {
    try {
      const d = await capi.get(`/community/groups${qs({ q: query.trim().length >= 2 ? query.trim() : '', page: p, per_page: 30 })}`);
      setItems(prev => (p === 1 ? d.items : [...(prev || []), ...d.items]));
      setMore(d.page * d.per_page < d.total); setPage(p); setErr(null);
    } catch (e) { setErr(e); }
  };
  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(() => load(1, q), q ? 350 : 0); return () => clearTimeout(timer.current); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={s.page}>
      <TopBar title={t('اكتشف الجروبات')} backTo="/rooms">
        <Link to="/groups/new" className={`${s.btn} ${s.btnSm} ${s.btnOutline}`}>{t('أنشئ جروباً')}</Link>
      </TopBar>
      <input className={s.input} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('ابحث باسم الجروب…')} aria-label={t('ابحث باسم الجروب…')} />
      {err && !items ? <ErrorBox text={errText(t, err)} onRetry={() => load(1, q)} /> : !items ? <Spinner /> : items.length === 0 ? <p className={s.muted}>{t('لا توجد جروبات مطابقة.')}</p> : (
        <ul className={s.list} style={{ gap: 0 }}>{items.map(g => <li key={g.id}><GroupRow group={g} /></li>)}</ul>
      )}
      {more && <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => load(page + 1, q)}>{t('عرض المزيد')}</button>}
    </div>
  );
}
