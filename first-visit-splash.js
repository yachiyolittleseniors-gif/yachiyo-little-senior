(()=>{'use strict';
const cover=document.getElementById('firstVisitSplash');
if(!cover)return;
let closed=false, shownAt=0, showTimer, endTimer;
function remove(){if(closed)return;closed=true;clearTimeout(showTimer);clearTimeout(endTimer);cover.remove();}
function finish(){if(closed)return;if(!shownAt){remove();return;}
 const remaining=Math.max(0,1800-(performance.now()-shownAt));
 clearTimeout(endTimer);endTimer=setTimeout(()=>{cover.classList.add('is-leaving');setTimeout(remove,350);},remaining);
}
const hardStop=setTimeout(remove,3000);
showTimer=setTimeout(()=>{if(closed)return;shownAt=performance.now();cover.hidden=false;},120);
window.addEventListener('pagehide',remove,{once:true});
fetch('/.netlify/functions/site-data?section=hero&manifest=1',{cache:'no-store'})
 .then(r=>{if(!r.ok)throw new Error('hero');return r.json();})
 .then(j=>{const src=j&&j.data&&j.data[0]&&j.data[0].image;if(!src){finish();return;}
 const img=new Image();
 img.onload=()=>{const hero=document.querySelector('.hero');if(hero)hero.style.setProperty('--hero-photo','url("'+src+'")');finish();};
 img.onerror=finish;img.src=src;
 }).catch(finish);
})();