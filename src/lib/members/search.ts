import type { Member } from '@/types';

/**
 * Multi-word, multi-field member search. A member matches when EVERY word in the
 * query appears in at least one of their business fields (name, company, industry,
 * title, chapter, description). Empty query matches everyone. Case-insensitive.
 *
 * This is what makes "north bank" or "owner roofing" actually find the right
 * person, instead of requiring the whole phrase to live in a single field.
 */
export function memberMatchesQuery(member: Member, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = [
    member.name,
    member.company,
    member.industry,
    member.title,
    member.chapter,
    member.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return terms.every((t) => haystack.includes(t));
}
