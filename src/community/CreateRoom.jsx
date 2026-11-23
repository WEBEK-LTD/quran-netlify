// «افتح غرفة» — title, type, group, who may enter, now or scheduled (design 08).
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { capi } from './api';
import { useT, n } from './format';
import { errText } from './errors';
import { useLoad } from './hooks';
import { RIcon, Seg, ErrorBox, BackButton, css as s } from './ui';

const pad = (x) => String(x).padStart(2, '0');
const localDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function CreateRoom({ profile }) {
  const t = useT();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const own = profile.gender === 'female' ? 'women' : 'men';
  const groups = useLoad(() => capi.get('/community/groups/mine').then(d => d.items || []), []);
  const mineRooms = useLoad(() => capi.get('/rooms?tab=mine&per_page=20').then(d => d.total ?? (d.items || []).length), []);
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState(own);
  const [groupId, setGroupId] = useState(sp.get('group') || '');
  const [visibility, setVisibility] = useState('public_by_type');
  const [when, setWhen] = useState('now');
  const soon = useMemo(() => { const d = new Date(Date.now() + 60 * 60e3); d.setMinutes(0, 0, 0); return d; }, []);
  const [date, setDate] = useState(localDateStr(soon));
  const [time, setTime] = useState(`${pad(soon.getHours())}:00`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const usable = (groups.data || []).filter(g => (g.my_perms || []).some(p => p === 'open_rooms' || p === 'schedule_rooms'));
  const group = usable.find(g => String(g.id) === String(groupId)) || null;
  const scopes = useMemo(() => {
    const allowed = group ? [group.gender_scope, 'mixed'] : [own, 'mixed'];
    return [own, 'mixed'].filter(x => allowed.includes(x));
  }, [group, own]);
  const scopeNow = scopes.includes(scope) ? scope : scopes[0];
  const canNow = !group || (group.my_perms || []).includes('open_rooms');
  const canLater = !group || (group.my_perms || []).includes('schedule_rooms');
  const whenNow = when === 'now' ? (canNow ? 'now' : 'later') : (canLater ? 'later' : 'now');

  const at = whenNow === 'later' && date && time ? new Date(`${date}T${time}`) : null;
  const atBad = whenNow === 'later' && (!at || isNaN(at) || at.getTime() < Date.now() + 60e3 || at.getTime() > Date.now() + 30 * 86400e3);
  const tlen = title.trim().length;
  const valid = tlen >= 3 && !atBad && (canNow || canLater);

  async function submit(e) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    try {
      const body = { title: title.trim(), gender_scope: scopeNow };
      if (group) { body.group_id = group.id; body.visibility = visibility; }
      if (whenNow === 'later') body.scheduled_at = at.toISOString();
      const room = await capi.post('/rooms', body);
      navigate(`/rooms/${room.id}`, { replace: true });
    } catch (e2) { setErr(e2); setBusy(false); }
  }

  const maxD = localDateStr(new Date(Date.now() + 29 * 86400e3));
  return (
    <form className={s.page} onSubmit={submit} noValidate>
      <header className={s.topbar}>
        <BackButton to="/rooms" label={t('إغلاق')} />
        <div className={s.topTitle}><h1 className={s.h1}>{t('افتح غرفة')}</h1></div>
        {typeof mineRooms.data === 'number' && mineRooms.data > 0 && (
          <span className={s.pill}>{t('لك {n} غرف مفتوحة أو مجدولة', { n: n(mineRooms.data, t.lang) })}</span>
        )}
      </header>

      <label className={s.field}>
        <span className={s.label}>{t('عنوان الغرفة')}</span>
        <input className={s.input} value={title} maxLength={60} required dir="auto" onChange={e => setTitle(e.target.value)} placeholder={t('مثال: تدبّر سورة الملك')} aria-describedby="titleHelp" />
        <span id="titleHelp" className={s.counter}>{n(tlen, t.lang)} / {n(60, t.lang)} · {t('اختر عنواناً يوضّح موضوع المجلس')}</span>
      </label>

      <div className={s.field}>
        <span className={s.label} id="scopeL">{t('نوع الغرفة')}</span>
        <Seg label={t('نوع الغرفة')} value={scopeNow} onChange={setScope}
          options={scopes.map(v => ({ value: v, label: v === 'mixed' ? t('مختلطة') : v === 'women' ? t('نساء') : t('رجال') }))} />
        <p className={s.faint}>{t('تظهر لك غرف نوعك أو المختلطة فقط. الغرفة المختلطة يراها الرجال والنساء.')}</p>
      </div>

      {(groups.data && usable.length > 0) && (
        <label className={s.field}>
          <span className={s.label}>{t('الجروب')} <small>({t('اختياري')})</small></span>
          <span className={s.selectWrap}>
            <select className={s.select} value={groupId} onChange={e => setGroupId(e.target.value)}>
              <option value="">{t('بدون جروب — غرفة مستقلة')}</option>
              {usable.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <RIcon name="chevD" size={18} />
          </span>
        </label>
      )}

      {group && (
        <div className={s.field} role="radiogroup" aria-labelledby="visL">
          <span className={s.label} id="visL">{t('من يستطيع الدخول')}</span>
          <button type="button" role="radio" aria-checked={visibility === 'public_by_type'} className={s.choice} onClick={() => setVisibility('public_by_type')}>
            <span className={s.radio} aria-hidden="true" />
            <span><b>{t('للجميع حسب النوع')}</b><small>{t('كل من يناسبه نوع الغرفة يراها ويدخل')}</small></span>
          </button>
          <button type="button" role="radio" aria-checked={visibility === 'group_members'} className={s.choice} onClick={() => setVisibility('group_members')}>
            <span className={s.radio} aria-hidden="true" />
            <span><b>{t('لأعضاء الجروب فقط')}</b><small dir="auto">{t('لا تظهر إلا لأعضاء «{name}»', { name: group.name })}</small></span>
          </button>
        </div>
      )}

      <div className={s.field}>
        <span className={s.label}>{t('متى تبدأ')}</span>
        <Seg label={t('متى تبدأ')} value={whenNow} onChange={setWhen}
          options={[{ value: 'now', label: t('الآن'), disabled: !canNow }, { value: 'later', label: t('جدولة لوقت لاحق'), disabled: !canLater }]} />
        {whenNow === 'later' && (
          <>
            <div className={s.grid2}>
              <label className={s.field}><span className={s.faint}>{t('التاريخ')}</span>
                <input className={s.input} type="date" value={date} min={localDateStr(new Date())} max={maxD} onChange={e => setDate(e.target.value)} />
              </label>
              <label className={s.field}><span className={s.faint}>{t('الوقت')}</span>
                <input className={s.input} type="time" value={time} onChange={e => setTime(e.target.value)} />
              </label>
            </div>
            {atBad ? <p className={s.note} style={{ color: 'var(--danger)' }} role="alert"><RIcon name="info" size={16} />{t('اختر موعداً بعد دقيقة على الأقل وخلال ٣٠ يوماً.')}</p>
              : <p className={s.faint}>{group ? t('سيصل تنبيه لأعضاء الجروب وللمهتمين قبل البدء بـ ١٠ دقائق.') : t('سيصل تنبيه لمتابعيك ولمن طلب التذكير قبل البدء بـ ١٠ دقائق.')}</p>}
          </>
        )}
      </div>

      <div className={s.card} style={{ display: 'flex', gap: 10 }}>
        <RIcon name="info" style={{ color: 'var(--gold)', marginTop: 3 }} />
        <p className={s.muted}>{t('لكل شخص عدد محدود من الغرف المفتوحة والمجدولة في نفس الوقت. الغرف مباشرة فقط ولا تُسجَّل.')}</p>
      </div>

      {err && <ErrorBox text={errText(t, err)} />}

      <div className={s.stickyCta}>
        <button type="submit" className={`${s.btn} ${s.btnGold} ${s.btnBlock}`} disabled={!valid || busy}>
          {busy ? t('لحظة…') : whenNow === 'later' ? t('جدولة الغرفة') : t('افتح الغرفة الآن')}
        </button>
      </div>
    </form>
  );
}
