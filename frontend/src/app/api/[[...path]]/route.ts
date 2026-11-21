import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ path?: string[] }> };
const BACKEND_PROXY_SECRET_HEADER = 'x-dexbotx-proxy-secret';
export const MAX_PROXY_BODY_BYTES = 2 * 1024 * 1024 + 65536;

function getBackendUrl(): URL {
  const value = (process.env.BACKEND_URL ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : '')).trim();
  if (!value) throw new Error('BACKEND_URL must be configured for the frontend API proxy');

  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('BACKEND_URL must be an HTTP(S) URL without embedded credentials');
  }

  const isLocalBackend = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  const isComposeBackend = url.hostname === 'api' && url.port === '4000';
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:' && !isLocalBackend && !isComposeBackend) {
    throw new Error('BACKEND_URL must use HTTPS in production');
  }

  return url;
}

async function proxyRequest(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const { path = [] } = await params;
  const backendUrl = getBackendUrl();
  const apiPath = path.map((segment) => encodeURIComponent(segment)).join('/');
  const basePath = backendUrl.pathname === '/' ? '' : backendUrl.pathname.replace(/\/+$/, '');
  const target = new URL(`${basePath}/${apiPath}${request.nextUrl.search}`, backendUrl.origin);
  const headers = new Headers(request.headers);
  headers.delete('x-dexbotx-client-ip');
  const forwardedIp = request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwardedIp?.trim()) headers.set('x-dexbotx-client-ip', forwardedIp.trim());
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');
  headers.delete('accept-encoding');
  headers.delete('transfer-encoding');
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.BACKEND_PROXY_SECRET;
    if (!secret || secret.length < 32) {
      return Response.json({ statusCode: 500, message: 'API proxy is not configured' }, { status: 500 });
    }
    headers.set(BACKEND_PROXY_SECRET_HEADER, secret);
  } else {
    headers.delete(BACKEND_PROXY_SECRET_HEADER);
  }

  const method = request.method.toUpperCase();
  let body: ArrayBuffer | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    if (Number(request.headers.get('content-length') ?? 0) > MAX_PROXY_BODY_BYTES) {
      return Response.json({ statusCode: 413, message: 'Payload Too Large' }, { status: 413 });
    }
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_PROXY_BODY_BYTES) {
      return Response.json({ statusCode: 413, message: 'Payload Too Large' }, { status: 413 });
    }
  }
  let response: Response;
  try {
    response = await fetch(target, {
      method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
      ...(apiPath === 'events/guilds' ? {} : { signal: AbortSignal.timeout(15_000) }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return Response.json(
        { statusCode: 504, message: 'The backend request timed out. Please try again.' },
        { status: 504 },
      );
    }
    throw error;
  }
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');

  const location = responseHeaders.get('location');
  if (location) {
    const redirectUrl = new URL(location, backendUrl);
    if (redirectUrl.origin === backendUrl.origin) {
      responseHeaders.set('location', `${request.nextUrl.origin}${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const HEAD = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
