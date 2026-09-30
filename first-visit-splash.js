(()=>{'use strict';
const cover=document.getElementById('firstVisitSplash');
if(!cover)return;
cover.hidden=false;
let closed=false,stopMotion=()=>{};
function remove(){if(closed)return;closed=true;stopMotion();cover.remove();}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function mobileMotion(){
  if(!window.matchMedia('(max-width: 767px)').matches||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return wait(1500);
  const source=cover.querySelector('img'),wrapper=cover.querySelector('.first-visit-logo');
  if(!source||!wrapper)return wait(1500);
  // One independent draw per opening; approximately one visit in ten gets the bounce.
  const variant=Math.random()<0.1?'bounce':'spin';
  cover.dataset.motion=variant;
  return new Promise(resolve=>{
    let finished=false,raf=0,observer=null,canvas=null;
    const finish=()=>{if(finished)return;finished=true;cancelAnimationFrame(raf);if(observer)observer.disconnect();if(canvas)canvas.remove();source.style.opacity='';resolve();};
    stopMotion=finish;
    const loadTimeout=setTimeout(finish,1500);
    function begin(){
      if(finished||closed)return;
      clearTimeout(loadTimeout);
      if(!source.naturalWidth){finish();return;}
      try{
        wrapper.style.animation='none';source.style.animation='none';
        const shine=cover.querySelector('.first-visit-shine');if(shine)shine.style.display='none';
        canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
        Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});
        cover.appendChild(canvas);
        const ctx=canvas.getContext('2d');if(!ctx){finish();return;}
        let width=0,height=0;
        const clamp=x=>Math.max(0,Math.min(1,x));
        const ease=x=>{const t=clamp(x);return t*t*(3-2*t);};
  const partition=[[0,0],[445,0],[445,250],[421,300],[402,350],[379,397],[0,397]];
  let ballPixels=null,sphereLayer=null,sphereContext=null,sphereFrame=null;
  const resolution=224,renderHeight=199;
  const sphereSamples=[];
  for(let y=0;y<renderHeight;y++)for(let x=0;x<resolution;x++) {
    const sx=(x+.5)/resolution*448,sy=(y+.5)/renderHeight*397;
    const nx=(sx-226)/198.5,ny=(sy-198.5)/198.5;
    const rr=nx*nx+ny*ny;
    const nz=Math.sqrt(Math.max(0,1-rr));
    const diffuse=Math.max(0,-.43*nx-.53*ny+.731*nz);
    const bounce=Math.max(0,.35*nx+.35*ny-.2*nz)*.08;
    const lighting=.32+.68*diffuse+bounce;
    const specular=Math.pow(Math.max(0,-.23*nx-.28*ny+.932*nz),44)*22;
    const alpha=clamp((1-Math.sqrt(rr))*(renderHeight/2-1));
    sphereSamples.push({sx,sy,nx,ny,nz,lighting,specular,index:(y*resolution+x)*4,alpha});
  }
  const unit=p=>{const d=Math.hypot(...p);return p.map(v=>v/d);};
  const add=(a,b,s=1)=>a.map((v,i)=>v+s*b[i]);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  function seam(t) {
    const a=.7,b=.3,x=a*Math.cos(t)+b*Math.cos(3*t),y=a*Math.sin(t)-b*Math.sin(3*t);
    return [(x+y)/Math.SQRT2,(y-x)/Math.SQRT2,2*Math.sqrt(a*b)*Math.sin(2*t)];
  }
  const seamPoints=[],seamLengths=[0],stitches=[];
  for(let i=0;i<=1024;i++) {
    seamPoints.push(seam(i/1024*Math.PI*2));
    if(i)seamLengths.push(seamLengths[i-1]+Math.hypot(...add(seamPoints[i],seamPoints[i-1],-1)));
  }
  let segment=1;
  for(let i=0;i<108;i++) {
    const goal=(i+.5)/108*seamLengths[1024];
    while(seamLengths[segment]<goal)segment++;
    const u=(goal-seamLengths[segment-1])/(seamLengths[segment]-seamLengths[segment-1]);
    const t=(segment-1+u)/1024*Math.PI*2,p=seam(t);
    const tangent=unit(add(seam(t+.001),seam(t-.001),-1)),side=unit(cross(p,tangent));
    stitches.push([
      unit(add(add(p,side,-.031),tangent,-.020)),
      unit(add(p,tangent,.012)),
      unit(add(add(p,side,.031),tangent,-.020))
    ]);
  }
  function boundary(target=ctx) {
    target.moveTo(partition[0][0],partition[0][1]);
    for(let i=1;i<partition.length;i++)target.lineTo(partition[i][0],partition[i][1]);
    target.closePath();
  }
  function prepareBall() {
    if(ballPixels||!source.complete||!source.naturalWidth)return;
    const ballLayer=document.createElement('canvas');ballLayer.width=448;ballLayer.height=397;
    const target=ballLayer.getContext('2d',{willReadFrequently:true});
    target.beginPath();boundary(target);target.clip();target.drawImage(source,0,0,2172,397);
    ballPixels=target.getImageData(0,0,448,397).data;
    sphereLayer=document.createElement('canvas');sphereLayer.width=resolution;sphereLayer.height=renderHeight;
    sphereContext=sphereLayer.getContext('2d');sphereFrame=sphereContext.createImageData(resolution,renderHeight);
  }
  function decalIndex(x,y,z) {
    if(z<=0)return -1;
    const u=(x/.9+1)*223.5,v=(y/.798+1)*198;
    if(u<0||u>=448||v<0||v>=397)return -1;
    return (Math.floor(v)*448+Math.floor(u))*4;
  }
  function sphericalTurn(angle,mix) {
    prepareBall();
    const c=Math.cos(angle),s=Math.sin(angle),pixels=sphereFrame.data;
    // One continuous coordinate warp: no overlapping copies of the artwork.
    for(const p of sphereSamples) {
      const x=p.nx*c-p.nz*s,y=p.ny,z=p.nx*s+p.nz*c;
      const u=p.sx+((x/.9+1)*223.5-p.sx)*mix;
      const v=p.sy+((y/.798+1)*198-p.sy)*mix;
      const visible=(1-mix+mix*(z>0?1:0))*(1-mix+mix*p.alpha);
      let i0=0,i1=0,i2=0,i3=0,a0=0,a1=0,a2=0,a3=0;
      if(u>=0&&u<447&&v>=0&&v<396) {
        const ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy;
        i0=(iy*448+ix)*4;i1=i0+4;i2=i0+448*4;i3=i2+4;
        a0=ballPixels[i0+3]*(1-fx)*(1-fy)/255;
        a1=ballPixels[i1+3]*fx*(1-fy)/255;
        a2=ballPixels[i2+3]*(1-fx)*fy/255;
        a3=ballPixels[i3+3]*fx*fy/255;
      }
      const ink=(a0+a1+a2+a3)*visible;
      const skin=mix*p.alpha*(1-ink),opacity=ink+skin;
      const grain=Math.sin(x*361+y*157+z*97)*Math.sin(y*331-z*203)*1.4;
      const lighting=1+(p.lighting-1)*mix;
      for(let channel=0;channel<3;channel++) {
        const base=(channel===0?247:channel===1?242:229)+grain;
        const printed=(ballPixels[i0+channel]*a0+ballPixels[i1+channel]*a1+ballPixels[i2+channel]*a2+ballPixels[i3+channel]*a3)*visible;
        const color=opacity>0?(printed+base*skin)/opacity:0;
        pixels[p.index+channel]=Math.min(255,color*lighting+p.specular*mix);
      }
      pixels[p.index+3]=Math.round(opacity*255);
    }
    sphereContext.putImageData(sphereFrame,0,0);
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,.28)';ctx.shadowBlur=3*mix;ctx.shadowOffsetY=1.5*mix;
    ctx.drawImage(sphereLayer,0,0,448,397);ctx.restore();
    function project(p) {
      return [p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c];
    }
    function path(points,color,width) {
      ctx.beginPath();let pen=false;
      for(const p of points) {
        const q=project(p),di=decalIndex(...p),covered=di>=0&&ballPixels[di+3]>90;
        if(q[2]>.024&&!covered) {
          const x=226+q[0]*198.5,y=198.5+q[1]*198.5;
          if(pen)ctx.lineTo(x,y);else ctx.moveTo(x,y);pen=true;
        }else pen=false;
      }
      ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
    }
    ctx.save();ctx.globalAlpha*=mix;
    path(seamPoints,'rgba(99,63,22,.45)',3.8);
    path(seamPoints,'rgba(224,181,87,.55)',1.3);
    for(const stitch of stitches) {
      const mid=project(stitch[1]);if(mid[2]<.024)continue;
      path(stitch,'#886126',3.4);
      path(stitch,mid[2]>.4?'#d7ad53':'#b58b40',1.8);
    }
    ctx.restore();
  }
  function drawSpin(ms) {
    ctx.clearRect(0,0,width,height);
    if(!source.complete||!source.naturalWidth)return;
    const box=source.getBoundingClientRect(),frame=cover.getBoundingClientRect();
    const scale=box.width/2172,left=box.left-frame.left,top=box.top-frame.top;
    const sphereMix=ease((ms-400)/320)*(1-ease((ms-3120)/380));
    const p=ease((ms-720)/2400);
    const angle=p*Math.PI*2;
    ctx.save();ctx.translate(left,top);ctx.scale(scale,scale);
    if(sphereMix<=0) {
      // Exact original artwork at the beginning and the end.
      ctx.drawImage(source,0,0,2172,397);
    }else{
      // The wordmark stays fixed throughout the transition.
      ctx.save();ctx.beginPath();ctx.rect(-100,-100,2372,597);boundary();ctx.clip('evenodd');
      ctx.drawImage(source,0,0,2172,397);ctx.restore();
      sphericalTurn(angle,sphereMix);
    }
    ctx.restore();
  }
  function drawBounce(ms) {
    ctx.clearRect(0,0,width,height);
    if(!source.complete||!source.naturalWidth)return;
    const box=source.getBoundingClientRect(),frame=cover.getBoundingClientRect();
    const scale=box.width/2172,left=box.left-frame.left,top=box.top-frame.top;
    const settle=2600;
    const sphereMix=1-ease((ms-2180)/420);
    const angle=-Math.PI*2*(1-ease(ms/2180));
    const homeX=left+226*scale,homeY=top+198.5*scale;
    const hitX=width*.59,hitY=top-8*width/390;
    let ballX=homeX,ballY=homeY,ballScale=1;
    if(ms<1200){
      const t=clamp((ms-200)/1000);
      ballX=width*1.13+(hitX-width*1.13)*t;
      ballY=-height*.08+(hitY+height*.08)*t*t;
      ballScale=1.17-.17*t;
    }else if(ms<2180){
      const t=clamp((ms-1200)/980);
      ballX=hitX+(homeX-hitX)*t;
      ballY=hitY+(homeY-hitY)*t-4*height*.23*t*(1-t);
    }
    const impact=ms>=1200&&ms<1420?Math.sin((ms-1200)/220*Math.PI):0;
    const landing=ms>=2180&&ms<2500?Math.sin((ms-2180)/320*Math.PI):0;
    ctx.save();ctx.translate(left,top);ctx.scale(scale,scale);
    if(ms>=settle) {
      // Finish with the unmodified official artwork.
      ctx.drawImage(source,0,0,2172,397);
    }else{
      ctx.save();ctx.beginPath();ctx.rect(-100,-100,2372,597);boundary();ctx.clip('evenodd');
      ctx.drawImage(source,0,impact*8,2172,397);ctx.restore();
      ctx.save();
      ctx.translate((ballX-homeX)/scale,(ballY-homeY)/scale);
      ctx.translate(226,198.5);
      ctx.scale(ballScale*(1+impact*.035+landing*.018),ballScale*(1-impact*.05-landing*.025));
      ctx.translate(-226,-198.5);
      sphericalTurn(angle,sphereMix);
      ctx.restore();
    }
    ctx.restore();
  }

        function resize(){
          const r=cover.getBoundingClientRect();width=r.width;height=r.height;
          const dpr=Math.min(window.devicePixelRatio||1,2);
          canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
          ctx.setTransform(dpr,0,0,dpr,0,0);
        }
        resize();prepareBall();
        const draw=variant==='bounce'?drawBounce:drawSpin;
        draw(0);source.style.opacity='0';
        observer=new ResizeObserver(resize);observer.observe(cover);
        const duration=variant==='bounce'?3100:4000;
        const started=performance.now();
        function tick(now){
          if(finished||closed)return;
          try{const elapsed=now-started;draw(Math.min(elapsed,duration));if(elapsed>=duration){finish();return;}raf=requestAnimationFrame(tick);}catch(_){finish();}
        }
        raf=requestAnimationFrame(tick);
      }catch(_){finish();}
    }
    if(source.complete)begin();else{source.addEventListener('load',begin,{once:true});source.addEventListener('error',finish,{once:true});}
  });
}
function start(){
  const imageReady=window.__yachiyoHeroReady||Promise.resolve(false);
  Promise.all([mobileMotion(),Promise.race([imageReady.catch(()=>false),wait(8000)])])
    .then(()=>{if(closed)return;cover.classList.add('is-leaving');setTimeout(remove,350);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.addEventListener('pagehide',remove,{once:true});
// A stalled frame or failed image must never leave the opening covering the site.
setTimeout(remove,9000);
})();
