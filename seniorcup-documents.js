(function(){
  'use strict';
  const API='/.netlify/functions/site-data?section=seniorcup-documents';
  const list=document.getElementById('cupDocumentsList');
  const adminList=document.getElementById('cupDocumentAdminList');
  const title=document.getElementById('cupDocumentTitle');
  const input=document.getElementById('cupDocumentUpload');
  const save=document.getElementById('cupDocumentSave');
  let documents=[],busy=false;
  function ensurePicker(){
    let modal=document.getElementById('cupDocumentPicker');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='cupDocumentPicker';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-labelledby','cupDocumentPickerTitle');
    modal.style.cssText='display:none;position:fixed;inset:0;z-index:30000;background:rgba(7,20,38,.58);padding:20px;align-items:center;justify-content:center';
    modal.innerHTML='<div style="width:min(520px,100%);max-height:78dvh;overflow:auto;background:#fff;border-radius:14px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.32)"><h3 id="cupDocumentPickerTitle" style="margin:0 0 8px;color:#071426;font-family:serif;font-size:22px">ダウンロードする資料を選択</h3><p style="margin:0 0 16px;color:#697481;font-size:13px">保存したい資料をタップしてください。</p><div id="cupDocumentPickerList"></div><button type="button" id="cupDocumentPickerClose" style="width:100%;min-height:48px;margin-top:16px;border:1px solid #cfd3d8;background:#fff;color:#071426;border-radius:8px;font-weight:800">キャンセル</button></div>';
    document.body.appendChild(modal);
    const close=()=>{modal.style.display='none';document.body.style.overflow='';};
    modal.querySelector('#cupDocumentPickerClose').addEventListener('click',close);
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
    return modal;
  }
  function openPicker(){
    if(!documents.length)return;
    const modal=ensurePicker();
    const pickerList=modal.querySelector('#cupDocumentPickerList');
    pickerList.replaceChildren();
    documents.forEach((item,index)=>{
      const a=document.createElement('a');
      a.href=API+'&file='+encodeURIComponent(String(item.id||''))+'&download=1&v='+encodeURIComponent(String(item.uploadedAt||Date.now()));
      a.setAttribute('download',item.fileName||'document');
      a.style.cssText='display:block;padding:14px 12px;border:1px solid #ddd9cf;border-radius:9px;background:#fff;color:#071426;text-decoration:none;font-weight:800;overflow-wrap:anywhere'+(index?';margin-top:10px':'');
      const label=document.createElement('span');label.textContent=item.tournament||item.fileName||'資料';
      a.appendChild(label);
      if(item.tournament&&item.fileName&&item.tournament!==item.fileName){
        const actual=document.createElement('small');actual.style.cssText='display:block;margin-top:5px;color:#697481;font-size:11px;font-weight:500';actual.textContent='元ファイル：'+item.fileName;a.appendChild(actual);
      }
      a.addEventListener('click',()=>{setTimeout(()=>{modal.style.display='none';document.body.style.overflow='';},120);});
      pickerList.appendChild(a);
    });
    modal.style.display='flex';document.body.style.overflow='hidden';
  }
  function render(){
    list.replaceChildren();adminList.replaceChildren();
    const summary=document.createElement('p');
    summary.className='file-name';summary.style.cssText='min-height:0;margin:0 0 15px';
    summary.textContent=documents.length ? '掲載中の資料：'+documents.length+'件' : '現在掲載中の資料はありません。';
    const download=document.createElement(documents.length?'button':'span');
    download.className='download-btn';download.textContent='ダウンロード';
    if(documents.length){
      download.type='button';download.style.width='100%';download.style.cursor='pointer';download.addEventListener('click',openPicker);
    }else{
      download.setAttribute('role','link');download.setAttribute('aria-disabled','true');download.classList.add('is-empty');download.style.cursor='not-allowed';
    }
    list.append(summary,download);
    documents.forEach(item=>{
      const adminRow=document.createElement('div');
      adminRow.style.cssText='padding-top:12px;overflow-wrap:anywhere';
      const label=document.createElement('span');label.textContent=(item.tournament||item.fileName)+'　';
      const remove=document.createElement('button');remove.type='button';remove.className='attachment-delete';remove.textContent='添付ファイルを削除';remove.disabled=busy;
      remove.addEventListener('click',()=>removeDocument(item));
      adminRow.append(label,remove);adminList.append(adminRow);
    });
    save.disabled=busy;save.textContent=busy?'処理中...':'大会資料を保存';
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
