// Attendance aggregates over a member's check-ins vs. the events they were eligible
// for. Pure; the DB exposes raw check-ins and the client feeds eligible-event ids in.

/** Percent of eligible events the member attended (0–100, rounded). */
export function attendanceRate(attendedEventIds: string[], eligibleEventIds: string[]): number {
  if (eligibleEventIds.length === 0) return 0;
  const attended = new Set(attendedEventIds);
  const n = eligibleEventIds.filter((id) => attended.has(id)).length;
  return Math.round((n / eligibleEventIds.length) * 100);
}

/**
 * Current attendance streak: consecutive most-recent eligible events attended.
 * `eligibleEventIdsRecentFirst` must be ordered newest → oldest.
 */
export function currentStreak(
  attendedEventIds: string[],
  eligibleEventIdsRecentFirst: string[],
): number {
  const attended = new Set(attendedEventIds);
  let streak = 0;
  for (const id of eligibleEventIdsRecentFirst) {
    if (!attended.has(id)) break;
    streak += 1;
  }
  return streak;
}
