-- ══════════════════════════════════════════════════════════════════
-- نور القرآن — Full Database Schema (v3)
-- شغّل هذا الملف كاملاً في: Supabase → SQL Editor → New query
-- يعمل مع قاعدة بيانات جديدة أو موجودة (idempotent)
-- ══════════════════════════════════════════════════════════════════

-- ─── Extensions ──────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ════════════════════════════════════════════════════════════════
-- PART 1: ADMIN & SETTINGS
-- ════════════════════════════════════════════════════════════════

-- 1. Admins
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "Admins only" on public.admins;
create policy "Admins only" on public.admins for all to authenticated
  using  (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

create or replace function public.is_admin()
returns boolean language sql security definer as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated;

-- 2. App settings
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.app_settings enable row level security;
drop policy if exists "Anyone reads settings" on public.app_settings;
drop policy if exists "Admin writes settings" on public.app_settings;
create policy "Anyone reads settings" on public.app_settings for select to anon, authenticated using (true);
create policy "Admin writes settings" on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.app_settings (key, value) values
  ('app_name',        '"نور القرآن"'),
  ('app_description', '"تطبيق قرآني مجاني لوجه الله"'),
  ('app_logo_emoji',  '"✦"'),
  ('features', '{"hifz":true,"khatma":true,"khatma_group":true,"leaderboard":true,"ijaza":true,"ai_assistant":true,"notes":true,"search":true}'),
  ('maintenance_mode','false'),
  ('announcement',    '""'),
  ('theme_color',     '"#c9a84c"'),
  ('allow_signup',    'true')
on conflict (key) do nothing;

-- 3. User bans
create table if not exists public.user_bans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  banned     boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.user_bans enable row level security;
drop policy if exists "Admin manages bans" on public.user_bans;
create policy "Admin manages bans" on public.user_bans for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 4. Broadcasts
create table if not exists public.broadcasts (
  id      uuid primary key default uuid_generate_v4(),
  title   text not null,
  body    text not null,
  type    text not null default 'info',
  sent_at timestamptz not null default now()
);
alter table public.broadcasts enable row level security;
drop policy if exists "Anyone reads broadcasts" on public.broadcasts;
drop policy if exists "Admin sends broadcasts" on public.broadcasts;
create policy "Anyone reads broadcasts" on public.broadcasts for select to anon, authenticated using (true);
create policy "Admin sends broadcasts"  on public.broadcasts for insert to authenticated
  with check (public.is_admin());

-- 5. Support tickets
create table if not exists public.support_tickets (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete set null,
  user_email text,
  subject    text not null default 'استفسار',
  status     text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security;
drop policy if exists "User sees own tickets" on public.support_tickets;
drop policy if exists "User creates ticket"   on public.support_tickets;
drop policy if exists "Admin manages tickets" on public.support_tickets;
create policy "User sees own tickets" on public.support_tickets for select to authenticated
  using (auth.uid() = user_id or public.is_admin());
create policy "User creates ticket" on public.support_tickets for insert to authenticated
  with check (auth.uid() = user_id);
create policy "Admin manages tickets" on public.support_tickets for update to authenticated
  using (public.is_admin());

-- 6. Support messages
create table if not exists public.support_messages (
  id        uuid primary key default uuid_generate_v4(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  is_admin  boolean not null default false,
  body      text not null,
  read      boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.support_messages enable row level security;
drop policy if exists "Ticket participants see messages" on public.support_messages;
drop policy if exists "Participants send messages"       on public.support_messages;
create policy "Ticket participants see messages" on public.support_messages for select to authenticated
  using (public.is_admin() or
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));
create policy "Participants send messages" on public.support_messages for insert to authenticated
  with check (auth.uid() = sender_id and (
    public.is_admin() or
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())));

create index if not exists tickets_user_idx  on public.support_tickets(user_id, created_at desc);
create index if not exists tickets_status_idx on public.support_tickets(status, updated_at desc);
create index if not exists msgs_ticket_idx    on public.support_messages(ticket_id, created_at asc);

-- Admin helpers
create or replace function public.admin_unread_count()
returns bigint language sql security definer as $$
  select count(*) from public.support_messages where is_admin = false and read = false;
$$;
grant execute on function public.admin_unread_count() to authenticated;

create or replace function public.admin_get_users(p_limit int default 50, p_offset int default 0)
returns table(user_id uuid, email text, full_name text, created_at timestamptz,
              last_sign_in timestamptz, is_admin boolean, ayahs_read bigint)
language plpgsql security definer as $$
begin
  -- فقط الأدمن يقدر ينفذ الفنكشن دي
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Access denied: admins only';
  end if;

  return query
    select u.id, u.email,
      coalesce(u.raw_user_meta_data->>'full_name', '') as full_name,
      u.created_at, u.last_sign_in_at,
      exists(select 1 from public.admins a where a.user_id = u.id) as is_admin,
      coalesce((select s.ayahs_read from public.user_scores s where s.user_id = u.id), 0) as ayahs_read
    from auth.users u
    order by u.created_at desc
    limit p_limit offset p_offset;
end;
$$;
grant execute on function public.admin_get_users(int, int) to authenticated;

-- Realtime for support (skip if already added)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='support_messages') then
    alter publication supabase_realtime add table public.support_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='support_tickets') then
    alter publication supabase_realtime add table public.support_tickets;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='group_khatma_parts') then
    alter publication supabase_realtime add table public.group_khatma_parts;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════
