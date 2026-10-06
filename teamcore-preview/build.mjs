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
let html = source.toString('utf8');
// Preview v4: show schedule details together with attendance controls.
const decode = value => Buffer.from(value, 'base64').toString('utf8');
const cssPatch = decode('LyogQXR0ZW5kYW5jZSB2NDogc2NoZWR1bGUgKyBpbnB1dCBpbiBvbmUgdmlldyAqLwouYXR0LXBsYW4tbGlzdHtkaXNwbGF5OmdyaWQ7Z2FwOjExcHg7bWFyZ2luLXRvcDoxMHB4fS5hdHQtcGxhbntwYWRkaW5nOjA7b3ZlcmZsb3c6aGlkZGVufS5hdHQtcGxhbi1oZWFke3BhZGRpbmc6MTNweCAxNHB4IDExcHg7YmFja2dyb3VuZDojZjlmYWY5O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpfS5hdHQtcGxhbi1kYXRle2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47Z2FwOjhweH0uYXR0LXBsYW4tZGF0ZSBzdHJvbmd7Zm9udC1zaXplOjEzcHh9LmF0dC1wbGFuLXRpdGxle2ZvbnQtc2l6ZToxNXB4O2ZvbnQtd2VpZ2h0OjcwMDttYXJnaW46NnB4IDAgM3B4O2NvbG9yOnZhcigtLW5hdnkpfS5hdHQtcGxhbi1tZXRhe2Rpc3BsYXk6Z3JpZDtnYXA6M3B4O2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTAuNXB4O2xpbmUtaGVpZ2h0OjEuNTV9LmF0dC1wbGFuLW1ldGEgc3BhbntkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6ZmxleC1zdGFydDtnYXA6NXB4fS5hdHQtcGxhbi1tZXRhIC5pY29ue3dpZHRoOjEzcHg7aGVpZ2h0OjEzcHg7bWFyZ2luLXRvcDoxcHg7ZmxleDowIDAgYXV0b30uYXR0LXBsYW4taW5wdXR7cGFkZGluZzoxMXB4IDEycHggMTJweH0uYXR0LXBsYW4taW5wdXQgLmF0dC1jaG9pY2Vze21hcmdpbi10b3A6MH0uYXR0LXBsYW4tdG9vbHN7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtnYXA6OHB4O21hcmdpbi10b3A6N3B4fS5hdHQtcGxhbi1zdGF0dXN7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tbXV0ZWQpfS5hdHQtcGxhbi5wZW5kaW5ne2JvcmRlci1jb2xvcjojZGZjOThjfS5hdHQtcGxhbi5wZW5kaW5nIC5hdHQtcGxhbi1oZWFke2JhY2tncm91bmQ6I2ZmZmFmMH0uYXR0LW92ZXJ2aWV3e3BhZGRpbmc6MTFweCAxM3B4O21hcmdpbjowIDAgMTJweDtib3JkZXI6MXB4IHNvbGlkICNlNGQ2Yjg7Ym9yZGVyLXJhZGl1czoxMnB4O2JhY2tncm91bmQ6I2ZmZmFmMDtjb2xvcjojNzM1YzMwO2ZvbnQtc2l6ZToxMXB4O2xpbmUtaGVpZ2h0OjEuN30uYXR0LW92ZXJ2aWV3IHN0cm9uZ3tjb2xvcjojNWQ0ODI2fS5hdHQtbGlzdC1jYXB0aW9ue2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47Z2FwOjEwcHg7bWFyZ2luOjEzcHggMXB4IDhweH0uYXR0LWxpc3QtY2FwdGlvbiBzcGFue2ZvbnQtc2l6ZToxMHB4O2NvbG9yOnZhcigtLW11dGVkKX0K');
const helperPatch = decode('ZnVuY3Rpb24gYXR0UGxhbihlKXtjb25zdCBhPWFuc3dlcihlLmlkKSxjPWNvbW1lbnRPZihlLmlkKTtyZXR1cm4gYDxhcnRpY2xlIGNsYXNzPSJjYXJkIGF0dC1wbGFuICR7YT09PW51bGw/J3BlbmRpbmcnOicnfSI+PGRpdiBjbGFzcz0iYXR0LXBsYW4taGVhZCI+PGRpdiBjbGFzcz0iYXR0LXBsYW4tZGF0ZSI+PHN0cm9uZz4ke2RzKGUuZGF0ZSl9PC9zdHJvbmc+JHtncmFkZShlLmdyYWRlKX08L2Rpdj48ZGl2IGNsYXNzPSJhdHQtcGxhbi10aXRsZSI+JHtlLnRpdGxlfTwvZGl2PjxkaXYgY2xhc3M9ImF0dC1wbGFuLW1ldGEiPjxzcGFuPiR7aWNvbignY2xvY2snKX0gJHtlLm1lZXR96ZuG5ZCIIO+8jyAke2UuZW5kfee1guS6huS6iOWumjwvc3Bhbj48c3Bhbj4ke2ljb24oJ3BpbicpfSAke2UucGxhY2V9PC9zcGFuPiR7ZS5tZW1vP2A8c3Bhbj4ke2ljb24oJ2luZm8nKX0gJHtlc2MoZS5tZW1vKX08L3NwYW4+YDonJ308L2Rpdj48L2Rpdj48ZGl2IGNsYXNzPSJhdHQtcGxhbi1pbnB1dCI+JHtjaG9pY2VzKGUpfTxkaXYgY2xhc3M9ImF0dC1wbGFuLXRvb2xzIj48YnV0dG9uIGNsYXNzPSJjb21tZW50LWJ0biIgZGF0YS1hY3Rpb249ImNvbW1lbnQiIGRhdGEtaWQ9IiR7ZS5pZH0iPiR7aWNvbignY2hhdCcpfSR7dWkuY2F0ZWdvcnk9PT0ncGFyZW50Jz8n44Kz44Oh44Oz44OI44O75biv5ZCMJzon44Kz44Oh44Oz44OIJ308L2J1dHRvbj48c3BhbiBjbGFzcz0iYXR0LXBsYW4tc3RhdHVzIj4ke2E9PT1udWxsPyfmnKrlhaXlipsnOmE9PT0neWVzJz8n4peLIOWHuuW4rSc6J8OXIOasoOW4rSd9PC9zcGFuPjwvZGl2PiR7Yy50ZXh0fHxjLmNvbXBhbmlvbj9gPGRpdiBjbGFzcz0iY29tbWVudC1wcmV2aWV3Ij4ke2MuY29tcGFuaW9uPyc8Yj7luK/lkIzjgYLjgoo8L2I+44CAJzonJ30ke2VzYyhjLnRleHQpfTwvZGl2PmA6Jyd9PC9kaXY+PC9hcnRpY2xlPmA7fQo=');
const attendancePatch = decode('ZnVuY3Rpb24gYXR0ZW5kYW5jZSgpe2NvbnN0IGFsbD1vd25FdmVudHMoKSxsaXN0PXVpLm9ubHlQZW5kaW5nP2FsbC5maWx0ZXIoZT0+YW5zd2VyKGUuaWQpPT09bnVsbCk6YWxsLG49YWxsLmZpbHRlcihlPT5hbnN3ZXIoZS5pZCk9PT1udWxsKS5sZW5ndGg7cmV0dXJuIGAke3BhZ2VIZWFkKCdBVFRFTkRBTkNFJywn5LqI5a6a44KS6KaL44Gq44GM44KJ5Ye65qygJywn5LqI5a6a44O75pmC6ZaT44O75aC05omA44KS56K66KqN44GX44Gq44GM44KJ44CB44Gd44Gu5aC044Gn4peLw5fjgpLlhaXlipvjgIInKX08ZGl2IGNsYXNzPSJzZWdtZW50IiBhcmlhLWxhYmVsPSLlh7rmrKDjga7nqK7poZ4iPiR7W1sncGFyZW50Jywn5L+d6K236ICFJ10sWydwbGF5ZXInLCfpgbjmiYsnXSxbJ2NvYWNoJywn5oyH5bCO6ICFJ11dLm1hcCgoW3YsdF0pPT5gPGJ1dHRvbiBjbGFzcz0iJHt1aS5jYXRlZ29yeT09PXY/J2FjdGl2ZSc6Jyd9IiBkYXRhLWFjdGlvbj0iY2F0ZWdvcnkiIGRhdGEtdmFsdWU9IiR7dn0iIGFyaWEtcHJlc3NlZD0iJHt1aS5jYXRlZ29yeT09PXZ9Ij4ke3R9PC9idXR0b24+YCkuam9pbignJyl9PC9kaXY+PGRpdiBjbGFzcz0idGFiLWxpbmUiPjxidXR0b24gY2xhc3M9IiR7dWkuYXR0Vmlldz09PSdtaW5lJz8nYWN0aXZlJzonJ30iIGRhdGEtYWN0aW9uPSJhdHQtdmlldyIgZGF0YS12YWx1ZT0ibWluZSI+5LqI5a6a77yL6Ieq5YiG44Gu5Ye65qygPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iJHt1aS5hdHRWaWV3PT09J3RlYW0nPydhY3RpdmUnOicnfSIgZGF0YS1hY3Rpb249ImF0dC12aWV3IiBkYXRhLXZhbHVlPSJ0ZWFtIj7jgb/jgpPjgarjga7lh7rmrKA8L2J1dHRvbj48L2Rpdj4ke3VpLmF0dFZpZXc9PT0ndGVhbSc/dGVhbUF0dGVuZGFuY2UoKTpgJHtwZXJzb25hKCl9PGRpdiBjbGFzcz0iYXR0LW92ZXJ2aWV3Ij48c3Ryb25nPuS6iOWumuOCkueiuuiqjeOBl+OBquOBjOOCieOAgeOBneOBruOBvuOBvuWFpeWKm+OBp+OBjeOBvuOBmeOAgjwvc3Ryb25nPjxicj7ml6Xku5jjg7vnt7Tnv5LvvI/oqablkIjjg7vpm4blkIjmmYLplpPjg7vjgrDjg6njgqbjg7Pjg4njgpLlkIzjgZjjgqvjg7zjg4nlhoXjgavooajnpLrjgZfjgabjgYTjgb7jgZnjgII8L2Rpdj48ZGl2IGNsYXNzPSJzcHJlYWQiPjxzcGFuIGNsYXNzPSJ0aW55IHN1YnRsZSI+5pyq5YWl5YqbIDxiIHN0eWxlPSJjb2xvcjojOTM3NzNlIj4ke259PC9iPiDku7Y8L3NwYW4+PGJ1dHRvbiBjbGFzcz0icGVuZGluZy10b2dnbGUiIGRhdGEtYWN0aW9uPSJwZW5kaW5nLXRvZ2dsZSIgYXJpYS1wcmVzc2VkPSIke3VpLm9ubHlQZW5kaW5nfSI+PHNwYW4gY2xhc3M9InN3aXRjaCI+PC9zcGFuPuacquWFpeWKm+OBruOBvzwvYnV0dG9uPjwvZGl2PjxkaXYgY2xhc3M9ImF0dC1saXN0LWNhcHRpb24iPjxzdHJvbmcgc3R5bGU9ImZvbnQtc2l6ZToxMnB4Ij7ku4rlvozjga7kuojlrprjgajlh7rmrKA8L3N0cm9uZz48c3Bhbj7kuojlrpog4oaSIOKXi8OX5YWl5YqbPC9zcGFuPjwvZGl2PjxkaXYgY2xhc3M9ImF0dC1wbGFuLWxpc3QiPiR7bGlzdC5sZW5ndGg/bGlzdC5tYXAoYXR0UGxhbikuam9pbignJyk6YDxkaXYgY2xhc3M9ImNhcmQgZW1wdHkiPiR7aWNvbignY2hlY2snKX3jgZnjgbnjgablhaXlipvjgafjgY3jgb7jgZfjgZ/jgII8YnI+PGJ1dHRvbiBjbGFzcz0idGV4dC1idG4iIHN0eWxlPSJtYXJnaW46NnB4IGF1dG8gMCIgZGF0YS1hY3Rpb249InBlbmRpbmctdG9nZ2xlIj7lhaXlipvmuIjjgb/jgoLopovjgos8L2J1dHRvbj48L2Rpdj5gfTwvZGl2PjxwIGNsYXNzPSJsaW5rLW5vdGUiPuKXi8OX44O744Kz44Oh44Oz44OI44Gv44GT44Gu56uv5pyr44Gu6Kmm5L2c44Gr44Gg44GR5L+d5a2Y44GX44G+44GZ44CCPGJyPuacrOeVquOBuOOBruWFpeWKm+ODu+mAgeS/oeOBr+ihjOOBhOOBvuOBm+OCk+OAgjwvcD5gfWA7fQo=');
if (!html.includes('/* Attendance v4: schedule + input in one view */')) html = html.replace('/* Duty */', cssPatch + '/* Duty */');
if (!html.includes('function attPlan(e)')) html = html.replace('function persona()', helperPatch + 'function persona()');
html = html.replace(/function attendance\(\)\{[\s\S]*?\}\s*function dutyRow/, attendancePatch + 'function dutyRow');
html = html.replaceAll('UI PROTOTYPE 03', 'UI PROTOTYPE 04');
html = html.replace('version:3', 'version:4').replace("const STORE='teamcore-ui-prototype-v3'", "const STORE='teamcore-ui-prototype-v4'").replace('s.version===3&&', 's.version===4&&');
html = html.replace('予定と学年の切り替え、出欠入力、コメント・帯同、お知らせの確認', '予定を見ながらの出欠入力、学年切り替え、コメント・帯同、お知らせの確認');
if (!html.includes('予定を見ながら出欠') || !html.includes('function attPlan(e)')) throw new Error('Attendance v4 patch failed. Nothing will be published.');

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
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
writeFileSync(join(out, '404.html'), '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>TEAM CORE 操作試作</title><h1>このページはありません</h1><p>このURLはサンプルの操作試作用です。本番のページ・APIは含みません。</p><a href="/">試作のホームへ</a></html>');
writeFileSync(join(out, '_headers'), `/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow, noarchive\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()\n  Content-Security-Policy: default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\n`);
const allowed = new Set(['index.html', 'robots.txt', '404.html', '_headers']);
if (readdirSync(out).some(name => !allowed.has(name))) {
  throw new Error('Unexpected file in the preview publish directory.');
}
console.log('Verified isolated sample UI v4. Schedule and attendance are shown together.');
