document.documentElement.style.visibility='hidden';
window.coachAccessReady=(async function(){
  const API='/.netlify/functions/coach-attendance-data';
  const storageKey='yachiyoCoachAttendancePass';
  function remember(value){try{sessionStorage.setItem(storageKey,value)}catch(e){}}
  async function verifyPassword(value){
    if(!value)return false;
    try{
      const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({action:'verifyCoachPassword',password:value})});
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
    const value=await window.YLSOperatorPasskeys.authorize('運営用パスワードを入力してください。');
    if(value){remember(value);document.documentElement.style.visibility='';return true}
    location.replace('./board.html?from=coach');return false;
  }
  document.documentElement.style.visibility='';
  const entered=prompt('運営用パスワードを入力してください。');
  if(entered===null){location.replace('./board.html?from=coach');return false}
  if(await verifyPassword(entered))return true;
  alert('パスワードが違います。');location.replace('./board.html');return false;
})()