-- PART 2: USER DATA (previously missing!)
-- ════════════════════════════════════════════════════════════════

-- 7. Bookmarks (المفضلة)
create table if not exists public.bookmarks (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  surah      int  not null,
  ayah       int  not null,
  created_at timestamptz not null default now(),
  unique (user_id, surah, ayah)
);
alter table public.bookmarks enable row level security;
drop policy if exists "Users manage own bookmarks" on public.bookmarks;
create policy "Users manage own bookmarks" on public.bookmarks for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists bookmarks_user_idx on public.bookmarks(user_id, created_at desc);

-- 8. Reading progress (آخر موضع قراءة)
create table if not exists public.reading_progress (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  surah      int  not null default 1,
  ayah       int  not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.reading_progress enable row level security;
drop policy if exists "Users manage own progress" on public.reading_progress;
create policy "Users manage own progress" on public.reading_progress for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 9. Notes (الملاحظات)
create table if not exists public.notes (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  surah      int  not null,
  ayah       int  not null,
  text       text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, surah, ayah)
);
alter table public.notes enable row level security;
drop policy if exists "Users manage own notes" on public.notes;
create policy "Users manage own notes" on public.notes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists notes_user_idx on public.notes(user_id, updated_at desc);

-- 10. Hifz (الحفظ — cloud sync)
create table if not exists public.hifz (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.hifz enable row level security;
drop policy if exists "Users manage own hifz" on public.hifz;
create policy "Users manage own hifz" on public.hifz for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Index for faster hifz leaderboard
create index if not exists hifz_data_idx on public.hifz using gin(data);

-- 11. User scores (نقاط الـ leaderboard)
create table if not exists public.user_scores (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  ayahs_read bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.user_scores enable row level security;
drop policy if exists "Anyone reads scores" on public.user_scores;
drop policy if exists "Users update own score" on public.user_scores;
create policy "Anyone reads scores"   on public.user_scores for select to anon, authenticated using (true);
create policy "Users update own score" on public.user_scores for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 12. Reading sessions (للـ leaderboard والـ streak)
create table if not exists public.reading_sessions (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null default current_date,
  ayah_count int  not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, date)  -- مطلوب لـ upsert
);
alter table public.reading_sessions enable row level security;
drop policy if exists "Users manage own sessions" on public.reading_sessions;
drop policy if exists "Anyone reads sessions for leaderboard" on public.reading_sessions;
-- كل مستخدم يدير جلساته
create policy "Users manage own sessions" on public.reading_sessions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- السماح للـ leaderboard functions بالقراءة (security definer تتجاوز RLS تلقائياً)
-- لكن نضيف policy للـ anon للقراءة كاحتياط
create policy "Anyone reads sessions for leaderboard" on public.reading_sessions
  for select to anon, authenticated using (true);
create index if not exists sessions_user_date_idx on public.reading_sessions(user_id, date desc);

-- Personal khatmat (الختمات الشخصية)
create table if not exists public.khatmat (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text,
  completed  boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.khatmat enable row level security;
drop policy if exists "Users manage own khatmat" on public.khatmat;
create policy "Users manage own khatmat" on public.khatmat for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════
-- PART 3: GROUP KHATMA (previously missing!)
-- ════════════════════════════════════════════════════════════════

-- 13. Group khatmat rooms
create table if not exists public.group_khatmat (
  id            text primary key,             -- short code e.g. "AHMD12"
  deceased_name text not null default '',
  mode          text not null default 'juz',  -- juz | surah | hizb
  is_public     boolean not null default false,
  completions   int  not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
alter table public.group_khatmat enable row level security;
drop policy if exists "Anyone reads public khatmat"  on public.group_khatmat;
drop policy if exists "Creator manages khatma"       on public.group_khatmat;
drop policy if exists "Authenticated reads all"      on public.group_khatmat;
create policy "Anyone reads public khatmat" on public.group_khatmat for select
  to anon, authenticated using (is_public = true or auth.uid() = created_by);
create policy "Creator manages khatma" on public.group_khatmat for all to authenticated
  using (auth.uid() = created_by) with check (auth.uid() = created_by);
-- Allow insert for authenticated (to create rooms)
create policy "Authenticated creates khatma" on public.group_khatmat for insert to authenticated
  with check (auth.uid() = created_by);
-- Allow read by code (for joining)
create policy "Anyone reads by id" on public.group_khatmat for select
  to anon, authenticated using (true);

-- 14. Group khatma parts
create table if not exists public.group_khatma_parts (
  id          bigserial primary key,
  khatma_id   text not null references public.group_khatmat(id) on delete cascade,
  part_index  int  not null,
  label       text not null default '',
  assignee    text not null default '',
  done        boolean not null default false,
  done_by     text not null default '',
  done_at     timestamptz,
  unique (khatma_id, part_index)
);
alter table public.group_khatma_parts enable row level security;
drop policy if exists "Anyone reads parts" on public.group_khatma_parts;
drop policy if exists "Anyone updates parts" on public.group_khatma_parts;
create policy "Anyone reads parts" on public.group_khatma_parts for select
  to anon, authenticated using (true);
create policy "Anyone updates parts" on public.group_khatma_parts for update
  to anon, authenticated using (true);
create policy "Creator inserts parts" on public.group_khatma_parts for insert to authenticated
  with check (true);

create index if not exists parts_khatma_idx on public.group_khatma_parts(khatma_id, part_index);

-- Realtime for group khatma (handled in block above)

-- ════════════════════════════════════════════════════════════════
-- PART 4: RPC FUNCTIONS
-- ════════════════════════════════════════════════════════════════

-- increment_user_score
create or replace function public.increment_user_score(p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into public.user_scores (user_id, ayahs_read)
  values (p_user_id, 1)
  on conflict (user_id) do update
    set ayahs_read = user_scores.ayahs_read + 1, updated_at = now();
end;
$$;
grant execute on function public.increment_user_score(uuid) to authenticated;

-- increment_completions (for group khatma new round)
create or replace function public.increment_completions(room_id text)
returns void language plpgsql security definer as $$
begin
  update public.group_khatmat set completions = completions + 1 where id = room_id;
end;
$$;
grant execute on function public.increment_completions(text) to anon, authenticated;

-- Leaderboard: reading
create or replace function public.leaderboard_reading()
returns table(user_id uuid, display_name text, score bigint)
language sql security definer as $$
  -- من reading_sessions (أدق)
  select rs.user_id,
    coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''), split_part(u.email,'@',1), 'مجهول') as display_name,
    sum(rs.ayah_count)::bigint as score
  from public.reading_sessions rs
  join auth.users u on u.id = rs.user_id
  group by rs.user_id, u.raw_user_meta_data, u.email
  having sum(rs.ayah_count) > 0
  union all
  -- fallback: من user_scores لمن ليس لديهم sessions
  select us.user_id,
    coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''), split_part(u.email,'@',1), 'مجهول') as display_name,
    us.ayahs_read::bigint as score
  from public.user_scores us
  join auth.users u on u.id = us.user_id
  where us.user_id not in (select distinct user_id from public.reading_sessions)
    and us.ayahs_read > 0
  order by score desc limit 50;
