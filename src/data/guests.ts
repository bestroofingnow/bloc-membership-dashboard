import { Guest, GuestStatus } from '@/types';

const generateId = () => Math.random().toString(36).substring(2, 11);
const now = new Date().toISOString();

export const initialGuests: Guest[] = [
  {
    id: generateId(),
    name: 'Sarah Miller',
    company: 'Miller Logistics',
    industry: 'Supply Chain',
    invitedBy: 'Douglas Howard',
    status: 'After Hours Done',
    nextStep: 'Invite to Chapter Lunch',
    email: 'sarah@millerlogistics.com',
    phone: '704-555-0101',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: generateId(),
    name: 'Tom Wilson',
    company: 'Wilson Law',
    industry: 'Business Law',
    invitedBy: 'Julie Stevens',
    status: 'Lunch Done',
    nextStep: 'Send Application Link',
    email: 'tom@wilsonlaw.com',
    phone: '704-555-0102',
    notes: 'Very interested, met with Joe Keener',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: generateId(),
    name: 'Mike Ross',
    company: 'Ross Tech Solutions',
    industry: 'IT Services',
    invitedBy: 'Brett Metcalf',
    status: 'New Lead',
    nextStep: 'Invite to After Hours',
    email: 'mike@rosstech.com',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: generateId(),
    name: 'Jennifer Adams',
    company: 'Adams HR Consulting',
    industry: 'HR Services',
    invitedBy: 'Faith Penney',
    status: 'After Hours Invited',
    nextStep: 'Confirm RSVP for Jan 29',
    email: 'jennifer@adamshr.com',
    phone: '704-555-0104',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: generateId(),
    name: 'Robert Chen',
    company: 'Chen Financial Group',
    industry: 'Wealth Management',
    invitedBy: 'Jon Massachi',
    status: 'Application Sent',
    nextStep: 'Follow up on application',
    email: 'robert@chenfinancial.com',
    phone: '704-555-0105',
    notes: 'Connected via Truist event',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: generateId(),
    name: 'Lisa Park',
    company: 'Park Dental Arts',
    industry: 'Dentistry',
    invitedBy: 'Liana Matheney',
    status: 'Lunch Invited',
    nextStep: 'Confirm lunch with FLOC',
    email: 'lisa@parkdental.com',
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
      return 'Schedule Board Review';
    case 'Approved':
      return 'Welcome New Member!';
    default:
      return 'Review Status';
  }
}
