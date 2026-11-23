import { useState } from 'react';
import { LANGS, useLang, setLang } from '../i18n';
import styles from './LangSwitcher.module.css';
import { Icon } from './ornaments/Ornaments';

const SHORT = { ar: 'ع', en: 'EN', tr: 'TR', fr: 'FR', ur: 'اُ', id: 'ID' };

export default function LangSwitcher({ compact = false }) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const current = LANGS.find(l => l.code === lang) || LANGS[0];

  function choose(code) {
    setLang(code);
    setOpen(false);
    // update html dir
    const dir = LANGS.find(l => l.code === code)?.dir || 'rtl';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', code);
  }

  return (
    <div className={styles.wrap}>
      <button
        className={`${styles.btn} ${compact ? styles.btnCompact : ''}`}
        onClick={() => setOpen(o => !o)}
        title="اللغة · Language"
        aria-label={`اللغة: ${current.label}`}
        aria-expanded={open}
      >
        <Icon name="globe" />
        {compact ? <span className={styles.short}>{SHORT[current.code] || current.code.toUpperCase()}</span> : <span>{current.label}</span>}
        <Icon name="chev" className={styles.caret} />
      </button>

      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.dropdown}>
            {LANGS.map(l => (
              <button
                key={l.code}
                className={`${styles.option} ${l.code === lang ? styles.optionActive : ''}`}
                onClick={() => choose(l.code)}
                dir={l.dir}
              >
                <span>{l.label}</span>
                {l.code === lang && <Icon name="check" className={styles.check} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
