(() => {
  const API = '/.netlify/functions/site-data?section=live-score';
  const $ = selector => document.querySelector(selector);
  const root = $('#liveScoreCard');
  if (!root) return;

  const blankGame = () => ({
    tournament: '',
    startTime: '',
    ground: '',
    ourName: '八千代',
    opponent: '',
    battingOrder: 'second',
    innings: {
      ours: ['', '', '', '', '', '', ''],
      opponent: ['', '', '', '', '', '', ''],
    },
    tieBreaks: [],
  });

  let state = { active: false, visible: false, current: null, lastGame: null, updatedAt: '' };
  let dirty = false;
  let saving = false;
  let changeVersion = 0;
  let autoSaveTimer = 0;

  function accessValue() {
    try {
      return sessionStorage.getItem('yachiyoAttendancePass') ||
        localStorage.getItem('yachiyoAttendanceReloadPass') || '';
    } catch (_) {
      return '';
    }
  }

  async function request(method = 'GET', data) {
    const headers = {};
    const access = accessValue();
    if (access) headers['x-access-password'] = access;
    if (method === 'POST') headers['content-type'] = 'application/json';
    const response = await fetch(API, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: method === 'POST' ? JSON.stringify({ data }) : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '試合速報を保存できませんでした。');
    return result;
  }

  function score(value) {
    if (value === '' || value === null || value === undefined) return '';
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number <= 99 ? number : '';
  }

  function normalizeGame(game) {
    if (!game || typeof game !== 'object') return null;
    const innings = game.innings || {};
    const seven = values => Array.from({ length: 7 }, (_, index) => score(values?.[index]));
    return {
      tournament: String(game.tournament || '').slice(0, 100),
      startTime: String(game.startTime || '').slice(0, 10),
      ground: String(game.ground || '').slice(0, 100),
      ourName: String(game.ourName || '八千代').slice(0, 40) || '八千代',
      opponent: String(game.opponent || '').slice(0, 40),
      battingOrder: game.battingOrder === 'first' ? 'first' : 'second',
      innings: { ours: seven(innings.ours), opponent: seven(innings.opponent) },
      tieBreaks: Array.isArray(game.tieBreaks) ? game.tieBreaks.slice(0, 8).map((item, index) => ({
        inning: 8 + index,
        ours: score(item?.ours),
        opponent: score(item?.opponent),
      })) : [],
      completedAt: game.completedAt ? String(game.completedAt) : '',
    };
  }

  function normalize(value) {
    const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const current = normalizeGame(data.current);
    return {
      active: Boolean(data.active && current),
      visible: Boolean(data.visible && data.active && current),
      current,
      lastGame: normalizeGame(data.lastGame),
      updatedAt: String(data.updatedAt || ''),
    };
  }

  const elements = {
    idle: $('#liveScoreIdle'),
    editor: $('#liveScoreEditor'),
    start: $('#liveScoreStart'),
    restore: $('#liveScoreRestore'),
    tournament: $('#liveScoreTournament'),
    startTime: $('#liveScoreStartTime'),
    ground: $('#liveScoreGround'),
    ourName: $('#liveScoreOurName'),
    opponent: $('#liveScoreOpponent'),
    order: $('#liveScoreOrder'),
    rows: $('#liveScoreRows'),
    tieBreaks: $('#liveScoreTieBreaks'),
    addTieBreak: $('#liveScoreAddTieBreak'),
    visibility: $('#liveScoreVisibility'),
    finish: $('#liveScoreFinish'),
    liveBadge: $('#liveScoreLiveBadge'),
    visibilityBadge: $('#liveScoreVisibilityBadge'),
    status: $('#liveScoreStatus'),
    updated: $('#liveScoreUpdated'),
  };

  function total(side) {
    if (!state.current) return 0;
    const regulation = state.current.innings[side].reduce((sum, value) => sum + (Number(value) || 0), 0);
    return state.current.tieBreaks.reduce((sum, item) => sum + (Number(item[side]) || 0), regulation);
  }

  function scoreInput(side, index, value, label, tieBreak = false) {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '99';
    input.inputMode = 'numeric';
    input.className = 'live-score-number';
    input.value = value;
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => {
      const next = score(input.value);
      if (tieBreak) state.current.tieBreaks[index][side] = next;
      else state.current.innings[side][index] = next;
      dirty = true;
      changeVersion += 1;
      updateDisplayedTotals();
      scheduleAutoSave();
    });
    return input;
  }

  function teamOrder() {
    if (!state.current) return [];
    const ours = { key: 'ours', name: state.current.ourName || '八千代' };
    const opponent = { key: 'opponent', name: state.current.opponent || '相手チーム' };
    return state.current.battingOrder === 'first' ? [ours, opponent] : [opponent, ours];
  }

  function renderScoreRows() {
    elements.rows.innerHTML = '';
    teamOrder().forEach(team => {
      const row = document.createElement('div');
      row.className = 'live-score-row';
      const name = document.createElement('strong');
      name.className = 'live-score-team';
      name.textContent = team.name;
      row.appendChild(name);
      state.current.innings[team.key].forEach((value, index) => {
        row.appendChild(scoreInput(team.key, index, value, `${team.name} ${index + 1}回`));
      });
      const tieBreakTotal = document.createElement('strong');
      tieBreakTotal.className = 'live-score-tb-total';
      tieBreakTotal.textContent = String(state.current.tieBreaks.reduce((sum, item) => sum + (Number(item[team.key]) || 0), 0));
      row.appendChild(tieBreakTotal);
      const totalCell = document.createElement('strong');
      totalCell.className = 'live-score-total';
      totalCell.textContent = String(total(team.key));
      row.appendChild(totalCell);
      elements.rows.appendChild(row);
    });
  }

  function updateDisplayedTotals() {
    const teams = teamOrder();
    Array.from(elements.rows.children).forEach((row, index) => {
      const side = teams[index]?.key;
      if (!side) return;
      const tieBreakTotal = row.querySelector('.live-score-tb-total');
      const totalCell = row.querySelector('.live-score-total');
      if (tieBreakTotal) {
        tieBreakTotal.textContent = String(state.current.tieBreaks.reduce((sum, item) => sum + (Number(item[side]) || 0), 0));
      }
      if (totalCell) totalCell.textContent = String(total(side));
    });
  }

  function renderTieBreaks() {
    elements.tieBreaks.innerHTML = '';
    elements.tieBreaks.hidden = !state.current?.tieBreaks.length;
    if (!state.current) return;
    state.current.tieBreaks.forEach((item, index) => {
      const block = document.createElement('div');
      block.className = 'live-score-tb-block';
      const heading = document.createElement('strong');
      heading.textContent = `${item.inning}回 タイブレーク`;
      block.appendChild(heading);
      teamOrder().forEach(team => {
        const line = document.createElement('label');
        const label = document.createElement('span');
        label.textContent = team.name;
        line.append(label, scoreInput(team.key, index, item[team.key], `${team.name} ${item.inning}回`, true));
        block.appendChild(line);
      });
      elements.tieBreaks.appendChild(block);
    });
  }

  function formatUpdated(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `更新 ${new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(date)}`;
  }

  function updateStatus(message = '') {
    elements.status.textContent = message || (state.visible
      ? '公開中・入力内容は自動保存されます。'
      : '未公開・入力内容は自動保存されます。');
    elements.updated.textContent = formatUpdated(state.updatedAt);
  }

  function syncFields() {
    const game = state.current;
    elements.tournament.value = game.tournament;
    elements.startTime.value = game.startTime;
    elements.ground.value = game.ground;
    elements.ourName.value = game.ourName;
    elements.opponent.value = game.opponent;
    elements.order.querySelectorAll('button').forEach(button => {
      const selected = button.dataset.order === game.battingOrder;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function render() {
    elements.idle.hidden = state.active;
    elements.editor.hidden = !state.active;
    elements.restore.hidden = !state.lastGame;
    if (!state.active || !state.current) return;
    syncFields();
    renderScoreRows();
    renderTieBreaks();
    elements.liveBadge.hidden = !state.visible;
    elements.visibilityBadge.textContent = state.visible ? '公開中' : '未公開';
    elements.visibilityBadge.classList.toggle('is-visible', state.visible);
    elements.visibility.textContent = state.visible ? '試合速報を非公開' : '試合速報を公開';
    updateStatus();
  }

  function readFields() {
    if (!state.current) return;
    state.current.tournament = elements.tournament.value.trim();
    state.current.startTime = elements.startTime.value;
    state.current.ground = elements.ground.value.trim();
    state.current.ourName = elements.ourName.value.trim() || '八千代';
    state.current.opponent = elements.opponent.value.trim();
  }

  function validateForDisplay() {
    readFields();
    const game = state.current;
    if (!game.tournament) return '大会名を入力してください。';
    if (!game.startTime) return '試合開始時間を入力してください。';
    if (!game.ground) return 'グラウンド名を入力してください。';
    if (!game.opponent) return '対戦相手を入力してください。';
    return '';
  }

  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    updateStatus('自動保存中…');
    autoSaveTimer = setTimeout(() => save('', { quiet: true, renderAfter: false }), 900);
  }

  async function save(message, { quiet = false, renderAfter = true } = {}) {
    if (saving) return false;
    clearTimeout(autoSaveTimer);
    const savingVersion = changeVersion;
    saving = true;
    root.classList.add('is-saving');
    try {
      state.updatedAt = new Date().toISOString();
      const result = await request('POST', state);
      const saved = normalize(result.data || state);
      if (renderAfter) state = saved;
      else state.updatedAt = saved.updatedAt;
      if (changeVersion === savingVersion) dirty = false;
      if (renderAfter) render();
      else updateStatus(state.visible ? '公開中・自動保存しました。' : '未公開・自動保存しました。');
      if (!quiet && window.showSaveNotice) window.showSaveNotice(message || '試合速報を保存しました');
      return true;
    } catch (error) {
      alert(error.message || '試合速報を保存できませんでした。');
      return false;
    } finally {
      saving = false;
      root.classList.remove('is-saving');
      if (dirty && changeVersion !== savingVersion) scheduleAutoSave();
    }
  }

  async function startGame(game = null, visible = false) {
    state.active = true;
    state.visible = visible;
    state.current = normalizeGame(game) || blankGame();
    dirty = true;
    changeVersion += 1;
    render();
    await save(visible ? '直前の試合を再表示しました' : '試合速報を開始しました');
  }

  elements.start.addEventListener('click', () => startGame());
  elements.restore.addEventListener('click', () => startGame(state.lastGame, true));

  [elements.tournament, elements.startTime, elements.ground, elements.ourName, elements.opponent]
    .forEach(input => input.addEventListener('input', () => {
      readFields();
      dirty = true;
      changeVersion += 1;
      renderScoreRows();
      renderTieBreaks();
      scheduleAutoSave();
    }));

  elements.order.addEventListener('click', event => {
    const button = event.target.closest('[data-order]');
    if (!button || !state.current) return;
    state.current.battingOrder = button.dataset.order;
    dirty = true;
    changeVersion += 1;
    render();
    scheduleAutoSave();
  });

  elements.addTieBreak.addEventListener('click', () => {
    if (!state.current || state.current.tieBreaks.length >= 8) return;
    readFields();
    state.current.tieBreaks.push({ inning: 8 + state.current.tieBreaks.length, ours: '', opponent: '' });
    dirty = true;
    changeVersion += 1;
    renderScoreRows();
    renderTieBreaks();
    scheduleAutoSave();
  });

  elements.visibility.addEventListener('click', async () => {
    const nextVisible = !state.visible;
    if (nextVisible) {
      const error = validateForDisplay();
      if (error) { alert(error); return; }
    } else {
      readFields();
    }
    state.visible = nextVisible;
    dirty = true;
    changeVersion += 1;
    await save(state.visible ? '試合速報を公開しました' : '試合速報を非公開にしました');
  });

  elements.finish.addEventListener('click', async () => {
    readFields();
    if (!confirm('この試合の速報を終了しますか？\n直前の試合として保存され、速報は非表示になります。')) return;
    const completed = normalizeGame(state.current);
    completed.completedAt = new Date().toISOString();
    state.lastGame = completed;
    state.current = null;
    state.active = false;
    state.visible = false;
    dirty = true;
    changeVersion += 1;
    if (await save('試合速報を終了しました')) render();
  });

  async function load({ silent = false } = {}) {
    if (dirty || saving || root.contains(document.activeElement)) return;
    try {
      const result = await request();
      state = normalize(result.data);
      render();
    } catch (error) {
      if (!silent) {
        elements.idle.querySelector('p').textContent = '試合速報を読み込めませんでした。ページを更新してください。';
      }
    }
  }

  (async () => {
    const allowed = await window.boardAccessReady;
    if (!allowed) return;
    await load();
    setInterval(() => load({ silent: true }), 10000);
  })();
})();
