-- Convert NET ID contacts into manual contacts (snapshot of wallet at migration time).
-- Step 1 of removing the "add contact via NET ID" feature.
-- Does NOT drop any column/trigger/function yet (separate later migrations).

update public.contacts c
set manual_address  = p.wallet_address,
    nickname        = coalesce(nullif(c.nickname,''), nullif(p.display_name,''), nullif(p.username,''), 'Contact'),
    contact_user_id = null
from public.profiles p
where c.contact_user_id = p.id
  and p.wallet_address is not null;
