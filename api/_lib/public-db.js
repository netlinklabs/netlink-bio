// Auth headers for reading Supabase through PostgREST from serverless functions.
//
// The three public views are read ONLY from the server, with the service role
// key (server-side env var, never sent to the browser). Everything else keeps
// using the public (anon) key exactly as before.
//
// Why: the views will be switched to security_invoker and closed to anon, so
// anon/browsers can no longer query them directly. Falls back to the anon key
// when the service key is missing (for example Preview deploys), which keeps
// working until anon access is revoked.
const PRIVATE_VIEWS = ['profiles_bio_public', 'profiles_cv_public', 'landing_pages_public'];

export function supabaseAuthHeaders(path, anonKey) {
  const isPrivateView = PRIVATE_VIEWS.some((v) => String(path).startsWith(v));
  const key = (isPrivateView && process.env.SUPABASE_SERVICE_ROLE_KEY) || anonKey;
  return { apikey: key, Authorization: `Bearer ${key}` };
}
