export interface SuggestIndustry { id: string; name: string }
export interface SuggestCategory { id: string; category_id: string; title: string }

export interface SuggestResult {
  industry_id: string | null;
  industry_name: string | null;
  category_id: string | null;
  category_title: string | null;
}

/**
 * Normalize a string for loose matching: lowercase, strip non-alphanumeric,
 * collapse whitespace.
 */
export function normalizeForMatch(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Given a free-text legacy industry value and the taxonomy, pick the best
 * (industry, category) match — or return all-nulls if no plausible match.
 *
 * Resolution order:
 *   1. Exact normalized match on an industry name
 *   2. Exact normalized match on a category title (use its parent industry)
 *   3. Substring fuzzy match against any industry name
 */
export function suggestTaxonomy(
  legacy: string | null | undefined,
  industries: SuggestIndustry[],
  categories: SuggestCategory[],
): SuggestResult {
  const k = normalizeForMatch(legacy);
  const empty: SuggestResult = { industry_id: null, industry_name: null, category_id: null, category_title: null };
  if (!k) return empty;

  const indByNorm = new Map<string, SuggestIndustry>();
  for (const i of industries) indByNorm.set(normalizeForMatch(i.name), i);
  const indById = new Map<string, SuggestIndustry>();
  for (const i of industries) indById.set(i.id, i);

  // 1. Exact industry match
  const exactIndustry = indByNorm.get(k);
  if (exactIndustry) {
    return {
      industry_id: exactIndustry.id,
      industry_name: exactIndustry.name,
      category_id: null,
      category_title: null,
    };
  }

  // 2. Exact category title match → use its parent industry
  const exactCategory = categories.find((c) => normalizeForMatch(c.title) === k);
  if (exactCategory) {
    const parent = indById.get(exactCategory.category_id) ?? null;
    return {
      industry_id: parent?.id ?? null,
      industry_name: parent?.name ?? null,
      category_id: exactCategory.id,
      category_title: exactCategory.title,
    };
  }

  // 3. Substring fuzzy industry match
  const fuzzy = industries.find((i) => {
    const n = normalizeForMatch(i.name);
    return n.length > 0 && (n.includes(k) || k.includes(n));
  });
  if (fuzzy) {
    return {
      industry_id: fuzzy.id,
      industry_name: fuzzy.name,
      category_id: null,
      category_title: null,
    };
  }

  return empty;
}
