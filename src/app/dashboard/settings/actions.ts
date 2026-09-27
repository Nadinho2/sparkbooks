"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/tenant-server";
import { revalidatePath } from "next/cache";

export async function uploadBrandLogo(
  formData: FormData,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  const file = formData.get("logo") as File;
  if (!file) {
    return { success: false, error: "No image file provided." };
  }

  if (!file.type.startsWith("image/")) {
    return { success: false, error: "Please upload an image file (PNG, JPG, WebP, SVG)." };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { success: false, error: "Image size must be less than 5MB." };
  }

  const ext = file.name.split(".").pop() || "png";
  const filePath = `tenant_${tenantId}_logo_${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadErr } = await supabase.storage
    .from("brand-assets")
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadErr) {
    return { success: false, error: uploadErr.message };
  }

  const { data: publicUrlData } = supabase.storage
    .from("brand-assets")
    .getPublicUrl(filePath);

  const logoUrl = publicUrlData.publicUrl;

  try {
    await supabase
      .from("tenants")
      .update({ brand_logo_url: logoUrl })
      .eq("id", tenantId);
  } catch (err) {
    console.warn("Could not save brand_logo_url directly to tenants:", err);
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { success: true, url: logoUrl };
}

export async function updateBusinessSettings(data: {
  businessName: string;
  businessType: string;
  whatsappNumber: string;
  brandColor?: string | null;
  brandLogoUrl?: string | null;
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

  const updatePayload: Record<string, any> = {
    business_name: data.businessName.trim(),
    business_type: data.businessType.trim(),
    whatsapp_number: data.whatsappNumber.trim(),
  };

  if (data.brandColor !== undefined) {
    updatePayload.brand_color = data.brandColor?.trim() || "#10B981";
  }
  if (data.brandLogoUrl !== undefined) {
    updatePayload.brand_logo_url = data.brandLogoUrl?.trim() || null;
  }

  const { error } = await supabase
    .from("tenants")
    .update(updatePayload)
    .eq("id", tenantId);

  if (error) {
    // If brand_color or brand_logo_url columns do not exist yet, fallback to core fields
    if (error.message.includes("brand_color") || error.message.includes("brand_logo_url")) {
      const { error: coreErr } = await supabase
        .from("tenants")
        .update({
          business_name: data.businessName.trim(),
          business_type: data.businessType.trim(),
          whatsapp_number: data.whatsappNumber.trim(),
        })
        .eq("id", tenantId);

      if (coreErr) return { success: false, error: coreErr.message };

      return {
        success: true,
        error: "Business details saved! To save your custom logo and color, please apply migration 011 in your Supabase SQL editor.",
      };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { success: true };
}
