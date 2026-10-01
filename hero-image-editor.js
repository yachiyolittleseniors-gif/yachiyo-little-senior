(function(){
  const hero=document.querySelector('#home > .hero');
  const editBtn=document.getElementById('heroPhotoEdit');
  const modal=document.getElementById('heroImageEditModal');
  const workspace=document.getElementById('heroEditWorkspace');
  const image=document.getElementById('heroEditImage');
  const frame=document.getElementById('heroEditCropFrame');
  const cancel=document.getElementById('heroImageEditCancel');
  const saveBtn=document.getElementById('heroImageEditSave');
  if(!hero||!editBtn||!modal||!workspace||!image||!frame||!cancel||!saveBtn)return;

  const api='/.netlify/functions/site-data?section=hero-position-settings';
  const cropCacheKey='yachiyoHeroCropV3';
  let saved={x:58,y:50,zoom:100};
  let draft={...saved};
  let baseScale=1;
  let frameW=0,frameH=0;
  let pointers=new Map();
  let dragStart=null;
  let pinchStart=null;

  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const dist=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);

  function currentHeroImageUrl(){
    const raw=(hero.style.getPropertyValue('--hero-photo')||
      getComputedStyle(hero).getPropertyValue('--hero-photo')||
      getComputedStyle(document.documentElement).getPropertyValue('--hero-photo')||'').trim();
    const m=raw.match(/^url\((['"]?)(.*?)\1\)$/);
    return m?m[2]:'';
  }

  function syncFrame(){
    const heroRect=hero.getBoundingClientRect();
    const heroRatio=Math.max(heroRect.width,1)/Math.max(heroRect.height,1);
    const maxW=Math.max(220,workspace.clientWidth-34);
    const maxH=Math.max(260,workspace.clientHeight-70);
    let w=maxW,h=w/heroRatio;
    if(h>maxH){h=maxH;w=h*heroRatio}
    frameW=w;frameH=h;
    frame.style.width=Math.round(w)+'px';
    frame.style.height=Math.round(h)+'px';
  }

  function computeBaseScale(){
    if(!image.naturalWidth||!image.naturalHeight||!frameW||!frameH)return 1;
    return Math.max(frameW/image.naturalWidth,frameH/image.naturalHeight);
  }

  function maxOffsets(scale){
    const rw=image.naturalWidth*baseScale*scale;
    const rh=image.naturalHeight*baseScale*scale;
    return {
      x:Math.max(0,(rw-frameW)/2),
      y:Math.max(0,(rh-frameH)/2)
    };
  }

  function positionToOffsets(x,y,scale){
    const lim=maxOffsets(scale);
    return {
      dx:lim.x ? (50-x)/50*lim.x : 0,
      dy:lim.y ? (50-y)/50*lim.y : 0
    };
  }

  function offsetsToPosition(dx,dy,scale){
    const lim=maxOffsets(scale);
    return {
      x:lim.x ? clamp(50-(dx/lim.x)*50,0,100) : 50,
      y:lim.y ? clamp(50-(dy/lim.y)*50,0,100) : 50
    };
  }

  function applyDraft(){
    const scale=draft.zoom/100;
    const o=positionToOffsets(draft.x,draft.y,scale);
    image.style.width=image.naturalWidth*baseScale+'px';
    image.style.height=image.naturalHeight*baseScale+'px';
    image.style.transform='translate(-50%,-50%) translate3d('+o.dx+'px,'+o.dy+'px,0) scale('+scale+')';
  }

  function applyHero(){
    hero.style.setProperty('--hero-edit-x',saved.x+'%');
    hero.style.setProperty('--hero-edit-y',saved.y+'%');
    hero.style.setProperty('--hero-edit-zoom',saved.zoom+'%');
  }

  function openModal(){
    draft={...saved};
    syncFrame();
    const src=currentHeroImageUrl();
    if(src && image.src!==src)image.src=src;
    if(image.complete&&image.naturalWidth){
      baseScale=computeBaseScale();
      applyDraft();
    }
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
    pointers.clear();dragStart=null;pinchStart=null;
  }

  image.addEventListener('load',function(){
    syncFrame();
    baseScale=computeBaseScale();
    applyDraft();
  });

  editBtn.addEventListener('click',function(){
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
        body:JSON.stringify({data:{mode:'crop-v3',x:draft.x,y:draft.y,zoom:draft.zoom,updatedAt:new Date().toISOString()}})
      });
      if(!response.ok)throw new Error();
      saved={...draft};
      try{localStorage.setItem(cropCacheKey,JSON.stringify(saved))}catch(e){}
      applyHero();
      closeModal();
      if(window.showSaveNotice)window.showSaveNotice('トップ画像の位置を保存しました');
    }catch(error){
      alert('保存できませんでした。');
    }finally{
      saveBtn.disabled=false;
      saveBtn.textContent='保存';
    }
  });

  workspace.addEventListener('pointerdown',function(event){
    event.preventDefault();
    workspace.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});

    if(pointers.size===1){
      const scale=draft.zoom/100;
      const o=positionToOffsets(draft.x,draft.y,scale);
      dragStart={x:event.clientX,y:event.clientY,dx:o.dx,dy:o.dy,scale};
      pinchStart=null;
    }else if(pointers.size===2){
      const pts=[...pointers.values()];
      pinchStart={distance:dist(pts[0],pts[1]),zoom:draft.zoom};
      dragStart=null;
    }
  });

  workspace.addEventListener('pointermove',function(event){
    if(!pointers.has(event.pointerId))return;
    event.preventDefault();
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});

    if(pointers.size===1&&dragStart){
      const lim=maxOffsets(dragStart.scale);
      const dx=clamp(dragStart.dx+(event.clientX-dragStart.x),-lim.x,lim.x);
      const dy=clamp(dragStart.dy+(event.clientY-dragStart.y),-lim.y,lim.y);
      const pos=offsetsToPosition(dx,dy,dragStart.scale);
      draft.x=pos.x;draft.y=pos.y;
      applyDraft();
    }else if(pointers.size===2&&pinchStart){
      const pts=[...pointers.values()];
      draft.zoom=clamp(pinchStart.zoom*(dist(pts[0],pts[1])/Math.max(pinchStart.distance,1)),100,220);
      applyDraft();
    }
  });

  function endPointer(event){
    pointers.delete(event.pointerId);
    if(pointers.size===1){
      const p=[...pointers.values()][0];
      const scale=draft.zoom/100;
      const o=positionToOffsets(draft.x,draft.y,scale);
      dragStart={x:p.x,y:p.y,dx:o.dx,dy:o.dy,scale};
      pinchStart=null;
    }else if(pointers.size===0){
      dragStart=null;pinchStart=null;
    }
  }
  workspace.addEventListener('pointerup',endPointer);
  workspace.addEventListener('pointercancel',endPointer);

  window.addEventListener('resize',function(){
    if(!modal.classList.contains('show'))return;
    syncFrame();
    baseScale=computeBaseScale();
    applyDraft();
  });

  (async function load(){
    try{
      const response=await fetch(api,{cache:'no-store'});
      if(response.ok){
        const json=await response.json();
        const data=json&&json.data;
        if(data&&data.mode==='crop-v3'){
          saved.x=clamp(Number(data.x)||58,0,100);
          saved.y=clamp(Number(data.y)||50,0,100);
          saved.zoom=clamp(Number(data.zoom)||100,100,220);
          try{localStorage.setItem(cropCacheKey,JSON.stringify(saved))}catch(e){}
        }
      }
    }catch(error){}
    applyHero();
  })();
})();
