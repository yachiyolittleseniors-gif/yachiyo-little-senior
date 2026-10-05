(()=>{'use strict';
function boot(){
  const trigger=document.querySelector('.team-core-signature');
  const credit=document.getElementById('teamCoreCreatorCredit');
  if(!trigger||!credit)return;

  let timer=0;
  function show(){
    window.clearTimeout(timer);
    credit.classList.add('is-visible');
    credit.setAttribute('aria-hidden','false');
    trigger.setAttribute('aria-expanded','true');
    timer=window.setTimeout(()=>{
      credit.classList.remove('is-visible');
      credit.setAttribute('aria-hidden','true');
      trigger.setAttribute('aria-expanded','false');
    },2000);
  }

  trigger.addEventListener('click',show);
  trigger.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      show();
    }
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();
