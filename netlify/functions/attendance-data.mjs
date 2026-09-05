import { getStore } from "@netlify/blobs";

const STORE = "yachiyo-public-site";
const KEY = "content/attendance.json";
const CONFIG_KEY = "content/attendance-config-v2.json";
const ACCESS_KEY = "content/access-settings.json";

const DENSUKE_URL =
  "https://densuke.biz/list?cd=ZhxJNW9dPNGVtm7c";

const DENSUKE_MOBILE_URL =
  "https://densuke.biz/m/list2?cd=ZhxJNW9dPNGVtm7c";

// 回答者名は公開ソースに保持せず、移行時に伝助から取得する。
const KNOWN_NAMES = [];

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
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
    difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return difference === 0;
}

async function accessOK(request, store) {
  const entered = String(request.headers.get("x-access-password") || "");
  if (!entered || entered.length > 128) return false;

  const saved = await store.get(ACCESS_KEY, {
    type: "json",
    consistency: "strong"
  });

  if (saved?.salt && saved?.hash) {
    const enteredHash = await hashAccessPassword(entered, saved.salt);
    return safeEqual(enteredHash, saved.hash);
  }

  const initialPassword = process.env.ACCESS_PASSWORD;
  return Boolean(initialPassword) && safeEqual(entered, initialPassword);
}

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",

        "cache-control":
          "no-store"
      }
    }
  );
}

function normalize(data = {}) {
  return {
    events:
      Array.isArray(data.events)
        ? data.events
        : [],

    members:
      Array.isArray(data.members)
        ? data.members
        : [],

    answers:
      data.answers &&
      typeof data.answers === "object"
        ? data.answers
        : {},

    comments:
      Array.isArray(data.comments)
        ? data.comments
        : []
  };
}

/*
  現在から2か月前。
*/
function twoMonthsAgo(now = new Date()) {
  const d =
    new Date(now);

  const day =
    d.getDate();

  d.setDate(1);
  d.setMonth(
    d.getMonth() - 2
  );

  const last =
    new Date(
      d.getFullYear(),
      d.getMonth() + 1,
      0
    ).getDate();

  d.setDate(
    Math.min(day, last)
  );

  d.setHours(
    0, 0, 0, 0
  );

  return d;
}

