(function(){
  const out=document.getElementById('content');
  const token=new URLSearchParams(location.search).get('t')||'';
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const displayDate=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v||''));return m?Number(m[2])+'月'+Number(m[3])+'日':String(v||'')};
  if(!token){out.innerHTML='<p class="error">申請情報を確認できませんでした。元の画面からもう一度申請してください。</p>';return}
  fetch('/.netlify/functions/duty-change-requests',{
    method:'POST',credentials:'same-origin',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({action:'submit-line-resume',token})
  }).then(async r=>{
    const body=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(body.error||'申請を続行できませんでした。');
    const q=body.request||{};
    const approvalUrl=String(body.approvalUrl||'');
    const text='【当番変更申請'+(q.requestNo?' #'+q.requestNo:'')+'】\n'+displayDate(q.date)+'\n変更前：'+q.fromGrade+'年・'+q.fromName+'\n変更後：'+q.toGrade+'年・'+q.toName+'\n当番変更を申請しました。\n\n【変更後のご家庭の方へ】\n下の専用リンクから内容を確認して承認してください。\n'+approvalUrl;
    const share='https://line.me/R/share?text='+encodeURIComponent(text);
    out.innerHTML='<p class="msg"><b>変更申請を受け付けました</b>変更後のご家庭へ、承認リンクをLINEで送ってください。</p>'+
      '<div class="detail"><div class="flow">'+
      '<span class="label">申請番号</span><span class="value">'+esc(q.requestNo?'#'+q.requestNo:'-')+'</span>'+
      '<span class="label">日付</span><span class="value">'+esc(displayDate(q.date))+'</span>'+
      '<span class="label">変更前</span><span class="value">'+esc(q.fromGrade+'年・'+q.fromName)+'</span>'+
      '<span class="arrow">↓</span>'+
      '<span class="label">変更後</span><span class="value">'+esc(q.toGrade+'年・'+q.toName)+'</span>'+
      '</div></div>'+
      '<a id="lineShareButton" class="line" href="'+esc(share)+'"><span class="line-badge">LINE</span>承認リンクを送る</a>'+
      '<small class="small">承認リンクは1回限り・24時間有効です。</small>';
    const shareButton=document.getElementById('lineShareButton');
    if(shareButton){
      shareButton.addEventListener('click',function(event){
        event.preventDefault();
        out.innerHTML='<div class="sent">LINEの送信画面を開きました</div><small class="small">この画面は自動で閉じます。</small>';
        const target=window.open(share,'_blank');
        setTimeout(function(){
          try{window.close()}catch(_){}
          setTimeout(function(){
            try{
              if(!document.hidden){
                if(history.length>1)history.back();
                else location.replace('about:blank');
              }
            }catch(_){}
          },250);
        },120);
        if(!target){
          location.href=share;
        }
      },{once:true});
    }
    try{history.replaceState(null,'',location.pathname)}catch(_){}
  }).catch(e=>{
    out.innerHTML='<p class="error">'+esc(e.message||'申請を続行できませんでした。')+'</p><small class="small">元のチーム専用ページからもう一度申請してください。</small>';
  });
})();
