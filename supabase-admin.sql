-- ══════════════════════════════════════════════════════════════════
-- نور القرآن — Admin Panel Schema
-- شغّل في: Supabase → SQL Editor → New query
-- ══════════════════════════════════════════════════════════════════

-- ─── 1. جدول الأدمنز ─────────────────────────────────────────────
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- فقط الأدمن يشوف جدول الأدمنز
create policy "Admins only" on public.admins for all
  to authenticated
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

-- Function: هل المستخدم الحالي أدمن؟
create or replace function public.is_admin()
returns boolean language sql security definer as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated;

-- ─── 2. إعدادات التطبيق ──────────────────────────────────────────
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.app_settings enable row level security;
-- الكل يقرأ، الأدمن بس يعدّل
create policy "Anyone reads settings" on public.app_settings for select
  to anon, authenticated using (true);
create policy "Admin writes settings" on public.app_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Default settings
insert into public.app_settings (key, value) values
  ('app_name',        '"نور القرآن"'),
  ('app_description', '"تطبيق قرآني مجاني لوجه الله"'),
  ('app_logo_emoji',  '"✦"'),
  ('features',        '{"hifz":true,"khatma":true,"khatma_group":true,"leaderboard":true,"ijaza":true,"ai_assistant":true,"notes":true,"search":true}'),
  ('maintenance_mode','false'),
  ('announcement',    '""'),
  ('theme_color',     '"#c9a84c"')
on conflict (key) do nothing;

-- ─── 3. شات السابورت ─────────────────────────────────────────────
create table if not exists public.support_tickets (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete set null,
  user_email  text,
  subject     text not null default 'استفسار',
  status      text not null default 'open',   -- open | in_progress | closed
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.support_tickets enable row level security;
create policy "User sees own tickets" on public.support_tickets for select
  to authenticated using (auth.uid() = user_id or public.is_admin());
create policy "User creates ticket" on public.support_tickets for insert
  to authenticated with check (auth.uid() = user_id);
create policy "Admin manages tickets" on public.support_tickets for update
  to authenticated using (public.is_admin());

-- رسائل الشات
create table if not exists public.support_messages (
  id          uuid primary key default uuid_generate_v4(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  sender_id   uuid references auth.users(id) on delete set null,
  is_admin    boolean not null default false,
  body        text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.support_messages enable row level security;
create policy "Ticket participants see messages" on public.support_messages for select
  to authenticated
  using (
    public.is_admin() or
    exists (select 1 from public.support_tickets t
            where t.id = ticket_id and t.user_id = auth.uid())
  );
create policy "Participants send messages" on public.support_messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id and (
      public.is_admin() or
      exists (select 1 from public.support_tickets t
              where t.id = ticket_id and t.user_id = auth.uid())
    )
  );

-- Indexes
create index if not exists tickets_user_idx on public.support_tickets(user_id, created_at desc);
create index if not exists tickets_status_idx on public.support_tickets(status, updated_at desc);
create index if not exists msgs_ticket_idx on public.support_messages(ticket_id, created_at asc);

-- Realtime for support chat
alter publication supabase_realtime add table public.support_messages;
alter publication supabase_realtime add table public.support_tickets;

-- ─── 4. Helper functions ─────────────────────────────────────────
-- عدد الرسائل غير المقروءة للأدمن
create or replace function public.admin_unread_count()
returns bigint language sql security definer as $$
  select count(*) from public.support_messages
  where is_admin = false and read = false;
$$;
grant execute on function public.admin_unread_count() to authenticated;

-- قائمة المستخدمين للأدمن
create or replace function public.admin_get_users(p_limit int default 50, p_offset int default 0)
returns table(
  user_id uuid, email text, full_name text,
  created_at timestamptz, last_sign_in timestamptz,
  is_admin boolean, ayahs_read bigint
) language sql security definer as $$
  select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data->>'full_name', '') as full_name,
    u.created_at,
    u.last_sign_in_at,
    exists(select 1 from public.admins a where a.user_id = u.id) as is_admin,
    coalesce((select ayahs_read from public.user_scores s where s.user_id = u.id), 0) as ayahs_read
  from auth.users u
  order by u.created_at desc
  limit p_limit offset p_offset;
$$;
grant execute on function public.admin_get_users(int, int) to authenticated;


-- ─── 5. جدول الحظر ────────────────────────────────────────────────
create table if not exists public.user_bans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  banned     boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.user_bans enable row level security;
create policy "Admin manages bans" on public.user_bans for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

-- ─── 6. جدول الإشعارات العامة ────────────────────────────────────
create table if not exists public.broadcasts (
  id       uuid primary key default uuid_generate_v4(),
  title    text not null,
  body     text not null,
  type     text not null default 'info',  -- info | warning | success
  sent_at  timestamptz not null default now()
);
alter table public.broadcasts enable row level security;
create policy "Anyone reads broadcasts" on public.broadcasts for select
  to anon, authenticated using (true);
create policy "Admin sends broadcasts" on public.broadcasts for insert
  to authenticated with check (public.is_admin());
