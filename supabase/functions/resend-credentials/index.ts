// resend-credentials — give an existing account a new password and mail it.
//
// This is what an admin means by "resend": same person, same login ID, same
// records, working password. The old resend buttons called the create endpoint
// a second time, which minted a *second* account under a *new* school ID and
// left the first one orphaned — so "I never got my email" quietly became two
// logins for one person, only one of which had their data attached.
//
// Also the password-reset path. There is no self-service reset in the portal;
// a user who is locked out asks an admin, and the admin lands here.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//      RESEND_API_KEY, MAIL_DOMAIN, APP_URL, SCHOOL_NAME

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SCHOOL_NAME, send } from "../_shared/email.ts";
import {
  corsHeaders,
  credentialEmail,
  generatePassword,
  json,
  requireAdmin,
  roleLabel,
  serviceClient,
} from "../_shared/accounts.ts";

function isDeliverable(address: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address.trim()) && !address.trim().toLowerCase().endsWith("@tbd.internal");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const gate = await requireAdmin(req);
    if ("response" in gate) return gate.response;
    const { caller } = gate;

    const body = await req.json().catch(() => null);
    if (!body?.schoolId) return json({ error: "schoolId is required" }, 400);

    const schoolId: string = String(body.schoolId).trim().toUpperCase();
    /** Optional: correct a typo'd address at the same time as reissuing.
     *  Lowercased to match how create-account stores addresses. */
    const newEmail: string | null = body.email ? String(body.email).trim().toLowerCase() : null;

    const admin = serviceClient();

    const { data: profile, error: lookupError } = await admin
      .from("profiles")
      .select("id, email, full_name, role, status")
      .eq("school_id", schoolId)
      .maybeSingle();

    if (lookupError) {
      console.error("[resend-credentials] lookup failed:", lookupError.message);
      return json({ error: "Could not look up that account." }, 500);
    }
    if (!profile) {
      return json({ error: `No account found for ${schoolId}.` }, 404);
    }

    // Reissuing into a suspended account hands back working credentials to
    // someone an admin deliberately shut out.
    if (profile.status === "inactive" || profile.status === "suspended") {
      return json({
        error: `${schoolId} is ${profile.status}. Reactivate the account before issuing a new password.`,
      }, 409);
    }

    const password = generatePassword();

    const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, { password });
    if (updateError) {
      console.error("[resend-credentials] password update failed:", updateError.message);
      return json({ error: `Could not set a new password: ${updateError.message}` }, 500);
    }

    // Force the change on next sign-in, exactly as a new account does.
    const patch: Record<string, unknown> = {
      must_change_password: true,
      updated_at: new Date().toISOString(),
    };
    if (newEmail) patch.email = newEmail;

    const { error: profileError } = await admin.from("profiles").update(patch).eq("id", profile.id);
    if (profileError) {
      // The password is already changed, so this is a warning, not a failure —
      // reporting an error here would invite a retry that changes it again.
      console.warn("[resend-credentials] profile flag update failed:", profileError.message);
    }

    const recipient = newEmail || profile.email;
    const deliverable = recipient && isDeliverable(recipient);

    const mail = deliverable
      ? await send({
          from: "support",
          to: recipient,
          subject: `Your new ${SCHOOL_NAME} portal password`,
          html: credentialEmail({
            fullName: profile.full_name || schoolId,
            role: profile.role,
            schoolId,
            password,
            reissued: true,
          }),
        })
      : {
          sent: false,
          message: recipient
            ? `${recipient} is an internal placeholder address — share the password directly.`
            : "No email address on file — share the password directly.",
        };

    await admin.from("audit_logs").insert({
      action: "CREDENTIALS_REISSUED",
      performed_by: `admin:${caller.schoolId ?? caller.id}`,
      target: schoolId,
      details: { role: profile.role, email_sent: mail.sent, email_changed: Boolean(newEmail) },
      timestamp: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.warn("[resend-credentials] audit log failed (non-fatal):", error.message);
    });

    console.log(`[resend-credentials] ${schoolId} reissued by ${caller.schoolId ?? caller.id}`);

    return json({
      success: true,
      schoolId,
      userId: schoolId,
      password,
      role: profile.role,
      roleLabel: roleLabel(profile.role),
      fullName: profile.full_name,
      email: recipient,
      emailSent: mail.sent,
      emailMessage: mail.message,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[resend-credentials] unexpected:", err);
    return json({ error: message }, 500);
  }
});
