(()=>{'use strict';
function init(){
 const board=document.getElementById('board');if(!board)return;
 let sx=0,sy=0,sl=0,mode='';
 board.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0];sx=t.clientX;sy=t.clientY;sl=board.scrollLeft;mode='';},{passive:true});
 board.addEventListener('touchmove',e=>{if(e.touches.length!==1)return;const t=e.touches[0],dx=t.clientX-sx,dy=t.clientY-sy;if(!mode&&Math.max(Math.abs(dx),Math.abs(dy))>8)mode=Math.abs(dx)>Math.abs(dy)?'x':'y';if(mode==='x'){e.preventDefault();board.scrollLeft=sl-dx;}},{passive:false});
 board.addEventListener('touchend',()=>{mode='';},{passive:true});
 board.addEventListener('touchcancel',()=>{mode='';},{passive:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();