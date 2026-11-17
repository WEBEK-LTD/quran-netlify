-- ═══════════════════════════════════════════════════════════════
-- نور القرآن — Supabase SQL Schema
-- شغّل هذا الملف في: Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════

-- ─── Enable UUID extension ───────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── BOOKMARKS ───────────────────────────────────────────────────────────────
-- One row per user, stores all bookmarks as JSON array
create table if not exists public.bookmarks (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb        not null default '[]',
  updated_at timestamptz  not null default now()
);

alter table public.bookmarks enable row level security;

create policy "Users can manage own bookmarks"
  on public.bookmarks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── READING PROGRESS ────────────────────────────────────────────────────────
-- Tracks last read position per user
create table if not exists public.reading_progress (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  surah      smallint     not null default 1 check (surah between 1 and 114),
  ayah       smallint     not null default 1 check (ayah >= 1),
  updated_at timestamptz  not null default now()
);

alter table public.reading_progress enable row level security;

create policy "Users can manage own progress"
  on public.reading_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── NOTES ───────────────────────────────────────────────────────────────────
-- One note per user per ayah
create table if not exists public.notes (
  id         uuid         primary key default uuid_generate_v4(),
  user_id    uuid         not null references auth.users(id) on delete cascade,
  surah      smallint     not null check (surah between 1 and 114),
  ayah       smallint     not null check (ayah >= 1),
  text       text         not null,
  updated_at timestamptz  not null default now(),
  unique (user_id, surah, ayah)
);

alter table public.notes enable row level security;

create policy "Users can manage own notes"
  on public.notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists notes_user_id_idx on public.notes(user_id);
create index if not exists notes_updated_idx on public.notes(user_id, updated_at desc);

-- ─── READING SESSIONS ────────────────────────────────────────────────────────
-- One row per day per user for activity chart
create table if not exists public.reading_sessions (
  id         uuid         primary key default uuid_generate_v4(),
  user_id    uuid         not null references auth.users(id) on delete cascade,
  date       date         not null default current_date,
  ayah_count integer      not null default 0,
  unique (user_id, date)
);

alter table public.reading_sessions enable row level security;

create policy "Users can manage own sessions"
  on public.reading_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists sessions_user_date_idx on public.reading_sessions(user_id, date desc);

-- ─── HIFZ (Memorization) ─────────────────────────────────────────────────────
-- Sync hifz store to cloud
create table if not exists public.hifz (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb        not null default '{}',
  updated_at timestamptz  not null default now()
);

alter table public.hifz enable row level security;

create policy "Users can manage own hifz"
  on public.hifz for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── KHATMAT ─────────────────────────────────────────────────────────────────
-- Completed Quran readings
create table if not exists public.khatmat (
  id         uuid         primary key default uuid_generate_v4(),
  user_id    uuid         not null references auth.users(id) on delete cascade,
  start_date date         not null,
  end_date   date         not null,
  type       text         not null default 'قراءة',
  notes      text,
  created_at timestamptz  not null default now()
);

alter table public.khatmat enable row level security;

create policy "Users can manage own khatmat"
  on public.khatmat for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists khatmat_user_idx on public.khatmat(user_id, created_at desc);

-- ─── Auto-update updated_at ──────────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bookmarks_updated_at
  before update on public.bookmarks
  for each row execute function public.handle_updated_at();

create trigger progress_updated_at
  before update on public.reading_progress
  for each row execute function public.handle_updated_at();

create trigger notes_updated_at
  before update on public.notes
  for each row execute function public.handle_updated_at();

create trigger hifz_updated_at
  before update on public.hifz
  for each row execute function public.handle_updated_at();

-- ─── DONE ────────────────────────────────────────────────────────────────────
-- ✅ كل الجداول جاهزة مع Row Level Security
-- المتغيرات المطلوبة في Netlify:
--   VITE_SUPABASE_URL      = https://xxxx.supabase.co
--   VITE_SUPABASE_ANON_KEY = eyJ...
--   OPENAI_KEY             = sk-...

