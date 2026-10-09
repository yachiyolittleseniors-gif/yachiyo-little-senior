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
  boardLoginExitStarted=true;
  // Force a fresh document instead of continuing an old authorized snapshot.
  const target=teamReturnCaptured?'./board.html?from='+teamReturnCaptured:'./board.html?entry=home';
  location.replace(target);
});
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
    if(boardLoginExitStarted||boardDocumentSuspended)return false;
    saveAccess(result.token||value);
    grantAdminReveal();
    boardAccessAuthorized=true;
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
        if(!result?.token||boardLoginExitStarted||boardDocumentSuspended)return false;
        saveAccess(result.token);
        grantAdminReveal();
        rememberPasskeyVerification()
        try{localStorage.setItem(passkeyKey,'1')}catch(_){}
        boardAccessAuthorized=true;
        document.documentElement.style.visibility='';
        return true;
      }catch(e){
        if(e?.status===404){
          try{localStorage.removeItem(passkeyKey)}catch(_){}
        }
        // A user-cancelled passkey must not trigger a second password dialog.
        // Other failures keep the existing password fallback available.
        const cancelled=e?.name==='NotAllowedError'||e?.name==='AbortError'||
          /キャンセル|cancelled|canceled/i.test(String(e?.message||''));
        return cancelled?'cancelled':false;
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
  const passkeyResult=await verifyPasskey();
  if(boardLoginExitStarted||boardDocumentSuspended)return false;
  if(passkeyResult===true)return true;
  if(passkeyResult==='cancelled')return returnToTeamHome();
  const p=prompt('パスワードを入力してください。');
  if(p===null)return returnToTeamHome();
  try{
    if(await verify(p))return true;
  }catch(e){
    if(boardLoginExitStarted||boardDocumentSuspended)return false;
    alert(e.rateLimited?e.message:'パスワードを確認できませんでした。通信状況を確認してください。');
    return returnToTeamHome();
  }
  if(boardLoginExitStarted||boardDocumentSuspended)return false;
  alert('パスワードが違います。');
  return returnToTeamHome();
})();
