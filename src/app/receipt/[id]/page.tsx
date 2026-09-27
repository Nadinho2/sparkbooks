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
    .select("id, business_name, whatsapp_number")
    .eq("id", entry.tenant_id)
    .single();

  // 3. Fetch optional linked customer debt / credit info
  let debtInfo: {
    customer_name: string;
    total_amount: number;
    amount_paid: number;
    amount_owed: number;
    status: string;
  } | null = null;

  try {
    const { data: debt } = await supabase
      .from("customer_debts")
      .select("customer_name, total_amount, amount_paid, amount_owed, status")
      .eq("linked_entry_id", entry.id)
      .limit(1)
      .maybeSingle();

    if (debt) {
      debtInfo = {
        customer_name: debt.customer_name,
        total_amount: Number(debt.total_amount),
        amount_paid: Number(debt.amount_paid),
        amount_owed: Number(debt.amount_owed),
        status: debt.status,
      };
    }
  } catch {
    // If customer_debts table is not yet created, proceed without it
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
  const totalAmount = debtInfo ? debtInfo.total_amount : Number(entry.amount);
  const amountPaid = debtInfo ? debtInfo.amount_paid : Number(entry.amount);
  const amountOwed = debtInfo ? debtInfo.amount_owed : 0;
  const isDebt = amountOwed > 0;
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

  const prodName =
    (entry.products as unknown as { name: string }[])?.[0]?.name ||
    entry.item_description ||
    "Purchased Item";

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
          Official Digital Receipt
        </span>
      </div>

      {/* Main Printable Receipt Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-rule/70 p-6 sm:p-8 relative overflow-hidden print:shadow-none print:border-none print:p-0 print:max-w-none">
        {/* Decorative Top Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-money via-spark to-[#25D366] print:hidden" />

        {/* Header Section */}
        <div className="text-center pb-6 border-b border-dashed border-rule">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-sand border border-rule/80 text-money mb-3 shadow-xs">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-ink tracking-tight">
            {businessName}
          </h1>
          {businessPhone && (
            <p className="text-xs text-ink-muted mt-0.5">
              WhatsApp: +{businessPhone.replace(/^\+/, "")}
            </p>
          )}
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-paper border border-rule/80 text-ink-muted">
            <span>Receipt #{receiptNum}</span>
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
            {isDebt ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                BALANCE DUE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                PAID IN FULL
              </span>
            )}
          </div>
        </div>

        {/* Purchased Items List */}
        <div className="py-5 border-b border-rule/60 space-y-3">
          <div className="flex justify-between text-xs font-semibold text-ink-muted uppercase tracking-wider">
            <span>Item Description</span>
            <span>Amount</span>
          </div>
          <div className="flex justify-between items-baseline pt-1">
            <div className="min-w-0 pr-4">
              <p className="font-medium text-ink text-sm leading-tight">
                {prodName}
              </p>
              {paymentMethod && (
                <p className="text-[11px] text-ink-muted mt-0.5">
                  Channel: {paymentMethod}
                </p>
              )}
            </div>
            <span className="font-display font-semibold text-base text-ink shrink-0">
              {nf.format(totalAmount)}
            </span>
          </div>
        </div>

        {/* Financial Summary Breakdown */}
        <div className="py-4 space-y-2 text-xs">
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

          {isDebt && (
            <div className="flex justify-between text-amber-800 font-semibold bg-amber-50 p-2.5 rounded-xl border border-amber-200 mt-2">
              <span>Outstanding Balance</span>
              <span>{nf.format(amountOwed)}</span>
            </div>
          )}

          <div className="pt-2 border-t border-rule/80 flex justify-between items-baseline text-sm font-bold">
            <span className="text-ink">Total Billed</span>
            <span className="text-lg font-display text-money">{nf.format(totalAmount)}</span>
          </div>
        </div>

        {/* Security & Verification Seal */}
        <div className="mt-4 pt-4 border-t border-dashed border-rule text-center">
          <div className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted bg-paper px-3 py-1 rounded-full">
            <svg className="w-3.5 h-3.5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Verified Transaction &bull; SparkBooks Ledger</span>
          </div>
        </div>

        {/* Actions (Print, Share to WhatsApp, Copy Link) */}
        <ReceiptActions
          receiptNumber={receiptNum}
          businessName={businessName}
          totalFormatted={nf.format(totalAmount)}
          receiptUrl={publicReceiptUrl}
          customerName={customerName}
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
