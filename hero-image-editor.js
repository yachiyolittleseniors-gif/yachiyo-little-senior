(function(){
  const hero=document.querySelector('#home > .hero');
  const editBtn=document.getElementById('heroPhotoEdit');
  const modal=document.getElementById('heroImageEditModal');
  const preview=document.getElementById('heroEditPreview');
  const photo=document.getElementById('heroEditPreviewPhoto');
  const cancel=document.getElementById('heroImageEditCancel');
  const saveBtn=document.getElementById('heroImageEditSave');
  if(!hero||!editBtn||!modal||!preview||!photo||!cancel||!saveBtn)return;

  const api='/.netlify/functions/site-data?section=hero-position-settings';
  let saved={offsetX:0,offsetY:0,scale:1};
  let draft={...saved};
  let pointers=new Map();
  let dragStart=null;
  let pinchStart=null;

  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const dist=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);

  function applyPreview(){
    photo.style.transform='translate3d('+draft.offsetX+'px,'+draft.offsetY+'px,0) scale('+draft.scale+')';
  }
  function applyHero(){
    const x=clamp(58+(saved.offsetX/Math.max(preview.clientWidth,1))*100,0,100);
    const y=clamp(50+(saved.offsetY/Math.max(preview.clientHeight,1))*100,0,100);
    const zoom=clamp(saved.scale*100,100,220);
    hero.style.setProperty('background-position',x+'% '+y+'%','important');
    hero.style.setProperty('background-size','auto '+zoom+'%','important');
  }
  function openModal(){
    draft={...saved};
    applyPreview();
    modal.classList.add('show');
    modal.setAttribute('aria-hidden','false');
    document.documentElement.style.overflow='hidden';
    document.body.style.overflow='hidden';
  }
  function closeModal(){
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden','true');
    document.documentElement.style.overflow='';
    document.body.style.overflow='';
    pointers.clear(); dragStart=null; pinchStart=null;
  }
  function flash(msg){if(window.showSaveNotice)window.showSaveNotice(msg)}

  editBtn.addEventListener('click',function(){
    draft={...saved};
    applyPreview();
    setTimeout(openModal,0);
  });

  cancel.addEventListener('click',function(){
    closeModal();
    if(location.hash==='#heroImageEditModal'){
      history.replaceState(null,'',location.pathname+location.search);
    }
  });

  saveBtn.addEventListener('click',async function(){
    const pw=sessionStorage.getItem('yachiyoAdminPassword')||'';
    if(!pw){alert('管理画面に入り直してください。');return}
    saveBtn.disabled=true;
    saveBtn.textContent='保存中…';
    try{
      const response=await fetch(api,{
        method:'POST',
        headers:{'content-type':'application/json','x-admin-password':pw},
        body:JSON.stringify({data:{mode:'modal-transform-v2',offsetX:draft.offsetX,offsetY:draft.offsetY,scale:draft.scale,updatedAt:new Date().toISOString()}})
      });
      if(!response.ok)throw new Error();
      saved={...draft};
      applyHero();
      closeModal();
      flash('トップ画像の位置を保存しました');
    }catch(error){
      alert('保存できませんでした。');
    }finally{
      saveBtn.disabled=false;
      saveBtn.textContent='保存';
    }
  });

  modal.addEventListener('click',function(event){
    if(event.target===modal)closeModal();
  });

  preview.addEventListener('pointerdown',function(event){
    event.preventDefault();
    preview.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});

    if(pointers.size===1){
      dragStart={x:event.clientX,y:event.clientY,offsetX:draft.offsetX,offsetY:draft.offsetY};
      pinchStart=null;
    }else if(pointers.size===2){
      const pts=[...pointers.values()];
      pinchStart={distance:dist(pts[0],pts[1]),scale:draft.scale};
      dragStart=null;
    }
  });

  preview.addEventListener('pointermove',function(event){
    if(!pointers.has(event.pointerId))return;
    event.preventDefault();
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});

    if(pointers.size===1 && dragStart){
      draft.offsetX=clamp(dragStart.offsetX+(event.clientX-dragStart.x),-preview.clientWidth*.45,preview.clientWidth*.45);
      draft.offsetY=clamp(dragStart.offsetY+(event.clientY-dragStart.y),-preview.clientHeight*.45,preview.clientHeight*.45);
      applyPreview();
    }else if(pointers.size===2 && pinchStart){
      const pts=[...pointers.values()];
      const d=dist(pts[0],pts[1]);
      draft.scale=clamp(pinchStart.scale*(d/Math.max(pinchStart.distance,1)),1,2.2);
      applyPreview();
    }
  });

  function endPointer(event){
    pointers.delete(event.pointerId);
    if(pointers.size===1){
      const p=[...pointers.values()][0];
      dragStart={x:p.x,y:p.y,offsetX:draft.offsetX,offsetY:draft.offsetY};
      pinchStart=null;
    }else if(pointers.size===0){
      dragStart=null; pinchStart=null;
    }
  }
  preview.addEventListener('pointerup',endPointer);
  preview.addEventListener('pointercancel',endPointer);

  // Touch fallback for older iOS behavior.
  preview.addEventListener('touchmove',function(event){
    if(pointers.size)return;
    event.preventDefault();
  },{passive:false});

  (async function load(){
    try{
      const response=await fetch(api,{cache:'no-store'});
      if(!response.ok)return;
      const json=await response.json();
      const data=json&&json.data;
      if(data&&data.mode==='modal-transform-v2'){
        saved.offsetX=Number.isFinite(Number(data.offsetX))?Number(data.offsetX):0;
        saved.offsetY=Number.isFinite(Number(data.offsetY))?Number(data.offsetY):0;
        saved.scale=clamp(Number(data.scale)||1,1,2.2);
        applyHero();
      }
    }catch(error){}
  })();
})();
