import { useState } from 'react';
import { LANGS, useLang, setLang } from '../i18n';
import styles from './LangSwitcher.module.css';

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
        title="Change language"
      >
        <span>{current.flag}</span>
        {!compact && <span>{current.label}</span>}
        <span className={styles.caret}>{open ? '▴' : '▾'}</span>
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
                <span>{l.flag}</span>
                <span>{l.label}</span>
                {l.code === lang && <span className={styles.check}>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
