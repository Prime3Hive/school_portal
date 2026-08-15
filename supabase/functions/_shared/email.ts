// Shared transactional mail for every edge function.
//
// One place decides which mailbox a message comes from, what the shell looks
// like, and what happens when Resend is down. Functions call send() and move on.
//
// WHY THE SENDER MATTERS
// ---------------------
// Replies to these emails go to a real human, so the from-address is chosen by
// who should answer, not by convenience:
//
//   support@      accounts, invitations, password resets, portal problems
//   finance@      receipts, fee notices, anything about money
//   headteacher@  admissions decisions and official school correspondence
//
// A receipt sent from support@ lands the fee queries in the wrong inbox, so
// pick the sender deliberately at each call site.
//
// Env (set with `supabase secrets set`):
//   RESEND_API_KEY   required — without it send() no-ops and reports why
//   MAIL_DOMAIN      optional — defaults to tbdacademy.org
//   SCHOOL_NAME      optional — display name on the from-address
//   APP_URL          optional — absolute base for links inside emails

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const MAIL_DOMAIN    = (Deno.env.get("MAIL_DOMAIN") || "tbdacademy.org").trim();

export const SCHOOL_NAME = (Deno.env.get("SCHOOL_NAME") || "TBD International Academy").trim();

/** Absolute base URL for links in emails. Never taken from a request header:
 *  a link in an email outlives the request that produced it, and Origin is
 *  caller-supplied. */
export const APP_URL = (Deno.env.get("APP_URL") || "https://tbdacademy.org").trim().replace(/\/+$/, "");

export type MailboxName = "support" | "finance" | "headteacher";

interface Mailbox {
  address: string;
  label: string;
}

export const MAILBOX: Record<MailboxName, Mailbox> = {
  support:     { address: `support@${MAIL_DOMAIN}`,     label: `${SCHOOL_NAME}` },
  finance:     { address: `finance@${MAIL_DOMAIN}`,     label: `${SCHOOL_NAME} Finance Office` },
  headteacher: { address: `headteacher@${MAIL_DOMAIN}`, label: `${SCHOOL_NAME} Admissions` },
};

export interface SendResult {
  sent: boolean;
  /** Safe to surface to an admin in the UI; never contains the API key. */
  message: string;
  id?: string;
}

interface SendOptions {
  from: MailboxName;
  to: string | string[];
  subject: string;
  html: string;
  /** Defaults to the from-mailbox, which is what we want almost every time. */
  replyTo?: string;
  bcc?: string | string[];
}

/**
 * Send one transactional email.
 *
 * Never throws. Mail is a side effect of an operation that has already
 * succeeded — an invitation row is written, a payment is settled — so a mail
 * outage must not roll any of that back or turn a 200 into a 500. Callers get
 * a result they can report and carry on.
 */
export async function send(options: SendOptions): Promise<SendResult> {
  const mailbox = MAILBOX[options.from];

  if (!RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not set — skipped "${options.subject}"`);
    return { sent: false, message: "Email service is not configured (RESEND_API_KEY missing)." };
  }

  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const valid = recipients.filter(isEmail);
  if (valid.length === 0) {
    return { sent: false, message: "No valid recipient address." };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${mailbox.label} <${mailbox.address}>`,
        to: valid,
        bcc: options.bcc,
        reply_to: options.replyTo || mailbox.address,
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!res.ok) {
      // Resend echoes the request back on some errors, so log the status and
      // its message rather than dumping a body that can contain the payload.
      const body = await res.text();
      console.error(`[email] Resend ${res.status} for "${options.subject}": ${body.slice(0, 500)}`);
      return {
        sent: false,
        message: res.status === 403
          ? `Resend rejected ${mailbox.address} — is ${MAIL_DOMAIN} verified?`
          : `Email service error (HTTP ${res.status}).`,
      };
    }

    const body = await res.json().catch(() => ({}));
    console.log(`[email] Sent "${options.subject}" from ${mailbox.address} to ${valid.length} recipient(s)`);
    return { sent: true, message: `Email sent to ${valid.join(", ")}`, id: body?.id };
  } catch (err) {
    console.error("[email] Send failed:", err);
    return { sent: false, message: "Email service unavailable." };
  }
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

