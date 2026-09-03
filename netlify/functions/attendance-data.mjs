import { getStore } from "@netlify/blobs";

const STORE = "yachiyo-public-site";
const KEY = "content/attendance.json";
const CONFIG_KEY = "content/attendance-config.json";
const DENSUKE_URL = "https://densuke.biz/list?cd=ZhxJNW9dPNGVtm7c";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function normalize(data = {}) {
  return {
    events: Array.isArray(data.events) ? data.events : [],
    members: Array.isArray(data.members) ? data.members : [],
    answers:
      data.answers && typeof data.answers === "object"
        ? data.answers
        : {}
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getConfig(store) {
  try {
    const saved = await store.get(CONFIG_KEY, { type: "json" });
    return {
      densukeVisible: saved?.densukeVisible !== false
    };
  } catch {
    return { densukeVisible: true };
  }
}

function cleanText(text = "") {
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x25CB;|&#9675;/gi, "○")
    .replace(/&#x25B3;|&#9651;/gi, "△")
    .replace(/&#x00D7;|&#215;/gi, "×")
    .replace(/\s+/g, " ")
    .trim();
}

async function importDensuke() {
  const response = await fetchWithTimeout(
    DENSUKE_URL,
    {
      headers: {
        "user-agent": "Mozilla/5.0"
      }
    },
    2500
  );

  if (!response.ok) {
    throw new Error("Densuke fetch failed");
  }

  const html = await response.text();

  const rows = [
    ...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)
  ].map(match => match[1]);

  const table = rows
    .map(row =>
      [
        ...row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)
      ].map(cell => cleanText(cell[1]))
    )
    .filter(row => row.length > 1);

  if (!table.length) {
    throw new Error("Densuke table not found");
  }

  let headerIndex = table.findIndex(row =>
    row.some(cell => /名前|氏名|お名前/.test(cell))
  );

  if (headerIndex < 0) {
    headerIndex = 0;
  }

  const header = table[headerIndex];
  const names = header.slice(1).filter(Boolean);

  const members = names.map((name, index) => ({
    id: `member-${index + 1}`,
    name
  }));

  const events = [];
  const answers = {};

  for (let i = headerIndex + 1; i < table.length; i++) {
    const row = table[i];
    const title = row[0];

    if (!title) continue;

    const statuses = row.slice(1);

    if (
      !statuses.some(value =>
        ["○", "△", "×"].includes(value)
      )
    ) {
      continue;
    }

    const eventId = `event-${events.length + 1}`;

    events.push({
      id: eventId,
      title
    });

    statuses.forEach((status, memberIndex) => {
      if (!["○", "△", "×"].includes(status)) return;

      const member = members[memberIndex];
      if (!member) return;

      if (!answers[eventId]) {
        answers[eventId] = {};
      }

      answers[eventId][member.id] = status;
    });
  }

  return normalize({
    events,
    members,
    answers
  });
}

function adminOK(request) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const received = request.headers.get("x-admin-password") || "";

  return Boolean(expected && received === expected);
}

export default async request => {
  const store = getStore({
  name: "yachiyo-public-site",
  consistency: "strong"
});
  const url = new URL(request.url);

  try {
    if (request.method === "GET") {
      if (url.searchParams.get("config") === "1") {
        return json({
          config: await getConfig(store)
        });
      }

      let saved = null;

      try {
        saved = await store.get(KEY, { type: "json" });
      } catch {
        saved = null;
      }

      let data = normalize(saved || {});

      if (!data.events.length && !data.members.length) {
        try {
          data = await importDensuke();
          await store.setJSON(KEY, data);
        } catch {
          data = normalize(saved || {});

          if (!data.events.length && !data.members.length) {
            await store.setJSON(KEY, data);
          }
        }
      }

      return json({ data });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let body = {};

    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const action = body.action || "";

    if (action === "adminPing") {
      if (!adminOK(request)) {
        return json({ error: "Unauthorized" }, 401);
      }

      return json({ ok: true });
    }

    if (action === "setConfig") {
      if (!adminOK(request)) {
        return json({ error: "Unauthorized" }, 401);
      }

      const config = {
        densukeVisible:
          body.config?.densukeVisible !== false
      };

      await store.setJSON(CONFIG_KEY, config);

      return json({
        ok: true,
        config
      });
    }

    if (action === "adminSave") {
      if (!adminOK(request)) {
        return json({ error: "Unauthorized" }, 401);
      }

      const data = normalize(body.data || {});
      await store.setJSON(KEY, data);

      return json({
        ok: true,
        data
      });
    }

    if (action === "answer") {
      const eventId = String(body.eventId || "");
      const memberId = String(body.memberId || "");
      const status = String(body.status || "");

      if (!eventId || !memberId) {
        return json({ error: "Missing id" }, 400);
      }

      if (status && !["○", "△", "×"].includes(status)) {
        return json({ error: "Invalid status" }, 400);
      }

      let current = {};

      try {
        current =
          (await store.get(KEY, { type: "json" })) || {};
      } catch {
        current = {};
      }

      const data = normalize(current);

      if (!data.answers[eventId]) {
        data.answers[eventId] = {};
      }

      if (status) {
        data.answers[eventId][memberId] = status;
      } else {
        delete data.answers[eventId][memberId];
      }

      await store.setJSON(KEY, data);

      return json({
        ok: true,
        data
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("attendance-data error:", error);

    return json(
      {
        error: "Server error"
      },
      500
    );
  }
};
