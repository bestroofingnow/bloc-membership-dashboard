import type { ReferralStage } from './stage';

export interface ReferralRow {
  from_member_id: string;
  to_member_id: string;
  stage: ReferralStage;
  closed_value: number | null;
}

export interface ReferralSummary {
  given: number;
  received: number;
  closed: number; // referrals involving the member that reached 'closed'
  totalClosedValue: number; // closed $ on referrals the member GAVE (TYFCB generated)
}

/** Per-member referral tallies, computed from rows that involve the member. */
export function summarize(referrals: ReferralRow[], memberId: string): ReferralSummary {
  let given = 0;
  let received = 0;
  let closed = 0;
  let totalClosedValue = 0;
  for (const r of referrals) {
    const isGiver = r.from_member_id === memberId;
    const isRecipient = r.to_member_id === memberId;
    if (isGiver) given += 1;
    if (isRecipient) received += 1;
    if ((isGiver || isRecipient) && r.stage === 'closed') {
      closed += 1;
      // Credit the dollar value to the member who GAVE the referral.
      if (isGiver && typeof r.closed_value === 'number') totalClosedValue += r.closed_value;
    }
  }
  return { given, received, closed, totalClosedValue };
}

export interface LeaderRow {
  member_id: string;
  given: number;
  closed: number;
  totalClosedValue: number;
}

/** Members ranked by closed business they generated (as giver), then closed, then given. */
export function leaderboard(referrals: ReferralRow[], memberIds: string[]): LeaderRow[] {
  return memberIds
    .map((id) => {
      const s = summarize(referrals, id);
      return { member_id: id, given: s.given, closed: s.closed, totalClosedValue: s.totalClosedValue };
    })
    .sort(
      (a, b) =>
        b.totalClosedValue - a.totalClosedValue || b.closed - a.closed || b.given - a.given,
    );
}
