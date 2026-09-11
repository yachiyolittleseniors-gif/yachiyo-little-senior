import { getStore } from "@netlify/blobs";
import {
  adminAuthError,
  verifyAdminPassword,
} from "./admin-rate-limit.mjs";

const DEFAULT_ACCESS_SALT = "yachiyo-access-v1";
const DEFAULT_ACCESS_HASH =
  "19eb403934ae615b2961d9f6b5ddd86aab32a0fdf4e96adeb8aa2fcb351276ba";

const allowed = new Set([
  "schedule",
  "results",
  "result-squad-settings",
  "result-documents",
  "gallery",
  "players",
  "hero",
  "photos",
  "ground-photos",
  "hero-announcement",
  "news",
  "rules",
  "duty-roster",
  "staff",
  "team-interview",
  "alumni",
  "downloads-application",
  "downloads-guideline",
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

const LEGACY_GRADE_BASE_YEAR = 2026;

function currentJapanYear() {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      year: "numeric"
    }).format(new Date())
  );
}

function resultIsExpired(item) {
  const normalized = String(item?.grade || "")
    .replace(/[１２３]/g, character =>
      String("１２３".indexOf(character) + 1)
    );
  const match = normalized.match(/[1-3]/);
  if (!match) return false;

  const baseGrade = Number(match[0]);
  const baseYear = Number(item?.gradeYear) || LEGACY_GRADE_BASE_YEAR;
  const effectiveGrade =
    baseGrade + Math.max(0, currentJapanYear() - baseYear);

  return effectiveGrade >= 5;
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

const LEGACY_RESULT_SEED = [
  {
    "id": "legacy-44-2024-narita-1",
    "date": "2024-11",
    "grade": "3年",
    "round": "一回戦",
    "battingOrder": "first",
    "tournament": "第18回成田国際空港杯フレッシュマン大会",
    "opponent": "匝瑳シニア",
    "venue": "",
    "ourScore": 0,
    "oppScore": 3,
    "note": ""
  },
  {
    "id": "legacy-44-2024-narita-2",
    "date": "2024-11",
    "grade": "3年",
    "round": "敗者交流戦",
    "battingOrder": "first",
    "tournament": "第18回成田国際空港杯フレッシュマン大会",
    "opponent": "千葉緑シニア",
    "venue": "",
    "ourScore": 3,
    "oppScore": 2,
    "note": ""
  },
  {
    "id": "legacy-44-2025-chibanippo-1",
    "date": "2025-06",
    "grade": "3年",
    "round": "一回戦",
    "battingOrder": "first",
    "tournament": "千葉日報社新人大会",
    "opponent": "君津シニア",
    "venue": "",
    "ourScore": 10,
    "oppScore": 1,
    "note": ""
  },
  {
    "id": "legacy-44-2025-chibanippo-2",
    "date": "2025-06",
    "grade": "3年",
    "round": "二回戦",
    "battingOrder": "first",
    "tournament": "千葉日報社新人大会",
    "opponent": "我孫子シニア",
    "venue": "",
    "ourScore": 2,
    "oppScore": 6,
    "note": ""
  },
  {
    "id": "legacy-44-2025-autumn-1",
    "date": "2025-09",
    "grade": "3年",
    "round": "二回戦",
    "battingOrder": "first",
    "tournament": "東関東支部秋季大会",
    "opponent": "かすみがうらシニア",
    "venue": "",
    "ourScore": 9,
    "oppScore": 2,
    "note": ""
  },
  {
    "id": "legacy-44-2025-autumn-2",
    "date": "2025-09",
    "grade": "3年",
    "round": "三回戦",
    "battingOrder": "first",
    "tournament": "東関東支部秋季大会",
    "opponent": "常総シニア",
    "venue": "",
    "ourScore": 3,
    "oppScore": 5,
    "note": ""
  },
  {
    "id": "legacy-44-2025-autumn-3",
    "date": "2025-09",
    "grade": "3年",
    "round": "敗者復活三回戦",
    "battingOrder": "first",
    "tournament": "東関東支部秋季大会",
    "opponent": "我孫子シニア",
    "venue": "",
    "ourScore": 2,
    "oppScore": 6,
    "note": ""
  },
  {
    "id": "legacy-44-2026-kashima-1",
    "date": "2026-01",
    "grade": "3年",
    "round": "第一試合",
    "battingOrder": "first",
    "tournament": "第5回鹿嶋市長杯交流大会",
    "opponent": "小山ボーイズ",
    "venue": "",
    "ourScore": 2,
    "oppScore": 10,
    "note": ""
  },
  {
    "id": "legacy-44-2026-kashima-2",
    "date": "2026-01",
    "grade": "3年",
    "round": "第二試合",
    "battingOrder": "first",
    "tournament": "第5回鹿嶋市長杯交流大会",
    "opponent": "世田谷西シニア",
    "venue": "",
    "ourScore": 0,
    "oppScore": 16,
    "note": ""
  },
  {
    "id": "legacy-44-2026-kashima-3",
    "date": "2026-01",
    "grade": "3年",
    "round": "第三試合",
    "battingOrder": "first",
    "tournament": "第5回鹿嶋市長杯交流大会",
    "opponent": "水戸青藍舎ヤング",
    "venue": "",
    "ourScore": 2,
    "oppScore": 10,
    "note": ""
  },
  {
    "id": "legacy-44-2026-spring-1",
    "date": "2026-02",
    "grade": "3年",
    "round": "一回戦",
    "battingOrder": "first",
    "tournament": "東関東支部春季大会",
    "opponent": "千葉南シニア",
    "venue": "",
    "ourScore": 10,
    "oppScore": 2,
    "note": ""
  },
  {
    "id": "legacy-44-2026-spring-2",
    "date": "2026-02",
    "grade": "3年",
    "round": "二回戦",
    "battingOrder": "first",
    "tournament": "東関東支部春季大会",
    "opponent": "佐倉シニア",
    "venue": "",
    "ourScore": 9,
    "oppScore": 1,
    "note": ""
  },
  {
    "id": "legacy-44-2026-spring-3",
    "date": "2026-02",
    "grade": "3年",
    "round": "敗者復活二回戦",
    "battingOrder": "first",
    "tournament": "東関東支部春季大会",
    "opponent": "千葉市ウイナーズ",
    "venue": "",
    "ourScore": 0,
    "oppScore": 10,
    "note": ""
  },
  {
    "id": "legacy-44-2026-iwaki-1",
    "date": "2026-03",
    "grade": "3年",
    "round": "第一試合",
    "battingOrder": "first",
    "tournament": "第11回iwakiサンシャインcup交流大会",
    "opponent": "新庄シニア",
    "venue": "",
    "ourScore": 0,
    "oppScore": 7,
    "note": ""
  },
  {
    "id": "legacy-44-2026-iwaki-2",
    "date": "2026-03",
    "grade": "3年",
    "round": "第二試合",
    "battingOrder": "first",
    "tournament": "第11回iwakiサンシャインcup交流大会",
    "opponent": "郡山シニア",
    "venue": "",
    "ourScore": 1,
    "oppScore": 8,
    "note": ""
  },
  {
    "id": "legacy-44-2026-iwaki-3",
    "date": "2026-03",
    "grade": "3年",
    "round": "第三試合",
    "battingOrder": "first",
    "tournament": "第11回iwakiサンシャインcup交流大会",
    "opponent": "会津シニア",
    "venue": "",
    "ourScore": 2,
    "oppScore": 10,
    "note": ""
  },
  {
    "id": "legacy-44-2026-iwaki-4",
    "date": "2026-03",
    "grade": "3年",
    "round": "第四試合",
    "battingOrder": "first",
    "tournament": "第11回iwakiサンシャインcup交流大会",
    "opponent": "宮城登米シニア",
    "venue": "",
    "ourScore": 18,
    "oppScore": 9,
    "note": ""
  },
  {
    "id": "legacy-44-2026-yomiuri-1",
    "date": "2026-04",
    "grade": "3年",
    "round": "三回戦",
    "battingOrder": "first",
    "tournament": "第19回読売新聞社杯兼第48回千葉県大会",
    "opponent": "柏シニア",
    "venue": "",
    "ourScore": 7,
    "oppScore": 5,
    "note": ""
  },
  {
    "id": "legacy-44-2026-yomiuri-2",
    "date": "2026-04",
    "grade": "3年",
    "round": "四回戦",
    "battingOrder": "first",
    "tournament": "第19回読売新聞社杯兼第48回千葉県大会",
    "opponent": "市川シニア",
    "venue": "",
    "ourScore": 0,
    "oppScore": 3,
    "note": ""
  },
  {
    "id": "legacy-44-2026-kanto-summer-1",
    "date": "2026-05",
    "grade": "3年",
    "round": "一回戦",
    "battingOrder": "first",
    "tournament": "関東夏季大会",
    "opponent": "上尾シニア",
    "venue": "",
    "ourScore": 0,
    "oppScore": 7,
    "note": ""
  },
  {
    "id": "legacy-44-2026-lotte-1",
    "date": "2026-07",
    "grade": "3年",
    "round": "二回戦",
    "battingOrder": "first",
    "tournament": "CHIBA LOTTE MARINES CUP 2026",
    "opponent": "匝瑳シニア",
    "venue": "",
    "ourScore": 2,
    "oppScore": 3,
    "note": ""
  },
  {
    "id": "legacy-45-2025-narita-1",
    "date": "2025-11",
    "grade": "2年",
    "round": "一回戦",
    "battingOrder": "first",
    "tournament": "第19回成田国際空港杯フレッシュマン大会",
    "opponent": "八千代中央シニア",
    "venue": "",
    "ourScore": 0,
    "oppScore": 11,
    "note": ""
  },
  {
    "id": "legacy-45-2025-narita-2",
    "date": "2025-11",
    "grade": "2年",
    "round": "敗者交流戦",
    "battingOrder": "first",
    "tournament": "第19回成田国際空港杯フレッシュマン大会",
    "opponent": "千葉西シニア",
    "venue": "",
    "ourScore": 5,
    "oppScore": 6,
    "note": ""
  },
  {
    "id": "legacy-45-2026-chibanippo-1",
    "date": "2026-06",
    "grade": "2年",
    "round": "一回戦",
    "battingOrder": "first",
    "tournament": "千葉日報社新人大会",
    "opponent": "船橋シニア",
    "venue": "",
    "ourScore": 4,
    "oppScore": 1,
    "note": ""
  },
  {
    "id": "legacy-45-2026-chibanippo-2",
    "date": "2026-06",
    "grade": "2年",
    "round": "二回戦",
    "battingOrder": "first",
    "tournament": "千葉日報社新人大会",
    "opponent": "八千代中央V",
    "venue": "",
    "ourScore": 0,
    "oppScore": 9,
    "note": ""
  }
];

export default async (request, context) => {
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

      if (section === "rules" || section === "duty-roster") {
        const accessPassword = request.headers.get("x-access-password") || "";
        const accessGranted =
          await boardSessionIsValid(request) ||
          await accessPasswordIsValid(store, accessPassword);

        if (!accessGranted) {
          return json({ error: "unauthorized" }, 401);
        }
      }

      if (section === "result-documents") {
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

          const pdf = await store.get(`result-documents/${id}.pdf`, {
            type: "blob",
            consistency: "strong"
          });

          if (!pdf) {
            return new Response("PDF not found", { status: 404 });
          }

          const originalName = String(item.fileName || "document.pdf");
          const encodedName = encodeURIComponent(originalName);
          return new Response(pdf, {
            status: 200,
            headers: {
              "content-type": "application/pdf",
              "content-disposition":
                `inline; filename="tournament.pdf"; filename*=UTF-8''${encodedName}`,
              "cache-control": "public, max-age=300",
              "x-content-type-options": "nosniff"
            }
          });
        }

        return json({ data: Array.isArray(documents) ? documents : [] });
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

      let data = await store.get(key, {
        type: "json",
        consistency: "strong"
      });

      if (section === "results") {
        const migrationKey = "migrations/results-legacy-20260910.json";
        const migrated = await store.get(migrationKey, {
          type: "json",
          consistency: "strong"
        });
        if (!migrated?.done) {
          const current = Array.isArray(data) ? data : [];
          const currentIds = new Set(current.map(item => String(item?.id || "")));
          const additions = LEGACY_RESULT_SEED.filter(item => !currentIds.has(item.id));
          data = [...current, ...additions];
          await store.setJSON(key, data);
          await store.setJSON(migrationKey, {
            done: true,
            added: additions.length,
            updatedAt: new Date().toISOString()
          });
        }

        const currentResults = Array.isArray(data) ? data : [];
        const activeResults = currentResults.filter(item => !resultIsExpired(item));
        if (activeResults.length !== currentResults.length) {
          data = activeResults;
          await store.setJSON(key, data);
        }
      }

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
        (
          url.searchParams.get("download") === "1" ||
          url.searchParams.get("view") === "1"
        ) &&
        (
          section === "downloads-application" ||
          section === "downloads-guideline" ||
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

        const mimeType = section === "downloads-guideline"
          ? "application/pdf"
          : data.mimeType || match[1] || "application/octet-stream";

        const bytes = match[2]
          ? Uint8Array.from(
              atob(match[3]),
              character => character.charCodeAt(0)
            )
          : new TextEncoder().encode(
              decodeURIComponent(match[3])
            );

        const originalName = String(data.fileName);
        const cleanedName = originalName.replace(/[\r\n"\\]/g, "_");
        const extensionMatch = originalName.match(/\.([a-zA-Z0-9]{1,8})$/);
        const safeName = /^[\x20-\x7e]+$/.test(cleanedName)
          ? cleanedName
          : `download${extensionMatch ? `.${extensionMatch[1]}` : ""}`;

        const encodedName = encodeURIComponent(
          originalName
        );

        const disposition = url.searchParams.get("view") === "1"
          ? "inline"
          : "attachment";

        return new Response(bytes, {
          status: 200,
          headers: {
            "content-type": mimeType,
            "content-disposition":
              `${disposition}; filename="${safeName}"; ` +
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

    const adminAuth = await verifyAdminPassword({
      store,
      request,
      context,
      expectedPassword: process.env.ADMIN_PASSWORD || "",
    });

    if (
      section === "access-settings" &&
      body?.action === "verifyAdminPassword"
    ) {
      return adminAuth.ok
        ? json({ ok: true })
        : adminAuthError(json, adminAuth);
    }

    if (!adminAuth.ok) return adminAuthError(json, adminAuth);

    if (
      section === "results" &&
      body?.action === "renameResultTournament"
    ) {
      const fromTournament = String(body.fromTournament || "").trim();
      const toTournament = String(body.toTournament || "").trim();
      const nextResults = body.data;

      if (
        !fromTournament ||
        !toTournament ||
        fromTournament.length > 200 ||
        toTournament.length > 200 ||
        !Array.isArray(nextResults)
      ) {
        return json({ error: "大会名を確認してください。" }, 400);
      }

      const serializedResults = JSON.stringify(nextResults);
      if (serializedResults.length > 8000000) {
        return json({ error: "payload too large" }, 413);
      }

      const documentKey = "content/result-documents.json";
      const currentDocuments = await store.get(documentKey, {
        type: "json",
        consistency: "strong"
      });
      const documents = Array.isArray(currentDocuments)
        ? currentDocuments
        : [];
      const updatedDocuments = documents.map(item =>
        String(item?.tournament || "") === fromTournament
          ? { ...item, tournament: toTournament }
          : item
      );

      await store.setJSON(key, nextResults);
      if (JSON.stringify(updatedDocuments) !== JSON.stringify(documents)) {
        await store.setJSON(documentKey, updatedDocuments);
      }

      return json({
        ok: true,
        data: nextResults,
        documents: updatedDocuments
      });
    }

    if (section === "downloads-guideline" && body?.data?.fileName) {
      const fileName = String(body.data.fileName || "").trim();
      const bytes = decodeDataUrl(body.data.dataUrl);

      if (!fileName.toLowerCase().endsWith(".pdf") || !bytes) {
        return json({ error: "PDFファイルを選択してください。" }, 400);
      }
      if (bytes.byteLength > 5 * 1024 * 1024) {
        return json({ error: "PDFは5MB以下にしてください。" }, 413);
      }
      const signature = new TextDecoder().decode(bytes.slice(0, 5));
      if (signature !== "%PDF-") {
        return json({ error: "正しいPDFファイルではありません。" }, 400);
      }
    }

    if (
      section === "result-documents" &&
      body?.action === "uploadResultDocument"
    ) {
      const tournament = String(body.tournament || "").trim();
      const fileName = String(body.fileName || "").trim();
      const bytes = decodeDataUrl(body.dataUrl);

      if (!tournament || tournament.length > 160) {
        return json({ error: "大会名を確認してください。" }, 400);
      }
      if (!fileName.toLowerCase().endsWith(".pdf") || !bytes) {
        return json({ error: "PDFファイルを選択してください。" }, 400);
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
      const id = crypto.randomUUID();
      const item = {
        id,
        tournament,
        fileName,
        size: bytes.byteLength,
        uploadedAt: new Date().toISOString()
      };

      await store.set(`result-documents/${id}.pdf`, bytes.buffer, {
        metadata: { tournament, fileName }
      });
      const updated = [item, ...documents];
      await store.setJSON(key, updated);
      return json({ ok: true, data: updated });
    }

    if (
      section === "result-documents" &&
      body?.action === "deleteResultDocument"
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

      await store.delete(`result-documents/${id}.pdf`);
      const updated = documents.filter(entry => String(entry?.id || "") !== id);
      await store.setJSON(key, updated);
      return json({ ok: true, data: updated });
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

    if (section === "duty-roster") {
      const roster = body?.data;
      const images = roster?.images;

      if (
        roster?.initialized !== true ||
        !Array.isArray(images) ||
        images.length > 8
      ) {
        return json({ error: "画像データを確認してください。" }, 400);
      }

      const valid = images.every(item => {
        const name = String(item?.name || "");
        const data = String(item?.data || "");
        const src = String(item?.src || "");
        const validData =
          !data ||
          /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(data);
        const validSource = !src;
        return name.length <= 160 && validData && validSource && Boolean(data || src);
      });

      if (!valid) {
        return json({ error: "保存できない画像形式が含まれています。" }, 400);
      }
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
