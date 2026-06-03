/**
 * Mirror of the Postgres email-normalization rule used by the
 * business_card_scans.email_normalized and intake_guests.email_normalized
 * columns, which are populated via lower(trim(email)).
 * Use this anywhere TS compares an email against those *_normalized columns,
 * so client/server logic matches the database. (Empty strings normalize to
 * null on the TS side so callers can treat "no email" uniformly.)
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (email == null) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed === '' ? null : trimmed;
}
