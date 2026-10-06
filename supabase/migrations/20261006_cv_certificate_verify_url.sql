-- APPLIED to production on 2026-10-06 (owner approved), via Supabase MCP, name: cv_certificate_verify_url.
-- Optional verification link per CV certificate ({ name, file_path, verify_url }).
-- Only change: enforce_cv_certificates() now also rejects a certificate verify_url that
-- is not https:// or is longer than 500 characters. No table, column or data changes;
-- existing rows have no verify_url, so nothing existing is affected.
-- The trigger trg_enforce_cv_certificates is unchanged and keeps pointing at this function.
--
-- Rollback: re-run the function body from 20261006_cv_certificates.sql (section 5).

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
        -- Verification links must be https, max 500 characters (the UI checks too).
        v_url := nullif(btrim(coalesce(v_item ->> 'verify_url', '')), '');
        if v_url is not null and (v_url !~* '^https://[^[:space:]]+$' or length(v_url) > 500) then
          raise exception 'Verification links must start with https://';
        end if;
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
