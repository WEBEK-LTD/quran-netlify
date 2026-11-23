// Moderation of voice rooms & community (الإشراف): reports, held content, suspended accounts, live rooms,
// the dictionary, direct account/group actions and the room limits. API: docs/API.md «Rooms & community» → Admin.
import { useState, useCallback } from 'react';
import { listCommunityReports, listCommunitySuspensions, listCommunityRooms } from '../../adminApi';
import { styles, useLoader, useInterval, useNotice, TabHeader, Toast, Ico, fmtFull } from './shared';
import ReportsPanel from './community/ReportsPanel';
import SuspensionsPanel from './community/SuspensionsPanel';
import RoomsPanel from './community/RoomsPanel';
import DictionaryPanel from './community/DictionaryPanel';
import AccountsPanel from './community/AccountsPanel';
import LimitsPanel from './community/LimitsPanel';

const SECTIONS = [
  { id: 'reports',     label: 'البلاغات',            icon: 'alert' },
  { id: 'held',        label: 'المحتوى المحجوز',      icon: 'eye' },
  { id: 'suspensions', label: 'الحسابات الموقوفة',    icon: 'ban' },
  { id: 'rooms',       label: 'الغرف الحية',          icon: 'users' },
  { id: 'dictionary',  label: 'القاموس',             icon: 'list' },
  { id: 'accounts',    label: 'إجراءات مباشرة', icon: 'shieldUser' },
  { id: 'limits',      label: 'حدود الغرف',           icon: 'gear' },
];

async function loadCounts() {
  const safe = (p) => p.catch(() => null);
  const [rep, held, sus, rooms] = await Promise.all([
    safe(listCommunityReports({ status: 'open', source: 'user', perPage: 1 })),
    safe(listCommunityReports({ status: 'open', source: 'dictionary', type: 'held', perPage: 1 })),
    safe(listCommunitySuspensions({ source: 'dictionary', perPage: 1 })),
    safe(listCommunityRooms({ status: 'open' })),
  ]);
  const items = rooms?.items || [];
  return {
    reports: rep?.total ?? null,
    held: held?.total ?? null,
    suspensions: sus?.total ?? null,
    rooms: rooms ? (rooms.open_count ?? items.length) : null,
    people: items.reduce((n, r) => n + (Number(r.listener_count) || 0) + (Number(r.speaker_count) || 0), 0),
  };
}

export default function CommunityTab({ onTabChange }) {
  const [section, setSection] = useState('reports');
  const [focusUser, setFocusUser] = useState(null);
  const [notice, showNotice, hideNotice] = useNotice();
  const counts = useLoader(loadCounts, []);
  useInterval(() => counts.reload({ silent: true }), 60_000);
  const c = counts.data || {};
  const refreshCounts = useCallback(() => counts.reload({ silent: true }), [counts.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((id) => {
    setSection(id);
    requestAnimationFrame(() => document.getElementById('cm-panel')?.focus({ preventScroll: true }));
  }, []);
  const openUser = useCallback((u) => { if (!u) return; setFocusUser({ ...u }); go('accounts'); }, [go]);

  const common = { notify: showNotice, onChanged: refreshCounts, onOpenUser: openUser };

  return (
    <div className={styles.tabContent}>
      <TabHeader icon="shield" title="الإشراف على الغرف والمجتمع"
        sub="البلاغات، والمحتوى المحجوز بالقاموس، والإيقافات، والغرف المباشرة، وحدود الاستخدام">
        {c.rooms != null && (
          <span className={styles.cmLive}>
            <span className={styles.liveDotSm} aria-hidden="true"/>
            <span className="nq-num">{fmtFull(c.rooms)}</span> غرفة مباشرة · <span className="nq-num">{fmtFull(c.people)}</span> شخصاً فيها
          </span>
        )}
      </TabHeader>
      <Toast notice={notice} onClose={hideNotice}/>

      <nav className={styles.cmNav} aria-label="أقسام الإشراف">
        {SECTIONS.map(s => {
          const n = s.id === 'reports' ? c.reports : s.id === 'held' ? c.held : s.id === 'suspensions' ? c.suspensions : s.id === 'rooms' ? c.rooms : null;
          const hot = n > 0 && s.id !== 'rooms';
          return (
            <button key={s.id} type="button" className={`${styles.cmNavBtn} ${section === s.id ? styles.cmNavOn : ''}`}
              aria-current={section === s.id ? 'true' : undefined} onClick={() => go(s.id)}
              aria-label={n > 0 ? `${s.label} (${n})` : s.label}>
              <Ico name={s.icon}/>
              <span>{s.label}</span>
              {n > 0 && <span className={`${styles.cmCnt} ${hot ? styles.cmCntHot : ''} nq-num`} aria-hidden="true">{n > 99 ? '99+' : n}</span>}
            </button>
          );
        })}
      </nav>

      <section id="cm-panel" tabIndex={-1} className={styles.cmSection} aria-label={SECTIONS.find(s => s.id === section)?.label}>
        {section === 'reports'     && <ReportsPanel mode="user" {...common} onGoSuspensions={() => go('suspensions')}/>}
        {section === 'held'        && <ReportsPanel mode="held" {...common} onGoSuspensions={() => go('suspensions')}/>}
        {section === 'suspensions' && <SuspensionsPanel {...common}/>}
        {section === 'rooms'       && <RoomsPanel {...common}/>}
        {section === 'dictionary'  && <DictionaryPanel notify={showNotice}/>}
        {section === 'accounts'    && <AccountsPanel user={focusUser} onUser={setFocusUser} notify={showNotice}/>}
        {section === 'limits'      && <LimitsPanel onTabChange={onTabChange}/>}
      </section>
    </div>
  );
}
