/* Yachiyo Little Senior - native PDF virtual URL service worker */
'use strict';

const CACHE_NAME = 'yls-native-pdf-v1';
const PDF_PREFIX = '/__yls_native_pdf__/';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

function pdfHeaders(source, size, range) {
  const headers = new Headers();
  headers.set('content-type', 'application/pdf');
  headers.set('cache-control', 'no-store');
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');
  const disposition = source.headers.get('content-disposition') || 'inline; filename="document.pdf"';
  headers.set('content-disposition', disposition);
  const encodedName = source.headers.get('x-yls-pdf-name');
  if (encodedName) headers.set('x-yls-pdf-name', encodedName);
  if (range) {
    headers.set('content-range', `bytes ${range.start}-${range.end}/${size}`);
    headers.set('content-length', String(range.end - range.start + 1));
  } else {
    headers.set('content-length', String(size));
  }
  return headers;
}

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(value || '').trim());
  if (!match || size <= 0) return null;
  let start;
  let end;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Number(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (start >= size || start < 0) return { invalid: true };
    end = Math.min(size - 1, Math.max(start, end));
  }
  return { start, end };
}

async function handlePdfRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (!cached) {
    return new Response('PDF not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  const bytes = await cached.arrayBuffer();
  const size = bytes.byteLength;
  const range = parseRange(request.headers.get('range'), size);

  if (range && range.invalid) {
    return new Response(null, {
      status: 416,
      headers: {
        'content-range': `bytes */${size}`,
        'accept-ranges': 'bytes',
        'cache-control': 'no-store'
      }
    });
  }

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers: pdfHeaders(cached, size, null) });
  }

  if (range) {
    const body = bytes.slice(range.start, range.end + 1);
    return new Response(body, { status: 206, headers: pdfHeaders(cached, size, range) });
  }

  return new Response(bytes, { status: 200, headers: pdfHeaders(cached, size, null) });
}

self.addEventListener('fetch', event => {
  let url;
  try { url = new URL(event.request.url); } catch (_) { return; }
  if (url.origin !== self.location.origin || !url.pathname.startsWith(PDF_PREFIX)) return;
  if (event.request.method !== 'GET' && event.request.method !== 'HEAD') return;
  event.respondWith(handlePdfRequest(event.request));
});
