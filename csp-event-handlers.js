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
   * Public document links are opened in a same-page viewer so a reliable
   * "一覧に戻る" control is always available, independent of Safari history.
   * Future files uploaded to the same document sections are handled automatically.
   */
  var documentViewerObjectUrls = [];

  function documentSectionFromUrl(url) {
    if (!url || url.origin !== location.origin) return '';
    if (url.pathname !== '/.netlify/functions/site-data') return '';
    return String(url.searchParams.get('section') || '');
  }

  function shouldUseDocumentViewer(link) {
    if (!link || link.hasAttribute('download') || link.closest('[data-no-document-viewer]')) return false;
    var url;
    try { url = new URL(link.href, location.href); } catch (_) { return false; }
    var section = documentSectionFromUrl(url);
    if (!section) return false;
    var supported = [
      'seniorcup-documents',
      'result-documents',
      'downloads-roster',
      'board-tournaments',
      'board-meeting-documents',
      'referee-documents'
    ];
    if (supported.indexOf(section) === -1) return false;
    var label = String(link.textContent || '').replace(/\s+/g, '');
    if (section !== 'downloads-roster' && (url.searchParams.get('download') === '1' || /保存|ダウンロード/.test(label))) return false;
    if (section === 'downloads-roster' && link.id && link.id !== 'rosterDownload') return false;
    return true;
  }

  function documentTitleForLink(link) {
    if (!link) return '資料';
    if (link.id === 'rosterDownload') {
      var rosterName = document.getElementById('rosterFileName');
      if (rosterName && rosterName.textContent.trim()) return rosterName.textContent.trim();
    }
    var group = link.closest('.tournament-group');
    var groupTitle = group && group.querySelector('.tournament-group-title');
    if (groupTitle && groupTitle.textContent.trim()) return groupTitle.textContent.trim() + ' 資料';
    var card = link.closest('.download-card');
    var cardTitle = card && card.querySelector('h3');
    if (cardTitle && cardTitle.textContent.trim()) return cardTitle.textContent.trim();
    var item = link.closest('.tournament-pdf,.item');
    var itemTitle = item && item.querySelector('.tournament-pdf-name,.name');
    if (itemTitle && itemTitle.textContent.trim()) return itemTitle.textContent.trim();
    var title = link.getAttribute('title');
    return title && title.trim() ? title.trim() : '資料';
  }

  function ensureDocumentViewer() {
    var root = document.getElementById('ylsDocumentViewer');
    if (root) return root;

    var style = document.createElement('style');
    style.id = 'yls-document-viewer-style';
    style.textContent =
      '#ylsDocumentViewer{position:fixed;inset:0;z-index:60000;background:#e8e8e6;color:#071426;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif}' +
      '#ylsDocumentViewer[hidden]{display:none!important}' +
      '#ylsDocumentViewer .yls-doc-bar{position:sticky;top:0;z-index:3;min-height:calc(56px + env(safe-area-inset-top));padding:calc(8px + env(safe-area-inset-top)) 10px 8px;display:flex;align-items:center;gap:10px;background:rgba(7,20,38,.98);border-bottom:1px solid rgba(199,154,59,.7);box-shadow:0 5px 18px rgba(0,0,0,.18)}' +
      '#ylsDocumentViewer .yls-doc-back{appearance:none;flex:0 0 auto;min-height:40px;padding:8px 12px;border:1px solid rgba(226,189,103,.8);border-radius:9px;background:#071426;color:#e2bd67;font:inherit;font-size:12px;font-weight:900;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '#ylsDocumentViewer .yls-doc-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff;font-size:12px;font-weight:800}' +
      '#ylsDocumentViewer .yls-doc-scroll{height:calc(100dvh - 56px - env(safe-area-inset-top));overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}' +
      '#ylsDocumentViewer .yls-doc-status{min-height:calc(100dvh - 56px - env(safe-area-inset-top));display:flex;align-items:center;justify-content:center;padding:24px;color:#6f7883;font-size:14px;font-weight:800;text-align:center}' +
      '#ylsDocumentViewer .yls-doc-pages{width:min(920px,100%);margin:0 auto;padding:8px 0 24px;display:grid;gap:8px}' +
      '#ylsDocumentViewer .yls-doc-page{display:block;width:100%;height:auto;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.12)}' +
      '#ylsDocumentViewer .yls-doc-pdf{display:block;width:100%;height:calc(100dvh - 56px - env(safe-area-inset-top));border:0;background:#fff}' +
      '#ylsDocumentViewer .yls-doc-error{width:min(720px,calc(100% - 24px));margin:18px auto;padding:22px 16px;border:1px solid #ddd9d0;border-top:4px solid #c79a3b;border-radius:12px;background:#fff;color:#9b2727;font-size:14px;font-weight:800;text-align:center}' +
      '@media(max-width:600px){#ylsDocumentViewer .yls-doc-bar{min-height:calc(52px + env(safe-area-inset-top));padding:calc(7px + env(safe-area-inset-top)) 9px 7px}#ylsDocumentViewer .yls-doc-back{min-height:38px;padding:8px 10px}#ylsDocumentViewer .yls-doc-title{font-size:11px}#ylsDocumentViewer .yls-doc-scroll{height:calc(100dvh - 52px - env(safe-area-inset-top))}#ylsDocumentViewer .yls-doc-pdf{height:calc(100dvh - 52px - env(safe-area-inset-top))}}';
    (document.head || document.documentElement).appendChild(style);

    root = document.createElement('div');
    root.id = 'ylsDocumentViewer';
    root.hidden = true;
    root.innerHTML =
      '<div class="yls-doc-bar">' +
        '<button class="yls-doc-back" type="button">← 一覧に戻る</button>' +
        '<div class="yls-doc-title">資料</div>' +
      '</div>' +
      '<div class="yls-doc-scroll">' +
        '<div class="yls-doc-status">資料を読み込んでいます。</div>' +
        '<div class="yls-doc-pages" hidden></div>' +
      '</div>';
    document.body.appendChild(root);
    root.querySelector('.yls-doc-back').addEventListener('click', closeDocumentViewer);
    return root;
  }

  function revokeDocumentViewerUrls() {
    while (documentViewerObjectUrls.length) {
      try { URL.revokeObjectURL(documentViewerObjectUrls.pop()); } catch (_) {}
    }
  }

  function closeDocumentViewer() {
    var root = document.getElementById('ylsDocumentViewer');
    if (!root || root.hidden) return;
    root.hidden = true;
    revokeDocumentViewerUrls();
    var pages = root.querySelector('.yls-doc-pages');
    if (pages) { pages.replaceChildren(); pages.hidden = true; }
    var status = root.querySelector('.yls-doc-status');
    if (status) { status.className = 'yls-doc-status'; status.textContent = '資料を読み込んでいます。'; status.hidden = false; }
    document.documentElement.style.overflow = root.dataset.htmlOverflow || '';
    document.body.style.overflow = root.dataset.bodyOverflow || '';
    delete root.dataset.htmlOverflow;
    delete root.dataset.bodyOverflow;
  }

  function documentViewerHeaders(section) {
    var headers = {};
    if (section === 'board-tournaments' || section === 'board-meeting-documents' || section === 'referee-documents') {
      var access = '';
      try { access = sessionStorage.getItem('yachiyoAttendancePass') || ''; } catch (_) {}
      if (access) headers['x-access-password'] = access;
    }
    return headers;
  }

  async function renderDocumentViewerPdf(blob, pages, title) {
    var frame = document.createElement('iframe');
    frame.className = 'yls-doc-pdf';
    frame.title = title || '資料';
    frame.setAttribute('loading', 'eager');
    var objectUrl = URL.createObjectURL(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }));
    documentViewerObjectUrls.push(objectUrl);
    await new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error('pdf load timeout'));
      }, 15000);
      frame.onload = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      frame.onerror = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('pdf load failed'));
      };
      frame.src = objectUrl + '#view=FitH';
      pages.appendChild(frame);
    });
  }

  async function renderDocumentViewerImage(blob, pages, title) {
    var image = document.createElement('img');
    image.className = 'yls-doc-page';
    image.alt = title || '資料';
    var objectUrl = URL.createObjectURL(blob);
    documentViewerObjectUrls.push(objectUrl);
    await new Promise(function (resolve, reject) {
      image.onload = resolve;
      image.onerror = reject;
      image.src = objectUrl;
    });
    pages.appendChild(image);
  }

  async function openDocumentViewer(link) {
    var root = ensureDocumentViewer();
    var url = new URL(link.href, location.href);
    var section = documentSectionFromUrl(url);
    var title = documentTitleForLink(link);
    var status = root.querySelector('.yls-doc-status');
    var pages = root.querySelector('.yls-doc-pages');
    root.dataset.htmlOverflow = document.documentElement.style.overflow || '';
    root.dataset.bodyOverflow = document.body.style.overflow || '';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    root.querySelector('.yls-doc-title').textContent = title;
    status.className = 'yls-doc-status';
    status.textContent = '資料を読み込んでいます。';
    status.hidden = false;
    pages.replaceChildren();
    pages.hidden = true;
    root.hidden = false;
    root.querySelector('.yls-doc-scroll').scrollTop = 0;
    revokeDocumentViewerUrls();

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeout = setTimeout(function () {
      try { if (controller) controller.abort(); } catch (_) {}
    }, 30000);
    try {
      var options = { cache: 'no-store', headers: documentViewerHeaders(section) };
      if (controller) options.signal = controller.signal;
      var response = await fetch(url.href, options);
      clearTimeout(timeout);
      if (!response.ok) throw new Error('fetch failed');
      var contentType = String(response.headers.get('content-type') || '').toLowerCase();
      var disposition = String(response.headers.get('content-disposition') || '').toLowerCase();
      var looksPdf = contentType.indexOf('application/pdf') !== -1 || /\.pdf(?:$|[?&#])/.test(url.href.toLowerCase()) || disposition.indexOf('.pdf') !== -1;
      var looksImage = contentType.indexOf('image/') === 0;

      if (!looksPdf && !looksImage) {
        closeDocumentViewer();
        window.location.assign(url.href);
        return;
      }

      var fileBlob = await response.blob();
      if (!fileBlob.size) throw new Error('empty');
      pages.hidden = false;
      if (looksImage) {
        await renderDocumentViewerImage(fileBlob, pages, title);
      } else {
        await renderDocumentViewerPdf(fileBlob, pages, title);
      }
      status.hidden = true;
    } catch (error) {
      clearTimeout(timeout);
      pages.hidden = true;
      status.hidden = false;
      status.className = 'yls-doc-error';
      status.textContent = '資料を開けませんでした。一覧へ戻り、もう一度お試しください。';
    }
  }

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
