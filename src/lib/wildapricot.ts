// Wild Apricot API Client
// OAuth2 client credentials flow with token caching

const WA_AUTH_URL = 'https://oauth.wildapricot.org/auth/token';
const WA_API_BASE = 'https://api.wildapricot.org/v2.2';

interface WAToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  obtained_at: number;
}

let cachedToken: WAToken | null = null;

function getConfig() {
  const apiKey = process.env.WILDAPRICOT_API_KEY;
  const accountId = process.env.WILDAPRICOT_ACCOUNT_ID;

  if (!apiKey || !accountId) {
    throw new Error(
      'Wild Apricot is not configured. Set WILDAPRICOT_API_KEY and WILDAPRICOT_ACCOUNT_ID.'
    );
  }

  return { apiKey, accountId };
}

export function isWildApricotConfigured(): boolean {
  return !!(process.env.WILDAPRICOT_API_KEY && process.env.WILDAPRICOT_ACCOUNT_ID);
}

async function getAccessToken(): Promise<string> {
  const { apiKey } = getConfig();

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken) {
    const elapsed = (Date.now() - cachedToken.obtained_at) / 1000;
    if (elapsed < cachedToken.expires_in - 60) {
      return cachedToken.access_token;
    }
  }

  // Request new token using API key (client credentials)
  const credentials = Buffer.from(`APIKEY:${apiKey}`).toString('base64');

  const response = await fetch(WA_AUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=auto',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WA auth failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  cachedToken = {
    ...data,
    obtained_at: Date.now(),
  };

  return data.access_token;
}

async function waFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();

  const response = await fetch(`${WA_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WA API error (${response.status}): ${text}`);
  }

  // Some endpoints return 204 No Content
  if (response.status === 204) return null;

  return response.json();
}

// ============================================================
// Contacts (Members)
// ============================================================

export interface WAContact {
  Id: number;
  FirstName: string;
  LastName: string;
  Email: string;
  Organization: string;
  Phone?: string;
  Status: string; // 'Active', 'Lapsed', 'PendingNew', etc.
  MembershipLevel?: { Id: number; Name: string };
  FieldValues: Array<{
    FieldName: string;
    Value: any;
    SystemCode: string;
  }>;
}

export interface WAContactListResponse {
  Contacts: WAContact[];
  ResultCount: number;
}

export async function getContacts(filter?: string): Promise<WAContact[]> {
  const { accountId } = getConfig();
  const params = new URLSearchParams({
    '$async': 'false',
  });
  if (filter) {
    params.set('$filter', filter);
  }

  const data: WAContactListResponse = await waFetch(
    `/accounts/${accountId}/Contacts?${params.toString()}`
  );

  return data.Contacts || [];
}

export async function getActiveMembers(): Promise<WAContact[]> {
  return getContacts("Status eq 'Active'");
}

export async function getContact(contactId: number): Promise<WAContact> {
  const { accountId } = getConfig();
  return waFetch(`/accounts/${accountId}/Contacts/${contactId}`);
}

export async function createContact(contactData: {
  firstName: string;
  lastName: string;
  email: string;
  organization?: string;
  phone?: string;
}): Promise<WAContact> {
  const { accountId } = getConfig();

  const fieldValues = [
    { FieldName: 'First name', Value: contactData.firstName },
    { FieldName: 'Last name', Value: contactData.lastName },
    { FieldName: 'Email', Value: contactData.email },
  ];

  if (contactData.organization) {
    fieldValues.push({ FieldName: 'Organization', Value: contactData.organization });
  }
  if (contactData.phone) {
    fieldValues.push({ FieldName: 'Phone', Value: contactData.phone });
  }

  return waFetch(`/accounts/${accountId}/Contacts`, {
    method: 'POST',
    body: JSON.stringify({
      FieldValues: fieldValues,
      MembershipEnabled: false, // Create as a contact first, not a member
    }),
  });
}

// ============================================================
// Events
// ============================================================

export interface WAEvent {
  Id: number;
  Name: string;
  StartDate: string;
  EndDate: string;
  Location: string;
  EventType: string;
  Description?: string;
  RegistrationUrl?: string;
  RegistrationsLimit?: number;
  ConfirmedRegistrationsCount?: number;
}

export async function getUpcomingEvents(): Promise<WAEvent[]> {
  const { accountId } = getConfig();
  const now = new Date().toISOString().split('T')[0];

  const data = await waFetch(
    `/accounts/${accountId}/Events?$filter=StartDate gt '${now}'&$sort=StartDate asc`
  );

  return data.Events || [];
}

export async function getEvent(eventId: number): Promise<WAEvent> {
  const { accountId } = getConfig();
  return waFetch(`/accounts/${accountId}/Events/${eventId}`);
}

// ============================================================
// Account Info
// ============================================================

export async function getAccountDetails(): Promise<any> {
  const { accountId } = getConfig();
  return waFetch(`/accounts/${accountId}`);
}
