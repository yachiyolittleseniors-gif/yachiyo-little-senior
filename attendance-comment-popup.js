/* Show the editor below the selected member without clipping it to the table. */
(function () {
  'use strict';
  function boot() {
    var editor = document.getElementById('editor');
    var board = document.getElementById('board');
    if (!editor || !board || typeof window.render !== 'function' ||
        document.getElementById('member-comment-overlay')) return;
    var home = document.createComment('attendance editor home');
    editor.parentNode.insertBefore(home, editor);
    var container = board.parentNode;
    container.style.position = 'relative';
    var overlay = document.createElement('div');
    overlay.id = 'member-comment-overlay';
    overlay.style.cssText = 'display:none;position:absolute;z-index:20;width:min(640px,calc(100% - 2px));max-height:min(72dvh,650px);overflow:auto;background:#fffdf6;border:1px solid #c6a052;border-left:4px solid #c6a052;box-shadow:0 15px 32px rgba(7,20,38,.22);box-sizing:border-box;';
    board.after(overlay);
    editor.style.cssText = 'box-sizing:border-box;display:none;width:100%;max-width:none;margin:0;padding:16px;border:0;background:#fffdf6;text-align:left;white-space:normal;';
    var textarea = editor.querySelector('textarea');
    if (textarea) {
      textarea.style.fontSize = '16px';
      textarea.style.minHeight = '120px';
      textarea.style.lineHeight = '1.6';
    }
    var originalRender = window.render;
    var previousMember = '';
    function positionOverlay() {
      if (overlay.style.display === 'none') return;
      var selected = board.querySelector('[data-select-member].selected');
      var memberRow = selected && selected.closest('tr');
      if (!memberRow) return;
      var outer = container.getBoundingClientRect();
      var bounds = board.getBoundingClientRect();
      var row = memberRow.getBoundingClientRect();
      var head = board.querySelector('thead');
      var headHeight = head ? head.getBoundingClientRect().height : 0;
      var anchor = Math.max(bounds.top + headHeight, Math.min(row.bottom, bounds.bottom));
      overlay.style.left = (bounds.left - outer.left) + 'px';
      overlay.style.top = (anchor - outer.top) + 'px';
      overlay.style.width = Math.min(board.clientWidth, 640) + 'px';
    }
    window.render = function () {
      var top = board.scrollTop, left = board.scrollLeft;
      // The original render replaces the table. Keep the editor and its handlers alive.
      home.parentNode.insertBefore(editor, home.nextSibling);
      var result = originalRender.apply(this, arguments);
      var selected = board.querySelector('[data-select-member].selected');
      board.querySelectorAll('[data-select-member]').forEach(function (button) {
        button.setAttribute('aria-expanded', button === selected ? 'true' : 'false');
        button.setAttribute('aria-controls', 'editor');
      });
      board.scrollTop = top;
      board.scrollLeft = left;
      if (selected && editor.classList.contains('show')) {
        overlay.appendChild(editor);
        editor.style.display = 'block';
        overlay.style.display = 'block';
        if (previousMember !== selected.dataset.selectMember) {
          var memberRow = selected.closest('tr');
          var head = board.querySelector('thead');
          var headHeight = head ? head.getBoundingClientRect().height : 0;
          var br = board.getBoundingClientRect(), mr = memberRow.getBoundingClientRect();
          if (mr.top < br.top + headHeight || mr.bottom + 80 > br.bottom) {
            board.scrollTop += mr.top - br.top - headHeight;
          }
          overlay.scrollTop = 0;
        }
        previousMember = selected.dataset.selectMember;
        positionOverlay();
      } else {
        previousMember = '';
        editor.style.display = 'none';
        overlay.style.display = 'none';
      }
      return result;
    };
    board.addEventListener('scroll', positionOverlay, {passive: true});
    window.addEventListener('resize', positionOverlay, {passive: true});
    window.render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
})();
