export type ChapterCode = 'North' | 'South' | 'Uptown' | 'FLOC' | 'Alumni';

export type QrTokenKind = 'general' | 'chapter' | 'event' | 'member_invite' | 'after_hours';

export interface QrTokenPayload {
  kind: QrTokenKind;
  chapter?: ChapterCode;
  event_id?: string;
  invited_by_member_id?: string;
  qr_id: string;
  iat: number; // issued-at unix seconds
}

export interface MemberForConflict {
  id: string;
  chapter: ChapterCode;
  industry_id: string | null;
  category_id: string | null;
  full_name: string;
  business_name: string;
}

export type ConflictKind = 'none' | 'exact' | 'related' | 'other';

export interface ConflictResult {
  kind: ConflictKind;
  occupants: MemberForConflict[];
}

export interface ConflictInput {
  chapter: ChapterCode;
  industry_id: string | null;
  category_id: string | null;
  members_in_chapter: MemberForConflict[];
}
