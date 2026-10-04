(function(){
  const out=document.getElementById('content');
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const displayDate=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v||''));return m?Number(m[2])+'月'+Number(m[3])+'日':String(v||'')};
  let data=null;
  try{data=JSON.parse(sessionStorage.getItem('ylsDutyLineComplete')||'null')}catch(_){}
  try{sessionStorage.removeItem('ylsDutyLineComplete')}catch(_){}
  if(!data||!data.approvalUrl||!data.request){
    out.innerHTML='<p class="error">申請完了情報を確認できませんでした。元の画面から申請状況をご確認ください。</p>';
    return;
  }
  const q=data.request||{};
  const approvalUrl=String(data.approvalUrl||'');
  const isSwap=q.requestType==='swap';
  const text=isSwap
    ?'【当番日入れ替え申請'+(q.requestNo?' #'+q.requestNo:'')+'】\n'+displayDate(q.date)+' '+q.fromGrade+'年・'+q.fromName+'\n↕\n'+displayDate(q.swapDate)+' '+q.swapGrade+'年・'+q.swapName+'\n当番日を入れ替える申請です。\n\n【入れ替える相手のご家庭へ】\n下の専用リンクから内容を確認して承認してください。\n'+approvalUrl
    :'【当番変更申請'+(q.requestNo?' #'+q.requestNo:'')+'】\n'+displayDate(q.date)+'\n変更前：'+q.fromGrade+'年・'+q.fromName+'\n変更後：'+q.toGrade+'年・'+q.toName+'\n当番変更を申請しました。\n\n【変更後のご家庭の方へ】\n下の専用リンクから内容を確認して承認してください。\n'+approvalUrl;
  const share='https://line.me/R/share?text='+encodeURIComponent(text);
  out.innerHTML='<p class="msg"><b>変更申請を受け付けました</b>'+(isSwap?'入れ替える相手':'変更後のご家庭')+'へ、承認リンクをLINEで送ってください。</p>'+
    '<div class="detail"><div class="flow">'+
    '<span class="label">申請番号</span><span class="value">'+esc(q.requestNo?'#'+q.requestNo:'-')+'</span>'+
    (isSwap
      ?'<span class="label">自分</span><span class="value">'+esc(displayDate(q.date)+'　'+q.fromGrade+'年・'+q.fromName)+'</span>'+
       '<span class="label">相手</span><span class="value">'+esc(displayDate(q.swapDate)+'　'+q.swapGrade+'年・'+q.swapName)+'</span>'
      :'<span class="label">日付</span><span class="value">'+esc(displayDate(q.date))+'</span>'+
       '<span class="label">変更前</span><span class="value">'+esc(q.fromGrade+'年・'+q.fromName)+'</span>'+
       '<span class="arrow">↓</span>'+
       '<span class="label">変更後</span><span class="value">'+esc(q.toGrade+'年・'+q.toName)+'</span>')+
    '</div></div>'+
    '<a id="lineShareButton" class="line" href="'+esc(share)+'"><span class="line-badge">LINE</span>承認リンクを送る</a>'+
    '<small class="small">承認リンクは1回限り・24時間有効です。</small>';
  const b=document.getElementById('lineShareButton');
  if(b){
    b.setAttribute('rel','noopener');
    b.addEventListener('click',function(){
      // Let the browser follow the LINE share URL directly.
      // Popup + immediate window.close is unreliable on iPhone/other devices.
      b.textContent='LINEを開いています…';
    },{once:true});
  }
})();