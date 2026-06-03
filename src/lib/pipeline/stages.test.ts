import { describe, test, expect } from 'vitest';
import { visibleKanbanStages } from './stages';

type Stage = { status: string };

describe('visibleKanbanStages()', () => {
  const all: Stage[] = [
    { status: 'New Lead' },
    { status: 'After Hours Invited' },
    { status: 'After Hours Done' },
    { status: 'Lunch Invited' },
    { status: 'Lunch Done' },
    { status: 'Application Sent' },
    { status: 'Application Received' },
    { status: 'Approved' },
  ];

  test('returns every stage (never drops Application Received / Approved)', () => {
    const out = visibleKanbanStages(all);
    expect(out).toHaveLength(8);
    expect(out.map((s) => s.status)).toContain('Application Received');
    expect(out.map((s) => s.status)).toContain('Approved');
  });

  test('preserves order and identity', () => {
    expect(visibleKanbanStages(all)).toEqual(all);
  });
});
