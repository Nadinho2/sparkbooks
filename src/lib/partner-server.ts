import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export interface Partner {
  id: number;
  clerkUserId: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  partnerCode: string;
  commissionRate: number;
  role: "field_agent" | "coordinator";
  coordinatorId: number | null;
  region: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  status: "active" | "suspended" | "pending";
  createdAt: string;
}

export interface CoordinatorDownlineBrm {
  id: number;
  fullName: string;
  phoneNumber: string;
  email: string;
  partnerCode: string;
  status: "active" | "suspended" | "pending";
  region: string | null;
  storesCount: number;
  activeStoresCount: number;
  retentionRate: number;
  performanceScore: number;
  performanceGrade: string;
  totalGmvNgn: number;
  overrideEarnedKobo: number;
  createdAt: string;
}

export interface PartnerMerchantRow {
  tenantId: number;
  businessName: string;
  businessType: string;
  whatsappNumber: string;
  shopAddress: string | null;
  landmark: string | null;
  cityLga: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  registeredByPartnerName: string | null;
  isTransferred: boolean;
  planTier: string;
  planStatus: string;
  onboardedAt: string;
  lastActivityAt: string | null;
  healthStatus: "active" | "at_risk" | "dormant";
  daysInactive: number;
  monthlyMessageCount: number;
  totalSalesCount: number;
  lastTransactionAt: string | null;
}

export interface PartnerEarnings {
  availableKobo: number;
  pendingKobo: number;
  paidKobo: number;
  totalKobo: number;
  personalKobo: number;
  overrideKobo: number;
  merchantCount: number;
  activeCount: number;
  downlinesCount: number;
  teamMerchantCount: number;
  teamActiveCount: number;
}

export interface PartnerCommissionItem {
  id: number;
  tenantId: number;
  businessName: string;
  amountKobo: number;
  type: string;
  status: string;
  description: string | null;
  createdAt: string;
}

/**
 * Gate for partner-only routes (/partner).
 * Redirects to /sign-in if not signed in, or /dashboard if not a partner.
 */
