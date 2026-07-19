const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format a number as Naira (₦).
 * Use this everywhere monetary values are displayed — never hardcode ₦.
 */
export function formatNaira(amount: number): string {
  return nairaFormatter.format(amount);
}
