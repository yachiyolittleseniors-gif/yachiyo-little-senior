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
  const text='【当番変更申請'+(q.requestNo?' #'+q.requestNo:'')+'】\n'+displayDate(q.date)+'\n変更前：'+q.fromGrade+'年・'+q.fromName+'\n変更後：'+q.toGrade+'年・'+q.toName+'\n当番変更を申請しました。\n\n【変更後のご家庭の方へ】\n下の専用リンクから内容を確認して承認してください。\n'+approvalUrl;
  const share='https://line.me/R/share?text='+encodeURIComponent(text);
  out.innerHTML='<p class="msg"><b>変更申請を受け付けました</b>変更後のご家庭へ、承認リンクをLINEで送ってください。</p>'+
    '<div class="detail"><div class="flow">'+
    '<div class="info-row"><span class="label">申請番号</span><span class="value">'+esc(q.requestNo?'#'+q.requestNo:'-')+'</span></div>'+
    '<div class="info-row"><span class="label">日付</span><span class="value">'+esc(displayDate(q.date))+'</span></div>'+
    '<div class="info-row"><span class="label">変更前</span><span class="value">'+esc(q.fromGrade+'年・'+q.fromName)+'</span></div>'+
    '+
    '<div class="info-row"><span class="label">変更後</span><span class="value">'+esc(q.toGrade+'年・'+q.toName)+'</span></div>'+
    '</div></div>'+
    '<a id="lineShareButton" class="line" href="'+esc(share)+'"><span class="line-badge">LINE</span>承認リンクを送る</a>'+
    '<small class="small">承認リンクは1回限り・24時間有効です。</small>';
  const b=document.getElementById('lineShareButton');
  if(b)b.addEventListener('click',function(event){
    event.preventDefault();
    const target=window.open(share,'_blank');
    out.innerHTML='<div class="sent">LINEの送信画面を開きました</div><small class="small">この画面は自動で閉じます。</small>';
    setTimeout(function(){
      try{window.close()}catch(_){}
      setTimeout(function(){
        try{if(!document.hidden){if(history.length>1)history.back();else location.replace('about:blank')}}catch(_){}
      },250);
    },120);
    if(!target)location.href=share;
  },{once:true});
})();