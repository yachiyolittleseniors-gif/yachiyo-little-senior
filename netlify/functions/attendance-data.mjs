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
    events: Array.isArray(data.events)
      ? data.events
      : [],

    members: Array.isArray(data.members)
      ? data.members
      : [],

    answers:
      data.answers &&
      typeof data.answers === "object"
        ? data.answers
        : {},

    comments: Array.isArray(data.comments)
      ? data.comments
      : [],

    syncMeta:
      data.syncMeta &&
      typeof data.syncMeta === "object"
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

function cleanupOldData(
  input,
  now = new Date()
) {
  const data = normalize(input);
  const cutoff = cutoffDate(now);

  const removedEventIds =
    new Set();

  data.events =
    data.events.filter(event => {
      if (!event?.date) {
        return true;
      }

      const d = new Date(
        String(event.date) +
          "T00:00:00"
      );

      const old =
        !Number.isNaN(
          d.getTime()
        ) &&
        d < cutoff;

      if (old) {
        removedEventIds.add(
          String(event.id)
        );
      }

      return !old;
    });

  for (
    const memberId
    of Object.keys(data.answers)
  ) {
    const row =
      data.answers[memberId];

    if (
      !row ||
      typeof row !== "object"
    ) {
      continue;
    }

    for (
      const eventId
      of removedEventIds
    ) {
      delete row[eventId];
    }
  }

  // コメントも2か月より
  // 古いものは削除
  data.comments =
    data.comments.filter(
      comment => {
        const t =
          new Date(
            comment?.updatedAt || 0
          );

        return (
          !Number.isNaN(
            t.getTime()
          ) &&
          t >= cutoff
        );
      }
    );

  return data;
}

async function getConfig(store) {
  let saved = null;

  try {
    saved =
      await store.get(
        CONFIG_KEY,
        {
          type: "json",
        }
      );
  } catch {
    saved = null;
  }

  const syncEndedAt =
    saved?.syncEndedAt || "";

  return {
    densukeVisible:
      saved?.densukeVisible !==
      false,

    densukeSyncEnabled:
      !syncEndedAt &&
      saved?.densukeSyncEnabled !==
        false,

    syncEndedAt,
  };
}

function adminOK(request) {
  const expected =
    process.env.ADMIN_PASSWORD ||
    "";

  const received =
    request.headers.get(
      "x-admin-password"
    ) || "";

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
    copy: "©",
    hellip: "…",
  };

  return String(text || "")
    .replace(
      /&#(\d+);/g,
      (_, n) =>
        String.fromCodePoint(
          Number(n)
        )
    )

    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, n) =>
        String.fromCodePoint(
          parseInt(n, 16)
        )
    )

    .replace(
      /&([a-z]+);/gi,
      (m, n) =>
        named[
          n.toLowerCase()
        ] ?? m
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

      .replace(
        /<br\s*\/?>/gi,
        "\n"
      )

      .replace(
        /<\/(?:li|p|div|tr|h[1-6]|section|article)>/gi,
        "\n"
      )

      .replace(
        /<li\b[^>]*>/gi,
        "\n"
      )

      .replace(
        /<[^>]+>/g,
        ""
      )
  )

    .replace(/\r/g, "")

    .replace(
      /[\t\u00a0]+/g,
      " "
    )

    .replace(
      /\n[ ]+/g,
      "\n"
    )

    .replace(
      /[ ]+\n/g,
      "\n"
    )

    .replace(
      /\n{3,}/g,
      "\n\n"
    )

    .trim();
}

function normalizeName(name) {
  return String(name || "")
    .replace(
      /[\u3000\s]+/g,
      " "
    )
    .trim()
    .toLowerCase();
}

function hashString(s) {
  let h = 2166136261;

  for (
    const ch of String(s)
  ) {
    h ^= ch.codePointAt(0);

    h =
      Math.imul(
        h,
        16777619
      );
  }

  return (
    h >>> 0
  ).toString(36);
}

function parseDateFromLine(
  line,
  now = new Date()
) {
  const m =
    String(line).match(
      /(?:^|[^\d])(\d{1,2})\s*[\/月]\s*(\d{1,2})(?:\s*日)?/
    );

  if (!m) {
    return "";
  }

  const month =
    Number(m[1]);

  const day =
    Number(m[2]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return "";
  }

  const candidates = [
    now.getFullYear() - 1,
    now.getFullYear(),
    now.getFullYear() + 1,
  ]

    .map(
      year =>
        new Date(
          year,
          month - 1,
          day
        )
    )

    .filter(
      d =>
        d.getMonth() ===
          month - 1 &&
        d.getDate() === day
    );

  if (!candidates.length) {
    return "";
  }

  candidates.sort(
    (a, b) =>
      Math.abs(a - now) -
      Math.abs(b - now)
  );

  const d =
    candidates[0];

  const y =
    d.getFullYear();

  return (
    `${y}-` +
    `${String(month).padStart(
      2,
      "0"
    )}-` +
    `${String(day).padStart(
      2,
      "0"
    )}`
  );
}

