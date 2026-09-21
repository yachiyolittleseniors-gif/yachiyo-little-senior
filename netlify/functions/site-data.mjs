import { getStore } from "@netlify/blobs";
import {
  boardSessionCookie,
  boardSessionIsValid,
  boardSessionTokenIsValid,
  createBoardSessionToken,
} from "./_board-session.mjs";
import { coachSessionTokenIsValid } from "./_coach-session.mjs";
import {
  adminAuthError,
  verifyAdminPassword,
} from "./admin-rate-limit.mjs";

const DEFAULT_ACCESS_SALT = "yachiyo-access-v1";
const DEFAULT_ACCESS_HASH =
  "19eb403934ae615b2961d9f6b5ddd86aab32a0fdf4e96adeb8aa2fcb351276ba";
const COACH_ACCESS_CONFIG_KEY = "content/coach-attendance-access.json";
const DEFAULT_COACH_ACCESS_SALT = "yachiyo-coach-access-v1";
const DEFAULT_COACH_ACCESS_HASH =
  "937e76fe820379b5e095356a7dae5cbd223b5c9af6dd444e48a3f3b34bd4f8eb";

const allowed = new Set([
  "schedule",
  "results",
  "result-squad-settings",
  "result-documents",
  "seniorcup-documents",
  "seniorcup-registration",
  "players",
  "hero",
  "photos",
  "ground-photos",
  "hero-announcement",
  "recruitment-settings",
  "news",
  "rules",
  "duty-roster",
  "staff",
  "team-interview",
  "downloads-application",
  "downloads-guideline",
  "downloads-roster",
  "seniorcup-settings",
  "seniorcup-guideline",
  "seniorcup-partners",
  "seniorcup-reply-mode",
  "seniorcup-winners",
  "graduate-paths",
  "major-achievements",
  "links",
  "board-tournaments",
  "referee-documents",
  "board-meeting-documents",
  "board-meeting-schedule",
  "board-latest-update",
  "document-archive",
  "live-score",
  "access-settings",
  "contact-phone-settings"
]);

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

async function accessPasswordIsValid(store, enteredPassword) {
  const entered = String(enteredPassword || "");

  if (await boardSessionTokenIsValid(entered)) return true;

  if (!entered || entered.length > 128) {
    return false;
  }

  const saved = await store.get("content/access-settings.json", {
    type: "json",
    consistency: "strong"
  });

  if (saved?.salt && saved?.hash) {
    const enteredHash = await hashAccessPassword(entered, saved.salt);
    return safeEqual(enteredHash, saved.hash);
  }

  if (process.env.ACCESS_PASSWORD) {
    return safeEqual(entered, process.env.ACCESS_PASSWORD);
  }

  const enteredHash = await hashAccessPassword(
    entered,
    DEFAULT_ACCESS_SALT
  );
  return safeEqual(enteredHash, DEFAULT_ACCESS_HASH);
}

async function coachAccessPasswordIsValid(store, enteredPassword) {
  const entered = String(enteredPassword || '');
  if (await coachSessionTokenIsValid(entered)) return true;
  if (!entered || entered.length > 128) return false;
  let saved = null;
  try {
    saved = await store.get(COACH_ACCESS_CONFIG_KEY, {type: 'json', consistency: 'strong'});
  } catch {
    saved = null;
  }
  const salt = saved?.salt || DEFAULT_COACH_ACCESS_SALT;
  const expectedHash = saved?.hash || DEFAULT_COACH_ACCESS_HASH;
  return safeEqual(await hashAccessPassword(entered, salt), expectedHash);
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

const LEGACY_GRADE_BASE_YEAR = 2026;

function currentJapanYear() {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      year: "numeric"
    }).format(new Date())
  );
}

function resultIsExpired(item) {
  const normalized = String(item?.grade || "")
    .replace(/[１２３]/g, character =>
      String("１２３".indexOf(character) + 1)
    );
  const match = normalized.match(/[1-3]/);
  if (!match) return false;

  const baseGrade = Number(match[0]);
  const baseYear = Number(item?.gradeYear) || LEGACY_GRADE_BASE_YEAR;
  const effectiveGrade =
    baseGrade + Math.max(0, currentJapanYear() - baseYear);

  return effectiveGrade >= 5;
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:application\/pdf;base64,(.*)$/s);
  if (!match) return null;
  try {
    return Uint8Array.from(atob(match[1]), character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function decodeBoardMeetingDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(application\/pdf|image\/jpeg|image\/png|image\/webp);base64,(.*)$/s);
  if (!match) return null;
  try {
    return {contentType: match[1].toLowerCase(), bytes: Uint8Array.from(atob(match[2]), character => character.charCodeAt(0))};
  } catch {
    return null;
  }
}

function boardMeetingFileIsValid(fileName, contentType, bytes) {
  const name = String(fileName || "").toLowerCase();
  if (contentType === "application/pdf") return name.endsWith(".pdf") && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (contentType === "image/jpeg") return /\.jpe?g$/.test(name) && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") {
    const signature = [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
    return name.endsWith(".png") && signature.every((value,index) => bytes[index] === value);
  }
  if (contentType === "image/webp") return name.endsWith(".webp") && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return false;
}

const BOARD_LATEST_UPDATE_KEY = "content/board-latest-update.json";
const BOARD_UPDATE_HISTORY_LIMIT = 100;

function boardUpdateTime(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function cleanBoardUpdateMessage(value, fallback = "更新しました") {
  return String(value || fallback).trim().replace(/\s+/g, " ").slice(0, 180);
}

function boardUpdateHistoryCutoff(now = Date.now()) {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 1);
  return cutoff.getTime();
}

function normalizeBoardUpdate(entry) {
  if (!entry || typeof entry !== "object") return null;
  const category = String(entry.category || "").trim();
  const message = cleanBoardUpdateMessage(entry.message, "");
  const updatedAt = String(entry.updatedAt || "");
  if (!category || !message || !boardUpdateTime(updatedAt)) return null;
  if (/(?:削除|並び順)/.test(message)) return null;
  return { category, message, updatedAt };
}

