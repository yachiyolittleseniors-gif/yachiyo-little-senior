(function(){
 const api='/.netlify/functions/site-data';
 const banner=document.getElementById('heroAnnouncement');
 const message=document.getElementById('heroAnnouncementMessage');
 const edit=document.getElementById('heroAnnouncementEdit');
 const modal=document.getElementById('heroAnnouncementModal');
 const close=document.getElementById('heroAnnouncementClose');
 const cancel=document.getElementById('heroAnnouncementCancel');
 const save=document.getElementById('heroAnnouncementSave');
 const textInput=document.getElementById('heroAnnouncementText');
 const detailsInput=document.getElementById('heroAnnouncementDetails');
 const visibleInput=document.getElementById('heroAnnouncementVisible');
 const detailHint=document.getElementById('heroAnnouncementDetailHint');
 const detailModal=document.getElementById('heroAnnouncementDetailModal');
 const detailClose=document.getElementById('heroAnnouncementDetailClose');
 const detailBody=document.getElementById('heroAnnouncementDetailBody');
 if(!banner||!message||!edit||!modal||!close||!cancel||!save||!textInput||!detailsInput||!visibleInput||!detailHint||!detailModal||!detailClose||!detailBody)return;

 const cacheKey='yachiyoHeroAnnouncement';
 let state={text:'祝　関東大会出場 🎉',details:'',visible:false};
 function limitToTwoLines(value){
   return String(value||'').replace(/\r\n?/g,'\n').split('\n').slice(0,2).join('\n').slice(0,100);
 }
 function normalize(value){
   if(!value||Array.isArray(value)||typeof value!=='object')return state;
   return {text:limitToTwoLines(value.text).trim(),details:String(value.details||'').replace(/\r\n?/g,'\n').trim().slice(0,1000),visible:value.visible===true};
 }
 function render(){
   message.textContent=state.text;
   banner.classList.toggle('is-visible',Boolean(state.visible&&state.text));
   const hasDetails=Boolean(state.visible&&state.text&&state.details);
   banner.classList.toggle('has-details',hasDetails);
   banner.tabIndex=hasDetails?0:-1;
   detailHint.hidden=!hasDetails;
 }
 try{
   const cached=JSON.parse(localStorage.getItem(cacheKey)||'null');
   if(cached)state=normalize(cached);
 }catch(error){}
 render();
 async function load(){
   try{
     const response=await fetch(api+'?section=hero-announcement',{cache:'no-store'});
     if(!response.ok)return;
     const json=await response.json();
     state=normalize(json.data);
     try{localStorage.setItem(cacheKey,JSON.stringify(state))}catch(error){}
     render();
   }catch(error){}
 }
 function openEditor(){
   textInput.value=state.text;
   detailsInput.value=state.details;
   visibleInput.checked=state.visible;
   modal.hidden=false;
   setTimeout(()=>textInput.focus(),0);
 }
 function closeEditor(){
   const active=document.activeElement;
   if(active&&typeof active.blur==='function')active.blur();
   textInput.blur();
   detailsInput.blur();
   modal.hidden=true;
 }
 function openDetails(){
   if(!state.visible||!state.text||!state.details)return;
   detailBody.textContent=state.details;
   detailModal.hidden=false;
   setTimeout(()=>detailClose.focus(),0);
 }
 function closeDetails(){detailModal.hidden=true;banner.focus({preventScroll:true})}

 textInput.addEventListener('input',function(){
   const limited=limitToTwoLines(textInput.value);
   if(textInput.value!==limited)textInput.value=limited;
 });

 edit.addEventListener('click',openEditor);
 banner.addEventListener('click',openDetails);
 banner.addEventListener('keydown',event=>{
   if(event.key!=='Enter'&&event.key!==' ')return;
   event.preventDefault();
   openDetails();
 });
 detailClose.addEventListener('click',closeDetails);
 detailModal.addEventListener('click',event=>{if(event.target===detailModal)closeDetails()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!detailModal.hidden)closeDetails()});
 close.addEventListener('click',closeEditor);
 cancel.addEventListener('click',closeEditor);
 modal.addEventListener('click',event=>{if(event.target===modal)closeEditor()});
 save.addEventListener('click',async function(){
   const next={text:limitToTwoLines(textInput.value).trim(),details:String(detailsInput.value||'').replace(/\r\n?/g,'\n').trim().slice(0,1000),visible:visibleInput.checked};
   if(next.visible&&!next.text){alert('表示する文章を入力してください。');return}
   const password=sessionStorage.getItem('yachiyoAdminPassword')||'';
   if(!password){alert('管理画面に入り直してください。');return}
   save.disabled=true;
   save.textContent='保存中…';
   try{
     const response=await fetch(api+'?section=hero-announcement',{
       method:'POST',
       headers:{'content-type':'application/json','x-admin-password':password},
       body:JSON.stringify({data:{...next,updatedAt:new Date().toISOString()}})
     });
     if(response.status===429){alert('試行回数の上限です。15分後に再度お試しください。');return}
     if(response.status===401){alert('管理者パスワードが違います。');return}
     if(!response.ok)throw new Error();
     state=next;
     try{localStorage.setItem(cacheKey,JSON.stringify(state))}catch(error){}
     render();
     closeEditor();
     setTimeout(function(){window.scrollTo(0,0)},250);
     setTimeout(function(){window.scrollTo(0,0)},800);
     showSaveNotice('保存しました');
   }catch(error){alert('トップのお知らせを保存できませんでした。')}
   finally{save.disabled=false;save.textContent='保存する'}
 });
 load();
})();
