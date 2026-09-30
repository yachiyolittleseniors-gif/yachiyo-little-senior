(()=>{
  const nativeFetch=window.fetch.bind(window);
  const key='yachiyoAdminSessionExpiresAt';
  let timer=null,verifiedUntil=0;
  function expire(){
    verifiedUntil=0;
    if(timer)clearTimeout(timer);
    timer=null;
    try{localStorage.removeItem(key);localStorage.removeItem('yachiyoAdminRevealUntil');sessionStorage.removeItem('yachiyoAdminPassword')}catch(_){}
    document.dispatchEvent(new Event('yachiyo:admin-session-expired'));
  }
  function activate(expiresAt){
    if(!Number.isFinite(expiresAt)||expiresAt<=Date.now()){expire();return;}
    verifiedUntil=expiresAt;
    try{localStorage.setItem(key,String(expiresAt))}catch(_){}
    if(timer)clearTimeout(timer);
    timer=setTimeout(()=>expire(),Math.max(0,expiresAt-Date.now()));
    document.dispatchEvent(new Event('yachiyo:admin-session-active'));
  }
  window.YLSAdminSession={activate,isActive:()=>verifiedUntil>Date.now(),expiresAt:()=>verifiedUntil};
  window.fetch=async(input,init)=>{
    const response=await nativeFetch(input,init);
    try{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.origin===location.origin&&url.pathname.startsWith('/.netlify/functions/')&&response.status===401){
        const error=await response.clone().json();
        if(error.code==='ADMIN_SESSION_EXPIRED')expire();
      }
    }catch(_){}
    return response;
  };
  async function verify(){
    try{
      const response=await nativeFetch('/.netlify/functions/admin-session',{cache:'no-store'});
      if(response.ok){const data=await response.json();activate(data.expiresAt)}
      else expire();
    }catch(_){expire()}
  }
  verify();
  window.addEventListener('storage',event=>{
    if(event.key===key){if(event.newValue)verify();else expire();}
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)return;
    if(verifiedUntil&&verifiedUntil<=Date.now())expire();
  });
})();
