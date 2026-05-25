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
  title?: string;
  website?: string;
  description?: string;
  address?: string;
  mobilePhone?: string;
  birthday?: string;
  memberSince?: string;
  renewalDue?: string;
  referredBy?: string;
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
export type TabId = 'dashboard' | 'leadership' | 'members' | 'targets' | 'pipeline' | 'guide' | 'scanner' | 'intake' | 'events' | 'admin';

export type EventKind = 'lunch' | 'after_hours' | 'special';

export interface IntakeEvent {
  id: string;
  chapter: ChapterName | null;
  kind: EventKind;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location_name: string | null;
  location_address: string | null;
  ics_uid: string;
  public_visible: boolean;
  created_at: string;
}

export interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

// Public-flow intake guest (separate from kanban Guest above — see sub-project A)
export type IntakeConflictKind = 'none' | 'exact' | 'related' | 'other';
export type IntakeRsvpStatus = 'registered' | 'attended' | 'no_show' | 'canceled';

export interface IntakeGuestRow {
  rsvp_id: string;
  guest_id: string;
  first_name: string;
  last_name: string;
  email: string;
  business_name: string;
  other_category_text: string | null;
  chapter: ChapterName | null;
  event_title: string;
  event_starts_at: string;
  conflict_kind: IntakeConflictKind;
  conflict_member_name: string | null;
  status: IntakeRsvpStatus;
  invited_by_member_name: string | null;
  submitted_at: string;
  has_unresolved_side_effects: boolean;
}
