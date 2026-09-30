import { getStore } from "@netlify/blobs";

const SETTINGS_KEYS = {
  board: "content/access-settings.json",
  coach: "content/coach-attendance-access.json",
};
const snapshots = new WeakMap();

// Only share a snapshot within one HTTP request. A new request always observes
// password changes using a strongly consistent read, without a stale time cache.
export async function accessSettings(role, { store, request } = {}) {
  const key = SETTINGS_KEYS[role];
  if (!key) throw new Error("Invalid access role");
  const read = () => (store || getStore({ name: "yachiyo-public-site", consistency: "strong" }))
    .get(key, { type: "json", consistency: "strong" });
  if (!request) return read();
  let cached = snapshots.get(request);
  if (!cached) { cached = new Map(); snapshots.set(request, cached); }
  if (!cached.has(role)) cached.set(role, read());
  return cached.get(role);
}

export async function accessVersion(role, options) {
  return String((await accessSettings(role, options))?.authVersion || "");
}

export async function accessSessionSignature(role, value, options) {
  const secret = role === "board"
    ? process.env.BOARD_SESSION_SECRET || process.env.ADMIN_PASSWORD || process.env.ACCESS_PASSWORD
    : process.env.COACH_SESSION_SECRET || process.env.ADMIN_PASSWORD || process.env.COACH_ACCESS_PASSWORD;
  if (!secret) throw new Error("Access session signing secret is not configured");
  const version = await accessVersion(role, options);
  // Keep existing sessions valid at deployment. Only an explicit password change
  // introduces/rotates authVersion and invalidates signatures from the old version.
  const legacyValue = role === "coach" ? `coach:${value}` : value;
  const signedValue = version ? `${legacyValue}:v2:${version}` : legacyValue;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedValue))).toString("base64url");
}
