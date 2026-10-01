(()=>{'use strict';
const cover=document.getElementById('firstVisitSplash');
if(!cover)return;
let forceOpening=false;
try{
  forceOpening=sessionStorage.getItem('yachiyo:force-opening')==='1';
  if(forceOpening)sessionStorage.removeItem('yachiyo:force-opening');
}catch(e){}
// A successful hero replacement requests the opening once on the next home view.
let heroChanged=window.__yachiyoHeroChanged===true;
try{
  heroChanged=heroChanged||sessionStorage.getItem('yachiyo:hero-opening-pending')==='1';
  if(heroChanged)sessionStorage.removeItem('yachiyo:hero-opening-pending');
}catch(e){}
if(performance.getEntriesByType('navigation')[0]?.type==='reload'&&!heroChanged&&!forceOpening){cover.remove();return;}
cover.hidden=false;
const openedAt=performance.now();
let closed=false,stopMotion=()=>{},stopDutySignal=()=>{},exitTimer=0,guardTimer=0;
let leaving=false;
function remove(){if(closed)return;closed=true;clearTimeout(exitTimer);clearTimeout(guardTimer);stopMotion();stopDutySignal();cover.remove();}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

function dutyRequestSignal(){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  let stopped=false,raf=0,canvas=null,observer=null;
  stopDutySignal=()=>{stopped=true;cancelAnimationFrame(raf);if(observer)observer.disconnect();if(canvas)canvas.remove();};
  fetch('/.netlify/functions/duty-request-alert',{cache:'no-store'})
    .then(function(response){return response.ok?response.json():null;})
    .then(function(data){
      if(stopped||closed||!data||data.hasPending!==true)return;
      const mode='stars';
      cover.dataset.dutySignal=mode;
      canvas=document.createElement('canvas');
      canvas.setAttribute('aria-hidden','true');
      Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'8'});
      cover.appendChild(canvas);
      const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();canvas=null;return;}
      let width=0,height=0,dpr=1;
      const started=performance.now();
      const flowingStars=[
        {delay:0,sx:1.08,sy:.05,ex:-.08,ey:.84,size:5.6}
      ];
      function resize(){
        const r=cover.getBoundingClientRect();width=r.width;height=r.height;
        dpr=Math.min(window.devicePixelRatio||1,2);
        canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));
        ctx.setTransform(dpr,0,0,dpr,0,0);
      }
      function starPath(x,y,r,rotation){
        ctx.beginPath();
        for(let i=0;i<10;i++){
          const rr=i%2===0?r:r*.42,angle=rotation-Math.PI/2+i*Math.PI/5;
          const px=x+Math.cos(angle)*rr,py=y+Math.sin(angle)*rr;
          if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
        }
        ctx.closePath();
      }
      function drawFlowingStars(progress){
        ctx.clearRect(0,0,width,height);
        flowingStars.forEach(function(item,i){
          const local=(progress-item.delay)/(1-item.delay);
          if(local<=0||local>=1)return;
          const eased=local*local*(3-2*local);
          const x=width*(item.sx+(item.ex-item.sx)*eased),y=height*(item.sy+(item.ey-item.sy)*eased);
          const prev=Math.max(0,eased-.11);
          const tx=width*(item.sx+(item.ex-item.sx)*prev),ty=height*(item.sy+(item.ey-item.sy)*prev);
          const fade=Math.sin(Math.PI*local);
          ctx.save();
          ctx.lineCap='round';
          ctx.strokeStyle='rgba(232,182,67,'+(.58*fade)+')';
          ctx.lineWidth=Math.max(1.2,item.size*.34);
          ctx.shadowColor='rgba(255,215,108,'+(.8*fade)+')';ctx.shadowBlur=10;
          ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(x,y);ctx.stroke();
          starPath(x,y,item.size*(.85+.2*Math.sin(local*Math.PI)),i*.35);
          ctx.fillStyle='rgba(255,230,151,'+Math.min(1,.92*fade+.08)+')';ctx.fill();
          ctx.restore();
        });
      }
      function tick(now){
        if(stopped||closed)return;
        const elapsed=now-started;
        const remaining=Math.max(420,1250-(started-openedAt));
        const progress=Math.min(1,elapsed/remaining);
        drawFlowingStars(progress);
        if(progress<1)raf=requestAnimationFrame(tick);
      }
      resize();
      observer=new ResizeObserver(resize);observer.observe(cover);
      raf=requestAnimationFrame(tick);
    })
    .catch(function(){});
}

