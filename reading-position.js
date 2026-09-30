(function(){
  'use strict';
  const loads=[];
  const readyEvent=document.currentScript?.getAttribute('data-reading-ready-event');
  if(readyEvent)loads.push(new Promise(resolve=>window.addEventListener(readyEvent,resolve,{once:true})));
  window.yachiyoTrackInitialLoad=promise=>{loads.push(promise);return promise;};
  window.yachiyoReadReloadData=name=>{if(!reload)return null;try{return JSON.parse(sessionStorage.getItem('yachiyo:reload-data:'+name)||'null');}catch(e){return null;}};
  window.yachiyoRememberReloadData=(name,data)=>{try{const value=JSON.stringify(data);if(value.length<500000)sessionStorage.setItem('yachiyo:reload-data:'+name,value);}catch(e){}};
  const key='yachiyo:reading-position:'+location.pathname+location.search;
  const reload=performance.getEntriesByType('navigation')[0]?.type==='reload';
  let saved=null;
  try{const raw=sessionStorage.getItem(key);if(raw!==null&&Number.isFinite(Number(raw)))saved=Math.max(0,Number(raw));}catch(e){}
  let restoring=Boolean(reload&&saved!==null),frame=0,timer=0;
  if('scrollRestoration' in history)history.scrollRestoration='auto';
  function save(){if(!restoring)try{sessionStorage.setItem(key,String(window.scrollY));}catch(e){}}
  function finish(){restoring=false;clearTimeout(timer);save();}
  window.addEventListener('scroll',()=>{if(restoring)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(save);},{passive:true});
  window.addEventListener('pagehide',save);
  function restoreImmediately(){if(restoring)window.scrollTo({top:saved,left:0,behavior:'instant'});}
  document.addEventListener('DOMContentLoaded',restoreImmediately,{once:true});
  window.addEventListener('pageshow',async()=>{
    restoreImmediately();
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

