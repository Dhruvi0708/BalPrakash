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
