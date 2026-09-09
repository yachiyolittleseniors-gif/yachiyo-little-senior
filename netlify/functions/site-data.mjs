import { getStore } from "@netlify/blobs";

const DEFAULT_ACCESS_SALT = "yachiyo-access-v1";
const DEFAULT_ACCESS_HASH =
  "19eb403934ae615b2961d9f6b5ddd86aab32a0fdf4e96adeb8aa2fcb351276ba";

const allowed = new Set([
  "schedule",
  "results",
  "gallery",
  "players",
  "hero",
  "photos",
  "ground-photos",
  "hero-announcement",
  "news",
  "rules",
  "staff",
  "alumni",
  "downloads-application",
  "downloads-roster",
  "seniorcup-settings",
  "seniorcup-guideline",
  "seniorcup-partners",
  "seniorcup-reply-mode",
  "graduate-paths",
  "links",
  "board-tournaments",
  "access-settings"
]);

const BOARD_SESSION_COOKIE = "yls_board_session";
const BOARD_SESSION_SECONDS = 60 * 60 * 4;

function bytesToHex(bytes) {
  return Array.from(
    bytes,
    byte => byte.toString(16).padStart(2, "0")
  ).join("");
}

async function hashAccessPassword(password, salt) {
  const input = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return bytesToHex(new Uint8Array(digest));
}

function safeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    difference |=
      (left.charCodeAt(i) || 0) ^
      (right.charCodeAt(i) || 0);
  }

  return difference === 0;
}

async function accessPasswordIsValid(store, enteredPassword) {
  const entered = String(enteredPassword || "");

  if (!entered || entered.length > 128) {
    return false;
  }

  const saved = await store.get("content/access-settings.json", {
    type: "json",
    consistency: "strong"
  });

  if (saved?.salt && saved?.hash) {
    const enteredHash = await hashAccessPassword(entered, saved.salt);
    return safeEqual(enteredHash, saved.hash);
  }

  if (process.env.ACCESS_PASSWORD) {
    return safeEqual(entered, process.env.ACCESS_PASSWORD);
  }

  const enteredHash = await hashAccessPassword(
    entered,
    DEFAULT_ACCESS_SALT
  );
  return safeEqual(enteredHash, DEFAULT_ACCESS_HASH);
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function signBoardSession(value) {
  const secret =
    process.env.ADMIN_PASSWORD ||
    process.env.ACCESS_PASSWORD ||
    DEFAULT_ACCESS_HASH;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );
  return base64Url(new Uint8Array(signature));
}

async function createBoardSessionToken() {
  const expiresAt = Math.floor(Date.now() / 1000) + BOARD_SESSION_SECONDS;
  const value = String(expiresAt);
  return `${value}.${await signBoardSession(value)}`;
}

function getCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const prefix = `${name}=`;
  const part = cookie.split(";").map(item => item.trim())
    .find(item => item.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : "";
}

