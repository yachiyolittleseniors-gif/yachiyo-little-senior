(()=>{'use strict';
const cover=document.getElementById('firstVisitSplash');
if(!cover)return;
cover.hidden=false;
let closed=false;
function remove(){if(closed)return;closed=true;cover.remove();}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function start(){
  const imageReady=window.__yachiyoHeroReady||Promise.resolve(false);
  Promise.all([wait(1500),Promise.race([imageReady.catch(()=>false),wait(8000)])])
    .then(()=>{if(closed)return;cover.classList.add('is-leaving');setTimeout(remove,350);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
window.addEventListener('pagehide',remove,{once:true});
})();