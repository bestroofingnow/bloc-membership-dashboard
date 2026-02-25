import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getActiveMembers,
  isWildApricotConfigured,
  WAContact,
} from '@/lib/wildapricot';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getFieldValue(contact: WAContact, fieldName: string): string | null {
  const field = contact.FieldValues?.find(
    (f) => f.FieldName === fieldName || f.SystemCode === fieldName
  );
  return field?.Value ?? null;
}

function mapChapter(contact: WAContact): string {
  // Try to find chapter from membership level or custom field
  const level = contact.MembershipLevel?.Name || '';
  const group = getFieldValue(contact, 'Group participation');

  const chapterMap: Record<string, string> = {
    north: 'North',
    south: 'South',
    uptown: 'Uptown',
    floc: 'FLOC',
    alumni: 'Alumni',
  };

  const text = `${level} ${group}`.toLowerCase();
  for (const [key, value] of Object.entries(chapterMap)) {
    if (text.includes(key)) return value;
  }

  return 'North'; // Default chapter
}

export async function POST() {
  if (!isWildApricotConfigured()) {
    return NextResponse.json(
      { error: 'Wild Apricot is not configured' },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Create sync log entry
  const { data: logEntry } = await supabase
    .from('wa_sync_log')
    .insert([{ sync_type: 'members', status: 'running' }])
    .select()
    .single();

  try {
    const contacts = await getActiveMembers();

    let added = 0;
    let updated = 0;

    for (const contact of contacts) {
      const firstName = contact.FirstName || '';
      const lastName = contact.LastName || '';
      const fullName = `${firstName} ${lastName}`.trim();

      if (!fullName) continue;

      const memberData = {
        name: fullName,
        company: contact.Organization || 'Unknown',
        chapter: mapChapter(contact),
        industry: getFieldValue(contact, 'Industry') || 'Other',
        email: contact.Email || null,
        phone: getFieldValue(contact, 'Phone') || contact.Phone || null,
        wa_contact_id: String(contact.Id),
      };

      // Upsert: match by wa_contact_id or email
      const { data: existing } = await supabase
        .from('members')
        .select('id')
        .or(`wa_contact_id.eq.${contact.Id},email.eq.${contact.Email || 'NONE'}`)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from('members')
          .update(memberData)
          .eq('id', existing[0].id);
        updated++;
      } else {
        await supabase.from('members').insert([memberData]);
        added++;
      }
    }

    // Update sync log
    if (logEntry) {
      await supabase
        .from('wa_sync_log')
        .update({
          status: 'success',
          records_synced: contacts.length,
          records_added: added,
          records_updated: updated,
          completed_at: new Date().toISOString(),
        })
        .eq('id', logEntry.id);
    }

    return NextResponse.json({
      success: true,
      total: contacts.length,
      added,
      updated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';

    if (logEntry) {
      await supabase
        .from('wa_sync_log')
        .update({
          status: 'error',
          error: message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', logEntry.id);
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
