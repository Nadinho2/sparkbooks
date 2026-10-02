/** Maps business type to sensible default category names. */
export const BUSINESS_CATEGORIES: Record<string, string[]> = {
  "Hair/Beauty": ["Wigs", "Weavon/Bundles", "Accessories", "Tools"],
  Provisions: ["Foodstuff", "Drinks", "Household", "Toiletries"],
  Fashion: ["Clothing", "Shoes", "Bags", "Accessories"],
};

/**
 * Word-level Jaccard similarity for fuzzy product matching.
 * Returns matches where similarity >= threshold.
 */
export function findFuzzyMatches(
  query: string,
  candidates: string[],
  threshold = 0.6,
): string[] {
  const queryWords = new Set(
    query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean),
  );

  if (queryWords.size === 0) return [];

  return candidates.filter((candidate) => {
    const candidateWords = new Set(
      candidate
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .filter(Boolean),
    );

    if (candidateWords.size === 0) return false;

    const intersection = new Set(
      [...queryWords].filter((w) => candidateWords.has(w)),
    );
    const union = new Set([...queryWords, ...candidateWords]);
    const similarity = intersection.size / union.size;

    return similarity >= threshold;
  });
}

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insertion
        prev[j] + 1,           // deletion
        prev[j - 1] + cost     // substitution
      );
    }
    prev = [...curr];
  }

  return curr[n];
}

export function stringSimilarity(s1: string, s2: string): number {
  const norm1 = normalizeStr(s1);
  const norm2 = normalizeStr(s2);
  if (norm1 === norm2) return 1.0;
  if (!norm1 || !norm2) return 0.0;

  // Short word guard: for words 3 letters or fewer, require exact equality
  if (norm1.length <= 3 || norm2.length <= 3) {
    return norm1 === norm2 ? 1.0 : 0.0;
  }

  // Substring check
  if (norm1.length >= 4 && norm2.length >= 4) {
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      const shorter = Math.min(norm1.length, norm2.length);
      const longer = Math.max(norm1.length, norm2.length);
      if (shorter / longer >= 0.45) {
        return Math.max(0.80, shorter / longer);
      }
    }
  }

  // Token Jaccard similarity
  const words1 = new Set(norm1.split(/\s+/).filter(Boolean));
  const words2 = new Set(norm2.split(/\s+/).filter(Boolean));
  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  const jaccard = union.size > 0 ? intersection.size / union.size : 0;

  // Levenshtein similarity
  const maxLen = Math.max(norm1.length, norm2.length);
  const dist = levenshteinDistance(norm1, norm2);
  const levSim = maxLen > 0 ? 1 - dist / maxLen : 0;

  return Math.max(jaccard, levSim, 0.4 * jaccard + 0.6 * levSim);
}

export interface CatalogProductCandidate {
  id: number;
  name: string;
  quantity?: number;
  unit: string;
  unit_cost?: number | null;
  is_service?: boolean;
}

export interface CatalogMatchResult {
  exactMatch?: CatalogProductCandidate;
  fuzzyCandidates: Array<{
    item: CatalogProductCandidate;
    score: number;
  }>;
}

export function calculateProductSimilarity(query: string, candidateName: string): number {
  const normQ = normalizeStr(query);
  const normC = normalizeStr(candidateName);
  if (normQ === normC) return 1.0;
  if (!normQ || !normC) return 0.0;

  const wholeScore = stringSimilarity(normQ, normC);

  const qWords = normQ.split(/\s+/).filter(Boolean);
  const cWords = normC.split(/\s+/).filter(Boolean);
  if (qWords.length === 0 || cWords.length === 0) return wholeScore;

  // Best token alignment
  let totalScore = 0;
  for (const qw of qWords) {
    let best = 0;
    for (const cw of cWords) {
      const s = stringSimilarity(qw, cw);
      if (s > best) best = s;
    }
    totalScore += best;
  }
  const avgTokenScore = totalScore / qWords.length;

  return Math.max(wholeScore, avgTokenScore);
}

export function findBestCatalogMatches(
  query: string,
  catalog: CatalogProductCandidate[],
): CatalogMatchResult {
  const normQ = normalizeStr(query);
  if (!normQ) return { fuzzyCandidates: [] };

  // 1. Check exact match
  const exact = catalog.find((c) => normalizeStr(c.name) === normQ);
  if (exact) {
    return { exactMatch: exact, fuzzyCandidates: [] };
  }

  // 2. Score all candidates using token alignment + whole string similarity
  const scored = catalog
    .map((item) => ({
      item,
      score: calculateProductSimilarity(normQ, item.name),
    }))
    .filter((entry) => entry.score >= 0.65)
    .sort((a, b) => b.score - a.score);

  // If top match is virtually identical (e.g. >= 0.98 whole match)
  if (scored.length > 0 && stringSimilarity(normQ, scored[0].item.name) >= 0.98) {
    return { exactMatch: scored[0].item, fuzzyCandidates: [] };
  }

  return {
    fuzzyCandidates: scored.slice(0, 2),
  };
}

