import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { inlineScriptHashes, synchronizeHomeCsp } from '../netlify/sync-home-csp.mjs';

const hash = body => "'sha256-" + createHash('sha256').update(body).digest('base64') + "'";
const headers = "/*\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-EXISTING=' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; object-src 'none'\n  X-Content-Type-Options: nosniff\n\n/*.js\n  Cache-Control: public, max-age=0, must-revalidate\n";

test('hashes exact inline text, normalizes newlines, skips external and JSON scripts', () => {
  const body = '\nwindow.example = 1;\n';
  const html = '<script>' + body.replace(/\n/g, '\r\n') + '</script>' +
    '<script src="./external.js">external</script><script type="application/ld+json">{"a":1}</script>' +
    '<script type=module>const value = 1;</script>';
  assert.deepEqual(inlineScriptHashes(html), [hash(body), hash('const value = 1;')]);
});

test('preserves existing permissions, other security directives and cache headers', () => {
  const html = '<script>window.example = 1;</script>';
  const result = synchronizeHomeCsp(html, headers);
  assert.equal(result.added, 1);
  assert.equal(result.content.replace(' ' + hash('window.example = 1;'), ''), headers);
  assert.deepEqual(synchronizeHomeCsp(html, result.content), { content: result.content, added: 0, scripts: 1 });
});

test('also updates script-src-elem and never permits arbitrary inline scripts', () => {
  const input = headers.replace('; style-src', "; script-src-elem 'self'; style-src");
  assert.equal(synchronizeHomeCsp('<script>1;</script>', input).added, 2);
  assert.throws(() => synchronizeHomeCsp('<script>1;</script>', '/*\n'), /No existing CSP/);
  assert.throws(() => synchronizeHomeCsp('<script>1;</script>', headers.replace("script-src 'self'", "script-src 'unsafe-inline'")), /restrictions/);
});

test('changing a script updates its permission without relying on the old hash', () => {
  const before = '<script>window.announcement = false;</script>';
  const after = '<script>window.announcement = true;</script>';
  const oldHeaders = synchronizeHomeCsp(before, headers).content;
  const result = synchronizeHomeCsp(after, oldHeaders);
  assert.equal(result.added, 1);
  assert.ok(result.content.includes(hash('window.announcement = true;')));
  assert.equal(synchronizeHomeCsp(after, result.content).added, 0);
});
