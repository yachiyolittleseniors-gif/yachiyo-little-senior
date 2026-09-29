/* The existing attendance editor is reused; loading/saving stays in attendance.html. */
(function () {
  'use strict';
  function boot() {
    var editor = document.getElementById('editor');
    if (!editor || document.getElementById('commentPopup')) return;
    var popup = document.createElement('dialog');
    if (typeof popup.showModal !== 'function') return;
    popup.id = 'commentPopup';
    popup.setAttribute('aria-labelledby', 'commentPopupTitle');
    popup.setAttribute('aria-describedby', 'editorName');
    var header = document.createElement('div');
    header.className = 'comment-popup-head';
    var title = document.createElement('h2');
    title.id = 'commentPopupTitle';
    title.textContent = 'コメント入力';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'comment-popup-close';
    close.textContent = '閉じる';
    header.append(title, close);
    var error = document.createElement('div');
    error.className = 'comment-popup-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    popup.append(header, error);
    document.body.appendChild(popup);
    popup.appendChild(editor);

    var returnMember = '', previousOverflow = '';
    function selectedButton() {
      return document.querySelector('#board [data-select-member].selected');
    }
    function openFor(button) {
      var selected = selectedButton();
      if (!selected || selected.dataset.selectMember !== button.dataset.selectMember ||
          !editor.classList.contains('show') || popup.open) return;
      returnMember = selected.dataset.selectMember;
      previousOverflow = document.body.style.overflow;
      popup.showModal();
      document.body.style.overflow = 'hidden';
      popup.scrollTop = 0;
      close.focus({preventScroll: true});
    }
    close.addEventListener('click', function () { popup.close(); });
    popup.addEventListener('click', function (event) {
      if (event.target !== popup) return;
      var r = popup.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right ||
          event.clientY < r.top || event.clientY > r.bottom) popup.close();
    });
    popup.addEventListener('close', function () {
      document.body.style.overflow = previousOverflow;
      var buttons = document.querySelectorAll('#board [data-select-member]');
      for (var i = 0; i < buttons.length; i++) {
        if (buttons[i].dataset.selectMember === returnMember) {
          buttons[i].focus({preventScroll: true});
          break;
        }
      }
    });
    // Reopening the selected person's editor must not toggle their selection off.
    document.addEventListener('click', function (event) {
      var button = event.target.closest && event.target.closest('#board [data-select-member]');
      var selected = selectedButton();
      if (button && selected && selected.dataset.selectMember === button.dataset.selectMember) {
        event.preventDefault();
        event.stopPropagation();
        openFor(button);
      } else if (button) {
        // render() replaces the clicked row. Keep its identity before it detaches.
        setTimeout(function () { openFor(button); }, 0);
      }
    }, true);
    new MutationObserver(function () {
      if (popup.open && !editor.classList.contains('show')) popup.close();
    }).observe(editor, {attributes: true, attributeFilter: ['class']});
    var sourceError = document.getElementById('errorBox');
    if (sourceError) {
      function syncError() {
        error.textContent = sourceError.textContent;
        error.hidden = !sourceError.classList.contains('show');
      }
      new MutationObserver(syncError).observe(sourceError, {attributes: true, childList: true, characterData: true, subtree: true});
      syncError();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
})();
