(()=>{
  'use strict';

  const page=(location.pathname.split('/').pop()||'index.html').toLowerCase().replace(/^schedule$/,'schedule.html').replace(/^results$/,'results.html');
  if(page!=='schedule.html'&&page!=='results.html')return;

  const KEY='yachiyoAdminMode';
  let busy=false;

  function button(){
    return document.getElementById('adminModeToggle');
  }

  function normalizeButton(){
    const b=button();
    if(!b)return null;

    // Keep the control out of footer stacking contexts so no fixed footer/overlay
    // can sit above it on iOS.
    if(b.parentElement!==document.body)document.body.appendChild(b);

    b.style.setProperty('position','fixed','important');
    b.style.setProperty('right','max(12px, env(safe-area-inset-right))','important');
    b.style.setProperty('bottom','calc(12px + env(safe-area-inset-bottom))','important');
    b.style.setProperty('left','auto','important');
    b.style.setProperty('top','auto','important');
    b.style.setProperty('z-index','2147483000','important');
    b.style.setProperty('pointer-events','auto','important');
    b.style.setProperty('touch-action','manipulation','important');
    return b;
  }

  function apply(on){
    document.body.classList.toggle('admin-mode',!!on);
    const b=normalizeButton();
    if(b){
      b.textContent=on?'管理終了':'管理';
      b.disabled=false;
      b.removeAttribute('aria-disabled');
    }
    if(page==='schedule.html'){
      const annualBtn=document.getElementById('annualAdminBtn');
      if(annualBtn)annualBtn.hidden=!on;
    }
  }

  async function verify(password){
    try{
      const response=await fetch('/.netlify/functions/admin-session',{
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

    if(document.body.classList.contains('admin-mode')){
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
      if(window.YLSAdminButtonController)window.YLSAdminButtonController.hide();
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
    if(!b||b.dataset.ylsPublicAdminBridge==='1')return;
    b.dataset.ylsPublicAdminBridge='1';

    // Capture first and own the interaction. This bypasses old delegated
    // data-csp-onclick handlers and the shared controller's compatibility path.
    b.addEventListener('click',event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      toggle();
    },true);

    b.addEventListener('pointerup',event=>{
      // iOS normally synthesizes click; do not run twice.
      event.stopPropagation();
    },true);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{
      try{
        sessionStorage.removeItem(KEY);
        sessionStorage.removeItem('yachiyoAdminPassword');
      }catch(_){}
      apply(false);
      bind();
    },{once:true});
  }else{
    try{
      sessionStorage.removeItem(KEY);
      sessionStorage.removeItem('yachiyoAdminPassword');
    }catch(_){}
    apply(false);
    bind();
  }

  window.addEventListener('pageshow',()=>{normalizeButton();bind()});
})();