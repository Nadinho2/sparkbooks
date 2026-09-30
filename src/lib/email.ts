import { Resend } from "resend";

const BRAND = {
  ink: "#111827",
  muted: "#4b5563",
  subtle: "#9ca3af",
  spark: "#f59e0b",
  sparkBg: "#fef3c7",
  rule: "#e5e7eb",
  paper: "#f9fafb",
  white: "#ffffff",
  money: "#10b981",
  moneyBg: "#d1fae5",
  danger: "#ef4444",
  dangerBg: "#fee2e2",
};

function getSiteUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://www.sparkbooks.com.ng";
  return url.replace(/\/$/, "");
}

function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || "SparkBooks <noreply@sparkbooks.com.ng>";
}

function wrapper(content: string, options?: { previewText?: string }): string {
  const siteUrl = getSiteUrl();
  const currentYear = new Date().getFullYear();
  const preview = options?.previewText
    ? `<div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${options.previewText}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SparkBooks</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  ${preview}
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.paper};padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
          
          <!-- Logo Header -->
          <tr>
            <td style="padding:0 0 24px 0;text-align:center;">
              <a href="${siteUrl}" style="text-decoration:none;">
                <span style="font-size:24px;font-weight:800;color:${BRAND.ink};letter-spacing:-0.5px;">Spark<span style="color:${BRAND.spark};">Books</span></span>
              </a>
              <div style="font-size:12px;color:${BRAND.subtle};margin-top:2px;letter-spacing:0.3px;">AI WhatsApp Bookkeeping</div>
            </td>
          </tr>

          <!-- Main Card Container -->
          <tr>
            <td style="background:${BRAND.white};border-radius:16px;border:1px solid ${BRAND.rule};padding:32px 28px;box-shadow:0 1px 3px rgba(0,0,0,0.03);">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 8px 0 8px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:12px;color:${BRAND.subtle};line-height:1.6;">
                &copy; ${currentYear} SparkBooks Nigeria &bull; <a href="${siteUrl}" style="color:${BRAND.muted};text-decoration:underline;">sparkbooks.com.ng</a>
              </p>
              <p style="margin:0;font-size:11px;color:${BRAND.subtle};line-height:1.5;">
                AI-powered bookkeeping on WhatsApp. Track sales, expenses, and inventory automatically.
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

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&bull;/g, "•")
    .replace(/&copy;/g, "©")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function sendMail(
  toEmail: string,
  subject: string,
  content: string,
  previewText?: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[Resend] RESEND_API_KEY not configured — skipping email dispatch");
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  try {
    const resend = new Resend(apiKey);
    const html = wrapper(content, { previewText });
    const text = htmlToPlainText(content);

    const res = await resend.emails.send({
      from: getFromEmail(),
      to: toEmail,
      replyTo: "SparkBooks Support <support@sparkbooks.com.ng>",
      subject,
      html,
      text,
    });

    if (res.error) {
      console.warn("[Resend] Delivery error:", res.error.message);
      return { success: false, error: res.error.message };
    }

    console.log(`[Resend] Successfully delivered message id: ${res.data?.id} to ${toEmail}`);
    return { success: true };
  } catch (err: any) {
    console.warn("[Resend] Delivery exception:", err?.message || err);
    return { success: false, error: err?.message || "Email delivery failed" };
  }
}

// ============================================================================
// 1. Direct Web Signup Welcome Email
// ============================================================================
export async function sendStoreWelcomeEmail(
  toEmail: string,
  businessName: string,
  botPhoneNumber?: string
): Promise<{ success: boolean; error?: string }> {
  const siteUrl = getSiteUrl();
  const phone = botPhoneNumber || "2348000000000";
  const botUrl = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi SparkBooks, I just registered ${businessName}`)}`;

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-bottom:14px;">
          <span style="background-color:${BRAND.sparkBg};color:#b45309;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Store Activated</span>
          <h1 style="margin:12px 0 0 0;font-size:22px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.4px;">
            Welcome to SparkBooks, ${businessName}!
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:18px;">
          <p style="margin:0;font-size:14px;color:${BRAND.muted};line-height:1.6;">
            Your automated bookkeeping ledger is live. You can now record daily sales, track expenses, and monitor stock directly through WhatsApp — no messy spreadsheets needed.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:22px;">
          <div style="background:#f9fafb;border:1px solid ${BRAND.rule};border-radius:12px;padding:16px;">
            <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:${BRAND.ink};text-transform:uppercase;letter-spacing:0.4px;">
              Try your first entry on WhatsApp:
            </p>
            <p style="margin:0 0 10px 0;font-size:13px;color:${BRAND.muted};line-height:1.5;">
              Send a simple message or voice note to our bot:
            </p>
            <div style="background:#ffffff;border:1px dashed ${BRAND.money};border-radius:8px;padding:10px 12px;font-family:monospace;font-size:13px;color:#065f46;font-weight:700;">
              "Sold 2 items for 15,000 cash"
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:22px;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="padding-bottom:10px;">
                <a href="${botUrl}" style="display:block;padding:14px 24px;background-color:${BRAND.money};color:${BRAND.white};text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;text-align:center;">
                  Open WhatsApp Bot 💬
                </a>
              </td>
            </tr>
            <tr>
              <td>
                <a href="${siteUrl}/dashboard" style="display:block;padding:14px 24px;background-color:${BRAND.ink};color:${BRAND.white};text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;text-align:center;">
                  Open Financial Dashboard 📊
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="border-top:1px solid #f3f4f6;padding-top:14px;">
          <p style="margin:0;font-size:12px;color:${BRAND.subtle};line-height:1.6;">
            Need help? Reply directly to this email or reach us anytime at <a href="mailto:support@sparkbooks.com.ng" style="color:${BRAND.muted};text-decoration:underline;">support@sparkbooks.com.ng</a>.
          </p>
        </td>
      </tr>
    </table>`;

  return sendMail(
    toEmail,
    `Welcome to SparkBooks - Start recording sales on WhatsApp`,
    content,
    `Your store ${businessName} is active on SparkBooks. Start logging sales directly on WhatsApp.`
  );
}

