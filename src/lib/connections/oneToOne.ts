// One-to-one ("1-2-1") meeting coverage: which chapter peers a member has met, and
// who's left. A 1-2-1 may be logged by either party, so meetings count in both
// directions. Pure functions — UI lives in the Expo app.

export interface OneToOneRow {
  member_id: string; // who logged it
  with_member_id: string; // the other person
}

export interface RosterMember {
  id: string;
  chapter: string | null;
}

/** Distinct member ids the caller has met (meetings logged in either direction). */
export function metMemberIds(oneToOnes: OneToOneRow[], myId: string): string[] {
  const met = new Set<string>();
  for (const o of oneToOnes) {
    if (o.member_id === myId && o.with_member_id !== myId) met.add(o.with_member_id);
    else if (o.with_member_id === myId && o.member_id !== myId) met.add(o.member_id);
  }
  return [...met];
}

/** Same-chapter peers the caller has NOT yet met (excludes self). */
export function membersNotYetMet(
  roster: RosterMember[],
  oneToOnes: OneToOneRow[],
  myId: string,
): RosterMember[] {
  const myChapter = roster.find((m) => m.id === myId)?.chapter ?? null;
  const met = new Set(metMemberIds(oneToOnes, myId));
  return roster.filter((m) => m.id !== myId && m.chapter === myChapter && !met.has(m.id));
}

/** Percent of same-chapter peers the caller has met (0–100, rounded). */
export function coveragePct(
  roster: RosterMember[],
  oneToOnes: OneToOneRow[],
  myId: string,
): number {
  const myChapter = roster.find((m) => m.id === myId)?.chapter ?? null;
  const peers = roster.filter((m) => m.id !== myId && m.chapter === myChapter);
  if (peers.length === 0) return 0;
  const met = new Set(metMemberIds(oneToOnes, myId));
  const metPeers = peers.filter((m) => met.has(m.id)).length;
  return Math.round((metPeers / peers.length) * 100);
}
