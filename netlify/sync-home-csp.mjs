import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Hash trusted home scripts without loosening CSP or changing other pages' permissions.
export function inlineScriptHashes(html) {
  const hashes = new Set();
  const source = html.replace(/\r\n?/g, '\n');
  const scripts = /<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of source.matchAll(scripts)) {
    const attributes = new Map();
    const pattern = /(?:^|\s)([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (const attribute of match[1].matchAll(pattern)) {
      attributes.set(attribute[1].toLowerCase(), attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
    }
    if (attributes.has('src')) continue;
    const type = (attributes.get('type') || '').trim().toLowerCase().split(';')[0].trim();
    if (type && !['module', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript'].includes(type)) continue;
    if (!match[2].trim()) continue;
    hashes.add("'sha256-" + createHash('sha256').update(match[2], 'utf8').digest('base64') + "'");
  }
  if (!hashes.size) throw new Error('No inline home scripts found; refusing to change CSP.');
  return [...hashes];
}

export function synchronizeHomeCsp(html, headers) {
  const hashes = inlineScriptHashes(html);
  let policyCount = 0;
  let added = 0;
  const content = headers.replace(/^([ \t]*Content-Security-Policy:[ \t]*)([^\r\n]*)/gmi, (_line, prefix, policy) => {
    policyCount += 1;
    if (!/(?:^|;)\s*script-src\s/i.test(policy)) throw new Error('Expected an existing script-src policy.');
    const directives = policy.split(';').map(directive => {
      if (!/^\s*script-src(?:-elem)?\s/i.test(directive)) return directive;
      const tokens = new Set(directive.trim().split(/\s+/));
      if (tokens.has("'unsafe-inline'")) throw new Error('Inline-script restrictions must remain enabled.');
      const missing = hashes.filter(hash => !tokens.has(hash));
      added += missing.length;
      return missing.length ? directive.trimEnd() + ' ' + missing.join(' ') : directive;
    });
    return prefix + directives.join(';');
  });
  if (!policyCount) throw new Error('No existing CSP header found; refusing to replace security settings.');
  return { content, added, scripts: hashes.length };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const headerPath = resolve(root, '_headers');
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const headers = readFileSync(headerPath, 'utf8');
  const result = synchronizeHomeCsp(html, headers);
  if (result.content !== headers) writeFileSync(headerPath, result.content, 'utf8');
  console.log(`Home CSP: ${result.scripts} inline scripts verified; ${result.added} missing hash permissions added.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
