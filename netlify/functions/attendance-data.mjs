import { getStore } from "@netlify/blobs";

const STORE = "yachiyo-public-site";
const KEY = "content/attendance.json";
const CONFIG_KEY = "content/attendance-config.json";

// 伝助CSVから2026-09-03に初期移行したデータ。
// Blobs側が空のときだけ一度保存され、その後の回答はサイト側で独立して更新されます。
const MIGRATED_DATA = {"events":[{"id":"event-1","date":"2026-09-05","title":""},{"id":"event-2","date":"2026-09-06","title":""},{"id":"event-3","date":"2026-09-12","title":""},{"id":"event-4","date":"2026-09-13","title":""},{"id":"event-5","date":"2026-09-19","title":""},{"id":"event-6","date":"2026-09-20","title":""},{"id":"event-7","date":"2026-09-21","title":""},{"id":"event-8","date":"2026-09-22","title":""},{"id":"event-9","date":"2026-09-23","title":""},{"id":"event-10","date":"2026-09-26","title":""},{"id":"event-11","date":"2026-09-27","title":""},{"id":"event-12","date":"2026-10-03","title":""},{"id":"event-13","date":"2026-10-04","title":""},{"id":"event-14","date":"2026-10-10","title":""},{"id":"event-15","date":"2026-10-11","title":""},{"id":"event-16","date":"2026-10-12","title":""}],"members":[{"id":"member-1","name":"吉岡父"},{"id":"member-2","name":"杉山父"},{"id":"member-3","name":"山澤父"},{"id":"member-4","name":"山口明父"},{"id":"member-5","name":"南父"},{"id":"member-6","name":"山口勇父"},{"id":"member-7","name":"安本父"},{"id":"member-8","name":"浅野父"},{"id":"member-9","name":"佐藤父"},{"id":"member-10","name":"谷川父"},{"id":"member-11","name":"向山父"},{"id":"member-12","name":"亀井父"},{"id":"member-13","name":"松田惺父"},{"id":"member-14","name":"長島父"},{"id":"member-15","name":"荒木父"},{"id":"member-16","name":"加藤父"},{"id":"member-17","name":"石山父"},{"id":"member-18","name":"大谷部父"},{"id":"member-19","name":"草野父"},{"id":"member-20","name":"古賀父"},{"id":"member-21","name":"齋藤父"},{"id":"member-22","name":"佐藤父"},{"id":"member-23","name":"篠崎父"},{"id":"member-24","name":"竹内父"},{"id":"member-25","name":"永井父"},{"id":"member-26","name":"本村父"},{"id":"member-27","name":"森田父"},{"id":"member-28","name":"矢羽田父"},{"id":"member-29","name":"赤羽父"},{"id":"member-30","name":"秋葉父"},{"id":"member-31","name":"石川晃父"},{"id":"member-32","name":"井上遥父"},{"id":"member-33","name":"井上竜父"},{"id":"member-34","name":"宇山父"},{"id":"member-35","name":"江見父"},{"id":"member-36","name":"加賀原父"},{"id":"member-37","name":"粕谷父"},{"id":"member-38","name":"亀井碧父"},{"id":"member-39","name":"川村父"},{"id":"member-40","name":"小池父"},{"id":"member-41","name":"高祖父"},{"id":"member-42","name":"小堀父"},{"id":"member-43","name":"紺野父"},{"id":"member-44","name":"内藤父"},{"id":"member-45","name":"中濱父"},{"id":"member-46","name":"長峰父"},{"id":"member-47","name":"松井父"},{"id":"member-48","name":"溝上父"},{"id":"member-49","name":"村山父"},{"id":"member-50","name":"本吉父"},{"id":"member-51","name":"山澤奏父"},{"id":"member-52","name":"山本諒父"},{"id":"member-53","name":"山本要父"},{"id":"member-54","name":"吉岡母"},{"id":"member-55","name":"杉山母"},{"id":"member-56","name":"山澤母"},{"id":"member-57","name":"舘母"},{"id":"member-58","name":"山口明母"},{"id":"member-59","name":"南母"},{"id":"member-60","name":"山口勇母"},{"id":"member-61","name":"安本母"},{"id":"member-62","name":"谷川母"},{"id":"member-63","name":"亀井母"},{"id":"member-64","name":"向山母"},{"id":"member-65","name":"浅野母"},{"id":"member-66","name":"松田母"},{"id":"member-67","name":"長島母"},{"id":"member-68","name":"荒木母"},{"id":"member-69","name":"石川母"},{"id":"member-70","name":"石山母"},{"id":"member-71","name":"大谷部母"},{"id":"member-72","name":"加藤母"},{"id":"member-73","name":"草野母"},{"id":"member-74","name":"古賀母"},{"id":"member-75","name":"齋藤母"},{"id":"member-76","name":"佐藤母"},{"id":"member-77","name":"篠崎母"},{"id":"member-78","name":"椙浦母"},{"id":"member-79","name":"高橋母"},{"id":"member-80","name":"竹内母"},{"id":"member-81","name":"筒井母"},{"id":"member-82","name":"永井母"},{"id":"member-83","name":"藤澤母"},{"id":"member-84","name":"本村母"},{"id":"member-85","name":"森田母"},{"id":"member-86","name":"矢羽田母"},{"id":"member-87","name":"赤羽母"},{"id":"member-88","name":"秋葉母"},{"id":"member-89","name":"石川晃母"},{"id":"member-90","name":"井上遥母"},{"id":"member-91","name":"井上竜母"},{"id":"member-92","name":"宇山母"},{"id":"member-93","name":"江見母"},{"id":"member-94","name":"加賀原母"},{"id":"member-95","name":"粕谷母"},{"id":"member-96","name":"亀井碧母"},{"id":"member-97","name":"川村母"},{"id":"member-98","name":"小池母"},{"id":"member-99","name":"高祖母"},{"id":"member-100","name":"小堀母"},{"id":"member-101","name":"紺野母"},{"id":"member-102","name":"内藤母"},{"id":"member-103","name":"中濱母"},{"id":"member-104","name":"長峰母"},{"id":"member-105","name":"松井母"},{"id":"member-106","name":"松浦母"},{"id":"member-107","name":"溝上母"},{"id":"member-108","name":"村山母"},{"id":"member-109","name":"本吉母"},{"id":"member-110","name":"山澤奏母"},{"id":"member-111","name":"山本要母"},{"id":"member-112","name":"山本諒母"}],"answers":{"member-2":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×","event-7":"×","event-8":"×","event-9":"×","event-10":"×","event-11":"×"},"member-3":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×"},"member-4":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×","event-7":"×","event-8":"×","event-9":"×","event-10":"×","event-11":"×"},"member-15":{"event-1":"×","event-2":"×","event-3":"×","event-4":"△","event-5":"×","event-6":"△","event-7":"×","event-8":"×","event-9":"×","event-10":"×","event-11":"△"},"member-16":{"event-1":"×","event-2":"×"},"member-24":{"event-1":"×","event-2":"×","event-3":"×"},"member-28":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×","event-7":"×","event-8":"×","event-9":"×","event-10":"×","event-11":"×"},"member-29":{"event-1":"○","event-2":"○"},"member-30":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×","event-7":"×","event-8":"×","event-9":"×","event-10":"×","event-11":"×","event-12":"×","event-13":"×","event-14":"×","event-15":"×","event-16":"×"},"member-31":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×","event-7":"×","event-8":"×"},"member-35":{"event-1":"×","event-2":"×"},"member-39":{"event-1":"×","event-2":"○","event-3":"×"},"member-40":{"event-1":"×","event-2":"×"},"member-42":{"event-1":"○","event-2":"×"},"member-44":{"event-1":"×","event-2":"○"},"member-46":{"event-1":"×","event-2":"×","event-3":"×"},"member-49":{"event-1":"×","event-2":"×"},"member-50":{"event-1":"×","event-2":"×"},"member-51":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×"},"member-52":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×","event-7":"×","event-8":"×","event-9":"×","event-10":"×","event-11":"×","event-12":"×","event-13":"×","event-14":"×","event-15":"×","event-16":"×"},"member-56":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×"},"member-68":{"event-1":"×","event-2":"×","event-3":"×","event-4":"○","event-5":"×","event-6":"○"},"member-71":{"event-1":"×","event-2":"×"},"member-74":{"event-1":"×","event-2":"×","event-4":"○","event-7":"○"},"member-77":{"event-1":"△","event-2":"○","event-3":"△","event-4":"△","event-5":"△","event-6":"△","event-7":"△","event-8":"△","event-9":"△","event-10":"△","event-11":"○"},"member-79":{"event-1":"×","event-2":"×","event-3":"○"},"member-80":{"event-1":"△","event-2":"△","event-3":"×"},"member-85":{"event-1":"×","event-2":"×"},"member-87":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×"},"member-97":{"event-1":"×","event-2":"×","event-3":"×"},"member-98":{"event-1":"×","event-2":"×"},"member-99":{"event-1":"×","event-2":"○","event-9":"○"},"member-100":{"event-1":"×","event-2":"×"},"member-102":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×"},"member-105":{"event-1":"○","event-2":"○","event-3":"×"},"member-106":{"event-1":"×","event-2":"×","event-3":"×","event-4":"×","event-5":"×","event-6":"×","event-7":"×","event-8":"△","event-9":"△","event-10":"×","event-11":"×"},"member-109":{"event-1":"×","event-2":"○"},"member-110":{"event-1":"△","event-2":"△","event-3":"△","event-4":"△"},"member-112":{"event-1":"×","event-2":"△","event-3":"○"},"member-17":{"event-2":"○"},"member-18":{"event-2":"○","event-3":"○"},"member-20":{"event-2":"×"},"member-21":{"event-2":"×"},"member-25":{"event-2":"×"},"member-26":{"event-2":"×"},"member-32":{"event-2":"×"},"member-33":{"event-2":"○","event-5":"×"},"member-34":{"event-2":"○"},"member-36":{"event-2":"×"},"member-37":{"event-2":"○"},"member-47":{"event-2":"○","event-3":"○"},"member-48":{"event-2":"×"},"member-53":{"event-2":"○","event-6":"×"},"member-69":{"event-2":"○"},"member-70":{"event-2":"○","event-3":"○","event-8":"○"},"member-72":{"event-2":"○"},"member-75":{"event-2":"○"},"member-78":{"event-2":"○","event-3":"○"},"member-82":{"event-2":"○"},"member-83":{"event-2":"×","event-3":"○","event-5":"○"},"member-84":{"event-2":"×","event-3":"○"},"member-88":{"event-2":"○"},"member-89":{"event-2":"○"},"member-90":{"event-2":"×"},"member-91":{"event-2":"×"},"member-92":{"event-2":"×"},"member-95":{"event-2":"○","event-3":"○"},"member-96":{"event-2":"○"},"member-107":{"event-2":"×"},"member-108":{"event-2":"×"},"member-111":{"event-2":"○"},"member-86":{"event-7":"○","event-8":"○","event-9":"○"}}};

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
    answers: data.answers && typeof data.answers === "object" ? data.answers : {},
  };
}

