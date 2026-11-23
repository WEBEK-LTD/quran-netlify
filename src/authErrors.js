// Arabic messages for auth-related ApiError codes (docs/API.md).
import { ApiError, errorMessage } from './backend';

export function authErrorText(err) {
  if (!(err instanceof ApiError)) return 'حدث خطأ غير متوقع، حاول مرة أخرى';
  switch (err.code) {
    case 'invalid_credentials': return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
    case 'email_taken':         return 'هذا البريد مسجّل بالفعل — سجّل الدخول أو استعد كلمة المرور';
    case 'signup_closed':       return 'التسجيل مغلق حالياً، حاول لاحقاً';
    case 'rate_limited':        return 'محاولات كثيرة — انتظر بضع دقائق ثم حاول مجدداً';
    case 'banned':              return 'تم إيقاف هذا الحساب. تواصل مع الدعم إن كان هذا خطأ';
    case 'network':             return err.message || 'تعذّر الاتصال بالخادم، تحقق من الإنترنت';
    case 'maintenance':         return 'التطبيق في صيانة مؤقتة، عُد بعد قليل';
    case 'validation': {
      const f = err.fields || {};
      if (f.email)    return 'البريد الإلكتروني غير صالح' + (typeof f.email === 'string' && /[؀-ۿ]/.test(f.email) ? ` — ${f.email}` : '');
      if (f.password || f.new_password) return (/[؀-ۿ]/.test(String(f.password || f.new_password)) ? String(f.password || f.new_password) : 'كلمة المرور يجب ألا تقل عن 8 أحرف');
      if (f.name)     return /[؀-ۿ]/.test(String(f.name)) ? String(f.name) : 'يرجى كتابة الاسم';
      if (f.token)    return 'الرابط غير صالح أو انتهت صلاحيته';
      return errorMessage(err, 'تحقق من البيانات المدخلة');
    }
    default: return errorMessage(err);
  }
}

// ?reason=… from /auth/callback?status=error (Google sign-in)
export function googleErrorText(reason) {
  switch (reason) {
    case 'banned':         return 'تم إيقاف هذا الحساب. تواصل مع الدعم إن كان هذا خطأ';
    case 'signup_closed':  return 'التسجيل مغلق حالياً — لا يمكن إنشاء حساب جديد بحساب Google';
    case 'cancelled':
    case 'access_denied':  return 'تم إلغاء تسجيل الدخول بحساب Google';
    case 'not_configured':
    case 'google_disabled': return 'تسجيل الدخول بحساب Google غير متاح حالياً';
    case 'maintenance':    return 'التطبيق في صيانة مؤقتة، عُد بعد قليل';
    default:               return 'تعذّر تسجيل الدخول بحساب Google، حاول مرة أخرى';
  }
}
