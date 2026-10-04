(function () {
  'use strict';

  function splitArgs(text) {
    var out = [], cur = '', quote = '', esc = false, depth = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (esc) { cur += ch; esc = false; continue; }
      if (ch === '\\') { cur += ch; esc = true; continue; }
      if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') { depth++; cur += ch; continue; }
      if (ch === ')' || ch === ']' || ch === '}') { depth--; cur += ch; continue; }
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function parseArg(raw, el, ev) {
    raw = raw.trim();
    if (raw === 'this') return el;
    if (raw === 'event') return ev;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
    var q = raw[0];
    if ((q === "'" || q === '"') && raw[raw.length - 1] === q) {
      return raw.slice(1, -1).replace(/\\(['"\\])/g, '$1');
    }
    return raw;
  }

  function run(code, el, ev) {
    if (!code) return;
    if (/event\.preventDefault\(\)/.test(code)) ev.preventDefault();
    if (/window\.scrollTo\(\{top:0,behavior:['"]smooth['"]\}\)/.test(code)) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    var re = /(?:^|;)\s*([A-Za-z_$][\w$]*)\s*\(([^;]*)\)\s*(?=;|$)/g, m;
    while ((m = re.exec(code))) {
      var name = m[1];
      if (name === 'preventDefault' || name === 'scrollTo') continue;
      var fn = window[name];
      if (typeof fn !== 'function') continue;
      var args = m[2].trim() ? splitArgs(m[2]).map(function (a) { return parseArg(a, el, ev); }) : [];
      fn.apply(window, args);
    }
  }

  document.addEventListener('click', function (ev) {
    var homeLogo = ev.target && ev.target.closest ? ev.target.closest('[data-home-logo]') : null;
    if (homeLogo) {
      // The home logo remains an image so iOS can offer its native long-press save action.
      ev.preventDefault();
      var onHome = location.pathname === '/' || location.pathname === '/index.html';
      if (onHome && homeLogo.tagName !== 'A') {
        try { sessionStorage.setItem('yachiyo:force-opening','1'); } catch (_) {}
        window.location.reload();
      } else if (homeLogo.tagName === 'A') {
        window.location.assign('/');
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-csp-onclick]') : null;
    if (el) run(el.getAttribute('data-csp-onclick'), el, ev);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var homeLogo = ev.target && ev.target.closest ? ev.target.closest('[data-home-logo]') : null;
    if (!homeLogo) return;
    ev.preventDefault();
    var onHome = location.pathname === '/' || location.pathname === '/index.html';
    if (onHome && homeLogo.tagName !== 'A') {
      try { sessionStorage.setItem('yachiyo:force-opening','1'); } catch (_) {}
      window.location.reload();
    } else if (homeLogo.tagName === 'A') {
      window.location.assign('/');
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  document.addEventListener('load', function (ev) {
    var el = ev.target;
    if (el && el.getAttribute) run(el.getAttribute('data-csp-onload'), el, ev);
  }, true);
  document.addEventListener('error', function (ev) {
    var el = ev.target;
    if (el && el.getAttribute) run(el.getAttribute('data-csp-onerror'), el, ev);
  }, true);

  // Only the home page gets the standalone header lock. Shared event handlers
  // above must stay active on every page.
  var teamLockPath = String(location.pathname || '').toLowerCase();
  if (teamLockPath !== '/' && teamLockPath !== '/index' && teamLockPath !== '/index.html') return;

  function ensureTeamLockShortcutStyle() {
    if (document.getElementById('team-lock-shortcut-style')) return;
    var style = document.createElement('style');
    style.id = 'team-lock-shortcut-style';
    style.textContent =
      '.team-lock-shortcut{display:none;text-decoration:none!important;-webkit-tap-highlight-color:transparent;touch-action:manipulation}' +
      '@media(max-width:900px){' +
      '.header .nav .team-lock-shortcut,.site-header .site-nav .team-lock-shortcut{' +
      'display:flex!important;align-items:center;justify-content:center;flex:0 0 36px;width:36px;height:36px;' +
      'margin-left:auto;border:1px solid rgba(199,154,59,.38);border-radius:8px;' +
      'color:#e2bd67!important;background:rgba(7,20,38,.18);position:relative;z-index:10002}' +
      '.header .nav .team-lock-shortcut svg,.site-header .site-nav .team-lock-shortcut svg{width:17px;height:17px;display:block}' +
      '.header .nav .team-lock-shortcut + .menu,.site-header .site-nav .team-lock-shortcut + .menu{margin-left:0!important}' +
      '.header .nav,.site-header .site-nav{column-gap:8px!important}' +
      '}' +
      '@media(max-width:600px){' +
      '.header .nav .team-lock-shortcut,.site-header .site-nav .team-lock-shortcut{flex-basis:36px;width:36px;height:36px;border-radius:8px}' +
      '.header .nav .team-lock-shortcut svg,.site-header .site-nav .team-lock-shortcut svg{width:14px;height:14px}' +
      '}';
    (document.head || document.documentElement).appendChild(style);
  }

  function installTeamLockShortcut() {
    var menu = document.querySelector('.header .nav .menu, .site-header .site-nav .menu');
    if (!menu) return false;
    if (document.querySelector('.team-lock-shortcut')) return true;

    var link = document.createElement('a');
    link.className = 'team-lock-shortcut';
    link.href = '/board.html';
    link.setAttribute('aria-label', 'チーム専用ページ');
    link.setAttribute('title', 'チーム専用ページ');
    link.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
      '<rect x="5.5" y="10" width="13" height="10" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
      '<circle cx="12" cy="15" r="1.2" fill="currentColor"/>' +
      '</svg>';

    menu.parentNode.insertBefore(link, menu);
    return true;
  }

  // Install CSS immediately while <head> is still parsing, then insert the
  // shortcut as soon as the header/menu node appears. Waiting for DOMContentLoaded
  // caused the lock to flash out briefly on refresh.
  ensureTeamLockShortcutStyle();
  if (!installTeamLockShortcut() && typeof MutationObserver !== 'undefined') {
    var lockObserver = new MutationObserver(function () {
      if (installTeamLockShortcut()) lockObserver.disconnect();
    });
    lockObserver.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('load', function () { lockObserver.disconnect(); }, { once: true });
  }
})();
