/** Max length of a member's "ideal referral / what I'm looking for" blurb. */
export const IDEAL_REFERRAL_MAX = 500;

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Validate the optional "My ideal referral" profile field. Empty is allowed (it's
 * optional); only length is capped. Pure, so it is unit-tested and shared by the
 * web profile editor and the mobile app.
 */
export function validateIdealReferral(text: string | null | undefined): ValidationResult {
  const t = (text ?? '').trim();
  if (t.length > IDEAL_REFERRAL_MAX) {
    return { ok: false, error: `Keep it under ${IDEAL_REFERRAL_MAX} characters.` };
  }
  return { ok: true };
}
