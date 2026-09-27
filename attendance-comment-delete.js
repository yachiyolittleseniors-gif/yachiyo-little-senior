(function(){
'use strict';
function boot(){
  var date=document.getElementById('commentEventDate');
  var cancel=document.getElementById('editCancel');
  if(!date||!cancel||document.getElementById('safeCommentDelete'))return;
  var btn=document.createElement('button');
  btn.type='button';btn.id='safeCommentDelete';btn.className='secondary';btn.textContent='コメントを削除';
  btn.disabled=true;
  cancel.parentNode.insertBefore(btn,cancel);
  function selected(){
    var row=document.querySelector('[data-member][aria-pressed="true"],[data-member].selected,[data-member].is-selected');
    return row?String(row.getAttribute('data-member')||''):'';
  }
  function refresh(){btn.disabled=!(selected()&&date.value)}
  document.addEventListener('click',function(e){if(e.target.closest('[data-member]'))setTimeout(refresh,0)},true);
  date.addEventListener('change',refresh);
  btn.addEventListener('click',async function(){
    var memberId=selected(),eventDate=date.value;
    if(!memberId||!eventDate)return;
    if(!confirm('選択した対象日のコメントを削除しますか？'))return;
    btn.disabled=true;
    try{
      var player=location.pathname.indexOf('player-attendance')>=0,coach=location.pathname.indexOf('coach-attendance')>=0;
      var api=player?'/.netlify/functions/player-attendance-data':coach?'/.netlify/functions/coach-attendance-data':'/.netlify/functions/attendance-data';
      var headers={'content-type':'application/json'};
      if(coach)headers['x-coach-password']=sessionStorage.getItem('yachiyoCoachAttendancePass')||'';
      else headers['x-access-password']=sessionStorage.getItem('yachiyoAttendancePass')||'';
      var r=await fetch(api,{method:'POST',headers:headers,body:JSON.stringify({action:'deleteComment',memberId:memberId,eventDate:eventDate})});
      var j=await r.json().catch(function(){return{}});
      if(!r.ok)throw new Error(j.error||'削除できませんでした。');
      location.reload();
    }catch(err){alert(err.message||'コメントを削除できませんでした。');refresh()}
  });
  refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();