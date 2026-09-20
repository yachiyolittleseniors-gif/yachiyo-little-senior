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
      empty.textContent='ダウンロード';
      empty.setAttribute('role','link');
      empty.setAttribute('aria-disabled','true');
      empty.setAttribute('aria-label','ダウンロード（現在掲載中の資料はありません）');
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
      link.className='download-btn';link.textContent='ダウンロード';link.href='#';
      link.addEventListener('click',event=>{event.preventDefault();downloadDocument(item,link);});
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

  function dataUrlToBlob(dataUrl){
    const parts=String(dataUrl||'').split(',');
    if(parts.length<2)throw new Error('ファイルデータを取得できませんでした。');
    const mime=(parts[0].match(/^data:([^;,]+)/i)||[])[1]||'application/octet-stream';
    const binary=parts[0].includes(';base64')?atob(parts.slice(1).join(',')):decodeURIComponent(parts.slice(1).join(','));
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new Blob([bytes],{type:mime});
  }
  async function downloadDocument(item,button){
    if(button.dataset.busy==='1')return;
    const old=button.textContent;button.dataset.busy='1';button.textContent='準備中...';
    try{
      let blob;
      if(item&&item.dataUrl){
        blob=dataUrlToBlob(item.dataUrl);
      }else{
        const response=await fetch(API+'&file='+encodeURIComponent(item.id),{cache:'no-store'});
        if(!response.ok)throw new Error('資料を取得できませんでした。');
        blob=await response.blob();
      }
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download=item.fileName||item.tournament||'大会資料';
      a.style.display='none';document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(error){
      alert(error.message||'ダウンロードできませんでした。');
    }finally{
      button.dataset.busy='0';button.textContent=old;
    }
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
