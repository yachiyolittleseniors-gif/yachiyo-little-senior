(function(){
  const button=document.getElementById("densukeToggleBtn");
  const trigger=document.querySelector("footer.footer");
  if(!button||!trigger)return;
  button.classList.add('unified-admin-toggle');
  trigger.classList.add('unified-admin-reveal');
  trigger.setAttribute('aria-label','管理ボタンを表示');

  let taps=0;
  let timer=null;
  let lastTouchAt=0;
  function reset(){
    taps=0;
    clearTimeout(timer);
    timer=null;
  }
  function countTap(){
    taps++;
    clearTimeout(timer);
    timer=setTimeout(reset,2200);
    if(taps>=5){
      reset();
      button.style.setProperty('display','block','important');
    }
  }
  trigger.addEventListener('pointerup',function(event){
    if(event.pointerType==='touch'){
      event.stopImmediatePropagation();
      return;
    }
    event.stopImmediatePropagation();
    countTap();
  },{capture:true,passive:true});
  trigger.addEventListener('touchend',function(event){
    lastTouchAt=Date.now();
    event.preventDefault();
    event.stopImmediatePropagation();
    countTap();
  },{capture:true,passive:false});
  trigger.addEventListener('click',function(event){
    if(Date.now()-lastTouchAt<800){
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    event.stopImmediatePropagation();
    countTap();
  },{capture:true,passive:false});
  trigger.addEventListener('dblclick',function(event){
    event.preventDefault();
    event.stopImmediatePropagation();
  },{capture:true,passive:false});
})();