async function getConfig(store) {
  try {
    const saved = await store.get(CONFIG_KEY, { type: "json" });
    return { densukeVisible: saved?.densukeVisible !== false };
  } catch {
    return { densukeVisible: true };
  }
}

function adminOK(request) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const received = request.headers.get("x-admin-password") || "";
  return Boolean(expected && received === expected);
}

export default async request => {
  const store = getStore({ name: STORE, consistency: "strong" });
  const url = new URL(request.url);

  try {
    if (request.method === "GET") {
      if (url.searchParams.get("config") === "1") {
        return json({ config: await getConfig(store) });
      }

      let saved = null;
      try {
        saved = await store.get(KEY, { type: "json" });
      } catch {
        saved = null;
      }

      let data = normalize(saved || {});

      if (!data.events.length || !data.members.length) {
        data = normalize(structuredClone(MIGRATED_DATA));
        await store.setJSON(KEY, data);
      }

      return json({ data });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const action = body.action || "";

    if (action === "adminPing") {
      if (!adminOK(request)) return json({ error: "Unauthorized" }, 401);
      return json({ ok: true });
    }

    if (action === "setConfig") {
      if (!adminOK(request)) return json({ error: "Unauthorized" }, 401);

      const config = {
        densukeVisible: body.config?.densukeVisible !== false,
      };

      await store.setJSON(CONFIG_KEY, config);
      return json({ ok: true, config });
    }

    if (action === "adminSave") {
      if (!adminOK(request)) return json({ error: "Unauthorized" }, 401);

      const data = normalize(body.data || {});
      await store.setJSON(KEY, data);
      return json({ ok: true, data });
    }

    if (action === "answer") {
      const eventId = String(body.eventId || "");
      const memberId = String(body.memberId || "");
      const status = String(body.status || "");

      if (!eventId || !memberId) {
        return json({ error: "Missing id" }, 400);
      }

      if (status && !["○", "△", "×"].includes(status)) {
        return json({ error: "Invalid status" }, 400);
      }

      let current = {};
      try {
        current = (await store.get(KEY, { type: "json" })) || {};
      } catch {
        current = {};
      }

      let data = normalize(current);

      // 初回回答がGETより先に来た場合でも、移行データを失わない。
      if (!data.events.length || !data.members.length) {
        data = normalize(structuredClone(MIGRATED_DATA));
      }

      if (!data.answers[memberId]) data.answers[memberId] = {};

      if (status) {
        data.answers[memberId][eventId] = status;
      } else {
        delete data.answers[memberId][eventId];
      }

      await store.setJSON(KEY, data);
      return json({ ok: true, data });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("attendance-data error:", error);
    return json({ error: "Server error" }, 500);
  }
};
