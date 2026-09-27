(function(){
'use strict';
function boot(){
 var date=document.getElementById('commentEventDate'),cancel=document.getElementById('editCancel'),box=document.getElementById('commentText');
 if(!date||!cancel||!box||document.getElementById('safeCommentDelete'))return;
 var editor=document.getElementById('editor');
 var btn=document.createElement('button');btn.type='button';btn.id='safeCommentDelete';btn.className='secondary';btn.textContent='コメントを削除';btn.disabled=true;cancel.parentNode.insertBefore(btn,cancel);
 var comments=[],memberId='';
 function apiInfo(){var p=location.pathname,coach=p.indexOf('coach-attendance')>=0,player=p.indexOf('player-attendance')>=0;return{url:player?'/.netlify/functions/player-attendance-data':coach?'/.netlify/functions/coach-attendance-data':'/.netlify/functions/attendance-data',coach:coach}}
 function headers(){var x={'content-type':'application/json'},i=apiInfo();if(i.coach)x['x-coach-password']=sessionStorage.getItem('yachiyoCoachAttendancePass')||'';else x['x-access-password']=sessionStorage.getItem('yachiyoAttendancePass')||'';return x}
 function selected(){var el=document.querySelector('[data-select-member].selected');return el?String(el.getAttribute('data-select-member')||''):''}
 function current(){return comments.find(function(x){return String(x.memberId)===memberId&&String(x.eventDate||'')===String(date.value||'')})||null}
 function show(){memberId=selected()||memberId;var x=current();if(x){box.value=String(x.text||'');btn.disabled=false}else{if(document.activeElement!==box)box.value='';btn.disabled=true}}
 async function load(){try{var r=await fetch(apiInfo().url,{headers:headers(),cache:'no-store'});var j=await r.json();if(r.ok&&j&&j.data&&Array.isArray(j.data.comments))comments=j.data.comments}catch(e){}show()}
 document.addEventListener('click',function(e){
   if(e.target.closest('[data-select-member]'))setTimeout(function(){memberId=selected();show()},0);
   if(e.target.closest('#commentSave')){var saveBtn=document.getElementById('commentSave'),y=window.scrollY;if(saveBtn&&!saveBtn.disabled){saveBtn.dataset.originalText=saveBtn.textContent;saveBtn.textContent='保存中…'}setTimeout(function(){load();if(saveBtn){saveBtn.textContent='保存しました';setTimeout(function(){saveBtn.textContent=saveBtn.dataset.originalText||'コメントを追加'},900)}requestAnimationFrame(function(){window.scrollTo({top:y,left:0,behavior:'instant'})})},500);setTimeout(function(){window.scrollTo({top:y,left:0,behavior:'instant'})},900);}
 },true);
 date.addEventListener('change',show);
 btn.addEventListener('click',async function(){var x=current();if(!x||!memberId||!date.value)return;if(!confirm('表示中のコメントを削除しますか？'))return;var y=window.scrollY;btn.disabled=true;try{var r=await fetch(apiInfo().url,{method:'POST',headers:headers(),body:JSON.stringify({action:'deleteComment',memberId:memberId,eventDate:date.value})});var j=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(j.error||'削除できませんでした。');if(j&&j.data&&Array.isArray(j.data.comments))comments=j.data.comments;else comments=comments.filter(function(item){return !(String(item.memberId)===memberId&&String(item.eventDate||'')===String(date.value))});box.value='';btn.disabled=true;var list=document.getElementById('commentList');if(list){list.querySelectorAll('.comment-item').forEach(function(card){var meta=card.querySelector('.comment-meta');if(meta&&meta.textContent.indexOf(date.options[date.selectedIndex]?date.options[date.selectedIndex].text.split(' ')[0]:'')>=0&&meta.textContent.indexOf(document.getElementById('editorName')?document.getElementById('editorName').textContent.replace(' を編集中',''):'')>=0)card.remove()})}var notice=document.getElementById('commentDeleteNotice');if(!notice){notice=document.createElement('div');notice.id='commentDeleteNotice';notice.setAttribute('role','status');notice.style.cssText='margin-top:10px;padding:10px 12px;border-radius:8px;background:#eef7ef;color:#176b35;font-weight:800;font-size:14px;line-height:1.5';btn.parentNode.parentNode.appendChild(notice)}notice.textContent='コメントを削除しました。';requestAnimationFrame(function(){window.scrollTo({top:y,left:0,behavior:'instant'})});setTimeout(function(){window.scrollTo({top:y,left:0,behavior:'instant'})},250)}catch(e){alert(e.message||'コメントを削除できませんでした。');show()}});
 load();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();