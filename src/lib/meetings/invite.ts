export const MEETING_KINDS = ['coffee', 'lunch', 'virtual'] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

export const MEETING_KIND_LABEL: Record<MeetingKind, string> = {
  coffee: 'Coffee',
  lunch: 'Lunch',
  virtual: 'Virtual',
};

export type MeetingStatus = 'proposed' | 'completed' | 'cancelled';
export type ParticipantStatus = 'pending' | 'accepted' | 'declined';

export interface Participant {
  member_id: string;
  response_status: ParticipantStatus;
}

export interface Meeting {
  id: string;
  organizer_member_id: string;
  kind: MeetingKind;
  status: MeetingStatus;
  proposed_at: string | null; // ISO timestamp; set when scheduled ahead
  met_on: string | null; // date; set when logged as already-happened
  location: string | null;
  note: string | null;
  participants: Participant[];
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface MeetingInput {
  organizerId: string;
  participantIds: string[]; // everyone EXCEPT the organizer
  kind: string;
  proposedAt?: string | null;
  metOn?: string | null;
  location?: string | null;
}

/**
 * Validate a new meeting (proposed ahead of time, or logged after the fact).
 * organizer + 1+ distinct non-organizer participants required, kind in the
 * set, location capped, and either proposedAt (schedule) or metOn (log) must
 * be present. Pure → unit-tested + shared (web/mobile).
 */
export function validateMeeting(input: MeetingInput): ValidationResult {
  if (!input.organizerId) return { ok: false, error: 'Missing organizer.' };
  if (!input.participantIds || input.participantIds.length === 0) {
    return { ok: false, error: 'Pick at least one other person.' };
  }
  if (input.participantIds.includes(input.organizerId)) {
    return { ok: false, error: "The organizer can't also be a participant." };
  }
  if (new Set(input.participantIds).size !== input.participantIds.length) {
    return { ok: false, error: 'That person is already in this meeting.' };
  }
  if (!MEETING_KINDS.includes(input.kind as MeetingKind)) {
    return { ok: false, error: 'Pick a meeting type.' };
  }
  const proposedAt = input.proposedAt ?? null;
  const metOn = input.metOn ?? null;
  if (!proposedAt && !metOn) return { ok: false, error: 'Pick a date and time.' };
  if (proposedAt && Number.isNaN(Date.parse(proposedAt))) {
    return { ok: false, error: 'Pick a date and time.' };
  }
  if ((input.location ?? '').length > 300) return { ok: false, error: 'Location is too long.' };
  return { ok: true };
}

/** The caller's own response status, or null if they're not a participant. */
export function myParticipantStatus(meeting: Meeting, myId: string): ParticipantStatus | null {
  return meeting.participants.find((p) => p.member_id === myId)?.response_status ?? null;
}

/** Only the organizer may cancel a meeting. */
export function canCancel(meeting: Pick<Meeting, 'organizer_member_id'>, myId: string): boolean {
  return meeting.organizer_member_id === myId;
}

/** Everyone else has responded (declines don't block "confirmed" — they're just not attending). */
function allOthersResponded(meeting: Meeting, myId: string): boolean {
  return meeting.participants
    .filter((p) => p.member_id !== myId)
    .every((p) => p.response_status !== 'pending');
}

export interface CategorizedMeetings<T> {
  needsMyResponse: T[]; // proposed, my status still pending
  awaitingOthers: T[]; // proposed, I've accepted, someone else hasn't responded
  upcoming: T[]; // proposed, everyone's responded, in the future
  past: T[]; // elapsed, or completed
}

/**
 * Bucket a member's meetings for the UI. Cancelled meetings and meetings the
 * caller isn't part of are dropped. Upcoming is sorted soonest-first; past
 * most-recent-first.
 */
export function categorizeMeetings<T extends Meeting>(
  meetings: T[],
  myId: string,
  now: Date = new Date(),
): CategorizedMeetings<T> {
  const t = now.getTime();
  const out: CategorizedMeetings<T> = { needsMyResponse: [], awaitingOthers: [], upcoming: [], past: [] };
  for (const m of meetings) {
    if (m.status === 'cancelled') continue;
    const mine = myParticipantStatus(m, myId);
    if (mine === null || mine === 'declined') continue;
    if (m.status === 'completed') {
      out.past.push(m);
      continue;
    }
    // status === 'proposed'
    if (mine === 'pending') {
      out.needsMyResponse.push(m);
    } else if (!allOthersResponded(m, myId)) {
      out.awaitingOthers.push(m);
    } else if (m.proposed_at && Date.parse(m.proposed_at) >= t) {
      out.upcoming.push(m);
    } else {
      out.past.push(m);
    }
  }
  const at = (m: T) => Date.parse(m.proposed_at ?? m.met_on ?? '');
  out.upcoming.sort((a, b) => at(a) - at(b));
  out.past.sort((a, b) => at(b) - at(a));
  return out;
}