/*
  2か月より古い
  日程・コメントを自動削除。
*/
function cleanupOldData(
  data,
  now = new Date()
) {
  const cutoff =
    twoMonthsAgo(now);

  const removed =
    new Set();

  data.events =
    data.events.filter(
      event => {
        if (!event?.date)
          return true;

        const d =
          new Date(
            event.date +
            "T00:00:00"
          );

        if (
          Number.isNaN(
            d.getTime()
          )
        ) {
          return true;
        }

        if (d < cutoff) {
          removed.add(
            String(event.id)
          );

          return false;
        }

        return true;
      }
    );

  /*
    削除した日程の
    ○△×も削除。
  */
  if (removed.size) {
    for (
      const memberId
      of Object.keys(
        data.answers
      )
    ) {
      const row =
        data.answers[
          memberId
        ];

      if (
        !row ||
        typeof row !==
          "object"
      ) {
        continue;
      }

      for (
        const eventId
        of removed
      ) {
        delete row[
          eventId
        ];
      }
    }
  }

  /*
    2か月より古い
    コメントを削除。
  */
  data.comments =
    data.comments.filter(
      comment => {
        if (
          !comment?.updatedAt
        ) {
          return true;
        }

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

/*
  移行状態を取得。

  namesImported:
  伝助から名前を一度でも
  取得したかどうか。

  これにより
  「移行を再開」
  ↓
  「再び終了」
  としても伝助を再取得しない。
*/
async function getConfig(store) {
  try {
    const saved =
      await store.get(
        CONFIG_KEY,
        {
          type: "json"
        }
      );

    return {
      migrationEnded:
        saved?.migrationEnded ===
        true,

      endedAt:
        String(
          saved?.endedAt || ""
        ),

      namesImported:
        saved?.namesImported ===
        true
    };
  } catch {
    return {
      migrationEnded:
        false,

      endedAt:
        "",

      namesImported:
        false
    };
  }
}

function adminOK(request) {
  const expected =
    process.env
      .ADMIN_PASSWORD || "";

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

function cleanCandidateName(
  value
) {
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

/*
  伝助から
  「名前だけ」を抽出。

  日程・○△×・コメントは
  保存しない。
*/
function extractNamesFromDensuke(
  html
) {
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

  const ordered =
    [];

  const add =
    value => {
      const name =
        cleanCandidateName(
          value
        );

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
    既知の回答者名から
    現在ページに存在する
    名前だけ拾う。
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
    ○△×欄に名前が
    表示されている場合。
  */
  for (
    const line
    of lines
  ) {
    const m =
      line.match(
        /^[○△×]\s*[：:]\s*(.+)$/u
      );

    if (!m)
      continue;

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
    コメント等で
    （名前）
    表示される場合の補助。

    コメント自体は
    保存しない。
  */
  const re =
    /[（(]([^()（）\r\n]{1,30})[）)]/gu;

  let match;

  while (
    (
      match =
        re.exec(text)
    )
  ) {
    add(match[1]);
  }

  /*
    同姓同名を維持。
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
        counts.get(name) ||
        0
      ) + 1
    );
  }

  const expanded =
    [];

  for (
    const name
    of ordered
  ) {
    const n =
      counts.get(name) ||
      1;

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

/*
  伝助へのアクセスは
  初回の「伝助を終了」
  実行時のみ。
*/
async function fetchDensukeNames() {
  const urls = [
    DENSUKE_URL,
    DENSUKE_MOBILE_URL
  ];

  let lastError =
    null;

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
                "ja,en;q=0.8"
            },

            signal:
              controller.signal,

            redirect:
              "follow"
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
        取得失敗時は
        終了状態にしない。
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
      lastError =
        e;

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

function makeMembers(
  names
) {
  return names.map(
    (name, i) => ({
      id:
        `member_${Date.now().toString(36)}_${i + 1}`,

      name
    })
  );
}

async function loadData(
  store
) {
  let saved =
    null;

  try {
    saved =
      await store.get(
        KEY,
        {
          type: "json"
        }
      );
  } catch {
    saved =
      null;
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
      name:
        STORE,

      consistency:
        "strong"
    });

  try {
    const config =
      await getConfig(
        store
      );

    /*
      GET

      伝助終了前は
      attendanceデータ自体を
      外へ返さない。
    */
    if (
      request.method ===
      "GET"
    ) {
      if (!(await accessOK(request, store))) {
        return json({ error: "Unauthorized" }, 401);
      }

      if (
        !config
          .migrationEnded
      ) {
        return json({
          locked: true,
          config
        });
      }

      const data =
        await loadData(
          store
        );

      await store.setJSON(
        KEY,
        data
      );

      return json({
        locked: false,
        config,
        data
      });
    }

    if (
      request.method !==
      "POST"
    ) {
      return json(
        {
          error:
            "Method not allowed"
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
            "Invalid JSON"
        },
        400
      );
    }

    const action =
      String(
        body.action || ""
      );

    const adminActions = new Set([
      "adminPing",
      "endDensuke",
      "resumeDensuke",
      "adminSave"
    ]);

    if (!adminActions.has(action) && !(await accessOK(request, store))) {
      return json({ error: "Unauthorized" }, 401);
    }

    /*
      管理者認証確認。
    */
    if (
      action ===
      "adminPing"
    ) {
      if (
        !adminOK(request)
      ) {
        return json(
          {
            error:
              "Unauthorized"
          },
          401
        );
      }

      return json({
        ok: true,
        config
      });
    }

    /*
      ──────────────────
      伝助を終了
      ──────────────────

      初回のみ
      伝助から名前を取得。

      日程・○△×・コメントは
      取得しない。
    */
    if (
      action ===
      "endDensuke"
    ) {
      if (
        !adminOK(request)
      ) {
        return json(
          {
            error:
              "Unauthorized"
          },
          401
        );
      }

      if (
        config
          .migrationEnded
      ) {
        return json(
          {
            error:
              "伝助はすでに終了しています"
          },
          409
        );
      }

      let data =
        await loadData(
          store
        );

      let importedNames =
        0;

      /*
        初回終了時だけ
        伝助へアクセス。
      */
      if (
        !config
          .namesImported
      ) {
        const names =
          await fetchDensukeNames();

        /*
          名前だけで
          新しい出欠データを
          開始する。

          日程
          ○△×
          コメント
          は空。
        */
        data = {
          events: [],

          members:
            makeMembers(
              names
            ),

          answers: {},

          comments: []
        };

        importedNames =
          names.length;

        await store.setJSON(
          KEY,
          data
        );
      }

      /*
        名前取得成功後にだけ
        移行終了を確定。
      */
      const nextConfig = {
        migrationEnded:
          true,

        endedAt:
          new Date()
            .toISOString(),

        namesImported:
          true
      };

      await store.setJSON(
        CONFIG_KEY,
        nextConfig
      );

      return json({
        ok: true,

        locked:
          false,

        config:
          nextConfig,

        data,

        importedNames
      });
    }

    /*
      ──────────────────
      伝助移行を再開
      ──────────────────

      サイト側の状態だけ
      「移行中」に戻す。

      保存済みデータは
      一切削除しない。

      伝助そのものを
      復元する機能ではない。
    */
    if (
      action ===
      "resumeDensuke"
    ) {
      if (
        !adminOK(request)
      ) {
        return json(
          {
            error:
              "Unauthorized"
          },
          401
        );
      }

      const nextConfig = {
        migrationEnded:
          false,

        endedAt:
          "",

        /*
          ここをtrueのまま
          保持することで、
          再終了時に伝助へ
          再アクセスしない。
        */
        namesImported:
          config
            .namesImported ===
          true
      };

      await store.setJSON(
        CONFIG_KEY,
        nextConfig
      );

      return json({
        ok: true,

        locked:
          true,

        config:
          nextConfig
      });
    }

    /*
      伝助終了前は
      ○△×・コメント・
      管理保存を禁止。
    */
    if (
      !config
        .migrationEnded
    ) {
      return json(
        {
          error:
            "伝助終了前は保護者出欠確認を使用できません"
        },
        423
      );
    }

    let data =
      await loadData(
        store
      );

    /*
      管理画面保存。
      日程追加・削除、
      名前追加・削除など。
    */
    if (
      action ===
      "adminSave"
    ) {
      if (
        !adminOK(request)
      ) {
        return json(
          {
            error:
              "Unauthorized"
          },
          401
        );
      }

      data =
        cleanupOldData(
          normalize(
            body.data ||
            {}
          )
        );

      await store.setJSON(
        KEY,
        data
      );

      return json({
        ok: true,
        data
      });
    }

    /*
      ○ △ × 保存
    */
    if (
      action ===
      "answer"
    ) {
      const eventId =
        String(
          body.eventId ||
          ""
        );

      const memberId =
        String(
          body.memberId ||
          ""
        );

      const status =
        String(
          body.status ||
          ""
        );

      if (
        !eventId ||
        !memberId
      ) {
        return json(
          {
            error:
              "Missing id"
          },
          400
        );
      }

      if (
        status &&
        ![
          "○",
          "△",
          "×"
        ].includes(
          status
        )
      ) {
        return json(
          {
            error:
              "Invalid status"
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
              "Member not found"
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
              "Event not found"
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
        data
      });
    }

    /*
      コメント追加。
    */
    if (
      action ===
      "comment"
    ) {
      const memberId =
        String(
          body.memberId ||
          ""
        );

      const text =
        String(
          body.text ||
          ""
        ).trim();

      if (
        !memberId ||
        !text
      ) {
        return json(
          {
            error:
              "Missing comment"
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
              "Comment too long"
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
              "Member not found"
          },
          404
        );
      }

      data.comments.push({
        id:
          `comment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,

        memberId,

        text,

        updatedAt:
          new Date()
            .toISOString(),

        source:
          "site"
      });

      /*
        念のため
        最大300件。
      */
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
        cleanupOldData(
          data
        );

      await store.setJSON(
        KEY,
        data
      );

      return json({
        ok: true,
        data
      });
    }

    return json(
      {
        error:
          "Unknown action"
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
          )
      },
      500
    );
  }
};
