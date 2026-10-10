(function(){
  'use strict';
  // Netlify Pretty URLs rewrites static links to /board. Accept the same
  // board route with or without .html and a trailing slash. This is only
  // gesture detection; the server still verifies every login credential.
  const TEAM_PATH=/^\/board(?:\.html)?\/?$/;
  function clearCachedBoardLogin(){
    try{
      sessionStorage.removeItem('yachiyoAttendancePass');
      sessionStorage.removeItem('yachiyoBoardPasskeyJustVerified');
    }catch(_){}
    try{
      localStorage.removeItem('yachiyoAttendanceReloadPass');
      localStorage.removeItem('yachiyoAttendanceReloadPassExpires');
    }catch(_){}
    // Keep passkey registration metadata and team admin settings intact.
  }
  function setFreshBoardEntry(link){
    if(!link)return;
    try{
      const url=new URL(link.href,location.href);
      if(url.origin!==location.origin||!TEAM_PATH.test(url.pathname))return;
      if(url.searchParams.get('entry')==='home')return;
      url.searchParams.set('entry','home');
      link.setAttribute('href',url.pathname+url.search+url.hash);
    }catch(_){}
  }
  function updateLinks(){
    document.querySelectorAll('a[href]').forEach(setFreshBoardEntry);
  }
  // Catch dynamically-created lock links, even if the user taps immediately.
  document.addEventListener('click',function(event){
    if(event.isTrusted===false||event.defaultPrevented||event.button>0||
       event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=event.target?.closest?.('a[href]');
    if(!link||link.target&&link.target!=='_self')return;
    setFreshBoardEntry(link);
    try{
      const url=new URL(link.href,location.href);
      if(url.origin!==location.origin||!TEAM_PATH.test(url.pathname))return;
      const nonce=(typeof crypto!=='undefined'&&crypto.randomUUID)
        ?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),
          byte=>byte.toString(16).padStart(2,'0')).join('');
      sessionStorage.setItem('yachiyoBoardEntryIntentV2',JSON.stringify({nonce,at:Date.now()}));
      url.searchParams.set('entry','home');
      url.searchParams.set('yls_intent',nonce);
      link.setAttribute('href',url.pathname+url.search+url.hash);
    }catch(_){}
  },true);
  // A new home visit, including a Safari Back restoration, ends the old
  // client-side board session. A new Home->Board entry asks for a passkey.
  clearCachedBoardLogin();
  document.addEventListener('DOMContentLoaded',updateLinks,{once:true});
  window.addEventListener('pageshow',function(){
    clearCachedBoardLogin();
    updateLinks();
  });
})();
