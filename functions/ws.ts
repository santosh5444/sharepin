import { globalCoordinator, PeerRole } from './_shared/session';
import { globalRegistry } from './_shared/pinRegistry';

export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const url = new URL(request.url);

  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const sessionId = url.searchParams.get('sessionId');
  const token = url.searchParams.get('token');
  const role = url.searchParams.get('role') as PeerRole;

  if (!sessionId || !token || !role) {
    return new Response('Missing parameters', { status: 400 });
  }

  // Validate token
  const isValid = globalRegistry.validateToken(sessionId, token, role);
  if (!isValid) {
    return new Response('Unauthorized session token', { status: 401 });
  }

  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  globalCoordinator.handleWebSocket(sessionId, role, client, server);

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