async function boardSessionIsValid(request) {
  const token = getCookie(request, BOARD_SESSION_COOKIE);
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || Number(expiresAt) < Math.floor(Date.now() / 1000)) {
    return false;
  }
  return safeEqual(signature, await signBoardSession(expiresAt));
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:application\/pdf;base64,(.*)$/s);
  if (!match) return null;
  try {
    return Uint8Array.from(atob(match[1]), character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export default async (request) => {
  try {
    const url = new URL(request.url);
    const section = url.searchParams.get("section");

    if (!allowed.has(section)) {
      return json({ error: "invalid section" }, 400);
    }

    const store = getStore({
      name: "yachiyo-public-site",
      consistency: "strong"
    });

    const key = `content/${section}.json`;

    if (request.method === "GET") {
      if (section === "access-settings") {
        return json({ error: "method not allowed" }, 405);
      }

      if (section === "rules") {
        const accessPassword = request.headers.get("x-access-password") || "";
        const accessGranted =
          await boardSessionIsValid(request) ||
          await accessPasswordIsValid(store, accessPassword);

        if (!accessGranted) {
          return json({ error: "unauthorized" }, 401);
        }
      }

      if (section === "board-tournaments") {
        const accessPassword = request.headers.get("x-access-password") || "";
        const accessGranted =
          await boardSessionIsValid(request) ||
          await accessPasswordIsValid(store, accessPassword);

        if (!accessGranted) {
          return json({ error: "unauthorized" }, 401);
        }

        const documents = await store.get(key, {
          type: "json",
          consistency: "strong"
        });

        if (url.searchParams.has("file")) {
          const id = String(url.searchParams.get("file") || "");
          const item = Array.isArray(documents)
            ? documents.find(entry => String(entry?.id || "") === id)
            : null;

          if (!item) {
            return new Response("PDF not found", { status: 404 });
          }

          const pdf = await store.get(`board-tournaments/${id}.pdf`, {
            type: "blob",
            consistency: "strong"
          });

          if (!pdf) {
            return new Response("PDF not found", { status: 404 });
          }

          const encodedName = encodeURIComponent(item.fileName || "document.pdf");

          return new Response(pdf, {
            status: 200,
            headers: {
              "content-type": "application/pdf",
              "content-disposition":
                `inline; filename="tournament.pdf"; filename*=UTF-8''${encodedName}`,
              "cache-control": "private, no-store",
              "x-content-type-options": "nosniff"
            }
          });
        }

        return json({ data: Array.isArray(documents) ? documents : [] });
      }

      const data = await store.get(key, {
        type: "json",
        consistency: "strong"
      });

      const photoSection =
        section === "hero" ||
        section === "photos" ||
        section === "ground-photos";

      if (photoSection && url.searchParams.get("manifest") === "1") {
        const photos = Array.isArray(data)
          ? data
              .map((item, index) => ({ item, index }))
              .filter(entry => entry.item?.image)
          : [];

        return json({
          data: photos.map(({ item, index }) => {
            const id = section === "photos"
              ? String(item.key || index)
              : String(index);

            return {
              key: item.key,
              image:
                `/.netlify/functions/site-data?section=${encodeURIComponent(section)}` +
                `&image=${encodeURIComponent(id)}` +
                `&v=${encodeURIComponent(item.updatedAt || index)}`,
              updatedAt: item.updatedAt || ""
            };
          })
        });
      }

      if (photoSection && url.searchParams.has("image")) {
        const id = String(url.searchParams.get("image") || "");
        const item = section === "photos"
          ? (Array.isArray(data)
              ? data.find(entry => String(entry?.key || "") === id)
              : null)
          : (Array.isArray(data) ? data[Number(id)] : null);
        const match = String(item?.image || "").match(
          /^data:([^;,]+)?(;base64)?,(.*)$/s
        );

        if (!match) {
          return new Response("Photo not found", { status: 404 });
        }

        const bytes = match[2]
          ? Uint8Array.from(
              atob(match[3]),
              character => character.charCodeAt(0)
            )
          : new TextEncoder().encode(
              decodeURIComponent(match[3])
            );

        return new Response(bytes, {
          status: 200,
          headers: {
            "content-type": match[1] || "image/jpeg",
            "content-length": String(bytes.byteLength),
            "cache-control": "public, max-age=31536000, immutable"
          }
        });
      }

      if (
        url.searchParams.get("download") === "1" &&
        (
          section === "downloads-application" ||
          section === "downloads-roster"
        )
      ) {
        if (!data?.fileName || !data?.dataUrl) {
          return new Response("File not found", {
            status: 404
          });
        }

        const match = String(data.dataUrl).match(
          /^data:([^;,]+)?(;base64)?,(.*)$/s
        );

        if (!match) {
          return new Response("Invalid file data", {
            status: 500
          });
        }

        const mimeType =
          data.mimeType ||
          match[1] ||
          "application/octet-stream";

        const bytes = match[2]
          ? Uint8Array.from(
              atob(match[3]),
              character => character.charCodeAt(0)
            )
          : new TextEncoder().encode(
              decodeURIComponent(match[3])
            );

        const safeName = String(data.fileName)
          .replace(/[\r\n"]/g, "_");

        const encodedName = encodeURIComponent(
          data.fileName
        );

        return new Response(bytes, {
          status: 200,
          headers: {
            "content-type": mimeType,
            "content-disposition":
              `attachment; filename="${safeName}"; ` +
              `filename*=UTF-8''${encodedName}`,
            "content-length": String(bytes.byteLength),
            "cache-control": "no-store"
          }
        });
      }

      return json({
        data: data ?? []
      });
    }

    if (request.method !== "POST") {
      return json({
        error: "method not allowed"
      }, 405);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid json" }, 400);
    }

    if (
      section === "access-settings" &&
      body?.action === "verifyAccessPassword"
    ) {
      const valid = await accessPasswordIsValid(
        store,
        body.password
      );

      if (!valid) {
        return json({ ok: false }, 401);
      }

      const token = await createBoardSessionToken();
      return json(
        { ok: true },
        200,
        {
          "set-cookie":
            `${BOARD_SESSION_COOKIE}=${encodeURIComponent(token)}; ` +
            `Path=/; Max-Age=${BOARD_SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`
        }
      );
    }

    const expected = process.env.ADMIN_PASSWORD;

    if (!expected) {
      return json({
        error: "ADMIN_PASSWORD is not configured"
      }, 503);
    }

    const entered =
      request.headers.get("x-admin-password") || "";

    if (
      section === "access-settings" &&
      body?.action === "verifyAdminPassword"
    ) {
      return entered === expected
        ? json({ ok: true })
        : json({ ok: false }, 401);
    }

    if (entered !== expected) {
      return json({
        error: "unauthorized"
      }, 401);
    }

    if (
      section === "board-tournaments" &&
      body?.action === "uploadBoardTournament"
    ) {
      const title = String(body.title || "").trim();
      const fileName = String(body.fileName || "").trim();
      const grade = String(body.grade || "all");
      const bytes = decodeDataUrl(body.dataUrl);

      if (!title || title.length > 120) {
        return json({ error: "大会名を入力してください。" }, 400);
      }
      if (!fileName.toLowerCase().endsWith(".pdf") || !bytes) {
        return json({ error: "PDFファイルを選択してください。" }, 400);
      }
      if (!["all", "1", "2", "3"].includes(grade)) {
        return json({ error: "学年を選択してください。" }, 400);
      }
      if (bytes.byteLength > 6 * 1024 * 1024) {
        return json({ error: "PDFは6MB以下にしてください。" }, 413);
      }
      const signature = new TextDecoder().decode(bytes.slice(0, 5));
      if (signature !== "%PDF-") {
        return json({ error: "正しいPDFファイルではありません。" }, 400);
      }

      const current = await store.get(key, {
        type: "json",
        consistency: "strong"
      });
      const documents = Array.isArray(current) ? current : [];
      if (documents.length >= 6) {
        return json({ error: "掲載できるPDFは6件までです。" }, 400);
      }

      const id = crypto.randomUUID();
      const item = {
        id,
        title,
        grade,
        fileName,
        size: bytes.byteLength,
        uploadedAt: new Date().toISOString()
      };

      await store.set(`board-tournaments/${id}.pdf`, bytes.buffer, {
        metadata: { title, grade, fileName }
      });
      const updated = [item, ...documents];
      await store.setJSON(key, updated);
      return json({ ok: true, data: updated });
    }

    if (
      section === "board-tournaments" &&
      body?.action === "deleteBoardTournament"
    ) {
      const id = String(body.id || "");
      const current = await store.get(key, {
        type: "json",
        consistency: "strong"
      });
      const documents = Array.isArray(current) ? current : [];
      const item = documents.find(entry => String(entry?.id || "") === id);
      if (!item) {
        return json({ error: "PDFが見つかりません。" }, 404);
      }

      await store.delete(`board-tournaments/${id}.pdf`);
      const updated = documents.filter(entry => String(entry?.id || "") !== id);
      await store.setJSON(key, updated);
      return json({ ok: true, data: updated });
    }

    if (
      section === "access-settings" &&
      body?.action === "setAccessPassword"
    ) {
      const newPassword = String(body.password || "");

      if (
        newPassword.length < 8 ||
        newPassword.length > 64
      ) {
        return json({
          error:
            "password must be between 8 and 64 characters"
        }, 400);
      }

      const saltBytes = new Uint8Array(16);
      crypto.getRandomValues(saltBytes);

      const salt = bytesToHex(saltBytes);
      const hash = await hashAccessPassword(
        newPassword,
        salt
      );

      await store.setJSON(key, {
        salt,
        hash,
        updatedAt: new Date().toISOString()
      });

      return json({ ok: true });
    }

    const serialized = JSON.stringify(body.data);

    if (serialized.length > 8000000) {
      return json({
        error: "payload too large"
      }, 413);
    }

    await store.setJSON(key, body.data);

    return json({
      ok: true
    });
  } catch (error) {
    console.error(error);

    return json({
      error: "server error"
    }, 500);
  }
};
