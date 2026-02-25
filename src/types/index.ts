// Chapter types
export type ChapterName = 'North' | 'South' | 'Uptown' | 'FLOC' | 'Alumni';

// Board member roles
export type BoardRole =
  | 'President'
  | 'Vice President'
  | 'Membership (Sr)'
  | 'Membership (Jr)'
  | 'Uptown Director (Sr)'
  | 'Uptown Director (Jr)'
  | 'North Director (Sr)'
  | 'North Director (Jr)'
  | 'South Director (Sr)'
  | 'South Director (Jr)'
  | 'FLOC Director (Sr)'
  | 'FLOC Director (Jr)'
  | 'Alumni Director (Sr)'
  | 'Alumni Director (Jr)'
  | 'Treasurer (Sr)'
  | 'Treasurer (Jr)'
  | 'After Hours (Sr)'
  | 'After Hours (Jr)'
  | 'Sponsorship (Sr)'
  | 'Sponsorship (Jr)'
  | 'CIC (Sr)'
  | 'CIC (Jr)'
  | 'BIG Program (Sr)'
  | 'BIG Program (Jr)'
  | 'Admin';

// Board member interface
export interface BoardMember {
  role: BoardRole;
  name: string;
  company: string;
  email: string;
  phone: string;
}

// Member interface
export interface Member {
  id: string;
  name: string;
  company: string;
  chapter: ChapterName;
  industry: string;
  email?: string;
  phone?: string;
  joinDate?: string;
}

// Industry category for recruitment targets
export interface IndustryCategory {
  name: string;
  targets: IndustryTarget[];
}

export interface IndustryTarget {
  id: string;
  title: string;
  assignedTo?: string;
  priority: 'high' | 'medium' | 'low';
  notes?: string;
}

// Guest pipeline status
export type GuestStatus =
  | 'New Lead'
  | 'After Hours Invited'
  | 'After Hours Done'
  | 'Lunch Invited'
  | 'Lunch Done'
  | 'Application Sent'
  | 'Application Received'
  | 'Approved'
  | 'Declined';

// Guest in the pipeline
export interface Guest {
  id: string;
  name: string;
  company: string;
  industry?: string;
  invitedBy: string;
  status: GuestStatus;
  nextStep: string;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Dashboard stats
export interface DashboardStats {
  currentMembers: number;
  targetMembers: number;
  guestsInPipeline: number;
  newMembersThisMonth: number;
  referralsGiven: number;
  transactions: number;
}

// Tab configuration
export type TabId = 'dashboard' | 'leadership' | 'members' | 'targets' | 'pipeline' | 'guide' | 'scanner' | 'admin';

export interface Tab {
  id: TabId;
  label: string;
  icon: string;
}
