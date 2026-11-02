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
