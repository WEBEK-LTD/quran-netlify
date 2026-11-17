import { Link } from 'react-router-dom';
import styles from './NotFoundPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

export default function NotFoundPage() {
  const t = useT();
  const dir = useDir();
  return (
    <div className={styles.page}>
      <div className={styles.decor}>✦</div>
      <div className={styles.code}>٤٠٤</div>
      <h1>{t('notFoundTitle')}</h1>
      <p>{t('notFoundDesc')}</p>
      <Link to="/reader" className={styles.homeBtn}>{t('back')}</Link>
    </div>
  );
}
