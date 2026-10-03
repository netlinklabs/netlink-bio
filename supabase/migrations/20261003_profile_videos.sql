-- Multi-video cards (Basic 1, Silver 5, Gold 13) + layout choice (Silver/Gold).
-- Applied to production 2026-10-03 (grants were added in a follow-up, see below).

-- 1) Videos table (public read like `links`, owner-only writes)
create table public.profile_videos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  url          text not null check (char_length(url) <= 500),
  title        text check (char_length(title) <= 150),
  channel_name text check (char_length(channel_name) <= 150),
  position     integer not null default 0,
  is_featured  boolean not null default false,
  created_at   timestamptz not null default now()
);
create index profile_videos_user_pos_idx on public.profile_videos (user_id, position);
-- Only one featured video per profile
create unique index profile_videos_one_featured_idx on public.profile_videos (user_id) where is_featured;

-- Table privileges: tables created through a migration do not get SELECT/INSERT/
-- UPDATE/DELETE for the API roles automatically. Without these, every request
-- fails with "permission denied" even though the RLS policies below allow it.
grant select on public.profile_videos to anon, authenticated;
grant insert, update, delete on public.profile_videos to authenticated;

alter table public.profile_videos enable row level security;
create policy "Videos are viewable by everyone" on public.profile_videos for select using (true);
create policy "Users can insert own videos" on public.profile_videos for insert with check (auth.uid() = user_id);
create policy "Users can update own videos" on public.profile_videos for update using (auth.uid() = user_id);
create policy "Users can delete own videos" on public.profile_videos for delete using (auth.uid() = user_id);

-- 2) Layout column on profiles
alter table public.profiles
  add column video_layout text not null default 'standard'
  check (video_layout in ('standard', 'grid', 'flexible'));
-- `authenticated` only has UPDATE on an allowlist of profiles columns (tier etc.
-- are locked), so every new user-editable column needs its own grant.
grant update (video_layout) on public.profiles to authenticated;

-- 3) Tier limit on video count (Basic 1, Silver 5, Gold/Platinum 13)
create or replace function public.enforce_video_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier  text;
  v_limit integer;
  v_count integer;
begin
  -- Lock the owner row so two parallel inserts cannot both slip under the limit
  select tier into v_tier from public.profiles where id = new.user_id for update;
  v_limit := case coalesce(v_tier, 'basic')
    when 'gold' then 13
    when 'platinum' then 13
    when 'silver' then 5
    else 1
  end;
  select count(*) into v_count from public.profile_videos where user_id = new.user_id;
  if v_count >= v_limit then
    raise exception 'Video limit reached for your plan (% videos).', v_limit;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_video_limit
  before insert on public.profile_videos
  for each row execute function public.enforce_video_limit();

-- 4) Basic can only use the standard layout (normalized, never raises, so tier
--    downgrades and unrelated profile updates keep working)
create or replace function public.enforce_video_layout_tier()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.tier, 'basic') = 'basic' then
    new.video_layout := 'standard';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_video_layout_tier
  before insert or update of video_layout, tier on public.profiles
  for each row execute function public.enforce_video_layout_tier();

-- 5) Move the existing single video into the new table (1 row in production)
insert into public.profile_videos (user_id, url, title, position)
select id, youtube_url, nullif(youtube_title, ''), 0
from public.profiles
where youtube_url is not null and youtube_url <> '';

-- 6) Expose the layout to bio.js (new column appended at the end of the view)
create or replace view public.profiles_bio_public as
 select id, username, display_name, avatar_url, bio, tier, is_black_badge,
    business_verified_at, identity_verified_at, link_icon_shape, show_cv, show_donate,
    youtube_url, youtube_title, show_youtube_thumbnail,
    case when show_cv then cv_data else null::jsonb end as cv_data,
    case when show_email_bio then contact_email else null::text end as contact_email,
    case when show_phone_bio then contact_whatsapp else null::text end as contact_whatsapp,
    case when show_telegram_bio then contact_telegram else null::text end as contact_telegram,
    case when show_donate then wallet_address else null::text end as wallet_address,
    case when show_country_bio then country_code else null::text end as country_code,
    theme_preset, hide_footer_link_bio, template_id, banner_url, og_image_url, og_image_hash,
    video_layout
   from public.profiles;

-- Old youtube_* columns are intentionally kept for now (rollback safety).
