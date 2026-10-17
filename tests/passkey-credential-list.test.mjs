import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const records = new Map();
let verifyCall = null;
globalThis.__passkeySizeTestStore = {
  async get(key) { return structuredClone(records.get(key) ?? null); },
  async setJSON(key, value) { records.set(key, structuredClone(value)); return { modified:true }; },
  async delete(key) { records.delete(key); },
  async list() { return { blobs:[] }; },
};
globalThis.__passkeySizeVerify = options => {
  verifyCall = options;
  return { verified:true, authenticationInfo:{ newCounter:7 } };
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@netlify/blobs') return {
    url:'data:text/javascript,export function getStore(){return globalThis.__passkeySizeTestStore}',
    shortCircuit:true,
  };
  if (specifier === '@simplewebauthn/server') return {
    url:'data:text/javascript,' + encodeURIComponent([
      "export async function generateAuthenticationOptions(o) { return {...o,challenge:'test-auth-challenge'}; }",
      "export async function generateRegistrationOptions(o) { return {...o,challenge:'test-reg-challenge'}; }",
      "export async function verifyAuthenticationResponse(o) { return globalThis.__passkeySizeVerify(o); }",
      "export async function verifyRegistrationResponse() { throw Error('Not exercised'); }",
    ].join('\n')),
    shortCircuit:true,
  };
  return next(specifier, context);
}});
process.env.ADMIN_PASSWORD = 'test-signing-secret-only';
process.env.ACCESS_PASSWORD = 'test-team-password-only';
const handle = (await import('../netlify/functions/passkey-auth.mjs')).default;

const registryKey = 'auth/board-passkeys.json';
function seed(count) {
  records.clear();
  verifyCall = null;
  const credentials = Array.from({ length:count }, (_,i)=>({
    id:'board-credential-'+i,
    publicKey:'dGVzdC1rZXk',
    counter:0,
    transports:['internal'],
  }));
  records.set(registryKey,{ credentials });
  return credentials;
}
function post(action, payload={}, headers={}) {
  return new Request('https://example.test/.netlify/functions/passkey-auth',{
    method:'POST',
    headers:{origin:'https://example.test','content-type':'application/json',...headers},
    body:JSON.stringify({action,...payload}),
  });
}
test('registration options never exceed Android 64-descriptor limit, without deleting keys',async()=>{
  for (const count of [0,1,64,65,150,4999]) {
    const original=seed(count);
    const r=await handle(post('registration-options',{}, {'x-access-password':process.env.ACCESS_PASSWORD}));
    assert.equal(r.status,200,'count '+count);
    const body=await r.json();
    assert.equal(body.options.excludeCredentials.length,Math.min(count,64));
    assert.deepEqual(body.options.excludeCredentials.map(x=>x.id),original.slice(0,64).map(x=>x.id));
    assert.ok(body.ceremonyID,'registration challenge is created');
    assert.deepEqual(records.get(registryKey).credentials,original,'existing credentials are untouched');
  }
  seed(5000);
  const full=await handle(post('registration-options',{}, {'x-access-password':process.env.ACCESS_PASSWORD}));
  assert.equal(full.status,409,'5000 server-side capacity remains unchanged');
  assert.equal(records.get(registryKey).credentials.length,5000);
});
test('passkey login with more than 64 saved keys must not truncate older keys',async()=>{
  for (const count of [1,64,65,250,5000]) {
    const original=seed(count);
    const r=await handle(post('authentication-options'));
    assert.equal(r.status,200,'count '+count);
    const body=await r.json();
    assert.equal(body.options.userVerification,'required');
    assert.ok(body.ceremonyID);
    if (count<=64) assert.deepEqual(body.options.allowCredentials.map(x=>x.id),original.map(x=>x.id));
    else assert.ok(!body.options.allowCredentials?.length,'use discoverable credentials, not a truncated allowlist');
    assert.deepEqual(records.get(registryKey).credentials,original);
  }
});
test('unregistered or different-product credential cannot bypass server authentication',async()=>{
  const original=seed(100);
  const start=await (await handle(post('authentication-options'))).json();
  const r=await handle(post('authentication-verify',{
    ceremonyID:start.ceremonyID,credential:{id:'unregistered-or-other-product-key'},
  }));
  assert.equal(r.status,401);
  assert.equal(verifyCall,null,'do not run verification for an unknown credential');
  assert.deepEqual(records.get(registryKey).credentials,original);
});
test('a registered credential beyond first 64 is still checked and accepted',async()=>{
  const original=seed(100);
  const start=await (await handle(post('authentication-options'))).json();
  const r=await handle(post('authentication-verify',{
    ceremonyID:start.ceremonyID,credential:{id:'board-credential-95'},
  }));
  assert.equal(r.status,200);
  assert.ok((await r.json()).token);
  assert.ok(verifyCall,'must call cryptographic verifier');
  assert.equal(verifyCall.credential.id,'board-credential-95');
  assert.equal(records.get(registryKey).credentials.length,original.length);
  assert.equal(records.get(registryKey).credentials[95].counter,7);
});
test('large list does not allow anonymous registration',async()=>{
  seed(100);
  assert.equal((await handle(post('registration-options'))).status,401);
});
