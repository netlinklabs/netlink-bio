-- Revoke EXECUTE on SECURITY DEFINER functions that must not be callable via /rest/v1/rpc.
-- Applied to production 2026-10-04. Rollback for any one function: grant execute on function <sig> to anon, authenticated;
-- Kept public on purpose: get_slug_status, is_slug_available (username check on index.html before login).

-- Group 1: trigger functions. Triggers do not need EXECUTE at fire time.
revoke execute on function
  public.handle_new_user(), public.enforce_reward_cap(),
  public.enforce_template_banner_tier(), public.enforce_video_limit(),
  public.notify_referral_reward(), public.notify_tier_upgrade(),
  public.check_slug_not_reserved(), public.check_username_not_reserved(),
  public.sync_verification_cache(), public.rls_auto_enable()
from public, anon, authenticated;

-- Group 2 and 3: signed-in users only.
revoke execute on function
  public.cancel_account_deletion(), public.dismiss_read_notifications(),
  public.get_latest_consent_version(text), public.get_my_consents(),
  public.get_my_deletion_request(), public.get_my_notifications(integer),
  public.get_unread_notification_count(), public.has_app_pin(),
  public.mark_all_notifications_read(), public.mark_notification_read(uuid),
  public.record_consent(text, text, text), public.request_account_deletion(text),
  public.set_app_pin(text), public.verify_app_pin(text),
  public.resolve_receipt_party(text), public.resolve_wallet_owner_name(text)
from public, anon;

grant execute on function
  public.cancel_account_deletion(), public.dismiss_read_notifications(),
  public.get_latest_consent_version(text), public.get_my_consents(),
  public.get_my_deletion_request(), public.get_my_notifications(integer),
  public.get_unread_notification_count(), public.has_app_pin(),
  public.mark_all_notifications_read(), public.mark_notification_read(uuid),
  public.record_consent(text, text, text), public.request_account_deletion(text),
  public.set_app_pin(text), public.verify_app_pin(text),
  public.resolve_receipt_party(text), public.resolve_wallet_owner_name(text)
to authenticated, service_role;
