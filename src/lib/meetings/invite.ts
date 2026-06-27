export const MEETING_KINDS = ['coffee', 'lunch', 'virtual'] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

export const MEETING_KIND_LABEL: Record<MeetingKind, string> = {
  coffee: 'Coffee',
  lunch: 'Lunch',
  virtual: 'Virtual',
};

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed';

export interface MeetingInvite {
  id: string;
  from_member_id: string;
  to_member_id: string;
  proposed_by_member_id: string;
  kind: MeetingKind;
  proposed_at: string; // ISO timestamp
  location: string | null;
  note: string | null;
  status: InviteStatus;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface InviteInput {
  fromId: string | null;
  toId: string | null;
  kind: string;
  proposedAt: string | null;
  location?: string | null;
}

/**
 * Validate a proposed 1-to-1 invite. from/to required and distinct, kind in the set,
 * a parseable date/time, location capped. Pure → unit-tested + shared (web/mobile).
 */
export function validateInvite(input: InviteInput): ValidationResult {
  if (!input.fromId) return { ok: false, error: 'Missing sender.' };
  if (!input.toId) return { ok: false, error: 'Pick who you want to meet.' };
  if (input.fromId === input.toId) return { ok: false, error: "You can't invite yourself." };
  if (!MEETING_KINDS.includes(input.kind as MeetingKind)) {
    return { ok: false, error: 'Pick a meeting type.' };
  }
  if (!input.proposedAt || Number.isNaN(Date.parse(input.proposedAt))) {
    return { ok: false, error: 'Pick a date and time.' };
  }
  if ((input.location ?? '').length > 300) return { ok: false, error: 'Location is too long.' };
  return { ok: true };
}

type InviteCore = Pick<
  MeetingInvite,
  'from_member_id' | 'to_member_id' | 'proposed_by_member_id' | 'status'
>;

/**
 * Who must respond to a *pending* invite: the participant who did NOT make the current
 * proposal. Returns null when the invite isn't pending (nothing to respond to).
 */
export function awaitingMemberId(invite: InviteCore): string | null {
  if (invite.status !== 'pending') return null;
  return invite.proposed_by_member_id === invite.from_member_id
    ? invite.to_member_id
    : invite.from_member_id;
}

/** Can this member accept/decline/reschedule right now? (They're the awaiting party.) */
export function canRespond(invite: InviteCore, memberId: string): boolean {
  return awaitingMemberId(invite) === memberId;
}

/** The other participant, relative to me. */
export function counterpartId(
  invite: Pick<MeetingInvite, 'from_member_id' | 'to_member_id'>,
  myId: string,
): string {
  return invite.from_member_id === myId ? invite.to_member_id : invite.from_member_id;
}

export interface CategorizedInvites<T> {
  needsMyResponse: T[]; // pending, awaiting me
  awaitingThem: T[]; // pending, awaiting the other party
  upcoming: T[]; // accepted, in the future
  past: T[]; // accepted but elapsed, or completed
}

/**
 * Bucket a member's invites for the UI. Declined/cancelled are dropped. Upcoming is
 * sorted soonest-first; past most-recent-first.
 */
export function categorizeInvites<T extends MeetingInvite>(
  invites: T[],
  myId: string,
  now: Date = new Date(),
): CategorizedInvites<T> {
  const t = now.getTime();
  const out: CategorizedInvites<T> = { needsMyResponse: [], awaitingThem: [], upcoming: [], past: [] };
  for (const inv of invites) {
    if (inv.status === 'declined' || inv.status === 'cancelled') continue;
    if (inv.status === 'pending') {
      if (awaitingMemberId(inv) === myId) out.needsMyResponse.push(inv);
      else out.awaitingThem.push(inv);
    } else if (inv.status === 'accepted') {
      if (Date.parse(inv.proposed_at) >= t) out.upcoming.push(inv);
      else out.past.push(inv);
    } else if (inv.status === 'completed') {
      out.past.push(inv);
    }
  }
  out.upcoming.sort((a, b) => Date.parse(a.proposed_at) - Date.parse(b.proposed_at));
  out.past.sort((a, b) => Date.parse(b.proposed_at) - Date.parse(a.proposed_at));
  return out;
}
