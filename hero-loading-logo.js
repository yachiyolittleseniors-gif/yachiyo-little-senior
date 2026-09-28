(()=>{'use strict';
function init(){
 const hero=document.querySelector('.hero');if(!hero)return;
 const src='/.netlify/functions/site-data?section=hero&current=1';
 const img=new Image();
 const ready=()=>{hero.classList.add('hero-image-ready')};
 img.onload=()=>{if(img.decode)img.decode().then(ready,ready);else ready()};
 img.onerror=()=>{};
 img.src=src;
 if(img.complete&&img.naturalWidth)ready();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();