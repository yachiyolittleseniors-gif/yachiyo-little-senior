(()=>{'use strict';
/*
 * iOS Safari resume repaint guard.
 * Only repaint after a real background restore / BFCache restore.
 * Never touch html/body compositor state during a normal first page show,
 * because that can flash the opening overlay.
 */
const ua=String(navigator.userAgent||'');
const isiOS=/iP(?:hone|ad|od)/i.test(ua)||
  (navigator.platform==='MacIntel'&&Number(navigator.maxTouchPoints)>1);
const isSafari=isiOS&&/WebKit/i.test(ua)&&!/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(ua);
if(!isSafari)return;

let lastPaint=0;
let repaintTimer=0;
let wasHidden=false;

function openingVisible(){
  const splash=document.getElementById('firstVisitSplash');
  return !!(splash&&splash.isConnected&&!splash.classList.contains('is-leaving'));
}

function forceRepaint(){
  if(document.hidden||openingVisible())return;
  const now=Date.now();
  if(now-lastPaint<80)return;
  lastPaint=now;

  const root=document.documentElement;
  const body=document.body;
  if(!root||!body)return;

  const rootTransform=root.style.webkitTransform;
  const bodyTransform=body.style.webkitTransform;
  try{
    root.style.webkitTransform='translateZ(0)';
    body.style.webkitTransform='translateZ(0)';
    void body.offsetHeight;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      root.style.webkitTransform=rootTransform;
      body.style.webkitTransform=bodyTransform;
      void body.offsetHeight;
      window.dispatchEvent(new Event('resize'));
    }));
  }catch(_){}
}

function scheduleRepaint(){
  clearTimeout(repaintTimer);
  // Let any opening/fade finish before touching compositor state.
  repaintTimer=setTimeout(()=>{
    if(openingVisible()){
      repaintTimer=setTimeout(forceRepaint,420);
      return;
    }
    forceRepaint();
    repaintTimer=setTimeout(forceRepaint,120);
  },80);
}

document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    wasHidden=true;
    return;
  }
  if(wasHidden){
    wasHidden=false;
    scheduleRepaint();
  }
});
window.addEventListener('pageshow',event=>{
  // persisted=true means a genuine BFCache restore. A normal first pageshow
  // must not trigger compositor manipulation.
  if(event.persisted)scheduleRepaint();
});
})();