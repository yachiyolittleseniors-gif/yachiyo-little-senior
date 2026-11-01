import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';

// Exercise the real handler, session signatures, version checks, and CAS writes.
// Hardware ceremonies use synthetic verifier responses; the separate crypto
// compatibility suite verifies actual P-256 assertions with SimpleWebAuthn.
const records = new Map(), revisions = new Map();
const registryKey = 'auth/board-passkeys.json';
const settingsKey = 'content/access-settings.json';
const password = 'synthetic-team-password';
const origin = 'https://example.test';
const context = { ip: '192.0.2.88' };
let beforeWrite, authenticate, register, verifyCalls, registrationCalls, registrationOptions;
const clone = value => structuredClone(value);
const etag = key => `"${revisions.get(key) || 0}"`;
function replace(key, value) {
  if (value === null) records.delete(key); else records.set(key, clone(value));
  revisions.set(key, (revisions.get(key) || 0) + 1);
}
globalThis.__passkeyCompatibilityStore = {
  async get(key) { return clone(records.get(key) ?? null); },
  async getWithMetadata(key) {
    return records.has(key) ? { data: clone(records.get(key)), etag: etag(key), metadata: {} } : null;
  },
  async setJSON(key, value, conditions = {}) {
    if (beforeWrite) await beforeWrite(key, value, conditions);
    if ((conditions.onlyIfNew && records.has(key)) ||
      (conditions.onlyIfMatch && (!records.has(key) || conditions.onlyIfMatch !== etag(key)))) {
      return { modified: false, etag: etag(key) };
    }
    replace(key, value);
    return { modified: true, etag: etag(key) };
  },
  async delete(key) { replace(key, null); },
  async list() { return { blobs: [] }; },
};
globalThis.__passkeyCompatibilityGenerateRegistration = options => {
  registrationOptions = options;
  return { ...options, challenge: 'synthetic-registration-challenge' };
};
globalThis.__passkeyCompatibilityAuthenticate = options => {
  verifyCalls.push(options);
  assert.equal(options.requireUserVerification, true);
  assert.equal(options.expectedOrigin, origin);
  assert.equal(options.expectedRPID, 'example.test');
  return authenticate(options);
};
globalThis.__passkeyCompatibilityRegister = options => {
  registrationCalls += 1;
  assert.equal(options.requireUserVerification, true);
  return register(options);
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@netlify/blobs') return {
    url: 'data:text/javascript,export function getStore(){return globalThis.__passkeyCompatibilityStore}', shortCircuit: true,
  };
  if (specifier === '@simplewebauthn/server') return {
    url: 'data:text/javascript,' + encodeURIComponent(`
      export async function generateAuthenticationOptions(o){return {...o,challenge:'synthetic-authentication-challenge'};}
      export async function generateRegistrationOptions(o){return globalThis.__passkeyCompatibilityGenerateRegistration(o);}
      export async function verifyAuthenticationResponse(o){return globalThis.__passkeyCompatibilityAuthenticate(o);}
      export async function verifyRegistrationResponse(o){return globalThis.__passkeyCompatibilityRegister(o);}
    `), shortCircuit: true,
  };
  return next(specifier, context);
} });
process.env.ADMIN_PASSWORD = 'synthetic-signing-secret';
const board = await import('../netlify/functions/_board-session.mjs');
const handle = (await import('../netlify/functions/passkey-auth.mjs')).default;
function credential(index) {
  return { id: `legacy-${index}`, publicKey: Buffer.from([1, 2, index % 255]).toString('base64url'),
    counter: index + 1, transports: ['internal'], label: `synthetic-device-${index}`,
    createdAt: '2026-09-01T00:00:00.000Z' };
}
function registered(id = 'new-credential') {
  return { verified: true, registrationInfo: {
    credential: { id, publicKey: new Uint8Array([4, 5, 6]), counter: 0, transports: ['internal'] },
    credentialDeviceType: 'multiDevice', credentialBackedUp: true,
  } };
}
function seed({ version = '', legacy = true, fenced = false, count = 2 } = {}) {
  records.clear(); revisions.clear(); beforeWrite = null; verifyCalls = [];
  registrationCalls = 0; registrationOptions = null;
  authenticate = options => ({ verified: true, authenticationInfo: { newCounter: options.credential.counter + 1 } });
  register = () => registered();
  replace(settingsKey, { salt: 'synthetic-salt',
    hash: createHash('sha256').update(`synthetic-salt:${password}`).digest('hex'),
    ...(version ? { authVersion: version } : {}),
    ...(fenced ? { passkeyVersionRequired: true } : {}),
    updatedAt: '2026-10-20T00:00:00.000Z',
  });
  const credentials = Array.from({ length: count }, (_, index) => credential(index));
  replace(registryKey, { credentials, migrationNote: 'preserve existing metadata', ...(legacy ? {} : { authVersion: version }) });
  return clone(credentials);
}
const post = (action, data = {}, headers = {}) => new Request(`${origin}/.netlify/functions/passkey-auth`, {
  method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers },
  body: JSON.stringify({ action, ...data }),
});
async function login(id = 'legacy-0') {
  const start = await handle(post('authentication-options', { credentialID: id }), context);
  assert.equal(start.status, 200);
  const { ceremonyID } = await start.json();
  return handle(post('authentication-verify', { ceremonyID, credential: { id } }), context);
}
const idsAndKeys = values => values.map(({ id, publicKey }) => ({ id, publicKey }));

