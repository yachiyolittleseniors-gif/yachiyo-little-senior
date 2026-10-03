document.documentElement.style.visibility='hidden';
window.boardAccessReady=(async function requireBoardPassword(){
  const accessKey='yachiyoAttendancePass';
  const reloadKey='yachiyoAttendanceReloadPass';
  const reloadExpiryKey='yachiyoAttendanceReloadPassExpires';
  const passkeyKey='yachiyoBoardPasskeyRegistered';
  const reloadLifetime=12*60*60*1000;
  const adminRevealGrantKey='yachiyoAdminRevealUntil';
  const adminRevealGrantLifetime=30*60*1000;
  function grantAdminReveal(){
    try{localStorage.setItem(adminRevealGrantKey,String(Date.now()+adminRevealGrantLifetime))}catch(e){}
  }
  function saveAccess(value){
    try{sessionStorage.setItem(accessKey,value)}catch(e){}
    try{
      localStorage.setItem(reloadKey,value);
      localStorage.setItem(reloadExpiryKey,String(Date.now()+reloadLifetime));
    }catch(e){}
  }
  function readReloadAccess(){
    try{
      const expires=Number(localStorage.getItem(reloadExpiryKey)||0);
      if(expires>Date.now())return localStorage.getItem(reloadKey)||'';
      localStorage.removeItem(reloadKey);
      localStorage.removeItem(reloadExpiryKey);
    }catch(e){}
    return '';
  }
  function clearAccess(){
    try{sessionStorage.removeItem(accessKey)}catch(e){}
    try{localStorage.removeItem(reloadKey);localStorage.removeItem(reloadExpiryKey)}catch(e){}
  }
  async function verify(value){
    const response=await fetch('/.netlify/functions/site-data?section=access-settings',{
      method:'POST',
      headers:{'content-type':'application/json'},
      credentials:'same-origin',
      body:JSON.stringify({action:'verifyAccessPassword',password:value})
    });
    if(response.status===429){
      const result=await response.json().catch(()=>({}));
      const error=new Error(result.error||'ログインの試行回数が多いため、一時的に制限しています。しばらく待ってからお試しください。');
      error.rateLimited=true;
      throw error;
    }
    if(!response.ok)return false;
    const result=await response.json().catch(()=>({}));
    saveAccess(result.token||value);
    grantAdminReveal();
    document.documentElement.style.visibility='';
    return true;
  }
  let passkeyAttempt=null;
  async function verifyPasskey(){
    // Only automatically open WebAuthn on a browser with a successful registration.
    // Other browsers go directly to password entry instead of a cross-device QR prompt.
    if(!window.YLSPasskeys?.supported())return false;
    try{if(localStorage.getItem(passkeyKey)!=='1')return false}catch(_){return false}
    if(passkeyAttempt)return passkeyAttempt;
    passkeyAttempt=(async()=>{
      try{
        const result=await window.YLSPasskeys.authenticate();
        if(!result?.token)return false;
        saveAccess(result.token);
        grantAdminReveal();
        try{sessionStorage.setItem('yachiyoBoardPasskeyJustVerified','1')}catch(_){}
        try{localStorage.setItem(passkeyKey,'1')}catch(_){}
        document.documentElement.style.visibility='';
        return true;
      }catch(e){
        if(e?.status===404){
          try{localStorage.removeItem(passkeyKey)}catch(_){}
        }
        return false;
      }
    })();
    return passkeyAttempt;
  }
  const searchParams=new URLSearchParams(location.search);
  const returnSource=searchParams.get('from');
  const historyFocus=searchParams.get('focus');
  const returningFromProtectedPage=['documents','coach','attendance','player'].includes(returnSource);
  const returningFromUpdateHistory=['schedule','duty-roster','rules'].includes(historyFocus);
  const returningFromLineLogin=searchParams.get('line_login')==='ok'&&/^duty-(submit|resend)$/.test(searchParams.get('line_resume')||'');
  const navigationEntry=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];
  const isPageReload=navigationEntry&&navigationEntry.type==='reload';
  if(returningFromProtectedPage||returningFromUpdateHistory||returningFromLineLogin||isPageReload){
    try{
      const saved=sessionStorage.getItem(accessKey)||readReloadAccess();
      if(saved&&await verify(saved)){
        if(returningFromProtectedPage)history.replaceState(null,'','./board.html');
        return true;
      }
      if(saved)clearAccess();
    }catch(e){}
  }else{clearAccess()}
  if(await verifyPasskey())return true;
  const p=prompt('パスワードを入力してください。');
  if(p===null){
    if(history.length>1){history.back()}else{location.replace('./')}
    return false;
  }
  try{
    if(await verify(p))return true;
  }catch(e){
    alert(e.rateLimited?e.message:'パスワードを確認できませんでした。通信状況を確認してください。');
    location.replace('./');
    return false;
  }
  alert('パスワードが違います。');
  location.replace('./');
  return false;
})();
