// create-account — the single way a portal login comes into existence.
//
// Admin submits a form → auth user, profile and role record are written →
// Resend mails the credentials → the account works immediately, and the first
// login forces a password change.
//
// Replaces create-invitation-v2 (wrote an invitation row and no user, so the
// account it promised never existed) and create-user-immediate (did the right
// thing but nothing in the frontend called it).
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//      RESEND_API_KEY, MAIL_DOMAIN, APP_URL, SCHOOL_NAME

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SCHOOL_NAME, send } from "../_shared/email.ts";
import {
  allocateSchoolId,
  corsHeaders,
  credentialEmail,
  generatePassword,
  isDeliverable,
  isRole,
  json,
  requireAdmin,
  roleLabel,
  schoolIdToEmail,
  serviceClient,
} from "../_shared/accounts.ts";

/** Which table holds the record a role's login attaches to. */
const RECORD_TABLE: Record<string, "students" | "staff"> = { student: "students", teacher: "staff", staff: "staff" };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let authUserId: string | null = null;
  // Set once an existing pupil or staff record has been pointed at the new
  // login, so a failure further on can point it back.
  let linked: { table: string; id: string } | null = null;
  const admin = serviceClient();

  try {
    const gate = await requireAdmin(req);
    if ("response" in gate) return gate.response;
    const { caller } = gate;

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Request body must be JSON" }, 400);

    const {
      role, fullName, recordId = null,
      department = null, grade: gradeIn = null, section: sectionIn = null,
      dateOfBirth = null, gender = null, photoUrl = null, guardian = null,
    } = body;

    if (!body.email || !role || !fullName) {
      return json({ error: "email, role and fullName are required" }, 400);
    }
    if (!isRole(role)) {
      return json({ error: `Unknown role "${role}"` }, 400);
    }

    // Stored lowercased so the LOWER(email) unique index means what it says and
    // the duplicate check below can be a plain equality match.
    const email = String(body.email).trim().toLowerCase();

    // One human, one login. Without this the second submit of a double-clicked
    // form silently provisions a duplicate account under a fresh school ID.
    const { data: existing } = await admin
      .from("profiles").select("school_id, full_name").eq("email", email).maybeSingle();
    if (existing) {
      return json({
        error: `${email} already has an account (${existing.school_id}). Use "Resend credentials" to issue a new password.`,
      }, 409);
    }

    // "Give a login" to a pupil or staff member already on record. Without
    // this the login got a second, empty record of its own and the real one
    // (class, fees, marks) stayed without a login.
    let grade = gradeIn, section = sectionIn;
    let record: { table: "students" | "staff"; id: string } | null = null;
    if (recordId) {
      const table = RECORD_TABLE[role];
      if (!table) return json({ error: `A ${role} login cannot be attached to a pupil or staff record.` }, 400);
      const { data: row, error } = await admin.from(table).select("*").eq("id", recordId).maybeSingle();
      if (error || !row) return json({ error: "That record no longer exists." }, 404);
      if (row.auth_id) return json({ error: `${row.name || "This person"} already has a login.` }, 409);
      if (table === "students") { grade = grade ?? row.grade ?? null; section = section ?? row.section ?? null; }
      record = { table, id: recordId };
    }

    const schoolId = await allocateSchoolId(admin, role);
    const password = generatePassword();

    // 1. Auth user. school_id rides along in user_metadata so the
    //    handle_new_user trigger — if this database has it — stamps the right
    //    value instead of falling back to the internal email address.
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email: schoolIdToEmail(schoolId),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role, school_id: schoolId },
    });

    if (authError || !created?.user) {
      console.error("[create-account] auth user failed:", authError?.message);
      return json({ error: `Could not create the login: ${authError?.message ?? "unknown error"}` }, 500);
    }
    authUserId = created.user.id;

    // Point the existing record at the login first; create_user_records then
    // finds a row with this auth_id and does not insert another.
    if (record) {
      const { data: rows, error: linkError } = await admin.from(record.table)
        .update({ auth_id: authUserId, updated_at: new Date().toISOString() })
        .eq("id", record.id).is("auth_id", null).select("id");
      if (linkError || !rows?.length) {
        await rollback(admin, authUserId, null);
        authUserId = null;
        return json({ error: `Could not attach the login to the record: ${linkError?.message ?? "it was given a login meanwhile"}` }, 409);
      }
      linked = record;
    }

    // 2. Profile + role record, in one transaction. The RPC upserts the profile
    //    so it works whether or not the trigger already inserted one.
    const { data: rpc, error: rpcError } = await admin.rpc("create_user_records", {
      p_auth_id:   authUserId,
      p_email:     email,
      p_full_name: fullName,
      p_role:      role,
      p_school_id: schoolId,
      p_grade:     grade,
      p_section:   section || "A",
      p_gender:    gender,
      p_dob:       dateOfBirth,
      p_photo:     photoUrl,
      p_guardian:  guardian ? JSON.stringify(guardian) : null,
      p_department: department,
    });

    if (rpcError || (rpc && rpc.success === false)) {
      const detail = rpcError?.message || rpc?.error || "unknown error";
      console.error("[create-account] create_user_records failed:", detail);
      await rollback(admin, authUserId, linked);
      authUserId = null;
      return json({ error: `Could not create the account records: ${detail}` }, 500);
    }

    // 3. Issuance record — who was given access, by whom, when. Deliberately
    //    without the password, which used to sit in this table in plaintext
    //    readable by every logged-in user. Whether they have actually signed in
    //    is read from profiles.last_login, not from this row's status.
    await admin.from("invitations").insert({
      email,
      role,
      token: crypto.randomUUID(),
      school_id: schoolId,
      full_name: fullName,
      status: "pending",
      invited_by: caller.id,
      metadata: { department, grade, section, dateOfBirth, recordId },
    }).then(({ error }) => {
      if (error) console.warn("[create-account] issuance record failed (non-fatal):", error.message);
    });

    // 4. Mail the credentials. Deliberately last and never fatal: the account
    //    already exists, and failing the request over a mail outage would leave
    //    the admin retrying a create that now collides with itself.
    const deliverable = isDeliverable(email);
    const mail = deliverable
      ? await send({
          from: "support",
          to: email,
          subject: `Your ${SCHOOL_NAME} portal login`,
          html: credentialEmail({ fullName, role, schoolId, password, grade, section }),
        })
      : { sent: false, message: `${email} is an internal placeholder address — share the credentials directly.` };

    // 5. Audit trail.
    await admin.from("audit_logs").insert({
      action: "ACCOUNT_CREATED",
      performed_by: `admin:${caller.schoolId ?? caller.id}`,
      target: schoolId,
      details: JSON.stringify({ role, email, auth_id: authUserId, email_sent: mail.sent, linked_record: linked?.id ?? null }),
      timestamp: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.warn("[create-account] audit log failed (non-fatal):", error.message);
    });

    console.log(`[create-account] ${schoolId} (${role}) created by ${caller.schoolId ?? caller.id}`);

    return json({
      success: true,
      schoolId,
      userId: schoolId,   // legacy alias — older call sites read result.userId
      authId: authUserId,
      password,
      role,
      roleLabel: roleLabel(role),
      emailSent: mail.sent,
      emailMessage: mail.message,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[create-account] unexpected:", err);
    if (authUserId) await rollback(admin, authUserId, linked);
    return json({ error: message }, 500);
  }
});

/** Undo a half-built account. Logs rather than throws: a failed rollback must
 *  not replace the original error with its own. */
async function rollback(
  admin: ReturnType<typeof serviceClient>,
  authUserId: string,
  linked: { table: string; id: string } | null,
) {
  try {
    if (linked) await admin.from(linked.table).update({ auth_id: null }).eq("id", linked.id).eq("auth_id", authUserId);
    await admin.from("profiles").delete().eq("id", authUserId);
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (error) console.error(`[create-account] rollback failed for ${authUserId}:`, error.message);
    else console.log(`[create-account] rolled back ${authUserId}`);
  } catch (e) {
    console.error(`[create-account] rollback threw for ${authUserId}:`, e);
  }
}
