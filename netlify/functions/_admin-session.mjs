import { accessVersion } from "./_access-state.mjs";

export const ADMIN_SESSION_SECONDS = 30 * 60;
export const ADMIN_SESSION_COOKIE = "__Host-yls_admin";

async function signingKey(request) {
  // Include the admin password so changing it invalidates existing sessions.
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is not configured");
  const version = await accessVersion("board", { request });
  return crypto.subtle.importKey("raw", new TextEncoder().encode(
    `yls-admin-v1:${process.env.ADMIN_SESSION_SECRET || ""}:${password}${version ? `:board:${version}` : ""}`
  ), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createAdminSession(request) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ADMIN_SESSION_SECONDS;
  const nonce = encode(crypto.getRandomValues(new Uint8Array(32)));
  const value = `${issuedAt}.${expiresAt}.${nonce}`;
  const signature = await crypto.subtle.sign("HMAC", await signingKey(request), new TextEncoder().encode(value));
  return { token: `${value}.${encode(new Uint8Array(signature))}`, expiresAt: expiresAt * 1000 };
}

export async function adminSession(request) {
  try {
    const cookie = request.headers.get("cookie") || "";
    const entry = cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${ADMIN_SESSION_COOKIE}=`));
    const token = entry ? decodeURIComponent(entry.slice(ADMIN_SESSION_COOKIE.length + 1)) : "";
    const parts = token.split(".");
    if (parts.length !== 4) return null;
    const [issued, expires, nonce, signature] = parts;
    if (!/^\d{10}$/.test(issued) || !/^\d{10}$/.test(expires) || !/^[A-Za-z0-9_-]{43}$/.test(nonce) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
    const now = Math.floor(Date.now() / 1000);
    if (Number(issued) > now || Number(expires) <= now || Number(expires) - Number(issued) !== ADMIN_SESSION_SECONDS) return null;
    const bytes = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/") + "="), character => character.charCodeAt(0));
    const ok = await crypto.subtle.verify("HMAC", await signingKey(request), bytes, new TextEncoder().encode(parts.slice(0, 3).join(".")));
    return ok ? { expiresAt: Number(expires) * 1000 } : null;
  } catch { return null; }
}

export function adminSessionCookie(token) {
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${ADMIN_SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

