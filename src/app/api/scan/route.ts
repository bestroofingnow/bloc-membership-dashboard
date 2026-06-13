import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { linkLead } from '@/lib/leads/linkLead';
import { rateLimit } from '@/lib/guest/rate-limit';

export const runtime = 'nodejs';

interface ExtractedCardData {
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

export async function POST(request: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'Anthropic API key not configured' },
      { status: 500 }
    );
  }

  // Require a logged-in member BEFORE the paid Anthropic call. The scanner is a
  // member/staff tool, not a public endpoint — without this gate an anonymous
  // caller with the URL could run up an unbounded AI bill.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!bearerToken) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const authClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authErr } = await authClient.auth.getUser(bearerToken);
  const scannedByProfileId = authData?.user?.id ?? null;
  if (authErr || !scannedByProfileId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // Per-user rate limit so one account can't spam the paid vision API.
  const okScan = await rateLimit({ bucket: `scan:${scannedByProfileId}`, limit: 20, windowSeconds: 60 });
  if (!okScan) {
    return NextResponse.json({ error: 'Too many scans. Please wait a minute.' }, { status: 429 });
  }

  let imageBase64: string;
  let mediaType: string;

  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    imageBase64 = buffer.toString('base64');
    mediaType = file.type;
  } catch {
    return NextResponse.json(
      { error: 'Failed to process uploaded image' },
      { status: 400 }
    );
  }

  // Call Anthropic Claude Vision API
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        // Fallback: 'claude-3-5-sonnet-20241022' if model not available
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: `Analyze this business card image and extract the following information. Return ONLY a valid JSON object with these exact fields (use empty string "" if a field is not found):

{
  "name": "Full name of the person",
  "title": "Job title or position",
  "company": "Company or organization name",
  "email": "Email address",
  "phone": "Phone number (primary)",
  "address": "Full mailing address",
  "website": "Website URL",
  "linkedin": "LinkedIn profile URL or username",
  "additionalNotes": "Any other relevant info (fax, secondary phone, social media, etc.)"
}

Return ONLY the JSON object, no other text.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Anthropic API error:', response.status, errorData);

      // Parse error details for user-facing message
      let errorMessage = `Anthropic API error (${response.status})`;
      try {
        const parsed = JSON.parse(errorData);
        if (parsed.error?.message) {
          errorMessage = parsed.error.message;
        }
      } catch {
        // Use raw text if not JSON
        if (errorData.length < 200) errorMessage = errorData;
      }

      return NextResponse.json(
        { error: `Scanner error: ${errorMessage}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const textContent = data.content?.find((c: any) => c.type === 'text')?.text;

    if (!textContent) {
      return NextResponse.json(
        { error: 'No text response from AI analysis' },
        { status: 502 }
      );
    }

    // Parse the JSON from Claude's response
    let extractedData: ExtractedCardData;
    try {
      // Handle potential markdown code blocks in response
      const jsonStr = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      extractedData = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse Claude response:', textContent);
      return NextResponse.json(
        { error: 'Failed to parse business card data. Please try again.' },
        { status: 502 }
      );
    }

    // Save to Supabase (config + caller already validated at the top).
    let scanId: string | null = null;

    type MatchType = 'new_guest' | 'existing_guest' | 'existing_member' | 'no_email' | 'no_persistence';
    let match: {
      matchType: MatchType;
      guestId: string | null;
      memberId: string | null;
      memberName: string | null;
      guestName: string | null;
      scanCount: number;
    } = {
      matchType: 'no_persistence',
      guestId: null,
      memberId: null,
      memberName: null,
      guestName: null,
      scanCount: 0,
    };

    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      // Caller (scannedByProfileId) was already verified at the top of the handler.
      const emailNormalized = (extractedData.email || '').trim().toLowerCase() || null;

      // Match resolution: email → member > existing guest > new guest > unmatchable
      let targetMemberId: string | null = null;
      let memberName: string | null = null;
      let targetGuestId: string | null = null;
      let guestName: string | null = null;
      let matchType: MatchType = 'no_email';

      if (!emailNormalized) {
        // No email on the card — can't dedupe or match. Create a guest anyway if we
        // have name+company (best-effort), but no member/guest matching.
        matchType = 'no_email';
      } else {
        // 1. Already a member?
        const { data: matchedMember } = await supabase
          .from('members')
          .select('id,name')
          .ilike('email', emailNormalized)
          .limit(1)
          .maybeSingle();
        if (matchedMember) {
          targetMemberId = (matchedMember as { id: string; name: string }).id;
          memberName = (matchedMember as { id: string; name: string }).name;
          matchType = 'existing_member';
        } else {
          // 2. Already a guest?
          const { data: matchedGuest } = await supabase
            .from('guests')
            .select('id,name')
            .ilike('email', emailNormalized)
            .limit(1)
            .maybeSingle();
          if (matchedGuest) {
            targetGuestId = (matchedGuest as { id: string; name: string }).id;
            guestName = (matchedGuest as { id: string; name: string }).name;
            matchType = 'existing_guest';
          }
        }
      }

      // 3. If neither member nor existing guest, create a new guest (if we have name+company)
      const inputName = (extractedData.name || '').trim();
      const inputCompany = (extractedData.company || '').trim();
      if (matchType !== 'existing_member' && matchType !== 'existing_guest' && inputName && inputCompany) {
        const notes = [
          extractedData.title ? `Title: ${extractedData.title}` : null,
          extractedData.website ? `Website: ${extractedData.website}` : null,
          extractedData.linkedin ? `LinkedIn: ${extractedData.linkedin}` : null,
          extractedData.additionalNotes ? `Notes: ${extractedData.additionalNotes}` : null,
        ].filter(Boolean).join('\n');
        const { data: newGuest, error: newGuestErr } = await supabase
          .from('guests')
          .insert([{
            name: inputName,
            company: inputCompany,
            industry: extractedData.title || null,
            email: extractedData.email || null,
            phone: extractedData.phone || null,
            invited_by: 'Card scan',
            status: 'New Lead',
            next_step: 'Follow up with intro email',
            notes: notes || null,
          }])
          .select('id,name')
          .single();
        if (newGuestErr) {
          console.error('Failed to create guest from scan:', newGuestErr);
        } else if (newGuest) {
          targetGuestId = (newGuest as { id: string; name: string }).id;
          guestName = (newGuest as { id: string; name: string }).name;
          matchType = 'new_guest';
        }
      }

      // Link the guests row (new OR pre-existing) into the one lead funnel.
      // Existing-member matches have no targetGuestId, so this is skipped for them.
      if (targetGuestId) {
        await linkLead(supabase, {
          source_table: 'guests',
          source_id: targetGuestId,
          email: emailNormalized,
          name: inputName || extractedData.name || null,
          company: inputCompany || extractedData.company || null,
          phone: extractedData.phone || null,
          source: 'card_scan',
          stage: 'new',
          actor_profile_id: scannedByProfileId,
          note: 'card scan → guest',
        });
      }

      // 4. Insert the scan record (with all the resolved IDs)
      const { data: scanRow, error: scanErr } = await supabase
        .from('business_card_scans')
        .insert([{
          name: extractedData.name || '',
          title: extractedData.title || '',
          company: extractedData.company || '',
          email: extractedData.email || '',
          phone: extractedData.phone || '',
          address: extractedData.address || '',
          website: extractedData.website || '',
          linkedin: extractedData.linkedin || '',
          additional_notes: extractedData.additionalNotes || '',
          exported_to_crm: false,
          scanned_by_profile_id: scannedByProfileId,
          target_guest_id: targetGuestId,
          target_member_id: targetMemberId,
          email_normalized: emailNormalized,
        }])
        .select('id')
        .single();
      if (scanErr) {
        console.error('Failed to save scan:', scanErr);
      } else {
        scanId = scanRow?.id || null;
      }

      // Link the scan row into the lead funnel. For an existing-member match we record
      // a networking touch with matched_member_id but NO forward pipeline lead beyond
      // this scan (preserves the scanner's existing-member guard). Email-less scans
      // still get their own lead so nothing is dropped.
      if (scanId) {
        await linkLead(supabase, {
          source_table: 'business_card_scans',
          source_id: scanId,
          email: emailNormalized,
          name: extractedData.name || null,
          company: extractedData.company || null,
          phone: extractedData.phone || null,
          source: 'card_scan',
          stage: 'new',
          matched_member_id: targetMemberId,
          actor_profile_id: scannedByProfileId,
          note: matchType === 'existing_member'
            ? 'networking touch (existing member)'
            : 'card scan',
        });
      }

      // 5. Count total scans of this same email (including this one)
      let scanCount = 0;
      if (emailNormalized) {
        const { count } = await supabase
          .from('business_card_scans')
          .select('id', { count: 'exact', head: true })
          .eq('email_normalized', emailNormalized);
        scanCount = count ?? 0;
      }

      match = {
        matchType,
        guestId: targetGuestId,
        memberId: targetMemberId,
        memberName,
        guestName,
        scanCount,
      };
    }

    return NextResponse.json({
      success: true,
      scanId,
      match,
      data: extractedData,
    });
  } catch (err) {
    console.error('Scan error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred during scanning' },
      { status: 500 }
    );
  }
}
