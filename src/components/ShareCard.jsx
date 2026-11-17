import { useState, useRef, useEffect, useCallback } from 'react';
import { SURAHS_META } from '../data';
import styles from './ShareCard.module.css';

export default function ShareCard() {
  const [ayahData, setAyahData] = useState(null); // { surah, ayah, text }
  const [open, setOpen]         = useState(false);
  const [copied, setCopied]     = useState(false);
  const [theme, setTheme]       = useState('dark');
  const cardRef = useRef(null);

  // Listen for share events from Reader
  useEffect(() => {
    function handler(e) {
      setAyahData(e.detail);
      setOpen(true);
      setCopied(false);
    }
    window.addEventListener('shareAyah', handler);
    return () => window.removeEventListener('shareAyah', handler);
  }, []);

  if (!open || !ayahData) return null;

  const meta = SURAHS_META[ayahData.surah - 1];
  const ref  = `سورة ${meta?.[0]} — الآية ${ayahData.ayah}`;
  const full  = `${ayahData.text}\n\n﴾ ${ref} ﴿\n\nنور القرآن`;

  // ── Generate image with Canvas ─────────────────────────────────────────────
  const generateImage = useCallback(async () => {
    const canvas = document.createElement('canvas');
    const W = 1080, H = 1080;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);

    // Border frame
    ctx.strokeStyle = t.accent + '55';
    ctx.lineWidth = 3;
    ctx.strokeRect(32, 32, W - 64, H - 64);
    ctx.strokeStyle = t.accent + '33';
    ctx.lineWidth = 1;
    ctx.strokeRect(44, 44, W - 88, H - 88);

    // Corner stars
    ctx.fillStyle = t.accent + '88';
    ctx.font = '36px serif';
    ctx.fillText('✦', 55, 90);
    ctx.fillText('✦', W - 90, 90);

    // Brand top
    ctx.fillStyle = t.accent + '66';
    ctx.font = 'bold 28px Cairo, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('نور القرآن', W / 2, 90);

    // Ayah text — wrap long text
    ctx.fillStyle = t.text;
    ctx.font = `bold ${ayahData.text.length > 100 ? 48 : 56}px 'Amiri Quran', serif`;
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';

    const words = ayahData.text.split(' ');
    const maxW = W - 140;
    let lines = [], line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line); line = word;
      } else { line = test; }
    }
    if (line) lines.push(line);

    const lineH = ayahData.text.length > 100 ? 72 : 84;
    const totalH = lines.length * lineH;
    let y = H / 2 - totalH / 2 + 20;
    lines.forEach(l => { ctx.fillText(l, W / 2, y); y += lineH; });

    // Reference
    ctx.fillStyle = t.accent;
    ctx.font = 'bold 34px Cairo, Arial';
    ctx.fillText(`﴾ سورة ${SURAHS_META[ayahData.surah-1]?.[0]} — الآية ${ayahData.ayah} ﴿`, W/2, H - 130);

    // Brand bottom
    ctx.fillStyle = t.accent + '55';
    ctx.font = '24px Cairo, Arial';
    ctx.fillText('nuralquran.net', W / 2, H - 75);

    return canvas.toDataURL('image/png');
  }, [ayahData, t]);

  async function downloadImage() {
    const dataUrl = await generateImage();
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `ayah-${ayahData.surah}-${ayahData.ayah}.png`;
    a.click();
  }

  async function shareAsImage() {
    try {
      const dataUrl = await generateImage();
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'ayah.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'آية قرآنية' });
      } else {
        downloadImage();
      }
    } catch { downloadImage(); }
  }

  function copyText() {
    navigator.clipboard.writeText(full).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(full)}`, '_blank');
  }

  function shareTwitter() {
    const tweet = `${ayahData.text}\n\n﴾ ${ref} ﴿`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`, '_blank');
  }

  function shareTelegram() {
    window.open(`https://t.me/share/url?text=${encodeURIComponent(full)}`, '_blank');
  }

  const THEMES = [
    { id: 'dark',   bg: '#0f1a12', text: '#e8e8e8', accent: '#c9a84c' },
    { id: 'gold',   bg: '#1a1200', text: '#f5e6c0', accent: '#e8c97a' },
    { id: 'green',  bg: '#0a1f14', text: '#d4edda', accent: '#52b788' },
    { id: 'blue',   bg: '#0d1b2a', text: '#dce8f5', accent: '#60a5fa' },
    { id: 'cream',  bg: '#faf7f0', text: '#2d2d2d', accent: '#8b6914' },
  ];
  const t = THEMES.find(x => x.id === theme) || THEMES[0];

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && setOpen(false)}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3>مشاركة الآية</h3>
          <button className={styles.closeBtn} onClick={() => setOpen(false)}>✕</button>
        </div>

        {/* Preview card */}
        <div ref={cardRef} className={styles.card}
          style={{ background: t.bg, color: t.text }}>
          <div className={styles.cardDecor} style={{ borderColor: t.accent + '44' }}>
            <div className={styles.cardCorner} style={{ color: t.accent }}>✦</div>
            <div className={styles.cardCornerBr} style={{ color: t.accent }}>✦</div>
          </div>
          <p className={styles.cardText} style={{ color: t.text, fontFamily: 'Amiri Quran, serif' }}>
            {ayahData.text}
          </p>
          <div className={styles.cardRef} style={{ color: t.accent }}>
            ﴾ {ref} ﴿
          </div>
          <div className={styles.cardBrand} style={{ color: t.accent + '88' }}>نور القرآن</div>
        </div>

        {/* Theme picker */}
        <div className={styles.themeRow}>
          <span className={styles.themeLabel}>اللون:</span>
          {THEMES.map(th => (
            <button key={th.id}
              className={`${styles.themeDot} ${theme === th.id ? styles.themeActive : ''}`}
              style={{ background: th.bg, border: `2px solid ${theme === th.id ? th.accent : 'transparent'}` }}
              onClick={() => setTheme(th.id)} />
          ))}
        </div>

        {/* Share buttons */}
        <div className={styles.shareRow}>
          <button className={`${styles.shareBtn} ${styles.whatsapp}`} onClick={shareWhatsApp}>
            <span>💬</span> واتساب
          </button>
          <button className={`${styles.shareBtn} ${styles.twitter}`} onClick={shareTwitter}>
            <span>𝕏</span> تويتر
          </button>
          <button className={`${styles.shareBtn} ${styles.telegram}`} onClick={shareTelegram}>
            <span>✈️</span> تيليجرام
          </button>
          <button className={`${styles.shareBtn} ${styles.copy} ${copied ? styles.copied : ''}`} onClick={copyText}>
            <span>{copied ? '✅' : '📋'}</span> {copied ? 'تم' : 'نسخ'}
          </button>
        </div>

        {/* Image share */}
        <div className={styles.imgRow}>
          <button className={styles.imgBtn} onClick={shareAsImage}>
            🖼️ مشاركة كصورة
          </button>
          <button className={styles.imgBtn} onClick={downloadImage}>
            ⬇️ تحميل الصورة
          </button>
          {navigator.share && (
            <button className={styles.imgBtn} onClick={() => navigator.share({ text: full })}>
              ↗ مشاركة نص
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
