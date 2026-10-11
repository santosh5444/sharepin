export type PeerRole = 'sender' | 'receiver';

export interface SignalingPacket {
  type: string;
  senderRole: PeerRole;
  payload?: any;
  timestamp: number;
}

export class SessionCoordinator {
  private sessions = new Map<string, { senderWs?: WebSocket; receiverWs?: WebSocket }>();

  public handleWebSocket(sessionId: string, role: PeerRole, clientWs: WebSocket, serverWs: WebSocket): void {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {};
      this.sessions.set(sessionId, session);
    }

    serverWs.accept();

    if (role === 'sender') {
      if (session.senderWs) {
        try { session.senderWs.close(1000, 'Replaced'); } catch {}
      }
      session.senderWs = serverWs;
    } else {
      if (session.receiverWs) {
        try { session.receiverWs.close(1000, 'Replaced'); } catch {}
      }
      session.receiverWs = serverWs;
    }

    // Both peers connected
    if (session.senderWs && session.receiverWs) {
      this.sendToPeer(session, 'sender', {
        type: 'PEER_CONNECTED',
        senderRole: 'receiver',
        timestamp: Date.now(),
      });
      this.sendToPeer(session, 'receiver', {
        type: 'PEER_CONNECTED',
        senderRole: 'sender',
        timestamp: Date.now(),
      });
    }

    serverWs.addEventListener('message', (event) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : null;
        if (!data || !data.type) return;

        const packet: SignalingPacket = {
          type: data.type,
          senderRole: role,
          payload: data.payload,
          timestamp: Date.now(),
        };

        const targetRole: PeerRole = role === 'sender' ? 'receiver' : 'sender';
        this.sendToPeer(session!, targetRole, packet);
      } catch (err) {
        console.warn('Failed to parse signaling message:', err);
      }
    });

    const handleClose = () => {
      if (role === 'sender') {
        session!.senderWs = undefined;
        this.sendToPeer(session!, 'receiver', {
          type: 'PEER_DISCONNECTED',
          senderRole: 'sender',
          timestamp: Date.now(),
        });
      } else {
        session!.receiverWs = undefined;
        this.sendToPeer(session!, 'sender', {
          type: 'PEER_DISCONNECTED',
          senderRole: 'receiver',
          timestamp: Date.now(),
        });
      }
      if (!session!.senderWs && !session!.receiverWs) {
        this.sessions.delete(sessionId);
      }
    };

    serverWs.addEventListener('close', handleClose);
    serverWs.addEventListener('error', handleClose);
  }

  private sendToPeer(session: { senderWs?: WebSocket; receiverWs?: WebSocket }, targetRole: PeerRole, packet: SignalingPacket): void {
    const target = targetRole === 'sender' ? session.senderWs : session.receiverWs;
    if (target) {
      try {
        target.send(JSON.stringify(packet));
      } catch {}
    }
  }
}

export const globalCoordinator = new SessionCoordinator();
