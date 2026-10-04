(function(){
  const API='/.netlify/functions/duty-change-requests';
  const LIFF_ID='2011836404-Htm3MsCI';
  let token='';
  const loading=document.getElementById('loading');
  const content=document.getElementById('content');
  const message=document.getElementById('message');
  const approve=document.getElementById('approve');
  const familyConfirm=document.getElementById('familyConfirm');
  const lineAuthNotice=document.getElementById('lineAuthNotice');
  let idToken='';

  function showMessage(text,ok,retry){
    loading.hidden=true;loading.style.display='none';content.hidden=true;message.hidden=false;
    message.innerHTML='';
    message.className='status '+(ok?'ok':'error');
    const copy=document.createElement('div');
    copy.style.whiteSpace='pre-line';
    copy.textContent=text;
    message.appendChild(copy);
    if(retry){
      const btn=document.createElement('button');
      btn.type='button';btn.className='retry';btn.textContent='もう一度確認する';
      btn.addEventListener('click',function(){message.hidden=true;loading.hidden=false;init();});
      message.appendChild(btn);
    }
  }

  function formatDate(value){
    const p=String(value||'').split('-').map(Number);
    if(p.length!==3||p.some(Number.isNaN))return value;
    const d=new Date(p[0],p[1]-1,p[2]);
    return p[0]+'年'+p[1]+'月'+p[2]+'日（'+'日月火水木金土'[d.getDay()]+'）';
  }

  async function fetchJson(url,options){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const r=await fetch(url,{...options,credentials:'same-origin',cache:'no-store',signal:controller.signal});
      const j=await r.json().catch(()=>({}));
      if(!r.ok){
        const error=new Error(j.error||'処理できませんでした。');
        error.status=r.status;error.body=j;throw error;
      }
      return j;
    }catch(e){
      if(e&&e.name==='AbortError')throw new Error('通信に時間がかかっています。もう一度お試しください。');
      throw e;
    }finally{clearTimeout(timer)}
  }

  async function ensureLiffIdentity(){
    if(!window.liff)throw new Error('LINE本人確認を読み込めませんでした。LINEから承認リンクを開き直してください。');

    // LINE temporarily moves LIFF URL additions into liff.state on the primary
    // redirect. Do not inspect or rewrite the URL until liff.init() resolves.
    await window.liff.init({liffId:LIFF_ID});

    // After init, LINE restores the additional query parameters to the endpoint URL.
    token=new URLSearchParams(location.search).get('t')||'';
    if(!token)throw new Error('承認リンクの情報を確認できませんでした。申請者から届いたLINEの承認リンクを開き直してください。');

    if(!window.liff.isLoggedIn()){
      window.liff.login();
      return false;
    }
    // Always prefer a LIFF access token for this flow. It is available after
    // LIFF login and can be verified server-side before fetching /v2/profile.
    // This avoids device-specific getIDToken() null behavior.
    idToken='';
    window.__ylsLiffAccessToken='';
    const accessToken=typeof window.liff.getAccessToken==='function'?window.liff.getAccessToken():'';
    if(accessToken){
      window.__ylsLiffAccessToken=String(accessToken);
      return true;
    }

    // Fallback for environments where only the ID token is exposed.
    idToken=typeof window.liff.getIDToken==='function'?(window.liff.getIDToken()||''):'';
    if(idToken)return true;

    const diag=[
      'LIFF診断',
      'inClient='+(typeof window.liff.isInClient==='function'?String(window.liff.isInClient()):'unknown'),
      'loggedIn='+(typeof window.liff.isLoggedIn==='function'?String(window.liff.isLoggedIn()):'unknown'),
      'accessToken='+(accessToken?'あり':'なし'),
      'idToken='+(idToken?'あり':'なし'),
      'url='+location.href
    ].join('\n');
    throw new Error('LINE本人確認情報を取得できませんでした。\n'+diag);
  }

  async function call(action){
    return fetchJson(API,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({action,token,idToken,accessToken:String(window.__ylsLiffAccessToken||'')})
    });
  }

  function renderRequest(j){
    const x=j.request||{};
    document.getElementById('requestNo').textContent=x.requestNo?'#'+x.requestNo:'-';
    const isSwap=x.requestType==='swap';
    const dateLabel=document.getElementById('dateLabel'),fromLabel=document.getElementById('fromLabel'),toLabel=document.getElementById('toLabel');
    const confirmText=document.getElementById('confirmText'),approvalNote=document.getElementById('approvalNote');
    if(isSwap){
      if(dateLabel)dateLabel.textContent='内容';
      if(fromLabel)fromLabel.textContent='自分';
      if(toLabel)toLabel.textContent='相手';
      document.getElementById('date').textContent='当番日を入れ替える';
      document.getElementById('from').textContent=formatDate(x.date)+'　'+x.fromGrade+'年・'+x.fromName;
      document.getElementById('to').textContent=formatDate(x.swapDate)+'　'+x.swapGrade+'年・'+x.swapName;
      if(confirmText)confirmText.innerHTML='申請内容を確認しました。<br>当番日の入れ替えを了承します。';
      if(approvalNote)approvalNote.textContent='入れ替える相手のご家庭が内容を確認して承認してください。承認すると2つの当番日が同時に入れ替わり、このリンクは使用できなくなります。承認リンクは24時間有効です。';
    }else{
      document.getElementById('date').textContent=formatDate(x.date);
      document.getElementById('from').textContent=x.fromGrade+'年・'+x.fromName;
      document.getElementById('to').textContent=x.toGrade+'年・'+x.toName;
    }
    if(j.selfApprovalBlocked){
      lineAuthNotice.hidden=false;
      lineAuthNotice.textContent='この申請を行ったLINEアカウントでは承認できません。変更後のご家庭へ承認を依頼してください。';
      familyConfirm.checked=false;familyConfirm.disabled=true;approve.disabled=true;
    }else{
      lineAuthNotice.hidden=true;
      familyConfirm.disabled=false;
      approve.disabled=!familyConfirm.checked;
    }
    loading.hidden=true;loading.style.display='none';content.hidden=false;message.hidden=true;
  }

  async function init(){
    try{
      const ready=await ensureLiffIdentity();
      if(!ready)return;
      const j=await call('preview-partner-approval');
      renderRequest(j);
    }catch(e){
      const msg=e&&e.message?e.message:'申請内容を確認できませんでした。';
      const retry=/通信|時間がかかっています|処理できませんでした|確認できませんでした|読み込めませんでした/.test(msg);
      showMessage(msg,false,retry);
    }
  }

  familyConfirm.addEventListener('change',function(){approve.disabled=!familyConfirm.checked});
  approve.addEventListener('click',async function(){
    if(!familyConfirm.checked)return;
    approve.disabled=true;approve.textContent='承認中…';
    try{
      const j=await call('partner-approve');
      showMessage(j.message||'承認しました\n当番表へ反映されました',true);
    }catch(e){
      approve.disabled=false;approve.textContent='この変更を承認する';
      showMessage(e.message||'承認できませんでした。',false);
    }
  });

  init();
})();