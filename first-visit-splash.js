(()=>{'use strict';
const cover=document.getElementById('firstVisitSplash');
if(!cover)return;
cover.hidden=false;
let closed=false;
function remove(){if(closed)return;closed=true;cover.remove();}
setTimeout(()=>{if(!closed)cover.classList.add('is-leaving');},1500);
setTimeout(remove,1800);
window.addEventListener('pagehide',remove,{once:true});
})();