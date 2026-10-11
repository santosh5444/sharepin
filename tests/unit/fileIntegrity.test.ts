import { describe, it, expect } from 'vitest';
import { computeSHA256 } from '../../src/utils/fileIntegrity';

describe('File Integrity SHA-256 Hashing', () => {
  it('correctly hashes byte buffer to standard SHA-256 hex string', async () => {
    // Hash of "hello world" in UTF-8
    const encoder = new TextEncoder();
    const data = encoder.encode('hello world');
    const hash = await computeSHA256(data);

    // Known SHA-256 of "hello world":
    // b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('correctly hashes empty buffer', async () => {
    const empty = new Uint8Array(0);
    const hash = await computeSHA256(empty);
    // Known SHA-256 of empty string:
    // e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