// ============================================================================
// 2. BRM Field Onboarding Welcome Email (with 1-Click Passwordless Link)
// ============================================================================
export async function sendMerchantWelcomeEmail(
  toEmail: string,
  businessName: string,
  brmName: string,
  botUrl: string,
  magicLoginUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const siteUrl = getSiteUrl();
  const dashboardLink = magicLoginUrl || `${siteUrl}/sign-in`;

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-bottom:14px;">
          <span style="background-color:${BRAND.moneyBg};color:#065f46;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Store Activated</span>
          <h1 style="margin:12px 0 6px 0;font-size:22px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.4px;">
            Welcome to SparkBooks, ${businessName}!
          </h1>
          <p style="margin:0;font-size:14px;color:${BRAND.muted};">
            Activated by your Business Relationship Manager: <strong style="color:${BRAND.ink};">${brmName}</strong>
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:18px;">
          <p style="margin:0;font-size:14px;color:${BRAND.muted};line-height:1.6;">
            Your store bookkeeping is now ready. You can record daily sales, log expenses, and track your stock balance right inside WhatsApp.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:22px;">
          <div style="background:#f9fafb;border:1px solid ${BRAND.rule};border-radius:12px;padding:16px;">
            <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:${BRAND.ink};text-transform:uppercase;letter-spacing:0.4px;">
              Try your first entry now:
            </p>
            <p style="margin:0 0 10px 0;font-size:13px;color:${BRAND.muted};line-height:1.5;">
              Tap the button below and send a WhatsApp message or voice note like:
            </p>
            <div style="background:#ffffff;border:1px dashed ${BRAND.money};border-radius:8px;padding:10px 12px;font-family:monospace;font-size:13px;color:#065f46;font-weight:700;">
              "Sold 2 items for 15,000 cash"
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:22px;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="padding-bottom:10px;">
                <a href="${botUrl}" style="display:block;padding:14px 24px;background-color:${BRAND.money};color:${BRAND.white};text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;text-align:center;">
                  Start on WhatsApp 💬
                </a>
              </td>
            </tr>
            <tr>
              <td>
                <a href="${dashboardLink}" style="display:block;padding:14px 24px;background-color:${BRAND.ink};color:${BRAND.white};text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;text-align:center;">
                  Open Web Dashboard (No Password Needed) 🔐
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="border-top:1px solid #f3f4f6;padding-top:14px;">
          <p style="margin:0;font-size:12px;color:${BRAND.subtle};line-height:1.6;">
            💡 <strong>No passwords needed:</strong> Whenever you want to view your sales graphs or ledger on your computer or phone, simply click the dashboard link above, or text <strong>LOGIN</strong> to the WhatsApp bot anytime to get an instant access link.
          </p>
        </td>
      </tr>
    </table>`;

  return sendMail(
    toEmail,
    `Welcome to SparkBooks - ${businessName} is activated`,
    content,
    `Your store ${businessName} has been activated on SparkBooks. Open the WhatsApp bot or your 1-click dashboard.`
  );
}

// ============================================================================
// 3. Team Member Invitation Email (Pro Plan)
// ============================================================================
export async function sendTeamInviteEmail(
  toEmail: string,
  businessName: string
): Promise<{ success: boolean; error?: string }> {
  const siteUrl = getSiteUrl();

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-bottom:14px;">
          <span style="background-color:#e0e7ff;color:#4338ca;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Team Invitation</span>
          <h1 style="margin:12px 0 0 0;font-size:22px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.4px;">
            You've been invited
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:14px;color:${BRAND.muted};line-height:1.6;">
            <strong style="color:${BRAND.ink};">${businessName}</strong> has invited you to join their SparkBooks bookkeeping team. You'll share access to their business records, sales history, and inventory ledger.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:22px;text-align:center;">
          <a
            href="${siteUrl}/sign-up"
            style="display:inline-block;padding:14px 32px;background-color:${BRAND.ink};color:${BRAND.white};text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;"
          >
            Accept Invitation 🤝
          </a>
        </td>
      </tr>
      <tr>
        <td style="border-top:1px solid #f3f4f6;padding-top:14px;">
          <p style="margin:0;font-size:12px;color:${BRAND.subtle};line-height:1.6;">
            Sign up with <strong style="color:${BRAND.ink};">${toEmail}</strong> to link directly to this business. If you weren't expecting this invitation, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>`;

  return sendMail(
    toEmail,
    `${businessName} invited you to SparkBooks`,
    content,
    `Join ${businessName} on SparkBooks to collaborate on store bookkeeping.`
  );
}

