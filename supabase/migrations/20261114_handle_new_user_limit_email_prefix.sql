-- Signup failed with "Database error saving new user" when the email prefix was long:
-- username = prefix + '_' + up to 4 digits could exceed the 25 character limit
-- enforced by enforce_username_length(). Cap the prefix at 20 characters.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  generated_username text;
  email_prefix text;
BEGIN
  -- Part before @, lowercase, everything except a-z 0-9 becomes underscore.
  email_prefix := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]+', '_', 'g');
  email_prefix := trim(both '_' from email_prefix);

  IF email_prefix IS NULL OR length(email_prefix) < 3 THEN
    email_prefix := 'user';
  END IF;

  -- Max username length is 25: 20 prefix chars + '_' + up to 4 random digits.
  email_prefix := trim(both '_' from left(email_prefix, 20));

  generated_username := email_prefix || '_' || floor(random() * 10000)::text;

  INSERT INTO public.profiles (
    id, username, display_name, avatar_url, bio, tier,
    show_cv, show_donate, sections_order, show_youtube_thumbnail,
    cv_data, link_icon_shape, net_reward_milestone, net_reward_pending, is_black_badge
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', generated_username),
    COALESCE(new.raw_user_meta_data->>'full_name', email_prefix),
    COALESCE(new.raw_user_meta_data->>'avatar_url', ''),
    'Welcome to my Netlink.bio!',
    'basic', true, true,
    '["description", "youtube", "links", "cv", "donate"]'::jsonb,
    true,
    '{"title": "", "skills": [], "summary": "", "location": "", "projects": [], "education": [], "languages": [], "experience": [], "certifications": []}'::jsonb,
    'circle', 0, 0, false
  );

  RETURN new;
END;
$function$;
