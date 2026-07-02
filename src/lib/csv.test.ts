import { describe, test, expect } from 'vitest';
import { csvField, csvRow } from './csv';

describe('csvField()', () => {
  test('plain text is unchanged', () => {
    expect(csvField('hello')).toBe('hello');
  });

  test('text with comma is quoted', () => {
    expect(csvField('a, b')).toBe('"a, b"');
  });

  test('text with double quote is quoted and quote is doubled', () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  test('text with newline is quoted', () => {
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
  });

  test('text with carriage return is quoted', () => {
    expect(csvField('a\rb')).toBe('"a\rb"');
  });

  test('empty string passes through', () => {
    expect(csvField('')).toBe('');
  });

  // Spreadsheet formula-injection defense: leading = + - @ or tab gets a
  // single-quote prefix so Excel/Sheets render text, not a formula.
  test('leading = is neutralized', () => {
    expect(csvField('=HYPERLINK("http://evil","x")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""x"")"',
    );
  });

  test('leading + - @ and tab are neutralized', () => {
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('-2')).toBe("'-2");
    expect(csvField('@cmd')).toBe("'@cmd");
    expect(csvField('\tx')).toBe("'\tx");
  });

  test('= in the middle is left alone', () => {
    expect(csvField('a=b')).toBe('a=b');
  });
});

describe('csvRow()', () => {
  test('joins fields with commas', () => {
    expect(csvRow(['a', 'b', 'c'])).toBe('a,b,c');
  });

  test('escapes individual fields as needed', () => {
    expect(csvRow(['plain', 'with, comma', 'with "quote"'])).toBe(
      'plain,"with, comma","with ""quote"""',
    );
  });

  test('empty row', () => {
    expect(csvRow([])).toBe('');
  });
});
