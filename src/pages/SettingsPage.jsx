// ─── Settings: appearance, reading, account, language ───────────────────────
import { useAuth, displayNameOf, avatarOf } from '../hooks/useAuth';
import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { updateProfile, changePassword, resendVerification, exportMyData } from '../backend';
import { authErrorText, apiErrorText } from '../authErrors';
import { useStore, setGlobal, savePref } from '../store';
import { READERS, TRANSLATIONS } from '../data';
import { MODES, useAppearance, setAppearance } from '../appearance';
import { PageHero, Icon, Badge8, toAr } from '../components/ornaments/Ornaments';
import LangSwitcher from '../components/LangSwitcher';
import AvatarEditor from '../components/account/AvatarEditor';
import styles from './SettingsPage.module.css';
import { useT } from '../i18n';
import { useTr, isRtl } from '../l10n';

const SECTIONS = [
  { id: 'appearance', icon: 'sun',  title: 'المظهر' },
  { id: 'reading',    icon: 'book', title: 'القراءة' },
  { id: 'account',    icon: 'user', title: 'الحساب' },
  { id: 'language',   icon: 'globe', title: 'اللغة' },
];

function Switch({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={disabled}
      className={`${styles.switch} ${checked ? styles.switchOn : ''}`} onClick={() => onChange(!checked)}>
      <span className={styles.thumb} />
    </button>
  );
}

function Row({ icon, title, desc, children, stack = false }) {
  return (
    <div className={`${styles.row} ${stack ? styles.rowStack : ''}`}>
      <div className={styles.rowText}>
        <span className={styles.rowTitle}>{icon && <Icon name={icon} />}{title}</span>
        {desc && <span className={styles.rowDesc}>{desc}</span>}
      </div>
      <div className={styles.rowCtl}>{children}</div>
    </div>
  );
}

function Section({ id, icon, title, sub, children }) {
  return (
    <section id={id} className={`nq-card ${styles.section}`} aria-labelledby={`${id}-h`}>
      <header className={styles.secHead}>
        <Badge8 icon={icon} size={48} />
        <div>
          <h2 id={`${id}-h`} className={styles.secTitle}>{title}</h2>
          {sub && <p className={styles.secSub}>{sub}</p>}
        </div>
      </header>
      <div className={styles.secBody}>{children}</div>
    </section>
  );
}

// Small illustrated swatch for each viewing mode.
function ModePreview({ id }) {
  return (
    <span className={styles.preview} data-m={id} aria-hidden="true">
      <span className={styles.pvBar} />
      <span className={styles.pvArch} />
      <span className={styles.pvLine} />
      <span className={`${styles.pvLine} ${styles.pvShort}`} />
      <span className={styles.pvChip} />
    </span>
  );
}

