"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentTenant, getCurrentTenantId, isTenantOwner } from "@/lib/tenant-server";
import { sendTeamInviteEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";

/**
 * Throw if the current tenant is not on the Pro plan.
 * Returns the current tenant for use by callers.
 */
async function requireProPlan() {
  const tenant = await getCurrentTenant();
  if (tenant.planTier !== "pro") {
    throw new Error("Team management is only available on the Pro plan.");
  }
  return tenant;
}

export type TeamMember = {
  id: number;
  clerkUserId: string | null;
  role: string;
  invitedEmail: string | null;
  whatsappNumber: string | null;
  status: string;
  createdAt: string;
};

/**
 * Fetch all team members (active + pending) for the current tenant.
 * Only the tenant owner can fetch the list.
 */
export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const owner = await isTenantOwner();
  if (!owner) throw new Error("Only the account owner can view team members.");

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tenant_members")
    .select("id, clerk_user_id, role, invited_email, whatsapp_number, status, created_at")
    .eq("tenant_id", tenantId)
    .neq("status", "removed")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((m) => ({
    id: m.id,
    clerkUserId: m.clerk_user_id,
    role: m.role,
    invitedEmail: m.invited_email,
    whatsappNumber: m.whatsapp_number,
    status: m.status,
    createdAt: m.created_at,
  }));
}

/**
 * Invite a team member by email.
 * Only the tenant owner can invite.
 */
export async function inviteTeamMember(email: string): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const owner = await isTenantOwner();
  if (!owner) throw new Error("Only the account owner can invite team members.");

  const tenant = await requireProPlan();

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  const normalizedEmail = email.trim().toLowerCase();

  // Check if this email is already invited or active
  const { data: existing } = await supabase
    .from("tenant_members")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("invited_email", normalizedEmail)
    .neq("status", "removed")
    .maybeSingle();

  if (existing) {
    throw new Error(
      existing.status === "active"
        ? "This person is already a team member."
        : "An invitation has already been sent to this email.",
    );
  }

  // Check if this email belongs to a Clerk user who is an active member
  const client = await clerkClient();
  const clerkUsers = await client.users.getUserList({
    emailAddress: [normalizedEmail],
    limit: 1,
  });

  let clerkUserId: string | null = null;
  let insertStatus: "active" | "pending" = "pending";

  if (clerkUsers.data.length > 0) {
    const clerkUser = clerkUsers.data[0];

    // Don't allow self-invite (owner inviting themselves)
    if (clerkUser.id === userId) {
      throw new Error("You cannot invite yourself.");
    }

    // Check if this user already owns a tenant
    const { data: existingTenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("clerk_user_id", clerkUser.id)
      .maybeSingle();

    if (existingTenant) {
      throw new Error(
        "This person already owns a SparkBooks account. They cannot join as a team member.",
      );
    }

    clerkUserId = clerkUser.id;
    insertStatus = "active";
  }

  const { error } = await supabase.from("tenant_members").insert({
    tenant_id: tenantId,
    clerk_user_id: clerkUserId,
    role: "member",
    invited_email: normalizedEmail,
    status: insertStatus,
  });

  if (error) throw new Error(error.message);

  // Send invitation email for pending invites (no existing Clerk user)
  if (insertStatus === "pending") {
    await sendTeamInviteEmail(normalizedEmail, tenant.businessName).catch(
      (err) => {
        console.error("Failed to send invitation email:", err);
      },
    );
  }

  revalidatePath("/dashboard/team");
}

/**
 * Update a team member's WhatsApp number.
 * Only the tenant owner can update.
 */
export async function updateMemberWhatsApp(
  memberId: number,
  whatsappNumber: string,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const owner = await isTenantOwner();
  if (!owner) throw new Error("Only the account owner can manage team members.");

  await requireProPlan();

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("tenant_members")
    .update({
      whatsapp_number: whatsappNumber.trim() || null,
    })
    .eq("id", memberId)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/team");
}

/**
 * Remove a team member.
 * Only the tenant owner can remove members.
 */
export async function removeTeamMember(memberId: number): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const owner = await isTenantOwner();
  if (!owner) throw new Error("Only the account owner can manage team members.");

  await requireProPlan();

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("tenant_members")
    .update({ status: "removed" })
    .eq("id", memberId)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/team");
}
