import { describe, test, expect } from 'vitest';
import {
  LEAD_STAGES,
  stageRank,
  mapKanbanStage,
  mapRsvpStatusToStage,
} from './stage';

describe('LEAD_STAGES + stageRank()', () => {
  test('canonical ladder order is new<rsvp<attended<applied<approved<member', () => {
    expect(LEAD_STAGES).toEqual([
      'new', 'rsvp', 'attended', 'applied', 'approved', 'member', 'declined',
    ]);
    expect(stageRank('new')).toBe(0);
    expect(stageRank('rsvp')).toBe(1);
    expect(stageRank('attended')).toBe(2);
    expect(stageRank('applied')).toBe(3);
    expect(stageRank('approved')).toBe(4);
    expect(stageRank('member')).toBe(5);
  });

  test('declined ranks 9 (terminal, off the forward ladder)', () => {
    expect(stageRank('declined')).toBe(9);
  });

  test('unknown stage ranks -1 so it never wins a forward-only compare', () => {
    expect(stageRank('bogus' as never)).toBe(-1);
  });
});

describe('mapKanbanStage() — 8 legacy guests.status values onto the ladder', () => {
  test('each legacy status maps to the spec-defined canonical stage', () => {
    expect(mapKanbanStage('New Lead')).toBe('new');
    expect(mapKanbanStage('After Hours Invited')).toBe('rsvp');
    expect(mapKanbanStage('After Hours Done')).toBe('attended');
    expect(mapKanbanStage('Lunch Invited')).toBe('attended');
    expect(mapKanbanStage('Lunch Done')).toBe('attended');
    expect(mapKanbanStage('Application Sent')).toBe('applied');
    expect(mapKanbanStage('Application Received')).toBe('applied');
    expect(mapKanbanStage('Approved')).toBe('approved');
    expect(mapKanbanStage('Declined')).toBe('declined');
  });

  test('unrecognized status falls back to new (never throws)', () => {
    expect(mapKanbanStage('whatever' as never)).toBe('new');
  });
});

describe('mapRsvpStatusToStage() — intake_rsvps.status onto the ladder', () => {
  test('registered=>rsvp, attended=>attended, no_show=>rsvp, canceled=>declined', () => {
    expect(mapRsvpStatusToStage('registered')).toBe('rsvp');
    expect(mapRsvpStatusToStage('attended')).toBe('attended');
    expect(mapRsvpStatusToStage('no_show')).toBe('rsvp');
    expect(mapRsvpStatusToStage('canceled')).toBe('declined');
  });

  test('unknown status falls back to rsvp (a QR RSVP at minimum RSVP-ed)', () => {
    expect(mapRsvpStatusToStage('bogus' as never)).toBe('rsvp');
  });
});
