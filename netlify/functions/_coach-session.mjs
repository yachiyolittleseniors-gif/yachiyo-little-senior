import { accessSessionSignature } from "./_access-state.mjs";

const COACH_SESSION_COOKIE = "yls_coach_session";
const COACH_SESSION_SECONDS = 60 * 60 * 4;

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

async function signCoachSession(value, options) {
  return accessSessionSignature("coach", value, options);
}

export async function createCoachSessionToken(options) {
  const expiresAt = Math.floor(Date.now() / 1000) + COACH_SESSION_SECONDS;
  const value = String(expiresAt);
  return `${value}.${await signCoachSession(value, options)}`;
}

export async function coachSessionTokenIsValid(token, options) {
  const value = String(token || "");
  if (!/^\d{10,12}\.[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const [expiresAt, signature] = value.split(".");
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  try { return safeEqual(signature, await signCoachSession(expiresAt, options)); }
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

export async function coachSessionIsValid(request) {
  return coachSessionTokenIsValid(getCookie(request, COACH_SESSION_COOKIE), { request });
}

export function coachSessionCookie(token) {
  return (
    `${COACH_SESSION_COOKIE}=${encodeURIComponent(token)}; ` +
    `Path=/; Max-Age=${COACH_SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`
  );
}

export { COACH_SESSION_COOKIE, COACH_SESSION_SECONDS };
