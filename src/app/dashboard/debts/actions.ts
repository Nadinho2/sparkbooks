"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/tenant-server";
import { revalidatePath } from "next/cache";

export interface CustomerDebtItem {
  id: number;
  tenantId: number;
  customerName: string;
  customerPhone: string | null;
  linkedEntryId: number | null;
  totalAmount: number;
  amountPaid: number;
  amountOwed: number;
  status: "unpaid" | "partially_paid" | "settled";
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DebtsOverviewData {
  debts: CustomerDebtItem[];
  metrics: {
    totalOwed: number;
    totalPaid: number;
    debtorCount: number;
  };
}

/**
 * Fetch all customer debts for the current tenant.
 */
export async function fetchCustomerDebts(): Promise<DebtsOverviewData> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from("customer_debts")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("customer_debts table may not exist yet:", error.message);
      return { debts: [], metrics: { totalOwed: 0, totalPaid: 0, debtorCount: 0 } };
    }

    const debts: CustomerDebtItem[] = (data ?? []).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      linkedEntryId: row.linked_entry_id,
      totalAmount: Number(row.total_amount),
      amountPaid: Number(row.amount_paid),
      amountOwed: Number(row.amount_owed),
      status: row.status as "unpaid" | "partially_paid" | "settled",
      dueDate: row.due_date,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    let totalOwed = 0;
    let totalPaid = 0;
    let debtorCount = 0;

    for (const d of debts) {
      if (d.status !== "settled") {
        totalOwed += d.amountOwed;
        debtorCount++;
      }
      totalPaid += d.amountPaid;
    }

    return {
      debts,
      metrics: {
        totalOwed,
        totalPaid,
        debtorCount,
      },
    };
  } catch (err) {
    console.error("Failed to fetch customer debts:", err);
    return { debts: [], metrics: { totalOwed: 0, totalPaid: 0, debtorCount: 0 } };
  }
}

/**
 * Create a new customer debt record manually from dashboard.
 */
export async function createCustomerDebt(data: {
  customerName: string;
  customerPhone?: string;
  totalAmount: number;
  amountPaid?: number;
  dueDate?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  if (!data.customerName?.trim()) {
    return { success: false, error: "Customer name is required" };
  }
  if (!data.totalAmount || data.totalAmount <= 0) {
    return { success: false, error: "Total amount must be greater than 0" };
  }

  const paid = Math.max(0, data.amountPaid ?? 0);
  const owed = Math.max(0, data.totalAmount - paid);
  const status = owed === 0 ? "settled" : paid > 0 ? "partially_paid" : "unpaid";

  const { error } = await supabase.from("customer_debts").insert({
    tenant_id: tenantId,
    customer_name: data.customerName.trim(),
    customer_phone: data.customerPhone?.trim() || null,
    total_amount: data.totalAmount,
    amount_paid: paid,
    amount_owed: owed,
    status,
    due_date: data.dueDate || null,
    notes: data.notes?.trim() || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Also record paid amount into ledger if paid > 0
  if (paid > 0) {
    await supabase.from("ledger_entries").insert({
      tenant_id: tenantId,
      type: "sale",
      amount: paid,
      item_description: `Initial payment from ${data.customerName.trim()} (Debt total: ₦${data.totalAmount.toLocaleString()})`,
      payment_method: "transfer",
      source: "dashboard_manual",
    });
  }

  revalidatePath("/dashboard/debts");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Record a payment against an existing debt.
 */
export async function recordDebtPayment(
  debtId: number,
  paymentAmount: number,
  paymentMethod: string = "transfer"
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  if (!paymentAmount || paymentAmount <= 0) {
    return { success: false, error: "Payment amount must be greater than 0" };
  }

  // Fetch current debt
  const { data: debt, error: fetchErr } = await supabase
    .from("customer_debts")
    .select("*")
    .eq("id", debtId)
    .eq("tenant_id", tenantId)
    .single();

  if (fetchErr || !debt) {
    return { success: false, error: "Debt record not found" };
  }

  const currentPaid = Number(debt.amount_paid);
  const totalAmount = Number(debt.total_amount);
  const newPaid = Math.min(totalAmount, currentPaid + paymentAmount);
  const newOwed = Math.max(0, totalAmount - newPaid);
  const newStatus = newOwed === 0 ? "settled" : "partially_paid";

  const { error: updateErr } = await supabase
    .from("customer_debts")
    .update({
      amount_paid: newPaid,
      amount_owed: newOwed,
      status: newStatus,
    })
    .eq("id", debtId)
    .eq("tenant_id", tenantId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  // Record payment in ledger
  await supabase.from("ledger_entries").insert({
    tenant_id: tenantId,
    type: "sale",
    amount: paymentAmount,
    item_description: `Debt payment received from ${debt.customer_name} [debt:${debt.id}] [rem:${newOwed}]`,
    payment_method: paymentMethod,
    customer_name: debt.customer_name,
    source: "dashboard_manual",
  });

  revalidatePath("/dashboard/debts");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Mark a debt as fully settled.
 */
export async function settleDebt(debtId: number): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  const { data: debt } = await supabase
    .from("customer_debts")
    .select("total_amount, amount_paid, amount_owed, customer_name")
    .eq("id", debtId)
    .eq("tenant_id", tenantId)
    .single();

  if (!debt) return { success: false, error: "Debt record not found" };

  const outstanding = Number(debt.amount_owed);
  const total = Number(debt.total_amount);

  const { error } = await supabase
    .from("customer_debts")
    .update({
      amount_paid: total,
      amount_owed: 0,
      status: "settled",
    })
    .eq("id", debtId)
    .eq("tenant_id", tenantId);

  if (error) return { success: false, error: error.message };

  if (outstanding > 0) {
    await supabase.from("ledger_entries").insert({
      tenant_id: tenantId,
      type: "sale",
      amount: outstanding,
      item_description: `Debt settlement from ${debt.customer_name} [debt:${debtId}] [rem:0]`,
      payment_method: "cash",
      customer_name: debt.customer_name,
      source: "dashboard_manual",
    });
  }

  revalidatePath("/dashboard/debts");
  revalidatePath("/dashboard");
  return { success: true };
}
