import { getStore } from "@netlify/blobs";

const STORE = "yachiyo-public-site";
const KEY = "content/attendance.json";
const CONFIG_KEY = "content/attendance-config.json";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

function normalize(d = {}) {
  return {
    events: Array.isArray(d.events) ? d.events : [],
    members: Array.isArray(d.members) ? d.members : [],
    answers:
      d.answers && typeof d.answers === "object"
        ? d.answers
        : {},
    comments: Array.isArray(d.comments) ? d.comments : [],
  };
}

function cleanup(input) {
  const data = normalize(input);

  const now = new Date();

  const cut = new Date(
    now.getFullYear(),
    now.getMonth() - 2,
    now.getDate()
  );

  cut.setHours(0, 0, 0, 0);

  const ids = new Set(
    data.events
      .filter(e => {
        if (!e?.date) return false;

        const d = new Date(
          String(e.date) + "T00:00:00"
        );

        return (
          !Number.isNaN(d.getTime()) &&
          d < cut
        );
      })
      .map(e => String(e.id))
  );

  if (!ids.size) {
    return {
      data,
      changed: false,
    };
  }

  // 2か月より前の日程を削除
  data.events = data.events.filter(
    e => !ids.has(String(e.id))
  );

  // 削除した日程の○△×も削除
  for (const memberId of Object.keys(data.answers)) {
    const row = data.answers[memberId];

    if (
      row &&
      typeof row === "object"
    ) {
      for (const eventId of ids) {
        delete row[eventId];
      }
    }
  }

  // 削除した日程に紐づくコメントも削除
  data.comments = data.comments.filter(c => {
    // eventIdのない一般コメントは残す
    return (
      !c?.eventId ||
      !ids.has(String(c.eventId))
    );
  });

  // 回答者名は削除しない
  return {
    data,
    changed: true,
  };
}

async function getConfig(store) {
  try {
    const saved = await store.get(
      CONFIG_KEY,
      {
        type: "json",
      }
    );

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
    request.headers.get(
      "x-admin-password"
    ) || "";

  return Boolean(
    expected &&
    received === expected
  );
}

async function loadCleanData(store) {
  let current = {};

  try {
    current =
      (await store.get(KEY, {
        type: "json",
      })) || {};
  } catch {
    current = {};
  }

  const cleaned = cleanup(current);

  if (cleaned.changed) {
    await store.setJSON(
      KEY,
      cleaned.data
    );
  }

  return cleaned.data;
}

export default async request => {
  const store = getStore({
    name: STORE,
    consistency: "strong",
  });

  const url = new URL(request.url);

  try {
    // =========================
    // GET
    // =========================

    if (request.method === "GET") {
      if (
        url.searchParams.get("config") === "1"
      ) {
        return json({
          config:
            await getConfig(store),
        });
      }

      const data =
        await loadCleanData(store);

      return json({
        data,
      });
    }

    // =========================
    // POST以外
    // =========================

    if (request.method !== "POST") {
      return json(
        {
          error: "Method not allowed",
        },
        405
      );
    }

    let body = {};

    try {
      body = await request.json();
    } catch {
      return json(
        {
          error: "Invalid JSON",
        },
        400
      );
    }

    const action =
      body.action || "";

    // =========================
    // 管理者確認
    // =========================

    if (action === "adminPing") {
      if (!adminOK(request)) {
        return json(
          {
            error: "Unauthorized",
          },
          401
        );
      }

      return json({
        ok: true,
      });
    }

    // =========================
    // 伝助表示設定
    // =========================

    if (action === "setConfig") {
      if (!adminOK(request)) {
        return json(
          {
            error: "Unauthorized",
          },
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

    let data =
      await loadCleanData(store);

    // =========================
    // 管理画面から全体保存
    // =========================

    if (action === "adminSave") {
      if (!adminOK(request)) {
        return json(
          {
            error: "Unauthorized",
          },
          401
        );
      }

      data = cleanup(
        body.data || {}
      ).data;

      await store.setJSON(
        KEY,
        data
      );

      return json({
        ok: true,
        data,
      });
    }

    // =========================
    // ○ △ × 保存
    // =========================

    if (action === "answer") {
      const eventId =
        String(
          body.eventId || ""
        );

      const memberId =
        String(
          body.memberId || ""
        );

      const status =
        String(
          body.status || ""
        );

      if (
        !eventId ||
        !memberId
      ) {
        return json(
          {
            error: "Missing id",
          },
          400
        );
      }

      if (
        status &&
        !["○", "△", "×"].includes(
          status
        )
      ) {
        return json(
          {
            error: "Invalid status",
          },
          400
        );
      }

      const memberExists =
        data.members.some(
          m =>
            String(m.id) ===
            memberId
        );

      if (!memberExists) {
        return json(
          {
            error: "Member not found",
          },
          404
        );
      }

      const eventExists =
        data.events.some(
          e =>
            String(e.id) ===
            eventId
        );

      if (!eventExists) {
        return json(
          {
            error: "Event not found",
          },
          404
        );
      }

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

      await store.setJSON(
        KEY,
        data
      );

      return json({
        ok: true,
        data,
      });
    }

    // =========================
    // コメント保存
    // =========================

    if (action === "comment") {
      const memberId =
        String(
          body.memberId || ""
        );

      const eventId =
        String(
          body.eventId || ""
        );

      const text =
        String(
          body.text || ""
        ).trim();

      if (
        !memberId ||
        !text
      ) {
        return json(
          {
            error: "Missing comment",
          },
          400
        );
      }

      if (text.length > 500) {
        return json(
          {
            error: "Comment too long",
          },
          400
        );
      }

      const memberExists =
        data.members.some(
          m =>
            String(m.id) ===
            memberId
        );

      if (!memberExists) {
        return json(
          {
            error: "Member not found",
          },
          404
        );
      }

      if (eventId) {
        const eventExists =
          data.events.some(
            e =>
              String(e.id) ===
              eventId
          );

        if (!eventExists) {
          return json(
            {
              error: "Event not found",
            },
            404
          );
        }
      }

      const comment = {
        id:
          "comment_" +
          Date.now().toString(36) +
          "_" +
          Math.random()
            .toString(36)
            .slice(2, 8),

        memberId,
        eventId,
        text,

        updatedAt:
          new Date().toISOString(),

        source: "site",
      };

      data.comments.push(
        comment
      );

      // 最新300件まで保持
      if (
        data.comments.length > 300
      ) {
        data.comments =
          data.comments.slice(-300);
      }

      await store.setJSON(
        KEY,
        data
      );

      return json({
        ok: true,
        comment,
        data,
      });
    }

    return json(
      {
        error: "Unknown action",
      },
      400
    );
  } catch (error) {
    console.error(
      "attendance-data error:",
      error
    );

    return json(
      {
        error: "Server error",
      },
      500
    );
  }
};
