import type { Member, ChapterName } from '@/types';

const CHAPTERS: ChapterName[] = ['North', 'South', 'Uptown', 'FLOC', 'Alumni'];

/** A member is "after hours" only when explicitly tagged; undefined => full. */
export function isAfterHours(member: Member): boolean {
  return member.memberType === 'after_hours';
}

export interface MemberSummary {
  chapterCounts: Record<ChapterName, number>;
  fullMemberCount: number;
  afterHoursCount: number;
}

/** Pure roster summary. Only full members count toward chapters and the total. */
export function summarizeMembers(members: Member[]): MemberSummary {
  const chapterCounts: Record<ChapterName, number> = {
    North: 0, South: 0, Uptown: 0, FLOC: 0, Alumni: 0,
  };
  let fullMemberCount = 0;
  let afterHoursCount = 0;

  for (const member of members) {
    if (isAfterHours(member)) {
      afterHoursCount += 1;
      continue;
    }
    fullMemberCount += 1;
    if (member.chapter && CHAPTERS.includes(member.chapter)) {
      chapterCounts[member.chapter] += 1;
    }
  }

  return { chapterCounts, fullMemberCount, afterHoursCount };
}
