const SOURCE_SHA = 'bb50949222daaaa8ef3ac2c6d8803e8d398e670a';
const PREVIEW_PREFIX = '/lidercalculator/preview/pr-484/app/';
const RAW_BASE = `https://raw.githubusercontent.com/deputat36/lider-bsk/${SOURCE_SHA}/crm/v4/`;

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2']
]);

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function extension(pathname) {
  const name = pathname.split('/').pop() || '';
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '.html';
}

function safeRelativePath(pathname) {
  const decoded = decodeURIComponent(pathname.slice(PREVIEW_PREFIX.length));
  const relative = decoded === '' || decoded.endsWith('/') ? `${decoded}index.html` : decoded;
  if (!relative || relative.startsWith('/') || relative.split('/').includes('..')) return null;
  return relative;
}

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith(PREVIEW_PREFIX)) {
    return;
  }

  event.respondWith((async () => {
    const relative = safeRelativePath(requestUrl.pathname);
    if (!relative) {
      return new Response('Bad preview path', { status: 400 });
    }

    const upstreamPath = relative.split('/').map(encodeURIComponent).join('/');
    const upstreamUrl = RAW_BASE + upstreamPath;
    const upstream = await fetch(upstreamUrl, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error'
    });

    if (!upstream.ok) {
      return new Response('Preview source unavailable', {
        status: upstream.status,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    const headers = new Headers();
    headers.set('Content-Type', MIME.get(extension(relative)) || 'application/octet-stream');
    headers.set('Cache-Control', 'no-store, max-age=0');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    if (relative === 'index.html') {
      headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }

    return new Response(upstream.body, {
      status: 200,
      statusText: 'OK',
      headers
    });
  })().catch((error) => new Response(
    `Preview proxy error: ${error && error.message ? error.message : 'unknown'}`,
    { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } }
  )));
});