export async function requirePartner(): Promise<Partner> {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/partner");

  const supabase = createAdminClient();

  // 1. Check database for partner record matching clerk_user_id
  let { data: partnerRow } = await supabase
    .from("partners")
    .select("*")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  // 2. Auto-link fallback: if not matched by clerk_user_id, check user's email or phone in Clerk
  if (!partnerRow) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const email = user.emailAddresses[0]?.emailAddress?.toLowerCase();
      const rawPhone = user.phoneNumbers[0]?.phoneNumber;

      if (email || rawPhone) {
        let query = supabase.from("partners").select("*").in("status", ["active", "pending"]);
        if (email && rawPhone) {
          const suffix10 = rawPhone.replace(/\D/g, "").slice(-10);
          query = query.or(`email.ilike.${email},phone_number.ilike.%${suffix10}%`);
        } else if (email) {
          query = query.ilike("email", email);
        } else if (rawPhone) {
          const suffix10 = rawPhone.replace(/\D/g, "").slice(-10);
          query = query.ilike("phone_number", `%${suffix10}%`);
        }

        const { data: matched } = await query.limit(1).maybeSingle();

        if (matched) {
          const newStatus = matched.status === "pending" ? "active" : matched.status;

          // Link Clerk user ID and activate pending invite
          await supabase
            .from("partners")
            .update({
              clerk_user_id: userId,
              status: newStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("id", matched.id);

          try {
            await client.users.updateUser(userId, {
              publicMetadata: {
                ...user.publicMetadata,
                role: "partner",
                partnerId: matched.id,
              },
            });
          } catch {}

          partnerRow = { ...matched, clerk_user_id: userId, status: newStatus };
        }
      }
    } catch (err) {
      console.warn("[requirePartner] Error verifying email/phone partner link:", err);
    }
  }

  // If partner was already linked but still marked pending, activate upon entering workspace
  if (partnerRow && partnerRow.status === "pending") {
    await supabase
      .from("partners")
      .update({
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", partnerRow.id);

    partnerRow.status = "active";
  }

  if (partnerRow && partnerRow.status === "active") {
    return mapPartnerRow(partnerRow);
  }

  // 3. Fallback: check Clerk publicMetadata role
  let role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;
  if (!role) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      role = (user.publicMetadata as { role?: string } | undefined)?.role;
    } catch (err) {
      console.error("[requirePartner] Failed to verify role:", err);
    }
  }

  if (role !== "partner" && role !== "admin") {
    redirect("/dashboard");
  }

  // If this is an admin accessing partner workspace without an existing partner row,
  // auto-provision a real record in `partners` so foreign keys (partner_id) work properly.
  if (!partnerRow && role === "admin") {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const adminEmail = user.emailAddresses[0]?.emailAddress?.toLowerCase() || "admin@sparkbooks.com";
      const adminName = `${user.firstName || "Admin"} ${user.lastName || "SparkBooks"}`.trim();
      const adminPhone = user.phoneNumbers[0]?.phoneNumber || "+2348000000000";

      const { data: existingAdmin } = await supabase
        .from("partners")
        .select("*")
        .ilike("email", adminEmail)
        .maybeSingle();

      if (existingAdmin) {
        await supabase
          .from("partners")
          .update({
            clerk_user_id: userId,
            status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingAdmin.id);

        partnerRow = { ...existingAdmin, clerk_user_id: userId, status: "active" };
      } else {
        const codeSuffix = userId.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase() || "ADM1";
        const { data: createdAdmin, error: createAdminErr } = await supabase
          .from("partners")
          .insert({
            clerk_user_id: userId,
            full_name: adminName,
            email: adminEmail,
            phone_number: adminPhone,
            partner_code: `ADM${codeSuffix}`,
            commission_rate: 30.0,
            role: "coordinator",
            region: "National Lead",
            status: "active",
          })
          .select("*")
          .single();

        if (!createAdminErr && createdAdmin) {
          partnerRow = createdAdmin;
        }
      }
    } catch (err) {
      console.error("[requirePartner] Auto-provision admin partner error:", err);
    }
  }

  if (!partnerRow) {
    if (role === "admin") {
      return {
        id: 0,
        clerkUserId: userId,
        fullName: "Admin Partner",
        phoneNumber: "+2348000000000",
        email: "admin@sparkbooks.com",
        partnerCode: "DEMO26",
        commissionRate: 30.0,
        role: "coordinator",
        coordinatorId: null,
        region: "National Lead",
        bankName: "Access Bank",
        accountNumber: "0123456789",
        accountName: "SparkBooks Admin",
        status: "active",
        createdAt: new Date().toISOString(),
      };
    }
    redirect("/dashboard");
  }

  return mapPartnerRow(partnerRow);
}

/**
 * Get current partner if available (safe, returns null without redirecting)
 * Also auto-links verified email / phone to the partner record and activates pending invites.
 */
