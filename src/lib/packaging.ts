/**
 * Multi-Tier Packaging Hierarchy (Unit Ladder) for SparkBooks
 *
 * Supports arbitrary retail & wholesale packaging hierarchies:
 * - Pharmacy / Chemist: Carton -> Pack -> Card -> Tablet
 * - FMCG / Groceries: Carton -> Roll -> Sachet
 * - Drinks: Crate/Shrink -> Bottle/Can
 * - Stationery: Carton -> Ream -> Sheet
 * - Hardware: Carton/Box -> Packet -> Piece
 */

export interface PackagingUnit {
  /** Unit name, e.g. "card", "pack", "carton", "roll", "crate", "bundle" */
  name: string;
  /** How many of the immediate sub-unit this unit contains */
  size: number;
  /** How many atomic BASE units 1 of this unit contains */
  to_base: number;
}

/**
 * Normalizes a unit string for comparison:
 * - Lowercases and trims
 * - Removes common English plural suffixes ("cartons" -> "carton", "packs" -> "pack", "cards" -> "card", "tablets" -> "tablet")
 * - Handles special plurals ("boxes" -> "box")
 */
export function normalizeUnitName(unit?: string | null): string {
  if (!unit) return "";
  let clean = unit.trim().toLowerCase();

  // Common special plurals
  if (clean === "boxes") return "box";
  if (clean === "pieces" || clean === "pcs") return "pcs";
  if (clean === "feet") return "foot";

  // Standard plurals ending in s (avoid stripping "pcs" or words ending in double-s like "glass")
  if (clean.length > 3 && clean.endsWith("s") && !clean.endsWith("ss") && clean !== "pcs") {
    clean = clean.slice(0, -1);
  }

  return clean;
}

/**
 * Computes the `to_base` multiplier for each tier in a ladder.
 * Tiers should be ordered from lowest (closest to base) to highest (wholesale).
 *
 * Example:
 * Base: tablet
 * Tiers input:
 *   [ { name: "card", size: 10 }, { name: "pack", size: 10 }, { name: "carton", size: 50 } ]
 *
 * Output:
 *   card: size 10, to_base: 10
 *   pack: size 10, to_base: 100
 *   carton: size 50, to_base: 5000
 */
export function buildPackagingLadder(
  tiers: Array<{ name: string; size: number }>,
): PackagingUnit[] {
  let runningMultiplier = 1;
  const result: PackagingUnit[] = [];

  for (const tier of tiers) {
    const cleanName = normalizeUnitName(tier.name);
    const size = Math.max(1, Number(tier.size) || 1);
    runningMultiplier = runningMultiplier * size;

    result.push({
      name: cleanName,
      size,
      to_base: runningMultiplier,
    });
  }

  return result;
}

/**
 * Safely parses packaging units stored in JSONB or creates a synthetic 1-tier ladder from pieces_per_pack.
 */
export function parsePackagingUnits(
  raw: any,
  fallbackPiecesPerPack?: number | null,
): PackagingUnit[] {
  if (Array.isArray(raw) && raw.length > 0) {
    const valid = raw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const name = normalizeUnitName(item.name);
        const size = Math.max(1, Number(item.size) || 1);
        const to_base = Math.max(1, Number(item.to_base) || size);
        if (!name) return null;
        return { name, size, to_base };
      })
      .filter((item): item is PackagingUnit => item !== null);

    if (valid.length > 0) {
      // Ensure sorted ascending by to_base
      return valid.sort((a, b) => a.to_base - b.to_base);
    }
  }

  // Fallback to legacy pieces_per_pack
  if (fallbackPiecesPerPack && Number(fallbackPiecesPerPack) > 1) {
    const packSize = Number(fallbackPiecesPerPack);
    return [
      {
        name: "pack",
        size: packSize,
        to_base: packSize,
      },
    ];
  }

  return [];
}

/**
 * Resolves how many BASE units a given transaction unit represents.
 *
 * Example:
 * Base: tablet
 * Ladder: card (10), pack (100), carton (5000)
 *
 * resolveUnitMultiplier("cards", ladder, "tablet") => { multiplier: 10, matchedTierName: "card" }
 * resolveUnitMultiplier("carton", ladder, "tablet") => { multiplier: 5000, matchedTierName: "carton" }
 * resolveUnitMultiplier("tablet", ladder, "tablet") => { multiplier: 1, matchedTierName: null }
 */
export function resolveUnitMultiplier(
  unitStr: string,
  packagingUnits: PackagingUnit[],
  baseUnit: string,
  fallbackPiecesPerPack?: number | null,
): {
  multiplier: number;
  matchedTier: PackagingUnit | null;
  isBaseUnit: boolean;
} {
  const normalized = normalizeUnitName(unitStr);
  const normalizedBase = normalizeUnitName(baseUnit);

  // If matches base unit
  if (normalized === normalizedBase || normalized === "pcs" || normalized === "unit") {
    return { multiplier: 1, matchedTier: null, isBaseUnit: true };
  }

  // Check packaging units
  const tiers = packagingUnits.length > 0
    ? packagingUnits
    : parsePackagingUnits(null, fallbackPiecesPerPack);

  for (const tier of tiers) {
    if (normalizeUnitName(tier.name) === normalized) {
      return {
        multiplier: tier.to_base,
        matchedTier: tier,
        isBaseUnit: false,
      };
    }
  }

  // Common generic bulk fallbacks if not explicitly named
  const GENERIC_BULK_TERMS = ["carton", "pack", "crate", "box", "bundle", "roll", "bag"];
  if (GENERIC_BULK_TERMS.includes(normalized) && tiers.length > 0) {
    // If user says "carton" but ladder has "carton", it already matched above.
    // If user says a generic term, use the highest tier in ladder:
    const topTier = tiers[tiers.length - 1];
    return {
      multiplier: topTier.to_base,
      matchedTier: topTier,
      isBaseUnit: false,
    };
  }

  if (GENERIC_BULK_TERMS.includes(normalized) && fallbackPiecesPerPack && Number(fallbackPiecesPerPack) > 1) {
    return {
      multiplier: Number(fallbackPiecesPerPack),
      matchedTier: null,
      isBaseUnit: false,
    };
  }

  // Default: 1 (base unit)
  return { multiplier: 1, matchedTier: null, isBaseUnit: true };
}

