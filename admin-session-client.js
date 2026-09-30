(()=>{
  const nativeFetch=window.fetch.bind(window);
  const key='yachiyoAdminSessionExpiresAt';
  let timer=null,noticeShown=false,verifiedUntil=0;
  function expire(showNotice){
    verifiedUntil=0;
    if(timer)clearTimeout(timer);
    timer=null;
    try{localStorage.removeItem(key);localStorage.removeItem('yachiyoAdminRevealUntil');sessionStorage.removeItem('yachiyoAdminPassword')}catch(_){}
    document.dispatchEvent(new Event('yachiyo:admin-session-expired'));
    if(!showNotice||noticeShown)return;
    noticeShown=true;
    const show=()=>{
      const note=document.createElement('div');
      note.setAttribute('role','alert');
      note.style.cssText='position:fixed;bottom:18px;left:12px;right:12px;z-index:50000;max-width:520px;margin:auto;padding:14px;border:1px solid #c79a3b;border-radius:12px;background:#071426;color:#fff;font-size:13px;line-height:1.6;box-shadow:0 4px 20px #0005';
      note.append(document.createTextNode('管理権限が終了しました。保存するには、チーム専用ページで再認証してください。 '));
      const link=document.createElement('a');link.href='./board.html';link.textContent='チーム専用ページへ';link.style.color='#e2bd67';note.append(link);
      const close=document.createElement('button');close.type='button';close.textContent='閉じる';close.style.cssText='margin-left:12px;background:transparent;border:0;color:#fff';close.addEventListener('click',()=>note.remove());note.append(close);
      document.body.append(note);
    };
    if(document.body)show();else document.addEventListener('DOMContentLoaded',show,{once:true});
  }
  function activate(expiresAt){
    if(!Number.isFinite(expiresAt)||expiresAt<=Date.now()){expire(false);return;}
    verifiedUntil=expiresAt;
    noticeShown=false;
    try{localStorage.setItem(key,String(expiresAt))}catch(_){}
    if(timer)clearTimeout(timer);
    timer=setTimeout(()=>expire(true),Math.max(0,expiresAt-Date.now()));
    document.dispatchEvent(new Event('yachiyo:admin-session-active'));
  }
  window.YLSAdminSession={activate,isActive:()=>verifiedUntil>Date.now(),expiresAt:()=>verifiedUntil};
  window.fetch=async(input,init)=>{
    const response=await nativeFetch(input,init);
    try{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.origin===location.origin&&url.pathname.startsWith('/.netlify/functions/')&&response.status===401){
        const error=await response.clone().json();
        if(error.code==='ADMIN_SESSION_EXPIRED')expire(true);
      }
    }catch(_){}
    return response;
  };
  async function verify(){
    try{
      const response=await nativeFetch('/.netlify/functions/admin-session',{cache:'no-store'});
      if(response.ok){const data=await response.json();activate(data.expiresAt)}
      else expire(false);
    }catch(_){expire(false)}
  }
  verify();
  window.addEventListener('storage',event=>{
    if(event.key===key){if(event.newValue)verify();else expire(false);}
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)return;
    if(verifiedUntil&&verifiedUntil<=Date.now())expire(true);
  });
})();
