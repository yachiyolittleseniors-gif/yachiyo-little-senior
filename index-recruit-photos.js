(function(){
 const box=document.getElementById('recruitEditablePhoto');
 const addBtn=box&&box.querySelector('.recruitPhotoChangeBtn');
 const deleteBtn=box&&box.querySelector('.recruitPhotoDeleteBtn');
 const movePrevBtn=box&&box.querySelector('.recruitPhotoMovePrevBtn');
 const moveNextBtn=box&&box.querySelector('.recruitPhotoMoveNextBtn');
 const dots=box&&box.querySelector('.ground-slide-dots');
 if(!box||!addBtn||!deleteBtn||!movePrevBtn||!moveNextBtn||!dots)return;
 const api='/.netlify/functions/site-data';
 const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.multiple=true; inp.style.display='none'; document.body.appendChild(inp);
 const maxPhotos=6;
 let photos=[],current=0,timer=null,startX=null,rawLoaded=false,switchToken=0;

 function syncOrderButtons(){
   movePrevBtn.disabled=photos.length<2||current<=0;
   moveNextBtn.disabled=photos.length<2||current>=photos.length-1;
 }

 function updateGroundFirstCache(){
   if(!photos[0]||!photos[0].image)return;
   let src=photos[0].image;
   if(src.startsWith('data:')){
     src='/.netlify/functions/site-data?section=ground-photos&image=0&v='+encodeURIComponent(photos[0].updatedAt||'0');
   }
   window.__yachiyoPhotoCache&&window.__yachiyoPhotoCache.set('groundFirst',src);
   box.style.setProperty('background-image','url("'+src.replace(/"/g,'\\22 ')+'")','important');
 }

 addBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();inp.click()});
 function compress(file){
   return new Promise((resolve,reject)=>{
     const r=new FileReader(); r.onerror=reject;
     r.onload=()=>{const im=new Image(); im.onerror=reject; im.onload=()=>{
       const max=1200,s=Math.min(1,max/Math.max(im.width,im.height));
       const c=document.createElement('canvas'); c.width=Math.round(im.width*s); c.height=Math.round(im.height*s);
       c.getContext('2d').drawImage(im,0,0,c.width,c.height);
       resolve(c.toDataURL('image/jpeg',.72));
     };im.src=r.result};r.readAsDataURL(file);
   });
 }

 function waitForImage(image){
   if(image.complete)return Promise.resolve(image.naturalWidth>0);
   return new Promise(resolve=>{
     const finish=ok=>{
       image.removeEventListener('load',loaded);
       image.removeEventListener('error',failed);
       resolve(ok);
     };
     const loaded=()=>finish(true);
     const failed=()=>finish(false);
     image.addEventListener('load',loaded,{once:true});
     image.addEventListener('error',failed,{once:true});
   });
 }

 async function show(index,restart){
   if(!photos.length)return;
   const next=(index+photos.length)%photos.length;
   const images=Array.from(box.querySelectorAll('.ground-slide'));
   const target=images[next];
   if(!target)return;
   const token=++switchToken;
   target.loading='eager';
   target.fetchPriority='high';
   const ready=await waitForImage(target);
   if(!ready||token!==switchToken)return;
   current=next;
   images.forEach((el,i)=>el.classList.toggle('is-active',i===current));
   dots.querySelectorAll('.ground-slide-dot').forEach((el,i)=>el.classList.toggle('is-active',i===current));
   deleteBtn.disabled=photos.length===0;
   syncOrderButtons();
   if(restart)startTimer();
 }

 function render(){
   box.querySelectorAll('.ground-slide').forEach(el=>el.remove());
   dots.innerHTML='';
   photos.forEach((item,i)=>{
     const image=document.createElement('img');
     image.className='ground-slide'+(i===current?' is-active':'');
     image.src=item.image;
     image.alt='八千代リトルシニア グラウンド風景 '+(i+1);
     image.loading='eager';
     image.decoding='async';
     image.fetchPriority=i===0?'high':'low';
     box.insertBefore(image,box.querySelector('.photo-caption'));
     const dot=document.createElement('button');
     dot.type='button';dot.className='ground-slide-dot'+(i===current?' is-active':'');
     dot.setAttribute('aria-label','写真'+(i+1)+'を表示');
     dot.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();show(i,true)});
     dots.appendChild(dot);
   });
   dots.style.display=photos.length>1?'flex':'none';
   deleteBtn.disabled=!photos.length;
   syncOrderButtons();
   startTimer();
 }

 function startTimer(){
   clearInterval(timer);
   if(photos.length>1)timer=setInterval(()=>show(current+1,false),5000);
 }

 async function save(){
   const pw=sessionStorage.getItem('yachiyoAdminPassword')||'';
   const r=await fetch(api+'?section=ground-photos',{method:'POST',headers:{'content-type':'application/json','x-admin-password':pw},body:JSON.stringify({data:photos})});
   if(r.status===429){
     throw new Error('LIMITED');
   }
   if(r.status===401){
     throw new Error('PASSWORD');
   }
   if(!r.ok)throw new Error('SAVE');
 }

 async function loadRawForEdit(){
   if(rawLoaded)return;
   const r=await fetch(api+'?section=ground-photos&raw=1',{cache:'no-store'});
   if(!r.ok)throw new Error('LOAD');
   const j=await r.json();
   const raw=Array.isArray(j.data)?j.data.filter(x=>x&&x.image).slice(0,maxPhotos):[];
   if(raw.length)photos=raw;
   rawLoaded=true;
   current=Math.min(current,Math.max(0,photos.length-1));
 }

 async function load(){
   try{
     const r=await fetch(api+'?section=ground-photos&manifest=1',{cache:'no-store'});
     if(r.ok){const j=await r.json();photos=Array.isArray(j.data)?j.data.filter(x=>x&&x.image).slice(0,maxPhotos):[]}
     if(!photos.length){
       const a=await window.__loadYachiyoPhotos();
       const x=a.find(v=>v.key==='photo_recruit');
       if(x&&x.image){photos=[{image:x.image,updatedAt:x.updatedAt||new Date().toISOString()}];rawLoaded=true}
     }
     updateGroundFirstCache();
     current=0;render();
   }catch(e){}
 }

 inp.onchange=async()=>{
   const selected=Array.from(inp.files||[]); if(!selected.length)return;
   const remainingBeforeLoad=maxPhotos-photos.length;
   if(remainingBeforeLoad<=0){alert('グラウンド写真は最大6枚です。不要な写真を削除してから追加してください。');inp.value='';return}
   const before=photos.slice();
   addBtn.disabled=true;addBtn.textContent='保存中…';
   try{
     await loadRawForEdit();
     const remaining=maxPhotos-photos.length;
     if(remaining<=0)throw new Error('LIMIT');
     const files=selected.slice(0,remaining);
     const added=[];
     for(const file of files)added.push({image:await compress(file),updatedAt:new Date().toISOString()});
     const next=photos.concat(added);
     if(JSON.stringify(next).length>7000000)throw new Error('SIZE');
     photos=next;current=Math.max(0,photos.length-added.length);await save();render();show(current,true);
     showSaveNotice('保存しました');
   }catch(e){
     if(typeof before!=='undefined')photos=before;
     if(e.message==='LIMITED')alert('試行回数の上限です。15分後に再度お試しください。');
     else if(e.message==='PASSWORD')alert('管理者パスワードが違います。');
     else if(e.message==='LIMIT')alert('グラウンド写真は最大6枚です。不要な写真を削除してから追加してください。');
     else if(e.message==='SIZE')alert('写真の合計容量が大きすぎます。枚数を減らして追加してください。');
     else alert('写真を保存できませんでした。');
   }finally{addBtn.disabled=false;addBtn.textContent='写真を追加';inp.value=''}
 };

 async function movePhoto(delta){
   if(photos.length<2)return;
   const oldIndex=current;
   const visibleBefore=photos.slice();
   let beforeRaw=null;
   clearInterval(timer);
   movePrevBtn.disabled=true;moveNextBtn.disabled=true;
   try{
     await loadRawForEdit();
     current=Math.min(oldIndex,Math.max(0,photos.length-1));
     const target=current+delta;
     if(target<0||target>=photos.length){syncOrderButtons();startTimer();return}
     beforeRaw=photos.slice();
     const selected=photos[current];
     photos[current]=photos[target];
     photos[target]=selected;
     current=target;
     await save();
     updateGroundFirstCache();
     render();
     show(current,true);
     showSaveNotice('保存しました');
   }catch(e){
     photos=beforeRaw||visibleBefore;
     current=Math.min(oldIndex,Math.max(0,photos.length-1));
     render();
     alert(e.message==='LIMITED'?'試行回数の上限です。15分後に再度お試しください。':e.message==='PASSWORD'?'管理者パスワードが違います。':'写真の順番を保存できませんでした。');
   }finally{syncOrderButtons()}
 }

 movePrevBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();movePhoto(-1)});
 moveNextBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();movePhoto(1)});

 deleteBtn.addEventListener('click',async function(e){
   e.preventDefault();e.stopPropagation();
   if(!photos.length||!confirm('現在表示しているグラウンド写真を削除しますか？'))return;
   const oldIndex=current;
   deleteBtn.disabled=true;deleteBtn.textContent='削除中…';
   let before=[];
   try{await loadRawForEdit();before=photos.slice();current=Math.min(oldIndex,Math.max(0,photos.length-1));photos.splice(current,1);current=Math.min(current,Math.max(0,photos.length-1));await save();render();showSaveNotice('保存しました')}
   catch(e){if(before.length)photos=before;current=oldIndex;render();alert(e.message==='LIMITED'?'試行回数の上限です。15分後に再度お試しください。':e.message==='PASSWORD'?'管理者パスワードが違います。':'写真を削除できませんでした。')}
   finally{deleteBtn.disabled=false;deleteBtn.textContent='表示中を削除'}
 });

 box.addEventListener('touchstart',e=>{startX=e.changedTouches[0].clientX},{passive:true});
 box.addEventListener('touchend',e=>{
   if(startX===null||photos.length<2)return;
   const distance=e.changedTouches[0].clientX-startX;startX=null;
   if(Math.abs(distance)>45)show(current+(distance<0?1:-1),true);
 },{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInterval(timer);else startTimer()});
 load();
})();
