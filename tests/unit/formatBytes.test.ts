import { describe, it, expect } from 'vitest';
import { formatBytes, formatSpeed, formatDuration } from '../../src/utils/formatBytes';

describe('Byte, Speed and Duration Formatting', () => {
  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats transfer speed correctly', () => {
    expect(formatSpeed(0)).toBe('0 KB/s');
    expect(formatSpeed(1024 * 1024 * 10)).toBe('10 MB/s');
  });

  it('formats duration correctly', () => {
    expect(formatDuration(null)).toBe('--:--');
    expect(formatDuration(45)).toBe('00:45');
    expect(formatDuration(125)).toBe('02:05');
    expect(formatDuration(3665)).toBe('1h 1m 5s');
  });
});