// ============================================================================
// 4. Paystack Subscription Payment Receipt
// ============================================================================
export async function sendBillingReceiptEmail(
  toEmail: string,
  businessName: string,
  planTier: string,
  amount: string,
  paymentDate: string,
  nextRenewalDate: string,
  paystackReference: string
): Promise<{ success: boolean; error?: string }> {
  const siteUrl = getSiteUrl();

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-bottom:14px;">
          <span style="background-color:${BRAND.moneyBg};color:#065f46;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Payment Confirmed</span>
          <h1 style="margin:12px 0 4px 0;font-size:22px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.4px;">
            Payment Receipt
          </h1>
          <p style="margin:0;font-size:14px;color:${BRAND.muted};">Thank you for renewing your SparkBooks subscription.</p>
        </td>
      </tr>

      <tr>
        <td style="padding-bottom:20px;">
          <table width="100%" cellpadding="8" cellspacing="0" style="background:#f9fafb;border:1px solid ${BRAND.rule};border-radius:12px;font-size:14px;">
            <tr>
              <td style="color:${BRAND.muted};">Business:</td>
              <td align="right" style="font-weight:600;color:${BRAND.ink};">${businessName}</td>
            </tr>
            <tr>
              <td style="color:${BRAND.muted};">Plan:</td>
              <td align="right" style="font-weight:600;color:${BRAND.ink};">SparkBooks ${planTier}</td>
            </tr>
            <tr>
              <td style="color:${BRAND.muted};">Amount Paid:</td>
              <td align="right" style="font-weight:800;color:${BRAND.money};">₦${amount}</td>
            </tr>
            <tr>
              <td style="color:${BRAND.muted};">Payment Date:</td>
              <td align="right" style="color:${BRAND.ink};">${paymentDate}</td>
            </tr>
            <tr>
              <td style="color:${BRAND.muted};">Next Renewal:</td>
              <td align="right" style="color:${BRAND.ink};">${nextRenewalDate}</td>
            </tr>
            <tr>
              <td style="color:${BRAND.muted};">Reference:</td>
              <td align="right" style="font-family:monospace;font-size:12px;color:${BRAND.subtle};">${paystackReference}</td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding-bottom:20px;text-align:center;">
          <a href="${siteUrl}/dashboard/billing" style="display:inline-block;padding:12px 28px;background-color:${BRAND.ink};color:${BRAND.white};text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;">
            Manage Billing & Invoices
          </a>
        </td>
      </tr>
    </table>`;

  return sendMail(
    toEmail,
    `🧾 Receipt for your SparkBooks ${planTier} subscription (₦${amount})`,
    content,
    `Payment received: ₦${amount} for SparkBooks ${planTier} subscription.`
  );
}

// ============================================================================
// 5. Payment Failed / Renewal Grace Period Alert
// ============================================================================
export async function sendPaymentFailedEmail(
  toEmail: string,
  businessName: string,
  planTier: string,
  amount: string,
  retryUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const siteUrl = getSiteUrl();
  const billingUrl = retryUrl || `${siteUrl}/dashboard/billing`;

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-bottom:14px;">
          <span style="background-color:${BRAND.dangerBg};color:#b91c1c;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Payment Failed</span>
          <h1 style="margin:12px 0 4px 0;font-size:22px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.4px;">
            We couldn't renew your subscription
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:18px;">
          <p style="margin:0;font-size:14px;color:${BRAND.muted};line-height:1.6;">
            We attempted to charge your card for your <strong>SparkBooks ${planTier} Plan (₦${amount})</strong>, but the transaction was declined by your bank.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;">
            <p style="margin:0 0 6px 0;font-size:13px;font-weight:700;color:#92400e;">
              3-Day Grace Period Active
            </p>
            <p style="margin:0;font-size:13px;color:#78350f;line-height:1.5;">
              Your WhatsApp bookkeeping access remains active for <strong>3 more days</strong>. Please update your payment method to prevent your WhatsApp message parsing from being paused.
            </p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:22px;text-align:center;">
          <a href="${billingUrl}" style="display:inline-block;padding:14px 32px;background-color:#b91c1c;color:${BRAND.white};text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;">
            Update Payment Method Now 💳
          </a>
        </td>
      </tr>
    </table>`;

  return sendMail(
    toEmail,
    `⚠️ Action Required: Your SparkBooks subscription renewal failed`,
    content,
    `Your subscription charge for ₦${amount} was declined. Update your card to keep WhatsApp bookkeeping active.`
  );
}

