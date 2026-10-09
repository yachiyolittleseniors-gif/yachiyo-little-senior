(() => {
  'use strict';
  // Only a real, deliberate click may start passkey authentication.
  // Store a short-lived one-use nonce and include it in that navigation URL,
  // so Safari's passive tab restoration can never re-trigger a passkey sheet.
  const boardIntentKey='yachiyoBoardEntryIntentV2';
  function makeBoardIntent(){
    if(typeof crypto!=='undefined'&&crypto.randomUUID)return crypto.randomUUID();
    const bytes=new Uint8Array(16);
    if(typeof crypto!=='undefined'&&crypto.getRandomValues)crypto.getRandomValues(bytes);
    else bytes.forEach((_,i)=>{bytes[i]=Math.floor(Math.random()*256)});
    return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  document.addEventListener('click',event=>{
    if(event.isTrusted===false||event.defaultPrevented||event.button>0||
      event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=event.target?.closest?.('a[href]');
    if(!link||link.target&&link.target!=='_self')return;
    try{
      const url=new URL(link.href,location.href);
      if(url.origin!==location.origin||url.pathname!=='/board.html')return;
      // Child pages return to their parent board via their existing saved session.
      // Do not transform these normal in-app navigation links into a new login.
      const from=url.searchParams.get('from');
      if(['attendance','player','coach','documents'].includes(from))return;
      const nonce=makeBoardIntent();
      sessionStorage.setItem(boardIntentKey,JSON.stringify({nonce,at:Date.now()}));
      url.searchParams.set('entry','home');
      url.searchParams.set('yls_intent',nonce);
      link.setAttribute('href',url.pathname+url.search+url.hash);
    }catch(_){}
  },true);
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
      'footer.yls-compact-footer .yls-compact-footer-social{display:flex!important;flex-wrap:wrap!important;align-items:center!important;justify-content:center!important;gap:4px 24px!important;margin:0 0 7px!important;padding:0!important}',
      'footer.yls-compact-footer .yls-compact-footer-social a{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:36px!important;padding:6px 2px!important;color:#d2dbe5!important;font-size:12px!important;font-weight:500!important}',
      'footer.yls-compact-footer .yls-compact-footer-address{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;min-height:32px!important;padding:5px 4px!important;color:#dec38a!important;font-size:13px!important;font-weight:600!important}',
      'footer.yls-compact-footer .yls-compact-footer-address span:last-child{flex:none;font-size:12px!important}',
      'footer.yls-compact-footer .yls-compact-footer-alias{margin:4px 0 0!important;padding:0!important;color:#b8c3cf!important;font-size:12px!important;font-weight:500!important;letter-spacing:.02em!important;line-height:1.7!important}',
      'footer.yls-compact-footer .yls-compact-footer-privacy{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:32px!important;padding:6px 8px!important;color:#aab6c4!important;font-size:11px!important;font-weight:400!important}',
      'footer.yls-compact-footer .yls-compact-footer-details a:hover{color:#f0d89e!important}',
      'footer.yls-compact-footer .yls-compact-footer-details a:focus-visible{outline:2px solid #dec38a;outline-offset:2px;border-radius:3px}',
      'footer.yls-compact-footer .yls-compact-footer-copy{display:block!important;max-width:100%!important;margin:10px 0 0!important;padding:9px 0 0!important;border:0!important;border-top:1px solid rgba(255,255,255,.08)!important;color:#8f9eae!important;font-size:10px!important;font-weight:400!important;letter-spacing:.02em!important;line-height:1.6!important;text-align:center!important;white-space:normal!important;overflow-wrap:anywhere}',
      '@media(min-width:901px){footer.yls-compact-footer{padding:26px 24px 20px!important}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function removeSocialLinksFromMenus() {
    document.querySelectorAll('.mobile-links a[href],.site-menu a[href]').forEach(link => {
      if (socialLinks.some(([, href]) => link.href.replace(/\/$/, '') === href.replace(/\/$/, ''))) link.remove();
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

    const social = document.createElement('div');
    social.className = 'yls-compact-footer-social';
    socialLinks.forEach(([label, href]) => {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      social.appendChild(link);
    });

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

    details.appendChild(social);
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
    removeSocialLinksFromMenus();
    footers.forEach(simplifyFooter);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompactFooters, { once: true });
  } else {
    initCompactFooters();
  }
})();

