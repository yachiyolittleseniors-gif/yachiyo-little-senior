(()=>{
  const watched=document.querySelector('#densukeAdminPanel');
  if(!watched)return;
  const mode='panel';
  const spacerId='admin-position-scroll-spacer';
  const delays=[0,100,300,700,1200];
  let timers=[];
  let resizeTimer=0;
  let wasOpen=watched.classList.contains('show');
  const previousHtmlAnchor=document.documentElement.style.overflowAnchor;
  const previousBodyAnchor=document.body.style.overflowAnchor;

  function isOpen(){return watched.classList.contains('show');}
  function clearTimers(){
    timers.forEach(clearTimeout);
    timers=[];
    clearTimeout(resizeTimer);
  }
  function setAnchoring(disabled){
    if(mode!=='page')return;
    document.documentElement.style.overflowAnchor=disabled?'none':previousHtmlAnchor;
    document.body.style.overflowAnchor=disabled?'none':previousBodyAnchor;
  }
  function ensureSpacer(){
    if(mode!=='page')return;
    let spacer=document.getElementById(spacerId);
    if(!spacer){
      spacer=document.createElement('div');
      spacer.id=spacerId;
      spacer.setAttribute('aria-hidden','true');
      spacer.style.cssText='height:110dvh;min-height:720px;pointer-events:none;';
      document.body.appendChild(spacer);
    }
  }
  function removeSpacer(){document.getElementById(spacerId)?.remove();}
  function align(){
    if(!isOpen())return;
    const target=document.querySelector('#densukeAdminPanel');
    if(!target)return;
    if(mode==='panel'){
      target.scrollTop=0;
      return;
    }
    ensureSpacer();
    const header=document.querySelector('.header,.site-header');
    const desiredTop=(header?header.getBoundingClientRect().bottom:0)+12;
    const nextTop=Math.max(0,Math.round(window.scrollY+target.getBoundingClientRect().top-desiredTop));
    window.scrollTo(0,nextTop);
  }
  function scheduleAlign(){
    clearTimers();
    setAnchoring(true);
    ensureSpacer();
    delays.forEach(delay=>timers.push(setTimeout(align,delay)));
  }

  new MutationObserver(()=>{
    const open=isOpen();
    if(open&&!wasOpen)scheduleAlign();
    if(!open&&wasOpen){
      clearTimers();
      removeSpacer();
      setAnchoring(false);
    }
    wasOpen=open;
  }).observe(watched,{attributes:true,attributeFilter:['class']});

  const target=document.querySelector('#densukeAdminPanel');
  if(target&&'ResizeObserver' in window){
    new ResizeObserver(()=>{
      if(!isOpen())return;
      clearTimeout(resizeTimer);
      resizeTimer=setTimeout(align,60);
    }).observe(target);
  }

  window.addEventListener('orientationchange',()=>{if(isOpen())scheduleAlign();});
  if(wasOpen)scheduleAlign();
})();
