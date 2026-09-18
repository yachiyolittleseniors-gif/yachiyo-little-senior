(() => {
  const API = '/.netlify/functions/site-data?section=live-score';
  const LAST_GAME_KEY = 'yachiyoLiveScoreLastGame';
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
    sbo: { s: 0, b: 0, o: 0 },
    bases: { first: false, second: false, third: false },
  });

  let state = { active: false, visible: false, current: null, lastGame: null, updatedAt: '' };
  let dirty = false;
  let saving = false;
  let changeVersion = 0;
  let autoSaveTimer = 0;
  let editorCollapsed = false;
  let replayMode = false;

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
      grade: ['1','2','3'].includes(String(game.grade || '')) ? String(game.grade) : '',
      ourName: String(game.ourName || '八千代').slice(0, 40) || '八千代',
      sbo: { s: Math.max(0, Math.min(2, Number(game.sbo?.s) || 0)), b: Math.max(0, Math.min(3, Number(game.sbo?.b) || 0)), o: Math.max(0, Math.min(2, Number(game.sbo?.o) || 0)) },
      bases: { first: Boolean(game.bases?.first), second: Boolean(game.bases?.second), third: Boolean(game.bases?.third) },
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

  function normalize(value) {
    const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const current = normalizeGame(data.current);
    const lastGame = normalizeGame(data.lastGame) || rememberedLastGame();
    if (lastGame) rememberLastGame(lastGame);
    return {
      active: Boolean(data.active && current),
      visible: Boolean(data.active && current),
      current,
      lastGame,
      updatedAt: String(data.updatedAt || ''),
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
    diamond: $('#liveScoreDiamond'),
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

  function renderGameSituation() {
    if (!state.current) return;
    const sbo = state.current.sbo || (state.current.sbo = {s:0,b:0,o:0});
    if (elements.sbo) {
      elements.sbo.innerHTML = '';
      [['S','s',2,'on-s'],['B','b',3,'on-b'],['O','o',2,'on-o']].forEach(([label,key,max,cls]) => {
        const wrap=document.createElement('div'); wrap.className='live-score-count';
        const title=document.createElement('b'); title.textContent=label; wrap.appendChild(title);
        const dots=document.createElement('div'); dots.className='live-score-dots';
        for(let i=1;i<=max;i++){
          const dot=document.createElement('button'); dot.type='button'; dot.className='live-score-dot'; dot.classList.toggle(cls,i<=sbo[key]);
          dot.setAttribute('aria-label',`${label}${i}`);
          dot.addEventListener('click',()=>{ if(replayMode)return; state.current.sbo[key]=(sbo[key]===i?0:i); dirty=true; changeVersion+=1; renderGameSituation(); scheduleAutoSave(); });
          dots.appendChild(dot);
        }
        wrap.appendChild(dots); elements.sbo.appendChild(wrap);
      });
    }
    if(elements.diamond){
      elements.diamond.querySelectorAll('[data-base]').forEach(btn=>{ const key=btn.dataset.base; btn.classList.toggle('on',key!=='home' && Boolean(state.current.bases?.[key])); btn.disabled=replayMode; });
    }
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
    elements.ground.value = game.ground;
    elements.grade.value = game.grade || '';
    elements.opponent.value = game.opponent;
    elements.order.querySelectorAll('button').forEach(button => {
      const selected = button.dataset.order === game.battingOrder;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function render() {
    const showingEditor = state.active || replayMode;
    elements.idle.hidden = showingEditor && !editorCollapsed;
    elements.editor.hidden = !showingEditor || editorCollapsed;
    elements.start.textContent = state.active ? '試合速報に戻る' : '試合速報を開始';
    elements.restoreWrap.hidden = showingEditor || !state.lastGame;
    root.classList.toggle('is-replay', replayMode);
    if (!showingEditor || !state.current) return;
    syncFields();
    renderGameSituation();
    renderScoreRows();
    renderTieBreaks();
    elements.liveBadge.hidden = replayMode || !state.visible;
    elements.visibilityBadge.hidden = replayMode;
    elements.visibilityBadge.textContent = state.visible ? '公開中' : '未公開';
    elements.visibilityBadge.classList.toggle('is-visible', state.visible);
    elements.finish.hidden = replayMode;
    elements.addTieBreak.hidden = replayMode;
    if (replayMode) elements.removeTieBreak.hidden = true;
    elements.status.parentElement.hidden = replayMode;
    elements.back.hidden = !replayMode;
    root.querySelectorAll('.live-score-editor input,.live-score-segments button').forEach(control => {
      control.disabled = replayMode;
    });
    updateStatus();
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

  async function startGame(game = null, visible = true) {
    editorCollapsed = false;
    replayMode = false;
    state.active = true;
    state.visible = visible;
    state.current = normalizeGame(game) || blankGame();
    dirty = true;
    changeVersion += 1;
    render();
    await save(visible ? '試合速報を開始・公開しました' : '試合速報を開始しました');
  }

  elements.start.addEventListener('click', () => {
    if (state.active && editorCollapsed) {
      editorCollapsed = false;
      render();
      return;
    }
    startGame();
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
      readFields();
      dirty = true;
      changeVersion += 1;
      renderScoreRows();
      renderTieBreaks();
      scheduleAutoSave();
    }));

  elements.diamond?.addEventListener('click', event => {
    const button = event.target.closest('[data-base]');
    if (!button || !state.current || replayMode) return;
    const key = button.dataset.base;
    if (key === 'home') return;
    state.current.bases[key] = !state.current.bases[key];
    dirty = true;
    changeVersion += 1;
    renderGameSituation();
    scheduleAutoSave();
  });

  elements.diamond?.addEventListener('click', event => {
    const button=event.target.closest('[data-base]');
    if(!button || !state.current || replayMode || button.dataset.base==='home') return;
    const key=button.dataset.base;
    state.current.bases[key]=!state.current.bases[key];
    dirty=true; changeVersion+=1; renderGameSituation(); scheduleAutoSave();
  });

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

  elements.removeTieBreak.addEventListener('click', () => {
    if (!state.current?.tieBreaks.length) return;
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
    if (await save('試合速報を終了しました')) render();
  });

  async function load({ silent = false } = {}) {
    if (replayMode || dirty || saving || root.contains(document.activeElement)) return;
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
