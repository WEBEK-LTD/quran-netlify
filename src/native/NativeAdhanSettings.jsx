// ─── App-only adhan settings (mounted in the prayer page's «تنبيه الأذان» row) ─
// The page keeps its per-prayer on/off toggles (nq_pray_alarms); this adds the
// style per prayer (adhan / notification / silent), muezzins, the reminder, the
// daily ayah, Do-Not-Disturb opt-in and the OS permissions.
// Recording sources are listed on the privacy page. Every change re-plans the notifications (adhan/notifications.js).
import { useEffect, useState, useCallback } from 'react';
import { useTr, num } from '../l10n';
import { Icon } from '../components/ornaments/Ornaments';
import { isIOS, isAndroid } from './platform';
import { readSettings, writeSettings, onSettings } from './adhan/settings';
import { PRAYERS, REMINDER_CHOICES } from './adhan/schedule';
import {
  reschedule, notificationPermission, requestNotificationPermission, exactAlarmStatus, openExactAlarmSettings,
} from './adhan/notifications';
import { regularRecordings, fajrRecordings, recordingName, recordingFor, channelIdFor } from './adhan/muezzins';
import { playAdhan, stopAdhan } from './adhan/player';
import { showAdhanMoment } from './adhan/moment';
import { fmtPrayerTime } from './adhan/format';
import { NQNative } from './nqNative';
import { confirmDialog } from './ui';
import styles from './NativeAdhanSettings.module.css';

const PRAYER_AR = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };

function openAppSettings() {
  if (isAndroid()) NQNative.openChannelSettings({}).catch(() => {});
  else window.location.href = 'app-settings:';
}

