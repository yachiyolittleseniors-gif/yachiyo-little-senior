(()=>{
  const ready=fn=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn,{once:true}):fn();
  ready(async()=>{
    const panel=document.getElementById('coachPasskeySetupPanel');
    const button=document.getElementById('coachPasskeySetupButton');
    const title=document.getElementById('coachPasskeySetupTitle');
    const text=document.getElementById('coachPasskeySetupText');
    if(!panel||!button||!title||!text)return;
    panel.hidden=false;
    let registered=false;
    try{registered=Boolean((await window.YLSOperatorPasskeys.status())?.registered)}catch(e){}
    if(registered){
      title.textContent='運営用の生体認証を登録済み';
      text.textContent='指導者出欠・事務局・審判部で共通して利用できます。';
      button.hidden=true;
    }else{
      title.textContent='運営用の生体認証を登録';
      text.textContent='ここで登録すると、指導者出欠・事務局・審判部で共通して利用できます。';
      button.textContent='この端末に登録';
      button.hidden=false;
    }
    button.addEventListener('click',async()=>{
      if(button.disabled)return;
      const allowed=await window.coachAccessReady;
      if(!allowed)return;
      let access='';try{access=sessionStorage.getItem('yachiyoCoachAttendancePass')||''}catch(e){}
      if(!access){alert('運営用パスワードで入り直してください。');return}
      button.disabled=true;button.textContent='登録しています…';
      try{
        const label=navigator.userAgentData?.platform||navigator.platform||'登録端末';
        await window.YLSOperatorPasskeys.register(access,label);
        title.textContent='運営用の生体認証を登録済み';
        text.textContent='指導者出欠・事務局・審判部で共通して利用できます。';
        button.hidden=true;
        alert('運営用の生体認証を登録しました。');
      }catch(e){
        const cancelled=e?.name==='NotAllowedError'||/キャンセル/.test(e?.message||'');
        if(!cancelled)alert(e?.message||'生体認証を登録できませんでした。');
        button.textContent='この端末に登録';
      }finally{button.disabled=false}
    });
  });
})();