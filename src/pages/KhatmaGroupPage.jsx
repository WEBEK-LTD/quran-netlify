import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { JUZ_DATA, toArabicNum } from '../data';
import {
  createGroupKhatma, getGroupKhatmaByCode,
  getMyGroupKhatmat, getPublicGroupKhatmat,
  togglePartDone, startNewRound, updateKhatmaVisibility,
  getAllTakers, claimPart, markTakerDone,
  isConfigured,
} from '../supabase';
import styles from './KhatmaGroupPage.module.css';

import { useT, useLang, useDir } from '../i18n';
import LangSwitcher from '../components/LangSwitcher';
// ─── helpers ─────────────────────────────────────────────────────────────────
function shortUid() { return Math.random().toString(36).slice(2,7).toUpperCase(); }
function shareUrl(code) { return `${window.location.origin}/khatma-group?join=${code}`; }
function loadLocal() { try { return JSON.parse(localStorage.getItem('nq_gkhatmat')||'[]'); } catch { return []; } }
function saveLocal(r) { try { localStorage.setItem('nq_gkhatmat', JSON.stringify(r)); } catch {} }

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function KhatmaGroupPage() {
  const t = useT();
  const dir = useDir();
  const { user, loading: authLoading } = useAuth();
  const navigate   = useNavigate();
  const configured = isConfigured();

  // ALL hooks must be declared before any conditional return
  const [view,       setView]      = useState('list');
  const [activeRoom, setActiveRoom]= useState(null);
  const [rooms,      setRooms]     = useState(() => loadLocal());
  const [pageLoading,setPageLoad]  = useState(false);
  const [joinCode,   setJoinCode]  = useState('');
  const [joinErr,    setJoinErr]   = useState('');
  const [toast,      setToast]     = useState('');

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''), 2500); }

  // Load from Supabase (background, non-blocking)
  const loadRooms = useCallback(async () => {
    if (!configured) return;
    try {
      const [mine, pub] = await Promise.all([
        user ? getMyGroupKhatmat(user.id) : Promise.resolve([]),
        getPublicGroupKhatmat(),
      ]);
      const local = loadLocal();
      const seen = new Set();
      const merged = [...local, ...(mine||[]), ...(pub||[])].filter(r=>{
        if (seen.has(r.id)) return false; seen.add(r.id); return true;
      });
      setRooms(merged); saveLocal(merged);
    } catch {}
  }, [user, configured]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // Handle ?join= in URL
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const code = p.get('join');
    if (code) {
      window.history.replaceState({}, '', window.location.pathname);
      // Delay slightly so state is settled
      setTimeout(() => doJoin(code), 200);
    }
  }, []);

  // ── Join by code ──────────────────────────────────────────────────────────
  async function doJoin(rawCode) {
    const code = (rawCode || joinCode).trim().toUpperCase();
    if (!code) return;
    setJoinErr(''); setPageLoad(true);

    // 1. Check localStorage first
    const local = loadLocal();
    const found = local.find(r => r.id === code);
    if (found) {
      setPageLoad(false);
      openRoom(found); setJoinCode(''); return;
    }

    // 2. Try Supabase
    if (!configured) {
      setPageLoad(false);
      setJoinErr('⚠️ لا يمكن الانضمام بالكود — افتح الرابط المُرسل إليك مباشرة');
      return;
    }
    try {
      const room = await getGroupKhatmaByCode(code);
      setPageLoad(false);
      if (!room) {
        setJoinErr('لم يُعثر على هذا الكود — تأكد من الكود أو افتح الرابط مباشرة');
        return;
      }
      const updated = [room, ...local];
      saveLocal(updated);
      setRooms(prev => prev.find(r=>r.id===room.id) ? prev : [room, ...prev]);
      openRoom(room); setJoinCode('');
    } catch {
      setPageLoad(false);
      setJoinErr('خطأ في الاتصال — تحقق من الإنترنت');
    }
  }

  function openRoom(room) { setActiveRoom(room); setView('room'); }

  // ── Conditional renders — AFTER all hooks ────────────────────────────────

  // Auth loading (only if Supabase configured)
  if (configured && authLoading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',color:'var(--text3)',fontSize:14}}>
      جارٍ التحقق...
    </div>
  );

  // Not logged in (only if Supabase configured)
  if (configured && !user) return (
    <div style={{maxWidth:400,margin:'60px auto',padding:'0 20px',textAlign:'center',direction:'rtl'}}>
      <div style={{fontSize:52,marginBottom:16}}>🕌</div>
      <h2 style={{fontSize:20,color:'var(--text)',marginBottom:10}}>{t('soul_khatma')}</h2>
      <p style={{color:'var(--text3)',fontSize:14,lineHeight:1.8,marginBottom:28}}>
        {t('soul_khatma_desc')}<br/>
        تحتاج إلى تسجيل الدخول للمتابعة.
      </p>
      <Link to="/login" style={{display:'block',padding:'13px',borderRadius:12,textDecoration:'none',background:'linear-gradient(135deg,var(--green),var(--green2))',color:'white',fontWeight:700,fontSize:15,marginBottom:10}}>
        🔑 تسجيل الدخول
      </Link>
      <Link to="/signup" style={{display:'block',padding:'12px',borderRadius:12,textDecoration:'none',border:'1px solid var(--border)',color:'var(--text2)',fontSize:14}}>
        ✨ إنشاء حساب جديد
      </Link>
      <button onClick={()=>navigate(-1)} style={{marginTop:16,background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:13}}>
        {t('back')}
      </button>
    </div>
  );

  // ── VIEWS ─────────────────────────────────────────────────────────────────
  if (view === 'create') return (
    <CreateRoom
      user={user}
      onBack={() => setView('list')}
      onCreated={async (room) => {
        // Save locally immediately
        const local = loadLocal();
        saveLocal([room, ...local]);
        setRooms(prev => [room, ...prev]);
        openRoom(room);
        showToast('✅ تم إنشاء الخاتمة!');
        // Sync to Supabase in background
        if (configured) {
          createGroupKhatma(room).catch(() => {});
        }
      }}
    />
  );

  if (view === 'room' && activeRoom) return (
    <RoomView
      room={activeRoom}
      configured={configured}
      showToast={showToast}
      onBack={() => { setView('list'); setActiveRoom(null); loadRooms(); }}
      onUpdate={(updated) => {
        setActiveRoom(updated);
        setRooms(prev => prev.map(r => r.id===updated.id ? updated : r));
        const local = loadLocal();
        saveLocal(local.map(r => r.id===updated.id ? updated : r));
      }}
    />
  );

  // ── LIST ──────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.topBar}>
        <Link to="/reader" className={styles.backBtn}>{t('back')}</Link>
        <h1>🕌 ختمة الروح</h1>
        <LangSwitcher compact={true} />
        <div style={{width:60}}/>
      </div>

      <p className={styles.subtitle}>أهدِ ثواب القرآن لأرواح من أحببتهم</p>

      <div className={styles.mainActions}>
        <button className={styles.bigBtn} onClick={() => setView('create')}>
          <span style={{fontSize:22}}>＋</span>
          <span>خاتمة جديدة</span>
        </button>

        <div className={styles.joinBox}>
          <p className={styles.joinLabel}>الانضمام بكود</p>
          <div className={styles.joinRow}>
            <input className={styles.joinInput}
              {...{placeholder: t('room_code')}}
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinErr(''); }}
              onKeyDown={e => e.key==='Enter' && doJoin()}
              maxLength={7} />
            <button className={styles.joinBtn} onClick={() => doJoin()} disabled={pageLoading}>
              {pageLoading ? '...' : 'انضم'}
            </button>
          </div>
          {joinErr && <p className={styles.joinErr}>{joinErr}</p>}
          <p style={{fontSize:11,color:'var(--text3)',marginTop:8,lineHeight:1.7}}>
            💡 الكود يعمل مع الأشخاص على نفس الشبكة، أو شارك <strong>الرابط</strong> للانضمام من أي مكان
          </p>
        </div>
      </div>

      {rooms.length === 0 ? (
        <div className={styles.empty}>
          <div style={{fontSize:48,marginBottom:12}}>📿</div>
          <p>لا توجد ختمات بعد</p>
        </div>
      ) : (
        <div className={styles.roomList}>
          {rooms.map(room => {
            const parts = room.parts || [];
            const done  = parts.filter(p=>p.done).length;
            const total = parts.length || (room.mode==='juz' ? 30 : 60);
            const pct   = total > 0 ? Math.round((done/total)*100) : 0;
            return (
              <div key={room.id} className={styles.roomCard}
                onClick={async () => {
                  if (!room.parts || room.parts.length === 0) {
                    setPageLoad(true);
                    const full = configured ? await getGroupKhatmaByCode(room.id) : null;
                    setPageLoad(false);
                    openRoom(full || room);
                  } else {
                    openRoom(room);
                  }
                }}>
                <div className={styles.cardTop}>
                  <div>
                    <h3 className={styles.cardName}>{room.deceased_name || room.deceasedName}</h3>
                    <div className={styles.cardMeta}>
                      <span className={styles.codeTag}>{room.id}</span>
                      <span style={{fontSize:11,color:'var(--text3)'}}>{room.mode==='juz' ? '30 جزء' : '60 حزب'}</span>
                      {room.is_public
                        ? <span className={styles.publicTag}>🌐 عام</span>
                        : <span className={styles.privateTag}>🔒 خاص</span>}
                      {(room.completions||0) > 0 &&
                        <span className={styles.completionTag}>🏆 {room.completions}×</span>}
                    </div>
                  </div>
                  <div className={styles.pctRing}>
                    <svg viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="var(--border)" strokeWidth="3"/>
                      <circle cx="18" cy="18" r="14" fill="none" stroke="var(--gold)" strokeWidth="3"
                        strokeDasharray={`${(pct/100)*88} 88`} strokeDashoffset="22" strokeLinecap="round"/>
                    </svg>
                    <span>{pct}%</span>
                  </div>
                </div>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{width:`${pct}%`}}/>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Create Room ──────────────────────────────────────────────────────────────
function CreateRoom({ user, onBack, onCreated }) {
  const [step,      setStep]    = useState(1);
  const [name,      setName]    = useState('');
  const [mode,      setMode]    = useState('juz');
  const [isPublic,  setPublic]  = useState(false);
  const [members,   setMembers] = useState(['أنا']);
  const [newMember, setNew]     = useState('');
  const [assign,    setAssign]  = useState({});

  const parts = mode === 'juz'
    ? JUZ_DATA.map(j => ({ id: j.juz, label: `الجزء ${toArabicNum(j.juz)}` }))
    : Array.from({length:60}, (_,i) => ({ id: i+1, label: `الحزب ${toArabicNum(i+1)}` }));

  function addMember() {
    const m = newMember.trim();
    if (m && !members.includes(m)) setMembers(p=>[...p,m]);
    setNew('');
  }
  function autoDistribute() {
    const a = {};
    parts.forEach((p,i) => { a[p.id] = members[i % members.length]; });
    setAssign(a);
  }
  function create() {
    if (!name.trim()) { alert('أدخل اسم المتوفى'); return; }
    const id = shortUid();
    onCreated({
      id,
      deceased_name: name.trim(),
      deceasedName:  name.trim(),
      mode,
      isPublic,
      is_public:    isPublic,
      completions:  0,
      createdBy:    user?.id || null,
      created_at:   new Date().toISOString(),
      parts: parts.map(p => ({
        id:         p.id,
        part_index: p.id,
        label:      p.label,
        assignee:   assign[p.id] || '',
        done:       false,
        done_by:    '',
        done_at:    null,
      })),
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← رجوع</button>
        <h1>خاتمة جديدة</h1>
        <div style={{width:60}}/>
      </div>

      <div className={styles.stepInd}>
        {[1,2].map(n => (
          <div key={n} className={`${styles.stepDot} ${step>=n ? styles.stepActive : ''}`}>
            {toArabicNum(n)}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className={styles.form}>
          <label className={styles.lbl}>اسم المتوفى / المتوفاة</label>
          <input className={styles.inp} placeholder="مثال: الحاج محمد أحمد"
            value={name} onChange={e=>setName(e.target.value)} dir="rtl"
            onKeyDown={e=>e.key==='Enter' && name.trim() && setStep(2)} autoFocus />

          <label className={styles.lbl}>نوع التقسيم</label>
          <div className={styles.modeRow}>
            {[['juz','30 جزء'],['hizb','60 حزب']].map(([v,l]) => (
              <button key={v} className={`${styles.modeBtn} ${mode===v?styles.modeBtnA:''}`}
                onClick={()=>setMode(v)}>{l}</button>
            ))}
          </div>

          <label className={styles.lbl}>الخصوصية</label>
          <div className={styles.modeRow}>
            <button className={`${styles.modeBtn} ${!isPublic?styles.modeBtnA:''}`}
              onClick={()=>setPublic(false)}>🔒 خاص — بالكود فقط</button>
            <button className={`${styles.modeBtn} ${isPublic?styles.modeBtnA:''}`}
              onClick={()=>setPublic(true)}>🌐 عام — يظهر للجميع</button>
          </div>

          <label className={styles.lbl}>الأعضاء</label>
          <div className={styles.chips}>
            {members.map((m,i) => (
              <div key={i} className={styles.chip}>
                <span>{m}</span>
                {members.length > 1 &&
                  <button onClick={()=>setMembers(p=>p.filter((_,j)=>j!==i))}>✕</button>}
              </div>
            ))}
          </div>
          <div className={styles.addRow}>
            <input className={styles.inp} placeholder="اسم عضو جديد..."
              value={newMember} onChange={e=>setNew(e.target.value)}
              onKeyDown={e=>e.key==='Enter' && addMember()} dir="rtl" />
            <button className={styles.addBtn} onClick={addMember}>＋</button>
          </div>

          <button className={styles.nextBtn}
            onClick={()=>name.trim() ? setStep(2) : alert('أدخل اسم المتوفى')}>
            التالي ←
          </button>
        </div>
      )}

      {step === 2 && (
        <div className={styles.form}>
          <div className={styles.assignHead}>
            <h3>توزيع {mode==='juz'?'الأجزاء':'الأحزاب'}</h3>
            <div style={{display:'flex',gap:6}}>
              <button className={styles.autoBtn} onClick={autoDistribute}>⚡ تلقائي</button>
              <button className={styles.clearBtn} onClick={()=>setAssign({})}>مسح</button>
            </div>
          </div>
          <div className={styles.partGrid}>
            {parts.map(p => (
              <div key={p.id} className={`${styles.partCard} ${assign[p.id]?styles.partA:''}`}>
                <div className={styles.partLbl}>{p.label}</div>
                <select className={styles.partSel}
                  value={assign[p.id]||''}
                  onChange={e=>setAssign(a=>({...a,[p.id]:e.target.value}))}>
                  <option value="">— غير محدد —</option>
                  {members.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className={styles.createBtns}>
            <button className={styles.backStepBtn} onClick={()=>setStep(1)}>← السابق</button>
            <button className={styles.nextBtn} style={{flex:1}} onClick={create}>
              إنشاء الخاتمة ✓
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Room View ────────────────────────────────────────────────────────────────
function RoomView({ room, configured, onBack, onUpdate, showToast }) {
  const [parts,        setParts]   = useState(room.parts || []);
  const [takers,       setTakers]  = useState({});        // part_index → [{id,taker_name,done}]
  const [myName,       setMyName]  = useState(() => localStorage.getItem('nq_khatma_name') || '');
  const [nameInput,    setNameInp] = useState('');
  const [isPublic,     setPublic]  = useState(room.is_public || false);
  const [filterMem,    setFilter]  = useState('all');
  const [confirmReset, setConfirm] = useState(false);
  const [copied,       setCopied]  = useState('');
  const [claiming,     setClaiming]= useState(null);   // part_index being claimed
  const [myClaimIds,   setMyIds]   = useState({});     // part_index → taker.id (for my claims)

  const done       = parts.filter(p => p.done).length;
  const total      = parts.length;
  const pct        = total > 0 ? Math.round((done / total) * 100) : 0;
  const isComplete = done === total && total > 0;

  // كل الأسماء اللي اختارت (من الـ takers + assignees القديمة)
  const allNames = [...new Set([
    ...Object.values(takers).flat().map(tk => tk.taker_name),
    ...parts.map(p => p.assignee).filter(Boolean),
  ])];

  // ─── Load takers + poll every 30s ─────────────────────────────────────────
  async function fetchTakers() {
    if (!configured) return;
    const map = await getAllTakers(room.id);
    setTakers(map);
    // Detect my claims from localStorage token
    const myId = localStorage.getItem('nq_khatma_name');
    if (myId) {
      const mine = {};
      Object.entries(map).forEach(([pi, arr]) => {
        const found = arr.find(tk => tk.taker_name === myId);
        if (found) mine[pi] = found.id;
      });
      setMyIds(mine);
    }
  }

  useEffect(() => {
    fetchTakers();
    const interval = setInterval(fetchTakers, 30_000);
    return () => clearInterval(interval);
  }, [room.id, configured]);

  // ─── Save name ─────────────────────────────────────────────────────────────
  function saveName() {
    const n = nameInput.trim();
    if (!n) return;
    setMyName(n);
    localStorage.setItem('nq_khatma_name', n);
    setNameInp('');
    showToast('✅ تم حفظ اسمك: ' + n);
  }

  // ─── Claim a part ──────────────────────────────────────────────────────────
  async function handleClaim(part) {
    const pi = part.part_index ?? part.id;
    if (!myName) { showToast('أدخل اسمك أولاً'); return; }
    if (!configured) { showToast('⚠️ يحتاج اتصال بالإنترنت'); return; }

    // لو أنا ماشي على undo (عندي claim بالفعل)
    if (myClaimIds[pi]) {
      // حذف الـ claim بتاعتي
      const sb_del = await import('../supabase').then(m => m);
      // نعمل refresh بدل حذف — نكتشف الـ id ونعلّم done true/false
      await markTakerDone(myClaimIds[pi], !takers[pi]?.find(tk=>tk.id===myClaimIds[pi])?.done);
      await fetchTakers();
      showToast('✓ تم تحديث حالة الجزء');
      return;
    }

    setClaiming(pi);
    const newId = await claimPart(room.id, Number(pi), myName);
    setClaiming(null);
    if (newId) {
      setMyIds(prev => ({ ...prev, [pi]: newId }));
      await fetchTakers();
      showToast('✅ أخذت ' + part.label);
    } else {
      showToast('⚠️ خطأ — حاول مرة تانية');
    }
  }

  // ─── Mark done (للـ assignee القديم أو من خلال الـ claim) ─────────────────
  async function togglePartDoneLocal(part) {
    const key = part.part_index ?? part.id;
    const updated = parts.map(p =>
      (p.part_index ?? p.id) === key
        ? { ...p, done: !p.done, done_by: myName || part.assignee, done_at: !p.done ? new Date().toISOString() : null }
        : p
    );
    setParts(updated);
    onUpdate({ ...room, parts: updated });

    if (configured) {
      togglePartDone(room.id, key, myName || part.assignee, part.done).catch(() => {});
      // لو عندي claim، اعلّم done
      if (myClaimIds[key]) {
        markTakerDone(myClaimIds[key], !part.done).catch(() => {});
      }
    }
  }

  async function newRound() {
    const reset = parts.map(p => ({ ...p, done: false, done_by: '', done_at: null }));
    setParts(reset);
    onUpdate({ ...room, parts: reset, completions: (room.completions || 0) + 1 });
    if (configured) startNewRound(room.id).catch(() => {});
    setConfirm(false);
    showToast('✨ بدأت ختمة جديدة!');
  }

  async function toggleVisibility() {
    const next = !isPublic; setPublic(next);
    onUpdate({ ...room, is_public: next });
    if (configured) updateKhatmaVisibility(room.id, next).catch(() => {});
    showToast(next ? '🌐 أصبحت الخاتمة عامة' : '🔒 أصبحت الخاتمة خاصة');
  }

  function copyCode() {
    navigator.clipboard?.writeText(room.id);
    setCopied('code'); setTimeout(() => setCopied(''), 2000);
    showToast('تم نسخ الكود: ' + room.id);
  }
  function copyLink() {
    navigator.clipboard?.writeText(shareUrl(room.id));
    setCopied('link'); setTimeout(() => setCopied(''), 2000);
    showToast('✓ تم نسخ الرابط');
  }

  const visible = filterMem === 'all'
    ? parts
    : parts.filter(p => {
        const pi = p.part_index ?? p.id;
        const names = (takers[pi] || []).map(tk => tk.taker_name);
        return (p.assignee || p.done_by) === filterMem || names.includes(filterMem);
      });

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← رجوع</button>
        <h1 className={styles.roomH1}>🕌 {room.deceased_name || room.deceasedName}</h1>
        <div style={{ width: 60 }} />
      </div>

      {/* Code card */}
      <div className={styles.codeCard}>
        <div className={styles.codeLeft}>
          <span className={styles.codeLbl}>كود الانضمام</span>
          <span className={styles.codeVal}>{room.id}</span>
        </div>
        <div className={styles.codeBtns}>
          <button className={`${styles.codeBtn} ${copied === 'code' ? styles.codeCopied : ''}`} onClick={copyCode}>
            {copied === 'code' ? '✓' : '📋'} كود
          </button>
          <button className={`${styles.codeBtn} ${copied === 'link' ? styles.codeCopied : ''}`} onClick={copyLink}>
            {copied === 'link' ? '✓' : '🔗'} رابط
          </button>
          <button className={`${styles.codeBtn} ${isPublic ? styles.publicOn : ''}`} onClick={toggleVisibility}>
            {isPublic ? '🌐 عام' : '🔒 خاص'}
          </button>
        </div>
      </div>

      {/* اسمك */}
      <div className={styles.nameBox}>
        {myName ? (
          <div className={styles.myNameRow}>
            <span className={styles.myNameLbl}>اسمك:</span>
            <span className={styles.myNameVal}>{myName}</span>
            <button className={styles.changeName} onClick={() => { setMyName(''); localStorage.removeItem('nq_khatma_name'); }}>
              تغيير
            </button>
          </div>
        ) : (
          <div className={styles.nameInputRow}>
            <input
              className={styles.nameInput}
              placeholder="أدخل اسمك لتأخذ جزءاً..."
              value={nameInput}
              onChange={e => setNameInp(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveName()}
            />
            <button className={styles.nameBtn} onClick={saveName}>حفظ</button>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className={styles.progress}>
        <div className={styles.progressBar} style={{ width: pct + '%' }} />
      </div>
      <div className={styles.progressLbl}>
        <span>{done} من {total} {room.mode === 'juz' ? 'جزء' : 'حزب'}</span>
        <span>{pct}%</span>
      </div>

      {/* Complete banner */}
      {isComplete && (
        <div className={styles.completeBanner}>
          <div>
            <strong>اكتملت الخاتمة!</strong>
            {(room.completions || 0) > 0 && <span> — {toArabicNum(room.completions)} ختمة</span>}
          </div>
          <button className={styles.newRoundBtn} onClick={() => setConfirm(true)}>ختمة جديدة</button>
        </div>
      )}

      {/* Filter */}
      {allNames.length > 1 && (
        <div className={styles.filterRow}>
          {['all', ...allNames].map(m => (
            <button key={m}
              className={`${styles.filterBtn} ${filterMem === m ? styles.filterA : ''}`}
              onClick={() => setFilter(m)}>
              {m === 'all' ? 'الكل' : m}
            </button>
          ))}
        </div>
      )}

      {/* Parts */}
      <div className={styles.partsList}>
        {visible.map(part => {
          const pi = part.part_index ?? part.id;
          const partTakers = takers[pi] || [];
          const myTakerId  = myClaimIds[pi];
          const iClaimed   = !!myTakerId;
          const myTaker    = partTakers.find(tk => tk.id === myTakerId);
          const iDone      = myTaker?.done || part.done;
          const otherCount = partTakers.filter(tk => tk.id !== myTakerId).length;

          return (
            <div key={pi}
              className={`${styles.partRow} ${part.done ? styles.partDone : ''} ${iClaimed ? styles.partClaimed : ''}`}>

              {/* Done checkbox — للي عنده الجزء */}
              <div
                className={`${styles.check} ${part.done ? styles.checkDone : ''}`}
                onClick={() => togglePartDoneLocal(part)}>
                {part.done ? '✓' : ''}
              </div>

              <div className={styles.partInfo}>
                <span className={styles.partName}>{part.label}</span>

                {/* Assignee القديم */}
                {part.assignee && (
                  <span className={`${styles.partMem} ${part.done ? styles.partMemDone : ''}`}>
                    {part.assignee}
                  </span>
                )}

                {/* Takers الجدد */}
                {partTakers.length > 0 && (
                  <div className={styles.takersList}>
                    {partTakers.map(tk => (
                      <span key={tk.id} className={`${styles.takerTag} ${tk.done ? styles.takerDone : ''}`}>
                        {tk.done ? '✓ ' : ''}{tk.taker_name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.partActions}>
                {/* عداد الـ takers */}
                {partTakers.length > 0 && (
                  <span className={styles.takerCount} title={partTakers.map(tk=>tk.taker_name).join('، ')}>
                    👥 {partTakers.length}
                  </span>
                )}

                {/* زرار claim */}
                {myName && (
                  <button
                    className={`${styles.claimBtn} ${iClaimed ? styles.claimBtnMine : ''}`}
                    onClick={() => handleClaim(part)}
                    disabled={claiming === pi}>
                    {claiming === pi ? '...' : iClaimed ? (iDone ? '✓ خلّصت' : '📖 أنا') : '+ أنا هاخده'}
                  </button>
                )}
              </div>

              {part.done && part.done_at && (
                <span className={styles.doneDate}>
                  {new Date(part.done_at).toLocaleDateString('ar-EG')}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirm modal */}
      {confirmReset && (
        <div className={styles.modal}>
          <div className={styles.modalBox}>
            <h3>بدء ختمة جديدة؟</h3>
            <p>سيُحتفظ بالتوزيع ويبدأ العداد من جديد</p>
            <div className={styles.modalBtns}>
              <button className={styles.nextBtn} style={{ flex: 1 }} onClick={newRound}>نعم، ابدأ</button>
              <button className={styles.backStepBtn} onClick={() => setConfirm(false)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
