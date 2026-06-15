export interface JoinValue {
  name: string;
  company: string;
  email: string | null;
  phone: string | null;
}

export type JoinParseResult =
  | { ok: true; value: JoinValue }
  | { ok: false; error: string };

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Validate + normalize the simplified sign-up form: name, business name, and at
 * least one way to reach them (email or phone). Pure, so the form and the API
 * route share one source of truth.
 */
export function parseJoinInput(input: {
  name?: unknown;
  company?: unknown;
  email?: unknown;
  phone?: unknown;
}): JoinParseResult {
  const name = str(input.name);
  const company = str(input.company);
  const email = str(input.email);
  const phone = str(input.phone);

  if (!name) return { ok: false, error: 'Please enter your name.' };
  if (!company) return { ok: false, error: 'Please enter your business name.' };
  if (!email && !phone) {
    return { ok: false, error: 'Please enter an email or phone number so we can reach you.' };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }

  return { ok: true, value: { name, company, email: email || null, phone: phone || null } };
}
