/**
 * Signaling Client Service
 * Communicates with Cloudflare Worker REST API and WebSocket Hub.
 * Includes automatic local BroadcastChannel coordinator fallback when running Vite standalone.
 */

import { CreateSessionResponse, JoinAcceptedPayload, JoinRejectedPayload, SignalingMessage, PeerRole } from '../types/session';

export interface SignalingClientCallbacks {
  onMessage: (message: SignalingMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Event | Error) => void;
}

// Local mock storage key for standalone dev mode
const LOCAL_STORAGE_SESSIONS_KEY = 'sharepin_local_dev_sessions';

interface LocalSessionRecord {
  sessionId: string;
  pin: string;
  senderToken: string;
  receiverToken?: string;
  expiresAt: number;
}

export class SignalingService {
  private ws: WebSocket | null = null;
  private localChannel: BroadcastChannel | null = null;
  private httpBaseUrl: string;
  private wsBaseUrl: string;
  private isUsingLocalFallback = false;

  constructor() {
    const configuredHttp = import.meta.env.VITE_SIGNALING_HTTP_URL;
    const configuredWs = import.meta.env.VITE_SIGNALING_WS_URL;

    if (configuredHttp) {
      this.httpBaseUrl = configuredHttp;
    } else {
      this.httpBaseUrl = `${window.location.protocol}//${window.location.host}`;
    }

    if (configuredWs) {
      this.wsBaseUrl = configuredWs;
    } else {
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.wsBaseUrl = `${wsProto}//${window.location.host}`;
    }
  }

