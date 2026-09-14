(function(){
 const api='/.netlify/functions/site-data';
 const input=document.createElement('input');
 input.type='file'; input.accept='image/*'; input.style.display='none'; document.body.appendChild(input);
 let current=null;

 function compress(file){
   return new Promise((resolve,reject)=>{
     const r=new FileReader(); r.onerror=reject;
     r.onload=()=>{const im=new Image(); im.onerror=reject; im.onload=()=>{
       const max=1400,s=Math.min(1,max/Math.max(im.width,im.height));
       const c=document.createElement('canvas'); c.width=Math.round(im.width*s); c.height=Math.round(im.height*s);
       c.getContext('2d').drawImage(im,0,0,c.width,c.height);
       resolve(c.toDataURL('image/jpeg',.75));
     }; im.src=r.result}; r.readAsDataURL(file);
   });
 }
 async function load(){
   try{
     const arr=await window.__loadYachiyoPhotos();
     arr.forEach(x=>{
       const el=document.querySelector('[data-edit-photo="'+x.key+'"]');
       if(el&&x.image){
         if(window.__replacePhotoAfterLoad){
           window.__replacePhotoAfterLoad(el,x.image,function(){
             window.__yachiyoPhotoCache&&window.__yachiyoPhotoCache.set(x.key,x.image);
           });
         }else{
           el.src=x.image;
           window.__yachiyoPhotoCache&&window.__yachiyoPhotoCache.set(x.key,x.image);
         }
       }
     });
   }catch(e){}

 }
 document.querySelectorAll('[data-edit-photo]').forEach(el=>{
   const parent=el.parentElement;
   if(!parent)return;
   parent.classList.add('adminPhotoWrap');
   const b=document.createElement('button'); b.type='button'; b.className='adminPhotoBtn'; b.textContent='写真を変更';
   b.onclick=e=>{e.preventDefault();e.stopPropagation();current=el;input.click()};
   parent.appendChild(b);
 });
 function syncAdmin(){
   document.body.classList.toggle('photo-admin-on',sessionStorage.getItem('yachiyoAdminMode')==='1');
 }
 syncAdmin();
 const adminToggle=document.getElementById('heroAdminToggle');
 if(adminToggle) adminToggle.addEventListener('click',()=>setTimeout(syncAdmin,0));

 input.onchange=async()=>{
   const f=input.files&&input.files[0]; if(!f||!current)return;
   try{
     const image=await compress(f), key=current.dataset.editPhoto;
     const r0=await fetch(api+'?section=photos',{cache:'no-store'});
     let arr=[]; if(r0.ok){const j=await r0.json();arr=Array.isArray(j.data)?j.data:[]}
     arr=arr.filter(x=>x.key!==key); arr.push({key,image,updatedAt:new Date().toISOString()});
     const pw=sessionStorage.getItem('yachiyoAdminPassword')||'';
     const r=await fetch(api+'?section=photos',{method:'POST',headers:{'content-type':'application/json','x-admin-password':pw},body:JSON.stringify({data:arr})});
     if(r.status===429)throw new Error('LIMITED');
     if(!r.ok)throw 0;
     current.src=image;
     window.__yachiyoPhotoCache&&window.__yachiyoPhotoCache.set(key,image);
     showSaveNotice('保存しました');
   }catch(e){alert(e.message==='LIMITED'?'試行回数の上限です。15分後に再度お試しください。':'保存できませんでした。管理パスワードを確認してください。')}
   input.value=''; current=null;
 };
 load();
})();
