import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../board-access.js', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('../mobile-navigation.js', import.meta.url), 'utf8');
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

async function visit({ session, local, nonce = '', destination = 'https://team.example/board.html', referrer = 'https://team.example/', userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', supported = true, authenticate, verifyAccess }) {
  if (nonce) session.setItem(entryKey, JSON.stringify({ nonce, at: Date.now() }));
  const target = new URL(destination);
  if (nonce) {
    target.searchParams.set('entry', 'home');
    target.searchParams.set('yls_intent', nonce);
  }
  const search = target.search;
  const redirects = [];
  const verifiedPasswords = [];
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
      href: target.href,
      pathname: target.pathname,
      search,
      replace(target) { redirects.push(target); },
    },
    history: { replaceState() {} },
    performance: { getEntriesByType() { return [{ type: 'navigate' }]; } },
    URL, URLSearchParams,
    prompt() { passwordCalls++; return null; },
    alert() { throw new Error('Unexpected alert'); },
    async fetch(url, options) {
      if (!verifyAccess) throw new Error('Unexpected network request');
      assert.equal(url, '/.netlify/functions/site-data?section=access-settings');
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body);
      assert.equal(body.action, 'verifyAccessPassword');
      verifiedPasswords.push(body.password);
      const accepted = verifyAccess(body.password);
      return {
        ok: accepted,
        status: accepted ? 200 : 401,
        async json() { return accepted ? { token: 'renewed-server-token' } : {}; },
      };
    },
  };
  vm.runInContext(source, vm.createContext(sandbox));
  const allowed = await sandbox.window.boardAccessReady;
  return { allowed, passkeyCalls, passwordCalls, redirects, verifiedPasswords, visibility: sandbox.document.documentElement.style.visibility };
}

