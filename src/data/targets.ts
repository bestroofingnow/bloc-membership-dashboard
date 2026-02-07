import { IndustryCategory } from '@/types';

const generateId = () => Math.random().toString(36).substring(2, 11);

export const industryTargets: IndustryCategory[] = [
  {
    name: 'Trades & Services',
    targets: [
      { id: generateId(), title: 'Electrician', priority: 'high' },
      { id: generateId(), title: 'Plumber', priority: 'high' },
      { id: generateId(), title: 'HVAC Commercial', priority: 'high' },
      { id: generateId(), title: 'General Contractor', priority: 'medium' },
      { id: generateId(), title: 'Landscaper', priority: 'medium' },
      { id: generateId(), title: 'Interior Designer', priority: 'low' },
      { id: generateId(), title: 'Architect', priority: 'medium' },
      { id: generateId(), title: 'Flooring Specialist', priority: 'low' },
      { id: generateId(), title: 'Signage / Printing', priority: 'low' },
      { id: generateId(), title: 'Window Cleaning', priority: 'low' },
      { id: generateId(), title: 'Pool Services', priority: 'medium' },
    ],
  },
  {
    name: 'Professional Services',
    targets: [
      { id: generateId(), title: 'Family Law Attorney', priority: 'high' },
      { id: generateId(), title: 'Business Attorney', priority: 'high' },
      { id: generateId(), title: 'CPA / Tax Accountant', priority: 'high' },
      { id: generateId(), title: 'Bookkeeper', priority: 'medium' },
      { id: generateId(), title: 'Business Coach', priority: 'medium' },
      { id: generateId(), title: 'HR Consultant', priority: 'medium' },
      { id: generateId(), title: 'Recruiter / Staffing', priority: 'high' },
      { id: generateId(), title: 'Notary Services', priority: 'low' },
      { id: generateId(), title: 'Translation Services', priority: 'low' },
    ],
  },
  {
    name: 'Tech & Creative',
    targets: [
      { id: generateId(), title: 'Managed IT Services', priority: 'high' },
      { id: generateId(), title: 'Software Developer', priority: 'medium' },
      { id: generateId(), title: 'Cybersecurity', priority: 'high' },
      { id: generateId(), title: 'Digital Marketing Agency', priority: 'medium' },
      { id: generateId(), title: 'Videographer', priority: 'low' },
      { id: generateId(), title: 'Photographer', priority: 'low' },
      { id: generateId(), title: 'Event Planner', priority: 'medium' },
      { id: generateId(), title: 'Graphic Designer', priority: 'low' },
      { id: generateId(), title: 'SEO Specialist', priority: 'medium' },
    ],
  },
  {
    name: 'Health & Wellness',
    targets: [
      { id: generateId(), title: 'Dentist', priority: 'high' },
      { id: generateId(), title: 'Orthodontist', priority: 'medium' },
      { id: generateId(), title: 'Physical Therapist', priority: 'medium' },
      { id: generateId(), title: 'Personal Trainer', priority: 'low' },
      { id: generateId(), title: 'Med Spa Owner', priority: 'medium' },
      { id: generateId(), title: 'Optometrist', priority: 'medium' },
      { id: generateId(), title: 'Chiropractor', priority: 'medium' },
      { id: generateId(), title: 'Mental Health Counselor', priority: 'high' },
    ],
  },
  {
    name: 'Financial Services',
    targets: [
      { id: generateId(), title: 'Wealth Manager', priority: 'high' },
      { id: generateId(), title: 'Mortgage Broker', priority: 'high' },
      { id: generateId(), title: 'Commercial Lender', priority: 'high' },
      { id: generateId(), title: 'SBA Loan Specialist', priority: 'medium' },
      { id: generateId(), title: 'Business Insurance Agent', priority: 'medium' },
      { id: generateId(), title: 'Benefits Consultant', priority: 'medium' },
    ],
  },
  {
    name: 'Real Estate & Property',
    targets: [
      { id: generateId(), title: 'Commercial Property Manager', priority: 'high' },
      { id: generateId(), title: 'Title Company Rep', priority: 'medium' },
      { id: generateId(), title: 'Home Inspector', priority: 'medium' },
      { id: generateId(), title: 'Appraiser', priority: 'low' },
      { id: generateId(), title: 'Moving Company', priority: 'medium' },
    ],
  },
];

export function getHighPriorityTargets() {
  return industryTargets.flatMap((cat) =>
    cat.targets.filter((t) => t.priority === 'high')
  );
}

export function getUnassignedTargets() {
  return industryTargets.flatMap((cat) =>
    cat.targets.filter((t) => !t.assignedTo)
  );
}
