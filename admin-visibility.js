(()=>{
 const page=(location.pathname.split('/').pop()||'index.html').toLowerCase(); if(page==='board.html')return; const KEY=page; let enabled=true,ready=false,timer=null;
 const selectors=['.unified-admin-toggle','.manage-btn','#manageBtn','#adminBtn','#adminToggle','#staffToggle','#heroAdminToggle','#cupAdminBtn','#densukeToggleBtn'];
 const hide=()=>selectors.forEach(sel=>document.querySelectorAll(sel).forEach(el=>{el.style.setProperty('display','none','important');el.classList.remove('show','is-open')}));
 const closeAdminUi=()=>{hide();document.querySelectorAll('#adminModal,#yachiyoUnifiedAdminModal,.admin-modal,.modal').forEach(el=>{if(el.id==='adminModal'||el.id==='yachiyoUnifiedAdminModal'){el.classList.remove('show','is-open');el.setAttribute('aria-hidden','true')}})};
 const apply=d=>{const cfg=d&&d.pages&&typeof d.pages==='object'?d:{pages:(d&&typeof d==='object'?d:{}),autoOffEnabled:true,expiresAt:{}};const exp=Number(cfg.expiresAt&&cfg.expiresAt[KEY]||0);enabled=cfg.pages[KEY]!==false&&!(cfg.autoOffEnabled!==false&&exp&&exp<=Date.now());ready=true;if(timer)clearTimeout(timer);if(enabled&&cfg.autoOffEnabled!==false&&exp>Date.now())timer=setTimeout(()=>{enabled=false;closeAdminUi()},Math.min(exp-Date.now()+100,2147483647));if(!enabled)closeAdminUi()};
 fetch('/.netlify/functions/site-data?section=admin-visibility-settings',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(j=>apply(j&&j.data)).catch(()=>{ready=true;enabled=true});
 const blocked=()=>ready&&!enabled;
 ['pointerup','touchend','click','dblclick'].forEach(type=>document.addEventListener(type,e=>{if(!blocked())return;const t=e.target;if(t&&((t.closest&&t.closest('footer'))||(t.closest&&t.closest('.unified-admin-reveal'))||(t.closest&&t.closest('.manage-btn,.unified-admin-toggle,#manageBtn,#adminBtn,#adminToggle,#staffToggle,#heroAdminToggle,#cupAdminBtn')))){e.preventDefault();e.stopImmediatePropagation();closeAdminUi()}},true));
 new MutationObserver(()=>{if(blocked())hide()}).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class','style']});
})();