const CATALOG_REPLY_ALLOWED_WORDS = new Set([
  // Units
  "pcs", "piece", "pieces", "pk", "pack", "packs", "carton", "cartons", "bundle", "bundles", "bottle", "bottles",
  "bag", "bags", "crate", "crates", "yard", "yards", "roll", "rolls", "box", "boxes", "tin", "tins", "sachet", "sachets",
  "pair", "pairs", "set", "sets", "dozen", "dozens", "unit", "units", "item", "items", "service",
  // Stock keywords
  "stock", "in", "have", "got", "remaining", "left", "count", "qty", "quantity", "available", "just", "only",
  // Cost keywords
  "cost", "bought", "purchase", "price", "each", "per", "at", "for", "apiece", "wholesale", "cp", "naira", "ngn",
  // Control keywords
  "skip", "pass", "proceed", "record", "later", "cancel", "nevermind", "abort", "stop", "undo", "leave", "forget",
  "craft", "labor", "labour", "braiding", "styling", "sewing", "barbing", "makeup", "install", "delivery",
  // Conversational fillers
  "i", "we", "my", "shop", "store", "is", "was", "are", "were", "it", "its", "of", "and", "with", "the", "to", "here",
  "now", "actually", "already", "total", "please", "ok", "yes", "no"
]);

