import { PinRecord } from './types';

export class PinRegistryDO {
  private state?: DurableObjectState;
  private activePins = new Map<string, PinRecord>(); // pin -> record
  private sessionToPin = new Map<string, string>();   // sessionId -> pin
  private initialized = false;

  constructor(state?: DurableObjectState, _env?: any) {
    this.state = state;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.state && this.state.storage) {
      try {
        const stored = await this.state.storage.list<PinRecord>({ prefix: 'pin:' });
        for (const [, record] of stored) {
          if (record && record.pin) {
            this.activePins.set(record.pin, record);
            this.sessionToPin.set(record.sessionId, record.pin);
          }
        }
      } catch (err) {
        console.warn('Failed to load sessions from storage:', err);
      }
    }
    this.initialized = true;
  }

  private persistRecord(record: PinRecord): void {
    if (this.state && this.state.storage) {
      this.state.storage.put(`pin:${record.pin}`, record).catch(err => {
        console.warn('Failed to persist record:', err);
      });
    }
  }

  private deleteRecord(pin: string): void {
    if (this.state && this.state.storage) {
      this.state.storage.delete(`pin:${pin}`).catch(err => {
        console.warn('Failed to delete record:', err);
      });
    }
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
        this.deleteRecord(pin);
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
    token?: string;
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
    const expiresAt = now + 300 * 1000; // Generous 5-minute joining window

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
    this.persistRecord(record);

    return {
      success: true,
      sessionId,
      pin,
      token: senderToken,
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
    token?: string;
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
      this.deleteRecord(pin);
      return {
        success: false,
        errorCode: 'EXPIRED_PIN',
        message: 'This PIN has expired (3-minute window has elapsed).',
      };
    }

    // If already claimed, allow the receiver to reconnect/rejoin with their token
    if (record.isClaimed) {
      if (!record.receiverToken) {
        record.receiverToken = crypto.randomUUID();
      }
      this.persistRecord(record);
      return {
        success: true,
        sessionId: record.sessionId,
        token: record.receiverToken,
        receiverToken: record.receiverToken,
        expiresAt: record.expiresAt,
      };
    }

    // Claim PIN atomically
    record.isClaimed = true;
    if (!record.receiverToken) {
      record.receiverToken = crypto.randomUUID();
    }
    this.persistRecord(record);

    return {
      success: true,
      sessionId: record.sessionId,
      token: record.receiverToken,
      receiverToken: record.receiverToken,
      expiresAt: record.expiresAt,
    };
  }

  /**
   * Validates peer authorization token
   */
  public validateToken(sessionId: string, token: string, role: 'sender' | 'receiver'): boolean {
    const pin = this.sessionToPin.get(sessionId);
    if (!pin) {
      for (const record of this.activePins.values()) {
        if (record.sessionId === sessionId) {
          return role === 'sender' ? record.senderToken === token : record.receiverToken === token;
        }
      }
      return false;
    }
    const record = this.activePins.get(pin);
    if (!record) return false;

    if (role === 'sender') {
      return record.senderToken === token;
    } else {
      return record.receiverToken === token;
    }
  }

  /**
   * Gets session state and synchronization payload
   */
  public getStatus(sessionId: string): {
    found: boolean;
    isClaimed?: boolean;
    manifest?: any;
    receiverAccepted?: boolean;
    expiresAt?: number;
  } {
    const pin = this.sessionToPin.get(sessionId);
    let record = pin ? this.activePins.get(pin) : undefined;
    if (!record) {
      for (const r of this.activePins.values()) {
        if (r.sessionId === sessionId) {
          record = r;
          break;
        }
      }
    }
    if (!record) return { found: false };

    return {
      found: true,
      isClaimed: record.isClaimed,
      manifest: record.manifest,
      receiverAccepted: record.receiverAccepted,
      expiresAt: record.expiresAt,
    };
  }

  /**
   * Sender sets manifest
   */
  public setManifest(sessionId: string, manifest: any): boolean {
    const pin = this.sessionToPin.get(sessionId);
    let record = pin ? this.activePins.get(pin) : undefined;
    if (!record) {
      for (const r of this.activePins.values()) {
        if (r.sessionId === sessionId) {
          record = r;
          break;
        }
      }
    }
    if (!record) return false;
    record.manifest = manifest;
    this.persistRecord(record);
    return true;
  }

  /**
   * Receiver accepts transfer
   */
  public setAccepted(sessionId: string): boolean {
    const pin = this.sessionToPin.get(sessionId);
    let record = pin ? this.activePins.get(pin) : undefined;
    if (!record) {
      for (const r of this.activePins.values()) {
        if (r.sessionId === sessionId) {
          record = r;
          break;
        }
      }
    }
    if (!record) return false;
    record.receiverAccepted = true;
    this.persistRecord(record);
    return true;
  }

  /**
   * Releases a session and its PIN reservation
   */
  public releaseSession(sessionId: string): void {
    const pin = this.sessionToPin.get(sessionId);
    if (pin) {
      this.activePins.delete(pin);
      this.sessionToPin.delete(sessionId);
      this.deleteRecord(pin);
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureInitialized();
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

    if (path === '/status') {
      const sessionId = url.searchParams.get('sessionId') || '';
      const status = this.getStatus(sessionId);
      return Response.json(status);
    }

    if (path === '/manifest') {
      const body = await request.json() as { sessionId: string; manifest: any };
      const ok = this.setManifest(body.sessionId, body.manifest);
      return Response.json({ success: ok });
    }

    if (path === '/accept') {
      const body = await request.json() as { sessionId: string };
      const ok = this.setAccepted(body.sessionId);
      return Response.json({ success: ok });
    }

    return new Response('Not found', { status: 404 });
  }
}
