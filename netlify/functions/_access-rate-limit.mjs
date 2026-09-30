export const ACCESS_FAILURE_LIMIT = 10;
export const ACCESS_WINDOW_SECONDS = 15 * 60;
const MAX_CONFLICT_RETRIES = 16;

export class AccessRateLimitError extends Error {
  constructor(retryAfter) {
    const seconds = Math.max(1, Math.ceil(retryAfter));
    super(`ログインの試行回数が多いため、一時的に制限しています。約${Math.max(1, Math.ceil(seconds / 60))}分後にお試しください。`);
    this.retryAfter = seconds;
  }
}

export function accessRateLimitResponse(error) {
  if (!(error instanceof AccessRateLimitError)) return null;
  return new Response(JSON.stringify({ ok: false, error: error.message, code: "ACCESS_RATE_LIMITED" }), {
    status: 429,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": String(error.retryAfter) },
  });
}

async function counterKey(role, version, context) {
  // Netlify supplies context.ip. Never trust a client-supplied forwarding header.
  const value = `${role}:${version}:${String(context?.ip || "unknown")}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `security/access-rate-limit/${role}/${Buffer.from(digest).toString("hex")}.json`;
}

async function reserve(store, key) {
  for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
    const entry = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
    if (entry && !entry.etag) throw new Error("Missing password limiter ETag");
    const now = Date.now();
    const active = Number(entry?.data?.expiresAt) > now;
    const count = active ? Math.max(0, Number(entry.data.count) || 0) : 0;
    const expiresAt = active ? Number(entry.data.expiresAt) : now + ACCESS_WINDOW_SECONDS * 1000;
    if (count >= ACCESS_FAILURE_LIMIT) throw new AccessRateLimitError((expiresAt - now) / 1000);
    // Reserve before checking a password so parallel guesses cannot share a slot.
    const state = { count: count + 1, expiresAt };
    const result = await store.setJSON(key, state, entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
    if (result.modified && result.etag) return state;
    if (result.modified) throw new Error("Password limiter write was not confirmed");
  }
  // Contention or a storage failure must not turn off the limiter.
  throw new AccessRateLimitError(1);
}

async function release(store, key, ticket) {
  for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
    const entry = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
    if (!entry || entry.data.expiresAt !== ticket.expiresAt || !entry.data.count) return;
    if (!entry.etag) throw new Error("Missing password limiter ETag");
    const result = await store.setJSON(key, { ...entry.data, count: Math.max(0, entry.data.count - 1) }, { onlyIfMatch: entry.etag });
    if (result.modified && result.etag) return;
    if (result.modified) throw new Error("Password limiter write was not confirmed");
  }
  throw new AccessRateLimitError(1);
}

export async function limitedPasswordCheck({ store, context, role, version, verify }) {
  const key = await counterKey(role, version, context);
  const ticket = await reserve(store, key);
  const valid = await verify();
  if (valid) {
    // Successful logins do not consume the failure allowance for a shared Wi-Fi.
    await release(store, key, ticket);
    return true;
  }
  if (ticket.count >= ACCESS_FAILURE_LIMIT) throw new AccessRateLimitError((ticket.expiresAt - Date.now()) / 1000);
  return false;
}
