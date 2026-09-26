(function(){
  const API='/.netlify/functions/site-data?section=referee-documents';
  const COACH_AUTH_API='/.netlify/functions/coach-attendance-data';
  const documentList=document.getElementById('refereeDocumentList');
  const adminOpen=document.getElementById('refereeAdminOpen');
  const adminPanel=document.getElementById('refereeAdminPanel');
  const adminDocumentList=document.getElementById('refereeAdminDocumentList');
  const fileInput=document.getElementById('refereeFileInput');
  const fileSave=document.getElementById('refereeFileSave');
  const fileCancel=document.getElementById('refereeFileCancel');
  let documents=[];
  let documentCoachPassword='';

  if(!documentList||!adminOpen||!adminPanel||!adminDocumentList||!fileInput||!fileSave||!fileCancel)return;

  function accessHeaders(json,coachPassword){
    const headers={'x-access-password':sessionStorage.getItem('yachiyoAttendancePass')||''};
    if(coachPassword)headers['x-coach-password']=coachPassword;
    if(json)headers['content-type']='application/json';
    return headers;
  }

  async function requireCoachPassword(){
    if(window.YLSOperatorPasskeys?.authorize){
      return window.YLSOperatorPasskeys.authorize('パスワードを入力してください。');
    }
    const entered=prompt('パスワードを入力してください。');
    if(entered===null)return '';
    try{
      const response=await fetch(COACH_AUTH_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'verifyCoachPassword',password:entered})});
      if(response.ok)return entered;
    }catch(e){}
    alert('パスワードが違います。');
    return '';
  }

  function formatSize(bytes){
    const value=Number(bytes||0);
    return value>=1024*1024?(value/1024/1024).toFixed(1)+'MB':Math.max(1,Math.round(value/1024))+'KB';
  }

  function render(){
    documentList.replaceChildren();
    const button=document.createElement('button');
    button.className='meeting-document-library-link';
    button.type='button';
    button.setAttribute('data-open-referee-documents','');
    button.textContent='保存済み資料を見る（'+documents.length+'件）';
    documentList.appendChild(button);

    adminDocumentList.replaceChildren();
    if(!documents.length){
      const empty=document.createElement('div');
      empty.className='meeting-empty';
      empty.textContent='削除できる資料はありません。';
      adminDocumentList.appendChild(empty);
      return;
    }
    documents.forEach(function(item){
      const row=document.createElement('div');
      row.className='meeting-admin-document-row';
      const name=document.createElement('div');
      name.className='meeting-admin-document-name';
      name.textContent=(item.fileName||'審判部資料')+'（'+formatSize(item.size)+'）';
      const actions=document.createElement('div');
      actions.className='meeting-admin-document-actions';
      const rename=document.createElement('button');
      rename.type='button';
      rename.className='meeting-admin-document-rename';
      rename.textContent='名前変更';
      rename.addEventListener('click',function(){startRenameDocument(item,row,name,actions)});
      const remove=document.createElement('button');
      remove.type='button';
      remove.className='meeting-admin-document-delete';
      remove.textContent='削除';
      remove.addEventListener('click',function(){deleteDocument(item)});
      actions.append(rename,remove);
      row.append(name,actions);
      adminDocumentList.appendChild(row);
    });
  }

  function readAsDataUrl(file){
    return new Promise(function(resolve,reject){
      const reader=new FileReader();
      reader.onload=function(){resolve(String(reader.result||''))};
      reader.onerror=reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadWithTimeout(url,options){
    const controller=new AbortController();
    const timer=setTimeout(function(){controller.abort()},60000);
    try{
      return await fetch(url,Object.assign({},options,{signal:controller.signal}));
    }catch(error){
      if(error&&error.name==='AbortError')throw new Error('保存に時間がかかりすぎたため中止しました。通信状況を確認して、もう一度お試しください。');
      throw error;
    }finally{clearTimeout(timer)}
  }

  async function uploadFileInChunks(url,file,password,action,button){
    const chunkSize=1024*1024;
    const total=Math.ceil(file.size/chunkSize);
    const uploadId=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9_-]/g,'');
    let result={};
    for(let index=0;index<total;index+=1){
      button.textContent='保存中...（'+(index+1)+'/'+total+'）';
      const response=await uploadWithTimeout(url,{
        method:'POST',
        headers:Object.assign(accessHeaders(false,password),{
          'content-type':file.type||'application/octet-stream',
          'x-upload-action':action+'Chunk',
          'x-upload-id':uploadId,
          'x-upload-index':String(index),
          'x-upload-total':String(total),
          'x-file-name':encodeURIComponent(file.name)
        }),
        body:file.slice(index*chunkSize,Math.min(file.size,(index+1)*chunkSize),file.type)
      });
      result=await response.json().catch(function(){return {}});
      if(!response.ok)throw new Error(result.error||('資料を保存できませんでした。（通信エラー '+response.status+'）'));
    }
    return result;
  }

  async function load(){
    try{
      await window.boardAccessReady;
      const response=await fetch(API,{cache:'no-store',headers:accessHeaders(false)});
      if(!response.ok)throw new Error();
      const body=await response.json();
      documents=Array.isArray(body.data)?body.data:[];
      render();
    }catch(e){render()}
  }

  adminOpen.addEventListener('click',async function(){
    const password=await requireCoachPassword();
    if(!password)return;
    documentCoachPassword=password;
    adminOpen.hidden=true;
    adminPanel.hidden=false;
    render();
  });

  fileCancel.addEventListener('click',function(){
    fileInput.value='';
    documentCoachPassword='';
    adminPanel.hidden=true;
    adminOpen.hidden=false;
  });

  documentList.addEventListener('click',function(event){
    if(!event.target.closest('[data-open-referee-documents]'))return;
    event.preventDefault();
    window.location.assign('/secretariat-documents.html?department=referee&v=20260912-3');
  });

  fileSave.addEventListener('click',async function(){
    const file=fileInput.files&&fileInput.files[0];
    const allowedType=/^(application\/pdf|image\/(jpeg|png|webp))$/i.test(file&&file.type||'');
    const allowedName=/\.(pdf|jpe?g|png|webp)$/i.test(file&&file.name||'');
    if(!file||!allowedType||!allowedName){alert('PDF・JPEG・PNG・WebPファイルを選択してください。');return}
    if(file.size>6*1024*1024){alert('ファイルは6MB以下にしてください。');return}
    const password=documentCoachPassword||await requireCoachPassword();
    if(!password)return;
    documentCoachPassword=password;
    fileSave.disabled=true;
    fileSave.textContent='保存中...';
    try{
      const body=await uploadFileInChunks(API,file,password,'uploadRefereeDocument',fileSave);
      documents=Array.isArray(body.data)?body.data:documents;
      fileInput.value='';
      render();
      showSaveNotice('審判部からのお知らせを保存しました');
      window.refreshBoardLatestUpdate?.();
    }catch(e){alert(e.message||'資料を保存できませんでした。')}
    finally{fileSave.disabled=false;fileSave.textContent='選択した資料を保存'}
  });

  async function deleteDocument(item){
    if(!confirm('「'+(item.fileName||'審判部資料')+'」を削除しますか？'))return;
    const password=documentCoachPassword||await requireCoachPassword();
    if(!password)return;
    documentCoachPassword=password;
    try{
      const response=await fetch(API,{method:'POST',headers:accessHeaders(true,password),body:JSON.stringify({action:'deleteRefereeDocument',id:item.id})});
      const body=await response.json().catch(function(){return {}});
      if(!response.ok)throw new Error(body.error||'資料を削除できませんでした。');
      documents=Array.isArray(body.data)?body.data:documents.filter(function(entry){return entry.id!==item.id});
      render();
      showSaveNotice('資料を削除しました');
    }catch(e){alert(e.message||'資料を削除できませんでした。')}
  }

  function startRenameDocument(item,row,name,actions){
    const currentName=String(item.fileName||'審判部資料.pdf');
    const extension=(currentName.match(/\.(?:pdf|jpe?g|png|webp)$/i)||[])[0]||({"application/pdf":'.pdf',"image/jpeg":'.jpg',"image/png":'.png',"image/webp":'.webp'}[item.contentType]||'');
    const baseName=extension?currentName.slice(0,-extension.length):currentName;
    row.classList.add('is-renaming');
    const input=document.createElement('input');
    input.className='meeting-admin-document-name-input';
    input.type='text';
    input.maxLength=150;
    input.value=baseName;
    input.setAttribute('aria-label','新しいファイル名');
    const suffix=document.createElement('span');
    suffix.className='meeting-admin-document-extension';
    suffix.textContent=extension;
    name.replaceChildren(input,suffix);
    const save=document.createElement('button');
    save.type='button';
    save.className='meeting-admin-document-save';
    save.textContent='保存';
    const cancel=document.createElement('button');
    cancel.type='button';
    cancel.className='meeting-admin-document-cancel';
    cancel.textContent='キャンセル';
    actions.replaceChildren(save,cancel);
    const submit=async function(){
      save.disabled=true;
      if(!await renameDocument(item,input.value))save.disabled=false;
    };
    save.addEventListener('click',submit);
    cancel.addEventListener('click',render);
    input.addEventListener('keydown',function(event){
      if(event.key==='Enter'){event.preventDefault();submit()}
      if(event.key==='Escape'){event.preventDefault();render()}
    });
    input.focus();input.select();
  }

  async function renameDocument(item,entered){
    const currentName=String(item.fileName||'審判部資料.pdf');
    const extension=(currentName.match(/\.(?:pdf|jpe?g|png|webp)$/i)||[])[0]||({"application/pdf":'.pdf',"image/jpeg":'.jpg',"image/png":'.png',"image/webp":'.webp'}[item.contentType]||'');
    const nextBase=entered.trim().replace(/\.(?:pdf|jpe?g|png|webp)$/i,'').trim();
    if(!nextBase){alert('ファイル名を入力してください。');return false}
    const fileName=nextBase+extension;
    if(fileName===currentName){render();return true}
    const password=documentCoachPassword||await requireCoachPassword();
    if(!password)return false;
    documentCoachPassword=password;
    try{
      const response=await fetch(API,{method:'POST',headers:accessHeaders(true,password),body:JSON.stringify({action:'renameRefereeDocument',id:item.id,fileName:fileName})});
      const body=await response.json().catch(function(){return {}});
      if(!response.ok)throw new Error(body.error||'ファイル名を変更できませんでした。');
      documents=Array.isArray(body.data)?body.data:documents.map(function(entry){return entry.id===item.id?Object.assign({},entry,{fileName:fileName}):entry});
      render();
      showSaveNotice('ファイル名を変更しました');
      window.refreshBoardLatestUpdate?.();
      return true;
    }catch(e){alert(e.message||'ファイル名を変更できませんでした。');return false}
  }

  load();
})();
