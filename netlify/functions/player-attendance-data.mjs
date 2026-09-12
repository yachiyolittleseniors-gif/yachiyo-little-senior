import { getStore } from "@netlify/blobs";
import {
  adminAuthError,
  verifyAdminPassword,
} from "./admin-rate-limit.mjs";

const STORE = "yachiyo-public-site";
const KEY = "content/player-attendance.json";
const CONFIG_KEY = "content/player-attendance-config.json";
const ACCESS_CONFIG_KEY = "content/access-settings.json";
const MEMBER_STATE_PREFIX = "player-attendance/member-state/";
const DENSUKE_URL = "https://densuke.biz/list?cd=ZhxJNW9dPNGVtm7c";
const DEFAULT_ACCESS_SALT = "yachiyo-access-v1";
const DEFAULT_ACCESS_HASH =
  "19eb403934ae615b2961d9f6b5ddd86aab32a0fdf4e96adeb8aa2fcb351276ba";

const MIGRATED_DATA = { events: [], members: [], answers: {} };
const MIGRATED_COMMENTS = [];

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  } });
}

function bytesToHex(bytes) {
  return Array.from(
    bytes,
    byte => byte.toString(16).padStart(2, "0")
  ).join("");
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
    difference |=
      (left.charCodeAt(i) || 0) ^
      (right.charCodeAt(i) || 0);
  }

  return difference === 0;
}

async function accessOK(store, request) {
  const entered = String(
    request.headers.get("x-access-password") || ""
  );

  if (!entered || entered.length > 128) return false;

  const saved = await store.get(ACCESS_CONFIG_KEY, {
    type: "json",
    consistency: "strong",
  });
  const salt = saved?.salt || DEFAULT_ACCESS_SALT;
  const expectedHash = saved?.hash || DEFAULT_ACCESS_HASH;
  const enteredHash = await hashAccessPassword(entered, salt);
  return safeEqual(enteredHash, expectedHash);
}

function normalize(data = {}) {
  return {
    events: Array.isArray(data.events) ? data.events : [],
    members: Array.isArray(data.members) ? data.members : [],
    answers: data.answers && typeof data.answers === "object" ? data.answers : {},
    comments: Array.isArray(data.comments) ? data.comments : [],
    migrationInitialized: data.migrationInitialized === true,
  };
}

function memberStateKey(memberId) {
  return `${MEMBER_STATE_PREFIX}${encodeURIComponent(String(memberId))}.json`;
}

function normalizeMemberState(value = {}, fallbackAnswers = {}, fallbackComments = []) {
  return {
    answers:
      value.answers && typeof value.answers === "object"
        ? value.answers
        : { ...fallbackAnswers },
    comments: Array.isArray(value.comments)
      ? value.comments
      : [...fallbackComments],
    updatedAt: String(value.updatedAt || ""),
  };
}

async function loadMemberState(store, data, memberId) {
  const id = String(memberId || "");
  const fallbackAnswers = data.answers?.[id] || {};
  const fallbackComments = data.comments.filter(
    comment => String(comment?.memberId || "") === id
  );
  let saved = null;
  try {
    saved = await store.get(memberStateKey(id), {
      type: "json",
      consistency: "strong",
    });
  } catch {
    saved = null;
  }
  return normalizeMemberState(
    saved || {},
    fallbackAnswers,
    fallbackComments
  );
}

function applyMemberState(data, memberId, state) {
  const id = String(memberId || "");
  data.answers[id] = state.answers;
  data.comments = [
    ...data.comments.filter(
      comment => String(comment?.memberId || "") !== id
    ),
    ...state.comments,
  ];
  return data;
}

async function mergeMemberStates(store, data) {
  const loaded = await Promise.all(
    data.members.map(async member => {
      const id = String(member?.id || "");
      if (!id) return null;
      let saved = null;
      try {
        saved = await store.get(memberStateKey(id), {
          type: "json",
          consistency: "strong",
        });
      } catch {
        saved = null;
      }
      if (!saved) return null;
      return {
        id,
        state: normalizeMemberState(
          saved,
          data.answers?.[id] || {},
          data.comments.filter(
            comment => String(comment?.memberId || "") === id
          )
        ),
      };
    })
  );

  for (const entry of loaded) {
    if (entry) applyMemberState(data, entry.id, entry.state);
  }
  return data;
}

