(function(){
  'use strict';
  const TEAM_PATH='/board.html';
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
      if(url.origin!==location.origin||url.pathname!==TEAM_PATH)return;
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
    const link=event.target?.closest?.('a[href]');
    setFreshBoardEntry(link);
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