for (const version of ['', 'already-set-before-deployment']) {
  test(`existing unversioned keys keep their IDs and public keys at deployment (${version || 'legacy settings'})`, async () => {
    const original = seed({ version });
    const start = await handle(post('authentication-options', { credentialID: original[0].id }), context);
    assert.equal(start.status, 200);
    assert.deepEqual(records.get(registryKey).credentials, original, 'adoption preserves every credential field');
    assert.equal(records.get(registryKey).migrationNote, 'preserve existing metadata');
    assert.equal(records.get(registryKey).authVersion, version);
    const { ceremonyID } = await start.json();
    const response = await handle(post('authentication-verify', { ceremonyID, credential: { id: original[0].id } }), context);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.credentialID, original[0].id);
    assert.equal(await board.boardSessionTokenIsValid(result.token), true);
    assert.equal(registrationCalls, 0, 'a deployment does not require a new registration');
    assert.deepEqual(idsAndKeys(records.get(registryKey).credentials), idsAndKeys(original));
    assert.equal(verifyCalls[0].credential.id, original[0].id);
    assert.deepEqual(Buffer.from(verifyCalls[0].credential.publicKey), Buffer.from(original[0].publicKey, 'base64url'));
  });
}

test('a future explicit password reset cannot re-adopt an unversioned registry', async () => {
  const original = seed({ version: 'after-reset', fenced: true });
  const response = await handle(post('authentication-options'), context);
  assert.equal(response.status, 404);
  assert.deepEqual(records.get(registryKey).credentials, original);
  assert.equal(verifyCalls.length, 0);
});

test('an explicitly bound empty version is never mistaken for an unversioned legacy registry', async () => {
  seed({ version: 'new-version', legacy: false });
  replace(registryKey, { ...records.get(registryKey), authVersion: '' });
  assert.equal((await handle(post('authentication-options'), context)).status, 404);
});

