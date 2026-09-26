"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/tenant-server";
import { revalidatePath } from "next/cache";

export async function updateBusinessSettings(data: {
  businessName: string;
  businessType: string;
  whatsappNumber: string;
}): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  if (!data.businessName?.trim()) {
    return { success: false, error: "Business name is required." };
  }

  if (!data.whatsappNumber?.trim()) {
    return { success: false, error: "WhatsApp number is required." };
  }

  const { error } = await supabase
    .from("tenants")
    .update({
      business_name: data.businessName.trim(),
      business_type: data.businessType.trim(),
      whatsapp_number: data.whatsappNumber.trim(),
    })
    .eq("id", tenantId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { success: true };
}
