(()=>{
'use strict';
let started=false;
function addScript(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=src;
    s.async=false;
    s.onload=resolve;
    s.onerror=reject;
    document.head.appendChild(s);
  });
}
async function loadAdmin(){
  if(started)return;
  started=true;
  try{
    await addScript('./admin-button-config.js?v=20261003-rebuild1');
    await addScript('./admin-button-controller.js?v=20261004-unified3');
  }catch(_){}
}
function schedule(){
  if('requestIdleCallback' in window)requestIdleCallback(loadAdmin,{timeout:1400});
  else setTimeout(loadAdmin,900);
}
if(document.readyState==='complete')schedule();
else window.addEventListener('load',schedule,{once:true});
function armTrigger(){
  const trigger=document.querySelector('.restored-footer-copy');
  if(trigger){
    trigger.addEventListener('pointerdown',loadAdmin,{once:true,capture:true,passive:true});
    trigger.addEventListener('touchstart',loadAdmin,{once:true,capture:true,passive:true});
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',armTrigger,{once:true});
else armTrigger();
})();