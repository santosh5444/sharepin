import { PeerRole, SignalingPacket } from './types';

export class SessionDO {
  private senderWs: WebSocket | null = null;
  private receiverWs: WebSocket | null = null;
  private pendingForReceiver: SignalingPacket[] = [];
  private pendingForSender: SignalingPacket[] = [];

  constructor(_state: DurableObjectState, _env: any) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const role = url.searchParams.get('role') as PeerRole;
    if (role !== 'sender' && role !== 'receiver') {
      return new Response('Invalid role parameter', { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = (pair as any)[0] || (pair as any).client;
    const server = (pair as any)[1] || (pair as any).server;

    server.accept();

    if (role === 'sender') {
      if (this.senderWs) {
        try { this.senderWs.close(1000, 'Replaced by new sender connection'); } catch {}
      }
      this.senderWs = server;
      while (this.pendingForSender.length > 0) {
        const p = this.pendingForSender.shift()!;
        try { server.send(JSON.stringify(p)); } catch {}
      }
    } else {
      if (this.receiverWs) {
        try { this.receiverWs.close(1000, 'Replaced by new receiver connection'); } catch {}
      }
      this.receiverWs = server;
      while (this.pendingForReceiver.length > 0) {
        const p = this.pendingForReceiver.shift()!;
        try { server.send(JSON.stringify(p)); } catch {}
      }
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

    server.addEventListener('message', (event: MessageEvent) => {
      // 1. Binary payload forwarding (raw file chunks)
      if (typeof event.data !== 'string') {
        const targetRole: PeerRole = role === 'sender' ? 'receiver' : 'sender';
        const targetWs = targetRole === 'sender' ? this.senderWs : this.receiverWs;
        if (targetWs) {
          try {
            targetWs.send(event.data);
          } catch (err) {
            console.warn('Failed to forward binary chunk:', err);
          }
        }
        return;
      }

      // 2. JSON control messages
      try {
        const data = JSON.parse(event.data);
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
        if (this.senderWs === server) {
          this.senderWs = null;
          this.sendToPeer('receiver', {
            type: 'PEER_DISCONNECTED',
            senderRole: 'sender',
            timestamp: Date.now(),
          });
        }
      } else {
        if (this.receiverWs === server) {
          this.receiverWs = null;
          this.sendToPeer('sender', {
            type: 'PEER_DISCONNECTED',
            senderRole: 'receiver',
            timestamp: Date.now(),
          });
        }
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
    if (targetWs) {
      try {
        targetWs.send(JSON.stringify(packet));
        return;
      } catch (err) {
        console.warn('Failed to send to peer socket:', err);
      }
    }

    if (targetRole === 'sender') {
      this.pendingForSender.push(packet);
    } else {
      this.pendingForReceiver.push(packet);
    }
  }
}
