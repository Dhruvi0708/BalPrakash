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
