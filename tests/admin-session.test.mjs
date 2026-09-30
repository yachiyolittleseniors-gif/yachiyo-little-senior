import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const blobs = new Map();
let writes = 0;
globalThis.__adminTestStore = {
  async get(key) { return structuredClone(blobs.get(key) ?? null); },
  async setJSON(key, value) { writes++; blobs.set(key, structuredClone(value)); },
  async delete(key) { writes++; blobs.delete(key); },
  async list() { return { blobs: [] }; }
};
registerHooks({resolve(specifier, context, next) {
  if (specifier === '@netlify/blobs') return { url: 'data:text/javascript,export function getStore(){return globalThis.__adminTestStore}', shortCircuit: true };
  return next(specifier, context);
}});

process.env.ADMIN_PASSWORD = 'test-only-admin-password';
const {createBoardSessionToken, boardSessionCookie} = await import('../netlify/functions/_board-session.mjs');
const {adminSession, createAdminSession, adminSessionCookie} = await import('../netlify/functions/_admin-session.mjs');
const {verifyAdminPassword} = await import('../netlify/functions/admin-rate-limit.mjs');
const login = (await import('../netlify/functions/admin-session.mjs')).default;
const site = (await import('../netlify/functions/site-data.mjs')).default;
const upload = (await import('../netlify/functions/team-movie-upload.mjs')).default;
const backup = (await import('../netlify/functions/backup-manager.mjs')).default;
const parent = (await import('../netlify/functions/attendance-data.mjs')).default;
const player = (await import('../netlify/functions/player-attendance-data.mjs')).default;
const coach = (await import('../netlify/functions/coach-attendance-data.mjs')).default;
const context = {ip: '192.0.2.10'};
const cookieValue = value => value.split(';')[0];
const req = (path, cookie = '', password = process.env.ADMIN_PASSWORD, body = {}) => new Request(`https://example.test/.netlify/functions/${path}`, {
  method: 'POST', headers: {'content-type': 'application/json', origin: 'https://example.test', cookie, 'x-admin-password': password}, body: JSON.stringify(body)
});

