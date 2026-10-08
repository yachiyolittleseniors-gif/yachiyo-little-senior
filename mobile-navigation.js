(() => {
  'use strict';
  const pageKey = url => {
    const path = new URL(url, location.href).pathname.replace(/\/+$/, '');
    const name = path.split('/').pop() || 'index';
    return name.replace(/\.html$/i, '').toLowerCase();
  };
  function installUnifiedMenuStyle(){
    if(document.getElementById('yls-unified-hamburger-style'))return;
    const style=document.createElement('style');
    style.id='yls-unified-hamburger-style';
    style.textContent=`
@media(max-width:900px){
  .mobile-links,
  .site-menu{
    position:fixed!important;
    top:var(--yls-menu-top,70px)!important;
    right:max(12px,env(safe-area-inset-right))!important;
    left:auto!important;
    width:min(330px,calc(100vw - 72px))!important;
    max-width:calc(100vw - 24px)!important;
    height:auto!important;
    max-height:calc(100dvh - var(--yls-menu-top,70px) - 12px)!important;
    margin:0!important;
    padding:8px 16px 12px!important;
    overflow-y:auto!important;
    overscroll-behavior:contain!important;
    box-sizing:border-box!important;
    background:rgba(7,20,38,.985)!important;
    border:1px solid rgba(199,154,59,.58)!important;
    border-radius:14px!important;
    box-shadow:0 16px 34px rgba(0,0,0,.28)!important;
    z-index:10001!important;
  }
  .mobile-links:not(.show),
  .site-menu:not(.open){display:none!important}
  .mobile-links.show,
  .site-menu.open{display:grid!important}
  .mobile-links a,
  .site-menu a{
    display:block!important;
    width:100%!important;
    min-height:0!important;
    margin:0!important;
    padding:14px 4px!important;
    border:0!important;
    border-bottom:1px solid rgba(255,255,255,.10)!important;
    border-radius:0!important;
    background:transparent!important;
    color:#fff!important;
    -webkit-text-fill-color:#fff!important;
    box-shadow:none!important;
    font-size:15px!important;
    font-weight:700!important;
    line-height:1.45!important;
    text-align:left!important;
    text-decoration:none!important;
    box-sizing:border-box!important;
  }
  .mobile-links a:last-child,
  .site-menu a:last-child{border-bottom:0!important}
}
@media(max-width:390px){
  .mobile-links,
  .site-menu{width:min(310px,calc(100vw - 64px))!important}
}
`;
    document.head.appendChild(style);
  }
  function syncUnifiedMenuTop(){
    const header=document.querySelector('.header,.site-header');
    if(!header)return;
    const rect=header.getBoundingClientRect();
    const top=Math.max(8,Math.round(rect.bottom+6));
    document.querySelectorAll('.mobile-links,.site-menu').forEach(menu=>{
      menu.style.setProperty('--yls-menu-top',top+'px');
    });
  }
  function observeUnifiedMenus(){
    const menus=document.querySelectorAll('.mobile-links,.site-menu');
    if(!menus.length)return;
    const observer=new MutationObserver(syncUnifiedMenuTop);
    menus.forEach(menu=>observer.observe(menu,{attributes:true,attributeFilter:['class']}));
    window.addEventListener('resize',syncUnifiedMenuTop,{passive:true});
    window.addEventListener('orientationchange',syncUnifiedMenuTop,{passive:true});
    syncUnifiedMenuTop();
  }
  function init() {
    installUnifiedMenuStyle();
    observeUnifiedMenus();
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


// Shared compact footer: preserve existing copyright and management elements.
(() => {
  'use strict';

  const currentScript = document.currentScript;
  const siteBase = new URL('./', currentScript && currentScript.src ? currentScript.src : location.href);
  const groundMap = 'https://www.google.com/maps/search/?api=1&query=%E5%85%AB%E5%8D%83%E4%BB%A3%E3%83%AA%E3%83%88%E3%83%AB%E3%82%B7%E3%83%8B%E3%82%A2%E3%82%B0%E3%83%A9%E3%82%A6%E3%83%B3%E3%83%89&query_place_id=ChIJP8kykQ5-ImARHFM8jqcihPs';
  const socialLinks = [
    ['Instagram', 'https://www.instagram.com/yachiyo_little_senior/'],
    ['Facebook', 'https://www.facebook.com/874baseball']
  ];

  function installFooterStyle() {
    if (document.getElementById('yls-compact-footer-style')) return;
    const style = document.createElement('style');
    style.id = 'yls-compact-footer-style';
    style.textContent = [
      'footer.yls-compact-footer{display:block!important;box-sizing:border-box!important;width:100%!important;max-width:none!important;margin:0!important;padding:22px 18px 18px!important;background:#071426!important;color:#b8c3cf!important;border:0!important;border-top:1px solid rgba(199,154,59,.38)!important;border-radius:0!important;text-align:center!important;line-height:1.6!important}',
      'footer.yls-compact-footer>.restored-footer-inner{display:block!important;box-sizing:border-box!important;width:100%!important;max-width:1180px!important;margin:0 auto!important;padding:0!important}',
      'footer.yls-compact-footer .yls-compact-footer-details{display:flex!important;flex-direction:column!important;align-items:center!important;gap:0!important;margin:0!important;padding:0!important}',
      'footer.yls-compact-footer .yls-compact-footer-details a{box-sizing:border-box!important;max-width:100%!important;margin:0!important;border:0!important;background:none!important;text-decoration:none!important;letter-spacing:.02em!important;line-height:1.65!important}',
      'footer.yls-compact-footer .yls-compact-footer-address{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;min-height:32px!important;padding:5px 4px!important;color:#dec38a!important;font-size:13px!important;font-weight:600!important}',
      'footer.yls-compact-footer .yls-compact-footer-address span:last-child{flex:none;font-size:12px!important}',
      'footer.yls-compact-footer .yls-compact-footer-alias{margin:4px 0 0!important;padding:0!important;color:#b8c3cf!important;font-size:12px!important;font-weight:500!important;letter-spacing:.02em!important;line-height:1.7!important}',
      'footer.yls-compact-footer .yls-compact-footer-privacy{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:32px!important;padding:6px 8px!important;color:#aab6c4!important;font-size:11px!important;font-weight:400!important}',
      'footer.yls-compact-footer .yls-compact-footer-details a:hover{color:#f0d89e!important}',
      'footer.yls-compact-footer .yls-compact-footer-details a:focus-visible{outline:2px solid #dec38a;outline-offset:2px;border-radius:3px}',
      'footer.yls-compact-footer .yls-compact-footer-copy{display:block!important;max-width:100%!important;margin:10px 0 0!important;padding:9px 0 0!important;border:0!important;border-top:1px solid rgba(255,255,255,.08)!important;color:#8f9eae!important;font-size:10px!important;font-weight:400!important;letter-spacing:.02em!important;line-height:1.6!important;text-align:center!important;white-space:normal!important;overflow-wrap:anywhere}',
      '@media(min-width:901px){footer.yls-compact-footer{padding:26px 24px 20px!important}}',
      '@media(min-width:1200px){.site-header .site-menu>a.yls-footer-social-link{display:none!important}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function addSocialLinks() {
    document.querySelectorAll('.mobile-links,.site-menu').forEach(menu => {
      socialLinks.forEach(([label, href]) => {
        const exists = Array.from(menu.querySelectorAll('a[href]')).some(link =>
          link.href.replace(/\/$/, '') === href.replace(/\/$/, '')
        );
        if (exists) return;
        const link = document.createElement('a');
        link.className = 'yls-footer-social-link';
        link.href = href;
        link.textContent = label;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        menu.appendChild(link);
      });
    });
  }

  function simplifyFooter(footer) {
    if (footer.dataset.ylsCompactFooter === 'true') return;
    const container = footer.querySelector('.restored-footer-inner') || footer;
    let copyright = footer.querySelector('.restored-footer-copy,.footer-copy,#adminReveal');

    // Bare footers contain a text node, or a text node and the live #year span.
    if (!copyright) {
      copyright = document.createElement('div');
      copyright.className = 'restored-footer-copy';
      Array.from(container.childNodes).forEach(node => copyright.appendChild(node));
      container.appendChild(copyright);
    }

    footer.querySelectorAll('.restored-footer-nav,.ground-address,.restored-footer-alias,.footer-privacy-link,.footer-privacy').forEach(node => node.remove());

    const details = document.createElement('div');
    details.className = 'yls-compact-footer-details';

    const address = document.createElement('a');
    address.className = 'yls-compact-footer-address';
    address.href = groundMap;
    address.target = '_blank';
    address.rel = 'noopener noreferrer';
    address.setAttribute('aria-label', '千葉県八千代市島田台775のグラウンドをGoogleマップで開く（新しいタブ）');
    const addressText = document.createElement('span');
    addressText.textContent = '千葉県八千代市島田台775';
    const arrow = document.createElement('span');
    arrow.textContent = '↗';
    arrow.setAttribute('aria-hidden', 'true');
    address.appendChild(addressText);
    address.appendChild(arrow);

    const alias = document.createElement('div');
    alias.className = 'yls-compact-footer-alias';
    alias.textContent = '八千代リトルシニア 公式サイト';

    const privacy = document.createElement('a');
    privacy.className = 'yls-compact-footer-privacy';
    privacy.href = new URL('privacy', siteBase).href;
    privacy.textContent = 'プライバシーポリシー';

    details.appendChild(address);
    details.appendChild(alias);
    details.appendChild(privacy);
    container.insertBefore(details, copyright);
    copyright.classList.add('yls-compact-footer-copy');
    footer.classList.add('yls-compact-footer');
    footer.dataset.ylsCompactFooter = 'true';
  }

  function initCompactFooters() {
    const footers = document.querySelectorAll('body > footer');
    if (!footers.length) return;
    installFooterStyle();
    addSocialLinks();
    footers.forEach(simplifyFooter);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompactFooters, { once: true });
  } else {
    initCompactFooters();
  }
})();

// Scroll-aware header: retain the existing fixed layout and dropdown positioning.
(() => {
  'use strict';

  function initScrollHeader() {
    const header = document.querySelector('body > header.header,body > header.site-header');
    if (!header || header.dataset.ylsScrollHeader === 'true') return;
    header.dataset.ylsScrollHeader = 'true';

    if (!document.getElementById('yls-scroll-header-style')) {
      const style = document.createElement('style');
      style.id = 'yls-scroll-header-style';
      style.textContent = [
        'body>header.yls-scroll-header{top:0!important;transition:top .26s ease!important}',
        'body>header.yls-scroll-header.yls-header-hidden{top:var(--yls-header-hidden-top,-120px)!important;box-shadow:none!important;pointer-events:none!important}',
        'body>header.yls-scroll-header.yls-header-pinned{transition:none!important}',
        '@media(prefers-reduced-motion:reduce){body>header.yls-scroll-header{transition:none!important}}'
      ].join('\n');
      document.head.appendChild(style);
    }

    const menus = Array.from(header.querySelectorAll('.mobile-links,.site-menu'));
    const toggles = Array.from(header.querySelectorAll('.menu,.site-menu-button'));
    const adminClasses = ['photo-admin-on', 'staff-editing', 'admin-mode', 'editing', 'contact-modal-open'];
    const adminPanels = Array.from(document.querySelectorAll('#adminModal,#densukeAdminPanel'));
    let keyboardInput = false;
    let headerHeight = 0;
    let framePending = false;
    let viewportWidth = window.innerWidth;

    function scrollY() {
      const root = document.scrollingElement || document.documentElement;
      const maxY = Math.max(0, root.scrollHeight - (root.clientHeight || window.innerHeight));
      return Math.min(maxY, Math.max(0, window.scrollY || root.scrollTop || 0));
    }

    let anchorY = scrollY();

    function isPinned() {
      const menuButtonVisible = toggles.some(button => button.getClientRects().length > 0);
      const menuOpen = menuButtonVisible && (
        menus.some(menu => menu.classList.contains('show') || menu.classList.contains('open')) ||
        toggles.some(button => button.getAttribute('aria-expanded') === 'true')
      );
      const editing = adminClasses.some(name => document.body.classList.contains(name)) ||
        adminPanels.some(panel => panel.classList.contains('show')) ||
        document.body.style.overflow === 'hidden';
      return menuOpen || editing || (keyboardInput && header.contains(document.activeElement));
    }

    function syncMenuTop() {
      const top = Math.max(8, Math.round(header.getBoundingClientRect().bottom + 6));
      menus.forEach(menu => menu.style.setProperty('--yls-menu-top', top + 'px'));
    }

    function measureHeader() {
      headerHeight = header.offsetHeight || header.getBoundingClientRect().height || 82;
      header.style.setProperty('--yls-header-hidden-top', -(Math.ceil(headerHeight) + 12) + 'px');
    }

    function revealImmediately() {
      header.classList.add('yls-header-pinned');
      header.classList.remove('yls-header-hidden');
      anchorY = scrollY();
      // Read after revealing so the existing fixed menus keep their correct top.
      syncMenuTop();
      window.requestAnimationFrame(() => header.classList.toggle('yls-header-pinned', isPinned()));
    }

    function updateHeader() {
      framePending = false;
      const y = scrollY();
      const pinned = isPinned();
      header.classList.toggle('yls-header-pinned', pinned);
      if (pinned || y < Math.max(110, headerHeight)) {
        header.classList.remove('yls-header-hidden');
        anchorY = y;
        return;
      }
      const delta = y - anchorY;
      if (delta >= 12) {
        header.classList.add('yls-header-hidden');
        anchorY = y;
      } else if (delta <= -10) {
        header.classList.remove('yls-header-hidden');
        anchorY = y;
      }
    }

    function scheduleUpdate() {
      if (framePending) return;
      framePending = true;
      window.requestAnimationFrame(updateHeader);
    }

    function resetHeader() {
      measureHeader();
      revealImmediately();
    }

    function handleResize() {
      if (window.innerWidth !== viewportWidth) {
        viewportWidth = window.innerWidth;
        resetHeader();
      } else {
        // Mobile browser chrome can resize only the height during a scroll.
        measureHeader();
        anchorY = scrollY();
        scheduleUpdate();
      }
    }

    header.classList.add('yls-scroll-header');
    resetHeader();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    ['orientationchange', 'pageshow', 'popstate', 'hashchange'].forEach(type =>
      window.addEventListener(type, resetHeader, { passive: true })
    );
    header.addEventListener('click', revealImmediately, true);
    header.addEventListener('focusin', revealImmediately);
    header.addEventListener('focusout', () => window.requestAnimationFrame(scheduleUpdate));
    document.addEventListener('keydown', event => {
      if (event.key === 'Tab') keyboardInput = true;
    }, true);
    document.addEventListener('pointerdown', () => {
      keyboardInput = false;
      if (!isPinned()) header.classList.remove('yls-header-pinned');
    }, { capture: true, passive: true });

    const observer = new MutationObserver(revealImmediately);
    menus.forEach(menu => observer.observe(menu, { attributes: true, attributeFilter: ['class'] }));
    toggles.forEach(button => observer.observe(button, { attributes: true, attributeFilter: ['aria-expanded'] }));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    adminPanels.forEach(panel => observer.observe(panel, { attributes: true, attributeFilter: ['class'] }));
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resetHeader).observe(header);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollHeader, { once: true });
  } else {
    initScrollHeader();
  }
})();
