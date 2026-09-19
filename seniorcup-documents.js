(function(){
  'use strict';
  const API='/.netlify/functions/site-data?section=seniorcup-documents';
  const list=document.getElementById('cupDocumentsList');
  const adminList=document.getElementById('cupDocumentAdminList');
  const title=document.getElementById('cupDocumentTitle');
  const input=document.getElementById('cupDocumentUpload');
  const save=document.getElementById('cupDocumentSave');
  let documents=[],busy=false;
  function render(){
    list.replaceChildren();adminList.replaceChildren();
    if(!documents.length){
      const notice=document.createElement('p');
      notice.textContent='現在掲載中の資料はありません。';
      notice.style.cssText='margin:0 0 12px;color:#697481;font-size:13px;line-height:1.65';
      const empty=document.createElement('span');
      empty.className='download-btn';
      empty.textContent='資料を開く';
      empty.setAttribute('role','link');
      empty.setAttribute('aria-disabled','true');
      empty.setAttribute('aria-label','資料を開く（現在掲載中の資料はありません）');
      empty.title='現在掲載中の資料はありません。';
      empty.style.cursor='not-allowed';
      list.append(notice,empty);
    }
    documents.forEach((item,index)=>{
      const row=document.createElement('div');
      row.style.cssText='overflow-wrap:anywhere'+(index?';margin-top:14px;padding-top:14px;border-top:1px solid #e5e1d8':'');
      const name=document.createElement('p');
      name.className='file-name';
      name.style.cssText='min-height:0;margin:0 0 15px';
      name.textContent=item.tournament||item.fileName;
      const link=document.createElement('a');
      link.className='download-btn';link.textContent='資料を開く';
      link.href='#';link.addEventListener('click',event=>{event.preventDefault();openDocument(item);});
      row.append(name,link);list.append(row);
      const adminRow=document.createElement('div');
      adminRow.style.cssText='padding-top:12px;overflow-wrap:anywhere';
      const label=document.createElement('span');label.textContent=(item.tournament||item.fileName)+'　';
      const remove=document.createElement('button');remove.type='button';remove.className='attachment-delete';remove.textContent='添付ファイルを削除';remove.disabled=busy;
      remove.addEventListener('click',()=>removeDocument(item));
      adminRow.append(label,remove);adminList.append(adminRow);
    });
    save.disabled=busy;save.textContent=busy?'処理中...':'大会資料を保存';
  }

  function openDocument(item){
    const dataUrl=String(item&&item.dataUrl||'');
    if(dataUrl){
      const w=window.open('','_blank');
      if(w){
        w.document.write('<!doctype html><title>資料</title><style>html,body{margin:0;height:100%;background:#111}iframe,img{display:block;width:100%;height:100%;border:0;object-fit:contain}</style>');
        if(/^data:image\//i.test(dataUrl)) w.document.write('<img src="'+dataUrl.replace(/"/g,'&quot;')+'" alt="資料">');
        else w.document.write('<iframe src="'+dataUrl.replace(/"/g,'&quot;')+'"></iframe>');
        w.document.close();
      }else location.href=dataUrl;
      return;
    }
    window.open(API+'&file='+encodeURIComponent(item.id),'_blank','noopener');
  }

  async function request(body){
    const password=sessionStorage.getItem('yachiyoAdminPassword')||'';
    if(!password)throw new Error('管理画面を開き直してください。');
    const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-admin-password':password},body:JSON.stringify(body)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(response.status===401?'管理者パスワードを確認してください。':response.status===429?'試行回数の上限です。しばらく待ってからお試しください。':result.error||'資料を保存できませんでした。');
    documents=Array.isArray(result.data)?result.data:documents;
  }
  function dataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('ファイルを読み込めませんでした。'));reader.readAsDataURL(file);});}
  save.addEventListener('click',async()=>{
    if(busy)return;
    const file=input.files&&input.files[0];
    if(!file||! /\.(pdf|jpe?g|png|webp)$/i.test(file.name)){alert('PDF・JPEG・PNG・WebPを選択してください。');return;}
    if(file.size>4*1024*1024){alert('ファイルは4MB以下にしてください。');return;}
    busy=true;render();
    try{
      await request({action:'uploadResultDocument',tournament:title.value.trim()||file.name,fileName:file.name,dataUrl:await dataUrl(file)});
      title.value='';input.value='';
      if(typeof showSaveNotice==='function')showSaveNotice('大会資料を保存しました');
    }catch(error){alert(error.message);}finally{busy=false;render();}
  });
  async function removeDocument(item){
    if(busy||!confirm('「'+(item.tournament||item.fileName)+'」を削除しますか？'))return;
    busy=true;render();
    try{await request({action:'deleteResultDocument',id:item.id});}
    catch(error){alert(error.message);}finally{busy=false;render();}
  }
  fetch(API,{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error();return response.json();}).then(result=>{documents=Array.isArray(result.data)?result.data:[];render();}).catch(()=>{list.textContent='資料を読み込めませんでした。ページを再読み込みしてください。';});
})();
