/**
 * Gmail（Apps Script）からの署名付きリクエストで、担当者①②へLINE通知。
 * ①はLINEの専用登録メッセージからNetlify Blobsに保存。
 * ②はNetlify環境変数 CONTACT_LINE_USER_ID_2 を使用。
 */
import { timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

const ID_PATTERN = /^U[0-9a-f]{32}$/i;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
});
function safeEqual(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const secret = String(process.env.CONTACT_LINE_NOTIFY_SECRET || "");
  const token = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || "");
  if (!secret || !token) return json({ error: "configuration missing" }, 503);
  if (!safeEqual(request.headers.get("x-contact-notify-secret"), secret)) return json({ error: "unauthorized" }, 401);

  const id2 = String(process.env.CONTACT_LINE_USER_ID_2 || "").trim();
  const legacyId1 = String(process.env.CONTACT_LINE_USER_ID_1 || "").trim();
  let id1 = legacyId1;
  if (!id1) {
    try {
      const store = getStore({ name: "yachiyo-contact-line-notify", consistency: "strong" });
      const record = await store.get("recipient-1", { type: "json", consistency: "strong" });
      id1 = String(record?.userId || "").trim();
    } catch {
      return json({ error: "recipient lookup failed" }, 503);
    }
  }
  if (!ID_PATTERN.test(id1) || !ID_PATTERN.test(id2)) {
    return json({ error: "both recipient IDs must be registered" }, 409);
  }
  if (id1 === id2) return json({ error: "recipient IDs must be different" }, 409);

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/multicast", {
      method: "POST",
      headers: { "authorization": `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        to: [id1, id2],
        messages: [{ type: "text", text: "【八千代リトルシニア】\n新しいお問い合わせメールが届きました。\nお問い合わせ用Gmailをご確認ください。" }]
      })
    });
    if (!response.ok) return json({ error: "LINE notification failed", status: response.status }, 502);
    return json({ ok: true, recipients: 2 });
  } catch {
    return json({ error: "LINE API unavailable" }, 502);
  }
}
export const config = { path: "/api/contact-line-notify" };
