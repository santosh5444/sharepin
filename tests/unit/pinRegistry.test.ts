import { describe, it, expect } from 'vitest';
import { PinRegistryDO } from '../../worker/src/pinRegistry';

describe('PinRegistryDO Logic and Security', () => {
  it('generates a valid 5-digit PIN with leading zeros preserved', () => {
    const registry = new PinRegistryDO({} as any, {});
    const res = registry.createSession();

    expect(res.success).toBe(true);
    expect(res.pin).toBeDefined();
    expect(res.pin).toMatch(/^[0-9]{5}$/);
    expect(res.sessionId).toBeDefined();
    expect(res.senderToken).toBeDefined();
    expect(res.expiresAt).toBeGreaterThan(Date.now());
  });

  it('allows a receiver to join with the valid PIN within 2 minutes', () => {
    const registry = new PinRegistryDO({} as any, {});
    const created = registry.createSession();

    const joinRes = registry.joinSession(created.pin!);
    expect(joinRes.success).toBe(true);
    expect(joinRes.sessionId).toBe(created.sessionId);
    expect(joinRes.receiverToken).toBeDefined();
  });

  it('enforces single-receiver lock: rejects subsequent join attempts for same PIN', () => {
    const registry = new PinRegistryDO({} as any, {});
    const created = registry.createSession();

    // First join succeeds
    const join1 = registry.joinSession(created.pin!);
    expect(join1.success).toBe(true);

    // Second join must fail atomically
    const join2 = registry.joinSession(created.pin!);
    expect(join2.success).toBe(false);
    expect(join2.errorCode).toBe('ALREADY_PAIRED');
  });

  it('rejects nonexistent or invalid PINs', () => {
    const registry = new PinRegistryDO({} as any, {});
    const res = registry.joinSession('99999');
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('INVALID_PIN');
  });

  it('validates tokens for sender and receiver accurately', () => {
    const registry = new PinRegistryDO({} as any, {});
    const created = registry.createSession();
    const join = registry.joinSession(created.pin!);

    expect(registry.validateToken(created.sessionId!, created.senderToken!, 'sender')).toBe(true);
    expect(registry.validateToken(created.sessionId!, 'wrong-token', 'sender')).toBe(false);

    expect(registry.validateToken(created.sessionId!, join.receiverToken!, 'receiver')).toBe(true);
    expect(registry.validateToken(created.sessionId!, created.senderToken!, 'receiver')).toBe(false);
  });
});
