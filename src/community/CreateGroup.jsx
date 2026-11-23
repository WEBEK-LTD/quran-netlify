// «أنشئ جروباً» — name, description, public/private, own type or mixed.
import { useNavigate } from 'react-router-dom';
import { capi } from './api';
import { useT } from './format';
import { BackButton, css as s } from './ui';
import { GroupForm } from './Group';

export default function CreateGroup({ profile }) {
  const t = useT();
  const navigate = useNavigate();
  const own = profile.gender === 'female' ? 'women' : 'men';
  return (
    <div className={s.page}>
      <header className={s.topbar}>
        <BackButton to="/rooms" />
        <div className={s.topTitle}><h1 className={s.h1}>{t('أنشئ جروباً')}</h1></div>
      </header>
      <p className={s.muted}>{t('جروب يجمع أهلك وأصحابك أو أهل حلقتك، تفتحون فيه غرفاً وتتابعون مواعيدها.')}</p>
      <GroupForm submitLabel={t('إنشاء الجروب')} onSaved={async (b) => {
        const g = await capi.post('/community/groups', { name: b.name, description: b.description, privacy: b.privacy, gender_scope: b.gender_scope === 'mixed' ? 'mixed' : own });
        navigate(`/groups/${g.id}`, { replace: true });
      }} />
    </div>
  );
}
