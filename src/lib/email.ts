import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

const BRAND = {
  ink: "#1a1a1a",
  muted: "#6b7280",
  spark: "#f59e0b",
  rule: "#e5e7eb",
  paper: "#fafafa",
  white: "#ffffff",
  money: "#10b981",
};

function wrapper(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:${BRAND.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.paper};padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          
          <!-- Logo -->
          <tr>
            <td style="padding:0 0 24px 0;text-align:center;">
              <span style="font-size:22px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.5px;">SparkBooks</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:${BRAND.white};border-radius:16px;border:1px solid ${BRAND.rule};padding:32px 28px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:${BRAND.muted};line-height:1.6;">
                &copy; ${new Date().getFullYear()} SparkBooks &mdash; AI bookkeeping on WhatsApp
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendTeamInviteEmail(
  toEmail: string,
  businessName: string,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://sparkbooks-jade.vercel.app";

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-bottom:8px;">
          <h2 style="margin:0;font-size:20px;font-weight:700;color:${BRAND.ink};line-height:1.3;">
            You've been invited
          </h2>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:15px;color:${BRAND.muted};line-height:1.6;">
            <strong style="color:${BRAND.ink};">${businessName}</strong> has invited you to join their SparkBooks account. You'll share the same WhatsApp number and bookkeeping records with their team.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;">
          <a
            href="${siteUrl}/sign-up"
            style="display:inline-block;padding:14px 32px;background-color:${BRAND.ink};color:${BRAND.white};text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;text-align:center;"
          >
            Accept Invitation
          </a>
        </td>
      </tr>
      <tr>
        <td>
          <p style="margin:0;font-size:12px;color:${BRAND.muted};line-height:1.6;">
            You'll need to create a SparkBooks account with <strong style="color:${BRAND.ink};">${toEmail}</strong>. If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>`;

  const fromEmail = process.env.RESEND_FROM_EMAIL || "SparkBooks <onboarding@resend.dev>";

  try {
    const resend = new Resend(apiKey);
    const res = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `${businessName} invited you to SparkBooks`,
      html: wrapper(content),
    });

    if (res.error) {
      console.warn("Resend email delivery notice:", res.error.message);
      return { success: false, error: res.error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.warn("Resend email delivery exception:", err?.message || err);
    return { success: false, error: err?.message || "Email delivery failed" };
  }
}
