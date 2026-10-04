document.documentElement.style.visibility='hidden';
window.boardAccessReady=(async function requireBoardPassword(){
  const accessKey='yachiyoAttendancePass';
  const reloadKey='yachiyoAttendanceReloadPass';
  const reloadExpiryKey='yachiyoAttendanceReloadPassExpires';
  const passkeyKey='yachiyoBoardPasskeyRegistered';
  const passkeyJustVerifiedKey='yachiyoBoardPasskeyJustVerified';
  const passkeyJustVerifiedLifetime=20*1000;
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
  function rememberPasskeyVerification(){
    try{sessionStorage.setItem(passkeyJustVerifiedKey,String(Date.now()))}catch(e){}
  }
  function hasFreshPasskeyVerification(){
    try{
      const verifiedAt=Number(sessionStorage.getItem(passkeyJustVerifiedKey)||0);
      return Number.isFinite(verifiedAt)&&verifiedAt>0&&(Date.now()-verifiedAt)<=passkeyJustVerifiedLifetime;
    }catch(e){return false}
  }
  function clearFreshPasskeyVerification(){
    try{sessionStorage.removeItem(passkeyJustVerifiedKey)}catch(e){}
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
        rememberPasskeyVerification()
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
  const navigationEntry=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];
  const isPageReload=!!(navigationEntry&&navigationEntry.type==='reload');
  let cameFromHome=false;
  try{
    const ref=document.referrer?new URL(document.referrer):null;
    cameFromHome=!!ref&&ref.origin===location.origin&&(ref.pathname==='/'||/\/index\.html$/.test(ref.pathname));
  }catch(_){}
  // document.referrer can remain Home even after an iPhone/Safari refresh.
  // Treat Home as a fresh entry only on a real navigation, never on reload.
  const freshHomeEntry=searchParams.get('entry')==='home'||(!isPageReload&&cameFromHome);
  if(freshHomeEntry){
    // A deliberate tap from Home must authenticate once every time.
    // Strip the marker immediately so any iPhone/Safari follow-up navigation
    // from the same successful login can reuse the fresh-auth marker instead
    // of opening the passkey sheet a second time.
    try{
      const cleanUrl=new URL(location.href);
      cleanUrl.searchParams.delete('entry');
      history.replaceState(history.state,'',cleanUrl.pathname+cleanUrl.search+cleanUrl.hash);
    }catch(_){}
    clearAccess();
    clearFreshPasskeyVerification();
  }
  const returnSource=searchParams.get('from');
  const historyFocus=searchParams.get('focus');
  const returningFromProtectedPage=['documents','coach','attendance','player'].includes(returnSource);
  const returningFromUpdateHistory=['schedule','duty-roster','rules'].includes(historyFocus);
  const returningFromLineLogin=searchParams.get('line_login')==='ok'&&/^duty-(submit|resend)$/.test(searchParams.get('line_resume')||'');

  // iPhone/Safari can immediately perform another board navigation after a
  // successful WebAuthn ceremony. Reuse the just-issued board session instead
  // of opening Face ID / passkey a second time.
  if(!freshHomeEntry&&hasFreshPasskeyVerification()){
    try{
      const saved=sessionStorage.getItem(accessKey)||readReloadAccess();
      if(saved&&await verify(saved)){
        clearFreshPasskeyVerification();
        return true;
      }
      if(saved)clearAccess();
    }catch(e){
      clearAccess();
    }
  }
  if(!freshHomeEntry&&(returningFromProtectedPage||returningFromUpdateHistory||returningFromLineLogin||isPageReload)){
    try{
      const saved=sessionStorage.getItem(accessKey)||readReloadAccess();
      if(saved&&await verify(saved)){
        if(returningFromProtectedPage)history.replaceState(null,'','./board.html');
        return true;
      }
      if(saved)clearAccess();
    }catch(e){}
  }else if(!isPageReload){
    clearAccess();
  }
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