function recentBoardUpdates(entries, now = Date.now()) {
  const cutoff = boardUpdateHistoryCutoff(now);
  const seen = new Set();
  return entries
    .map(normalizeBoardUpdate)
    .filter(Boolean)
    .filter(entry => boardUpdateTime(entry.updatedAt) >= cutoff)
    .sort((a, b) => boardUpdateTime(b.updatedAt) - boardUpdateTime(a.updatedAt))
    .filter(entry => {
      const key = `${entry.category}\u0000${entry.message}\u0000${entry.updatedAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, BOARD_UPDATE_HISTORY_LIMIT);
}

async function safeStoreJson(store, key) {
  try {
    return await store.get(key, { type: "json", consistency: "strong" });
  } catch {
    return null;
  }
}

async function saveBoardLatestUpdate(store, category, message, updatedAt = new Date().toISOString()) {
  const data = {
    category,
    message: cleanBoardUpdateMessage(message),
    updatedAt
  };
  const saved = await safeStoreJson(store, BOARD_LATEST_UPDATE_KEY);
  const savedHistory = Array.isArray(saved?.history)
    ? saved.history
    : normalizeBoardUpdate(saved)
      ? [saved]
      : [];
  const history = recentBoardUpdates([data, ...savedHistory]);
  await store.setJSON(BOARD_LATEST_UPDATE_KEY, {
    latest: history[0] || data,
    history
  });
  return data;
}

async function renameBoardDocumentUpdateHistory(store, documentLabel, item, fileName) {
  const uploadedAt = String(item?.uploadedAt || "");
  if (!boardUpdateTime(uploadedAt)) return;
  const saved = await safeStoreJson(store, BOARD_LATEST_UPDATE_KEY);
  const savedHistory = Array.isArray(saved?.history)
    ? saved.history
    : saved?.latest
      ? [saved.latest]
      : normalizeBoardUpdate(saved)
        ? [saved]
        : [];
  let changed = false;
  const message = cleanBoardUpdateMessage(`${documentLabel}「${fileName}」を保存しました`);
  const rewritten = savedHistory.map(entry => {
    const normalized = normalizeBoardUpdate(entry);
    if (
      normalized?.category === "documents" &&
      String(normalized.updatedAt) === uploadedAt
    ) {
      changed = true;
      return { ...normalized, message };
    }
    return entry;
  });
  if (!changed) return;
  const history = recentBoardUpdates(rewritten);
  await store.setJSON(BOARD_LATEST_UPDATE_KEY, {
    latest: history[0] || null,
    history
  });
}

async function loadBoardLatestUpdate(store) {
  const saved = await safeStoreJson(store, BOARD_LATEST_UPDATE_KEY);
  const savedHistory = Array.isArray(saved?.history)
    ? saved.history
    : saved?.latest
      ? [saved.latest]
      : normalizeBoardUpdate(saved)
        ? [saved]
        : [];

  const [secretariat, referee, roster, schedule, rules] = await Promise.all([
    safeStoreJson(store, "content/board-meeting-documents.json"),
    safeStoreJson(store, "content/referee-documents.json"),
    safeStoreJson(store, "content/duty-roster.json"),
    safeStoreJson(store, "content/board-meeting-schedule.json"),
    safeStoreJson(store, "content/rules.json")
  ]);
  const candidates = [];
  if (Array.isArray(secretariat)) secretariat.forEach(item => {
    if (!item?.uploadedAt) return;
    candidates.push({
      category: "documents",
      message: `事務局資料「${cleanBoardUpdateMessage(item.fileName, "資料")}」を保存しました`,
      updatedAt: item.uploadedAt
    });
  });
  if (Array.isArray(referee)) referee.forEach(item => {
    if (!item?.uploadedAt) return;
    candidates.push({
      category: "documents",
      message: `審判部資料「${cleanBoardUpdateMessage(item.fileName, "資料")}」を保存しました`,
      updatedAt: item.uploadedAt
    });
  });
  if (roster?.updatedAt) candidates.push({
    category: "duty-roster",
    message: cleanBoardUpdateMessage(roster.latestUpdateMessage, "当番表を更新しました"),
    updatedAt: roster.updatedAt
  });
  if (Array.isArray(schedule)) schedule.forEach(item => {
    if (!item?.updatedAt) return;
    candidates.push({
      category: "schedule",
      message: `事務局スケジュール「${cleanBoardUpdateMessage(item.title, "予定")}」を更新しました`,
      updatedAt: item.updatedAt
    });
  });
  const rulesData = Array.isArray(rules) ? rules[0] : null;
  if (rulesData?.updatedAt) candidates.push({
    category: "rules",
    message: cleanBoardUpdateMessage(rulesData.latestUpdateMessage, "チーム規約ファイルを更新しました"),
    updatedAt: rulesData.updatedAt
  });

  const currentDocumentUpdates = new Map(
    candidates
      .filter(entry => entry.category === "documents")
      .map(entry => [String(entry.updatedAt || ""), entry])
  );
  const reconciledSavedHistory = savedHistory.map(entry => {
    const normalized = normalizeBoardUpdate(entry);
    if (normalized?.category !== "documents") return entry;
    return currentDocumentUpdates.get(String(normalized.updatedAt || "")) || entry;
  });
  const history = recentBoardUpdates([...reconciledSavedHistory, ...candidates]);
  const latest = history[0] || null;
  return latest ? { ...latest, history } : null;
}

function normalizeScheduleEntries(value) {
  if (!Array.isArray(value)) return { data: value, changed: false };

  let changed = false;
  const data = value.map(item => {
    if (!item || typeof item !== "object") return item;

    const storedGrades = Array.isArray(item.grades)
      ? [...new Set(item.grades.map(String).filter(grade => ["1", "2", "3", "other"].includes(grade)))].sort((a,b) => ["1","2","3","other"].indexOf(a)-["1","2","3","other"].indexOf(b))
      : [];
    const legacyGrade = String(item.grade || "");
    const grades = storedGrades.length
      ? storedGrades
      : ["1", "2", "3"].filter(grade => legacyGrade.includes(grade));
    const normalizedGrades = grades.length ? grades : ["1", "2", "3"];
    const title = String(item.title || "").replace("昇給対応講習会", "昇級対応講習会");

    if (
      JSON.stringify(normalizedGrades) !== JSON.stringify(item.grades) ||
      title !== String(item.title || "")
    ) {
      changed = true;
      return { ...item, title, grades: normalizedGrades };
    }

    return item;
  });

  return { data, changed };
}

const LEGACY_RESULT_SEED = [
  {
    "id": "legacy-44-2024-narita-1",
    "date": "2024-11",
    "grade": "3年",
    "round": "一回戦",
    "battingOrder": "first",
    "tournament": "第18回成田国際空港杯フレッシュマン大会",
    "opponent": "匝瑳シニア",
    "venue": "",
    "ourScore": 0,
    "oppScore": 3,
    "note": ""
  },
  {
    "id": "legacy-44-2024-narita-2",
    "date": "2024-11",
    "grade": "3年",
    "round": "敗者交流戦",
    "battingOrder": "first",
    "tournament": "第18回成田国際空港杯フレッシュマン大会",
    "opponent": "千葉緑シニア",
    "venue": "",
    "ourScore": 3,
    "oppScore": 2,
    "note": ""
  },
  {
    "id": "legacy-44-2025-chibanippo-1",
    "date": "2025-06",
    "grade": "3年",
    "round": "一回戦",
    "battingOrder": "first",
    "tournament": "千葉日報社新人大会",
    "opponent": "君津シニア",
    "venue": "",
    "ourScore": 10,
    "oppScore": 1,
    "note": ""
  },
  {
    "id": "legacy-44-2025-chibanippo-2",
    "date": "2025-06",
    "grade": "3年",
    "round": "二回戦",
    "battingOrder": "first",
    "tournament": "千葉日報社新人大会",
    "opponent": "我孫子シニア",
    "venue": "",
    "ourScore": 2,
    "oppScore": 6,
    "note": ""
  },
  {
    "id": "legacy-44-2025-autumn-1",
    "date": "2025-09",
    "grade": "3年",
    "round": "二回戦",
    "battingOrder": "first",
    "tournament": "東関東支部秋季大会",
    "opponent": "かすみがうらシニア",
    "venue": "",
    "ourScore": 9,
    "oppScore": 2,
    "note": ""
  },
  {
    "id": "legacy-44-2025-autumn-2",
    "date": "2025-09",
    "grade": "3年",
    "round": "三回戦",
    "battingOrder": "first",
    "tournament": "東関東支部秋季大会",
    "opponent": "常総シニア",
    "venue": "",
    "ourScore": 3,
    "oppScore": 5,
    "note": ""
  },
  {
    "id": "legacy-44-2025-autumn-3",
    "date": "2025-09",
    "grade": "3年",
    "round": "敗者復活三回戦",
    "battingOrder": "first",
    "tournament": "東関東支部秋季大会",
    "opponent": "我孫子シニア",
    "venue": "",
    "ourScore": 2,
    "oppScore": 6,
    "note": ""
  },
  {
    "id": "legacy-44-2026-kashima-1",
    "date": "2026-01",
    "grade": "3年",
    "round": "第一試合",
    "battingOrder": "first",
    "tournament": "第5回鹿嶋市長杯交流大会",
    "opponent": "小山ボーイズ",
    "venue": "",
    "ourScore": 2,
    "oppScore": 10,
    "note": ""
  },
  {
    "id": "legacy-44-2026-kashima-2",
    "date": "2026-01",
    "grade": "3年",
    "round": "第二試合",
    "battingOrder": "first",
    "tournament": "第5回鹿嶋市長杯交流大会",
    "opponent": "世田谷西シニア",
    "venue": "",
    "ourScore": 0,
    "oppScore": 16,
    "note": ""
  },
  {
    "id": "legacy-44-2026-kashima-3",
    "date": "2026-01",
    "grade": "3年",
    "round": "第三試合",
    "battingOrder": "first",
    "tournament": "第5回鹿嶋市長杯交流大会",
    "opponent": "水戸青藍舎ヤング",
    "venue": "",
    "ourScore": 2,
    "oppScore": 10,
    "note": ""
  },
  {
    "id": "legacy-44-2026-spring-1",
    "date": "2026-02",
    "grade": "3年",
    "round": "一回戦",
    "battingOrder": "first",
    "tournament": "東関東支部春季大会",
    "opponent": "千葉南シニア",
    "venue": "",
    "ourScore": 10,
    "oppScore": 2,
    "note": ""
  },
  {
    "id": "legacy-44-2026-spring-2",
    "date": "2026-02",
    "grade": "3年",
    "round": "二回戦",
    "battingOrder": "second",
    "tournament": "東関東支部春季大会",
    "opponent": "佐倉シニア",
    "venue": "",
    "ourScore": 1,
    "oppScore": 9,
    "note": ""
  },
  {
    "id": "legacy-44-2026-spring-3",
    "date": "2026-02",
    "grade": "3年",
    "round": "敗者復活二回戦",
    "battingOrder": "first",
    "tournament": "東関東支部春季大会",
    "opponent": "千葉市ウイナーズ",
    "venue": "",
    "ourScore": 0,
    "oppScore": 10,
    "note": ""
  },
  {
    "id": "legacy-44-2026-iwaki-1",
    "date": "2026-03",
    "grade": "3年",
    "round": "第一試合",
    "battingOrder": "first",
    "tournament": "第11回iwakiサンシャインcup交流大会",
    "opponent": "新庄シニア",
    "venue": "",
    "ourScore": 0,
    "oppScore": 7,
    "note": ""
  },
  {
    "id": "legacy-44-2026-iwaki-2",
    "date": "2026-03",
    "grade": "3年",
    "round": "第二試合",
    "battingOrder": "first",
    "tournament": "第11回iwakiサンシャインcup交流大会",
    "opponent": "郡山シニア",
    "venue": "",
    "ourScore": 1,
    "oppScore": 8,
    "note": ""
  },
  {
    "id": "legacy-44-2026-iwaki-3",
    "date": "2026-03",
    "grade": "3年",
    "round": "第三試合",
    "battingOrder": "first",
    "tournament": "第11回iwakiサンシャインcup交流大会",
    "opponent": "会津シニア",
    "venue": "",
    "ourScore": 2,
    "oppScore": 10,
    "note": ""
  },
  {
    "id": "legacy-44-2026-iwaki-4",
    "date": "2026-03",
    "grade": "3年",
    "round": "第四試合",
    "battingOrder": "first",
    "tournament": "第11回iwakiサンシャインcup交流大会",
    "opponent": "宮城登米シニア",
    "venue": "",
    "ourScore": 18,
    "oppScore": 9,
    "note": ""
  },
  {
    "id": "legacy-44-2026-yomiuri-1",
    "date": "2026-04",
    "grade": "3年",
    "round": "三回戦",
    "battingOrder": "first",
    "tournament": "第19回読売新聞社杯兼第48回千葉県大会",
    "opponent": "柏シニア",
    "venue": "",
    "ourScore": 7,
    "oppScore": 5,
    "note": ""
  },
  {
    "id": "legacy-44-2026-yomiuri-2",
    "date": "2026-04",
    "grade": "3年",
    "round": "四回戦",
    "battingOrder": "first",
    "tournament": "第19回読売新聞社杯兼第48回千葉県大会",
    "opponent": "市川シニア",
    "venue": "",
    "ourScore": 0,
    "oppScore": 3,
    "note": ""
  },
  {
    "id": "legacy-44-2026-kanto-summer-1",
    "date": "2026-05",
    "grade": "3年",
    "round": "一回戦",
    "battingOrder": "first",
    "tournament": "関東夏季大会",
    "opponent": "上尾シニア",
    "venue": "",
    "ourScore": 0,
    "oppScore": 7,
    "note": ""
  },
  {
    "id": "legacy-44-2026-lotte-1",
    "date": "2026-07",
    "grade": "3年",
    "round": "二回戦",
    "battingOrder": "first",
    "tournament": "CHIBA LOTTE MARINES CUP 2026",
    "opponent": "匝瑳シニア",
    "venue": "",
    "ourScore": 2,
    "oppScore": 3,
    "note": ""
  },
  {
    "id": "legacy-45-2025-narita-1",
    "date": "2025-11",
    "grade": "2年",
    "round": "一回戦",
    "battingOrder": "first",
    "tournament": "第19回成田国際空港杯フレッシュマン大会",
    "opponent": "八千代中央シニア",
    "venue": "",
    "ourScore": 0,
    "oppScore": 11,
    "note": ""
  },
  {
    "id": "legacy-45-2025-narita-2",
    "date": "2025-11",
    "grade": "2年",
    "round": "敗者交流戦",
    "battingOrder": "first",
    "tournament": "第19回成田国際空港杯フレッシュマン大会",
    "opponent": "千葉西シニア",
    "venue": "",
    "ourScore": 5,
    "oppScore": 6,
    "note": ""
  },
  {
    "id": "legacy-45-2026-chibanippo-1",
    "date": "2026-06",
    "grade": "2年",
    "round": "一回戦",
    "battingOrder": "first",
    "tournament": "千葉日報社新人大会",
    "opponent": "船橋シニア",
    "venue": "",
    "ourScore": 4,
    "oppScore": 1,
    "note": ""
  },
  {
    "id": "legacy-45-2026-chibanippo-2",
    "date": "2026-06",
    "grade": "2年",
    "round": "二回戦",
    "battingOrder": "first",
    "tournament": "千葉日報社新人大会",
    "opponent": "八千代中央V",
    "venue": "",
    "ourScore": 0,
    "oppScore": 9,
    "note": ""
  }
];


function normalizeLiveScoreNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 99 ? number : "";
}

function normalizeLiveScoreText(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, maxLength);
}

function normalizeLiveScoreGame(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const innings = value.innings && typeof value.innings === "object" ? value.innings : {};
  const seven = values => Array.from(
    { length: 7 },
    (_, index) => normalizeLiveScoreNumber(Array.isArray(values) ? values[index] : "")
  );
  const tieBreaks = Array.isArray(value.tieBreaks)
    ? value.tieBreaks.slice(0, 8).map((item, index) => ({
        inning: 8 + index,
        ours: normalizeLiveScoreNumber(item?.ours),
        opponent: normalizeLiveScoreNumber(item?.opponent),
      }))
    : [];
  const startTime = /^\d{2}:\d{2}$/.test(String(value.startTime || ""))
    ? String(value.startTime)
    : "";
  return {
    tournament: normalizeLiveScoreText(value.tournament, 100),
    startTime,
    ground: normalizeLiveScoreText(value.ground, 100),
    grade: ({"1":"1","2":"2","3":"3","1年生":"1","2年生":"2","3年生":"3"}[String(value.grade || "")] || ""),
    ourName: normalizeLiveScoreText(value.ourName, 40) || "八千代",
    opponent: normalizeLiveScoreText(value.opponent, 40),
    battingOrder: value.battingOrder === "first" ? "first" : "second",
    selectedScoreCell: value.selectedScoreCell && ["ours", "opponent"].includes(String(value.selectedScoreCell.side || "")) ? {
      side: String(value.selectedScoreCell.side),
      index: Math.max(0, Math.min(7, Number(value.selectedScoreCell.index) || 0)),
      tieBreak: Boolean(value.selectedScoreCell.tieBreak),
    } : null,
    innings: {
      ours: seven(innings.ours),
      opponent: seven(innings.opponent),
    },
    sbo: {
      strikes: Math.max(0, Math.min(2, Number(value.sbo?.strikes) || 0)),
      balls: Math.max(0, Math.min(3, Number(value.sbo?.balls) || 0)),
      outs: Math.max(0, Math.min(2, Number(value.sbo?.outs) || 0)),
    },
    bases: {
      first: Boolean(value.bases?.first),
      second: Boolean(value.bases?.second),
      third: Boolean(value.bases?.third),
    },
    tieBreaks,
    completedAt: value.completedAt ? String(value.completedAt).slice(0, 40) : "",
  };
}

const LIVE_SCORE_LOCK_KEY = "content/live-score-lock.json";
const LIVE_SCORE_LOCK_TTL_MS = 30000;

async function getLiveScoreLock(store) {
  const lock = await safeStoreJson(store, LIVE_SCORE_LOCK_KEY);
  if (!lock || typeof lock !== "object") return null;
  const expiresAt = Number(lock.expiresAt || 0);
  if (!expiresAt || expiresAt <= Date.now()) return null;
  return { deviceId: String(lock.deviceId || ""), token: String(lock.token || ""), expiresAt, lockedAt: String(lock.lockedAt || "") };
}
function publicLiveScoreLock(lock, deviceId = "") {
  if (!lock) return { active: false, owner: false, expiresAt: 0 };
  return { active: true, owner: Boolean(deviceId && lock.deviceId === deviceId), expiresAt: lock.expiresAt };
}
async function claimLiveScoreLock(store, deviceId) {
  const id = String(deviceId || "").trim().slice(0, 160);
  if (!id) return { error: "device id required" };
  const existing = await getLiveScoreLock(store);
  if (existing && existing.deviceId !== id) return { conflict: true, lock: publicLiveScoreLock(existing, id) };
  const token = existing?.deviceId === id && existing?.token ? existing.token : crypto.randomUUID();
  const now = Date.now();
  await store.setJSON(LIVE_SCORE_LOCK_KEY, { deviceId: id, token, lockedAt: existing?.lockedAt || new Date(now).toISOString(), expiresAt: now + LIVE_SCORE_LOCK_TTL_MS });
  const confirmed = await getLiveScoreLock(store);
  if (!confirmed || confirmed.token !== token || confirmed.deviceId !== id) return { conflict: true, lock: publicLiveScoreLock(confirmed, id) };
  return { token, lock: publicLiveScoreLock(confirmed, id) };
}

function normalizeLiveScoreData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const current = normalizeLiveScoreGame(value.current);
  const active = Boolean(value.active && current);
  return {
    active,
    visible: Boolean(value.visible && active),
    current: active ? current : null,
    lastGame: normalizeLiveScoreGame(value.lastGame),
    updatedAt: new Date().toISOString(),
  };
}

export default async (request, context) => {
  try {
    const url = new URL(request.url);
    const section = url.searchParams.get("section");

    if (!allowed.has(section)) {
      return json({ error: "invalid section" }, 400);
    }

    const store = getStore({
      name: "yachiyo-public-site",
      consistency: "strong"
    });

    const key = `content/${section}.json`;

    if (request.method === "GET") {
      if (section === "access-settings") {
        return json({ error: "method not allowed" }, 405);
      }

      if (
        section === "rules" ||
        section === "duty-roster" ||
        section === "referee-documents" ||
        section === "board-meeting-documents" ||
        section === "board-meeting-schedule" ||
        section === "board-latest-update" ||
        section === "live-score"
      ) {
        const accessPassword = request.headers.get("x-access-password") || "";
        const coachPassword = request.headers.get("x-coach-password") || "";
        const accessGranted =
          await boardSessionIsValid(request) ||
          await accessPasswordIsValid(store, accessPassword) ||
          (section === "board-meeting-schedule" && coachPassword && await coachAccessPasswordIsValid(store, coachPassword));

        if (!accessGranted) {
          return json({ error: "unauthorized" }, 401);
        }
      }

      if (section === "board-latest-update") {
        return json({ data: await loadBoardLatestUpdate(store) });
      }

      if (section === "document-archive") {
        const adminAuth = await verifyAdminPassword({
          store,
          request,
          context,
          expectedPassword: process.env.ADMIN_PASSWORD || "",
        });
        if (!adminAuth.ok) return adminAuthError(json, adminAuth);

        const documents = await store.get(key, {
          type: "json",
          consistency: "strong"
        });

        if (url.searchParams.has("file")) {
          const id = String(url.searchParams.get("file") || "");
          const item = Array.isArray(documents)
            ? documents.find(entry => String(entry?.id || "") === id)
            : null;
          if (!item) return new Response("File not found", { status: 404 });

          const file = await store.get(String(item.storageKey || `document-archive/${id}.bin`), {
            type: "blob",
            consistency: "strong"
          });
          if (!file) return new Response("File not found", { status: 404 });

          const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
          const contentType = allowedTypes.has(String(item.contentType || ""))
            ? String(item.contentType)
            : "application/octet-stream";
          const originalName = String(item.fileName || "document");
          const encodedName = encodeURIComponent(originalName);
          const fallbackName = contentType === "application/pdf"
            ? "archive-document.pdf"
            : contentType === "image/png"
              ? "archive-image.png"
              : contentType === "image/webp"
                ? "archive-image.webp"
                : "archive-image.jpg";
          return new Response(file, {
            status: 200,
            headers: {
              "content-type": contentType,
              "content-disposition": `inline; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
              "cache-control": "private, no-store",
              "x-content-type-options": "nosniff"
            }
          });
        }

        return json({ data: Array.isArray(documents) ? documents : [] });
      }

      if (section === "result-documents" || section === "seniorcup-documents") {
        const documents = await store.get(key, {
          type: "json",
          consistency: "strong"
        });

        if (url.searchParams.has("file")) {
          const id = String(url.searchParams.get("file") || "");
          const item = Array.isArray(documents)
            ? documents.find(entry => String(entry?.id || "") === id)
            : null;

          if (!item) {
            return new Response("File not found", { status: 404 });
          }

          const storageKey = String(item.storageKey || `${section}/${id}.pdf`);
          const file = await store.get(storageKey, {
            type: "blob",
            consistency: "strong"
          });

          if (!file) {
            return new Response("File not found", { status: 404 });
          }

          const allowedTypes = new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
          const contentType = allowedTypes.has(String(item.contentType || ""))
            ? String(item.contentType)
            : "application/pdf";
          const originalName = String(item.fileName || "document");
          const encodedName = encodeURIComponent(originalName);
          const fallbackName = contentType === "application/pdf"
            ? "tournament-document.pdf"
            : contentType === "image/png"
              ? "tournament-image.png"
              : contentType === "image/webp"
                ? "tournament-image.webp"
                : "tournament-image.jpg";

          // Match the working downloads-roster response path exactly: return concrete bytes
          // with Content-Length and attachment disposition for download=1.
          const bytes = new Uint8Array(await file.arrayBuffer());
          const forceDownload = url.searchParams.get("download") === "1";
          const disposition = forceDownload ? "attachment" : "inline";
          // iPhone Safari previews application/pdf even when Content-Disposition is attachment
          // during a normal navigation. For the explicit download route, return an opaque
          // binary MIME type so Safari treats it as a file instead of opening PDF Quick Look.
          const responseContentType = forceDownload ? "application/octet-stream" : contentType;
          return new Response(bytes, {
            status: 200,
            headers: {
              "content-type": responseContentType,
              "content-disposition":
                `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
              "content-length": String(bytes.byteLength),
              "cache-control": "no-store",
              "x-content-type-options": "nosniff"
            }
          });
        }

        return json({ data: Array.isArray(documents) ? documents : [] });
      }

      if (section === "board-tournaments") {
        const accessPassword = request.headers.get("x-access-password") || "";
        const accessGranted =
          await boardSessionIsValid(request) ||
          await accessPasswordIsValid(store, accessPassword);

        if (!accessGranted) {
          return json({ error: "unauthorized" }, 401);
        }

        const documents = await store.get(key, {
          type: "json",
          consistency: "strong"
        });

        if (url.searchParams.has("file")) {
          const id = String(url.searchParams.get("file") || "");
          const item = Array.isArray(documents)
            ? documents.find(entry => String(entry?.id || "") === id)
            : null;

          if (!item) {
            return new Response("PDF not found", { status: 404 });
          }

          const pdf = await store.get(`board-tournaments/${id}.pdf`, {
            type: "blob",
            consistency: "strong"
          });

          if (!pdf) {
            return new Response("PDF not found", { status: 404 });
          }

          const encodedName = encodeURIComponent(item.fileName || "document.pdf");

          return new Response(pdf, {
            status: 200,
            headers: {
              "content-type": "application/pdf",
              "content-disposition":
                `inline; filename="tournament.pdf"; filename*=UTF-8''${encodedName}`,
              "cache-control": "private, no-store",
              "x-content-type-options": "nosniff"
            }
          });
        }

        return json({ data: Array.isArray(documents) ? documents : [] });
      }

      if (section === "board-meeting-documents" || section === "referee-documents") {
        const documents = await store.get(key, {
          type: "json",
          consistency: "strong"
        });

        if (url.searchParams.has("file")) {
          const id = String(url.searchParams.get("file") || "");
          const item = Array.isArray(documents)
            ? documents.find(entry => String(entry?.id || "") === id)
            : null;

          if (!item) return new Response("File not found", { status: 404 });

          const storageKey = String(item.storageKey || `${section}/${id}.pdf`);
          const file = await store.get(storageKey, {
            type: "blob",
            consistency: "strong"
          });
          if (!file) return new Response("File not found", { status: 404 });

          const allowedTypes = new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
          const contentType = allowedTypes.has(String(item.contentType || ""))
            ? String(item.contentType)
            : "application/pdf";
          const encodedName = encodeURIComponent(item.fileName || "meeting-record");
          const fallbackName = contentType === "application/pdf"
            ? "meeting-record.pdf"
            : contentType === "image/png"
              ? "meeting-record.png"
              : contentType === "image/webp"
                ? "meeting-record.webp"
                : "meeting-record.jpg";
          const totalSize = Number(file.size || item.size || 0);
          const responseHeaders = {
            "content-type": contentType,
            "content-disposition": `inline; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
            "cache-control": "private, no-store",
            "accept-ranges": "bytes",
            "x-content-type-options": "nosniff"
          };
          const range = request.headers.get("range") || "";
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (match && totalSize > 0) {
            const requestedStart = match[1] === "" ? 0 : Number(match[1]);
            const requestedEnd = match[2] === "" ? totalSize - 1 : Number(match[2]);
            const start = Math.max(0, Math.min(requestedStart, totalSize - 1));
            const end = Math.max(start, Math.min(requestedEnd, totalSize - 1));
            responseHeaders["content-range"] = `bytes ${start}-${end}/${totalSize}`;
            responseHeaders["content-length"] = String(end - start + 1);
            return new Response(file.slice(start, end + 1, contentType), {
              status: 206,
              headers: responseHeaders
            });
          }
          if (totalSize > 0) responseHeaders["content-length"] = String(totalSize);
          return new Response(file, {status: 200, headers: responseHeaders});
        }

        return json({ data: Array.isArray(documents) ? documents : [] });
      }

      let data = await store.get(key, {
        type: "json",
        consistency: "strong"
      });

      if (section === "staff" && Array.isArray(data)) {
        let changed = false;
        data = data.map(item => {
          const compactName = String(item?.name || "").replace(/[\s　]+/g, "");
          if (!compactName.startsWith("松野") || String(item?.role || "").trim() === "スコアラー") return item;
          changed = true;
          return { ...item, role: "スコアラー" };
        });
        if (changed) await store.setJSON(key, data);
      }

      if (section === "schedule" || section === "board-meeting-schedule") {
        const normalized = normalizeScheduleEntries(data);
        data = normalized.data;
        if (normalized.changed) await store.setJSON(key, data);
      }

      if (section === "results") {
        const migrationKey = "migrations/results-legacy-20260910.json";
        const migrated = await store.get(migrationKey, {
          type: "json",
          consistency: "strong"
        });
        if (!migrated?.done) {
          const current = Array.isArray(data) ? data : [];
          const currentIds = new Set(current.map(item => String(item?.id || "")));
          const additions = LEGACY_RESULT_SEED.filter(item => !currentIds.has(item.id));
          data = [...current, ...additions];
          await store.setJSON(key, data);
          await store.setJSON(migrationKey, {
            done: true,
            added: additions.length,
            updatedAt: new Date().toISOString()
          });
        }

        // 旧サイト照合で判明した鹿嶋市長杯・第三試合を既存データへ補完する。
        // 初回の旧試合移行が完了済みの環境でも、この1件だけを一度追加する。
        const kashimaThirdMigrationKey =
          "migrations/results-kashima-third-20260914-v2.json";
        const kashimaThirdMigrated = await store.get(
          kashimaThirdMigrationKey,
          { type: "json", consistency: "strong" }
        );
        if (!kashimaThirdMigrated?.done) {
          const current = Array.isArray(data) ? data : [];
          const missingResult = LEGACY_RESULT_SEED.find(
            item => item.id === "legacy-44-2026-kashima-3"
          );
          const alreadyExists = current.some(
            item => String(item?.id || "") === "legacy-44-2026-kashima-3"
          );
          if (missingResult) {
            data = alreadyExists
              ? current.map(item =>
                  String(item?.id || "") === "legacy-44-2026-kashima-3"
                    ? { ...item, battingOrder: "first" }
                    : item
                )
              : [...current, missingResult];
            await store.setJSON(key, data);
          }
          await store.setJSON(kashimaThirdMigrationKey, {
            done: true,
            added: Boolean(missingResult && !alreadyExists),
            updatedAt: new Date().toISOString()
          });
        }

        // 旧サイトの勝敗記号と点数から八千代側を特定し、
        // 八千代の点数が左なら先攻、右なら後攻として移行する。
        const legacyFirstBattingIds = new Set([
          "legacy-44-2026-kashima-1",
          "legacy-44-2026-kashima-2",
          "legacy-44-2026-kashima-3",
          "legacy-44-2026-spring-1",
          "legacy-44-2026-spring-3",
          "legacy-44-2026-iwaki-1",
          "legacy-44-2026-iwaki-2",
          "legacy-44-2026-iwaki-3",
          "legacy-44-2026-iwaki-4",
          "legacy-44-2026-yomiuri-1",
          "legacy-44-2026-yomiuri-2",
          "legacy-44-2026-kanto-summer-1",
          "legacy-44-2026-lotte-1",
          "legacy-45-2026-chibanippo-1",
          "legacy-45-2026-chibanippo-2"
        ]);
        const legacySecondBattingIds = new Set([
          "legacy-44-2026-spring-2"
        ]);
        const battingOrderMigrationKey =
          "migrations/results-batting-order-20260914-v5.json";
        const battingOrderMigrated = await store.get(
          battingOrderMigrationKey,
          { type: "json", consistency: "strong" }
        );
        if (!battingOrderMigrated?.done) {
          const current = Array.isArray(data) ? data : [];
          let updated = 0;
          data = current.map(item => {
            const id = String(item?.id || "");
            const battingOrder = legacyFirstBattingIds.has(id)
              ? "first"
              : legacySecondBattingIds.has(id)
                ? "second"
                : "";
            const isSakuraResult = id === "legacy-44-2026-spring-2";
            const scoreNeedsCorrection =
              isSakuraResult &&
              (Number(item?.ourScore) !== 1 || Number(item?.oppScore) !== 9);
            if (
              (battingOrder && item?.battingOrder !== battingOrder) ||
              scoreNeedsCorrection
            ) {
              updated += 1;
              return {
                ...item,
                battingOrder: battingOrder || item?.battingOrder,
                ...(isSakuraResult ? { ourScore: 1, oppScore: 9 } : {})
              };
            }
            return item;
          });
          if (updated > 0) await store.setJSON(key, data);
          await store.setJSON(battingOrderMigrationKey, {
            done: true,
            updated,
            updatedAt: new Date().toISOString()
          });
        }

        const currentResults = Array.isArray(data) ? data : [];
        const activeResults = currentResults.filter(item => !resultIsExpired(item));
        if (activeResults.length !== currentResults.length) {
          data = activeResults;
          await store.setJSON(key, data);
        }
      }

      const photoSection =
        section === "hero" ||
        section === "photos" ||
        section === "ground-photos";

      if (photoSection && url.searchParams.get("manifest") === "1") {
        const photos = Array.isArray(data)
          ? data
              .map((item, index) => ({ item, index }))
              .filter(entry => entry.item?.image)
          : [];

        return json({
          data: photos.map(({ item, index }) => {
            const id = section === "photos"
              ? String(item.key || index)
              : String(index);

            return {
              key: item.key,
              image:
                `/.netlify/functions/site-data?section=${encodeURIComponent(section)}` +
                `&image=${encodeURIComponent(id)}` +
                `&v=${encodeURIComponent(item.updatedAt || index)}`,
              updatedAt: item.updatedAt || ""
            };
          })
        });
      }

      if (photoSection && url.searchParams.has("image")) {
        const id = String(url.searchParams.get("image") || "");
        const item = section === "photos"
          ? (Array.isArray(data)
              ? data.find(entry => String(entry?.key || "") === id)
              : null)
          : (Array.isArray(data) ? data[Number(id)] : null);
        const match = String(item?.image || "").match(
          /^data:([^;,]+)?(;base64)?,(.*)$/s
        );

        if (!match) {
          return new Response("Photo not found", { status: 404 });
        }

        const bytes = match[2]
          ? Uint8Array.from(
              atob(match[3]),
              character => character.charCodeAt(0)
            )
          : new TextEncoder().encode(
              decodeURIComponent(match[3])
            );

        return new Response(bytes, {
          status: 200,
          headers: {
            "content-type": match[1] || "image/jpeg",
            "content-length": String(bytes.byteLength),
            "cache-control": "public, max-age=31536000, immutable"
          }
        });
      }

      if (
        (
          url.searchParams.get("download") === "1" ||
          url.searchParams.get("view") === "1"
        ) &&
        (
          section === "downloads-application" ||
          section === "downloads-guideline" ||
          section === "downloads-roster"
        )
      ) {
        if (!data?.fileName || !data?.dataUrl) {
          return new Response("File not found", {
            status: 404
          });
        }

        const match = String(data.dataUrl).match(
          /^data:([^;,]+)?(;base64)?,(.*)$/s
        );

        if (!match) {
          return new Response("Invalid file data", {
            status: 500
          });
        }

        const storedMimeType = data.mimeType || match[1] || "application/octet-stream";
        const guidelineTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
        const mimeType = section === "downloads-guideline"
          ? (guidelineTypes.has(storedMimeType) ? storedMimeType : "application/pdf")
          : storedMimeType;

        const bytes = match[2]
          ? Uint8Array.from(
              atob(match[3]),
              character => character.charCodeAt(0)
            )
          : new TextEncoder().encode(
              decodeURIComponent(match[3])
            );

        const originalName = String(data.fileName);
        const cleanedName = originalName.replace(/[\r\n"\\]/g, "_");
        const extensionMatch = originalName.match(/\.([a-zA-Z0-9]{1,8})$/);
        const safeName = /^[\x20-\x7e]+$/.test(cleanedName)
          ? cleanedName
          : `download${extensionMatch ? `.${extensionMatch[1]}` : ""}`;

        const encodedName = encodeURIComponent(
          originalName
        );

        const disposition = url.searchParams.get("view") === "1"
          ? "inline"
          : "attachment";

        return new Response(bytes, {
          status: 200,
          headers: {
            "content-type": mimeType,
            "content-disposition":
              `${disposition}; filename="${safeName}"; ` +
              `filename*=UTF-8''${encodedName}`,
            "content-length": String(bytes.byteLength),
            "cache-control": "no-store"
          }
        });
      }

      if (section === "live-score") {
        const deviceId = String(request.headers.get("x-live-score-device-id") || "");
        const lock = await getLiveScoreLock(store);
        return json({ data: data ?? [], lock: publicLiveScoreLock(lock, deviceId) });
      }

      return json({
        data: data ?? []
      });
    }

    if (request.method !== "POST") {
      return json({
        error: "method not allowed"
      }, 405);
    }

    const rawUploadAction = request.headers.get("x-upload-action") || "";
    const isSecretariatUpload = section === "board-meeting-documents" && /^uploadBoardMeetingDocument(?:Chunk)?$/.test(rawUploadAction);
    const isRefereeUpload = section === "referee-documents" && /^uploadRefereeDocument(?:Chunk)?$/.test(rawUploadAction);
    const isRawBoardUpload = isSecretariatUpload || isRefereeUpload;

    if (isRawBoardUpload) {
      const accessPassword = request.headers.get("x-access-password") || "";
      const accessGranted =
        await boardSessionIsValid(request) ||
        await accessPasswordIsValid(store, accessPassword);
      if (!accessGranted) return json({ error: "unauthorized" }, 401);
      if (!(await coachAccessPasswordIsValid(store, request.headers.get("x-coach-password") || ""))) {
        return json({ error: "パスワードが違います。" }, 401);
      }

      let fileName = "";
      try {
        fileName = decodeURIComponent(request.headers.get("x-file-name") || "").trim();
      } catch {
        return json({ error: "ファイル名を確認してください。" }, 400);
      }
      const contentType = String(request.headers.get("content-type") || "").split(";")[0].toLowerCase();
      let bytes = new Uint8Array(await request.arrayBuffer());
      const isChunk = rawUploadAction.endsWith("Chunk");
      const pendingKeys = [];

      if (isChunk) {
        const uploadId = String(request.headers.get("x-upload-id") || "");
        const chunkIndex = Number(request.headers.get("x-upload-index"));
        const chunkTotal = Number(request.headers.get("x-upload-total"));
        if (!/^[a-zA-Z0-9_-]{8,100}$/.test(uploadId) || !Number.isInteger(chunkIndex) || !Number.isInteger(chunkTotal) || chunkIndex < 0 || chunkTotal < 1 || chunkTotal > 8 || chunkIndex >= chunkTotal) {
          return json({ error: "アップロード情報を確認してください。" }, 400);
        }
        if (bytes.byteLength > 1024 * 1024) return json({ error: "分割データが大きすぎます。" }, 413);
        const pendingPrefix = `${section}/pending/${uploadId}`;
        const pendingKey = `${pendingPrefix}/${chunkIndex}.bin`;
        await store.set(pendingKey, bytes.buffer);
        if (chunkIndex < chunkTotal - 1) return json({ ok: true, complete: false });

        const parts = [];
        let combinedSize = 0;
        for (let index = 0; index < chunkTotal; index += 1) {
          const partKey = `${pendingPrefix}/${index}.bin`;
          const partBlob = await store.get(partKey, {type: "blob", consistency: "strong"});
          if (!partBlob) return json({ error: "分割データの一部を確認できませんでした。もう一度お試しください。" }, 409);
          const part = new Uint8Array(await partBlob.arrayBuffer());
          parts.push(part);
          pendingKeys.push(partKey);
          combinedSize += part.byteLength;
        }
        bytes = new Uint8Array(combinedSize);
        let offset = 0;
        for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
      }

      if (!boardMeetingFileIsValid(fileName, contentType, bytes)) {
        return json({ error: "PDF・JPEG・PNG・WebPファイルを選択してください。" }, 400);
      }
      if (bytes.byteLength > 6 * 1024 * 1024) {
        return json({ error: "ファイルは6MB以下にしてください。" }, 413);
      }

      const current = await store.get(key, {type: "json", consistency: "strong"});
      const documents = Array.isArray(current) ? current : [];
      if (documents.length >= 12) return json({ error: "保存できる資料は12件までです。" }, 400);

      const id = crypto.randomUUID();
      const storageKey = `${section}/${id}.bin`;
      const item = {id, fileName, contentType, storageKey, size: bytes.byteLength, uploadedAt: new Date().toISOString()};
      await store.set(storageKey, bytes.buffer, {metadata: {fileName, contentType}});
      const updated = [item, ...documents];
      await store.setJSON(key, updated);
      await Promise.all(pendingKeys.map(partKey => store.delete(partKey)));
      const documentLabel = section === "referee-documents" ? "審判部資料" : "事務局資料";
      await saveBoardLatestUpdate(store, "documents", `${documentLabel}「${fileName}」を保存しました`, item.uploadedAt);
      return json({ ok: true, complete: true, data: updated });
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid json" }, 400);
    }

    if (section === "board-latest-update") {
      return json({ error: "method not allowed" }, 405);
    }

    if (
      section === "access-settings" &&
      body?.action === "verifyAccessPassword"
    ) {
      const valid = await accessPasswordIsValid(
        store,
        body.password
      );

      if (!valid) {
        return json({ ok: false }, 401);
      }

      const token = await createBoardSessionToken();
      return json(
        { ok: true, token },
        200,
        { "set-cookie": boardSessionCookie(token) }
      );
    }

    if (section === "live-score") {
      const accessPassword = request.headers.get("x-access-password") || "";
      const accessGranted =
        await boardSessionIsValid(request) ||
        await accessPasswordIsValid(store, accessPassword);
      if (!accessGranted) return json({ error: "unauthorized" }, 401);

      const action = String(body?.action || "");
      const deviceId = String(body?.deviceId || "").trim().slice(0, 160);
      if (action === "claimEditorLock") {
        const claimed = await claimLiveScoreLock(store, deviceId);
        if (claimed.error) return json({ error: "入力端末を確認してください。" }, 400);
        if (claimed.conflict) return json({ error: "現在、別の端末で入力中です。", lock: claimed.lock }, 409);
        return json({ ok: true, lockToken: claimed.token, lock: claimed.lock });
      }
      if (action === "heartbeatEditorLock" || action === "releaseEditorLock") {
        const currentLock = await getLiveScoreLock(store);
        const token = String(body?.lockToken || "");
        if (!currentLock || currentLock.deviceId !== deviceId || currentLock.token !== token) return json({ error: "入力権限がありません。" }, 409);
        if (action === "releaseEditorLock") {
          await store.delete(LIVE_SCORE_LOCK_KEY);
          return json({ ok: true, lock: { active: false, owner: false, expiresAt: 0 } });
        }
        const renewed = { ...currentLock, expiresAt: Date.now() + LIVE_SCORE_LOCK_TTL_MS };
        await store.setJSON(LIVE_SCORE_LOCK_KEY, renewed);
        const confirmed = await getLiveScoreLock(store);
        if (!confirmed || confirmed.token !== token || confirmed.deviceId !== deviceId) return json({ error: "入力権限がありません。" }, 409);
        return json({ ok: true, lockToken: token, lock: publicLiveScoreLock(confirmed, deviceId) });
      }
      if (action !== "saveLiveScore") return json({ error: "不正な試合速報操作です。" }, 400);

      const currentLock = await getLiveScoreLock(store);
      const token = String(body?.lockToken || "");
      if (!currentLock || currentLock.deviceId !== deviceId || currentLock.token !== token) {
        return json({ error: "現在、別の端末で入力中です。入力モードを取得し直してください。", lock: publicLiveScoreLock(currentLock, deviceId) }, 409);
      }
      const serialized = JSON.stringify(body?.data ?? null);
      if (serialized.length > 20000) return json({ error: "試合速報のデータが大きすぎます。" }, 413);
      const normalized = normalizeLiveScoreData(body?.data);
      if (!normalized) return json({ error: "試合速報の内容を確認してください。" }, 400);
      const existing = await store.get(key, { type: "json", consistency: "strong" });
      if (!normalized.lastGame) normalized.lastGame = normalizeLiveScoreGame(existing?.lastGame);
      await store.setJSON(key, normalized);
      return json({ ok: true, data: normalized, lock: publicLiveScoreLock(currentLock, deviceId) });
    }

    const boardDirectSection =
      section === "referee-documents" ||
      section === "board-meeting-documents" ||
      section === "board-meeting-schedule";

    if (boardDirectSection) {
      const accessPassword = request.headers.get("x-access-password") || "";
      const accessGranted =
        await boardSessionIsValid(request) ||
        await accessPasswordIsValid(store, accessPassword);

      if (!accessGranted) {
        return json({ error: "unauthorized" }, 401);
      }

      const protectedBoardActions = new Set(["uploadBoardMeetingDocument","renameBoardMeetingDocument","deleteBoardMeetingDocument","uploadRefereeDocument","renameRefereeDocument","deleteRefereeDocument","saveBoardMeetingEvent","deleteBoardMeetingEvent"]);
      if (protectedBoardActions.has(String(body?.action || "")) && !(await coachAccessPasswordIsValid(store, request.headers.get("x-coach-password") || ""))) {
        return json({ error: "パスワードが違います。" }, 401);
      }

      if (
        (section === "board-meeting-documents" && body?.action === "uploadBoardMeetingDocument") ||
        (section === "referee-documents" && body?.action === "uploadRefereeDocument")
      ) {
        const fileName = String(body.fileName || "").trim();
        const decoded = decodeBoardMeetingDataUrl(body.dataUrl);

        if (!decoded || !boardMeetingFileIsValid(fileName, decoded.contentType, decoded.bytes)) {
          return json({ error: "PDF・JPEG・PNG・WebPファイルを選択してください。" }, 400);
        }
        if (decoded.bytes.byteLength > 6 * 1024 * 1024) {
          return json({ error: "ファイルは6MB以下にしてください。" }, 413);
        }

        const current = await store.get(key, {type: "json", consistency: "strong"});
        const documents = Array.isArray(current) ? current : [];
        if (documents.length >= 12) return json({ error: "保存できる資料は12件までです。" }, 400);

        const id = crypto.randomUUID();
        const storageKey = `${section}/${id}.bin`;
        const item = {id, fileName, contentType: decoded.contentType, storageKey, size: decoded.bytes.byteLength, uploadedAt: new Date().toISOString()};
        await store.set(storageKey, decoded.bytes.buffer, {metadata: {fileName, contentType: decoded.contentType}});
        const updated = [item, ...documents];
        await store.setJSON(key, updated);
        const documentLabel = section === "referee-documents" ? "審判部資料" : "事務局資料";
        await saveBoardLatestUpdate(store, "documents", `${documentLabel}「${fileName}」を保存しました`, item.uploadedAt);
        return json({ ok: true, data: updated });
      }

      if (
        (section === "board-meeting-documents" && body?.action === "renameBoardMeetingDocument") ||
        (section === "referee-documents" && body?.action === "renameRefereeDocument")
      ) {
        const id = String(body.id || "");
        const fileName = String(body.fileName || "").trim();
        const current = await store.get(key, {type: "json", consistency: "strong"});
        const documents = Array.isArray(current) ? current : [];
        const item = documents.find(entry => String(entry?.id || "") === id);
        if (!item) return json({ error: "資料が見つかりません。" }, 404);

        const extensionPattern = item.contentType === "application/pdf"
          ? /\.pdf$/i
          : item.contentType === "image/png"
            ? /\.png$/i
            : item.contentType === "image/webp"
              ? /\.webp$/i
              : /\.jpe?g$/i;
        if (!fileName || fileName.length > 160 || /[\\/\u0000-\u001f]/.test(fileName) || !extensionPattern.test(fileName)) {
          return json({ error: "ファイル名を確認してください。" }, 400);
        }

        const updated = documents.map(entry =>
          String(entry?.id || "") === id
            ? { ...entry, fileName, renamedAt: new Date().toISOString() }
            : entry
        );
        await store.setJSON(key, updated);
        const documentLabel = section === "referee-documents" ? "審判部資料" : "事務局資料";
        await renameBoardDocumentUpdateHistory(store, documentLabel, item, fileName);
        return json({ ok: true, data: updated });
      }

      if (
        (section === "board-meeting-documents" && body?.action === "deleteBoardMeetingDocument") ||
        (section === "referee-documents" && body?.action === "deleteRefereeDocument")
      ) {
        const id = String(body.id || "");
        const current = await store.get(key, {
          type: "json",
          consistency: "strong"
        });
        const documents = Array.isArray(current) ? current : [];
        if (!documents.some(entry => String(entry?.id || "") === id)) {
          return json({ error: "資料が見つかりません。" }, 404);
        }
        const item = documents.find(entry => String(entry?.id || "") === id);
        await store.delete(String(item?.storageKey || `${section}/${id}.pdf`));
        const updated = documents.filter(entry => String(entry?.id || "") !== id);
        await store.setJSON(key, updated);
        return json({ ok: true, data: updated });
      }

      if (
        section === "board-meeting-schedule" &&
        body?.action === "saveBoardMeetingEvent"
      ) {
        const event = body.event || {};
        const id = String(event.id || crypto.randomUUID());
        const date = String(event.date || "");
        const title = String(event.title || "").trim();
        const grades = Array.isArray(event.grades)
          ? [...new Set(event.grades.map(String).filter(grade => ["1", "2", "3", "other"].includes(grade)))].sort((a,b) => ["1","2","3","other"].indexOf(a)-["1","2","3","other"].indexOf(b))
          : [];
        const time = String(event.time || "").trim();
        const place = String(event.place || "").trim();
        const memo = String(event.memo || "").trim();

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return json({ error: "日付を確認してください。" }, 400);
        }
        if (!grades.length) {
          return json({ error: "対象学年を選択してください。" }, 400);
        }
        if (!title || title.length > 60 || time.length > 40 || place.length > 80 || memo.length > 500) {
          return json({ error: "入力内容を確認してください。" }, 400);
        }

        const current = await store.get(key, {
          type: "json",
          consistency: "strong"
        });
        const events = Array.isArray(current) ? current : [];
        const nextItem = { id, date, title, grades, time, place, memo, updatedAt: new Date().toISOString() };
        const updated = [
          ...events.filter(entry => String(entry?.id || "") !== id),
          nextItem
        ].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
        await store.setJSON(key, updated);
        await saveBoardLatestUpdate(
          store,
          "schedule",
          `事務局スケジュール「${title}」を${events.some(entry => String(entry?.id || "") === id) ? "変更" : "追加"}しました`,
          nextItem.updatedAt
        );
        return json({ ok: true, data: updated });
      }

      if (
        section === "board-meeting-schedule" &&
        body?.action === "deleteBoardMeetingEvent"
      ) {
        const id = String(body.id || "");
        const current = await store.get(key, {
          type: "json",
          consistency: "strong"
        });
        const events = Array.isArray(current) ? current : [];
        if (!events.some(entry => String(entry?.id || "") === id)) {
          return json({ error: "予定が見つかりません。" }, 404);
        }
        const updated = events.filter(entry => String(entry?.id || "") !== id);
        await store.setJSON(key, updated);
        return json({ ok: true, data: updated });
      }

      return json({ error: "invalid action" }, 400);
    }

    const adminAuth = await verifyAdminPassword({
      store,
      request,
      context,
      expectedPassword: process.env.ADMIN_PASSWORD || "",
    });

    if (
      section === "access-settings" &&
      body?.action === "verifyAdminPassword"
    ) {
      return adminAuth.ok
        ? json({ ok: true })
        : adminAuthError(json, adminAuth);
    }

    if (!adminAuth.ok) return adminAuthError(json, adminAuth);

    if (section === "seniorcup-registration") {
      if (typeof body?.data?.closed !== "boolean") return json({ error: "受付状態を確認してください。" }, 400);
      const data = { closed: body.data.closed, updatedAt: new Date().toISOString() };
      await store.setJSON(key, data);
      return json({ ok: true, data });
    }

    if (
      section === "document-archive" &&
      body?.action === "uploadArchiveDocument"
    ) {
      const fileName = String(body.fileName || "").trim();
      const decoded = decodeBoardMeetingDataUrl(body.dataUrl);
      if (!decoded || !boardMeetingFileIsValid(fileName, decoded.contentType, decoded.bytes)) {
        return json({ error: "PDF・JPEG・PNG・WebPファイルを選択してください。" }, 400);
      }
      if (decoded.bytes.byteLength > 6 * 1024 * 1024) {
        return json({ error: "ファイルは6MB以下にしてください。" }, 413);
      }

      const current = await store.get(key, { type: "json", consistency: "strong" });
      const documents = Array.isArray(current) ? current : [];
      if (documents.length >= 12) {
        return json({ error: "格納庫に保存できる資料は12件までです。" }, 400);
      }

      const id = crypto.randomUUID();
      const storageKey = `document-archive/${id}.bin`;
      const item = {
        id,
        fileName,
        contentType: decoded.contentType,
        storageKey,
        size: decoded.bytes.byteLength,
        uploadedAt: new Date().toISOString()
      };
      await store.set(storageKey, decoded.bytes.buffer, {
        metadata: { fileName, contentType: decoded.contentType }
      });
      const updated = [item, ...documents];
      await store.setJSON(key, updated);
      return json({ ok: true, data: updated });
    }

    if (
      section === "document-archive" &&
      body?.action === "deleteArchiveDocument"
    ) {
      const id = String(body.id || "");
      const current = await store.get(key, { type: "json", consistency: "strong" });
      const documents = Array.isArray(current) ? current : [];
      const item = documents.find(entry => String(entry?.id || "") === id);
      if (!item) return json({ error: "資料が見つかりません。" }, 404);
      await store.delete(String(item.storageKey || `document-archive/${id}.bin`));
      const updated = documents.filter(entry => String(entry?.id || "") !== id);
      await store.setJSON(key, updated);
      return json({ ok: true, data: updated });
    }

    if (
      section === "document-archive" &&
      body?.action === "renameArchiveDocument"
    ) {
      const id = String(body.id || "");
      const fileName = String(body.fileName || "").trim();
      const current = await store.get(key, { type: "json", consistency: "strong" });
      const documents = Array.isArray(current) ? current : [];
      const item = documents.find(entry => String(entry?.id || "") === id);
      if (!item) return json({ error: "資料が見つかりません。" }, 404);

      const extensionPattern = item.contentType === "application/pdf"
        ? /\.pdf$/i
        : item.contentType === "image/png"
          ? /\.png$/i
          : item.contentType === "image/webp"
            ? /\.webp$/i
            : /\.jpe?g$/i;
      if (!fileName || fileName.length > 160 || !extensionPattern.test(fileName)) {
        return json({ error: "元のファイル形式と同じ拡張子を付けてください。" }, 400);
      }

      const updated = documents.map(entry =>
        String(entry?.id || "") === id
          ? { ...entry, fileName, renamedAt: new Date().toISOString() }
          : entry
      );
      await store.setJSON(key, updated);
      return json({ ok: true, data: updated });
    }

    if (
      section === "results" &&
      body?.action === "renameResultTournament"
    ) {
      const fromTournament = String(body.fromTournament || "").trim();
      const toTournament = String(body.toTournament || "").trim();
      const nextResults = body.data;

      if (
        !fromTournament ||
        !toTournament ||
        fromTournament.length > 200 ||
        toTournament.length > 200 ||
        !Array.isArray(nextResults)
      ) {
        return json({ error: "大会名を確認してください。" }, 400);
      }

      const serializedResults = JSON.stringify(nextResults);
      if (serializedResults.length > 8000000) {
        return json({ error: "payload too large" }, 413);
      }

      const documentKey = "content/result-documents.json";
      const currentDocuments = await store.get(documentKey, {
        type: "json",
        consistency: "strong"
      });
      const documents = Array.isArray(currentDocuments)
        ? currentDocuments
        : [];
      const updatedDocuments = documents.map(item =>
        String(item?.tournament || "") === fromTournament
          ? { ...item, tournament: toTournament }
          : item
      );

      await store.setJSON(key, nextResults);
      if (JSON.stringify(updatedDocuments) !== JSON.stringify(documents)) {
        await store.setJSON(documentKey, updatedDocuments);
      }

      return json({
        ok: true,
        data: nextResults,
        documents: updatedDocuments
      });
    }

    if (section === "downloads-guideline" && body?.data?.fileName) {
      const fileName = String(body.data.fileName || "").trim();
      const decoded = decodeBoardMeetingDataUrl(body.data.dataUrl);

      if (!decoded || !boardMeetingFileIsValid(fileName, decoded.contentType, decoded.bytes)) {
        return json({ error: "PDF・JPEG・PNG・WebPファイルを選択してください。" }, 400);
      }
      if (decoded.bytes.byteLength > 5 * 1024 * 1024) {
        return json({ error: "ファイルは5MB以下にしてください。" }, 413);
      }
    }

    if (
      (section === "result-documents" || section === "seniorcup-documents") &&
      body?.action === "uploadResultDocument"
    ) {
      const tournament = String(body.tournament || "").trim();
      const fileName = String(body.fileName || "").trim();
      const decoded = decodeBoardMeetingDataUrl(body.dataUrl);

      if (!tournament || tournament.length > 160) {
        return json({ error: "大会名を確認してください。" }, 400);
      }
      if (!decoded || !boardMeetingFileIsValid(fileName, decoded.contentType, decoded.bytes)) {
        return json({ error: "PDF・JPEG・PNG・WebPファイルを選択してください。" }, 400);
      }
      if (decoded.bytes.byteLength > 6 * 1024 * 1024) {
        return json({ error: "ファイルは6MB以下にしてください。" }, 413);
      }

      const current = await store.get(key, {
        type: "json",
        consistency: "strong"
      });
      const documents = Array.isArray(current) ? current : [];
      const id = crypto.randomUUID();
      const storageKey = `${section}/${id}.bin`;
      const item = {
        id,
        tournament,
        fileName,
        contentType: decoded.contentType,
        storageKey,
        size: decoded.bytes.byteLength,
        uploadedAt: new Date().toISOString()
      };

      await store.set(storageKey, decoded.bytes.buffer, {
        metadata: { tournament, fileName, contentType: decoded.contentType }
      });
      const updated = [item, ...documents];
      await store.setJSON(key, updated);
      return json({ ok: true, data: updated });
    }

    if (
      (section === "result-documents" || section === "seniorcup-documents") &&
      body?.action === "deleteResultDocument"
    ) {
      const id = String(body.id || "");
      const current = await store.get(key, {
        type: "json",
        consistency: "strong"
      });
      const documents = Array.isArray(current) ? current : [];
      const item = documents.find(entry => String(entry?.id || "") === id);
      if (!item) {
        return json({ error: "資料が見つかりません。" }, 404);
      }

      await store.delete(String(item.storageKey || `${section}/${id}.pdf`));
      const updated = documents.filter(entry => String(entry?.id || "") !== id);
      await store.setJSON(key, updated);
      return json({ ok: true, data: updated });
    }

    if (
      section === "board-tournaments" &&
      body?.action === "uploadBoardTournament"
    ) {
      const title = String(body.title || "").trim();
      const fileName = String(body.fileName || "").trim();
      const grade = String(body.grade || "all");
      const bytes = decodeDataUrl(body.dataUrl);

      if (!title || title.length > 120) {
        return json({ error: "大会名を入力してください。" }, 400);
      }
      if (!fileName.toLowerCase().endsWith(".pdf") || !bytes) {
        return json({ error: "PDFファイルを選択してください。" }, 400);
      }
      if (!["all", "1", "2", "3"].includes(grade)) {
        return json({ error: "学年を選択してください。" }, 400);
      }
      if (bytes.byteLength > 6 * 1024 * 1024) {
        return json({ error: "PDFは6MB以下にしてください。" }, 413);
      }
      const signature = new TextDecoder().decode(bytes.slice(0, 5));
      if (signature !== "%PDF-") {
        return json({ error: "正しいPDFファイルではありません。" }, 400);
      }

      const current = await store.get(key, {
        type: "json",
        consistency: "strong"
      });
      const documents = Array.isArray(current) ? current : [];
      if (documents.length >= 6) {
        return json({ error: "掲載できるPDFは6件までです。" }, 400);
      }

      const id = crypto.randomUUID();
      const item = {
        id,
        title,
        grade,
        fileName,
        size: bytes.byteLength,
        uploadedAt: new Date().toISOString()
      };

      await store.set(`board-tournaments/${id}.pdf`, bytes.buffer, {
        metadata: { title, grade, fileName }
      });
      const updated = [item, ...documents];
      await store.setJSON(key, updated);
      return json({ ok: true, data: updated });
    }

    if (
      section === "board-tournaments" &&
      body?.action === "deleteBoardTournament"
    ) {
      const id = String(body.id || "");
      const current = await store.get(key, {
        type: "json",
        consistency: "strong"
      });
      const documents = Array.isArray(current) ? current : [];
      const item = documents.find(entry => String(entry?.id || "") === id);
      if (!item) {
        return json({ error: "PDFが見つかりません。" }, 404);
      }

      await store.delete(`board-tournaments/${id}.pdf`);
      const updated = documents.filter(entry => String(entry?.id || "") !== id);
      await store.setJSON(key, updated);
      return json({ ok: true, data: updated });
    }

    if (
      section === "access-settings" &&
      body?.action === "setAccessPassword"
    ) {
      const newPassword = String(body.password || "");

      if (
        newPassword.length < 8 ||
        newPassword.length > 64
      ) {
        return json({
          error:
            "password must be between 8 and 64 characters"
        }, 400);
      }

      const saltBytes = new Uint8Array(16);
      crypto.getRandomValues(saltBytes);

      const salt = bytesToHex(saltBytes);
      const hash = await hashAccessPassword(
        newPassword,
        salt
      );

      await store.setJSON(key, {
        salt,
        hash,
        updatedAt: new Date().toISOString()
      });
      await store.delete("auth/board-passkeys.json").catch(() => {});

      return json({ ok: true, passkeysReset: true });
    }

    if (section === "duty-roster") {
      const roster = body?.data;
      const images = roster?.images;
      const changes = Array.isArray(roster?.changes) ? roster.changes : [];

      if (
        roster?.initialized !== true ||
        !Array.isArray(images) ||
        images.length > 8 ||
        changes.length > 300
      ) {
        return json({ error: "当番表データを確認してください。" }, 400);
      }

      const valid = images.every(item => {
        const t=item?.table;
        if(t){
          if(!Number.isInteger(t.year)||t.year<2020||t.year>2100||!Number.isInteger(t.month)||t.month<1||t.month>12||!Array.isArray(t.rows)||!t.rows.length||t.rows.length>31||!Array.isArray(t.activityDays))return false;
          if(t.grades&&(!Array.isArray(t.grades)||t.grades.length!==2||new Set(t.grades).size!==2||t.grades.some(g=>![1,2,3].includes(g))))return false;
          const seen=new Set();
          for(const row of t.rows){
            if(!Array.isArray(row)||row.length!==6)return false;
            const d=new Date(Date.UTC(t.year,t.month-1,row[0]));
            if(!Number.isInteger(row[0])||d.getUTCMonth()!==t.month-1||d.getUTCDate()!==row[0]||seen.has(row[0])||row.slice(2).some(n=>typeof n!=='string'||!n.trim()||n.length>60))return false;
            seen.add(row[0]);
            row[1]='日月火水木金土'[d.getUTCDay()];
          }
          if(t.activityDays.some(d=>!seen.has(d)))return false;
        }
        const name = String(item?.name || "");
        const data = String(item?.data || "");
        const src = String(item?.src || "");
        const validData =
          !data ||
          /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(data);
        const validSource = !src;
        return name.length <= 160 && validData && validSource && Boolean(data || src);
      });

      if (!valid) {
        return json({ error: "保存できない画像形式が含まれています。" }, 400);
      }

      const validChanges = changes.every(item => {
        const date = String(item?.date || "");
        const grade = String(item?.grade || "");
        const from = String(item?.from || "").trim();
        const to = String(item?.to || "").trim();
        const createdAt = String(item?.createdAt || "");
        return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
          ["1", "2", "3"].includes(grade) &&
          from.length > 0 && from.length <= 60 &&
          to.length > 0 && to.length <= 60 &&
          createdAt.length <= 60;
      });

      if (!validChanges) {
        return json({ error: "当番変更データを確認してください。" }, 400);
      }

      body.data.changes = changes.map((item, index) => ({
        id: String(item?.id || `change-${index}`).slice(0, 100),
        date: String(item.date),
        grade: String(item.grade),
        from: String(item.from).trim(),
        to: String(item.to).trim(),
        createdAt: String(item?.createdAt || "").slice(0, 60),
      }));

      if (body?.announceLatest === true) {
        body.data.updatedAt = new Date().toISOString();
        body.data.latestUpdateMessage = cleanBoardUpdateMessage(
          body?.updateMessage,
          "当番表を更新しました"
        );
      }
    }

    if (section === "rules" && body?.announceLatest === true) {
      if (!Array.isArray(body.data) || !body.data[0] || typeof body.data[0] !== "object") {
        return json({ error: "チーム規約データを確認してください。" }, 400);
      }
      body.data[0].updatedAt = new Date().toISOString();
      body.data[0].latestUpdateMessage = cleanBoardUpdateMessage(
        body?.updateMessage,
        "チーム規約ファイルを更新しました"
      );
    }

    if (section === "schedule") {
      if (!Array.isArray(body?.data)) {
        return json({ error: "スケジュールデータを確認してください。" }, 400);
      }

      const hasMissingGrades = body.data.some(item => {
        const grades = Array.isArray(item?.grades)
          ? item.grades.map(String).filter(grade => ["1", "2", "3", "other"].includes(grade))
          : [];
        return !grades.length;
      });
      if (hasMissingGrades) {
        return json({ error: "対象学年を選択してください。" }, 400);
      }

      const normalized = normalizeScheduleEntries(body.data);
      body.data = normalized.data;
    }

    const serialized = JSON.stringify(body.data);

    if (serialized.length > 8000000) {
      return json({
        error: "payload too large"
      }, 413);
    }

    await store.setJSON(key, body.data);

    if (section === "duty-roster" && body?.announceLatest === true) {
      await saveBoardLatestUpdate(
        store,
        "duty-roster",
        body.data.latestUpdateMessage,
        body.data.updatedAt
      );
    }

    if (section === "rules" && body?.announceLatest === true) {
      await saveBoardLatestUpdate(
        store,
        "rules",
        body.data[0].latestUpdateMessage,
        body.data[0].updatedAt
      );
    }

    return json({
      ok: true
    });
  } catch (error) {
    console.error(error);

    return json({
      error: "server error"
    }, 500);
  }
};
