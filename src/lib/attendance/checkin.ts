// Whether self check-in is open for an event: from 60 minutes before start until
// the event ends. Pure + timezone-agnostic (works off the stored timestamps).

export interface EventTimes {
  starts_at: string;
  ends_at: string;
}

const CHECK_IN_LEAD_MS = 60 * 60 * 1000; // opens 60 min before start

export function isCheckInOpen(event: EventTimes, now: Date): boolean {
  const start = new Date(event.starts_at).getTime();
  const end = new Date(event.ends_at).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  const t = now.getTime();
  return t >= start - CHECK_IN_LEAD_MS && t <= end;
}
