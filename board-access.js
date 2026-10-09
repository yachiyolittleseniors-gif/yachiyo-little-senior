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
  // If a home navigation lost its one-time intent (for example, old Safari
  // cache, a direct link, a private browsing window, or cross-app navigation),
  // do not redirect the person in a loop. Ask for an explicit user action.
  // A passive Safari restoration still cannot launch the passkey UI by itself.
  async function manualLoginChoice(){
    if(document.readyState==='loading'){
      await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
    }
    if(boardLoginExitStarted||boardDocumentSuspended)return 'exit';
    const gate=document.createElement('div');
    gate.id='yls-board-login-gate';
    gate.setAttribute('role','dialog');
    gate.setAttribute('aria-modal','true');
    gate.setAttribute('aria-label','チーム専用ページのログイン');
    gate.style.cssText='position:fixed;inset:0;z-index:2147483646;box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:auto;padding:24px;background:#071426;color:#fff;visibility:visible;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN",Meiryo,sans-serif';
    const panel=document.createElement('section');
    panel.style.cssText='width:100%;max-width:390px;box-sizing:border-box;border:1px solid #ba984f;border-radius:16px;padding:28px 22px;text-align:center;background:#10243d;box-shadow:0 18px 45px rgba(0,0,0,.32)';
    const heading=document.createElement('h1');
    heading.textContent='チーム専用ページ';
    heading.style.cssText='margin:0 0 10px;font-size:22px;font-weight:800;color:#e2bd67';
    const description=document.createElement('p');
    description.textContent='ログイン方法を選択してください。';
    description.style.cssText='margin:0 0 22px;font-size:14px;line-height:1.7;color:#e3eaf2';
    function makeButton(label,primary){
      const button=document.createElement('button');
      button.type='button';
      button.textContent=label;
      button.style.cssText='display:block;width:100%;min-height:49px;margin:10px 0;border-radius:10px;border:1px solid #d6b567;padding:12px 8px;font:inherit;font-weight:800;font-size:15px;cursor:pointer;touch-action:manipulation;'+(primary?'background:#d6b567;color:#071426':'background:transparent;color:#fff');
      return button;
    }
    const passwordButton=makeButton('パスワードでログイン',true);
    const passkeyButton=makeButton('Face ID・パスキーでログイン',false);
    const homeButton=makeButton('ホームへ戻る',false);
    homeButton.style.borderColor='rgba(255,255,255,.25)';
    homeButton.style.color='#cbd5e1';
    let passkeyAvailable=false;
    try{passkeyAvailable=!!window.YLSPasskeys?.supported()&&localStorage.getItem(passkeyKey)==='1'}catch(_){}
    panel.appendChild(heading);
    panel.appendChild(description);
    panel.appendChild(passwordButton);
    if(passkeyAvailable)panel.appendChild(passkeyButton);
    panel.appendChild(homeButton);
    gate.appendChild(panel);
    document.body.appendChild(gate);
    passwordButton.focus({preventScroll:true});
    return new Promise(resolve=>{
      function select(value){gate.remove();resolve(value)}
      passwordButton.addEventListener('click',()=>select('password'),{once:true});
      passkeyButton.addEventListener('click',()=>select('passkey'),{once:true});
      homeButton.addEventListener('click',()=>select('home'),{once:true});
    });
  }

  let loginMethod=freshHomeEntry?'automatic':await manualLoginChoice();
  while(!boardLoginExitStarted&&!boardDocumentSuspended){
    if(loginMethod==='home'||loginMethod==='exit')return returnToTeamHome();
    if(loginMethod==='automatic'||loginMethod==='passkey'){
      const passkeyResult=await verifyPasskey();
      if(boardLoginExitStarted||boardDocumentSuspended)return false;
      if(passkeyResult===true)return true;
      // Do not launch native password prompts immediately after cancelling a
      // passkey; offer a deliberate choice to the person instead.
      if(loginMethod==='passkey'||passkeyResult==='cancelled'){
        loginMethod=await manualLoginChoice();
        continue;
      }
    }
    if(loginMethod==='automatic'||loginMethod==='password'){
      const p=prompt('チーム専用ページのパスワードを入力してください。');
      if(boardLoginExitStarted||boardDocumentSuspended)return false;
      if(p!==null){
        try{
          if(await verify(p))return true;
          if(!boardLoginExitStarted&&!boardDocumentSuspended)alert('パスワードが違います。');
        }catch(e){
          if(boardLoginExitStarted||boardDocumentSuspended)return false;
          alert(e.rateLimited?e.message:'パスワードを確認できませんでした。通信状況を確認してください。');
        }
      }
    }
    loginMethod=await manualLoginChoice();
  }
  return false;
})();
