import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../board-live-score.js', import.meta.url), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));

// Execute the shipped sync functions and event listeners. Only the DOM,
// transport, timers, and rendering boundary are replaced; no live data is used.
function functionSource(name) {
  const match = source.match(new RegExp(`^  (?:async )?function ${name}\\b[\\s\\S]*?^  \\}`, 'm'));
  assert.ok(match, `shipped function ${name} exists`);
  return match[0];
}

const functions = [
  'score', 'normalizeGame', 'normalize', 'stopClosedEditor', 'applyClosedResult',
  'syncLifecycle', 'markUserInput', 'releaseInputLock', 'claimInputLock',
  'ensureInputForReset', 'leaveInputMode', 'load',
].map(functionSource).join('\n');
const visibilityListener = source.slice(
  source.indexOf("  document.addEventListener('visibilitychange',"),
  source.lastIndexOf('\n})();'),
);
const resetListeners = source.slice(
  source.indexOf('  if (elements.resetBs) {'),
  source.indexOf("  elements.order.addEventListener('click',"),
);

function match({ scored = false } = {}) {
  return {
    active: true, visible: true, sessionId: 'current-match',
    startedAt: '2026-11-01T00:00:00.000Z', expiresAt: '2026-11-01T04:00:00.000Z',
    updatedAt: scored ? '2026-11-01T00:38:00.000Z' : '2026-11-01T00:01:00.000Z',
    hasUserInput: true, endedReason: '', lastGame: null,
    current: {
      tournament: '成田国際空港杯フレッシュマン大会', startTime: scored ? '09:00' : '',
      ground: '野田リトルシニアG', grade: scored ? '1' : '', ourName: '八千代',
      opponent: '野田リトルシニア', battingOrder: 'first',
      selectedScoreCell: { side: 'opponent', index: scored ? 4 : 0, tieBreak: false },
      innings: {
        ours: scored ? [0, 1, 2, 0, 0, '', ''] : Array(7).fill(''),
        opponent: scored ? [1, 0, 1, 0, '', '', ''] : Array(7).fill(''),
      },
      tieBreaks: [], sbo: { strikes: 1, balls: 2, outs: 2 },
      bases: { first: true, second: false, third: false }, completedAt: '',
    },
  };
}

function fixture({ inputMode = false, focused = true, starting = false, remote = match({ scored: true }) } = {}) {
  const calls = [], writes = [], listeners = new Map(), alerts = [];
  const focusedControl = { id: inputMode ? 'score-input' : 'liveScoreLockButton' };
  const idleMessage = { textContent: '' };
  const sandbox = {
    state: match(), remote: copy(remote), inputMode, starting,
    dirty: false, saving: false, saveInFlight: null, replayMode: false, changeVersion: 0,
    userInputPending: false, firstInputNeedsSave: false, lockToken: '',
    selectedScoreCell: null, autoSaveTimer: 0, editorCollapsed: false,
    pollTimer: 1, viewerStats: { count: 0, max: 0 }, remembered: false,
    DRAFT_KEY: 'test-draft',
    document: {
      hidden: false, activeElement: focused ? focusedControl : null,
      addEventListener(type, handler) { listeners.set(type, handler); },
    },
    root: { contains(element) { return element === focusedControl; } },
    localStorage: { removeItem() {} },
    elements: {
      idle: { querySelector() { return idleMessage; } },
      resetBs: { addEventListener(type, handler) { listeners.set(`resetBs:${type}`, handler); } },
      resetStatus: { addEventListener(type, handler) { listeners.set(`resetStatus:${type}`, handler); } },
    },
    async request(method = 'GET', data, extra = {}) {
      calls.push({ method, action: extra.action });
      return { data: copy(sandbox.remote), lockToken: 'claimed-editor-lock', viewers: { count: 2, max: 4 } };
    },
    async save() { writes.push(copy(sandbox.state)); sandbox.dirty = false; return true; },
    rememberedInputMode() { return sandbox.remembered; },
    rememberInputMode(value) { sandbox.remembered = value; },
    rememberedLastGame() { return null; },
    rememberLastGame() {}, rememberDraft() {}, render() {},
    renderSbo() {}, renderBases() {}, updateStatus() {}, scheduleAutoSave() {},
    startLockHeartbeat() {}, stopLockHeartbeat() {}, clearTimeout() {},
    heartbeatViewer() {}, checkDeadline() {},
    alert(message) { alerts.push(message); },
  };
  vm.runInContext(`${functions}\n${resetListeners}\n${visibilityListener}`, vm.createContext(sandbox));
  return { sandbox, calls, writes, listeners, alerts, idleMessage };
}

