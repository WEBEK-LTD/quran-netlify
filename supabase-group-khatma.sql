-- ════════════════════════════════════════════════════════════════
-- نور القرآن — جداول الختمات الجماعية
-- شغّل هذا الملف في: Supabase Dashboard → SQL Editor → New query
-- ════════════════════════════════════════════════════════════════

-- جدول الختمات
create table if not exists public.group_khatmat (
  id            text         primary key,
  deceased_name text         not null,
  mode          text         not null default 'juz',
  is_public     boolean      not null default false,
  completions   integer      not null default 0,
  created_by    uuid         references auth.users(id) on delete set null,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);

-- جدول الأجزاء
create table if not exists public.group_khatma_parts (
  id          uuid      primary key default gen_random_uuid(),
  khatma_id   text      not null references public.group_khatmat(id) on delete cascade,
  part_index  smallint  not null,
  label       text      not null,
  assignee    text      not null default '',
  done        boolean   not null default false,
  done_by     text      not null default '',
  done_at     timestamptz,
  unique (khatma_id, part_index)
);

-- تفعيل الأمان
alter table public.group_khatmat      enable row level security;
alter table public.group_khatma_parts enable row level security;

-- صلاحيات مفتوحة (الخصوصية تتحكم فيها التطبيق)
drop policy if exists "Open access group_khatmat"      on public.group_khatmat;
drop policy if exists "Open access group_khatma_parts" on public.group_khatma_parts;

create policy "Open access group_khatmat"
  on public.group_khatmat for all
  to anon, authenticated
  using (true) with check (true);

create policy "Open access group_khatma_parts"
  on public.group_khatma_parts for all
  to anon, authenticated
  using (true) with check (true);

-- Indexes
create index if not exists gkp_khatma_idx on public.group_khatma_parts(khatma_id, part_index);

-- دالة زيادة عداد الختمات
create or replace function public.increment_completions(room_id text)
returns void language plpgsql security definer as $$
begin
  update public.group_khatmat set completions = completions + 1 where id = room_id;
end;
$$;

-- ✅ تم — الجداول جاهزة
