import { getStore } from "@netlify/blobs";

const allowed = new Set([
  "schedule",
  "results",
  "gallery",
  "players",
  "hero",
  "photos",
  "news",
  "rules",
  "staff",
  "alumni",
  "downloads-application",
  "downloads-roster",
  "seniorcup-settings",
  "seniorcup-guideline",
  "graduate-paths"
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
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
      const data = await store.get(key, {
        type: "json",
        consistency: "strong"
      });

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
              (character) => character.charCodeAt(0)
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

    const expected = process.env.ADMIN_PASSWORD;

    if (!expected) {
      return json({
        error: "ADMIN_PASSWORD is not configured"
      }, 503);
    }

    const entered =
      request.headers.get("x-admin-password") || "";

    if (entered !== expected) {
      return json({
        error: "unauthorized"
      }, 401);
    }

    const body = await request.json();
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
