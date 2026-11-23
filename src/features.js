// ─── Every feature of the site, in one list ──────────────────────────────────
// Feeds the header mega menu, the mobile drawer, the "all features" page,
// the search palette and the home page — so nothing is ever hidden or lost.
// `flag` ties an item to an admin feature switch (settings.features).
// Wording rule: plain names only — no "AI"/"smart" labels or sparkle icons.

export const FEATURE_GROUPS = [
  { id: 'quran', title: 'القرآن الكريم', items: [
    { key: 'reader', path: '/reader', icon: 'book', title: 'المصحف الشريف', desc: 'اقرأ بالرسم العثماني، أو آية بآية مع الترجمة' },
    { key: 'listen', path: '/reader', icon: 'head', title: 'التلاوات', desc: 'كبار القرّاء، تكرار المقطع، ومتابعة الآية مع الصوت' },
    { key: 'tafsir', path: '/reader', icon: 'doc', title: 'التفسير', desc: 'الميسّر وابن كثير والسعدي وغيرها' },
    { key: 'search', path: '/search', icon: 'search', title: 'البحث في القرآن', desc: 'بلا تشكيل، أو باسم السورة، أو برقم الآية', flag: 'search' },
    { key: 'daily', path: '/daily-ayah', icon: 'star', title: 'آية اليوم', desc: 'آية مختارة كل يوم مع تفسيرها' },
    { key: 'radio', path: '/radio', icon: 'radio', title: 'إذاعة القرآن', desc: 'بث مباشر من إذاعات القرآن الكريم' },
    { key: 'ijaza', path: '/ijaza', icon: 'scroll', title: 'الإجازة والقراءات', desc: 'القراءات العشر وأسانيد الإجازة', flag: 'ijaza' },
  ]},
  { id: 'worship', title: 'الصلاة والعبادات', items: [
    { key: 'prayer', path: '/prayer-times', icon: 'mosque', title: 'مواقيت الصلاة', desc: 'مواقيت مدينتك، والأذان، والتنبيه قبل الصلاة' },
    { key: 'qibla', path: '/qibla', icon: 'compass', title: 'القبلة', desc: 'اتجاه الكعبة المشرّفة من موقعك' },
    { key: 'adhkar', path: '/adhkar', icon: 'moon', title: 'الأذكار والأدعية', desc: 'الصباح والمساء والنوم وبعد الصلاة' },
    { key: 'tasbih', path: '/tasbih', icon: 'beads', title: 'السبحة', desc: 'عدّاد تسبيح بأهداف يومية' },
  ]},
  { id: 'hifz', title: 'الحفظ والختمات', items: [
    { key: 'hifz', path: '/hifz', icon: 'grid', title: 'الحفظ والمراجعة', desc: 'خريطة حفظك، وورد يومي، ومراجعة منتظمة', flag: 'hifz' },
    { key: 'khatma', path: '/khatma', icon: 'check', title: 'ختماتي', desc: 'سجلّ ختماتك ووردك اليومي', flag: 'khatma' },
    { key: 'group', path: '/khatma-group', icon: 'users', title: 'الختمة الجماعية', desc: 'ختمة يجتمع عليها الأهل، وتُهدى لروح من تحب', flag: 'khatma_group' },
    { key: 'report', path: '/report', icon: 'chart', title: 'التقرير الشهري', desc: 'نشاط قراءتك شهراً بشهر' },
    { key: 'leaderboard', path: '/leaderboard', icon: 'trophy', title: 'المتصدرون', desc: 'أكثر القرّاء والحفّاظ مواظبة', flag: 'leaderboard' },
  ]},
  { id: 'library', title: 'مكتبتي', items: [
    { key: 'dashboard', path: '/dashboard', icon: 'home', title: 'لوحتي', desc: 'ملخّص قراءتك وحفظك' },
    { key: 'favorites', path: '/favorites', icon: 'bookmark', title: 'المفضلة', desc: 'الآيات التي حفظتها للرجوع إليها' },
    { key: 'notes', path: '/notes', icon: 'pen', title: 'ملاحظاتي', desc: 'تأمّلاتك على الآيات', flag: 'notes' },
    { key: 'assistant', action: 'assistant', icon: 'chat', title: 'المساعد', desc: 'اسأل عن معنى آية أو كلمة', flag: 'ai_assistant' },
  ]},
  { id: 'account', title: 'الحساب والمساعدة', items: [
    { key: 'settings', path: '/settings', icon: 'gear', title: 'الإعدادات والمظهر', desc: 'الأوضاع، حجم الخط، القارئ، التنبيهات' },
    { key: 'login', path: '/login', icon: 'user', title: 'تسجيل الدخول', desc: 'لحفظ تقدّمك ومزامنته على أجهزتك', guestOnly: true },
    { key: 'support', path: '/support', icon: 'chat', title: 'الدعم', desc: 'راسلنا وتابع طلبك' },
    { key: 'help', path: '/help', icon: 'doc', title: 'شرح الاستخدام', desc: 'خطوة بخطوة لكل ميزة' },
    { key: 'docs', path: '/docs', icon: 'list', title: 'دليل المميزات', desc: 'كل ما يقدّمه نور القرآن' },
    { key: 'privacy', path: '/privacy', icon: 'shield', title: 'الخصوصية والشروط', desc: 'بياناتك، وحذف حسابك' },
  ]},
];

