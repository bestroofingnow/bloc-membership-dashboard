/**
 * RFC 4180-style CSV field escape, plus spreadsheet formula-injection defense.
 *
 * Wraps in double quotes when the value contains a comma, double quote, or
 * newline. Embedded double quotes are escaped by doubling.
 *
 * Values starting with = + - @ or a tab are prefixed with a single quote so
 * Excel/Sheets treat them as text instead of executing them as formulas —
 * these exports contain guest-typed names that must never run on staff machines.
 */
export function csvField(value: string): string {
  let v = value;
  if (/^[=+\-@\t]/.test(v)) {
    v = "'" + v;
  }
  if (/[",\n\r]/.test(v)) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

/**
 * Convert a row (array of strings) into a single CSV line.
 */
export function csvRow(cells: string[]): string {
  return cells.map(csvField).join(',');
}
