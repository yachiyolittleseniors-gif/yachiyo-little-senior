import assert from 'node:assert/strict';
import test from 'node:test';
import { readHeroBootstrapData } from '../netlify/functions/_hero-bootstrap-cache.mjs';

const KEY = 'content/hero.json';
const CACHE = 'cache/hero-bootstrap-v1.json';
function fixture({ data = [{ image: 'data:image/jpeg;base64,AAAA', version: 'v1' }], etag = 'etag1', cached = null } = {}) {
  const state = { data, etag, cached, calls: [], fallbackCalls: 0 };
  const store = {
    async getMetadata(key, options) {
      state.calls.push(['head', key]);
      assert.equal(options.consistency, 'strong');
      return state.data === null ? null : { etag: state.etag, metadata: {} };
    },
    async get(key, options) {
      state.calls.push(['get', key]);
      assert.equal(key, CACHE);
      assert.deepEqual(options, { type: 'json', consistency: 'strong' });
      return state.cached;
    },
    async getWithMetadata(key, options) {
      state.calls.push(['body', key]);
      assert.equal(key, KEY);
      assert.deepEqual(options, { type: 'json', consistency: 'strong' });
      return state.data === null ? null : { data: state.data, etag: state.etag };
    },
    async setJSON(key, value) {
      state.calls.push(['write', key]);
      assert.equal(key, CACHE, 'the actual photo must NEVER be overwritten');
      state.cached = value;
    }
  };
  const fallback = async (receivedStore, key) => {
    assert.equal(receivedStore, store);
    assert.equal(key, KEY);
    state.fallbackCalls++;
    return state.data;
  };
  return { state, store, fallback, read: () => readHeroBootstrapData(store, KEY, fallback) };
}
const snapshot = (etag = 'etag1', version = 'v1') => ({ schema: 1, etag, photo: { image: true, version } });

test('current cached version avoids reading or decoding the photo body', async () => {
  const f = fixture({ cached: snapshot() });
  assert.deepEqual(await f.read(), [{ image: true, version: 'v1' }]);
  assert.deepEqual(f.state.calls.map(x => x[0]).sort(), ['get', 'head']);
  assert.equal(f.state.fallbackCalls, 0);
});

test('first request warms only the small derived cache; subsequent request needs no photo body', async () => {
  const f = fixture();
  const imageBefore = JSON.stringify(f.state.data);
  assert.deepEqual(await f.read(), [{ image: true, version: 'v1' }]);
  assert.deepEqual(f.state.cached, snapshot());
  assert.ok(!JSON.stringify(f.state.cached).includes('base64'));
  assert.equal(JSON.stringify(f.state.data), imageBefore);
  f.state.calls = [];
  await f.read();
  assert.ok(!f.state.calls.some(x => x[0] === 'body' || x[0] === 'write'));
});

test('a changed authoritative ETag invalidates an old cached photo immediately', async () => {
  const f = fixture({ cached: snapshot(), etag: 'etag2', data: [{ image: 'new photo', version: 'v2' }] });
  assert.deepEqual(await f.read(), [{ image: true, version: 'v2' }]);
  assert.deepEqual(f.state.cached, snapshot('etag2', 'v2'));
});

test('a change between the HEAD and body read uses the body ETag, never the old one', async () => {
  const f = fixture();
  f.store.getWithMetadata = async () => ({ etag: 'etag2', data: [{ image: 'new photo', version: 'v2' }] });
  assert.deepEqual(await f.read(), [{ image: true, version: 'v2' }]);
  assert.equal(f.state.cached.etag, 'etag2');
});

test('a late old cache write cannot make the next request show an old image', async () => {
  const f = fixture({ etag: 'etag2', data: [{ image: 'new photo', version: 'v2' }] });
  await f.read();
  f.state.cached = snapshot();
  assert.deepEqual(await f.read(), [{ image: true, version: 'v2' }]);
});

test('deleted photo ignores a previously valid cache', async () => {
  const f = fixture({ data: null, cached: snapshot() });
  assert.equal(await f.read(), null);
  assert.ok(!f.state.calls.some(x => x[0] === 'body' || x[0] === 'write'));
});

test('deletion after the metadata check retains the empty result', async () => {
  const f = fixture();
  f.store.getWithMetadata = async () => null;
  assert.equal(await f.read(), null);
});

for (const data of [[], {}, [{ image: '' }], [{ image: null }, { image: 'do not pick a different photo', version: 'v2' }]]) {
  test('empty/malformed photo data retains the original first-photo selection: ' + JSON.stringify(data), async () => {
    const f = fixture({ data });
    assert.deepEqual(await f.read(), []);
    assert.equal(f.state.cached.photo, null);
    f.state.calls = [];
    assert.deepEqual(await f.read(), []);
    assert.ok(!f.state.calls.some(x => x[0] === 'body'));
  });
}

test('legacy updatedAt remains the version and an unversioned photo stays unversioned', async () => {
  for (const [data, version] of [
    [[{ image: 'legacy', updatedAt: '2026-10-05T00:00:00Z' }], '2026-10-05T00:00:00Z'],
    [[{ image: 'legacy' }], '']
  ]) {
    const f = fixture({ data });
    assert.deepEqual(await f.read(), [{ image: true, version }]);
  }
});

test('malformed or wrong-schema cache is rebuilt, not rendered', async () => {
  for (const cached of [{ schema: 2, etag: 'etag1', photo: { image: true, version: 'old' } },
    { schema: 1, etag: 'etag1', photo: { image: true } },
    { schema: 1, etag: 'etag1', photo: { image: 'not boolean', version: 'old' } }]) {
    const f = fixture({ cached });
    assert.deepEqual(await f.read(), [{ image: true, version: 'v1' }]);
    assert.deepEqual(f.state.cached, snapshot());
  }
});

test('cache read or write failure does not prevent a fresh photo', async () => {
  for (const method of ['get', 'setJSON']) {
    const f = fixture();
    f.store[method] = async () => { throw new Error('cache unavailable'); };
    assert.deepEqual(await f.read(), [{ image: true, version: 'v1' }]);
    assert.equal(f.state.fallbackCalls, 0);
  }
});

test('metadata/body failures or missing ETags retain the original fallback', async () => {
  for (const method of ['getMetadata', 'getWithMetadata']) {
    const f = fixture();
    f.store[method] = async () => { throw new Error('storage unavailable'); };
    assert.deepEqual(await f.read(), f.state.data);
    assert.equal(f.state.fallbackCalls, 1);
  }
  const f = fixture();
  f.store.getMetadata = async () => ({ metadata: {} });
  assert.deepEqual(await f.read(), f.state.data);
  assert.equal(f.state.fallbackCalls, 1);
});

test('other sections bypass the optimization entirely', async () => {
  const store = {};
  const expected = { unchanged: true };
  const result = await readHeroBootstrapData(store, 'content/news.json', async (s, key) => {
    assert.equal(s, store);
    assert.equal(key, 'content/news.json');
    return expected;
  });
  assert.equal(result, expected);
});
