-- ══════════════════════════════════════════════════════
-- نور القرآن — User Scores + increment_user_score
-- شغّل هذا في: Supabase → SQL Editor → New query
-- ══════════════════════════════════════════════════════


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
