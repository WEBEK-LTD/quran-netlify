// "HH:MM" → the way the prayer page shows times: 12-hour with ص/م (Arabic) or AM/PM
// (English), 24-hour for Turkish, French, Urdu and Indonesian; the visitor's digits.
import { num, translate } from '../../l10n';
import { getLang } from '../../i18n';

export function fmtPrayerTime(hm, lang = getLang()) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || ''));
  if (!m) return '';
  const h = +m[1];
  if (lang === 'ar' || lang === 'en') {
    const ap = translate(lang, h < 12 ? 'ص' : 'م');
    return `${num(`${h % 12 || 12}:${m[2]}`, lang)} ${ap}`;
  }
  return num(`${String(h).padStart(2, '0')}:${m[2]}`, lang);
}