export default function NativeAdhanSettings({ alarms, onToggle, coords, method, tz, city }) {
  const tr = useTr();
  const [s, setS] = useState(readSettings);
  const [perm, setPerm] = useState('prompt');
  const [exact, setExact] = useState('granted');
  const [status, setStatus] = useState(null);
  const [preview, setPreview] = useState('');

  useEffect(() => onSettings(setS), []);

  const refresh = useCallback(async () => {
    setPerm(await notificationPermission());
    setExact(await exactAlarmStatus());
    const r = await reschedule('settings-ui');
    if (r) setStatus(r);
  }, []);

  // City, method, zone or the page's toggles changed → re-plan
  const alarmKey = PRAYERS.map(p => (alarms && alarms[p] ? 1 : 0)).join('');
  useEffect(() => { refresh(); }, [alarmKey, coords && coords.lat, coords && coords.lon, method, tz, city, refresh]);
  useEffect(() => () => stopAdhan(), []);

  async function enable() {
    let p = await notificationPermission();
    if (p !== 'granted') {
      const ok = await confirmDialog({
        title: tr('تنبيه الأذان'),
        body: tr('ليصلك الأذان في وقته حتى والتطبيق مغلق، نحتاج إذنك بالإشعارات. تُحسب المواقيت على جهازك، ولا يُرسل موقعك إلى خادمنا.'),
        confirm: tr('متابعة'), cancel: tr('ليس الآن'),
      });
      if (!ok) return;
      p = await requestNotificationPermission();
      setPerm(p);
      if (p !== 'granted') return;
    }
    writeSettings({ enabled: true });
    if (!PRAYERS.some(k => alarms && alarms[k])) PRAYERS.forEach(k => onToggle(k));   // first time: all five on
    if (isAndroid() && (await exactAlarmStatus()) !== 'granted') {
      const ok = await confirmDialog({
        title: tr('الأذان في وقته بالدقيقة'),
        body: tr('يحتاج Android إذن «المنبّهات والتذكيرات» ليُرفع الأذان في وقته تماماً وليس متأخراً بضع دقائق. سنفتح لك صفحة الإذن، فعّله ثم عُد إلى التطبيق.'),
        confirm: tr('فتح الإعدادات'), cancel: tr('لاحقاً'),
      });
      if (ok) await openExactAlarmSettings();
    }
    refresh();
  }

  function setMode(prayer, mode) {
    const on = !!(alarms && alarms[prayer]);
    if (mode === 'silent') { if (on) onToggle(prayer); return; }
    if (!on) onToggle(prayer);
    writeSettings({ modes: { ...s.modes, [prayer]: mode } });
  }

  function togglePreview(id) {
    if (preview === id) { stopAdhan(); setPreview(''); return; }
    const el = playAdhan(id, 0);
    setPreview(id);
    if (el) el.addEventListener('ended', () => setPreview(p => (p === id ? '' : p)), { once: true });
  }

  function testNow() {
    stopAdhan(); setPreview('');
    const rec = recordingFor(s, 'Dhuhr');
    showAdhanMoment({ id: null, prayer: 'Dhuhr', time: '', city: city || '', recording: rec && rec.id, play: !!rec, offset: 0 });
  }

  const regular = regularRecordings();
  const fajr = fajrRecordings();
  const curReg = recordingFor(s, 'Dhuhr');
  const curFajr = recordingFor(s, 'Fajr');
  const denied = perm === 'denied';
  const active = s.enabled && perm === 'granted';
  const next = status && status.next;

  if (!active) {
    return (
      <div className={styles.box}>
        <div className={styles.intro}>
          <Icon name="bell" />
          <p>{denied
            ? tr('الإشعارات متوقفة لهذا التطبيق. فعّلها من إعدادات الجهاز ليصلك الأذان في وقته.')
            : tr('فعّل الأذان ليُرفع في وقت كل صلاة حتى والتطبيق مغلق، مع تذكير اختياري قبله وآية كل صباح.')}</p>
        </div>
        {denied
          ? <button type="button" className="nq-btn gold sm" onClick={openAppSettings}><Icon name="gear" />{tr('فتح إعدادات الجهاز')}</button>
          : <button type="button" className="nq-btn gold sm" onClick={enable}><Icon name="bell" />{tr('تفعيل الأذان')}</button>}
      </div>
    );
  }

  return (
    <div className={styles.box}>
      {isAndroid() && exact !== 'granted' && (
        <div className={styles.warn} role="status">
          <Icon name="timer" />
          <span>{tr('قد يتأخر الأذان بضع دقائق لأن إذن «المنبّهات والتذكيرات» غير مفعّل.')}</span>
          <button type="button" className="nq-btn ghost sm" onClick={async () => { await openExactAlarmSettings(); refresh(); }}>{tr('تفعيل')}</button>
        </div>
      )}

      <div className={styles.rows} role="group" aria-label={tr('طريقة التنبيه لكل صلاة')}>
        {PRAYERS.map(p => {
          const mode = alarms && alarms[p] ? (s.modes[p] === 'notify' ? 'notify' : 'adhan') : 'silent';
          return (
            <div key={p} className={styles.row}>
              <span className={styles.pname}>{tr(PRAYER_AR[p])}</span>
              <div className="nq-seg" role="group" aria-label={tr('تنبيه صلاة {p}', { p: tr(PRAYER_AR[p]) })}>
                <button type="button" aria-pressed={mode === 'adhan'} onClick={() => setMode(p, 'adhan')}>{tr('أذان كامل')}</button>
                <button type="button" aria-pressed={mode === 'notify'} onClick={() => setMode(p, 'notify')}>{tr('إشعار فقط')}</button>
                <button type="button" aria-pressed={mode === 'silent'} onClick={() => setMode(p, 'silent')}>{tr('صامت')}</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>{tr('المؤذّن')}</span>
          <span className={styles.inline}>
            <select value={curReg ? curReg.id : ''} onChange={e => writeSettings({ muezzin: e.target.value })}>
              {regular.map(r => <option key={r.id} value={r.id}>{recordingName(r, tr.lang)}</option>)}
            </select>
            {curReg && <button type="button" className="nq-btn ghost sm" onClick={() => togglePreview(curReg.id)} aria-pressed={preview === curReg.id}>
              <Icon name={preview === curReg.id ? 'pause' : 'play'} />{preview === curReg.id ? tr('إيقاف') : tr('استماع')}
            </button>}
          </span>
        </label>
        <label className={styles.field}>
          <span>{tr('مؤذّن الفجر')}</span>
          <span className={styles.inline}>
            <select value={curFajr ? curFajr.id : ''} onChange={e => writeSettings({ fajrMuezzin: e.target.value })}>
              {(fajr.length ? fajr : regular).map(r => <option key={r.id} value={r.id}>{recordingName(r, tr.lang)}</option>)}
            </select>
            {curFajr && <button type="button" className="nq-btn ghost sm" onClick={() => togglePreview(curFajr.id)} aria-pressed={preview === curFajr.id}>
              <Icon name={preview === curFajr.id ? 'pause' : 'play'} />{preview === curFajr.id ? tr('إيقاف') : tr('استماع')}
            </button>}
          </span>
        </label>
        <label className={styles.field}>
          <span>{tr('تذكير قبل الأذان')}</span>
          <select value={s.reminder} onChange={e => writeSettings({ reminder: +e.target.value })}>
            {REMINDER_CHOICES.map(m => <option key={m} value={m}>{m ? tr('قبل {n} دقيقة', { n: num(m) }) : tr('بدون تذكير')}</option>)}
          </select>
        </label>
        <div className={styles.field}>
          <span>{tr('آية اليوم كل صباح')}</span>
          <span className={styles.inline}>
            <button type="button" role="switch" className={styles.tog} aria-checked={s.dailyAyah}
              aria-label={tr('آية اليوم كل صباح')} onClick={() => writeSettings({ dailyAyah: !s.dailyAyah })} />
            <input type="time" value={s.dailyAyahTime} disabled={!s.dailyAyah} aria-label={tr('وقت آية اليوم')}
              onChange={e => e.target.value && writeSettings({ dailyAyahTime: e.target.value })} />
          </span>
        </div>
      </div>

      <div className={styles.dnd}>
        <Icon name="moon" />
        {isAndroid() ? (
          <>
            <span>{tr('يحترم الأذان وضع «عدم الإزعاج». إن أردت أن يُرفع رغم ذلك، فعّل «تجاوز عدم الإزعاج» لقناة الأذان من إعدادات الجهاز.')}</span>
            <button type="button" className="nq-btn ghost sm" onClick={() => NQNative.openChannelSettings({ channelId: curReg ? channelIdFor(curReg.id) : undefined }).catch(() => {})}>{tr('إعدادات القناة')}</button>
          </>
        ) : (
          <>
            <span>{tr('يحترم الأذان وضع التركيز «عدم الإزعاج». فعّل هذا الخيار ليصل تنبيه الأذان كتنبيه حسّاس للوقت، ثم اسمح بذلك للتطبيق من إعدادات التركيز.')}</span>
            <button type="button" role="switch" className={styles.tog} aria-checked={s.breakthrough}
              aria-label={tr('تنبيه حسّاس للوقت')} onClick={() => writeSettings({ breakthrough: !s.breakthrough })} />
          </>
        )}
      </div>

      <div className={styles.foot}>
        <p className={styles.status} role="status">
          <Icon name="check" />
          {next
            ? tr('جُدول {n} تنبيهاً على هذا الجهاز. التالي: صلاة {p} عند {t}.', { n: num(status.scheduled), p: tr(PRAYER_AR[next.prayer]), t: fmtPrayerTime(next.time, tr.lang) })
            : status ? tr('جُدول {n} تنبيهاً على هذا الجهاز.', { n: num(status.scheduled) }) : tr('جارٍ جدولة التنبيهات…')}
          {isIOS() && status && status.scheduled >= 60 ? ` ${tr('يُجدَّد الجدول تلقائياً كلما فتحت التطبيق.')}` : ''}
        </p>
        <div className={styles.inline}>
          <button type="button" className="nq-btn ghost sm" onClick={testNow}><Icon name="mosque" />{tr('جرّب شاشة الأذان')}</button>
          <button type="button" className="nq-btn ghost sm" onClick={() => writeSettings({ enabled: false })}>{tr('إيقاف الأذان على هذا الجهاز')}</button>
        </div>
      </div>

    </div>
  );
}
