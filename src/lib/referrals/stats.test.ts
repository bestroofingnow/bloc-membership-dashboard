import { describe, test, expect } from 'vitest';
import { summarize, leaderboard, type ReferralRow } from './stats';

const r = (
  from: string,
  to: string,
  stage = 'given',
  closed_value: number | null = null,
): ReferralRow => ({ from_member_id: from, to_member_id: to, stage: stage as never, closed_value });

describe('summarize()', () => {
  test('empty -> all zeros', () => {
    expect(summarize([], 'm1')).toEqual({ given: 0, received: 0, closed: 0, totalClosedValue: 0 });
  });

  test('counts referrals given vs received for the member', () => {
    const data = [r('m1', 'm2'), r('m1', 'm3'), r('m4', 'm1')];
    expect(summarize(data, 'm1')).toMatchObject({ given: 2, received: 1 });
  });

  test('closed counts both directions; closed $ credits only the giver', () => {
    const data = [r('m1', 'm2', 'closed', 500), r('m3', 'm1', 'closed', 800)];
    const s = summarize(data, 'm1');
    expect(s.closed).toBe(2);
    expect(s.totalClosedValue).toBe(500); // only the referral m1 gave
  });

  test('ignores null closed_value', () => {
    expect(summarize([r('m1', 'm2', 'closed', null)], 'm1').totalClosedValue).toBe(0);
  });
});

describe('leaderboard()', () => {
  test('ranks by closed value generated (as giver), then closed, then given', () => {
    const data = [r('m1', 'm2', 'closed', 1000), r('m2', 'm3', 'closed', 500), r('m3', 'm1', 'given')];
    const lb = leaderboard(data, ['m1', 'm2', 'm3']);
    expect(lb.map((x) => x.member_id)).toEqual(['m1', 'm2', 'm3']);
    expect(lb[0]).toMatchObject({ member_id: 'm1', totalClosedValue: 1000 });
  });

  test('empty members -> empty leaderboard', () => {
    expect(leaderboard([], [])).toEqual([]);
  });
});
