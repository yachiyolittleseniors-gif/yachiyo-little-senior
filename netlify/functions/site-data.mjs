import { getStore } from "@netlify/blobs";

const allowed = new Set(["schedule", "results", "gallery", "players"]);

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

      return json({ data: data ?? [] });
    }

    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, 405);
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
      return json({ error: "unauthorized" }, 401);
    }

    const body = await request.json();

    if (!Array.isArray(body.data)) {
      return json({
        error: "data must be an array"
      }, 400);
    }

    if (body.data.length > 500) {
      return json({
        error: "too many records"
      }, 413);
    }

    const serialized = JSON.stringify(body.data);

    if (serialized.length > 8000000) {
      return json({
        error: "payload too large"
      }, 413);
    }

    await store.setJSON(key, body.data);

    return json({ ok: true });

  } catch (e) {
    console.error(e);

    return json({
      error: "server error"
    }, 500);
  }
};
