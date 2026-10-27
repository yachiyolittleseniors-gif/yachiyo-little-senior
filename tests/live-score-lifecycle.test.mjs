import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVE_SCORE_EMPTY_TIMEOUT_MS,
  LIVE_SCORE_DURATION_MS,
  LIVE_SCORE_EXTENSION_WINDOW_MS,
  LIVE_SCORE_EXTENSION_MS,
  hasLiveScoreInput,
  updateLiveScoreLifecycle,
} from '../netlify/functions/_live-score-lifecycle.mjs';

const KEY = 'content/live-score.json';
const START = Date.parse('2026-10-27T00:00:00.000Z');
const copy = value => structuredClone(value);
const iso = milliseconds => new Date(milliseconds).toISOString();
const normalizeGame = game => game && typeof game === 'object' && !Array.isArray(game) ? copy(game) : null;

function blankGame() {
  return {
    tournament: '', startTime: '', ground: '', grade: '', ourName: '八千代',
    opponent: '', battingOrder: 'second', selectedScoreCell: null,
    innings: { ours: Array(7).fill(''), opponent: Array(7).fill('') },
    tieBreaks: [], sbo: { strikes: 0, balls: 0, outs: 0 },
    bases: { first: false, second: false, third: false }, completedAt: '',
  };
}

function fixture(initialData = null) {
  const state = { data: copy(initialData), now: START, revision: initialData ? 1 : 0, writes: [], reads: 0, beforeWrite: null };
  let nextId = 0;
  const etag = () => state.data === null ? null : `"revision-${state.revision}"`;
  const replace = data => { state.data = copy(data); state.revision += 1; };
  const store = {
    async getWithMetadata(key, options) {
      assert.equal(key, KEY);
      assert.deepEqual(options, { type: 'json', consistency: 'strong' });
      state.reads += 1;
      return state.data === null ? null : { data: copy(state.data), etag: etag() };
    },
    async setJSON(key, value, options = {}) {
      assert.equal(key, KEY);
      assert.ok(options.onlyIfMatch || options.onlyIfNew, 'live-score writes must use an ETag or an absence condition');
      state.writes.push({ data: copy(value), options: copy(options) });
      if (state.beforeWrite) await state.beforeWrite(value, options);
      if ((options.onlyIfNew && state.data !== null) || (options.onlyIfMatch && options.onlyIfMatch !== etag())) {
        return { modified: false, etag: etag() };
      }
      replace(value);
      return { modified: true, etag: etag() };
    },
  };
  const run = (action = 'read', overrides = {}) => updateLiveScoreLifecycle(store, KEY, {
    action, normalizeGame, now: () => state.now, createId: () => `match-${++nextId}`,
    sessionId: state.data?.sessionId || '', ...overrides,
  });
  const start = (game = blankGame()) => run('startLiveScore', { data: { active: true, visible: true, current: game } });
  const save = (game, extras = {}) => run('saveLiveScore', { data: { ...copy(state.data), current: game }, ...extras });
  return { state, store, replace, run, start, save };
}

test('timeouts are three minutes, four hours, and an explicit one-hour extension', () => {
  assert.equal(LIVE_SCORE_EMPTY_TIMEOUT_MS, 3 * 60 * 1000);
  assert.equal(LIVE_SCORE_DURATION_MS, 4 * 60 * 60 * 1000);
  assert.equal(LIVE_SCORE_EXTENSION_WINDOW_MS, 30 * 60 * 1000);
  assert.equal(LIVE_SCORE_EXTENSION_MS, 60 * 60 * 1000);
});

test('reading an unused scoreboard does not create a match or write a record', async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.ok, true);
  assert.equal(Boolean(result.data?.active), false);
  assert.equal(f.state.writes.length, 0);
});

test('a new match gets its own server-controlled start and four-hour deadline', async () => {
  const f = fixture();
  const result = await f.start();
  assert.equal(result.ok, true);
  assert.equal(result.data.active, true);
  assert.equal(result.data.visible, true);
  assert.ok(result.data.sessionId);
  assert.equal(result.data.startedAt, iso(START));
  assert.equal(result.data.expiresAt, iso(START + LIVE_SCORE_DURATION_MS));
  assert.equal(result.data.hasUserInput, false);
});

