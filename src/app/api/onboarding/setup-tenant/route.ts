import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { BUSINESS_CATEGORIES } from "@/lib/tenant";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { businessType, businessName, whatsappNumber, brandColor, brandLogoUrl } = body;

  if (!businessType || !businessName || !whatsappNumber) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Check existing tenant
  const { data: existing } = await supabase
    .from("tenants")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Tenant already exists" },
      { status: 409 },
    );
  }

  // Check if an unclaimed tenant with this WhatsApp number exists (pre-registered by BRM)
  const cleanDigits = whatsappNumber.replace(/\D/g, "");
  const suffix10 = cleanDigits.slice(-10);

  const { data: unclaimedByPhone } = await supabase
    .from("tenants")
    .select("id, business_name, business_type, whatsapp_number")
    .or(`whatsapp_number.ilike.%${suffix10}%,whatsapp_number.eq.${whatsappNumber.trim()}`)
    .is("clerk_user_id", null)
    .maybeSingle();

  if (unclaimedByPhone) {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    const email = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase();

    const claimPayload: Record<string, any> = {
      clerk_user_id: userId,
    };
    if (email) claimPayload.merchant_email = email;
    if (brandColor) claimPayload.brand_color = brandColor;
    if (brandLogoUrl) claimPayload.brand_logo_url = brandLogoUrl;

    await supabase
      .from("tenants")
      .update(claimPayload)
      .eq("id", unclaimedByPhone.id);

    try {
      await client.users.updateUser(userId, {
        publicMetadata: { tenant_id: unclaimedByPhone.id },
      });
    } catch {}

    const { data: existingCategories } = await supabase
      .from("categories")
      .select("id, name")
      .eq("tenant_id", unclaimedByPhone.id);

    return NextResponse.json({
      id: unclaimedByPhone.id,
      businessName: unclaimedByPhone.business_name,
      businessType: unclaimedByPhone.business_type,
      whatsappNumber: unclaimedByPhone.whatsapp_number,
      categories: existingCategories || [],
      claimedExisting: true,
    });
  }

  // Check if this WhatsApp number is already owned by another claimed tenant
  const { data: alreadyClaimed } = await supabase
    .from("tenants")
    .select("id, business_name")
    .or(`whatsapp_number.ilike.%${suffix10}%,whatsapp_number.eq.${whatsappNumber.trim()}`)
    .not("clerk_user_id", "is", null)
    .maybeSingle();

  if (alreadyClaimed) {
    return NextResponse.json(
      {
        error: `A shop is already registered with WhatsApp number ${whatsappNumber} (${alreadyClaimed.business_name}). Please sign in with the original account or contact support.`,
      },
      { status: 409 }
    );
  }

  // Create tenant
  const insertPayload: Record<string, any> = {
    business_name: businessName,
    business_type: businessType,
    whatsapp_number: whatsappNumber,
    clerk_user_id: userId,
  };
  if (brandColor) insertPayload.brand_color = brandColor;
  if (brandLogoUrl) insertPayload.brand_logo_url = brandLogoUrl;

  let tenant: any = null;
  let tenantError: any = null;

  const res = await supabase
    .from("tenants")
    .insert(insertPayload)
    .select("id, business_name, business_type, whatsapp_number")
    .single();

  tenant = res.data;
  tenantError = res.error;

  if (tenantError && (tenantError.message?.includes("column") || tenantError.code === "42703")) {
    const fallbackRes = await supabase
      .from("tenants")
      .insert({
        business_name: businessName,
        business_type: businessType,
        whatsapp_number: whatsappNumber,
        clerk_user_id: userId,
      })
      .select("id, business_name, business_type, whatsapp_number")
      .single();
    tenant = fallbackRes.data;
    tenantError = fallbackRes.error;
  }

  if (tenantError || !tenant) {
    return NextResponse.json(
      { error: tenantError?.message ?? "Failed to create tenant" },
      { status: 500 },
    );
  }

  // Store tenant_id in Clerk metadata & dispatch welcome email
  const client = await clerkClient();
  await client.users.updateUser(userId, {
    publicMetadata: { tenant_id: tenant.id },
  });

  try {
    const clerkUser = await client.users.getUser(userId);
    const userEmail = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase();
    if (userEmail) {
      await supabase
        .from("tenants")
        .update({ merchant_email: userEmail })
        .eq("id", tenant.id);

      const { sendStoreWelcomeEmail } = await import("@/lib/email");
      await sendStoreWelcomeEmail(userEmail, tenant.business_name, tenant.whatsapp_number);
    }
  } catch (emailErr) {
    console.warn("[setup-tenant] Could not dispatch welcome email:", emailErr);
  }

  // Seed categories
  const categoryNames = BUSINESS_CATEGORIES[body.businessType];
  let categories: { id: number; name: string }[] = [];

  if (categoryNames && categoryNames.length > 0) {
    const { data: seeded } = await supabase
      .from("categories")
      .insert(
        categoryNames.map((name) => ({
          tenant_id: tenant.id,
          name,
        })),
      )
      .select("id, name");

    if (seeded) categories = seeded;
  }

  return NextResponse.json({
    id: tenant.id,
    businessName: tenant.business_name,
    businessType: tenant.business_type,
    whatsappNumber: tenant.whatsapp_number,
    categories,
  });
}
