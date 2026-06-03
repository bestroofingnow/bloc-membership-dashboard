export const PASSWORD_MIN_LENGTH = 8;

export function validatePasswordLength(pw: string): boolean {
  return pw.length >= PASSWORD_MIN_LENGTH;
}