-- ─── GROUP KHATMAT (Quran completion for the deceased) ────────────────────────
-- Main room table
create table if not exists public.group_khatmat (
  id           text         primary key,          -- short code e.g. "A3X7Y"
  deceased_name text        not null,
  mode         text         not null default 'juz', -- juz | hizb
  is_public    boolean      not null default false,
  completions  integer      not null default 0,
  created_by   uuid         references auth.users(id) on delete set null,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

-- Parts table (30 ajza or 60 ahzab)
create table if not exists public.group_khatma_parts (
  id           uuid         primary key default uuid_generate_v4(),
  khatma_id    text         not null references public.group_khatmat(id) on delete cascade,
  part_index   smallint     not null,              -- 1-30 or 1-60
  label        text         not null,
  assignee     text         not null default '',   -- member name (free text)
  done         boolean      not null default false,
  done_by      text         not null default '',
  done_at      timestamptz,
  unique (khatma_id, part_index)
);

-- RLS: open policies — the app handles privacy logic
alter table public.group_khatmat enable row level security;
alter table public.group_khatma_parts enable row level security;

-- Allow ALL operations for everyone (anon + logged in)
-- Privacy (public/private) is enforced in the app, not DB
create policy "Open access group_khatmat"
  on public.group_khatmat for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "Open access group_khatma_parts"
  on public.group_khatma_parts for all
  to anon, authenticated
  using (true)
  with check (true);

-- Indexes
create index if not exists gkp_khatma_idx on public.group_khatma_parts(khatma_id, part_index);
create index if not exists gk_public_idx  on public.group_khatmat(is_public, created_at desc);
create index if not exists gk_created_idx on public.group_khatmat(created_by, created_at desc);

create trigger group_khatmat_updated_at
  before update on public.group_khatmat
  for each row execute function public.handle_updated_at();

-- Increment completions counter
create or replace function public.increment_completions(room_id text)
returns void language plpgsql security definer as $$
begin
  update public.group_khatmat
  set completions = completions + 1
  where id = room_id;
end;
$$;



-- ─── LEADERBOARD FUNCTIONS ────────────────────────────────────────────────────
-- Run these in Supabase SQL Editor

-- 1. Top readers by ayahs in last 30 days
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

-- 2. Top memorizers by completed surahs
create or replace function public.leaderboard_hifz()
returns table(user_id uuid, display_name text, score bigint)
language sql security definer as $$
  select
    h.user_id,
    coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)) as display_name,
    (
      select count(*)
      from jsonb_each(h.data) as kv
      where kv.value->>'status' = 'completed'
    )::bigint as score
  from public.hifz h
  join auth.users u on u.id = h.user_id
  order by score desc
  limit 50;
$$;

-- 3. Top by khatma count
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

-- Grant execute to anon and authenticated
grant execute on function public.leaderboard_reading() to anon, authenticated;
grant execute on function public.leaderboard_hifz() to anon, authenticated;
grant execute on function public.leaderboard_khatma() to anon, authenticated;



-- ─── USER SCORES (Leaderboard live scoring) ──────────────────────────────────
-- جدول النقاط التراكمية لكل مستخدم

create table if not exists public.user_scores (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  ayahs_read       bigint  not null default 0,   -- إجمالي الآيات المقروءة
  surahs_memorized integer not null default 0,   -- عدد السور المحفوظة
  khatmat_count    integer not null default 0,   -- عدد الختمات
  updated_at       timestamptz not null default now()
);

alter table public.user_scores enable row level security;

-- أي شخص يقرأ — لكن فقط المالك يعدّل
create policy "Read all scores"
  on public.user_scores for select
  to anon, authenticated using (true);

create policy "Owner can upsert own score"
  on public.user_scores for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── FUNCTION: increment_user_score ─────────────────────────────────────────
-- يُستدعى كل ما يقرأ المستخدم آية
-- يضيف 1 للآيات المقروءة + يحدث reading_sessions لنفس اليوم

create or replace function public.increment_user_score(p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  -- 1. Upsert user_scores — add 1 ayah
  insert into public.user_scores (user_id, ayahs_read, updated_at)
  values (p_user_id, 1, now())
  on conflict (user_id) do update
    set ayahs_read = user_scores.ayahs_read + 1,
        updated_at = now();

  -- 2. Upsert reading_sessions — count for today
  insert into public.reading_sessions (user_id, date, ayah_count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, date) do update
    set ayah_count = reading_sessions.ayah_count + 1;
end;
$$;

grant execute on function public.increment_user_score(uuid) to authenticated;

-- ─── Update leaderboard_reading to use user_scores ───────────────────────────
create or replace function public.leaderboard_reading()
returns table(user_id uuid, display_name text, score bigint)
language sql security definer as $$
  select
    us.user_id,
    coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)) as display_name,
    us.ayahs_read as score
  from public.user_scores us
  join auth.users u on u.id = us.user_id
  where us.ayahs_read > 0
  order by us.ayahs_read desc
  limit 50;
$$;

grant execute on function public.leaderboard_reading() to anon, authenticated;
