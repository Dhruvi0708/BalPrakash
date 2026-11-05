-- ===== supabase/migrations/0001_init.sql =====
-- Bal Prakash Management System: initial schema
-- Roles, areas, families/members, subscriptions, issues, stock, distributions, audit.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('main_head', 'balika_head', 'volunteer', 'subscriber');
create type public.member_category as enum ('balak', 'balika');
create type public.pub_language as enum ('gu', 'en');
create type public.subscription_status as enum ('pending', 'active', 'expired', 'cancelled');
create type public.payment_mode as enum ('cash', 'upi', 'cheque', 'other');
create type public.payment_status as enum ('pending', 'verified', 'rejected');
create type public.distribution_status as enum ('pending', 'self', 'mediator');
create type public.record_source as enum ('online', 'manual', 'import');

-- Keeps the last 10 digits so "+91 98765-43210" and "9876543210" match.
create or replace function public.normalize_phone(p text)
returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '')
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.areas (
  id bigint generated always as identity primary key,
  name text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index areas_name_key on public.areas (lower(name));

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text unique,
  role public.app_role not null default 'subscriber',
  category public.member_category, -- which side a volunteer serves
  area_id bigint references public.areas (id),
  created_at timestamptz not null default now()
);

create table public.families (
  id bigint generated always as identity primary key,
  parent_name text not null,
  phone text not null unique,
  alt_phone text,
  email text,
  address text,
  area_id bigint references public.areas (id),
  user_id uuid references auth.users (id) on delete set null,
  access_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  source public.record_source not null default 'manual',
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.members (
  id bigint generated always as identity primary key,
  family_id bigint not null references public.families (id) on delete cascade,
  full_name text not null,
  category public.member_category not null,
  dob date,
  notes text,
  source public.record_source not null default 'manual',
  created_at timestamptz not null default now()
);
create unique index members_family_name_key on public.members (family_id, lower(full_name));
create index members_category_idx on public.members (category);

create table public.registration_windows (
  id bigint generated always as identity primary key,
  title text not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null check (closes_at > opens_at),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- seq_no is a running number per language (Gujarati monthly, English bi-monthly).
create table public.issues (
  id bigint generated always as identity primary key,
  language public.pub_language not null,
  seq_no int not null check (seq_no > 0),
  issue_month int check (issue_month between 1 and 12),
  issue_year int check (issue_year between 2000 and 2100),
  title text,
  created_at timestamptz not null default now(),
  unique (language, seq_no)
);

create table public.subscriptions (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members (id) on delete cascade,
  language public.pub_language not null,
  plan_years int not null check (plan_years in (1, 3)),
  start_issue_seq int not null check (start_issue_seq > 0),
  total_issues int not null check (total_issues > 0), -- filled by trigger from plan if not given
  amount numeric(10, 2),
  payment_mode public.payment_mode,
  receipt_no text,
  payment_status public.payment_status not null default 'pending',
  status public.subscription_status not null default 'pending',
  source public.record_source not null default 'manual',
  registration_window_id bigint references public.registration_windows (id),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index subscriptions_member_idx on public.subscriptions (member_id);
create index subscriptions_lang_status_idx on public.subscriptions (language, status);

create table public.stock_receipts (
  id bigint generated always as identity primary key,
  issue_id bigint not null references public.issues (id) on delete cascade,
  category public.member_category not null,
  quantity int not null check (quantity >= 0),
  received_on date not null default current_date,
  received_by uuid references auth.users (id) default auth.uid(),
  notes text,
  created_at timestamptz not null default now()
);

create table public.distributions (
  id bigint generated always as identity primary key,
  issue_id bigint not null references public.issues (id) on delete cascade,
  subscription_id bigint not null references public.subscriptions (id) on delete cascade,
  status public.distribution_status not null default 'pending',
  collected_by_name text,   -- mediator name when status = 'mediator'
  mediator_relation text,
  mediator_phone text,
  handed_on timestamptz,
  handed_by uuid references auth.users (id),
  notes text,
  updated_at timestamptz not null default now(),
  unique (issue_id, subscription_id),
  check (status <> 'mediator' or collected_by_name is not null)
);
create index distributions_issue_status_idx on public.distributions (issue_id, status);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid default auth.uid(),
  action text not null,
  table_name text not null,
  record_id text,
  details jsonb,
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so policies don't recurse)
-- ---------------------------------------------------------------------------
create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('main_head', 'balika_head', 'volunteer'), false)
$$;

create or replace function public.is_head()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('main_head', 'balika_head'), false)
$$;

-- Main Head: both sides. Balika Head: balika only. Volunteer: their assigned side.
create or replace function public.can_manage(cat public.member_category)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p.role
      when 'main_head' then true
      when 'balika_head' then cat = 'balika'
      when 'volunteer' then cat = p.category
      else false
    end
    from public.profiles p where p.id = auth.uid()
  ), false)
$$;

create or replace function public.owns_family(fid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.families f where f.id = fid and f.user_id = auth.uid())
$$;

