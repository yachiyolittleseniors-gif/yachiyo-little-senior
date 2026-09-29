(()=>{'use strict';
const cover=document.getElementById('firstVisitSplash');
if(!cover)return;
cover.hidden=false;
let closed=false;
function remove(){if(closed)return;closed=true;cover.remove();}
setTimeout(()=>{if(!closed)cover.classList.add('is-leaving');},1500);
setTimeout(remove,1800);
window.addEventListener('pagehide',remove,{once:true});
fetch('/.netlify/functions/site-data?section=hero&manifest=1',{cache:'no-store'})
 .then(r=>{if(!r.ok)throw new Error('hero');return r.json();})
 .then(j=>{
  const src=j&&j.data&&j.data[0]&&j.data[0].image;if(!src)return;
  const img=new Image();
  img.onload=()=>{const hero=document.querySelector('.hero');if(hero)hero.style.setProperty('--hero-photo','url("'+src+'")');};
  img.src=src;
 }).catch(()=>{});
})();