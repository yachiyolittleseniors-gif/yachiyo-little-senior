(()=>{
  function ready(fn){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true});
    else fn();
  }
  ready(async()=>{
    const allowed=await window.coachAccessReady;
    if(!allowed)return;

    const panel=document.getElementById('coachPasskeySetupPanel');
    const summary=document.getElementById('coachPasskeySetupSummary');
    const button=document.getElementById('coachPasskeySetupButton');
    const title=document.getElementById('coachPasskeySetupTitle');
    const text=document.getElementById('coachPasskeySetupText');
    if(!panel||!button||!title||!text)return;
    panel.hidden=false;

    let registered=false;
    try{
      if(window.YLSCoachPasskeys?.status){
        const state=await window.YLSCoachPasskeys.status();
        registered=Boolean(state?.registered);
      }
    }catch(e){registered=false}

    function render(){
      if(registered){
        panel.classList.add('is-registered','is-collapsed');
        title.textContent='生体認証を登録済み';
        text.textContent='次回から生体認証でログインできます。';
        button.hidden=true;
        if(summary)summary.hidden=false;
      }else{
        panel.classList.remove('is-registered','is-collapsed');
        title.textContent='生体認証で次回からログイン';
        text.textContent='この端末に登録すると、次回から指導者用パスワードの入力を省略できます。';
        button.hidden=false;
        button.textContent='この端末に登録';
        if(summary)summary.hidden=true;
      }
    }
    render();

    if(summary){
      summary.addEventListener('click',()=>{
        if(!registered)return;
        const collapsed=panel.classList.toggle('is-collapsed');
        summary.setAttribute('aria-expanded',collapsed?'false':'true');
        const chevron=document.getElementById('coachPasskeySetupChevron');
        if(chevron)chevron.textContent=collapsed?'▼':'▲';
      });
    }

    button.addEventListener('click',async(event)=>{
      event.preventDefault();
      if(registered||button.disabled)return;

      if(!window.YLSCoachPasskeys?.register){
        alert('生体認証の準備ができていません。');
        return;
      }

      let access='';
      try{access=sessionStorage.getItem('yachiyoCoachAttendancePass')||''}catch(e){}
      if(!access){
        alert('一度チーム専用ページへ戻り、指導者用パスワードで入り直してください。');
        return;
      }

      button.disabled=true;
      button.textContent='生体認証を登録しています…';
      try{
        const deviceLabel=navigator.userAgentData?.platform||navigator.platform||'登録端末';
        await window.YLSCoachPasskeys.register(access,deviceLabel);
        registered=true;
        render();
        alert('生体認証を登録しました。');
      }catch(error){
        const cancelled=error?.name==='NotAllowedError'||/キャンセル/.test(error?.message||'');
        if(!cancelled)alert(error?.message||'生体認証を登録できませんでした。');
        button.textContent='この端末に登録';
      }finally{
        button.disabled=false;
      }
    });
  });
})();