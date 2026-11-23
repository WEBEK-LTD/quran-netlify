// «إبلاغ» — one sheet for people, messages, rooms, photos and groups (design 18).
// targets: [{ type: user|photo|room_message|dm_message|room|group|group_photo, id, preview?, context? }]
import { useEffect, useState } from 'react';
import { capi } from './api';
import { toast } from './store';
import { useT } from './format';
import { errText } from './errors';
import { Sheet, RIcon, ErrorBox, css as s } from './ui';

const REASONS = [
  ['harassment', 'تحرّش أو إساءة'],
  ['hate', 'كراهية أو تحريض'],
  ['sexual', 'محتوى غير لائق أو جنسي'],
  ['spam', 'إزعاج أو إعلانات'],
  ['impersonation', 'انتحال شخصية'],
  ['inappropriate_photo', 'صورة غير لائقة'],
  ['child_safety', 'خطر على طفل'],
  ['violence', 'عنف أو تهديد'],
  ['gender_rules', 'مخالفة الفصل بين الجنسين'],
  ['other', 'سبب آخر'],
];
const KIND = {
  user: 'شخص', photo: 'صورة', group_photo: 'صورة', room_message: 'رسالة', dm_message: 'رسالة', room: 'غرفة', group: 'جروب',
};
const TITLE = {
  user: 'إبلاغ عن شخص', photo: 'إبلاغ عن صورة', group_photo: 'إبلاغ عن صورة', room_message: 'إبلاغ عن رسالة',
  dm_message: 'إبلاغ عن رسالة', room: 'إبلاغ عن غرفة', group: 'إبلاغ عن جروب',
};

export default function ReportSheet({ open, targets, onClose }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { if (open) { setI(0); setReason(''); setDetails(''); setErr(null); } }, [open]);
  const list = (targets || []).filter(Boolean);
  const cur = list[i] || list[0];
  if (!open || !cur) return null;
  const isPhoto = cur.type === 'photo' || cur.type === 'group_photo';
  const reasons = REASONS.filter(([id]) => isPhoto || id !== 'inappropriate_photo');

  async function send() {
    setBusy(true); setErr(null);
    try {
      await capi.post('/reports', { target_type: cur.type, target_id: cur.id, reason, details: details.trim() || undefined });
      toast(t('وصل بلاغك، شكراً لك. سيراجعه فريق الإشراف.'));
      onClose();
    } catch (e) { setErr(e); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t(TITLE[cur.type] || 'إبلاغ')} tall
      footer={<button type="button" className={`${s.btn} ${s.btnGold} ${s.btnBlock}`} disabled={!reason || busy} onClick={send}>{busy ? t('جارٍ الإرسال…') : t('إرسال البلاغ')}</button>}>
      {list.length > 1 && (
        <div className={s.filters} role="radiogroup" aria-label={t('ما الذي تبلّغ عنه؟')}>
          {list.map((x, k) => (
            <button key={x.type + x.id} type="button" role="radio" aria-checked={k === i} className={s.chip} aria-pressed={k === i} onClick={() => { setI(k); setReason(''); }}>{t(KIND[x.type])}</button>
          ))}
        </div>
      )}
      {(cur.preview || cur.context) && (
        <div className={s.card} style={{ padding: 12 }}>
          {cur.context && <p className={s.faint} dir="auto">{cur.context}</p>}
          {cur.preview && <p style={{ margin: 0, overflowWrap: 'anywhere' }} dir="auto">{cur.preview}</p>}
        </div>
      )}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={s.label} style={{ marginBottom: 4 }}>{t('ما المشكلة؟')}</legend>
        <div role="radiogroup" aria-label={t('ما المشكلة؟')}>
          {reasons.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={reason === id} className={s.setRow} style={{ width: '100%', background: 'none', border: 0, borderBottom: 'var(--bw) solid var(--line)', color: 'inherit', font: 'inherit', textAlign: 'start', cursor: 'pointer', gridTemplateColumns: 'auto minmax(0,1fr)' }} onClick={() => setReason(id)}>
              <span className={s.radio} aria-hidden="true" style={reason === id ? { borderColor: 'var(--gold)', boxShadow: 'inset 0 0 0 5px var(--surface), inset 0 0 0 12px var(--gold)' } : undefined} />
              <span>{t(label)}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <label className={s.field}>
        <span className={s.label}>{t('ملاحظة')} <small>({t('اختياري')})</small></span>
        <textarea className={s.textarea} value={details} maxLength={1000} dir="auto" onChange={e => setDetails(e.target.value)} placeholder={t('اكتب ما حدث باختصار')} />
      </label>
      <p className={s.note}><RIcon name="shield" size={16} />{t('سيُراجع البلاغ فريق الإشراف. لن يعرف صاحب المحتوى من أبلغ عنه.')}</p>
      {err && <ErrorBox text={errText(t, err)} />}
    </Sheet>
  );
}
