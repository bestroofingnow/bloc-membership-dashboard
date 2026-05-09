import type { ConflictInput, ConflictResult, MemberForConflict } from './types';

/**
 * Classify a guest's category pick against the chapter's existing members.
 *
 * Pure function. Caller fetches members and passes them in.
 *
 * Rules:
 * - category_id null  → 'other' (no live conflict logic; review queue handles it)
 * - any member with same category_id → 'exact'
 * - else any member with same industry_id → 'related'
 * - else → 'none'
 */
export function conflict(input: ConflictInput): ConflictResult {
  const { industry_id, category_id, members_in_chapter } = input;

  if (category_id === null) {
    return { kind: 'other', occupants: [] };
  }

  const exact = members_in_chapter.filter(
    (m: MemberForConflict) => m.category_id === category_id,
  );
  if (exact.length > 0) {
    return { kind: 'exact', occupants: exact };
  }

  if (industry_id !== null) {
    const related = members_in_chapter.filter(
      (m: MemberForConflict) => m.industry_id === industry_id,
    );
    if (related.length > 0) {
      return { kind: 'related', occupants: related };
    }
  }

  return { kind: 'none', occupants: [] };
}
