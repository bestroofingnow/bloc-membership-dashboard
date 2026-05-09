export interface EmailConfirmationInput {
  to: string;
  guest_first_name: string;
  event_title: string;
  event_starts_at: Date;
  event_location: string;
  ics_attachment: string; // raw .ics text
  magic_link: string;
}

export interface EmailClient {
  sendConfirmation(input: EmailConfirmationInput): Promise<{ message_id: string }>;
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
}

class MockEmailClient implements EmailClient {
  async sendConfirmation(input: EmailConfirmationInput): Promise<{ message_id: string }> {
    return { message_id: `mock-${input.to}` };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

export function getEmailClient(): EmailClient {
  if (process.env.NODE_ENV === 'test' || !process.env.RESEND_API_KEY) {
    return new MockEmailClient();
  }
  return new ResendEmailClient(
    process.env.RESEND_API_KEY!,
    process.env.RESEND_FROM_ADDRESS ?? 'no-reply@businessleadersofcharlotte.com',
  );
}
