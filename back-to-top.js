(() => {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    .back-to-top {
      position: fixed;
      left: max(14px, env(safe-area-inset-left));
      bottom: calc(16px + env(safe-area-inset-bottom));
      z-index: 9000;
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(226,189,103,.75);
      border-radius: 50%;
      background: rgba(7,20,38,.94);
      color: #e2bd67;
      box-shadow: 0 5px 16px rgba(0,0,0,.22);
      font: 700 23px/1 sans-serif;
      cursor: pointer;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transform: translateY(8px);
      transition: opacity .18s, transform .18s, visibility .18s;
    }
    .back-to-top.is-visible {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translateY(0);
    }
    .back-to-top:focus-visible { outline: 2px solid #e2bd67; outline-offset: 3px; }
    body.photo-admin-on .back-to-top,
    body:has(.modal.show, .modal.open, dialog[open], [aria-modal="true"]:not([hidden])) .back-to-top {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'back-to-top';
    button.setAttribute('aria-label', 'このページの先頭へ戻る');
    button.title = 'ページの先頭へ';
    button.textContent = '↑';
    document.body.appendChild(button);

    const update = () => {
      const longPage = document.documentElement.scrollHeight > innerHeight + 600;
      button.classList.toggle('is-visible', longPage && scrollY > 480);
    };
    button.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  });
})();
