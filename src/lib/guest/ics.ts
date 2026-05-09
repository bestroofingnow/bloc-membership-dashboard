export interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  starts_at: Date;
  ends_at: Date;
}

function fmt(d: Date): string {
  // YYYYMMDDTHHMMSSZ in UTC
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

export function buildIcs(event: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BLOC Membership//Guest Intake//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(event.starts_at)}`,
    `DTEND:${fmt(event.ends_at)}`,
    `SUMMARY:${escape(event.title)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escape(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escape(event.location)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
