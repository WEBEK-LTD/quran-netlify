-- ══════════════════════════════════════════════════
-- نور القرآن — Group Khatmat Tables
-- شغّل هذا الملف في: Supabase → SQL Editor → New query
-- ══════════════════════════════════════════════════

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
