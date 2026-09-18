const COACH_SESSION_COOKIE = "yls_coach_session";
const COACH_SESSION_SECONDS = 60 * 60 * 4;
const DEFAULT_ACCESS_HASH =
  "937e76fe820379b5e095356a7dae5cbd223b5c9af6dd444e48a3f3b34bd4f8eb";

function safeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function signCoachSession(value) {
  const secret =
    process.env.COACH_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    process.env.COACH_ACCESS_PASSWORD ||
    DEFAULT_ACCESS_HASH;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`coach:${value}`)
  );
  return base64Url(new Uint8Array(signature));
}

export async function createCoachSessionToken() {
  const expiresAt = Math.floor(Date.now() / 1000) + COACH_SESSION_SECONDS;
  const value = String(expiresAt);
  return `${value}.${await signCoachSession(value)}`;
}

export async function coachSessionTokenIsValid(token) {
  const [expiresAt, signature, extra] = String(token || "").split(".");
  if (
    !expiresAt ||
    !signature ||
    extra ||
    !/^\d+$/.test(expiresAt) ||
    Number(expiresAt) < Math.floor(Date.now() / 1000)
  ) return false;
  return safeEqual(signature, await signCoachSession(expiresAt));
}

function getCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const prefix = `${name}=`;
  const part = cookie.split(";").map(item => item.trim())
    .find(item => item.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : "";
}

export async function coachSessionIsValid(request) {
  return coachSessionTokenIsValid(getCookie(request, COACH_SESSION_COOKIE));
}

export function coachSessionCookie(token) {
  return (
    `${COACH_SESSION_COOKIE}=${encodeURIComponent(token)}; ` +
    `Path=/; Max-Age=${COACH_SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`
  );
}

export { COACH_SESSION_COOKIE, COACH_SESSION_SECONDS };
