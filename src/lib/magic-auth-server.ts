import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { clerkClient } from "@clerk/nextjs/server";

export interface MagicTokenResult {
  rawToken: string;
  loginUrl: string;
  expiresAt: Date;
}

/**
 * Generate a single-use secure login token for a tenant.
 * Valid for 15 minutes.
 */
export async function generateMagicLoginToken(
  tenantId: number,
  phoneNumber: string
): Promise<MagicTokenResult> {
  const supabase = createAdminClient();

  // 1. Generate 32 bytes of secure random bytes
  const rawToken = randomBytes(32).toString("hex");

  // 2. Hash token with SHA-256 for secure DB storage
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

  // 3. Save token
  const { error } = await supabase.from("magic_auth_tokens").insert({
    tenant_id: tenantId,
    phone_number: phoneNumber,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error("[generateMagicLoginToken] DB insert error:", error);
    throw new Error("Failed to generate login token");
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://sparkbooks.vercel.app"
  ).replace(/\/$/, "");

  const loginUrl = `${appUrl}/auth/magic?token=${rawToken}`;

  return {
    rawToken,
    loginUrl,
    expiresAt,
  };
}

/**
 * Verify and consume a magic token.
 * Provisions Clerk sign-in ticket to automatically log the user in.
 */
export async function verifyAndConsumeMagicToken(rawToken: string): Promise<{
  success: boolean;
  signInUrl?: string;
  error?: string;
}> {
  if (!rawToken || typeof rawToken !== "string") {
    return { success: false, error: "Invalid or missing token" };
  }

  const supabase = createAdminClient();
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  // 1. Look up token in DB
  const { data: tokenRecord, error } = await supabase
    .from("magic_auth_tokens")
    .select("id, tenant_id, phone_number, expires_at, used_at, tenants(*)")
    .eq("token_hash", tokenHash)
    .single();

  if (error || !tokenRecord) {
    return { success: false, error: "Login link is invalid or has expired." };
  }

  if (tokenRecord.used_at) {
    return { success: false, error: "This login link has already been used. Please request a new one on WhatsApp." };
  }

  const expiresAt = new Date(tokenRecord.expires_at);
  if (expiresAt.getTime() < Date.now()) {
    return { success: false, error: "This login link has expired. Send 'LOGIN' on WhatsApp for a fresh link." };
  }

  // 2. Mark token as consumed atomically (prevents concurrent replay attacks)
  const { data: updatedRows, error: updateErr } = await supabase
    .from("magic_auth_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenRecord.id)
    .is("used_at", null)
    .select("id");

  if (updateErr || !updatedRows || updatedRows.length === 0) {
    return { success: false, error: "This login link has already been used. Please request a new one on WhatsApp." };
  }

  const rawTenant = tokenRecord.tenants as unknown;
  const tenant = (Array.isArray(rawTenant) ? rawTenant[0] : rawTenant) as Record<string, unknown> | null;
  if (!tenant) {
    return { success: false, error: "Associated business account not found." };
  }

  const tenantId = tenant.id as number;
  let clerkUserId = tenant.clerk_user_id as string | null;

  const client = await clerkClient();

  // 3. Resolve or Create Clerk user
  try {
    if (!clerkUserId) {
      // Find if a Clerk user exists with this phone number or synthetic email
      const safePhone = (tokenRecord.phone_number || "").replace(/\s+/g, "");
      const syntheticEmail = `merchant_${tenantId}_${Date.now()}@sparkbooks.internal`;

      let createdUser;
      try {
        createdUser = await client.users.createUser({
          firstName: (tenant.business_name as string) || "Merchant",
          publicMetadata: {
            tenantId,
            phoneNumber: safePhone,
            role: "owner",
            onboardedVia: "whatsapp_magic_link",
          },
          // Create user with synthetic email so Clerk auth is always valid
          emailAddress: [syntheticEmail],
          skipPasswordRequirement: true,
        });
      } catch (createErr) {
        console.warn("[verifyAndConsumeMagicToken] User creation with email failed, fallback:", createErr);
        createdUser = await client.users.createUser({
          firstName: (tenant.business_name as string) || "Merchant",
          publicMetadata: { tenantId, role: "owner" },
          skipPasswordRequirement: true,
        });
      }

      clerkUserId = createdUser.id;

      // Link to tenant in database
      await supabase
        .from("tenants")
        .update({ clerk_user_id: clerkUserId })
        .eq("id", tenantId);
    }

    // 4. Create Clerk SignInToken (official passwordless ticket)
    const signInToken = await client.signInTokens.createSignInToken({
      userId: clerkUserId,
      expiresInSeconds: 300, // 5 minutes to consume
    });

    // If signInToken.url is provided by Clerk, use it; otherwise route to /sign-in ticket consume
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      ""
    ).replace(/\/$/, "");

    // Always route ticket to our local /sign-in page which consumes the ticket passwordlessly
    const ticketUrl = `/sign-in?__clerk_ticket=${encodeURIComponent(signInToken.token)}&redirect_url=/dashboard`;

    return {
      success: true,
      signInUrl: ticketUrl,
    };
  } catch (clerkErr) {
    console.error("[verifyAndConsumeMagicToken] Clerk sign-in ticket creation failed:", clerkErr);
    return {
      success: false,
      error: "Authentication service temporarily unavailable. Please try again shortly.",
    };
  }
}
