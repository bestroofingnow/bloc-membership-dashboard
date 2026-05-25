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
export type TabId = 'dashboard' | 'leadership' | 'members' | 'targets' | 'pipeline' | 'guide' | 'scanner' | 'intake' | 'events' | 'qr' | 'roster' | 'me' | 'taxonomy' | 'admin';

export interface MemberTaxonomyRow {
  member_id: string;
  name: string;
  company: string;
  chapter: ChapterName;
  legacy_industry_text: string | null;
  current_industry_id: string | null;
  current_industry_name: string | null;
  current_category_id: string | null;
  current_category_title: string | null;
  suggested_industry_id: string | null;
  suggested_industry_name: string | null;
  suggested_category_id: string | null;
  suggested_category_title: string | null;
}

export interface RosterMember {
  member_id: string;
  member_name: string;
  member_company: string;
  member_chapter: ChapterName;
  member_category_id: string | null;
  member_category_title: string | null;
  // Effective visibility / overrides (null override = inherit from member)
  visible: boolean;
  public_business_name: string | null;
  public_category_id: string | null;
  public_category_title: string | null;
  has_override_row: boolean;
}

export type QrTokenKindUI = 'general' | 'chapter' | 'event' | 'member_invite' | 'after_hours';

export interface QrTokenRow {
  id: string;
  token: string;
  kind: QrTokenKindUI;
  chapter: ChapterName | null;
  event_id: string | null;
  event_title: string | null;
  invited_by_member_id: string | null;
  invited_by_member_name: string | null;
  label: string | null;
  scan_count: number;
  last_scanned_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

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
