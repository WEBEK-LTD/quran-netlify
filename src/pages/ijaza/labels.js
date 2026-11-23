// Small wording helpers shared by the Ijaza page and its player.
import { toAr } from '../../components/ornaments/Ornaments';
import { trCount } from '../../locales/library';

// «قارئ واحد / قارئان / ٣ قرّاء / ١١ قارئًا / ١٠٠ قارئ» in Arabic; "1 reciter / 5 reciters"… elsewhere
export function recitersLabel(tr, n) {
  if (tr.lang === 'ar') {
    if (n === 1) return 'قارئ واحد';
    if (n === 2) return 'قارئان';
    const m = n % 100;
    return `${toAr(n)} ${m >= 3 && m <= 10 ? 'قرّاء' : m >= 11 ? 'قارئًا' : 'قارئ'}`;
  }
  return trCount(tr, '{n} قارئ', n, { n: toAr(n) });
}
