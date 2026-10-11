/**
 * Signaling Client Service
 * Communicates with Cloudflare Worker REST API and WebSocket Hub.
 */

import { CreateSessionResponse, JoinAcceptedPayload, JoinRejectedPayload, SignalingMessage, PeerRole } from '../types/session';

export interface SignalingClientCallbacks {
  onMessage: (message: SignalingMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Event | Error) => void;
}

export class SignalingService {
  private ws: WebSocket | null = null;
  private httpBaseUrl: string;
  private wsBaseUrl: string;

  constructor() {
    // In dev with Vite proxy, use relative path or configured env
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
    const res = await fetch(`${this.httpBaseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.message || `Failed to create session (${res.status})`);
    }

    return await res.json();
  }

  public async joinSession(pin: string): Promise<JoinAcceptedPayload> {
    const res = await fetch(`${this.httpBaseUrl}/api/sessions/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as JoinRejectedPayload;
      throw new Error(err.message || `Failed to join session with PIN ${pin}`);
    }

    return await res.json();
  }

  public connectWebSocket(
    sessionId: string,
    token: string,
    role: PeerRole,
    callbacks: SignalingClientCallbacks
  ): void {
    if (this.ws) {
      this.close();
    }

    const wsUrl = `${this.wsBaseUrl}/ws?sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}&role=${role}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      callbacks.onOpen?.();
    };

    this.ws.onmessage = (event) => {
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

    this.ws.onerror = (ev) => {
      callbacks.onError?.(ev);
    };
  }

  public sendMessage(type: SignalingMessage['type'], payload?: any, role: PeerRole = 'sender', sessionId: string = ''): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const packet: SignalingMessage = {
        type,
        sessionId,
        senderRole: role,
        payload,
        timestamp: Date.now(),
      };
      this.ws.send(JSON.stringify(packet));
    }
  }

  public close(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}
