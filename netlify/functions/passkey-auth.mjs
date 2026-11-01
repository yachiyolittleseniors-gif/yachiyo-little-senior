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
import { verifyAccessPassword } from "./_access-password.mjs";
import { accessRateLimitResponse } from "./_access-rate-limit.mjs";
import { accessSettings, accessVersion } from "./_access-state.mjs";

const STORE = "yachiyo-public-site";
const CREDENTIALS_KEY = "auth/board-passkeys.json";
const CHALLENGE_PREFIX = "auth/board-passkey-challenge/";
const CHALLENGE_LIFETIME = 5 * 60 * 1000;
const MAX_REGISTRY_RETRIES = 5;
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
async function accessIsValid(store, request, context) {
  if (await boardSessionIsValid(request)) return true;
  return verifyAccessPassword({
    role: "board", store, request, context,
    password: request.headers.get("x-access-password"),
  });
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
class PasskeyError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
async function assertCurrentVersion(store, auth) {
  // Deliberately bypass the request snapshot for this check. Session creation
  // still uses that snapshot, so a later reset cannot mint a new-version token.
  if (await accessVersion("board", { store }) !== auth.version) {
    throw new PasskeyError("ログイン設定が変更されました。もう一度ログインしてください。", 401, "PASSKEY_AUTH_CHANGED");
  }
}
function confirmedWrite(result) {
  if (result?.modified && !result.etag) throw new Error("Passkey write was not confirmed");
  return result?.modified === true;
}
function registryConflict() {
  return new PasskeyError("登録情報が更新されました。もう一度お試しください。", 409);
}
async function readRegistry(store, auth) {
  for (let attempt = 0; attempt < MAX_REGISTRY_RETRIES; attempt += 1) {
    await assertCurrentVersion(store, auth);
    const entry = await store.getWithMetadata(CREDENTIALS_KEY, { type: "json", consistency: "strong" });
    if (entry && !entry.etag) throw new Error("Missing passkey registry ETag");
    const saved = entry?.data && typeof entry.data === "object" && !Array.isArray(entry.data) ? entry.data : {};
    const credentials = Array.isArray(saved.credentials) ? saved.credentials : [];
    const hasVersion = Object.prototype.hasOwnProperty.call(saved, "authVersion");
    if (!entry || hasVersion || !auth.allowLegacy) {
      // An explicitly bound empty version is different from an unversioned
      // registry. A reset revokes either older bound data or unbound leftovers.
      const current = hasVersion && saved.authVersion === auth.version;
      return { entry, saved, credentials: current ? credentials : [] };
    }
    // Older deployments stored valid keys without an authVersion, including
    // after earlier password changes. Adopt them once without changing any key.
    // Future password resets set passkeyVersionRequired to forbid this path.
    await assertCurrentVersion(store, auth);
    const bound = { ...saved, authVersion: auth.version };
    const result = await store.setJSON(CREDENTIALS_KEY, bound, { onlyIfMatch: entry.etag });
    if (!confirmedWrite(result)) continue;
    await assertCurrentVersion(store, auth);
    return { entry: { ...entry, data: bound, etag: result.etag }, saved: bound, credentials };
  }
  throw registryConflict();
}
async function updateRegistry(store, auth, update) {
  for (let attempt = 0; attempt < MAX_REGISTRY_RETRIES; attempt += 1) {
    const registry = await readRegistry(store, auth);
    const credentials = update(registry.credentials);
    await assertCurrentVersion(store, auth);
    const result = await store.setJSON(CREDENTIALS_KEY, {
      ...registry.saved, authVersion: auth.version, credentials,
    }, registry.entry ? { onlyIfMatch: registry.entry.etag } : { onlyIfNew: true });
    if (!confirmedWrite(result)) continue;
    await assertCurrentVersion(store, auth);
    return;
  }
  throw registryConflict();
}
async function saveChallenge(store, type, options, rp, auth) {
  await assertCurrentVersion(store, auth);
  const ceremonyID = randomID();
  await store.setJSON(`${CHALLENGE_PREFIX}${ceremonyID}.json`, {
    type, challenge: options.challenge, origin: rp.origin, rpID: rp.rpID,
    authVersion: auth.version,
    expiresAt: Date.now() + CHALLENGE_LIFETIME,
  });
  return ceremonyID;
}
async function takeChallenge(store, ceremonyID, expectedType, auth) {
  const cleanID = String(ceremonyID || "");
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(cleanID)) return null;
  const key = `${CHALLENGE_PREFIX}${cleanID}.json`;
  const entry = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
  const challenge = entry?.data;
  // An already-open ceremony from before deployment can be retried. Keep its
  // registered key; never infer a password version for an unbound challenge.
  if (!challenge || challenge.type !== expectedType || challenge.consumed ||
      challenge.authVersion !== auth.version ||
      !Number.isFinite(Number(challenge.expiresAt)) || Number(challenge.expiresAt) <= Date.now()) return null;
  if (!entry.etag) throw new Error("Missing passkey challenge ETag");
  await assertCurrentVersion(store, auth);
  const result = await store.setJSON(key, { ...challenge, consumed: true }, { onlyIfMatch: entry.etag });
  if (!confirmedWrite(result)) return null;
  await store.delete(key).catch(() => {});
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
    const settings = await accessSettings("board", { store, request });
    const auth = {
      version: String(settings?.authVersion || ""),
      allowLegacy: settings?.passkeyVersionRequired !== true,
    };
    if (action === "registration-options") {
      if (!(await accessIsValid(store, request, context))) return json({ error: "unauthorized" }, 401);
      const { credentials } = await readRegistry(store, auth);
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
      return json({ options, ceremonyID: await saveChallenge(store, "registration", options, rp, auth) });
    }
    if (action === "registration-verify") {
      if (!(await accessIsValid(store, request, context))) return json({ error: "unauthorized" }, 401);
      const challenge = await takeChallenge(store, body?.ceremonyID, "registration", auth);
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
      await updateRegistry(store, auth, credentials => {
        // Recheck capacity after concurrent registrations without evicting keys.
        if (credentials.length >= MAX_CREDENTIALS && !credentials.some(item => item.id === credential.id)) {
          throw new PasskeyError("登録上限に達しました。", 409);
        }
        return [savedCredential, ...credentials.filter(item => item.id !== credential.id)];
      });
      return json({ ok: true, credentialID: savedCredential.id });
    }
    if (action === "delete-credential") {
      if (!(await accessIsValid(store, request, context))) return json({ error: "unauthorized" }, 401);
      const credentialID = String(body?.credentialID || "");
      if (!credentialID) return json({ error: "削除する生体認証を確認できませんでした。" }, 400);
      await updateRegistry(store, auth, credentials => {
        const updated = credentials.filter(item => item.id !== credentialID);
        if (updated.length === credentials.length) throw new PasskeyError("登録済みの生体認証が見つかりません。", 404);
        return updated;
      });
      return json({ ok: true });
    }
    if (action === "authentication-options") {
      const { credentials } = await readRegistry(store, auth);
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
      return json({ options, ceremonyID: await saveChallenge(store, "authentication", options, rp, auth) });
    }
    if (action === "authentication-verify") {
      const challenge = await takeChallenge(store, body?.ceremonyID, "authentication", auth);
      if (!challenge) return json({ error: "認証の有効時間が切れました。" }, 400);
      const { credentials } = await readRegistry(store, auth);
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
      await updateRegistry(store, auth, currentCredentials => {
        // Do not restore a key deleted or replaced while WebAuthn was verifying.
        const current = currentCredentials.find(item => item.id === credential.id && item.publicKey === credential.publicKey);
        if (!current) throw new PasskeyError("登録済み端末ではありません。", 401);
        return currentCredentials.map(item => item === current ? {
          ...item,
          counter: Math.max(Number(item.counter) || 0, verification.authenticationInfo.newCounter),
          lastUsedAt: new Date().toISOString(),
        } : item);
      });
      const token = await createBoardSessionToken({ store, request });
      return json({ ok: true, token, credentialID: credential.id }, 200, { "set-cookie": boardSessionCookie(token) });
    }
    return json({ error: "unknown action" }, 400);
  } catch (error) {
    const limited = accessRateLimitResponse(error);
    if (limited) return limited;
    if (error instanceof PasskeyError) return json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status);
    console.error("passkey-auth", action, error);
    return json({ error: "生体認証を完了できませんでした。" }, 400);
  }
};
