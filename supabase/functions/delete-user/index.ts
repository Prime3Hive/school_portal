// delete-user — remove a person's login. Their pupil or staff record stays.
//
// The previous version read `body.userId` (an auth UUID) while the portal has
// always sent `{ schoolId }`, so every delete was refused with "userId is
// required". It also carried its own copy of the admin check.
//
// What deleting does, in order:
//   1. ban the login, so nothing below can leave it half-open;
//   2. delete the profile. If other rows still point at it (marks entered by a
//      teacher, say), stop here: the login stays banned and the profile is
//      marked inactive — suspended, in effect — and the admin is told why;
//   3. unhook the pupil/staff record (auth_id, guardian link) so the record
//      shows as "no login" and can be given a fresh one later;
//   4. delete the auth user.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  audit,
  corsHeaders,
  json,
  otherActiveAdmins,
  requireAdmin,
  serviceClient,
  setBanned,
} from "../_shared/accounts.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const gate = await requireAdmin(req);
    if ("response" in gate) return gate.response;
    const { caller } = gate;

    const body = await req.json().catch(() => null);
    if (!body?.schoolId) return json({ error: "schoolId is required" }, 400);
    const schoolId = String(body.schoolId).trim();

    const admin = serviceClient();
    const { data: profile, error: lookupError } = await admin
      .from("profiles").select("id, role, status, full_name").eq("school_id", schoolId).maybeSingle();
    if (lookupError) return json({ error: "Could not look up that account." }, 500);
    if (!profile) return json({ error: `No account found for ${schoolId}.` }, 404);

    if (profile.id === caller.id) return json({ error: "You cannot delete your own account." }, 400);
    if (profile.role === "admin" && (profile.status || "active") === "active" && await otherActiveAdmins(admin, profile.id) === 0) {
      return json({ error: "This is the only active administrator. Make someone else an administrator first." }, 409);
    }

    // 1. Shut the door first.
    const banError = await setBanned(admin, profile.id, true);
    if (banError) return json({ error: `Could not block the login: ${banError.message}` }, 500);

    // 2. Profile.
    const { error: profileError } = await admin.from("profiles").delete().eq("id", profile.id);
    if (profileError) {
      await admin.from("profiles").update({ status: "inactive", updated_at: new Date().toISOString() }).eq("id", profile.id);
      await audit(admin, caller, "ACCOUNT_SUSPENDED", schoolId, { reason: "delete blocked", error: profileError.message });
      return json({
        error: `Not deleted: other records still refer to ${profile.full_name || schoolId} (${profileError.message}). ` +
               "The login has been suspended instead, so they cannot sign in.",
        suspended: true,
      }, 409);
    }

    // 3. Keep the records, drop the link.
    const now = new Date().toISOString();
    await admin.from("students").update({ auth_id: null, updated_at: now }).eq("auth_id", profile.id);
    await admin.from("staff").update({ auth_id: null, updated_at: now }).eq("auth_id", profile.id);
    await admin.from("students").update({ guardian_auth_id: null }).eq("guardian_auth_id", profile.id)
      .then(({ error }) => { if (error) console.warn("[delete-user] guardian unlink:", error.message); });

    // 4. The login itself. Already banned and without a profile, so a failure
    //    here cannot leave a working account — say so rather than fail.
    const { error: authError } = await admin.auth.admin.deleteUser(profile.id);
    if (authError) console.error("[delete-user] auth delete failed (login stays banned):", authError.message);

    await audit(admin, caller, "ACCOUNT_DELETED", schoolId, {
      name: profile.full_name, role: profile.role, auth_removed: !authError,
    });

    return json({ success: true, schoolId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[delete-user] unexpected:", err);
    return json({ error: message }, 500);
  }
});
