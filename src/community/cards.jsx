// Room and group cards shared by the hub, the group page and search.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { capi } from './api';
import { toast } from './store';
import { useT, n, fmtTime, fmtDay } from './format';
import { errText } from './errors';
import { Avatar, RIcon, ScopePill, css as s } from './ui';

export function stageNames(room, t) {
  const st = room.stage || [];
  if (!st.length) return room.owner ? room.owner.name : '';
  const names = st.slice(0, 2).map(p => p.name);
  const rest = Math.max(0, (room.speaker_count || st.length) - names.length);
  const list = names.join(t.lang === 'ar' || t.lang === 'ur' ? '، ' : ', ');
  return rest ? t('{names} و{n} آخرون', { names: list, n: n(rest, t.lang) }) : list;
}

export function LiveRoomCard({ room }) {
  const t = useT();
  const stage = (room.stage || []).slice(0, 3);
  return (
    <Link to={`/rooms/${room.id}`} className={`${s.card} ${s.cardLink} ${s.roomCard}`}
      aria-label={`${room.title} — ${t('{n} مستمعاً', { n: n(room.listener_count, t.lang) })}`}>
      <div className={s.roomTop}>
        <span className={s.row} style={{ gap: 6 }}>
          <ScopePill scope={room.gender_scope} />
          {room.visibility === 'group_members' && <span className={s.pill}>{t('لأعضاء الجروب')}</span>}
          {room.locked && <span className={s.pill}><RIcon name="lock" size={13} />{t('مقفلة')}</span>}
        </span>
        <span className={s.metaLine}><RIcon name="headphones" size={16} />{t('{n} مستمعاً', { n: n(room.listener_count, t.lang) })}</span>
      </div>
      <h3 className={s.roomTitle} dir="auto">{room.title}</h3>
      {(stage.length > 0 || room.owner) && (
        <div className={s.roomStage}>
          <span className={s.stack}>{(stage.length ? stage : [room.owner]).map((p, i) => <Avatar key={p.id || i} user={p} size={38} ring={i === 0} />)}</span>
          <span dir="auto">{stageNames(room, t)}</span>
        </div>
      )}
      <div className={s.roomFoot}>
        <RIcon name="users" size={17} />
        <span dir="auto">{room.group ? room.group.name : t('غرفة مستقلة')}</span>
      </div>
    </Link>
  );
}

export function RemindButton({ room, onChange }) {
  const t = useT();
  const [on, setOn] = useState(!!room.reminded);
  const [busy, setBusy] = useState(false);
  async function toggle(e) {
    e.preventDefault(); e.stopPropagation();
    setBusy(true);
    try {
      if (on) await capi.del(`/rooms/${room.id}/reminder`);
      else {
        await capi.post(`/rooms/${room.id}/reminder`);
        import('../native/push').then(m => m.askForPush()).catch(() => {});
        toast(t('سنذكّرك قبل أن تبدأ بعشر دقائق.'));
      }
      setOn(!on); onChange && onChange(!on);
    } catch (err) { toast(errText(t, err), 'error'); }
    finally { setBusy(false); }
  }
  return (
    <button type="button" className={`${s.btn} ${s.btnSm} ${on ? s.btnGhost : s.btnOutline}`} aria-pressed={on} disabled={busy} onClick={toggle}>
      <RIcon name={on ? 'check' : 'bell'} size={18} />{on ? t('سنذكّرك') : t('ذكّرني')}
    </button>
  );
}

export function ScheduledCard({ room, showGroup = true }) {
  const t = useT();
  const navigate = useNavigate();
  const at = room.scheduled_at;
  return (
    <div className={`${s.card} ${s.sched}`} role="group" aria-label={room.title}>
      <div className={s.schedWhen}>
        <small>{fmtDay(at, t)}</small>
        <b className="nq-num">{fmtTime(at, t.lang)}</b>
      </div>
      <button type="button" className={s.schedBody} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'start', font: 'inherit', cursor: 'pointer' }} onClick={() => navigate(`/rooms/${room.id}`)}>
        <h3 dir="auto">{room.title}</h3>
        <span className={s.row} style={{ gap: 6 }}>
          <ScopePill scope={room.gender_scope} />
          {showGroup && <span className={s.faint} dir="auto">{room.group ? room.group.name : (room.owner ? room.owner.name : '')}</span>}
        </span>
      </button>
      {room.my_role === 'owner' ? <Link to={`/rooms/${room.id}`} className={`${s.btn} ${s.btnSm} ${s.btnGhost}`}>{t('إدارة')}</Link> : <RemindButton room={room} />}
    </div>
  );
}

export function GroupTile({ group, invite }) {
  const t = useT();
  return (
    <Link to={`/groups/${group.id}`} className={s.groupTile}>
      <Avatar user={{ id: group.id, name: group.name, photo_url: group.photo_url }} size={52} className={s.gphoto} />
      <b dir="auto">{group.name}</b>
      <small>{invite ? t('دعوة للانضمام') : t('{n} عضواً', { n: n(group.member_count, t.lang) })}</small>
    </Link>
  );
}

export function GroupRow({ group }) {
  const t = useT();
  return (
    <Link to={`/groups/${group.id}`} className={s.personRow} style={{ color: 'inherit' }}>
      <Avatar user={{ id: group.id, name: group.name, photo_url: group.photo_url }} size={48} className={s.gphoto} />
      <span className={s.grow}>
        <b dir="auto">{group.name}</b>
        <small>{group.privacy === 'private' ? t('جروب خاص') : t('جروب عام')} · {t('{n} عضواً', { n: n(group.member_count, t.lang) })}</small>
      </span>
      <ScopePill scope={group.gender_scope} />
    </Link>
  );
}