export async function getCurrentPartner(): Promise<Partner | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = createAdminClient();
  let { data: partnerRow } = await supabase
    .from("partners")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (partnerRow && partnerRow.status === "pending") {
    await supabase
      .from("partners")
      .update({
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", partnerRow.id);

    partnerRow.status = "active";
  }

  if (partnerRow && partnerRow.status === "active") {
    return mapPartnerRow(partnerRow);
  }

  // Auto-link fallback by email or phone
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email = user.emailAddresses[0]?.emailAddress?.toLowerCase();
    const rawPhone = user.phoneNumbers[0]?.phoneNumber;

    if (email || rawPhone) {
      let query = supabase.from("partners").select("*").in("status", ["active", "pending"]);
      if (email && rawPhone) {
        const suffix10 = rawPhone.replace(/\D/g, "").slice(-10);
        query = query.or(`email.ilike.${email},phone_number.ilike.%${suffix10}%`);
      } else if (email) {
        query = query.ilike("email", email);
      } else if (rawPhone) {
        const suffix10 = rawPhone.replace(/\D/g, "").slice(-10);
        query = query.ilike("phone_number", `%${suffix10}%`);
      }

      const { data: matched } = await query.limit(1).maybeSingle();

      if (matched) {
        const newStatus = matched.status === "pending" ? "active" : matched.status;

        await supabase
          .from("partners")
          .update({
            clerk_user_id: userId,
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", matched.id);

        try {
          await client.users.updateUser(userId, {
            publicMetadata: {
              ...user.publicMetadata,
              role: "partner",
              partnerId: matched.id,
            },
          });
        } catch {}

        return mapPartnerRow({ ...matched, clerk_user_id: userId, status: newStatus });
      }
    }
  } catch {}

  return null;
}

function mapPartnerRow(row: Record<string, unknown>): Partner {
  return {
    id: row.id as number,
    clerkUserId: row.clerk_user_id as string,
    fullName: row.full_name as string,
    phoneNumber: row.phone_number as string,
    email: row.email as string,
    partnerCode: row.partner_code as string,
    commissionRate: Number(row.commission_rate ?? 30.0),
    role: (row.role as "field_agent" | "coordinator") || "field_agent",
    coordinatorId: (row.coordinator_id as number | null) ?? null,
    region: (row.region as string | null) ?? null,
    bankName: (row.bank_name as string | null) ?? null,
    accountNumber: (row.account_number as string | null) ?? null,
    accountName: (row.account_name as string | null) ?? null,
    status: (row.status as "active" | "suspended" | "pending") ?? "active",
    createdAt: row.created_at as string,
  };
}

/**
 * Fetch portfolio of merchants assigned to this partner with live health calculations.
 */
export async function getPartnerPortfolio(partnerId: number): Promise<PartnerMerchantRow[]> {
  const supabase = createAdminClient();

  let { data: tenants, error } = await supabase
    .from("tenants")
    .select(`
      id,
      business_name,
      business_type,
      whatsapp_number,
      plan_tier,
      plan_status,
      created_at,
      last_activity_at,
      monthly_message_count,
      shop_address,
      landmark,
      city_lga,
      state,
      latitude,
      longitude,
      partner_id,
      registered_by_partner_id,
      ledger_entries (
        id,
        type,
        created_at
      )
    `)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false });

  // Fallback if migration 015 columns are not yet applied in Supabase
  if (error && (error.message?.includes("column") || error.code === "42703")) {
    const fallbackRes = await supabase
      .from("tenants")
      .select(`
        id,
        business_name,
        business_type,
        whatsapp_number,
        plan_tier,
        plan_status,
        created_at,
        last_activity_at,
        monthly_message_count,
        partner_id,
        ledger_entries (
          id,
          type,
          created_at
        )
      `)
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false });

    tenants = fallbackRes.data as any;
    error = fallbackRes.error;
  }

  if (error || !tenants) return [];

  // Fetch names of original registering partners for transferred stores
  const registeredByIds = Array.from(
    new Set(
      tenants
        .map((t: any) => t.registered_by_partner_id)
        .filter((id): id is number => typeof id === "number" && id !== partnerId)
    )
  );

  const registeredByMap: Record<number, string> = {};
  if (registeredByIds.length > 0) {
    const { data: origPartners } = await supabase
      .from("partners")
      .select("id, full_name")
      .in("id", registeredByIds);

    for (const p of origPartners || []) {
      registeredByMap[p.id] = p.full_name;
    }
  }

  const now = new Date().getTime();

  return tenants.map((t: any) => {
    const lastActivity = t.last_activity_at ? new Date(t.last_activity_at).getTime() : new Date(t.created_at).getTime();
    const diffHours = (now - lastActivity) / (1000 * 60 * 60);
    const daysInactive = Math.floor(diffHours / 24);

    let healthStatus: "active" | "at_risk" | "dormant" = "active";
    if (daysInactive >= 7) {
      healthStatus = "dormant";
    } else if (daysInactive >= 3) {
      healthStatus = "at_risk";
    }

    const ledger = (t.ledger_entries as unknown as Array<{ id: number; type: string; created_at: string }>) || [];
    const sales = ledger.filter((l) => l.type === "sale");
    const totalSalesCount = sales.length;

    // Latest transaction timestamp if any
    let latestTxTime: string | null = null;
    if (sales.length > 0) {
      const sorted = [...sales].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      latestTxTime = sorted[0].created_at;
    }
    const lastTransactionAt = latestTxTime || t.last_activity_at || null;

    const isTransferred = Boolean(
      t.registered_by_partner_id && t.registered_by_partner_id !== partnerId
    );
    const registeredByPartnerName = t.registered_by_partner_id
      ? registeredByMap[t.registered_by_partner_id] || null
      : null;

    return {
      tenantId: t.id,
      businessName: t.business_name || "Unnamed Shop",
      businessType: t.business_type || "General",
      whatsappNumber: t.whatsapp_number,
      shopAddress: t.shop_address || null,
      landmark: t.landmark || null,
      cityLga: t.city_lga || null,
      state: t.state || null,
      latitude: t.latitude ? Number(t.latitude) : null,
      longitude: t.longitude ? Number(t.longitude) : null,
      registeredByPartnerName,
      isTransferred,
      planTier: t.plan_tier,
      planStatus: t.plan_status,
      onboardedAt: t.created_at,
      lastActivityAt: t.last_activity_at,
      healthStatus,
      daysInactive,
      monthlyMessageCount: t.monthly_message_count || 0,
      totalSalesCount,
      lastTransactionAt,
    };
  });
}

