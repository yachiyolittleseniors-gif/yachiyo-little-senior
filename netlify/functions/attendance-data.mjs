import { getStore } from "@netlify/blobs";
import {
  adminAuthError,
  verifyAdminPassword,
} from "./admin-rate-limit.mjs";

const STORE = "yachiyo-public-site";
const KEY = "content/attendance.json";
const CONFIG_KEY = "content/attendance-config.json";
const ACCESS_CONFIG_KEY = "content/access-settings.json";
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

function twoMonthsAgo(now = new Date()) {
  const d = new Date(now);
  const originalDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() - 2);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDay));
  d.setHours(0, 0, 0, 0);
  return d;
}

function commentReferenceDate(comment, now = new Date()) {
  const updated = new Date(comment?.updatedAt || 0);
  if (comment?.source !== "densuke") return Number.isNaN(updated.getTime()) ? null : updated;

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
  const cutoff = twoMonthsAgo(now);
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
  try {
    const saved = await store.get(CONFIG_KEY, { type: "json" });
    return {
      densukeVisible: saved?.densukeVisible !== false,
      migrationEnded: saved?.migrationEnded === true,
      endedAt: String(saved?.endedAt || ""),
    };
  } catch {
    return { densukeVisible: true, migrationEnded: false, endedAt: "" };
  }
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
      data = cleanupOldData(merged.data);
      await store.setJSON(KEY, data);
      const config = await getConfig(store);
      return json({ data, config, locked: !config.migrationEnded });
    }

    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const action = body.action || "";

    const adminActions = new Set([
      "adminPing",
      "setConfig",
      "endDensuke",
      "resumeDensuke",
      "adminSave",
    ]);
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
    let data = cleanupOldData(mergeInitial(normalize(current)).data);

    if (action === "endDensuke") {
      data.migrationInitialized = true;
      const config = {
        ...(await getConfig(store)),
        densukeVisible: false,
        migrationEnded: true,
        endedAt: new Date().toISOString(),
      };
      await store.setJSON(KEY, data);
      await store.setJSON(CONFIG_KEY, config);
      return json({
        ok: true,
        data,
        config,
        locked: false,
        importedNames: data.members.length,
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
      await store.setJSON(KEY, data);
      return json({ ok: true, data });
    }

    if (action === "answer") {
      const eventId = String(body.eventId || "");
      const memberId = String(body.memberId || "");
      const status = String(body.status || "");
      if (!eventId || !memberId) return json({ error: "Missing id" }, 400);
      if (status && !["○", "△", "×"].includes(status)) return json({ error: "Invalid status" }, 400);
      if (!data.answers[memberId]) data.answers[memberId] = {};
      if (status) data.answers[memberId][eventId] = status; else delete data.answers[memberId][eventId];
      await store.setJSON(KEY, data);
      return json({ ok: true, data });
    }

    if (action === "comment") {
      const memberId = String(body.memberId || "");
      const text = String(body.text || "").trim();
      if (!memberId || !text) return json({ error: "Missing comment" }, 400);
      if (text.length > 500) return json({ error: "Comment too long" }, 400);
      const memberExists = data.members.some(m => String(m.id) === memberId);
      if (!memberExists) return json({ error: "Member not found" }, 404);
      const comment = {
        id: `comment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,
        memberId,
        text,
        updatedAt: new Date().toISOString(),
        source: "site",
      };
      data.comments.push(comment);
      if (data.comments.length > 300) data.comments = data.comments.slice(-300);
      await store.setJSON(KEY, data);
      return json({ ok: true, comment, data });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("attendance-data error:", error);
    return json({ error: "Server error" }, 500);
  }
};
