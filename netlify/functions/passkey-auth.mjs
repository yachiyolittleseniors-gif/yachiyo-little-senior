import { getStore } from "@netlify/blobs";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import {
  boardSessionCookie,
  boardSessionIsValid,
  boardSessionTokenIsValid,
  createBoardSessionToken,
} from "./_board-session.mjs";

const STORE = "yachiyo-public-site";
const CREDENTIALS_KEY = "auth/board-passkeys.json";
const CHALLENGE_PREFIX = "auth/board-passkey-challenge/";
const ACCESS_CONFIG_KEY = "content/access-settings.json";
const DEFAULT_ACCESS_SALT = "yachiyo-access-v1";
const DEFAULT_ACCESS_HASH =
  "19eb403934ae615b2961d9f6b5ddd86aab32a0fdf4e96adeb8aa2fcb351276ba";
const CHALLENGE_LIFETIME = 5 * 60 * 1000;
// Capacity for 1,000 members with up to five passkeys each.
const MAX_CREDENTIALS = 5000;
// Some Android credential managers reject WebAuthn option lists over 64.
// This is a per-request limit, not the 5,000-entry server registry limit.
const MAX_WEBAUTHN_DESCRIPTORS = 64;

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
async function accessIsValid(store, request) {
  if (await boardSessionIsValid(request)) return true;
  const entered = String(request.headers.get("x-access-password") || "");
  if (await boardSessionTokenIsValid(entered)) return true;
  if (!entered || entered.length > 128) return false;
  const saved = await store.get(ACCESS_CONFIG_KEY, { type: "json", consistency: "strong" });
  if (saved?.salt && saved?.hash) {
    return safeEqual(await hashAccessPassword(entered, saved.salt), saved.hash);
  }
  if (process.env.ACCESS_PASSWORD) return safeEqual(entered, process.env.ACCESS_PASSWORD);
  return safeEqual(await hashAccessPassword(entered, DEFAULT_ACCESS_SALT), DEFAULT_ACCESS_HASH);
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
      if (!(await accessIsValid(store, request))) return json({ error: "unauthorized" }, 401);
      const credentials = await loadCredentials(store);
      if (credentials.length >= MAX_CREDENTIALS) return json({ error: "登録上限に達しました。" }, 409);
      const rp = relyingParty(request);
      const options = await generateRegistrationOptions({
        rpName: "八千代リトルシニア チーム専用ページ",
        rpID: rp.rpID,
        userID: new TextEncoder().encode("yls-team-board-v2"),
        userName: "yachiyo-little-senior",
        userDisplayName: "八千代リトルシニア チーム専用ページ",
        attestationType: "none",
        // Keep newer-credential duplicate prevention, but do not send more
        // than 64 excludeCredentials descriptors: Android rejects larger arrays.
        // Do NOT remove older server credentials, which remain usable for login.
        excludeCredentials: credentials.slice(0, MAX_WEBAUTHN_DESCRIPTORS).map(item => ({
          id: item.id,
          transports: item.transports,
        })),
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "required",
          requireResidentKey: true,
          userVerification: "required",
        },
        supportedAlgorithmIDs: [-7, -257],
      });
      return json({ options, ceremonyID: await saveChallenge(store, "registration", options, rp) });
    }
    if (action === "registration-verify") {
      if (!(await accessIsValid(store, request))) return json({ error: "unauthorized" }, 401);
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
      // A registration may finish after other registrations filled the remaining slots.
      // Reject the new credential instead of evicting an existing member's passkey.
      if (credentials.length >= MAX_CREDENTIALS && !credentials.some(item => item.id === credential.id)) {
        return json({ error: "登録上限に達しました。" }, 409);
      }
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
      const updated = [savedCredential, ...credentials.filter(item => item.id !== credential.id)];
      await store.setJSON(CREDENTIALS_KEY, { credentials: updated });
      return json({ ok: true, credentialID: savedCredential.id });
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
      const requestedCredentialID = String(body?.credentialID || "");
      const discoveryRequested = body?.discovery === true;
      let allowCredentials;

      if (requestedCredentialID) {
        const credential = credentials.find(item => item.id === requestedCredentialID);
        if (!credential) return json({ error: "registered passkey not found", code: "PASSKEY_BINDING_STALE" }, 404);
        allowCredentials = [{ id: credential.id, transports: credential.transports }];
      } else if (credentials.length <= MAX_WEBAUTHN_DESCRIPTORS) {
        // Small registries are safe to filter completely in the native sheet.
        allowCredentials = credentials.map(item => ({ id: item.id, transports: item.transports }));
      } else if (discoveryRequested) {
        // Existing devices may have a synced passkey but no browser-local ID yet.
        // Allow one discovery ceremony; after successful verification the client
        // stores the exact Yachiyo credential ID and future logins use one item.
      } else {
        // Never open an unfiltered native picker during ordinary team-page login.
        // The client falls back to the team password, then binds one credential
        // from the authenticated setup panel for future one-item allowlists.
        return json({
          error: "この端末の生体認証を再確認してください。",
          code: "PASSKEY_BINDING_REQUIRED",
        }, 409);
      }

      const rp = relyingParty(request);
      const options = await generateAuthenticationOptions({
        rpID: rp.rpID,
        ...(allowCredentials ? { allowCredentials } : {}),
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
      const token = await createBoardSessionToken();
      return json({ ok: true, token, credentialID: credential.id }, 200, { "set-cookie": boardSessionCookie(token) });
    }
    return json({ error: "unknown action" }, 400);
  } catch (error) {
    console.error("passkey-auth", action, error);
    return json({ error: "生体認証を完了できませんでした。" }, 400);
  }
};
