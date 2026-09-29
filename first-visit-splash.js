(()=>{'use strict';
function init(){
  const splash=document.getElementById('firstVisitSplash');
  if(!splash)return;
  const image=new Image();
  let done=false,visible=false,visibleAt=0;
  let showTimer,closeTimer,failSafe;
  const remove=()=>{splash.remove()};
  const close=()=>{
    if(done)return;
    done=true;
    clearTimeout(showTimer);
    clearTimeout(failSafe);
    if(!visible){remove();return}
    const remaining=Math.max(0,1800-(performance.now()-visibleAt));
    closeTimer=setTimeout(()=>{
      splash.classList.add('is-leaving');
      setTimeout(remove,600);
    },remaining);
  };
  showTimer=setTimeout(()=>{
    if(done)return;
    visible=true;
    visibleAt=performance.now();
    splash.hidden=false;
  },120);
  image.onload=close;
  image.onerror=close;
  image.src='/.netlify/functions/site-data?section=hero&current=1';
  if(image.complete){
    if(image.naturalWidth>0)close();
    else close();
  }
  failSafe=setTimeout(close,5000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();