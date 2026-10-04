-- Ambassador program, Pilot Season 1: application table only.
-- Applied to production 2026-10-04.
-- New table, nothing existing is altered. Reviews are done manually by an admin
-- (Supabase dashboard / service role); there is no admin UI in this change.

create table public.ambassador_applications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  season            text not null default 'pilot-1'
                      check (season ~ '^[a-z0-9-]{1,30}$'),

  -- Applicant input
  country_code      text not null check (country_code ~ '^[A-Z]{2}$'),
  city              text check (char_length(city) <= 100),
  track             text not null
                      check (track in ('growth', 'content', 'community', 'influence')),
  social_links      text[] not null
                      check (cardinality(social_links) between 1 and 5
                             and char_length(array_to_string(social_links, E'\n')) <= 1500),
  audience_size     text not null
                      check (audience_size in ('under_1k', '1k_10k', '10k_100k', 'over_100k')),
  motivation        text not null check (char_length(motivation) between 20 and 1500),
  contribution_plan text not null check (char_length(contribution_plan) between 20 and 1500),
  terms_accepted_at timestamptz not null,

  -- Review (admin only)
  status            text not null default 'pending'
                      check (status in ('pending', 'under_review', 'approved', 'rejected', 'revoked')),
  admin_notes       text check (char_length(admin_notes) <= 2000),
  reviewed_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- One application per person per season
  unique (user_id, season)
);

create index ambassador_applications_status_idx
  on public.ambassador_applications (season, status, created_at);

-- Table privileges (migrations do not grant these to the API roles automatically).
-- Column-level on purpose: applicants can never read admin_notes and can only
-- insert their own input fields (status always starts as 'pending').
grant select (id, user_id, season, country_code, city, track, social_links, audience_size,
              motivation, contribution_plan, terms_accepted_at, status, reviewed_at,
              created_at, updated_at)
  on public.ambassador_applications to authenticated;
grant insert (user_id, season, country_code, city, track, social_links, audience_size,
              motivation, contribution_plan, terms_accepted_at)
  on public.ambassador_applications to authenticated;

alter table public.ambassador_applications enable row level security;

create policy "Users can view own ambassador application"
  on public.ambassador_applications for select
  using (auth.uid() = user_id);

create policy "Users can submit own ambassador application"
  on public.ambassador_applications for insert
  with check (auth.uid() = user_id and status = 'pending');

-- No update/delete policies for users. Admin changes use the service role.

-- Keep updated_at fresh, stamp reviewed_at, and enforce the status flow:
-- pending -> under_review -> approved | rejected, approved -> revoked.
create or replace function public.ambassador_applications_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();

  if new.status is distinct from old.status then
    if not (
      (old.status = 'pending'      and new.status in ('under_review', 'rejected'))
      or (old.status = 'under_review' and new.status in ('approved', 'rejected'))
      or (old.status = 'approved'     and new.status = 'revoked')
    ) then
      raise exception 'Invalid status change: % to %', old.status, new.status;
    end if;
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

create trigger trg_ambassador_applications_before_update
  before update on public.ambassador_applications
  for each row execute function public.ambassador_applications_before_update();
