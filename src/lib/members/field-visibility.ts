/**
 * Pure projection of a member's personal fields for a given viewer.
 *
 * Precedence (mirrored exactly by directory_members() in migration 024):
 *  - owner (lower(email) = current_user_email()) OR staff (admin/director) => all fields
 *  - otherwise each field is visible only when its opt-in flag is true
 *  - absence of any flag => hidden (default privacy)
 *
 * NOTE: mobile_phone is classified PERSONAL (decided 2026-06-03), so it is
 * gated identically to address and birthday — never always-visible.
 */

export interface PersonalFields {
  mobile_phone: string | null;
  address: string | null;
  birthday: string | null;
}

export interface FieldVisibilityFlags {
  show_mobile_phone: boolean;
  show_address: boolean;
  show_birthday: boolean;
}

export interface ViewerContext {
  isStaff: boolean;
  isOwner: boolean;
}

export function projectFieldVisibility(
  fields: PersonalFields,
  flags: FieldVisibilityFlags,
  viewer: ViewerContext,
): PersonalFields {
  const seeAll = viewer.isStaff || viewer.isOwner;
  return {
    mobile_phone: seeAll || flags.show_mobile_phone ? fields.mobile_phone : null,
    address: seeAll || flags.show_address ? fields.address : null,
    birthday: seeAll || flags.show_birthday ? fields.birthday : null,
  };
}

/** Coerce an untrusted body into a complete flag set; anything non-true => false. */
export function parseFieldVisibilityInput(
  input: Record<string, unknown>,
): FieldVisibilityFlags {
  return {
    show_mobile_phone: input.show_mobile_phone === true,
    show_address: input.show_address === true,
    show_birthday: input.show_birthday === true,
  };
}
