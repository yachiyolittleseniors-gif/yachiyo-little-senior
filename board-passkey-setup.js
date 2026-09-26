(async()=>{
  const allowed=await window.boardAccessReady;
  if(!allowed||!window.YLSPasskeys?.supported())return;
  const panel=document.getElementById('passkeySetupPanel');
  const summary=document.getElementById('passkeySetupSummary');
  const chevron=document.getElementById('passkeySetupChevron');
  const button=document.getElementById('passkeySetupButton');
  const title=document.getElementById('passkeySetupTitle');
  const text=document.getElementById('passkeySetupText');
  if(!panel||!summary||!button)return;
  panel.hidden=false;
  let registered=false;
  function setCollapsed(collapsed){
    panel.classList.toggle('is-collapsed',collapsed);
    summary.setAttribute('aria-expanded',collapsed?'false':'true');
    if(chevron)chevron.textContent=collapsed?'▼':'▲';
  }
  function showRegisteredState(){
    panel.classList.add('is-registered');
    title.textContent='生体認証を登録済み';
    text.textContent='次回から生体認証でログインできます。別の端末にも登録する場合は、その端末でパスワードログイン後に登録してください。';
    button.textContent='この端末の生体認証を削除';
    setCollapsed(true);
  }
  try{registered=localStorage.getItem('yachiyoBoardPasskeyRegistered')==='1'}catch(e){}
  if(registered)showRegisteredState();
  summary.addEventListener('click',()=>setCollapsed(!panel.classList.contains('is-collapsed')));
  button.addEventListener('click',async()=>{
    if(registered){
      if(!confirm('この端末の生体認証を削除しますか？\n削除後はパスワードでログインし直すと再登録できます。'))return;
      button.disabled=true;
      button.textContent='端末で認証してください';
      try{
        await window.YLSPasskeys.remove();
        try{localStorage.removeItem('yachiyoBoardPasskeyRegistered')}catch(e){}
        registered=false;
        panel.classList.remove('is-registered');
        title.textContent='生体認証を登録';
        text.textContent='この端末に生体認証を登録すると、次回から生体認証でログインできます。';
        button.textContent='この端末に登録';
        setCollapsed(false);
      }catch(error){
        const cancelled=error?.name==='NotAllowedError'||/キャンセル/.test(error?.message||'');
        if(!cancelled)alert(error?.message||'生体認証を削除できませんでした。');
        button.textContent='この端末の生体認証を削除';
      }finally{button.disabled=false}
      return;
    }
    button.disabled=true;
    button.textContent='端末で認証してください';
    try{
      const accessValue=sessionStorage.getItem('yachiyoAttendancePass')||localStorage.getItem('yachiyoAttendanceReloadPass')||'';
      const deviceLabel=navigator.userAgentData?.platform||navigator.platform||'登録端末';
      await window.YLSPasskeys.register(accessValue,deviceLabel);
      try{localStorage.setItem('yachiyoBoardPasskeyRegistered','1')}catch(e){}
      registered=true;
      showRegisteredState();
    }catch(error){
      const cancelled=error?.name==='NotAllowedError'||/キャンセル/.test(error?.message||'');
      if(!cancelled)alert(error?.message||'生体認証を登録できませんでした。');
      button.textContent=registered?'この端末の生体認証を削除':'この端末に登録';
    }finally{button.disabled=false}
  });
})();
