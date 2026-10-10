document.documentElement.style.visibility='hidden';
// Safari can restore an unfinished authentication page from its back/forward cache.
// Such a page must never expose the protected content or stay blank indefinitely.
let boardLoginExitStarted=false;
function returnToTeamHome(){
  if(boardLoginExitStarted)return false;
  boardLoginExitStarted=true;
  // Do not use history.back(): the previous history entry may be a hidden
  // board page, especially when Safari restores tabs after being closed.
  location.replace('./');
  return false;
}
// Hidden pages kept by Safari must not resume with a previous login UI state.
// A normal return from an internal team screen can re-validate the existing
// session; a return from Home or any untrusted navigation must authenticate anew.
let boardAccessAuthorized=false;
let boardDocumentSuspended=false;
let teamReturnCandidate='';
let teamReturnCaptured='';
let teamReturnClickedAt=0;
const teamReturnPages={
  '/attendance.html':'attendance',
  '/player-attendance.html':'player',
  '/coach-attendance.html':'coach',
  '/secretariat-documents.html':'documents'
};
document.addEventListener('click',function(event){
  const link=event.target?.closest?.('a[href]');
  teamReturnCandidate='';
  if(!link||event.defaultPrevented||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  try{
    const next=new URL(link.href,location.href);
    if(next.origin===location.origin&&teamReturnPages[next.pathname]){
      teamReturnCandidate=teamReturnPages[next.pathname];
      teamReturnClickedAt=Date.now();
    }
  }catch(_){}
},true);
window.addEventListener('pagehide',function(){
  // Mobile Safari saves DOM visibility in the back/forward cache.
  // Conceal content before it can be cached or displayed in a restored tab.
  teamReturnCaptured=teamReturnCandidate&&Date.now()-teamReturnClickedAt<5000?teamReturnCandidate:'';
  boardDocumentSuspended=true;
  document.documentElement.style.visibility='hidden';
});
window.addEventListener('pageshow',function(event){
  if(!event.persisted)return;
  document.documentElement.style.visibility='hidden';
  if(boardLoginExitStarted)return;
  if(!boardAccessAuthorized){
    // An authentication ceremony was interrupted by Safari.
    returnToTeamHome();
    return;
  }
  // A page restored from Safari's back/forward cache is not a user request to log in.
  // Only internal child-page returns may resume a still-valid existing session.
  // Never navigate to ?entry=home here: that used to pop Face ID unexpectedly.
  if(!teamReturnCaptured)returnToTeamHome();
  else{
    boardLoginExitStarted=true;
    location.replace('./board.html?from='+teamReturnCaptured);
  }
});
window.boardAccessReady=(async function requireBoardPassword(){
  const accessKey='yachiyoAttendancePass';
  const reloadKey='yachiyoAttendanceReloadPass';
  const reloadExpiryKey='yachiyoAttendanceReloadPassExpires';
  const passkeyKey='yachiyoBoardPasskeyRegistered';
  const passkeySkipUntilKey='yachiyoBoardPasskeySkipUntil';
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

  function shouldAutoTryPasskey(){
    // Only auto-launch WebAuthn on a browser/device that has previously
    // completed passkey setup or authentication. This avoids Android/Chrome's
    // native "no passkey available" dialog on devices that have none.
    try{
      const skipUntil=Number(sessionStorage.getItem(passkeySkipUntilKey)||0);
      if(Number.isFinite(skipUntil)&&skipUntil>Date.now())return false;
      return localStorage.getItem(passkeyKey)==='1';
    }catch(e){return false}
  }
  function temporarilySkipPasskey(){
    try{sessionStorage.setItem(passkeySkipUntilKey,String(Date.now()+10*60*1000))}catch(e){}
  }
  function clearPasskeySkip(){
    try{sessionStorage.removeItem(passkeySkipUntilKey)}catch(e){}
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
    if(boardLoginExitStarted||boardDocumentSuspended)return false;
    saveAccess(result.token||value);
    grantAdminReveal();
    boardAccessAuthorized=true;
    document.documentElement.style.visibility='';
    return true;
  }
  let passkeyAttempt=null;
  async function verifyPasskey(){
    // A deliberate Home -> Team Page tap is the authority to start WebAuthn.
    // Do not rely on the browser-local registration marker here: Safari/Chrome,
    // Home Screen launches, iCloud Keychain restores, and cleared site data can
    // lose that marker even while the passkey itself still exists.
    if(!window.YLSPasskeys?.supported())return false;
    if(!shouldAutoTryPasskey())return false;
    if(passkeyAttempt)return passkeyAttempt;
    passkeyAttempt=(async()=>{
      try{
        const result=await window.YLSPasskeys.authenticate();
        if(!result?.token||boardLoginExitStarted||boardDocumentSuspended)return false;
        saveAccess(result.token);
        grantAdminReveal();
        rememberPasskeyVerification()
        try{localStorage.setItem(passkeyKey,'1')}catch(_){}
        clearPasskeySkip();
        boardAccessAuthorized=true;
        document.documentElement.style.visibility='';
        return true;
      }catch(e){
        if(e?.status===404){
          try{localStorage.removeItem(passkeyKey)}catch(_){}
        }
        // Android/Chrome also reports a missing local credential as
        // NotAllowedError. Treat it as a normal fallback to password instead
        // of bouncing the user back Home, and avoid re-opening the native
        // passkey dialog repeatedly during this session.
        if(e?.name==='NotAllowedError'){
          temporarilySkipPasskey();
          return false;
        }
        const cancelled=e?.name==='AbortError'||
          /キャンセル|cancelled|canceled|aborted/i.test(String(e?.message||''));
        return cancelled?'cancelled':false;
      }
    })();
    try{
      return await passkeyAttempt;
    }finally{
      passkeyAttempt=null;
    }
  }
  const searchParams=new URLSearchParams(location.search);
  const navigationEntry=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];
  const isPageReload=!!(navigationEntry&&navigationEntry.type==='reload');
  // One-use proof that the user actually clicked a link to the team page.
  // A restored Safari tab, stale referrer, or bookmarked URL must never
  // start navigator.credentials.get() by itself.
  const entryIntentKey='yachiyoBoardEntryIntentV2';
  const incomingIntent=searchParams.get('yls_intent')||'';
  let freshHomeEntry=false;
  try{
    const recorded=JSON.parse(sessionStorage.getItem(entryIntentKey)||'null');
    sessionStorage.removeItem(entryIntentKey);
    const age=Date.now()-Number(recorded?.at||0);
    freshHomeEntry=!!incomingIntent&&incomingIntent===recorded?.nonce&&
      /^[a-f0-9-]{16,64}$/i.test(incomingIntent)&&
      Number.isFinite(age)&&age>=0&&age<=30*1000&&!isPageReload;
  }catch(_){}
  // Strip entry parameters even when restoring an abandoned authentication URL.
  if(searchParams.has('entry')||searchParams.has('yls_intent')){
    try{
      const cleanUrl=new URL(location.href);
      cleanUrl.searchParams.delete('entry');
      cleanUrl.searchParams.delete('yls_intent');
      history.replaceState(history.state,'',cleanUrl.pathname+cleanUrl.search+cleanUrl.hash);
    }catch(_){}
  }
  if(freshHomeEntry){
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
  const trustedResume=returningFromProtectedPage||returningFromUpdateHistory||returningFromLineLogin||isPageReload;
  if(!freshHomeEntry&&trustedResume&&hasFreshPasskeyVerification()){
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
  if(!freshHomeEntry&&trustedResume){
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
  // Safari/Chrome do not always preserve the one-use intent marker when
  // opening the team page from a cached Home page or a dynamically inserted link.
  // Treat a visible, same-origin navigation from Home as an equally valid user
  // gesture so passkey/Face ID is attempted before falling back to the password.
  let cameFromHome=false;
  try{
    const ref=new URL(document.referrer||'',location.href);
    cameFromHome=ref.origin===location.origin&&(ref.pathname==='/'||ref.pathname==='/index.html');
  }catch(_){}
  const directForegroundEntry=!isPageReload&&document.visibilityState==='visible'&&
    (!navigationEntry||navigationEntry.type==='navigate');
  const deliberateHomeEntry=freshHomeEntry||(cameFromHome&&directForegroundEntry);
  if(!freshHomeEntry&&!directForegroundEntry)return returnToTeamHome();

  if(deliberateHomeEntry){
    // Auto WebAuthn only on devices with a local passkey-success marker.
    // Devices without one go straight to the normal password fallback.
    const passkeyResult=await verifyPasskey();
    if(boardLoginExitStarted||boardDocumentSuspended)return false;
    if(passkeyResult===true)return true;
    // Cancelling Face ID must not trigger another native dialog or loop.
    if(passkeyResult==='cancelled')return returnToTeamHome();
  }

  // Unregistered or unsupported passkeys, expired registrations, transient
  // WebAuthn errors, and direct URL visits all retain password-based entry.
  const password=prompt('チーム専用ページのパスワードを入力してください。');
  if(boardLoginExitStarted||boardDocumentSuspended)return false;
  if(password===null)return returnToTeamHome();
  try{
    if(await verify(password))return true;
  }catch(error){
    if(boardLoginExitStarted||boardDocumentSuspended)return false;
    alert(error.rateLimited?error.message:'パスワードを確認できませんでした。通信状況を確認してください。');
    return returnToTeamHome();
  }
  if(boardLoginExitStarted||boardDocumentSuspended)return false;
  alert('パスワードが違います。');
  return returnToTeamHome();
})();
