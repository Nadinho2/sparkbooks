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
