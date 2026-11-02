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
