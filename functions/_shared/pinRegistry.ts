export interface PinRecord {
  pin: string;
  sessionId: string;
  senderToken: string;
  receiverToken?: string;
  createdAt: number;
  expiresAt: number; // 3 minutes from creation
  isClaimed: boolean;
}

export class PinRegistry {
  private activePins = new Map<string, PinRecord>();
  private sessionToPin = new Map<string, string>();

  private generateRandomPin(): string | null {
    const MAX_ATTEMPTS = 50;
    const array = new Uint32Array(1);

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      crypto.getRandomValues(array);
      const randomVal = array[0]! % 100000;
      const candidatePin = randomVal.toString().padStart(5, '0');

      const existing = this.activePins.get(candidatePin);
      if (!existing || existing.expiresAt <= Date.now()) {
        return candidatePin;
      }
    }

    this.cleanExpired();
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
    const expiresAt = now + 180 * 1000; // 3-minute joining window

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

    if (record.isClaimed) {
      return {
        success: false,
        errorCode: 'ALREADY_PAIRED',
        message: 'This session has already been joined by another device.',
      };
    }

    record.isClaimed = true;
    record.receiverToken = crypto.randomUUID();

    return {
      success: true,
      sessionId: record.sessionId,
      receiverToken: record.receiverToken,
      expiresAt: record.expiresAt,
    };
  }

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
}

// Global registry instance
export const globalRegistry = new PinRegistry();
