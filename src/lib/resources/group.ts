// Group resources by category for display. Null/empty category falls into "Other".
// Categories sorted alphabetically; items within a category sorted by title.

export interface ResourceLike {
  category: string | null;
  title: string;
}

export interface ResourceGroup<T extends ResourceLike> {
  category: string;
  items: T[];
}

export function groupByCategory<T extends ResourceLike>(resources: T[]): ResourceGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const r of resources) {
    const c = (r.category || 'Other').trim() || 'Other';
    const bucket = map.get(c);
    if (bucket) bucket.push(r);
    else map.set(c, [r]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, items]) => ({
      category,
      items: [...items].sort((x, y) => x.title.localeCompare(y.title)),
    }));
}
