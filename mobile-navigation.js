(() => {
  'use strict';
  const pageKey = url => {
    const path = new URL(url, location.href).pathname.replace(/\/+$/, '');
    const name = path.split('/').pop() || 'index';
    return name.replace(/\.html$/i, '').toLowerCase();
  };
  function init() {
    const current = pageKey(location.href);
    const menus = document.querySelectorAll('.mobile-links,.site-menu');
    const cupLinks = [];
    menus.forEach(menu => {
      menu.querySelectorAll('a[href]').forEach(link => {
        const url = new URL(link.getAttribute('href'), location.href);
        if (url.origin === location.origin && pageKey(url.href) === current) link.remove();
      });
      if (current === 'seniorcup') return;
      let link = [...menu.querySelectorAll('a[href]')].find(item => pageKey(item.href) === 'seniorcup');
      if (!link) {
        link = document.createElement('a');
        link.href = './seniorcup';
        link.textContent = '八千代リトルシニア杯';
        const terms = [...menu.querySelectorAll('a[href]')].find(item => pageKey(item.href) === 'terms');
        const team = [...menu.querySelectorAll('a[href]')].find(item => pageKey(item.href) === 'board');
        if (terms || team) menu.insertBefore(link, terms || team);
        else menu.appendChild(link);
      }
      link.setAttribute('data-seniorcup-menu-link', '');
      cupLinks.push(link);
    });
    if (!cupLinks.length) return;
    function apply(visible) {
      cupLinks.forEach(link => {
        if (visible) link.style.removeProperty('display');
        else link.style.setProperty('display', 'none', 'important');
        link.setAttribute('aria-hidden', String(!visible));
      });
    }
    let visible = true;
    try { visible = localStorage.getItem('yachiyoSeniorCupVisible') !== 'false'; } catch (_) {}
    apply(visible);
    fetch('/.netlify/functions/site-data?section=seniorcup-settings', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(json => {
        if (typeof json?.data?.visible !== 'boolean') return;
        visible = json.data.visible;
        try { localStorage.setItem('yachiyoSeniorCupVisible', String(visible)); } catch (_) {}
        apply(visible);
      }).catch(() => {});
    new MutationObserver(() => {
      if (document.documentElement.classList.contains('seniorcup-hidden')) apply(false);
      else if (document.querySelector('.seniorcup-home-banner')) apply(true);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