// ── Presentation ─────────────────────────────────────────────────────────────
// Inline styles only, and a table-free single column: Outlook and Gmail's
// clipping both punish anything cleverer. Brand colours mirror js/config.js.

const NAVY = "#1E2A5A";
const RED  = "#E23C3C";

/** Escape a value that is interpolated into email HTML. Applicant names and
 *  references reach these templates straight from user input. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function money(amount: number): string {
  return `&#8358;${Number(amount || 0).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

interface LayoutOptions {
  /** Banner headline. */
  title: string;
  /** Small line under the headline. */
  subtitle?: string;
  /** Already-escaped HTML for the body. */
  body: string;
  /** Which mailbox signs off, so the footer tells people where to reply. */
  from: MailboxName;
}

export function layout({ title, subtitle, body, from }: LayoutOptions): string {
  const mailbox = MAILBOX[from];
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#2c3143;">
  <div style="max-width:600px;margin:0 auto;padding:24px 12px;">
    <div style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 14px rgba(30,42,90,0.10);">

      <div style="background:${NAVY};color:#ffffff;padding:32px 28px;text-align:center;">
        <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:0.75;">${esc(SCHOOL_NAME)}</div>
        <h1 style="margin:10px 0 0;font-size:23px;font-weight:700;">${esc(title)}</h1>
        ${subtitle ? `<p style="margin:8px 0 0;font-size:15px;opacity:0.85;">${esc(subtitle)}</p>` : ""}
        <div style="width:52px;height:3px;background:${RED};margin:18px auto 0;border-radius:2px;"></div>
      </div>

      <div style="padding:32px 28px;font-size:15px;">
        ${body}
      </div>

      <div style="background:#f6f7fb;padding:22px 28px;text-align:center;border-top:1px solid #e6e9f2;">
        <p style="margin:0;font-size:13px;color:#6b7280;">
          Reply to this email or write to
          <a href="mailto:${mailbox.address}" style="color:${NAVY};">${mailbox.address}</a>.
        </p>
        <p style="margin:8px 0 0;font-size:12px;color:#9aa1af;">
          ${esc(SCHOOL_NAME)} &middot; Behind Civil Service Commission, Kertyo, Makurdi, Benue State<br>
          <a href="${APP_URL}" style="color:#9aa1af;">${esc(APP_URL.replace(/^https?:\/\//, ""))}</a>
          &middot; &copy; ${new Date().getFullYear()}
        </p>
      </div>

    </div>
  </div>
</body>
</html>`;
}

/** Primary call-to-action button. `href` must be a URL we constructed. */
export function button(href: string, label: string): string {
  return `<div style="text-align:center;margin:30px 0;">
    <a href="${href}" style="display:inline-block;background:${NAVY};color:#ffffff;padding:14px 40px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">${esc(label)}</a>
  </div>`;
}

/** Boxed label/value list — credentials, receipt lines, application summaries. */
export function detailRows(rows: Array<[string, string]>): string {
  const cells = rows.map(([label, value]) => `
    <tr>
      <td style="padding:7px 0;color:#6b7280;font-size:14px;width:44%;vertical-align:top;">${esc(label)}</td>
      <td style="padding:7px 0;font-size:14px;font-weight:600;color:${NAVY};">${value}</td>
    </tr>`).join("");

  return `<div style="background:#f6f7fb;border:1px solid #e6e9f2;border-radius:10px;padding:18px 20px;margin:24px 0;">
    <table style="width:100%;border-collapse:collapse;">${cells}</table>
  </div>`;
}

/** Monospaced value for things people must copy exactly. */
export function code(value: string): string {
  return `<code style="background:#ffffff;border:1px solid #e6e9f2;border-radius:5px;padding:3px 10px;font-family:'Courier New',monospace;font-size:15px;font-weight:700;color:${NAVY};">${esc(value)}</code>`;
}

/** Amber caution panel. */
export function notice(text: string): string {
  return `<div style="background:#fff8e6;border:1px solid #ffe3a3;border-radius:8px;padding:14px 16px;margin-top:24px;">
    <p style="margin:0;font-size:14px;color:#8a6100;">${text}</p>
  </div>`;
}