export default function SettingsPage() {
  const t = useT();
  const tr = useTr();
  const { user, signOut } = useAuth();
  const navigate  = useNavigate();
  const [state]   = useStore();
  const look = useAppearance();
  const [saved,         setSaved]        = useState(false);
  const [editingName,   setEditingName]  = useState(false);
  const [editingPw,     setEditingPw]    = useState(false);
  const [newName,       setNewName]      = useState('');
  const [curPw,         setCurPw]        = useState('');
  const [newPw,         setNewPw]        = useState('');
  const [profileLoading,setProfileLoading] = useState(false);
  const [lbLoading,     setLbLoading]    = useState(false);
  const [verifyState,   setVerifyState]  = useState(''); // '' | 'sending' | 'sent'
  const [profileMsg,    setProfileMsg]   = useState(null); // { text, ok }
  const [exporting,     setExporting]    = useState(false);
  const [notifPerm,     setNotifPerm]    = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
  const msgTimer = useRef(null);
  const savedTimer = useRef(null);
  useEffect(() => () => { clearTimeout(msgTimer.current); clearTimeout(savedTimer.current); }, []);

  // Google-only accounts have no password yet (API may send has_password)
  const hasPassword = user?.has_password !== false;

  function flash(text, ok, ms = 3500) {
    setProfileMsg({ text, ok });
    clearTimeout(msgTimer.current);
    if (ok) msgTimer.current = setTimeout(() => setProfileMsg(null), ms);
  }

  function showSaved() {
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1800);
  }

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  async function handleUpdateName(e) {
    e?.preventDefault();
    if (!newName.trim()) return;
    setProfileLoading(true); setProfileMsg(null);
    try {
      await updateProfile({ name: newName.trim() });
      setEditingName(false);
      flash(tr('تم تحديث الاسم'), true);
    } catch (err) {
      flash(authErrorText(err), false);
    }
    setProfileLoading(false);
  }

  async function handleUpdatePw(e) {
    e?.preventDefault();
    if (newPw.length < 8) { flash(tr('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف'), false); return; }
    if (hasPassword && !curPw) { flash(tr('اكتب كلمة المرور الحالية'), false); return; }
    setProfileLoading(true); setProfileMsg(null);
    try {
      await changePassword(hasPassword ? curPw : null, newPw);
      setEditingPw(false); setNewPw(''); setCurPw('');
      flash(tr('تم تغيير كلمة المرور، وسُجّل خروجك من الأجهزة الأخرى'), true);
    } catch (err) {
      const f = err?.fields || {};
      flash(f.current_password ? tr('كلمة المرور الحالية غير صحيحة') : authErrorText(err), false);
    }
    setProfileLoading(false);
  }

  async function toggleLeaderboard(next) {
    setLbLoading(true); setProfileMsg(null);
    try {
      await updateProfile({ show_on_leaderboard: !!next });
      flash(next ? tr('سيظهر اسمك في لوحة المتصدرين') : tr('لن يظهر اسمك في لوحة المتصدرين'), true);
    } catch (err) {
      flash(apiErrorText(err, 'تعذّر حفظ الإعداد'), false);
    }
    setLbLoading(false);
  }

  async function handleResendVerify() {
    setVerifyState('sending');
    try { await resendVerification(); setVerifyState('sent'); }
    catch (err) { setVerifyState(''); flash(apiErrorText(err, 'تعذّر إرسال رسالة التأكيد'), false); }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nur-alquran-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash(tr('تم تنزيل نسخة من بياناتك'), true);
    } catch (err) {
      flash(apiErrorText(err, 'تعذّر تنزيل البيانات، حاول مجدداً'), false);
    }
    setExporting(false);
  }

  async function enableReminder() {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === 'granted') new Notification(tr('تم تفعيل المنبّه'), { body: tr('ستصلك إشعارات يومية'), icon: '/icons/icon-192.png' });
  }

  function saveSetting(key, val) {
    setGlobal({ [key]: val });
    if (key === 'fontSize')    { document.documentElement.style.setProperty('--font-size', val + 'px'); savePref('nq_fontSize', Number(val)); }
    if (key === 'fontStyle')   savePref('nq_fontStyle', val);
    if (key === 'reader')      savePref('nq_reader', val);
    if (key === 'translation') savePref('nq_translation', val);
    if (key === 'highlightMode') savePref('nq_highlight', !!val);
    showSaved();
  }

  function look_(patch) { setAppearance(patch); showSaved(); }

  const curTrans = state.translation || 'none';
  const name = user ? displayNameOf(user) : '';

  return (
    <div className={styles.page}>
      <PageHero eyebrow={tr('تفضيلاتك')} title={t('settingsTitle') || tr('الإعدادات')}
        sub={tr('اضبط المظهر وطريقة القراءة والتلاوة وحسابك. تُحفظ اختياراتك تلقائياً على هذا الجهاز.')} />

      <div className={`nq-wrap ${styles.layout}`}>
        <nav className={styles.toc} aria-label={tr('أقسام الإعدادات')}>
          {SECTIONS.map(s => (
            <a key={s.id} href={`#${s.id}`} className={styles.tocLink}><Icon name={s.icon} />{tr(s.title)}</a>
          ))}
        </nav>

        <div className={styles.main}>
          {/* ── appearance ── */}
          <Section id="appearance" icon="sun" title={tr('المظهر')} sub={tr('اختر وضع العرض الذي يريح عينيك، وكل الصفحات تتبعه.')}>
            <div className={styles.modes} role="group" aria-label={tr('وضع العرض')}>
              {MODES.map(m => (
                <button key={m.id} type="button" aria-pressed={look.mode === m.id}
                  className={styles.mode} onClick={() => look_({ mode: m.id })}>
                  <ModePreview id={m.id} />
                  <span className={styles.modeName}>
                    {look.mode === m.id && <Icon name="check" />}{tr(m.label)}
                  </span>
                  <span className={styles.modeHint}>{tr(m.hint)}</span>
                </button>
              ))}
            </div>

            <Row icon="aa" title={tr('حجم النص في الموقع')} desc={tr('يكبّر أو يصغّر كل نصوص الموقع والأزرار.')} stack>
              <div className={styles.sizeCtl}>
                <span className={styles.aSmall} aria-hidden="true">{tr('أ')}</span>
                <input type="range" min="90" max="140" step="5" value={look.size} className={styles.range}
                  aria-label={tr('حجم النص')} aria-valuetext={tr('{n}٪', { n: look.size })}
                  onChange={e => look_({ size: Number(e.target.value) })} />
                <span className={styles.aBig} aria-hidden="true">{tr('أ')}</span>
                <output className={`nq-num ${styles.val}`}>{tr('{n}٪', { n: toAr(look.size) })}</output>
                {look.size !== 100 && (
                  <button type="button" className="nq-btn ghost sm" onClick={() => look_({ size: 100 })}>{tr('الافتراضي')}</button>
                )}
              </div>
            </Row>

            <Row icon="chart" title={tr('ألوان مناسبة لعمى الألوان')}
              desc={tr('تستبدل ألوان الحالات (تمّ، قيد التنفيذ، تنبيه) بألوان يميّزها الجميع.')}>
              <span className={styles.dots} aria-hidden="true"><i data-c="ok" /><i data-c="warn" /><i data-c="info" /><i data-c="danger" /></span>
              <Switch checked={look.cb} label={tr('ألوان مناسبة لعمى الألوان')} onChange={v => look_({ cb: v })} />
            </Row>

            <Row icon="pause" title={tr('تقليل الحركة')} desc={tr('يوقف المؤثرات المتحركة والانتقالات في الصفحات.')}>
              <Switch checked={look.reduce} label={tr('تقليل الحركة')} onChange={v => look_({ reduce: v })} />
            </Row>
          </Section>

          {/* ── reading ── */}
          <Section id="reading" icon="book" title={tr('القراءة والتلاوة')} sub={tr('كيف يظهر لك المصحف، والترجمة، والقارئ الذي تستمع إليه.')}>
            <div className={styles.ayahPreview}>
              <p className={`nq-q ${styles.ayahText}`} data-style={state.fontStyle === 'uthmani' ? 'uthmani' : 'simple'}
                style={{ fontSize: `${state.fontSize}px` }} lang="ar">
                {state.fontStyle === 'uthmani'
                  ? 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'
                  : 'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ'}
              </p>
              <span className={styles.pvCap}>{tr('معاينة حجم الخط ونوعه')}</span>
            </div>

            <Row icon="pen" title={t('font_style') || tr('نوع الخط')} desc={tr('الرسم العثماني كما في المصحف، أو الإملاء الحديث.')}>
              <div className="nq-seg" role="group" aria-label={tr('نوع خط المصحف')}>
                <button type="button" aria-pressed={state.fontStyle === 'uthmani'} onClick={() => saveSetting('fontStyle', 'uthmani')}>{t('uthmani') || tr('عثماني')}</button>
                <button type="button" aria-pressed={state.fontStyle !== 'uthmani'} onClick={() => saveSetting('fontStyle', 'simple')}>{t('simple') || tr('مبسّط')}</button>
              </div>
            </Row>

            <Row icon="aa" title={tr('حجم خط المصحف')} desc={tr('حجم نص القرآن الكريم في صفحة القراءة.')} stack>
              <div className={styles.sizeCtl}>
                <span className={styles.aSmall} aria-hidden="true">{tr('أ')}</span>
                <input type="range" min="16" max="48" step="2" value={state.fontSize} className={styles.range}
                  aria-label={tr('حجم خط المصحف')} aria-valuetext={tr('{n} بكسل', { n: state.fontSize })}
                  onChange={e => saveSetting('fontSize', parseInt(e.target.value, 10))} />
                <span className={styles.aBig} aria-hidden="true">{tr('أ')}</span>
                <output className={`nq-num ${styles.val}`}>{toAr(state.fontSize)}</output>
              </div>
            </Row>

            <Row icon="bookmark" title={tr('تظليل الآية')} desc={tr('تظليل الآية عند الضغط عليها أثناء القراءة.')}>
              <Switch checked={!!state.highlightMode} label={tr('تظليل الآية')} onChange={v => saveSetting('highlightMode', v)} />
            </Row>

            <Row icon="head" title={tr('القارئ')} desc={tr('يُستخدم عند الاستماع إلى التلاوة.')} stack>
              <label className={styles.selectWrap}>
                <span className="nq-sr">{tr('القارئ')}</span>
                <select className={styles.select} value={state.reader} onChange={e => saveSetting('reader', e.target.value)}>
                  {READERS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <Icon name="chev" />
              </label>
            </Row>

            <Row icon="bell" title={tr('منبّه الورد اليومي')} desc={tr('إشعار يذكّرك بوردك كل يوم على هذا الجهاز.')}>
              {notifPerm === 'granted'
                ? <span className={`nq-pill on ${styles.okPill}`}><Icon name="check" />{tr('مفعّل')}</span>
                : notifPerm === 'unsupported'
                  ? <span className="nq-pill">{tr('غير مدعوم في هذا المتصفح')}</span>
                  : <button type="button" className="nq-btn ghost sm" onClick={enableReminder}><Icon name="bell" />{tr('تفعيل')}</button>}
            </Row>

            <div className={styles.block}>
              <div className={styles.rowText}>
                <span className={styles.rowTitle}><Icon name="globe" />{tr('الترجمة الافتراضية')}</span>
                <span className={styles.rowDesc}>{tr('تظهر الترجمة تحت كل آية أثناء القراءة.')}</span>
              </div>
              <div className={styles.trans} role="group" aria-label={tr('الترجمة')}>
                {TRANSLATIONS.map(tk => (
                  <button key={tk.id} type="button" aria-pressed={curTrans === tk.id}
                    className={styles.transBtn} onClick={() => saveSetting('translation', tk.id)}>
                    <span className={styles.transCode} dir="ltr">{tk.id === 'none' ? <Icon name="x" /> : tk.lang}</span>
                    <span className={styles.transName} dir="auto">{tk.name}</span>
                    {curTrans === tk.id && <Icon name="check" className={styles.transTick} />}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* ── account ── */}
          <Section id="account" icon="user" title={tr('الحساب')} sub={user ? tr('بياناتك الشخصية وكلمة المرور وخصوصيتك.') : tr('سجّل دخولك لمزامنة قراءتك وحفظك وختماتك على كل أجهزتك.')}>
            {!user ? (
              <div className={styles.guest}>
                <p>{tr('أنت تستخدم الموقع بدون حساب، وبياناتك محفوظة على هذا الجهاز فقط.')}</p>
                <div className={styles.btns}>
                  <Link to="/login" className="nq-btn gold"><Icon name="user" />{tr('تسجيل الدخول')}</Link>
                  <Link to="/signup" className="nq-btn ghost"><Icon name="plus" />{tr('إنشاء حساب')}</Link>
                </div>
              </div>
            ) : (<>
              <div className={styles.profile}>
                <div className={styles.who}>
                  <b>{name}</b>
                  <span dir="ltr">{user.email}</span>
                </div>
                {user.email_verified === false
                  ? <span className={`nq-pill ${styles.warnPill}`}><Icon name="bell" />{tr('البريد غير مؤكَّد')}</span>
                  : <span className={`nq-pill ${styles.okPill}`}><Icon name="check" />{tr('البريد مؤكَّد')}</span>}
              </div>

              <AvatarEditor />

              {user.email_verified === false && (
                <div className={styles.verify}>
                  <span>{tr('أكّد بريدك لتتمكن من استعادة حسابك إن نسيت كلمة المرور.')}</span>
                  {verifyState === 'sent'
                    ? <span className={`nq-pill ${styles.okPill}`}><Icon name="check" />{tr('أُرسلت رسالة التأكيد')}</span>
                    : <button type="button" className="nq-btn ghost sm" onClick={handleResendVerify} disabled={verifyState === 'sending'}>
                        {verifyState === 'sending' ? tr('جارٍ الإرسال…') : tr('إعادة إرسال رسالة التأكيد')}
                      </button>}
                </div>
              )}

              {/* name */}
              <Row icon="pen" title={tr('الاسم')} desc={editingName ? null : name} stack={editingName}>
                {editingName ? (
                  <form className={styles.inline} onSubmit={handleUpdateName}>
                    <label className={`nq-input ${styles.grow}`}>
                      <span className="nq-sr">{tr('الاسم الجديد')}</span>
                      <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('edit_name_ph') || tr('اسمك')} autoFocus />
                    </label>
                    <button type="submit" className="nq-btn gold sm" disabled={profileLoading || !newName.trim()}>{profileLoading ? '…' : tr('حفظ')}</button>
                    <button type="button" className="nq-btn ghost sm" onClick={() => setEditingName(false)}>{t('cancel') || tr('إلغاء')}</button>
                  </form>
                ) : (
                  <button type="button" className="nq-btn ghost sm" onClick={() => { setEditingName(true); setNewName(user.name || ''); }}>{tr('تعديل')}</button>
                )}
              </Row>

              {/* password */}
              <Row icon="lock" title={tr('كلمة المرور')}
                desc={editingPw ? null : hasPassword ? tr('غيّرها متى شئت؛ سيُسجَّل خروجك من الأجهزة الأخرى.') : tr('دخلت بحساب Google. يمكنك تعيين كلمة مرور للدخول بالبريد أيضاً.')}
                stack={editingPw}>
                {editingPw ? (
                  <form className={styles.pwForm} onSubmit={handleUpdatePw}>
                    {hasPassword && (
                      <label className={styles.lbl}>
                        <span>{tr('كلمة المرور الحالية')}</span>
                        <span className="nq-input"><input type="password" dir="ltr" value={curPw} onChange={e => setCurPw(e.target.value)} autoComplete="current-password" /></span>
                      </label>
                    )}
                    <label className={styles.lbl}>
                      <span>{tr('كلمة المرور الجديدة')} <small>({tr('{n} أحرف على الأقل', { n: toAr(8) })})</small></span>
                      <span className="nq-input"><input type="password" dir="ltr" value={newPw} onChange={e => setNewPw(e.target.value)} autoComplete="new-password" /></span>
                    </label>
                    <div className={styles.btns}>
                      <button type="submit" className="nq-btn gold sm" disabled={profileLoading || newPw.length < 8 || (hasPassword && !curPw)}>
                        {profileLoading ? '…' : hasPassword ? tr('تغيير كلمة المرور') : tr('تعيين كلمة المرور')}
                      </button>
                      <button type="button" className="nq-btn ghost sm" onClick={() => { setEditingPw(false); setCurPw(''); setNewPw(''); }}>{t('cancel') || tr('إلغاء')}</button>
                    </div>
                  </form>
                ) : (
                  <button type="button" className="nq-btn ghost sm" onClick={() => { setEditingPw(true); setNewPw(''); setCurPw(''); }}>
                    {hasPassword ? tr('تغيير') : tr('تعيين كلمة مرور')}
                  </button>
                )}
              </Row>

              <Row icon="trophy" title={tr('إظهار اسمي في لوحة المتصدرين')}
                desc={user.show_on_leaderboard ? tr('يظهر اسمك ونقاطك في لوحة المتصدرين العامة.') : tr('اسمك مخفي، ولن تظهر في لوحة المتصدرين.')}>
                <Switch checked={!!user.show_on_leaderboard} disabled={lbLoading} label={tr('إظهار اسمي في لوحة المتصدرين')} onChange={toggleLeaderboard} />
              </Row>

              <Row icon="download" title={tr('نسخة من بياناتك')} desc={tr('نزّل كل بياناتك المحفوظة في حسابك في ملف واحد.')}>
                <button type="button" className="nq-btn ghost sm" onClick={handleExport} disabled={exporting}>
                  <Icon name="download" />{exporting ? tr('جارٍ التحضير…') : tr('تنزيل')}
                </button>
              </Row>

              {profileMsg && (
                <p className={styles.msg} data-ok={profileMsg.ok ? '1' : '0'} role={profileMsg.ok ? 'status' : 'alert'}>
                  <Icon name={profileMsg.ok ? 'check' : 'x'} />{profileMsg.text}
                </p>
              )}

              <div className={styles.accFoot}>
                <button type="button" className="nq-btn ghost" onClick={handleSignOut}><Icon name="logout" />{t('logout') || tr('تسجيل الخروج')}</button>
                <Link to="/delete-data" className={styles.dangerLink}><Icon name="x" />{tr('حذف الحساب والبيانات')}</Link>
              </div>
            </>)}
          </Section>

          {/* ── language ── */}
          <Section id="language" icon="globe" title={tr('اللغة')} sub={tr('لغة واجهة الموقع. نص القرآن الكريم يبقى بالعربية دائماً.')}>
            <Row icon="globe" title={tr('لغة الواجهة')} desc={tr('تتغيّر القوائم والعناوين فوراً.')}>
              <div className={styles.lang}><LangSwitcher /></div>
            </Row>
          </Section>
        </div>
      </div>

      <div className={`${styles.saved} ${saved ? styles.savedOn : ''}`} role="status" aria-live="polite">
        {saved && <><Icon name="check" />{tr('تم الحفظ')}</>}
      </div>
    </div>
  );
}
