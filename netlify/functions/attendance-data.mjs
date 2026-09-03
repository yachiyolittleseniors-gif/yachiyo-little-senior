import { getStore } from "@netlify/blobs";

const STORE = "yachiyo-public-site";
const KEY = "content/attendance.json";
const CONFIG_KEY = "content/attendance-config.json";

// 今保存済みの出欠データはそのまま使用します。
// コメント機能だけ追加します。

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
    comments: Array.isArray(data.comments) ? data.comments : [],
  };
}

async function getConfig(store) {
  try {
    const saved = await store.get(CONFIG_KEY, { type: "json" });

    return {
      densukeVisible: saved?.densukeVisible !== false,
    };
  } catch {
    return {
      densukeVisible: true,
    };
  }
}

function adminOK(request) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const received =
    request.headers.get("x-admin-password") || "";

  return Boolean(expected && received === expected);
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
      if (url.searchParams.get("config") === "1") {
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

      const data = normalize(saved || {});

      return json({ data });
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

    const action = body.action || "";

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
    // 設定保存
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

    // 現在のデータを取得
    let current = {};

    try {
      current =
        (await store.get(KEY, {
          type: "json",
        })) || {};
    } catch {
      current = {};
    }

    let data = normalize(current);

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

      data = normalize(
        body.data || {}
      );

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
          {
            error: "Missing id",
          },
          400
        );
      }

      if (
        status &&
        !["○", "△", "×"].includes(status)
      ) {
        return json(
          {
            error: "Invalid status",
          },
          400
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
      const memberId = String(
        body.memberId || ""
      );

      const text = String(
        body.text || ""
      ).trim();

      if (!memberId || !text) {
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
            String(m.id) === memberId
        );

      if (!memberExists) {
        return json(
          {
            error: "Member not found",
          },
          404
        );
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
        text,

        updatedAt:
          new Date().toISOString(),

        source: "site",
      };

      data.comments.push(comment);

      // コメントが増えすぎないよう
      // 最新300件まで保持
      if (data.comments.length > 300) {
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
