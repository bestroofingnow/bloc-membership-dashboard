import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GHL_WEBHOOK_URL = 'https://services.leadconnectorhq.com/hooks/djoUBrlP5ZcNEKrztBzw/webhook-trigger/b7685c53-1b04-43df-9913-d97d0aa42f0d';

interface ExportPayload {
  scanId?: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  linkedin: string;
  additionalNotes: string;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

export async function POST(request: Request) {
  let body: ExportPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  if (!body.name && !body.email && !body.phone) {
    return NextResponse.json(
      { error: 'At least a name, email, or phone is required to export' },
      { status: 400 }
    );
  }

  const { firstName, lastName } = splitName(body.name || '');

  // Build the GoHighLevel webhook payload
  const webhookPayload = {
    firstName,
    lastName,
    name: body.name || '',
    title: body.title || '',
    company: body.company || '',
    email: body.email || '',
    phone: body.phone || '',
    address: body.address || '',
    website: body.website || '',
    linkedin: body.linkedin || '',
    additionalNotes: body.additionalNotes || '',
    source: 'BLOC Business Card Scanner',
    scannedAt: new Date().toISOString(),
  };

  try {
    const webhookResponse = await fetch(GHL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    });

    if (!webhookResponse.ok) {
      const errText = await webhookResponse.text();
      console.error('GoHighLevel webhook error:', webhookResponse.status, errText);
      return NextResponse.json(
        { error: 'Failed to export to CRM. Please try again.' },
        { status: 502 }
      );
    }

    // Mark as exported in Supabase if we have a scanId
    if (body.scanId) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && serviceRoleKey) {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        await supabase
          .from('business_card_scans')
          .update({ exported_to_crm: true, exported_at: new Date().toISOString() })
          .eq('id', body.scanId);
      }
    }

    return NextResponse.json({ success: true, message: 'Contact exported to GoHighLevel CRM' });
  } catch (err) {
    console.error('Export error:', err);
    return NextResponse.json(
      { error: 'Failed to connect to CRM webhook' },
      { status: 500 }
    );
  }
}
