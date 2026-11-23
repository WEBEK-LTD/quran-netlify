// ─── Actions on one ayah: listen, tafsir, bookmark, copy, note, share, ask ──
// `variant="bar"`  floating bar above the player (mushaf view)
// `variant="inline"` row of ghost buttons inside an ayah card (ayah-by-ayah view)
import { Icon } from '../ornaments/Ornaments';
import { useTr } from '../../l10n';
import { coreTr } from '../../locales/core';
import styles from './AyahActions.module.css';

export default function AyahActions({ variant = 'inline', refLabel, bookmarked, playing, on, onClose, className = '' }) {
  const tr = coreTr(useTr());
  const acts = [
    { id: 'play',     icon: playing ? 'pause' : 'head', label: playing ? tr('إيقاف') : tr('استماع'), aria: playing ? tr('إيقاف التلاوة') : tr('الاستماع إلى الآية') },
    { id: 'tafsir',   icon: 'book',     label: tr('التفسير'),  aria: tr('عرض التفسير') },
    { id: 'bookmark', icon: 'bookmark', label: tr('المفضلة'),  aria: bookmarked ? tr('إزالة من المفضلة') : tr('حفظ في المفضلة'), pressed: !!bookmarked, fill: !!bookmarked },
    { id: 'copy',     icon: 'copy',     label: tr('نسخ'),      aria: tr('نسخ الآية مع المرجع') },
    { id: 'note',     icon: 'pen',      label: tr('ملاحظة'),   aria: tr('إضافة ملاحظة على الآية') },
    { id: 'share',    icon: 'share',    label: tr('مشاركة'),   aria: tr('مشاركة الآية') },
    { id: 'ask',      icon: 'chat',     label: tr('اسأل المساعد'), aria: tr('اسأل المساعد عن هذه الآية') },
  ];

  if (variant === 'bar') {
    return (
      <div className={`${styles.bar} ${className}`} role="toolbar" aria-label={tr('أدوات {ref}', { ref: refLabel })}>
        <span className={styles.ref}>{refLabel}</span>
        <div className={styles.barBtns}>
          {acts.map(a => (
            <button key={a.id} type="button" className={`${styles.bBtn} ${a.pressed ? styles.pressed : ''}`}
              onClick={e => { e.stopPropagation(); on(a.id); }} aria-label={a.aria} title={a.aria}
              aria-pressed={a.pressed !== undefined ? a.pressed : undefined}>
              <Icon name={a.icon} className={a.fill ? styles.filled : ''} />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label={tr('إغلاق أدوات الآية')} title={tr('إغلاق')}>
          <Icon name="x" />
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.inline} ${className}`} role="group" aria-label={tr('أدوات {ref}', { ref: refLabel })}>
      {acts.map(a => (
        <button key={a.id} type="button" className={`nq-btn ghost sm ${styles.iBtn} ${a.pressed ? styles.pressed : ''}`}
          onClick={e => { e.stopPropagation(); on(a.id); }} aria-label={a.aria} title={a.aria}
          aria-pressed={a.pressed !== undefined ? a.pressed : undefined}>
          <Icon name={a.icon} className={a.fill ? styles.filled : ''} />
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}