/**
 * Fetch total earnings overview for a partner (including override splits for coordinators).
 */
export async function getPartnerEarnings(partnerId: number): Promise<PartnerEarnings> {
  const supabase = createAdminClient();

  const [commissionsRes, tenantsRes, downlinesRes] = await Promise.all([
    supabase
      .from("partner_commissions")
      .select("amount_kobo, status, description")
      .eq("partner_id", partnerId),
    supabase
      .from("tenants")
      .select("id, last_activity_at, created_at")
      .eq("partner_id", partnerId),
    supabase
      .from("partners")
      .select(`
        id,
        tenants!tenants_partner_id_fkey(id, last_activity_at, created_at)
      `)
      .eq("coordinator_id", partnerId),
  ]);

  const commissions = commissionsRes.data ?? [];
  let availableKobo = 0;
  let pendingKobo = 0;
  let paidKobo = 0;
  let personalKobo = 0;
  let overrideKobo = 0;

  for (const c of commissions) {
    const amount = Number(c.amount_kobo) || 0;
    if (c.status === "cleared") availableKobo += amount;
    else if (c.status === "pending") pendingKobo += amount;
    else if (c.status === "paid") paidKobo += amount;

    if (c.description && c.description.toLowerCase().includes("override")) {
      overrideKobo += amount;
    } else {
      personalKobo += amount;
    }
  }

  const tenants = tenantsRes.data ?? [];
  const now = Date.now();
  let activeCount = 0;

  for (const t of tenants) {
    const last = t.last_activity_at ? new Date(t.last_activity_at).getTime() : new Date(t.created_at).getTime();
    if ((now - last) / (1000 * 60 * 60 * 24) < 3) {
      activeCount++;
    }
  }

  const downlines = downlinesRes.data ?? [];
  let teamMerchantCount = 0;
  let teamActiveCount = 0;

  for (const d of downlines) {
    const dTenants = (d.tenants as unknown as Array<{ id: number; last_activity_at: string | null; created_at: string }>) || [];
    teamMerchantCount += dTenants.length;
    for (const dt of dTenants) {
      const dLast = dt.last_activity_at ? new Date(dt.last_activity_at).getTime() : new Date(dt.created_at).getTime();
      if ((now - dLast) / (1000 * 60 * 60 * 24) < 3) {
        teamActiveCount++;
      }
    }
  }

  return {
    availableKobo,
    pendingKobo,
    paidKobo,
    totalKobo: availableKobo + pendingKobo + paidKobo,
    personalKobo,
    overrideKobo,
    merchantCount: tenants.length,
    activeCount,
    downlinesCount: downlines.length,
    teamMerchantCount,
    teamActiveCount,
  };
}

/**
 * Fetch all downline Field BRMs for a Regional Coordinator.
 */