for (const version of ['', 'already-set-before-deployment']) {
  test(`an unversioned in-flight challenge asks for one retry without losing existing keys (${version || 'legacy settings'})`, async () => {
    const original = seed({ version });
    const ceremonyID = 'A'.repeat(32);
    replace(`auth/board-passkey-challenge/${ceremonyID}.json`, {
      type: 'authentication', challenge: 'legacy-challenge', origin, rpID: 'example.test',
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    const response = await handle(post('authentication-verify', { ceremonyID, credential: { id: 'legacy-0' } }), context);
    assert.equal(response.status, 400);
    assert.equal(verifyCalls.length, 0, 'a challenge without a password version cannot authorize a session');
    assert.deepEqual(idsAndKeys(records.get(registryKey).credentials), idsAndKeys(original));
    const retried = await login();
    assert.equal(retried.status, 200);
    assert.equal(await board.boardSessionTokenIsValid((await retried.json()).token), true);
    assert.equal(registrationCalls, 0, 'retrying login does not require re-registering the passkey');
  });
}

for (const mode of ['cookie', 'token-header', 'password']) {
  test(`normal ${mode} registration and deletion preserve other members' passkeys`, async () => {
    const original = seed({ version: 'current-version', legacy: false });
    const token = await board.createBoardSessionToken();
    const headers = mode === 'cookie' ? { cookie: board.boardSessionCookie(token).split(';')[0] }
      : { 'x-access-password': mode === 'password' ? password : token };
    const optionsResponse = await handle(post('registration-options', {}, headers), context);
    assert.equal(optionsResponse.status, 200);
    assert.equal(registrationOptions.rpID, 'example.test');
    assert.equal(Buffer.from(registrationOptions.userID).toString(), 'yls-team-board-v2');
    const { ceremonyID } = await optionsResponse.json();
    const added = await handle(post('registration-verify', { ceremonyID, credential: { id: 'new-credential' } }, headers), context);
    assert.equal(added.status, 200);
    assert.equal((await added.json()).credentialID, 'new-credential');
    assert.equal(records.get(registryKey).credentials.length, 3);
    assert.deepEqual(idsAndKeys(records.get(registryKey).credentials.filter(item => item.id !== 'new-credential')), idsAndKeys(original));
    assert.equal((await handle(post('delete-credential', { credentialID: 'new-credential' }, headers), context)).status, 200);
    assert.deepEqual(records.get(registryKey).credentials, original);
  });
}

test('a registry filled during registration rejects the new key without evicting existing keys', async () => {
  seed({ legacy: false, count: 4999 });
  const headers = { 'x-access-password': password };
  const start = await handle(post('registration-options', {}, headers), context);
  assert.equal(start.status, 200);
  assert.equal(registrationOptions.excludeCredentials.length, 64);
  const { ceremonyID } = await start.json();
  register = () => {
    replace(registryKey, { ...records.get(registryKey), credentials: [...records.get(registryKey).credentials, credential(4999)] });
    return registered();
  };
  const response = await handle(post('registration-verify', { ceremonyID, credential: { id: 'new-credential' } }, headers), context);
  assert.equal(response.status, 409);
  assert.equal(records.get(registryKey).credentials.length, 5000);
  assert.equal(records.get(registryKey).credentials.some(item => item.id === 'new-credential'), false);
});

test('a concurrent registration is retained when authentication updates a counter', async () => {
  seed({ legacy: false });
  beforeWrite = (key, value) => {
    if (key !== registryKey || !value.credentials.some(item => item.lastUsedAt)) return;
    beforeWrite = null;
    replace(registryKey, { ...records.get(registryKey), credentials: [...records.get(registryKey).credentials, credential(99)] });
  };
  const response = await login();
  assert.equal(response.status, 200);
  assert.equal(records.get(registryKey).credentials.some(item => item.id === 'legacy-99'), true);
  assert.equal(records.get(registryKey).credentials.find(item => item.id === 'legacy-0').counter, 2);
});

test('deleting one key does not overwrite a concurrent new registration', async () => {
  seed({ legacy: false });
  beforeWrite = key => {
    if (key !== registryKey) return;
    beforeWrite = null;
    replace(registryKey, { ...records.get(registryKey), credentials: [...records.get(registryKey).credentials, credential(99)] });
  };
  const response = await handle(post('delete-credential', { credentialID: 'legacy-0' }, { 'x-access-password': password }), context);
  assert.equal(response.status, 200);
  assert.deepEqual(records.get(registryKey).credentials.map(item => item.id).sort(), ['legacy-1', 'legacy-99']);
});

test('a reset during legacy adoption cannot recreate the deleted registry', async () => {
  seed({ version: 'before-reset' });
  beforeWrite = key => {
    if (key !== registryKey) return;
    beforeWrite = null;
    replace(settingsKey, { ...records.get(settingsKey), authVersion: 'after-reset', passkeyVersionRequired: true });
    replace(registryKey, null);
  };
  const response = await handle(post('authentication-options'), context);
  assert.ok([400, 401, 404, 409].includes(response.status));
  assert.equal(records.has(registryKey), false);
});
