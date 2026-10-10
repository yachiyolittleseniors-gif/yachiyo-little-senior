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

  /* ===== Document back control =====
   * Normal browsers receive a native PDF with a small embedded back control.
   * iOS 26 Safari/PDFKit does not reliably activate link annotations inside PDFs,
   * so those devices use the original PDF inside Safari with a real HTML back
   * button outside the PDF. This keeps the PDF untouched and makes the control
   * reliably tappable. If anything fails, the original document URL still opens.
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


  function isIOS26PdfKit() {
    var ua = String(navigator.userAgent || '');
    var platform = String(navigator.platform || '');
    var touchMac = platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1;
    var iphoneIpad = /iPhone|iPad|iPod/i.test(ua) || touchMac;
    if (!iphoneIpad) return false;
    // Safari/WKWebView on iOS/iPadOS 26. Links embedded as PDF annotations can
    // be visually present but ignore taps, so use a real HTML button instead.
    return /(?:CPU (?:iPhone )?OS|OS) 26[_\.]/i.test(ua) || /Version\/26(?:\.|\s)/i.test(ua);
  }

  function buildIOS26PdfShell(popup, documentUrl, sourceUrl, title) {
    if (!popup) return false;
    try {
      var doc = popup.document;
      doc.open();
      doc.write('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title></title></head><body></body></html>');
      doc.close();
      doc.title = String(title || '資料');

      var style = doc.createElement('style');
      style.textContent =
        'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#ececea;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",Meiryo,sans-serif}' +
        '.yls-pdf-frame{position:fixed;inset:0 0 calc(82px + env(safe-area-inset-bottom)) 0;width:100%;height:calc(100dvh - 82px - env(safe-area-inset-bottom));border:0;background:#fff}' +
        '.yls-pdf-footer{position:fixed;left:0;right:0;bottom:0;height:calc(82px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom);box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:#ececea;border-top:1px solid #dfdfdc}' +
        '.yls-pdf-back{appearance:none;-webkit-appearance:none;width:116px;height:50px;padding:0 10px;border:2px solid #c79a3b;border-radius:10px;background:#071426;color:#e2bd67;font:800 16px/1 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",Meiryo,sans-serif;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}' +
        '.yls-pdf-back:active{transform:translateY(1px)}';
      doc.head.appendChild(style);

      var frame = doc.createElement('iframe');
      frame.className = 'yls-pdf-frame';
      frame.title = String(title || '資料');
      frame.src = String(documentUrl || '');

      var footer = doc.createElement('div');
      footer.className = 'yls-pdf-footer';
      var back = doc.createElement('button');
      back.className = 'yls-pdf-back';
      back.type = 'button';
      back.textContent = '一覧へ戻る';
      back.setAttribute('aria-label', '資料一覧へ戻る');
      back.addEventListener('click', function () {
        // These document windows are created by this page, so closing them is
        // the cleanest return path. If the browser refuses, return explicitly.
        try {
          if (popup.opener && !popup.opener.closed) {
            popup.close();
            return;
          }
        } catch (_) {}
        try { popup.location.replace(String(sourceUrl || '/')); }
        catch (_) { window.location.assign(String(sourceUrl || '/')); }
      });
      footer.appendChild(back);
      doc.body.appendChild(frame);
      doc.body.appendChild(footer);
      return true;
    } catch (_) {
      return false;
    }
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

  function canvasPngBytes(widthPx, heightPx) {
    var canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    var ctx = canvas.getContext('2d');

    // Keep the PDF itself clean: no full-width navy header and no "資料" title.
    // Only the back button is drawn, at the upper-right where Safari's page counter
    // (e.g. 1/2) will not cover it.
    ctx.clearRect(0, 0, widthPx, heightPx);
    var buttonW = 220, buttonH = heightPx - 12;
    var buttonX = widthPx - buttonW - 10, buttonY = 6;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#c79a3b';
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
    ctx.fillText('← 一覧に戻る', buttonX + 22, heightPx / 2 + 1);

    var dataUrl = canvas.toDataURL('image/png');
    var base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function addPdfUriLink(pdfDoc, page, backUrl, rect) {
    var PDFLib = window.PDFLib;
    var action = pdfDoc.context.obj({
      Type: PDFLib.PDFName.of('Action'),
      S: PDFLib.PDFName.of('URI'),
      URI: PDFLib.PDFString.of(String(backUrl || ''))
    });
    var annotation = pdfDoc.context.obj({
      Type: PDFLib.PDFName.of('Annot'),
      Subtype: PDFLib.PDFName.of('Link'),
      Rect: rect,
      Border: [0, 0, 0],
      H: PDFLib.PDFName.of('I'),
      P: page.ref,
      A: action
    });
    var annotationRef = pdfDoc.context.register(annotation);
    var annotsKey = PDFLib.PDFName.of('Annots');
    var annots = null;

    // Annots is often stored as an indirect reference. Resolve it before
    // appending; replacing a referenced array can make Safari/PDFKit ignore
    // the newly-added link on some PDFs.
    try {
      if (typeof page.node.lookupMaybe === 'function' && PDFLib.PDFArray) {
        annots = page.node.lookupMaybe(annotsKey, PDFLib.PDFArray);
      }
    } catch (_) {}
    if (!annots) {
      try {
        var directAnnots = page.node.get(annotsKey);
        if (directAnnots && typeof directAnnots.push === 'function') annots = directAnnots;
      } catch (_) {}
    }
    if (annots && typeof annots.push === 'function') {
      annots.push(annotationRef);
    } else {
      page.node.set(annotsKey, pdfDoc.context.obj([annotationRef]));
    }
  }

  function canvasCupBackButtonPngBytes(widthPx, heightPx) {
    var canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, widthPx, heightPx);

    // Match the compact button used by the secretariat/referee saved files.
    var margin = 8;
    var buttonW = widthPx - margin * 2;
    var buttonH = heightPx - margin * 2;
    var buttonX = margin;
    var buttonY = margin;
    var r = Math.max(18, Math.round(buttonH * 0.20));
    ctx.fillStyle = '#071426';
    ctx.strokeStyle = '#c79a3b';
    ctx.lineWidth = 5;
    ctx.beginPath();
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
    ctx.font = 'bold 56px -apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",Meiryo,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('一覧へ戻る', widthPx / 2, heightPx / 2 + 2);

    var dataUrl = canvas.toDataURL('image/png');
    var base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function buildNativePdfWithBackButton(arrayBuffer, backUrl, title, section) {
    await loadDocumentPdfLib();
    var PDFLib = window.PDFLib;
    var pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true, updateMetadata: false });
    var pages = pdfDoc.getPages();
    if (!pages.length) throw new Error('empty pdf');

    try { pdfDoc.setTitle(String(title || '資料')); } catch (_) {}

    var isSeniorCupFile = section === 'seniorcup-documents' || section === 'downloads-guideline';

    if (isSeniorCupFile) {
      // Yachiyo Little Senior Cup PDFs use the same clean "一覧へ戻る" style
      // as the saved-document viewer: one centered button, once per PDF.
      // Put it after the document on the last page so multi-page PDFs do not
      // repeat the control between pages.
      var cupPage = pages[pages.length - 1];
      var cupSize = cupPage.getSize();
      var cupWidth = cupSize.width;
      var cupHeight = cupSize.height;
      var cupStripHeight = 112;

      // Make room below the original page content. The control is intentionally
      // large on phones, and the *whole grey strip* is a hyperlink so taps do
      // not have to land on a tiny PDF annotation rectangle.
      if (typeof cupPage.translateContent === 'function') {
        cupPage.setSize(cupWidth, cupHeight + cupStripHeight);
        cupPage.translateContent(0, cupStripHeight);
        cupPage.drawRectangle({
          x: 0,
          y: 0,
          width: cupWidth,
          height: cupStripHeight,
          color: PDFLib.rgb(0.93, 0.93, 0.92)
        });
        var cupButtonBytes = canvasCupBackButtonPngBytes(720, 300);
        var cupButtonImage = await pdfDoc.embedPng(cupButtonBytes);
        var imageW = Math.min(156, Math.max(128, cupWidth * 0.24));
        var imageH = Math.min(62, Math.max(52, imageW * (300 / 720)));
        var imageX = (cupWidth - imageW) / 2;
        var imageY = (cupStripHeight - imageH) / 2;
        cupPage.drawImage(cupButtonImage, {
          x: imageX,
          y: imageY,
          width: imageW,
          height: imageH
        });
        // Safari/PDFKit can be unforgiving with very small link annotations.
        // Make the entire added strip clickable while the visible button shows
        // the intended target.
        addPdfUriLink(pdfDoc, cupPage, backUrl, [0, 0, cupWidth, cupStripHeight]);
        return pdfDoc.save({ useObjectStreams: false });
      }
    }

    var headerPngBytes = canvasPngBytes(1200, 64);
    var headerImage = await pdfDoc.embedPng(headerPngBytes);
    var stripHeight = 32;

    // Other document sections keep the proven one-button-on-first-page behavior.
    var page = pages[0];
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
    addPdfUriLink(pdfDoc, page, backUrl, [Math.max(6, oldWidth - 116), oldHeight + 3, oldWidth - 5, oldHeight + stripHeight - 3]);

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

    // iOS 26 Safari displays PDF link annotations but may ignore taps. Use a
    // real HTML button outside the original PDF on those devices. The document
    // itself is still loaded from the untouched PDF URL.
    if (isIOS26PdfKit()) {
      if (!popup || popup.closed) popup = nativeWindowOpen('', '_blank');
      if (popup && buildIOS26PdfShell(popup, url.href, sourceUrl, title || '資料')) return true;
      navigateDocumentResult(popup, url.href);
      return true;
    }

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
        var pdfBytes = await buildNativePdfWithBackButton(sourceBytes, sourceUrl, title || '資料', section);
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
