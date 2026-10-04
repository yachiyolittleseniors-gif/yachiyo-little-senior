(()=>{
  'use strict';

  const shared=window.YLSAdminButtonConfig;
  if(!shared||!shared.pages)return;
  const GRANT_KEY=shared.grantKey||'yachiyoAdminRevealUntil';
  const TAP_LIMIT=Number(shared.tapLimit)||5;
  const TAP_WINDOW=Number(shared.tapWindow)||2200;
  const IDLE_LABEL=shared.labels?.idle||'管理';
  const ACTIVE_LABEL=shared.labels?.active||'管理終了';
  const SETTINGS_API='/.netlify/functions/site-data?section=admin-visibility-settings';
  const PAGES=shared.pages;

  function pageKey(){
    let page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    if(page && !page.includes('.'))page+='.html';
    return page;
  }

  const KEY=pageKey();
  const cfg=PAGES[KEY];
  if(!cfg)return;

  const button=document.querySelector(cfg.button);
  const trigger=document.querySelector(cfg.trigger);
  if(!button||!trigger)return;

  if(cfg.portalToBody===true&&button.parentElement!==document.body){
    document.body.appendChild(button);
  }
  if(cfg.directAdminMode===true){
    button.removeAttribute('data-csp-onclick');
  }

  const state={
    settings:{pages:{},desktopEnabled:false},
    settingsReady:cfg.protected===true,
    revealed:false,
    taps:0,
    tapTimer:null,
    grantTimer:null,
    lastPointerAt:0,
    busy:false
  };

  button.classList.add('unified-admin-toggle','yls-admin-button');
  button.setAttribute('data-yls-admin-button',KEY);
  trigger.classList.add('unified-admin-reveal','yls-admin-reveal');
  trigger.setAttribute('aria-label','管理ボタンを表示');

  function installCss(){
    if(document.getElementById('yls-admin-button-css'))return;
    const link=document.createElement('link');
    link.id='yls-admin-button-css';
    link.rel='stylesheet';
    link.href='./admin-button.css?v=20261004-unified3';
    (document.body||document.documentElement).appendChild(link);
  }

  function grantUntil(){
    try{return Number(localStorage.getItem(GRANT_KEY))||0}catch(_){return 0}
  }

  function grantActive(){
    return grantUntil()>Date.now();
  }

  function desktopAllowed(){
    if(cfg.protected===true)return true;
    return !window.matchMedia('(min-width:901px)').matches||state.settings.desktopEnabled===true;
  }

  function pageAllowed(){
    if(cfg.protected===true)return true;
    return state.settings.pages?.[KEY]!==false;
  }

  function eligible(){
    return state.settingsReady&&grantActive()&&desktopAllowed()&&pageAllowed();
  }

  function isEditing(){
    const text=(button.textContent||'').trim();
    if(text===ACTIVE_LABEL||text==='管理終了')return true;
    const body=document.body;
    if(body&&(body.classList.contains('editing')||body.classList.contains('staff-editing')||body.classList.contains('admin-mode')||body.classList.contains('photo-admin-on')))return true;
    if(document.querySelector('#densukeAdminPanel.show,#cupAdminArea.show,#contactAdminPanel.show,#adminModal.show'))return true;
    return false;
  }

  function normalizeLabel(){
    const text=(button.textContent||'').trim();
    if(text==='管理終了'||text===ACTIVE_LABEL){
      if(text!==ACTIVE_LABEL)button.textContent=ACTIVE_LABEL;
      return;
    }
    if(text==='管理'||text===IDLE_LABEL){
      if(text!==IDLE_LABEL)button.textContent=IDLE_LABEL;
    }
  }

  if(typeof MutationObserver==='function'){
    let labelSyncing=false;
    const observer=new MutationObserver(()=>{
      if(labelSyncing)return;
      labelSyncing=true;
      try{normalizeLabel()}finally{labelSyncing=false}
    });
    observer.observe(button,{childList:true,characterData:true,subtree:true});
  }

  function resetTaps(){
    state.taps=0;
    if(state.tapTimer)clearTimeout(state.tapTimer);
    state.tapTimer=null;
  }

  function setVisible(show){
    if(show){
      button.style.setProperty('display','block','important');
      button.removeAttribute('aria-hidden');
      button.dataset.ylsAdminVisible='1';
      if(cfg.container){
        const container=document.querySelector(cfg.container);
        if(container)container.style.setProperty('display','flex','important');
      }
    }else if(!isEditing()){
      button.style.setProperty('display','none','important');
      button.setAttribute('aria-hidden','true');
      delete button.dataset.ylsAdminVisible;
      if(cfg.container){
        const container=document.querySelector(cfg.container);
        if(container)container.style.removeProperty('display');
      }
      const text=(button.textContent||'').trim();
      if(text===ACTIVE_LABEL||text==='管理終了')button.textContent=IDLE_LABEL;
    }
  }

  function armGrantExpiry(){
    if(state.grantTimer)clearTimeout(state.grantTimer);
    state.grantTimer=null;
    const remaining=grantUntil()-Date.now();
    if(remaining>0){
      state.grantTimer=setTimeout(()=>{
        state.revealed=false;
        resetTaps();
        setVisible(false);
      },Math.min(remaining,2147483647));
    }else{
      state.revealed=false;
      resetTaps();
      setVisible(false);
    }
  }

  function sync(){
    armGrantExpiry();
    if(state.revealed&&eligible())setVisible(true);
    else if(!isEditing())setVisible(false);
  }

  function countTap(event){
    if(event?.target?.closest?.('a,button,input,select,textarea,label,summary'))return;
    event?.stopImmediatePropagation?.();

    if(!eligible()){
      state.revealed=false;
      resetTaps();
      setVisible(false);
      return;
    }

    state.taps++;
    if(state.tapTimer)clearTimeout(state.tapTimer);
    state.tapTimer=setTimeout(resetTaps,TAP_WINDOW);

    if(state.taps>=TAP_LIMIT){
      resetTaps();
      state.revealed=true;
      setVisible(true);
    }
  }

  trigger.addEventListener('pointerup',event=>{
    state.lastPointerAt=Date.now();
    countTap(event);
  },true);

  trigger.addEventListener('click',event=>{
    if(Date.now()-state.lastPointerAt<800)return;
    countTap(event);
  },true);

  function settleButtonAfterAction(wasEditing){
    const nowEditing=isEditing();
    if(nowEditing){
      setVisible(true);
      return;
    }
    if(wasEditing){
      state.revealed=false;
      resetTaps();
      setVisible(false);
      return;
    }
    if(eligible()){
      state.revealed=true;
      setVisible(true);
      return;
    }
    state.revealed=false;
    resetTaps();
    setVisible(false);
  }

  async function verifyDirectAdminPassword(password){
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

  function applyDirectAdminMode(on){
    document.body.classList.toggle('admin-mode',!!on);
    try{
      if(on)sessionStorage.setItem('yachiyoAdminMode','1');
      else sessionStorage.removeItem('yachiyoAdminMode');
    }catch(_){}

    if(cfg.annualButton){
      const annual=document.querySelector(cfg.annualButton);
      if(annual)annual.hidden=!on;
    }

    if(cfg.cupMode===true){
      const area=document.querySelector('#cupAdminArea');
      const guideline=document.querySelector('#guidelineAdminBox');
      if(area)area.classList.toggle('show',!!on);
      if(guideline)guideline.classList.toggle('show',!!on);
      button.classList.toggle('is-visible',!!on);
      if(on)button.dataset.active='1';
      else delete button.dataset.active;
    }

    if(!on&&cfg.resultsMode===true){
      try{if(typeof window.clearForm==='function')window.clearForm()}catch(_){}
      try{if(typeof window.closeSquadSettings==='function')window.closeSquadSettings()}catch(_){}
      document.querySelectorAll('details[open]').forEach(item=>item.removeAttribute('open'));
    }

    button.textContent=on?ACTIVE_LABEL:IDLE_LABEL;
  }

  async function runDirectAdminMode(){
    if(isEditing()){
      try{
        sessionStorage.removeItem('yachiyoAdminPassword');
      }catch(_){}
      applyDirectAdminMode(false);
      delete button.dataset.active;
      state.revealed=false;
      resetTaps();
      setVisible(false);
      return;
    }

    const password=prompt('管理者パスワードを入力してください');
    if(!password)return;

    if(state.busy)return;
    state.busy=true;
    button.disabled=true;
    button.textContent='確認中…';

    try{
      const auth=await verifyDirectAdminPassword(password);
      if(!auth.ok){
        try{
          sessionStorage.removeItem('yachiyoAdminPassword');
          sessionStorage.removeItem('yachiyoAdminMode');
        }catch(_){}
        applyDirectAdminMode(false);

        if(auth.status===429)alert('試行回数の上限です。15分後に再度お試しください。');
        else if(auth.status===401&&auth.data?.error)alert(auth.data.error);
        else if(auth.status===503)alert('管理者認証を確認できませんでした。');
        else if(auth.status===0)alert('管理者パスワードを確認できませんでした。通信状況を確認してください。');
        else alert('管理者パスワードが違います。');
        return;
      }

      try{sessionStorage.setItem('yachiyoAdminPassword',password)}catch(_){}
      applyDirectAdminMode(true);
      state.revealed=true;
      setVisible(true);

      if(cfg.resultsMode===true){
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          const target=document.querySelector('.results-admin-toolbar');
          const header=document.querySelector('.header');
          if(!target)return;
          const top=target.getBoundingClientRect().top+window.scrollY-(header?header.offsetHeight:0)-12;
          window.scrollTo({top:Math.max(0,top),behavior:'auto'});
        }));
      }
    }finally{
      state.busy=false;
      button.disabled=false;
      normalizeLabel();
    }
  }

  button.addEventListener('click',event=>{
    const wasEditing=isEditing();

    if(cfg.directAdminMode===true){
      event.preventDefault();
      event.stopImmediatePropagation();
      runDirectAdminMode()
        .then(()=>settleButtonAfterAction(wasEditing))
        .catch(()=>settleButtonAfterAction(wasEditing));
      return;
    }

    setTimeout(()=>settleButtonAfterAction(wasEditing),0);
  },true);

  window.addEventListener('storage',event=>{if(event.key===GRANT_KEY)sync()});
  window.addEventListener('focus',sync);
  window.addEventListener('pageshow',sync);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
  document.addEventListener('yachiyo:admin-session-expired',sync);

  if(window.matchMedia){
    const desktop=window.matchMedia('(min-width:901px)');
    if(desktop.addEventListener)desktop.addEventListener('change',sync);
    else if(desktop.addListener)desktop.addListener(sync);
  }

  installCss();
  normalizeLabel();
  setVisible(false);

  if(cfg.protected===true){
    sync();
  }else{
    fetch(SETTINGS_API,{cache:'no-store'})
      .then(r=>r.ok?r.json():Promise.reject(new Error('settings')))
      .then(j=>{
        const data=j&&j.data&&typeof j.data==='object'?j.data:{};
        state.settings={
          pages:data.pages&&typeof data.pages==='object'?data.pages:{},
          desktopEnabled:data.desktopEnabled===true
        };
        state.settingsReady=true;
        sync();
      })
      .catch(()=>{
        state.settings={pages:{},desktopEnabled:false};
        state.settingsReady=true;
        sync();
      });
  }

  window.YLSAdminButtonController={
    page:KEY,
    show:()=>{if(eligible()){state.revealed=true;setVisible(true)}},
    hide:()=>{state.revealed=false;resetTaps();setVisible(false)},
    sync,
    isGrantActive:grantActive,
    isEligible:eligible
  };
})();