export interface GhlContactInput {
  email: string;
  first_name: string;
  last_name: string;
  business_name: string;
  tags?: string[];
  custom_fields?: Record<string, string>;
}

export interface GhlEmailInput {
  to_email: string;
  to_first_name?: string;
  to_last_name?: string;
  subject: string;
  html: string;
  // Optional ICS calendar attachment (raw text). Uploaded to GHL media library
  // first, then attached to the conversation message by URL.
  ics_attachment?: string;
}

export interface GhlClient {
  upsertContact(input: GhlContactInput): Promise<{ contact_id: string }>;
  /**
   * Send a transactional email to a contact via GHL's Conversations API.
   * Upserts the contact first so this works for new + existing recipients.
   * The email lands in the contact's conversation history in GHL.
   */
  sendEmail(input: GhlEmailInput): Promise<{ message_id: string; contact_id: string }>;
}

class RealGhlClient implements GhlClient {
  constructor(private apiKey: string, private locationId: string) {}

  async upsertContact(input: GhlContactInput): Promise<{ contact_id: string }> {
    const res = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Version: '2021-07-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        locationId: this.locationId,
        email: input.email,
        firstName: input.first_name,
        lastName: input.last_name,
        companyName: input.business_name,
        tags: input.tags ?? [],
        customFields: input.custom_fields ?? {},
      }),
    });
    if (!res.ok) {
      throw new Error(`GHL upsert failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    return { contact_id: body.contact?.id ?? body.id };
  }

  async sendEmail(input: GhlEmailInput): Promise<{ message_id: string; contact_id: string }> {
    // 1. Ensure the contact exists (GHL Conversations needs a contactId).
    const { contact_id } = await this.upsertContact({
      email: input.to_email,
      first_name: input.to_first_name ?? '',
      last_name: input.to_last_name ?? '',
      business_name: '',
    });

    // 2. Optionally upload the ICS to GHL media library so we can attach by URL.
    const attachments: string[] = [];
    if (input.ics_attachment) {
      try {
        const fd = new FormData();
        fd.append('hosted', 'false');
        fd.append('locationId', this.locationId);
        fd.append(
          'file',
          new Blob([input.ics_attachment], { type: 'text/calendar' }),
          'event.ics',
        );
        const uploadRes = await fetch('https://services.leadconnectorhq.com/medias/upload-file', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Version: '2021-07-28',
          },
          body: fd,
        });
        if (uploadRes.ok) {
          const uploadBody = await uploadRes.json();
          const fileUrl = uploadBody.fileUrl || uploadBody.url || uploadBody.path;
          if (fileUrl) attachments.push(fileUrl);
        } else {
          console.error(
            'GHL ICS upload failed; sending email without attachment',
            uploadRes.status,
            await uploadRes.text(),
          );
        }
      } catch (e) {
        console.error('GHL ICS upload exception; sending email without attachment', e);
      }
    }

    // 3. Send the email as a conversation message.
    const res = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Version: '2021-04-15',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'Email',
        contactId: contact_id,
        subject: input.subject,
        html: input.html,
        ...(attachments.length > 0 ? { attachments } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`GHL email send failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    return {
      message_id: body.messageId ?? body.id ?? '',
      contact_id,
    };
  }
}

class MockGhlClient implements GhlClient {
  async upsertContact(input: GhlContactInput): Promise<{ contact_id: string }> {
    return { contact_id: `mock-${input.email}` };
  }
  async sendEmail(input: GhlEmailInput): Promise<{ message_id: string; contact_id: string }> {
    return { message_id: `mock-msg-${input.to_email}`, contact_id: `mock-${input.to_email}` };
  }
}

export function getGhlClient(): GhlClient {
  if (process.env.NODE_ENV === 'test' || !process.env.GHL_API_KEY) {
    return new MockGhlClient();
  }
  return new RealGhlClient(process.env.GHL_API_KEY!, process.env.GHL_LOCATION_ID!);
}
