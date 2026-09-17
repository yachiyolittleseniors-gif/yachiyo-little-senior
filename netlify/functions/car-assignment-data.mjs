import { getStore } from "@netlify/blobs";

const STORE = "yachiyo-public-site";
const KEY = "content/car-assignments.json";
const ACCESS_CONFIG_KEY = "content/access-settings.json";
const COACH_KEY = "content/coach-attendance.json";
const COACH_MEMBER_STATE_PREFIX = "coach-attendance/member-state/";
const DEFAULT_ACCESS_SALT = "yachiyo-access-v1";
const DEFAULT_ACCESS_HASH =
  "19eb403934ae615b2961d9f6b5ddd86aab32a0fdf4e96adeb8aa2fcb351276ba";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

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

async function accessOK(store, request) {
  const entered = String(request.headers.get("x-access-password") || "");
  if (!entered || entered.length > 128) return false;
  const saved = await store.get(ACCESS_CONFIG_KEY, {
    type: "json",
    consistency: "strong",
  });
  const salt = saved?.salt || DEFAULT_ACCESS_SALT;
  const expectedHash = saved?.hash || DEFAULT_ACCESS_HASH;
  return safeEqual(await hashAccessPassword(entered, salt), expectedHash);
}

function cleanText(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function isScorer(member) {
  const role = String(member?.role || "").trim();
  const compactName = String(member?.name || "").replace(/[\s　]+/g, "");
  return role === "スコアラー" || compactName.startsWith("松野");
}

function isManager(member) {
  return String(member?.role || "").trim() === "監督";
}

function countsAsCoach(member) {
  return !isScorer(member) && !isManager(member);
}

async function loadCoachAttendanceCounts(store) {
  let data = {};
  try {
    data = (await store.get(COACH_KEY, { type: "json", consistency: "strong" })) || {};
  } catch {
    data = {};
  }
  const members = Array.isArray(data.members) ? data.members : [];
  const events = Array.isArray(data.events) ? data.events : [];
  const answers = data.answers && typeof data.answers === "object" ? structuredClone(data.answers) : {};
  await Promise.all(members.map(async member => {
    const id = String(member?.id || "");
    if (!id) return;
    try {
      const state = await store.get(`${COACH_MEMBER_STATE_PREFIX}${encodeURIComponent(id)}.json`, { type: "json", consistency: "strong" });
      if (state?.answers && typeof state.answers === "object") answers[id] = state.answers;
    } catch {}
  }));
  const validEvents = events.filter(event => /^\d{4}-\d{2}-\d{2}$/.test(String(event?.date || "")));
  const attendanceCount = (event, predicate) => members.filter(member => predicate(member) && answers?.[String(member?.id || "")]?.[String(event?.id || "")] === "○").length;
  return {
    managers: Object.fromEntries(validEvents.map(event => [String(event.date), attendanceCount(event, isManager)])),
    coaches: Object.fromEntries(validEvents.map(event => [String(event.date), attendanceCount(event, countsAsCoach)])),
    scorers: Object.fromEntries(validEvents.map(event => [String(event.date), attendanceCount(event, isScorer)])),
  };
}

function normalizeCar(car = {}, index = 0) {
  const allowedTypes = new Set(["coach", "player", "equipment", "cargo", "support", "umpire"]);
  return {
    id: cleanText(car.id, 80) || `car_${index + 1}`,
    type: allowedTypes.has(car.type) ? car.type : "player",
    driver: cleanText(car.driver, 60),
    vehicle: cleanText(car.vehicle, 60),
    capacity: Math.max(1, Math.min(60, Number(car.capacity) || 1)),
    navigator: cleanText(car.navigator, 60),
    players: Math.max(0, Math.min(60, Number(car.players) || 0)),
    parents: Array.isArray(car.parents) ? car.parents.map(item => cleanText(item, 60)).filter(Boolean).slice(0, 30) : [],
    coaches: Array.isArray(car.coaches) ? car.coaches.map(item => cleanText(item, 60)).filter(Boolean).slice(0, 20) : [],
    manual: car.manual === true,
  };
}

function normalizeAssignment(value = {}) {
  const grade = ["1", "2", "3"].includes(String(value.grade)) ? String(value.grade) : "2";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value.date || "")) ? String(value.date) : "";
  const allowedGameTypes = new Set(["official", "practice", "opening", "closing"]);
  return {
    date,
    grade,
    gameType: allowedGameTypes.has(value.gameType) ? value.gameType : "",
    route: ["local", "highway"].includes(value.route) ? value.route : "",
    opponent: cleanText(value.opponent, 100),
    venue: cleanText(value.venue, 180),
    firstGradeEscort: Math.max(0, Math.min(60, Number(value.firstGradeEscort) || 0)),
    manualEscortFathers: Array.isArray(value.manualEscortFathers)
      ? [...new Set(value.manualEscortFathers.map(item => cleanText(item, 60)).filter(Boolean))].slice(0, 30)
      : [],
    bus: typeof value.bus === "boolean" ? value.bus : null,
    busCount: Math.max(0, Math.min(10, Number(value.busCount) || 0)),
    busPassengers: Math.max(0, Math.min(100, Number(value.busPassengers) || 0)),
    umpireCar: typeof value.umpireCar === "boolean" ? value.umpireCar : null,
    umpireCarCount: Math.max(0, Math.min(1, Number(value.umpireCarCount) || 0)),
    coachCar: typeof value.coachCar === "boolean" ? value.coachCar : null,
    coachCarCount: Math.max(0, Math.min(1, Number(value.coachCarCount) || 0)),
    coachDriver: String(value.coachDriver || "").trim().slice(0, 80),
    coachVehicle: String(value.coachVehicle || "").trim().slice(0, 80),
    coachManager: value.coachManager === true,
    coachManagerDriver: value.coachManagerDriver === true,
    coachCount: Math.max(0, Math.min(5, Number(value.coachCount) || 0)),
    scorerName: cleanText(value.scorerName, 60),
    playerCount: value.playerCount == null ? null : Math.max(0, Math.min(100, Number(value.playerCount) || 0)),
    playerCarCount: Math.max(0, Math.min(40, Number(value.playerCarCount) || 0)),
    equipmentCount: value.equipmentCount == null ? null : Math.max(0, Math.min(1, Number(value.equipmentCount) || 0)),
    cargoCount: value.cargoCount == null ? null : Math.max(0, Math.min(1, Number(value.cargoCount) || 0)),
    supportCar: typeof value.supportCar === "boolean" ? value.supportCar : null,
    supportCarCount: Math.max(0, Math.min(40, Number(value.supportCarCount) || 0)),
    carCount: value.carCount == null ? null : Math.max(0, Math.min(40, Number(value.carCount) || 0)),
    cars: Array.isArray(value.cars) ? value.cars.slice(0, 40).map(normalizeCar) : [],
    updatedAt: new Date().toISOString(),
  };
}

