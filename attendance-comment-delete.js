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
 function current(){return comments.find(function(x){return x.escortSetting!==true&&String(x.memberId)===memberId&&String(x.eventDate||'')===String(date.value||'')})||null}
 function show(){memberId=selected()||memberId;var x=current();if(x){box.value=String(x.text||'');btn.disabled=false}else{if(document.activeElement!==box)box.value='';btn.disabled=true}}
 async function load(){try{var r=await fetch(apiInfo().url,{headers:headers(),cache:'no-store'});var j=await r.json();if(r.ok&&j&&j.data&&Array.isArray(j.data.comments))comments=j.data.comments}catch(e){}show()}
 document.addEventListener('click',function(e){
   if(e.target.closest('[data-select-member]'))setTimeout(function(){memberId=selected();show()},0);

 },true);


 // One visible entry per member/date, combining independently persisted fields.
 if(typeof window.renderComments==='function'&&typeof window.sortedComments==='function'){
   var originalRenderComments=window.renderComments;
   window.renderComments=function(){
     var originalSorted=window.sortedComments;
     window.sortedComments=function(){
       var groups=new Map();
       originalSorted().forEach(function(item){
         var key=JSON.stringify([String(item.memberId),String(item.eventDate||'')]);
         var group=groups.get(key);
         if(!group){group={text:null,escort:null};groups.set(key,group)}
         var field=item.escortSetting===true?'escort':'text';
         if(!group[field]||new Date(item.updatedAt||0)>new Date(group[field].updatedAt||0))group[field]=item;
       });
       return Array.from(groups.values()).filter(function(group){return group.text&&String(group.text.text||'').trim()}).map(function(group){
         var item=Object.assign({},group.text||group.escort);
         if(group.escort){
           item.escortGrade=group.escort.escortGrade||'';
           item.upperGrade=!!group.escort.upperGrade;
           if(new Date(group.escort.updatedAt||0)>new Date(item.updatedAt||0))item.updatedAt=group.escort.updatedAt;
         }
         return item;
       }).sort(function(a,b){return commentDateValue(b)-commentDateValue(a)||new Date(b.updatedAt||0)-new Date(a.updatedAt||0)});
     };
     try{return originalRenderComments.apply(this,arguments)}
     finally{window.sortedComments=originalSorted}
   };
   window.renderComments();
 }


 var escortPending=null;
 var escortDrafts=new Map();
 function draftKey(){return JSON.stringify([selected(),date.value])}
 if(typeof window.saveEscortGrade==='function'){
   window.saveEscortGrade=function(grade){
     escortDrafts.set(draftKey(),String(grade||''));
     if(typeof selectedEscortGrade!=='undefined')selectedEscortGrade=String(grade||'');
   };
   var originalRenderEditor=window.renderEditor;
   window.renderEditor=function(){
     var result=originalRenderEditor.apply(this,arguments);
     var key=draftKey();
     if(escortDrafts.has(key)){
       var grade=escortDrafts.get(key);
       selectedEscortGrade=grade;
       editor.querySelectorAll('[data-escort-grade]').forEach(function(input){input.checked=input.dataset.escortGrade===grade});
     }
     return result;
   };
   var originalApi=window.api;
   window.api=async function(method,body){
     if(method==='POST'&&body&&body.action==='comment'){
       var key=JSON.stringify([String(body.memberId),String(body.eventDate)]);
       var checked=editor.querySelector('[data-escort-grade]:checked');
       body=Object.assign({},body,{escortGrade:escortDrafts.has(key)?escortDrafts.get(key):(checked?checked.dataset.escortGrade:'')});
       var result=await originalApi.call(this,method,body);
       escortDrafts.delete(key);
       return result;
     }
     return originalApi.apply(this,arguments);
   };
 }
 var saveBtn=document.getElementById('commentSave'),originalSave=saveBtn&&saveBtn.onclick;
 if(saveBtn&&typeof originalSave==='function'){
   var saveNotice=document.createElement('div');saveNotice.id='commentSaveNotice';saveNotice.setAttribute('role','status');saveNotice.style.cssText='margin-top:10px;font-size:14px;line-height:1.6';editor.appendChild(saveNotice);
   saveBtn.onclick=async function(event){
     var id=selected(),day=date.value,text=box.value.trim();
     if(!id||!day){saveNotice.textContent='名前と対象日を選択してください。';return}
     if(!text){saveNotice.textContent='コメントを入力してください。帯同の有無と一緒に保存します。';return}
     var label=saveBtn.textContent,oldBoxDisabled=box.disabled,oldDateDisabled=date.disabled;
     saveBtn.disabled=true;box.disabled=true;date.disabled=true;saveBtn.textContent='保存中…';
     saveNotice.textContent=escortPending?'帯同設定の保存後にコメントを保存します。':'コメントを保存しています。';
     try{
       if(escortPending)await escortPending;
       if(selected()!==id||date.value!==day){saveNotice.textContent='回答者または対象日が変わったため保存を中止しました。';return}
       if(typeof savingMembers!=='undefined'&&savingMembers.has(id)){saveNotice.textContent='ほかの回答を保存中です。完了後にもう一度押してください。';return}
       var sync=document.getElementById('syncText');if(sync)sync.textContent='コメントを保存中…';
       await originalSave.call(saveBtn,event);
       if(sync&&sync.textContent==='コメント保存済み'){
         saveNotice.textContent='コメントを保存しました。';
         await load();
       }else{
         saveNotice.textContent='コメントを保存できませんでした。内容を確認して、もう一度押してください。';
       }
     }catch(e){saveNotice.textContent='コメントを保存できませんでした。もう一度押してください。'}
     finally{saveBtn.disabled=false;box.disabled=oldBoxDisabled;date.disabled=oldDateDisabled;saveBtn.textContent=label}
   };
 }
 date.addEventListener('change',show);
 btn.addEventListener('click',async function(){var x=current();if(!x||!memberId||!date.value)return;if(!confirm('表示中のコメントを削除しますか？'))return;var y=window.scrollY;btn.disabled=true;try{var r=await fetch(apiInfo().url,{method:'POST',headers:headers(),body:JSON.stringify({action:'deleteComment',memberId:memberId,eventDate:date.value})});var j=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(j.error||'削除できませんでした。');if(j&&j.data&&Array.isArray(j.data.comments))comments=j.data.comments;else comments=comments.filter(function(item){return item.escortSetting===true||!(String(item.memberId)===memberId&&String(item.eventDate||'')===String(date.value))});box.value='';btn.disabled=true;if(j&&j.data&&typeof normalize==='function'&&typeof data!=='undefined'){data=normalize(j.data);if(typeof window.renderComments==='function')window.renderComments()}var notice=document.getElementById('commentDeleteNotice');if(!notice){notice=document.createElement('div');notice.id='commentDeleteNotice';notice.setAttribute('role','status');notice.style.cssText='margin-top:10px;padding:10px 12px;border-radius:8px;background:#eef7ef;color:#176b35;font-weight:800;font-size:14px;line-height:1.5';btn.parentNode.parentNode.appendChild(notice)}notice.textContent='コメントを削除しました。';requestAnimationFrame(function(){window.scrollTo({top:y,left:0,behavior:'instant'})});setTimeout(function(){window.scrollTo({top:y,left:0,behavior:'instant'})},250)}catch(e){alert(e.message||'コメントを削除できませんでした。');show()}});
 load();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();