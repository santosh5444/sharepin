import { globalRegistry } from '../../_shared/pinRegistry';

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  let body: { pin?: string };
  try {
    body = await request.json() as { pin?: string };
  } catch {
    return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const pin = body.pin?.trim();
  if (!pin || !/^[0-9]{5}$/.test(pin)) {
    return Response.json(
      { error: 'INVALID_PIN', message: 'PIN must be exactly 5 digits.' },
      { status: 400 }
    );
  }

  const result = globalRegistry.joinSession(pin);
  const status = result.success ? 200 : 400;

  return Response.json(result, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
