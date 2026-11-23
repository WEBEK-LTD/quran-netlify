// ─── Actions on one ayah: listen, tafsir, bookmark, copy, note, share, ask ──
// `variant="bar"`  floating bar above the player (mushaf view)
// `variant="inline"` row of ghost buttons inside an ayah card (ayah-by-ayah view)
import { Icon } from '../ornaments/Ornaments';
import styles from './AyahActions.module.css';

export default function AyahActions({ variant = 'inline', refLabel, bookmarked, playing, on, onClose, className = '' }) {
  const acts = [
    { id: 'play',     icon: playing ? 'pause' : 'head', label: playing ? 'إيقاف' : 'استماع', aria: playing ? 'إيقاف التلاوة' : 'الاستماع إلى الآية' },
    { id: 'tafsir',   icon: 'book',     label: 'التفسير',  aria: 'عرض التفسير' },
    { id: 'bookmark', icon: 'bookmark', label: 'المفضلة',  aria: bookmarked ? 'إزالة من المفضلة' : 'حفظ في المفضلة', pressed: !!bookmarked, fill: !!bookmarked },
    { id: 'copy',     icon: 'copy',     label: 'نسخ',      aria: 'نسخ الآية مع المرجع' },
    { id: 'note',     icon: 'pen',      label: 'ملاحظة',   aria: 'إضافة ملاحظة على الآية' },
    { id: 'share',    icon: 'share',    label: 'مشاركة',   aria: 'مشاركة الآية' },
    { id: 'ask',      icon: 'chat',     label: 'اسأل المساعد', aria: 'اسأل المساعد عن هذه الآية' },
  ];

  if (variant === 'bar') {
    return (
      <div className={`${styles.bar} ${className}`} role="toolbar" aria-label={`أدوات ${refLabel}`}>
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
        <button type="button" className={styles.close} onClick={onClose} aria-label="إغلاق أدوات الآية" title="إغلاق">
          <Icon name="x" />
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.inline} ${className}`} role="group" aria-label={`أدوات ${refLabel}`}>
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
