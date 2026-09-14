(function(){
  const API='/.netlify/functions/site-data?section=rules';
  const textView=document.getElementById('rulesText');
  const pdfList=document.getElementById('rulesPdfList');
  const fileInput=document.getElementById('rulesPdfInput');
  const saveBtn=document.getElementById('saveRulesBtn');
  const adminList=document.getElementById('rulesAdminList');
  const panel=document.getElementById('densukeAdminPanel');
  let rules={text:'',pdfs:[]};
  let blobUrls=[];

  if(!textView||!pdfList||!fileInput||!saveBtn||!adminList||!panel)return;

  function normalize(raw){
    const out={text:(raw&&raw.text)||'',pdfs:[]};
    if(raw&&Array.isArray(raw.pdfs)){
      out.pdfs=raw.pdfs.filter(function(item){return item&&item.data}).map(function(item){return {name:item.name||'チーム規約.pdf',data:item.data}});
    }
    if(raw&&raw.pdf&&!out.pdfs.some(function(item){return item.data===raw.pdf}))out.pdfs.unshift({name:raw.pdfName||'チーム規約.pdf',data:raw.pdf});
    return out;
  }

  function toBlobUrl(dataUrl){
    if(!dataUrl||!dataUrl.startsWith('data:'))return dataUrl;
    try{
      const parts=dataUrl.split(',');
      const mime=(parts[0].match(/data:([^;]+)/)||[])[1]||'application/pdf';
      const binary=atob(parts[1]);
      const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      const url=URL.createObjectURL(new Blob([bytes],{type:mime}));
      blobUrls.push(url);
      return url;
    }catch(e){return dataUrl}
  }

  function render(){
    textView.classList.remove('rules-loading');
    textView.removeAttribute('aria-busy');
    const hasText=Boolean(rules.text),hasPdfs=rules.pdfs.length>0;
    textView.textContent=rules.text||(hasPdfs?'':'現在、公開中のチーム規約はありません。');
    textView.hidden=!hasText&&hasPdfs;
    textView.classList.toggle('empty',!hasText&&!hasPdfs);
    blobUrls.forEach(function(url){URL.revokeObjectURL(url)});blobUrls=[];
    pdfList.replaceChildren();adminList.replaceChildren();pdfList.hidden=!hasPdfs;
    rules.pdfs.forEach(function(pdf,index){
      const item=document.createElement('div');item.className='rules-pdf-item';
      const name=document.createElement('div');name.className='rules-pdf-name';name.textContent=pdf.name||('チーム規約PDF '+(index+1));
      const open=document.createElement('a');open.className='rules-pdf-open btn gold';open.href=toBlobUrl(pdf.data);open.target='_blank';open.rel='noopener';open.textContent='PDFを開く';
      item.append(name,open);pdfList.appendChild(item);
      const adminItem=document.createElement('div');adminItem.className='rules-admin-item';
      const adminName=document.createElement('span');adminName.textContent=pdf.name||('チーム規約PDF '+(index+1));
      const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.addEventListener('click',function(){removePdf(index)});
      adminItem.append(adminName,remove);adminList.appendChild(adminItem);
    });
    if(!hasPdfs){const empty=document.createElement('div');empty.className='note';empty.textContent='現在掲載中のPDFはありません。';adminList.appendChild(empty)}
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
    if(!files.length){alert('追加するPDFファイルを選択してください。');return}
    for(const file of files){if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf')){alert('PDFファイルを選択してください。');return}if(file.size>5*1024*1024){alert(file.name+' は5MBを超えています。');return}}
    saveBtn.disabled=true;saveBtn.textContent='保存中...';
    const additions=[];
    try{
      for(const file of files)additions.push({name:file.name,data:await readAsDataUrl(file)});
      const next={text:rules.text,pdfs:rules.pdfs.concat(additions)};
      const updateMessage=additions.length===1?'チーム規約「'+additions[0].name+'」を保存しました':'チーム規約ファイルを'+additions.length+'件保存しました';
      const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-admin-password':adminPassword},body:JSON.stringify({data:[next],announceLatest:true,updateMessage:updateMessage})});
      if(!response.ok)throw new Error('保存できませんでした。');
      rules=next;fileInput.value='';render();showSaveNotice(additions.length?'PDFを追加して保存しました':'保存しました');
      window.refreshBoardLatestUpdate?.();
    }catch(e){alert(e.message||'保存できませんでした。')}finally{saveBtn.disabled=false;saveBtn.textContent='PDFを追加'}
  }

  async function removePdf(index){
    const adminPassword=panel.dataset.adminPassword||'',target=rules.pdfs[index];
    if(!adminPassword){alert('管理画面を開き直してください。');return}
    if(!target||!confirm('「'+target.name+'」を削除しますか？'))return;
    const next={text:rules.text,pdfs:rules.pdfs.filter(function(_,i){return i!==index})};
    try{
      const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-admin-password':adminPassword},body:JSON.stringify({data:[next]})});
      if(!response.ok)throw new Error('PDFを削除できませんでした。');
      rules=next;render();showSaveNotice('PDFを削除しました');
    }catch(e){alert(e.message||'PDFを削除できませんでした。')}
  }

  saveBtn.addEventListener('click',save);load();
})();
