(function(){
  'use strict';

  if('scrollRestoration' in history)history.scrollRestoration='manual';
  window.addEventListener('pageshow',function(){
    window.scrollTo(0,0);
    requestAnimationFrame(function(){window.scrollTo(0,0)});
    setTimeout(function(){window.scrollTo(0,0)},120);
  });

  var params=new URLSearchParams(location.search);
  var API='/.netlify/functions/site-data?section=seniorcup-documents';
  var status=document.getElementById('status');
  var detail=document.getElementById('detail');
  var pages=document.getElementById('pages');
  var panel=document.querySelector('.loading');
  var workerSource='';
  var imageObjectUrl='';
  var opened=false;

  function loadScript(source){
    return new Promise(function(resolve,reject){
      var script=document.createElement('script');
      var finished=false;
      var timer=setTimeout(function(){
        if(finished)return;
        finished=true;
        script.remove();
        reject(new Error('timeout'));
      },10000);
      script.src=source;
      script.async=true;
      script.onload=function(){
        if(finished)return;
        finished=true;
        clearTimeout(timer);
        resolve();
      };
      script.onerror=function(){
        if(finished)return;
        finished=true;
        clearTimeout(timer);
        script.remove();
        reject(new Error('load failed'));
      };
      document.head.appendChild(script);
    });
  }

  function loadPdfLibrary(){
    if(window.pdfjsLib)return Promise.resolve();
    return loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js')
      .then(function(){workerSource='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';})
      .catch(function(){
        return loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js')
          .then(function(){workerSource='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';});
      });
  }

  async function renderPdf(bytes){
    await loadPdfLibrary();
    if(!window.pdfjsLib)throw new Error('viewer unavailable');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc=workerSource;
    var pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(bytes)}).promise;
    for(var number=1;number<=pdf.numPages;number++){
      var page=await pdf.getPage(number);
      var base=page.getViewport({scale:1});
      var pixelRatio=Math.min(3,Math.max(1,window.devicePixelRatio||1));
      var targetWidth=Math.min(1900,Math.max(1400,Math.min(window.innerWidth,920)*pixelRatio));
      var viewport=page.getViewport({scale:targetWidth/base.width});
      var canvas=document.createElement('canvas');
      canvas.className='page';
      canvas.width=Math.ceil(viewport.width);
      canvas.height=Math.ceil(viewport.height);
      canvas.setAttribute('aria-label','大会資料 '+number+'ページ目');
      pages.appendChild(canvas);
      await page.render({canvasContext:canvas.getContext('2d'),viewport:viewport}).promise;
    }
  }

  async function renderImage(blob){
    var image=document.createElement('img');
    image.className='page';
    image.alt='八千代リトルシニア杯 大会資料';
    imageObjectUrl=URL.createObjectURL(blob);
    await new Promise(function(resolve,reject){
      image.onload=resolve;
      image.onerror=reject;
      image.src=imageObjectUrl;
    });
    pages.appendChild(image);
  }

  function showError(message){
    panel.classList.add('error-state');
    status.textContent=message;
    status.classList.add('error');
    detail.textContent='一覧へ戻り、ページを再読み込みしてから再度お試しください。';
  }

  async function openDocument(){
    if(opened)return;
    opened=true;
    var id=params.get('id')||'';
    if(!id){showError('資料が指定されていません。');return;}
    try{
      var response=await fetch(API+'&file='+encodeURIComponent(id)+'&v='+encodeURIComponent(params.get('v')||Date.now()),{cache:'no-store',credentials:'same-origin'});
      if(!response.ok)throw new Error('fetch failed: '+response.status);
      var headerType=String(response.headers.get('content-type')||'').toLowerCase();
      var hintType=String(params.get('type')||'').toLowerCase();
      var contentType=headerType||hintType;
      if(contentType.indexOf('image/')===0){
        var blob=await response.blob();
        if(!blob.size)throw new Error('empty image');
        await renderImage(blob);
      }else{
        var bytes=await response.arrayBuffer();
        if(!bytes.byteLength)throw new Error('empty pdf');
        await renderPdf(bytes);
      }
      panel.classList.add('ready');
    }catch(error){
      showError('資料を開けませんでした。');
    }
  }

  window.addEventListener('pagehide',function(){
    if(imageObjectUrl){
      try{URL.revokeObjectURL(imageObjectUrl);}catch(_){}
      imageObjectUrl='';
    }
  },{once:true});

  openDocument();
})();
