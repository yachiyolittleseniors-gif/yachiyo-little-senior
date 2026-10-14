(()=>{'use strict';
/*
 * iOS Safari resume recovery
 *
 * Safari can occasionally restore a long-suspended tab as a blank/white
 * surface even while the page state still exists.  Short app switches only
 * get a forced repaint.  After a longer suspension we reload once so the
 * existing home-page reload/scroll restoration path can rebuild the view.
 */
const ua=String(navigator.userAgent||'');
const isiOS=/iP(?:hone|ad|od)/i.test(ua)||
  (navigator.platform==='MacIntel'&&Number(navigator.maxTouchPoints)>1);
const isSafari=isiOS&&/WebKit/i.test(ua)&&!/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(ua);
if(!isSafari)return;

const hiddenKey='yachiyo:safari-hidden-at';
const reloadKey='yachiyo:safari-resume-reload-at';
const longSuspendMs=30000;
let hiddenAt=0;
let recovering=false;

try{
  const saved=Number(sessionStorage.getItem(hiddenKey)||0);
  if(Number.isFinite(saved)&&saved>0)hiddenAt=saved;
}catch(_){}

function rememberHidden(){
  hiddenAt=Date.now();
  try{sessionStorage.setItem(hiddenKey,String(hiddenAt));}catch(_){}
}

function forceRepaint(){
  const root=document.documentElement;
  const body=document.body;
  if(!root||!body)return;
  try{
    root.style.webkitTransform='translateZ(0)';
    body.style.webkitTransform='translateZ(0)';
    void body.offsetHeight;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      root.style.webkitTransform='';
      body.style.webkitTransform='';
      void body.offsetHeight;
      window.dispatchEvent(new Event('resize'));
    }));
  }catch(_){}
}

function recover(){
  if(recovering)return;

  const now=Date.now();
  const slept=hiddenAt>0?now-hiddenAt:0;
  forceRepaint();

  // Fast app switches should remain instant.
  if(!hiddenAt||slept<longSuspendMs)return;

  let lastReload=0;
  try{lastReload=Number(sessionStorage.getItem(reloadKey)||0)||0;}catch(_){}

  // Prevent a resume/reload loop.
  if(now-lastReload<8000){
    try{sessionStorage.removeItem(hiddenKey);}catch(_){}
    return;
  }

  recovering=true;
  try{
    sessionStorage.setItem(reloadKey,String(now));
    sessionStorage.removeItem(hiddenKey);
  }catch(_){}

  setTimeout(()=>location.reload(),0);
}

document.addEventListener('visibilitychange',()=>{
  if(document.hidden)rememberHidden();
  else recover();
});
window.addEventListener('pagehide',rememberHidden);
window.addEventListener('pageshow',recover);
})();