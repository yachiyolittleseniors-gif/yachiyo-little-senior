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

const setupSource = readFileSync(new URL('../board-passkey-setup.js', import.meta.url), 'utf8');
async function setupBrowser() {
  const elements = new Map(), local = storage(), session = storage();
  function element() {
    const classes = new Set();
    return { hidden: false, disabled: false, style: {}, handlers: {},
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle(x, on) { on ? classes.add(x) : classes.delete(x); } },
      setAttribute() {}, addEventListener(name, fn) { this.handlers[name] = fn; },
      insertAdjacentElement(_, el) { elements.set(el.id, el); },
    };
  }
  for (const id of ['Panel', 'Summary', 'Chevron', 'Button', 'Title', 'Text']) elements.set('passkeySetup' + id, element());
  local.setItem('yachiyoBoardPasskeyRegistered', '1');
  session.setItem('yachiyoAttendancePass', 'valid-session');
  let registrations = 0, removals = 0;
  const sandbox = {
    window: { boardAccessReady: Promise.resolve(true), YLSPasskeys: {
      supported: () => true,
      async bindExisting() { throw Object.assign(new Error('No credential'), { name: 'NotAllowedError' }); },
      async register(token) { assert.equal(token, 'valid-session'); registrations++; local.setItem(key, 'new-device-key'); },
      async remove() { removals++; },
    } },
    document: { getElementById: id => elements.get(id), createElement: element },
    navigator: { platform: 'Android' }, localStorage: local, sessionStorage: session,
    confirm: () => true, alert: message => assert.fail(message),
  };
  await vm.runInNewContext(setupSource, sandbox);
  return { elements, local, session, counts: () => ({ registrations, removals }) };
}
test('missing Android passkey can leave reconfirmation and explicitly register again', async () => {
  const f = await setupBrowser();
  const button = f.elements.get('passkeySetupButton');
  const recovery = f.elements.get('passkeySetupRecoverButton');
  assert.equal(recovery.hidden, false);
  await button.handlers.click();
  assert.equal(f.local.getItem('yachiyoBoardPasskeyRegistered'), '1', 'cancellation alone does not erase registration');
  assert.equal(button.disabled, false);
  assert.equal(recovery.disabled, false);
  assert.match(f.elements.get('passkeySetupText').textContent, /登録し直して/);
  recovery.handlers.click();
  assert.equal(f.local.getItem('yachiyoBoardPasskeyRegistered'), null);
  assert.equal(button.textContent, 'この端末に登録');
  await button.handlers.click();
  assert.deepEqual(f.counts(), { registrations: 1, removals: 0 });
  assert.equal(f.local.getItem('yachiyoBoardPasskeyRegistered'), '1');
  assert.equal(recovery.hidden, true);
  assert.equal(f.elements.get('passkeySetupTitle').textContent, '生体認証を登録済み');
});
