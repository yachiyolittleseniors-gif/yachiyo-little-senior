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

