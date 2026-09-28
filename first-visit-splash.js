(()=>{'use strict';
function init(){
 const splash=document.getElementById('firstVisitSplash');if(!splash)return;
 splash.hidden=false;
 let minDone=false,heroDone=false,closed=false;
 const close=()=>{if(closed||!minDone||!heroDone)return;closed=true;splash.classList.add('is-leaving');setTimeout(()=>splash.remove(),620)};
 setTimeout(()=>{minDone=true;close()},1800);
 const finishHero=()=>{heroDone=true;close()};
 fetch('/.netlify/functions/site-data?section=hero&manifest=1',{cache:'no-store'})
  .then(r=>r.ok?r.json():Promise.reject())
  .then(j=>{const src=j&&j.data&&j.data[0]&&j.data[0].image;if(!src){finishHero();return}const img=new Image();img.onload=finishHero;img.onerror=finishHero;img.src=src;if(img.complete&&img.naturalWidth)finishHero()})
  .catch(finishHero);
 setTimeout(()=>{heroDone=true;minDone=true;close()},2500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();