// submit-application — the only way an application row is created.
//
// Replaces the previous flow, where the browser inserted directly into
// `applications` with whatever it wanted in `application_fee_paid`. The anon
// key ships in the page source, so that amounted to "anyone on the internet
// may grant themselves a paid admission".
//
// This function:
//   1. validates and normalises the submitted fields
//   2. reads the fee for the grade from the DB (never from the client)
//   3. for Paystack, calls the Paystack verify API with the SECRET key and
//      requires status=success, currency=NGN and amount >= the expected fee
//   4. rejects references already spent on another application
//   5. rate-limits per email
//   6. inserts with the service-role key
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PAYSTACK_SECRET_KEY
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PAYSTACK_SECRET       = Deno.env.get("PAYSTACK_SECRET_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// How many applications one email may submit per hour.
const RATE_LIMIT_PER_HOUR = 5;

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^[0-9+\-()\s]{10,20}$/;

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Documents are uploaded straight to Storage by the browser; make sure the
 *  URLs we persist actually point at our own bucket and not somewhere an
 *  attacker controls (those URLs are later rendered in the admin console). */
function safeStorageUrl(v: unknown): string | null {
  const s = str(v, 1000);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return null;
    if (!SUPABASE_URL || u.origin !== new URL(SUPABASE_URL).origin) return null;
    if (!u.pathname.includes("/storage/v1/object/")) return null;
    return u.href;
  } catch {
    return null;
  }
}

interface PaystackVerify {
  status: boolean;
  message?: string;
  data?: {
    status: string;
    amount: number;
    currency: string;
    reference: string;
    customer?: { email?: string };
  };
}

