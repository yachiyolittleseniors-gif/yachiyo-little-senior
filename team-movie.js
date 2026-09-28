
(function(){
  var API='/.netlify/functions/site-data?section=team-movie';
  var UPLOAD='/.netlify/functions/team-movie-upload';
  var CHUNK_SIZE=1024*1024;
  var defaults={title:'雨天時の室内練習',description:'雨の日は室内練習場を利用して練習を行っています。選手たちの練習風景をご覧ください。',visible:false,showControls:false,storageKey:''};
  var data=Object.assign({},defaults),objectUrl='';
  function el(id){return document.getElementById(id)}
  var card=el('teamMovieCard'),video=el('teamMovieVideo'),status=el('teamMovieStatus'),save=el('teamMovieSave'),del=el('teamMovieDelete');
  if(!card||!video||!status||!save||!del)return;
  function setVideoBlob(blob){
    if(objectUrl)URL.revokeObjectURL(objectUrl);
    objectUrl=URL.createObjectURL(blob);
    video.src=objectUrl;video.hidden=false;video.controls=!!data.showControls;video.loop=!data.showControls;video.muted=!data.showControls;video.autoplay=!data.showControls;video.playsInline=true;
    if(!data.showControls)video.play().catch(function(){});
  }
  async function loadChunkedVideo(){
    if(!Number.isInteger(data.chunkCount)||data.chunkCount<1)return false;
    try{
      var parts=[];
      for(var i=0;i<data.chunkCount;i++){
        var r=await fetch(UPLOAD+'?chunk='+i,{cache:'no-store'});
        if(!r.ok)throw new Error('動画の読み込みに失敗しました。');
        parts.push(await r.blob());
      }
      setVideoBlob(new Blob(parts,{type:data.contentType||'video/mp4'}));
      return true;
    }catch(e){video.hidden=true;return false}
  }
  async function draw(){
    var title=data.title||defaults.title,desc=data.description||defaults.description;
    el('teamMovieTitle').textContent=title;el('teamMovieDescription').textContent=desc;
    card.classList.toggle('interview-hidden',data.visible===false);
    status.textContent=data.visible===false?'現在は非表示です':'現在は表示中です';
    if(data.storageKey){
      if(data.storageKey==='chunks'&&data.chunkCount){video.hidden=true;await loadChunkedVideo()}
      else{video.src=API+'&file=1&v='+encodeURIComponent(data.updatedAt||'');video.hidden=false;video.controls=!!data.showControls;video.loop=!data.showControls;video.muted=!data.showControls;video.autoplay=!data.showControls;video.playsInline=true;if(!data.showControls)video.play().catch(function(){})}
    }else{video.pause();video.removeAttribute('src');video.load();video.hidden=true}
  }
  function fill(){el('teamMovieTitleEdit').value=data.title||defaults.title;el('teamMovieDescriptionEdit').value=data.description||defaults.description;el('teamMovieVisibleEdit').checked=data.visible!==false;el('teamMovieControlsEdit').checked=!!data.showControls;var saved=el('teamMovieSavedFile');if(saved)saved.textContent=data.fileName?'保存済み動画：'+data.fileName:'保存済み動画：なし'}
  function adminPassword(){return sessionStorage.getItem('yachiyoAdminPassword')||''}
  async function load(){try{var r=await fetch(API,{cache:'no-store'});if(r.ok){var j=await r.json();if(j.data&&typeof j.data==='object')data=Object.assign({},defaults,j.data)}}catch(e){}await draw();fill()}
  async function saveTeamMovie(e){
    if(e){e.preventDefault();e.stopPropagation()}
    var p=adminPassword();if(!p){alert('管理者認証をやり直してください。');return}
    save.disabled=true;save.textContent='保存中…';status.textContent='保存処理を開始しています…';
    try{
      var base={title:el('teamMovieTitleEdit').value.trim(),description:el('teamMovieDescriptionEdit').value.trim(),visible:el('teamMovieVisibleEdit').checked,showControls:el('teamMovieControlsEdit').checked};
      var file=el('teamMovieFileEdit').files&&el('teamMovieFileEdit').files[0];
      var selectedName=file?file.name:'';
      var savedLabel=el('teamMovieSavedFile');
      if(file){if(savedLabel)savedLabel.textContent='アップロード中：'+selectedName;
        if(file.size>50*1024*1024)throw new Error('動画は50MB以下にしてください。');
        var count=Math.ceil(file.size/CHUNK_SIZE);
        for(var i=0;i<count;i++){
          status.textContent='動画をアップロードしています… '+(i+1)+' / '+count;
          var chunk=file.slice(i*CHUNK_SIZE,Math.min(file.size,(i+1)*CHUNK_SIZE));
          var controller=new AbortController();var timer=setTimeout(function(){controller.abort()},30000);var up;try{up=await fetch(UPLOAD,{method:'POST',headers:{'content-type':'application/octet-stream','x-video-type':file.type||'video/quicktime','x-file-name':encodeURIComponent(file.name),'x-admin-password':p,'x-chunk-index':String(i),'x-chunk-count':String(count),'x-total-size':String(file.size)},body:chunk,signal:controller.signal})}finally{clearTimeout(timer)};
          var ut=await up.text(),uj={};try{uj=ut?JSON.parse(ut):{}}catch(_){}
          if(!up.ok)throw new Error(uj.error||ut||('HTTP '+up.status));
          if(i===count-1)data=Object.assign({},data,uj.data||{},base);
        }
      }
      status.textContent='設定を保存しています…';
      var r=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-admin-password':p},body:JSON.stringify({data:Object.assign({},data,base)})});
      var j=await r.json().catch(function(){return {}});
      if(!r.ok)throw new Error(j.error||('HTTP '+r.status));
      data=Object.assign({},data,base,j.data||{});await draw();fill();status.textContent='保存しました';if(typeof showSaveNotice==='function')showSaveNotice('保存しました');
    }catch(err){fill();var msg=err&&err.name==='AbortError'?'アップロードがタイムアウトしました。もう一度お試しください。':(err.message||'通信エラー');status.textContent='保存エラー：'+msg;alert('TEAM MOVIEを保存できませんでした：'+msg)}
    finally{save.disabled=false;save.textContent='保存'}
  }
  save.onclick=saveTeamMovie;
  save.addEventListener('touchend',function(e){
    e.preventDefault();
    if(!save.disabled)saveTeamMovie(e);
  },{passive:false});
  del.addEventListener('click',async function(e){
    e.preventDefault();e.stopPropagation();if(!data.storageKey){alert('削除する動画はありません。');return}if(!confirm('登録中の動画を削除しますか？'))return;
    var p=adminPassword();if(!p){alert('管理者認証をやり直してください。');return}
    try{var r=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-admin-password':p},body:JSON.stringify({action:'deleteTeamMovie'})});var j=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(j.error||('HTTP '+r.status));data=Object.assign({},data,j.data||{});await draw();fill();status.textContent='動画を削除しました'}catch(err){status.textContent='削除エラー：'+(err.message||'通信エラー');alert('動画を削除できませんでした：'+(err.message||'通信エラー'))}
  });
  load();
})();