function openingMotion(){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return wait(1500);
  const source=cover.querySelector('img'),wrapper=cover.querySelector('.first-visit-logo');
  if(!source||!wrapper)return wait(1500);
  // One draw per opening: 5% fire, 20% bounce, 75% spin.
  const drawChance=Math.random();
  const variant=drawChance<0.05?'fire':drawChance<0.25?'bounce':'spin';
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
  function flames(ms,cx,cy,r,power) {
    if(power<=0)return;
    const t=ms/1000;
    ctx.save();ctx.globalCompositeOperation='screen';
    const glow=ctx.createRadialGradient(cx,cy,r*.6,cx,cy-r*.28,r*3.1);
    glow.addColorStop(0,'rgba(255,212,116,0)');
    glow.addColorStop(.4,'rgba(255,79,8,'+(.65*power)+')');
    glow.addColorStop(1,'rgba(255,120,12,0)');
    ctx.fillStyle=glow;ctx.fillRect(cx-r*3.1,cy-r*4.4,r*6.2,r*7.5);
    // A continuous skirt of flame behind the sphere, visible below its rim.
    const flicker=Math.sin(t*21)*.035+Math.sin(t*33)*.02;
    const skirt=ctx.createLinearGradient(cx,cy+r*.55,cx,cy+r*1.32);
    skirt.addColorStop(0,'rgba(255,247,191,'+power*.95+')');
    skirt.addColorStop(.55,'rgba(255,182,43,'+power*.9+')');
    skirt.addColorStop(1,'rgba(247,74,8,0)');
    ctx.fillStyle=skirt;ctx.beginPath();
    ctx.moveTo(cx-r*1.04,cy+r*.22);
    ctx.bezierCurveTo(cx-r*1.2,cy+r*.7,cx-r*.86,cy+r*(1.04+flicker),cx-r*.7,cy+r*1.16);
    ctx.quadraticCurveTo(cx-r*.49,cy+r*1.02,cx-r*.31,cy+r*(1.23+flicker));
    ctx.quadraticCurveTo(cx-r*.04,cy+r*1.12,cx+r*.16,cy+r*(1.26-flicker));
    ctx.quadraticCurveTo(cx+r*.42,cy+r*1.04,cx+r*.62,cy+r*1.15);
    ctx.bezierCurveTo(cx+r*.85,cy+r*.99,cx+r*1.21,cy+r*.65,cx+r*1.04,cy+r*.22);
    ctx.closePath();ctx.fill();
    // Broad, asymmetric tongues with curling necks and warm inner cores.
    const tongues=[[-1.05,.55,2.8,.45],[-.75,.15,3.8,.5],
      [-.24,-.25,4.25,.59],[.37,-.12,3.95,.56],[.86,.3,3.2,.46],
      [1.05,.7,2.5,.35],[-.5,.4,3.1,.42],[.22,.4,3.3,.46],
      [-.9,.92,1.7,.35],[.9,.9,1.8,.35]];
    tongues.forEach((flame,i)=>{
      const [offset,base,length,spread]=flame;
      const phase=t*16+i*2.37;
      const pulse=.86+.14*Math.sin(phase*1.6);
      const bx=cx+offset*r,by=cy+base*r;
      const len=r*length*pulse*power,w=r*spread;
      const bend=r*(.32*Math.sin(phase)+.12*Math.sin(phase*2.1));
      const tipX=bx+bend+r*.2*Math.sin(phase-1.5),tipY=by-len;
      function tongue(k,alpha){
        const height=len*k,tip=by-height,side=w*k;
        const grad=ctx.createLinearGradient(bx,by,tipX,tip);
        grad.addColorStop(0,'rgba(255,247,188,'+alpha*power+')');
        grad.addColorStop(.3,'rgba(255,185,51,'+alpha*power+')');
        grad.addColorStop(.65,'rgba(255,91,12,'+alpha*.86*power+')');
        grad.addColorStop(1,'rgba(231,42,5,'+alpha*.65*power+')');
        ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(bx-side,by);
        ctx.bezierCurveTo(bx-side*1.65,by-height*.27,bx+bend-side*.9,by-height*.44,bx+bend-side*.45,by-height*.58);
        ctx.bezierCurveTo(bx+bend+side*.45,by-height*.76,tipX+side*.8,tip+height*.14,tipX,tip);
        ctx.bezierCurveTo(tipX+side*1.6,tip+height*.16,bx+bend+side*.55,by-height*.48,bx+side*.68,by-height*.4);
        ctx.bezierCurveTo(bx+side*1.8,by-height*.2,bx+side*1.1,by-height*.08,bx+side,by);
        ctx.closePath();ctx.fill();
      }
      tongue(1,.78);tongue(.67,.6);
    });
    for(let i=0;i<65;i++){
      const life=(t*(.6+(i%4)*.11)+i*.173)%1;
      const x=cx+Math.sin(i*9.1)*r*1.3+Math.sin(t*4+i)*r*.2*life;
      const y=cy-r*.6-life*r*5.2;
      ctx.globalAlpha=power*Math.sin(life*Math.PI)*.85;
      ctx.fillStyle=i%3?'#e9af46':'#fff0b0';
      ctx.beginPath();ctx.ellipse(x,y,r*.015+(.3*(i%2)),r*.026, .25,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function drawFire(ms) {
    ctx.clearRect(0,0,width,height);
    if(!source.complete||!source.naturalWidth)return;
    const box=source.getBoundingClientRect(),frame=cover.getBoundingClientRect();
    const scale=box.width/2172,left=box.left-frame.left,top=box.top-frame.top;
    const timeline=Math.min(ms/1400,1)*4000;
    const sphereMix=ease((timeline-400)/320)*(1-ease((timeline-3120)/380));
    const p=ease((timeline-720)/2400);
    const angle=p*Math.PI*2;
    const fire=ease((ms-100)/130)*(1-ease((ms-1050)/300));
    flames(ms,left+226*scale,top+198.5*scale,198.5*scale,fire);
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
        const draw=variant==='fire'?drawFire:variant==='bounce'?drawBounce:drawSpin;
        draw(0);source.style.opacity='0';
        observer=new ResizeObserver(resize);observer.observe(cover);
        const timelineDuration=variant==='fire'?1400:variant==='bounce'?3100:4000;
        const duration=1400;
        function tick(now){
          if(finished||closed)return;
          try{const elapsed=now-openedAt;draw(Math.min(elapsed/duration,1)*timelineDuration);if(elapsed>=duration){finish();return;}raf=requestAnimationFrame(tick);}catch(_){finish();}
        }
        raf=requestAnimationFrame(tick);
      }catch(_){finish();}
    }
    if(source.complete)begin();else{source.addEventListener('load',begin,{once:true});source.addEventListener('error',finish,{once:true});}
  });
}
// Keep the existing motion; reveal the page only when its hero is ready.
function leave(){
  if(closed||leaving)return;
  leaving=true;clearTimeout(guardTimer);stopMotion();
  cover.classList.add('is-leaving');
  exitTimer=setTimeout(remove,300);
}
// Opening duration is fixed: do not block the transition on hero-image readiness.
// The hero continues preloading behind the opening screen.
guardTimer=setTimeout(leave,Math.max(0,1500-(performance.now()-openedAt)));
dutyRequestSignal();
openingMotion();
window.addEventListener('pagehide',remove,{once:true});
})();

