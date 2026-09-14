(function(){
  const API='/.netlify/functions/site-data?section=rules';
  const textView=document.getElementById('rulesText');
  const pdfList=document.getElementById('rulesPdfList');
  const fileInput=document.getElementById('rulesPdfInput');
  const saveBtn=document.getElementById('saveRulesBtn');
  const adminList=document.getElementById('rulesAdminList');
  const panel=document.getElementById('densukeAdminPanel');
  let rules={text:'',pdfs:[]};

  if(!textView||!pdfList||!fileInput||!saveBtn||!adminList||!panel)return;

  function normalize(raw){
    const out={text:(raw&&raw.text)||'',pdfs:[]};
    if(raw&&Array.isArray(raw.pdfs)){
      out.pdfs=raw.pdfs.filter(function(item){return item&&item.data}).map(function(item){return {name:item.name||'チーム規約資料',data:item.data}});
    }
    if(raw&&raw.pdf&&!out.pdfs.some(function(item){return item.data===raw.pdf}))out.pdfs.unshift({name:raw.pdfName||'チーム規約.pdf',data:raw.pdf});
    return out;
  }

  function render(){
    textView.classList.remove('rules-loading');
    textView.removeAttribute('aria-busy');
    const hasText=Boolean(rules.text),hasPdfs=rules.pdfs.length>0;
    textView.textContent=rules.text||(hasPdfs?'':'現在、公開中のチーム規約はありません。');
    textView.hidden=!hasText&&hasPdfs;
    textView.classList.toggle('empty',!hasText&&!hasPdfs);
    pdfList.replaceChildren();adminList.replaceChildren();pdfList.hidden=!hasPdfs;
    rules.pdfs.forEach(function(pdf,index){
      const item=document.createElement('div');item.className='rules-pdf-item';
      const name=document.createElement('div');name.className='rules-pdf-name';name.textContent=pdf.name||('チーム規約資料 '+(index+1));
      const open=document.createElement('a');open.className='rules-pdf-open btn gold';open.href='./team-rules-viewer.html?index='+encodeURIComponent(index)+'&v=20260914-1';open.textContent='資料を開く';
      item.append(name,open);pdfList.appendChild(item);
      const adminItem=document.createElement('div');adminItem.className='rules-admin-item';
      const adminName=document.createElement('span');adminName.textContent=pdf.name||('チーム規約資料 '+(index+1));
      const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.addEventListener('click',function(){removePdf(index)});
      adminItem.append(adminName,remove);adminList.appendChild(adminItem);
    });
    if(!hasPdfs){const empty=document.createElement('div');empty.className='note';empty.textContent='現在掲載中の資料はありません。';adminList.appendChild(empty)}
  }

  async function load(){
    try{
      await window.boardAccessReady;
      const accessPassword=sessionStorage.getItem('yachiyoAttendancePass')||'';
      const response=await fetch(API,{cache:'no-store',headers:{'x-access-password':accessPassword}});
      if(!response.ok)throw new Error('load failed');
      const body=await response.json();const data=Array.isArray(body.data)?body.data:[];rules=normalize(data[0]||{});render();
    }catch(e){textView.hidden=false;textView.classList.remove('rules-loading');textView.removeAttribute('aria-busy');textView.classList.add('empty');textView.textContent='チーム規約を読み込めませんでした。'}
  }

  function readAsDataUrl(file){return new Promise(function(resolve,reject){const reader=new FileReader();reader.onload=function(){resolve(String(reader.result||''))};reader.onerror=reject;reader.readAsDataURL(file)})}

  async function save(){
    const adminPassword=panel.dataset.adminPassword||'',files=Array.from(fileInput.files||[]);
    if(!adminPassword){alert('管理画面を開き直してください。');return}
    if(!files.length){alert('追加する資料ファイルを選択してください。');return}
    for(const file of files){
      const allowedType=/^(application\/pdf|image\/(jpeg|png|webp))$/i.test(file.type||'');
      const allowedName=/\.(pdf|jpe?g|png|webp)$/i.test(file.name||'');
      if(!allowedType||!allowedName){alert('PDF・JPEG・PNG・WebPファイルを選択してください。');return}
      if(file.size>5*1024*1024){alert(file.name+' は5MBを超えています。');return}
    }
    saveBtn.disabled=true;saveBtn.textContent='保存中...';
    const additions=[];
    try{
      for(const file of files)additions.push({name:file.name,data:await readAsDataUrl(file)});
      const next={text:rules.text,pdfs:rules.pdfs.concat(additions)};
      const updateMessage=additions.length===1?'チーム規約「'+additions[0].name+'」を保存しました':'チーム規約ファイルを'+additions.length+'件保存しました';
      const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-admin-password':adminPassword},body:JSON.stringify({data:[next],announceLatest:true,updateMessage:updateMessage})});
      if(!response.ok)throw new Error('保存できませんでした。');
      rules=next;fileInput.value='';render();showSaveNotice(additions.length?'資料を追加して保存しました':'保存しました');
      window.refreshBoardLatestUpdate?.();
    }catch(e){alert(e.message||'保存できませんでした。')}finally{saveBtn.disabled=false;saveBtn.textContent='資料を追加'}
  }

  async function removePdf(index){
    const adminPassword=panel.dataset.adminPassword||'',target=rules.pdfs[index];
    if(!adminPassword){alert('管理画面を開き直してください。');return}
    if(!target||!confirm('「'+target.name+'」を削除しますか？'))return;
    const next={text:rules.text,pdfs:rules.pdfs.filter(function(_,i){return i!==index})};
    try{
      const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-admin-password':adminPassword},body:JSON.stringify({data:[next]})});
      if(!response.ok)throw new Error('資料を削除できませんでした。');
      rules=next;render();showSaveNotice('資料を削除しました');
    }catch(e){alert(e.message||'資料を削除できませんでした。')}
  }

  saveBtn.addEventListener('click',save);load();
})();
