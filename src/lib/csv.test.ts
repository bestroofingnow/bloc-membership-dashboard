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
