import { Guest, GuestStatus } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHETIC PLACEHOLDER DATA — NOT REAL PEOPLE.
// Ships in the public browser bundle, so it must never contain real guest PII.
// Live guest/lead data comes from Supabase; this seed is only for demo mode.
// All names/emails/phones below are invented (example.com + 555-01xx).
// ─────────────────────────────────────────────────────────────────────────────

const generateId = () => Math.random().toString(36).substring(2, 11);
const now = new Date().toISOString();

export const initialGuests: Guest[] = [
  {
    id: generateId(),
    name: 'Sam Rivera',
    company: 'Rivera Logistics (Demo)',
    industry: 'Supply Chain',
    invitedBy: 'Jordan Banks',
    status: 'After Hours Done',
    nextStep: 'Invite to Chapter Lunch',
    email: 'sam@example.com',
    phone: '704-555-0201',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: generateId(),
    name: 'Alex Monroe',
    company: 'Monroe Law (Demo)',
    industry: 'Business Law',
    invitedBy: 'Morgan Pratt',
    status: 'Lunch Done',
    nextStep: 'Send Application Link',
    email: 'alex@example.com',
    phone: '704-555-0202',
    notes: 'Demo placeholder guest — strong interest.',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: generateId(),
    name: 'Jesse Park',
    company: 'Park Tech (Demo)',
    industry: 'IT Services',
    invitedBy: 'Avery Marsh',
    status: 'New Lead',
    nextStep: 'Invite to After Hours',
    email: 'jesse@example.com',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: generateId(),
    name: 'Drew Carter',
    company: 'Carter HR (Demo)',
    industry: 'HR Services',
    invitedBy: 'Taylor Reese',
    status: 'After Hours Invited',
    nextStep: 'Confirm RSVP',
    email: 'drew@example.com',
    phone: '704-555-0204',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: generateId(),
    name: 'Robin Shaw',
    company: 'Shaw Financial (Demo)',
    industry: 'Wealth Management',
    invitedBy: 'Jamie Wells',
    status: 'Application Sent',
    nextStep: 'Follow up on application',
    email: 'robin@example.com',
    phone: '704-555-0205',
    notes: 'Demo placeholder guest — met at After Hours.',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: generateId(),
    name: 'Pat Lindgren',
    company: 'Lindgren Dental (Demo)',
    industry: 'Dentistry',
    invitedBy: 'Devon Fields',
    status: 'Lunch Invited',
    nextStep: 'Confirm lunch with FLOC',
    email: 'pat@example.com',
    createdAt: now,
    updatedAt: now,
  },
];

// Pipeline stages in order
export const pipelineStages: { status: GuestStatus; label: string; color: string }[] = [
  { status: 'New Lead', label: 'New Lead', color: 'bg-slate-100' },
  { status: 'After Hours Invited', label: 'AH Invited', color: 'bg-yellow-50' },
  { status: 'After Hours Done', label: 'AH Attended', color: 'bg-blue-50' },
  { status: 'Lunch Invited', label: 'Lunch Invited', color: 'bg-indigo-50' },
  { status: 'Lunch Done', label: 'Lunch Attended', color: 'bg-purple-50' },
  { status: 'Application Sent', label: 'App Sent', color: 'bg-green-50' },
  { status: 'Application Received', label: 'App Received', color: 'bg-emerald-50' },
  { status: 'Membership Interview', label: 'Interview', color: 'bg-teal-50' },
  { status: 'Membership Vote', label: 'Membership Vote', color: 'bg-cyan-50' },
  { status: 'Board Vote', label: 'Board Vote', color: 'bg-sky-50' },
  { status: 'Approved', label: 'Approved', color: 'bg-emerald-100' },
];

// Get next step based on current status
export function getNextStatus(current: GuestStatus): GuestStatus | null {
  const index = pipelineStages.findIndex((s) => s.status === current);
  if (index === -1 || index === pipelineStages.length - 1) return null;
  return pipelineStages[index + 1].status;
}

export function getNextStepText(status: GuestStatus): string {
  switch (status) {
    case 'New Lead':
      return 'Invite to After Hours';
    case 'After Hours Invited':
      return 'Confirm RSVP';
    case 'After Hours Done':
      return 'Invite to Chapter Lunch';
    case 'Lunch Invited':
      return 'Confirm Lunch RSVP';
    case 'Lunch Done':
      return 'Send Application Link';
    case 'Application Sent':
      return 'Follow up on Application';
    case 'Application Received':
      return 'Schedule Membership Interview';
    case 'Membership Interview':
      return 'Membership Committee Vote';
    case 'Membership Vote':
      return 'Send to Board for Vote';
    case 'Board Vote':
      return 'Record Board Decision';
    case 'Approved':
      return 'Convert to Member';
    default:
      return 'Review Status';
  }
}
