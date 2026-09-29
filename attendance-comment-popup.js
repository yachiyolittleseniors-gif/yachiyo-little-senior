/* Reuse the original editor directly below the selected member's row. */
(function () {
  'use strict';
  function boot() {
    var editor = document.getElementById('editor');
    var board = document.getElementById('board');
    if (!editor || !board || typeof window.render !== 'function' ||
        document.getElementById('member-comment-row')) return;
    var home = document.createComment('attendance editor home');
    editor.parentNode.insertBefore(home, editor);
    var originalRender = window.render;
    var previousMember = '';
    function setWidth() {
      if (board.clientWidth) editor.style.width = Math.min(board.clientWidth, 640) + 'px';
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
      if (selected && editor.classList.contains('show')) {
        var memberRow = selected.closest('tr');
        var row = document.createElement('tr');
        row.id = 'member-comment-row';
        var cell = document.createElement('td');
        cell.colSpan = memberRow.cells.length;
        row.appendChild(cell);
        cell.appendChild(editor);
        memberRow.after(row);
        setWidth();
        board.scrollTop = top;
        board.scrollLeft = left;
        if (previousMember !== selected.dataset.selectMember) {
          var head = board.querySelector('thead');
          var headHeight = head ? head.getBoundingClientRect().height : 0;
          var br = board.getBoundingClientRect(), mr = memberRow.getBoundingClientRect();
          if (mr.top < br.top + headHeight || mr.bottom + 80 > br.bottom) {
            board.scrollTop += mr.top - br.top - headHeight;
          }
        }
        previousMember = selected.dataset.selectMember;
      } else {
        previousMember = '';
        board.scrollTop = top;
        board.scrollLeft = left;
      }
      return result;
    };
    window.addEventListener('resize', setWidth, {passive: true});
    window.render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
})();
