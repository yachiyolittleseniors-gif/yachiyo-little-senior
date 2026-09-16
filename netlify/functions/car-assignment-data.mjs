import { getStore } from "@netlify/blobs";
import { adminAuthError, verifyAdminPassword } from "./admin-rate-limit.mjs";

const STORE = "yachiyo-public-site";
const KEY = "content/car-assignments.json";

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
    busCount: Math.max(0, Math.min(1, Number(value.busCount) || 0)),
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
    const adminAuth = await verifyAdminPassword({
      store,
      request,
      context,
      expectedPassword: process.env.ADMIN_PASSWORD || "",
    });
    if (!adminAuth.ok) return adminAuthError(json, adminAuth);
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
