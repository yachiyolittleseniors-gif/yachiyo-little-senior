(()=>{
'use strict';
let loaded=false;
function loadTag(){
  if(loaded)return;
  loaded=true;
  const s=document.createElement('script');
  s.async=true;
  s.src='https://www.googletagmanager.com/gtag/js?id=G-L8BMMSXDP9';
  document.head.appendChild(s);
}
function schedule(){
  if('requestIdleCallback' in window){
    requestIdleCallback(loadTag,{timeout:3000});
  }else{
    setTimeout(loadTag,1800);
  }
}
if(document.readyState==='complete')schedule();
else window.addEventListener('load',schedule,{once:true});
['pointerdown','keydown','touchstart'].forEach(type=>{
  window.addEventListener(type,loadTag,{once:true,passive:true});
});
})();