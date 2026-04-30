import { Guest, GuestStatus } from '@/types';

const generateId = () => Math.random().toString(36).substring(2, 11);
const now = new Date().toISOString();

const aprilAfterHoursGuests: Guest[] = [
  { name: 'Amanda Hoffmann', company: '', email: 'ahoffmann@hcgadvisor.com' },
  { name: 'Juli West', company: 'Subcontain Commercial Waste Management', email: 'juli.west@subcontain.com', phone: '336 782 8454' },
  { name: 'Melinda Schmidt', company: '', email: 'melinda@melindarae.com' },
  { name: 'Sarah McKinney', company: '', email: 'Sarah.mckinney@in-elements.com' },
  { name: 'Ty Jaco', company: '', email: 'tjaco@ft.newyorklife.com' },
  { name: 'Steve Shober', company: 'Shober Employee Benefit Services LLC', email: 'steve.shober@cbrealty.com', phone: '7048776771' },
  { name: 'Glenn Bouley', company: 'Bouley Printing Company', email: 'gebouley@bouleyprinting.com', phone: '704-737-7573' },
  { name: 'Emmett Everest', company: 'Tom James Company', email: 'emmett.everest@gmail.com', phone: '9196193106' },
  { name: 'Max Trenz', company: '', email: 'maxtrenz19@gmail.com' },
  { name: 'Lauren Desmond', company: 'Merrill Lynch', email: 'lauren.desmond715@gmail.com', phone: '3146512027' },
  { name: 'Jack Fullagar', company: 'CarolinaPEO', email: 'jack@carolinapeo.com', phone: '7046498739' },
  { name: 'Chris Poole', company: 'First Bank', email: 'Chris.poole@localfirstbank.com', phone: '7046975056' },
  { name: 'Rich Rezny', company: 'Manness CPA' },
  { name: 'Markel Pollard', company: 'Liftology' },
  { name: 'Maxwell Doherty', company: 'SouthState Bank', email: 'maxwell.doherty@southstatebank.com', phone: '7042906852' },
  { name: 'Sharon Peterson', company: 'COOL-BINZ of Charlotte', email: 'sharon.peterson@cool-binz.com', phone: '704.895.COOL' },
  { name: 'Kayleigh Gildart', company: 'Experient', email: 'kgildart@experient.com', phone: '704 681 3345' },
  { name: 'Tristen Fairfax', company: '', email: 'tf021y@att.com' },
  { name: 'Sophie Levinson', company: 'USI Insurance Services', email: 'sophie.levinson@usi.com', phone: '7047708682' },
  { name: 'Judith Keck', company: 'Inside Out', email: 'judy.keck@aol.com', phone: '17045175840' },
  { name: 'Aubrey Turner', company: 'Nutritionist Aubrey', email: 'aubrey@whollywellnessllc.com', phone: '7049981905' },
  { name: 'Vlad Stepanov', company: '', email: 'vlad711994@gmail.com' },
  { name: 'BJ Sabol', company: 'Ameriprise Financial', email: 'bradford.j.sabol@ampf.com', phone: '9804402255' },
  { name: 'Tatiana Guzman', company: 'Rug Source INC', email: 'info@rugsource.com', phone: '9808197373' },
  { name: 'Avery Kirby', company: 'Mitchell Martin', email: 'avery.kirby@itmmi.com' },
  { name: 'Keegan Nimblett', company: 'Mitchell Martin Inc.', email: 'keegan.nimblett@itmmi.com', phone: '7042771084' },
  { name: 'Lara Persing', company: 'Contents Restoration', email: 'lara@contentsrestorationservices.com', phone: '980-704-5755' },
  { name: 'Emma Dozier', company: 'DeSensi Insurance Agency', email: 'emma.dozier.vaitv5@statefarm.com', phone: '7047634858' },
  { name: 'Leah Offutt', company: 'Maersk', email: 'leah.korgaard.offutt@maersk.com', phone: '7044302042' },
].map((guest): Guest => ({
  id: generateId(),
  name: guest.name,
  company: guest.company,
  invitedBy: 'April After Hours guest list',
  status: 'After Hours Done',
  nextStep: 'Invite to Chapter Lunch',
  email: guest.email,
  phone: guest.phone,
  notes: 'Imported from April After Hours guest list.',
  createdAt: now,
  updatedAt: now,
}));

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
  ...aprilAfterHoursGuests,
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
