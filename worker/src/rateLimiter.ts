/**
 * In-memory sliding window rate limiter for worker requests
 */

interface RateLimitEntry {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private entries = new Map<string, RateLimitEntry>();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  public isAllowed(key: string): boolean {
    const now = Date.now();
    let entry = this.entries.get(key);

    if (!entry) {
      entry = { timestamps: [now] };
      this.entries.set(key, entry);
      return true;
    }

    // Clean up timestamps outside the window
    const windowStart = now - this.windowMs;
    entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);

    if (entry.timestamps.length >= this.maxRequests) {
      return false; // Rate limit exceeded
    }

    entry.timestamps.push(now);
    return true;
  }

  public getRetryAfterSeconds(key: string): number {
    const entry = this.entries.get(key);
    if (!entry || entry.timestamps.length === 0) return 0;
    const oldest = entry.timestamps[0] || Date.now();
    const remainingMs = Math.max(0, (oldest + this.windowMs) - Date.now());
    return Math.ceil(remainingMs / 1000);
  }

  public cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [key, entry] of this.entries.entries()) {
      entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);
      if (entry.timestamps.length === 0) {
        this.entries.delete(key);
      }
    }
  }
}
