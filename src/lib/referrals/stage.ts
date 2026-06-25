// Referral ladder: a member GIVES a referral (a contact) to another member, who
// works it through to closed business (TYFCB) or marks it lost. Forward-only on the
// active ladder; 'lost' and 'closed' are terminal. Keep in sync with the DB CHECK
// in migration 032_referrals.sql.

export type ReferralStage = 'given' | 'contacted' | 'met' | 'closed' | 'lost';

// Active ladder in order, then the terminal 'lost'.
export const REFERRAL_STAGES: ReferralStage[] = ['given', 'contacted', 'met', 'closed', 'lost'];

const RANK: Record<ReferralStage, number> = {
  given: 0,
  contacted: 1,
  met: 2,
  closed: 3,
  lost: 9, // terminal, off the forward ladder
};

export const STAGE_LABEL: Record<ReferralStage, string> = {
  given: 'Given',
  contacted: 'Contacted',
  met: 'Met',
  closed: 'Closed',
  lost: 'Lost',
};

/** Numeric rank for forward-only comparisons. Unknown => -1 (never wins forward). */
export function stageRank(stage: ReferralStage): number {
  return Object.prototype.hasOwnProperty.call(RANK, stage) ? RANK[stage] : -1;
}

/** Closed/lost are terminal — a referral there can't move again. */
export function isTerminal(stage: ReferralStage): boolean {
  return stage === 'closed' || stage === 'lost';
}

/** Next stage on the active ladder, or null when terminal/unknown. */
export function nextStage(stage: ReferralStage): ReferralStage | null {
  switch (stage) {
    case 'given':
      return 'contacted';
    case 'contacted':
      return 'met';
    case 'met':
      return 'closed';
    default:
      return null;
  }
}

/**
 * Whether a referral may move from `from` to `to`: forward-only on the active
 * ladder (given→contacted→met→closed), with 'lost' allowed from any active stage.
 * No backward moves, no moving out of a terminal stage, unknown stages never advance.
 */
export function canAdvance(from: ReferralStage, to: ReferralStage): boolean {
  if (stageRank(from) < 0 || stageRank(to) < 0) return false;
  if (from === to || isTerminal(from)) return false;
  if (to === 'lost') return true;
  return stageRank(to) > stageRank(from);
}
