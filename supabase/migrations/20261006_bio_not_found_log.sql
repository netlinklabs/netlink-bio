-- Daily log of bio page 404s (username that does not exist), to see whether the
-- 404 errors on the admin Overview are bots or mistyped links.
-- Written only by the server (service role) through bump_bio_not_found().
-- Bounded: max 300 distinct usernames per day, extras go to '(other)'. Rows older than 30 days are removed.

create table if not exists public.bio_not_found_daily (
  day date not null default (now() at time zone 'utc')::date,
  username text not null,
  count integer not null default 0,
  primary key (day, username)
);

alter table public.bio_not_found_daily enable row level security;
revoke all on public.bio_not_found_daily from anon, authenticated;
grant select, insert, update, delete on public.bio_not_found_daily to service_role;

create or replace function public.bump_bio_not_found(p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_name text := left(lower(coalesce(nullif(trim(p_username), ''), '(empty)')), 40);
  v_known boolean;
  v_distinct integer;
begin
  select exists(select 1 from bio_not_found_daily where day = v_day and username = v_name) into v_known;
  if not v_known then
    select count(*) into v_distinct from bio_not_found_daily where day = v_day;
    if v_distinct >= 300 then v_name := '(other)'; end if;
  end if;

  insert into bio_not_found_daily (day, username, count)
  values (v_day, v_name, 1)
  on conflict (day, username) do update set count = bio_not_found_daily.count + 1;

  -- cheap cleanup, about 1 call in 50
  if random() < 0.02 then
    delete from bio_not_found_daily where day < v_day - 30;
  end if;
end;
$$;

revoke execute on function public.bump_bio_not_found(text) from public, anon, authenticated;
grant execute on function public.bump_bio_not_found(text) to service_role;