  public async createSession(): Promise<CreateSessionResponse> {
    try {
      const res = await fetch(`${this.httpBaseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const raw = (await res.json()) as any;
        return {
          ...raw,
          token: raw.token || raw.senderToken || '',
        };
      }

      // If server returned 404/500/502 (e.g. proxying to offline worker in local dev), fallback
      console.warn(`Signaling API returned ${res.status}. Falling back to browser-local dev coordinator.`);
      return this.createLocalSession();
    } catch (err) {
      console.warn('Could not reach signaling server, falling back to browser-local dev coordinator:', err);
      return this.createLocalSession();
    }
  }

  public async joinSession(pin: string): Promise<JoinAcceptedPayload> {
    // If session was created using local dev fallback
    if (this.isUsingLocalFallback || this.hasLocalSession(pin)) {
      return this.joinLocalSession(pin);
    }

    try {
      const res = await fetch(`${this.httpBaseUrl}/api/sessions/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      if (res.ok) {
        const raw = (await res.json()) as any;
        return {
          ...raw,
          token: raw.token || raw.receiverToken || '',
        };
      }

      // Check if local dev session exists
      if (this.hasLocalSession(pin)) {
        return this.joinLocalSession(pin);
      }

      const err = (await res.json().catch(() => ({}))) as JoinRejectedPayload;
      throw new Error(err.message || `Failed to join session with PIN ${pin}`);
    } catch (err: any) {
      if (this.hasLocalSession(pin)) {
        return this.joinLocalSession(pin);
      }
      throw new Error(err.message || 'Failed to join session');
    }
  }

  public connectWebSocket(
    sessionId: string,
    token: string,
    role: PeerRole,
    callbacks: SignalingClientCallbacks
  ): void {
    if (this.isUsingLocalFallback) {
      this.connectLocalBroadcast(sessionId, role, callbacks);
      return;
    }

    if (this.ws) {
      this.close();
    }

    try {
      const wsUrl = `${this.wsBaseUrl}/ws?sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}&role=${role}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        callbacks.onOpen?.();
      };

      this.ws.onmessage = (event) => {
        // If data is binary (ArrayBuffer/Blob), it is a file transfer packet, not JSON signaling
        if (typeof event.data !== 'string') {
          return;
        }
        try {
          const msg = JSON.parse(event.data) as SignalingMessage;
          callbacks.onMessage(msg);
        } catch (err) {
          console.warn('Failed to parse incoming signaling frame:', err);
        }
      };

      this.ws.onclose = () => {
        callbacks.onClose?.();
      };

      this.ws.onerror = (_ev) => {
        console.warn('WebSocket error, falling back to local BroadcastChannel coordinator');
        this.connectLocalBroadcast(sessionId, role, callbacks);
      };
    } catch {
      this.connectLocalBroadcast(sessionId, role, callbacks);
    }
  }

  public sendMessage(type: SignalingMessage['type'], payload?: any, role: PeerRole = 'sender', sessionId: string = ''): void {
    const packet: SignalingMessage = {
      type,
      sessionId,
      senderRole: role,
      payload,
      timestamp: Date.now(),
    };

    if (this.isUsingLocalFallback && this.localChannel) {
      this.localChannel.postMessage(packet);
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(packet));
    }
  }

  public close(): void {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (this.localChannel) {
      try { this.localChannel.close(); } catch {}
      this.localChannel = null;
    }
  }

  public getWebSocketTransport(): WebSocket | null {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.binaryType = 'arraybuffer';
      return this.ws;
    }
    return null;
  }

  // --- LOCAL DEV BROADCASTCHANNEL MESH (FOR OFFLINE / STANDALONE DEV) ---

  private createLocalSession(): CreateSessionResponse {
    this.isUsingLocalFallback = true;
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const pin = (array[0]! % 100000).toString().padStart(5, '0');
    const sessionId = crypto.randomUUID();
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 180 * 1000; // 3 minutes

    const record: LocalSessionRecord = {
      sessionId,
      pin,
      senderToken: token,
      expiresAt,
    };

    try {
      const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SESSIONS_KEY) || '{}');
      existing[pin] = record;
      localStorage.setItem(LOCAL_STORAGE_SESSIONS_KEY, JSON.stringify(existing));
    } catch {}

    return {
      success: true,
      sessionId,
      pin,
      token,
      createdAt: Date.now(),
      expiresAt,
    };
  }

  private hasLocalSession(pin: string): boolean {
    try {
      const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SESSIONS_KEY) || '{}');
      return Boolean(existing[pin] && existing[pin].expiresAt > Date.now());
    } catch {
      return false;
    }
  }

  private joinLocalSession(pin: string): JoinAcceptedPayload {
    this.isUsingLocalFallback = true;
    try {
      const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SESSIONS_KEY) || '{}');
      const record: LocalSessionRecord | undefined = existing[pin];

      if (!record) {
        throw new Error('No active session found for this PIN.');
      }
      if (record.expiresAt <= Date.now()) {
        throw new Error('This PIN has expired (3-minute window has elapsed).');
      }

      const receiverToken = crypto.randomUUID();
      record.receiverToken = receiverToken;
      localStorage.setItem(LOCAL_STORAGE_SESSIONS_KEY, JSON.stringify(existing));

      return {
        sessionId: record.sessionId,
        token: receiverToken,
        createdAt: record.expiresAt - 180 * 1000,
        expiresAt: record.expiresAt,
      };
    } catch (err: any) {
      throw new Error(err.message || 'Failed to join local session');
    }
  }

  private connectLocalBroadcast(
    sessionId: string,
    role: PeerRole,
    callbacks: SignalingClientCallbacks
  ): void {
    this.isUsingLocalFallback = true;
    if (this.localChannel) {
      this.localChannel.close();
    }

    this.localChannel = new BroadcastChannel(`sharepin_channel_${sessionId}`);
    callbacks.onOpen?.();

    this.localChannel.onmessage = (event) => {
      const msg = event.data as SignalingMessage;
      // Filter out our own messages
      if (msg.senderRole !== role) {
        callbacks.onMessage(msg);
      }
    };

    // When receiver joins on local channel, trigger PEER_CONNECTED immediately
    setTimeout(() => {
      if (role === 'receiver') {
        this.sendMessage('PEER_CONNECTED', null, 'receiver', sessionId);
      }
    }, 100);
  }
}