function splitNames(
  text,
  knownNames = []
) {
  let rest =
    String(text || "")
      .replace(
        /^[：:\s]+/,
        ""
      )
      .trim();

  if (!rest) {
    return [];
  }

  const matched = [];

  const ordered = [
    ...knownNames,
  ]

    .filter(Boolean)

    .sort(
      (a, b) =>
        b.length -
        a.length
    );

  for (
    const name of ordered
  ) {
    const escaped =
      name.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    const re =
      new RegExp(
        `(^|\\s)${escaped}(?=\\s|$)`,
        "g"
      );

    if (re.test(rest)) {
      matched.push(name);

      rest =
        rest.replace(
          re,
          " "
        );
    }
  }

  for (
    const token
    of rest
      .split(/\s+/)
      .filter(Boolean)
  ) {
    matched.push(token);
  }

  return [
    ...new Set(
      matched
        .map(
          x => x.trim()
        )
        .filter(Boolean)
    ),
  ];
}

function parseDensuke(
  html,
  existingMembers = [],
  now = new Date()
) {
  const text =
    htmlToText(html);

  const lines =
    text
      .split("\n")
      .map(
        x => x.trim()
      )
      .filter(Boolean);

  const knownNames =
    existingMembers

      .map(
        m =>
          String(
            m.name || ""
          ).trim()
      )

      .filter(Boolean);

  const events = [];
  const comments = [];

  let current = null;
  let inComments = false;

  for (
    const raw of lines
  ) {
    const line =
      raw
        .replace(
          /^[*・●◦]+\s*/,
          ""
        )
        .trim();

    if (!line) {
      continue;
    }

    if (
      /^[〖【]\s*コメント\s*[〗】]$/.test(
        line
      ) ||
      line === "コメント"
    ) {
      inComments = true;
      current = null;

      continue;
    }

    if (inComments) {
      if (
        /^(登録内容変更|トップに戻る|このページについて)/.test(
          line
        )
      ) {
        break;
      }

      const m =
        line.match(
          /^(.+?)\s*[（(]([^()（）]+)[）)]\s*$/
        );

      if (m) {
        comments.push({
          text:
            m[1].trim(),

          memberName:
            m[2].trim(),
        });
      }

      continue;
    }

    const status =
      line.match(
        /^([○△×])\s*[：:]\s*(.*)$/
      );

    if (
      status &&
      current
    ) {
      current.statuses[
        status[1]
      ] =
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

    if (date) {
      current = {
        date,
        title: line,

        statuses: {
          "○": [],
          "△": [],
          "×": [],
        },
      };

      events.push(
        current
      );
    }
  }

  if (!events.length) {
    throw new Error(
      "Densuke events were not found"
    );
  }

  return {
    events,
    comments,
  };
}

function findOrCreateMember(
  data,
  name,
  syncMeta
) {
  const key =
    normalizeName(name);

  let member =
    data.members.find(
      m =>
        normalizeName(
          m.name
        ) === key
    );

  if (!member) {
    member = {
      id:
        `densuke_member_` +
        hashString(key),

      name:
        String(
          name
        ).trim(),

      source:
        "densuke",
    };

    data.members.push(
      member
    );
  }

  syncMeta
    .densukeMemberNames[
      key
    ] = member.id;

  return member;
}

function findOrCreateEvent(
  data,
  incoming
) {
  const sameDate =
    data.events.filter(
      e =>
        String(e.date) ===
        incoming.date
    );

  let event =
    sameDate.find(
      e =>
        String(
          e.densukeKey ||
            ""
        ) ===
        `${incoming.date}|${incoming.title}`
    );

  if (
    !event &&
    sameDate.length === 1
  ) {
    event =
      sameDate[0];
  }

  if (!event) {
    event = {
      id:
        `densuke_event_` +
        hashString(
          `${incoming.date}|${incoming.title}`
        ),

      date:
        incoming.date,

      title:
        incoming.title,

      source:
        "densuke",
    };

    data.events.push(
      event
    );
  }

  event.densukeKey =
    `${incoming.date}|${incoming.title}`;

  if (!event.title) {
    event.title =
      incoming.title;
  }

  return event;
}

function mergeDensuke(
  dataInput,
  parsed,
  now = new Date()
) {
  const data =
    normalize(dataInput);

  const meta =
    data.syncMeta;

  meta.densukeMemberNames =
    meta.densukeMemberNames &&
    typeof meta
      .densukeMemberNames ===
      "object"
      ? meta.densukeMemberNames
      : {};

  meta.densukeCommentState =
    meta.densukeCommentState &&
    typeof meta
      .densukeCommentState ===
      "object"
      ? meta.densukeCommentState
      : {};

  /*
   * 初回同期時点の既存回答者は
   * これまで伝助から移行した
   * 回答者として扱う
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
     * 伝助側を同期中の
     * 正式な回答として扱う
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
        delete data.answers
