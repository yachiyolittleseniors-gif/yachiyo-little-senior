import { randomUUID } from "node:crypto";

export const LIVE_SCORE_EMPTY_TIMEOUT_MS = 3 * 60 * 1000;
export const LIVE_SCORE_DURATION_MS = 4 * 60 * 60 * 1000;
export const LIVE_SCORE_EXTENSION_WINDOW_MS = 30 * 60 * 1000;
export const LIVE_SCORE_EXTENSION_MS = 60 * 60 * 1000;

const MAX_WRITE_ATTEMPTS = 5;
const timeValue = value => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const iso = value => new Date(value).toISOString();

// Initial values and the selected score cell are not evidence of user input.
// In particular, entering 0 into an empty inning is input even in a 0-0 game.
export function hasLiveScoreInput(game) {
  if (!game || typeof game !== "object") return false;
  if (["tournament", "startTime", "ground", "grade", "opponent"]
    .some(key => String(game[key] || "").trim())) return true;
  if (String(game.ourName || "八千代").trim() !== "八千代") return true;
  if (game.battingOrder === "first") return true;
  if (["ours", "opponent"].some(side => (game.innings?.[side] || [])
    .some(value => value !== "" && value !== null && value !== undefined))) return true;
  if (Array.isArray(game.tieBreaks) && game.tieBreaks.length) return true;
  if (["strikes", "balls", "outs"].some(key => Number(game.sbo?.[key] || 0) !== 0)) return true;
  return ["first", "second", "third"].some(key => Boolean(game.bases?.[key]));
}

function editableGame(game) {
  if (!game) return null;
  const { selectedScoreCell: _selected, completedAt: _completed, ...editable } = game;
  return editable;
}

function prepareState(raw, normalizeGame, now, createId) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const current = normalizeGame(source.current);
  const active = Boolean(source.active && current);
  let sessionId = String(source.sessionId || "").slice(0, 100);
  let started = timeValue(source.startedAt);
  let expires = timeValue(source.expiresAt);
  let hasUserInput = source.hasUserInput === true;
  if (active) {
    // Adopt an already-running pre-upgrade game once. Its last saved time is
    // the best available start anchor; reading it must never refresh its TTL.
    if (!sessionId) sessionId = createId();
    if (started === null) started = Math.min(timeValue(source.updatedAt) ?? now, now);
    if (expires === null || expires < started) expires = started + LIVE_SCORE_DURATION_MS;
    hasUserInput ||= hasLiveScoreInput(current);
  }
  return {
    active,
    visible: active,
    current: active ? current : null,
    lastGame: normalizeGame(source.lastGame),
    updatedAt: String(source.updatedAt || ""),
    sessionId,
    startedAt: started !== null ? iso(started) : "",
    expiresAt: expires !== null ? iso(expires) : "",
    hasUserInput,
    endedReason: active ? "" : String(source.endedReason || ""),
  };
}

function expireState(state, now) {
  if (!state.active) return state;
  const emptyDeadline = timeValue(state.startedAt) + LIVE_SCORE_EMPTY_TIMEOUT_MS;
  const emptyExpired = !state.hasUserInput && now >= emptyDeadline;
  const timeExpired = now >= timeValue(state.expiresAt);
  if (!emptyExpired && !timeExpired) return state;
  return {
    ...state,
    active: false,
    visible: false,
    current: null,
    // An accidental empty start must not replace the last real match.
    lastGame: emptyExpired ? state.lastGame : {
      ...state.current,
      completedAt: iso(timeValue(state.expiresAt)),
    },
    updatedAt: iso(now),
    endedReason: emptyExpired ? "empty-timeout" : "time-limit",
  };
}

function rejected(state, code, error, status = 409) {
  return { state, response: { ok: false, code, error, status } };
}

