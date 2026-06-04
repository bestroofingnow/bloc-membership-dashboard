import type { Member, ChapterName } from '@/types';

/** A row from the member_directory view (migration 024). Personal columns may
 *  be NULL when the viewer is not the owner/staff and has not been opted in. */
export interface DirectoryRow {
  id: string;
  name: string;
  company: string;
  chapter: string | null;
  member_type: string;
  industry: string;
  title: string | null;
  website: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  industry_id: string | null;
  category_id: string | null;
  member_since: string | null;
  renewal_due: string | null;
  referred_by: string | null;
  mobile_phone: string | null;
  address: string | null;
  birthday: string | null;
}

/** Map a directory row to the app Member type. NULL personal columns become
 *  undefined so the UI renders them as absent (never as fabricated values). */
export function directoryRowToMember(row: DirectoryRow): Member {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    chapter: (row.chapter ?? null) as ChapterName | null,
    memberType: row.member_type === 'after_hours' ? 'after_hours' : 'full',
    industry: row.industry,
    email: row.email || undefined,
    phone: row.phone || undefined,
    title: row.title || undefined,
    website: row.website || undefined,
    description: row.description || undefined,
    address: row.address || undefined,
    mobilePhone: row.mobile_phone || undefined,
    birthday: row.birthday || undefined,
    memberSince: row.member_since || undefined,
    renewalDue: row.renewal_due || undefined,
    referredBy: row.referred_by || undefined,
  };
}
