import { DashboardStats } from '@/types';
import { members } from './members';
import { initialGuests } from './guests';

export const dashboardStats: DashboardStats = {
  currentMembers: 89,
  targetMembers: 125,
  guestsInPipeline: initialGuests.length,
  newMembersThisMonth: 3,
  // From BLOC website
  referralsGiven: 10000,
  transactions: 9000,
};

export const chapterGoals = {
  North: { current: 22, target: 30 },
  South: { current: 18, target: 25 },
  Uptown: { current: 24, target: 30 },
  FLOC: { current: 20, target: 30 },
  Alumni: { current: 5, target: 10 },
};

// Key events from BLOC website
export const upcomingEvents = [
  {
    name: 'Monthly Lunch - All Chapters',
    date: '2nd Week of Each Month',
    time: '11:45 AM - 1:00 PM',
    type: 'lunch',
  },
  {
    name: 'After Hours Networking',
    date: 'Last Wednesday of Each Month',
    time: '5:30 PM - 7:30 PM',
    location: 'Slate Billiards',
    type: 'networking',
  },
  {
    name: 'BLOC Charity Golf Classic',
    date: 'Spring 2026',
    type: 'charity',
  },
  {
    name: 'BLOC-N-BOWL',
    date: 'Winter 2026',
    description: 'Supporting local family adoption programs',
    type: 'charity',
  },
  {
    name: 'Holiday Gala',
    date: 'December 2026',
    description: 'Annual celebration of member contributions',
    type: 'social',
  },
];

// Community impact stats from BLOC website
export const impactStats = {
  referralsSince2018: '10,000+',
  transactionsSince2018: '9,000+',
  charityRaisedSince2001: '$732,171.45',
};
