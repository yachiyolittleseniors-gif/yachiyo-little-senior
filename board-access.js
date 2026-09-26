document.documentElement.style.visibility='hidden';
window.boardAccessReady=(async function requireBoardPassword(){
  const accessKey='yachiyoAttendancePass';
  const reloadKey='yachiyoAttendanceReloadPass';
  const reloadExpiryKey='yachiyoAttendanceReloadPassExpires';
  const passkeyKey='yachiyoBoardPasskeyRegistered';
  const reloadLifetime=12*60*60*1000;
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
    if(!response.ok)return false;
    const result=await response.json().catch(()=>({}));
    saveAccess(result.token||value);
    document.documentElement.style.visibility='';
    return true;
  }
  async function verifyPasskey(){
    // Do not gate WebAuthn behind browser-local storage. A passkey registered
    // in iCloud Keychain can be available to Safari and Chrome on the same
    // iPhone even though each browser has separate localStorage.
    if(!window.YLSPasskeys?.supported())return false;
    try{
      const result=await window.YLSPasskeys.authenticate();
      if(!result?.token)return false;
      saveAccess(result.token);
      // Keep this only as a UI hint for the current browser; it is no longer
      // required in order to attempt passkey authentication.
      try{localStorage.setItem(passkeyKey,'1')}catch(_){}
      document.documentElement.style.visibility='';
      return true;
    }catch(e){
      // 404 means no passkeys exist on the server. 401 means authentication
      // failed; neither should prevent another browser from trying next time.
      if(e?.status===404){
        try{localStorage.removeItem(passkeyKey)}catch(_){}
      }
      return false;
    }
  }
  const searchParams=new URLSearchParams(location.search);
  const returnSource=searchParams.get('from');
  const historyFocus=searchParams.get('focus');
  const returningFromProtectedPage=['documents','coach','attendance','player'].includes(returnSource);
  const returningFromUpdateHistory=['schedule','duty-roster','rules'].includes(historyFocus);
  const navigationEntry=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];
  const isPageReload=navigationEntry&&navigationEntry.type==='reload';
  if(returningFromProtectedPage||returningFromUpdateHistory||isPageReload){
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
    alert('パスワードを確認できませんでした。通信状況を確認してください。');
    location.replace('./');
    return false;
  }
  alert('パスワードが違います。');
  location.replace('./');
  return false;
})();
