import { Env, PeerRole } from './types';
import { PinRegistryDO } from './pinRegistry';
import { SessionDO } from './session';
import { SlidingWindowRateLimiter } from './rateLimiter';

export { PinRegistryDO, SessionDO };

// Rate limiters:
// Join attempts: 10 per 60 seconds (prevents PIN brute forcing)
const joinLimiter = new SlidingWindowRateLimiter(10, 60 * 1000);
// Session creation: 25 per 10 minutes (prevents exhaustion abuse)
const createLimiter = new SlidingWindowRateLimiter(25, 10 * 60 * 1000);

// In-memory singletons for local dev/testing fallback
let localRegistry: PinRegistryDO | null = null;
const localSessions = new Map<string, SessionDO>();

function getLocalRegistry(): PinRegistryDO {
  if (!localRegistry) {
    localRegistry = new PinRegistryDO({} as any, {});
  }
  return localRegistry;
}

function getLocalSession(sessionId: string): SessionDO {
  let session = localSessions.get(sessionId);
  if (!session) {
    session = new SessionDO({} as any, {});
    localSessions.set(sessionId, session);
  }
  return session;
}

function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return addCorsHeaders(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    const clientIp = request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for') ||
      '127.0.0.1';

    // Health check
    if (url.pathname === '/api/health') {
      return addCorsHeaders(Response.json({
        status: 'healthy',
        timestamp: Date.now(),
        hasPinRegistry: Boolean(env.PIN_REGISTRY),
        hasSessionDO: Boolean(env.SESSION_DO),
      }));
    }

    // 1. Create Session
    if (url.pathname === '/api/sessions' && request.method === 'POST') {
      if (!createLimiter.isAllowed(clientIp)) {
        return addCorsHeaders(
          Response.json(
            { error: 'RATE_LIMITED', message: 'Too many sessions created. Please wait a few minutes.' },
            { status: 429 }
          )
        );
      }

      if (env.PIN_REGISTRY) {
        const id = env.PIN_REGISTRY.idFromName('global-pin-registry');
        const stub = env.PIN_REGISTRY.get(id);
        const res = await stub.fetch('http://registry/create', { method: 'POST' });
        return addCorsHeaders(res);
      } else {
        const res = getLocalRegistry().createSession();
        return addCorsHeaders(Response.json(res));
      }
    }

    // 2. Join Session
    if (url.pathname === '/api/sessions/join' && request.method === 'POST') {
      if (!joinLimiter.isAllowed(clientIp)) {
        const retryAfter = joinLimiter.getRetryAfterSeconds(clientIp);
        return addCorsHeaders(
          Response.json(
            {
              error: 'RATE_LIMITED',
              message: `Too many join attempts. Please wait ${retryAfter} seconds.`,
            },
            { status: 429 }
          )
        );
      }

      let body: { pin?: string };
      try {
        body = await request.json() as { pin?: string };
      } catch {
        return addCorsHeaders(Response.json({ error: 'INVALID_JSON' }, { status: 400 }));
      }

      const pin = body.pin?.trim();
      if (!pin || !/^[0-9]{5}$/.test(pin)) {
        return addCorsHeaders(
          Response.json(
            { error: 'INVALID_PIN', message: 'PIN must be exactly 5 digits.' },
            { status: 400 }
          )
        );
      }

      if (env.PIN_REGISTRY) {
        const id = env.PIN_REGISTRY.idFromName('global-pin-registry');
        const stub = env.PIN_REGISTRY.get(id);
        const res = await stub.fetch('http://registry/join', {
          method: 'POST',
          body: JSON.stringify({ pin }),
        });
        return addCorsHeaders(res);
      } else {
        const res = getLocalRegistry().joinSession(pin);
        return addCorsHeaders(Response.json(res));
      }
    }

    // 3. WebSocket Signaling Hub
    if (url.pathname === '/ws') {
      const sessionId = url.searchParams.get('sessionId');
      const token = url.searchParams.get('token');
      const role = url.searchParams.get('role') as PeerRole;

      if (!sessionId || !token || !role) {
        return new Response('Missing required parameters (sessionId, token, role)', { status: 400 });
      }

      // Validate token
      let isValidToken = false;
      if (env.PIN_REGISTRY) {
        const id = env.PIN_REGISTRY.idFromName('global-pin-registry');
        const stub = env.PIN_REGISTRY.get(id);
        const valRes = await stub.fetch('http://registry/validate', {
          method: 'POST',
          body: JSON.stringify({ sessionId, token, role }),
        });
        const valData = await valRes.json() as { valid: boolean };
        isValidToken = valData.valid;
      } else {
        isValidToken = getLocalRegistry().validateToken(sessionId, token, role);
      }

      if (!isValidToken) {
        return new Response('Unauthorized session token', { status: 401 });
      }

      // Forward to SessionDO
      if (env.SESSION_DO) {
        const sessionDoId = env.SESSION_DO.idFromName(sessionId);
        const sessionStub = env.SESSION_DO.get(sessionDoId);
        return sessionStub.fetch(request);
      } else {
        return getLocalSession(sessionId).fetch(request);
      }
    }

    return addCorsHeaders(new Response('Not Found', { status: 404 }));
  },
};