export default async (request, context) => {
  const store = getStore({ name: STORE, consistency: "strong" });
  try {
    if (!(await accessOK(store, request))) {
      return json({ error: "Unauthorized" }, 401);
    }
    let assignments = {};
    try {
      assignments = (await store.get(KEY, { type: "json", consistency: "strong" })) || {};
    } catch {
      assignments = {};
    }
    if (request.method === "GET") {
      const attendance = await loadCoachAttendanceCounts(store);
      return json({ assignments, managerAttendanceCounts: attendance.managers, coachAttendanceCounts: attendance.coaches, scorerAttendanceCounts: attendance.scorers });
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    let body = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (body.action === "delete") {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? String(body.date) : "";
      const grade = ["1", "2", "3"].includes(String(body.grade)) ? String(body.grade) : "";
      if (!date || !grade) return json({ error: "削除する日付と学年を選択してください。" }, 400);
      delete assignments[`${date}_${grade}`];
      await store.setJSON(KEY, assignments);
      return json({ ok: true, assignments });
    }
    if (body.action !== "save") return json({ error: "Unknown action" }, 400);
    const assignment = normalizeAssignment(body.assignment);
    if (!assignment.date) return json({ error: "日付を選択してください。" }, 400);
    const assignmentKey = `${assignment.date}_${assignment.grade}`;
    assignments[assignmentKey] = assignment;
    const entries = Object.entries(assignments)
      .sort((a, b) => String(b[1]?.updatedAt || "").localeCompare(String(a[1]?.updatedAt || "")))
      .slice(0, 80);
    assignments = Object.fromEntries(entries);
    await store.setJSON(KEY, assignments);
    return json({ ok: true, assignment, assignments });
  } catch (error) {
    console.error("car-assignment-data error:", error);
    return json({ error: "Server error" }, 500);
  }
};
