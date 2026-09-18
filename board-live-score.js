(() => {
  const API = '/.netlify/functions/site-data?section=live-score';
  const LAST_GAME_KEY = 'yachiyoLiveScoreLastGame';
  const DRAFT_KEY = 'yachiyoLiveScoreDraft';
  const DEVICE_KEY = 'yachiyoLiveScoreEditorDeviceId';
  const $ = selector => document.querySelector(selector);
  const root = $('#liveScoreCard');
  if (!root) return;

  const blankGame = () => ({
    tournament: '',
    startTime: '',
    ground: '',
    grade: '',
    ourName: '八千代',
    opponent: '',
    battingOrder: 'second',
    innings: {
      ours: ['', '', '', '', '', '', ''],
      opponent: ['', '', '', '', '', '', ''],
    },
    tieBreaks: [],
    sbo: { strikes: 0, balls: 0, outs: 0 },
    bases: { first: false, second: false, third: false },
    currentAtBat: { inning: 0, side: 'opponent' },
  });

  let state = { active: false, visible: false, current: null, lastGame: null, updatedAt: '' };
  let dirty = false;
  let saving = false;
  let changeVersion = 0;
  let autoSaveTimer = 0;
  let editorCollapsed = false;
  let replayMode = false;
  let inputMode = false;
  let pollTimer = 0;
  // Keep one device id for the entire page lifetime. On some iPhone/Safari
  // privacy modes storage writes can fail; generating a new id on every call
  // would make the server think the lock belongs to another device.
  let clientDeviceId = '';

  function accessValue() {
    try {
      return sessionStorage.getItem('yachiyoAttendancePass') ||
        localStorage.getItem('yachiyoAttendanceReloadPass') || '';
    } catch (_) {
      return '';
    }
  }

  async function request(method = 'GET', data, extra = {}) {
    const headers = {};
    const access = accessValue();
    if (access) headers['x-access-password'] = access;
    if (method === 'GET') headers['x-live-score-device-id'] = deviceId();
    if (method === 'POST') headers['content-type'] = 'application/json';
    const payload = method === 'POST' ? { data, ...extra } : undefined;
    const response = await fetch(API, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: method === 'POST' ? JSON.stringify(payload) : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || '試合速報を保存できませんでした。');
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function deviceId() {
    if (clientDeviceId) return clientDeviceId;
    try {
      clientDeviceId = localStorage.getItem(DEVICE_KEY) || '';
    } catch (_) {}
    if (!clientDeviceId) {
      try {
        clientDeviceId = sessionStorage.getItem(DEVICE_KEY) || '';
      } catch (_) {}
    }
    if (!clientDeviceId) {
      try {
        clientDeviceId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
          ? crypto.randomUUID()
          : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      } catch (_) {
        clientDeviceId = `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      try { localStorage.setItem(DEVICE_KEY, clientDeviceId); } catch (_) {}
      try { sessionStorage.setItem(DEVICE_KEY, clientDeviceId); } catch (_) {}
    }
    return clientDeviceId;
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
      grade: ({'1':'1','2':'2','3':'3','1年生':'1','2年生':'2','3年生':'3'}[String(game.grade || '')] || ''),
      ourName: String(game.ourName || '八千代').slice(0, 40) || '八千代',
      opponent: String(game.opponent || '').slice(0, 40),
      battingOrder: game.battingOrder === 'first' ? 'first' : 'second',
      innings: { ours: seven(innings.ours), opponent: seven(innings.opponent) },
      sbo: {
        strikes: Math.max(0, Math.min(2, Number(game.sbo?.strikes) || 0)),
        balls: Math.max(0, Math.min(3, Number(game.sbo?.balls) || 0)),
        outs: Math.max(0, Math.min(2, Number(game.sbo?.outs) || 0)),
      },
      bases: {
        first: Boolean(game.bases?.first),
        second: Boolean(game.bases?.second),
        third: Boolean(game.bases?.third),
      },
      currentAtBat: {
        inning: Number.isInteger(Number(game.currentAtBat?.inning)) ? Math.max(0, Math.min(6, Number(game.currentAtBat.inning))) : 0,
        side: game.currentAtBat?.side === 'ours' ? 'ours' : 'opponent',
      },
      tieBreaks: Array.isArray(game.tieBreaks) ? game.tieBreaks.slice(0, 8).map((item, index) => ({
        inning: 8 + index,
        ours: score(item?.ours),
        opponent: score(item?.opponent),
      })) : [],
      completedAt: game.completedAt ? String(game.completedAt) : '',
    };
  }

  function rememberedLastGame() {
    try {
      return normalizeGame(JSON.parse(localStorage.getItem(LAST_GAME_KEY) || 'null'));
    } catch (_) {
      return null;
    }
  }

  function rememberLastGame(game) {
    if (!game) return;
    try {
      localStorage.setItem(LAST_GAME_KEY, JSON.stringify(game));
    } catch (_) {}
  }

  // Keep a device-local draft so SBO / bases survive page refreshes even if
  // the server response is briefly stale or does not echo the new fields.
  function draftIdentity(game) {
    if (!game) return '';
    return [game.tournament, game.startTime, game.ground, game.grade, game.opponent].join('|');
  }

  function rememberDraft(game) {
    if (!game) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        identity: draftIdentity(game),
        savedAt: Date.now(),
        sbo: { ...game.sbo },
        bases: { ...game.bases },
      }));
    } catch (_) {}
  }

  function rememberedDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!draft || !draft.identity) return null;
      return draft;
    } catch (_) {
      return null;
    }
  }

  function applyRememberedDraft(game) {
    const draft = rememberedDraft();
    if (!draft || !game || draft.identity !== draftIdentity(game)) return game;
    if (draft.sbo) game.sbo = {
      strikes: Math.max(0, Math.min(2, Number(draft.sbo.strikes) || 0)),
      balls: Math.max(0, Math.min(3, Number(draft.sbo.balls) || 0)),
      outs: Math.max(0, Math.min(2, Number(draft.sbo.outs) || 0)),
    };
    if (draft.bases) game.bases = {
      first: Boolean(draft.bases.first),
      second: Boolean(draft.bases.second),
      third: Boolean(draft.bases.third),
    };
    return game;
  }

  function normalize(value) {
    const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const current = normalizeGame(data.current);
    const lastGame = normalizeGame(data.lastGame) || rememberedLastGame();
    if (lastGame) rememberLastGame(lastGame);
    const lock = data.lock && typeof data.lock === 'object' ? {
      active: Boolean(data.lock.active),
      owner: Boolean(data.lock.owner),
      expiresAt: Number(data.lock.expiresAt || 0),
    } : { active: false, owner: false, expiresAt: 0 };
    return {
      active: Boolean(data.active && current),
      visible: Boolean(data.active && current),
      current,
      lastGame,
      updatedAt: String(data.updatedAt || ''),
      lock,
    };
  }

  const elements = {
    idle: $('#liveScoreIdle'),
    editor: $('#liveScoreEditor'),
    start: $('#liveScoreStart'),
    restore: $('#liveScoreRestore'),
    restoreWrap: $('#liveScoreRestoreWrap'),
    tournament: $('#liveScoreTournament'),
    startTime: $('#liveScoreStartTime'),
    ground: $('#liveScoreGround'),
    grade: $('#liveScoreGrade'),
    opponent: $('#liveScoreOpponent'),
    order: $('#liveScoreOrder'),
    rows: $('#liveScoreRows'),
    tieBreaks: $('#liveScoreTieBreaks'),
    addTieBreak: $('#liveScoreAddTieBreak'),
    removeTieBreak: $('#liveScoreRemoveTieBreak'),
    finish: $('#liveScoreFinish'),
    back: $('#liveScoreBack'),
    liveBadge: $('#liveScoreLiveBadge'),
    visibilityBadge: $('#liveScoreVisibilityBadge'),
    status: $('#liveScoreStatus'),
    updated: $('#liveScoreUpdated'),
    sbo: $('#liveScoreSbo'),
    bases: $('#liveScoreDiamond'),
    lockPanel: $('#liveScoreLockPanel'),
    lockText: $('#liveScoreLockText'),
    lockButton: $('#liveScoreLockButton'),
  };

  function renderLock() {
    if (!elements.lockPanel || !state.active || replayMode) {
      if (elements.lockPanel) elements.lockPanel.hidden = true;
      return;
    }
    elements.lockPanel.hidden = false;
    elements.lockPanel.classList.toggle('is-input', inputMode);
    elements.lockText.textContent = inputMode
      ? '入力中モード：この端末で入力できます。'
      : '閲覧中モード：現在の試合状況を表示しています。';
    elements.lockButton.textContent = inputMode ? '閲覧モードに戻る' : 'この端末で入力する';
    elements.lockButton.disabled = false;
  }

  function renderSbo() {
    if (!elements.sbo || !state.current) return;
    elements.sbo.innerHTML = '';
    const groups = [
      ['B', 'balls', 3, 'on-b'],
      ['S', 'strikes', 2, 'on-s'],
      ['O', 'outs', 2, 'on-o'],
    ];
    groups.forEach(([label, key, max, activeClass]) => {
      const group = document.createElement('button');
      group.type = 'button';
      group.className = 'live-score-count';
      group.style.touchAction = 'manipulation';
      group.style.webkitUserSelect = 'none';
      group.setAttribute('aria-label', `${label}カウント ${state.current.sbo[key]} / ${max}`);
      group.disabled = replayMode || !inputMode;

      const title = document.createElement('b');
      title.textContent = label;
      const dots = document.createElement('div');
      dots.className = 'live-score-dots';
      for (let i = 0; i < max; i += 1) {
        const dot = document.createElement('span');
        dot.className = 'live-score-dot' + (i < state.current.sbo[key] ? ` ${activeClass}` : '');
        dots.appendChild(dot);
      }

      group.addEventListener('click', () => {
        if (replayMode) return;
        const next = state.current.sbo[key] >= max ? 0 : state.current.sbo[key] + 1;
        state.current.sbo[key] = next;
        dirty = true;
        changeVersion += 1;
        renderSbo();
        // BSO is shared live state: persist immediately, with a retry if a prior save is still in flight.
        save('', { quiet: true, renderAfter: false });
        scheduleAutoSave();
      });

      group.addEventListener('dblclick', event => {
        event.preventDefault();
        event.stopPropagation();
      });

      group.append(title, dots);
      elements.sbo.appendChild(group);
    });
  }

  function renderBases() {
    if (!elements.bases || !state.current) return;
    elements.bases.querySelectorAll('.live-score-base').forEach(button => {
      const base = button.dataset.base;
      const active = base !== 'home' && Boolean(state.current.bases[base]);
      button.classList.toggle('on', active);
      button.style.touchAction = 'manipulation';
      button.style.webkitUserSelect = 'none';
      button.setAttribute('aria-pressed', String(active));
      button.disabled = replayMode || !inputMode;
    });
  }

  function total(side) {
    if (!state.current) return 0;
    const regulation = state.current.innings[side].reduce((sum, value) => sum + (Number(value) || 0), 0);
    return state.current.tieBreaks.reduce((sum, item) => sum + (Number(item[side]) || 0), regulation);
  }

  function setCurrentAtBat(side, index) {
    if (!state.current || !inputMode || replayMode || index < 0 || index > 6) return;
    state.current.currentAtBat = { inning: index, side };
    markCurrentAtBat();
    dirty = true;
    changeVersion += 1;
    scheduleAutoSave();
  }

  function markCurrentAtBat() {
    if (!elements.rows) return;
    const current = state.current?.currentAtBat;
    elements.rows.querySelectorAll('.live-score-number').forEach(input => input.classList.remove('is-current-at-bat'));
    if (!current || current.inning < 0 || current.inning > 6) return;
    const teams = teamOrder();
    const rowIndex = teams.findIndex(team => team.key === current.side);
    const row = rowIndex >= 0 ? elements.rows.children[rowIndex] : null;
    const cell = row?.querySelectorAll('.live-score-number')[current.inning];
    if (cell) cell.classList.add('is-current-at-bat');
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
    if (!tieBreak) {
      input.addEventListener('focus', () => setCurrentAtBat(side, index));
      input.addEventListener('click', () => setCurrentAtBat(side, index));
    }
    input.addEventListener('input', () => {
      if (!inputMode || replayMode) return;
      const next = score(input.value);
      if (tieBreak) state.current.tieBreaks[index][side] = next;
      else {
        state.current.innings[side][index] = next;
        setCurrentAtBat(side, index);
      }
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

  function fitLiveScoreTeamName(name) {
    if (!name) return;
    // 両チームを同じ固定サイズにする。表示幅に応じて毎フレーム縮小する処理は
    // iPhone Safariで文字が揺れて見えるため廃止。チーム名欄に十分な幅を確保する。
    name.classList.remove('live-score-team-long', 'live-score-team-medium');
    name.style.setProperty('font-size', '16px', 'important');
    name.style.setProperty('line-height', '1', 'important');
    name.style.setProperty('white-space', 'nowrap', 'important');
    name.style.setProperty('overflow', 'hidden', 'important');
    name.style.setProperty('text-overflow', 'clip', 'important');
    name.style.setProperty('min-width', '0', 'important');
    name.style.setProperty('width', '100%', 'important');
    name.style.setProperty('box-sizing', 'border-box', 'important');
    name.style.setProperty('font-weight', '900', 'important');
  }

  function fitAllLiveScoreTeamNames() {
    if (!elements.rows) return;
    elements.rows.querySelectorAll('.live-score-team').forEach(fitLiveScoreTeamName);
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
      fitLiveScoreTeamName(name);
    });
    markCurrentAtBat();
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
    elements.removeTieBreak.hidden = !state.current?.tieBreaks.length;
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
    elements.startTime.style.textAlign = 'left';
    elements.ground.value = game.ground;
    // 保存値は 1/2/3、古いデータは 1年生/2年生/3年生 の場合がある。
    // select の実値と表示文字の両方を見て確実に復元する。
    const savedGrade = String(game.grade || '');
    const gradeOptions = Array.from(elements.grade?.options || []);
    const gradeOption = gradeOptions.find(option =>
      String(option.value) === savedGrade || String(option.textContent || '').trim() === savedGrade
    );
    elements.grade.value = gradeOption ? gradeOption.value : '';
    elements.opponent.value = game.opponent;
    elements.order.querySelectorAll('button').forEach(button => {
      const selected = button.dataset.order === game.battingOrder;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function render() {
    document.body.classList.toggle('live-score-replay-only', replayMode);
    const showingEditor = state.active || replayMode;
    elements.idle.hidden = showingEditor && !editorCollapsed;
    elements.editor.hidden = !showingEditor || editorCollapsed;
    elements.start.textContent = state.active ? '試合速報に戻る' : '試合速報を開始';
    elements.restoreWrap.hidden = showingEditor || !state.lastGame;
    root.classList.toggle('is-replay', replayMode);
    if (!showingEditor || !state.current) return;
    syncFields();
    renderSbo();
    renderBases();
    renderScoreRows();
    renderTieBreaks();
    markCurrentAtBat();
    elements.liveBadge.hidden = replayMode || !state.visible;
    elements.visibilityBadge.hidden = replayMode;
    elements.visibilityBadge.textContent = state.visible ? '公開中' : '未公開';
    elements.visibilityBadge.classList.toggle('is-visible', state.visible);
    elements.finish.hidden = replayMode;
    elements.addTieBreak.hidden = replayMode;
    if (replayMode) elements.removeTieBreak.hidden = true;
    elements.status.parentElement.hidden = replayMode;
    elements.back.hidden = !replayMode;
    const viewOnly = !inputMode || replayMode;
    root.classList.toggle('live-score-view-mode', viewOnly);
    root.querySelectorAll('.live-score-editor input,.live-score-editor select,.live-score-segments button,.live-score-tb-actions button,.live-score-number').forEach(control => {
      control.disabled = viewOnly;
    });
    // BSO / ダイヤモンドも閲覧モードでは必ず操作不可。ただし見た目は変えない。
    root.querySelectorAll('.live-score-count,.live-score-base').forEach(control => {
      control.disabled = viewOnly;
      control.setAttribute('aria-disabled', String(viewOnly));
      if (viewOnly) control.tabIndex = -1;
      else control.removeAttribute('tabindex');
    });
    renderLock();
    updateStatus(inputMode && !replayMode
      ? '入力中モード・入力内容は自動保存されます。'
      : (!replayMode ? '閲覧中モード・現在の試合状況を表示しています。' : ''));
  }

  function readFields() {
    if (!state.current) return;
    state.current.tournament = elements.tournament.value.trim();
    state.current.startTime = elements.startTime.value;
    state.current.ground = elements.ground.value.trim();
    state.current.grade = elements.grade.value;
    state.current.opponent = elements.opponent.value.trim();
  }

  function scheduleAutoSave() {
    if (state.current) rememberDraft(state.current);
    clearTimeout(autoSaveTimer);
    updateStatus('自動保存中…');
    autoSaveTimer = setTimeout(() => save('', { quiet: true, renderAfter: false }), 900);
  }

  async function save(message, { quiet = false, renderAfter = true } = {}) {
    if (saving) return false;
    if (state.current) rememberDraft(state.current);
    clearTimeout(autoSaveTimer);
    const savingVersion = changeVersion;
    saving = true;
    root.classList.add('is-saving');
    try {
      state.updatedAt = new Date().toISOString();
      const result = await request('POST', state, { action: 'saveLiveScore' });
      const saved = normalize(result.data || state);
      if (renderAfter) state = saved;
      if (saved.current) rememberDraft(saved.current);
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

  function enterInputMode() {
    if (!state.active || replayMode) return;
    inputMode = true;
    render();
  }

  function leaveInputMode() {
    inputMode = false;
    render();
  }

  async function startGame(game = null, visible = true) {
    inputMode = true;
    editorCollapsed = false;
    replayMode = false;
    state.active = true;
    state.visible = visible;
    state.current = normalizeGame(game) || blankGame();
    try {
      const draft = rememberedDraft();
      if (draft && draft.identity !== draftIdentity(state.current)) localStorage.removeItem(DRAFT_KEY);
    } catch (_) {}
    rememberDraft(state.current);
    dirty = true;
    changeVersion += 1;
    render();
    await save(visible ? '試合速報を開始・公開しました' : '試合速報を開始しました');
  }

  elements.start.addEventListener('click', async () => {
    if (state.active && !inputMode) {
      enterInputMode();
      return;
    }
    if (state.active && editorCollapsed) {
      editorCollapsed = false;
      render();
      return;
    }
    startGame();
  });
  elements.lockButton?.addEventListener('click', () => {
    if (!state.active || replayMode) return;
    if (inputMode) {
      if (!confirm('閲覧モードに戻りますか？')) return;
      leaveInputMode();
    } else {
      enterInputMode();
    }
  });

  elements.restore.addEventListener('click', () => {
    if (!state.lastGame) return;
    replayMode = true;
    editorCollapsed = false;
    state.current = normalizeGame(state.lastGame);
    render();
  });
  elements.back.addEventListener('click', () => {
    replayMode = false;
    editorCollapsed = false;
    state.current = null;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  [elements.tournament, elements.startTime, elements.ground, elements.grade, elements.opponent]
    .forEach(input => input.addEventListener('input', () => {
      if (!inputMode || replayMode) return;
      readFields();
      dirty = true;
      changeVersion += 1;      renderScoreRows();
      renderTieBreaks();
      scheduleAutoSave();
    }));

  elements.bases.addEventListener('click', event => {
    const button = event.target.closest('[data-base]');
    if (!button || !state.current || replayMode || !inputMode) return;
    const base = button.dataset.base;
    if (base === 'home') return;
    state.current.bases[base] = !state.current.bases[base];
    dirty = true;
    changeVersion += 1;
    renderBases();
    // Base changes are shared live state: persist immediately, with a retry if needed.
    save('', { quiet: true, renderAfter: false });
    scheduleAutoSave();
  });

  elements.bases.addEventListener('dblclick', event => {
    event.preventDefault();
    event.stopPropagation();
  });

  elements.order.addEventListener('click', event => {
    const button = event.target.closest('[data-order]');
    if (!button || !state.current || replayMode || !inputMode) return;
    state.current.battingOrder = button.dataset.order;
    dirty = true;
    changeVersion += 1;
    render();
    scheduleAutoSave();
  });

  elements.addTieBreak.addEventListener('click', () => {
    if (!state.current || state.current.tieBreaks.length >= 8 || replayMode || !inputMode) return;
    readFields();
    state.current.tieBreaks.push({ inning: 8 + state.current.tieBreaks.length, ours: '', opponent: '' });
    dirty = true;
    changeVersion += 1;
    renderScoreRows();
    renderTieBreaks();
    scheduleAutoSave();
  });

  elements.removeTieBreak.addEventListener('click', () => {
    if (!state.current?.tieBreaks.length || replayMode || !inputMode) return;
    const last = state.current.tieBreaks[state.current.tieBreaks.length - 1];
    if (!confirm(`${last.inning}回のタイブレークを削除しますか？`)) return;
    state.current.tieBreaks.pop();
    dirty = true;
    changeVersion += 1;
    renderScoreRows();
    renderTieBreaks();
    scheduleAutoSave();
  });

  elements.finish.addEventListener('click', async () => {
    if (!inputMode || replayMode) return;
    readFields();
    if (!confirm('この試合の速報を終了しますか？\n直前の試合として保存され、速報は非表示になります。')) return;
    const completed = normalizeGame(state.current);
    completed.completedAt = new Date().toISOString();
    rememberLastGame(completed);
    state.lastGame = completed;
    state.current = null;
    state.active = false;
    state.visible = false;
    editorCollapsed = false;
    replayMode = false;
    dirty = true;
    changeVersion += 1;
    if (await save('試合速報を終了しました')) {
      leaveInputMode();
      render();
    }
  });

  async function load({ silent = false, force = false } = {}) {
    if (!force && (replayMode || dirty || saving || root.contains(document.activeElement))) return;
    try {
      const result = await request();
      const previousActive = state.active;
      state = normalize(result.data);
      // Manual mode: every page load starts in viewing mode.
      if (!state.current) inputMode = false;
      if (state.current) {
        rememberDraft(state.current);
      }
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
    // Standard is viewing mode after every page load.
    inputMode = false;
    render();
    pollTimer = setInterval(() => load({ silent: true }), 5000);
  })();
  window.addEventListener('resize', () => { window.requestAnimationFrame(fitAllLiveScoreTeamNames); });

})();