// ============================================================================
// 6. Weekly Financial & Profit Digest
// ============================================================================
export interface WeeklyDigestStats {
  totalSales: number | string;
  totalExpenses: number | string;
  netProfit: number | string;
  totalEntriesCount: number;
  topProductName?: string;
  topProductQty?: number;
  lowStockCount?: number;
}

export async function sendWeeklyDigestEmail(
  toEmail: string,
  businessName: string,
  stats: WeeklyDigestStats
): Promise<{ success: boolean; error?: string }> {
  const siteUrl = getSiteUrl();

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-bottom:14px;">
          <span style="background-color:#e0e7ff;color:#4338ca;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Weekly Digest</span>
          <h1 style="margin:12px 0 4px 0;font-size:22px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.4px;">
            Here's your weekly recap, ${businessName}
          </h1>
          <p style="margin:0;font-size:13px;color:${BRAND.muted};">Performance summary for the past 7 days</p>
        </td>
      </tr>
      
      <!-- Metrics Grid -->
      <tr>
        <td style="padding-bottom:18px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid ${BRAND.rule};border-radius:12px;overflow:hidden;">
            <tr>
              <td width="33%" style="padding:14px;border-right:1px solid ${BRAND.rule};text-align:center;">
                <div style="font-size:11px;color:${BRAND.muted};font-weight:600;text-transform:uppercase;">Sales</div>
                <div style="font-size:17px;font-weight:800;color:${BRAND.money};margin-top:4px;">₦${stats.totalSales}</div>
              </td>
              <td width="33%" style="padding:14px;border-right:1px solid ${BRAND.rule};text-align:center;">
                <div style="font-size:11px;color:${BRAND.muted};font-weight:600;text-transform:uppercase;">Expenses</div>
                <div style="font-size:17px;font-weight:800;color:${BRAND.danger};margin-top:4px;">₦${stats.totalExpenses}</div>
              </td>
              <td width="33%" style="padding:14px;text-align:center;">
                <div style="font-size:11px;color:${BRAND.muted};font-weight:600;text-transform:uppercase;">Net Profit</div>
                <div style="font-size:17px;font-weight:800;color:${BRAND.ink};margin-top:4px;">₦${stats.netProfit}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Detailed Breakdown -->
      <tr>
        <td style="padding-bottom:20px;">
          <div style="background:#ffffff;border:1px solid ${BRAND.rule};border-radius:12px;padding:14px 16px;">
            <table width="100%" cellpadding="5" cellspacing="0" style="font-size:13px;">
              <tr>
                <td style="color:${BRAND.muted};">Entries Logged:</td>
                <td align="right" style="font-weight:700;color:${BRAND.ink};">${stats.totalEntriesCount} records</td>
              </tr>
              ${stats.topProductName ? `
              <tr>
                <td style="color:${BRAND.muted};">Top Product:</td>
                <td align="right" style="font-weight:700;color:${BRAND.money};">${stats.topProductName} (${stats.topProductQty ?? 0} sold)</td>
              </tr>` : ""}
              ${typeof stats.lowStockCount === "number" ? `
              <tr>
                <td style="color:${BRAND.muted};">Low Stock Alerts:</td>
                <td align="right" style="font-weight:700;color:${stats.lowStockCount > 0 ? BRAND.danger : BRAND.muted};">${stats.lowStockCount} items</td>
              </tr>` : ""}
            </table>
          </div>
        </td>
      </tr>

      <tr>
        <td style="padding-bottom:18px;text-align:center;">
          <a href="${siteUrl}/dashboard" style="display:inline-block;padding:13px 30px;background-color:${BRAND.ink};color:${BRAND.white};text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;">
            View Live Ledger on Dashboard ↗
          </a>
        </td>
      </tr>
    </table>`;

  return sendMail(
    toEmail,
    `📊 Weekly Profit Digest: ${businessName} (₦${stats.totalSales} Sales)`,
    content,
    `Your weekly sales: ₦${stats.totalSales}, Net Profit: ₦${stats.netProfit}. View your detailed summary.`
  );
}

// ============================================================================
// 7. Critical Low Stock & Inventory Alert
// ============================================================================
export async function sendLowStockEmail(
  toEmail: string,
  businessName: string,
  productName: string,
  remainingQuantity: number,
  unit: string = "units",
  unitPrice?: number | string
): Promise<{ success: boolean; error?: string }> {
  const siteUrl = getSiteUrl();

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-bottom:14px;">
          <span style="background-color:${BRAND.dangerBg};color:#b91c1c;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Inventory Alert</span>
          <h1 style="margin:12px 0 4px 0;font-size:22px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.4px;">
            ${productName} is running out!
          </h1>
          <p style="margin:0;font-size:13px;color:${BRAND.muted};">Store: ${businessName}</p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <div style="background:#f9fafb;border:1px solid ${BRAND.rule};border-radius:12px;padding:20px;text-align:center;">
            <span style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;font-weight:600;">Remaining Quantity</span>
            <div style="font-size:36px;font-weight:900;color:#b91c1c;margin:6px 0;">
              ${remainingQuantity} <span style="font-size:16px;font-weight:600;color:${BRAND.muted};">${unit}</span>
            </div>
            ${unitPrice ? `<p style="margin:0;font-size:13px;color:${BRAND.muted};">Unit Selling Price: <strong>₦${unitPrice}</strong></p>` : ""}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;text-align:center;">
          <a href="${siteUrl}/dashboard/products" style="display:inline-block;padding:13px 28px;background-color:${BRAND.ink};color:${BRAND.white};text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;">
            Update Stock on Dashboard 📦
          </a>
        </td>
      </tr>
      <tr>
        <td style="border-top:1px solid #f3f4f6;padding-top:12px;text-align:center;">
          <p style="margin:0;font-size:12px;color:${BRAND.subtle};">
            You can also restock via WhatsApp: <code>"Added 20 ${productName}"</code>
          </p>
        </td>
      </tr>
    </table>`;

  return sendMail(
    toEmail,
    `🚨 Low Stock Alert: ${productName} (Only ${remainingQuantity} ${unit} left)`,
    content,
    `${productName} is down to ${remainingQuantity} ${unit} in ${businessName}. Restock before running out.`
  );
}

