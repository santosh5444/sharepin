import { describe, it, expect } from 'vitest';
import { isValidPin, normalizePin, sanitizeFileName, sanitizeRelativePath } from '../../src/utils/validation';

describe('PIN Validation and Formatting', () => {
  it('accepts valid 5-digit PINs including leading zeros', () => {
    expect(isValidPin('00000')).toBe(true);
    expect(isValidPin('00042')).toBe(true);
    expect(isValidPin('12345')).toBe(true);
    expect(isValidPin('99999')).toBe(true);
  });

  it('rejects invalid PIN formats', () => {
    expect(isValidPin('1234')).toBe(false);       // 4 digits
    expect(isValidPin('123456')).toBe(false);     // 6 digits
    expect(isValidPin('12a45')).toBe(false);      // Contains letter
    expect(isValidPin('')).toBe(false);           // Empty string
    expect(isValidPin(' 12345 ')).toBe(true);     // Trimmed valid
    expect(isValidPin('-1234')).toBe(false);      // Negative
    expect(isValidPin('null')).toBe(false);
  });

  it('normalizes input PIN preserving leading digits', () => {
    expect(normalizePin('00-12-3')).toBe('00123');
    expect(normalizePin('  48291 ')).toBe('48291');
    expect(normalizePin('987654321')).toBe('98765'); // Truncates to 5
    expect(normalizePin('abc01234xyz')).toBe('01234');
  });
});

describe('File Name & Path Sanitization', () => {
  it('sanitizes malicious filenames to prevent path traversal', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('..\\..\\Windows\\System32\\cmd.exe')).toBe('cmd.exe');
    expect(sanitizeFileName('/root/secret.key')).toBe('secret.key');
    expect(sanitizeFileName('test\x00file.png')).toBe('testfile.png');
  });

  it('replaces illegal characters with underscores', () => {
    expect(sanitizeFileName('my:cool*file?.txt')).toBe('my_cool_file_.txt');
    expect(sanitizeFileName('hello<world>.zip')).toBe('hello_world_.zip');
  });

  it('handles dot-only filenames safely', () => {
    expect(sanitizeFileName('.')).toBe('file__');
    expect(sanitizeFileName('..')).toBe('file___');
  });

  it('sanitizes relative folder paths safely', () => {
    expect(sanitizeRelativePath('folder/subfolder/file.txt')).toBe('folder/subfolder/file.txt');
    expect(sanitizeRelativePath('../../dangerous/path')).toBe('dangerous/path');
    expect(sanitizeRelativePath('a/./b/../c/file.txt')).toBe('a/c/file.txt');
  });
});
