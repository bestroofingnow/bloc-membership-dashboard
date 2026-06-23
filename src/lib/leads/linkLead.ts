import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeadStage } from './stage';

export interface LinkLeadArgs {
  source_table: 'guests' | 'public_signups' | 'intake_guests' | 'intake_rsvps' | 'business_card_scans' | 'membership_inbox';
  source_id: string;
  email?: string | null;
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  source: 'public_signup' | 'qr_rsvp' | 'card_scan' | 'manual' | 'import' | 'membership_email';
  stage: LeadStage;
  invited_by_member_id?: string | null;
  matched_member_id?: string | null;
  actor_profile_id?: string | null;
  note?: string | null;
}

/**
 * Non-blocking call to the link_lead RPC. NEVER throws: a lead-spine failure must
 * never block a real /api/join|scan|submit. Returns the lead id, or null on failure.
 * `sb` must be a service-role client (the RPC is GRANTed to service_role only).
 */
export async function linkLead(
  sb: SupabaseClient,
  args: LinkLeadArgs,
): Promise<string | null> {
  try {
    const { data, error } = await sb.rpc('link_lead', {
      p_source_table: args.source_table,
      p_source_id: args.source_id,
      p_email: args.email ?? null,
      p_name: args.name ?? null,
      p_company: args.company ?? null,
      p_phone: args.phone ?? null,
      p_source: args.source,
      p_stage: args.stage,
      p_invited_by_member_id: args.invited_by_member_id ?? null,
      p_matched_member_id: args.matched_member_id ?? null,
      p_actor_profile_id: args.actor_profile_id ?? null,
      p_note: args.note ?? null,
    });
    if (error) {
      console.error('link_lead failed (non-blocking):', error.message, args.source_table, args.source_id);
      return null;
    }
    return (data as string | null) ?? null;
  } catch (e) {
    console.error('link_lead threw (non-blocking):', e, args.source_table, args.source_id);
    return null;
  }
}
