(()=>{
  const watched=document.querySelector('#densukeAdminPanel');
  if(!watched)return;
  let wasOpen=watched.classList.contains('show');
  function align(){
    if(!watched.classList.contains('show'))return;
    const target=[...document.querySelectorAll('#densukeAdminPanel')].find(el=>el.getClientRects().length);
    if(!target)return;
    target.scrollTop=0;
  }
  function schedule(){requestAnimationFrame(()=>requestAnimationFrame(align))}
  new MutationObserver(()=>{
    const open=watched.classList.contains('show');
    if(open&&!wasOpen)schedule();
    wasOpen=open;
  }).observe(watched,{attributes:true,attributeFilter:['class']});
  // Align only when opening; editing, resizing and saving must not reset the position.
  if(wasOpen)schedule();
})();
