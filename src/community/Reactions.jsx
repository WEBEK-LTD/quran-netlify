// The six reaction badges (design «التفاعلات»): drawn shapes in the gilded-mushaf
// style — no emoji, no animated images. The Arabic phrases stay Arabic on the badge
// (they are du'a/dhikr); the label under it is translated.
import { useId } from 'react';
import { css as s } from './ui';

export const REACTIONS = [
  { type: 'clap', label: 'تصفيق', cap: 'يُستخدم أيضاً كسقفة موجّهة' },
  { type: 'heart', label: 'قلب', cap: 'محبة وتقدير' },
  { type: 'mashallah', label: 'ما شاء الله', cap: 'إعجاب بالتلاوة أو الحفظ' },
  { type: 'barakallah', label: 'بارك الله فيك', cap: 'شكر للمتحدث' },
  { type: 'ameen', label: 'آمين', cap: 'تأمين على الدعاء' },
  { type: 'jazakallah', label: 'جزاك الله خيراً', cap: 'دعاء وشكر' },
];

const HAND = 'M11 19.5 7.3 15.8a1.6 1.6 0 0 1 2.3-2.3l1.4 1.4V8.2a1.5 1.5 0 0 1 3 0v5M14 7a1.5 1.5 0 0 1 3 0v6.3M17 8.2a1.5 1.5 0 0 1 3 0v6.6a5.6 5.6 0 0 1-5.6 5.6h-.8M5.6 7.5 3.8 5.8M8.3 5.2 7.7 2.9M4.2 10.6l-2.4-.5';

export function ReactionBadge({ type, size = 64 }) {
  const uid = useId().replace(/:/g, '');
  const g = `g${uid}`, e = `e${uid}`;
  const defs = (
    <defs>
      <linearGradient id={g} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F6DFA0" /><stop offset=".45" stopColor="#D4AE5C" /><stop offset=".75" stopColor="#B8893A" /><stop offset="1" stopColor="#E7C77E" /></linearGradient>
      <linearGradient id={e} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1B6A4B" /><stop offset="1" stopColor="#072E20" /></linearGradient>
    </defs>
  );
  const star = (
    <>
      <rect x="27" y="27" width="74" height="74" rx="5" fill={`url(#${g})`} />
      <rect x="27" y="27" width="74" height="74" rx="5" fill={`url(#${g})`} transform="rotate(45 64 64)" />
      <rect x="27" y="27" width="74" height="74" rx="5" fill="none" stroke="#8C6A1E" strokeWidth="1.2" />
      <rect x="27" y="27" width="74" height="74" rx="5" fill="none" stroke="#8C6A1E" strokeWidth="1.2" transform="rotate(45 64 64)" />
      <circle cx="64" cy="64" r="34" fill={`url(#${e})`} stroke="#F0D89A" strokeWidth="1.5" />
      <circle cx="64" cy="64" r="29" fill="none" stroke="rgba(240,216,154,.4)" strokeWidth="1" />
    </>
  );
  let bg, inner = null;
  const fs = (k) => ({ fontSize: Math.round(size * k) });
  switch (type) {
    case 'clap':
      bg = star;
      inner = <svg viewBox="0 0 24 24" width={size * 0.36} height={size * 0.36} style={{ position: 'relative' }} fill="none" stroke="#F0D89A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={HAND} /></svg>;
      break;
    case 'heart':
      bg = star;
      inner = <svg viewBox="0 0 24 24" width={size * 0.34} height={size * 0.34} style={{ position: 'relative' }}><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" fill={`url(#${g})`} stroke="#F6DFA0" strokeWidth="1" strokeLinejoin="round" /></svg>;
      break;
    case 'mashallah':
      bg = <><circle cx="64" cy="64" r="58" fill={`url(#${g})`} /><circle cx="64" cy="64" r="58" fill="none" stroke="#8C6A1E" strokeWidth="1.2" /><circle cx="64" cy="64" r="51" fill="none" stroke="#8C6A1E" strokeWidth="1" strokeDasharray="2 4" /><circle cx="64" cy="64" r="45" fill={`url(#${e})`} stroke="#F0D89A" strokeWidth="1.5" /></>;
      inner = <span className={s.badgeTxt} style={fs(0.15)}>ما شاء<br />الله</span>;
      break;
    case 'barakallah':
      bg = <><path d="M8 64 24 34h80l16 30-16 30H24z" fill={`url(#${g})`} /><path d="M8 64 24 34h80l16 30-16 30H24z" fill="none" stroke="#8C6A1E" strokeWidth="1.2" /><path d="M18 64 29 42h70l11 22-11 22H29z" fill={`url(#${e})`} stroke="#F0D89A" strokeWidth="1.5" /></>;
      inner = <span className={s.badgeTxt} style={fs(0.125)}>بارك الله<br />فيك</span>;
      break;
    case 'ameen':
      bg = <><path d="M22 122V60c0-26 20-42 42-54 22 12 42 28 42 54v62z" fill={`url(#${g})`} /><path d="M22 122V60c0-26 20-42 42-54 22 12 42 28 42 54v62z" fill="none" stroke="#8C6A1E" strokeWidth="1.2" /><path d="M30 114V62c0-21 16-34 34-44 18 10 34 23 34 44v52z" fill={`url(#${e})`} stroke="#F0D89A" strokeWidth="1.5" /></>;
      inner = <span className={s.badgeTxt} style={{ ...fs(0.15), marginTop: size * 0.12 }}>آمين</span>;
      break;
    default: // jazakallah
      bg = <><path d="M40 8h48l32 32v48l-32 32H40L8 88V40z" fill={`url(#${g})`} /><path d="M40 8h48l32 32v48l-32 32H40L8 88V40z" fill="none" stroke="#8C6A1E" strokeWidth="1.2" /><path d="M44 17h40l27 27v40l-27 27H44L17 84V44z" fill={`url(#${e})`} stroke="#F0D89A" strokeWidth="1.5" /></>;
      inner = <span className={s.badgeTxt} style={fs(0.125)}>جزاك الله<br />خيراً</span>;
  }
  return (
    <span className={s.badge} style={{ width: size, height: size }} aria-hidden="true">
      <svg className={s.badgeBg} viewBox="0 0 128 128">{defs}{bg}</svg>
      {inner}
    </span>
  );
}
