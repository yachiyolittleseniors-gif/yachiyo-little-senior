/* Keep board refresh visually stable while async sections rebuild. */
(function(){
  'use strict';

  const nav=performance.getEntriesByType('navigation')[0];
  if(!nav||nav.type!=='reload')return;

  const root=document.documentElement;
  root.classList.add('board-refreshing');

  let saved=0;
  try{
    const key='yachiyo:reading-position:'+location.pathname+location.search;
    const raw=sessionStorage.getItem(key);
    if(raw!==null&&Number.isFinite(Number(raw)))saved=Math.max(0,Number(raw));
  }catch(e){}

  let lastHeight=0;
  let stableSince=0;
  const started=performance.now();

  function reveal(){
    try{window.scrollTo({top:saved,left:0,behavior:'instant'});}catch(e){}
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        root.classList.remove('board-refreshing');
      });
    });
  }

  function check(now){
    const height=document.documentElement.scrollHeight;
    if(height===lastHeight){
      if(!stableSince)stableSince=now;
    }else{
      lastHeight=height;
      stableSince=now;
    }

    try{window.scrollTo({top:saved,left:0,behavior:'instant'});}catch(e){}

    if((now-stableSince>=320&&now-started>=450)||now-started>=1800){
      reveal();
      return;
    }
    requestAnimationFrame(check);
  }

  window.addEventListener('pageshow',()=>{
    requestAnimationFrame(()=>requestAnimationFrame(check));
  },{once:true});
})();