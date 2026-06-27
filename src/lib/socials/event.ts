export const SOCIAL_KINDS = ['happy_hour', 'meal', 'activity', 'virtual', 'other'] as const;
export type SocialKind = (typeof SOCIAL_KINDS)[number];

export const SOCIAL_KIND_LABEL: Record<SocialKind, string> = {
  happy_hour: 'Happy Hour',
  meal: 'Meal',
  activity: 'Activity',
  virtual: 'Virtual',
  other: 'Social',
};

export const RSVP_RESPONSES = ['going', 'maybe', 'declined'] as const;
export type RsvpResponse = (typeof RSVP_RESPONSES)[number];

export interface SocialEvent {
  id: string;
  host_member_id: string;
  kind: SocialKind;
  title: string;
  description: string | null;
  starts_at: string; // ISO timestamp
  location: string | null;
  chapter: string | null;
  status: 'open' | 'cancelled';
  created_at: string;
}

export interface Rsvp {
  id: string;
  event_id: string;
  member_id: string;
  response: RsvpResponse;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface SocialEventInput {
  hostId: string | null;
  kind: string;
  title: string;
  startsAt: string | null;
  location?: string | null;
}

/** Validate a hosted social event. Pure → unit-tested + shared (web/mobile). */
export function validateSocialEvent(input: SocialEventInput): ValidationResult {
  if (!input.hostId) return { ok: false, error: 'Missing host.' };
  if (!SOCIAL_KINDS.includes(input.kind as SocialKind)) return { ok: false, error: 'Pick an event type.' };
  const title = (input.title ?? '').trim();
  if (title.length < 1) return { ok: false, error: 'Add a title.' };
  if (title.length > 120) return { ok: false, error: 'Title must be under 120 characters.' };
  if (!input.startsAt || Number.isNaN(Date.parse(input.startsAt))) {
    return { ok: false, error: 'Pick a date and time.' };
  }
  if ((input.location ?? '').length > 300) return { ok: false, error: 'Location is too long.' };
  return { ok: true };
}

/** Count RSVPs for one event by response. */
export function countRsvps(rsvps: Rsvp[], eventId: string): { going: number; maybe: number } {
  let going = 0;
  let maybe = 0;
  for (const r of rsvps) {
    if (r.event_id !== eventId) continue;
    if (r.response === 'going') going++;
    else if (r.response === 'maybe') maybe++;
  }
  return { going, maybe };
}

/** This member's response to an event, or null if they haven't responded. */
export function myRsvp(rsvps: Rsvp[], eventId: string, myId: string): RsvpResponse | null {
  const r = rsvps.find((x) => x.event_id === eventId && x.member_id === myId);
  return r ? r.response : null;
}

export interface SplitEvents<T> {
  upcoming: T[];
  past: T[];
}

/** Drop cancelled, split by time; upcoming soonest-first, past most-recent-first. */
export function splitEvents<T extends SocialEvent>(events: T[], now: Date = new Date()): SplitEvents<T> {
  const t = now.getTime();
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const e of events) {
    if (e.status === 'cancelled') continue;
    if (Date.parse(e.starts_at) >= t) upcoming.push(e);
    else past.push(e);
  }
  upcoming.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  past.sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  return { upcoming, past };
}
