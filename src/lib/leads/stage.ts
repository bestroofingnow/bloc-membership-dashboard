// Canonical lead ladder shared by the DB (022_lead_funnel.sql) and the API routes.
// Keep stageRank() and mapKanbanStage() byte-aligned with the SQL functions of the
// same name — this file is the source of truth they are transcribed from.

export type LeadStage =
  | 'new'
  | 'rsvp'
  | 'attended'
  | 'applied'
  | 'approved'
  | 'member'
  | 'declined';

// Forward ladder order; 'declined' is terminal and listed last.
export const LEAD_STAGES: LeadStage[] = [
  'new', 'rsvp', 'attended', 'applied', 'approved', 'member', 'declined',
];

const RANK: Record<LeadStage, number> = {
  new: 0,
  rsvp: 1,
  attended: 2,
  applied: 3,
  approved: 4,
  member: 5,
  declined: 9,
};

/** Numeric rank for forward-only comparisons. Unknown => -1 (never wins forward). */
export function stageRank(stage: LeadStage): number {
  return Object.prototype.hasOwnProperty.call(RANK, stage) ? RANK[stage] : -1;
}

/** Project the 8 legacy guests.status values onto the canonical ladder. */
export function mapKanbanStage(status: string): LeadStage {
  switch (status) {
    case 'New Lead':
      return 'new';
    case 'After Hours Invited':
      return 'rsvp';
    case 'After Hours Done':
    case 'Lunch Invited':
    case 'Lunch Done':
      return 'attended';
    case 'Application Sent':
    case 'Application Received':
    case 'Membership Interview':
    case 'Membership Vote':
    case 'Board Vote':
      return 'applied';
    case 'Approved':
      return 'approved';
    case 'Declined':
      return 'declined';
    default:
      return 'new';
  }
}

/** Project an intake_rsvps.status onto the canonical ladder. */
export function mapRsvpStatusToStage(status: string): LeadStage {
  switch (status) {
    case 'registered':
      return 'rsvp';
    case 'attended':
      return 'attended';
    case 'no_show':
      return 'rsvp';
    case 'canceled':
      return 'declined';
    default:
      return 'rsvp';
  }
}
