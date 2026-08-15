// Account provisioning — the pieces both create-account and resend-credentials
// need, in one place so the two can never drift apart.
//
// THE MODEL
// ---------
// There is no self-signup and no invitation to accept. An admin fills a form,
// the account exists immediately, and Resend mails the credentials. The first
// login forces a password change (profiles.must_change_password), which is what
// makes it safe to send a password by email at all.
//
// An earlier design created an `invitations` row first and the auth user only
// when the recipient clicked a link. Nothing ever created that user, so no
// invitation could be accepted. Issue the account up front and there is no
// second step to get wrong.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { SCHOOL_NAME, APP_URL, button, code, detailRows, esc, layout, notice } from "./email.ts";

export const ROLES = ["admin", "teacher", "staff", "student", "guardian"] as const;
export type Role = typeof ROLES[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  teacher: "Teacher",
  staff: "Staff Member",
  student: "Student",
  guardian: "Parent / Guardian",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] || role;
}

const ROLE_PREFIXES: Record<Role, string> = {
  admin: "ADM",
  teacher: "TCH",
  staff: "STF",
  student: "STU",
  guardian: "GDN",
};

// ── Randomness ───────────────────────────────────────────────────────────────

/** Cryptographically uniform integer in [0, max). Rejection-samples so the
 *  tail of the uint32 range cannot bias the low values (plain `% max` does). */
export function secureRandomInt(max: number): number {
  const limit = Math.floor(0xFFFFFFFF / max) * max;
  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % max;
}

/** 12 characters from an unambiguous alphabet — no O/0, I/1/l. These get read
 *  off a screen and typed by an eight-year-old, so shape matters more than the
 *  extra two bits a fuller alphabet would buy. */
export function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let password = "";
  for (let i = 0; i < 12; i++) password += chars.charAt(secureRandomInt(chars.length));
  return password;
}

function buildSchoolId(role: string): string {
  const year = new Date().getFullYear();
  const prefix = ROLE_PREFIXES[role as Role] || "USR";
  // 6 digits. The old 3-digit space held 900 ids per role per year, so by the
  // birthday bound a collision was more likely than not at ~35 users.
  return `${prefix}-${year}-${100000 + secureRandomInt(900000)}`;
}

/**
 * Allocate a school ID that no profile already holds.
 *
 * Requires a service-role client: `profiles` is RLS-protected, and a lookup
 * that silently returns zero rows would hand the same ID to two people.
 */
export async function allocateSchoolId(adminClient: SupabaseClient, role: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = buildSchoolId(role);
    const { data } = await adminClient.from("profiles").select("school_id").eq("school_id", candidate).maybeSingle();
    if (!data) return candidate;
    console.warn(`[accounts] school ID collision on ${candidate} — retry ${attempt + 1}`);
  }
  throw new Error("Could not allocate a unique school ID after 10 attempts");
}

/** Supabase Auth is keyed on an email, but nobody signs in with one. The portal
 *  derives a stable internal address from the school ID; login.html does the
 *  same in js/supabase-client.js and the two must agree exactly. */
export function schoolIdToEmail(schoolId: string): string {
  return `${schoolId.toLowerCase().replace(/\s+/g, "-")}@tbd.internal`;
}

// ── Credential email ─────────────────────────────────────────────────────────

export interface CredentialMail {
  fullName: string;
  role: string;
  schoolId: string;
  password: string;
  grade?: string | null;
  section?: string | null;
  /** Reissue wording — "here is your new password", not "welcome". */
  reissued?: boolean;
}

/**
 * The one credential email. Both issuing and reissuing land here so a password
 * always arrives looking the same, from support@, with the same change-it-now
 * instruction attached.
 */
export function credentialEmail(data: CredentialMail): string {
  const label = roleLabel(data.role);

  const rows: Array<[string, string]> = [
    ["Login ID", code(data.schoolId)],
    ["Password", code(data.password)],
    ["Role", esc(label)],
  ];
  if (data.grade) {
    rows.push(["Class", esc(data.section ? `${data.grade} — ${data.section}` : data.grade)]);
  }

  const opening = data.reissued
    ? `Your password for the ${esc(SCHOOL_NAME)} portal has been reset by an administrator.
       The previous one no longer works — sign in with the details below.`
    : `An account has been created for you on the ${esc(SCHOOL_NAME)} portal.
       You can sign in with the details below right away.`;

  return layout({
    from: "support",
    title: data.reissued ? "Your new portal password" : "Your portal account is ready",
    subtitle: data.reissued ? `${label} account` : `Account created as ${label}`,
    body: `
      <p style="margin:0 0 18px;">Hello <strong>${esc(data.fullName)}</strong>,</p>
      <p style="margin:0 0 8px;color:#4b5162;">${opening}</p>
      ${detailRows(rows)}
      ${button(`${APP_URL}/login.html`, "Sign in to the portal")}
      ${notice(
        `<strong>You will be asked to choose a new password</strong> the first time you sign in. ` +
        `Keep these details private — anyone with them can see your records.`
      )}
      <p style="margin:24px 0 0;font-size:13px;color:#9aa1af;">
        Didn't expect this email? Reply and tell us — someone may have entered the wrong address.
      </p>`,
  });
}

// ── HTTP plumbing ────────────────────────────────────────────────────────────

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Service-role client. Bypasses RLS — only ever built after requireAdmin(). */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export interface AdminCaller {
  id: string;
  schoolId: string | null;
  fullName: string | null;
}

/**
 * Authorize the caller as an admin.
 *
 * Returns either the caller or a ready-to-return error Response — never throws,
 * so the handler reads as `if ("response" in gate) return gate.response;`.
 *
 * The role check runs through the *caller's* client, not the service-role one:
 * the caller's own RLS decides what they can see, and a service-role read here
 * would happily confirm a role for a token that cannot read its own profile.
 */
export async function requireAdmin(
  req: Request,
): Promise<{ caller: AdminCaller } | { response: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { response: json({ error: "Missing authorization header" }, 401) };
  }

  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error } = await callerClient.auth.getUser();
  if (error || !user) {
    return { response: json({ error: "Invalid or expired session. Please sign in again." }, 401) };
  }

  const { data: profile } = await callerClient
    .from("profiles").select("role, school_id, full_name").eq("id", user.id).maybeSingle();

  if (!profile || profile.role !== "admin") {
    return { response: json({ error: "Only administrators can manage accounts." }, 403) };
  }

  return {
    caller: { id: user.id, schoolId: profile.school_id ?? null, fullName: profile.full_name ?? null },
  };
}
