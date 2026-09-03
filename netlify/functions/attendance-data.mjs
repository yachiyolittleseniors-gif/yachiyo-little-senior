import { getStore } from "@netlify/blobs";

const STORE = "yachiyo-public-site";
const KEY = "content/attendance.json";
const CONFIG_KEY = "content/attendance-config.json";

const DENSUKE_URL =
  "https://www.densuke.biz/m/list2?cd=ZhxJNW9dPNGVtm7c&pw=";

const SYNC_INTERVAL_MS = 60 * 1000;

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
    syncMeta:
      data.syncMeta && typeof data.syncMeta === "object"
        ? data.syncMeta
        : {},
  };
}

function cutoffDate(now = new Date()) {
  const d = new Date(
    now.getFullYear(),
    now.getMonth() - 2,
    now.getDate()
  );
  d.setHours(0, 0, 0, 0);
  return d;
}

function cleanupOldData(input, now = new Date()) {
  const data = normalize(input);
  const cutoff = cutoffDate(now);
  const removed = new Set();

  data.events = data.events.filter(event => {
    if (!event?.date) return true;

    const d = new Date(`${event.date}T00:00:00`);
    const old =
      !Number.isNaN(d.getTime()) &&
      d < cutoff;

    if (old) removed.add(String(event.id));
    return !old;
  });

  for (const memberId of Object.keys(data.answers)) {
    const row = data.answers[memberId];

    if (!row || typeof row !== "object") continue;

    for (const eventId of removed) {
      delete row[eventId];
    }
  }

  data.comments = data.comments.filter(comment => {
    const t = new Date(comment?.updatedAt || 0);

    return (
      !Number.isNaN(t.getTime()) &&
      t >= cutoff
    );
  });

  return data;
}

async function getConfig(store) {
  let saved = null;

  try {
    saved = await store.get(CONFIG_KEY, {
      type: "json",
    });
  } catch {}

  const syncEndedAt = saved?.syncEndedAt || "";

  return {
    densukeVisible: saved?.densukeVisible !== false,
    densukeSyncEnabled:
      !syncEndedAt &&
      saved?.densukeSyncEnabled !== false,
    syncEndedAt,
  };
}

function adminOK(request) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const received =
    request.headers.get("x-admin-password") || "";

  return Boolean(
    expected &&
    received === expected
  );
}

function decodeEntities(text) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return String(text || "")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .replace(/&([a-z]+);/gi, (m, n) =>
      named[n.toLowerCase()] ?? m
    );
}

function htmlToText(html) {
  return decodeEntities(
    String(html || "")
      .replace(
        /<script\b[^>]*>[\s\S]*?<\/script>/gi,
        ""
      )
      .replace(
        /<style\b[^>]*>[\s\S]*?<\/style>/gi,
        ""
      )
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(
        /<\/(?:li|p|div|tr|h[1-6]|section|article)>/gi,
        "\n"
      )
      .replace(/<li\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\r/g, "")
    .replace(/[\t\u00a0]+/g, " ")
    .replace(/\n[ ]+/g, "\n")
    .replace(/[ ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeName(name) {
  return String(name || "")
    .replace(/[\u3000\s]+/g, " ")
    .trim()
    .toLowerCase();
}

function hashString(s) {
  let h = 2166136261;

  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }

  return (h >>> 0).toString(36);
}

function parseDateFromLine(line, now = new Date()) {
  const m = String(line).match(
    /(?:^|[^\d])(\d{1,2})\s*[\/月]\s*(\d{1,2})(?:\s*日)?/
  );

  if (!m) return "";

  const month = Number(m[1]);
  const day = Number(m[2]);

  const candidates = [
    now.getFullYear() - 1,
    now.getFullYear(),
    now.getFullYear() + 1,
  ]
    .map(year =>
      new Date(year, month - 1, day)
    )
    .filter(
      d =>
        d.getMonth() === month - 1 &&
        d.getDate() === day
    );

  if (!candidates.length) return "";

  candidates.sort(
    (a, b) =>
      Math.abs(a - now) -
      Math.abs(b - now)
  );

  const d = candidates[0];

  return (
    `${d.getFullYear()}-` +
    `${String(month).padStart(2, "0")}-` +
    `${String(day).padStart(2, "0")}`
  );
}

function splitNames(text, knownNames = []) {
  let rest = String(text || "")
    .replace(/^[：:\s]+/, "")
    .trim();

  if (!rest) return [];

  const found = [];

  const ordered = [...knownNames]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const name of ordered) {
    const escaped = name.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const re = new RegExp(
      `(^|\\s)${escaped}(?=\\s|$)`,
      "g"
    );

    if (re.test(rest)) {
      found.push(name);
      rest = rest.replace(re, " ");
    }
  }

  for (
    const token of rest
      .split(/\s+/)
      .filter(Boolean)
  ) {
    found.push(token);
  }

  return [
    ...new Set(
      found
        .map(x => x.trim())
        .filter(Boolean)
    ),
  ];
}

function commentDate(
  month,
  day,
  hour,
  minute,
  now = new Date()
) {
  let year = now.getFullYear();

  let d = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    0
  );

  /*
   * 1月に12月のコメントを読む場合など
   * 明らかに未来なら前年として扱う
   */
  if (
    d.getTime() >
    now.getTime() +
      31 * 24 * 60 * 60 * 1000
  ) {
    year--;

    d = new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      0
    );
  }

  return d.toISOString();
}

