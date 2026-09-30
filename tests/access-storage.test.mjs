import test from 'node:test';
import assert from 'node:assert/strict';
import { getStore } from '@netlify/blobs';
import { limitedPasswordCheck } from '../netlify/functions/_access-rate-limit.mjs';

test('installed Blobs SDK sends conditional writes and exposes ETags for the limiter', async () => {
  const records = new Map(); let revision = 0, guesses = 0;
  const store = getStore({
    name: 'test-access-storage', siteID: 'test-site', token: 'test-token', consistency: 'strong',
    edgeURL: 'https://blobs.test', uncachedEdgeURL: 'https://blobs.test',
    fetch: async (url, options) => {
      assert.equal(new URL(url).hostname, 'blobs.test');
      const path = new URL(url).pathname, current = records.get(path);
      const headers = new Headers(options.headers);
      if (options.method.toUpperCase() === 'GET') return current
        ? new Response(JSON.stringify(current.data), { status: 200, headers: { etag: current.etag } })
        : new Response(null, { status: 404 });
      assert.equal(options.method.toUpperCase(), 'PUT');
      const match = headers.get('if-match'), onlyNew = headers.get('if-none-match');
      assert.ok(match || onlyNew, 'attempt counters must never use unconditional writes');
      if ((onlyNew === '*' && current) || (match && match !== current?.etag)) return new Response(null, { status: 412 });
      const etag = `"revision-${++revision}"`;
      records.set(path, { data: JSON.parse(options.body), etag });
      return new Response(null, { status: 200, headers: { etag } });
    },
  });
  const verify = async () => { guesses++; return false; };
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => limitedPasswordCheck({
    store, context: { ip: '192.0.2.99' }, role: 'board', version: '', verify,
  })));
  assert.equal(guesses, 10);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 9);
  assert.equal([...records.values()][0].data.count, 10);
});

test('an unconfirmed conditional write fails closed instead of checking a password', async () => {
  let guesses = 0;
  await assert.rejects(() => limitedPasswordCheck({
    store: { getWithMetadata: async () => null, setJSON: async () => ({ modified: true, etag: '' }) },
    context: { ip: '192.0.2.99' }, role: 'board', version: '', verify: async () => { guesses++; return true; },
  }));
  assert.equal(guesses, 0);
});
