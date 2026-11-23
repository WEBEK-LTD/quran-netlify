// API error → a kind, translated sentence (docs/API.md error codes).
import { n, fmtDate } from './format';

/** Text for a suspension/rooms ban: `{until, permanent}` from the error or from the profile. */
export function suspensionText(t, code, s) {
  const rooms = code === 'rooms_banned' || (s && s.scope === 'rooms');
  const until = s && s.until ? fmtDate(s.until, t.lang, { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  if (until) return rooms ? t('تم منعك من الغرف الصوتية حتى {date}.', { date: until }) : t('حسابك موقوف في المجتمع حتى {date}.', { date: until });
  if (s && s.permanent) return rooms ? t('تم منعك من الغرف الصوتية.') : t('تم إيقاف حسابك في المجتمع.');
  return rooms ? t('تم منعك من الغرف الصوتية حتى تراجع الإدارة الأمر.') : t('حسابك موقوف في المجتمع حتى تراجع الإدارة الأمر.');
}

export function errText(t, e) {
  if (!e) return '';
  const x = e.extra || {};
  switch (e.code) {
    case 'network': return t('تعذّر الاتصال. تحقّق من الإنترنت ثم حاول مرة أخرى.');
    case 'timeout': return t('انتهت مهلة الاتصال، حاول مرة أخرى.');
    case 'rate_limited': {
      const s = parseInt(x.retry_after, 10) || 0;
      if (s >= 50) return t('تمهّل قليلاً، يمكنك المحاولة بعد دقيقة.');
      if (s > 2) return t('تمهّل قليلاً، يمكنك المحاولة بعد {n} ثانية.', { n: n(s, t.lang) });
      return t('تمهّل قليلاً ثم حاول مرة أخرى.');
    }
    case 'content_review': return t('لم تُرسَل رسالتك: فيها كلمات تحتاج مراجعة فريق الإشراف.');
    case 'links_not_allowed': return t('الروابط وعناوين البريد والحسابات غير مسموحة هنا. اكتب نصاً فقط.');
    case 'minor_restricted': return t('الرسائل الخاصة والصداقات غير متاحة لمن هم دون ١٨ سنة.');
    case 'dm_not_allowed': return t('هذا الشخص لا يستقبل رسائل منك.');
    case 'community_suspended':
    case 'rooms_banned': return suspensionText(t, e.code, x);
    case 'underage': return t('الغرف والمجتمع متاحة لمن أتمّ ١٣ سنة.');
    case 'community_profile_required': return t('أكمل بياناتك (الجنس وتاريخ الميلاد) أولاً.');
    case 'gender_locked':
    case 'birthdate_locked': return t('لا يمكن تغيير الجنس أو تاريخ الميلاد بعد تحديدهما. تواصل مع الدعم إن كان هناك خطأ.');
    case 'kicked': return t('تم إخراجك من هذه الغرفة، ولا يمكنك العودة إليها.');
    case 'room_locked': return t('الغرفة مقفلة الآن ولا تستقبل أحداً جديداً.');
    case 'room_full': return t('الغرفة ممتلئة الآن. حاول بعد قليل.');
    case 'room_not_open': return t('الغرفة لم تبدأ بعد أو انتهت.');
    case 'room_not_scheduled': return t('الغرفة ليست مجدولة.');
    case 'room_limit': return t('وصلت إلى الحد الأقصى لغرفك المفتوحة والمجدولة ({n}). أغلق إحداها أولاً.', { n: n(x.limit || 3, t.lang) });
    case 'rooms_busy': return t('عدد الغرف المفتوحة الآن وصل للحد الأقصى. حاول بعد قليل أو جدول غرفتك.');
    case 'rooms_unavailable': return t('الغرف الصوتية غير متاحة حالياً.');
    case 'feature_disabled': return t('الغرف والمجتمع متوقفة حالياً.');
    case 'not_eligible': return t('لا يمكن دعوة هذا الشخص إلى هذا الجروب.');
    case 'transfer_first': return t('انقل إدارة الجروب إلى عضو آخر قبل المغادرة.');
    case 'not_found': return t('غير موجود أو لم يعد متاحاً.');
    case 'forbidden': return t('ليست لديك صلاحية لهذا الإجراء.');
    case 'unauthenticated': return t('سجّل الدخول أولاً.');
    case 'maintenance': return t('التطبيق في صيانة مؤقتة. حاول لاحقاً.');
    case 'payload_too_large':
    case 'avatar_too_large': return t('حجم الصورة كبير جداً (الحد الأقصى ٥ ميغابايت).');
    case 'unsupported_image': return t('نوع الصورة غير مدعوم. استخدم JPEG أو PNG أو WebP.');
    case 'validation': {
      // server field messages are Arabic; other languages get a general sentence
      const f = x.fields && Object.values(x.fields)[0];
      return t.lang === 'ar' && f ? String(f) : t('بعض البيانات غير صحيحة. راجعها ثم حاول مرة أخرى.');
    }
    default:
      return t.lang === 'ar' && e.message ? e.message : t('حدث خطأ غير متوقع. حاول مرة أخرى.');
  }
}