async function verifyPaystackCharge(reference: string) {
  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } },
  );
  if (!res.ok) {
    return { ok: false as const, error: `Paystack verification failed (HTTP ${res.status}).` };
  }
  const body = (await res.json()) as PaystackVerify;
  if (!body.status || !body.data) {
    return { ok: false as const, error: body.message || "Paystack did not recognise this reference." };
  }
  return { ok: true as const, data: body.data };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    console.error("[submit-application] Missing Supabase env vars");
    return json({ success: false, error: "Service configuration error." }, 503);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, error: "Invalid request body." }, 400);
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

  // ── 1. Validate ────────────────────────────────────────────────────────────
  const studentName  = str(payload.studentName, 120);
  const grade        = str(payload.grade, 40);
  const parentName   = str(payload.parentName, 120);
  const parentEmail  = str(payload.parentEmail, 160).toLowerCase();
  const parentPhone  = str(payload.parentPhone, 40);
  const paymentMethod = str(payload.paymentMethod, 20);

  if (!studentName || !grade || !parentName || !parentEmail || !parentPhone) {
    return json({ success: false, error: "Missing required applicant details." }, 400);
  }
  if (!EMAIL_RE.test(parentEmail)) {
    return json({ success: false, error: "Invalid email address." }, 400);
  }
  if (!PHONE_RE.test(parentPhone)) {
    return json({ success: false, error: "Invalid phone number." }, 400);
  }
  if (paymentMethod !== "paystack" && paymentMethod !== "bank-transfer") {
    return json({ success: false, error: "Unsupported payment method." }, 400);
  }

  const studentGender = str(payload.studentGender, 10).toLowerCase();
  if (studentGender && !["male", "female", "other"].includes(studentGender)) {
    return json({ success: false, error: "Invalid gender value." }, 400);
  }

  let studentDob: string | null = str(payload.studentDob, 10) || null;
  if (studentDob) {
    const d = new Date(studentDob);
    if (Number.isNaN(d.getTime()) || d > new Date()) {
      return json({ success: false, error: "Invalid date of birth." }, 400);
    }
    studentDob = d.toISOString().slice(0, 10);
  }

  // ── 2. Fee comes from the database, never the browser (M1) ────────────────
  const { data: feeRow, error: feeErr } = await db
    .from("application_fee_schedule")
    .select("amount")
    .eq("grade", grade)
    .maybeSingle();

  if (feeErr) {
    console.error("[submit-application] Fee lookup failed:", feeErr);
    return json({ success: false, error: "Could not determine the application fee." }, 500);
  }
  if (!feeRow) {
    return json({ success: false, error: `Applications are not open for "${grade}".` }, 400);
  }
  const feeAmount = Number(feeRow.amount);

  // ── 3. Rate limit ─────────────────────────────────────────────────────────
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count: recentCount } = await db
    .from("applications")
    .select("id", { count: "exact", head: true })
    .ilike("parent_email", parentEmail)
    .gte("submitted_date", oneHourAgo);

  if ((recentCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return json(
      { success: false, error: "Too many applications from this email address. Please try again later." },
      429,
    );
  }

  // ── 4. Duplicate applicant guard (server-side this time) ──────────────────
  // Only open or already-approved applications block a resubmission; a rejected
  // family must be able to re-apply (M5).
  const { data: dupes } = await db
    .from("applications")
    .select("application_number, status")
    .ilike("student_name", studentName)
    .eq("grade", grade)
    .in("status", ["pending", "approved"])
    .limit(1);

  if (dupes && dupes.length > 0) {
    return json({
      success: false,
      error: `An application for "${studentName}" in ${grade} already exists (Ref: ${dupes[0].application_number}). Contact the school if this is a different student.`,
    }, 409);
  }

  // ── 5. Payment ────────────────────────────────────────────────────────────
  let feePaid = false;
  let paymentReference: string | null = null;
  let verifiedAt: string | null = null;

  if (paymentMethod === "paystack") {
    if (!PAYSTACK_SECRET) {
      console.error("[submit-application] PAYSTACK_SECRET_KEY is not set");
      return json({ success: false, error: "Payment verification is unavailable. Contact the school." }, 503);
    }

    paymentReference = str(payload.paymentReference, 100);
    if (!paymentReference) {
      return json({ success: false, error: "Missing payment reference." }, 400);
    }

    const verification = await verifyPaystackCharge(paymentReference);
    if (!verification.ok) {
      return json({ success: false, error: verification.error }, 402);
    }

    const charge = verification.data;
    if (charge.status !== "success") {
      return json({ success: false, error: `Payment was not completed (status: ${charge.status}).` }, 402);
    }
    if ((charge.currency || "").toUpperCase() !== "NGN") {
      return json({ success: false, error: "Payment currency mismatch." }, 402);
    }
    // Bind the charge to the applicant. The popup is opened with the form's
    // email, so these always match for a genuine submission; a mismatch means
    // someone is trying to attach a charge they did not make (for example an
    // abandoned reference belonging to another applicant).
    const chargeEmail = (charge.customer?.email || "").trim().toLowerCase();
    if (chargeEmail && chargeEmail !== parentEmail) {
      console.warn(`[submit-application] Email mismatch on ${paymentReference}: charge=${chargeEmail} form=${parentEmail}`);
      return json({
        success: false,
        error: "This payment was made with a different email address. Use the email the payment was made with, or contact the school.",
      }, 402);
    }

    // Paystack reports kobo. Allow overpayment, never underpayment.
    if (Number(charge.amount) < Math.round(feeAmount * 100)) {
      console.warn(`[submit-application] Underpayment on ${paymentReference}: got ${charge.amount}, expected ${Math.round(feeAmount * 100)}`);
      return json({
        success: false,
        error: `The amount paid is less than the ₦${feeAmount.toLocaleString()} application fee. Contact the school with reference ${paymentReference}.`,
      }, 402);
    }

    feePaid = true;
    verifiedAt = new Date().toISOString();
  } else {
    // Bank transfer: unverified until an admin checks the teller slip.
    paymentReference = str(payload.bankTransactionRef, 100);
    if (!paymentReference) {
      return json({ success: false, error: "Missing bank transaction reference." }, 400);
    }
  }

  // Reference reuse (M2) — the unique indexes are the real guard; this exists
  // to return a readable message instead of a constraint violation.
  const { data: refInUse } = await db
    .from("applications")
    .select("application_number")
    .ilike("payment_reference", paymentReference)
    .limit(1);

  if (refInUse && refInUse.length > 0) {
    return json({
      success: false,
      error: `Payment reference ${paymentReference} has already been used for application ${refInUse[0].application_number}.`,
    }, 409);
  }

  // ── 6. Insert ─────────────────────────────────────────────────────────────
  const { data: appNumber, error: numErr } = await db.rpc("generate_application_number");
  if (numErr || !appNumber) {
    console.error("[submit-application] Number generation failed:", numErr);
    return json({ success: false, error: "Could not generate an application number." }, 500);
  }

  const addr = (payload.parentAddress ?? {}) as Record<string, unknown>;
  const row = {
    application_number: appNumber,
    student_name:  studentName,
    student_dob:   studentDob,
    student_gender: studentGender || null,
    grade,
    previous_school: str(payload.previousSchool, 160) || null,
    parent_name:  parentName,
    parent_email: parentEmail,
    parent_phone: parentPhone,
    parent_address: {
      street: str(addr.street, 200),
      city:   str(addr.city, 80),
      state:  str(addr.state, 80),
    },
    application_form_url:  safeStorageUrl(payload.applicationFormUrl),
    birth_certificate_url: safeStorageUrl(payload.birthCertificateUrl),
    passport_photo_url:    safeStorageUrl(payload.passportPhotoUrl),
    previous_report_url:   safeStorageUrl(payload.previousReportUrl),
    receipt_url:           safeStorageUrl(payload.receiptUrl),
    application_fee_amount: feeAmount,
    application_fee_paid:   feePaid,
    payment_reference:      paymentReference,
    payment_date:           new Date().toISOString(),
    payment_method:         paymentMethod,
    payment_verified_at:    verifiedAt,
    status:                 "pending",
    submitted_date:         new Date().toISOString(),
  };

  const { data: inserted, error: insertErr } = await db
    .from("applications")
    .insert(row)
    .select("id, application_number, student_name, grade, status, application_fee_paid, application_fee_amount, payment_method")
    .single();

  if (insertErr) {
    // 23505 = unique_violation: the reference or number was taken between our
    // check and the insert. The applicant has already been charged, so this is
    // logged loudly for reconciliation.
    console.error(`[submit-application] Insert failed (ref ${paymentReference}):`, insertErr);
    const duplicate = (insertErr as { code?: string }).code === "23505";
    return json({
      success: false,
      error: duplicate
        ? `This payment has already been recorded against an application. Contact the school with reference ${paymentReference}.`
        : "Your payment was received but the application could not be saved. Please contact the school with your payment reference.",
      reference: paymentReference,
    }, duplicate ? 409 : 500);
  }

  // ── 7. Settle the client-side transaction record (best effort) ────────────
  if (paymentMethod === "paystack") {
    const { error: txnErr } = await db
      .from("payment_transactions")
      .update({
        status: "success",
        completed_at: new Date().toISOString(),
        gateway_reference: paymentReference,
        application_number: appNumber,
      })
      .eq("reference", paymentReference);
    if (txnErr) console.warn("[submit-application] Transaction update failed:", txnErr.message);
  }

  console.log(`[submit-application] Recorded ${appNumber} (${paymentMethod}, paid=${feePaid})`);
  return json({ success: true, application: inserted });
});
