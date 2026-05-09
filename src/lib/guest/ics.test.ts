import { describe, test, expect } from 'vitest';
import { buildIcs } from './ics';

describe('buildIcs()', () => {
  test('produces a valid ICS string with stable UID', () => {
    const ics = buildIcs({
      uid: 'event-uptown-after-hours-2026-04@bloc',
      title: 'BLOC Uptown After Hours',
      description: 'April After Hours at Slate Billiards',
      location: 'Slate Billiards, Charlotte NC',
      starts_at: new Date('2026-04-29T17:30:00-04:00'),
      ends_at: new Date('2026-04-29T19:30:00-04:00'),
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('UID:event-uptown-after-hours-2026-04@bloc');
    expect(ics).toContain('SUMMARY:BLOC Uptown After Hours');
    expect(ics).toContain('LOCATION:Slate Billiards\\, Charlotte NC');
  });

  test('handles missing description and location', () => {
    const ics = buildIcs({
      uid: 'event-x@bloc',
      title: 'X',
      starts_at: new Date('2026-05-01T12:00:00-04:00'),
      ends_at: new Date('2026-05-01T13:00:00-04:00'),
    });
    expect(ics).toContain('UID:event-x@bloc');
    expect(ics).not.toContain('LOCATION:');
    expect(ics).not.toContain('DESCRIPTION:');
  });
});
