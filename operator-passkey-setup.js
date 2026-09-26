window.__operatorSetupLoaded=true;
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
      title.textContent='生体認証を登録済み';
      text.textContent='次回から生体認証でログインできます。';
      button.hidden=false; button.textContent='この端末の生体認証を削除';
    }else{
      title.textContent='生体認証で次回からログイン';
      text.textContent='この端末に登録すると、次回からパスワード入力を省略できます。使えない場合は従来のパスワードで入れます。';
      button.textContent='この端末に登録';
      button.hidden=false;
    }
    button.addEventListener('click',async()=>{
      if(button.disabled)return;
      if(button.textContent.includes('削除')){
        if(!confirm('この端末の生体認証を削除しますか？\n削除後はパスワードでログインし直すと再登録できます。'))return;
        button.disabled=true; button.textContent='端末で認証してください';
        try{
          await window.YLSOperatorPasskeys.remove();
          title.textContent='生体認証で次回からログイン';
          text.textContent='この端末に登録すると、次回からパスワード入力を省略できます。使えない場合は従来のパスワードで入れます。';
          button.textContent='この端末に登録';
        }catch(e){
          if(e?.name!=='NotAllowedError')alert(e?.message||'生体認証を削除できませんでした。');
          button.textContent='この端末の生体認証を削除';
        }finally{button.disabled=false}
        return;
      }
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