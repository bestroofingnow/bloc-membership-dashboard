export interface EmailConfirmationInput {
  to: string;
  guest_first_name: string;
  event_title: string;
  event_starts_at: Date;
  event_location: string;
  ics_attachment: string; // raw .ics text
  magic_link: string;
}

export interface EmailMagicLinkInput {
  to: string;
  guest_first_name: string;
  magic_link: string;
}

export interface EmailClient {
  sendConfirmation(input: EmailConfirmationInput): Promise<{ message_id: string }>;
  sendMagicLink(input: EmailMagicLinkInput): Promise<{ message_id: string }>;
}

class ResendEmailClient implements EmailClient {
  constructor(private apiKey: string, private from: string) {}

  async sendConfirmation(input: EmailConfirmationInput): Promise<{ message_id: string }> {
    const html = `
      <p>Hi ${escapeHtml(input.guest_first_name)},</p>
      <p>You're registered for <strong>${escapeHtml(input.event_title)}</strong>.</p>
      <p>${input.event_starts_at.toLocaleString()} &middot; ${escapeHtml(input.event_location)}</p>
      <p>The calendar invite is attached. To register for another event or manage your RSVPs,
      <a href="${input.magic_link}">click here</a>.</p>
      <p>— BLOC</p>
    `;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: `You're registered for ${input.event_title}`,
        html,
        attachments: [
          {
            filename: 'event.ics',
            content: Buffer.from(input.ics_attachment).toString('base64'),
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    return { message_id: body.id };
  }

  async sendMagicLink(input: EmailMagicLinkInput): Promise<{ message_id: string }> {
    const html = `
      <p>Hi ${escapeHtml(input.guest_first_name)},</p>
      <p><a href="${input.magic_link}">Click here to access your BLOC RSVPs</a>.</p>
      <p>— BLOC</p>
    `;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: 'Your BLOC link',
        html,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    return { message_id: body.id };
  }
}

class MockEmailClient implements EmailClient {
  async sendConfirmation(input: EmailConfirmationInput): Promise<{ message_id: string }> {
    return { message_id: `mock-${input.to}` };
  }
  async sendMagicLink(input: EmailMagicLinkInput): Promise<{ message_id: string }> {
    return { message_id: `mock-magic-${input.to}` };
  }
}

// GHL-backed email client — sends via Conversations API, auto-creates contact.
// Picked automatically by getEmailClient() when GHL_API_KEY + GHL_LOCATION_ID
// are set and RESEND_API_KEY is not.
class GhlEmailClient implements EmailClient {
  private ghl: import('./ghl').GhlClient;
  constructor(ghl: import('./ghl').GhlClient) {
    this.ghl = ghl;
  }
  async sendConfirmation(input: EmailConfirmationInput): Promise<{ message_id: string }> {
    const html = `
      <p>Hi ${escapeHtml(input.guest_first_name)},</p>
      <p>You're registered for <strong>${escapeHtml(input.event_title)}</strong>.</p>
      <p>${input.event_starts_at.toLocaleString()} &middot; ${escapeHtml(input.event_location)}</p>
      <p>A calendar invite is attached. To manage your RSVPs,
      <a href="${input.magic_link}">click here</a>.</p>
      <p>— BLOC</p>
    `;
    const [first, ...rest] = (input.guest_first_name || '').split(' ');
    const r = await this.ghl.sendEmail({
      to_email: input.to,
      to_first_name: first,
      to_last_name: rest.join(' '),
      subject: `You're registered for ${input.event_title}`,
      html,
      ics_attachment: input.ics_attachment,
    });
    return { message_id: r.message_id };
  }
  async sendMagicLink(input: EmailMagicLinkInput): Promise<{ message_id: string }> {
    const html = `
      <p>Hi ${escapeHtml(input.guest_first_name)},</p>
      <p><a href="${input.magic_link}">Click here to access your BLOC RSVPs</a>.</p>
      <p>— BLOC</p>
    `;
    const [first, ...rest] = (input.guest_first_name || '').split(' ');
    const r = await this.ghl.sendEmail({
      to_email: input.to,
      to_first_name: first,
      to_last_name: rest.join(' '),
      subject: 'Your BLOC link',
      html,
    });
    return { message_id: r.message_id };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

export function getEmailClient(): EmailClient {
  if (process.env.NODE_ENV === 'test') {
    return new MockEmailClient();
  }
  // Provider priority: Resend > GHL > Mock
  // Resend is preferred when explicitly configured because it's a dedicated
  // transactional email service. GHL is the fallback that also logs the send
  // to the contact's conversation history — great when there's no Resend setup.
  if (process.env.RESEND_API_KEY) {
    return new ResendEmailClient(
      process.env.RESEND_API_KEY,
      process.env.RESEND_FROM_ADDRESS ?? 'no-reply@businessleadersofcharlotte.com',
    );
  }
  if (process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID) {
    // Lazy-import to avoid circular deps at module load
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getGhlClient } = require('./ghl') as typeof import('./ghl');
    return new GhlEmailClient(getGhlClient());
  }
  return new MockEmailClient();
}