function parseDensuke(
  html,
  existingMembers = [],
  now = new Date()
) {
  const text = htmlToText(html);

  const lines = text
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  const knownNames = existingMembers
    .map(m => String(m.name || "").trim())
    .filter(Boolean);

  const events = [];
  let current = null;

  /*
   * ○△×取得
   */
  for (const raw of lines) {
    const line = raw
      .replace(/^[*・●◦]+\s*/, "")
      .trim();

    const status = line.match(
      /^([○△×])\s*[：:]\s*(.*)$/
    );

    if (status && current) {
      current.statuses[status[1]] =
        splitNames(
          status[2],
          knownNames
        );

      continue;
    }

    const date =
      parseDateFromLine(
        line,
        now
      );

    /*
     * コメント行を日程として
     * 誤認しないよう除外
     */
    if (
      date &&
      !/^[（(]/.test(line) &&
      !/^\[/.test(line)
    ) {
      current = {
        date,
        title: line,

        statuses: {
          "○": [],
          "△": [],
          "×": [],
        },
      };

      events.push(current);
    }
  }

  if (!events.length) {
    throw new Error(
      "Densuke events were not found"
    );
  }

  /*
   * コメント取得
   *
   * 実際の伝助形式
   *
   * （篠崎父）9/6車出せます。
   * [9/3 10:41]
   *
   * HTML→テキスト変換後に
   * 同一行になっている場合にも対応
   */
  const comments = [];

  const commentRegex =
    /[（(]([^()（）\r\n]+)[）)]\s*([\s\S]*?)\s*\[(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\]/g;

  let match;

  while (
    (match =
      commentRegex.exec(text))
  ) {
    const memberName =
      match[1].trim();

    let commentText =
      match[2].trim();

    /*
     * 次のコメントまで
     * 飲み込んだ場合の防止
     */
    commentText =
      commentText
        .replace(
          /\n?[・●]\s*$/,
          ""
        )
        .trim();

    if (
      !memberName ||
      !commentText
    ) {
      continue;
    }

    const updatedAt =
      commentDate(
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6]),
        now
      );

    comments.push({
      memberName,
      text: commentText,
      updatedAt,
    });
  }

  return {
    events,
    comments,
  };
}

function findOrCreateMember(
  data,
  name,
  meta
) {
  const key =
    normalizeName(name);

  let member =
    data.members.find(
      m =>
        normalizeName(m.name) ===
        key
    );

  if (!member) {
    member = {
      id:
        "densuke_member_" +
        hashString(key),

      name:
        String(name).trim(),

      source:
        "densuke",
    };

    data.members.push(member);
  }

  meta.densukeMemberNames[
    key
  ] = member.id;

  return member;
}

function findOrCreateEvent(
  data,
  incoming
) {
  const key =
    `${incoming.date}|${incoming.title}`;

  let event =
    data.events.find(
      e =>
        String(
          e.densukeKey || ""
        ) === key
    );

  if (!event) {
    const sameDate =
      data.events.filter(
        e =>
          String(e.date) ===
          incoming.date
      );

    if (sameDate.length === 1) {
      event = sameDate[0];
    }
  }

  if (!event) {
    event = {
      id:
        "densuke_event_" +
        hashString(key),

      date:
        incoming.date,

      title:
        incoming.title,

      source:
        "densuke",
    };

    data.events.push(event);
  }

  event.densukeKey = key;

  if (!event.title) {
    event.title =
      incoming.title;
  }

  return event;
}

function mergeDensuke(
  input,
  parsed,
  now = new Date()
) {
  let data =
    normalize(input);

  const meta =
    data.syncMeta;

  meta.densukeMemberNames =
    meta.densukeMemberNames &&
    typeof meta
      .densukeMemberNames ===
      "object"
      ? meta.densukeMemberNames
      : {};

  /*
   * 現在登録済みの回答者を
   * 伝助名との対応表へ登録
   */
  if (
    !meta
      .densukeMembersInitialized
  ) {
    for (
      const member
      of data.members
    ) {
      const key =
        normalizeName(
          member.name
        );

      if (key) {
        meta
          .densukeMemberNames[
            key
          ] = member.id;
      }
    }

    meta
      .densukeMembersInitialized =
      true;
  }

  /*
   * ○△×同期
   */
  for (
    const incoming
    of parsed.events
  ) {
    const event =
      findOrCreateEvent(
        data,
        incoming
      );

    const eventId =
      String(event.id);

    /*
     * 伝助同期対象者の
     * 以前の回答を一度消す
     */
    for (
      const memberId
      of Object.values(
        meta
          .densukeMemberNames
      )
    ) {
      if (
        data.answers[
          memberId
        ]
      ) {
        delete data.answers[
          memberId
        ][eventId];
      }
    }

    for (
      const symbol
      of ["○", "△", "×"]
    ) {
      for (
        const name
        of incoming
          .statuses[
            symbol
          ] || []
      ) {
        const member =
          findOrCreateMember(
            data,
            name,
            meta
          );

        data.answers[
          member.id
        ] ??= {};

        data.answers[
          member.id
        ][eventId] =
          symbol;
      }
    }
  }

  /*
   * サイトで入力したコメントは残す
   */
  const siteComments =
    data.comments.filter(
      c =>
        c.source !==
        "densuke"
    );

  /*
   * 今回伝助から取得できた
   * コメントを作り直す
   */
  const densukeComments = [];

  for (
    const item
    of parsed.comments
  ) {
    const member =
      findOrCreateMember(
        data,
        item.memberName,
        meta
      );

    const key =
      `${normalizeName(
        item.memberName
      )}|${item.text}|${item.updatedAt}`;

    densukeComments.push({
      id:
        "densuke_live_" +
        hashString(key),

      memberId:
        member.id,

      text:
        item.text,

      updatedAt:
        item.updatedAt,

      source:
        "densuke",
    });
  }

  /*
   * 伝助取得成功時のみ
   * 伝助コメント一覧を更新
   */
  data.comments = [
    ...siteComments,
    ...densukeComments,
  ];

  meta.lastDensukeSyncAt =
    now.toISOString();

  meta.lastDensukeSyncError =
    "";

  return cleanupOldData(
    data,
    now
  );
}

async function fetchDensuke(data) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      10000
    );

  try {
    const response =
      await fetch(
        DENSUKE_URL,
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

    if (!response.ok) {
      throw new Error(
        `Densuke HTTP ${response.status}`
      );
    }

    const html =
      await response.text();

    return parseDensuke(
      html,
      data.members
    );
  } finally {
    clearTimeout(timer);
  }
}

