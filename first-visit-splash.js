(()=>{'use strict';
function init(){
 const splash=document.getElementById('firstVisitSplash');if(!splash)return;
 const KEY='yachiyoHeroSplashVersionV2';
 const close=()=>{splash.classList.add('is-leaving');setTimeout(()=>splash.remove(),620)};
 fetch('/.netlify/functions/site-data?section=hero&manifest=1',{cache:'no-store'})
  .then(r=>r.ok?r.json():Promise.reject())
  .then(j=>{
    const src=j&&j.data&&j.data[0]&&j.data[0].image;
    if(!src){splash.remove();return}
    let seen='';try{seen=localStorage.getItem(KEY)||''}catch(e){}
    if(seen===src){splash.remove();return}
    splash.hidden=false;
    let minDone=false,imgDone=false,closed=false;
    const finish=()=>{if(closed||!minDone||!imgDone)return;closed=true;try{localStorage.setItem(KEY,src)}catch(e){}close()};
    setTimeout(()=>{minDone=true;finish()},1850);
    const img=new Image();img.onload=()=>{imgDone=true;finish()};img.onerror=()=>{imgDone=true;finish()};img.src=src;
    if(img.complete&&img.naturalWidth){imgDone=true;finish()}
    setTimeout(()=>{minDone=true;imgDone=true;finish()},3200);
  })
  .catch(()=>splash.remove());
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();