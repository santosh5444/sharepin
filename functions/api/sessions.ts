const WORKER_ORIGIN = 'https://sharepin-worker.ramasantoshreddydwarampudi.workers.dev';

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  try {
    const res = await fetch(`${WORKER_ORIGIN}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': request.headers.get('cf-connecting-ip') || '',
      },
    });
    return res;
  } catch (err: any) {
    return Response.json({ error: 'WORKER_UNAVAILABLE', message: err.message }, { status: 502 });
  }
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