async function loadStoredData(
  store
) {
  let saved = null;

  try {
    saved =
      await store.get(
        KEY,
        {
          type: "json",
        }
      );
  } catch {}

  return cleanupOldData(
    normalize(
      saved || {}
    )
  );
}

async function loadAndMaybeSync(
  store,
  force = false
) {
  const config =
    await getConfig(store);

  let data =
    await loadStoredData(
      store
    );

  const now =
    new Date();

  /*
   * 伝助連携終了後
   */
  if (
    !config
      .densukeSyncEnabled
  ) {
    await store.setJSON(
      KEY,
      data
    );

    return {
      data,
      config,

      sync: {
        status:
          "disabled",

        at:
          config
            .syncEndedAt ||
          "",
      },
    };
  }

  const last =
    new Date(
      data.syncMeta
        ?.lastDensukeSyncAt ||
        0
    );

  /*
   * 1分以内なら
   * 前回データを使用
   */
  if (
    !force &&
    !Number.isNaN(
      last.getTime()
    ) &&
    now - last <
      SYNC_INTERVAL_MS
  ) {
    return {
      data,
      config,

      sync: {
        status:
          "cached",

        at:
          data.syncMeta
            .lastDensukeSyncAt,
      },
    };
  }

  try {
    const parsed =
      await fetchDensuke(
        data
      );

    data =
      mergeDensuke(
        data,
        parsed,
        now
      );

    await store.setJSON(
      KEY,
      data
    );

    return {
      data,
      config,

      sync: {
        status:
          "synced",

        at:
          data.syncMeta
            .lastDensukeSyncAt,

        comments:
          parsed.comments.length,
      },
    };
  } catch (error) {
    /*
     * 同期失敗でも
     * 現在の出欠データを消さない
     */
    data.syncMeta ??= {};

    data.syncMeta
      .lastDensukeSyncError =
      String(
        error?.message ||
          error
      );

    await store.setJSON(
      KEY,
      data
    );

    return {
      data,
      config,

      sync: {
        status:
          "failed",

        at:
          data.syncMeta
            .lastDensukeSyncAt ||
          "",

        error:
          data.syncMeta
            .lastDensukeSyncError,
      },
    };
  }
}

