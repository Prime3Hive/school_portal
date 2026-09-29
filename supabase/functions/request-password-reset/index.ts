// request-password-reset — "Forgot password?" on the sign-in page.
//
// Public: the caller is by definition not signed in. So it answers every
// request the same way ("if that ID has an email on file, a link is on its
// way") and never says whether an ID exists, whether it has an email, or why
// nothing was sent.
//
// Nobody signs in with an email, and every auth user's address is an internal
// placeholder (STU-…@tbd.internal), so Supabase's own reset email would go
// nowhere. Instead this looks up the real address on the profile, asks
// Supabase for a one-time recovery token, and mails a link to
// reset-password.html carrying only the token hash. That page spends the
// token when the person submits a new password — not on load — so a mail
// scanner that opens links cannot use it up.
//
// Not sent (silently) for: unknown IDs, suspended accounts, placeholder
// addresses, administrators (reset by another admin — self-service reset on
// the most powerful accounts is the easiest takeover route), and a second
// request for the same ID within 15 minutes.
//
// Deploy with --no-verify-jwt is NOT required: the page calls it with the
// anon key, which is a valid JWT.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, APP_URL, SCHOOL_NAME

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { APP_URL, SCHOOL_NAME, button, esc, layout, notice, send } from "../_shared/email.ts";
import { audit, corsHeaders, isDeliverable, json, schoolIdToEmail, serviceClient } from "../_shared/accounts.ts";

const ID_PATTERN = /^(ADMIN|ADM|TCH|STF|STAFF|STU|GRD|GDN)-\d{4}(-\d{3,6})?$/;
const THROTTLE_MS = 15 * 60 * 1000;

const GENERIC = {
  success: true,
  message: "If that User ID has an email address on file, a link to choose a new password is on its way. " +
           "It works once, for one hour. No email? Ask the school office for a new password.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => null);
    const schoolId = String(body?.schoolId || "").trim().toUpperCase();
    if (!ID_PATTERN.test(schoolId)) return json({ error: "Enter your User ID, e.g. STU-2026-123456." }, 400);

    const admin = serviceClient();
    const { data: profile } = await admin
      .from("profiles").select("id, email, full_name, role, status").eq("school_id", schoolId).maybeSingle();

    if (!profile || (profile.status || "active") !== "active" || profile.role === "admin" || !isDeliverable(profile.email)) {
      return json(GENERIC);
    }

    const since = new Date(Date.now() - THROTTLE_MS).toISOString();
    const { count } = await admin.from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "PASSWORD_RESET_REQUESTED").eq("target", schoolId).gte("timestamp", since);
    if ((count ?? 0) > 0) return json(GENERIC);

    const { data: link, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: schoolIdToEmail(schoolId),
    });
    const tokenHash = link?.properties?.hashed_token;
    if (error || !tokenHash) {
      console.error("[request-password-reset] generateLink failed:", error?.message);
      return json(GENERIC);
    }

    const url = `${APP_URL}/reset-password.html?token_hash=${encodeURIComponent(tokenHash)}&id=${encodeURIComponent(schoolId)}`;
    const mail = await send({
      from: "support",
      to: profile.email,
      subject: `Choose a new ${SCHOOL_NAME} portal password`,
      html: layout({
        from: "support",
        title: "Choose a new password",
        subtitle: `User ID ${schoolId}`,
        body: `
          <p style="margin:0 0 18px;">Hello <strong>${esc(profile.full_name || schoolId)}</strong>,</p>
          <p style="margin:0 0 8px;color:#4b5162;">Someone asked to reset the password for this portal account.
             If it was you, choose a new one here:</p>
          ${button(url, "Choose a new password")}
          ${notice("The link works once and expires in one hour. Your current password keeps working until you choose a new one.")}
          <p style="margin:24px 0 0;font-size:13px;color:#9aa1af;">
            Didn't ask for this? Ignore this email — nothing changes. If it keeps happening, tell the school office.
          </p>`,
      }),
    });

    await audit(admin, null, "PASSWORD_RESET_REQUESTED", schoolId, { email_sent: mail.sent });
    return json(GENERIC);
  } catch (err) {
    console.error("[request-password-reset] unexpected:", err);
    return json(GENERIC);
  }
});