// Run the shipped navigation listener, including its capture phase, before
// loading the destination's real board-access script. No server data is read.
function clickBoardLink({ session, fromPath, href }) {
  const location = new URL(fromPath, 'https://team.example');
  const handlers = [];
  const link = {
    href: new URL(href, location.href).href,
    target: '',
    setAttribute(name, value) {
      assert.equal(name, 'href');
      this.href = new URL(value, location.href).href;
    },
  };
  const sandbox = {
    document: {
      readyState: 'loading',
      currentScript: null,
      addEventListener(type, handler, capture) {
        if (type === 'click') handlers.push({ handler, capture });
      },
    },
    location,
    sessionStorage: session,
    crypto: { randomUUID() { return '99999999-9999-4999-8999-999999999999'; } },
    URL, URLSearchParams,
  };
  vm.runInContext(navigationSource, vm.createContext(sandbox));
  assert.ok(handlers.some(({ capture }) => capture === true), 'the real capture listener is installed');
  for (const { handler } of handlers) handler({
    isTrusted: true, defaultPrevented: false, button: 0,
    target: { closest(selector) { assert.equal(selector, 'a[href]'); return link; } },
  });
  return new URL(link.href);
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

test('update-history links reuse the server-verified board session without another passkey', async t => {
  const routes = [
    ['/board', '/board.html'],
    ['/board', '/board'],
    ['/board.html', '/board.html'],
    ['/board/', '/board/'],
    ['/board.html/', '/board.html/'],
  ];
  for (const [fromPath, targetPath] of routes) {
    for (const focus of ['schedule', 'duty-roster', 'rules']) {
      await t.test(`${fromPath} → ${targetPath}, focus=${focus}`, async () => {
        const session = memoryStorage(), local = memoryStorage();
        session.setItem('yachiyoAttendancePass', 'existing-server-token');
        local.setItem('yachiyoBoardPasskeyRegistered', '1');
        if (fromPath === '/board' && targetPath === '/board.html') {
          session.setItem('yachiyoBoardPasskeyJustVerified', String(Date.now()));
        }
        const params = new URLSearchParams({ focus });
        if (focus === 'schedule') {
          params.set('focusTitle', '体験会（小学6年生）');
          params.set('focusUpdatedAt', '2026-10-30T09:00:00.000Z');
        }
        const target = clickBoardLink({ session, fromPath, href: `${targetPath}?${params}` });
        const entryIntent = session.getItem(entryKey);
        const next = await visit({
          session, local, destination: target.href,
          referrer: new URL(fromPath, 'https://team.example').href,
          authenticate: async () => ({ token: 'unexpected-native-token' }),
          verifyAccess: token => token === 'existing-server-token',
        });
        assert.equal(next.passkeyCalls, 0, 'viewing an update must not invoke native passkey authentication');
        assert.equal(next.passwordCalls, 0);
        assert.equal(next.allowed, true);
        assert.equal(next.visibility, '');
        assert.deepEqual(next.verifiedPasswords, ['existing-server-token'], 'the saved credential is verified by the server');
        assert.equal(session.getItem('yachiyoAttendancePass'), 'renewed-server-token');
        assert.equal(entryIntent, null);
        assert.equal(target.searchParams.has('entry'), false);
        assert.equal(target.searchParams.has('yls_intent'), false);
        for (const [key, value] of params) assert.equal(target.searchParams.get(key), value);
      });
    }
  }
});

test('an internal calendar link never grants access with an absent or expired session', async t => {
  for (const saved of ['', 'expired-server-token']) {
    await t.test(saved ? 'expired credential' : 'no credential', async () => {
      const session = memoryStorage(), local = memoryStorage();
      if (saved) session.setItem('yachiyoAttendancePass', saved);
      local.setItem('yachiyoBoardPasskeyRegistered', '1');
      const target = clickBoardLink({ session, fromPath: '/board', href: '/board.html?focus=schedule' });
      const next = await visit({
        session, local, destination: target.href, referrer: 'https://team.example/board',
        authenticate: async () => ({ token: 'unexpected-native-token' }),
        verifyAccess: () => false,
      });
      assert.equal(next.allowed, false);
      assert.equal(next.visibility, 'hidden');
      assert.equal(next.passkeyCalls, 0);
      assert.equal(next.passwordCalls, 1, 'invalid sessions still require a password');
      assert.deepEqual(next.verifiedPasswords, saved ? [saved] : []);
      assert.deepEqual(next.redirects, ['./']);
      assert.equal(session.getItem('yachiyoAttendancePass'), null);
    });
  }
});

test('a Home link to the calendar still starts a fresh authenticated board entry', async () => {
  const session = memoryStorage(), local = memoryStorage();
  session.setItem('yachiyoAttendancePass', 'old-server-token');
  local.setItem('yachiyoBoardPasskeyRegistered', '1');
  const target = clickBoardLink({ session, fromPath: '/', href: '/board?focus=schedule' });
  assert.equal(target.searchParams.get('entry'), 'home');
  assert.ok(target.searchParams.get('yls_intent'));
  assert.ok(session.getItem(entryKey));
  const next = await visit({
    session, local, destination: target.href,
    authenticate: async () => ({ token: 'fresh-home-passkey-token' }),
    verifyAccess: () => true,
  });
  assert.equal(next.allowed, true);
  assert.equal(next.passkeyCalls, 1);
  assert.equal(next.passwordCalls, 0);
  assert.deepEqual(next.verifiedPasswords, [], 'Home entry cannot reuse an old board session');
  assert.equal(session.getItem('yachiyoAttendancePass'), 'fresh-home-passkey-token');
});

test('protected child-page returns continue to verify and reuse the board session', async t => {
  const children = [
    ['attendance', 'attendance'],
    ['player-attendance', 'player'],
    ['coach-attendance', 'coach'],
    ['secretariat-documents', 'documents'],
  ];
  for (const [page, from] of children) {
    await t.test(page, async () => {
      const session = memoryStorage(), local = memoryStorage();
      session.setItem('yachiyoAttendancePass', 'existing-server-token');
      const target = clickBoardLink({ session, fromPath: `/${page}`, href: `/board.html?from=${from}` });
      assert.equal(session.getItem(entryKey), null);
      const next = await visit({
        session, local, destination: target.href, referrer: `https://team.example/${page}`,
        authenticate: async () => ({ token: 'unexpected-native-token' }),
        verifyAccess: token => token === 'existing-server-token',
      });
      assert.equal(next.allowed, true);
      assert.equal(next.passkeyCalls, 0);
      assert.equal(next.passwordCalls, 0);
      assert.deepEqual(next.verifiedPasswords, ['existing-server-token']);
    });
  }
});

