import { PeerRole, SignalingPacket } from './types';

export class SessionDO {
  private senderWs: WebSocket | null = null;
  private receiverWs: WebSocket | null = null;

  constructor(_state: DurableObjectState, _env: any) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const role = url.searchParams.get('role') as PeerRole;
    if (role !== 'sender' && role !== 'receiver') {
      return new Response('Invalid role parameter', { status: 400 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    if (role === 'sender') {
      if (this.senderWs) {
        try { this.senderWs.close(1000, 'Replaced by new sender connection'); } catch {}
      }
      this.senderWs = server;
    } else {
      if (this.receiverWs) {
        try { this.receiverWs.close(1000, 'Replaced by new receiver connection'); } catch {}
      }
      this.receiverWs = server;
    }

    // When both peers are connected, inform them so WebRTC negotiation can commence
    if (this.senderWs && this.receiverWs) {
      this.sendToPeer('sender', {
        type: 'PEER_CONNECTED',
        senderRole: 'receiver',
        timestamp: Date.now(),
      });
      this.sendToPeer('receiver', {
        type: 'PEER_CONNECTED',
        senderRole: 'sender',
        timestamp: Date.now(),
      });
    }

    server.addEventListener('message', (event) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : null;
        if (!data || !data.type) return;

        const packet: SignalingPacket = {
          type: data.type,
          senderRole: role,
          payload: data.payload,
          timestamp: Date.now(),
        };

        // Forward to opposing peer
        const targetRole: PeerRole = role === 'sender' ? 'receiver' : 'sender';
        this.sendToPeer(targetRole, packet);
      } catch (err) {
        console.error('Failed to parse signaling message:', err);
      }
    });

    const handleClose = () => {
      if (role === 'sender') {
        this.senderWs = null;
        this.sendToPeer('receiver', {
          type: 'PEER_DISCONNECTED',
          senderRole: 'sender',
          timestamp: Date.now(),
        });
      } else {
        this.receiverWs = null;
        this.sendToPeer('sender', {
          type: 'PEER_DISCONNECTED',
          senderRole: 'receiver',
          timestamp: Date.now(),
        });
      }
    };

    server.addEventListener('close', handleClose);
    server.addEventListener('error', handleClose);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private sendToPeer(targetRole: PeerRole, packet: SignalingPacket): void {
    const targetWs = targetRole === 'sender' ? this.senderWs : this.receiverWs;
    if (targetWs && targetWs.readyState === WebSocket.READY_STATE_OPEN) {
      try {
        targetWs.send(JSON.stringify(packet));
      } catch (err) {
        console.warn('Failed to send to peer socket:', err);
      }
    }
  }
}