export function parseNewProductCatalogingReply(replyText: string): {
  isSkip: boolean;
  isCancel: boolean;
  isService: boolean;
  stockQty: number | null;
  unitCost: number | null;
  unit: string;
  isDisplacedTransaction: boolean;
} {
  const text = replyText.trim();
  if (/^(cancel|nevermind|abort|stop|undo|leave it|forget it|don't record|dont record|this is not correct|cancel sale)\b/i.test(text)) {
    return { isSkip: false, isCancel: true, isService: false, stockQty: null, unitCost: null, unit: "pcs", isDisplacedTransaction: false };
  }
  if (/^(skip|pass|proceed|record|just record|later|no|without stock|record anyway)\b/i.test(text)) {
    return { isSkip: true, isCancel: false, isService: false, stockQty: null, unitCost: null, unit: "pcs", isDisplacedTransaction: false };
  }

  // 1. Pre-process thousands separators e.g. 1,500 -> 1500
  let clean = text.replace(/(\d+),(\d{3})\b/g, (m, g1, g2) => g1 + g2);

  // 2. Separate joined digits from unit letters (e.g. "30pcs" -> "30 pcs", "10packs" -> "10 packs", leaving "5k" intact)
  clean = clean.replace(/(\d+)([a-zA-Z]{2,})/g, (m, g1, g2) => g1 + " " + g2);

  // 3. Convert standalone 'k' notation to thousands: e.g. 5k -> 5000, 2.5k -> 2500
  clean = clean.replace(/\b(\d+(?:\.\d+)?)\s*k\b/gi, (m, n) => String(Math.round(parseFloat(n) * 1000)));

  // 4. Check if message is a completely different transaction
  const cleanLower = clean.toLowerCase();
  const hasTransVerb = /\b(sold|expense|spent|paid|debt|credit|owes|transfer|pos|summary|report|balance|login)\b/i.test(cleanLower);
  const words = cleanLower.replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
  const alphaWords = words.filter((w) => !/^\d+$/.test(w));
  const hasUnrecognizedWords = alphaWords.some((w) => !CATALOG_REPLY_ALLOWED_WORDS.has(w));

  if (hasTransVerb || (alphaWords.length > 0 && hasUnrecognizedWords)) {
    return { isSkip: false, isCancel: false, isService: false, stockQty: null, unitCost: null, unit: "pcs", isDisplacedTransaction: true };
  }

  if (/\b(service|craft|labor|labour|braiding|styling|sewing|barbing|makeup|install|installation|delivery)\b/i.test(text)) {
    return { isSkip: false, isCancel: false, isService: true, stockQty: 0, unitCost: null, unit: "service", isDisplacedTransaction: false };
  }

  // Detect Unit
  let unit = "pcs";
  const unitMatch = clean.match(/\b(packs?|cartons?|bundles?|bottles?|bags?|yards?|rolls?|pieces?|pcs|crates?|boxes?|tins?|sachets?|pairs?|sets?)\b/i);
  if (unitMatch) {
    const rawU = unitMatch[1].toLowerCase();
    if (rawU.startsWith("pack")) unit = "packs";
    else if (rawU.startsWith("carton")) unit = "cartons";
    else if (rawU.startsWith("bundle")) unit = "bundles";
    else if (rawU.startsWith("bottle")) unit = "bottles";
    else if (rawU.startsWith("bag")) unit = "bags";
    else if (rawU.startsWith("yard")) unit = "yards";
    else if (rawU.startsWith("roll")) unit = "rolls";
    else if (rawU.startsWith("crate")) unit = "crates";
    else if (rawU.startsWith("box")) unit = "boxes";
    else if (rawU.startsWith("tin")) unit = "tins";
    else if (rawU.startsWith("sachet")) unit = "sachets";
    else if (rawU.startsWith("pair")) unit = "pairs";
    else if (rawU.startsWith("set")) unit = "sets";
    else unit = "pcs";
  }

  let stockQty: number | null = null;
  let unitCost: number | null = null;

  // 1. Bought/Have Qty for/at/with Total: e.g. 'bought 10 for 5000', '10 pcs @ 5000', '15 @ 2000', 'have 20, bought 3000 each'
  const qtyAtPriceMatch = clean.match(/(?:(?:bought|have|got)\s+)?(\d+(?:\.\d+)?)\s*(?:pcs|pieces|items|units|packs?|cartons?|bundles?|bottles?|bags?|crates?|boxes?)?\s*(?:for|@|at)\s*(?:₦|ngn)?\s*(\d+(?:\.\d+)?)\s*(each|per\s+\w+|apiece)?\b/i);
  if (qtyAtPriceMatch) {
    const q = parseFloat(qtyAtPriceMatch[1]);
    const num = parseFloat(qtyAtPriceMatch[2]);
    const isEach = Boolean(qtyAtPriceMatch[3]) || /each|per\s+\w+|@|at\s+\d+\s+each/i.test(clean);
    const isAtSymbol = /@|at\s+\d+/i.test(qtyAtPriceMatch[0]);
    stockQty = q;
    if (isEach || isAtSymbol || q <= 1 || num < 500) {
      unitCost = num;
    } else {
      unitCost = Math.round(num / q);
    }
  }

  // 2. Explicit Stock Pattern (if not already extracted)
  if (stockQty == null) {
    const explicitStockMatch = clean.match(/(?:(?:i|we)?\s*(?:have|got)\s+)?(\d+(?:\.\d+)?)\s*(?:in\s+stock|stock|remaining|left|pcs|pieces|items|units|packs?|cartons?|bundles?|bottles?|bags?|crates?|boxes?|tins?|sachets?|pairs?|sets?)\b/i) ||
                               clean.match(/\b(?:have|got|remaining|left)\s+(\d+(?:\.\d+)?)\b/i);
    if (explicitStockMatch) {
      stockQty = parseFloat(explicitStockMatch[1]);
    }
  }

  // 3. Explicit Cost Pattern (if not already extracted)
  if (unitCost == null) {
    const explicitCostMatch = clean.match(/(?:cost|bought\s+(?:for|at)?|purchase|price)\s*(?:is|was|of|for)?\s*(?:₦|ngn)?\s*(\d+(?:\.\d+)?)\s*(?:each|per\s+\w+|apiece)?\b/i) ||
                              clean.match(/(\d+(?:\.\d+)?)\s*(?:each|per\s+\w+|apiece|naira)\b/i);
    if (explicitCostMatch) {
      unitCost = parseFloat(explicitCostMatch[1]);
    }
  }

  // 4. Pair of numbers separated by comma, slash, or space: e.g. '12, 6000' or '12 6000'
  if (stockQty == null || unitCost == null) {
    const pairMatch = clean.match(/\b(\d+)\s*(?:,|\/|\s)\s*(?:₦|ngn)?\s*(\d+)\b/i);
    if (pairMatch) {
      const n1 = parseInt(pairMatch[1], 10);
      const n2 = parseInt(pairMatch[2], 10);
      if (stockQty == null && unitCost == null) {
        if (n2 >= 500 && n1 < 500) {
          stockQty = n1;
          unitCost = n2;
        } else if (n1 >= 500 && n2 < 500) {
          stockQty = n2;
          unitCost = n1;
        } else {
          stockQty = n1;
          unitCost = n2;
        }
      }
    }
  }

  // 5. Fallback for single standalone number:
  if (stockQty == null && unitCost == null) {
    const singleMatch = clean.match(/\b(\d+)\b/);
    if (singleMatch) {
      const val = parseInt(singleMatch[1], 10);
      if (val >= 500 || /k\b|₦|ngn|naira/i.test(text)) {
        unitCost = val;
      } else {
        stockQty = val;
      }
    }
  }

  return { isSkip: false, isCancel: false, isService: false, stockQty, unitCost, unit, isDisplacedTransaction: false };
}

