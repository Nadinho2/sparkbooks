"use server";

import { requirePartner } from "@/lib/partner-server";
import { createAdminClient } from "@/lib/supabase/server";
import { normalizePhone, sendTextMessage } from "@/lib/whatsapp";
import { BUSINESS_CATEGORIES } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export interface OnboardShopInput {
  businessName: string;
  businessType: string;
  whatsappNumber: string;
  shopAddress?: string;
  landmark?: string;
  cityLga?: string;
  state?: string;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Rapid agent-assisted merchant setup.
 * Creates tenant, seeds default categories, links partner attribution,
 * records physical shop address & optional GPS pin, and pings the merchant immediately via WhatsApp.
 */
export async function onboardShopAction(input: OnboardShopInput): Promise<{
  success: boolean;
  tenantId?: number;
  error?: string;
}> {
  const partner = await requirePartner();

  if (!input.businessName || !input.businessName.trim()) {
    return { success: false, error: "Shop name is required." };
  }

  if (!input.whatsappNumber || !input.whatsappNumber.trim()) {
    return { success: false, error: "WhatsApp phone number is required." };
  }

  const normalizedPhone = normalizePhone(input.whatsappNumber.trim());
  const supabase = createAdminClient();

  // Check if store with this phone already exists
  const { data: existing } = await supabase
    .from("tenants")
    .select("id, business_name")
    .eq("whatsapp_number", normalizedPhone)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      error: `A shop is already registered with WhatsApp number ${normalizedPhone} (${existing.business_name}).`,
    };
  }

  const businessType = input.businessType || "Provisions";

  const partnerIdToSet = partner.id && partner.id > 0 ? partner.id : null;

  // Insert tenant record with partner attribution, physical address and original registerer
  const insertPayload: Record<string, unknown> = {
    business_name: input.businessName.trim(),
    business_type: businessType,
    whatsapp_number: normalizedPhone,
    shop_address: input.shopAddress?.trim() || null,
    landmark: input.landmark?.trim() || null,
    city_lga: input.cityLga?.trim() || null,
    state: input.state?.trim() || null,
    latitude: typeof input.latitude === "number" ? input.latitude : null,
    longitude: typeof input.longitude === "number" ? input.longitude : null,
    partner_id: partnerIdToSet,
    registered_by_partner_id: partnerIdToSet,
    onboarded_by_partner: true,
    plan_tier: "free",
    plan_status: "active",
    monthly_message_count: 0,
    monthly_message_limit: 30,
    clerk_user_id: null,
    last_activity_at: new Date().toISOString(),
  };

  let { data: newTenant, error: insertError } = await supabase
    .from("tenants")
    .insert(insertPayload)
    .select("id, business_name")
    .single();

  // Fallback in case migration 015 hasn't been executed yet
  if (insertError && (insertError.message?.includes("column") || insertError.code === "42703")) {
    const fallbackPayload = {
      business_name: input.businessName.trim(),
      business_type: businessType,
      whatsapp_number: normalizedPhone,
      partner_id: partnerIdToSet,
      onboarded_by_partner: true,
      plan_tier: "free",
      plan_status: "active",
      monthly_message_count: 0,
      monthly_message_limit: 30,
      clerk_user_id: null,
      last_activity_at: new Date().toISOString(),
    };
    const fallbackRes = await supabase
      .from("tenants")
      .insert(fallbackPayload)
      .select("id, business_name")
      .single();

    newTenant = fallbackRes.data;
    insertError = fallbackRes.error;
  }

  if (insertError || !newTenant) {
    console.error("[onboardShopAction] Insert error:", insertError);
    return { success: false, error: "Failed to create shop. Please check details and try again." };
  }

  // Seed sensible default product categories
  const categories = BUSINESS_CATEGORIES[businessType] || ["General", "Supplies"];
  const categoryInserts = categories.map((name) => ({
    tenant_id: newTenant.id,
    name,
  }));

  try {
    await supabase.from("categories").insert(categoryInserts);
  } catch (catErr) {
    console.warn("Could not seed categories for tenant:", catErr);
  }

  // Trigger instant WhatsApp greeting
  try {
    const welcomeMsg =
      `👋 Welcome to *SparkBooks*, ${newTenant.business_name}!\n\n` +
      `Your store bookkeeping ledger has been activated by your business manager, *${partner.fullName}*.\n\n` +
      `To test it out, send your first sale right now to this chat:\n` +
      `👉 _"Sold 2 items for 10,000 cash"_\n\n` +
      `Whenever you want to view your full web ledger and reports, just text *LOGIN* here!`;

    await sendTextMessage(normalizedPhone, welcomeMsg);
  } catch (waErr) {
    console.warn("Could not send welcome WhatsApp message:", waErr);
  }

  revalidatePath("/partner");
  return { success: true, tenantId: newTenant.id };
}

/**
 * Update partner settlement bank account details.
 */
