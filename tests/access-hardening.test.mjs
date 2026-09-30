import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const blobs = new Map(), revisions = new Map();
let failReads = false, failDeletes = false, authVerification;
let securityWrites = 0, contentWrites = 0, settingsReads = 0;
const etag = key => `"${revisions.get(key) || 0}"`;
const store = {
  async get(key) {
    if (key.includes('access-settings') || key.includes('coach-attendance-access')) settingsReads++;
    if (failReads) throw new Error('Test storage unavailable');
    return structuredClone(blobs.get(key) ?? null);
  },
  async getWithMetadata(key) {
    if (failReads) throw new Error('Test storage unavailable');
    return blobs.has(key) ? { data: structuredClone(blobs.get(key)), etag: etag(key), metadata: {} } : null;
  },
  async setJSON(key, value, conditions = {}) {
    if (conditions.onlyIfNew && blobs.has(key)) return { modified: false };
    if (conditions.onlyIfMatch && (!blobs.has(key) || conditions.onlyIfMatch !== etag(key))) return { modified: false };
    if (key.startsWith('security/')) securityWrites++; else contentWrites++;
    blobs.set(key, structuredClone(value)); revisions.set(key, (revisions.get(key) || 0) + 1);
    return { modified: true, etag: etag(key) };
  },
  async delete(key) { if (failDeletes) throw new Error('Test delete unavailable'); blobs.delete(key); contentWrites++; },
  async list() { return { blobs: [] }; },
};
globalThis.__accessTestStore = store;
globalThis.__accessTestVerify = (...args) => authVerification(...args);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@netlify/blobs') return { url: 'data:text/javascript,export function getStore(){return globalThis.__accessTestStore}', shortCircuit: true };
  if (specifier === '@simplewebauthn/server') return {
    url: 'data:text/javascript,' + encodeURIComponent(`
      export async function generateAuthenticationOptions(options){return {...options, challenge:'test-challenge'};}
      export async function generateRegistrationOptions(options){return {...options, challenge:'test-challenge'};}
      export async function verifyAuthenticationResponse(options){return globalThis.__accessTestVerify(options);}
      export async function verifyRegistrationResponse(){throw new Error('Not used');}
    `), shortCircuit: true,
  };
  return next(specifier, context);
}});
process.env.ADMIN_PASSWORD = 'test-only-admin-secret';
const board = await import('../netlify/functions/_board-session.mjs');
const coach = await import('../netlify/functions/_coach-session.mjs');
const admin = await import('../netlify/functions/_admin-session.mjs');
const { verifyAccessPassword } = await import('../netlify/functions/_access-password.mjs');
const { limitedPasswordCheck, AccessRateLimitError } = await import('../netlify/functions/_access-rate-limit.mjs');
const { isBackupableKey } = await import('../netlify/functions/_backup-lib.mjs');
const site = (await import('../netlify/functions/site-data.mjs')).default;
const parents = (await import('../netlify/functions/attendance-data.mjs')).default;
const players = (await import('../netlify/functions/player-attendance-data.mjs')).default;
const coaches = (await import('../netlify/functions/coach-attendance-data.mjs')).default;
const cars = (await import('../netlify/functions/car-assignment-data.mjs')).default;
const boardPasskeys = (await import('../netlify/functions/passkey-auth.mjs')).default;
const coachPasskeys = (await import('../netlify/functions/operator-passkey-auth.mjs')).default;
const ip = { ip: '192.0.2.50' };
const boardPassword = 'test-only-board-password', coachPassword = 'test-only-coach-password';
const hash = password => createHash('sha256').update(`test-salt:${password}`).digest('hex');
const cookie = value => value.split(';')[0];
function reset() {
  blobs.clear(); revisions.clear(); failReads = false; failDeletes = false;
  securityWrites = 0; contentWrites = 0; settingsReads = 0;
  blobs.set('content/access-settings.json', { salt: 'test-salt', hash: hash(boardPassword) });
  blobs.set('content/coach-attendance-access.json', { salt: 'test-salt', hash: hash(coachPassword) });
  blobs.set('content/attendance-config.json', { migrationEnded: true });
  blobs.set('content/player-attendance-config.json', { migrationEnded: true });
}
function request(path, body, headers = {}) {
  return new Request(`https://example.test/.netlify/functions/${path}`, {
    method: body ? 'POST' : 'GET', headers: { origin: 'https://example.test', 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const login = (role, password, context = ip) => role === 'board'
  ? site(request('site-data?section=access-settings', { action: 'verifyAccessPassword', password }), context)
  : coaches(request('coach-attendance-data', { action: 'verifyCoachPassword', password }), context);
async function adminHeaders() {
  const session = await admin.createAdminSession();
  return { cookie: cookie(admin.adminSessionCookie(session.token)), 'x-admin-password': process.env.ADMIN_PASSWORD };
}

for (const role of ['board', 'coach']) {
  test(`${role}: ten failed passwords block further password attempts, then recover`, async () => {
    reset();
    const password = role === 'board' ? boardPassword : coachPassword;
    for (let i = 1; i <= 10; i++) {
      const response = await login(role, `wrong-${i}`);
      assert.equal(response.status, i === 10 ? 429 : 401);
    }
    const blocked = await login(role, password);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal((await blocked.json()).code, 'ACCESS_RATE_LIMITED');
    assert.equal((await login(role, password, { ip: '192.0.2.51' })).status, 200, 'other networks unaffected');
    const otherRole = role === 'board' ? 'coach' : 'board';
    assert.equal((await login(otherRole, role === 'board' ? coachPassword : boardPassword)).status, 200, 'roles have separate limits');
    const oldNow = Date.now; Date.now = () => oldNow() + 901000;
    try { assert.equal((await login(role, password)).status, 200); } finally { Date.now = oldNow; }
    assert.equal(contentWrites, 0, 'no attendance, roster or credential writes during password attempts');
  });
}

test('successful logins do not exhaust the allowance on shared Wi-Fi', async () => {
  reset();
  for (let i = 0; i < 25; i++) assert.equal((await login('board', boardPassword)).status, 200);
  const state = [...blobs.entries()].find(([key]) => key.startsWith('security/access-rate-limit/board/'))[1];
  assert.equal(state.count, 0);
});

test('parallel requests cannot reuse password attempt reservations', async () => {
  reset(); let checks = 0;
  const results = await Promise.all(Array.from({ length: 30 }, () => limitedPasswordCheck({
    store, context: ip, role: 'board', version: '', verify: async () => { checks++; return false; },
  }).catch(error => { assert.ok(error instanceof AccessRateLimitError); return 'blocked'; })));
  assert.equal(checks, 10);
  assert.equal(results.filter(result => result === false).length, 9);
  assert.equal(results.filter(result => result === 'blocked').length, 21);
});

test('changing forwarding headers cannot reset the source-IP allowance', async () => {
  reset();
  for (let i = 0; i < 10; i++) await login('board', 'wrong');
  const result = await site(request('site-data?section=access-settings', { action: 'verifyAccessPassword', password: boardPassword }, {
    'x-forwarded-for': '203.0.113.80', 'x-nf-client-connection-ip': '203.0.113.81',
  }), ip);
  assert.equal(result.status, 429);
});

test('all team password entry points share the same limit', async () => {
  reset();
  const endpoints = [
    [site, 'site-data?section=rules', undefined],
    [parents, 'attendance-data?config=1', undefined],
    [players, 'player-attendance-data?config=1', undefined],
    [cars, 'car-assignment-data', undefined],
    [boardPasskeys, 'passkey-auth', { action: 'registration-options' }],
  ];
  for (let i = 0; i < 10; i++) {
    const [handler, path, body] = endpoints[i % endpoints.length];
    assert.equal((await handler(request(path, body, { 'x-access-password': 'wrong' }), ip)).status, i === 9 ? 429 : 401);
  }
  for (const [handler, path, body] of endpoints) {
    assert.equal((await handler(request(path, body, { 'x-access-password': boardPassword }), ip)).status, 429, path);
  }
  assert.equal(contentWrites, 0);
});

test('coach login, passkey setup and operator document mutations share the limit', async () => {
  reset();
  for (let i = 0; i < 10; i++) {
    const result = i % 2
      ? await coachPasskeys(request('operator-passkey-auth', { action: 'registration-options' }, { 'x-coach-password': 'wrong' }), ip)
      : await login('coach', 'wrong');
    assert.equal(result.status, i === 9 ? 429 : 401);
  }
  const teamCookie = cookie(board.boardSessionCookie(await board.createBoardSessionToken()));
  const result = await site(request('site-data?section=referee-documents', { action: 'deleteRefereeDocument', id: 'test' }, {
    cookie: teamCookie, 'x-coach-password': coachPassword,
  }), ip);
  assert.equal(result.status, 429);
  assert.equal(contentWrites, 0);
});

test('valid sessions and passkey login remain available during a password lock', async () => {
  reset();
  const token = await board.createBoardSessionToken();
  for (let i = 0; i < 10; i++) await login('board', 'wrong');
  const before = securityWrites;
  assert.equal((await login('board', token)).status, 200);
  assert.equal((await parents(request('attendance-data?config=1', undefined, { cookie: cookie(board.boardSessionCookie(token)) }), ip)).status, 200);
  blobs.set('auth/board-passkeys.json', { credentials: [{ id: 'test-key', publicKey: 'AA', counter: 0 }] });
  authVerification = async () => ({ verified: true, authenticationInfo: { newCounter: 1 } });
  const start = await boardPasskeys(request('passkey-auth', { action: 'authentication-options' }), ip);
  const { ceremonyID } = await start.json();
  const verified = await boardPasskeys(request('passkey-auth', { action: 'authentication-verify', ceremonyID, credential: { id: 'test-key' } }), ip);
  assert.equal(verified.status, 200);
  assert.equal(await board.boardSessionTokenIsValid((await verified.json()).token), true);
  assert.equal(securityWrites, before, 'token reuse and authenticator checks do not consume password slots');
});

test('deployment accepts pre-existing team and coach tokens without forcing a login', async () => {
  reset();
  const expiry = String(Math.floor(Date.now() / 1000) + 3600);
  const teamToken = `${expiry}.${createHmac('sha256', process.env.ADMIN_PASSWORD).update(expiry).digest('base64url')}`;
  const coachToken = `${expiry}.${createHmac('sha256', process.env.ADMIN_PASSWORD).update(`coach:${expiry}`).digest('base64url')}`;
  assert.equal(await board.boardSessionTokenIsValid(teamToken), true);
  assert.equal(await coach.coachSessionTokenIsValid(coachToken), true);
});

test('team password change revokes old cookies, bearer tokens and administrator sessions', async () => {
  reset();
  const token = await board.createBoardSessionToken(), coachToken = await coach.createCoachSessionToken();
  const headers = await adminHeaders();
  const response = await site(request('site-data?section=access-settings', { action: 'setAccessPassword', password: 'changed-board-password' }, headers), ip);
  assert.equal(response.status, 200);
  assert.ok(blobs.get('content/access-settings.json').authVersion);
  assert.equal(await board.boardSessionTokenIsValid(token), false);
  assert.equal(await admin.adminSession(request('admin-session', undefined, headers)), null);
  assert.equal(await coach.coachSessionTokenIsValid(coachToken), true, 'coach access is a separate password');
  const baseline = securityWrites;
  for (const authHeaders of [{ 'x-access-password': token }, { cookie: cookie(board.boardSessionCookie(token)) }]) {
    assert.equal((await parents(request('attendance-data?config=1', undefined, authHeaders), ip)).status, 401);
    assert.equal((await cars(request('car-assignment-data', undefined, authHeaders), ip)).status, 401);
    assert.equal((await site(request('site-data?section=rules', undefined, authHeaders), ip)).status, 401);
  }
  assert.equal(securityWrites, baseline, 'stale polling is rejected without locking the shared network');
  assert.equal((await login('board', boardPassword)).status, 401);
  const fresh = await login('board', 'changed-board-password');
  assert.equal(fresh.status, 200);
  assert.equal(await board.boardSessionTokenIsValid((await fresh.json()).token), true);
});

test('coach password change also revokes sessions when the new password text is unchanged', async () => {
  reset();
  const coachToken = await coach.createCoachSessionToken(), boardToken = await board.createBoardSessionToken();
  const response = await coaches(request('coach-attendance-data', { action: 'setCoachPassword', password: coachPassword }, await adminHeaders()), ip);
  assert.equal(response.status, 200);
  assert.equal(await coach.coachSessionTokenIsValid(coachToken), false);
  assert.equal(await board.boardSessionTokenIsValid(boardToken), true);
  assert.equal((await coaches(request('coach-attendance-data?config=1', undefined, { 'x-coach-password': coachToken }), ip)).status, 401);
  assert.equal((await login('coach', coachPassword)).status, 200);
});

test('a password verified before a concurrent reset cannot mint a new-version session', async () => {
  reset();
  const req = request('site-data?section=access-settings', { action: 'verifyAccessPassword', password: boardPassword });
  assert.equal(await verifyAccessPassword({ role: 'board', store, request: req, context: ip, password: boardPassword }), true);
  await store.setJSON('content/access-settings.json', { salt: 'test-salt', hash: hash('changed'), authVersion: 'new-version' });
  const staleToken = await board.createBoardSessionToken({ store, request: req });
  assert.equal(await board.boardSessionTokenIsValid(staleToken), false);
});

test('passkeys and in-flight challenges from a previous password version stay revoked', async () => {
  reset();
  blobs.set('auth/board-passkeys.json', { credentials: [{ id: 'test-key', publicKey: 'AA', counter: 0 }] });
  const start = await boardPasskeys(request('passkey-auth', { action: 'authentication-options' }), ip);
  const { ceremonyID } = await start.json();
  blobs.set('content/access-settings.json', { salt: 'test-salt', hash: hash(boardPassword), authVersion: 'new-version' });
  assert.equal((await boardPasskeys(request('passkey-auth', { action: 'authentication-options' }), ip)).status, 404);
  assert.equal((await boardPasskeys(request('passkey-auth', { action: 'authentication-verify', ceremonyID, credential: { id: 'test-key' } }), ip)).status, 400);
});

test('passkey verification finishing during a password change cannot restore usable credentials', async () => {
  reset();
  blobs.set('auth/board-passkeys.json', { credentials: [{ id: 'test-key', publicKey: 'AA', counter: 0 }] });
  const start = await boardPasskeys(request('passkey-auth', { action: 'authentication-options' }), ip);
  const { ceremonyID } = await start.json();
  authVerification = async () => {
    blobs.set('content/access-settings.json', { salt: 'test-salt', hash: hash(boardPassword), authVersion: 'reset-during-assertion' });
    blobs.delete('auth/board-passkeys.json');
    return { verified: true, authenticationInfo: { newCounter: 1 } };
  };
  const result = await boardPasskeys(request('passkey-auth', { action: 'authentication-verify', ceremonyID, credential: { id: 'test-key' } }), ip);
  assert.equal(result.status, 200);
  assert.equal(await board.boardSessionTokenIsValid((await result.json()).token), false);
  assert.equal((await boardPasskeys(request('passkey-auth', { action: 'authentication-options' }), ip)).status, 404);
});

test('auth settings are reused within a request, refreshed on the next request, and fail closed', async () => {
  reset();
  const token = await board.createBoardSessionToken(); settingsReads = 0;
  const req = request('site-data?section=rules', undefined, { cookie: cookie(board.boardSessionCookie(token)) });
  assert.equal(await board.boardSessionIsValid(req), true);
  assert.equal(await board.boardSessionTokenIsValid(token, { store, request: req }), true);
  assert.equal(settingsReads, 1);
  blobs.set('content/access-settings.json', { authVersion: 'rotated', salt: 'test-salt', hash: hash(boardPassword) });
  assert.equal(await board.boardSessionTokenIsValid(token, { store, request: request('site-data') }), false);
  failReads = true;
  assert.equal(await board.boardSessionTokenIsValid(token), false);
  await assert.rejects(() => verifyAccessPassword({ role: 'board', store, context: ip, request: request('site-data'), password: boardPassword }));
  failReads = false;
});

test('content backups never include or restore password attempt counters', () => {
  assert.equal(isBackupableKey('security/access-rate-limit/board/test.json'), false);
  assert.equal(isBackupableKey('security/admin-rate-limit/test.json'), false);
  assert.equal(isBackupableKey('content/attendance.json'), true);
});

for (const name of ['board-access.js', 'coach-access.js']) {
  test(`${name}: password restriction uses the existing prompt and a clear retry message`, async () => {
    const alerts = [], redirects = [];
    let prompts = 0;
    const sandbox = vm.createContext({
      window: {}, document: { documentElement: { style: {} } },
      sessionStorage: { getItem: () => '', removeItem() {}, setItem() {} },
      localStorage: { getItem: () => '', removeItem() {}, setItem() {} },
      location: { search: '', replace: value => redirects.push(value) },
      history: { length: 1 }, performance: { getEntriesByType: () => [] },
      URLSearchParams, prompt: () => { prompts++; return 'test'; }, alert: value => alerts.push(value),
      fetch: async () => new Response(JSON.stringify({ error: '約15分後にお試しください。' }), { status: 429 }),
    });
    vm.runInContext(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'), sandbox);
    const ready = name === 'board-access.js' ? sandbox.window.boardAccessReady : sandbox.window.coachAccessReady;
    assert.equal(await ready, false);
    assert.equal(prompts, 1);
    assert.deepEqual(alerts, ['約15分後にお試しください。']);
    assert.equal(redirects.length, 1);
  });
}