$$;

-- Leaderboard: hifz
create or replace function public.leaderboard_hifz()
returns table(user_id uuid, display_name text, score bigint)
language sql security definer as $$
  select h.user_id,
    coalesce(
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      split_part(u.email,'@',1),
      'مجهول'
    ) as display_name,
    -- surahStatus is stored as {"1": "completed", "2": "inProgress", ...}
    -- so we count keys where the value (string) = 'completed'
    coalesce(
      (select count(*)
       from jsonb_each_text(h.data->'surahStatus') kv
       where kv.value = 'completed'),
      0
    )::bigint as score
  from public.hifz h
  join auth.users u on u.id = h.user_id
  where h.data->'surahStatus' is not null
  order by score desc
  limit 50;
$$;

-- Leaderboard: khatma
create or replace function public.leaderboard_khatma()
returns table(user_id uuid, display_name text, score bigint)
language sql security definer as $$
  select k.user_id,
    coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)) as display_name,
    count(k.id)::bigint as score
  from public.khatmat k join auth.users u on u.id = k.user_id
  group by k.user_id, u.raw_user_meta_data, u.email
  order by score desc limit 50;
$$;

grant execute on function public.leaderboard_reading() to anon, authenticated;

-- RPC لزيادة عدد الآيات بشكل آمن (atomic increment)
create or replace function public.upsert_reading_session(p_user_id uuid, p_date date)
returns void language sql security definer as $$
  insert into public.reading_sessions (user_id, date, ayah_count)
  values (p_user_id, p_date, 1)
  on conflict (user_id, date)
  do update set ayah_count = reading_sessions.ayah_count + 1;
$$;
grant execute on function public.upsert_reading_session(uuid, date) to authenticated;
grant execute on function public.leaderboard_hifz()    to anon, authenticated;
grant execute on function public.leaderboard_khatma()  to anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- ✅ تم! شغّل الملف كاملاً في Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════
