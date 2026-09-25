(()=>{
 const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
 const TARGETS=new Set(['index.html','team.html','schedule.html','results.html','players.html','links.html','seniorcup.html','contact.html']);
 if(page==='board.html'||!TARGETS.has(page))return;
 const KEY=page;
 let enabled=true,ready=false,timer=null;
 const selectors=['.unified-admin-toggle','.manage-btn','#manageBtn','#adminBtn','#adminToggle','#staffToggle','#heroAdminToggle','#cupAdminBtn','#densukeToggleBtn'];
 const HIDE_CLASS='admin-visibility-disabled';
 const style=document.createElement('style');
 style.id='admin-visibility-runtime-style';
 style.textContent=`html.${HIDE_CLASS} ${selectors.join(`,html.${HIDE_CLASS} `)}{display:none!important}`;
 document.head.appendChild(style);
 function clearAdminState(){
   try{sessionStorage.removeItem('yachiyoAdminMode');sessionStorage.removeItem('yachiyoAdminPassword')}catch(e){}
   try{localStorage.removeItem('yachiyoAdminMode')}catch(e){}
   document.body?.classList.remove('editing','photo-admin-on','admin-mode','admin-open','is-admin');
   document.documentElement.classList.add(HIDE_CLASS);
   selectors.forEach(sel=>document.querySelectorAll(sel).forEach(el=>{el.style.setProperty('display','none','important');el.setAttribute('aria-hidden','true')}));
   ['#adminModal','#yachiyoUnifiedAdminModal','.admin-modal','.admin-password-modal','.password-modal'].forEach(sel=>document.querySelectorAll(sel).forEach(el=>{el.classList.remove('show','is-open','open','active');el.hidden=true;el.setAttribute('aria-hidden','true')}));
 }
 function showAdminUi(){
   document.documentElement.classList.remove(HIDE_CLASS);
   selectors.forEach(sel=>document.querySelectorAll(sel).forEach(el=>{el.style.removeProperty('display');el.removeAttribute('aria-hidden')}));
 }
 function apply(d){
   const cfg=d&&d.pages&&typeof d.pages==='object'?d:{pages:(d&&typeof d==='object'?d:{}),autoOffEnabled:true,expiresAt:{}};
   const exp=Number(cfg.expiresAt&&cfg.expiresAt[KEY]||0);
   enabled=cfg.pages[KEY]!==false&&!(cfg.autoOffEnabled!==false&&exp&&exp<=Date.now());
   ready=true;if(timer){clearTimeout(timer);timer=null}
   if(enabled){showAdminUi();if(cfg.autoOffEnabled!==false&&exp>Date.now())timer=setTimeout(()=>{enabled=false;clearAdminState()},Math.min(exp-Date.now()+100,2147483647));}
   else clearAdminState();
 }
 fetch('/.netlify/functions/site-data?section=admin-visibility-settings',{cache:'no-store'})
   .then(r=>r.ok?r.json():Promise.reject()).then(j=>apply(j&&j.data)).catch(()=>{ready=true;enabled=true;showAdminUi()});
 const blocked=()=>ready&&!enabled;
 ['pointerdown','pointerup','touchstart','touchend','click','dblclick'].forEach(type=>document.addEventListener(type,e=>{
   if(!blocked())return; const t=e.target;
   if(t&&((t.closest&&t.closest('footer'))||(t.closest&&t.closest('.unified-admin-reveal'))||(t.closest&&t.closest(selectors.join(','))))){e.preventDefault();e.stopImmediatePropagation();clearAdminState()}
 },true));
 // Some pages recreate their admin button after load. Keep only the button hidden, without observing/mutating the page tree.
 setTimeout(()=>{if(blocked())clearAdminState()},800);
 setTimeout(()=>{if(blocked())clearAdminState()},2200);
})();
