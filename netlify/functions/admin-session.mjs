import { getStore } from "@netlify/blobs";
import { boardSessionIsValid } from "./_board-session.mjs";
import { adminAuthError, verifyAdminPassword } from "./admin-rate-limit.mjs";
import { adminSession, adminSessionCookie, createAdminSession } from "./_admin-session.mjs";

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});

export default async (request, context) => {
  try {
    if (request.method === "GET") {
      const session = await adminSession(request);
      return session ? json({ ok: true, ...session }) : json({ ok: false }, 401);
    }
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "unauthorized origin" }, 403);
    // A viewing session alone never grants editing rights.
    if (!(await boardSessionIsValid(request))) return json({ error: "チーム専用ページに入り直してください。" }, 401);
    const store = getStore({ name: "yachiyo-public-site", consistency: "strong" });
    const auth = await verifyAdminPassword({ store, request, context,
      expectedPassword: process.env.ADMIN_PASSWORD || "", requireSession: false });
    if (!auth.ok) return adminAuthError(json, auth);
    const session = await createAdminSession();
    return json({ ok: true, expiresAt: session.expiresAt }, 200, { "set-cookie": adminSessionCookie(session.token) });
  } catch {
    return json({ error: "管理者認証を確認できませんでした。" }, 503);
  }
};