test('admin session lifecycle and protected mutation routes', async () => {
  const boardCookie = cookieValue(boardSessionCookie(await createBoardSessionToken()));
  assert.equal((await login(req('admin-session'), context)).status, 401, 'admin password alone cannot start outside a board session');
  assert.equal((await login(req('admin-session', boardCookie, 'wrong'), context)).status, 401);
  const crossOrigin = req('admin-session', boardCookie); crossOrigin.headers.set('origin', 'https://other.test');
  assert.equal((await login(crossOrigin, context)).status, 403);
  const response = await login(req('admin-session', boardCookie), context);
  assert.equal(response.status, 200);
  const details = await response.json();
  assert.ok(details.expiresAt > Date.now() + 1798000);
  const setCookie = response.headers.get('set-cookie');
  for (const flag of ['__Host-', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=1800', 'Path=/']) assert.ok(setCookie.includes(flag));
  const cookie = `${boardCookie}; ${cookieValue(setCookie)}`;
  assert.ok(await adminSession(req('site-data', cookie)));
  assert.equal((await adminSession(req('site-data', boardCookie))), null, 'viewer session is not an admin session');
  const tampered = cookie.replace(/(__Host-yls_admin=\d+\.)(\d+)/, (_, prefix, expiry) => prefix + (Number(expiry) + 60));
  assert.equal(await adminSession(req('site-data', tampered)), null);
  const modifiedNonce = cookie.replace(/(__Host-yls_admin=\d+\.\d+\.)(.)/, (_, prefix, first) => prefix + (first==='A'?'B':'A'));
  assert.equal(await adminSession(req('site-data', modifiedNonce)), null, 'signature rejects forged session');
  assert.equal(await adminSession(req('site-data', '__Host-yls_admin=%ZZ')), null);
  assert.equal((await verifyAdminPassword({store: globalThis.__adminTestStore, request: req('site-data', cookie), context, expectedPassword: process.env.ADMIN_PASSWORD})).ok, true);
  const first = await createAdminSession(), second = await createAdminSession();
  assert.notEqual(first.token, second.token, 'sessions have independent random nonces');
  const oldPassword = process.env.ADMIN_PASSWORD; process.env.ADMIN_PASSWORD = 'changed-test-password';
  assert.equal(await adminSession(req('site-data', cookie)), null, 'password change revokes old sessions');
  process.env.ADMIN_PASSWORD = oldPassword;

  const saved = await site(req('site-data?section=news', cookie, oldPassword, {data: [{title:'test'}]}), context);
  assert.equal(saved.status, 200, 'authenticated editor can save');
  blobs.set('content/attendance-config.json', {migrationEnded: true});
  blobs.set('content/player-attendance-config.json', {migrationEnded: true});
  const realNow = Date.now;
  Date.now = () => details.expiresAt;
  try {
    assert.equal(await adminSession(req('site-data', cookie)), null, 'expires at exact boundary');
    const baseline = writes;
    for (const [handler, path, body] of [
      [site, 'site-data?section=news', {data: []}],
      [site, 'site-data?section=document-archive', {action:'deleteArchiveDocument', id:'test'}],
      [upload, 'team-movie-upload', {}],
      [backup, 'backup-manager', {action:'restore', id:'test'}],
      [parent, 'attendance-data', {action:'adminSave'}],
      [player, 'player-attendance-data', {action:'adminSave'}],
      [coach, 'coach-attendance-data', {action:'adminSave'}]
    ]) {
      const result = await handler(req(path, cookie, oldPassword, body), context);
      assert.equal(result.status, 401, path);
      assert.equal((await result.json()).code, 'ADMIN_SESSION_EXPIRED', path);
    }
    assert.equal(writes, baseline, 'expired admin writes do not touch stored data');
    const renewed = await login(req('admin-session', boardCookie), context);
    assert.equal(renewed.status, 200, 'board administrator can reauthenticate');
    const until = (await renewed.json()).expiresAt;
    assert.ok(until > details.expiresAt);
  } finally {Date.now = realNow;}
  assert.equal((await backup(req('backup-manager', boardCookie), context)).status, 401, 'backup cannot bypass admin auth with viewer cookie');
});

test('board login opens admin UI only after the server issues a session', async () => {
  blobs.clear();
  const boardCookie = cookieValue(boardSessionCookie(await createBoardSessionToken()));
  const source = readFileSync(new URL('../board-updates.js', import.meta.url), 'utf8');
  const start = source.indexOf("adminBtn.addEventListener('click',async()=>{");
  const block = source.slice(start, source.indexOf('saveAccessPasswordBtn.addEventListener', start));
  const classes = new Set(), emitted = [], alerts = [];
  let click, activated, status = 401;
  const panel = {dataset:{},classList:{contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name)}};
  const sandbox = vm.createContext({
    adminBtn: {addEventListener(name, callback){click=callback},style:{setProperty(){}}}, panel,
    prompt:()=>process.env.ADMIN_PASSWORD, alert:value=>alerts.push(value),
    window:{YLSAdminSession:{activate:value=>activated=value}},
    document:{dispatchEvent:event=>emitted.push(event)},
    CustomEvent:class {constructor(type, options){this.type=type;this.detail=options.detail}},
    fetch:async(url, options)=>{
      assert.equal(url, '/.netlify/functions/admin-session');
      if(status===401)return new Response(JSON.stringify({error:'unauthorized'}),{status:401});
      return login(req('admin-session', boardCookie, options.headers['x-admin-password']), context);
    }
  });
  vm.runInContext(block, sandbox);
  await click();
  assert.equal(classes.has('show'), false);
  assert.equal(activated, undefined);
  assert.equal(emitted.length, 0);
  status=200;
  await click();
  assert.equal(classes.has('show'), true);
  assert.equal(emitted[0].detail.expiresAt, activated);
  assert.ok(activated>Date.now());
});

test('password attempt throttling is preserved for session creation', async () => {
  blobs.clear();
  const boardCookie = cookieValue(boardSessionCookie(await createBoardSessionToken()));
  for (let attempt=1; attempt<=5; attempt++) {
    const result = await login(req('admin-session', boardCookie, 'wrong'), context);
    assert.equal(result.status, attempt===5?429:401);
  }
  assert.equal((await login(req('admin-session', boardCookie), context)).status, 429);
});
