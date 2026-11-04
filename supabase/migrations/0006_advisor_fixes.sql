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
