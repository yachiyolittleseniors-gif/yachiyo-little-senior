import { verifyAccessPassword } from "./_access-password.mjs";
import { accessRateLimitResponse } from "./_access-rate-limit.mjs";
import { accessVersion } from "./_access-state.mjs";
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
  createBoardSessionToken,
} from "./_board-session.mjs";

const STORE = "yachiyo-public-site";
const CREDENTIALS_KEY = "auth/board-passkeys.json";
const CHALLENGE_PREFIX = "auth/board-passkey-challenge/";
const CHALLENGE_LIFETIME = 5 * 60 * 1000;
// Capacity for 1,000 members with up to five passkeys each.
const MAX_CREDENTIALS = 5000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-passkey-capacity": String(MAX_CREDENTIALS), ...headers },
  });
}
async function accessIsValid(store, request, context) {
  if (await boardSessionIsValid(request)) return true;
  return verifyAccessPassword({ role: "board", store, request, context, password: request.headers.get("x-access-password"), legacyFallback: false });
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
async function loadCredentials(store, request) {
  const saved = await store.get(CREDENTIALS_KEY, { type: "json", consistency: "strong" });
  const version = await accessVersion("board", { store, request });
  if (String(saved?.authVersion || "") !== version) return [];
  return Array.isArray(saved?.credentials) ? saved.credentials : [];
}
async function saveChallenge(store, type, options, rp, request) {
  const ceremonyID = randomID();
  await store.setJSON(`${CHALLENGE_PREFIX}${ceremonyID}.json`, {
    authVersion: await accessVersion("board", { store, request }),
    type, challenge: options.challenge, origin: rp.origin, rpID: rp.rpID,
    expiresAt: Date.now() + CHALLENGE_LIFETIME,
  });
  return ceremonyID;
}
async function takeChallenge(store, ceremonyID, expectedType, request) {
  const cleanID = String(ceremonyID || "");
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(cleanID)) return null;
  const key = `${CHALLENGE_PREFIX}${cleanID}.json`;
  const challenge = await store.get(key, { type: "json", consistency: "strong" });
  await store.delete(key).catch(() => {});
  if (!challenge || challenge.type !== expectedType || Number(challenge.expiresAt) < Date.now()) return null;
  if (String(challenge.authVersion || "") !== await accessVersion("board", { store, request })) return null;
  return challenge;
}

export default async (request, context) => {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "unauthorized origin" }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
  const action = String(body?.action || "");
  const store = getStore({ name: STORE, consistency: "strong" });
  try {
    await accessVersion("board", { store, request });
    if (action === "registration-options") {
      if (!(await accessIsValid(store, request, context))) return json({ error: "unauthorized" }, 401);
      const credentials = await loadCredentials(store, request);
      if (credentials.length >= MAX_CREDENTIALS) return json({ error: "登録上限に達しました。" }, 409);
      const rp = relyingParty(request);
      const options = await generateRegistrationOptions({
        rpName: "八千代リトルシニア チーム専用ページ",
        rpID: rp.rpID,
        userID: new TextEncoder().encode("yls-team-board-v1"),
        userName: "team-board",
        userDisplayName: "チーム専用ページ",
        attestationType: "none",
        excludeCredentials: credentials.map(item => ({ id: item.id, transports: item.transports })),
        authenticatorSelection: {
          authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required",
        },
        supportedAlgorithmIDs: [-7, -257],
      });
      return json({ options, ceremonyID: await saveChallenge(store, "registration", options, rp, request) });
    }
    if (action === "registration-verify") {
      if (!(await accessIsValid(store, request, context))) return json({ error: "unauthorized" }, 401);
      const challenge = await takeChallenge(store, body?.ceremonyID, "registration", request);
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
      const credentials = await loadCredentials(store, request);
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
      await store.setJSON(CREDENTIALS_KEY, { credentials: updated, authVersion: await accessVersion("board", { store, request }) });
      return json({ ok: true });
    }
    if (action === "delete-credential") {
      if (!(await accessIsValid(store, request, context))) return json({ error: "unauthorized" }, 401);
      const credentialID = String(body?.credentialID || "");
      if (!credentialID) return json({ error: "削除する生体認証を確認できませんでした。" }, 400);
      const credentials = await loadCredentials(store, request);
      const updated = credentials.filter(item => item.id !== credentialID);
      if (updated.length === credentials.length) return json({ error: "登録済みの生体認証が見つかりません。" }, 404);
      await store.setJSON(CREDENTIALS_KEY, { credentials: updated, authVersion: await accessVersion("board", { store, request }) });
      return json({ ok: true });
    }
    if (action === "authentication-options") {
      const credentials = await loadCredentials(store, request);
      if (!credentials.length) return json({ error: "registered passkey not found" }, 404);
      const rp = relyingParty(request);
      const options = await generateAuthenticationOptions({
        rpID: rp.rpID,
        allowCredentials: credentials.map(item => ({ id: item.id, transports: item.transports })),
        userVerification: "required",
      });
      return json({ options, ceremonyID: await saveChallenge(store, "authentication", options, rp, request) });
    }
    if (action === "authentication-verify") {
      const challenge = await takeChallenge(store, body?.ceremonyID, "authentication", request);
      if (!challenge) return json({ error: "認証の有効時間が切れました。" }, 400);
      const credentials = await loadCredentials(store, request);
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
      await store.setJSON(CREDENTIALS_KEY, { credentials, authVersion: await accessVersion("board", { store, request }) });
      const token = await createBoardSessionToken({ store, request });
      return json({ ok: true, token, credentialID: credential.id }, 200, { "set-cookie": boardSessionCookie(token) });
    }
    return json({ error: "unknown action" }, 400);
  } catch (error) {
    const limited = accessRateLimitResponse(error);
    if (limited) return limited;
    console.error("passkey-auth", action, error);
    return json({ error: "生体認証を完了できませんでした。" }, 400);
  }
};