test('viewer button focus does not freeze the next score refresh', async () => {
  const f = fixture();
  await f.sandbox.load({ silent: true });
  assert.equal(f.calls.filter(call => call.method === 'GET').length, 1);
  assert.deepEqual(copy(f.sandbox.state.current.innings), match({ scored: true }).current.innings);
  assert.equal(f.sandbox.state.current.startTime, '09:00');
  assert.equal(f.sandbox.state.current.grade, '1');
  assert.equal(f.sandbox.selectedScoreCell.index, 4);
  assert.equal(f.sandbox.inputMode, false);
});

test('an editor with a focused input is not overwritten by polling', async () => {
  const f = fixture({ inputMode: true });
  f.sandbox.state.current.innings.ours[0] = 9;
  await f.sandbox.load({ silent: true });
  assert.equal(f.calls.length, 0);
  assert.equal(f.sandbox.state.current.innings.ours[0], 9);
  assert.equal(f.sandbox.inputMode, true);
});

for (const flag of ['dirty', 'saving', 'replayMode', 'starting']) {
  test(`polling still respects ${flag} while protecting local state`, async () => {
    const f = fixture({ focused: false });
    f.sandbox[flag] = true;
    f.sandbox.state.current.innings.ours[0] = 9;
    await f.sandbox.load({ silent: true });
    assert.equal(f.calls.length, 0);
    assert.equal(f.sandbox.state.current.innings.ours[0], 9);
  });
}

test('a read already in flight cannot overwrite input entered while it waited', async () => {
  const f = fixture({ focused: false, inputMode: true });
  let respond;
  f.sandbox.request = () => new Promise(resolve => { respond = resolve; });
  const loading = f.sandbox.load({ silent: true });
  f.sandbox.state.current.innings.ours[0] = 9;
  f.sandbox.dirty = true;
  f.sandbox.changeVersion += 1;
  respond({ data: match({ scored: true }) });
  await loading;
  assert.equal(f.sandbox.state.current.innings.ours[0], 9);
  assert.equal(f.sandbox.dirty, true);
  assert.equal(f.sandbox.inputMode, true);
});

test('fresh input permission adopts the authoritative match before editing', async () => {
  const f = fixture();
  assert.equal(await f.sandbox.claimInputLock(), true);
  assert.deepEqual(copy(f.sandbox.state.current.innings), match({ scored: true }).current.innings);
  assert.equal(f.sandbox.state.current.startTime, '09:00');
  assert.equal(f.sandbox.state.current.grade, '1');
  assert.equal(f.sandbox.selectedScoreCell.index, 4);
  assert.equal(f.sandbox.inputMode, true);
  assert.equal(f.sandbox.lockToken, 'claimed-editor-lock');
  assert.deepEqual(f.alerts, []);
});

test('claiming permission during a new start does not replace the start state', async () => {
  const remote = { ...match(), active: false, visible: false, current: null, endedReason: 'finished' };
  const f = fixture({ starting: true, remote });
  f.sandbox.state.current.opponent = '新しい試合';
  assert.equal(await f.sandbox.claimInputLock(), true);
  assert.equal(f.sandbox.state.current.opponent, '新しい試合');
  assert.equal(f.sandbox.state.active, true);
  assert.equal(f.sandbox.inputMode, true);
});

test('renewing the same editor lock preserves that editor\'s pending changes', async () => {
  const f = fixture({ inputMode: true });
  f.sandbox.lockToken = 'claimed-editor-lock';
  f.sandbox.dirty = true;
  f.sandbox.state.current.innings.ours[0] = 9;
  assert.equal(await f.sandbox.claimInputLock(), true);
  assert.equal(f.sandbox.state.current.innings.ours[0], 9);
  assert.equal(f.sandbox.dirty, true);
});

test('a delayed lock response cannot undo a newer edit already saved by the same editor', async () => {
  const f = fixture({ inputMode: true });
  f.sandbox.lockToken = 'claimed-editor-lock';
  f.sandbox.state.current.innings.ours[0] = 1;
  const oldSnapshot = copy(f.sandbox.state);
  let respond;
  f.sandbox.request = () => new Promise(resolve => { respond = resolve; });
  const claiming = f.sandbox.claimInputLock();
  f.sandbox.state.current.innings.ours[0] = 9;
  f.sandbox.changeVersion += 1;
  // A newer save has completed before this older claim response arrives.
  f.sandbox.dirty = false;
  f.sandbox.saving = false;
  respond({ data: oldSnapshot, lockToken: 'claimed-editor-lock' });
  assert.equal(await claiming, true);
  assert.equal(f.sandbox.state.current.innings.ours[0], 9);
  assert.equal(f.sandbox.inputMode, true);
  assert.equal(f.sandbox.dirty, false);
});

test('a different editor lock discards a stale snapshot before accepting new edits', async () => {
  const f = fixture({ inputMode: true });
  f.sandbox.lockToken = 'expired-old-lock';
  f.sandbox.dirty = true;
  f.sandbox.state.current.innings.ours[0] = 9;
  assert.equal(await f.sandbox.claimInputLock(), true);
  assert.deepEqual(copy(f.sandbox.state.current.innings), match({ scored: true }).current.innings);
  assert.equal(f.sandbox.dirty, false);
});

