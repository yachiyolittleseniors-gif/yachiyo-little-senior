import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { registerHooks } from 'node:module';

// Only persistence is isolated. Authentication option generation and signature
// verification use the installed SimpleWebAuthn implementation, not a success mock.
const blobs = new Map(), revisions = new Map();
const clone = value => structuredClone(value);
const etag = key => `"${revisions.get(key) || 0}"`;
const store = {
  async get(key) { return clone(blobs.get(key) ?? null); },
  async getWithMetadata(key) {
    return blobs.has(key) ? { data: clone(blobs.get(key)), etag: etag(key), metadata: {} } : null;
  },
  async setJSON(key, value, condition = {}) {
    if (condition.onlyIfNew && blobs.has(key)) return { modified: false };
    if (condition.onlyIfMatch && (!blobs.has(key) || condition.onlyIfMatch !== etag(key))) {
      return { modified: false };
    }
    blobs.set(key, clone(value));
    revisions.set(key, (revisions.get(key) || 0) + 1);
    return { modified: true, etag: etag(key) };
  },
  async delete(key) {
    blobs.delete(key);
    revisions.set(key, (revisions.get(key) || 0) + 1);
  },
};
globalThis.__passkeyCryptoStore = store;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@netlify/blobs') return {
    url: 'data:text/javascript,export function getStore(){return globalThis.__passkeyCryptoStore}',
    shortCircuit: true,
  };
  return next(specifier, context);
} });

process.env.ADMIN_PASSWORD = 'synthetic-test-session-signing-secret';
delete process.env.PASSKEY_ORIGIN;
delete process.env.PASSKEY_RP_ID;
const handler = (await import('../netlify/functions/passkey-auth.mjs')).default;
const { boardSessionTokenIsValid } = await import('../netlify/functions/_board-session.mjs');
const registryKey = 'auth/board-passkeys.json';
const settingsKey = 'content/access-settings.json';
const origin = 'https://example.test';
const sha256 = value => createHash('sha256').update(value).digest();

function request(body) {
  return new Request(`${origin}/.netlify/functions/passkey-auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}

function syntheticPasskey() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  // CBOR COSE EC2 key: { 1: 2, 3: -7, -1: 1, -2: x, -3: y }.
  const cose = Buffer.concat([
    Buffer.from('a5010203262001215820', 'hex'), Buffer.from(jwk.x, 'base64url'),
    Buffer.from('225820', 'hex'), Buffer.from(jwk.y, 'base64url'),
  ]);
  return {
    privateKey,
    credential: {
      id: randomBytes(32).toString('base64url'),
      publicKey: cose.toString('base64url'),
      counter: 0,
      transports: ['internal', 'hybrid'],
      deviceType: 'multiDevice',
      backedUp: true,
      label: '既存のテスト端末',
      createdAt: '2026-10-26T00:00:00.000Z',
    },
  };
}

function seed(authVersion) {
  blobs.clear(); revisions.clear();
  const passkey = syntheticPasskey();
  const untouched = { ...syntheticPasskey().credential, label: '別の既存端末' };
  blobs.set(settingsKey, {
    authVersion,
    updatedAt: '2026-10-25T00:00:00.000Z',
    salt: 'synthetic-legacy-settings', hash: 'unused-by-passkey-authentication',
  });
  // Existing production records have no registry authVersion, including records
  // created after a past password reset introduced a nonempty settings version.
  blobs.set(registryKey, { credentials: [passkey.credential, untouched], preservedMetadata: 'keep' });
  return { ...passkey, untouched, originalSettings: clone(blobs.get(settingsKey)) };
}

function assertion(credential, privateKey, challenge, { tamper = false } = {}) {
  const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }));
  const counter = Buffer.alloc(4); counter.writeUInt32BE(1);
  // User presence + user verification + backup eligibility + backed-up state.
  const authenticatorData = Buffer.concat([sha256('example.test'), Buffer.from([0x1d]), counter]);
  const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), privateKey);
  if (tamper) signature[signature.length - 1] ^= 1;
  return {
    id: credential.id, rawId: credential.id, type: 'public-key',
    authenticatorAttachment: 'platform', clientExtensionResults: {},
    response: {
      clientDataJSON: clientDataJSON.toString('base64url'),
      authenticatorData: authenticatorData.toString('base64url'),
      signature: signature.toString('base64url'), userHandle: null,
    },
  };
}

for (const authVersion of ['', 'password-version-from-before-this-deployment']) {
  test(`real ES256 authentication preserves a legacy passkey with ${authVersion ? 'an existing' : 'no'} password version`, async () => {
    const { credential, privateKey, untouched, originalSettings } = seed(authVersion);
    const start = await handler(request({ action: 'authentication-options', credentialID: credential.id }));
    assert.equal(start.status, 200);
    const { options, ceremonyID } = await start.json();
    assert.equal(options.rpId, 'example.test');
    assert.deepEqual(options.allowCredentials.map(item => item.id), [credential.id]);

    const verified = await handler(request({
      action: 'authentication-verify', ceremonyID,
      credential: assertion(credential, privateKey, options.challenge),
    }));
    assert.equal(verified.status, 200);
    const result = await verified.json();
    assert.equal(result.ok, true);
    assert.equal(result.credentialID, credential.id);
    assert.equal(await boardSessionTokenIsValid(result.token), true);
    assert.match(verified.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);

    const saved = blobs.get(registryKey);
    assert.equal(saved.authVersion, authVersion);
    assert.equal(saved.preservedMetadata, 'keep');
    assert.equal(saved.credentials.length, 2);
    assert.deepEqual(saved.credentials.find(item => item.id === untouched.id), untouched);
    const used = saved.credentials.find(item => item.id === credential.id);
    const { counter, lastUsedAt, ...retained } = used;
    const { counter: previousCounter, ...original } = credential;
    assert.equal(counter, 1);
    assert.ok(Number.isFinite(Date.parse(lastUsedAt)));
    assert.deepEqual(retained, original, 'IDs, public keys, transports and registration metadata stay unchanged');
    assert.deepEqual(blobs.get(settingsKey), originalSettings, 'deployment must not rotate passwords or sessions');
  });
}

test('real ES256 verification rejects a tampered signature without modifying existing credentials', async () => {
  const { credential, privateKey } = seed('pre-existing-password-version');
  const start = await handler(request({ action: 'authentication-options', credentialID: credential.id }));
  assert.equal(start.status, 200);
  const { options, ceremonyID } = await start.json();
  const before = clone(blobs.get(registryKey));
  const verified = await handler(request({
    action: 'authentication-verify', ceremonyID,
    credential: assertion(credential, privateKey, options.challenge, { tamper: true }),
  }));
  assert.equal(verified.status, 401);
  assert.equal((await verified.json()).token, undefined);
  assert.equal(verified.headers.get('set-cookie'), null);
  assert.deepEqual(blobs.get(registryKey), before);
});
