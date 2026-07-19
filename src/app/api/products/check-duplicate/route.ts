import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { findFuzzyMatches } from "@/lib/tenant";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ matches: [] });
  }

  const supabase = createAdminClient();

  // Get tenant_id from Clerk metadata
  const { data: profile } = await supabase
    .from("tenants")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (!profile) {
    return NextResponse.json({ matches: [] });
  }

  // Fetch all existing product names for this tenant
  const { data: products } = await supabase
    .from("products")
    .select("name")
    .eq("tenant_id", profile.id);

  const candidates = (products ?? []).map((p) => p.name);
  const matches = findFuzzyMatches(name, candidates);

  return NextResponse.json({ matches });
}
