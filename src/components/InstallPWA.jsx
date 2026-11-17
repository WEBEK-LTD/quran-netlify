import { useState, useEffect } from 'react';
import styles from './InstallPWA.module.css';

export default function InstallPWA() {
  const [prompt,    setPrompt]    = useState(null); // beforeinstallprompt event
  const [show,      setShow]      = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [isIOS,     setIsIOS]     = useState(false);

  useEffect(() => {
    // Detect if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    // Detect iOS (no beforeinstallprompt support)
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(ios);

    if (ios) {
      // Show guide button on iOS always (no native prompt)
      const dismissed = localStorage.getItem('nq_pwa_dismissed');
      if (!dismissed) setShow(true);
      return;
    }

    // Android/Desktop — listen for native prompt
    function handler(e) {
      e.preventDefault();
      setPrompt(e);
      setShow(true);
    }
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (isIOS) { setShowGuide(true); return; }
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setShow(false);
  }

  function dismiss() {
    setShow(false);
    localStorage.setItem('nq_pwa_dismissed', '1');
  }

  if (installed || !show) return null;

  return (
    <>
      {/* Compact install button */}
      <button className={styles.installBtn} onClick={handleInstall} title="تثبيت التطبيق">
        📲
      </button>

      {/* iOS step-by-step guide */}
      {showGuide && (
        <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && setShowGuide(false)}>
          <div className={styles.guide}>
            <button className={styles.closeBtn} onClick={() => setShowGuide(false)}>✕</button>
            <div className={styles.guideIcon}>📱</div>
            <h3>تثبيت نور القرآن</h3>

            {isIOS ? (
              <>
                <p className={styles.guideSub}>على iPhone / iPad</p>
                <div className={styles.steps}>
                  <div className={styles.step}>
                    <span className={styles.stepNum}>١</span>
                    <span>اضغط على زر المشاركة <strong>⬆️</strong> في شريط Safari</span>
                  </div>
                  <div className={styles.step}>
                    <span className={styles.stepNum}>٢</span>
                    <span>اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong></span>
                  </div>
                  <div className={styles.step}>
                    <span className={styles.stepNum}>٣</span>
                    <span>اضغط <strong>"إضافة"</strong> في الزاوية اليمنى العليا</span>
                  </div>
                </div>
                <div className={styles.iosHint}>
                  <span className={styles.iosArrow}>⬆️</span>
                  <span>زر المشاركة في أسفل Safari</span>
                </div>
              </>
            ) : (
              <>
                <p className={styles.guideSub}>على Android</p>
                <div className={styles.steps}>
                  <div className={styles.step}>
                    <span className={styles.stepNum}>١</span>
                    <span>افتح قائمة المتصفح <strong>⋮</strong></span>
                  </div>
                  <div className={styles.step}>
                    <span className={styles.stepNum}>٢</span>
                    <span>اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong></span>
                  </div>
                  <div className={styles.step}>
                    <span className={styles.stepNum}>٣</span>
                    <span>اضغط <strong>"إضافة"</strong></span>
                  </div>
                </div>
              </>
            )}

            <button className={styles.doneBtn} onClick={() => { setShowGuide(false); dismiss(); }}>
              فهمت ✓
            </button>
          </div>
        </div>
      )}
    </>
  );
}
