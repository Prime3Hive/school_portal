import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

// C4: Fail loudly on startup when the secret is missing so ops get a clear signal
const PAYSTACK_SECRET     = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
const SUPABASE_URL        = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!PAYSTACK_SECRET) {
  console.error("[FATAL] PAYSTACK_SECRET_KEY is not set. All webhooks will return 503 until this is fixed.");
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("[FATAL] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.");
}

interface WebhookEvent {
  event: string;
  data: {
    reference: string;
    amount: number;
    status: string;
    customer: { email: string };
    metadata?: Record<string, unknown>;
  };
}

function hexToBytes(hex: string): Uint8Array | null {
  const normalized = (hex || "").trim().toLowerCase();
  if (!normalized || normalized.length % 2 !== 0 || /[^0-9a-f]/.test(normalized)) return null;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
  try {
    if (!PAYSTACK_SECRET) return false; // already logged at startup
    if (!signature) {
      console.warn("Missing x-paystack-signature header");
      return false;
    }

    const subtle = crypto.subtle;
    const key = await subtle.importKey(
      "raw",
      new TextEncoder().encode(PAYSTACK_SECRET),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"],
    );
    const expectedSigBuffer = await subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const expectedSigBytes  = new Uint8Array(expectedSigBuffer);
    const receivedSigBytes  = hexToBytes(signature);
    if (!receivedSigBytes) {
      console.warn("Invalid signature format received");
      return false;
    }
    return timingSafeEqual(expectedSigBytes, receivedSigBytes);
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-paystack-signature",
};

serve(async (req: Request) => {
  // H12: Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  // C4: Return 503 if env vars missing — distinct from 401 so ops can differentiate
  if (!PAYSTACK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    console.error("[Webhook] Missing required environment variables");
    return new Response(JSON.stringify({ error: "Service configuration error" }), {
      status: 503,
      headers: CORS_HEADERS,
    });
  }

  try {
    const signature = req.headers.get("x-paystack-signature") || "";
    const bodyText  = await req.text();

    if (!(await verifyWebhookSignature(bodyText, signature))) {
      console.warn("Invalid webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    const event: WebhookEvent = JSON.parse(bodyText);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const ref      = event.data.reference;

    console.log(`Processing webhook: ${event.event} | ref: ${ref}`);

    // C2: Use stable event_id (reference + event type) so retries hit UNIQUE and are ignored
    const stableEventId = `${ref}:${event.event}`;
    await supabase.from("paystack_webhook_events").upsert(
      {
        event_id:   stableEventId,
        event_type: event.event,
        reference:  ref,
        amount:     event.data.amount,
        status:     event.data.status,
        metadata:   event.data.metadata,
        received_at: new Date().toISOString(),
      },
      { onConflict: "event_id", ignoreDuplicates: true }
    );

    // H11: Handle charge.failed — release the pending state so the student can retry
    if (event.event === "charge.failed") {
      console.log(`charge.failed received for ref: ${ref} — marking payment failed`);

      // Scope to gateway payments: a bank deposit sits in 'pending' with a
      // teller number in transaction_ref, and must not be touched by a
      // gateway event that happens to carry a similar reference.
      const { error: failErr } = await supabase
        .from("fees_payments")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("transaction_ref", ref)
        .eq("status", "pending")
        .eq("payment_method", "paystack");

      if (failErr) console.error("Failed to mark payment as failed:", failErr);

      // Application fees live in their own table.
      await supabase
        .from("payment_transactions")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: "Paystack reported charge.failed",
        })
        .eq("reference", ref)
        .in("status", ["pending", "processing"]);

      // C3: Clear idempotency lock so student can retry with a new reference
      await supabase
        .from("payment_idempotency")
        .update({ status: "failed", processed_at: new Date().toISOString() })
        .eq("paystack_reference", ref);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    // Only continue processing for charge.success
    if (event.event !== "charge.success") {
      console.log(`Ignoring non-actionable event: ${event.event}`);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS_HEADERS });
    }

    // Check idempotency: has this reference already been processed?
    const { data: existing } = await supabase
      .from("payment_idempotency")
      .select("payment_id, status")
      .eq("paystack_reference", ref)
      .maybeSingle();

    if (existing?.status === "processed") {
      console.log(`Payment already processed: ${ref}`);
      return new Response(JSON.stringify({ success: true, cached: true }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    // ── Application fees ──────────────────────────────────────────────────
    // These live in payment_transactions, not fees_payments. Handling them here
    // is what makes the browser's "payment succeeded" claim irrelevant: this
    // signed webhook is the authority that marks the fee paid.
    const { data: appTxn } = await supabase
      .from("payment_transactions")
      .select("id, amount, status, application_number")
      .eq("reference", ref)
      .eq("transaction_type", "application_fee")
      .maybeSingle();

    if (appTxn) {
      const expectedAppKobo = Math.round(Number(appTxn.amount) * 100);
      if (event.data.amount < expectedAppKobo) {
        console.error(`Application fee underpaid on ${ref}: got ${event.data.amount}, expected ${expectedAppKobo}`);
        await supabase.from("paystack_webhook_events").update({
          processing_error: `Application fee underpaid: expected ${expectedAppKobo}, got ${event.data.amount}`,
          processed: true,
        }).eq("event_id", stableEventId);
        return new Response(JSON.stringify({ error: "Amount mismatch" }), { status: 400, headers: CORS_HEADERS });
      }

      await supabase
        .from("payment_transactions")
        .update({
          status: "success",
          completed_at: new Date().toISOString(),
          gateway_reference: ref,
          callback_data: event.data as unknown as Record<string, unknown>,
        })
        .eq("id", appTxn.id);

      // The application row may not exist yet (the applicant's browser posts it
      // moments later) — that is fine, submit-application performs its own
      // verify call. When it does exist, confirm the fee here as a safety net.
      //
      // Scoped deliberately:
      //   - payment_method must be 'paystack'. A bank-transfer application
      //     stores the applicant's own teller number in payment_reference, and
      //     that value is attacker-chosen. Without this filter, someone could
      //     file a bank-transfer application with reference "X", then push a ₦1
      //     Paystack charge also referenced "X" and have their unpaid fee
      //     marked settled.
      //   - the charge must cover the fee recorded on the application itself,
      //     not the amount quoted in the (browser-created) transaction row.
      const { data: appRow } = await supabase
        .from("applications")
        .select("id, application_fee_amount")
        .eq("payment_reference", ref)
        .eq("payment_method", "paystack")
        .eq("application_fee_paid", false)
        .maybeSingle();

      if (appRow) {
        const requiredKobo = Math.round(Number(appRow.application_fee_amount) * 100);
        if (event.data.amount < requiredKobo) {
          console.error(`Refusing to confirm application ${appRow.id}: paid ${event.data.amount}, fee is ${requiredKobo}`);
        } else {
          const { error: appErr } = await supabase
            .from("applications")
            .update({
              application_fee_paid: true,
              payment_verified_at: new Date().toISOString(),
            })
            .eq("id", appRow.id)
            .eq("application_fee_paid", false);
          if (appErr) console.error("Failed to confirm application fee:", appErr);
        }
      }

      console.log(`Application fee confirmed: ${ref}`);
      return new Response(JSON.stringify({ success: true, type: "application_fee" }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    // ── School fees ───────────────────────────────────────────────────────
    // Prefer a pending row (payment recorded before the charge). Fall back to
    // any row with this reference, because the student portal currently writes
    // the record from its success callback — without this fallback every
    // charge.success 404s and Paystack retries the endpoint indefinitely.
    let pendingFee: { id: string; student_id: string; amount: number } | null = null;

    const { data: pendingRow } = await supabase
      .from("fees_payments")
      .select("id, student_id, amount")
      .eq("transaction_ref", ref)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingRow) {
      pendingFee = pendingRow;
    } else {
      const { data: anyRow } = await supabase
        .from("fees_payments")
        .select("id, student_id, amount")
        .eq("transaction_ref", ref)
        .maybeSingle();
      pendingFee = anyRow;
    }

    if (!pendingFee) {
      // Record it for reconciliation and ACK, so Paystack stops retrying a
      // reference we genuinely have no record of.
      console.error(`No payment record found for reference: ${ref}`);
      await supabase.from("paystack_webhook_events").update({
        processing_error: "No matching payment record — needs manual reconciliation",
        processed: true,
      }).eq("event_id", stableEventId);
      return new Response(JSON.stringify({ success: true, unreconciled: true }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    // Verify amount (convert Naira → kobo for comparison).
    // Underpayment is rejected; overpayment is accepted and reconciled later.
    const expectedKobo = Math.round(pendingFee.amount * 100);
    if (event.data.amount < expectedKobo) {
      console.error(`Amount mismatch for ${ref}: expected ${expectedKobo} kobo, got ${event.data.amount}`);
      await supabase
        .from("paystack_webhook_events")
        .update({
          processing_error: `Amount mismatch: expected ${expectedKobo}, got ${event.data.amount}`,
          processed: true,
        })
        .eq("event_id", stableEventId);
      return new Response(JSON.stringify({ error: "Amount mismatch" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    // Mark payment paid
    const { error: paymentError } = await supabase
      .from("fees_payments")
      .update({
        status:      "paid",
        verified_at: new Date().toISOString(),
        verified_by: "paystack-webhook",
      })
      .eq("id", pendingFee.id);

    if (paymentError) throw paymentError;

    // C3: Upsert idempotency record so it succeeds even if client never created one
    await supabase
      .from("payment_idempotency")
      .upsert(
        {
          paystack_reference: ref,
          payment_id:         pendingFee.id,
          student_id:         pendingFee.student_id,
          amount:             pendingFee.amount,
          status:             "processed",
          processed_at:       new Date().toISOString(),
        },
        { onConflict: "paystack_reference" }
      );

    // Audit log
    await supabase.from("payment_transaction_logs").insert({
      payment_id:       pendingFee.id,
      transaction_type: "VERIFIED",
      performer_email:  "paystack-webhook@system",
      new_state:        { status: "paid", verified_at: new Date().toISOString() },
      details:          { webhook_reference: ref },
    });

    console.log(`Successfully processed payment: ${ref}`);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: CORS_HEADERS,
    });

  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
