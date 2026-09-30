const BOARD_SESSION_COOKIE = "yls_board_session";
const BOARD_SESSION_SECONDS = 60 * 60 * 4;

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

async function signBoardSession(value) {
  const secret =
    process.env.BOARD_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    process.env.ACCESS_PASSWORD;
  if (!secret) throw new Error("Board session signing secret is not configured");
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
    new TextEncoder().encode(value)
  );
  return base64Url(new Uint8Array(signature));
}

export async function createBoardSessionToken() {
  const expiresAt = Math.floor(Date.now() / 1000) + BOARD_SESSION_SECONDS;
  const value = String(expiresAt);
  return `${value}.${await signBoardSession(value)}`;
}

export async function boardSessionTokenIsValid(token) {
  const value = String(token || "");
  if (!/^\d{10,12}\.[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const [expiresAt, signature] = value.split(".");
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  try { return safeEqual(signature, await signBoardSession(expiresAt)); }
  catch { return false; }
}

function getCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const prefix = `${name}=`;
  const part = cookie.split(";").map(item => item.trim())
    .find(item => item.startsWith(prefix));
  try { return part ? decodeURIComponent(part.slice(prefix.length)) : ""; }
  catch { return ""; }
}

export async function boardSessionIsValid(request) {
  return boardSessionTokenIsValid(getCookie(request, BOARD_SESSION_COOKIE));
}

export function boardSessionCookie(token) {
  return (
    `${BOARD_SESSION_COOKIE}=${encodeURIComponent(token)}; ` +
    `Path=/; Max-Age=${BOARD_SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`
  );
}

export { BOARD_SESSION_COOKIE, BOARD_SESSION_SECONDS };
