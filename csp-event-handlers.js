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

  /* ===== Native PDF with embedded back link =====
   * iPhone Safari must receive a real PDF as the top-level document.
   * We therefore do NOT use an iframe/PDF.js viewer. For PDF routes only,
   * pdf-lib adds a thin header strip + clickable "← 一覧に戻る" link to the
   * PDF bytes, then Safari opens the resulting Blob as a native PDF.
   * If anything fails, we immediately fall back to the original PDF URL.
   */
  var documentViewerLastTrigger = null;
  var documentPdfLibPromise = null;
  var documentPdfObjectUrls = [];
  var nativeWindowOpen = window.open.bind(window);

  function documentSectionFromUrl(url) {
    if (!url || url.origin !== location.origin) return '';
    if (url.pathname !== '/.netlify/functions/site-data') return '';
    return String(url.searchParams.get('section') || '');
  }

  function documentViewerSupportsUrl(url) {
    var section = documentSectionFromUrl(url);
    if (!section) return false;
    if (url.searchParams.get('download') === '1') return false;

    if (section === 'seniorcup-documents' ||
        section === 'result-documents' ||
        section === 'board-tournaments' ||
        section === 'board-meeting-documents' ||
        section === 'referee-documents') {
      return url.searchParams.has('file');
    }

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

    var row = link.parentElement;
    var rowTitle = row && row.querySelector && row.querySelector('.file-name');
    if (rowTitle && rowTitle.textContent.trim()) return rowTitle.textContent.trim();

    var title = link.getAttribute && link.getAttribute('title');
    if (title && title.trim()) return title.trim();

    var label = String(link.textContent || '').trim();
    if (label && !/^(?:資料|PDF|画像)を開く$/.test(label)) return label;
    return '資料';
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

  function loadExternalScript(src, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var finished = false;
      var timer = setTimeout(function () {
        if (finished) return;
        finished = true;
        script.remove();
        reject(new Error('timeout'));
      }, timeoutMs || 5000);
      script.src = src;
      script.async = true;
      script.onload = function () {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve();
      };
      script.onerror = function () {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        script.remove();
        reject(new Error('load failed'));
      };
      document.head.appendChild(script);
    });
  }

  function loadDocumentPdfLib() {
    if (window.PDFLib && window.PDFLib.PDFDocument) return Promise.resolve(window.PDFLib);
    if (documentPdfLibPromise) return documentPdfLibPromise;
    documentPdfLibPromise = loadExternalScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js', 4500)
      .catch(function () {
        return loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', 4500);
      })
      .then(function () {
        if (!window.PDFLib || !window.PDFLib.PDFDocument) throw new Error('pdf-lib unavailable');
        return window.PDFLib;
      })
      .catch(function (error) {
        documentPdfLibPromise = null;
        throw error;
      });
    return documentPdfLibPromise;
  }

  function canvasPngBytes(widthPx, heightPx, title) {
    var canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#071426';
    ctx.fillRect(0, 0, widthPx, heightPx);

    var buttonX = 12, buttonY = 8, buttonW = 220, buttonH = heightPx - 16;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#e2bd67';
    ctx.fillStyle = '#071426';
    ctx.beginPath();
    var r = 14;
    ctx.moveTo(buttonX + r, buttonY);
    ctx.lineTo(buttonX + buttonW - r, buttonY);
    ctx.quadraticCurveTo(buttonX + buttonW, buttonY, buttonX + buttonW, buttonY + r);
    ctx.lineTo(buttonX + buttonW, buttonY + buttonH - r);
    ctx.quadraticCurveTo(buttonX + buttonW, buttonY + buttonH, buttonX + buttonW - r, buttonY + buttonH);
    ctx.lineTo(buttonX + r, buttonY + buttonH);
    ctx.quadraticCurveTo(buttonX, buttonY + buttonH, buttonX, buttonY + buttonH - r);
    ctx.lineTo(buttonX, buttonY + r);
    ctx.quadraticCurveTo(buttonX, buttonY, buttonX + r, buttonY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e2bd67';
    ctx.font = 'bold 30px -apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",Meiryo,sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('← 一覧に戻る', 34, heightPx / 2 + 1);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 25px -apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",Meiryo,sans-serif';
    var safeTitle = String(title || '資料').replace(/\s+/g, ' ').trim();
    if (safeTitle.length > 28) safeTitle = safeTitle.slice(0, 27) + '…';
    ctx.fillText(safeTitle || '資料', 260, heightPx / 2 + 1);

    var dataUrl = canvas.toDataURL('image/png');
    var base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function addPdfUriLink(pdfDoc, page, backUrl, rect) {
    var PDFLib = window.PDFLib;
    var annotation = pdfDoc.context.obj({
      Type: PDFLib.PDFName.of('Annot'),
      Subtype: PDFLib.PDFName.of('Link'),
      Rect: rect,
      Border: [0, 0, 0],
      A: pdfDoc.context.obj({
        Type: PDFLib.PDFName.of('Action'),
        S: PDFLib.PDFName.of('URI'),
        URI: PDFLib.PDFString.of(backUrl)
      })
    });
    var annotationRef = pdfDoc.context.register(annotation);
    var annotsKey = PDFLib.PDFName.of('Annots');
    var annots = page.node.get(annotsKey);
    if (annots && typeof annots.push === 'function') {
      annots.push(annotationRef);
    } else {
      page.node.set(annotsKey, pdfDoc.context.obj([annotationRef]));
    }
  }

  async function buildNativePdfWithBackButton(arrayBuffer, backUrl, title) {
    await loadDocumentPdfLib();
    var PDFLib = window.PDFLib;
    var pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true, updateMetadata: false });
    var pages = pdfDoc.getPages();
    if (!pages.length) throw new Error('empty pdf');

    try { pdfDoc.setTitle(String(title || '資料')); } catch (_) {}

    var headerPngBytes = canvasPngBytes(1200, 72, title);
    var headerImage = await pdfDoc.embedPng(headerPngBytes);
    var stripHeight = 36;

    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      var size = page.getSize();
      var oldWidth = size.width;
      var oldHeight = size.height;
      page.setSize(oldWidth, oldHeight + stripHeight);
      page.drawImage(headerImage, {
        x: 0,
        y: oldHeight,
        width: oldWidth,
        height: stripHeight
      });
      addPdfUriLink(pdfDoc, page, backUrl, [6, oldHeight + 4, Math.min(122, oldWidth - 6), oldHeight + stripHeight - 4]);
    }

    return pdfDoc.save({ useObjectStreams: false });
  }

  function rememberPdfObjectUrl(url) {
    documentPdfObjectUrls.push(url);
    while (documentPdfObjectUrls.length > 4) {
      try { URL.revokeObjectURL(documentPdfObjectUrls.shift()); } catch (_) {}
    }
  }

  function writePdfPreparingPage(popup) {
    if (!popup) return;
    try {
      popup.document.open();
      popup.document.write('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>PDFを準備しています</title><style>html,body{height:100%;margin:0;background:#f3f3f1;color:#6f7883;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",Meiryo,sans-serif}body{display:grid;place-items:center;font-weight:800}</style><div>PDFを準備しています。</div>');
      popup.document.close();
    } catch (_) {}
  }

  function navigateDocumentResult(popup, url) {
    if (popup && !popup.closed) {
      try { popup.location.replace(url); return; } catch (_) {}
    }
    window.location.assign(url);
  }

  function openDocumentUrl(urlLike, title, forceNewTab) {
    var url;
    try { url = new URL(urlLike, location.href); } catch (_) { return false; }
    if (!documentViewerSupportsUrl(url)) return false;

    var popup = null;
    if (forceNewTab) {
      popup = nativeWindowOpen('', '_blank');
      if (popup) writePdfPreparingPage(popup);
    }

    var sourceUrl = location.href;
    var section = documentSectionFromUrl(url);

    (async function () {
      try {
        var response = await fetch(url.href, {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: documentViewerHeaders(section)
        });
        if (!response.ok) throw new Error('fetch failed');

        var contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (contentType.indexOf('application/pdf') === -1) {
          navigateDocumentResult(popup, url.href);
          return;
        }

        var sourceBytes = await response.arrayBuffer();
        if (!sourceBytes.byteLength) throw new Error('empty');
        var pdfBytes = await buildNativePdfWithBackButton(sourceBytes, sourceUrl, title || '資料');
        var blobUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
        rememberPdfObjectUrl(blobUrl);
        navigateDocumentResult(popup, blobUrl);
      } catch (_) {
        // Safety first: a failed enhancement must never stop the original PDF.
        navigateDocumentResult(popup, url.href);
      }
    })();

    return true;
  }

  function openDocumentViewer(link) {
    var url;
    try { url = new URL(link.href, location.href); } catch (_) { return false; }
    var forceNewTab = String(link.target || '').toLowerCase() === '_blank';
    return openDocumentUrl(url.href, documentTitleForLink(link), forceNewTab);
  }

  document.addEventListener('click', function (ev) {
    var link = ev.target && ev.target.closest ? ev.target.closest('a') : null;
    if (link) documentViewerLastTrigger = link;
  }, true);

  window.open = function (url, target, features) {
    if (typeof url === 'string' && url) {
      var title = documentTitleForLink(documentViewerLastTrigger);
      if (openDocumentUrl(url, title, true)) {
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
