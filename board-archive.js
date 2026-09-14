(function(){
  const API='/.netlify/functions/site-data?section=document-archive';
  const panel=document.getElementById('densukeAdminPanel');
  const fields=document.getElementById('documentArchiveAdminFields');
  const input=document.getElementById('documentArchiveInput');
  const saveBtn=document.getElementById('saveDocumentArchiveBtn');
  const list=document.getElementById('documentArchiveList');
  let documents=[];
  let loadedForPassword='';
  let previewUrl='';
  let previewHistoryActive=false;

  if(!panel||!fields||!input||!saveBtn||!list)return;

  function password(){return panel.dataset.adminPassword||''}
  function headers(json){
    const result={'x-admin-password':password()};
    if(json)result['content-type']='application/json';
    return result;
  }
  function formatSize(bytes){
    const value=Number(bytes||0);
    return value>=1024*1024?(value/1024/1024).toFixed(1)+'MB':Math.max(1,Math.round(value/1024))+'KB';
  }
  function formatDate(value){
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return '';
    return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric'}).format(date);
  }
  function readAsDataUrl(file){
    return new Promise(function(resolve,reject){
      const reader=new FileReader();
      reader.onload=function(){resolve(String(reader.result||''))};
      reader.onerror=reject;
      reader.readAsDataURL(file);
    });
  }

  function render(){
    list.replaceChildren();
    if(!documents.length){
      const empty=document.createElement('div');
      empty.className='document-archive-empty';
      empty.textContent='格納庫は空です。';
      list.appendChild(empty);
      return;
    }
    documents.forEach(function(item){
      const row=document.createElement('div');
      row.className='document-archive-item';
      const name=document.createElement('div');
      name.className='document-archive-name';
      name.textContent=item.fileName||'保管資料';
      const meta=document.createElement('span');
      meta.className='document-archive-meta';
      meta.textContent=[formatSize(item.size),formatDate(item.uploadedAt)].filter(Boolean).join('・');
      name.appendChild(meta);
      const actions=document.createElement('div');
      actions.className='document-archive-actions';
      const open=document.createElement('button');
      open.type='button';open.textContent='開く';
      open.addEventListener('click',function(){openDocument(item,open)});
      const download=document.createElement('button');
      download.type='button';download.textContent='ダウンロード';
      download.addEventListener('click',function(){downloadDocument(item,download)});
      const rename=document.createElement('button');
      rename.type='button';rename.textContent='名前変更';
      rename.addEventListener('click',function(){renameDocument(item)});
      const remove=document.createElement('button');
      remove.type='button';remove.className='document-archive-delete';remove.textContent='削除';
      remove.addEventListener('click',function(){deleteDocument(item)});
      actions.append(open,download,rename,remove);row.append(name,actions);list.appendChild(row);
    });
  }

  async function load(){
    const adminPassword=password();
    if(!adminPassword||loadedForPassword===adminPassword)return;
    loadedForPassword=adminPassword;
    list.textContent='読み込み中...';
    try{
      const response=await fetch(API,{cache:'no-store',headers:headers(false)});
      const body=await response.json().catch(function(){return {}});
      if(!response.ok)throw new Error(body.error||'格納庫を読み込めませんでした。');
      documents=Array.isArray(body.data)?body.data:[];
      render();
    }catch(e){
      loadedForPassword='';
      list.textContent=e.message||'格納庫を読み込めませんでした。';
    }
  }

  function ensurePreview(){
    let preview=document.getElementById('documentArchivePreview');
    if(preview)return preview;
    preview=document.createElement('div');
    preview.id='documentArchivePreview';
    preview.hidden=true;
    preview.innerHTML='<div class="document-archive-preview-bar"><strong id="documentArchivePreviewName">資料</strong><button id="documentArchivePreviewClose" type="button">閉じる</button></div><div id="documentArchivePreviewBody" class="document-archive-preview-body"></div>';
    document.body.appendChild(preview);
    preview.querySelector('#documentArchivePreviewClose').addEventListener('click',function(){
      if(previewHistoryActive)history.back();
      else closePreview();
    });
    return preview;
  }

  function closePreview(){
    const preview=document.getElementById('documentArchivePreview');
    if(preview){preview.hidden=true;preview.querySelector('#documentArchivePreviewBody').replaceChildren()}
    document.body.classList.remove('document-archive-preview-open');
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=''}
    previewHistoryActive=false;
  }

  async function fetchDocument(item){
    const response=await fetch(API+'&file='+encodeURIComponent(item.id),{cache:'no-store',headers:headers(false)});
    if(!response.ok)throw new Error('資料を開けませんでした。');
    return response.blob();
  }

  async function openDocument(item,button){
    button.disabled=true;button.textContent='準備中...';
    try{
      const blob=await fetchDocument(item);
      const preview=ensurePreview();
      const previewBody=preview.querySelector('#documentArchivePreviewBody');
      preview.querySelector('#documentArchivePreviewName').textContent=item.fileName||'資料';
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      previewUrl=URL.createObjectURL(blob);
      if(String(item.contentType||blob.type).startsWith('image/')){
        const image=document.createElement('img');
        image.src=previewUrl;image.alt=item.fileName||'保管画像';
        previewBody.appendChild(image);
      }else{
        const frame=document.createElement('iframe');
        frame.src=previewUrl;frame.title=item.fileName||'保管資料';
        previewBody.appendChild(frame);
      }
      preview.hidden=false;
      document.body.classList.add('document-archive-preview-open');
      if(!previewHistoryActive){history.pushState({documentArchivePreview:true},'',location.href);previewHistoryActive=true}
    }catch(e){alert(e.message||'資料を開けませんでした。')}
    finally{button.disabled=false;button.textContent='開く'}
  }

  async function downloadDocument(item,button){
    button.disabled=true;button.textContent='準備中...';
    try{
      const blob=await fetchDocument(item);
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;link.download=item.fileName||'資料';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(function(){URL.revokeObjectURL(url)},60000);
    }catch(e){alert(e.message||'資料をダウンロードできませんでした。')}
    finally{button.disabled=false;button.textContent='ダウンロード'}
  }

  async function renameDocument(item){
    const currentName=item.fileName||'保管資料';
    const entered=prompt('新しいファイル名を入力してください。',currentName);
    if(entered===null)return;
    const fileName=entered.trim();
    if(!fileName){alert('ファイル名を入力してください。');return}
    if(fileName===currentName)return;
    try{
      const response=await fetch(API,{method:'POST',headers:headers(true),body:JSON.stringify({action:'renameArchiveDocument',id:item.id,fileName:fileName})});
      const body=await response.json().catch(function(){return {}});
      if(!response.ok)throw new Error(body.error||'ファイル名を変更できませんでした。');
      documents=Array.isArray(body.data)?body.data:documents.map(function(entry){return entry.id===item.id?Object.assign({},entry,{fileName:fileName}):entry});
      render();showSaveNotice('ファイル名を変更しました');
    }catch(e){alert(e.message||'ファイル名を変更できませんでした。')}
  }

  saveBtn.addEventListener('click',async function(){
    const files=Array.from(input.files||[]);
    if(!password()){alert('管理画面を開き直してください。');return}
    if(!files.length){alert('保存する資料を選択してください。');return}
    if(documents.length+files.length>12){alert('格納庫に保存できる資料は12件までです。');return}
    for(const file of files){
      const allowedType=/^(application\/pdf|image\/(jpeg|png|webp))$/i.test(file.type||'');
      const allowedName=/\.(pdf|jpe?g|png|webp)$/i.test(file.name||'');
      if(!allowedType||!allowedName){alert('PDF・JPEG・PNG・WebPファイルを選択してください。');return}
      if(file.size>6*1024*1024){alert(file.name+' は6MBを超えています。');return}
    }
    saveBtn.disabled=true;saveBtn.textContent='保存中...';
    try{
      for(const file of files){
        const response=await fetch(API,{method:'POST',headers:headers(true),body:JSON.stringify({action:'uploadArchiveDocument',fileName:file.name,dataUrl:await readAsDataUrl(file)})});
        const body=await response.json().catch(function(){return {}});
        if(!response.ok)throw new Error(body.error||'資料を保存できませんでした。');
        documents=Array.isArray(body.data)?body.data:documents;
      }
      input.value='';render();showSaveNotice('格納庫に資料を保存しました');
    }catch(e){alert(e.message||'資料を保存できませんでした。');loadedForPassword='';await load()}
    finally{saveBtn.disabled=false;saveBtn.textContent='格納庫に保存'}
  });

  async function deleteDocument(item){
    if(!confirm('「'+(item.fileName||'保管資料')+'」を格納庫から削除しますか？'))return;
    try{
      const response=await fetch(API,{method:'POST',headers:headers(true),body:JSON.stringify({action:'deleteArchiveDocument',id:item.id})});
      const body=await response.json().catch(function(){return {}});
      if(!response.ok)throw new Error(body.error||'資料を削除できませんでした。');
      documents=Array.isArray(body.data)?body.data:documents.filter(function(entry){return entry.id!==item.id});
      render();showSaveNotice('格納庫から資料を削除しました');
    }catch(e){alert(e.message||'資料を削除できませんでした。')}
  }

  new MutationObserver(function(){
    if(panel.classList.contains('show'))load();
    else loadedForPassword='';
  }).observe(panel,{attributes:true,attributeFilter:['class']});
  window.addEventListener('popstate',function(){if(previewHistoryActive)closePreview()});
})();
