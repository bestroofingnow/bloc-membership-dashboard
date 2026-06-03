import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/api/auth';
import {
  getUpcomingEvents,
  isWildApricotConfigured,
  WAEvent,
} from '@/lib/wildapricot';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function mapEventType(event: WAEvent): string {
  const name = (event.Name || '').toLowerCase();
  const type = (event.EventType || '').toLowerCase();

  if (name.includes('after hours') || type.includes('after hours')) return 'after_hours';
  if (name.includes('lunch') || type.includes('lunch')) return 'lunch';
  if (name.includes('social') || type.includes('social')) return 'social';
  return 'other';
}

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

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
    .insert([{ sync_type: 'events', status: 'running' }])
    .select()
    .single();

  try {
    const waEvents = await getUpcomingEvents();

    let added = 0;
    let updated = 0;

    for (const event of waEvents) {
      const eventData = {
        name: event.Name,
        description: event.Description || null,
        event_date: event.StartDate,
        end_date: event.EndDate || null,
        location: event.Location || null,
        event_type: mapEventType(event),
        wa_event_id: String(event.Id),
        registration_url: event.RegistrationUrl || null,
        max_registrants: event.RegistrationsLimit || null,
        current_registrants: event.ConfirmedRegistrationsCount || 0,
        updated_at: new Date().toISOString(),
      };

      // Upsert by wa_event_id
      const { data: existing } = await supabase
        .from('events')
        .select('id')
        .eq('wa_event_id', String(event.Id))
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from('events')
          .update(eventData)
          .eq('id', existing[0].id);
        updated++;
      } else {
        await supabase.from('events').insert([eventData]);
        added++;
      }
    }

    // Update sync log
    if (logEntry) {
      await supabase
        .from('wa_sync_log')
        .update({
          status: 'success',
          records_synced: waEvents.length,
          records_added: added,
          records_updated: updated,
          completed_at: new Date().toISOString(),
        })
        .eq('id', logEntry.id);
    }

    return NextResponse.json({
      success: true,
      total: waEvents.length,
      added,
      updated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Event sync failed';

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