test('an untouched match stays open before three minutes and closes exactly at the deadline', async () => {
  const f = fixture();
  await f.start();
  f.state.now = START + LIVE_SCORE_EMPTY_TIMEOUT_MS - 1;
  assert.equal((await f.run()).data.active, true);
  f.state.now += 1;
  const result = await f.run();
  assert.equal(result.data.active, false);
  assert.equal(result.data.visible, false);
  assert.equal(result.data.current, null);
  assert.equal(result.data.endedReason, 'empty-timeout');
});

const inputChanges = [
  ['試合時間', game => { game.startTime = '09:30'; }],
  ['対戦相手', game => { game.opponent = '対戦相手シニア'; }],
  ['大会名', game => { game.tournament = '練習試合'; }],
  ['会場', game => { game.ground = '東邦G'; }],
  ['学年', game => { game.grade = '2'; }],
  ['チーム名', game => { game.ourName = '八千代島田台'; }],
  ['先攻後攻', game => { game.battingOrder = 'first'; }],
  ['0点の入力', game => { game.innings.ours[0] = 0; }],
  ['BSO', game => { game.sbo.balls = 1; }],
  ['走者', game => { game.bases.first = true; }],
  ['タイブレーク', game => { game.tieBreaks.push({ inning: 8, ours: '', opponent: '' }); }],
];

for (const [label, change] of inputChanges) {
  test(`${label}を入力すれば無得点でも3分の自動終了を解除する`, async () => {
    const f = fixture();
    await f.start();
    const game = copy(f.state.data.current);
    change(game);
    assert.equal(hasLiveScoreInput(game), true);
    f.state.now = START + LIVE_SCORE_EMPTY_TIMEOUT_MS - 1;
    const saved = await f.save(game, { userInput: true });
    assert.equal(saved.ok, true);
    assert.equal(saved.data.hasUserInput, true);
    f.state.now = START + LIVE_SCORE_EMPTY_TIMEOUT_MS;
    const reloaded = await f.run();
    assert.equal(reloaded.data.active, true);
    assert.deepEqual(reloaded.data.current, game);
  });
}

test('an actual game change from an older client also records input', async () => {
  const f = fixture();
  await f.start();
  const game = copy(f.state.data.current);
  game.opponent = '相手チーム';
  const result = await f.save(game, { userInput: false });
  assert.equal(result.ok, true);
  assert.equal(result.data.hasUserInput, true);
});

test('input remains remembered even after the value is cleared and another client reloads', async () => {
  const f = fixture();
  await f.start();
  const typed = copy(f.state.data.current);
  typed.opponent = '一時入力';
  await f.save(typed, { userInput: true });
  await f.save(blankGame(), { userInput: false });
  f.state.now = START + 10 * 60 * 1000;
  const reloaded = await updateLiveScoreLifecycle(f.store, KEY, { normalizeGame, now: () => f.state.now });
  assert.equal(reloaded.data.hasUserInput, true);
  assert.equal(reloaded.data.active, true);
  assert.equal(reloaded.data.current.opponent, '');
  assert.equal(reloaded.data.startedAt, iso(START));
});

test('typing then clearing before autosave still counts when a real input event was recorded', async () => {
  const f = fixture();
  await f.start();
  const result = await f.save(blankGame(), { userInput: true });
  assert.equal(result.data.hasUserInput, true);
  f.state.now = START + LIVE_SCORE_EMPTY_TIMEOUT_MS;
  assert.equal((await f.run()).data.active, true);
});

test('default values, viewing, reloads, no-op autosaves, and score-cell focus do not count as input', async () => {
  const f = fixture();
  await f.start();
  assert.equal(hasLiveScoreInput(blankGame()), false);
  f.state.now = START + 30_000;
  await f.run();
  await f.save(copy(f.state.data.current), { userInput: false });
  const focused = copy(f.state.data.current);
  focused.selectedScoreCell = { side: 'ours', index: 0, tieBreak: false };
  assert.equal(hasLiveScoreInput(focused), false);
  f.state.now = START + 60_000;
  await f.save(focused, { userInput: false });
  assert.equal(f.state.data.hasUserInput, false);
  f.state.now = START + 179_999;
  await f.run();
  assert.equal(f.state.data.startedAt, iso(START));
  f.state.now += 1;
  assert.equal((await f.run()).data.active, false);
});

