import { getStore } from "@netlify/blobs";

const STORE = "yachiyo-public-site";
const KEY = "content/car-assignments.json";
const ACCESS_CONFIG_KEY = "content/access-settings.json";
const DEFAULT_ACCESS_SALT = "yachiyo-access-v1";
const DEFAULT_ACCESS_HASH = "19eb403934ae615b2961d9f6b5ddd86aab32a0fdf4e96adeb8aa2fcb351276ba";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
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
  };
}

function normalizeAssignment(value = {}) {
  const grade = ["1", "2", "3", "all"].includes(String(value.grade)) ? String(value.grade) : "all";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value.date || "")) ? String(value.date) : "";
  return {
    date,
    grade,
    gameType: value.gameType === "practice" ? "practice" : "official",
    route: value.route === "highway" ? "highway" : "local",
    opponent: cleanText(value.opponent, 100),
    venue: cleanText(value.venue, 180),
    firstGradeEscort: Math.max(0, Math.min(60, Number(value.firstGradeEscort) || 0)),
    bus: value.bus === true,
    busPassengers: Math.max(0, Math.min(100, Number(value.busPassengers) || 0)),
    umpireCar: value.umpireCar === true,
    carCount: Math.max(0, Math.min(40, Number(value.carCount) || 0)),
    cars: Array.isArray(value.cars) ? value.cars.slice(0, 40).map(normalizeCar) : [],
    updatedAt: new Date().toISOString(),
  };
}

export default async request => {
  const store = getStore({ name: STORE, consistency: "strong" });
  try {
    if (!(await accessOK(store, request))) return json({ error: "Unauthorized" }, 401);
    let assignments = {};
    try {
      assignments = (await store.get(KEY, { type: "json", consistency: "strong" })) || {};
    } catch {
      assignments = {};
    }
    if (request.method === "GET") return json({ assignments });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    let body = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
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
