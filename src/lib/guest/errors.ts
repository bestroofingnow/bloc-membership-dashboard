/**
 * Map error codes returned by the public guest API to human-readable
 * sentences for the form panel. Unknown codes fall back to a generic message.
 */
export function humanError(code: string): string {
  switch (code) {
    case 'rate_limited':
      return 'Too many submissions from this device. Please wait a minute and try again.';
    case 'bad_request':
      return 'Some fields are missing or invalid. Check your entries and try again.';
    case 'invalid_token':
    case 'token_chapter_mismatch':
    case 'token_event_mismatch':
      return 'Your registration link is invalid or expired. Please use the original QR or ask whoever invited you for a new link.';
    case 'event_not_found':
    case 'event_closed':
      return 'This event is no longer accepting registrations.';
    case 'db_error':
      return 'We hit a temporary issue saving your registration. Please try again in a moment.';
    case 'network_error':
      return "Couldn't reach the server. Check your connection and try again.";
    default:
      return 'Something went wrong. Please try again.';
  }
}
