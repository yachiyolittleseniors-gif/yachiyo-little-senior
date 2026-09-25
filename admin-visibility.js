(()=>{
 const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
 if(page==='board.html')return;
 const KEY=page;
 let enabled=true,ready=false,timer=null;
 const selectors=['.unified-admin-toggle','.manage-btn','#manageBtn','#adminBtn','#adminToggle','#staffToggle','#heroAdminToggle','#cupAdminBtn','#densukeToggleBtn','#adminModeToggle','#contactAdminBtn','#staffEditBtn'];
 const HIDE_CLASS='admin-visibility-disabled';
 const style=document.createElement('style');
 style.id='admin-visibility-runtime-style';
 style.textContent=`html.${HIDE_CLASS} ${selectors.join(`,html.${HIDE_CLASS} `)}{display:none!important}`;
 document.head.appendChild(style);
 const closeAdminUi=()=>{
   document.documentElement.classList.add(HIDE_CLASS);
   ['#adminModal','#yachiyoUnifiedAdminModal'].forEach(sel=>document.querySelectorAll(sel).forEach(el=>{
     el.classList.remove('show','is-open');
     el.setAttribute('aria-hidden','true');
   }));
 };
 const showAdminUi=()=>document.documentElement.classList.remove(HIDE_CLASS);
 const apply=d=>{
   const cfg=d&&d.pages&&typeof d.pages==='object'?d:{pages:(d&&typeof d==='object'?d:{}),autoOffEnabled:true,expiresAt:{}};
   const exp=Number(cfg.expiresAt&&cfg.expiresAt[KEY]||0);
   enabled=cfg.pages[KEY]!==false&&!(cfg.autoOffEnabled!==false&&exp&&exp<=Date.now());
   ready=true;
   if(timer){clearTimeout(timer);timer=null;}
   if(enabled){
     showAdminUi();
     if(cfg.autoOffEnabled!==false&&exp>Date.now())timer=setTimeout(()=>{enabled=false;closeAdminUi()},Math.min(exp-Date.now()+100,2147483647));
   }else closeAdminUi();
 };
 fetch('/.netlify/functions/site-data?section=admin-visibility-settings',{cache:'no-store'})
   .then(r=>r.ok?r.json():Promise.reject())
   .then(j=>apply(j&&j.data))
   .catch(()=>{ready=true;enabled=true;showAdminUi()});
 const blocked=()=>ready&&!enabled;
 ['pointerup','touchend','click','dblclick'].forEach(type=>document.addEventListener(type,e=>{
   if(!blocked())return;
   const t=e.target;
   if(t&&((t.closest&&t.closest('footer'))||(t.closest&&t.closest('.unified-admin-reveal'))||(t.closest&&t.closest('.manage-btn,.unified-admin-toggle,#manageBtn,#adminBtn,#adminToggle,#staffToggle,#heroAdminToggle,#cupAdminBtn,#adminModeToggle,#contactAdminBtn,#staffEditBtn')))){
     e.preventDefault();e.stopImmediatePropagation();closeAdminUi();
   }
 },true));
})();
