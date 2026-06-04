import type { ChapterName } from '@/types';

export type MemberStatus = 'active' | 'alumni' | 'inactive';
export type MemberType = 'full' | 'after_hours';

const VALID_STATUSES: readonly MemberStatus[] = ['active', 'alumni', 'inactive'];

export function isValidMemberStatus(s: string): s is MemberStatus {
  return (VALID_STATUSES as readonly string[]).includes(s);
}

export interface MemberStateBefore {
  chapter: ChapterName | null;
  memberType: MemberType;
  status: MemberStatus;
}

export interface MemberStatePatch {
  chapter?: ChapterName | null;
  memberType?: MemberType;
  status?: MemberStatus;
}

export interface MemberHistoryChange {
  change_kind: 'chapter_change' | 'type_change' | 'status_change';
  from_chapter: ChapterName | null;
  to_chapter: ChapterName | null;
  from_type: MemberType | null;
  to_type: MemberType | null;
  from_status: MemberStatus | null;
  to_status: MemberStatus | null;
}

/**
 * Convert-in-place: given the current member state and a patch, return the
 * single member_history row to append, or null if nothing changed.
 * Precedence: status change > type change > chapter change (one row per call).
 */
export function nextStatusChange(
  before: MemberStateBefore,
  patch: MemberStatePatch,
): MemberHistoryChange | null {
  if (patch.status !== undefined && !isValidMemberStatus(patch.status)) {
    throw new Error(`invalid member_status: ${String(patch.status)}`);
  }

  const statusChanged = patch.status !== undefined && patch.status !== before.status;
  const typeChanged = patch.memberType !== undefined && patch.memberType !== before.memberType;
  const chapterChanged = patch.chapter !== undefined && patch.chapter !== before.chapter;

  if (statusChanged) {
    return {
      change_kind: 'status_change',
      from_chapter: null, to_chapter: null,
      from_type: null, to_type: null,
      from_status: before.status, to_status: patch.status!,
    };
  }
  if (typeChanged) {
    return {
      change_kind: 'type_change',
      from_chapter: before.chapter,
      to_chapter: patch.chapter !== undefined ? patch.chapter : before.chapter,
      from_type: before.memberType, to_type: patch.memberType!,
      from_status: null, to_status: null,
    };
  }
  if (chapterChanged) {
    return {
      change_kind: 'chapter_change',
      from_chapter: before.chapter, to_chapter: patch.chapter!,
      from_type: null, to_type: null,
      from_status: null, to_status: null,
    };
  }
  return null;
}
