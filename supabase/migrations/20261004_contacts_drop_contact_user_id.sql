-- Applied manually in Supabase SQL Editor on 2026-10-04 (B), after the A migration.
drop index if exists public.contacts_owner_contact_unique;
alter table public.contacts
  drop constraint contacts_exactly_one_target,
  drop constraint contacts_manual_requires_nickname,
  drop constraint contacts_no_self_reference,
  drop constraint contacts_contact_user_id_fkey,
  drop column contact_user_id;
alter table public.contacts
  alter column manual_address set not null,
  alter column nickname set not null,
  add constraint contacts_manual_address_format
    check (manual_address ~ '^0x[a-fA-F0-9]{40}$');
