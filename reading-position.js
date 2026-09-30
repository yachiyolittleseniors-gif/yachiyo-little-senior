(function(){
  'use strict';
  const loads=[];
  window.yachiyoTrackInitialLoad=promise=>{loads.push(promise);return promise;};
  const key='yachiyo:reading-position:'+location.pathname+location.search;
  const reload=performance.getEntriesByType('navigation')[0]?.type==='reload';
  let saved=null;
  try{const raw=sessionStorage.getItem(key);if(raw!==null&&Number.isFinite(Number(raw)))saved=Math.max(0,Number(raw));}catch(e){}
  let restoring=Boolean(reload&&saved!==null),frame=0,timer=0;
  if('scrollRestoration' in history)history.scrollRestoration=restoring?'manual':'auto';
  function save(){if(!restoring)try{sessionStorage.setItem(key,String(window.scrollY));}catch(e){}}
  function finish(){restoring=false;clearTimeout(timer);save();}
  window.addEventListener('scroll',()=>{if(restoring)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(save);},{passive:true});
  window.addEventListener('pagehide',save);
  window.addEventListener('pageshow',async()=>{
    if(!restoring){save();return;}
    await Promise.allSettled([...loads,document.fonts?.ready]);
    if(!restoring)return;
    let stable=0,lastHeight=-1;
    const deadline=Date.now()+2500;
    function restore(){
      if(!restoring)return;
      window.scrollTo({top:saved,left:0,behavior:'instant'});
      const height=document.documentElement.scrollHeight;
      stable=height===lastHeight?stable+1:0;
      lastHeight=height;
      if((Math.abs(window.scrollY-saved)<2&&stable>=3)||Date.now()>=deadline){finish();return;}
      timer=setTimeout(restore,100);
    }
    requestAnimationFrame(()=>requestAnimationFrame(restore));
  });
  ['touchstart','wheel','keydown'].forEach(type=>window.addEventListener(type,()=>{if(restoring)finish();},{passive:true}));
})();
