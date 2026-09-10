const MAX_FAILURES = 5;
const LOCK_SECONDS = 15 * 60;
const PREFIX = "security/admin-rate-limit";

function safeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    difference |=
      (left.charCodeAt(i) || 0) ^
      (right.charCodeAt(i) || 0);
  }

  return difference === 0;
}

async function clientKey(request, context) {
  const address = String(
    context?.ip ||
    request.headers.get("x-nf-client-connection-ip") ||
    "unknown"
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(address)
  );
  const hash = Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");
  return `${PREFIX}/${hash}.json`;
}

export async function verifyAdminPassword({
  store,
  request,
  context,
  expectedPassword,
}) {
  if (!expectedPassword) {
    return { ok: false, notConfigured: true };
  }

  const key = await clientKey(request, context);
  const now = Date.now();
  let state = null;

  try {
    state = await store.get(key, {
      type: "json",
      consistency: "strong",
    });
  } catch {
    state = null;
  }

  const lockedUntil = Number(state?.lockedUntil || 0);
  if (lockedUntil > now) {
    return {
      ok: false,
      locked: true,
      retryAfter: Math.max(1, Math.ceil((lockedUntil - now) / 1000)),
    };
  }

  const entered = request.headers.get("x-admin-password") || "";
  if (safeEqual(entered, expectedPassword)) {
    if (state) await store.delete(key);
    return { ok: true };
  }

  const failures = lockedUntil ? 1 : Number(state?.failures || 0) + 1;
  const nextLockedUntil = failures >= MAX_FAILURES
    ? now + LOCK_SECONDS * 1000
    : 0;

  await store.setJSON(key, {
    failures,
    lockedUntil: nextLockedUntil,
    updatedAt: new Date(now).toISOString(),
  });

  return {
    ok: false,
    locked: nextLockedUntil > 0,
    retryAfter: nextLockedUntil > 0 ? LOCK_SECONDS : 0,
  };
}

export function adminAuthError(json, result) {
  if (result.notConfigured) {
    return json({ error: "ADMIN_PASSWORD is not configured" }, 503);
  }
  if (result.locked) {
    return json(
      { error: "Too many attempts. Try again later." },
      429,
      { "retry-after": String(result.retryAfter) }
    );
  }
  return json({ error: "unauthorized" }, 401);
}