test('leaving input mode saves pending scores before releasing the editor lock', async () => {
  const f = fixture({ inputMode: true });
  f.sandbox.lockToken = 'claimed-editor-lock';
  f.sandbox.dirty = true;
  f.sandbox.state.current.innings.ours[0] = 6;
  const order = [];
  const save = f.sandbox.save, request = f.sandbox.request;
  f.sandbox.save = async () => {
    assert.equal(f.sandbox.inputMode, true);
    assert.equal(f.sandbox.lockToken, 'claimed-editor-lock');
    order.push('save');
    return save();
  };
  f.sandbox.request = async (method, data, extra) => {
    if (extra?.action === 'releaseEditorLock') order.push('release');
    return request(method, data, extra);
  };
  await f.sandbox.leaveInputMode();
  assert.deepEqual(order, ['save', 'release']);
  assert.equal(f.writes[0].current.innings.ours[0], 6);
  assert.equal(f.sandbox.inputMode, false);
  assert.equal(f.sandbox.lockToken, '');
});

test('a failed final save retains input mode and its lock for retry', async () => {
  const f = fixture({ inputMode: true });
  f.sandbox.lockToken = 'claimed-editor-lock';
  f.sandbox.dirty = true;
  f.sandbox.save = async () => false;
  await f.sandbox.leaveInputMode();
  assert.equal(f.calls.some(call => call.action === 'releaseEditorLock'), false);
  assert.equal(f.sandbox.inputMode, true);
  assert.equal(f.sandbox.lockToken, 'claimed-editor-lock');
  assert.equal(f.sandbox.dirty, true);
});

test('leaving waits for a save in flight and flushes a newer score before release', async () => {
  const f = fixture({ inputMode: true });
  f.sandbox.lockToken = 'claimed-editor-lock';
  f.sandbox.saving = true;
  let finishRequest;
  f.sandbox.saveInFlight = new Promise(resolve => { finishRequest = resolve; });
  const leaving = f.sandbox.leaveInputMode();
  assert.equal(f.calls.some(call => call.action === 'releaseEditorLock'), false);
  f.sandbox.state.current.innings.ours[0] = 8;
  f.sandbox.dirty = true;
  f.sandbox.changeVersion += 1;
  f.sandbox.saving = false;
  f.sandbox.saveInFlight = null;
  finishRequest();
  await leaving;
  assert.equal(f.writes[0].current.innings.ours[0], 8);
  assert.equal(f.calls.some(call => call.action === 'releaseEditorLock'), true);
  assert.equal(f.sandbox.inputMode, false);
});

test('reset from a stale viewer keeps saved innings, outs, runners, and match details', async () => {
  const f = fixture();
  await f.listeners.get('resetBs:click')();
  assert.equal(f.writes.length, 1);
  const saved = f.writes[0].current;
  assert.deepEqual(saved.innings, match({ scored: true }).current.innings);
  assert.equal(saved.startTime, '09:00');
  assert.equal(saved.grade, '1');
  assert.deepEqual(saved.sbo, { strikes: 0, balls: 0, outs: 2 });
  assert.deepEqual(saved.bases, { first: true, second: false, third: false });
});

test('returning to the visible page refreshes a viewer without waiting for the poll timer', async () => {
  const f = fixture();
  const load = f.sandbox.load;
  let refreshing;
  f.sandbox.load = (...args) => { refreshing = load(...args); return refreshing; };
  f.listeners.get('visibilitychange')();
  // Observe completion of the real async load, without waiting for timers.
  assert.ok(refreshing, 'foreground listener starts an immediate refresh');
  await refreshing;
  assert.equal(f.calls.filter(call => call.method === 'GET').length, 1);
  assert.deepEqual(copy(f.sandbox.state.current.innings), match({ scored: true }).current.innings);
});

test('hiding the page does not start a foreground refresh', async () => {
  const f = fixture();
  f.sandbox.document.hidden = true;
  await f.listeners.get('visibilitychange')();
  await Promise.resolve();
  assert.equal(f.calls.length, 0);
});

test('foreground events before authorized initialization do not fetch match data', async () => {
  const f = fixture();
  f.sandbox.pollTimer = 0;
  await f.listeners.get('visibilitychange')();
  await Promise.resolve();
  assert.equal(f.calls.length, 0);
});

test('a focused viewer observes a finished match on the next refresh', async () => {
  const remote = { ...match({ scored: true }), active: false, visible: false, current: null, endedReason: 'finished' };
  const f = fixture({ remote });
  await f.sandbox.load({ silent: true });
  assert.equal(f.calls.filter(call => call.method === 'GET').length, 1);
  assert.equal(f.sandbox.state.active, false);
  assert.equal(f.sandbox.state.current, null);
  assert.equal(f.sandbox.inputMode, false);
});
