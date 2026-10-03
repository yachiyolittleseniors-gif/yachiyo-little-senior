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

  function grantUntil(){
    try{return Number(localStorage.getItem(GRANT_KEY))||0}catch(e){return 0}
  }
  function syncTeamLoginGrant(){
    const until=grantUntil();
    const active=until>Date.now();
    if(active){
      button.style.setProperty('display','block','important');
      button.removeAttribute('aria-hidden');
      if(grantTimer)clearTimeout(grantTimer);
      grantTimer=setTimeout(syncTeamLoginGrant,Math.min(Math.max(0,until-Date.now()),2147483647));
    }
  }
  syncTeamLoginGrant();
  window.addEventListener('storage',event=>{if(event.key===GRANT_KEY)syncTeamLoginGrant()});
  window.addEventListener('focus',syncTeamLoginGrant);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncTeamLoginGrant()});
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
      button.style.setProperty('display','block','important');
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
