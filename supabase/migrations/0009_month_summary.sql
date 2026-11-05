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
