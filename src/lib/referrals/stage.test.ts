import { describe, test, expect } from 'vitest';
import {
  REFERRAL_STAGES,
  stageRank,
  isTerminal,
  nextStage,
  canAdvance,
  STAGE_LABEL,
} from './stage';

describe('REFERRAL_STAGES + stageRank()', () => {
  test('active ladder order is given<contacted<met<closed', () => {
    expect(REFERRAL_STAGES).toEqual(['given', 'contacted', 'met', 'closed', 'lost']);
    expect(stageRank('given')).toBe(0);
    expect(stageRank('contacted')).toBe(1);
    expect(stageRank('met')).toBe(2);
    expect(stageRank('closed')).toBe(3);
  });

  test('lost is terminal/off-ladder (rank 9)', () => {
    expect(stageRank('lost')).toBe(9);
  });

  test('unknown stage ranks -1 so it never wins a forward compare', () => {
    expect(stageRank('bogus' as never)).toBe(-1);
  });

  test('every stage has a human label', () => {
    for (const s of REFERRAL_STAGES) expect(STAGE_LABEL[s]).toBeTruthy();
  });
});

describe('isTerminal()', () => {
  test('closed and lost are terminal; active stages are not', () => {
    expect(isTerminal('closed')).toBe(true);
    expect(isTerminal('lost')).toBe(true);
    expect(isTerminal('given')).toBe(false);
    expect(isTerminal('contacted')).toBe(false);
    expect(isTerminal('met')).toBe(false);
  });
});

describe('nextStage()', () => {
  test('advances along the active ladder', () => {
    expect(nextStage('given')).toBe('contacted');
    expect(nextStage('contacted')).toBe('met');
    expect(nextStage('met')).toBe('closed');
  });
  test('terminal stages have no next', () => {
    expect(nextStage('closed')).toBeNull();
    expect(nextStage('lost')).toBeNull();
  });
});

describe('canAdvance()', () => {
  test('forward moves on the active ladder are allowed (incl. skipping ahead)', () => {
    expect(canAdvance('given', 'contacted')).toBe(true);
    expect(canAdvance('contacted', 'met')).toBe(true);
    expect(canAdvance('met', 'closed')).toBe(true);
    expect(canAdvance('given', 'closed')).toBe(true);
  });
  test('backward / same-stage moves are rejected', () => {
    expect(canAdvance('met', 'given')).toBe(false);
    expect(canAdvance('contacted', 'contacted')).toBe(false);
  });
  test('any active stage can be marked lost', () => {
    expect(canAdvance('given', 'lost')).toBe(true);
    expect(canAdvance('met', 'lost')).toBe(true);
  });
  test('cannot move out of a terminal stage', () => {
    expect(canAdvance('closed', 'met')).toBe(false);
    expect(canAdvance('lost', 'given')).toBe(false);
  });
  test('unknown stages never advance', () => {
    expect(canAdvance('bogus' as never, 'met')).toBe(false);
    expect(canAdvance('given', 'bogus' as never)).toBe(false);
  });
});
