export const CONNECTION_NAME_MAX = 120;
export const CONNECTION_NOTES_MAX = 1000;

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface ConnectionInput {
  contactName: string;
  company?: string | null;
  notes?: string | null;
}

/**
 * Validate a new connection (someone met but not yet ready to refer).
 * Only contactName is required; company/notes are optional but capped.
 * Pure → unit-tested + shared (web/mobile).
 */
export function validateConnection(input: ConnectionInput): ValidationResult {
  const name = (input.contactName ?? '').trim();
  if (name.length < 1) return { ok: false, error: 'Add their name.' };
  if (name.length > CONNECTION_NAME_MAX) {
    return { ok: false, error: `Name must be under ${CONNECTION_NAME_MAX} characters.` };
  }
  const notes = (input.notes ?? '').trim();
  if (notes.length > CONNECTION_NOTES_MAX) {
    return { ok: false, error: `Notes must be under ${CONNECTION_NOTES_MAX} characters.` };
  }
  return { ok: true };
}
