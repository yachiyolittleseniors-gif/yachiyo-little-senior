(function(){
  'use strict';
  function init(){
    var save=document.getElementById('commentSave');
    var cancel=document.getElementById('editCancel');
    var memberTitle=document.getElementById('editorName');
    var date=document.getElementById('commentEventDate');
    if(!save||!cancel||!memberTitle||!date||document.getElementById('safeCommentDelete'))return;
    var btn=document.createElement('button');
    btn.type='button';btn.id='safeCommentDelete';btn.className='secondary';btn.textContent='コメントを削除';
    cancel.parentNode.insertBefore(btn,cancel);
    btn.addEventListener('click',async function(){
      var memberId='';
      try{
        var selected=document.querySelector('[data-member].selected,[data-member].is-selected,[data-member][aria-pressed="true"]');
        if(selected)memberId=selected.getAttribute('data-member')||'';
      }catch(e){}
      var eventDate=date.value||'';
      if(!memberId||!eventDate){alert('名前と対象日を選択してください。');return}
      if(!confirm('この対象日のコメントを削除しますか？'))return;
      btn.disabled=true;btn.textContent='削除中…';
      try{
        var path=location.pathname;
        var api=path.indexOf('player-attendance')>=0?'/.netlify/functions/player-attendance-data':path.indexOf('coach-attendance')>=0?'/.netlify/functions/coach-attendance-data':'/.netlify/functions/attendance-data';
        var headers={'content-type':'application/json'};
        if(path.indexOf('coach-attendance')>=0)headers['x-coach-password']=sessionStorage.getItem('yachiyoCoachAttendancePass')||'';
        else headers['x-access-password']=sessionStorage.getItem('yachiyoAttendancePass')||'';
        var r=await fetch(api,{method:'POST',headers:headers,body:JSON.stringify({action:'deleteComment',memberId:memberId,eventDate:eventDate})});
        var body=await r.json().catch(function(){return{}});
        if(!r.ok)throw new Error(body.error||'削除できませんでした。');
        location.reload();
      }catch(e){alert(e.message||'コメントを削除できませんでした。');btn.disabled=false;btn.textContent='コメントを削除'}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();