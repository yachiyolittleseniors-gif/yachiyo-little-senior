(function(){
  const button=document.getElementById("densukeToggleBtn");
  const trigger=document.querySelector("footer.footer");
  if(!button||!trigger)return;
  button.classList.add('unified-admin-toggle');
  trigger.classList.add('unified-admin-reveal');
  trigger.setAttribute('aria-label','管理ボタンを表示');

  const GRANT_KEY='yachiyoAdminRevealUntil';
  let taps=0;
  let timer=null;
  let grantTimer=null;
  let lastTouchAt=0;
  let boardAccessConfirmed=false;
  let revealedByLogin=false;
  let revealedByTap=false;

  function grantUntil(){
    try{return Number(localStorage.getItem(GRANT_KEY))||0}catch(e){return 0}
  }
  function syncTeamLoginGrant(){
    if(grantTimer)clearTimeout(grantTimer);
    grantTimer=null;
    const until=grantUntil();
    const active=boardAccessConfirmed&&until>Date.now();
    if(active){
      button.style.setProperty('display','block','important');
      button.removeAttribute('aria-hidden');
      revealedByLogin=true;
      grantTimer=setTimeout(syncTeamLoginGrant,Math.min(Math.max(0,until-Date.now()),2147483647));
    }else if(revealedByLogin&&!revealedByTap&&window.YLSAdminSession?.isActive?.()!==true){
      button.style.setProperty('display','none','important');
      button.setAttribute('aria-hidden','true');
      revealedByLogin=false;
    }
  }
  // The password/passkey check is asynchronous. localStorage's storage event
  // does not fire in the tab that writes the grant, so wait for login explicitly.
  if(window.boardAccessReady&&typeof window.boardAccessReady.then==='function'){
    window.boardAccessReady.then(function(ok){
      boardAccessConfirmed=ok===true;
      syncTeamLoginGrant();
    },function(){
      boardAccessConfirmed=false;
      syncTeamLoginGrant();
    });
  }
  window.addEventListener('storage',event=>{if(event.key===GRANT_KEY)syncTeamLoginGrant()});
  window.addEventListener('focus',syncTeamLoginGrant);
  window.addEventListener('pageshow',syncTeamLoginGrant);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncTeamLoginGrant()});
  document.addEventListener('yachiyo:admin-session-expired',syncTeamLoginGrant);
  function reset(){
    taps=0;
    clearTimeout(timer);
    timer=null;
  }
  function countTap(){
    taps++;
    clearTimeout(timer);
    timer=setTimeout(reset,2200);
    if(taps>=5){
      reset();
      revealedByTap=true;
      button.style.setProperty('display','block','important');
      button.removeAttribute('aria-hidden');
    }
  }
  trigger.addEventListener('pointerup',function(event){
    if(event.pointerType==='touch'){
      event.stopImmediatePropagation();
      return;
    }
    event.stopImmediatePropagation();
    countTap();
  },{capture:true,passive:true});
  trigger.addEventListener('touchend',function(event){
    lastTouchAt=Date.now();
    event.preventDefault();
    event.stopImmediatePropagation();
    countTap();
  },{capture:true,passive:false});
  trigger.addEventListener('click',function(event){
    if(Date.now()-lastTouchAt<800){
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    event.stopImmediatePropagation();
    countTap();
  },{capture:true,passive:false});
  trigger.addEventListener('dblclick',function(event){
    event.preventDefault();
    event.stopImmediatePropagation();
  },{capture:true,passive:false});
})();
