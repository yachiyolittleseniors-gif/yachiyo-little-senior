document.documentElement.style.visibility='hidden';
window.coachAccessReady=(async function(){
  const API='/.netlify/functions/coach-attendance-data';
  const storageKey='yachiyoCoachAttendancePass';
  const params=new URLSearchParams(location.search);
  const freshBoardEntry=params.get('entry')==='board';
  let loginError='';
  if(freshBoardEntry){
    try{sessionStorage.removeItem(storageKey)}catch(e){}
  }
  function remember(value){try{sessionStorage.setItem(storageKey,value)}catch(e){}}
  async function verifyPassword(value){
    if(!value)return false;
    try{
      const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({action:'verifyCoachPassword',password:value})});
      if(response.status===429){
        const result=await response.json().catch(()=>({}));
        loginError=result.error||'ログインの試行回数が多いため、一時的に制限しています。しばらく待ってからお試しください。';
        return false;
      }
      if(!response.ok)return false;
      const result=await response.json().catch(()=>({}));
      remember(result.token||value);
      return true;
    }catch(e){return false}
  }
  let saved='';try{saved=sessionStorage.getItem(storageKey)||''}catch(e){}
  if(saved){document.documentElement.style.visibility='';return true}
  try{sessionStorage.removeItem('yachiyoBoardPasskeyJustVerified')}catch(e){}
  if(window.YLSOperatorPasskeys?.authorize){
    const value=await window.YLSOperatorPasskeys.authorize('パスワードを入力して下さい。');
    if(value){
      remember(value);
      if(freshBoardEntry)history.replaceState(null,'',location.pathname);
      document.documentElement.style.visibility='';
      return true
    }
    location.replace('./board.html?from=coach');return false;
  }
  document.documentElement.style.visibility='';
  const entered=prompt('パスワードを入力して下さい。');
  if(entered===null){location.replace('./board.html?from=coach');return false}
  if(await verifyPassword(entered)){
    if(freshBoardEntry)history.replaceState(null,'',location.pathname);
    document.documentElement.style.visibility='';
    return true
  }
  alert(loginError||'パスワードが違います。');location.replace('./board.html');return false;
})()
