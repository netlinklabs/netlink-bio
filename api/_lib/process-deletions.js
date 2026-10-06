// api/_lib/process-deletions.js
// Executes account deletion requests once their 45-day grace period is over.
// Called from the daily cron (api/cron/rollup-analytics.js), because the Vercel
// Hobby plan caps api/ at 12 functions and that cap is reached.
//
// What happens for each due request (status 'pending', scheduled_for <= now):
//   1. Re-check the request is still pending (the user may have cancelled).
//   2. Skip the user if rows exist that block deleting the auth user. The foreign
//      keys orders.user_id, kyc_sessions.user_id, sponsored_members.user_id and
//      admin_audit_log.admin_id are NO ACTION, so the delete would fail, and those
//      records may need to be kept for legal or tax reasons. This is reported in
//      the result as `blocked` and left for a human decision. Nothing is deleted.
//   3. Delete the user's files in every storage bucket (all buckets use
//      <user id>/ as the first folder). Storage is not removed by database
//      cascades, so this must be explicit.
//   4. Delete the auth user. Everything with ON DELETE CASCADE (profile, links,
//      CV, landing pages, contacts, consents, analytics, ...) goes with it. The
//      deletion_requests row is also removed by that cascade, so there is no
//      "completed" row left behind.
//
// Safety: unless DELETION_EXECUTOR_ENABLED is exactly 'true', this only counts
// what it WOULD do (dry run) and changes nothing. Turn it on in Vercel env vars
// after checking a dry run (`?job=process-deletions` on the cron URL).
//
// Logs never contain emails, usernames or file names, only request ids.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKETS = ['cv-certificates', 'avatars', 'banners', 'landing-images', 'og'];
const BLOCKERS = [
  ['orders', 'user_id'],
  ['kyc_sessions', 'user_id'],
  ['sponsored_members', 'user_id'],
  ['admin_audit_log', 'admin_id'],
];
const BATCH_SIZE = 5; // requests per run; the rest are picked up by the next daily run
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authHeaders(extra = {}) {
  return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, ...extra };
}

async function restGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`REST ${r.status}`);
  return r.json();
}

async function isStillPending(requestId) {
  const rows = await restGet(`deletion_requests?id=eq.${requestId}&status=eq.pending&select=id&limit=1`);
  return rows.length === 1;
}

async function findBlockers(userId) {
  const found = [];
  for (const [table, column] of BLOCKERS) {
    const rows = await restGet(`${table}?${column}=eq.${userId}&select=${column}&limit=1`);
    if (rows.length) found.push(table);
  }
  return found;
}

// Lists the files directly under <userId>/ in one bucket.
// Returns { files, nested }: `nested` is true if a sub-folder exists, which this
// job does not walk (no feature creates one), so the user is not deleted then.
async function listUserFiles(bucket, userId) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefix: userId, limit: 1000, offset: 0 }),
  });
  if (!r.ok) throw new Error(`Storage list ${r.status}`);
  const items = await r.json();
  const files = [];
  let nested = false;
  for (const it of items) {
    if (!it || typeof it.name !== 'string' || it.name.includes('/') || it.name.includes('..')) { nested = true; continue; }
    if (it.id === null) { nested = true; continue; } // a folder placeholder
    files.push(`${userId}/${it.name}`);
  }
  return { files, nested };
}

async function removeFiles(bucket, paths) {
  if (!paths.length) return;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!r.ok) throw new Error(`Storage remove ${r.status}`);
}

async function deleteAuthUser(userId) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ should_soft_delete: false }),
  });
  if (!r.ok) throw new Error(`Auth delete ${r.status}`);
}

export async function processAccountDeletions() {
  const enabled = process.env.DELETION_EXECUTOR_ENABLED === 'true';
  const out = { enabled, due: 0, deleted: 0, wouldDelete: 0, blocked: 0, failed: 0 };

  const due = await restGet(
    `deletion_requests?status=eq.pending&scheduled_for=lte.${encodeURIComponent(new Date().toISOString())}`
    + `&select=id,user_id&order=scheduled_for.asc&limit=${BATCH_SIZE}`
  );
  out.due = due.length;

  for (const req of due) {
    try {
      if (!UUID_RE.test(req.id) || !UUID_RE.test(req.user_id)) throw new Error('bad id');
      if (!(await isStillPending(req.id))) continue; // cancelled meanwhile

      const blockers = await findBlockers(req.user_id);
      if (blockers.length) {
        out.blocked++;
        console.warn(`account-deletion: request ${req.id} blocked by rows in: ${blockers.join(', ')}`);
        continue;
      }

      // Collect files first, so a dry run and a real run look at the same thing.
      const plan = [];
      let nested = false;
      for (const bucket of BUCKETS) {
        const { files, nested: n } = await listUserFiles(bucket, req.user_id);
        if (n) nested = true;
        if (files.length) plan.push([bucket, files]);
      }
      if (nested) {
        out.failed++;
        console.error(`account-deletion: request ${req.id} has nested storage folders, not deleting`);
        continue;
      }

      if (!enabled) {
        out.wouldDelete++;
        continue;
      }

      for (const [bucket, files] of plan) await removeFiles(bucket, files);

      // Last check before the irreversible step.
      if (!(await isStillPending(req.id))) continue;
      await deleteAuthUser(req.user_id);
      out.deleted++;
      console.log(`account-deletion: request ${req.id} completed`);
    } catch (err) {
      out.failed++;
      console.error(`account-deletion: request ${req.id || '?'} failed: ${err.message}`);
    }
  }
  return out;
}
