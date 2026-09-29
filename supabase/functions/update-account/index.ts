// update-account — suspend, restore, or change the role of a login.
//
// These used to be plain UPDATEs on `profiles` from the browser. Their safety
// then rested on an RLS policy nobody had recorded, suspension left the login
// working, a role change left the person's staff/pupil record behind, and an
// admin could suspend or demote themselves or the last admin. Migration 0032
// takes the privilege away from the browser; this is the one way in.
//
// POST { schoolId, action: "suspend" | "restore" | "set_role", role? }
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  audit,
  corsHeaders,
  isRole,
  json,
  otherActiveAdmins,
  requireAdmin,
  roleLabel,
  serviceClient,
  setBanned,
} from "../_shared/accounts.ts";

const STAFF_ROLES = ["teacher", "staff"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const gate = await requireAdmin(req);
    if ("response" in gate) return gate.response;
    const { caller } = gate;

    const body = await req.json().catch(() => null);
    const schoolId = String(body?.schoolId || "").trim();
    const action = String(body?.action || "");
    if (!schoolId) return json({ error: "schoolId is required" }, 400);
    if (!["suspend", "restore", "set_role"].includes(action)) return json({ error: `Unknown action "${action}"` }, 400);

    const admin = serviceClient();
    const { data: profile, error: lookupError } = await admin
      .from("profiles").select("id, role, status, full_name").eq("school_id", schoolId).maybeSingle();
    if (lookupError) return json({ error: "Could not look up that account." }, 500);
    if (!profile) return json({ error: `No account found for ${schoolId}.` }, 404);

    const name = profile.full_name || schoolId;
    const active = (profile.status || "active") === "active";
    const now = new Date().toISOString();

    if (profile.id === caller.id) {
      return json({ error: "You cannot suspend or change the role of your own account. Ask another administrator." }, 400);
    }

    // Would this leave the school with no active administrator?
    const removesAdmin =
      profile.role === "admin" && active &&
      (action === "suspend" || (action === "set_role" && body.role !== "admin"));
    if (removesAdmin && await otherActiveAdmins(admin, profile.id) === 0) {
      return json({ error: `${name} is the only active administrator. Make someone else an administrator first.` }, 409);
    }

    // ── Suspend / restore ────────────────────────────────────────────────
    if (action === "suspend" || action === "restore") {
      const suspend = action === "suspend";
      const banError = await setBanned(admin, profile.id, suspend);
      if (banError) return json({ error: `Could not ${suspend ? "block" : "unblock"} the login: ${banError.message}` }, 500);

      const { data: rows, error } = await admin.from("profiles")
        .update({ status: suspend ? "inactive" : "active", updated_at: now })
        .eq("id", profile.id).select("id");
      if (error || !rows?.length) {
        // Put the ban back as it was so the two never disagree.
        await setBanned(admin, profile.id, !suspend);
        return json({ error: `Not changed: ${error?.message ?? "the profile was not updated"}` }, 500);
      }

      await audit(admin, caller, suspend ? "ACCOUNT_SUSPENDED" : "ACCOUNT_RESTORED", schoolId, { name, role: profile.role });
      return json({ success: true, status: suspend ? "inactive" : "active" });
    }

    // ── Change role ──────────────────────────────────────────────────────
    const role = body.role;
    if (!isRole(role)) return json({ error: `Unknown role "${role}"` }, 400);
    if (role === profile.role) return json({ error: `${name} is already ${roleLabel(role)}.` }, 400);
    // A pupil's login carries their class, fees and marks; a staff login
    // carries none of that. Turning one into the other would leave either an
    // adult on the class list or a pupil with staff rights.
    if (role === "student" || profile.role === "student") {
      return json({ error: "A pupil's login cannot be turned into another kind of login, or the other way round. Give the person a new login instead." }, 400);
    }

    // The staff record follows the role: teachers and office staff have one;
    // it is kept (as inactive) for someone who stops being staff.
    const { data: staffRow } = await admin.from("staff").select("id, status").eq("auth_id", profile.id).maybeSingle();
    if (STAFF_ROLES.includes(role)) {
      const { error } = staffRow
        ? await admin.from("staff").update({ role, status: "active", updated_at: now }).eq("id", staffRow.id)
        : await admin.from("staff").insert({ auth_id: profile.id, name, role, status: "active", created_at: now, updated_at: now });
      if (error) return json({ error: `Not changed: the staff record could not be updated (${error.message}).` }, 500);
    } else if (staffRow && role === "guardian") {
      await admin.from("staff").update({ status: "inactive", updated_at: now }).eq("id", staffRow.id);
    }

    const { data: rows, error } = await admin.from("profiles")
      .update({ role, updated_at: now }).eq("id", profile.id).select("id");
    if (error || !rows?.length) return json({ error: `Not changed: ${error?.message ?? "the profile was not updated"}` }, 500);

    await admin.auth.admin.updateUserById(profile.id, { user_metadata: { role } })
      .then(({ error: e }) => { if (e) console.warn("[update-account] metadata:", e.message); });

    await audit(admin, caller, "ROLE_CHANGED", schoolId, { name, from: profile.role, to: role });
    return json({ success: true, role });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[update-account] unexpected:", err);
    return json({ error: message }, 500);
  }
});
