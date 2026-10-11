const WORKER_ORIGIN = 'https://sharepin-worker.ramasantoshreddydwarampudi.workers.dev';

export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const url = new URL(request.url);
  const targetUrl = `${WORKER_ORIGIN}/ws${url.search}`;
  return fetch(targetUrl, request);
}