// ============================================================================
// 8. Monthly WhatsApp Message Quota Warning (80% / 100%)
// ============================================================================
export async function sendQuotaWarningEmail(
  toEmail: string,
  businessName: string,
  currentCount: number,
  limitCount: number,
  usagePercent: number
): Promise<{ success: boolean; error?: string }> {
  const siteUrl = getSiteUrl();
  const isFull = usagePercent >= 100;

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-bottom:14px;">
          <span style="background-color:${isFull ? BRAND.dangerBg : BRAND.sparkBg};color:${isFull ? "#b91c1c" : "#b45309"};padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
            ${isFull ? "Limit Reached" : "Quota Warning"}
          </span>
          <h1 style="margin:12px 0 4px 0;font-size:22px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.4px;">
            ${isFull ? "Monthly message limit reached" : "Approaching message limit"}
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:16px;">
          <p style="margin:0;font-size:14px;color:${BRAND.muted};line-height:1.6;">
            Your store, <strong>${businessName}</strong>, has used <strong>${currentCount} of ${limitCount} messages</strong> (${usagePercent}%) for this billing period.
          </p>
        </td>
      </tr>
      
      <!-- Progress Bar -->
      <tr>
        <td style="padding-bottom:18px;">
          <div style="background:#e5e7eb;border-radius:999px;height:10px;width:100%;overflow:hidden;">
            <div style="background-color:${isFull ? BRAND.danger : BRAND.spark};height:100%;width:${Math.min(usagePercent, 100)}%;border-radius:999px;"></div>
          </div>
        </td>
      </tr>

      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:13px;color:${BRAND.muted};line-height:1.5;">
            ${isFull 
              ? "Automated WhatsApp parsing is currently paused until your next cycle or until you upgrade your plan." 
              : "Upgrade today to enjoy higher limits or unlimited messaging on Pro."}
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;text-align:center;">
          <a href="${siteUrl}/dashboard/billing" style="display:inline-block;padding:13px 32px;background-color:${BRAND.ink};color:${BRAND.white};text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;">
            Upgrade Plan for More Messages ⚡
          </a>
        </td>
      </tr>
    </table>`;

  return sendMail(
    toEmail,
    `${isFull ? "🚨" : "⚠️"} ${businessName}: You've used ${usagePercent}% of your monthly WhatsApp messages`,
    content,
    `You have used ${currentCount}/${limitCount} messages on SparkBooks. Upgrade to keep bookkeeping active.`
  );
}

