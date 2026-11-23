import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import styles from './WelcomePage.module.css';

const LANGS = [
  { code: 'ar', label: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { code: 'en', label: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'tr', label: 'Türkçe',  flag: '🇹🇷', dir: 'ltr' },
  { code: 'fr', label: 'Français',flag: '🇫🇷', dir: 'ltr' },
  { code: 'ur', label: 'اردو',    flag: '🇵🇰', dir: 'rtl' },
  { code: 'id', label: 'Indonesia',flag:'🇮🇩', dir: 'ltr' },
];

const T = {
  ar: {
    title: 'نور القرآن', subtitle: 'رفيقك في رحلة القرآن الكريم',
    login: '🔑 دخول', signup: '✨ حساب جديد', dashboard: '📊 لوحتي',
    help: 'شرح الاستخدام', privacy: 'الخصوصية', terms: 'الشروط',
    docs: 'دليل المميزات', support: 'الدعم',
    features: [
      { icon:'📖', title:'قراءة القرآن',      desc:'114 سورة بخطوط عثمانية',           path:'/reader',       color:'#52b788' },
      { icon:'📻', title:'الراديو الإسلامي',  desc:'قرآن وبرامج دينية وأناشيد',        path:'/radio',        color:'#f97316' },
      { icon:'🕌', title:'أوقات الصلاة',      desc:'مواعيد دقيقة لموقعك',              path:'/prayer-times', color:'#10b981' },
      { icon:'🧭', title:'اتجاه القبلة',      desc:'بوصلة الكعبة المشرفة',             path:'/qibla',        color:'#6366f1' },
      { icon:'📿', title:'الأذكار والأدعية',  desc:'أذكار الصباح والمساء والنوم',      path:'/adhkar',       color:'#c9a84c' },
      { icon:'📚', title:'نظام الحفظ',        desc:'تتبع حفظك مع ورد يومي',            path:'/hifz',         color:'#eab308' },
      { icon:'📿', title:'الختمات',           desc:'ختماتك الشخصية والجماعية',          path:'/khatma',       color:'#e879f9' },
      { icon:'📊', title:'لوحة التحكم',       desc:'إحصائياتك وتقدمك اليومي',          path:'/dashboard',    color:'#a78bfa' },
      { icon:'🔍', title:'البحث',             desc:'ابحث في كل آيات القرآن',            path:'/search',       color:'#38bdf8' },
      { icon:'📝', title:'الملاحظات',         desc:'دوّن تأملاتك على الآيات',           path:'/notes',        color:'#fb7185' },
      { icon:'🏆', title:'المتصدرون',         desc:'أبرز القراء والحفّاظ',              path:'/leaderboard',  color:'#f59e0b' },
      { icon:'✦',  title:'المساعد الذكي',     desc:'تفسير بالذكاء الاصطناعي',          path:'/reader',       color:'#60a5fa' },
      { icon:'🗂️', title:'الأجزاء',          desc:'تصفح القرآن بالأجزاء الثلاثين',    path:'/reader',       color:'#34d399' },
      { icon:'📜', title:'الإجازة والقراءات', desc:'القراءات العشر وأسانيد الإجازة',   path:'/ijaza',        color:'#94a3b8' },
      { icon:'📿', title:'السبحة الإلكترونية', desc:'عدّاد تسبيح بأهداف وجلسات',         path:'/tasbih',       color:'#52b788' },
      { icon:'✨', title:'آية اليوم',           desc:'آية مميزة كل يوم مع تفسير',          path:'/daily-ayah',   color:'#f59e0b' },
      { icon:'📊', title:'التقرير الشهري',       desc:'إحصائياتك وخريطة قراءتك الشهرية',    path:'/report',       color:'#6366f1' },
      { icon:'🌍', title:'الختمة الجماعية',   desc:'ختم القرآن مع الأهل والأحبة',      path:'/khatma-group', color:'#2dd4bf' },
    ],
  },
  en: {
    title: 'Nur Al-Quran', subtitle: 'Your companion in the Quran journey',
    login: '🔑 Login', signup: '✨ Sign Up', dashboard: '📊 Dashboard',
    help: 'Help Guide', privacy: 'Privacy', terms: 'Terms',
    docs: 'Features Guide', support: 'Support',
    features: [
      { icon:'📖', title:'Read Quran',         desc:'114 Surahs in Ottoman script',      path:'/reader',       color:'#52b788' },
      { icon:'📻', title:'Islamic Radio',      desc:'Quran, programs & nasheeds',        path:'/radio',        color:'#f97316' },
      { icon:'🕌', title:'Prayer Times',       desc:'Accurate times for your city',      path:'/prayer-times', color:'#10b981' },
      { icon:'🧭', title:'Qibla',              desc:'Compass to the Holy Kaaba',         path:'/qibla',        color:'#6366f1' },
      { icon:'📿', title:'Dhikr & Dua',        desc:'Morning, evening & sleep adhkar',   path:'/adhkar',       color:'#c9a84c' },
      { icon:'📚', title:'Hifz Tracker',       desc:'Track memorization with daily wird', path:'/hifz',       color:'#eab308' },
      { icon:'📿', title:'Khatma',             desc:'Personal & group completions',      path:'/khatma',       color:'#e879f9' },
      { icon:'📊', title:'Dashboard',          desc:'Daily stats & reading streaks',     path:'/dashboard',    color:'#a78bfa' },
      { icon:'🔍', title:'Search',             desc:'Search all Quran verses',           path:'/search',       color:'#38bdf8' },
      { icon:'📝', title:'Notes',              desc:'Annotate any verse',                path:'/notes',        color:'#fb7185' },
      { icon:'🏆', title:'Leaderboard',        desc:'Top readers & memorizers',          path:'/leaderboard',  color:'#f59e0b' },
      { icon:'✦',  title:'AI Assistant',       desc:'AI-powered tafsir',                 path:'/reader',       color:'#60a5fa' },
      { icon:'🗂️', title:'30 Juz',            desc:'Browse by Juz & Hizb',              path:'/reader',       color:'#34d399' },
      { icon:'📜', title:"Ijaza & Qira'at",   desc:'Ten readings & chain of narration',  path:'/ijaza',        color:'#94a3b8' },
      { icon:'📿', title:'Tasbih Counter',     desc:'Digital rosary with sessions',        path:'/tasbih',       color:'#52b788' },
      { icon:'✨', title:'Verse of the Day',   desc:'A featured verse daily with tafsir',  path:'/daily-ayah',   color:'#f59e0b' },
      { icon:'📊', title:'Monthly Report',       desc:'Your reading stats & heatmap',        path:'/report',       color:'#6366f1' },
      { icon:'🌍', title:'Group Khatma',       desc:'Complete Quran with loved ones',    path:'/khatma-group', color:'#2dd4bf' },
    ],
  },
  tr: {
    title: 'Nur Al-Kuran', subtitle: 'Kuran yolculuğunuzda rehberiniz',
    login: '🔑 Giriş', signup: '✨ Kayıt Ol', dashboard: '📊 Panelim',
    help: 'Yardım', privacy: 'Gizlilik', terms: 'Koşullar',
    docs: 'Özellikler', support: 'Destek',
    features: [
      { icon:'📖', title:'Kuran Okuma',        desc:'Osmanlı hatlı 114 Sure',            path:'/reader',       color:'#52b788' },
      { icon:'📻', title:'İslami Radyo',       desc:'Kuran, programlar ve ilahiler',     path:'/radio',        color:'#f97316' },
      { icon:'🕌', title:'Namaz Vakitleri',    desc:'Konumuna göre doğru vakitler',      path:'/prayer-times', color:'#10b981' },
      { icon:'🧭', title:'Kıble',              desc:"Kabe'ye pusula",                    path:'/qibla',        color:'#6366f1' },
      { icon:'📿', title:'Dua & Zikir',        desc:'Sabah akşam ve uyku zikirleri',     path:'/adhkar',       color:'#c9a84c' },
      { icon:'📚', title:'Hıfz Takip',         desc:'Günlük wird ile ezberleme takibi',  path:'/hifz',         color:'#eab308' },
      { icon:'📿', title:'Hatim',              desc:'Kişisel ve grup hatmi',             path:'/khatma',       color:'#e879f9' },
      { icon:'📊', title:'Kontrol Paneli',     desc:'Günlük istatistikler',              path:'/dashboard',    color:'#a78bfa' },
      { icon:'🔍', title:'Arama',              desc:"Kuran'da ayet ara",                 path:'/search',       color:'#38bdf8' },
      { icon:'📝', title:'Notlar',             desc:'Ayetlere not ekle',                 path:'/notes',        color:'#fb7185' },
      { icon:'🏆', title:'Sıralama',           desc:'En iyi okuyucular',                 path:'/leaderboard',  color:'#f59e0b' },
      { icon:'✦',  title:'Yapay Zeka',         desc:'AI ile tefsir',                     path:'/reader',       color:'#60a5fa' },
      { icon:'🗂️', title:'30 Cüz',            desc:'Cüz ve Hizb ile göz at',            path:'/reader',       color:'#34d399' },
      { icon:'📜', title:'İcazet',             desc:'Kıraat ilimleri ve senet',          path:'/ijaza',        color:'#94a3b8' },
      { icon:'🌍', title:'Grup Hatmi',         desc:'Sevdiklerinizle birlikte hatim',    path:'/khatma-group', color:'#2dd4bf' },
    ],
  },
  fr: {
    title: 'Nur Al-Coran', subtitle: 'Votre compagnon dans le voyage coranique',
    login: '🔑 Connexion', signup: "✨ S'inscrire", dashboard: '📊 Tableau de bord',
    help: "Guide d'utilisation", privacy: 'Confidentialité', terms: 'Conditions',
    docs: 'Guide des fonctionnalités', support: 'Support',
    features: [
      { icon:'📖', title:'Lire le Coran',      desc:'114 Sourates en écriture ottomane', path:'/reader',       color:'#52b788' },
      { icon:'📻', title:'Radio Islamique',    desc:'Coran, émissions et anashid',       path:'/radio',        color:'#f97316' },
      { icon:'🕌', title:'Heures de Prière',   desc:'Horaires précis pour ta ville',     path:'/prayer-times', color:'#10b981' },
      { icon:'🧭', title:'Qibla',              desc:'Boussole vers la Kaaba',            path:'/qibla',        color:'#6366f1' },
      { icon:'📿', title:'Dhikr & Douaa',      desc:'Invocations matin, soir et sommeil',path:'/adhkar',       color:'#c9a84c' },
      { icon:'📚', title:'Suivi Hifz',         desc:'Suivi mémorisation avec wird',      path:'/hifz',         color:'#eab308' },
      { icon:'📿', title:'Khatma',             desc:'Khatma personnelle et en groupe',   path:'/khatma',       color:'#e879f9' },
      { icon:'📊', title:'Tableau de bord',    desc:'Statistiques et séries de lecture', path:'/dashboard',    color:'#a78bfa' },
      { icon:'🔍', title:'Recherche',          desc:'Chercher dans tous les versets',    path:'/search',       color:'#38bdf8' },
      { icon:'📝', title:'Notes',              desc:'Annoter des versets',               path:'/notes',        color:'#fb7185' },
      { icon:'🏆', title:'Classement',         desc:'Meilleurs lecteurs et mémorisants', path:'/leaderboard',  color:'#f59e0b' },
      { icon:'✦',  title:'Assistant IA',       desc:'Tafsir par intelligence artificielle',path:'/reader',    color:'#60a5fa' },
      { icon:'🗂️', title:'30 Juz',            desc:'Parcourir par Juz et Hizb',         path:'/reader',       color:'#34d399' },
      { icon:'📜', title:'Ijaza',              desc:'Sciences de récitation et chaînes', path:'/ijaza',        color:'#94a3b8' },
      { icon:'🌍', title:'Khatma de groupe',   desc:'Terminer le Coran ensemble',        path:'/khatma-group', color:'#2dd4bf' },
    ],
  },
  ur: {
    title: 'نور القرآن', subtitle: 'قرآن کریم کے سفر میں آپ کا ساتھی',
    login: '🔑 لاگ ان', signup: '✨ رجسٹر', dashboard: '📊 ڈیش بورڈ',
    help: 'مدد', privacy: 'رازداری', terms: 'شرائط',
    docs: 'خصوصیات کی رہنمائی', support: 'سپورٹ',
    features: [
      { icon:'📖', title:'قرآن پڑھیں',        desc:'عثمانی خط میں ۱۱۴ سورتیں',         path:'/reader',       color:'#52b788' },
      { icon:'📻', title:'اسلامی ریڈیو',      desc:'قرآن، دینی پروگرام اور نشید',      path:'/radio',        color:'#f97316' },
      { icon:'🕌', title:'نماز کے اوقات',     desc:'آپ کے شہر کے اوقات',               path:'/prayer-times', color:'#10b981' },
      { icon:'🧭', title:'قبلہ',              desc:'کعبہ کی سمت',                       path:'/qibla',        color:'#6366f1' },
      { icon:'📿', title:'دعا و ذکر',         desc:'صبح شام اور سونے کے اذکار',         path:'/adhkar',       color:'#c9a84c' },
      { icon:'📚', title:'حفظ ٹریکر',         desc:'یومیہ ورد کے ساتھ حفظ ٹریکنگ',    path:'/hifz',         color:'#eab308' },
      { icon:'📿', title:'ختم',               desc:'ذاتی اور گروہی ختم',               path:'/khatma',       color:'#e879f9' },
      { icon:'📊', title:'ڈیش بورڈ',          desc:'روزانہ اعداد و شمار',              path:'/dashboard',    color:'#a78bfa' },
      { icon:'🔍', title:'تلاش',              desc:'قرآن میں آیت تلاش کریں',           path:'/search',       color:'#38bdf8' },
      { icon:'📝', title:'نوٹس',              desc:'آیات پر نوٹ لکھیں',               path:'/notes',        color:'#fb7185' },
      { icon:'🏆', title:'لیڈربورڈ',          desc:'بہترین قارئین اور حافظ',            path:'/leaderboard',  color:'#f59e0b' },
      { icon:'✦',  title:'AI مددگار',         desc:'AI سے تفسیر',                       path:'/reader',       color:'#60a5fa' },
      { icon:'🗂️', title:'تیس پارے',         desc:'پاروں کے ذریعے تلاوت',             path:'/reader',       color:'#34d399' },
      { icon:'📜', title:'اجازہ و قراءات',   desc:'قراءات کا علم اور سند',             path:'/ijaza',        color:'#94a3b8' },
      { icon:'🌍', title:'گروپ ختم',          desc:'اپنوں کے ساتھ ختم القرآن',         path:'/khatma-group', color:'#2dd4bf' },
    ],
  },
  id: {
    title: 'Nur Al-Quran', subtitle: 'Teman perjalanan Quran Anda',
    login: '🔑 Masuk', signup: '✨ Daftar', dashboard: '📊 Dashboard',
    help: 'Panduan', privacy: 'Privasi', terms: 'Syarat',
    docs: 'Panduan Fitur', support: 'Dukungan',
    features: [
      { icon:'📖', title:'Baca Al-Quran',      desc:'114 Surah tulisan Utsmani',         path:'/reader',       color:'#52b788' },
      { icon:'📻', title:'Radio Islam',        desc:'Quran, program agama & nasyid',     path:'/radio',        color:'#f97316' },
      { icon:'🕌', title:'Waktu Shalat',       desc:'Jadwal tepat untuk kotamu',         path:'/prayer-times', color:'#10b981' },
      { icon:'🧭', title:'Kiblat',             desc:"Kompas ke Ka'bah",                  path:'/qibla',        color:'#6366f1' },
      { icon:'📿', title:'Dzikir & Doa',       desc:'Dzikir pagi, sore dan tidur',       path:'/adhkar',       color:'#c9a84c' },
      { icon:'📚', title:'Lacak Hafalan',      desc:'Pantau hafalan dengan wird harian', path:'/hifz',         color:'#eab308' },
      { icon:'📿', title:'Khatam',             desc:'Khatam pribadi & kelompok',         path:'/khatma',       color:'#e879f9' },
      { icon:'📊', title:'Dashboard',          desc:'Statistik dan rekam jejak membaca', path:'/dashboard',    color:'#a78bfa' },
      { icon:'🔍', title:'Cari',               desc:'Cari ayat dalam Al-Quran',          path:'/search',       color:'#38bdf8' },
      { icon:'📝', title:'Catatan',            desc:'Beri catatan pada ayat',            path:'/notes',        color:'#fb7185' },
      { icon:'🏆', title:'Papan Peringkat',    desc:'Pembaca dan penghafal terbaik',     path:'/leaderboard',  color:'#f59e0b' },
      { icon:'✦',  title:'Asisten AI',         desc:'Tafsir dengan kecerdasan buatan',   path:'/reader',       color:'#60a5fa' },
      { icon:'🗂️', title:'30 Juz',            desc:'Telusuri per Juz dan Hizb',         path:'/reader',       color:'#34d399' },
      { icon:'📜', title:'Ijazah & Qira\'at',  desc:'Ilmu qira\'at dan sanad',           path:'/ijaza',        color:'#94a3b8' },
      { icon:'🌍', title:'Khatam Kelompok',    desc:'Khatamkan Al-Quran bersama',        path:'/khatma-group', color:'#2dd4bf' },
    ],
  },
};

function detectLang() {
  const saved = localStorage.getItem('nq_ui_lang');
  if (saved && T[saved]) return saved;
  const b = (navigator.language || 'ar').split('-')[0].toLowerCase();
  if (T[b]) return b;
  if (b === 'ms') return 'id';
  if (['az','kk','uz','tk'].includes(b)) return 'tr';
  return 'ar';
}

export default function WelcomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lang,     setLang]     = useState(detectLang);
  const [exiting,  setExiting]  = useState(false);
  const [showLangs,setShowLangs]= useState(false);

  const t   = T[lang] || T.ar;
  const dir = LANGS.find(l => l.code === lang)?.dir || 'rtl';

  function go(path) {
    setExiting(true);
    setTimeout(() => navigate(path), 260);
  }

  function changeLang(code) {
    setLang(code);
    localStorage.setItem('nq_ui_lang', code);
    setShowLangs(false);
    // sync html dir
    const l = LANGS.find(x => x.code === code);
    document.documentElement.setAttribute('dir', l?.dir || 'rtl');
    document.documentElement.setAttribute('lang', code);
  }

  const currentLang = LANGS.find(l => l.code === lang);

  return (
    <div className={`${styles.page} ${exiting ? styles.exiting : ''}`} dir={dir}>
      {/* Background */}
      <div className={styles.bg}>
        <div className={styles.bgRing1} /><div className={styles.bgRing2} /><div className={styles.bgRing3} />
        <div className={styles.bgStar}>✦</div>
      </div>

      {/* Top bar */}
      <div className={styles.topBar}>
        {/* Language switcher */}
        <div className={styles.langWrap}>
          <button className={styles.langBtn} onClick={() => setShowLangs(s => !s)}>
            <span>{currentLang?.flag}</span>
            <span className={styles.langLabel}>{currentLang?.label}</span>
            <span className={styles.langCaret}>{showLangs ? '▴' : '▾'}</span>
          </button>
          {showLangs && (
            <>
              <div className={styles.langBackdrop} onClick={() => setShowLangs(false)} />
              <div className={styles.langDropdown}>
                {LANGS.map(l => (
                  <button key={l.code}
                    className={`${styles.langOption} ${lang === l.code ? styles.langOptionActive : ''}`}
                    onClick={() => changeLang(l.code)} dir={l.dir}>
                    <span>{l.flag}</span><span>{l.label}</span>
                    {lang === l.code && <span className={styles.langCheck}>✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Auth buttons */}
        <div className={styles.authBtns}>
          {user
            ? <button className={styles.authBtn} onClick={() => go('/dashboard')}>{t.dashboard}</button>
            : <>
                <button className={styles.authBtnGhost} onClick={() => go('/login')}>{t.login}</button>
                <button className={styles.authBtn}      onClick={() => go('/signup')}>{t.signup}</button>
              </>
          }
        </div>
      </div>

      {/* Logo */}
      <div className={styles.logo}>
        <img src="/brand/logo-mark.svg" alt="" width="88" height="104" style={{ display: 'block', margin: '0 auto 12px' }} />
        <h1>{t.title}</h1>
        <p>{t.subtitle}</p>
      </div>

      {/* Features grid */}
      <div className={styles.grid}>
        {t.features.map((f, i) => (
          <button key={i} className={styles.featureBtn}
            style={{ '--accent': f.color, animationDelay: `${i * 40}ms` }}
            onClick={() => go(f.path)}>
            <span className={styles.fIcon}>{f.icon}</span>
            <span className={styles.fTitle}>{f.title}</span>
            <span className={styles.fDesc}>{f.desc}</span>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.footerLinks}>
          <button className={styles.footerLink} onClick={() => go('/help')}>📘 {t.help}</button>
          <span className={styles.footerDot}>·</span>
          <button className={styles.footerLink} onClick={() => go('/docs')}>📄 {t.docs}</button>
          <span className={styles.footerDot}>·</span>
          <button className={styles.footerLink} onClick={() => go('/support')}>💬 {t.support}</button>
          <span className={styles.footerDot}>·</span>
          <button className={styles.footerLink} onClick={() => go('/privacy')}>🔒 {t.privacy}</button>
          <span className={styles.footerDot}>·</span>
          <button className={styles.footerLink} onClick={() => go('/terms')}>📋 {t.terms}</button>
        </div>
        <div className={styles.footerBrand}>نور القرآن © {new Date().getFullYear()}</div>
      </div>
    </div>
  );
}
