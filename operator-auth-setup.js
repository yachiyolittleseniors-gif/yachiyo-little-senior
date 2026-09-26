(()=>{
  const ready=(fn)=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn,{once:true}):fn();
  ready(async()=>{
    const allowed=await window.coachAccessReady;
    if(!allowed)return;
    const panel=document.getElementById('coachPasskeySetupPanel');
    const summary=document.getElementById('coachPasskeySetupSummary');
    const button=document.getElementById('coachPasskeySetupButton');
    const title=document.getElementById('coachPasskeySetupTitle');
    const text=document.getElementById('coachPasskeySetupText');
    const chevron=document.getElementById('coachPasskeySetupChevron');
    if(!panel||!button||!title||!text)return;
    panel.hidden=false;

    let registered=false;
    try{registered=Boolean((await window.YLSOperatorAuth.status())?.registered)}catch(e){registered=false}

    const render=()=>{
      if(registered){
        panel.classList.add('is-registered','is-collapsed');
        title.textContent='運営用の生体認証を登録済み';
        text.textContent='指導者出欠・事務局・審判部で共通して利用できます。';
        button.hidden=true;
        if(summary){summary.hidden=false;summary.setAttribute('aria-expanded','false')}
        if(chevron)chevron.textContent='▼';
      }else{
        panel.classList.remove('is-registered','is-collapsed');
        title.textContent='運営用の生体認証を登録';
        text.textContent='ここで登録すると、指導者出欠・事務局・審判部で共通して利用できます。';
        button.hidden=false;
        button.textContent='この端末に登録';
        if(summary)summary.hidden=true;
      }
    };
    render();

    if(summary)summary.addEventListener('click',()=>{
      if(!registered)return;
      const collapsed=panel.classList.toggle('is-collapsed');
      summary.setAttribute('aria-expanded',collapsed?'false':'true');
      if(chevron)chevron.textContent=collapsed?'▼':'▲';
    });

    button.addEventListener('click',async()=>{
      if(registered||button.disabled)return;
      let access='';
      try{access=sessionStorage.getItem('yachiyoCoachAttendancePass')||''}catch(e){}
      if(!access){alert('運営用パスワードで入り直してください。');return}
      button.disabled=true;button.textContent='登録しています…';
      try{
        const label=navigator.userAgentData?.platform||navigator.platform||'登録端末';
        await window.YLSOperatorAuth.register(access,label);
        registered=true;render();
        alert('運営用の生体認証を登録しました。');
      }catch(error){
        const cancelled=error?.name==='NotAllowedError'||/キャンセル/.test(error?.message||'');
        if(!cancelled)alert(error?.message||'生体認証を登録できませんでした。');
        button.textContent='この端末に登録';
      }finally{button.disabled=false}
    });
  });
})();