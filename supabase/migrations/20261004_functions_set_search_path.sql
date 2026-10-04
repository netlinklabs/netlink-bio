-- Applied to production 2026-10-04. Locks search_path on 18 public functions
-- (clears the "Function Search Path Mutable" advisor warnings). Logic is unchanged.
alter function public.claim_referral(text)                    set search_path = public, pg_temp;
alter function public.enforce_hide_footer_link_tier_gate()    set search_path = public, pg_temp;
alter function public.enforce_landing_page_slug_length()      set search_path = public, pg_temp;
alter function public.enforce_landing_page_tier_gate()        set search_path = public, pg_temp;
alter function public.enforce_landing_slug_length()           set search_path = public, pg_temp;
alter function public.enforce_username_length()               set search_path = public, pg_temp;
alter function public.enforce_video_layout_tier()             set search_path = public, pg_temp;
alter function public.generate_net_id()                       set search_path = public, pg_temp;
alter function public.generate_referral_code()                set search_path = public, pg_temp;
alter function public.handle_new_user()                       set search_path = public, pg_temp;
alter function public.handle_updated_at()                     set search_path = public, pg_temp;
alter function public.is_slug_length_valid(text, text)        set search_path = public, pg_temp;
alter function public.min_slug_length_for_tier(text)          set search_path = public, pg_temp;
alter function public.set_fiat_orders_updated_at()            set search_path = public, pg_temp;
alter function public.set_net_id_on_insert()                  set search_path = public, pg_temp;
alter function public.set_referral_code_on_insert()           set search_path = public, pg_temp;
alter function public.set_updated_at()                        set search_path = public, pg_temp;
alter function public.tier_rank(text)                         set search_path = public, pg_temp;
