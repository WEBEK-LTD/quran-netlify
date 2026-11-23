// ─── All features («دليل المميزات»): every item of features.js, by section ──
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHero, Icon, Badge8, Pattern, toAr } from '../components/ornaments/Ornaments';
import { visibleGroups, featureText, openAssistant } from '../features';
import { usePublicSettings } from '../hooks/usePublicSettings';
import { useAuth } from '../hooks/useAuth';
import { useLang } from '../i18n';
import styles from './DocsPage.module.css';

// A line for each group, under its heading.
const GROUP_LEAD = {
  quran: 'المصحف الشريف بالرسم العثماني، وتلاوات كبار القرّاء، والتفاسير المعتمدة.',
  worship: 'ما يعينك على صلاتك وذكرك في يومك وليلتك.',
  hifz: 'تابع حفظك ومراجعتك، وأتمّ ختماتك وحدك أو مع أهلك.',
  library: 'ما حفظته وكتبته وتابعته في مكان واحد.',
  account: 'حسابك ومظهر الموقع، والمساعدة متى احتجتها.',
};

export default function DocsPage() {
  const lang = useLang();
  const settings = usePublicSettings();
  const { user } = useAuth();
  const groups = useMemo(() => visibleGroups(settings, user), [settings, user]);
  const count = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className={styles.page}>
      <PageHero eyebrow="كل ما يقدّمه نور القرآن" title="دليل المميزات"
        sub="كل ميزات الموقع في صفحة واحدة، مرتّبة حسب الحاجة. اضغط على أي بطاقة لتفتحها.">
        <span className="nq-pill on"><Icon name="grid" /><span className="nq-num">{toAr(count)}</span> ميزة</span>
        <span className="nq-pill on"><Icon name="list" /><span className="nq-num">{toAr(groups.length)}</span> أقسام</span>
      </PageHero>

      <div className={`nq-wrap ${styles.wrap}`}>
        <nav className={styles.jump} aria-label="أقسام الدليل">
          {groups.map(g => (
            <a key={g.id} href={`#g-${g.id}`} className={styles.jumpLink}
              onClick={e => { e.preventDefault(); document.getElementById(`g-${g.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}>
              {g.title}<span className="nq-num">{toAr(g.items.length)}</span>
            </a>
          ))}
        </nav>

        <div className={styles.hub}>
          {groups.map(g => (
            <section key={g.id} id={`g-${g.id}`} className={styles.group} aria-labelledby={`g-${g.id}-h`}>
              <div className={styles.gHead}>
                <h2 id={`g-${g.id}-h`} className={styles.gTitle}>{g.title}</h2>
                {GROUP_LEAD[g.id] && <p className={styles.gLead}>{GROUP_LEAD[g.id]}</p>}
              </div>
              <div className={styles.grid}>
                {g.items.map(it => {
                  const t = featureText(it, lang);
                  const body = (<>
                    <Badge8 icon={it.icon} size={52} />
                    <span className={styles.cText}>
                      <b>{t.title}</b>
                      <small>{t.desc}</small>
                    </span>
                    <Icon name="back" className={styles.arrow} />
                  </>);
                  return it.action === 'assistant'
                    ? <button key={it.key} type="button" className={`nq-card ${styles.card}`} onClick={() => openAssistant()}>{body}</button>
                    : <Link key={it.key} to={it.path} className={`nq-card ${styles.card}`}>{body}</Link>;
                })}
              </div>
            </section>
          ))}

          {/* install as an app */}
          <section className={`nq-card ${styles.install}`} aria-labelledby="g-install">
            <Pattern />
            <Badge8 icon="phone" size={64} />
            <div className={styles.installText}>
              <h2 id="g-install">ثبّت نور القرآن على جوالك</h2>
              <p>يعمل كتطبيق مستقل بدون متجر تطبيقات: من Safari على iPhone اختر «إضافة إلى الشاشة الرئيسية»، ومن Chrome على Android اختر «تثبيت التطبيق».</p>
            </div>
            <Link to="/help#pwa" className="nq-btn ghost"><Icon name="doc" />الشرح خطوة بخطوة</Link>
          </section>
        </div>
      </div>
    </div>
  );
}