export async function updateBankDetailsAction(data: {
  bankName: string;
  accountNumber: string;
  accountName: string;
}): Promise<{ success: boolean; error?: string }> {
  const partner = await requirePartner();
  const supabase = createAdminClient();

  if (!data.bankName || !data.accountNumber || !data.accountName) {
    return { success: false, error: "Please fill in all bank details." };
  }

  const { error } = await supabase
    .from("partners")
    .update({
      bank_name: data.bankName.trim(),
      account_number: data.accountNumber.trim(),
      account_name: data.accountName.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", partner.id);

  if (error) {
    return { success: false, error: "Failed to update bank details." };
  }

  revalidatePath("/partner");
  return { success: true };
}

export interface RecruitDownlineBrmInput {
  fullName: string;
  email: string;
  phoneNumber: string;
  partnerCode?: string;
  region?: string;
}

/**
 * Regional Coordinator downline recruitment.
 * Creates an authorized Field BRM linked to this coordinator,
 * with a 20% commission rate and 10% override attributed to the coordinator.
 */
export async function recruitDownlineBrmAction(input: RecruitDownlineBrmInput): Promise<{
  success: boolean;
  partnerId?: number;
  partnerCode?: string;
  error?: string;
}> {
  const coordinator = await requirePartner();

  if (coordinator.role !== "coordinator") {
    return {
      success: false,
      error: "Only Regional Coordinators can recruit and manage downline field agents.",
    };
  }

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const phoneNumber = input.phoneNumber.trim();

  if (!email || !fullName || !phoneNumber) {
    return {
      success: false,
      error: "Full name, email, and phone number are required.",
    };
  }

  const normalizedPhone = normalizePhone(phoneNumber);
  const supabase = createAdminClient();

  // Check if partner email or phone already exists
  const { data: existing } = await supabase
    .from("partners")
    .select("id, full_name, email, phone_number")
    .or(`email.eq.${email},phone_number.eq.${normalizedPhone}`)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      error: `A field agent with this email or phone number already exists (${existing.full_name}).`,
    };
  }

  const partnerCode = (
    input.partnerCode?.trim() ||
    `${fullName.slice(0, 4).toUpperCase()}${Math.floor(10 + Math.random() * 90)}`
  ).replace(/\s+/g, "");

  // Provision clerk user or update metadata
  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();

  let clerkUserId: string;
  try {
    const users = await client.users.getUserList({ emailAddress: [email] });
    if (users.data.length > 0) {
      const user = users.data[0];
      clerkUserId = user.id;
      await client.users.updateUser(user.id, {
        publicMetadata: {
          ...user.publicMetadata,
          role: "partner",
        },
      });
    } else {
      const created = await client.users.createUser({
        emailAddress: [email],
        firstName: fullName.split(" ")[0],
        lastName: fullName.split(" ").slice(1).join(" ") || undefined,
        publicMetadata: {
          role: "partner",
        },
        skipPasswordRequirement: true,
      });
      clerkUserId = created.id;
    }
  } catch (err) {
    console.error("[recruitDownlineBrmAction] Clerk user error:", err);
    clerkUserId = `partner_${Date.now()}`;
  }

  // Insert into partners table under coordinator
  const { data: newPartner, error: insertErr } = await supabase
    .from("partners")
    .insert({
      clerk_user_id: clerkUserId,
      email,
      full_name: fullName,
      phone_number: normalizedPhone,
      partner_code: partnerCode,
      commission_rate: 20.0, // 20% to downline Field BRM, 10% override to coordinator
      role: "field_agent",
      coordinator_id: coordinator.id && coordinator.id > 0 ? coordinator.id : null,
      region: input.region?.trim() || coordinator.region || null,
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .select("id, partner_code")
    .single();

  if (insertErr || !newPartner) {
    console.error("[recruitDownlineBrmAction] DB insert error:", insertErr);
    return {
      success: false,
      error: "Failed to create field agent. Please verify details.",
    };
  }

  // Welcome WhatsApp ping to the new field agent
  try {
    const welcomeMsg =
      `🎉 Welcome to the SparkBooks Field Distribution Network, *${fullName}*!\n\n` +
      `You have been recruited as a Field Relationship Manager (BRM) under Regional Coordinator *${coordinator.fullName}*.\n\n` +
      `Your Partner Code: *${partnerCode}*\n` +
      `Your Rev-Share: *20%* recurring monthly commission on all your onboarded merchants.\n\n` +
      `Access your partner workspace at: https://sparkbooks.io/partner\n` +
      `Or text *LOGIN* to this chat anytime to access your dashboard.`;

    await sendTextMessage(normalizedPhone, welcomeMsg);
  } catch (waErr) {
    console.warn("Could not send field agent welcome message:", waErr);
  }

  revalidatePath("/partner");
  return { success: true, partnerId: newPartner.id, partnerCode: newPartner.partner_code };
}

/**
 * Regional Coordinator store reassignment.
 * Reassigns an inactive or dormant store between team downlines to revive sales activity.
 */
export async function reassignStoreAction(input: {
  tenantId: number;
  targetPartnerId: number;
}): Promise<{ success: boolean; error?: string }> {
  const coordinator = await requirePartner();

  if (coordinator.role !== "coordinator") {
    return {
      success: false,
      error: "Only Regional Coordinators can reassign territory stores.",
    };
  }

  const supabase = createAdminClient();

  // Verify that the tenant is currently under this coordinator or one of their downlines
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, partner_id, business_name")
    .eq("id", input.tenantId)
    .single();

  if (!tenant) {
    return { success: false, error: "Store not found." };
  }

  // Fetch all partner IDs in this coordinator's territory (coordinator itself + their downlines)
  const { data: downlines } = await supabase
    .from("partners")
    .select("id")
    .eq("coordinator_id", coordinator.id);

  const territoryPartnerIds = new Set<number>([
    coordinator.id,
    ...(downlines || []).map((d) => d.id),
  ]);

  if (!tenant.partner_id || !territoryPartnerIds.has(tenant.partner_id)) {
    return {
      success: false,
      error: "This store does not belong to your regional territory.",
    };
  }

  if (!territoryPartnerIds.has(input.targetPartnerId)) {
    return {
      success: false,
      error: "Target field agent is not in your regional team.",
    };
  }

  const { error: updateErr } = await supabase
    .from("tenants")
    .update({
      partner_id: input.targetPartnerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.tenantId);

  if (updateErr) {
    return { success: false, error: "Failed to reassign store." };
  }

  revalidatePath("/partner");
  return { success: true };
}