async function saveAllMemberStates(store, data) {
  const updatedAt = new Date().toISOString();
  await Promise.all(
    data.members.map(member => {
      const id = String(member?.id || "");
      if (!id) return Promise.resolve();
      return store.setJSON(memberStateKey(id), {
        answers: data.answers?.[id] || {},
        comments: data.comments.filter(
          comment => String(comment?.memberId || "") === id
        ),
        updatedAt,
      });
    })
  );
}

function oneMonthAgo(now = new Date()) {
  const d = new Date(now);
  const originalDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDay));
  d.setHours(0, 0, 0, 0);
  return d;
}

function commentReferenceDate(comment, now = new Date()) {
  const eventDate = new Date(String(comment?.eventDate || "") + "T00:00:00");
  if (!Number.isNaN(eventDate.getTime())) return eventDate;
  const updated = new Date(comment?.updatedAt || 0);
  const text = String(comment?.text || "");
  const match = text.match(/(\d{1,2})\s*(?:\/|月)\s*(\d{1,2})(?:日)?/);
  if (!match) return Number.isNaN(updated.getTime()) ? null : updated;

  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return Number.isNaN(updated.getTime()) ? null : updated;

  let reference = new Date(now.getFullYear(), month - 1, day);
  const sixMonths = 183 * 24 * 60 * 60 * 1000;
  if (reference.getTime() - now.getTime() > sixMonths) {
    reference = new Date(now.getFullYear() - 1, month - 1, day);
  }
  return reference;
}

function cleanupOldData(data, now = new Date()) {
  const cutoff = oneMonthAgo(now);
  const removedEventIds = new Set();

  data.events = data.events.filter(event => {
    if (!event?.date) return true;
    const eventDate = new Date(event.date + "T00:00:00");
    if (Number.isNaN(eventDate.getTime())) return true;
    if (eventDate < cutoff) {
      removedEventIds.add(String(event.id));
      return false;
    }
    return true;
  });

  if (removedEventIds.size) {
    for (const memberId of Object.keys(data.answers)) {
      const row = data.answers[memberId];
      if (!row || typeof row !== "object") continue;
      for (const eventId of removedEventIds) delete row[eventId];
    }
  }

  data.comments = data.comments.filter(comment => {
    const reference = commentReferenceDate(comment, now);
    return !reference || reference >= cutoff;
  });

  return data;
}

async function getConfig(store) {
  return { densukeVisible: false, migrationEnded: true, endedAt: "" };
}

function mergeInitial(data) {
  let changed = false;

  if (!data.migrationInitialized) {
    if (!data.events.length || !data.members.length) {
      const migrated = normalize(structuredClone(MIGRATED_DATA));
      data.events = migrated.events;
      data.members = migrated.members;
      data.answers = migrated.answers;
    }
    if (!data.comments.length) {
      data.comments = structuredClone(MIGRATED_COMMENTS);
    }
    data.migrationInitialized = true;
    changed = true;
  }

  return { data, changed };
}

function decodeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code) => {
    if (code[0] === "#") {
      const hex = code[1]?.toLowerCase() === "x";
      const number = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : all;
    }
    return named[code.toLowerCase()] ?? all;
  });
}

