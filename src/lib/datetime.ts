/**
 * Convert an ISO timestamptz string into the YYYY-MM-DDTHH:MM format
 * required by <input type="datetime-local">.
 *
 * Uses the runtime's LOCAL timezone (matches how the input renders to the
 * user). The returned string is parsed back by the browser as local time
 * when passed back through fromLocalDateTimeInput.
 */
export function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convert a value from <input type="datetime-local"> (local time, no offset)
 * into a UTC ISO string suitable for transport / DB storage.
 */
export function fromLocalDateTimeInput(local: string): string {
  return new Date(local).toISOString();
}
