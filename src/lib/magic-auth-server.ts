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
 * Valid for 24 hours.
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

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

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

  const rawTenant = tokenRecord.tenants as unknown;
  const tenant = (Array.isArray(rawTenant) ? rawTenant[0] : rawTenant) as Record<string, unknown> | null;
  if (!tenant) {
    return { success: false, error: "Associated business account not found." };
  }

  const tenantId = tenant.id as number;
  let clerkUserId = tenant.clerk_user_id as string | null;

  const client = await clerkClient();

  // 2. Resolve or Create Clerk user
  try {
    if (!clerkUserId) {
      const safePhone = (tokenRecord.phone_number || tenant.whatsapp_number || "").replace(/\s+/g, "");
      const candidateEmail = (tenant.merchant_email && (tenant.merchant_email as string).trim())
        ? (tenant.merchant_email as string).trim().toLowerCase()
        : `merchant_${tenantId}_${Date.now()}@sparkbooks.io`;

      // 2A. Check if user already exists in Clerk by candidate email
      try {
        const existingUsers = await client.users.getUserList({ emailAddress: [candidateEmail] });
        if (existingUsers.data && existingUsers.data.length > 0) {
          clerkUserId = existingUsers.data[0].id;
          console.log(`[verifyAndConsumeMagicToken] Linked to existing Clerk user by email: ${clerkUserId}`);
        }
      } catch (searchErr) {
        console.warn("[verifyAndConsumeMagicToken] Search by email error:", searchErr);
      }

      // 2B. Check if user already exists in Clerk by base username
      if (!clerkUserId) {
        const baseUsername = `merchant_${tenantId}`;
        try {
          const existingByUsername = await client.users.getUserList({ username: [baseUsername] });
          if (existingByUsername.data && existingByUsername.data.length > 0) {
            clerkUserId = existingByUsername.data[0].id;
          }
        } catch {
          // ignore
        }
      }

      // 2C. Create new Clerk user with required username and valid email
      if (!clerkUserId) {
        const uniqueUsername = `merchant_${tenantId}_${Date.now().toString(36)}`;
        console.log(`[verifyAndConsumeMagicToken] Creating new Clerk user with username: ${uniqueUsername}, email: ${candidateEmail}`);

        const createdUser = await client.users.createUser({
          username: uniqueUsername,
          emailAddress: [candidateEmail],
          firstName: (tenant.business_name as string) || "Merchant",
          skipPasswordRequirement: true,
          publicMetadata: {
            tenantId,
            phoneNumber: safePhone,
            role: "owner",
            onboardedVia: "whatsapp_magic_link",
          },
        });

        clerkUserId = createdUser.id;
        console.log(`[verifyAndConsumeMagicToken] Created Clerk user: ${clerkUserId}`);
      }

      // Link to tenant in database
      await supabase
        .from("tenants")
        .update({ clerk_user_id: clerkUserId })
        .eq("id", tenantId);
    }

    // 3. Create Clerk SignInToken (official passwordless ticket)
    const signInToken = await client.signInTokens.createSignInToken({
      userId: clerkUserId,
      expiresInSeconds: 600, // 10 minutes to consume
    });

    // 4. Mark token as consumed atomically in DB
    await supabase
      .from("magic_auth_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenRecord.id);

    // Route ticket to local /sign-in page which consumes the ticket passwordlessly
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
