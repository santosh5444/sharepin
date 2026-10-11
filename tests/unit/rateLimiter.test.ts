import { describe, it, expect } from 'vitest';
import { SlidingWindowRateLimiter } from '../../worker/src/rateLimiter';

describe('SlidingWindowRateLimiter Security', () => {
  it('allows requests within limit and blocks requests exceeding limit', () => {
    // 3 requests allowed per 1000ms
    const limiter = new SlidingWindowRateLimiter(3, 1000);
    const ip = '192.168.1.100';

    expect(limiter.isAllowed(ip)).toBe(true);
    expect(limiter.isAllowed(ip)).toBe(true);
    expect(limiter.isAllowed(ip)).toBe(true);
    // 4th request must be blocked
    expect(limiter.isAllowed(ip)).toBe(false);
  });

  it('tracks distinct IP keys separately', () => {
    const limiter = new SlidingWindowRateLimiter(2, 1000);
    expect(limiter.isAllowed('ip-1')).toBe(true);
    expect(limiter.isAllowed('ip-1')).toBe(true);
    expect(limiter.isAllowed('ip-1')).toBe(false);

    // ip-2 should still be allowed
    expect(limiter.isAllowed('ip-2')).toBe(true);
  });
});