// Titles/descriptions in the other site languages (Arabic is the source).
const I18N = {"en": {"reader": ["Read Quran", "114 Surahs in Ottoman script"], "radio": ["Islamic Radio", "Quran, programs & nasheeds"], "prayer": ["Prayer Times", "Accurate times for your city"], "qibla": ["Qibla", "Compass to the Holy Kaaba"], "adhkar": ["Dhikr & Dua", "Morning, evening & sleep adhkar"], "hifz": ["Hifz Tracker", "Track memorization with daily wird"], "khatma": ["Khatma", "Personal & group completions"], "dashboard": ["Dashboard", "Daily stats & reading streaks"], "search": ["Search", "Search all Quran verses"], "notes": ["Notes", "Annotate any verse"], "leaderboard": ["Leaderboard", "Top readers & memorizers"], "ijaza": ["Ijaza & Qira'at", "Ten readings & chain of narration"], "tasbih": ["Tasbih Counter", "Digital rosary with sessions"], "daily": ["Verse of the Day", "A featured verse daily with tafsir"], "report": ["Monthly Report", "Your reading stats & heatmap"], "group": ["Group Khatma", "Complete Quran with loved ones"]}, "tr": {"reader": ["Kuran Okuma", "Osmanlı hatlı 114 Sure"], "radio": ["İslami Radyo", "Kuran, programlar ve ilahiler"], "prayer": ["Namaz Vakitleri", "Konumuna göre doğru vakitler"], "qibla": ["Kıble", "Kabe'ye pusula"], "adhkar": ["Dua & Zikir", "Sabah akşam ve uyku zikirleri"], "hifz": ["Hıfz Takip", "Günlük wird ile ezberleme takibi"], "khatma": ["Hatim", "Kişisel ve grup hatmi"], "dashboard": ["Kontrol Paneli", "Günlük istatistikler"], "search": ["Arama", "Kuran'da ayet ara"], "notes": ["Notlar", "Ayetlere not ekle"], "leaderboard": ["Sıralama", "En iyi okuyucular"], "ijaza": ["İcazet", "Kıraat ilimleri ve senet"], "group": ["Grup Hatmi", "Sevdiklerinizle birlikte hatim"]}, "fr": {"reader": ["Lire le Coran", "114 Sourates en écriture ottomane"], "radio": ["Radio Islamique", "Coran, émissions et anashid"], "prayer": ["Heures de Prière", "Horaires précis pour ta ville"], "qibla": ["Qibla", "Boussole vers la Kaaba"], "adhkar": ["Dhikr & Douaa", "Invocations matin, soir et sommeil"], "hifz": ["Suivi Hifz", "Suivi mémorisation avec wird"], "khatma": ["Khatma", "Khatma personnelle et en groupe"], "dashboard": ["Tableau de bord", "Statistiques et séries de lecture"], "search": ["Recherche", "Chercher dans tous les versets"], "notes": ["Notes", "Annoter des versets"], "leaderboard": ["Classement", "Meilleurs lecteurs et mémorisants"], "ijaza": ["Ijaza", "Sciences de récitation et chaînes"], "group": ["Khatma de groupe", "Terminer le Coran ensemble"]}, "ur": {"reader": ["قرآن پڑھیں", "عثمانی خط میں ۱۱۴ سورتیں"], "radio": ["اسلامی ریڈیو", "قرآن، دینی پروگرام اور نشید"], "prayer": ["نماز کے اوقات", "آپ کے شہر کے اوقات"], "qibla": ["قبلہ", "کعبہ کی سمت"], "adhkar": ["دعا و ذکر", "صبح شام اور سونے کے اذکار"], "hifz": ["حفظ ٹریکر", "یومیہ ورد کے ساتھ حفظ ٹریکنگ"], "khatma": ["ختم", "ذاتی اور گروہی ختم"], "dashboard": ["ڈیش بورڈ", "روزانہ اعداد و شمار"], "search": ["تلاش", "قرآن میں آیت تلاش کریں"], "notes": ["نوٹس", "آیات پر نوٹ لکھیں"], "leaderboard": ["لیڈربورڈ", "بہترین قارئین اور حافظ"], "ijaza": ["اجازہ و قراءات", "قراءات کا علم اور سند"], "group": ["گروپ ختم", "اپنوں کے ساتھ ختم القرآن"]}, "id": {"reader": ["Baca Al-Quran", "114 Surah tulisan Utsmani"], "radio": ["Radio Islam", "Quran, program agama & nasyid"], "prayer": ["Waktu Shalat", "Jadwal tepat untuk kotamu"], "qibla": ["Kiblat", "Kompas ke Ka'bah"], "adhkar": ["Dzikir & Doa", "Dzikir pagi, sore dan tidur"], "hifz": ["Lacak Hafalan", "Pantau hafalan dengan wird harian"], "khatma": ["Khatam", "Khatam pribadi & kelompok"], "dashboard": ["Dashboard", "Statistik dan rekam jejak membaca"], "search": ["Cari", "Cari ayat dalam Al-Quran"], "notes": ["Catatan", "Beri catatan pada ayat"], "leaderboard": ["Papan Peringkat", "Pembaca dan penghafal terbaik"], "ijaza": ["Ijazah & Qira'at", "Ilmu qira'at dan sanad"], "group": ["Khatam Kelompok", "Khatamkan Al-Quran bersama"]}};

export function featureText(item, lang = 'ar') {
  const t = lang !== 'ar' && I18N[lang] && I18N[lang][item.key];
  return t ? { title: t[0], desc: t[1] } : { title: item.title, desc: item.desc };
}

// Groups filtered for the current visitor (admin feature switches, guest/user).
export function visibleGroups(settings, user) {
  const feats = (settings && settings.features) || {};
  return FEATURE_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(it => (!it.flag || feats[it.flag] !== false) && !(it.guestOnly && user)),
  })).filter(g => g.items.length);
}

export const ALL_FEATURES = FEATURE_GROUPS.flatMap(g => g.items);

// Opens the floating assistant from anywhere (menu, palette, reader).
export function openAssistant(context) {
  window.dispatchEvent(new CustomEvent('openAI', { detail: context || null }));
}
