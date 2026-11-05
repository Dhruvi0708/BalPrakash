-- Phases 3–6: QR member cards, auto-expiry, renewals, help requests.

-- Each person gets a short code printed on their QR card; volunteers scan it at distribution.
alter table public.members
  add column if not exists card_code text not null default upper(substr(md5(gen_random_uuid()::text), 1, 8));
create unique index if not exists members_card_code_key on public.members (card_code);

-- When stock arrives, also mark subscriptions whose last issue has now arrived as expired.
-- Their books stay in the distribution list until collected.
create or replace function public.on_stock_received()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_issue public.issues;
begin
  perform public.generate_distributions(new.issue_id, new.category);
  select * into v_issue from public.issues where id = new.issue_id;
  update public.subscriptions s set status = 'expired'
  from public.members m
  where m.id = s.member_id
    and m.category = new.category
    and s.status = 'active'
    and s.language = v_issue.language
    and s.start_issue_seq + s.total_issues - 1 <= v_issue.seq_no;
  return new;
end $$;

-- Renewals: allow a new registration when the current subscription has at most 2 issues
-- left; the renewal then starts right after the current one ends.
create or replace function public.renewal_start_seq(p_member_id bigint, p_language public.pub_language)
returns int language sql stable security definer set search_path = public as $$
  select greatest(
    public.next_issue_seq(p_language),
    coalesce((
      select max(start_issue_seq + total_issues) from public.subscriptions
      where member_id = p_member_id and language = p_language and status = 'active'
    ), 0)
  )
$$;

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
    where member_id = v_member_id and language = v_language and status = 'pending'
  ) then
    raise exception '% already has a % registration waiting for approval', v_name,
      case v_language when 'gu' then 'Gujarati' else 'English' end;
  end if;

  if exists (
    select 1 from public.subscriptions
    where member_id = v_member_id and language = v_language and status = 'active'
      and start_issue_seq + total_issues - 1 > public.next_issue_seq(v_language) + 1
  ) then
    raise exception '% is already subscribed to % Bal Prakash. You can renew when 2 issues are left.', v_name,
      case v_language when 'gu' then 'Gujarati' else 'English' end;
  end if;

  insert into public.subscriptions (
    member_id, language, plan_years, start_issue_seq, amount, payment_mode, receipt_no,
    payment_status, status, source, registration_window_id
  ) values (
    v_member_id, v_language, p_plan_years, public.renewal_start_seq(v_member_id, v_language), p_amount,
    p_payment_mode::public.payment_mode, nullif(trim(p_receipt_no), ''),
    'pending', 'pending', 'online', v_window_id
  )
  returning id into v_sub_id;

  return jsonb_build_object('subscription_id', v_sub_id, 'name', v_name, 'phone', v_phone);
end $$;

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
  v_member_id bigint;
begin
  select m.category, s.language, s.status, s.member_id into v_category, v_language, v_status, v_member_id
  from public.subscriptions s join public.members m on m.id = s.member_id
  where s.id = p_subscription_id;

  if v_category is null then raise exception 'Registration not found'; end if;
  if not (public.is_head() and public.can_manage(v_category)) then raise exception 'Not allowed'; end if;
  if v_status <> 'pending' then raise exception 'This registration has already been reviewed'; end if;
  if p_start_issue_seq is not null and p_start_issue_seq < 1 then raise exception 'Start issue must be 1 or more'; end if;

  update public.subscriptions set
    status = 'active',
    payment_status = 'verified',
    start_issue_seq = coalesce(p_start_issue_seq, public.renewal_start_seq(v_member_id, v_language)),
    receipt_no = coalesce(nullif(trim(p_receipt_no), ''), receipt_no),
    approved_by = auth.uid(),
    approved_at = now()
  where id = p_subscription_id;
end $$;

-- "I didn't get my book" and other questions from subscribers to their head.
create table if not exists public.help_requests (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members (id) on delete cascade,
  message text not null check (length(message) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'resolved')),
  response text,
  created_by uuid references auth.users (id) default auth.uid(),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists help_requests_member_idx on public.help_requests (member_id);
create index if not exists help_requests_status_idx on public.help_requests (status);

alter table public.help_requests enable row level security;

create or replace function public.owns_member(mid bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where id = mid and phone = public.my_phone())
$$;

create policy help_read on public.help_requests for select to authenticated
  using (public.owns_member(member_id) or (public.is_staff() and public.can_manage(public.member_category_of(member_id))));
create policy help_insert on public.help_requests for insert to authenticated
  with check (public.owns_member(member_id) and status = 'open' and response is null);
create policy help_update on public.help_requests for update to authenticated
  using (public.is_head() and public.can_manage(public.member_category_of(member_id)))
  with check (public.is_head() and public.can_manage(public.member_category_of(member_id)));

create or replace function public.touch_help_request()
returns trigger language plpgsql set search_path = public as $$
begin
  new.member_id := old.member_id;
  new.message := old.message;
  new.created_by := old.created_by;
  if new.status = 'resolved' and old.status <> 'resolved' then
    new.resolved_by := auth.uid();
    new.resolved_at := now();
  end if;
  return new;
end $$;

create trigger help_requests_touch
  before update on public.help_requests
  for each row execute function public.touch_help_request();

revoke execute on function public.renewal_start_seq(bigint, public.pub_language) from public, anon;
grant execute on function public.renewal_start_seq(bigint, public.pub_language) to authenticated;
revoke execute on function public.owns_member(bigint) from public, anon;
grant execute on function public.owns_member(bigint) to authenticated;
revoke execute on function public.touch_help_request() from public, anon, authenticated;
