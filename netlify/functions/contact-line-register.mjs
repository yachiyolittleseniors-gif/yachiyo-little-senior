/**
 * 八千代リトルシニア: お問い合わせ通知先①のLINE登録窓口。
 * LINE Messaging APIからの署名付きWebhookのみ受け付ける。
 * LINEログイン/お当番変更申請の処理には一切触れない。
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "yachiyo-contact-line-notify";
const RECIPIENT_KEY = "recipient-1";
const ID_PATTERN = /^U[0-9a-f]{32}$/i;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }
});

function validSignature(body, header, secret) {
  if (!secret || typeof header !== "string") return false;
  const provided = Buffer.from(header, "base64");
  const expected = createHmac("sha256", secret).update(body, "utf8").digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function replyToLine(token, replyToken, text) {
  if (!token || !replyToken || !text) return;
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] })
    });
  } catch {
    // 登録成功と返信失敗は区別する。Webhook応答で機密情報を返さない。
  }
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

  const channelSecret = String(process.env.LINE_MESSAGING_CHANNEL_SECRET || "");
  const registrationCode = String(process.env.CONTACT_LINE_REGISTRATION_CODE || "").trim();
  const accessToken = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || "");
  if (!channelSecret || registrationCode.length < 16 || !accessToken) {
    return json({ error: "configuration missing" }, 503);
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 65536) return json({ error: "payload too large" }, 413);
  if (!validSignature(raw, request.headers.get("x-line-signature"), channelSecret)) {
    return json({ error: "signature verification failed" }, 401);
  }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return json({ error: "invalid JSON" }, 400); }
  if (!Array.isArray(parsed.events)) return json({ error: "invalid events" }, 400);

  // LINEの「Webhook URLを検証」はeventsが空のリクエストを送るため、200を返す。
  if (parsed.events.length === 0) return json({ ok: true });

  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  for (const event of parsed.events) {
    if (event?.type !== "message" || event.message?.type !== "text" || event.source?.type !== "user") continue;
    const userId = String(event.source.userId || "");
    if (!ID_PATTERN.test(userId)) continue;
    const message = String(event.message.text || "").trim().replace(/[\s　]+/g, " ");
    const isRegister = message === `通知登録 ${registrationCode}`;
    const isUnregister = message === `通知解除 ${registrationCode}`;
    if (!isRegister && !isUnregister) continue;

    try {
      const existing = await store.get(RECIPIENT_KEY, { type: "json", consistency: "strong" });
      let text;
      if (isRegister) {
        if (existing?.userId === userId) {
          text = "【八千代リトルシニア】お問い合わせ通知先①は登録済みです。";
        } else if (existing?.userId) {
          text = "【八千代リトルシニア】通知先①は既に登録されています。変更が必要な場合はサイト管理者にご連絡ください。";
        } else {
          await store.setJSON(RECIPIENT_KEY, { userId, registeredAt: new Date().toISOString() });
          text = "【八千代リトルシニア】お問い合わせ通知先①の登録が完了しました。";
        }
      } else if (existing?.userId === userId) {
        await store.delete(RECIPIENT_KEY);
        text = "【八千代リトルシニア】お問い合わせ通知先①の登録を解除しました。";
      } else {
        text = "【八千代リトルシニア】このLINEアカウントは通知先①に登録されていません。";
      }
      await replyToLine(accessToken, event.replyToken, text);
    } catch {
      // LINE側はHTTP 5xxなら再送できる場合がある。IDやキーは返さない。
      return json({ error: "registration storage unavailable" }, 503);
    }
  }
  return json({ ok: true });
}

export const config = { path: "/api/contact-line-register" };