function applyAction(state, { action, data, sessionId, userInput }, normalizeGame, now, createId) {
  if (action === "read") return { state, response: { ok: true } };
  if (action === "startLiveScore") {
    if (state.active) return rejected(state, "already-active", "試合速報はすでに開始されています。現在の速報を確認してください。");
    const current = normalizeGame(data?.current);
    if (!current) return rejected(state, "invalid-game", "試合速報の内容を確認してください。", 400);
    return {
      state: {
        active: true,
        visible: true,
        current: { ...current, completedAt: "" },
        lastGame: state.lastGame,
        updatedAt: iso(now),
        sessionId: createId(),
        startedAt: iso(now),
        expiresAt: iso(now + LIVE_SCORE_DURATION_MS),
        hasUserInput: userInput === true || hasLiveScoreInput(current),
        endedReason: "",
      },
      response: { ok: true, started: true },
    };
  }

  const requestedSession = String(sessionId || data?.sessionId || "");
  if (!requestedSession) return rejected(state, "refresh-required", "試合速報を更新しました。ページを再読み込みしてから操作してください。");
  if (!state.active || state.sessionId !== requestedSession) {
    return rejected(state, "session-ended", "この試合の速報は終了しています。現在の速報を確認してください。");
  }
  if (action === "extendLiveScore") {
    const expires = timeValue(state.expiresAt);
    if (now < expires - LIVE_SCORE_EXTENSION_WINDOW_MS) {
      return rejected(state, "extension-too-early", "自動終了の30分前から延長できます。");
    }
    return {
      state: { ...state, expiresAt: iso(expires + LIVE_SCORE_EXTENSION_MS), updatedAt: iso(now) },
      response: { ok: true, extended: true },
    };
  }
  if (action !== "saveLiveScore") return rejected(state, "invalid-action", "不正な試合速報操作です。", 400);
  if (data?.active === false) {
    const completed = normalizeGame(data.lastGame) || state.current;
    return {
      state: {
        ...state,
        active: false,
        visible: false,
        current: null,
        lastGame: { ...completed, completedAt: iso(now) },
        updatedAt: iso(now),
        endedReason: "finished",
      },
      response: { ok: true, ended: true },
    };
  }
  const current = normalizeGame(data?.current);
  if (!current) return rejected(state, "invalid-game", "試合速報の内容を確認してください。", 400);
  const changedInput = JSON.stringify(editableGame(current)) !== JSON.stringify(editableGame(state.current));
  return {
    state: {
      ...state,
      current: { ...current, completedAt: "" },
      updatedAt: iso(now),
      hasUserInput: state.hasUserInput || userInput === true || changedInput,
    },
    response: { ok: true },
  };
}

// Read/check/write the same blob with an ETag condition. If an input save wins
// while a viewer is closing an empty game, the expiry check is rerun against
// the new state instead of overwriting the input with an old empty snapshot.
export async function updateLiveScoreLifecycle(store, key, {
  action = "read",
  data = null,
  sessionId = "",
  userInput = false,
  normalizeGame = value => value && typeof value === "object" ? value : null,
  now = Date.now,
  createId = randomUUID,
} = {}) {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const snapshot = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
    const currentTime = now();
    const prepared = prepareState(snapshot?.data, normalizeGame, currentTime, createId);
    const unexpired = expireState(prepared, currentTime);
    const { state, response } = applyAction(unexpired, { action, data, sessionId, userInput }, normalizeGame, currentTime, createId);
    const needsWrite = snapshot
      ? JSON.stringify(snapshot.data) !== JSON.stringify(state)
      : action === "startLiveScore" && response.ok;
    if (needsWrite) {
      if (snapshot && !snapshot.etag) throw new Error("試合速報の保存状態を確認できませんでした。もう一度お試しください。");
      const result = await store.setJSON(key, state, snapshot
        ? { onlyIfMatch: snapshot.etag }
        : { onlyIfNew: true });
      if (result?.modified === false) continue;
      // Conditional writes in some SDK releases can report modified:true for
      // a failed request. A successful provider write always returns an ETag.
      if (result?.modified !== true || !result.etag) {
        throw new Error("試合速報を保存できませんでした。もう一度お試しください。");
      }
    }
    return {
      ...response,
      data: state,
      serverNow: currentTime,
      ...(prepared.active && !unexpired.active ? { ended: true } : {}),
    };
  }
  // Return persisted data on exhaustion, never the speculative state whose
  // conditional write was rejected (especially a speculative new session).
  const latest = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
  return {
    ok: false,
    status: 409,
    code: "write-conflict",
    error: "試合速報の更新が重なりました。もう一度お試しください。",
    data: latest?.data ?? null,
    serverNow: now(),
  };
}
