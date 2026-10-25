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
  const credentialKey='yachiyoBoardPasskeyCredentialID';
  function hasCredentialBinding(){
    try{return Boolean(localStorage.getItem(credentialKey))}catch(e){return false}
  }
  function setCollapsed(collapsed){
    panel.classList.toggle('is-collapsed',collapsed);
    summary.setAttribute('aria-expanded',collapsed?'false':'true');
    if(chevron)chevron.textContent=collapsed?'▼':'▲';
  }
  function showRegisteredState(){
    panel.classList.add('is-registered');
    title.textContent='生体認証を登録済み';
    text.textContent='次回からこの端末では、八千代リトルシニアの登録済み生体認証だけを指定してログインします。';
    button.textContent='この端末の生体認証を削除';
    setCollapsed(true);
  }
  function showBindingState(){
    panel.classList.remove('is-registered');
    title.textContent='生体認証を再確認';
    text.textContent='候補が混ざらないよう、この端末で使う八千代リトルシニアの生体認証を一度だけ確認します。';
    button.textContent='この端末の生体認証を確認';
    setCollapsed(false);
  }
  try{registered=localStorage.getItem('yachiyoBoardPasskeyRegistered')==='1'}catch(e){}
  if(registered&&hasCredentialBinding())showRegisteredState();
  else if(registered)showBindingState();
  summary.addEventListener('click',()=>setCollapsed(!panel.classList.contains('is-collapsed')));
  button.addEventListener('click',async()=>{
    if(registered&&!hasCredentialBinding()){
      button.disabled=true;
      button.textContent='端末で認証してください';
      try{
        const accessValue=sessionStorage.getItem('yachiyoAttendancePass')||localStorage.getItem('yachiyoAttendanceReloadPass')||'';
        await window.YLSPasskeys.bindExisting(accessValue);
        try{localStorage.setItem('yachiyoBoardPasskeyRegistered','1')}catch(e){}
        showRegisteredState();
      }catch(error){
        const cancelled=error?.name==='NotAllowedError'||/キャンセル/.test(error?.message||'');
        if(!cancelled)alert(error?.message||'生体認証を確認できませんでした。');
        showBindingState();
      }finally{button.disabled=false}
      return;
    }
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
