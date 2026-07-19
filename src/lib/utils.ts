/**
 * Format a number as Naira using Intl.NumberFormat.
 * Uses tabular figures via font-mono in consuming components.
 */
export function formatNaira(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