test('client timestamps and ordinary saves cannot move the four-hour deadline', async () => {
  const f = fixture();
  await f.start();
  const game = copy(f.state.data.current);
  game.startTime = '23:59';
  f.state.now = START + 120_000;
  await f.save(game, { userInput: true });
  f.state.now = START + LIVE_SCORE_DURATION_MS - 1;
  const result = await f.run('saveLiveScore', {
    userInput: true,
    data: { ...copy(f.state.data), startedAt: iso(f.state.now), expiresAt: iso(f.state.now + LIVE_SCORE_DURATION_MS), hasUserInput: false },
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.startedAt, iso(START));
  assert.equal(result.data.expiresAt, iso(START + LIVE_SCORE_DURATION_MS));
  assert.equal(result.data.hasUserInput, true);
  f.state.now += 1;
  const ended = await f.run();
  assert.equal(ended.data.active, false);
  assert.equal(ended.data.endedReason, 'time-limit');
  assert.equal(ended.data.lastGame.startTime, '23:59');
  assert.equal(ended.data.lastGame.completedAt, iso(f.state.now));
});

test('empty accidental starts preserve the previous real match', async () => {
  const lastGame = { ...blankGame(), tournament: '前の実試合', opponent: '前の対戦相手', completedAt: iso(START - 86_400_000) };
  lastGame.innings.ours[0] = 3;
  const f = fixture({ active: false, visible: false, current: null, lastGame });
  await f.start();
  f.state.now = START + LIVE_SCORE_EMPTY_TIMEOUT_MS;
  const result = await f.run();
  assert.deepEqual(result.data.lastGame, lastGame);
  assert.equal(result.data.current, null);
});

test('manual finish closes early and stale autosaves cannot reopen the finished match', async () => {
  const f = fixture();
  await f.start();
  const game = copy(f.state.data.current);
  game.opponent = '試合相手';
  await f.save(game, { userInput: true });
  const stale = copy(f.state.data);
  f.state.now = START + 5 * 60 * 1000;
  const finished = await f.run('saveLiveScore', {
    data: { ...copy(f.state.data), active: false, visible: false, current: null, lastGame: { ...game, completedAt: iso(f.state.now) } },
  });
  assert.equal(finished.ok, true);
  assert.equal(finished.data.active, false);
  assert.equal(finished.data.endedReason, 'finished');
  const late = await f.run('saveLiveScore', { data: stale, sessionId: stale.sessionId, userInput: true });
  assert.equal(late.ok, false);
  assert.equal(late.status, 409);
  assert.equal(f.state.data.active, false);
  assert.equal(f.state.data.lastGame.opponent, '試合相手');
});

test('a new match resets the three-minute guard and rejects updates from the previous session', async () => {
  const f = fixture();
  await f.start();
  const previous = copy(f.state.data);
  f.state.now = START + LIVE_SCORE_EMPTY_TIMEOUT_MS;
  await f.run();
  f.state.now += 10_000;
  const next = await f.start();
  assert.equal(next.ok, true);
  assert.notEqual(next.data.sessionId, previous.sessionId);
  assert.equal(next.data.hasUserInput, false);
  assert.equal(next.data.startedAt, iso(f.state.now));
  const late = await f.run('saveLiveScore', { data: previous, sessionId: previous.sessionId, userInput: true });
  assert.equal(late.ok, false);
  assert.equal(late.status, 409);
  assert.equal(f.state.data.sessionId, next.data.sessionId);
  assert.equal(f.state.data.hasUserInput, false);
});

test('extension requires explicit action near the deadline and keeps the original start', async () => {
  const f = fixture();
  await f.start();
  const game = copy(f.state.data.current);
  game.opponent = '相手';
  await f.save(game, { userInput: true });
  const early = await f.run('extendLiveScore');
  assert.equal(early.ok, false);
  f.state.now = START + LIVE_SCORE_DURATION_MS - LIVE_SCORE_EXTENSION_WINDOW_MS;
  const extended = await f.run('extendLiveScore');
  assert.equal(extended.ok, true);
  assert.equal(extended.data.startedAt, iso(START));
  assert.equal(extended.data.expiresAt, iso(START + LIVE_SCORE_DURATION_MS + LIVE_SCORE_EXTENSION_MS));
  f.state.now = START + LIVE_SCORE_DURATION_MS;
  assert.equal((await f.run()).data.active, true);
  f.state.now += LIVE_SCORE_EXTENSION_MS;
  assert.equal((await f.run()).data.active, false);
});

test('an extension after expiry cannot reopen a match', async () => {
  const f = fixture();
  await f.start();
  const game = copy(f.state.data.current);
  game.opponent = '相手';
  await f.save(game, { userInput: true });
  f.state.now = START + LIVE_SCORE_DURATION_MS;
  const result = await f.run('extendLiveScore');
  assert.equal(result.ok, false);
  assert.equal(f.state.data.active, false);
});

test('a concurrent first input wins over an expiry based on an old snapshot', async () => {
  const f = fixture();
  await f.start();
  f.state.now = START + LIVE_SCORE_EMPTY_TIMEOUT_MS;
  let raced = false;
  f.state.beforeWrite = async () => {
    if (raced) return;
    raced = true;
    const entered = copy(f.state.data);
    entered.hasUserInput = true;
    entered.current.opponent = '別端末の入力';
    f.replace(entered);
  };
  const result = await f.run();
  assert.equal(raced, true);
  assert.equal(result.data.active, true);
  assert.equal(result.data.current.opponent, '別端末の入力');
  assert.equal(f.state.data.hasUserInput, true);
});

test('an old expiry cannot close a newer match created during a storage race', async () => {
  const f = fixture();
  await f.start();
  const oldId = f.state.data.sessionId;
  f.state.now = START + LIVE_SCORE_EMPTY_TIMEOUT_MS;
  let raced = false;
  f.state.beforeWrite = async () => {
    if (raced) return;
    raced = true;
    f.replace({ ...copy(f.state.data), sessionId: 'newer-match', startedAt: iso(f.state.now), expiresAt: iso(f.state.now + LIVE_SCORE_DURATION_MS) });
  };
  const result = await f.run();
  assert.notEqual(result.data.sessionId, oldId);
  assert.equal(result.data.sessionId, 'newer-match');
  assert.equal(result.data.active, true);
});

test('a failed create condition cannot replace a match started by another request', async () => {
  const f = fixture();
  let raced = false;
  f.state.beforeWrite = async () => {
    if (raced) return;
    raced = true;
    f.replace({ active: true, visible: true, sessionId: 'other-match', current: blankGame(), lastGame: null, startedAt: iso(START), expiresAt: iso(START + LIVE_SCORE_DURATION_MS), hasUserInput: false, endedReason: '', updatedAt: iso(START) });
  };
  const result = await f.start();
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(f.state.data.sessionId, 'other-match');
});

test('exhausted storage conflicts return the persisted match, never an uncommitted expiry', async () => {
  const f = fixture();
  await f.start();
  f.state.now = START + LIVE_SCORE_EMPTY_TIMEOUT_MS;
  let conflicts = 0;
  f.state.beforeWrite = async () => {
    conflicts += 1;
    const saved = copy(f.state.data);
    saved.updatedAt = iso(START + conflicts);
    if (conflicts === 5) {
      saved.hasUserInput = true;
      saved.current.opponent = '最後の競合で保存された入力';
    }
    f.replace(saved);
  };
  const result = await f.run();
  assert.equal(conflicts, 5);
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.code, 'write-conflict');
  assert.equal(result.data.active, true);
  assert.equal(result.data.current.opponent, '最後の競合で保存された入力');
  assert.deepEqual(result.data, f.state.data);
});

test('a provider write without a confirming ETag is not reported as saved', async () => {
  const f = fixture();
  f.store.setJSON = async () => ({ modified: true, etag: '' });
  await assert.rejects(() => f.start());
  assert.equal(f.state.data, null);
});

test('a stored record without an ETag cannot be overwritten unconditionally', async () => {
  const f = fixture();
  await f.start();
  f.state.now = START + LIVE_SCORE_EMPTY_TIMEOUT_MS;
  f.store.getWithMetadata = async () => ({ data: copy(f.state.data), etag: '' });
  const writes = f.state.writes.length;
  await assert.rejects(() => f.run());
  assert.equal(f.state.writes.length, writes);
  assert.equal(f.state.data.active, true);
});
