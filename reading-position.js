(function(){
  'use strict';
  const loads=[];
  const readyEvent=document.currentScript?.getAttribute('data-reading-ready-event');
  if(readyEvent)loads.push(new Promise(resolve=>window.addEventListener(readyEvent,resolve,{once:true})));
  window.yachiyoTrackInitialLoad=promise=>{loads.push(promise);return promise;};
  const key='yachiyo:reading-position:'+location.pathname+location.search;
  const reload=performance.getEntriesByType('navigation')[0]?.type==='reload';
  let saved=null;
  try{const raw=sessionStorage.getItem(key);if(raw!==null&&Number.isFinite(Number(raw)))saved=Math.max(0,Number(raw));}catch(e){}
  let restoring=Boolean(reload&&saved!==null),frame=0,timer=0;
  const maskInitialPaint=restoring&&saved>0&&document.currentScript?.hasAttribute('data-suppress-initial-flash');
  let revealGuard=0;
  if(maskInitialPaint){
    const style=document.createElement('style');
    style.textContent='html.reading-position-pending{background:#071426!important}html.reading-position-pending body{visibility:hidden!important}';
    document.head.appendChild(style);
    document.documentElement.classList.add('reading-position-pending');
    // Fail open if a content request stalls; the page must remain usable.
    revealGuard=setTimeout(()=>{if(restoring){window.scrollTo({top:saved,left:0,behavior:'instant'});finish();}},10000);
  }
  if('scrollRestoration' in history)history.scrollRestoration=restoring?'manual':'auto';
  function save(){if(!restoring)try{sessionStorage.setItem(key,String(window.scrollY));}catch(e){}}
  function finish(){restoring=false;clearTimeout(timer);clearTimeout(revealGuard);document.documentElement.classList.remove('reading-position-pending');save();}
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