export async function getCoordinatorDownlines(coordinatorId: number): Promise<CoordinatorDownlineBrm[]> {
  const supabase = createAdminClient();

  const { data: downlines, error } = await supabase
    .from("partners")
    .select(`
      id,
      full_name,
      phone_number,
      email,
      partner_code,
      status,
      region,
      created_at,
      tenants!tenants_partner_id_fkey (
        id,
        plan_tier,
        plan_status,
        last_activity_at,
        created_at
      )
    `)
    .eq("coordinator_id", coordinatorId)
    .order("created_at", { ascending: false });

  if (error || !downlines) return [];

  // Also fetch total overrides earned by coordinator from each downline's merchants
  const { data: overrideCommissions } = await supabase
    .from("partner_commissions")
    .select("tenant_id, amount_kobo")
    .eq("partner_id", coordinatorId)
    .ilike("description", "%override%");

  const overrideMap: Record<number, number> = {};
  for (const oc of overrideCommissions || []) {
    overrideMap[oc.tenant_id] = (overrideMap[oc.tenant_id] || 0) + Number(oc.amount_kobo);
  }

  const now = Date.now();

  return downlines.map((d) => {
    const tenants = (d.tenants as unknown as Array<{
      id: number;
      plan_tier: string;
      plan_status: string;
      last_activity_at: string | null;
      created_at: string;
      ledger_entries: Array<{ id: number; type: string; amount: number }>;
    }>) || [];

    let activeStoresCount = 0;
    let paidStoresCount = 0;
    let totalGmvNgn = 0;
    let downlineOverrideKobo = 0;

    for (const t of tenants) {
      const last = t.last_activity_at ? new Date(t.last_activity_at).getTime() : new Date(t.created_at).getTime();
      if ((now - last) / (1000 * 60 * 60 * 24) <= 7) {
        activeStoresCount++;
      }
      if ((t.plan_tier === "starter" || t.plan_tier === "pro") && t.plan_status === "active") {
        paidStoresCount++;
      }
      const ledger = (t.ledger_entries as unknown as Array<{ id: number; type: string; amount: number }>) || [];
      const sales = ledger.filter((l) => l.type === "sale");
      totalGmvNgn += sales.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

      if (overrideMap[t.id]) {
        downlineOverrideKobo += overrideMap[t.id];
      }
    }

    const storesCount = tenants.length;
    const retentionRate = storesCount > 0 ? Math.round((activeStoresCount / storesCount) * 100) : 0;
    const conversionRate = storesCount > 0 ? Math.round((paidStoresCount / storesCount) * 100) : 0;

    let performanceScore = 0;
    let performanceGrade = "New";
    if (storesCount > 0) {
      performanceScore = Math.min(100, Math.round((retentionRate * 0.6) + (conversionRate * 0.4)));
      if (performanceScore >= 80) performanceGrade = "Excellent";
      else if (performanceScore >= 60) performanceGrade = "Good";
      else if (performanceScore >= 40) performanceGrade = "Fair";
      else performanceGrade = "Needs Attention";
    }

    return {
      id: d.id,
      fullName: d.full_name,
      phoneNumber: d.phone_number,
      email: d.email,
      partnerCode: d.partner_code,
      status: (d.status as "active" | "suspended" | "pending") || "active",
      region: d.region,
      storesCount,
      activeStoresCount,
      retentionRate,
      performanceScore,
      performanceGrade,
      totalGmvNgn,
      overrideEarnedKobo: downlineOverrideKobo,
      createdAt: d.created_at,
    };
  });
}

/**
 * Fetch detailed commissions history.
 */
export async function getPartnerCommissionHistory(partnerId: number): Promise<PartnerCommissionItem[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("partner_commissions")
    .select(`
      id,
      tenant_id,
      amount_kobo,
      type,
      status,
      description,
      created_at,
      tenants (
        business_name
      )
    `)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((item) => {
    const tenant = (item.tenants as unknown as { business_name: string } | null);
    return {
      id: item.id,
      tenantId: item.tenant_id,
      businessName: tenant?.business_name ?? "Direct Merchant",
      amountKobo: Number(item.amount_kobo),
      type: item.type,
      status: item.status,
      description: item.description,
      createdAt: item.created_at,
    };
  });
}
