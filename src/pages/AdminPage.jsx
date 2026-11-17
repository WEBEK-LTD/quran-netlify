import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  checkIsAdmin, getAppSettings, updateAppSetting,
  adminGetUsers, adminToggleAdmin, adminBanUser, adminGetStats,
  adminSendBroadcast, getBroadcasts, adminSendDirectMessage,
  adminGetAllTickets, getMyTickets, createTicket,
  getTicketMessages, sendMessage, updateTicketStatus,
  subscribeToMessages, adminUnreadCount,
  joinPresence, getOnlineCount, subscribePresence,
  isConfigured,
} from '../supabase';
import styles from './AdminPage.module.css';

function useAdminGuard() {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (loading) return;
    if (!user) { setChecking(false); return; }
    checkIsAdmin().then(v => { setIsAdmin(v); setChecking(false); });
  }, [user, loading]);
  return { user, isAdmin, checking };
}

export default function AdminPage({ defaultTab }) {
  const { user, isAdmin, checking } = useAdminGuard();
  const [tab, setTab] = useState(defaultTab || 'overview');
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    adminUnreadCount().then(setUnread);
    const t = setInterval(() => adminUnreadCount().then(setUnread), 30_000);
    return () => clearInterval(t);
  }, [isAdmin]);

  if (checking) return <div className={styles.center}><div className={styles.spinner}/></div>;
  if (!isConfigured()) return (
    <div className={styles.center} style={{flexDirection:'column',gap:16,padding:40}}>
      <div style={{fontSize:48}}>🔌</div>
      <h2 style={{color:'var(--gold)'}}>Supabase غير متصل</h2>
      <p style={{color:'var(--text3)',textAlign:'center',maxWidth:400}}>
        تأكد من إضافة <code>VITE_SUPABASE_URL</code> و <code>VITE_SUPABASE_ANON_KEY</code> في Netlify Environment Variables
      </p>
    </div>
  );
  if (!user) return <NotLoggedIn />;
  if (!isAdmin) {
    if (defaultTab === 'support') {
      window.location.href = '/support';
      return null;
    }
    return <NotAdmin/>;
  }

  const TABS = [
    {id:'overview',  icon:'📊', label:'الرئيسية'},
    {id:'analytics', icon:'📈', label:'الإحصائيات'},
    {id:'users',     icon:'👥', label:'الأعضاء'},
    {id:'broadcasts',icon:'📢', label:'الإشعارات'},
    {id:'settings',  icon:'⚙️', label:'الإعدادات'},
    {id:'support',   icon:'💬', label: unread > 0 ? `الدعم (${unread})` : 'الدعم', badge: unread},
  ];

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <span className={styles.brandIcon}>🛡</span>
          <span className={styles.brandText}>لوحة التحكم</span>
        </div>
        <nav className={styles.sideNav}>
          {TABS.map(t => (
            <button key={t.id}
              className={`${styles.navItem} ${tab===t.id?styles.navActive:''}`}
              onClick={() => setTab(t.id)}>
              <span className={styles.navIcon}>{t.icon}</span>
              <span className={styles.navLabel}>{t.label}</span>
              {t.badge > 0 && <span className={styles.navBadge}>{t.badge}</span>}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.adminInfo}>
            <div className={styles.adminAvatar} style={{background:strColor(user.email)}}>
              {(user.email||'A')[0].toUpperCase()}
            </div>
            <div>
              <div className={styles.adminName}>{user.email?.split('@')[0]}</div>
              <div className={styles.adminRole}>مدير النظام</div>
            </div>
          </div>
          <Link to="/" className={styles.exitBtn}>← خروج</Link>
        </div>
      </aside>

      <main className={styles.main}>
        {tab==='overview'   && <OverviewTab   user={user} onTabChange={setTab}/>}
        {tab==='analytics'  && <AnalyticsTab/>}
        {tab==='users'      && <UsersTab      user={user}/>}
        {tab==='broadcasts' && <BroadcastsTab/>}
        {tab==='settings'   && <SettingsTab/>}
        {tab==='support'    && <SupportTab    user={user} isAdmin={true} onRead={()=>setUnread(0)}/>}
      </main>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function OverviewTab({user, onTabChange}) {
  const [data,    setData]    = useState(null);
  const [online,  setOnline]  = useState(0);
  const presenceRef = useRef(null);

  useEffect(() => { adminGetStats().then(setData); }, []);

  useEffect(() => {
    let ch;
    // الأدمن لازم يكون على نفس قناة 'visitors' عشان يشوف الكل
    joinPresence(user.id).then(channel => {
      ch = channel;
      presenceRef.current = channel;
      // اقرأ العدد الحالي
      getOnlineCount(channel).then(total => setOnline(total));
      // اشترك في التحديثات real-time — callback بياخد (total, loggedIn)
      subscribePresence(channel, (total, loggedIn) => {
        setOnline({ total, loggedIn });
      });
    });
    return () => { if (ch) ch.unsubscribe(); };
  }, [user.id]);

  if (!data) return <PageLoader/>;

  const totalUsers  = data.users.length;
  const newToday    = data.users.filter(u => isToday(u.created_at)).length;
  const totalReads  = data.scores.reduce((s,r)=>s+(r.ayahs_read||0),0);
  const openTickets = data.tickets.filter(t=>t.status==='open').length;
  const recentUsers = data.users.slice(0,5);
  const openTix     = data.tickets.filter(t=>t.status==='open').slice(0,5);

  return (
    <div className={styles.tabContent}>
      <PageHeader title="الرئيسية" sub="نظرة عامة على التطبيق"/>
      <div className={styles.statsGrid}>
        <StatCard icon="👥" label="إجمالي الأعضاء"       value={totalUsers}  color="#52b788" delta={newToday>0?`+${newToday} اليوم`:null}/>
        <StatCard icon="📖" label="إجمالي الآيات المقروءة" value={fmt(totalReads)} color="#c9a84c"/>
        <StatCard icon="💬" label="تذاكر الدعم المفتوحة"   value={openTickets} color="#f87171" onClick={()=>onTabChange('support')}/>
        <StatCard icon="📊" label="متوسط القراءة"           value={totalUsers>0?fmt(Math.round(totalReads/totalUsers)):0} color="#60a5fa" sub="آية / عضو"/>
        <StatCard icon="🟢" label="زوار الآن (الكل)"  value={typeof online==='object'?online.total:online}  color="#34d399" sub={typeof online==='object'?`${online.loggedIn} مسجل`:null}/>
      </div>
      <div className={styles.overviewCols}>
        <div className={styles.overviewCard}>
          <div className={styles.cardHeader}>
            <h3>👥 آخر الأعضاء</h3>
            <button className={styles.cardLink} onClick={()=>onTabChange('users')}>الكل →</button>
          </div>
          {recentUsers.map(u=>(
            <div key={u.user_id} className={styles.miniRow}>
              <div className={styles.miniAvatar} style={{background:strColor(u.email)}}>
                {(u.full_name||u.email||'?')[0].toUpperCase()}
              </div>
              <div className={styles.miniInfo}>
                <span className={styles.miniName}>{u.full_name||u.email?.split('@')[0]}</span>
                <span className={styles.miniSub}>{timeAgo(u.created_at)}</span>
              </div>
              {u.is_admin && <span className={styles.miniBadge}>🛡</span>}
            </div>
          ))}
        </div>
        <div className={styles.overviewCard}>
          <div className={styles.cardHeader}>
            <h3>💬 تذاكر الدعم المفتوحة</h3>
            <button className={styles.cardLink} onClick={()=>onTabChange('support')}>فتح الدعم →</button>
          </div>
          {openTix.length===0 && <p className={styles.emptyNote}>لا توجد تذاكر مفتوحة 🎉</p>}
          {openTix.map(t=>(
            <div key={t.id} className={styles.miniRow}>
              <span className={styles.ticketDot}/>
              <div className={styles.miniInfo}>
                <span className={styles.miniName}>{t.subject||'استفسار'}</span>
                <span className={styles.miniSub}>{t.user_email} · {timeAgo(t.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.overviewCard}>
          <div className={styles.cardHeader}><h3>🔗 روابط سريعة</h3></div>
          <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className={styles.quickLink}>🗄 Supabase Dashboard ↗</a>
          <a href="https://app.netlify.com"        target="_blank" rel="noreferrer" className={styles.quickLink}>🚀 Netlify Deploy ↗</a>
          <button className={styles.quickLink} onClick={()=>onTabChange('broadcasts')}>📢 إرسال إشعار للأعضاء</button>
          <button className={styles.quickLink} onClick={()=>onTabChange('settings')}>⚙️ إعدادات التطبيق</button>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [debug,   setDebug]   = useState(null);
  const [online,  setOnline]  = useState({total:0, loggedIn:0});
  const chRef = useRef(null);

  useEffect(() => {
    // نفس منطق الأدمن — نشوف كام واحد على الموقع دلوقتي
    joinPresence(null).then(ch => {
      chRef.current = ch;
      getOnlineCount(ch).then(t => setOnline(prev=>({...prev,total:t})));
      subscribePresence(ch, (total, loggedIn) => setOnline({total, loggedIn}));
    });
    return () => { if (chRef.current) chRef.current.unsubscribe(); };
  }, []);

  useEffect(() => {
    setLoading(true);
    adminGetStats()
      .then(res => {
        setDebug(res); // always keep raw response for debug
        if (res.fetchError || res.usersError) {
          setError(res.fetchError || res.usersError);
        } else if (!res.users && !res.tickets && !res.scores) {
          setError('البيانات فارغة — res: ' + JSON.stringify(res));
        } else {
          setData(res);
        }
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  if (loading) return <PageLoader/>;
  if (error)   return (
    <div className={styles.tabContent}>
      <PageHeader title="الإحصائيات" sub="تحليل استخدام التطبيق"/>
      <div className={styles.errorCard}>
        <div style={{fontSize:40}}>⚠️</div>
        <h3>تعذّر تحميل البيانات</h3>
        <p>{error}</p>
        <p style={{fontSize:12,opacity:.7}}>تأكد من تنفيذ <code>supabase-admin.sql</code> في Supabase SQL Editor</p>
        {debug && (
          <details style={{marginTop:12,width:'100%',textAlign:'right'}}>
            <summary style={{cursor:'pointer',fontSize:12,color:'var(--gold)'}}>🔍 تفاصيل الخطأ (للمطور)</summary>
            <pre style={{fontSize:10,background:'var(--bg)',padding:10,borderRadius:8,overflow:'auto',textAlign:'left',marginTop:6}}>
              {JSON.stringify(debug, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );

  const users   = data.users   || [];
  const scores  = data.scores  || [];
  const tickets = data.tickets || [];

  const regByDay = (() => {
    const days = [];
    for (let i=13;i>=0;i--) {
      const d = new Date(); d.setDate(d.getDate()-i);
      const key = d.toISOString().slice(0,10);
      const count = users.filter(u=>u.created_at?.slice(0,10)===key).length;
      days.push({label:d.toLocaleDateString('ar-EG',{day:'numeric',month:'numeric'}),count,key});
    }
    return days;
  })();
  const maxReg = Math.max(...regByDay.map(d=>d.count),1);

  const readBuckets = {'0':0,'١-١٠٠':0,'١٠١-٥٠٠':0,'٥٠٠+':0};
  scores.forEach(s=>{
    const n=s.ayahs_read||0;
    if(n===0) readBuckets['0']++;
    else if(n<=100) readBuckets['١-١٠٠']++;
    else if(n<=500) readBuckets['١٠١-٥٠٠']++;
    else readBuckets['٥٠٠+']++;
  });

  const totalActive = scores.filter(s=>(s.ayahs_read||0)>0).length;
  const totalUsers  = users.length;
  const ticketStat  = {open:0,in_progress:0,closed:0};
  tickets.forEach(t=>{ ticketStat[t.status]=(ticketStat[t.status]||0)+1; });

  const totalReads = scores.reduce((s,r)=>s+(r.ayahs_read||0),0);
  const newToday   = users.filter(u=>isToday(u.created_at)).length;

  return (
    <div className={styles.tabContent}>
      <PageHeader title="الإحصائيات" sub="تحليل استخدام التطبيق"/>

      {/* ─ Summary row */}
      <div className={styles.statsGrid} style={{marginBottom:20}}>
        <StatCard icon="👥" label="إجمالي الأعضاء"     value={totalUsers}     color="#52b788" delta={newToday>0?`+${newToday} اليوم`:null}/>
        <StatCard icon="📖" label="إجمالي الآيات"       value={fmt(totalReads)} color="#c9a84c"/>
        <StatCard icon="💬" label="تذاكر الدعم"         value={tickets.length} color="#60a5fa"/>
        <StatCard icon="✅" label="مغلقة"               value={ticketStat.closed} color="#52b788"/>
        <StatCard icon="🟢" label="على الموقع الآن"    value={online.total}       color="#34d399" sub={online.loggedIn>0?`${online.loggedIn} مسجل · ${online.total-online.loggedIn} زائر`:null}/>
      </div>

      {/* Live visitors mini-panel */}
      <div className={styles.livePanel}>
        <div className={styles.liveDot}/>
        <span className={styles.liveLabel}>مباشر —</span>
        <span className={styles.liveCount}>{online.total}</span>
        <span className={styles.liveLabel}> زائر على الموقع الآن</span>
        {online.loggedIn > 0 && (
          <span className={styles.liveSplit}>
            ({online.loggedIn} مسجل · {online.total - online.loggedIn} غير مسجل)
          </span>
        )}
        <span className={styles.liveNote}>يتحدّث تلقائياً</span>
      </div>

      <div className={styles.analyticsGrid}>

        {/* ─ Bar chart: registrations */}
        <div className={styles.chartCard} style={{gridColumn:'1/-1'}}>
          <span className={styles.chartTitle}>📅 التسجيلات — آخر ١٤ يوم</span>
          {users.length === 0
            ? <div className={styles.chartEmpty}>لا توجد بيانات تسجيل بعد</div>
            : (
              <div className={styles.barChart}>
                {regByDay.map(d=>(
                  <div key={d.key} className={styles.barCol}>
                    <div className={styles.barVal}>{d.count>0?d.count:''}</div>
                    <div className={styles.bar}
                      style={{
                        height: d.count>0 ? `${Math.max((d.count/maxReg)*100,8)}%` : '3px',
                        opacity: d.count>0 ? 1 : 0.15,
                      }}/>
                    <div className={styles.barLabel}>{d.label}</div>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {/* ─ Donut: reading activity */}
        <div className={styles.chartCard}>
          <span className={styles.chartTitle}>📖 نشاط القراءة</span>
          {totalUsers === 0
            ? <div className={styles.chartEmpty}>لا توجد بيانات بعد</div>
            : <>
                <div className={styles.donutWrap}>
                  <DonutChart
                    segments={[
                      {value:totalActive,            color:'#52b788'},
                      {value:totalUsers-totalActive,  color:'#2d3748'},
                    ]}
                    total={totalUsers}
                    centerLabel={Math.round((totalActive/totalUsers)*100)+'%'}
                    centerSub="نشاط"
                  />
                </div>
                <div className={styles.legend}>
                  <LegendItem color="#52b788" label="نشطون"     value={totalActive}/>
                  <LegendItem color="#2d3748" label="غير نشطين" value={totalUsers-totalActive}/>
                </div>
              </>
          }
        </div>

        {/* ─ Hbar: ayah distribution */}
        <div className={styles.chartCard}>
          <span className={styles.chartTitle}>📊 توزيع الآيات المقروءة</span>
          {scores.length === 0
            ? <div className={styles.chartEmpty}>لا توجد بيانات قراءة بعد</div>
            : (
              <div className={styles.hbarList}>
                {Object.entries(readBuckets).map(([k,v])=>(
                  <div key={k} className={styles.hbarRow}>
                    <span className={styles.hbarLabel}>{k}</span>
                    <div className={styles.hbarTrack}>
                      <div className={styles.hbarFill}
                        style={{width: scores.length>0 ? `${(v/scores.length)*100}%` : '0%'}}/>
                    </div>
                    <span className={styles.hbarVal}>{v}</span>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {/* ─ Donut: ticket status */}
        <div className={styles.chartCard}>
          <span className={styles.chartTitle}>💬 حالة تذاكر الدعم</span>
          {tickets.length === 0
            ? <div className={styles.chartEmpty}>لا توجد تذاكر بعد 🎉</div>
            : <>
                <div className={styles.donutWrap}>
                  <DonutChart
                    segments={[
                      {value:ticketStat.open,        color:'#f87171'},
                      {value:ticketStat.in_progress, color:'#fbbf24'},
                      {value:ticketStat.closed,      color:'#52b788'},
                    ]}
                    total={tickets.length}
                    centerLabel={tickets.length}
                    centerSub="إجمالي"
                  />
                </div>
                <div className={styles.legend}>
                  <LegendItem color="#f87171" label="مفتوح"        value={ticketStat.open}/>
                  <LegendItem color="#fbbf24" label="قيد المعالجة" value={ticketStat.in_progress}/>
                  <LegendItem color="#52b788" label="مغلق"         value={ticketStat.closed}/>
                </div>
              </>
          }
        </div>

      </div>
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────────────────────
function UsersTab({user:currentUser}) {
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState('all');
  const [selected, setSelected] = useState(null);
  const [acting,   setActing]   = useState(null);
  const [msgModal, setMsgModal] = useState(null);

  useEffect(()=>{
    adminGetUsers(200).then(({data})=>{ setUsers(data||[]); setLoading(false); });
  },[]);

  const filtered = useMemo(()=>users.filter(u=>{
    const q=search.toLowerCase();
    const mQ=!q||u.email?.toLowerCase().includes(q)||u.full_name?.toLowerCase().includes(q);
    const mF=filter==='all'?true:filter==='admin'?u.is_admin:filter==='active'?(u.ayahs_read||0)>0:filter==='banned'?u.banned:true;
    return mQ&&mF;
  }),[users,search,filter]);

  async function doAction(u,action) {
    setActing(u.user_id+action);
    if(action==='admin') await adminToggleAdmin(u.user_id,!u.is_admin);
    if(action==='ban')   await adminBanUser(u.user_id,!u.banned);
    setUsers(prev=>prev.map(x=>x.user_id===u.user_id
      ?{...x,is_admin:action==='admin'?!x.is_admin:x.is_admin,banned:action==='ban'?!x.banned:x.banned}
      :x));
    setActing(null);
  }

  return (
    <div className={styles.tabContent}>
      <PageHeader title="الأعضاء" sub={`${users.length} عضو مسجل`}/>
      <div className={styles.usersToolbar}>
        <input className={styles.searchInput}
          placeholder="🔍 بحث بالإيميل أو الاسم..."
          value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className={styles.filterTabs}>
          {[['all','الكل'],['admin','أدمنز'],['active','نشطون'],['banned','محظورون']].map(([v,l])=>(
            <button key={v}
              className={`${styles.filterTab} ${filter===v?styles.filterTabA:''}`}
              onClick={()=>setFilter(v)}>{l}</button>
          ))}
        </div>
      </div>
      <div className={styles.usersCount}>{filtered.length} نتيجة</div>
      {loading?<PageLoader/>:(
        <div className={styles.usersList}>
          {filtered.map(u=>(
            <div key={u.user_id}
              className={`${styles.userRow} ${u.is_admin?styles.userRowAdmin:''} ${u.banned?styles.userRowBanned:''}`}>
              <div className={styles.userAvatar} style={{background:strColor(u.email)}}>
                {(u.full_name||u.email||'?')[0].toUpperCase()}
              </div>
              <div className={styles.userInfo}>
                <div className={styles.userNameRow}>
                  <span className={styles.userName}>{u.full_name||'—'}</span>
                  {u.is_admin && <span className={styles.chip} style={{'--cc':'#c9a84c'}}>🛡 أدمن</span>}
                  {u.banned   && <span className={styles.chip} style={{'--cc':'#f87171'}}>🚫 محظور</span>}
                </div>
                <span className={styles.userEmail}>{u.email}</span>
                <span className={styles.userMeta}>
                  {(u.ayahs_read||0)>0&&`📖 ${fmt(u.ayahs_read)} آية · `}
                  انضم {timeAgo(u.created_at)}
                  {u.last_sign_in&&` · آخر دخول ${timeAgo(u.last_sign_in)}`}
                </span>
              </div>
              <div className={styles.userActions}>
                <button className={styles.iconBtn} title="التفاصيل"
                  onClick={()=>setSelected(selected?.user_id===u.user_id?null:u)}>👁</button>
                <button className={styles.iconBtn} title="إرسال رسالة"
                  onClick={()=>setMsgModal(u)}>✉️</button>
                {u.user_id!==currentUser.id&&<>
                  <button
                    className={`${styles.actionBtn2} ${u.is_admin?styles.actionBtnDanger:styles.actionBtnGold}`}
                    disabled={acting===u.user_id+'admin'}
                    onClick={()=>doAction(u,'admin')}>
                    {acting===u.user_id+'admin'?'...':u.is_admin?'إزالة أدمن':'+ أدمن'}
                  </button>
                  <button
                    className={`${styles.actionBtn2} ${u.banned?styles.actionBtnGreen:styles.actionBtnDanger}`}
                    disabled={acting===u.user_id+'ban'}
                    onClick={()=>doAction(u,'ban')}>
                    {acting===u.user_id+'ban'?'...':u.banned?'رفع الحظر':'حظر'}
                  </button>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}
      {selected&&(
        <div className={styles.drawer}>
          <div className={styles.drawerHeader}>
            <span>تفاصيل العضو</span>
            <button onClick={()=>setSelected(null)}>✕</button>
          </div>
          <div className={styles.drawerAvatar} style={{background:strColor(selected.email)}}>
            {(selected.full_name||selected.email||'?')[0].toUpperCase()}
          </div>
          <div className={styles.drawerName}>{selected.full_name||'—'}</div>
          <div className={styles.drawerEmail}>{selected.email}</div>
          <div className={styles.drawerStats}>
            <div className={styles.drawerStat}>
              <span className={styles.drawerStatVal}>{fmt(selected.ayahs_read||0)}</span>
              <span className={styles.drawerStatLabel}>آية مقروءة</span>
            </div>
            <div className={styles.drawerStat}>
              <span className={styles.drawerStatVal}>{selected.is_admin?'✅':'—'}</span>
              <span className={styles.drawerStatLabel}>أدمن</span>
            </div>
          </div>
          <div className={styles.drawerMeta}>
            <div>📅 انضم: {new Date(selected.created_at).toLocaleDateString('ar-EG')}</div>
            {selected.last_sign_in&&<div>🕐 آخر دخول: {new Date(selected.last_sign_in).toLocaleDateString('ar-EG')}</div>}
          </div>
          <button className={styles.drawerMsgBtn} onClick={()=>{setMsgModal(selected);setSelected(null);}}>
            ✉️ إرسال رسالة مباشرة
          </button>
        </div>
      )}
      {msgModal&&<SendMessageModal user={msgModal} onClose={()=>setMsgModal(null)}/>}
    </div>
  );
}

function SendMessageModal({user, onClose}) {
  const [subject, setSubject] = useState('رسالة من فريق الدعم');
  const [body,    setBody]    = useState('');
  const [sending, setSending] = useState(false);
  const [done,    setDone]    = useState(false);
  async function send() {
    if(!body.trim()) return;
    setSending(true);
    await adminSendDirectMessage(user.user_id, user.email, subject, body);
    setSending(false); setDone(true);
    setTimeout(onClose,1500);
  }
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={e=>e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>✉️ رسالة لـ {user.email?.split('@')[0]}</span>
          <button onClick={onClose}>✕</button>
        </div>
        {done?<div className={styles.modalDone}>✅ تم الإرسال</div>:<>
          <input className={styles.modalInput} placeholder="الموضوع"
            value={subject} onChange={e=>setSubject(e.target.value)}/>
          <textarea className={styles.modalTextarea} rows={5}
            placeholder="نص الرسالة..."
            value={body} onChange={e=>setBody(e.target.value)}/>
          <div className={styles.modalActions}>
            <button className={styles.sendBtnFull} disabled={sending||!body.trim()} onClick={send}>
              {sending?'...':'إرسال ↑'}
            </button>
            <button className={styles.cancelBtn} onClick={onClose}>إلغاء</button>
          </div>
        </>}
      </div>
    </div>
  );
}

// ─── Broadcasts ───────────────────────────────────────────────────────────────
function BroadcastsTab() {
  const [list,    setList]    = useState([]);
  const [title,   setTitle]   = useState('');
  const [body,    setBody]    = useState('');
  const [type,    setType]    = useState('info');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  useEffect(()=>{ getBroadcasts().then(setList); },[]);
  async function send() {
    if(!title.trim()||!body.trim()) return;
    setSending(true);
    await adminSendBroadcast(title,body,type);
    setSending(false); setSent(true);
    setTitle(''); setBody(''); setType('info');
    getBroadcasts().then(setList);
    setTimeout(()=>setSent(false),2500);
  }
  const TM={info:{label:'💬 معلومة',color:'#60a5fa'},warning:{label:'⚠️ تنبيه',color:'#fbbf24'},success:{label:'✅ خبر سار',color:'#52b788'}};
  return (
    <div className={styles.tabContent}>
      <PageHeader title="الإشعارات" sub="إرسال إعلانات لجميع الأعضاء"/>
      <div className={styles.broadcastGrid}>
        <div className={styles.composeCard}>
          <h3 className={styles.cardTitle}>📝 إشعار جديد</h3>
          <div className={styles.typeRow}>
            {Object.entries(TM).map(([k,v])=>(
              <button key={k}
                className={`${styles.typeBtn} ${type===k?styles.typeBtnA:''}`}
                style={{'--tc':v.color}}
                onClick={()=>setType(k)}>{v.label}</button>
            ))}
          </div>
          <input className={styles.composeInput} placeholder="عنوان الإشعار..."
            value={title} onChange={e=>setTitle(e.target.value)}/>
          <textarea className={styles.composeTextarea} rows={4}
            placeholder="نص الإشعار..."
            value={body} onChange={e=>setBody(e.target.value)}/>
          <button className={styles.sendBtnFull}
            disabled={sending||!title.trim()||!body.trim()} onClick={send}>
            {sending?'...':sent?'✅ تم الإرسال!':'📢 إرسال للجميع'}
          </button>
          <p className={styles.broadcastNote}>سيظهر الإشعار في الصفحة الرئيسية لجميع الأعضاء</p>
        </div>
        <div className={styles.historyCard}>
          <h3 className={styles.cardTitle}>📋 الإشعارات السابقة</h3>
          {list.length===0&&<p className={styles.emptyNote}>لا توجد إشعارات بعد</p>}
          {list.map(b=>(
            <div key={b.id} className={styles.broadcastItem}
              style={{borderRightColor:TM[b.type]?.color||'#60a5fa'}}>
              <div className={styles.broadcastItemTop}>
                <span className={styles.broadcastTitle}>{b.title}</span>
                <span style={{color:TM[b.type]?.color,fontSize:11}}>{TM[b.type]?.label}</span>
              </div>
              <p className={styles.broadcastBody}>{b.body}</p>
              <span className={styles.broadcastDate}>{timeAgo(b.sent_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [saving,   setSaving]   = useState({});
  const [saved,    setSaved]    = useState({});
  useEffect(()=>{ getAppSettings().then(setSettings); },[]);
  async function save(key,value) {
    setSaving(s=>({...s,[key]:true}));
    await updateAppSetting(key,value);
    setSaving(s=>({...s,[key]:false}));
    setSaved(s=>({...s,[key]:true}));
    setTimeout(()=>setSaved(s=>({...s,[key]:false})),2000);
  }
  if(!settings) return <PageLoader/>;
  const features=settings.features||{};
  const FEATURES=[
    {key:'hifz',icon:'📚',label:'صفحة الحفظ'},
    {key:'khatma',icon:'📿',label:'الختمة الشخصية'},
    {key:'khatma_group',icon:'🕌',label:'ختمة الروح'},
    {key:'leaderboard',icon:'🏆',label:'المتصدرون'},
    {key:'ijaza',icon:'📜',label:'الإجازة والقراءات'},
    {key:'ai_assistant',icon:'🤖',label:'المساعد الذكي'},
    {key:'notes',icon:'📝',label:'الملاحظات'},
    {key:'search',icon:'🔍',label:'البحث'},
  ];
  return (
    <div className={styles.tabContent}>
      <PageHeader title="الإعدادات" sub="تخصيص التطبيق"/>
      <div className={styles.settingsLayout}>
        <div className={styles.settingsCard}>
          <h3 className={styles.cardTitle}>🎨 هوية التطبيق</h3>
          <SettingRow label="اسم التطبيق" saved={saved.app_name} saving={saving.app_name}>
            <input className={styles.settingInput} defaultValue={settings.app_name}
              onBlur={e=>save('app_name',e.target.value)}/>
          </SettingRow>
          <SettingRow label="وصف التطبيق" saved={saved.app_description}>
            <textarea className={styles.settingInput} rows={2}
              defaultValue={settings.app_description}
              onBlur={e=>save('app_description',e.target.value)}/>
          </SettingRow>
          <SettingRow label="إيموجي اللوجو" saved={saved.app_logo_emoji}>
            <input className={styles.settingInput}
              style={{fontSize:26,width:70,textAlign:'center'}}
              defaultValue={settings.app_logo_emoji}
              onBlur={e=>save('app_logo_emoji',e.target.value)}/>
          </SettingRow>
          <SettingRow label="اللون الرئيسي" saved={saved.theme_color}>
            <div className={styles.colorRow}>
              <input type="color" defaultValue={settings.theme_color}
                onBlur={e=>save('theme_color',e.target.value)}
                className={styles.colorPicker}/>
              <input className={styles.settingInput} style={{width:110,direction:'ltr'}}
                defaultValue={settings.theme_color}
                onBlur={e=>save('theme_color',e.target.value)}/>
            </div>
          </SettingRow>
        </div>

        <div className={styles.settingsCard}>
          <h3 className={styles.cardTitle}>📢 إعلان للمستخدمين</h3>
          <SettingRow label="نص الإعلان" hint="فارغ = مخفي" saved={saved.announcement}>
            <textarea className={styles.settingInput} rows={3}
              defaultValue={settings.announcement}
              placeholder="مثال: سيتوقف التطبيق للصيانة..."
              onBlur={e=>save('announcement',e.target.value)}/>
          </SettingRow>
        </div>

        <div className={styles.settingsCard}>
          <h3 className={styles.cardTitle}>🔧 صيانة وأمان</h3>
          <div className={styles.toggleRow}>
            <div><div className={styles.toggleLabel}>وضع الصيانة</div><div className={styles.toggleHint}>يمنع دخول غير الأدمنز</div></div>
            <Toggle value={settings.maintenance_mode===true||settings.maintenance_mode==='true'}
              onChange={v=>{setSettings(s=>({...s,maintenance_mode:v}));save('maintenance_mode',v);}}/>
          </div>
          <div className={styles.toggleRow}>
            <div><div className={styles.toggleLabel}>السماح بالتسجيل</div><div className={styles.toggleHint}>إيقافه يمنع حسابات جديدة</div></div>
            <Toggle value={settings.allow_signup!==false}
              onChange={v=>{setSettings(s=>({...s,allow_signup:v}));save('allow_signup',v);}}/>
          </div>
        </div>

        <div className={styles.settingsCard}>
          <h3 className={styles.cardTitle}>🔌 تفعيل الميزات</h3>
          {FEATURES.map(f=>(
            <div key={f.key} className={styles.toggleRow}>
              <div className={styles.toggleLabel}>{f.icon} {f.label}</div>
              <Toggle value={features[f.key]!==false}
                onChange={v=>{const next={...features,[f.key]:v};setSettings(s=>({...s,features:next}));save('features',next);}}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Support (الدعم) ──────────────────────────────────────────────────────────
function SupportTab({user, isAdmin, onRead}) {
  const [tickets,    setTickets]    = useState([]);
  const [active,     setActive]     = useState(null);
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState('');
  const [sending,    setSending]    = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [creating,   setCreating]   = useState(false);
  const [filterS,    setFilterS]    = useState('all');
  const messagesEnd = useRef(null);

  const loadTickets = useCallback(async()=>{
    const data = isAdmin ? await adminGetAllTickets() : await getMyTickets(user.id);
    setTickets(data);
    if(isAdmin&&onRead) onRead();
  },[isAdmin,user.id]);

  useEffect(()=>{ loadTickets(); },[loadTickets]);
  useEffect(()=>{
    if(!active) return;
    getTicketMessages(active.id).then(setMessages);
    const unsub=subscribeToMessages(active.id,msg=>setMessages(prev=>[...prev,msg]));
    return ()=>{ if(typeof unsub==='function') unsub(); };
  },[active?.id]);
  useEffect(()=>{ messagesEnd.current?.scrollIntoView({behavior:'smooth'}); },[messages]);

  async function handleSend(e) {
    e.preventDefault();
    if(!input.trim()||!active) return;
    setSending(true);
    await sendMessage(active.id,user.id,input.trim(),isAdmin);
    if(isAdmin) await updateTicketStatus(active.id,'in_progress');
    setInput(''); setSending(false); loadTickets();
  }
  async function handleCreate(e) {
    e.preventDefault();
    if(!newSubject.trim()) return;
    setCreating(true);
    const {data}=await createTicket(user.id,user.email,newSubject.trim());
    if(data){setActive(data);await loadTickets();}
    setNewSubject(''); setCreating(false);
  }

  const STATUS={
    open:       {label:'مفتوح',        color:'#f87171'},
    in_progress:{label:'قيد المعالجة', color:'#fbbf24'},
    closed:     {label:'مغلق',         color:'#52b788'},
  };
  const visible=tickets.filter(t=>filterS==='all'?true:t.status===filterS);

  return (
    <div className={styles.supportShell}>
      <div className={styles.ticketPane}>
        <div className={styles.ticketPaneHeader}>
          <span className={styles.ticketPaneTitle}>{isAdmin?'📋 تذاكر الدعم':'💬 استفساراتي'}</span>
          <span className={styles.ticketPaneCount}>{tickets.length}</span>
        </div>
        {isAdmin&&(
          <div className={styles.ticketFilterRow}>
            {[['all','الكل'],['open','مفتوح'],['in_progress','جاري'],['closed','مغلق']].map(([v,l])=>(
              <button key={v}
                className={`${styles.ticketFilter} ${filterS===v?styles.ticketFilterA:''}`}
                onClick={()=>setFilterS(v)}>{l}</button>
            ))}
          </div>
        )}
        {!isAdmin&&(
          <form onSubmit={handleCreate} className={styles.newTicketForm}>
            <input className={styles.newTicketInput}
              placeholder="موضوع الاستفسار..."
              value={newSubject} onChange={e=>setNewSubject(e.target.value)}/>
            <button type="submit" className={styles.newTicketBtn} disabled={creating}>
              {creating?'...':'+'}
            </button>
          </form>
        )}
        <div className={styles.ticketItems}>
          {visible.length===0&&<div className={styles.emptyNote} style={{padding:20,textAlign:'center'}}>
            {isAdmin?'لا توجد تذاكر':'لا توجد استفسارات — أنشئ واحداً'}
          </div>}
          {visible.map(t=>(
            <div key={t.id}
              className={`${styles.ticketItem} ${active?.id===t.id?styles.ticketItemA:''}`}
              onClick={()=>setActive(t)}>
              <div className={styles.ticketItemRow}>
                <span className={styles.ticketSubj}>{t.subject}</span>
                <span style={{color:STATUS[t.status]?.color,fontSize:10}}>{STATUS[t.status]?.label}</span>
              </div>
              {isAdmin&&<div className={styles.ticketEmail}>{t.user_email}</div>}
              <div className={styles.ticketDate}>{timeAgo(t.updated_at)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.chatPane}>
        {!active?(
          <div className={styles.noChatMsg}>
            <div style={{fontSize:52}}>💬</div>
            <p>{isAdmin?'اختر تذكرة لعرض المحادثة':'اختر استفسار أو أنشئ واحداً جديداً'}</p>
          </div>
        ):(<>
          <div className={styles.chatHead}>
            <div>
              <div className={styles.chatSubj}>{active.subject}</div>
              {isAdmin&&<div className={styles.chatEmail}>{active.user_email}</div>}
            </div>
            {isAdmin&&(
              <div className={styles.statusPills}>
                {Object.entries(STATUS).map(([k,v])=>(
                  <button key={k}
                    className={`${styles.statusPill} ${active.status===k?styles.statusPillA:''}`}
                    style={{'--sc':v.color}}
                    onClick={async()=>{
                      await updateTicketStatus(active.id,k);
                      setActive(a=>({...a,status:k}));
                      loadTickets();
                    }}>{v.label}</button>
                ))}
              </div>
            )}
          </div>
          <div className={styles.msgList}>
            {messages.length===0&&<div className={styles.emptyNote} style={{textAlign:'center',padding:24}}>ابدأ المحادثة</div>}
            {messages.map(m=>(
              <div key={m.id} className={`${styles.msgWrap} ${m.is_admin?styles.msgWrapAdmin:''}`}>
                <div className={styles.msgBubble2}>{m.body}</div>
                <div className={styles.msgTime}>
                  {m.is_admin?'🛡 فريق الدعم':'👤 العضو'} · {new Date(m.created_at).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
            ))}
            <div ref={messagesEnd}/>
          </div>
          <form onSubmit={handleSend} className={styles.chatInputRow}>
            <input className={styles.chatInputBox}
              placeholder={active.status==='closed'?'هذه التذكرة مغلقة':'اكتب رسالتك...'}
              value={input} onChange={e=>setInput(e.target.value)}
              disabled={active.status==='closed'}/>
            <button type="submit" className={styles.chatSendBtn}
              disabled={sending||!input.trim()||active.status==='closed'}>
              {sending?'...':'↑'}
            </button>
          </form>
        </>)}
      </div>
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────
function StatCard({icon,label,value,color,delta,sub,onClick}) {
  return (
    <div className={styles.statCard} style={{'--c':color}}
      onClick={onClick} role={onClick?'button':undefined} style={{'--c':color,cursor:onClick?'pointer':'default'}}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statVal}>{value??'—'}</div>
      <div className={styles.statLabel}>{label}</div>
      {delta&&<div className={styles.statDelta}>{delta}</div>}
      {sub&&<div className={styles.statSub}>{sub}</div>}
    </div>
  );
}
function Toggle({value,onChange}) {
  return (
    <button className={`${styles.toggle} ${value?styles.toggleOn:''}`}
      onClick={()=>onChange(!value)} type="button">
      <span className={styles.toggleThumb}/>
    </button>
  );
}
function SettingRow({label,children,saved,saving,hint}) {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingLabelCol}>
        <label className={styles.settingLabel}>{label}</label>
        {hint&&<span className={styles.settingHint}>{hint}</span>}
      </div>
      <div className={styles.settingControl}>
        {children}
        {saving&&<span className={styles.savingTxt}>جارٍ الحفظ...</span>}
        {saved&&<span className={styles.savedTxt}>✓ تم الحفظ</span>}
      </div>
    </div>
  );
}
function PageHeader({title,sub}) {
  return (
    <div className={styles.pageHeader}>
      <h2 className={styles.pageTitle}>{title}</h2>
      {sub&&<p className={styles.pageSub}>{sub}</p>}
    </div>
  );
}
function PageLoader() {
  return <div className={styles.loadingPulse}>جارٍ التحميل...</div>;
}
function DonutChart({segments,total,centerLabel,centerSub}) {
  const SZ=120,R=46,C=2*Math.PI*R;
  let off=0;
  return (
    <svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`}>
      <circle cx={SZ/2} cy={SZ/2} r={R} fill="none" stroke="var(--border)" strokeWidth={14}/>
      {segments.filter(s=>s.value>0).map((s,i)=>{
        const dash=total>0?(s.value/total)*C:0;
        const el=(<circle key={i} cx={SZ/2} cy={SZ/2} r={R} fill="none"
          stroke={s.color} strokeWidth={14}
          strokeDasharray={`${dash} ${C}`}
          strokeDashoffset={-off}
          transform={`rotate(-90 ${SZ/2} ${SZ/2})`}/>);
        off+=dash; return el;
      })}
      <text x={SZ/2} y={SZ/2-4} textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--text)">{centerLabel}</text>
      <text x={SZ/2} y={SZ/2+14} textAnchor="middle" fontSize="10" fill="var(--text3)">{centerSub}</text>
    </svg>
  );
}
function LegendItem({color,label,value}) {
  return (
    <div className={styles.legendItem}>
      <span className={styles.legendDot} style={{background:color}}/>
      <span className={styles.legendLabel}>{label}</span>
      <span className={styles.legendVal}>{value}</span>
    </div>
  );
}
function NotLoggedIn() {
  return (
    <div className={styles.center}>
      <div style={{fontSize:52}}>🔐</div>
      <h2>يجب تسجيل الدخول أولاً</h2>
      <Link to="/login" className={styles.bigBtn}>تسجيل الدخول</Link>
    </div>
  );
}
function NotAdmin() {
  return (
    <div className={styles.center}>
      <div style={{fontSize:52}}>🚫</div>
      <h2>غير مصرح لك</h2>
      <p>هذه الصفحة للمديرين فقط</p>
      <Link to="/" className={styles.bigBtn}>العودة للرئيسية</Link>
    </div>
  );
}
function strColor(str='') {
  const c=['#52b788','#c9a84c','#60a5fa','#f97316','#a78bfa','#fb7185','#34d399','#38bdf8'];
  let h=0; for(const x of str) h=(h*31+x.charCodeAt(0))%c.length; return c[h];
}
function fmt(n) {
  if(n>=1000000) return (n/1000000).toFixed(1)+'م';
  if(n>=1000) return (n/1000).toFixed(1)+'ك';
  return String(n);
}
function isToday(d) { return d?.slice(0,10)===new Date().toISOString().slice(0,10); }
function timeAgo(dateStr) {
  if(!dateStr) return '—';
  const m=Math.floor((Date.now()-new Date(dateStr).getTime())/60000);
  if(m<1) return 'الآن';
  if(m<60) return `منذ ${m} دقيقة`;
  const h=Math.floor(m/60);
  if(h<24) return `منذ ${h} ساعة`;
  const d=Math.floor(h/24);
  if(d<30) return `منذ ${d} يوم`;
  return `منذ ${Math.floor(d/30)} شهر`;
}
