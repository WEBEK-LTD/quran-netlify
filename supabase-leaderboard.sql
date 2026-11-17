-- ══════════════════════════════════════════════════════════════════
-- نور القرآن — Leaderboard SQL Functions
-- شغّل هذا في: Supabase → SQL Editor → New query
-- ══════════════════════════════════════════════════════════════════

-- ─── جداول مطلوبة (لو مش موجودة) ────────────────────────────────

create table if not exists public.reading_sessions (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null default current_date,
  ayah_count int  not null default 0,
  created_at timestamptz not null default now()
);
alter table public.reading_sessions enable row level security;
-- unique constraint: واحد record في اليوم لكل مستخدم
-- unique constraint already exists, skipping
drop policy if exists "Users manage own sessions" on public.reading_sessions;
create policy "Users manage own sessions" on public.reading_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.hifz (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.hifz enable row level security;
drop policy if exists "Users manage own hifz" on public.hifz;
create policy "Users manage own hifz" on public.hifz
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.khatmat (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text,
  completed  boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.khatmat enable row level security;
drop policy if exists "Users manage own khatmat" on public.khatmat;
create policy "Users manage own khatmat" on public.khatmat
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.user_scores (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  ayahs_read bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.user_scores enable row level security;
drop policy if exists "Anyone reads scores" on public.user_scores;
drop policy if exists "Users update own score" on public.user_scores;
create policy "Anyone reads scores" on public.user_scores
  for select to anon, authenticated using (true);
create policy "Users update own score" on public.user_scores
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── 1. الأكثر قراءة (آخر 30 يوم) ───────────────────────────────
create or replace function public.leaderboard_reading()
returns table(user_id uuid, display_name text, score bigint)
language sql security definer as $$
  select
    rs.user_id,
    coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)) as display_name,
    sum(rs.ayah_count)::bigint as score
  from public.reading_sessions rs
  join auth.users u on u.id = rs.user_id
  where rs.date >= current_date - interval '30 days'
  group by rs.user_id, u.raw_user_meta_data, u.email
  order by score desc
  limit 50;
$$;

-- ─── 2. الأكثر حفظاً ─────────────────────────────────────────────
create or replace function public.leaderboard_hifz()
returns table(user_id uuid, display_name text, score bigint)
language sql security definer as $$
  select
    h.user_id,
    coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)) as display_name,
    (select count(*) from jsonb_each(h.data) as kv where kv.value->>'status' = 'completed')::bigint as score
  from public.hifz h
  join auth.users u on u.id = h.user_id
  order by score desc
  limit 50;
$$;

-- ─── 3. أكثر الختمات ─────────────────────────────────────────────
create or replace function public.leaderboard_khatma()
returns table(user_id uuid, display_name text, score bigint)
language sql security definer as $$
  select
    k.user_id,
    coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)) as display_name,
    count(k.id)::bigint as score
  from public.khatmat k
  join auth.users u on u.id = k.user_id
  group by k.user_id, u.raw_user_meta_data, u.email
  order by score desc
  limit 50;
$$;

-- ─── RPC لزيادة النقاط ───────────────────────────────────────────
create or replace function public.increment_user_score(p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into public.user_scores (user_id, ayahs_read)
  values (p_user_id, 1)
  on conflict (user_id) do update
    set ayahs_read = user_scores.ayahs_read + 1,
        updated_at = now();
end;
$$;

-- ─── منح الصلاحيات ───────────────────────────────────────────────
grant execute on function public.leaderboard_reading()             to anon, authenticated;
grant execute on function public.leaderboard_hifz()                to anon, authenticated;
grant execute on function public.leaderboard_khatma()              to anon, authenticated;
grant execute on function public.increment_user_score(uuid)        to authenticated;

-- ══════════════════════════════════════════════════════════════════
-- ✅ شغّل هذا الملف كاملاً في Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════
