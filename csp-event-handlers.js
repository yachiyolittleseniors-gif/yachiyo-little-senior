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

  /* ===== Unified document viewer =====
   * Keep the file response completely native. We do NOT fetch the PDF/image,
   * convert it to a Blob, or render it with PDF.js. The original same-origin
   * document URL is loaded directly into an iframe, while this page only adds
   * the shared "一覧に戻る" header. This avoids the iPhone Safari stall that
   * occurred when JavaScript tried to read the document bytes first.
   */
  var documentViewerLastTrigger = null;
  var documentViewerLoadingTimer = 0;

  function documentSectionFromUrl(url) {
    if (!url || url.origin !== location.origin) return '';
    if (url.pathname !== '/.netlify/functions/site-data') return '';
    return String(url.searchParams.get('section') || '');
  }

  function documentViewerSupportsUrl(url) {
    var section = documentSectionFromUrl(url);
    if (!section) return false;
    if (url.searchParams.get('download') === '1') return false;

    // These routes return an inline PDF/image and are safe to show directly.
    if (section === 'seniorcup-documents' ||
        section === 'result-documents' ||
        section === 'board-tournaments' ||
        section === 'board-meeting-documents' ||
        section === 'referee-documents') {
      return url.searchParams.has('file');
    }

    // The tournament guideline uses ?view=1 for inline display. Application /
    // roster files remain normal downloads and are intentionally not wrapped.
    if (section === 'downloads-guideline') {
      return url.searchParams.get('view') === '1';
    }

    return false;
  }

  function shouldUseDocumentViewer(link) {
    if (!link || link.hasAttribute('download') || link.closest('[data-no-document-viewer]')) return false;
    var url;
    try { url = new URL(link.href, location.href); } catch (_) { return false; }
    return documentViewerSupportsUrl(url);
  }

  function documentTitleForLink(link) {
    if (!link) return '資料';

    var group = link.closest && link.closest('.tournament-group');
    var groupTitle = group && group.querySelector('.tournament-group-title');
    if (groupTitle && groupTitle.textContent.trim()) return groupTitle.textContent.trim() + ' 資料';

    var card = link.closest && link.closest('.download-card');
    var cardTitle = card && card.querySelector('h3');
    if (cardTitle && cardTitle.textContent.trim()) return cardTitle.textContent.trim();

    var item = link.closest && link.closest('.tournament-pdf,.item');
    var itemTitle = item && item.querySelector('.tournament-pdf-name,.name');
    if (itemTitle && itemTitle.textContent.trim()) return itemTitle.textContent.trim();

    // 八千代リトルシニア杯の資料一覧はリンク自身が「資料を開く」なので、
    // 同じ行にあるファイル名をタイトルとして使う。
    var row = link.parentElement;
    var rowTitle = row && row.querySelector && row.querySelector('.file-name');
    if (rowTitle && rowTitle.textContent.trim()) return rowTitle.textContent.trim();

    var title = link.getAttribute && link.getAttribute('title');
    if (title && title.trim()) return title.trim();

    var label = String(link.textContent || '').trim();
    if (label && !/^(?:資料|PDF|画像)を開く$/.test(label)) return label;
    return '資料';
  }

  function ensureDocumentViewer() {
    var root = document.getElementById('ylsDocumentViewer');
    if (root) return root;

    var style = document.createElement('style');
    style.id = 'yls-document-viewer-style';
    style.textContent =
      '#ylsDocumentViewer{position:fixed;inset:0;z-index:60000;display:flex;flex-direction:column;background:#e8e8e6;color:#071426;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif}' +
      '#ylsDocumentViewer[hidden]{display:none!important}' +
      '#ylsDocumentViewer .yls-doc-bar{position:relative;z-index:3;flex:0 0 auto;min-height:calc(56px + env(safe-area-inset-top));padding:calc(8px + env(safe-area-inset-top)) 10px 8px;display:flex;align-items:center;gap:10px;background:rgba(7,20,38,.99);border-bottom:1px solid rgba(199,154,59,.7);box-shadow:0 5px 18px rgba(0,0,0,.18)}' +
      '#ylsDocumentViewer .yls-doc-back{appearance:none;flex:0 0 auto;min-height:40px;padding:8px 12px;border:1px solid rgba(226,189,103,.8);border-radius:9px;background:#071426;color:#e2bd67;font:inherit;font-size:12px;font-weight:900;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '#ylsDocumentViewer .yls-doc-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff;font-size:12px;font-weight:800}' +
      '#ylsDocumentViewer .yls-doc-stage{position:relative;flex:1 1 auto;min-height:0;background:#e8e8e6;overflow:hidden}' +
      '#ylsDocumentViewer .yls-doc-native{display:block;width:100%;height:100%;border:0;background:#fff}' +
      '#ylsDocumentViewer .yls-doc-status{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;padding:24px;background:#e8e8e6;color:#6f7883;font-size:14px;font-weight:800;text-align:center;pointer-events:none;transition:opacity .15s ease}' +
      '#ylsDocumentViewer .yls-doc-status[hidden]{display:none!important}' +
      '@media(max-width:600px){#ylsDocumentViewer .yls-doc-bar{min-height:calc(52px + env(safe-area-inset-top));padding:calc(7px + env(safe-area-inset-top)) 9px 7px}#ylsDocumentViewer .yls-doc-back{min-height:38px;padding:8px 10px}#ylsDocumentViewer .yls-doc-title{font-size:11px}}';
    (document.head || document.documentElement).appendChild(style);

    root = document.createElement('div');
    root.id = 'ylsDocumentViewer';
    root.hidden = true;
    root.innerHTML =
      '<div class="yls-doc-bar">' +
        '<button class="yls-doc-back" type="button">← 一覧に戻る</button>' +
        '<div class="yls-doc-title">資料</div>' +
      '</div>' +
      '<div class="yls-doc-stage">' +
        '<iframe class="yls-doc-native" title="資料" src="about:blank"></iframe>' +
        '<div class="yls-doc-status">資料を読み込んでいます。</div>' +
      '</div>';
    document.body.appendChild(root);
    root.querySelector('.yls-doc-back').addEventListener('click', closeDocumentViewer);
    return root;
  }

  function clearDocumentViewerLoadingTimer() {
    if (!documentViewerLoadingTimer) return;
    clearTimeout(documentViewerLoadingTimer);
    documentViewerLoadingTimer = 0;
  }

  function closeDocumentViewer() {
    var root = document.getElementById('ylsDocumentViewer');
    if (!root || root.hidden) return;
    clearDocumentViewerLoadingTimer();
    var frame = root.querySelector('.yls-doc-native');
    if (frame) {
      frame.onload = null;
      // Stop the native document without reading or revoking any file bytes.
      frame.src = 'about:blank';
    }
    root.hidden = true;
    document.documentElement.style.overflow = root.dataset.htmlOverflow || '';
    document.body.style.overflow = root.dataset.bodyOverflow || '';
    delete root.dataset.htmlOverflow;
    delete root.dataset.bodyOverflow;
  }

  function openDocumentUrl(urlLike, title) {
    var url;
    try { url = new URL(urlLike, location.href); } catch (_) { return false; }
    if (!documentViewerSupportsUrl(url)) return false;

    var root = ensureDocumentViewer();
    var frame = root.querySelector('.yls-doc-native');
    var status = root.querySelector('.yls-doc-status');

    root.dataset.htmlOverflow = document.documentElement.style.overflow || '';
    root.dataset.bodyOverflow = document.body.style.overflow || '';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    root.querySelector('.yls-doc-title').textContent = title || '資料';
    frame.title = title || '資料';
    status.textContent = '資料を読み込んでいます。';
    status.hidden = false;
    root.hidden = false;

    clearDocumentViewerLoadingTimer();
    frame.onload = function () {
      clearDocumentViewerLoadingTimer();
      status.hidden = true;
    };

    // Direct navigation only: no fetch(), no Blob, no PDF.js.
    frame.src = url.href;

    // WebKit does not guarantee a useful load event for every native PDF path.
    // Never let the loading cover stay on screen indefinitely.
    documentViewerLoadingTimer = setTimeout(function () {
      status.hidden = true;
      documentViewerLoadingTimer = 0;
    }, 2500);
    return true;
  }

  function openDocumentViewer(link) {
    var url;
    try { url = new URL(link.href, location.href); } catch (_) { return false; }
    return openDocumentUrl(url.href, documentTitleForLink(link));
  }

  // Remember the trigger during capture. This lets us keep the correct title
  // even for legacy code that calls window.open() from its own click handler.
  document.addEventListener('click', function (ev) {
    var link = ev.target && ev.target.closest ? ev.target.closest('a') : null;
    if (link) documentViewerLastTrigger = link;
  }, true);

  // Some existing document lists (notably 八千代リトルシニア杯) call
  // window.open() instead of giving the anchor a real file URL. Intercept only
  // our known same-origin document routes; every other popup remains native.
  var nativeWindowOpen = window.open;
  window.open = function (url, target, features) {
    if (typeof url === 'string' && url) {
      var title = documentTitleForLink(documentViewerLastTrigger);
      if (openDocumentUrl(url, title)) {
        documentViewerLastTrigger = null;
        return window;
      }
    }
    return nativeWindowOpen.apply(window, arguments);
  };

  document.addEventListener('click', function (ev) {
    var documentLink = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (documentLink && shouldUseDocumentViewer(documentLink)) {
      ev.preventDefault();
      openDocumentViewer(documentLink);
      return;
    }

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
