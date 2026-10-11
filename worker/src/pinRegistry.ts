import { PinRecord } from './types';

export class PinRegistryDO {
  private activePins = new Map<string, PinRecord>(); // pin -> record
  private sessionToPin = new Map<string, string>();   // sessionId -> pin

  constructor(_state: DurableObjectState, _env: any) {
    // In-memory or persisted state
  }

  /**
   * Generates a cryptographically random 5-digit PIN (00000 - 99999) with collision retry.
   */
  private generateRandomPin(): string | null {
    const MAX_ATTEMPTS = 50;
    const array = new Uint32Array(1);

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      crypto.getRandomValues(array);
      const randomVal = array[0]! % 100000;
      const candidatePin = randomVal.toString().padStart(5, '0');

      const existing = this.activePins.get(candidatePin);
      if (!existing || existing.expiresAt <= Date.now()) {
        // Safe to use
        return candidatePin;
      }
    }

    // Fallback: If random attempts collided, check if total active pins reached max capacity
    this.cleanExpired();
    if (this.activePins.size >= 100000) {
      return null; // Exhaustion
    }

    // Find next available in range
    for (let n = 0; n < 100000; n++) {
      const pinStr = n.toString().padStart(5, '0');
      if (!this.activePins.has(pinStr)) {
        return pinStr;
      }
    }

    return null;
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [pin, record] of this.activePins.entries()) {
      if (record.expiresAt <= now && !record.isClaimed) {
        this.activePins.delete(pin);
        this.sessionToPin.delete(record.sessionId);
      }
    }
  }

  /**
   * Creates a session with an atomic PIN reservation
   */
  public createSession(): {
    success: boolean;
    sessionId?: string;
    pin?: string;
    senderToken?: string;
    expiresAt?: number;
    error?: string;
  } {
    this.cleanExpired();

    const pin = this.generateRandomPin();
    if (!pin) {
      return { success: false, error: 'NO_PINS_AVAILABLE' };
    }

    const sessionId = crypto.randomUUID();
    const senderToken = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + 180 * 1000; // Exact 3-minute joining window

    const record: PinRecord = {
      pin,
      sessionId,
      senderToken,
      createdAt: now,
      expiresAt,
      isClaimed: false,
    };

    this.activePins.set(pin, record);
    this.sessionToPin.set(sessionId, pin);

    return {
      success: true,
      sessionId,
      pin,
      senderToken,
      expiresAt,
    };
  }

  /**
   * Joins a session atomically using PIN.
   * Enforces 2-minute deadline and single-receiver constraint.
   */
  public joinSession(pin: string): {
    success: boolean;
    sessionId?: string;
    receiverToken?: string;
    expiresAt?: number;
    errorCode?: 'INVALID_PIN' | 'EXPIRED_PIN' | 'ALREADY_PAIRED';
    message?: string;
  } {
    this.cleanExpired();

    const record = this.activePins.get(pin);
    if (!record) {
      return {
        success: false,
        errorCode: 'INVALID_PIN',
        message: 'No active session found for this PIN.',
      };
    }

    const now = Date.now();
    if (record.expiresAt <= now) {
      this.activePins.delete(pin);
      this.sessionToPin.delete(record.sessionId);
      return {
        success: false,
        errorCode: 'EXPIRED_PIN',
        message: 'This PIN has expired (3-minute window has elapsed).',
      };
    }

    // Atomic single-receiver check
    if (record.isClaimed) {
      return {
        success: false,
        errorCode: 'ALREADY_PAIRED',
        message: 'This session has already been joined by another device.',
      };
    }

    // Claim PIN atomically
    record.isClaimed = true;
    record.receiverToken = crypto.randomUUID();

    return {
      success: true,
      sessionId: record.sessionId,
      receiverToken: record.receiverToken,
      expiresAt: record.expiresAt,
    };
  }

  /**
   * Validates peer authorization token
   */
  public validateToken(sessionId: string, token: string, role: 'sender' | 'receiver'): boolean {
    const pin = this.sessionToPin.get(sessionId);
    if (!pin) return false;
    const record = this.activePins.get(pin);
    if (!record) return false;

    if (role === 'sender') {
      return record.senderToken === token;
    } else {
      return record.receiverToken === token;
    }
  }

  /**
   * Releases a session and its PIN reservation
   */
  public releaseSession(sessionId: string): void {
    const pin = this.sessionToPin.get(sessionId);
    if (pin) {
      this.activePins.delete(pin);
      this.sessionToPin.delete(sessionId);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/create') {
      const res = this.createSession();
      return Response.json(res);
    }

    if (path === '/join') {
      const body = await request.json() as { pin: string };
      const res = this.joinSession(body.pin);
      return Response.json(res);
    }

    if (path === '/release') {
      const body = await request.json() as { sessionId: string };
      this.releaseSession(body.sessionId);
      return Response.json({ success: true });
    }

    if (path === '/validate') {
      const body = await request.json() as { sessionId: string; token: string; role: 'sender' | 'receiver' };
      const valid = this.validateToken(body.sessionId, body.token, body.role);
      return Response.json({ valid });
    }

    return new Response('Not found', { status: 404 });
  }
}
