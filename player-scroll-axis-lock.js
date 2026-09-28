(()=>{'use strict';
function init(){
 const board=document.getElementById('board');if(!board)return;
 /* Safari標準の慣性スクロールを優先。JSでscrollLeftは操作しない。 */
 board.style.webkitOverflowScrolling='touch';
 board.style.overscrollBehaviorX='contain';
 board.style.touchAction='pan-x pan-y';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();