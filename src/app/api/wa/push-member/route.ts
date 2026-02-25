import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createContact, isWildApricotConfigured } from '@/lib/wildapricot';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  if (!isWildApricotConfigured()) {
    return NextResponse.json(
      { error: 'Wild Apricot is not configured' },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { guestId } = await request.json();

    if (!guestId) {
      return NextResponse.json({ error: 'guestId is required' }, { status: 400 });
    }

    // Fetch the guest
    const { data: guest, error: fetchError } = await supabase
      .from('guests')
      .select('*')
      .eq('id', guestId)
      .single();

    if (fetchError || !guest) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
    }

    // Check if already pushed
    if (guest.wa_contact_id) {
      return NextResponse.json(
        { error: 'Guest already exists in Wild Apricot', waContactId: guest.wa_contact_id },
        { status: 409 }
      );
    }

    // Split name into first/last
    const nameParts = (guest.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Create sync log entry
    const { data: logEntry } = await supabase
      .from('wa_sync_log')
      .insert([{
        sync_type: 'push_member',
        status: 'running',
      }])
      .select()
      .single();

    // Create contact in Wild Apricot
    const waContact = await createContact({
      firstName,
      lastName,
      email: guest.email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@placeholder.com`,
      organization: guest.company || undefined,
      phone: guest.phone || undefined,
    });

    // Update the guest with the WA contact ID
    await supabase
      .from('guests')
      .update({ wa_contact_id: String(waContact.Id) })
      .eq('id', guestId);

    // Update sync log
    if (logEntry) {
      await supabase
        .from('wa_sync_log')
        .update({
          status: 'success',
          records_synced: 1,
          records_added: 1,
          completed_at: new Date().toISOString(),
        })
        .eq('id', logEntry.id);
    }

    return NextResponse.json({
      success: true,
      waContactId: waContact.Id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Push failed';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
