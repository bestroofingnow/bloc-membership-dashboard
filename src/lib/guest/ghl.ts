export interface GhlContactInput {
  email: string;
  first_name: string;
  last_name: string;
  business_name: string;
  tags?: string[];
  custom_fields?: Record<string, string>;
}

export interface GhlClient {
  upsertContact(input: GhlContactInput): Promise<{ contact_id: string }>;
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
}

class MockGhlClient implements GhlClient {
  async upsertContact(input: GhlContactInput): Promise<{ contact_id: string }> {
    return { contact_id: `mock-${input.email}` };
  }
}

export function getGhlClient(): GhlClient {
  if (process.env.NODE_ENV === 'test' || !process.env.GHL_API_KEY) {
    return new MockGhlClient();
  }
  return new RealGhlClient(process.env.GHL_API_KEY!, process.env.GHL_LOCATION_ID!);
}
