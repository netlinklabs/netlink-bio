-- APPLIED to production on 2026-10-06 (owner approved), via Supabase MCP, name: cv_certificates.
-- CV certificate PDFs (Silver and up) + https-only Featured Project links.
--
-- What this does
--  1) public.cv_certificate_limit(tier): single place for the per-tier file limit.
--  2) Private bucket `cv-certificates` (PDF only, max 2 MB per file).
--  3) public.cv_certificate_upload_allowed(): tier check + file count (SECURITY DEFINER).
--  4) Storage policies: owner-scoped, upload allowed from Silver and up,
--     capped by cv_certificate_limit(). Delete is always allowed for the owner
--     (so a downgraded user can still clean up).
--  5) Trigger on profiles: validates cv_data. Rejects non-https project URLs,
--     rejects certificate file paths outside the user's own folder, and blocks
--     ADDING files when the tier is not eligible or the limit is reached.
--     Keeping existing files after a downgrade is allowed, so a downgraded user
--     can still save other CV edits. The public CV hides those files for Basic.
--
-- No view change needed: profiles_cv_public already exposes cv_data and tier.
-- No data migration needed: legacy string certifications keep working.
--
-- Rollback:
--   drop trigger trg_enforce_cv_certificates on public.profiles;
--   drop function public.enforce_cv_certificates();
--   drop policy "cv_certificates_insert_own_silver_plus" on storage.objects;
--   drop policy "cv_certificates_select_own" on storage.objects;
--   drop policy "cv_certificates_delete_own" on storage.objects;
--   (empty the bucket from the dashboard, then) delete from storage.buckets where id = 'cv-certificates';
--   drop function public.cv_certificate_upload_allowed();
--   drop function public.cv_certificate_limit(text);

-- 1) Per-tier limit of certificate PDFs. Change the numbers here only.
--    Platinum mirrors Gold (same as the video limit).
create or replace function public.cv_certificate_limit(p_tier text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case coalesce(p_tier, 'basic')
    when 'silver' then 5
    when 'gold' then 10
    when 'platinum' then 10
    else 0
  end;
$$;

-- 2) Private bucket: 2 MB, PDF only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv-certificates', 'cv-certificates', false, 2097152, array['application/pdf'])
on conflict (id) do nothing;

-- 3) Can the current user upload one more certificate file? Tier must allow it
--    and the user must be under the limit. This is a SECURITY DEFINER function
--    because a policy on storage.objects cannot read storage.objects itself
--    (Postgres: "infinite recursion detected in policy").
create or replace function public.cv_certificate_upload_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.cv_certificate_limit(p.tier) > 0
       and (
         select count(*) from storage.objects o
         where o.bucket_id = 'cv-certificates'
           and (storage.foldername(o.name))[1] = p.id::text
       ) < public.cv_certificate_limit(p.tier)
    from public.profiles p
    where p.id = (select auth.uid())
  ), false);
$$;
revoke execute on function public.cv_certificate_upload_allowed() from public, anon;
grant execute on function public.cv_certificate_upload_allowed() to authenticated;

-- 4) Storage policies. Files are immutable (no UPDATE policy): to replace a
--    file the app uploads a new one and deletes the old one.
create policy "cv_certificates_insert_own_silver_plus" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cv-certificates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(name) like '%.pdf'
    and (select public.cv_certificate_upload_allowed())
  );

create policy "cv_certificates_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cv-certificates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "cv_certificates_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cv-certificates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 5) Validation trigger on profiles.cv_data.
create or replace function public.enforce_cv_certificates()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_limit     integer := public.cv_certificate_limit(new.tier);
  v_item      jsonb;
  v_path      text;
  v_url       text;
  v_new_paths text[] := '{}';
  v_old_paths text[] := '{}';
begin
  if new.cv_data is null then
    return new;
  end if;

  -- Featured Project links must be https (defense in depth, the UI checks too).
  if jsonb_typeof(new.cv_data -> 'projects') = 'array' then
    for v_item in select * from jsonb_array_elements(new.cv_data -> 'projects') loop
      if jsonb_typeof(v_item) = 'object' then
        v_url := nullif(btrim(coalesce(v_item ->> 'url', '')), '');
        if v_url is not null and (v_url !~* '^https://[^[:space:]]+$' or length(v_url) > 500) then
          raise exception 'Project links must start with https://';
        end if;
      end if;
    end loop;
  end if;

  -- Certificate file paths: own folder, safe name, .pdf only.
  if jsonb_typeof(new.cv_data -> 'certifications') = 'array' then
    for v_item in select * from jsonb_array_elements(new.cv_data -> 'certifications') loop
      if jsonb_typeof(v_item) = 'object' then
        v_path := nullif(btrim(coalesce(v_item ->> 'file_path', '')), '');
        if v_path is not null then
          if v_path !~ ('^' || new.id::text || '/[A-Za-z0-9._-]+\.pdf$') or v_path like '%..%' then
            raise exception 'Invalid certificate file.';
          end if;
          v_new_paths := v_new_paths || v_path;
        end if;
      end if;
    end loop;
  end if;

  if tg_op = 'UPDATE' and jsonb_typeof(old.cv_data -> 'certifications') = 'array' then
    for v_item in select * from jsonb_array_elements(old.cv_data -> 'certifications') loop
      if jsonb_typeof(v_item) = 'object' then
        v_path := nullif(btrim(coalesce(v_item ->> 'file_path', '')), '');
        if v_path is not null then
          v_old_paths := v_old_paths || v_path;
        end if;
      end if;
    end loop;
  end if;

  -- Only ADDING a file is gated. Keeping existing files never raises.
  if exists (select 1 from unnest(v_new_paths) p where p <> all (v_old_paths)) then
    if v_limit = 0 then
      raise exception 'Certificate files are available from the Silver plan and up.';
    end if;
    if cardinality(v_new_paths) > v_limit then
      raise exception 'Certificate file limit reached for your plan (% files).', v_limit;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_cv_certificates
  before insert or update of cv_data on public.profiles
  for each row execute function public.enforce_cv_certificates();
