import { getStore } from "@netlify/blobs";

const STORE = "yachiyo-public-site";
const KEY = "content/attendance.json";
const CONFIG_KEY = "content/attendance-config-v2.json";

const DENSUKE_URL = "https://densuke.biz/list?cd=ZhxJNW9dPNGVtm7c";
const DENSUKE_MOBILE_URL = "https://densuke.biz/m/list2?cd=ZhxJNW9dPNGVtm7c";

const KNOWN_NAMES = [
  "吉岡父","杉山父","山澤父","山口明父","南父","山口勇父","安本父","浅野父","佐藤父","谷川父",
  "向山父","亀井父","松田惺父","長島父","荒木父","加藤父","石山父","大谷部父","草野父","古賀父",
  "齋藤父","佐藤父","篠崎父","竹内父","永井父","本村父","森田父","矢羽田父","赤羽父","秋葉父",
  "石川晃父","井上遥父","井上竜父","宇山父","江見父","加賀原父","粕谷父","亀井碧父","川村父",
  "小池父","高祖父","小堀父","紺野父","内藤父","中濱父","長峰父","松井父","溝上父","村山父",
  "本吉父","山澤奏父","山本諒父","山本要父",
  "吉岡母","杉山母","山澤母","舘母","山口明母","南母","山口勇母","安本母","谷川母","亀井母",
  "向山母","浅野母","松田母","長島母","荒木母","石川母","石山母","大谷部母","加藤母","草野母",
  "古賀母","齋藤母","佐藤母","篠崎母","椙浦母","高橋母","竹内母","筒井母","永井母","藤澤母",
  "本村母","森田母","矢羽田母","赤羽母","秋葉母","石川晃母","井上遥母","井上竜母","宇山母",
  "江見母","加賀原母","粕谷母","亀井碧母","川村母","小池母","高祖母","小堀母","紺野母","内藤母",
  "中濱母","長峰母","松井母","松浦母","溝上母","村山母","本吉母","山澤奏母","山本要母","山本諒母"
];

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

function twoMonthsAgo(now = new Date()) {
  const d = new Date(now);

  const day = d.getDate();

  d.setDate(1);
  d.setMonth(d.getMonth() - 2);

  const last = new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    0
  ).getDate();

  d.setDate(Math.min(day, last));
  d.setHours(0, 0, 0, 0);

  return d;
}

function cleanupOldData(data, now = new Date()) {
  const cutoff = twoMonthsAgo(now);

  const removed = new Set();

  data.events =
    data.events.filter(event => {
      if (!event?.date) return true;

      const d =
        new Date(
          event.date + "T00:00:00"
        );

      if (Number.isNaN(d.getTime()))
        return true;

      if (d < cutoff) {
        removed.add(
          String(event.id)
        );

        return false;
      }

      return true;
    });

  if (removed.size) {
    for (
      const memberId
      of Object.keys(data.answers)
    ) {
      const row =
        data.answers[memberId];

      if (
        !row ||
        typeof row !== "object"
      ) continue;

      for (
        const eventId
        of removed
      ) {
        delete row[eventId];
      }
    }
  }

  data.comments =
    data.comments.filter(
      comment => {
        if (!comment?.updatedAt)
          return true;

        const d =
          new Date(
            comment.updatedAt
          );

        return (
          Number.isNaN(
            d.getTime()
          ) ||
          d >= cutoff
        );
      }
    );

  return data;
}

