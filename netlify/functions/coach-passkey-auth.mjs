import { getStore } from "@netlify/blobs";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import {
  coachSessionCookie,
  coachSessionIsValid,
  coachSessionTokenIsValid,
  createCoachSessionToken,
} from "./_coach-session.mjs";

const STORE = "yachiyo-public-site";
const CREDENTIALS_KEY = "auth/coach-passkeys.json";
const CHALLENGE_PREFIX = "auth/coach-passkey-challenge/";
const ACCESS_CONFIG_KEY = "content/coach-attendance-access.json";
const DEFAULT_COACH_ACCESS_SALT = "yachiyo-coach-access-v1";
const DEFAULT_COACH_ACCESS_HASH =
  "937e76fe820379b5e095356a7dae5cbd223b5c9af6dd444e48a3f3b34bd4f8eb";
const CHALLENGE_LIFETIME = 5 * 60 * 1000;
const MAX_CREDENTIALS = 40;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
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
function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
async function hashAccessPassword(password, salt) {
  const input = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return bytesToHex(new Uint8Array(digest));
}
async function coachAccessIsValid(store, request) {
  if (await coachSessionIsValid(request)) return true;
  const entered = String(request.headers.get("x-coach-password") || "");
  if (await coachSessionTokenIsValid(entered)) return true;
  if (!entered || entered.length > 128) return false;
  const saved = await store.get(ACCESS_CONFIG_KEY, { type: "json", consistency: "strong" });
  if (saved?.salt && saved?.hash) {
    return safeEqual(await hashAccessPassword(entered, saved.salt), saved.hash);
  }
  if (process.env.COACH_ACCESS_PASSWORD) return safeEqual(entered, process.env.COACH_ACCESS_PASSWORD);
  return safeEqual(await hashAccessPassword(entered, DEFAULT_COACH_ACCESS_SALT), DEFAULT_COACH_ACCESS_HASH);
}
function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}
function fromBase64Url(value) {
  return new Uint8Array(Buffer.from(String(value || ""), "base64url"));
}
function randomID() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}
function relyingParty(request) {
  const requestUrl = new URL(request.url);
  const configuredOrigin = String(process.env.PASSKEY_ORIGIN || "").replace(/\/$/, "");
  const origin = configuredOrigin || requestUrl.origin;
  return { origin, rpID: process.env.PASSKEY_RP_ID || new URL(origin).hostname };
}
async function loadCredentials(store) {
  const saved = await store.get(CREDENTIALS_KEY, { type: "json", consistency: "strong" });
  return Array.isArray(saved?.credentials) ? saved.credentials : [];
}
async function saveChallenge(store, type, options, rp) {
  const ceremonyID = randomID();
  await store.setJSON(`${CHALLENGE_PREFIX}${ceremonyID}.json`, {
    type, challenge: options.challenge, origin: rp.origin, rpID: rp.rpID,
    expiresAt: Date.now() + CHALLENGE_LIFETIME,
  });
  return ceremonyID;
}
async function takeChallenge(store, ceremonyID, expectedType) {
  const cleanID = String(ceremonyID || "");
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(cleanID)) return null;
  const key = `${CHALLENGE_PREFIX}${cleanID}.json`;
  const challenge = await store.get(key, { type: "json", consistency: "strong" });
  await store.delete(key).catch(() => {});
  if (!challenge || challenge.type !== expectedType || Number(challenge.expiresAt) < Date.now()) return null;
  return challenge;
}