/**
 * Converts a raw base quantity into a clean, human-readable packaging breakdown.
 *
 * Example:
 * Qty: 5,125 tablets
 * Ladder: card (10), pack (100), carton (5000)
 *
 * Returns:
 * summary: "1 carton, 1 pack, 2 cards, 5 tablets"
 * totalBase: "5,125 tablets"
 */
export function formatStockBreakdown(
  quantity: number,
  baseUnit: string,
  packagingUnits: PackagingUnit[],
): {
  summary: string;
  totalBase: string;
  parts: Array<{ count: number; unitName: string }>;
} {
  const normBase = baseUnit || "pcs";
  const qty = Math.max(0, Number(quantity) || 0);

  if (!packagingUnits || packagingUnits.length === 0 || qty === 0) {
    const formattedNum = Number.isInteger(qty) ? qty.toLocaleString() : qty.toFixed(1);
    return {
      summary: `${formattedNum} ${normBase}`,
      totalBase: `${formattedNum} ${normBase}`,
      parts: [{ count: qty, unitName: normBase }],
    };
  }

  // Sort descending by to_base to break down from largest container to smallest
  const sorted = [...packagingUnits].sort((a, b) => b.to_base - a.to_base);

  let remaining = qty;
  const parts: Array<{ count: number; unitName: string }> = [];

  for (const tier of sorted) {
    if (tier.to_base <= 1) continue;
    const count = Math.floor(remaining / tier.to_base);
    if (count > 0) {
      parts.push({
        count,
        unitName: count === 1 ? tier.name : `${tier.name}s`,
      });
      remaining = remaining % tier.to_base;
    }
  }

  // Any remaining loose base units
  if (remaining > 0 || parts.length === 0) {
    const looseNum = Number.isInteger(remaining) ? remaining : Number(remaining.toFixed(2));
    parts.push({
      count: looseNum,
      unitName: looseNum === 1 ? normBase : `${normBase}${normBase.endsWith("s") ? "" : "s"}`,
    });
  }

  const summary = parts.map((p) => `${p.count.toLocaleString()} ${p.unitName}`).join(", ");
  const formattedTotal = Number.isInteger(qty) ? qty.toLocaleString() : qty.toFixed(1);

  return {
    summary,
    totalBase: `${formattedTotal} ${normBase}`,
    parts,
  };
}

/**
 * Preset Packaging Templates for Quick Setup in UI
 */
export const PACKAGING_TEMPLATES = [
  {
    id: "pharmacy_blister",
    label: "💊 Pharmacy (Carton → Pack → Card → Tablets)",
    baseUnit: "tablets",
    tiers: [
      { name: "card", size: 10 },
      { name: "pack", size: 10 },
      { name: "carton", size: 50 },
    ],
  },
  {
    id: "pharmacy_syrup",
    label: "🧪 Pharmacy (Carton → Bottles)",
    baseUnit: "bottles",
    tiers: [
      { name: "carton", size: 24 },
    ],
  },
  {
    id: "fmcg_biscuit",
    label: "🍪 Biscuits & Groceries (Carton → Roll → Sachets)",
    baseUnit: "sachets",
    tiers: [
      { name: "roll", size: 10 },
      { name: "carton", size: 12 },
    ],
  },
  {
    id: "fmcg_seasoning",
    label: "🧂 Seasoning (Carton → Pack → Cubes)",
    baseUnit: "cubes",
    tiers: [
      { name: "pack", size: 100 },
      { name: "carton", size: 50 },
    ],
  },
  {
    id: "drinks_crate",
    label: "🍾 Drinks & Beer (Crate / Pack → Bottles / Cans)",
    baseUnit: "bottles",
    tiers: [
      { name: "crate", size: 24 },
    ],
  },
  {
    id: "stationery_paper",
    label: "📄 Stationery (Carton → Ream → Sheets)",
    baseUnit: "sheets",
    tiers: [
      { name: "ream", size: 500 },
      { name: "carton", size: 5 },
    ],
  },
  {
    id: "hair_attachment",
    label: "🧵 Hair & Fashion (Carton → Bundle → Pieces)",
    baseUnit: "pcs",
    tiers: [
      { name: "bundle", size: 3 },
      { name: "carton", size: 20 },
    ],
  },
  {
    id: "simple_carton",
    label: "📦 Simple Carton (Carton → Pieces)",
    baseUnit: "pcs",
    tiers: [
      { name: "carton", size: 40 },
    ],
  },
] as const;
