-- Applied manually in Supabase SQL Editor on 2026-10-04 (A).
drop trigger if exists trg_notify_contact_added on public.contacts;
drop function if exists public.notify_contact_added();
drop function if exists public.resolve_net_id(text);
delete from public.notifications where type = 'contact_added';
