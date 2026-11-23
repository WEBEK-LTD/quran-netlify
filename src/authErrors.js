// Messages for auth-related ApiError codes (docs/API.md), in the visitor's language.
// Source strings are Arabic; translations live in src/locales/account.js.
import { ApiError, errorMessage } from './backend';
import { trNow } from './l10n';
import { getLang } from './i18n';

const AR = /[؀-ۿ]/;
const UNEXPECTED = 'حدث خطأ غير متوقع، حاول مرة أخرى';

// Our own wording for the codes the UI explains (translated with trNow).
const CODE_TEXT = {
  invalid_credentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  email_taken:         'هذا البريد مسجّل بالفعل — سجّل الدخول أو استعد كلمة المرور',
  signup_closed:       'التسجيل مغلق حالياً، حاول لاحقاً',
  rate_limited:        'محاولات كثيرة — انتظر قليلاً ثم حاول مجدداً',
  banned:              'تم إيقاف هذا الحساب. تواصل مع الدعم إن كان هذا خطأ',
  network:             'تعذّر الاتصال بالخادم، تحقق من الإنترنت',
  maintenance:         'التطبيق في وضع الصيانة حالياً، عُد بعد قليل',
  unauthenticated:     'يجب تسجيل الدخول أولاً',
  forbidden:           'ليست لديك صلاحية لهذا الإجراء',
  not_found:           'العنصر غير موجود',
  server:              'حدث خطأ في الخادم، حاول لاحقاً',
  feature_disabled:    'هذه الميزة متوقفة حالياً',
  ticket_closed:       'هذه التذكرة مغلقة — افتح استفساراً جديداً',
};

// Like backend.errorMessage(), but in the visitor's language: Arabic output is
// unchanged; for other languages known codes get our translated wording, and
// anything else falls back to the (Arabic) server text.
export function apiErrorText(err, fallback = UNEXPECTED) {
  const base = errorMessage(err, fallback);
  if (getLang() === 'ar') return base;
  if (err instanceof ApiError) {
    if (err.code === 'network') return trNow(err.message || CODE_TEXT.network);
    if (err.code === 'validation') return trNow(fallback === UNEXPECTED ? 'تحقق من البيانات المدخلة' : fallback);
    if (CODE_TEXT[err.code]) return trNow(CODE_TEXT[err.code]);
  }
  return trNow(base);   // translates our fallbacks; server text stays as sent
}

export function authErrorText(err) {
  if (!(err instanceof ApiError)) return trNow(UNEXPECTED);
  const ar = getLang() === 'ar';
  switch (err.code) {
    case 'invalid_credentials': return trNow('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    case 'email_taken':         return trNow('هذا البريد مسجّل بالفعل — سجّل الدخول أو استعد كلمة المرور');
    case 'signup_closed':       return trNow('التسجيل مغلق حالياً، حاول لاحقاً');
    case 'rate_limited':        return trNow('محاولات كثيرة — انتظر بضع دقائق ثم حاول مجدداً');
    case 'banned':              return trNow('تم إيقاف هذا الحساب. تواصل مع الدعم إن كان هذا خطأ');
    case 'network':             return trNow(err.message || 'تعذّر الاتصال بالخادم، تحقق من الإنترنت');
    case 'maintenance':         return trNow('التطبيق في صيانة مؤقتة، عُد بعد قليل');
    case 'validation': {
      const f = err.fields || {};
      // Server field messages are Arabic: show them only to Arabic readers.
      if (f.email)    return trNow('البريد الإلكتروني غير صالح') + (ar && typeof f.email === 'string' && AR.test(f.email) ? ` — ${f.email}` : '');
      if (f.password || f.new_password) return (ar && AR.test(String(f.password || f.new_password)) ? String(f.password || f.new_password) : trNow('كلمة المرور يجب ألا تقل عن 8 أحرف'));
      if (f.name)     return ar && AR.test(String(f.name)) ? String(f.name) : trNow('يرجى كتابة الاسم');
      if (f.token)    return trNow('الرابط غير صالح أو انتهت صلاحيته');
      return ar ? errorMessage(err, 'تحقق من البيانات المدخلة') : trNow('تحقق من البيانات المدخلة');
    }
    default: return apiErrorText(err);
  }
}

// ?reason=… from /auth/callback?status=error (Google sign-in)
export function googleErrorText(reason) {
  switch (reason) {
    case 'banned':         return trNow('تم إيقاف هذا الحساب. تواصل مع الدعم إن كان هذا خطأ');
    case 'signup_closed':  return trNow('التسجيل مغلق حالياً — لا يمكن إنشاء حساب جديد بحساب Google');
    case 'cancelled':
    case 'access_denied':  return trNow('تم إلغاء تسجيل الدخول بحساب Google');
    case 'not_configured':
    case 'google_disabled': return trNow('تسجيل الدخول بحساب Google غير متاح حالياً');
    case 'maintenance':    return trNow('التطبيق في صيانة مؤقتة، عُد بعد قليل');
    default:               return trNow('تعذّر تسجيل الدخول بحساب Google، حاول مرة أخرى');
  }
}
