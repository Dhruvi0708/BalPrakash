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
