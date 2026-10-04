(()=>{
  'use strict';

  const raw=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const page=raw==='schedule'?'schedule.html':raw==='results'?'results.html':raw;
  if(page!=='schedule.html'&&page!=='results.html')return;

  const KEY='yachiyoAdminMode';
  const GRANT_KEY='yachiyoAdminRevealUntil';
  const SETTINGS_API='/.netlify/functions/site-data?section=admin-visibility-settings';
  const TAP_LIMIT=5;
  const TAP_WINDOW=2200;

  let busy=false;
  let taps=0;
  let tapTimer=null;
  let grantTimer=null;
  let settings={pages:{},desktopEnabled:false};
  let settingsReady=false;

  function installUnifiedAdminCss(){
    if(document.getElementById('yls-admin-button-css'))return;
    const link=document.createElement('link');
    link.id='yls-admin-button-css';
    link.rel='stylesheet';
    link.href='./admin-button.css?v=20261004-urgent3';
    (document.head||document.documentElement).appendChild(link);
  }

  function grantUntil(){
    try{return Number(localStorage.getItem(GRANT_KEY))||0}catch(_){return 0}
  }
  function grantActive(){return grantUntil()>Date.now()}
  function desktopAllowed(){
    return !window.matchMedia('(min-width:901px)').matches||settings.desktopEnabled===true;
  }
  function pageAllowed(){
    return settings.pages?.[page]!==false;
  }
  function eligible(){
    return settingsReady&&grantActive()&&desktopAllowed()&&pageAllowed();
  }

  function button(){
    return document.getElementById('adminModeToggle');
  }
  function trigger(){
    return document.querySelector('.restored-footer-copy');
  }

  function normalizeButton(){
    const b=button();
    if(!b)return null;

    // Remove the legacy delegated handler. This bridge owns the interaction.
    b.removeAttribute('data-csp-onclick');

    // Escape footer stacking contexts/overlays. On iOS this guarantees that the
    // visible control is also the element that actually receives the tap.
    if(b.parentElement!==document.body)document.body.appendChild(b);

    b.style.setProperty('position','fixed','important');
    b.style.setProperty('right','max(12px, env(safe-area-inset-right))','important');
    b.style.setProperty('bottom','calc(12px + env(safe-area-inset-bottom))','important');
    b.style.setProperty('left','auto','important');
    b.style.setProperty('top','auto','important');
    b.style.setProperty('z-index','2147483000','important');
    b.style.setProperty('pointer-events','auto','important');
    b.style.setProperty('touch-action','manipulation','important');
    b.style.setProperty('-webkit-tap-highlight-color','transparent','important');
    return b;
  }

  function isEditing(){
    return document.body.classList.contains('admin-mode');
  }

  function setVisible(show){
    const b=normalizeButton();
    if(!b)return;
    if(show){
      b.style.setProperty('display','block','important');
      b.removeAttribute('aria-hidden');
      b.dataset.ylsAdminVisible='1';
    }else if(!isEditing()){
      b.style.setProperty('display','none','important');
      b.setAttribute('aria-hidden','true');
      delete b.dataset.ylsAdminVisible;
      b.textContent='管理';
    }
  }

  function apply(on){
    document.body.classList.toggle('admin-mode',!!on);
    const b=normalizeButton();
    if(b){
      b.textContent=on?'管理終了':'管理';
      b.disabled=false;
      b.removeAttribute('aria-disabled');
      if(on)setVisible(true);
    }
    if(page==='schedule.html'){
      const annualBtn=document.getElementById('annualAdminBtn');
      if(annualBtn)annualBtn.hidden=!on;
    }
  }

  function resetTaps(){
    taps=0;
    if(tapTimer)clearTimeout(tapTimer);
    tapTimer=null;
  }

  function armGrantExpiry(){
    if(grantTimer)clearTimeout(grantTimer);
    grantTimer=null;
    const remaining=grantUntil()-Date.now();
    if(remaining>0){
      grantTimer=setTimeout(()=>{
        resetTaps();
        if(!isEditing())setVisible(false);
      },Math.min(remaining,2147483647));
    }else if(!isEditing()){
      setVisible(false);
    }
  }

  function revealFromTap(event){
    if(event?.target?.closest?.('a,button,input,select,textarea,label,summary'))return;
    if(!eligible()){
      resetTaps();
      setVisible(false);
      return;
    }
    taps++;
    if(tapTimer)clearTimeout(tapTimer);
    tapTimer=setTimeout(resetTaps,TAP_WINDOW);
    if(taps>=TAP_LIMIT){
      resetTaps();
      setVisible(true);
    }
  }

  async function verify(password){
    try{
      const response=await fetch('/.netlify/functions/site-data?section=access-settings',{
        method:'POST',
        credentials:'same-origin',
        headers:{
          'content-type':'application/json',
          'x-admin-password':password
        },
        body:JSON.stringify({action:'verifyAdminPassword'})
      });
      let data={};
      try{data=await response.clone().json()}catch(_){}
      return {ok:response.ok,status:response.status,data};
    }catch(_){
      return {ok:false,status:0,data:{}};
    }
  }

  async function toggle(){
    if(busy)return;
    const b=normalizeButton();

    if(isEditing()){
      try{
        sessionStorage.removeItem(KEY);
        sessionStorage.removeItem('yachiyoAdminPassword');
      }catch(_){}
      if(page==='results.html'){
        try{if(typeof window.clearForm==='function')window.clearForm()}catch(_){}
        try{if(typeof window.closeSquadSettings==='function')window.closeSquadSettings()}catch(_){}
        document.querySelectorAll('details[open]').forEach(item=>item.removeAttribute('open'));
      }
      apply(false);
      resetTaps();
      setVisible(false);
      return;
    }

    const password=prompt('管理者パスワードを入力してください');
    if(!password)return;

    busy=true;
    if(b){b.disabled=true;b.textContent='確認中…'}

    try{
      const auth=await verify(password);
      if(!auth.ok){
        try{
          sessionStorage.removeItem(KEY);
          sessionStorage.removeItem('yachiyoAdminPassword');
        }catch(_){}
        apply(false);

        if(auth.status===429)alert('試行回数の上限です。15分後に再度お試しください。');
        else if(auth.status===401&&auth.data?.error)alert(auth.data.error);
        else if(auth.status===503)alert('管理者認証を確認できませんでした。');
        else if(auth.status===0)alert('管理者パスワードを確認できませんでした。通信状況を確認してください。');
        else alert('管理者パスワードが違います。');
        return;
      }

      try{
        sessionStorage.setItem('yachiyoAdminPassword',password);
        sessionStorage.setItem(KEY,'1');
      }catch(_){}
      apply(true);

      if(page==='results.html'){
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          const target=document.querySelector('.results-admin-toolbar');
          const header=document.querySelector('.header');
          if(!target)return;
          const top=target.getBoundingClientRect().top+window.scrollY-(header?header.offsetHeight:0)-12;
          window.scrollTo({top:Math.max(0,top),behavior:'auto'});
        }));
      }
    }finally{
      busy=false;
      const current=normalizeButton();
      if(current)current.disabled=false;
    }
  }

  window.enableAdminMode=toggle;

  function bind(){
    const b=normalizeButton();
    const t=trigger();
    if(!b||!t)return;

    if(b.dataset.ylsPublicAdminBridge!=='1'){
      b.dataset.ylsPublicAdminBridge='1';
      b.addEventListener('click',event=>{
        event.preventDefault();
        event.stopImmediatePropagation();
        toggle();
      },true);
    }

    if(t.dataset.ylsPublicAdminReveal!=='1'){
      t.dataset.ylsPublicAdminReveal='1';
      let lastPointer=0;
      t.addEventListener('pointerup',event=>{
        lastPointer=Date.now();
        revealFromTap(event);
      },true);
      t.addEventListener('click',event=>{
        if(Date.now()-lastPointer<800)return;
        revealFromTap(event);
      },true);
    }
  }

  async function loadSettings(){
    try{
      const r=await fetch(SETTINGS_API,{cache:'no-store'});
      if(r.ok){
        const j=await r.json();
        const data=j&&j.data&&typeof j.data==='object'?j.data:{};
        settings={
          pages:data.pages&&typeof data.pages==='object'?data.pages:{},
          desktopEnabled:data.desktopEnabled===true
        };
      }
    }catch(_){}
    settingsReady=true;
    armGrantExpiry();
    if(!isEditing())setVisible(false);
  }

  function start(){
    installUnifiedAdminCss();
    try{
      sessionStorage.removeItem(KEY);
      sessionStorage.removeItem('yachiyoAdminPassword');
    }catch(_){}
    apply(false);
    setVisible(false);
    bind();
    loadSettings();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start,{once:true});
  }else start();

  window.addEventListener('pageshow',()=>{bind();armGrantExpiry()});
  window.addEventListener('focus',armGrantExpiry);
  window.addEventListener('storage',event=>{
    if(event.key===GRANT_KEY){
      armGrantExpiry();
      if(!grantActive()&&!isEditing())setVisible(false);
    }
  });
})();