export default async request => {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
  const action = String(body?.action || "");
  const store = getStore({ name: STORE, consistency: "strong" });
  try {
    if (action === "registration-options") {
      if (!(await coachAccessIsValid(store, request))) return json({ error: "unauthorized" }, 401);
      const credentials = await loadCredentials(store);
      if (credentials.length >= MAX_CREDENTIALS) return json({ error: "登録上限に達しました。" }, 409);
      const rp = relyingParty(request);
      const options = await generateRegistrationOptions({
        rpName: "八千代リトルシニア 指導者出欠確認",
        rpID: rp.rpID,
        userID: new TextEncoder().encode("yls-coach-attendance-v1"),
        userName: "coach-attendance",
        userDisplayName: "指導者出欠確認",
        attestationType: "none",
        excludeCredentials: credentials.map(item => ({ id: item.id, transports: item.transports })),
        authenticatorSelection: {
          authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required",
        },
        supportedAlgorithmIDs: [-7, -257],
      });
      return json({ options, ceremonyID: await saveChallenge(store, "registration", options, rp) });
    }
    if (action === "registration-verify") {
      if (!(await coachAccessIsValid(store, request))) return json({ error: "unauthorized" }, 401);
      const challenge = await takeChallenge(store, body?.ceremonyID, "registration");
      if (!challenge) return json({ error: "認証の有効時間が切れました。" }, 400);
      const verification = await verifyRegistrationResponse({
        response: body?.credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: challenge.origin,
        expectedRPID: challenge.rpID,
        requireUserVerification: true,
      });
      if (!verification.verified || !verification.registrationInfo) {
        return json({ error: "登録を確認できませんでした。" }, 400);
      }
      const credentials = await loadCredentials(store);
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      const savedCredential = {
        id: credential.id,
        publicKey: base64Url(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || body?.credential?.response?.transports || [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        label: String(body?.label || "登録端末").trim().slice(0, 60),
        createdAt: new Date().toISOString(),
      };
      const updated = [savedCredential, ...credentials.filter(item => item.id !== credential.id)]
        .slice(0, MAX_CREDENTIALS);
      await store.setJSON(CREDENTIALS_KEY, { credentials: updated });
      return json({ ok: true });
    }
    if (action === "delete-credential") {
      const credentialID = String(body?.credentialID || "");
      if (!credentialID) return json({ error: "削除する生体認証を確認できませんでした。" }, 400);
      const credentials = await loadCredentials(store);
      const updated = credentials.filter(item => item.id !== credentialID);
      if (updated.length === credentials.length) return json({ error: "登録済みの生体認証が見つかりません。" }, 404);
      await store.setJSON(CREDENTIALS_KEY, { credentials: updated });
      return json({ ok: true });
    }
    if (action === "authentication-options") {
      const credentials = await loadCredentials(store);
      if (!credentials.length) return json({ error: "registered passkey not found" }, 404);
      const rp = relyingParty(request);
      const options = await generateAuthenticationOptions({
        rpID: rp.rpID,
        allowCredentials: credentials.map(item => ({ id: item.id, transports: item.transports })),
        userVerification: "required",
      });
      return json({ options, ceremonyID: await saveChallenge(store, "authentication", options, rp) });
    }
    if (action === "authentication-verify") {
      const challenge = await takeChallenge(store, body?.ceremonyID, "authentication");
      if (!challenge) return json({ error: "認証の有効時間が切れました。" }, 400);
      const credentials = await loadCredentials(store);
      const credential = credentials.find(item => item.id === body?.credential?.id);
      if (!credential) return json({ error: "登録済み端末ではありません。" }, 401);
      const verification = await verifyAuthenticationResponse({
        response: body.credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: challenge.origin,
        expectedRPID: challenge.rpID,
        credential: {
          id: credential.id,
          publicKey: fromBase64Url(credential.publicKey),
          counter: Number(credential.counter) || 0,
          transports: credential.transports,
        },
        requireUserVerification: true,
      });
      if (!verification.verified) return json({ error: "認証を確認できませんでした。" }, 401);
      credential.counter = verification.authenticationInfo.newCounter;
      credential.lastUsedAt = new Date().toISOString();
      await store.setJSON(CREDENTIALS_KEY, { credentials });
      const token = await createCoachSessionToken();
      return json({ ok: true, token }, 200, { "set-cookie": coachSessionCookie(token) });
    }
    return json({ error: "unknown action" }, 400);
  } catch (error) {
    console.error("coach-passkey-auth", action, error);
    return json({ error: "生体認証を完了できませんでした。" }, 400);
  }
};
