// ─── Long-form legal reading layout (privacy, terms) ────────────────────────
// PageHero, a sticky table of contents on wide screens, and a ~70ch column.
import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHero, Icon, Badge8, toAr } from '../../components/ornaments/Ornaments';
import styles from '../LegalPage.module.css';
import { useTr } from '../../l10n';

// Fill {name} placeholders of an already-translated string with React nodes:
//   rich(tr('توافق على {terms}.'), { terms: <Link …/> })
export function rich(str, parts) {
  return String(str).split(/\{(\w+)\}/g).map((seg, i) =>
    i % 2 ? <Fragment key={i}>{parts[seg] !== undefined ? parts[seg] : `{${seg}}`}</Fragment> : seg);
}

export function LegalDoc({ eyebrow, title, sub, updated, sections, related }) {
  const tr = useTr();
  const [current, setCurrent] = useState(sections[0]?.id);

  // highlight the section being read
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
      const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setCurrent(vis[0].target.id);
    }, { rootMargin: '-20% 0px -65% 0px' });
    sections.forEach(s => { const el = document.getElementById(s.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [sections]);

  const go = (e, id) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <div className={styles.page}>
      <PageHero eyebrow={eyebrow} title={title} sub={sub} />
      <div className={`nq-wrap ${styles.layout}`}>
        <aside className={styles.toc} aria-label={tr('محتويات الصفحة')}>
          <span className={styles.tocHead}>{tr('المحتويات')}</span>
          <ol>
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} aria-current={current === s.id ? 'true' : undefined} onClick={e => go(e, s.id)}>
                  <span className={`nq-num ${styles.tocN}`}>{toAr(i + 1)}</span>{s.title}
                </a>
              </li>
            ))}
          </ol>
        </aside>

        <article className={styles.doc}>
          <div className={styles.free}>
            <Badge8 icon="heart" size={52} />
            <p>{tr('نور القرآن موقع مجاني بالكامل، لوجه الله تعالى، بلا إعلانات ولا رسوم ولا مدفوعات من أي نوع.')}</p>
          </div>
          <p className={styles.updated}><Icon name="calendar" />{tr('آخر تحديث: {date}', { date: updated })}</p>

          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className={styles.section} aria-labelledby={`${s.id}-h`}>
              <h2 id={`${s.id}-h`} className={styles.h2}>
                <span className={`nq-num ${styles.n}`} aria-hidden="true">{toAr(i + 1)}</span>{s.title}
              </h2>
              {s.body}
            </section>
          ))}

          <div className={styles.contact}>
            <div>
              <h2 className={styles.contactTitle}>{tr('لديك سؤال؟')}</h2>
              <p>{tr('راسلنا على البريد، أو من صفحة الدعم.')}</p>
            </div>
            <div className={styles.contactBtns}>
              <a href="mailto:support@webek.org" className="nq-btn ghost" dir="ltr">support@webek.org</a>
              <Link to="/support" className="nq-btn gold"><Icon name="chat" />{tr('الدعم')}</Link>
            </div>
          </div>

          <nav className={styles.related} aria-label={tr('صفحات ذات صلة')}>
            {related.map(r => (
              <Link key={r.to} to={r.to} className={`nq-card ${styles.relCard}`}>
                <Icon name={r.icon} /><span>{r.label}</span><Icon name="back" className={styles.relArrow} />
              </Link>
            ))}
          </nav>
        </article>
      </div>
    </div>
  );
}

export function Checks({ items, tone = 'ok' }) {
  return (
    <ul className={styles.checks} data-tone={tone}>
      {items.map((it, i) => (
        <li key={i}><Icon name={tone === 'no' ? 'x' : 'check'} /><span>{it}</span></li>
      ))}
    </ul>
  );
}
