/**
 * Validation and sanitization utilities
 */

/**
 * Validates whether a string is a valid 5-digit PIN (00000 to 99999).
 * Preserves and checks for exact 5 numeric digits.
 */
export function isValidPin(pin: string): boolean {
  if (typeof pin !== 'string') return false;
  return /^[0-9]{5}$/.test(pin.trim());
}

/**
 * Normalizes input PIN by removing spaces/hyphens and taking the first 5 digits.
 */
export function normalizePin(input: string): string {
  if (!input) return '';
  return input.replace(/[^0-9]/g, '').slice(0, 5);
}

/**
 * Sanitizes untrusted filenames from peer to prevent path traversal or script injection.
 */
export function sanitizeFileName(name: string): string {
  if (!name || typeof name !== 'string') return 'downloaded_file';

  // Strip null bytes and dangerous control characters
  let clean = name.replace(/[\x00-\x1f\x80-\x9f]/g, '');

  // Strip directory paths to prevent path traversal (../, ..\, /)
  clean = clean.replace(/^[/\\]+/, '');
  clean = clean.split(/[/\\]/).pop() || 'downloaded_file';

  // Replace invalid filesystem characters on Windows and UNIX
  clean = clean.replace(/[<>:"/\\|?*]/g, '_');

  // Disallow dot-only filenames (. or ..)
  if (/^\.+$/.test(clean)) {
    clean = 'file_' + clean.replace(/\./g, '_');
  }

  // Trim whitespace and limit length
  clean = clean.trim().slice(0, 255);

  return clean.length > 0 ? clean : 'downloaded_file';
}

/**
 * Sanitizes relative paths for folder transfers
 */
export function sanitizeRelativePath(path: string): string {
  if (!path || typeof path !== 'string') return '';
  
  // Normalize slashes to forward slashes and canonicalize path segments safely
  const rawSegments = path.replace(/\\/g, '/').split('/');
  const stack: string[] = [];

  for (const seg of rawSegments) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (stack.length > 0) {
        stack.pop();
      }
    } else {
      const sanitized = sanitizeFileName(seg);
      if (sanitized && sanitized !== '.' && sanitized !== '..') {
        stack.push(sanitized);
      }
    }
  }

  return stack.join('/');
}
