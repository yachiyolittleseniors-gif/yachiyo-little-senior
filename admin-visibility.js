(()=>{
 let page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
 // Netlify Pretty URLs serve /team, /schedule, etc. Normalize them to the saved *.html keys.
 if(page && !page.includes('.')) page += '.html';
 const TARGETS=new Set(['index.html','team.html','schedule.html','results.html','players.html','links.html','seniorcup.html','contact.html']);
 if(page==='board.html'||!TARGETS.has(page))return;
 const KEY=page;
 let enabled=true,ready=false,timer=null;
 const desktop=window.matchMedia('(min-width:901px)');
 let currentSettings=null;
 const GRANT_KEY='yachiyoAdminRevealUntil';
 function grantUntil(){try{return Number(localStorage.getItem(GRANT_KEY))||0}catch(e){return 0}}
 const selectors=['.unified-admin-toggle','.manage-btn','#manageBtn','#adminBtn','#adminToggle','#staffToggle','#heroAdminToggle','#cupAdminBtn','#densukeToggleBtn','#contactAdminBtn'];
 const HIDE_CLASS='admin-visibility-disabled';
 const style=document.createElement('style');
 style.id='admin-visibility-runtime-style';
 style.textContent=`html.${HIDE_CLASS} ${selectors.join(`,html.${HIDE_CLASS} `)}{display:none!important}`;
 document.head.appendChild(style);
 function clearAdminState(){
   try{sessionStorage.removeItem('yachiyoAdminMode');sessionStorage.removeItem('yachiyoAdminPassword')}catch(e){}
   try{localStorage.removeItem('yachiyoAdminMode')}catch(e){}
   document.body?.classList.remove('editing','staff-editing','photo-admin-on','admin-mode','admin-open','is-admin');
   document.documentElement.classList.add(HIDE_CLASS);
   selectors.forEach(sel=>document.querySelectorAll(sel).forEach(el=>{el.style.setProperty('display','none','important');el.setAttribute('aria-hidden','true')}));
   ['#adminModal','#yachiyoUnifiedAdminModal','.admin-modal','.admin-password-modal','.password-modal'].forEach(sel=>document.querySelectorAll(sel).forEach(el=>{el.classList.remove('show','is-open','open','active');el.hidden=true;el.setAttribute('aria-hidden','true')}));
 }
 function showAdminUi(){
   document.documentElement.classList.remove(HIDE_CLASS);
   selectors.forEach(sel=>document.querySelectorAll(sel).forEach(el=>{el.style.removeProperty('display');el.removeAttribute('aria-hidden')}));
 }
 function apply(d){
   currentSettings=d;
   const cfg=d&&d.pages&&typeof d.pages==='object'?d:{pages:(d&&typeof d==='object'?d:{}),autoOffEnabled:true,expiresAt:{}};
   const loginMode=cfg.autoEnableOnLogin===true;
   const exp=grantUntil();
   const loginGrantActive=exp>Date.now();
   // A successful team-page login always unlocks admin-button visibility for 30 minutes.
   // Outside that window, ON means hidden; OFF falls back to the per-page settings.
   const allowed=loginGrantActive||(!loginMode&&cfg.pages[KEY]!==false);
   enabled=(!desktop.matches||cfg.desktopEnabled===true)&&allowed;
   ready=true;if(timer){clearTimeout(timer);timer=null}
   if(enabled){
     showAdminUi();
     if(loginGrantActive)timer=setTimeout(()=>apply(currentSettings),Math.min(Math.max(0,exp-Date.now()),2147483647));
   }
   else clearAdminState();
 }
 clearAdminState();
 if(desktop.addEventListener)desktop.addEventListener('change',()=>apply(currentSettings));
 else if(desktop.addListener)desktop.addListener(()=>apply(currentSettings));
 fetch('/.netlify/functions/site-data?section=admin-visibility-settings',{cache:'no-store'})
   .then(r=>r.ok?r.json():Promise.reject()).then(j=>apply(j&&j.data)).catch(()=>{ready=true;enabled=false;clearAdminState()});
 document.addEventListener('yachiyo:admin-session-expired',()=>{clearAdminState();if(ready)apply(currentSettings)});
 document.addEventListener('yachiyo:admin-session-active',()=>{if(ready)apply(currentSettings)});
 window.addEventListener('storage',e=>{if(e.key===GRANT_KEY)apply(currentSettings)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ready)apply(currentSettings)});
 window.addEventListener('focus',()=>{if(ready)apply(currentSettings)});
 const blocked=()=>{
   const cfg=currentSettings&&currentSettings.pages&&typeof currentSettings.pages==='object'?currentSettings:{pages:(currentSettings&&typeof currentSettings==='object'?currentSettings:{}),autoEnableOnLogin:false};
   const loginGrantActive=grantUntil()>Date.now();
   const allowed=loginGrantActive||(cfg.autoEnableOnLogin!==true&&cfg.pages[KEY]!==false);
   const shouldEnable=(!desktop.matches||cfg.desktopEnabled===true)&&allowed;
   if(enabled!==shouldEnable)apply(currentSettings);
   return !ready||!shouldEnable;
 };
 ['pointerdown','pointerup','touchstart','touchend','click','dblclick'].forEach(type=>document.addEventListener(type,e=>{
   if(!blocked())return; const t=e.target;
   if(t?.closest?.('.unified-admin-reveal,.restored-footer-copy,'+selectors.join(','))){e.preventDefault();e.stopImmediatePropagation();clearAdminState()}
 },true));
 // Some pages recreate their admin button after load. Keep only the button hidden, without observing/mutating the page tree.
 setTimeout(()=>{if(blocked())clearAdminState()},800);
 setTimeout(()=>{if(blocked())clearAdminState()},2200);
})();
