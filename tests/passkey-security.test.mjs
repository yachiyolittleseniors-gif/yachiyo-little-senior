import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// The store and WebAuthn dependency are isolated. These tests exercise authorization,
// revocation and session signatures; authenticator cryptography is not mocked as success.
const blobs = new Map();
let writes = 0;
globalThis.__passkeySecurityStore = {
  async get(key) { return structuredClone(blobs.get(key) ?? null); },
  async setJSON(key, value) { writes++; blobs.set(key, structuredClone(value)); },
  async delete(key) { writes++; blobs.delete(key); },
  async list() { return { blobs: [] }; },
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@netlify/blobs') return {
    url: 'data:text/javascript,export function getStore(){return globalThis.__passkeySecurityStore}', shortCircuit: true,
  };
  if (specifier === '@simplewebauthn/server') return {
    url: 'data:text/javascript,' + encodeURIComponent(`
      const unexpected = () => { throw new Error('Unexpected WebAuthn verification'); };
      export const generateAuthenticationOptions = unexpected;
      export const generateRegistrationOptions = unexpected;
      export const verifyAuthenticationResponse = unexpected;
      export const verifyRegistrationResponse = unexpected;
    `), shortCircuit: true,
  };
  return next(specifier, context);
}});

process.env.ADMIN_PASSWORD = 'test-only-admin-password';
const board = await import('../netlify/functions/_board-session.mjs');
const coach = await import('../netlify/functions/_coach-session.mjs');
const admin = await import('../netlify/functions/_admin-session.mjs');
const boardPasskeys = (await import('../netlify/functions/passkey-auth.mjs')).default;
const coachPasskeys = (await import('../netlify/functions/operator-passkey-auth.mjs')).default;
const coachAttendance = (await import('../netlify/functions/coach-attendance-data.mjs')).default;
const cookieValue = value => value.split(';')[0];
const request = (body, headers = {}) => new Request('https://example.test/.netlify/functions/passkey-auth', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.test', ...headers },
  body: JSON.stringify(body),
});
const roles = [
  { name: 'team', handler: boardPasskeys, key: 'auth/board-passkeys.json', header: 'x-access-password',
    create: board.createBoardSessionToken, valid: board.boardSessionTokenIsValid,
    cookie: board.boardSessionCookie, sessionValid: board.boardSessionIsValid, cookieName: 'yls_board_session' },
  { name: 'coach', handler: coachPasskeys, key: 'auth/operator-passkeys.json', header: 'x-coach-password',
    create: coach.createCoachSessionToken, valid: coach.coachSessionTokenIsValid,
    cookie: coach.coachSessionCookie, sessionValid: coach.coachSessionIsValid, cookieName: 'yls_coach_session' },
];
function seed(role) {
  blobs.clear(); writes = 0;
  blobs.set(role.key, { credentials: [{ id: 'test-credential' }, { id: 'keep-credential' }] });
}
for (const role of roles) {
  test(`${role.name}: anonymous registration and deletion cannot change stored passkeys`, async () => {
    seed(role);
    for (const action of ['registration-options', 'registration-verify', 'delete-credential']) {
      const result = await role.handler(request({ action, credentialID: 'test-credential' }));
      assert.equal(result.status, 401, action);
    }
    assert.equal(writes, 0);
    assert.equal(blobs.get(role.key).credentials.length, 2);
  });
  test(`${role.name}: forged, expired and wrong-role sessions cannot delete passkeys`, async () => {
    const token = await role.create();
    const other = await roles.find(item => item !== role).create();
    const forged = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    for (const badToken of [forged, other]) {
      seed(role);
      const result = await role.handler(request({ action: 'delete-credential', credentialID: 'test-credential' }, {
        cookie: cookieValue(role.cookie(badToken)),
      }));
      assert.equal(result.status, 401);
      assert.equal(writes, 0);
    }
    const now = Date.now;
    Date.now = () => Number(token.split('.')[0]) * 1000;
    try {
      seed(role);
      assert.equal(await role.valid(token), false, 'session expires at the boundary');
      assert.equal((await role.handler(request({ action: 'delete-credential', credentialID: 'test-credential' }, {
        cookie: cookieValue(role.cookie(token)),
      }))).status, 401);
      assert.equal(writes, 0);
    } finally { Date.now = now; }
  });
  test(`${role.name}: authenticated deletion works with the existing cookie and header flows`, async () => {
    const token = await role.create();
    for (const headers of [{ cookie: cookieValue(role.cookie(token)) }, { [role.header]: token }]) {
      seed(role);
      assert.equal((await role.handler(request({ action: 'delete-credential', credentialID: 'test-credential' }, headers))).status, 200);
      assert.deepEqual(blobs.get(role.key).credentials, [{ id: 'keep-credential' }]);
      assert.equal(writes, 1);
    }
  });
  test(`${role.name}: cross-origin passkey mutations are rejected even with a session`, async () => {
    seed(role);
    const result = await role.handler(request({ action: 'delete-credential', credentialID: 'test-credential' }, {
      origin: 'https://other.test', cookie: cookieValue(role.cookie(await role.create())),
    }));
    assert.equal(result.status, 403);
    assert.equal(writes, 0);
  });
  test(`${role.name}: malformed cookies are treated as unauthenticated`, async () => {
    assert.equal(await role.sessionValid(request({}, { cookie: `${role.cookieName}=%ZZ` })), false);
  });
}

test('changing the coach password removes the active operator passkey registry', async () => {
  blobs.clear(); writes = 0;
  blobs.set('auth/operator-passkeys.json', { credentials: [{ id: 'test-credential' }] });
  blobs.set('auth/coach-passkeys.json', { credentials: [{ id: 'legacy-credential' }] });
  blobs.set('auth/board-passkeys.json', { credentials: [{ id: 'keep-team-credential' }] });
  const session = await admin.createAdminSession();
  const result = await coachAttendance(request({ action: 'setCoachPassword', password: 'new-test-only-password' }, {
    cookie: cookieValue(admin.adminSessionCookie(session.token)), 'x-admin-password': process.env.ADMIN_PASSWORD,
  }), { ip: '192.0.2.40' });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).passkeysReset, true);
  assert.equal(blobs.has('auth/operator-passkeys.json'), false);
  assert.equal(blobs.has('auth/coach-passkeys.json'), false);
  assert.equal(blobs.get('auth/board-passkeys.json').credentials.length, 1);
});

test('session creation fails closed when no server-side signing secret is configured', async () => {
  const keys = ['ADMIN_PASSWORD', 'BOARD_SESSION_SECRET', 'ACCESS_PASSWORD', 'COACH_SESSION_SECRET', 'COACH_ACCESS_PASSWORD'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const tokens = await Promise.all(roles.map(role => role.create()));
  try {
    keys.forEach(key => delete process.env[key]);
    for (let index = 0; index < roles.length; index++) {
      await assert.rejects(roles[index].create);
      assert.equal(await roles[index].valid(tokens[index]), false);
    }
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});
