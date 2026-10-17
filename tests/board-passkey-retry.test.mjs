import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../board-access.js', import.meta.url), 'utf8');
const entryKey = 'yachiyoBoardEntryIntentV2';
const skipKey = 'yachiyoBoardPasskeySkipUntil';

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

async function visit({ session, local, nonce = '', referrer = 'https://team.example/', userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', supported = true, authenticate }) {
  if (nonce) session.setItem(entryKey, JSON.stringify({ nonce, at: Date.now() }));
  const search = nonce ? '?entry=home&yls_intent=' + nonce : '';
  const redirects = [];
  let passkeyCalls = 0, passwordCalls = 0;
  const sandbox = {
    window: {
      addEventListener() {},
      YLSPasskeys: {
        supported() { return supported; },
        async authenticate() { passkeyCalls++; return authenticate(); },
      },
    },
    document: {
      documentElement: { style: {} },
      addEventListener() {},
      referrer,
      visibilityState: 'visible',
    },
    navigator: {
      userAgent,
      platform: /Android/i.test(userAgent) ? 'Linux armv8l' : 'iPhone',
      maxTouchPoints: 5,
    },
    sessionStorage: session,
    localStorage: local,
    location: {
      origin: 'https://team.example',
      href: 'https://team.example/board.html' + search,
      search,
      replace(target) { redirects.push(target); },
    },
    history: { replaceState() {} },
    performance: { getEntriesByType() { return [{ type: 'navigate' }]; } },
    URL, URLSearchParams,
    prompt() { passwordCalls++; return null; },
    alert() { throw new Error('Unexpected alert'); },
    fetch() { throw new Error('Unexpected network request'); },
  };
  vm.runInContext(source, vm.createContext(sandbox));
  const allowed = await sandbox.window.boardAccessReady;
  return { allowed, passkeyCalls, passwordCalls, redirects };
}

test('canceling a team passkey does not suppress it on the next Home lock tap', async () => {
  const session = memoryStorage(), local = memoryStorage();
  local.setItem('yachiyoBoardPasskeyRegistered', '1');
  const cancel = new Error('The operation was canceled');
  cancel.name = 'NotAllowedError';
  const first = await visit({
    session, local, nonce: '11111111-1111-4111-8111-111111111111',
    authenticate: async () => { throw cancel; },
  });
  assert.equal(first.allowed, false);
  assert.equal(first.passkeyCalls, 1);
  assert.equal(first.passwordCalls, 1, 'same canceled navigation can still offer a password');
  assert.deepEqual(first.redirects, ['./']);
  assert.ok(Number(session.getItem(skipKey)) > Date.now(), 'cancel is temporarily suppressed in this navigation');

  const second = await visit({
    session, local, nonce: '22222222-2222-4222-8222-222222222222',
    authenticate: async () => ({ token: 'server-verified-token' }),
  });
  assert.equal(second.allowed, true);
  assert.equal(second.passkeyCalls, 1, 'a fresh Home tap retries the passkey immediately');
  assert.equal(second.passwordCalls, 0);
  assert.equal(session.getItem(skipKey), null);
  assert.equal(session.getItem('yachiyoAttendancePass'), 'server-verified-token');
});

test('a visible same-origin Home return retries even if Safari lost the click nonce', async () => {
  const session = memoryStorage(), local = memoryStorage();
  session.setItem(skipKey, Date.now() + 10 * 60 * 1000);
  local.setItem('yachiyoBoardPasskeyRegistered', '1');
  const next = await visit({ session, local, authenticate: async () => ({ token: 'verified' }) });
  assert.equal(next.allowed, true);
  assert.equal(next.passkeyCalls, 1);
  assert.equal(next.passwordCalls, 0);
});

test('a direct/non-Home navigation never starts passkey automatically', async () => {
  const session = memoryStorage(), local = memoryStorage();
  local.setItem('yachiyoBoardPasskeyRegistered', '1');
  const next = await visit({
    session, local, referrer: 'https://team.example/schedule',
    authenticate: async () => { throw new Error('Passkey should not run'); },
  });
  assert.equal(next.allowed, false);
  assert.equal(next.passkeyCalls, 0);
  assert.equal(next.passwordCalls, 1);
});


const androidUA = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36';
function androidCancel() {
  const error = new Error('The operation either timed out or was not allowed');
  error.name = 'NotAllowedError';
  return error;
}

test('Android: cancel never clears the registered passkey marker', async () => {
  const session = memoryStorage(), local = memoryStorage();
  local.setItem('yachiyoBoardPasskeyRegistered', '1');
  const first = await visit({
    session, local, userAgent: androidUA,
    nonce: '33333333-3333-4333-8333-333333333333',
    authenticate: async () => { throw androidCancel(); },
  });
  assert.equal(first.passkeyCalls, 1);
  assert.equal(first.passwordCalls, 1);
  assert.equal(local.getItem('yachiyoBoardPasskeyRegistered'), '1');
  assert.equal(session.getItem('yachiyoBoardPasskeyNeedsReregister'), null);
  assert.ok(Number(session.getItem(skipKey)) > Date.now());

  const next = await visit({
    session, local, userAgent: androidUA,
    nonce: '44444444-4444-4444-8444-444444444444',
    authenticate: async () => ({ token: 'android-verified-token' }),
  });
  assert.equal(next.allowed, true);
  assert.equal(next.passkeyCalls, 1);
  assert.equal(next.passwordCalls, 0);
  assert.equal(session.getItem(skipKey), null);
  assert.equal(local.getItem('yachiyoBoardPasskeyRegistered'), '1');
});

test('Android: recover a marker cleared by the previous broken cancellation handler', async () => {
  const session = memoryStorage(), local = memoryStorage();
  session.setItem('yachiyoBoardPasskeyNeedsReregister', '1');
  const next = await visit({
    session, local, userAgent: androidUA,
    nonce: '55555555-5555-4555-8555-555555555555',
    authenticate: async () => ({ token: 'android-restored-token' }),
  });
  assert.equal(next.allowed, true);
  assert.equal(next.passkeyCalls, 1);
  assert.equal(next.passwordCalls, 0);
  assert.equal(local.getItem('yachiyoBoardPasskeyRegistered'), '1');
  assert.equal(session.getItem('yachiyoBoardPasskeyNeedsReregister'), null);
});

test('Android: without a local registration marker, an existing synced passkey can still authenticate', async () => {
  const session = memoryStorage(), local = memoryStorage();
  const next = await visit({
    session, local, userAgent: androidUA,
    nonce: '66666666-6666-4666-8666-666666666666',
    authenticate: async () => ({ token: 'verified-synced-android-passkey' }),
  });
  assert.equal(next.allowed, true);
  assert.equal(next.passkeyCalls, 1);
  assert.equal(next.passwordCalls, 0);
  assert.equal(local.getItem('yachiyoBoardPasskeyRegistered'), '1');
  assert.equal(session.getItem('yachiyoAttendancePass'), 'verified-synced-android-passkey');
});

test('Android: a device with no passkey falls back to password after one attempt', async () => {
  const session = memoryStorage(), local = memoryStorage();
  const next = await visit({
    session, local, userAgent: androidUA,
    nonce: '77777777-7777-4777-8777-777777777777',
    authenticate: async () => { throw androidCancel(); },
  });
  assert.equal(next.allowed, false);
  assert.equal(next.passkeyCalls, 1, 'one native attempt, not a repeated dialog loop');
  assert.equal(next.passwordCalls, 1, 'password login remains available');
  assert.equal(local.getItem('yachiyoBoardPasskeyRegistered'), null);
});

test('Android: unsupported browser falls back directly to password', async () => {
  const session = memoryStorage(), local = memoryStorage();
  const next = await visit({
    session, local, userAgent: androidUA, supported: false,
    nonce: '88888888-8888-4888-8888-888888888888',
    authenticate: async () => { throw new Error('unsupported browser must not use WebAuthn'); },
  });
  assert.equal(next.allowed, false);
  assert.equal(next.passkeyCalls, 0);
  assert.equal(next.passwordCalls, 1);
});

test('Android: recovery marker cannot start WebAuthn from a direct/non-Home URL', async () => {
  const session = memoryStorage(), local = memoryStorage();
  session.setItem('yachiyoBoardPasskeyNeedsReregister', '1');
  const next = await visit({
    session, local, userAgent: androidUA,
    referrer: 'https://team.example/schedule',
    authenticate: async () => { throw new Error('Direct visit must not try passkey'); },
  });
  assert.equal(next.allowed, false);
  assert.equal(next.passkeyCalls, 0);
  assert.equal(next.passwordCalls, 1);
});