export default async request => {
  const store =
    getStore({
      name: STORE,
      consistency:
        "strong",
    });

  const url =
    new URL(
      request.url
    );

  try {
    /*
     * 読み込み
     */
    if (
      request.method ===
      "GET"
    ) {
      if (
        url.searchParams.get(
          "config"
        ) === "1"
      ) {
        return json({
          config:
            await getConfig(
              store
            ),
        });
      }

      return json(
        await loadAndMaybeSync(
          store,
          url.searchParams.get(
            "sync"
          ) === "1"
        )
      );
    }

    if (
      request.method !==
      "POST"
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
      body.action || "";

    /*
     * 管理者確認
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
              "Unauthorized",
          },
          401
        );
      }

      return json({
        ok: true,
      });
    }

    /*
     * 伝助連携設定
     */
    if (
      action ===
      "setConfig"
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

      const current =
        await getConfig(
          store
        );

      const next = {
        ...current,
      };

      if (
        body.config
          ?.densukeVisible !==
        undefined
      ) {
        next.densukeVisible =
          body.config
            .densukeVisible !==
          false;
      }

      /*
       * 伝助連携終了
       * 一度終了したら再開しない
       */
      if (
        body.config
          ?.densukeSyncEnabled ===
          false &&
        current
          .densukeSyncEnabled
      ) {
        next.densukeSyncEnabled =
          false;

        next.syncEndedAt =
          new Date()
            .toISOString();
      }

      if (
        current.syncEndedAt
      ) {
        next.densukeSyncEnabled =
          false;

        next.syncEndedAt =
          current.syncEndedAt;
      }

      await store.setJSON(
        CONFIG_KEY,
        next
      );

      return json({
        ok: true,
        config: next,
      });
    }

    /*
     * 管理から強制同期
     */
    if (
      action ===
      "syncNow"
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

        ...await loadAndMaybeSync(
          store,
          true
        ),
      });
    }

    let data =
      await loadStoredData(
        store
      );

    /*
     * 管理画面保存
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
              "Unauthorized",
          },
          401
        );
      }

      const incoming =
        normalize(
          body.data || {}
        );

      /*
       * 同期状態は
       * ブラウザから消させない
       */
      incoming.syncMeta =
        data.syncMeta || {};

      data =
        cleanupOldData(
          incoming
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
     * ○△×保存
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

      data.answers[
        memberId
      ] ??= {};

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
        data,
      });
    }

    /*
     * サイト側コメント保存
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

      const comment = {
        id:
          "comment_" +
          Date.now()
            .toString(36) +
          "_" +
          Math.random()
            .toString(36)
            .slice(2, 8),

        memberId,

        text,

        updatedAt:
          new Date()
            .toISOString(),

        source:
          "site",
      };

      data.comments.push(
        comment
      );

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
        comment,
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
          "Server error",
      },
      500
    );
  }
};
