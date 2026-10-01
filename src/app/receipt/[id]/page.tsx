import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { ReceiptActions } from "@/components/receipt/ReceiptActions";

interface ReceiptPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ReceiptPageProps) {
  const { id } = await params;
  return {
    title: `Customer Receipt #SPK-${id.padStart(6, "0")} – SparkBooks`,
    description: "Official digital sales receipt powered by SparkBooks AI",
  };
}

export default async function ReceiptPage({ params }: ReceiptPageProps) {
  const { id } = await params;
  const entryId = parseInt(id, 10);
  if (isNaN(entryId) || entryId <= 0) {
    notFound();
  }

  const supabase = createAdminClient();

  // 1. Fetch ledger entry
  const { data: entry, error } = await supabase
    .from("ledger_entries")
    .select("id, tenant_id, type, amount, item_description, payment_method, customer_name, customer_phone, product_id, created_at, products(name, unit)")
    .eq("id", entryId)
    .maybeSingle();

  if (error || !entry) {
    notFound();
  }

  // 2. Fetch merchant / tenant info
  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", entry.tenant_id)
    .single();

  const brandLogoUrl = (tenant as { brand_logo_url?: string | null })?.brand_logo_url ?? null;
  const brandColor = (tenant as { brand_color?: string | null })?.brand_color || "#10B981";
  const shopAddress = (tenant as { shop_address?: string | null })?.shop_address ?? null;
  const landmark = (tenant as { landmark?: string | null })?.landmark ?? null;
  const cityLga = (tenant as { city_lga?: string | null })?.city_lga ?? null;
  const state = (tenant as { state?: string | null })?.state ?? null;
  const fullAddress = [shopAddress, landmark ? `(${landmark})` : null, cityLga, state].filter(Boolean).join(", ");

  // 3. Fetch optional linked customer debt / credit info
  let debtInfo: {
    id?: number;
    customer_name: string;
    total_amount: number;
    amount_paid: number;
    amount_owed: number;
    status: string;
    is_repayment: boolean;
    repayment_balance?: number;
    notes?: string | null;
  } | null = null;

  try {
    // A. Check if entry is the initial credit sale
    const { data: directDebt } = await supabase
      .from("customer_debts")
      .select("id, customer_name, total_amount, amount_paid, amount_owed, status, notes")
      .eq("linked_entry_id", entry.id)
      .limit(1)
      .maybeSingle();

    if (directDebt) {
      debtInfo = {
        id: directDebt.id,
        customer_name: directDebt.customer_name,
        total_amount: Number(directDebt.total_amount),
        amount_paid: Number(directDebt.amount_paid),
        amount_owed: Number(directDebt.amount_owed),
        status: directDebt.status,
        is_repayment: false,
        notes: directDebt.notes,
      };
    } else {
      // B. Check if this entry is a debt repayment!
      const debtIdMatch = entry.item_description?.match(/\[debt:(\d+)\]/i);
      const remMatch = entry.item_description?.match(/\[rem:(\d+(?:\.\d+)?)\]/i);
      const isRepaymentDesc = /\bdebt\s+(?:re)?payment\b/i.test(entry.item_description || "");

      let matchedDebt: any = null;

      if (debtIdMatch && debtIdMatch[1]) {
        const debtId = parseInt(debtIdMatch[1], 10);
        const { data: d } = await supabase
          .from("customer_debts")
          .select("id, customer_name, total_amount, amount_paid, amount_owed, status, notes")
          .eq("id", debtId)
          .eq("tenant_id", entry.tenant_id)
          .maybeSingle();
        matchedDebt = d;
      }

      // If no tag or not found by tag, check by customer name if it indicates repayment
      if (!matchedDebt && (isRepaymentDesc || entry.customer_name)) {
        const lookupName = entry.customer_name || (() => {
          const m = entry.item_description?.match(/from\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
          return m ? m[1].trim() : null;
        })();

        if (lookupName) {
          const { data: d } = await supabase
            .from("customer_debts")
            .select("id, customer_name, total_amount, amount_paid, amount_owed, status, notes, linked_entry_id")
            .eq("tenant_id", entry.tenant_id)
            .ilike("customer_name", `%${lookupName.trim()}%`)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (d && (isRepaymentDesc || d.linked_entry_id !== entry.id)) {
            matchedDebt = d;
          }
        }
      }

      if (matchedDebt) {
        const explicitRem = remMatch ? parseFloat(remMatch[1]) : Number(matchedDebt.amount_owed);
        debtInfo = {
          id: matchedDebt.id,
          customer_name: matchedDebt.customer_name,
          total_amount: Number(matchedDebt.total_amount),
          amount_paid: Number(matchedDebt.amount_paid),
          amount_owed: explicitRem,
          status: matchedDebt.status,
          is_repayment: true,
          repayment_balance: explicitRem,
          notes: matchedDebt.notes,
        };
      }
    }
  } catch (err) {
    console.warn("Could not query customer_debts:", err);
  }

  // 4. Resolve customer name
  const entryCustomer = (entry as { customer_name?: string | null })?.customer_name;
  let customerName = debtInfo?.customer_name || entryCustomer || null;

  // Fallback: If not explicitly saved in column, check item_description for "to [Name]" or "from [Name]"
  if (!customerName && entry.item_description) {
    const toMatch = entry.item_description.match(/\b(?:to|from)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/i);
    if (toMatch && toMatch[1]) {
      const candidate = toMatch[1].trim();
      const forbidden = ["transfer", "cash", "pos", "bank", "store", "shop", "me", "him", "her", "them", "sale"];
      if (!forbidden.includes(candidate.toLowerCase())) {
        customerName = candidate;
      }
    }
  }

  const nf = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  });

  const businessName = tenant?.business_name || "Merchant";
  const businessPhone = tenant?.whatsapp_number || "";
  const receiptNum = `SPK-${entry.id.toString().padStart(6, "0")}`;

  const isRepayment = !!debtInfo?.is_repayment;
  const isOriginalCreditSale = !isRepayment && !!debtInfo && Number(debtInfo.amount_owed) > 0;
  const paymentAmount = Number(entry.amount);

  // Accurate balance remaining calculation
  const remainingBalance = isRepayment
    ? (debtInfo?.repayment_balance !== undefined ? debtInfo.repayment_balance : (debtInfo?.amount_owed ?? 0))
    : (debtInfo ? debtInfo.amount_owed : 0);

  const isFullySettled = remainingBalance === 0;

  const totalAmount = isRepayment ? paymentAmount : (debtInfo ? debtInfo.total_amount : paymentAmount);
  const amountPaid = isRepayment ? paymentAmount : (debtInfo ? debtInfo.amount_paid : paymentAmount);

  const rawMethod = entry.payment_method?.trim();
  const paymentMethod =
    rawMethod && rawMethod.toLowerCase() !== "unspecified"
      ? rawMethod.toUpperCase()
      : null;

  const formattedDate = new Date(entry.created_at).toLocaleDateString("en-NG", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Strip internal tags like [debt:123] and [rem:45000] for customer display
  const rawDesc = entry.item_description || "";
  const cleanedDesc = rawDesc
    .replace(/\[debt:\d+\]/gi, "")
    .replace(/\[rem:[\d.]+\]/gi, "")
    .trim();

  const prodName = isRepayment
    ? "Debt Repayment on Account"
    : ((entry.products as unknown as { name: string }[])?.[0]?.name || cleanedDesc || "Purchased Item");

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://sparkbooks-jade.vercel.app";
  const publicReceiptUrl = `${baseUrl.replace(/\/$/, "")}/receipt/${entry.id}`;

  return (
    <div className="min-h-screen bg-sand-light py-8 px-4 sm:px-6 flex flex-col items-center justify-center font-sans antialiased text-ink">
      {/* Top Banner (Hidden in Print) */}
      <div className="w-full max-w-md flex items-center justify-between mb-4 px-2 print:hidden">
        <Link
          href="/"
          className="font-display text-lg text-ink font-bold tracking-tight hover:opacity-80 transition-opacity"
        >
          SparkBooks<span className="text-spark font-normal">.</span>
        </Link>
        <span className="text-[11px] font-medium text-ink-muted bg-white/80 px-2.5 py-1 rounded-full border border-rule/50">
          {isRepayment ? "Debt Repayment Receipt" : "Official Digital Receipt"}
        </span>
      </div>

      {/* Main Printable Receipt Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-rule/70 p-6 sm:p-8 relative overflow-hidden print:shadow-none print:border-none print:p-0 print:max-w-none">
        {/* Decorative Top Accent Bar */}
        <div
          className="absolute top-0 left-0 right-0 h-2 print:hidden"
          style={{
            background: `linear-gradient(90deg, ${brandColor}, ${brandColor}dd, #25D366)`,
          }}
        />

        {/* Header Section */}
        <div className="text-center pb-6 border-b border-dashed border-rule">
          {brandLogoUrl ? (
            <div className="flex justify-center mb-3">
              <img
                src={brandLogoUrl}
                alt={businessName}
                className="max-h-16 max-w-[150px] object-contain rounded-xl shadow-xs"
              />
            </div>
          ) : (
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl border mb-3 shadow-xs"
              style={{
                backgroundColor: `${brandColor}15`,
                borderColor: `${brandColor}40`,
                color: brandColor,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
          )}
          <h1 className="font-display text-xl sm:text-2xl font-bold text-ink tracking-tight">
            {businessName}
          </h1>
          {businessPhone && (
            <p className="text-xs text-ink-muted mt-0.5">
              WhatsApp: +{businessPhone.replace(/^\+/, "")}
            </p>
          )}
          {fullAddress && (
            <p className="text-xs text-ink-muted mt-0.5 max-w-xs mx-auto">
              📍 {fullAddress}
            </p>
          )}
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-paper border border-rule/80 text-ink-muted">
            <span>Receipt #{receiptNum}</span>
            {isRepayment && (
              <>
                <span>&bull;</span>
                <span className="text-spark font-bold">REPAYMENT</span>
              </>
            )}
            <span>&bull;</span>
            <span>{formattedDate}</span>
          </div>
        </div>

        {/* Customer & Status Bar */}
        <div className="py-4 border-b border-rule/60 flex items-center justify-between text-xs">
          <div>
            <span className="text-ink-muted block text-[11px]">Billed To</span>
            <span className="font-semibold text-ink text-sm">
              {customerName || "Valued Customer"}
            </span>
          </div>
          <div className="text-right">
            <span className="text-ink-muted block text-[11px]">Payment Status</span>
            {isRepayment ? (
              !isFullySettled ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  PARTIAL REPAYMENT
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  DEBT FULLY SETTLED
                </span>
              )
            ) : isOriginalCreditSale ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                BALANCE DUE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                PAID IN FULL
              </span>
            )}
          </div>
        </div>

        {/* Purchased Items List */}
        <div className="py-5 border-b border-rule/60 space-y-3">
          <div className="flex justify-between text-xs font-semibold text-ink-muted uppercase tracking-wider">
            <span>Description</span>
            <span>{isRepayment ? "Payment Amount" : "Amount"}</span>
          </div>
          <div className="flex justify-between items-baseline pt-1">
            <div className="min-w-0 pr-4">
              <p className="font-medium text-ink text-sm leading-tight">
                {prodName}
              </p>
              {isRepayment ? (
                <p className="text-[11px] text-ink-muted mt-0.5">
                  {debtInfo?.notes ? `Items: ${debtInfo.notes}` : `Payment credited to customer account`}
                </p>
              ) : paymentMethod ? (
                <p className="text-[11px] text-ink-muted mt-0.5">
                  Channel: {paymentMethod}
                </p>
              ) : null}
            </div>
            <span className="font-display font-semibold text-base text-ink shrink-0">
              {nf.format(paymentAmount)}
            </span>
          </div>
        </div>

        {/* Financial Summary Breakdown */}
        <div className="py-4 space-y-2 text-xs">
          {isRepayment ? (
            <>
              <div className="flex justify-between text-ink-muted">
                <span>Payment Received (This Receipt)</span>
                <span className="font-semibold text-ink">{nf.format(paymentAmount)}</span>
              </div>

              {paymentMethod ? (
                <div className="flex justify-between text-ink-muted">
                  <span>Payment Channel</span>
                  <span className="font-medium text-ink">{paymentMethod}</span>
                </div>
              ) : (
                <div className="flex justify-between text-ink-muted">
                  <span>Payment Channel</span>
                  <span className="font-medium text-emerald-700">Direct Payment</span>
                </div>
              )}

              {debtInfo && (
                <>
                  <div className="flex justify-between text-ink-muted">
                    <span>Original Debt Total</span>
                    <span className="font-medium text-ink">{nf.format(debtInfo.total_amount)}</span>
                  </div>
                  <div className="flex justify-between text-ink-muted">
                    <span>Cumulative Paid to Date</span>
                    <span className="font-semibold text-emerald-700">{nf.format(debtInfo.amount_paid)}</span>
                  </div>
                </>
              )}

              {/* Outstanding Balance Callout Box */}
              {remainingBalance > 0 ? (
                <div className="bg-amber-50/90 border border-amber-300/80 rounded-2xl p-3.5 mt-2 space-y-1">
                  <div className="flex justify-between items-center text-amber-900 font-bold text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      Remaining Balance Due
                    </span>
                    <span className="font-mono text-sm font-extrabold text-amber-900">
                      {nf.format(remainingBalance)}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-snug">
                    This payment of <strong>{nf.format(paymentAmount)}</strong> was credited to {customerName}&apos;s balance. An outstanding balance of <strong>{nf.format(remainingBalance)}</strong> remains due.
                  </p>
                </div>
              ) : (
                <div className="bg-emerald-50/90 border border-emerald-300/80 rounded-2xl p-3.5 mt-2 space-y-1">
                  <div className="flex justify-between items-center text-emerald-900 font-bold text-xs">
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Remaining Balance
                    </span>
                    <span className="font-mono text-sm font-extrabold text-emerald-900">
                      ₦0.00
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-snug font-medium">
                    🎉 Account fully settled! The customer&apos;s debt has been paid in full with no outstanding balance.
                  </p>
                </div>
              )}

              <div className="pt-2 border-t border-rule/80 flex justify-between items-baseline text-sm font-bold">
                <span className="text-ink">Payment Credited</span>
                <span className="text-lg font-display" style={{ color: brandColor }}>
                  {nf.format(paymentAmount)}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-ink-muted">
                <span>Subtotal</span>
                <span className="font-medium text-ink">{nf.format(totalAmount)}</span>
              </div>

              {paymentMethod ? (
                <div className="flex justify-between text-ink-muted">
                  <span>Payment Method</span>
                  <span className="font-medium text-ink">{paymentMethod}</span>
                </div>
              ) : (
                <div className="flex justify-between text-ink-muted">
                  <span>Payment Status</span>
                  <span className="font-medium text-emerald-700">Direct Payment</span>
                </div>
              )}

              <div className="flex justify-between text-ink-muted">
                <span>Amount Paid</span>
                <span className="font-semibold text-emerald-700">{nf.format(amountPaid)}</span>
              </div>

              {remainingBalance > 0 && (
                <div className="bg-amber-50/90 border border-amber-300/80 rounded-2xl p-3.5 mt-2 space-y-1">
                  <div className="flex justify-between items-center text-amber-900 font-bold text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      Outstanding Balance Due
                    </span>
                    <span className="font-mono text-sm font-extrabold text-amber-900">
                      {nf.format(remainingBalance)}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-snug">
                    Customer paid a deposit of {nf.format(amountPaid)}. The remaining balance of {nf.format(remainingBalance)} is due.
                  </p>
                </div>
              )}

              <div className="pt-2 border-t border-rule/80 flex justify-between items-baseline text-sm font-bold">
                <span className="text-ink">Total Billed</span>
                <span className="text-lg font-display" style={{ color: brandColor }}>
                  {nf.format(totalAmount)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Security & Verification Seal */}
        <div className="mt-4 pt-4 border-t border-dashed border-rule text-center space-y-2">
          <p className="text-xs font-semibold text-ink tracking-wide">
            Thank You For Your Patronage!
          </p>
          <div
            className="inline-flex items-center gap-1.5 text-[11px] px-3.5 py-1 rounded-full font-medium"
            style={{
              backgroundColor: `${brandColor}12`,
              color: brandColor,
            }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Verified Transaction &bull; {businessName}</span>
          </div>
        </div>

        {/* Actions (Print, Share to WhatsApp, Copy Link) */}
        <ReceiptActions
          receiptNumber={receiptNum}
          businessName={businessName}
          totalFormatted={nf.format(paymentAmount)}
          receiptUrl={publicReceiptUrl}
          customerName={customerName}
          isRepayment={isRepayment}
          remainingBalance={remainingBalance}
          remainingBalanceFormatted={nf.format(remainingBalance)}
        />
      </div>

      {/* Viral Referral Footer (SparkBooks branding) */}
      <footer className="mt-8 text-center max-w-sm px-4 print:hidden">
        <div className="bg-white/90 backdrop-blur-xs p-4 rounded-2xl border border-rule/60 shadow-xs">
          <p className="text-xs font-semibold text-ink">
            Are you a merchant or store owner?
          </p>
          <p className="text-[11px] text-ink-muted mt-1 leading-relaxed">
            Record sales, manage debtors, track inventory, and send branded digital receipts directly from WhatsApp.
          </p>
          <Link
            href="/"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-spark hover:underline"
          >
            Create your free account on SparkBooks &rarr;
          </Link>
        </div>
        <p className="text-[10px] text-ink-muted/80 mt-3">
          &copy; {new Date().getFullYear()} SparkBooks AI. Built for African Commerce.
        </p>
      </footer>
    </div>
  );
}
