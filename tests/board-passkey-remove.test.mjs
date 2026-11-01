import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../board-passkey.js', import.meta.url), 'utf8');
const key = 'yachiyoBoardPasskeyCredentialID';
function storage() {
  const values = new Map();
  return {
    getItem(name) { return values.get(name) ?? null; },
    setItem(name, value) { values.set(name, String(value)); },
    removeItem(name) { values.delete(name); },
  };
}
function browser({ token = 'fresh-signed-token', status = 200, userAgent = 'iPhone', error = '削除を保存できませんでした。' } = {}) {
  const local = storage(), session = storage(), calls = [];
  local.setItem(key, 'saved-credential');
  session.setItem('yachiyoBoardPasskeyNeedsReregister', '1');
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  const sandbox = {
    window: { isSecureContext: true, PublicKeyCredential: class {} },
    navigator: { userAgent, credentials: { async get() {
      return { id: 'saved-credential', rawId: bytes, type: 'public-key',
        authenticatorAttachment: 'platform', getClientExtensionResults() { return {}; },
        response: { authenticatorData: bytes, clientDataJSON: bytes, signature: bytes, userHandle: null } };
    } } },
    localStorage: local, sessionStorage: session, atob, btoa, Uint8Array,
    async fetch(url, options) {
      assert.equal(url, '/.netlify/functions/passkey-auth');
      const body = JSON.parse(options.body);
      calls.push({ body, headers: options.headers, credentials: options.credentials });
      if (body.action === 'authentication-options') return Response.json({
        options: { challenge: 'AQID', allowCredentials: [{ id: 'AQID' }] }, ceremonyID: 'test-ceremony',
      });
      if (body.action === 'authentication-verify') return Response.json({ ok: true, credentialID: 'saved-credential', ...(token ? { token } : {}) });
      assert.equal(body.action, 'delete-credential');
      return Response.json(status === 200 ? { ok: true } : { error }, { status });
    },
  };
  vm.runInContext(source, vm.createContext(sandbox));
  return { api: sandbox.window.YLSPasskeys, local, session, calls };
}

test('passkey deletion sends the newly verified token and clears binding only after success', async () => {
  const f = browser();
  assert.equal((await f.api.remove()).ok, true);
  const deletion = f.calls.find(call => call.body.action === 'delete-credential');
  assert.equal(deletion.headers['x-access-password'], 'fresh-signed-token');
  assert.equal(deletion.credentials, 'same-origin');
  assert.equal(deletion.body.credentialID, 'saved-credential');
  assert.equal(f.local.getItem(key), null);
  assert.equal(f.session.getItem('yachiyoBoardPasskeyNeedsReregister'), null);
});

test('cookie authentication remains available when the verification response omits a token', async () => {
  const f = browser({ token: '' });
  assert.equal((await f.api.remove()).ok, true);
  const deletion = f.calls.find(call => call.body.action === 'delete-credential');
  assert.equal(deletion.credentials, 'same-origin');
  assert.equal(deletion.headers['x-access-password'], undefined);
});

for (const status of [403, 503]) {
  test(`Android HTTP ${status} deletion failure is not mistaken for a missing device passkey`, async () => {
    const f = browser({ status, userAgent: 'Android', error: 'passkey credential deletion failed' });
    await assert.rejects(f.api.remove(), error => error.status === status);
    assert.equal(f.local.getItem(key), 'saved-credential');
    assert.equal(f.session.getItem('yachiyoBoardPasskeyNeedsReregister'), '1');
  });
}