function htmlText(value) {
  return decodeEntities(String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " "))
    .replace(/[\t\r ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function normalizedName(value) {
  return String(value || "").normalize("NFKC").replace(/[\s　]+/g, "").trim();
}

function dateFromMonthDay(month, day, now = new Date()) {
  const candidates = [-1, 0, 1].map(offset => new Date(now.getFullYear() + offset, month - 1, day));
  const chosen = candidates.sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0];
  return `${chosen.getFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function fetchDensukeHtml() {
  const response = await fetch(DENSUKE_URL, { headers: { "user-agent": "Yachiyo-Little-Senior/1.0" } });
  if (!response.ok) throw new Error("Densuke fetch failed");
  const bytes = await response.arrayBuffer();
  const type = response.headers.get("content-type") || "";
  let html = new TextDecoder("utf-8").decode(bytes);
  if (/shift[_-]?jis|sjis|windows-31j/i.test(type + html.slice(0, 1000))) {
    html = new TextDecoder("shift_jis").decode(bytes);
  }
  return html;
}

function importMatchingDensukeData(data, html) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
    [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(cell => htmlText(cell[1]))
  ).filter(row => row.length);
  const header = rows.find(row => row.includes("○") && row.includes("△") && row.includes("×"));
  if (!header) throw new Error("Densuke table not found");
  const statusEnd = Math.max(header.indexOf("○"), header.indexOf("△"), header.indexOf("×"));
  const memberStart = statusEnd + 1;
  const registered = new Map(data.members.map(member => [normalizedName(member.name), member]));
  const columns = header.slice(memberStart).map(name => registered.get(normalizedName(name)) || null);
  let importedAnswers = 0;

  for (const row of rows) {
    const dateMatch = String(row[0] || "").match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (!dateMatch) continue;
    const date = dateFromMonthDay(Number(dateMatch[1]), Number(dateMatch[2]));
    const eventId = String(data.events.find(event => event.date === date)?.id || `schedule_${date.replaceAll("-", "")}`);
    columns.forEach((member, index) => {
      if (!member) return;
      const status = String(row[memberStart + index] || "").match(/[○△×]/)?.[0];
      if (!status) return;
      data.answers[member.id] ||= {};
      data.answers[member.id][eventId] = status;
      importedAnswers++;
    });
  }

  const commentArea = html.match(/(?:【\s*コメント\s*】|コメント一覧)([\s\S]*)/i)?.[1] || "";
  const blocks = [...commentArea.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(match => htmlText(match[1]));
  const candidates = blocks.length ? blocks : htmlText(commentArea).split("\n");
  const existing = new Set(data.comments.map(comment => `${comment.memberId}\n${String(comment.text || "").trim()}`));
  let importedComments = 0;
  for (const candidate of candidates) {
    const match = candidate.match(/^\s*[（(]([^）)]+)[）)]\s*(.+)$/s);
    if (!match) continue;
    const member = registered.get(normalizedName(match[1]));
    const text = String(match[2] || "").replace(/\s*\[\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}\]\s*$/, "").trim();
    if (!member || !text || existing.has(`${member.id}\n${text}`)) continue;
    const dateMatch = text.match(/(\d{1,2})\s*(?:\/|月)\s*(\d{1,2})(?:日)?/);
    const eventDate = dateMatch ? dateFromMonthDay(Number(dateMatch[1]), Number(dateMatch[2])) : "";
    data.comments.push({ id: `densuke_${Date.now().toString(36)}_${importedComments}`, memberId: member.id, text, eventDate, updatedAt: new Date().toISOString(), source: "densuke" });
    existing.add(`${member.id}\n${text}`);
    importedComments++;
  }
  return { importedAnswers, importedComments };
}

export default async (request, context) => {
  const store = getStore({ name: STORE, consistency: "strong" });
  const url = new URL(request.url);

  try {
    if (request.method === "GET") {
      if (!(await accessOK(store, request))) {
        return json({ error: "Unauthorized" }, 401);
      }

      if (url.searchParams.get("config") === "1") return json({ config: await getConfig(store) });

      let saved = null;
      try { saved = await store.get(KEY, { type: "json" }); } catch { saved = null; }
      let data = normalize(saved || {});
      const merged = mergeInitial(data);
      data = await mergeMemberStates(store, merged.data);
      data = cleanupOldData(data);
      await store.setJSON(KEY, data);
      const config = await getConfig(store);
      return json({ data, config, locked: false });
    }

    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const action = body.action || "";

    const adminActions = new Set(["adminPing", "adminSave"]);
    let adminAuth = null;
    if (adminActions.has(action)) {
      adminAuth = await verifyAdminPassword({
        store,
        request,
        context,
        expectedPassword: process.env.ADMIN_PASSWORD || "",
      });
      if (!adminAuth.ok) return adminAuthError(json, adminAuth);
    }

    if (
      (action === "answer" || action === "comment") &&
      !(await accessOK(store, request))
    ) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!["adminPing", "adminSave", "answer", "comment"].includes(action)) {
      return json({ error: "Unknown action" }, 400);
    }

    if (action === "adminPing") {
      return json({ ok: true, config: await getConfig(store) });
    }

    if (action === "setConfig") {
      const currentConfig = await getConfig(store);
      const config = {
        ...currentConfig,
        densukeVisible: body.config?.densukeVisible !== false,
      };
      await store.setJSON(CONFIG_KEY, config);
      return json({ ok: true, config });
    }

    let current = {};
    try { current = (await store.get(KEY, { type: "json" })) || {}; } catch { current = {}; }
    let data = mergeInitial(normalize(current)).data;
    data = await mergeMemberStates(store, data);
    data = cleanupOldData(data);

    if (action === "endDensuke") {
      const html = await fetchDensukeHtml();
      const imported = importMatchingDensukeData(data, html);
      data = cleanupOldData(data);
      const config = {
        ...(await getConfig(store)),
        densukeVisible: false,
        migrationEnded: true,
        endedAt: new Date().toISOString(),
      };
      await saveAllMemberStates(store, data);
      await store.setJSON(KEY, data);
      await store.setJSON(CONFIG_KEY, config);
      return json({
        ok: true,
        data,
        config,
        locked: false,
        ...imported,
      });
    }

    if (action === "resumeDensuke") {
      const config = {
        ...(await getConfig(store)),
        densukeVisible: true,
        migrationEnded: false,
      };
      await store.setJSON(CONFIG_KEY, config);
      return json({ ok: true, data, config, locked: true });
    }

    if (action === "adminSave") {
      data = cleanupOldData(normalize(body.data || {}));
      data.migrationInitialized = true;
      await saveAllMemberStates(store, data);
      await store.setJSON(KEY, data);
      return json({ ok: true, data });
    }

    if (action === "answer") {
      const eventId = String(body.eventId || "");
      const memberId = String(body.memberId || "");
      const status = String(body.status || "");
      if (!eventId || !memberId) return json({ error: "Missing id" }, 400);
      if (status && !["○", "△", "×"].includes(status)) return json({ error: "Invalid status" }, 400);
      const memberExists = data.members.some(
        member => String(member?.id || "") === memberId
      );
      if (!memberExists) return json({ error: "Member not found" }, 404);
      const state = await loadMemberState(store, data, memberId);
      if (status) state.answers[eventId] = status;
      else delete state.answers[eventId];
      state.updatedAt = new Date().toISOString();
      await store.setJSON(memberStateKey(memberId), state);
      applyMemberState(data, memberId, state);
      return json({ ok: true, data });
    }

    if (action === "comment") {
      const memberId = String(body.memberId || "");
      const text = String(body.text || "").trim();
      const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.eventDate || "")) ? String(body.eventDate) : "";
      const upperGrade = false;
      if (!memberId || !text || !eventDate) return json({ error: "Missing comment" }, 400);
      if (text.length > 500) return json({ error: "Comment too long" }, 400);
      const memberExists = data.members.some(m => String(m.id) === memberId);
      if (!memberExists) return json({ error: "Member not found" }, 404);
      const comment = {
        id: `comment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,
        memberId,
        text,
        eventDate,
        upperGrade,
        updatedAt: new Date().toISOString(),
        source: "site",
      };
      const state = await loadMemberState(store, data, memberId);
      state.comments.push(comment);
      if (state.comments.length > 100) {
        state.comments = state.comments.slice(-100);
      }
      state.updatedAt = new Date().toISOString();
      await store.setJSON(memberStateKey(memberId), state);
      applyMemberState(data, memberId, state);
      return json({ ok: true, comment, data });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("player-attendance-data error:", error);
    return json({ error: "Server error" }, 500);
  }
};
