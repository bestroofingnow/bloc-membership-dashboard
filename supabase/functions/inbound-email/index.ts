// Supabase Edge Function: Inbound Email → Public Signup
// Receives webhook POSTs from SendGrid Inbound Parse and creates public_signups rows.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-webhook-secret, content-type',
};

interface ParsedEmail {
  from: string;
  fromName: string;
  subject: string;
  body: string;
}

function parseFromField(from: string): { name: string; email: string } {
  // Handles "John Smith <john@example.com>" or just "john@example.com"
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^["']|["']$/g, ''), email: match[2].trim() };
  }
  return { name: from.split('@')[0], email: from.trim() };
}

function extractCompanyFromEmail(email: string): string {
  const domain = email.split('@')[1];
  if (!domain) return 'Unknown';

  // Skip common free email providers
  const freeProviders = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
  ];
  if (freeProviders.includes(domain.toLowerCase())) {
    return 'Unknown';
  }

  // Use the domain name as company name, capitalize it
  const company = domain.split('.')[0];
  return company.charAt(0).toUpperCase() + company.slice(1);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Validate webhook secret — FAIL CLOSED. If the secret env isn't configured,
  // reject everything rather than accept unauthenticated posts into the signup
  // inbox. Accept the secret via header (generic webhooks) or ?key= query param
  // (SendGrid Inbound Parse can't send custom headers).
  const webhookSecret = Deno.env.get('INBOUND_EMAIL_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('INBOUND_EMAIL_WEBHOOK_SECRET is not set — refusing all requests');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const providedSecret =
    req.headers.get('x-webhook-secret') ?? new URL(req.url).searchParams.get('key');
  if (providedSecret !== webhookSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // SendGrid Inbound Parse sends multipart/form-data
    const contentType = req.headers.get('content-type') || '';
    let parsed: ParsedEmail;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const from = (formData.get('from') as string) || '';
      const subject = (formData.get('subject') as string) || '';
      const text = (formData.get('text') as string) || '';
      const html = (formData.get('html') as string) || '';

      parsed = {
        from,
        fromName: parseFromField(from).name,
        subject,
        body: text || html?.replace(/<[^>]*>/g, ' ').trim() || '',
      };
    } else {
      // JSON payload (for testing or other providers)
      const json = await req.json();
      parsed = {
        from: json.from || json.sender || '',
        fromName: json.fromName || json.from_name || parseFromField(json.from || '').name,
        subject: json.subject || '',
        body: json.text || json.body || '',
      };
    }

    const { name, email } = parseFromField(parsed.from);
    const company = extractCompanyFromEmail(email);

    // Build notes from the email content
    const notes = [
      parsed.subject ? `Subject: ${parsed.subject}` : null,
      parsed.body ? parsed.body.slice(0, 500) : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    // Insert into public_signups
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: insertError } = await supabase.from('public_signups').insert([
      {
        name: parsed.fromName || name,
        company,
        email,
        referral_source: 'Email',
        notes,
        processed: false,
      },
    ]);

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
