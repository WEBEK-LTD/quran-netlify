-- ══════════════════════════════════════════════════════════════
-- نور القرآن — Group Khatma Takers (من اختار كل جزء)
-- شغّل في: Supabase → SQL Editor → New query
-- ══════════════════════════════════════════════════════════════

-- جدول يحفظ كل شخص اختار جزء (ممكن أكتر من حد يختار نفس الجزء)
create table if not exists public.group_khatma_takers (
  id          uuid      primary key default uuid_generate_v4(),
  khatma_id   text      not null references public.group_khatmat(id) on delete cascade,
  part_index  smallint  not null,
  taker_name  text      not null,          -- اسم المختار (free text)
  claimed_at  timestamptz not null default now(),
  done        boolean   not null default false,
  done_at     timestamptz
);

-- RLS: open access
alter table public.group_khatma_takers enable row level security;
create policy "Open access takers"
  on public.group_khatma_takers for all
  to anon, authenticated
  using (true) with check (true);

-- Index للسرعة
create index if not exists gkt_khatma_part_idx
  on public.group_khatma_takers(khatma_id, part_index);

-- ─── Function: claim_part ────────────────────────────────────────────────────
-- يضيف حد جديد لجزء معين
create or replace function public.claim_part(
  p_khatma_id  text,
  p_part_index smallint,
  p_name       text
) returns uuid language plpgsql security definer as $$
declare
  v_id uuid;
begin
  insert into public.group_khatma_takers(khatma_id, part_index, taker_name)
  values (p_khatma_id, p_part_index, p_name)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.claim_part(text, smallint, text) to anon, authenticated;

-- ─── Function: mark_taker_done ───────────────────────────────────────────────
-- يعلّم الشخص إنه خلّص الجزء
create or replace function public.mark_taker_done(
  p_id  uuid,
  p_done boolean
) returns void language plpgsql security definer as $$
begin
  update public.group_khatma_takers
  set done    = p_done,
      done_at = case when p_done then now() else null end
  where id = p_id;
end;
$$;
grant execute on function public.mark_taker_done(uuid, boolean) to anon, authenticated;

-- ─── Function: get_part_takers ───────────────────────────────────────────────
-- يجيب كل من اختار جزء معين في ختمة
create or replace function public.get_part_takers(
  p_khatma_id text,
  p_part_index smallint
) returns table(id uuid, taker_name text, done boolean, done_at timestamptz, claimed_at timestamptz)
language sql security definer as $$
  select id, taker_name, done, done_at, claimed_at
  from public.group_khatma_takers
  where khatma_id = p_khatma_id and part_index = p_part_index
  order by claimed_at asc;
$$;
grant execute on function public.get_part_takers(text, smallint) to anon, authenticated;

-- ─── Function: get_all_takers ────────────────────────────────────────────────
-- يجيب كل الـ takers لختمة كاملة (أكفأ من N queries)
create or replace function public.get_all_takers(p_khatma_id text)
returns table(part_index smallint, taker_name text, done boolean, id uuid)
language sql security definer as $$
  select part_index, taker_name, done, id
  from public.group_khatma_takers
  where khatma_id = p_khatma_id
  order by part_index asc, claimed_at asc;
$$;
grant execute on function public.get_all_takers(text) to anon, authenticated;
