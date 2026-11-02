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
