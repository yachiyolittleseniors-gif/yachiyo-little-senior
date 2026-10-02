(function(){
  const API='/.netlify/functions/duty-change-requests';
  const token=new URLSearchParams(location.search).get('t')||'';
  const loading=document.getElementById('loading');
  const content=document.getElementById('content');
  const message=document.getElementById('message');
  const approve=document.getElementById('approve');
  const familyConfirm=document.getElementById('familyConfirm');
  function showMessage(text,ok,retry){
    loading.hidden=true;content.hidden=true;message.hidden=false;
    message.textContent=text;message.className='status '+(ok?'ok':'error');
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
      const r=await fetch(url,{...options,cache:'no-store',signal:controller.signal});
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||'処理できませんでした。');
      return j;
    }catch(e){
      if(e&&e.name==='AbortError')throw new Error('通信に時間がかかっています。もう一度お試しください。');
      throw e;
    }finally{clearTimeout(timer)}
  }
  async function call(action){
    if(action==='preview-partner-approval'){
      return fetchJson(API+'?action=preview-partner-approval&t='+encodeURIComponent(token),{method:'GET'});
    }
    return fetchJson(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,token})});
  }
  async function init(){
    if(!token)return showMessage('承認リンクが正しくありません。',false);
    try{
      const j=await call('preview-partner-approval'),x=j.request||{};
      document.getElementById('requestNo').textContent=x.requestNo?'#'+x.requestNo:'-';
      document.getElementById('date').textContent=formatDate(x.date);
      document.getElementById('from').textContent=x.fromGrade+'年・'+x.fromName;
      document.getElementById('to').textContent=x.toGrade+'年・'+x.toName;
      loading.hidden=true;content.hidden=false;
    }catch(e){showMessage(e.message||'申請内容を確認できませんでした。',false,true)}
  }
  familyConfirm.addEventListener('change',function(){approve.disabled=!familyConfirm.checked});
  approve.addEventListener('click',async function(){
    if(!familyConfirm.checked)return;
    approve.disabled=true;approve.textContent='承認中…';
    try{
      const j=await call('partner-approve');
      showMessage(j.message||'承認しました。当番表へ反映されました。',true);
    }catch(e){
      approve.disabled=false;approve.textContent='この変更を承認する';
      showMessage(e.message||'承認できませんでした。',false);
    }
  });
  init();
})();
