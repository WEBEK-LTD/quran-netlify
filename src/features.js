// ─── Every feature of the site, in one list ──────────────────────────────────
// Feeds the header mega menu, the mobile drawer, the "all features" page,
// the search palette and the home page — so nothing is ever hidden or lost.
// `flag` ties an item to an admin feature switch (settings.features).
// Wording rule: plain names only — no "AI"/"smart" labels or sparkle icons.
import { translate } from './l10n';
import CORE from './locales/core';
import { getLang } from './i18n';
import { isNative } from './native/platform';

export const FEATURE_GROUPS = [
  { id: 'quran', title: 'القرآن الكريم', items: [
    { key: 'reader', path: '/reader', icon: 'book', title: 'المصحف الشريف', desc: 'اقرأ بالرسم العثماني، أو آية بآية مع الترجمة' },
    { key: 'listen', path: '/listen', icon: 'head', title: 'التلاوات', desc: 'كبار القرّاء، تكرار المقطع، ومتابعة الآية مع الصوت' },
    { key: 'tafsir', path: '/tafsir', icon: 'doc', title: 'التفسير', desc: 'الميسّر والجلالين، آية بآية مع نصّها بالرسم العثماني' },
    { key: 'search', path: '/search', icon: 'search', title: 'البحث في القرآن', desc: 'بلا تشكيل، أو باسم السورة، أو برقم الآية', flag: 'search' },
    { key: 'daily', path: '/daily-ayah', icon: 'star', title: 'آية اليوم', desc: 'آية مختارة كل يوم مع تفسيرها' },
    { key: 'tadhkira', path: '/tadhkira', icon: 'heart', title: 'تذكرة لقلبك اليوم', desc: 'آية من كتاب الله تُفتح لك كل يوم' },
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
  // app only (voice rooms are not on the website)
  { id: 'community', title: 'الغرف والمجتمع', appOnly: true, items: [
    { key: 'rooms', path: '/rooms', icon: 'live', title: 'الغرف الصوتية', desc: 'مجالس مباشرة للتلاوة والتدبّر، بلا تسجيل', flag: 'rooms' },
    { key: 'messages', path: '/messages', icon: 'chat', title: 'الرسائل', desc: 'رسائل نصية مع أصدقائك', flag: 'rooms' },
    { key: 'notifications', path: '/notifications', icon: 'bell', title: 'الإشعارات', desc: 'بدء الغرف والدعوات وطلبات الصداقة', flag: 'rooms' },
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

// Titles/descriptions in the other site languages come from src/locales/core.js
// (keyed by the Arabic source strings above).
// (this area's own wording first, so another page's meaning of a short key never leaks in)
const tx = (lang, ar) => (lang !== 'ar' && CORE[lang] && CORE[lang][ar]) || translate(lang, ar);

export function featureText(item, lang = getLang()) {
  return { title: tx(lang, item.title), desc: tx(lang, item.desc) };
}

// Group heading in the visitor's language.
export function groupTitle(group, lang = getLang()) {
  return tx(lang, group.title);
}

// Groups filtered for the current visitor (admin feature switches, guest/user).
export function visibleGroups(settings, user) {
  const feats = (settings && settings.features) || {};
  const app = isNative();
  return FEATURE_GROUPS.filter(g => app || !g.appOnly).map(g => ({
    ...g,
    items: g.items.filter(it => (!it.flag || feats[it.flag] !== false) && !(it.guestOnly && user)),
  })).filter(g => g.items.length);
}

export const ALL_FEATURES = FEATURE_GROUPS.filter(g => !g.appOnly).flatMap(g => g.items);

// Opens the floating assistant from anywhere (menu, palette, reader).
export function openAssistant(context) {
  window.dispatchEvent(new CustomEvent('openAI', { detail: context || null }));
}
