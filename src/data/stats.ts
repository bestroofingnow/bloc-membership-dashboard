import { DashboardStats } from '@/types';
import { members } from './members';
import { initialGuests } from './guests';

export const dashboardStats: DashboardStats = {
  currentMembers: members.length,
  targetMembers: 125,
  guestsInPipeline: initialGuests.length,
  newMembersThisMonth: 5,
  // From BLOC website
  referralsGiven: 10000,
  transactions: 9000,
};

export const chapterGoals = {
  North: { current: members.filter(m => m.chapter === 'North').length, target: 30 },
  South: { current: members.filter(m => m.chapter === 'South').length, target: 25 },
  Uptown: { current: members.filter(m => m.chapter === 'Uptown').length, target: 30 },
  FLOC: { current: members.filter(m => m.chapter === 'FLOC').length, target: 30 },
  Alumni: { current: members.filter(m => m.chapter === 'Alumni').length, target: 20 },
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
