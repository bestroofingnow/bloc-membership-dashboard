import type { SupabaseClient } from '@supabase/supabase-js';
import { linkLead } from '@/lib/leads/linkLead';

export interface MembershipPerson {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  phone?: string | null;
  chapter?: string | null;
}

/**
 * Application → ensure a waiting lead exists at stage 'applied', credited to the
 * membership-email source. Idempotent (link_lead find-or-creates by email and is
 * forward-only). Returns the lead id, or null if the spine call failed.
 */
export async function upsertWaitingLead(
  sb: SupabaseClient,
  inboxId: string,
  p: MembershipPerson,
): Promise<string | null> {
  return linkLead(sb, {
    source_table: 'membership_inbox',
    source_id: inboxId,
    email: p.email ?? null,
    name: p.name ?? null,
    company: p.company ?? null,
    phone: p.phone ?? null,
    source: 'membership_email',
    stage: 'applied',
    note: 'membership application via email',
  });
}

export interface PromoteResult {
  memberId: string | null;
  leadId: string | null;
}

/**
 * Acceptance → upsert the members row (match by email; never clobber an existing
 * member) and advance the lead to 'member', recording the conversion. Returns the
 * member + lead ids.
 */
export async function promoteToMember(
  sb: SupabaseClient,
  inboxId: string,
  p: MembershipPerson,
): Promise<PromoteResult> {
  const email = p.email?.trim().toLowerCase() || null;

  // Find an existing member by email; only insert when genuinely new so we never
  // overwrite a real member's profile from a terse acceptance email.
  let memberId: string | null = null;
  if (email) {
    const { data: existing } = await sb.from('members').select('id').eq('email', email).limit(1);
    if (existing && existing.length > 0) memberId = existing[0].id as string;
  }

  if (!memberId) {
    const { data: inserted, error } = await sb
      .from('members')
      .insert([{
        name: p.name?.trim() || 'New Member',
        company: p.company?.trim() || 'Unknown',
        chapter: p.chapter || 'North',
        industry: 'Other',
        email,
        phone: p.phone?.trim() || null,
      }])
      .select('id')
      .single();
    if (error) {
      console.error('promoteToMember: member insert failed', error.message);
    } else {
      memberId = inserted?.id ?? null;
    }
  }

  const leadId = await linkLead(sb, {
    source_table: 'membership_inbox',
    source_id: inboxId,
    email,
    name: p.name ?? null,
    company: p.company ?? null,
    phone: p.phone ?? null,
    source: 'membership_email',
    stage: 'member',
    matched_member_id: memberId,
    note: 'membership accepted via email',
  });

  if (leadId && memberId) {
    await sb.from('leads').update({ converted_member_id: memberId }).eq('id', leadId);
  }

  return { memberId, leadId };
}

/**
 * Convert an Approved pipeline guest into a member: upsert the members row (match by
 * email; never clobber an existing member) and advance the guest's lead to 'member'.
 * Mirrors promoteToMember but credited to the `guests` source. Idempotent.
 */
export async function convertGuestToMember(
  sb: SupabaseClient,
  guestId: string,
  p: MembershipPerson,
): Promise<PromoteResult> {
  const email = p.email?.trim().toLowerCase() || null;

  let memberId: string | null = null;
  if (email) {
    const { data: existing } = await sb.from('members').select('id').eq('email', email).limit(1);
    if (existing && existing.length > 0) memberId = existing[0].id as string;
  }

  if (!memberId) {
    const { data: inserted, error } = await sb
      .from('members')
      .insert([{
        name: p.name?.trim() || 'New Member',
        company: p.company?.trim() || 'Unknown',
        chapter: p.chapter || 'North',
        industry: 'Other',
        email,
        phone: p.phone?.trim() || null,
      }])
      .select('id')
      .single();
    if (error) {
      console.error('convertGuestToMember: member insert failed', error.message);
    } else {
      memberId = inserted?.id ?? null;
    }
  }

  const leadId = await linkLead(sb, {
    source_table: 'guests',
    source_id: guestId,
    email,
    name: p.name ?? null,
    company: p.company ?? null,
    phone: p.phone ?? null,
    source: 'manual',
    stage: 'member',
    matched_member_id: memberId,
    note: 'approved guest converted to member',
  });

  if (leadId && memberId) {
    await sb.from('leads').update({ converted_member_id: memberId }).eq('id', leadId);
  }

  return { memberId, leadId };
}
