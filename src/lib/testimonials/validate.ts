/** Max length of a testimonial body. */
export const TESTIMONIAL_MAX = 1000;

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface TestimonialInput {
  authorMemberId: string | null;
  subjectMemberId: string | null;
  body: string;
}

/**
 * Validate a member-to-member testimonial. The author must be set, the subject must
 * be set and different from the author (you can't endorse yourself), and the body
 * must be 1..TESTIMONIAL_MAX chars. Pure → unit-tested, shared by web + mobile.
 */
export function validateTestimonial(input: TestimonialInput): ValidationResult {
  if (!input.authorMemberId) return { ok: false, error: 'Missing author.' };
  if (!input.subjectMemberId) return { ok: false, error: 'Pick who this testimonial is about.' };
  if (input.authorMemberId === input.subjectMemberId) {
    return { ok: false, error: "You can't write a testimonial about yourself." };
  }
  const body = (input.body ?? '').trim();
  if (body.length < 1) return { ok: false, error: 'Write a few words.' };
  if (body.length > TESTIMONIAL_MAX) {
    return { ok: false, error: `Keep it under ${TESTIMONIAL_MAX} characters.` };
  }
  return { ok: true };
}

export interface TestimonialRow {
  author_member_id: string;
  subject_member_id: string;
}

/** Count testimonials written ABOUT a member (the social proof on their profile). */
export function countAboutMember(rows: TestimonialRow[], memberId: string): number {
  return rows.filter((r) => r.subject_member_id === memberId).length;
}
