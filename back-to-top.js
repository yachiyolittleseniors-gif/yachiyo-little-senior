(() => {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    .back-to-top {
      position: fixed;
      right: max(14px, env(safe-area-inset-right));
      bottom: calc(72px + env(safe-area-inset-bottom));
      z-index: 9000;
      width: 44px;
      height: 44px;
      padding: 0;
      line-height: 1;
      display: grid;
      place-items: center;
      border: 1px solid rgba(226,189,103,.55);
      border-radius: 12px;
      background: rgba(7,20,38,.92);
      color: #e2bd67;
      box-shadow: 0 4px 12px rgba(0,0,0,.16);
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
    .back-to-top svg { display: block; width: 20px; height: 20px; }
    body.photo-admin-on .back-to-top,
    body:has(.modal.show, .modal.open, dialog[open], [aria-modal="true"]:not([hidden]):not([aria-hidden="true"]):not([hidden] *):not([aria-hidden="true"] *)) .back-to-top {
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
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 14 7-7 7 7"/></svg>';
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