// ============================================================================
// 9. Partner / BRM Application Approved
// ============================================================================
export async function sendPartnerApprovedEmail(
  toEmail: string,
  partnerName: string,
  partnerCode: string,
  referralUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const siteUrl = getSiteUrl();
  const directLink = referralUrl || `${siteUrl}/onboarding?ref=${partnerCode}`;

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-bottom:14px;">
          <span style="background-color:${BRAND.moneyBg};color:#065f46;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Partner Approved</span>
          <h1 style="margin:12px 0 4px 0;font-size:22px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.4px;">
            Welcome to the Partner Network, ${partnerName}!
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:18px;">
          <p style="margin:0;font-size:14px;color:${BRAND.muted};line-height:1.6;">
            Your application as a <strong>Business Relationship Manager (BRM)</strong> has been approved. You can now onboard sellers in your territory and earn recurring commissions on every active merchant.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <div style="background:#f9fafb;border:1px solid ${BRAND.rule};border-radius:12px;padding:16px;">
            <span style="font-size:12px;color:${BRAND.muted};font-weight:600;text-transform:uppercase;">Your Direct Onboarding Link:</span>
            <div style="background:#ffffff;border:1px solid #d1d5db;border-radius:8px;padding:10px;margin-top:6px;font-family:monospace;font-size:13px;color:${BRAND.ink};word-break:break-all;">
              ${directLink}
            </div>
            <p style="margin:8px 0 0 0;font-size:12px;color:${BRAND.subtle};">Partner Code: <strong>${partnerCode}</strong></p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;text-align:center;">
          <a href="${siteUrl}/partner" style="display:inline-block;padding:13px 30px;background-color:${BRAND.ink};color:${BRAND.white};text-decoration:none;border-radius:999px;font-size:14px;font-weight:700;">
            Access Partner Portal 🚀
          </a>
        </td>
      </tr>
    </table>`;

  return sendMail(
    toEmail,
    `💼 Your SparkBooks Partner Account is Approved! Start earning`,
    content,
    `Congratulations ${partnerName}! Your BRM account has been approved. Start onboarding stores.`
  );
}