create or replace function public.can_see_family(fid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select public.owns_family(fid)
    or (public.is_staff() and (
      exists (select 1 from public.members m where m.family_id = fid and public.can_manage(m.category))
      or not exists (select 1 from public.members m where m.family_id = fid)
    ))
$$;

create or replace function public.member_category_of(mid bigint)
returns public.member_category language sql stable security definer set search_path = public as $$
  select category from public.members where id = mid
$$;

create or replace function public.subscription_category_of(sid bigint)
returns public.member_category language sql stable security definer set search_path = public as $$
  select m.category from public.subscriptions s join public.members m on m.id = s.member_id where s.id = sid
$$;

create or replace function public.owns_subscription(sid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    join public.members m on m.id = s.member_id
    join public.families f on f.id = m.family_id
    where s.id = sid and f.user_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Create a profile for every new auth user (Google or phone/password).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_phone text := public.normalize_phone(new.raw_user_meta_data ->> 'phone');
begin
  if exists (select 1 from public.profiles where phone = v_phone) then
    v_phone := null;
  end if;
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    v_phone
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only the Main Head may change roles/sides; phone is always stored normalised.
create or replace function public.guard_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.phone := public.normalize_phone(new.phone);
  if (new.role is distinct from old.role or new.category is distinct from old.category)
     and coalesce(public.my_role() <> 'main_head', true)
     and auth.uid() is not null then
    raise exception 'Only the Main Head can change roles';
  end if;
  return new;
end $$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile();

create or replace function public.normalize_family_phone()
returns trigger language plpgsql as $$
begin
  new.phone := public.normalize_phone(new.phone);
  new.alt_phone := public.normalize_phone(new.alt_phone);
  if new.phone is null or length(new.phone) <> 10 then
    raise exception 'Phone number must have 10 digits';
  end if;
  return new;
end $$;

create trigger families_normalize
  before insert or update on public.families
  for each row execute function public.normalize_family_phone();

-- 1 year = 12 Gujarati / 6 English issues; 3 years = 36 / 18.
create or replace function public.set_total_issues()
returns trigger language plpgsql as $$
begin
  if new.total_issues is null then
    new.total_issues := new.plan_years * (case when new.language = 'gu' then 12 else 6 end);
  end if;
  return new;
end $$;

create trigger subscriptions_total
  before insert or update on public.subscriptions
  for each row execute function public.set_total_issues();

-- Pending distribution rows for every eligible active subscription of one side.
create or replace function public.generate_distributions(p_issue_id bigint, p_category public.member_category)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.distributions (issue_id, subscription_id)
  select i.id, s.id
  from public.issues i
  join public.subscriptions s
    on s.language = i.language
   and s.status = 'active'
   and i.seq_no between s.start_issue_seq and s.start_issue_seq + s.total_issues - 1
  join public.members m on m.id = s.member_id and m.category = p_category
  where i.id = p_issue_id
  on conflict (issue_id, subscription_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.on_stock_received()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.generate_distributions(new.issue_id, new.category);
  return new;
end $$;

create trigger stock_receipts_generate
  after insert on public.stock_receipts
  for each row execute function public.on_stock_received();

-- When a subscription becomes active after stock already arrived, add its pending rows.
create or replace function public.backfill_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    insert into public.distributions (issue_id, subscription_id)
    select i.id, new.id
    from public.issues i
    where i.language = new.language
      and i.seq_no between new.start_issue_seq and new.start_issue_seq + new.total_issues - 1
      and exists (
        select 1 from public.stock_receipts r
        where r.issue_id = i.id and r.category = public.member_category_of(new.member_id)
      )
    on conflict (issue_id, subscription_id) do nothing;
  end if;
  return new;
end $$;

create trigger subscriptions_backfill
  after insert or update on public.subscriptions
  for each row execute function public.backfill_subscription();

create or replace function public.touch_distribution()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.issue_id := old.issue_id;
  new.subscription_id := old.subscription_id;
  if new.status = 'pending' then
    new.handed_on := null;
    new.handed_by := null;
    new.collected_by_name := null;
    new.mediator_relation := null;
    new.mediator_phone := null;
  elsif new.status is distinct from old.status or new.handed_on is null then
    new.handed_on := coalesce(new.handed_on, now());
    new.handed_by := auth.uid();
  else
    new.handed_by := old.handed_by;
  end if;
  if new.status = 'self' then
    new.collected_by_name := null;
    new.mediator_relation := null;
    new.mediator_phone := null;
  end if;
  return new;
end $$;

create trigger distributions_touch
  before update on public.distributions
  for each row execute function public.touch_distribution();

-- Generic audit trail.
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (action, table_name, record_id, details)
  values (
    lower(tg_op),
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
    case when tg_op = 'DELETE' then to_jsonb(old)
         when tg_op = 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
         else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_members after insert or update or delete on public.members
  for each row execute function public.audit_row();
create trigger audit_subscriptions after insert or update or delete on public.subscriptions
  for each row execute function public.audit_row();
create trigger audit_distributions after update on public.distributions
  for each row execute function public.audit_row();
create trigger audit_stock after insert or update or delete on public.stock_receipts
  for each row execute function public.audit_row();
create trigger audit_profiles_role after update of role, category on public.profiles
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.next_issue_seq(p_language public.pub_language)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(seq_no), 0) + 1 from public.issues where language = p_language
$$;

-- Bulk-add areas from a list of names (CSV upload). Duplicates are skipped.
create or replace function public.import_areas(p_names text[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_head() then raise exception 'Not allowed'; end if;
  insert into public.areas (name)
  select distinct on (lower(trim(x))) trim(x) from unnest(p_names) x where trim(coalesce(x, '')) <> ''
  on conflict ((lower(name))) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Add members from CSV rows or the manual form. One row = one child.
-- Keys: parent_name, phone, alt_phone, email, address, area, child_name, category,
--       dob, language, plan_years, start_issue_seq, issues_remaining, receipt_no,
--       amount, payment_mode, notes.
-- Families are matched by phone, children by name within the family, so re-uploading
-- the same sheet doesn't create duplicates. Each row succeeds or fails on its own.
create or replace function public.import_members(p_rows jsonb, p_source public.record_source default 'import')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  idx int := 0;
  v_area_id bigint;
  v_family_id bigint;
  v_member_id bigint;
  v_category public.member_category;
  v_language public.pub_language;
  v_phone text;
  v_created_members int := 0;
  v_existing_members int := 0;
  v_created_subs int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not public.is_head() then raise exception 'Not allowed'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    begin
      v_phone := public.normalize_phone(r ->> 'phone');
      if coalesce(trim(r ->> 'parent_name'), '') = '' then raise exception 'parent_name is required'; end if;
      if coalesce(trim(r ->> 'child_name'), '') = '' then raise exception 'child_name is required'; end if;
      if v_phone is null or length(v_phone) <> 10 then raise exception 'phone must have 10 digits'; end if;

      v_category := lower(trim(r ->> 'category'))::public.member_category;
      if not public.can_manage(v_category) then
        raise exception 'You cannot add % records', v_category;
      end if;

      v_area_id := null;
      if coalesce(trim(r ->> 'area'), '') <> '' then
        insert into public.areas (name) values (trim(r ->> 'area'))
        on conflict ((lower(name))) do nothing;
        select id into v_area_id from public.areas where lower(name) = lower(trim(r ->> 'area'));
      end if;

      insert into public.families (parent_name, phone, alt_phone, email, address, area_id, source)
      values (trim(r ->> 'parent_name'), v_phone, r ->> 'alt_phone', nullif(trim(r ->> 'email'), ''),
              nullif(trim(r ->> 'address'), ''), v_area_id, p_source)
      on conflict (phone) do update set
        alt_phone = coalesce(public.families.alt_phone, excluded.alt_phone),
        email = coalesce(public.families.email, excluded.email),
        address = coalesce(public.families.address, excluded.address),
        area_id = coalesce(public.families.area_id, excluded.area_id)
      returning id into v_family_id;

      select id into v_member_id from public.members
      where family_id = v_family_id and lower(full_name) = lower(trim(r ->> 'child_name'));

      if v_member_id is null then
        insert into public.members (family_id, full_name, category, dob, notes, source)
        values (v_family_id, trim(r ->> 'child_name'), v_category,
                nullif(trim(r ->> 'dob'), '')::date, nullif(trim(r ->> 'notes'), ''), p_source)
        returning id into v_member_id;
        v_created_members := v_created_members + 1;
      else
        v_existing_members := v_existing_members + 1;
      end if;

      if coalesce(trim(r ->> 'language'), '') <> '' then
        v_language := case lower(trim(r ->> 'language'))
          when 'gujarati' then 'gu' when 'english' then 'en'
          else lower(trim(r ->> 'language')) end::public.pub_language;

        if not exists (
          select 1 from public.subscriptions
          where member_id = v_member_id and language = v_language and status in ('active', 'pending')
        ) then
          insert into public.subscriptions (
            member_id, language, plan_years, start_issue_seq, total_issues,
            amount, payment_mode, receipt_no, payment_status, status, source, approved_by, approved_at
          ) values (
            v_member_id, v_language,
            coalesce(nullif(trim(r ->> 'plan_years'), '')::int, 1),
            coalesce(nullif(trim(r ->> 'start_issue_seq'), '')::int, public.next_issue_seq(v_language)),
            nullif(trim(r ->> 'issues_remaining'), '')::int,
            nullif(trim(r ->> 'amount'), '')::numeric,
            nullif(lower(trim(r ->> 'payment_mode')), '')::public.payment_mode,
            nullif(trim(r ->> 'receipt_no'), ''),
            'verified', 'active', p_source, auth.uid(), now()
          );
          v_created_subs := v_created_subs + 1;
        end if;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', idx, 'message', sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'created_members', v_created_members,
    'existing_members', v_existing_members,
    'created_subscriptions', v_created_subs,
    'errors', v_errors
  );
end $$;

-- A parent links their login to a family using the family's phone + access code
-- (given by the head). Prevents someone viewing another family by guessing a phone.
create or replace function public.link_family(p_phone text, p_code text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_family_id bigint;
begin
  if auth.uid() is null then raise exception 'Please log in first'; end if;

  update public.families
     set user_id = auth.uid()
   where phone = public.normalize_phone(p_phone)
     and access_code = upper(trim(p_code))
     and (user_id is null or user_id = auth.uid())
  returning id into v_family_id;

  if v_family_id is null then raise exception 'Phone number and family code do not match'; end if;

  update public.profiles set phone = coalesce(phone, public.normalize_phone(p_phone))
   where id = auth.uid()
     and not exists (select 1 from public.profiles where phone = public.normalize_phone(p_phone) and id <> auth.uid());
  return v_family_id;
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.areas enable row level security;
alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.registration_windows enable row level security;
alter table public.issues enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stock_receipts enable row level security;
alter table public.distributions enable row level security;
alter table public.audit_log enable row level security;

-- Areas and registration windows are public (the registration form needs them).
create policy areas_read on public.areas for select using (true);
create policy areas_write on public.areas for all using (public.is_head()) with check (public.is_head());

create policy windows_read on public.registration_windows for select using (true);
create policy windows_write on public.registration_windows for all
  using (public.my_role() = 'main_head') with check (public.my_role() = 'main_head');

create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.is_head());
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_main on public.profiles for update
  using (public.my_role() = 'main_head') with check (public.my_role() = 'main_head');

create policy families_read on public.families for select using (public.can_see_family(id));
create policy families_insert on public.families for insert with check (public.is_head());
create policy families_update on public.families for update
  using (public.can_see_family(id) and (public.is_head() or public.owns_family(id)))
  with check (public.can_see_family(id));
create policy families_delete on public.families for delete using (public.my_role() = 'main_head');

create policy members_read on public.members for select
  using (public.can_manage(category) or public.owns_family(family_id));
create policy members_write on public.members for all
  using (public.is_head() and public.can_manage(category))
  with check (public.is_head() and public.can_manage(category));

create policy issues_read on public.issues for select using (auth.role() = 'authenticated');
create policy issues_write on public.issues for all using (public.is_head()) with check (public.is_head());

create policy subscriptions_read on public.subscriptions for select
  using (public.can_manage(public.member_category_of(member_id)) or public.owns_subscription(id));
create policy subscriptions_write on public.subscriptions for all
  using (public.is_head() and public.can_manage(public.member_category_of(member_id)))
  with check (public.is_head() and public.can_manage(public.member_category_of(member_id)));

create policy stock_read on public.stock_receipts for select
  using (public.is_staff() and public.can_manage(category));
create policy stock_write on public.stock_receipts for all
  using (public.is_head() and public.can_manage(category))
  with check (public.is_head() and public.can_manage(category));

create policy distributions_read on public.distributions for select
  using (public.can_manage(public.subscription_category_of(subscription_id))
         or public.owns_subscription(subscription_id));
create policy distributions_update on public.distributions for update
  using (public.is_staff() and public.can_manage(public.subscription_category_of(subscription_id)))
  with check (public.is_staff() and public.can_manage(public.subscription_category_of(subscription_id)));

create policy audit_read on public.audit_log for select using (public.my_role() = 'main_head');

-- ===== supabase/migrations/0002_friendly_import_errors.sql =====
-- Clearer per-row messages for CSV uploads (instead of raw "invalid input value for enum").
create or replace function public.import_members(p_rows jsonb, p_source public.record_source default 'import')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  idx int := 0;
  v_area_id bigint;
  v_family_id bigint;
  v_member_id bigint;
  v_category public.member_category;
  v_language public.pub_language;
  v_phone text;
  v_created_members int := 0;
  v_existing_members int := 0;
  v_created_subs int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not public.is_head() then raise exception 'Not allowed'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    begin
      v_phone := public.normalize_phone(r ->> 'phone');
      if coalesce(trim(r ->> 'parent_name'), '') = '' then raise exception 'parent_name is required'; end if;
      if coalesce(trim(r ->> 'child_name'), '') = '' then raise exception 'child_name is required'; end if;
      if v_phone is null or length(v_phone) <> 10 then raise exception 'phone must have 10 digits'; end if;
      if lower(trim(coalesce(r ->> 'category', ''))) not in ('balak', 'balika') then
        raise exception 'category must be balak or balika';
      end if;
      if lower(trim(coalesce(r ->> 'language', ''))) not in ('', 'gu', 'en', 'gujarati', 'english') then
        raise exception 'language must be Gujarati or English';
      end if;
      if coalesce(nullif(trim(r ->> 'plan_years'), ''), '1') not in ('1', '3') then
        raise exception 'plan_years must be 1 or 3';
      end if;
      if coalesce(nullif(lower(trim(r ->> 'payment_mode')), ''), 'cash') not in ('cash', 'upi', 'cheque', 'other') then
        raise exception 'payment_mode must be cash, upi, cheque or other';
      end if;

      v_category := lower(trim(r ->> 'category'))::public.member_category;
      if not public.can_manage(v_category) then
        raise exception 'You cannot add % records', v_category;
      end if;

      v_area_id := null;
      if coalesce(trim(r ->> 'area'), '') <> '' then
        insert into public.areas (name) values (trim(r ->> 'area'))
        on conflict ((lower(name))) do nothing;
        select id into v_area_id from public.areas where lower(name) = lower(trim(r ->> 'area'));
      end if;

      insert into public.families (parent_name, phone, alt_phone, email, address, area_id, source)
      values (trim(r ->> 'parent_name'), v_phone, r ->> 'alt_phone', nullif(trim(r ->> 'email'), ''),
              nullif(trim(r ->> 'address'), ''), v_area_id, p_source)
      on conflict (phone) do update set
        alt_phone = coalesce(public.families.alt_phone, excluded.alt_phone),
        email = coalesce(public.families.email, excluded.email),
        address = coalesce(public.families.address, excluded.address),
        area_id = coalesce(public.families.area_id, excluded.area_id)
      returning id into v_family_id;

      select id into v_member_id from public.members
      where family_id = v_family_id and lower(full_name) = lower(trim(r ->> 'child_name'));

      if v_member_id is null then
        insert into public.members (family_id, full_name, category, dob, notes, source)
        values (v_family_id, trim(r ->> 'child_name'), v_category,
                nullif(trim(r ->> 'dob'), '')::date, nullif(trim(r ->> 'notes'), ''), p_source)
        returning id into v_member_id;
        v_created_members := v_created_members + 1;
      else
        v_existing_members := v_existing_members + 1;
      end if;

      if coalesce(trim(r ->> 'language'), '') <> '' then
        v_language := case lower(trim(r ->> 'language'))
          when 'gujarati' then 'gu' when 'english' then 'en'
          else lower(trim(r ->> 'language')) end::public.pub_language;

        if not exists (
          select 1 from public.subscriptions
          where member_id = v_member_id and language = v_language and status in ('active', 'pending')
        ) then
          insert into public.subscriptions (
            member_id, language, plan_years, start_issue_seq, total_issues,
            amount, payment_mode, receipt_no, payment_status, status, source, approved_by, approved_at
          ) values (
            v_member_id, v_language,
            coalesce(nullif(trim(r ->> 'plan_years'), '')::int, 1),
            coalesce(nullif(trim(r ->> 'start_issue_seq'), '')::int, public.next_issue_seq(v_language)),
            nullif(trim(r ->> 'issues_remaining'), '')::int,
            nullif(trim(r ->> 'amount'), '')::numeric,
            nullif(lower(trim(r ->> 'payment_mode')), '')::public.payment_mode,
            nullif(trim(r ->> 'receipt_no'), ''),
            'verified', 'active', p_source, auth.uid(), now()
          );
          v_created_subs := v_created_subs + 1;
        end if;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', idx, 'message', sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'created_members', v_created_members,
    'existing_members', v_existing_members,
    'created_subscriptions', v_created_subs,
    'errors', v_errors
  );
end $$;

-- ===== supabase/migrations/0003_lock_down_functions.sql =====
-- Only expose the functions the app needs, and only to signed-in users.

alter function public.normalize_phone(text) set search_path = public;
alter function public.normalize_family_phone() set search_path = public;
alter function public.set_total_issues() set search_path = public;
alter function public.touch_distribution() set search_path = public;

revoke execute on all functions in schema public from public, anon, authenticated;

-- Helpers used inside RLS policies and triggers that run as the signed-in user.
grant execute on function
  public.normalize_phone(text),
  public.my_role(),
  public.is_staff(),
  public.is_head(),
  public.can_manage(public.member_category),
  public.owns_family(bigint),
  public.can_see_family(bigint),
  public.member_category_of(bigint),
  public.subscription_category_of(bigint),
  public.owns_subscription(bigint)
to authenticated;

-- RPCs called by the app (each checks the caller's role itself).
grant execute on function
  public.next_issue_seq(public.pub_language),
  public.import_areas(text[]),
  public.import_members(jsonb, public.record_source),
  public.link_family(text, text)
to authenticated;

-- New functions are not callable from the API until granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ===== supabase/migrations/0004_policies_for_signed_in.sql =====
-- Private-data policies apply only to signed-in users, so logged-out requests get
-- empty results instead of "permission denied" on the helper functions.
alter policy areas_write on public.areas to authenticated;
alter policy windows_write on public.registration_windows to authenticated;
alter policy profiles_read on public.profiles to authenticated;
alter policy profiles_update_self on public.profiles to authenticated;
alter policy profiles_update_main on public.profiles to authenticated;
alter policy families_read on public.families to authenticated;
alter policy families_insert on public.families to authenticated;
alter policy families_update on public.families to authenticated;
alter policy families_delete on public.families to authenticated;
alter policy members_read on public.members to authenticated;
alter policy members_write on public.members to authenticated;
alter policy issues_read on public.issues to authenticated;
alter policy issues_write on public.issues to authenticated;
alter policy subscriptions_read on public.subscriptions to authenticated;
alter policy subscriptions_write on public.subscriptions to authenticated;
alter policy stock_read on public.stock_receipts to authenticated;
alter policy stock_write on public.stock_receipts to authenticated;
alter policy distributions_read on public.distributions to authenticated;
alter policy distributions_update on public.distributions to authenticated;
alter policy audit_read on public.audit_log to authenticated;

-- ===== supabase/migrations/0005_person_records.sql =====
-- No family grouping: each person is registered with their own name and mobile number.
-- Whoever signs up with that mobile number sees that person's books.

drop function if exists public.link_family(text, text);
drop table if exists public.members cascade;   -- also drops the subscriptions -> members foreign key
drop table if exists public.families cascade;
drop function if exists public.can_see_family(bigint);
drop function if exists public.owns_family(bigint);
drop function if exists public.normalize_family_phone();

create table public.members (
  id bigint generated always as identity primary key,
  full_name text not null,
  phone text not null,
  category public.member_category not null,
  area_id bigint references public.areas (id),
  address text,
  dob date,
  notes text,
  source public.record_source not null default 'manual',
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index members_phone_name_key on public.members (phone, lower(full_name));
create index members_phone_idx on public.members (phone);
create index members_category_idx on public.members (category);

alter table public.subscriptions
  add constraint subscriptions_member_id_fkey
  foreign key (member_id) references public.members (id) on delete cascade;

create or replace function public.normalize_member_phone()
returns trigger language plpgsql set search_path = public as $$
begin
  new.phone := public.normalize_phone(new.phone);
  if new.phone is null or length(new.phone) <> 10 then
    raise exception 'Mobile number must have 10 digits';
  end if;
  return new;
end $$;

create trigger members_normalize
  before insert or update on public.members
  for each row execute function public.normalize_member_phone();

create trigger audit_members after insert or update or delete on public.members
  for each row execute function public.audit_row();

-- The signed-in user's mobile number. It comes from the phone + password login, never from
-- user-supplied data, so nobody can claim someone else's number.
create or replace function public.my_phone()
returns text language sql stable security definer set search_path = public as $$
  select phone from public.profiles where id = auth.uid()
$$;

create or replace function public.owns_subscription(sid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    join public.members m on m.id = s.member_id
    where s.id = sid and m.phone = public.my_phone()
  )
$$;

-- Phone comes only from the login id (<phone>@phone.balprakash.app), not from signup metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_phone text;
begin
  if new.email like '%@phone.balprakash.app' then
    v_phone := public.normalize_phone(split_part(new.email, '@', 1));
  end if;
  if v_phone is not null and exists (select 1 from public.profiles where phone = v_phone) then
    v_phone := null;
  end if;
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), v_phone)
  on conflict (id) do nothing;
  return new;
end $$;

-- Users can't change their own role, side or mobile number.
create or replace function public.guard_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.phone := public.normalize_phone(new.phone);
  if auth.uid() is not null and coalesce(public.my_role() <> 'main_head', true) then
    if new.role is distinct from old.role or new.category is distinct from old.category then
      raise exception 'Only the Main Head can change roles';
    end if;
    if new.phone is distinct from old.phone then
      raise exception 'Mobile number cannot be changed';
    end if;
  end if;
  return new;
end $$;

alter table public.members enable row level security;
create policy members_read on public.members for select to authenticated
  using (public.can_manage(category) or phone = public.my_phone());
create policy members_write on public.members for all to authenticated
  using (public.is_head() and public.can_manage(category))
  with check (public.is_head() and public.can_manage(category));

-- One row = one person. Keys: name, phone, category, area, address, dob, language,
-- plan_years, start_issue_seq, issues_remaining, receipt_no, amount, payment_mode, notes.
-- People are matched by mobile number + name, so re-uploading a sheet doesn't duplicate them.
create or replace function public.import_members(p_rows jsonb, p_source public.record_source default 'import')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  idx int := 0;
  v_area_id bigint;
  v_member_id bigint;
  v_category public.member_category;
  v_language public.pub_language;
  v_phone text;
  v_name text;
  v_created_members int := 0;
  v_existing_members int := 0;
  v_created_subs int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not public.is_head() then raise exception 'Not allowed'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    begin
      v_name := trim(coalesce(r ->> 'name', ''));
      v_phone := public.normalize_phone(r ->> 'phone');
      if v_name = '' then raise exception 'name is required'; end if;
      if v_phone is null or length(v_phone) <> 10 then raise exception 'phone must have 10 digits'; end if;
      if lower(trim(coalesce(r ->> 'category', ''))) not in ('balak', 'balika') then
        raise exception 'category must be balak or balika';
      end if;
      if lower(trim(coalesce(r ->> 'language', ''))) not in ('', 'gu', 'en', 'gujarati', 'english') then
        raise exception 'language must be Gujarati or English';
      end if;
      if coalesce(nullif(trim(r ->> 'plan_years'), ''), '1') not in ('1', '3') then
        raise exception 'plan_years must be 1 or 3';
      end if;
      if coalesce(nullif(lower(trim(r ->> 'payment_mode')), ''), 'cash') not in ('cash', 'upi', 'cheque', 'other') then
        raise exception 'payment_mode must be cash, upi, cheque or other';
      end if;

      v_category := lower(trim(r ->> 'category'))::public.member_category;
      if not public.can_manage(v_category) then
        raise exception 'You cannot add % records', v_category;
      end if;

      v_area_id := null;
      if coalesce(trim(r ->> 'area'), '') <> '' then
        insert into public.areas (name) values (trim(r ->> 'area'))
        on conflict ((lower(name))) do nothing;
        select id into v_area_id from public.areas where lower(name) = lower(trim(r ->> 'area'));
      end if;

      select id into v_member_id from public.members
      where phone = v_phone and lower(full_name) = lower(v_name);

      if v_member_id is null then
        insert into public.members (full_name, phone, category, area_id, address, dob, notes, source)
        values (v_name, v_phone, v_category, v_area_id, nullif(trim(r ->> 'address'), ''),
                nullif(trim(r ->> 'dob'), '')::date, nullif(trim(r ->> 'notes'), ''), p_source)
        returning id into v_member_id;
        v_created_members := v_created_members + 1;
      else
        v_existing_members := v_existing_members + 1;
      end if;

      if coalesce(trim(r ->> 'language'), '') <> '' then
        v_language := case lower(trim(r ->> 'language'))
          when 'gujarati' then 'gu' when 'english' then 'en'
          else lower(trim(r ->> 'language')) end::public.pub_language;

        if not exists (
          select 1 from public.subscriptions
          where member_id = v_member_id and language = v_language and status in ('active', 'pending')
        ) then
          insert into public.subscriptions (
            member_id, language, plan_years, start_issue_seq, total_issues,
            amount, payment_mode, receipt_no, payment_status, status, source, approved_by, approved_at
          ) values (
            v_member_id, v_language,
            coalesce(nullif(trim(r ->> 'plan_years'), '')::int, 1),
            coalesce(nullif(trim(r ->> 'start_issue_seq'), '')::int, public.next_issue_seq(v_language)),
            nullif(trim(r ->> 'issues_remaining'), '')::int,
            nullif(trim(r ->> 'amount'), '')::numeric,
            nullif(lower(trim(r ->> 'payment_mode')), '')::public.payment_mode,
            nullif(trim(r ->> 'receipt_no'), ''),
            'verified', 'active', p_source, auth.uid(), now()
          );
          v_created_subs := v_created_subs + 1;
        end if;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', idx, 'message', sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'created_members', v_created_members,
    'existing_members', v_existing_members,
    'created_subscriptions', v_created_subs,
    'errors', v_errors
  );
end $$;

grant execute on function public.my_phone() to authenticated;

-- ===== supabase/migrations/0006_advisor_fixes.sql =====
-- Fixes from the Supabase security and performance advisors.

-- my_phone() is only for signed-in users.
revoke execute on function public.my_phone() from public, anon;
grant execute on function public.my_phone() to authenticated;
revoke execute on function public.normalize_member_phone() from public, anon, authenticated;

-- Indexes for foreign keys the app filters and joins on.
create index if not exists distributions_subscription_idx on public.distributions (subscription_id);
create index if not exists members_area_idx on public.members (area_id);
create index if not exists stock_receipts_issue_idx on public.stock_receipts (issue_id);

-- Evaluate auth.* once per query instead of once per row.
alter policy profiles_read on public.profiles using (id = (select auth.uid()) or public.is_head());
alter policy profiles_update_self on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy issues_read on public.issues using (true);

-- Split "for all" write policies so SELECT is covered by a single policy per table.
drop policy areas_write on public.areas;
create policy areas_insert on public.areas for insert to authenticated with check (public.is_head());
create policy areas_update on public.areas for update to authenticated using (public.is_head()) with check (public.is_head());
create policy areas_delete on public.areas for delete to authenticated using (public.is_head());

drop policy windows_write on public.registration_windows;
create policy windows_insert on public.registration_windows for insert to authenticated
  with check (public.my_role() = 'main_head');
create policy windows_update on public.registration_windows for update to authenticated
  using (public.my_role() = 'main_head') with check (public.my_role() = 'main_head');
create policy windows_delete on public.registration_windows for delete to authenticated
  using (public.my_role() = 'main_head');

drop policy issues_write on public.issues;
create policy issues_insert on public.issues for insert to authenticated with check (public.is_head());
create policy issues_update on public.issues for update to authenticated using (public.is_head()) with check (public.is_head());
create policy issues_delete on public.issues for delete to authenticated using (public.is_head());

drop policy members_write on public.members;
create policy members_insert on public.members for insert to authenticated
  with check (public.is_head() and public.can_manage(category));
create policy members_update on public.members for update to authenticated
  using (public.is_head() and public.can_manage(category))
  with check (public.is_head() and public.can_manage(category));
create policy members_delete on public.members for delete to authenticated
  using (public.is_head() and public.can_manage(category));

drop policy subscriptions_write on public.subscriptions;
create policy subscriptions_insert on public.subscriptions for insert to authenticated
  with check (public.is_head() and public.can_manage(public.member_category_of(member_id)));
create policy subscriptions_update on public.subscriptions for update to authenticated
  using (public.is_head() and public.can_manage(public.member_category_of(member_id)))
  with check (public.is_head() and public.can_manage(public.member_category_of(member_id)));
create policy subscriptions_delete on public.subscriptions for delete to authenticated
  using (public.is_head() and public.can_manage(public.member_category_of(member_id)));

drop policy stock_write on public.stock_receipts;
create policy stock_insert on public.stock_receipts for insert to authenticated
  with check (public.is_head() and public.can_manage(category));
create policy stock_update on public.stock_receipts for update to authenticated
  using (public.is_head() and public.can_manage(category))
  with check (public.is_head() and public.can_manage(category));
create policy stock_delete on public.stock_receipts for delete to authenticated
  using (public.is_head() and public.can_manage(category));

-- One update policy on profiles: yourself, or anyone if you're the Main Head.
drop policy profiles_update_main on public.profiles;
alter policy profiles_update_self on public.profiles
  using (id = (select auth.uid()) or public.my_role() = 'main_head')
  with check (id = (select auth.uid()) or public.my_role() = 'main_head');

-- ===== supabase/migrations/0007_online_registration.sql =====
-- Phase 2: public registration form (while a window is open) and head approval queue.

alter table public.registration_windows add column if not exists instructions text;
alter table public.subscriptions add column if not exists review_note text;
create index if not exists subscriptions_status_idx on public.subscriptions (status);

-- Called by the public form, signed in or not. Creates (or reuses) the person and a
-- pending subscription that waits for a head to verify the payment.
create or replace function public.submit_registration(
  p_name text,
  p_phone text,
  p_category text,
  p_language text,
  p_plan_years int,
  p_area_id bigint default null,
  p_address text default null,
  p_dob date default null,
  p_payment_mode text default null,
  p_receipt_no text default null,
  p_amount numeric default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_window_id bigint;
  v_phone text := public.normalize_phone(p_phone);
  v_name text := trim(coalesce(p_name, ''));
  v_member_id bigint;
  v_language public.pub_language;
  v_sub_id bigint;
begin
  select id into v_window_id from public.registration_windows
  where now() between opens_at and closes_at
  order by opens_at desc limit 1;
  if v_window_id is null then raise exception 'Registration is closed right now'; end if;

  if v_name = '' or length(v_name) > 100 then raise exception 'Please enter a valid name'; end if;
  if v_phone is null or length(v_phone) <> 10 then raise exception 'Mobile number must have 10 digits'; end if;
  if coalesce(p_category, '') not in ('balak', 'balika') then raise exception 'Please choose Balak or Balika'; end if;
  if coalesce(p_language, '') not in ('gu', 'en') then raise exception 'Please choose Gujarati or English'; end if;
  if coalesce(p_plan_years, 0) not in (1, 3) then raise exception 'Please choose a 1 year or 3 year plan'; end if;
  if p_payment_mode is not null and p_payment_mode not in ('cash', 'upi', 'cheque', 'other') then
    raise exception 'Please choose a valid payment mode';
  end if;
  if p_amount is not null and (p_amount < 0 or p_amount > 100000) then raise exception 'Please enter a valid amount'; end if;
  if length(coalesce(p_address, '')) > 300 or length(coalesce(p_receipt_no, '')) > 60 then
    raise exception 'Address or receipt number is too long';
  end if;
  if p_area_id is not null and not exists (select 1 from public.areas where id = p_area_id and is_active) then
    raise exception 'Please choose a valid area';
  end if;

  -- Basic spam guard: at most 6 registrations waiting for approval per mobile number.
  if (select count(*) from public.subscriptions s join public.members m on m.id = s.member_id
      where m.phone = v_phone and s.status = 'pending') >= 6 then
    raise exception 'Too many registrations are waiting for approval for this mobile number';
  end if;

  v_language := p_language::public.pub_language;

  select id into v_member_id from public.members
  where phone = v_phone and lower(full_name) = lower(v_name);

  if v_member_id is null then
    insert into public.members (full_name, phone, category, area_id, address, dob, source)
    values (v_name, v_phone, p_category::public.member_category, p_area_id, nullif(trim(p_address), ''), p_dob, 'online')
    returning id into v_member_id;
  end if;

  if exists (
    select 1 from public.subscriptions
    where member_id = v_member_id and language = v_language and status in ('pending', 'active')
  ) then
    raise exception '% is already registered for % Bal Prakash', v_name,
      case v_language when 'gu' then 'Gujarati' else 'English' end;
  end if;

  insert into public.subscriptions (
    member_id, language, plan_years, start_issue_seq, amount, payment_mode, receipt_no,
    payment_status, status, source, registration_window_id
  ) values (
    v_member_id, v_language, p_plan_years, public.next_issue_seq(v_language), p_amount,
    p_payment_mode::public.payment_mode, nullif(trim(p_receipt_no), ''),
    'pending', 'pending', 'online', v_window_id
  )
  returning id into v_sub_id;

  return jsonb_build_object('subscription_id', v_sub_id, 'name', v_name, 'phone', v_phone);
end $$;

-- Head approves after checking payment. Subscription starts at the next issue unless a
-- start issue is given; pending distribution rows are added by the backfill trigger.
create or replace function public.approve_subscription(
  p_subscription_id bigint,
  p_start_issue_seq int default null,
  p_receipt_no text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_category public.member_category;
  v_language public.pub_language;
  v_status public.subscription_status;
begin
  select m.category, s.language, s.status into v_category, v_language, v_status
  from public.subscriptions s join public.members m on m.id = s.member_id
  where s.id = p_subscription_id;

  if v_category is null then raise exception 'Registration not found'; end if;
  if not (public.is_head() and public.can_manage(v_category)) then raise exception 'Not allowed'; end if;
  if v_status <> 'pending' then raise exception 'This registration has already been reviewed'; end if;
  if p_start_issue_seq is not null and p_start_issue_seq < 1 then raise exception 'Start issue must be 1 or more'; end if;

  update public.subscriptions set
    status = 'active',
    payment_status = 'verified',
    start_issue_seq = coalesce(p_start_issue_seq, public.next_issue_seq(v_language)),
    receipt_no = coalesce(nullif(trim(p_receipt_no), ''), receipt_no),
    approved_by = auth.uid(),
    approved_at = now()
  where id = p_subscription_id;
end $$;

create or replace function public.reject_subscription(p_subscription_id bigint, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_category public.member_category;
  v_status public.subscription_status;
begin
  select m.category, s.status into v_category, v_status
  from public.subscriptions s join public.members m on m.id = s.member_id
  where s.id = p_subscription_id;

  if v_category is null then raise exception 'Registration not found'; end if;
  if not (public.is_head() and public.can_manage(v_category)) then raise exception 'Not allowed'; end if;
  if v_status <> 'pending' then raise exception 'This registration has already been reviewed'; end if;

  update public.subscriptions set
    status = 'cancelled',
    payment_status = 'rejected',
    review_note = nullif(trim(p_reason), ''),
    approved_by = auth.uid(),
    approved_at = now()
  where id = p_subscription_id;
end $$;

revoke execute on function public.submit_registration(text, text, text, text, int, bigint, text, date, text, text, numeric) from public;
grant execute on function public.submit_registration(text, text, text, text, int, bigint, text, date, text, text, numeric) to anon, authenticated;
revoke execute on function public.approve_subscription(bigint, int, text) from public, anon;
grant execute on function public.approve_subscription(bigint, int, text) to authenticated;
revoke execute on function public.reject_subscription(bigint, text) from public, anon;
grant execute on function public.reject_subscription(bigint, text) to authenticated;

-- ===== supabase/migrations/0008_simplified_workflow.sql =====
-- Simplified workflow
--   * Three roles only: Main Head, Balika Head, Volunteer (no subscriber / family login).
--   * Only the Main Head registers members; every member gets a permanent ID (BP-B-0001 / BP-G-0001).
--   * Registration happens per year; the Main Head starts each new year by hand.
--   * Books: Pending -> Given (directly by a head) or Given to Volunteer -> Delivered (by the volunteer).
--   * Every status change is kept in distribution_events.
-- Safe to run whether or not the earlier draft of 0008 (QR cards, help requests) was applied.

-- ---------------------------------------------------------------------------
-- 0. Remove features that are no longer part of the workflow
-- ---------------------------------------------------------------------------
drop table if exists public.help_requests cascade;
drop function if exists public.touch_help_request();
drop function if exists public.owns_member(bigint);
drop function if exists public.renewal_start_seq(bigint, public.pub_language);
drop index if exists public.members_card_code_key;
alter table public.members drop column if exists card_code;

-- Public self-registration and the approval queue: only the Main Head registers now.
drop function if exists public.submit_registration(text, text, text, text, int, bigint, text, date, text, text, numeric);
drop function if exists public.approve_subscription(bigint, int, text);
drop function if exists public.reject_subscription(bigint, text);

-- ---------------------------------------------------------------------------
-- 1. Role helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_main_head()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'main_head', false)
$$;

-- Head-level access to one side. Main Head: both. Balika Head: balika. Volunteers: none
-- (they only see the books handed to them, see volunteer_* helpers below).
create or replace function public.can_manage(cat public.member_category)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p.role when 'main_head' then true when 'balika_head' then cat = 'balika' else false end
    from public.profiles p where p.id = auth.uid()
  ), false)
$$;

-- ---------------------------------------------------------------------------
-- 2. Team: volunteers and the Balika Head, added by the Main Head
-- ---------------------------------------------------------------------------
-- The Main Head adds a person by name + mobile. When that person signs up (phone + password,
-- or Google with the email given here) the login is linked and the role applied automatically.
create table if not exists public.team_members (
  id bigint generated always as identity primary key,
  full_name text not null check (length(trim(full_name)) between 1 and 100),
  phone text not null,
  email text,
  role public.app_role not null default 'volunteer' check (role in ('volunteer', 'balika_head')),
  category public.member_category,          -- side a volunteer serves; null = both
  area_id bigint references public.areas (id),
  user_id uuid unique references auth.users (id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists team_members_phone_key on public.team_members (phone);
create index if not exists team_members_area_idx on public.team_members (area_id);

create or replace function public.prepare_team_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.full_name := trim(new.full_name);
  new.phone := public.normalize_phone(new.phone);
  if new.phone is null or length(new.phone) <> 10 then
    raise exception 'Mobile number must have 10 digits';
  end if;
  new.email := nullif(lower(trim(coalesce(new.email, ''))), '');
  if new.role = 'balika_head' then new.category := 'balika'; end if;

  -- Link to an existing login with the same mobile (phone login) or email (Google login).
  if (tg_op = 'INSERT' and new.user_id is null)
     or (tg_op = 'UPDATE' and (new.phone is distinct from old.phone or new.email is distinct from old.email)) then
    new.user_id := (
      select p.id from public.profiles p
      join auth.users u on u.id = p.id
      where (p.phone = new.phone or (new.email is not null and lower(u.email) = new.email))
        and p.role <> 'main_head'
        and not exists (select 1 from public.team_members t where t.user_id = p.id and t.id is distinct from new.id)
      order by p.created_at
      limit 1
    );
  end if;
  return new;
end $$;

drop trigger if exists team_members_prepare on public.team_members;
create trigger team_members_prepare
  before insert or update on public.team_members
  for each row execute function public.prepare_team_member();

-- Keep profiles.role in step with the team list.
create or replace function public.sync_team_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.user_id is not null then
    update public.profiles set role = 'subscriber', category = null, area_id = null
     where id = old.user_id and role <> 'main_head';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.user_id is not null and new.is_active then
    update public.profiles
       set role = new.role, category = new.category, area_id = new.area_id,
           full_name = coalesce(nullif(trim(full_name), ''), new.full_name)
     where id = new.user_id and role <> 'main_head';
  end if;
  return null;
end $$;

drop trigger if exists team_members_sync on public.team_members;
create trigger team_members_sync
  after insert or update or delete on public.team_members
  for each row execute function public.sync_team_role();

drop trigger if exists audit_team_members on public.team_members;
create trigger audit_team_members after insert or update or delete on public.team_members
  for each row execute function public.audit_row();

-- Bring volunteers / Balika Heads set up earlier on the old "Team & roles" page into the list.
insert into public.team_members (full_name, phone, role, category, area_id, user_id)
select coalesce(nullif(trim(p.full_name), ''), p.phone), p.phone, p.role, p.category, p.area_id, p.id
from public.profiles p
where p.role in ('volunteer', 'balika_head') and p.phone is not null
on conflict do nothing;

-- New sign-ups: create the profile, then link to the team list if the Main Head added them.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_phone text;
begin
  if new.email like '%@phone.balprakash.app' then
    v_phone := public.normalize_phone(split_part(new.email, '@', 1));
  end if;
  if v_phone is not null and exists (select 1 from public.profiles where phone = v_phone) then
    v_phone := null;
  end if;
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), v_phone)
  on conflict (id) do nothing;

  update public.team_members set user_id = new.id
   where id = (
     select t.id from public.team_members t
     where t.user_id is null
       and ((v_phone is not null and t.phone = v_phone) or (t.email is not null and t.email = lower(new.email)))
     order by t.id limit 1
   );
  return new;
end $$;

-- The signed-in volunteer's team id (null for everyone else).
create or replace function public.my_team_id()
returns bigint language sql stable security definer set search_path = public as $$
  select id from public.team_members where user_id = auth.uid() and is_active and role = 'volunteer'
$$;

alter table public.team_members enable row level security;
drop policy if exists team_read on public.team_members;
create policy team_read on public.team_members for select to authenticated
  using (
    public.is_main_head()
    or user_id = (select auth.uid())
    or (public.my_role() = 'balika_head' and role = 'volunteer' and is_active and (category is null or category = 'balika'))
  );
drop policy if exists team_insert on public.team_members;
create policy team_insert on public.team_members for insert to authenticated with check (public.is_main_head());
drop policy if exists team_update on public.team_members;
create policy team_update on public.team_members for update to authenticated
  using (public.is_main_head()) with check (public.is_main_head());
drop policy if exists team_delete on public.team_members;
create policy team_delete on public.team_members for delete to authenticated using (public.is_main_head());

-- ---------------------------------------------------------------------------
-- 3. Permanent member IDs: BP-B-0001 (Balak), BP-G-0001 (Balika)
-- ---------------------------------------------------------------------------
-- Sequences never hand out the same number twice, so IDs are not reused even after a delete.
create sequence if not exists public.member_code_balak_seq;
create sequence if not exists public.member_code_balika_seq;
alter table public.members add column if not exists member_code text;

create or replace function public.format_member_code(p_category public.member_category, n bigint)
returns text language sql immutable set search_path = public as $$
  select case p_category when 'balak' then 'BP-B-' else 'BP-G-' end
         || case when n < 10000 then lpad(n::text, 4, '0') else n::text end
$$;

-- Existing members get IDs in the order they were added.
do $$
declare
  v_balak bigint;
  v_balika bigint;
begin
  with ordered as (
    select id, category, row_number() over (partition by category order by created_at, id) as rn
    from public.members where member_code is null
  )
  update public.members m set member_code = public.format_member_code(o.category, o.rn)
  from ordered o where o.id = m.id;

  select count(*) into v_balak from public.members where category = 'balak';
  select count(*) into v_balika from public.members where category = 'balika';
  if v_balak > 0 then perform setval('public.member_code_balak_seq', v_balak, true); end if;
  if v_balika > 0 then perform setval('public.member_code_balika_seq', v_balika, true); end if;
end $$;

alter table public.members alter column member_code set not null;
create unique index if not exists members_member_code_key on public.members (member_code);

create or replace function public.assign_member_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.member_code := public.format_member_code(
      new.category,
      case new.category when 'balak' then nextval('public.member_code_balak_seq')
                        else nextval('public.member_code_balika_seq') end);
  else
    new.member_code := old.member_code;
    if new.category is distinct from old.category then
      raise exception 'Category cannot be changed: the Member ID % depends on it', old.member_code;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists members_code on public.members;
create trigger members_code
  before insert or update on public.members
  for each row execute function public.assign_member_code();

-- ---------------------------------------------------------------------------
-- 4. Registration years
-- ---------------------------------------------------------------------------
create table if not exists public.registration_cycles (
  id bigint generated always as identity primary key,
  year int not null unique check (year between 2000 and 2100),
  title text,
  is_current boolean not null default false,
  started_at timestamptz not null default now(),
  started_by uuid references auth.users (id) default auth.uid(),
  closed_at timestamptz
);
create unique index if not exists registration_cycles_one_current on public.registration_cycles (is_current) where is_current;

alter table public.subscriptions add column if not exists cycle_id bigint references public.registration_cycles (id);
create index if not exists subscriptions_cycle_idx on public.subscriptions (cycle_id);

-- Existing registrations are filed under the year they were made; the latest year is current.
insert into public.registration_cycles (year, title)
select distinct extract(year from (s.created_at at time zone 'Asia/Kolkata'))::int, null
from public.subscriptions s
on conflict (year) do nothing;
insert into public.registration_cycles (year)
select extract(year from (now() at time zone 'Asia/Kolkata'))::int
where not exists (select 1 from public.registration_cycles);
update public.registration_cycles set is_current = true
where id = (select id from public.registration_cycles order by year desc limit 1)
  and not exists (select 1 from public.registration_cycles where is_current);
update public.subscriptions s set cycle_id = c.id
from public.registration_cycles c
where s.cycle_id is null and c.year = extract(year from (s.created_at at time zone 'Asia/Kolkata'))::int;

alter table public.registration_cycles enable row level security;
drop policy if exists cycles_read on public.registration_cycles;
create policy cycles_read on public.registration_cycles for select to authenticated using (true);
-- Changes go through start_registration_year() only.

create or replace function public.start_registration_year(p_year int, p_title text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not public.is_main_head() then raise exception 'Only the Main Head can start a registration year'; end if;
  if p_year is null or p_year not between 2000 and 2100 then raise exception 'Please enter a valid year'; end if;
  if exists (select 1 from public.registration_cycles where year = p_year) then
    raise exception 'Registration year % already exists', p_year;
  end if;
  if p_year < (select coalesce(max(year), 0) from public.registration_cycles) then
    raise exception 'The new year must be later than the current one';
  end if;
  update public.registration_cycles set is_current = false, closed_at = now() where is_current;
  insert into public.registration_cycles (year, title, is_current)
  values (p_year, nullif(trim(coalesce(p_title, '')), ''), true)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Registering members (Main Head only)
-- ---------------------------------------------------------------------------
-- Adds a year's registration (Gujarati or English, 1 or 3 years) for an existing member.
-- Books start from the latest issue, or right after the member's current plan ends.
create or replace function public.add_registration(
  p_member_id bigint,
  p_language text default 'gu',
  p_plan_years int default 1,
  p_receipt_no text default null,
  p_amount numeric default null,
  p_payment_mode text default null,
  p_issues_remaining int default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cycle public.registration_cycles;
  v_member public.members;
  v_language public.pub_language;
  v_start int;
  v_sub_id bigint;
begin
  if not public.is_main_head() then raise exception 'Only the Main Head can register members'; end if;
  select * into v_cycle from public.registration_cycles where is_current;
  if v_cycle.id is null then
    raise exception 'No registration year is open. Start one on the Annual Registration page.';
  end if;
  select * into v_member from public.members where id = p_member_id;
  if v_member.id is null then raise exception 'Member not found'; end if;
  if coalesce(p_language, '') not in ('gu', 'en') then raise exception 'Please choose Gujarati or English'; end if;
  if coalesce(p_plan_years, 0) not in (1, 3) then raise exception 'Please choose a 1 year or 3 year plan'; end if;
  if p_payment_mode is not null and p_payment_mode not in ('cash', 'upi', 'cheque', 'other') then
    raise exception 'Please choose a valid payment mode';
  end if;
  if p_amount is not null and (p_amount < 0 or p_amount > 100000) then raise exception 'Please enter a valid amount'; end if;
  if p_issues_remaining is not null and p_issues_remaining not between 1 and 60 then
    raise exception 'Books remaining must be between 1 and 60';
  end if;
  v_language := p_language::public.pub_language;

  if exists (
    select 1 from public.subscriptions
    where member_id = p_member_id and cycle_id = v_cycle.id and language = v_language and status in ('active', 'pending')
  ) then
    raise exception '% (%) is already registered for % (%)', v_member.full_name, v_member.member_code, v_cycle.year,
      case v_language when 'gu' then 'Gujarati' else 'English' end;
  end if;

  v_start := greatest(
    coalesce((select max(seq_no) from public.issues where language = v_language), 1),
    coalesce((
      select max(start_issue_seq + total_issues) from public.subscriptions
      where member_id = p_member_id and language = v_language and status = 'active'
    ), 0)
  );

  insert into public.subscriptions (
    member_id, language, plan_years, start_issue_seq, total_issues, amount, payment_mode, receipt_no,
    payment_status, status, source, cycle_id, approved_by, approved_at
  ) values (
    p_member_id, v_language, p_plan_years, v_start, p_issues_remaining, p_amount,
    p_payment_mode::public.payment_mode, nullif(trim(coalesce(p_receipt_no, '')), ''),
    'verified', 'active', 'manual', v_cycle.id, auth.uid(), now()
  )
  returning id into v_sub_id;

  return jsonb_build_object('subscription_id', v_sub_id, 'registration_year', v_cycle.year);
end $$;

create or replace function public.register_member(
  p_name text,
  p_phone text,
  p_category text,
  p_area_id bigint default null,
  p_language text default 'gu',
  p_plan_years int default 1,
  p_address text default null,
  p_dob date default null,
  p_notes text default null,
  p_receipt_no text default null,
  p_amount numeric default null,
  p_payment_mode text default null,
  p_issues_remaining int default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := public.normalize_phone(p_phone);
  v_existing text;
  v_member public.members;
  v_reg jsonb;
begin
  if not public.is_main_head() then raise exception 'Only the Main Head can register members'; end if;
  if v_name = '' or length(v_name) > 100 then raise exception 'Please enter a valid name'; end if;
  if v_phone is null or length(v_phone) <> 10 then raise exception 'Mobile number must have 10 digits'; end if;
  if coalesce(p_category, '') not in ('balak', 'balika') then raise exception 'Please choose Balak or Balika'; end if;
  if p_area_id is not null and not exists (select 1 from public.areas where id = p_area_id) then
    raise exception 'Please choose a mandal from the list';
  end if;
  if length(coalesce(p_address, '')) > 300 or length(coalesce(p_notes, '')) > 500 then
    raise exception 'Address or notes are too long';
  end if;

  -- Several children may share a mobile number, but the same name twice on one number is a mistake.
  select member_code into v_existing from public.members where phone = v_phone and lower(full_name) = lower(v_name);
  if v_existing is not null then
    raise exception '% is already registered with this mobile number (Member ID %)', v_name, v_existing;
  end if;

  insert into public.members (full_name, phone, category, area_id, address, dob, notes, source)
  values (v_name, v_phone, p_category::public.member_category, p_area_id,
          nullif(trim(coalesce(p_address, '')), ''), p_dob, nullif(trim(coalesce(p_notes, '')), ''), 'manual')
  returning * into v_member;

  v_reg := public.add_registration(v_member.id, p_language, p_plan_years, p_receipt_no, p_amount, p_payment_mode, p_issues_remaining);

  return jsonb_build_object('member_id', v_member.id, 'member_code', v_member.member_code, 'full_name', v_member.full_name) || v_reg;
end $$;

-- CSV import (Main Head only). One row = one child; matched by mobile + name so re-uploading
-- a sheet doesn't duplicate anyone. Registrations are filed under the current year.
-- Keys: name, phone, category, mandal (or area), address, dob, language, plan_years,
--       issues_remaining, receipt_no, amount, payment_mode, notes.
create or replace function public.import_members(p_rows jsonb, p_source public.record_source default 'import')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  idx int := 0;
  v_area_id bigint;
  v_area text;
  v_member_id bigint;
  v_language public.pub_language;
  v_phone text;
  v_name text;
  v_cycle_id bigint;
  v_created_members int := 0;
  v_existing_members int := 0;
  v_created_subs int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not public.is_main_head() then raise exception 'Only the Main Head can import members'; end if;
  select id into v_cycle_id from public.registration_cycles where is_current;

  for r in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    begin
      v_name := trim(coalesce(r ->> 'name', ''));
      v_phone := public.normalize_phone(r ->> 'phone');
      v_area := trim(coalesce(nullif(r ->> 'mandal', ''), r ->> 'area', ''));
      if v_name = '' then raise exception 'name is required'; end if;
      if v_phone is null or length(v_phone) <> 10 then raise exception 'phone must have 10 digits'; end if;
      if lower(trim(coalesce(r ->> 'category', ''))) not in ('balak', 'balika') then
        raise exception 'category must be balak or balika';
      end if;
      if lower(trim(coalesce(r ->> 'language', ''))) not in ('', 'gu', 'en', 'gujarati', 'english') then
        raise exception 'language must be Gujarati or English';
      end if;
      if coalesce(nullif(trim(r ->> 'plan_years'), ''), '1') not in ('1', '3') then
        raise exception 'plan_years must be 1 or 3';
      end if;
      if coalesce(nullif(lower(trim(r ->> 'payment_mode')), ''), 'cash') not in ('cash', 'upi', 'cheque', 'other') then
        raise exception 'payment_mode must be cash, upi, cheque or other';
      end if;

      v_area_id := null;
      if v_area <> '' then
        insert into public.areas (name) values (v_area) on conflict ((lower(name))) do nothing;
        select id into v_area_id from public.areas where lower(name) = lower(v_area);
      end if;

      select id into v_member_id from public.members where phone = v_phone and lower(full_name) = lower(v_name);
      if v_member_id is null then
        insert into public.members (full_name, phone, category, area_id, address, dob, notes, source)
        values (v_name, v_phone, lower(trim(r ->> 'category'))::public.member_category, v_area_id,
                nullif(trim(r ->> 'address'), ''), nullif(trim(r ->> 'dob'), '')::date,
                nullif(trim(r ->> 'notes'), ''), p_source)
        returning id into v_member_id;
        v_created_members := v_created_members + 1;
      else
        v_existing_members := v_existing_members + 1;
      end if;

      if coalesce(trim(r ->> 'language'), '') <> '' then
        if v_cycle_id is null then
          raise exception 'start a registration year first (Annual Registration page)';
        end if;
        v_language := case lower(trim(r ->> 'language'))
          when 'gujarati' then 'gu' when 'english' then 'en'
          else lower(trim(r ->> 'language')) end::public.pub_language;

        if not exists (
          select 1 from public.subscriptions
          where member_id = v_member_id and language = v_language and status in ('active', 'pending')
        ) then
          insert into public.subscriptions (
            member_id, language, plan_years, start_issue_seq, total_issues, amount, payment_mode, receipt_no,
            payment_status, status, source, cycle_id, approved_by, approved_at
          ) values (
            v_member_id, v_language,
            coalesce(nullif(trim(r ->> 'plan_years'), '')::int, 1),
            coalesce(nullif(trim(r ->> 'start_issue_seq'), '')::int,
                     (select coalesce(max(seq_no), 1) from public.issues where language = v_language)),
            nullif(trim(r ->> 'issues_remaining'), '')::int,
            nullif(trim(r ->> 'amount'), '')::numeric,
            nullif(lower(trim(r ->> 'payment_mode')), '')::public.payment_mode,
            nullif(trim(r ->> 'receipt_no'), ''),
            'verified', 'active', p_source, v_cycle_id, auth.uid(), now()
          );
          v_created_subs := v_created_subs + 1;
        end if;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', idx, 'message', sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'created_members', v_created_members,
    'existing_members', v_existing_members,
    'created_subscriptions', v_created_subs,
    'errors', v_errors
  );
end $$;

-- ---------------------------------------------------------------------------
-- 6. Book status: pending / given / given_to_volunteer / delivered
-- ---------------------------------------------------------------------------
drop trigger if exists distributions_touch on public.distributions;
drop function if exists public.touch_distribution();
drop policy if exists distributions_update on public.distributions;   -- changes go through set_book_status()

do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.distributions'::regclass and contype = 'c' loop
    execute format('alter table public.distributions drop constraint %I', c);
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'book_status' and typnamespace = 'public'::regnamespace) then
    create type public.book_status as enum ('pending', 'given', 'given_to_volunteer', 'delivered');
  end if;
end $$;

alter table public.distributions
  add column if not exists volunteer_id bigint references public.team_members (id) on delete set null,
  add column if not exists volunteer_name text,
  add column if not exists handed_by_name text,
  add column if not exists delivered_on timestamptz,
  add column if not exists delivered_by uuid references auth.users (id),
  add column if not exists delivered_by_name text;
create index if not exists distributions_volunteer_idx on public.distributions (volunteer_id);

-- Old "self" / "mediator" marks become "given"; the mediator's name is kept in the notes.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'distributions' and column_name = 'collected_by_name') then
    update public.distributions
       set notes = concat_ws(' · ', notes, 'Collected by ' || collected_by_name || coalesce(' (' || mediator_relation || ')', ''))
     where collected_by_name is not null;
    alter table public.distributions
      drop column collected_by_name, drop column mediator_relation, drop column mediator_phone;
  end if;

  if (select udt_name from information_schema.columns
      where table_schema = 'public' and table_name = 'distributions' and column_name = 'status') <> 'book_status' then
    alter table public.distributions alter column status drop default;
    alter table public.distributions alter column status type public.book_status
      using (case status::text when 'pending' then 'pending' else 'given' end)::public.book_status;
    alter table public.distributions alter column status set default 'pending';
  end if;
end $$;
drop type if exists public.distribution_status;

update public.distributions d set handed_by_name = coalesce(nullif(trim(p.full_name), ''), p.phone)
from public.profiles p where p.id = d.handed_by and d.handed_by_name is null;

-- Full history: one row per change, never overwritten.
create table if not exists public.distribution_events (
  id bigint generated always as identity primary key,
  distribution_id bigint not null references public.distributions (id) on delete cascade,
  status public.book_status not null,
  previous_status public.book_status,
  volunteer_id bigint references public.team_members (id) on delete set null,
  volunteer_name text,
  at timestamptz not null default now(),
  by_user uuid references auth.users (id) default auth.uid(),
  by_name text,
  note text
);
create index if not exists distribution_events_distribution_idx on public.distribution_events (distribution_id);

insert into public.distribution_events (distribution_id, status, previous_status, at, by_user, by_name, note)
select d.id, d.status, 'pending', coalesce(d.handed_on, d.updated_at), d.handed_by, d.handed_by_name, 'Recorded before the new workflow'
from public.distributions d
where d.status <> 'pending'
  and not exists (select 1 from public.distribution_events e where e.distribution_id = d.id);

-- Volunteers see only what has been handed to them.
create or replace function public.volunteer_has_member(mid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.distributions d join public.subscriptions s on s.id = d.subscription_id
    where s.member_id = mid and d.volunteer_id = public.my_team_id()
  )
$$;

create or replace function public.volunteer_has_subscription(sid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.distributions d where d.subscription_id = sid and d.volunteer_id = public.my_team_id())
$$;

create or replace function public.can_see_distribution(did bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.distributions d
    where d.id = did
      and (public.can_manage(public.subscription_category_of(d.subscription_id)) or d.volunteer_id = public.my_team_id())
  )
$$;

alter table public.distribution_events enable row level security;
drop policy if exists events_read on public.distribution_events;
create policy events_read on public.distribution_events for select to authenticated
  using (public.can_see_distribution(distribution_id));

-- Move books forward. Heads (for their side): pending -> given, pending -> given_to_volunteer,
-- given_to_volunteer -> given_to_volunteer (hand to someone else), given_to_volunteer -> delivered.
-- Volunteers: given_to_volunteer -> delivered, only for books handed to them.
-- Rows that can't move (wrong side, wrong state, already done) are skipped and counted.
create or replace function public.set_book_status(
  p_ids bigint[],
  p_status public.book_status,
  p_volunteer_id bigint default null,
  p_volunteer_name text default null,
  p_at timestamptz default null,
  p_note text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_team bigint := public.my_team_id();
  v_me text;
  v_at timestamptz := coalesce(p_at, now());
  v_vol public.team_members;
  v_vname text := nullif(trim(coalesce(p_volunteer_name, '')), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  r record;
  v_head boolean;
  v_ok boolean;
  n_done int := 0;
  n_skip int := 0;
begin
  if v_uid is null then raise exception 'Please log in first'; end if;
  if p_status = 'pending' then raise exception 'Use undo to move a book back'; end if;
  if v_at > now() + interval '5 minutes' or v_at < now() - interval '60 days' then
    raise exception 'The date must be within the last 60 days';
  end if;
  if length(coalesce(v_note, '')) > 300 then raise exception 'Note is too long'; end if;
  select coalesce(nullif(trim(full_name), ''), phone, 'Unknown') into v_me from public.profiles where id = v_uid;

  if p_status = 'given_to_volunteer' then
    if p_volunteer_id is not null then
      select * into v_vol from public.team_members where id = p_volunteer_id and is_active and role = 'volunteer';
      if v_vol.id is null then raise exception 'Volunteer not found'; end if;
      v_vname := v_vol.full_name;
    elsif v_vname is null then
      raise exception 'Choose a volunteer or type their name';
    elsif length(v_vname) > 100 then
      raise exception 'Volunteer name is too long';
    end if;
  end if;

  for r in
    select d.id, d.status, d.volunteer_id, d.volunteer_name, m.category
    from public.distributions d
    join public.subscriptions s on s.id = d.subscription_id
    join public.members m on m.id = s.member_id
    where d.id = any (p_ids)
    for update of d
  loop
    v_head := public.can_manage(r.category);
    v_ok := case
      when v_head then case p_status
        when 'given' then r.status = 'pending'
        when 'given_to_volunteer' then r.status in ('pending', 'given_to_volunteer')
          and (v_vol.id is null or v_vol.category is null or v_vol.category = r.category)
          and not (r.status = 'given_to_volunteer' and r.volunteer_id is not distinct from v_vol.id
                   and r.volunteer_name is not distinct from v_vname)
        when 'delivered' then r.status = 'given_to_volunteer'
        else false end
      when v_team is not null and r.volunteer_id = v_team then p_status = 'delivered' and r.status = 'given_to_volunteer'
      else false
    end;

    if not v_ok then
      n_skip := n_skip + 1;
      continue;
    end if;

    if p_status = 'given' then
      update public.distributions set status = 'given', handed_on = v_at, handed_by = v_uid, handed_by_name = v_me,
        volunteer_id = null, volunteer_name = null, delivered_on = null, delivered_by = null, delivered_by_name = null,
        notes = coalesce(v_note, notes), updated_at = now()
      where id = r.id;
    elsif p_status = 'given_to_volunteer' then
      update public.distributions set status = 'given_to_volunteer', handed_on = v_at, handed_by = v_uid, handed_by_name = v_me,
        volunteer_id = v_vol.id, volunteer_name = v_vname, delivered_on = null, delivered_by = null, delivered_by_name = null,
        notes = coalesce(v_note, notes), updated_at = now()
      where id = r.id;
    else
      update public.distributions set status = 'delivered', delivered_on = v_at, delivered_by = v_uid, delivered_by_name = v_me,
        notes = coalesce(v_note, notes), updated_at = now()
      where id = r.id;
    end if;

    insert into public.distribution_events (distribution_id, status, previous_status, volunteer_id, volunteer_name, at, by_user, by_name, note)
    values (
      r.id, p_status, r.status,
      case p_status when 'given_to_volunteer' then v_vol.id when 'delivered' then r.volunteer_id end,
      case p_status when 'given_to_volunteer' then v_vname when 'delivered' then r.volunteer_name end,
      v_at, v_uid, v_me, v_note
    );
    n_done := n_done + 1;
  end loop;

  -- Skipped also counts ids that weren't found.
  return jsonb_build_object('updated', n_done, 'skipped', greatest(coalesce(array_length(p_ids, 1), 0) - n_done, n_skip));
end $$;

-- Undo one step. Heads: delivered -> given_to_volunteer -> pending, given -> pending.
-- Volunteers: delivered -> given_to_volunteer, for their own books.
create or replace function public.undo_book_status(p_ids bigint[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_team bigint := public.my_team_id();
  v_me text;
  r record;
  v_new public.book_status;
  n_done int := 0;
begin
  if v_uid is null then raise exception 'Please log in first'; end if;
  select coalesce(nullif(trim(full_name), ''), phone, 'Unknown') into v_me from public.profiles where id = v_uid;

  for r in
    select d.id, d.status, d.volunteer_id, d.volunteer_name, m.category
    from public.distributions d
    join public.subscriptions s on s.id = d.subscription_id
    join public.members m on m.id = s.member_id
    where d.id = any (p_ids)
    for update of d
  loop
    v_new := case
      when public.can_manage(r.category) then
        case r.status when 'delivered' then 'given_to_volunteer' when 'given_to_volunteer' then 'pending' when 'given' then 'pending' end
      when v_team is not null and r.volunteer_id = v_team and r.status = 'delivered' then 'given_to_volunteer'
    end::public.book_status;
    continue when v_new is null;

    if v_new = 'pending' then
      update public.distributions set status = 'pending', handed_on = null, handed_by = null, handed_by_name = null,
        volunteer_id = null, volunteer_name = null, delivered_on = null, delivered_by = null, delivered_by_name = null,
        updated_at = now()
      where id = r.id;
    else
      update public.distributions set status = 'given_to_volunteer', delivered_on = null, delivered_by = null,
        delivered_by_name = null, updated_at = now()
      where id = r.id;
    end if;

    insert into public.distribution_events (distribution_id, status, previous_status, volunteer_id, volunteer_name, by_user, by_name, note)
    values (r.id, v_new, r.status,
            case when v_new = 'given_to_volunteer' then r.volunteer_id end,
            case when v_new = 'given_to_volunteer' then r.volunteer_name end,
            v_uid, v_me, 'Undo');
    n_done := n_done + 1;
  end loop;
  return jsonb_build_object('updated', n_done);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Row-level security for the three roles
-- ---------------------------------------------------------------------------
-- Members: Main Head everything; Balika Head reads balikas; volunteers read members whose books
-- were handed to them. Only the Main Head adds, edits or deletes.
drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated
  using (public.can_manage(category) or public.volunteer_has_member(id));
alter policy members_insert on public.members with check (public.is_main_head());
alter policy members_update on public.members using (public.is_main_head()) with check (public.is_main_head());
alter policy members_delete on public.members using (public.is_main_head());

drop policy if exists subscriptions_read on public.subscriptions;
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (public.can_manage(public.member_category_of(member_id)) or public.volunteer_has_subscription(id));
alter policy subscriptions_insert on public.subscriptions with check (public.is_main_head());
alter policy subscriptions_update on public.subscriptions using (public.is_main_head()) with check (public.is_main_head());
alter policy subscriptions_delete on public.subscriptions using (public.is_main_head());

drop policy if exists distributions_read on public.distributions;
create policy distributions_read on public.distributions for select to authenticated
  using (
    public.can_manage(public.subscription_category_of(subscription_id))
    or (volunteer_id is not null and volunteer_id = (select public.my_team_id()))
  );

-- Subscriber access by mobile number is gone.
drop function if exists public.owns_subscription(bigint);
drop function if exists public.my_phone();

-- ---------------------------------------------------------------------------
-- 8. Reports and dashboard (run with the caller's permissions, so RLS applies)
-- ---------------------------------------------------------------------------
create or replace view public.book_report with (security_invoker = true) as
select
  d.id,
  d.status,
  d.issue_id,
  i.language,
  i.seq_no,
  i.issue_month,
  i.issue_year,
  i.title as issue_title,
  s.id as subscription_id,
  s.plan_years,
  c.year as registration_year,
  m.id as member_id,
  m.member_code,
  m.full_name,
  m.phone,
  m.category,
  m.area_id,
  a.name as mandal,
  d.volunteer_id,
  d.volunteer_name,
  d.handed_on,
  d.handed_by_name,
  d.delivered_on,
  d.delivered_by_name,
  d.notes,
  d.updated_at
from public.distributions d
join public.subscriptions s on s.id = d.subscription_id
join public.members m on m.id = s.member_id
join public.issues i on i.id = d.issue_id
left join public.areas a on a.id = m.area_id
left join public.registration_cycles c on c.id = s.cycle_id;

revoke all on public.book_report from anon, public;
grant select on public.book_report to authenticated;

create or replace function public.dashboard_summary()
returns jsonb language sql stable security invoker set search_path = public as $$
  with book as (
    select d.status, s.cycle_id
    from public.distributions d join public.subscriptions s on s.id = d.subscription_id
  ),
  reg as (
    select distinct s.cycle_id, s.member_id, m.category
    from public.subscriptions s join public.members m on m.id = s.member_id
    where s.status <> 'cancelled'
  )
  select jsonb_build_object(
    'balak', (select count(*) from public.members where category = 'balak'),
    'balika', (select count(*) from public.members where category = 'balika'),
    'volunteers', (select count(*) from public.team_members where role = 'volunteer' and is_active),
    'status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
               from (select status, count(*) as n from book group by status) x),
    'years', (select coalesce(jsonb_agg(y order by (y ->> 'year')::int desc), '[]'::jsonb) from (
      select jsonb_build_object(
        'year', c.year,
        'is_current', c.is_current,
        'balak', (select count(*) from reg where reg.cycle_id = c.id and reg.category = 'balak'),
        'balika', (select count(*) from reg where reg.cycle_id = c.id and reg.category = 'balika'),
        'pending', (select count(*) from book where book.cycle_id = c.id and book.status = 'pending'),
        'given', (select count(*) from book where book.cycle_id = c.id and book.status = 'given'),
        'given_to_volunteer', (select count(*) from book where book.cycle_id = c.id and book.status = 'given_to_volunteer'),
        'delivered', (select count(*) from book where book.cycle_id = c.id and book.status = 'delivered')
      ) as y
      from public.registration_cycles c
    ) z)
  )
$$;

-- ---------------------------------------------------------------------------
-- 9. Function permissions
-- ---------------------------------------------------------------------------
revoke execute on function
  public.prepare_team_member(),
  public.sync_team_role(),
  public.assign_member_code()
from public, anon, authenticated;

grant execute on function
  public.is_main_head(),
  public.can_manage(public.member_category),
  public.my_team_id(),
  public.format_member_code(public.member_category, bigint),
  public.volunteer_has_member(bigint),
  public.volunteer_has_subscription(bigint),
  public.can_see_distribution(bigint),
  public.start_registration_year(int, text),
  public.add_registration(bigint, text, int, text, numeric, text, int),
  public.register_member(text, text, text, bigint, text, int, text, date, text, text, numeric, text, int),
  public.import_members(jsonb, public.record_source),
  public.set_book_status(bigint[], public.book_status, bigint, text, timestamptz, text),
  public.undo_book_status(bigint[]),
  public.dashboard_summary()
to authenticated;
revoke execute on function
  public.start_registration_year(int, text),
  public.add_registration(bigint, text, int, text, numeric, text, int),
  public.register_member(text, text, text, bigint, text, int, text, date, text, text, numeric, text, int),
  public.set_book_status(bigint[], public.book_status, bigint, text, timestamptz, text),
  public.undo_book_status(bigint[]),
  public.dashboard_summary()
from public, anon;

-- ===== supabase/migrations/0009_month_summary.sql =====
-- Month-wise book distribution: one row per issue and side, with a count for each status.
-- Runs with the caller's permissions, so the Balika Head only gets Balika numbers.
create or replace function public.month_summary(p_year int default null)
returns table (
  issue_id bigint,
  issue_year int,
  issue_month int,
  language public.pub_language,
  seq_no int,
  title text,
  category public.member_category,
  pending bigint,
  given bigint,
  given_to_volunteer bigint,
  delivered bigint
)
language sql stable security invoker set search_path = public as $$
  select
    i.id, i.issue_year, i.issue_month, i.language, i.seq_no, i.title, m.category,
    count(*) filter (where d.status = 'pending'),
    count(*) filter (where d.status = 'given'),
    count(*) filter (where d.status = 'given_to_volunteer'),
    count(*) filter (where d.status = 'delivered')
  from public.distributions d
  join public.issues i on i.id = d.issue_id
  join public.subscriptions s on s.id = d.subscription_id
  join public.members m on m.id = s.member_id
  where p_year is null or i.issue_year = p_year
  group by i.id, m.category
  order by i.issue_year desc nulls last, i.issue_month desc nulls last, i.language, m.category
$$;

revoke execute on function public.month_summary(int) from public, anon;
grant execute on function public.month_summary(int) to authenticated;

