/**
 * RFC 4180-style CSV field escape.
 *
 * Wraps in double quotes when the value contains a comma, double quote, or
 * newline. Embedded double quotes are escaped by doubling.
 */
export function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Convert a row (array of strings) into a single CSV line.
 */
export function csvRow(cells: string[]): string {
  return cells.map(csvField).join(',');
}
