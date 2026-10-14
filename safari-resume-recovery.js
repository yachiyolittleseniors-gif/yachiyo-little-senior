(()=>{'use strict';
/*
 * iOS Safari resume repaint guard
 *
 * Do not force a navigation/reload when Safari returns from the background.
 * Reloading while WebKit is restoring a suspended tab can leave the surface
 * blank. Instead, keep the existing page and nudge the compositor to repaint.
 */
const ua=String(navigator.userAgent||'');
const isiOS=/iP(?:hone|ad|od)/i.test(ua)||
  (navigator.platform==='MacIntel'&&Number(navigator.maxTouchPoints)>1);
const isSafari=isiOS&&/WebKit/i.test(ua)&&!/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(ua);
if(!isSafari)return;

let lastPaint=0;
let repaintTimer=0;

function forceRepaint(){
  if(document.hidden)return;
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
  forceRepaint();
  repaintTimer=setTimeout(forceRepaint,120);
}

document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)scheduleRepaint();
});
window.addEventListener('pageshow',scheduleRepaint);
})();