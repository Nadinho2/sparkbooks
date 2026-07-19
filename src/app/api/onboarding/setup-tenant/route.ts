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
  const { businessType, businessName, whatsappNumber } = body;

  if (!businessType || !businessName || !whatsappNumber) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Check existing tenant
  const { data: existing } = await supabase
    .from("tenants")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "Tenant already exists" },
      { status: 409 },
    );
  }

  // Create tenant
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      business_name: businessName,
      business_type: businessType,
      whatsapp_number: whatsappNumber,
      clerk_user_id: userId,
    })
    .select("id, business_name, business_type, whatsapp_number")
    .single();

  if (tenantError || !tenant) {
    return NextResponse.json(
      { error: tenantError?.message ?? "Failed to create tenant" },
      { status: 500 },
    );
  }

  // Store tenant_id in Clerk metadata
  const client = await clerkClient();
  await client.users.updateUser(userId, {
    publicMetadata: { tenant_id: tenant.id },
  });

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
