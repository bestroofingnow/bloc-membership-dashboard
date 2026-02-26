import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // Save to Supabase if configured
    let scanId: string | null = null;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const { data: insertData, error: insertError } = await supabase
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
        }])
        .select('id')
        .single();

      if (insertError) {
        console.error('Failed to save scan:', insertError);
        // Don't fail the request - still return the extracted data
      } else {
        scanId = insertData?.id || null;
      }
    }

    return NextResponse.json({
      success: true,
      scanId,
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
