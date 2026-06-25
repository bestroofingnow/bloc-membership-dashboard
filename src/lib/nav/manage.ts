export type Role = 'admin' | 'chapter_director' | 'member';

export interface ManageToolMeta {
  key: string;
  label: string;
  adminOnly: boolean;
}

/** The staff tools collapsed under the single "Manage" hub (order = sub-nav order). */
export const MANAGE_TOOLS: ManageToolMeta[] = [
  { key: 'targets', label: 'Most Wanted', adminOnly: false },
  { key: 'pipeline', label: 'Guest Pipeline', adminOnly: false },
  { key: 'intake', label: 'Guest Inbox', adminOnly: false },
  { key: 'membership', label: 'Membership Inbox', adminOnly: false },
  { key: 'events', label: 'Events', adminOnly: false },
  { key: 'resources', label: 'Resources', adminOnly: false },
  { key: 'qr', label: 'QR Codes', adminOnly: false },
  { key: 'roster', label: 'Roster', adminOnly: false },
  { key: 'seats', label: 'Category Seats', adminOnly: false },
  { key: 'taxonomy', label: 'Member Taxonomy', adminOnly: true },
  { key: 'admin', label: 'Admin', adminOnly: true },
];

/** Tools visible to a role: admins see all, directors see non-admin tools, members none. */
export function visibleManageTools(role: Role): ManageToolMeta[] {
  if (role === 'admin') return MANAGE_TOOLS;
  if (role === 'chapter_director') return MANAGE_TOOLS.filter((t) => !t.adminOnly);
  return [];
}
