(()=>{'use strict';
function init(){
 const board=document.getElementById('board');if(!board)return;
 board.style.webkitOverflowScrolling='touch';
 board.style.overscrollBehaviorX='contain';
 let sx=0,sy=0,sl=0,st=0,mode='';
 board.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0];sx=t.clientX;sy=t.clientY;sl=board.scrollLeft;st=board.scrollTop;mode='';},{passive:true});
 board.addEventListener('touchmove',e=>{if(e.touches.length!==1)return;const t=e.touches[0],dx=t.clientX-sx,dy=t.clientY-sy;if(!mode&&Math.max(Math.abs(dx),Math.abs(dy))>10)mode=Math.abs(dx)>Math.abs(dy)?'x':'y';if(mode==='x')board.scrollTop=st;else if(mode==='y')board.scrollLeft=sl;},{passive:true});
 const reset=()=>{mode=''};board.addEventListener('touchend',reset,{passive:true});board.addEventListener('touchcancel',reset,{passive:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();