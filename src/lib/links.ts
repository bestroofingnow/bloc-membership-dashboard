// Centralized, whitespace-safe link builders. QR codes and invite links MUST
// never contain whitespace — a single stray space breaks the scanned/clicked URL.
// All dynamic segments are stripped of whitespace here, so every caller is safe.

/** Trim surrounding whitespace and drop any trailing slash(es) from an origin. */
export function cleanOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

/** Remove ALL whitespace from a URL segment (a valid token/id never has any). */
function cleanSegment(value: string): string {
  return value.replace(/\s/g, '');
}

/** The public guest landing a QR code encodes: <origin>/guest/i/<token>. */
export function guestInviteUrl(origin: string, token: string): string {
  return `${cleanOrigin(origin)}/guest/i/${cleanSegment(token)}`;
}

/** A member's attributed join link: <origin>/join?ref=<memberId>. */
export function memberInviteUrl(origin: string, memberId: string): string {
  return `${cleanOrigin(origin)}/join?ref=${cleanSegment(memberId)}`;
}
