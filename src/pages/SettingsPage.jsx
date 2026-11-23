import { useAuth } from '../hooks/useAuth';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut, updateUserName, updateUserPassword } from '../supabase';
import { useStore, setGlobal, savePref } from '../store';
import { READERS, TRANSLATIONS } from '../data';
import styles from './SettingsPage.module.css';
import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';

function Toggle({ checked, onChange }) {
  return (
    <button
      className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
      onClick={() => onChange(!checked)}
      role="switch" aria-checked={checked}
    >
      <span className={styles.toggleThumb} />
    </button>
  );
}

export default function SettingsPage() {
  const t = useT();
  const dir = useDir();
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [state]   = useStore();
  const [saved,         setSaved]        = useState(false);
  const [editingName,   setEditingName]  = useState(false);
  const [editingPw,     setEditingPw]    = useState(false);
  const [newName,       setNewName]      = useState('');
  const [newPw,         setNewPw]        = useState('');
  const [profileLoading,setProfileLoading] = useState(false);
  const [profileMsg,    setProfileMsg]   = useState('');

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  async function handleUpdateName() {
    if (!newName.trim()) return;
    setProfileLoading(true); setProfileMsg('');
    const { error } = await updateUserName(newName.trim());
    if (error) {
      setProfileMsg('❌ ' + (error.message || error));
    } else {
      setProfileMsg(`✅ ${t('success')} — قد تحتاج لإعادة تسجيل الدخول لرؤية التغيير`);
      setEditingName(false);
      setTimeout(() => setProfileMsg(''), 4000);
    }
    setProfileLoading(false);
  }

  async function handleUpdatePw() {
    if (newPw.length < 6) return;
    setProfileLoading(true); setProfileMsg('');
    const { error } = await updateUserPassword(newPw);
    if (error) {
      setProfileMsg('❌ ' + (error.message || error));
    } else {
      setProfileMsg('✅ تم تغيير كلمة المرور بنجاح');
      setEditingPw(false); setNewPw('');
      setTimeout(() => setProfileMsg(''), 3000);
    }
    setProfileLoading(false);
  }

  function saveSetting(key, val) {
    setGlobal({ [key]: val });
    if (key === 'darkMode')    { document.body.classList.toggle('light', !val); savePref('nq_theme', val ? 'dark' : 'light'); }
    if (key === 'fontSize')    { document.documentElement.style.setProperty('--font-size', val + 'px'); savePref('nq_fontSize', Number(val)); }
    if (key === 'fontStyle')   savePref('nq_fontStyle', val);
    if (key === 'reader')      savePref('nq_reader', val);
    if (key === 'translation') savePref('nq_translation', val);
    if (key === 'highlightMode') savePref('nq_highlight', !!val);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.backBtn}>{t('back')}</Link>
        <h1>{t('settingsTitle')}</h1>
        <LangSwitcher compact={true} />
        <div style={{ width: 80 }} />
      </div>

      {saved && <div className={styles.savedBanner}>{t('success')}</div>}

      {/* Account */}
      {user && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('profile')}</h3>

          {/* Avatar */}
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20, direction:'rtl' }}>
            <div style={{
              width:60, height:60, borderRadius:'50%', overflow:'hidden',
              background:'var(--gold-dim)', border:'2px solid var(--gold)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:24, fontWeight:700, color:'var(--gold)', flexShrink:0,
            }}>
              {user.user_metadata?.avatar_url
                ? <img src={user.user_metadata.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                : (user.user_metadata?.full_name?.[0] || user.email?.[0] || '؟').toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>
                {user.user_metadata?.full_name || user.email?.split('@')[0]}
              </div>
              <div style={{ fontSize:12, color:'var(--text3)', direction:'ltr' }}>{user.email}</div>
            </div>
          </div>

          {/* Edit name */}
          {editingName
            ? <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                <input value={newName} onChange={e=>setNewName(e.target.value)}
                  {...{placeholder: t('edit_name_ph')}}
                  style={{ flex:1, padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)',
                    background:'var(--bg2)', color:'var(--text)', fontSize:14, direction:'rtl' }}/>
                <button onClick={handleUpdateName} disabled={profileLoading}
                  style={{ padding:'8px 14px', borderRadius:8, background:'var(--gold)',
                    color:'#000', fontWeight:700, border:'none', cursor:'pointer', fontSize:13 }}>
                  {profileLoading ? '...' : 'حفظ'}
                </button>
                <button onClick={()=>setEditingName(false)}
                  style={{ padding:'8px 12px', borderRadius:8, background:'var(--border)',
                    color:'var(--text)', border:'none', cursor:'pointer' }}>✕</button>
              </div>
            : <button className={styles.editBtn} onClick={()=>{ setEditingName(true); setNewName(user.user_metadata?.full_name||''); }}>
                ✏️ تعديل الاسم
              </button>
          }

          {/* Change password (email users only) */}
          {!user.app_metadata?.provider?.includes('google') && (
            editingPw
              ? <div style={{ marginTop:12 }}>
                  <input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)}
                    {...{placeholder: t('new_password_ph')}}
                    style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)',
                      background:'var(--bg2)', color:'var(--text)', fontSize:14, direction:'ltr',
                      marginBottom:8, boxSizing:'border-box' }}/>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={handleUpdatePw} disabled={profileLoading || newPw.length < 6}
                      style={{ flex:1, padding:'8px', borderRadius:8, background:'var(--gold)',
                        color:'#000', fontWeight:700, border:'none', cursor:'pointer' }}>
                      {profileLoading ? '...' : 'تغيير كلمة المرور'}
                    </button>
                    <button onClick={()=>setEditingPw(false)}
                      style={{ padding:'8px 12px', borderRadius:8, background:'var(--border)',
                        color:'var(--text)', border:'none', cursor:'pointer' }}>{t('cancel')}</button>
                  </div>
                </div>
              : <button className={styles.editBtn} style={{ marginTop:8 }}
                  onClick={()=>{ setEditingPw(true); setNewPw(''); }}>
                  🔑 تغيير كلمة المرور
                </button>
          )}

          {profileMsg && (
            <div style={{ marginTop:10, padding:'8px 12px', borderRadius:8, fontSize:13,
              background: profileMsg.startsWith('✅') ? 'rgba(82,183,136,.12)' : 'rgba(248,113,113,.12)',
              color: profileMsg.startsWith('✅') ? '#52b788' : '#f87171',
              border: `1px solid ${profileMsg.startsWith('✅') ? '#52b78844' : '#f8717144'}`,
            }}>{profileMsg}</div>
          )}

          <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid var(--border)' }}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>البريد</span>
              <span className={styles.infoVal} style={{ direction: 'ltr' }}>{user.email}</span>
            </div>
          </div>
          <button className={styles.dangerBtn} onClick={handleSignOut}>{t('logout')}</button>
          {/* Web Push */}
          <div className={styles.settingRow} style={{marginTop:8}}>
            <div className={styles.settingInfo}>
              <div className={styles.settingLabel}>🔔 منبّه الورد اليومي</div>
              <div className={styles.settingDesc}>إشعار يذكّرك بوردك كل يوم</div>
            </div>
            <button className={styles.pushBtn} onClick={async () => {
              if (!('Notification' in window)) return;
              const perm = await Notification.requestPermission();
              if (perm === 'granted') new Notification('✅ تم تفعيل المنبّه', { body:'ستصلك إشعارات يومية', icon:'/icons/icon-192.png' });
            }}>
              {typeof Notification !== 'undefined' && Notification.permission === 'granted' ? '✅ مفعّل' : 'تفعيل'}
            </button>
          </div>

          <Link to="/delete-data" style={{ display:'block', marginTop:8, textAlign:'center',
            fontSize:12, color:'var(--text3)' }}>🗑️ حذف الحساب والبيانات</Link>
        </div>
      )}

      {/* Display */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>🎨 العرض</h3>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingLabel}>{t('darkMode')}</div>
            <div className={styles.settingDesc}>خلفية داكنة مريحة للعين</div>
          </div>
          <Toggle checked={state.darkMode} onChange={v => saveSetting('darkMode', v)} />
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingLabel}>{t('font_style')}</div>
            <div className={styles.settingDesc}>اختر خط عرض القرآن الكريم</div>
          </div>
          <div className={styles.segmented}>
            <button className={`${styles.seg} ${state.fontStyle === 'uthmani' ? styles.segActive : ''}`}
              onClick={() => saveSetting('fontStyle', 'uthmani')}>{t('uthmani')}</button>
            <button className={`${styles.seg} ${state.fontStyle !== 'uthmani' ? styles.segActive : ''}`}
              onClick={() => saveSetting('fontStyle', 'simple')}>{t('simple')}</button>
          </div>
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingLabel}>حجم الخط: {state.fontSize}px</div>
            <div className={styles.settingDesc}>اضبط حجم نص القرآن الكريم</div>
          </div>
          <input type="range" min="16" max="48" step="2"
            value={state.fontSize}
            onChange={e => saveSetting('fontSize', parseInt(e.target.value))}
            className={styles.slider} />
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingLabel}>وضع التظليل</div>
            <div className={styles.settingDesc}>تظليل الآية عند الضغط عليها</div>
          </div>
          <Toggle checked={!!state.highlightMode} onChange={v => saveSetting('highlightMode', v)} />
        </div>
      </div>

      {/* Translation */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>🌍 الترجمة</h3>
        <p className={styles.transHint}>تظهر الترجمة تحت كل آية أثناء القراءة</p>
        <div className={styles.translationGrid}>
          {TRANSLATIONS.map(tk => (
            <button key={tk.id}
              className={`${styles.transBtn} ${(state.translation || 'none') === tk.id ? styles.transBtnActive : ''}`}
              onClick={() => saveSetting('translation', tk.id)}>
              <span className={styles.transFlag}>{tk.flag}</span>
              <span className={styles.transLang}>{tk.lang}</span>
              <span className={styles.transName}>{tk.name}</span>
              {(state.translation || 'none') === tk.id && <span className={styles.transTick}>✓</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Audio */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>🎧 الصوت</h3>
        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingLabel}>القارئ</div>
            <div className={styles.settingDesc}>سيُستخدم عند الاستماع</div>
          </div>
          <select className={styles.select} value={state.reader}
            onChange={e => saveSetting('reader', e.target.value)}>
            {READERS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </div>

      {/* About */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>ℹ️ حول التطبيق</h3>
        <div className={styles.aboutCard}>
          <div className={styles.aboutLogo}>نور القرآن ✦</div>
          <p>بيانات القرآن من <strong>alquran.cloud</strong></p>
          <p>التلاوات من <strong>everyayah.com</strong></p>
          <p>الترجمات من <strong>alquran.cloud</strong></p>
          <p className={styles.version}>الإصدار 2.0</p>
          <p className={styles.credit}>
            تم الإنشاء بواسطة<br />
            <strong>ABDELRAHMAN HAMDY</strong>
          </p>
        </div>
      </div>

      {!user && (
        <div className={styles.loginPrompt}>
          <p>💡 سجّل دخولك لمزامنة بياناتك على جميع أجهزتك</p>
          <Link to="/login" className={styles.loginLink}>تسجيل الدخول</Link>
        </div>
      )}
    </div>
  );
}
