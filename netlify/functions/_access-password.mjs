import { accessSettings } from "./_access-state.mjs";
import { limitedPasswordCheck } from "./_access-rate-limit.mjs";
import { boardSessionTokenIsValid } from "./_board-session.mjs";
import { coachSessionTokenIsValid } from "./_coach-session.mjs";

const DEFAULTS = {
  board: { salt: "yachiyo-access-v1", hash: "19eb403934ae615b2961d9f6b5ddd86aab32a0fdf4e96adeb8aa2fcb351276ba", env: "ACCESS_PASSWORD" },
  coach: { salt: "yachiyo-coach-access-v1", hash: "937e76fe820379b5e095356a7dae5cbd223b5c9af6dd444e48a3f3b34bd4f8eb", env: "COACH_ACCESS_PASSWORD" },
};
function safeEqual(a, b) {
  const left = String(a || ""), right = String(b || "");
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
async function passwordHash(password, salt) {
  return Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${password}`))).toString("hex");
}

export async function verifyAccessPassword({ role, store, request, context, password, legacyFallback = true }) {
  const entered = String(password || "");
  const validator = role === "board" ? boardSessionTokenIsValid : coachSessionTokenIsValid;
  if (await validator(entered, { store, request })) return true;
  if (!entered || entered.length > 128) return false;
  // A stale session is not a password guess. Polling with it must not lock out
  // other people on the same network after a password change or normal expiry.
  if (/^\d{10,12}\.[A-Za-z0-9_-]{43}$/.test(entered)) return false;
  const defaults = DEFAULTS[role];
  const settings = await accessSettings(role, { store, request });
  return limitedPasswordCheck({ store, context, role, version: String(settings?.authVersion || ""), verify: async () => {
    if (settings?.salt && settings?.hash) return safeEqual(await passwordHash(entered, settings.salt), settings.hash);
    if (process.env[defaults.env]) return safeEqual(entered, process.env[defaults.env]);
    return legacyFallback && safeEqual(await passwordHash(entered, defaults.salt), defaults.hash);
  } });
}
