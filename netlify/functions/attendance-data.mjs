import { getStore } from "@netlify/blobs";

const STORE = "yachiyo-public-site";
const KEY = "content/attendance.json";
const CONFIG_KEY = "content/attendance-config.json";

const DENSUKE_URL =
  "https://www.densuke.biz/m/list?cd=ZhxJNW9dPNGVtm7c";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function normalize(data = {}) {
  return {
    events: Array.isArray(data.events) ? data.events : [],
    members: Array.isArray(data.members) ? data.members : [],
    answers:
      data.answers && typeof data.answers === "object"
        ? data.answers
        : {},
  };
}

function cleanHtml(html = "") {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x25CB;|&#9675;/gi, "○")
    .replace(/&#x25B3;|&#9651;/gi, "△")
    .replace(/&#x00D7;|&#215;/gi, "×")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function splitNames(text = "") {
  return text
    .trim()
    .split(/[\s、,，]+/)
    .map(v => v.trim())
    .filter(Boolean);
}

async function fetchDensuke() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(DENSUKE_URL, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      throw new Error("Densuke fetch failed");
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function importDensuke() {
  const html = await fetchDensuke();

  const lines = cleanHtml(html)
    .split("\n")
    .map(v => v.trim())
    .filter(Boolean);

  const sourceEvents = [];
  let current = null;

  for (const line of lines) {
    const statusMatch = line.match(
      /^([○△×])\s*[：:]\s*(.*)$/
    );

    if (statusMatch && current) {
      current.status[statusMatch[1]] =
        splitNames(statusMatch[2]);
      continue;
    }

    if (
      /簡易版はこちら|通常はこちら|登録内容変更|スケジュール調整サービス/.test(
        line
      )
    ) {
      continue;
    }

    if (
      /\d{1,2}\/\d{1,2}\s*\([日月火水木金土]\)/.test(
        line
      )
    ) {
      current = {
        title: line.replace(/^[-*・●\s]+/, "").trim(),
        status: {},
      };

      sourceEvents.push(current);
    }
  }

  const usableEvents = sourceEvents.filter(
    event => Object.keys(event.status).length > 0
  );

  if (!usableEvents.length) {
    throw new Error("Densuke data not found");
  }

  const memberNames = [];
  const seen = new Set();

  for (const event of usableEvents) {
    for (const mark of ["○", "△", "×"]) {
      for (const name of event.status[mark] || []) {
        if (!seen.has(name)) {
          seen.add(name);
          memberNames.push(name);
        }
      }
    }
  }

  const members = memberNames.map((name, index) => ({
    id: `member-${index + 1}`,
    name,
  }));

  const memberByName = new Map(
    members.map(member => [member.name, member])
  );

  const events = usableEvents.map((event, index) => ({
    id: `event-${index + 1}`,
    date: "",
    title: event.title,
  }));

  const answers = {};

  usableEvents.forEach((event, eventIndex) => {
    const eventId = events[eventIndex].id;

    for (const mark of ["○", "△", "×"]) {
      for (const name of event.status[mark] || []) {
        const member = memberByName.get(name);

        if (!member) continue;

        if (!answers[member.id]) {
          answers[member.id] = {};
        }

        answers[member.id][eventId] = mark;
      }
    }
  });

  return normalize({
    events,
    members,
    answers,
  });
}

async function getConfig(store) {
  try {
    const saved = await store.get(CONFIG_KEY, {
      type: "json",
    });

    return {
      densukeVisible:
        saved?.densukeVisible !== false,
    };
  } catch {
    return {
      densukeVisible: true,
    };
  }
}

function adminOK(request) {
  const expected =
    process.env.ADMIN_PASSWORD || "";

  const received =
    request.headers.get("x-admin-password") || "";

  return Boolean(
    expected && received === expected
  );
}

export default async request => {
  const store = getStore({
    name: STORE,
    consistency: "strong",
  });

  const url = new URL(request.url);

  try {
    if (request.method === "GET") {
      if (
        url.searchParams.get("config") === "1"
      ) {
        return json({
          config: await getConfig(store),
        });
      }

      let saved = null;

      try {
        saved = await store.get(KEY, {
          type: "json",
        });
      } catch {
        saved = null;
      }

      let data = normalize(saved || {});

      if (
        !data.events.length ||
        !data.members.length
      ) {
        try {
          data = await importDensuke();

          await store.setJSON(KEY, data);
        } catch (error) {
          console.error(
            "Densuke import error:",
            error
          );
        }
      }

      return json({ data });
    }

    if (request.method !== "POST") {
      return json(
        { error: "Method not allowed" },
        405
      );
    }

    let body = {};

    try {
      body = await request.json();
    } catch {
      return json(
        { error: "Invalid JSON" },
        400
      );
    }

    const action = body.action || "";

    if (action === "adminPing") {
      if (!adminOK(request)) {
        return json(
          { error: "Unauthorized" },
          401
        );
      }

      return json({ ok: true });
    }

    if (action === "setConfig") {
      if (!adminOK(request)) {
        return json(
          { error: "Unauthorized" },
          401
        );
      }

      const config = {
        densukeVisible:
          body.config?.densukeVisible !== false,
      };

      await store.setJSON(
        CONFIG_KEY,
        config
      );

      return json({
        ok: true,
        config,
      });
    }

    if (action === "adminSave") {
      if (!adminOK(request)) {
        return json(
          { error: "Unauthorized" },
          401
        );
      }

      const data = normalize(
        body.data || {}
      );

      await store.setJSON(KEY, data);

      return json({
        ok: true,
        data,
      });
    }

    if (action === "answer") {
      const eventId = String(
        body.eventId || ""
      );

      const memberId = String(
        body.memberId || ""
      );

      const status = String(
        body.status || ""
      );

      if (!eventId || !memberId) {
        return json(
          { error: "Missing id" },
          400
        );
      }

      if (
        status &&
        !["○", "△", "×"].includes(status)
      ) {
        return json(
          { error: "Invalid status" },
          400
        );
      }

      let current = {};

      try {
        current =
          (await store.get(KEY, {
            type: "json",
          })) || {};
      } catch {
        current = {};
      }

      const data = normalize(current);

      if (!data.answers[memberId]) {
        data.answers[memberId] = {};
      }

      if (status) {
        data.answers[memberId][eventId] =
          status;
      } else {
        delete data.answers[memberId][
          eventId
        ];
      }

      await store.setJSON(KEY, data);

      return json({
        ok: true,
        data,
      });
    }

    return json(
      { error: "Unknown action" },
      400
    );
  } catch (error) {
    console.error(
      "attendance-data error:",
      error
    );

    return json(
      { error: "Server error" },
      500
    );
  }
};
