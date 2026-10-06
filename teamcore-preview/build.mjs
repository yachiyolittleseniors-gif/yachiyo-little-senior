import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Deploy Preview only. Fail closed if this branch is ever used for production.
if (process.env.CONTEXT === 'production' || process.env.BRANCH === 'main') {
  throw new Error('Preview-only branch: refusing to publish to production.');
}
const root = dirname(fileURLToPath(import.meta.url));
const compressed = Buffer.concat([1, 2, 3].map(n => readFileSync(join(root, `prototype-${n}.br`))));
const source = brotliDecompressSync(compressed);
const expected = '63b8c4c39ce201566f0f52974db91f594df1c3174acdfd91331c4e3769f6aded';
if (createHash('sha256').update(source).digest('hex') !== expected) {
  throw new Error('Prototype source integrity check failed. Nothing will be published.');
}
const html = source.toString('utf8');
if (/(?:fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|serviceWorker|\/\.netlify\/functions\/)/.test(html)) {
  throw new Error('Unexpected network or production API code in the sample prototype.');
}
const urls = [...html.matchAll(/https?:\/\/[^\s<>"']+/g)].map(m => m[0]);
if (urls.some(url => url !== 'https://yachiyo-little-senior.netlify.app/')) {
  throw new Error('Unexpected external resource in the sample prototype.');
}
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
if (scripts.length !== 1) throw new Error('Expected exactly one self-contained app script.');
const scriptHash = createHash('sha256').update(scripts[0][1]).digest('base64');
const out = join(root, 'public');
mkdirSync(out, { recursive: true });
mkdirSync(join(root, 'empty-functions'), { recursive: true });
if (readdirSync(join(root, 'empty-functions')).some(name => name !== '.gitkeep')) {
  throw new Error('The preview Functions directory must remain empty.');
}
writeFileSync(join(out, 'index.html'), source);
writeFileSync(join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
writeFileSync(join(out, '404.html'), '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>TEAM CORE 操作試作</title><h1>このページはありません</h1><p>このURLはサンプルの操作試作用です。本番のページ・APIは含みません。</p><a href="/">試作のホームへ</a></html>');
writeFileSync(join(out, '_headers'), `/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow, noarchive\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()\n  Content-Security-Policy: default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\n`);
const allowed = new Set(['index.html', 'robots.txt', '404.html', '_headers']);
if (readdirSync(out).some(name => !allowed.has(name))) {
  throw new Error('Unexpected file in the preview publish directory.');
}
console.log('Verified isolated sample UI. Four static output files; no Functions or production APIs.');
