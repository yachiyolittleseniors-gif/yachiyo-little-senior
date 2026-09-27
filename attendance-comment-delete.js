(function(){
'use strict';
function init(){
 var save=document.getElementById('commentSave'),cancel=document.getElementById('editCancel'),date=document.getElementById('commentEventDate'),textBox=document.getElementById('commentText');
 if(!save||!cancel||!date||!textBox)return;
 var btn=document.getElementById('safeCommentDelete');
 if(!btn){btn=document.createElement('button');btn.type='button';btn.id='safeCommentDelete';btn.className='secondary';btn.textContent='コメントを削除';cancel.parentNode.insertBefore(btn,cancel)}
 function selectedId(){
   var el=document.querySelector('[data-member].selected,[data-member].is-selected,[data-member][aria-pressed="true"]');
   return el?(el.getAttribute('data-member')||''):'';
 }
 function findComment(){
   var id=selectedId(),d=date.value||'';
   if(!id||!d||!window.__attendanceComments)return null;
   return window.__attendanceComments.find(function(x){return String(x.memberId)===id&&String(x.eventDate||'')===d&&String(x.text||'').trim()})||null;
 }
 function sync(){
   var comment=findComment();
   if(comment)textBox.value=String(comment.text||'');
   else if(document.activeElement!==textBox)textBox.value='';
   btn.disabled=!comment;
 }
 document.addEventListener('click',function(e){if(e.target.closest('[data-member]'))setTimeout(sync,0)});
 date.addEventListener('change',sync);
 btn.addEventListener('click',async function(){
   var id=selectedId(),d=date.value||'',comment=findComment();if(!id||!d||!comment)return;
   if(!confirm('このコメントを削除しますか？'))return;
   btn.disabled=true;btn.textContent='削除中…';
   try{
     var path=location.pathname,api=path.indexOf('player-attendance')>=0?'/.netlify/functions/player-attendance-data':path.indexOf('coach-attendance')>=0?'/.netlify/functions/coach-attendance-data':'/.netlify/functions/attendance-data';
     var headers={'content-type':'application/json'};
     if(path.indexOf('coach-attendance')>=0)headers['x-coach-password']=sessionStorage.getItem('yachiyoCoachAttendancePass')||'';else headers['x-access-password']=sessionStorage.getItem('yachiyoAttendancePass')||'';
     var r=await fetch(api,{method:'POST',headers:headers,body:JSON.stringify({action:'deleteComment',memberId:id,eventDate:d})});
     var body=await r.json().catch(function(){return{}});
     if(!r.ok)throw new Error(body.error||'削除できませんでした。');
     textBox.value='';location.reload();
   }catch(e){alert(e.message||'コメントを削除できませんでした。');btn.textContent='コメントを削除';sync()}
 });
 setTimeout(sync,100);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();