async function getConfig(store) {
  try {
    const saved =
      await store.get(
        CONFIG_KEY,
        {
          type: "json",
        }
      );

    return {
      migrationEnded:
        saved?.migrationEnded === true,

      endedAt:
        String(
          saved?.endedAt || ""
        ),
    };
  } catch {
    return {
      migrationEnded: false,
      endedAt: "",
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

function decodeEntities(s) {
  return String(s || "")
    .replace(
      /&nbsp;|&#160;/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#39;|&apos;/gi,
      "'"
    )
    .replace(
      /&#(\d+);/g,
      (_, n) =>
        String.fromCharCode(
          Number(n)
        )
    );
}

function htmlToText(html) {
  return decodeEntities(
    String(html || "")
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(
        /<br\s*\/?\s*>/gi,
        "\n"
      )
      .replace(
        /<\/(?:p|div|tr|li|td|th|section|article|h[1-6])>/gi,
        "\n"
      )
      .replace(
        /<[^>]+>/g,
        " "
      )
  )
    .replace(/\r/g, "")
    .replace(
      /[ \t]+/g,
      " "
    )
    .replace(
      /\n[ \t]+/g,
      "\n"
    )
    .replace(
      /\n{3,}/g,
      "\n\n"
    )
    .trim();
}

function cleanCandidateName(value) {
  const name =
    String(value || "")
      .trim()
      .replace(
        /^[：:\s]+|[：:\s]+$/g,
        ""
      );

  if (
    !name ||
    name.length > 30
  ) {
    return "";
  }

  if (
    /^(?:参加|不参加|未定|回答|未回答|出席|欠席|コメント|更新|日時|伝助|予定|名前|氏名|合計|○|△|×)$/u
      .test(name)
  ) {
    return "";
  }

  if (
    /^[0-9０-９/\-:：.年月日時分]+$/u
      .test(name)
  ) {
    return "";
  }

  return name;
}

function extractNamesFromDensuke(html) {
  const text =
    htmlToText(html);

  const lines =
    text
      .split("\n")
      .map(
        s => s.trim()
      )
      .filter(Boolean);

  const seen =
    new Set();

  const ordered = [];

  const add = value => {
    const name =
      cleanCandidateName(value);

    if (
      !name ||
      seen.has(name)
    ) {
      return;
    }

    seen.add(name);
    ordered.push(name);
  };

  /*
    伝助終了時だけ、
    現在の伝助ページに存在する
    回答者名を拾う。
  */
  for (
    const name
    of KNOWN_NAMES
  ) {
    if (
      text.includes(name)
    ) {
      add(name);
    }
  }

  /*
    ○△×の行から
    名前だけを取得。
    日程や回答内容自体は保存しない。
  */
  for (
    const line
    of lines
  ) {
    const m =
      line.match(
        /^[○△×]\s*[：:]\s*(.+)$/u
      );

    if (!m) continue;

    for (
      const token
      of m[1].split(
        /[\s　,、]+/u
      )
    ) {
      add(token);
    }
  }

  /*
    コメント欄に
    （名前）
    と出ている場合も
    名前だけ候補にする。
  */
  const commentRe =
    /[（(]([^()（）\r\n]{1,30})[）)]/gu;

  let match;

  while (
    (
      match =
        commentRe.exec(text)
    )
  ) {
    add(match[1]);
  }

  /*
    同じ名前が複数存在する
    既存回答者については
    人数を維持する。
  */
  const counts =
    new Map();

  for (
    const name
    of KNOWN_NAMES
  ) {
    counts.set(
      name,
      (
        counts.get(name) || 0
      ) + 1
    );
  }

  const expanded = [];

  for (
    const name
    of ordered
  ) {
    const n =
      counts.get(name) || 1;

    for (
      let i = 0;
      i < n;
      i++
    ) {
      expanded.push(name);
    }
  }

  return expanded;
}

async function fetchDensukeNames() {
  const urls = [
    DENSUKE_URL,
    DENSUKE_MOBILE_URL,
  ];

  let lastError = null;

  for (
    const target
    of urls
  ) {
    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () =>
          controller.abort(),
        10000
      );

    try {
      const r =
        await fetch(
          target,
          {
            headers: {
              "user-agent":
                "Mozilla/5.0 (compatible; YachiyoLittleSeniorAttendance/1.0)",

              "accept-language":
                "ja,en;q=0.8",
            },

            signal:
              controller.signal,

            redirect:
              "follow",
          }
        );

      if (!r.ok) {
        throw new Error(
          `Densuke HTTP ${r.status}`
        );
      }

      const names =
        extractNamesFromDensuke(
          await r.text()
        );

      /*
        名前取得に失敗した場合は
        伝助終了を確定させない。
      */
      if (
        names.length < 5
      ) {
        throw new Error(
          "伝助から回答者名を十分に取得できませんでした"
        );
      }

      return names;
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }

  throw (
    lastError ||
    new Error(
      "伝助から回答者名を取得できませんでした"
    )
  );
}

function makeMembers(names) {
  return names.map(
    (name, i) => ({
      id:
        `member_${Date.now().toString(36)}_${i + 1}`,

      name,
    })
  );
}

async function loadData(store) {
  let saved = null;

  try {
    saved =
      await store.get(
        KEY,
        {
          type: "json",
        }
      );
  } catch {
    saved = null;
  }

  return cleanupOldData(
    normalize(
      saved || {}
    )
  );
}

export default async request => {
  const store =
    getStore({
      name: STORE,
      consistency: "strong",
    });

  try {
    const config =
      await getConfig(store);

    /*
      伝助終了前
      ↓
      保護者出欠確認は
      閲覧も不可。
    */
    if (
      request.method === "GET"
    ) {
      if (
        !config.migrationEnded
      ) {
        return json({
          locked: true,
          config,
        });
      }

      const data =
        await loadData(store);

      await store.setJSON(
        KEY,
        data
      );

      return json({
        locked: false,
        config,
        data,
      });
    }

    if (
      request.method !== "POST"
    ) {
      return json(
        {
          error:
            "Method not allowed",
        },
        405
      );
    }

    let body = {};

    try {
      body =
        await request.json();
    } catch {
      return json(
        {
          error:
            "Invalid JSON",
        },
        400
      );
    }

    const action =
      String(
        body.action || ""
      );

    if (
      action === "adminPing"
    ) {
      if (
        !adminOK(request)
      ) {
        return json(
          {
            error:
              "Unauthorized",
          },
          401
        );
      }

      return json({
        ok: true,
        config,
      });
    }

    /*
      管理から
      「伝助を終了」

      この瞬間だけ
      伝助へアクセスして
      名前だけ取得する。
    */
    if (
      action === "endDensuke"
    ) {
      if (
        !adminOK(request)
      ) {
        return json(
          {
            error:
              "Unauthorized",
          },
          401
        );
      }

      if (
        config.migrationEnded
      ) {
        return json(
          {
            error:
              "伝助はすでに終了しています",
          },
          409
        );
      }

      /*
        名前だけ取得。
        日程・○△×・コメントは
        一切取得しない。
      */
      const names =
        await fetchDensukeNames();

      const data = {
        events: [],
        members:
          makeMembers(names),
        answers: {},
        comments: [],
      };

      const nextConfig = {
        migrationEnded: true,

        endedAt:
          new Date()
            .toISOString(),
      };

      await store.setJSON(
        KEY,
        data
      );

      await store.setJSON(
        CONFIG_KEY,
        nextConfig
      );

      return json({
        ok: true,
        locked: false,
        config: nextConfig,
        data,
        importedNames:
          names.length,
      });
    }

    /*
      伝助終了前は
      ○△×・コメント・
      日程・名前管理も不可。
    */
    if (
      !config.migrationEnded
    ) {
      return json(
        {
          error:
            "伝助終了前は保護者出欠確認を使用できません",
        },
        423
      );
    }

    let data =
      await loadData(store);

    /*
      管理画面保存
    */
    if (
      action === "adminSave"
    ) {
      if (
        !adminOK(request)
      ) {
        return json(
          {
            error:
              "Unauthorized",
          },
          401
        );
      }

      data =
        cleanupOldData(
          normalize(
            body.data || {}
          )
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

    /*
      ○ △ ×
    */
    if (
      action === "answer"
    ) {
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
            error:
              "Missing id",
          },
          400
        );
      }

      if (
        status &&
        ![
          "○",
          "△",
          "×",
        ].includes(status)
      ) {
        return json(
          {
            error:
              "Invalid status",
          },
          400
        );
      }

      if (
        !data.members.some(
          m =>
            String(m.id) ===
            memberId
        )
      ) {
        return json(
          {
            error:
              "Member not found",
          },
          404
        );
      }

      if (
        !data.events.some(
          e =>
            String(e.id) ===
            eventId
        )
      ) {
        return json(
          {
            error:
              "Event not found",
          },
          404
        );
      }

      if (
        !data.answers[
          memberId
        ]
      ) {
        data.answers[
          memberId
        ] = {};
      }

      if (status) {
        data.answers[
          memberId
        ][eventId] =
          status;
      } else {
        delete data.answers[
          memberId
        ][eventId];
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

    /*
      コメント
    */
    if (
      action === "comment"
    ) {
      const memberId =
        String(
          body.memberId || ""
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
            error:
              "Missing comment",
          },
          400
        );
      }

      if (
        text.length > 500
      ) {
        return json(
          {
            error:
              "Comment too long",
          },
          400
        );
      }

      if (
        !data.members.some(
          m =>
            String(m.id) ===
            memberId
        )
      ) {
        return json(
          {
            error:
              "Member not found",
          },
          404
        );
      }

      data.comments.push({
        id:
          `comment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,

        memberId,
        text,

        updatedAt:
          new Date()
            .toISOString(),

        source:
          "site",
      });

      if (
        data.comments.length >
        300
      ) {
        data.comments =
          data.comments.slice(
            -300
          );
      }

      data =
        cleanupOldData(data);

      await store.setJSON(
        KEY,
        data
      );

      return json({
        ok: true,
        data,
      });
    }

    return json(
      {
        error:
          "Unknown action",
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
        error:
          String(
            error?.message ||
            "Server error"
          ),
      },
      500
    );
  }
};
