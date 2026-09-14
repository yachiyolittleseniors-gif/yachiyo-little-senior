(function(){
  const API='/.netlify/functions/site-data?section=board-tournaments';
  const list=document.getElementById('tournamentList');
  const adminList=document.getElementById('tournamentAdminList');
  const panel=document.getElementById('densukeAdminPanel');
  const titleInput=document.getElementById('tournamentTitleInput');
  const gradeInput=document.getElementById('tournamentGradeInput');
  const fileInput=document.getElementById('tournamentPdfInput');
  const uploadBtn=document.getElementById('uploadTournamentBtn');
  let documents=[];

  if(!list || !adminList || !panel || !titleInput || !gradeInput || !fileInput || !uploadBtn) return;

  function gradeLabel(grade){
    return grade==='1'?'1年生':grade==='2'?'2年生':grade==='3'?'3年生':'全学年';
  }

  function formatSize(bytes){
    const mb=Number(bytes||0)/1024/1024;
    return mb>=1 ? mb.toFixed(1)+'MB' : Math.max(1,Math.round(Number(bytes||0)/1024))+'KB';
  }

  function renderDocuments(){
    list.replaceChildren();
    adminList.replaceChildren();

    if(!documents.length){
      const empty=document.createElement('div');
      empty.className='tournament-empty';
      empty.textContent='現在掲載中の資料はありません。';
      list.appendChild(empty);
    }

    documents.forEach(function(item){
      const row=document.createElement('div');
      row.className='tournament-item';
      const info=document.createElement('div');
      info.className='tournament-info';
      const grade=document.createElement('div');
      grade.className='tournament-grade';
      grade.textContent=gradeLabel(String(item.grade||'all'));
      const title=document.createElement('div');
      title.className='tournament-title';
      title.textContent=item.title||'公式戦資料';
      const meta=document.createElement('div');
      meta.className='tournament-meta';
      meta.textContent=(item.fileName||'PDF')+'・'+formatSize(item.size);
      const open=document.createElement('a');
      open.className='tournament-open';
      open.href=API+'&file='+encodeURIComponent(item.id);
      open.target='_blank';
      open.rel='noopener';
      open.textContent='PDFを開く';
      info.append(grade,title,meta);
      row.append(info,open);
      list.appendChild(row);

    });

    if(!documents.length){
      const adminEmpty=document.createElement('div');
      adminEmpty.className='note';
      adminEmpty.textContent='現在掲載中のPDFはありません。';
      adminList.appendChild(adminEmpty);
    }

    documents.forEach(function(item){
      const adminRow=document.createElement('div');
      adminRow.className='tournament-admin-item';
      const adminTitle=document.createElement('span');
      adminTitle.textContent=gradeLabel(String(item.grade||'all'))+'｜'+(item.title||item.fileName||'公式戦資料');
      const remove=document.createElement('button');
      remove.type='button';
      remove.textContent='削除';
      remove.addEventListener('click',function(){deleteDocument(item)});
      adminRow.append(adminTitle,remove);
      adminList.appendChild(adminRow);
    });
  }

  async function loadDocuments(){
    try{
      await window.boardAccessReady;
      const accessPassword=sessionStorage.getItem('yachiyoAttendancePass')||'';
      const response=await fetch(API,{
        cache:'no-store',
        headers:{'x-access-password':accessPassword}
      });
      if(!response.ok) throw new Error('load failed');
      const body=await response.json();
      documents=Array.isArray(body.data)?body.data:[];
      renderDocuments();
    }catch(e){
      list.innerHTML='<div class="tournament-empty">資料を読み込めませんでした。</div>';
    }
  }

  function readAsDataUrl(file){
    return new Promise(function(resolve,reject){
      const reader=new FileReader();
      reader.onload=function(){resolve(String(reader.result||''))};
      reader.onerror=reject;
      reader.readAsDataURL(file);
    });
  }

  uploadBtn.addEventListener('click',async function(){
    const adminPassword=panel.dataset.adminPassword||'';
    const title=titleInput.value.trim();
    const file=fileInput.files&&fileInput.files[0];
    if(!adminPassword){alert('管理画面を開き直してください。');return}
    if(!title){alert('大会名・資料名を入力してください。');return}
    if(!file || (file.type!=='application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))){alert('PDFファイルを選択してください。');return}
    if(file.size>6*1024*1024){alert('PDFは6MB以下にしてください。');return}

    uploadBtn.disabled=true;
    uploadBtn.textContent='掲載中...';
    try{
      const response=await fetch(API,{
        method:'POST',
        headers:{'content-type':'application/json','x-admin-password':adminPassword},
        body:JSON.stringify({
          action:'uploadBoardTournament',
          title,
          grade:gradeInput.value,
          fileName:file.name,
          dataUrl:await readAsDataUrl(file)
        })
      });
      const body=await response.json().catch(function(){return {}});
      if(!response.ok) throw new Error(body.error||'PDFを追加できませんでした。');
      documents=Array.isArray(body.data)?body.data:documents;
      titleInput.value='';
      fileInput.value='';
      renderDocuments();
      showSaveNotice('PDFを追加しました');
    }catch(e){
      alert(e.message||'PDFを追加できませんでした。');
    }finally{
      uploadBtn.disabled=false;
      uploadBtn.textContent='PDFを追加';
    }
  });

  async function deleteDocument(item){
    const adminPassword=panel.dataset.adminPassword||'';
    if(!adminPassword){alert('管理画面を開き直してください。');return}
    if(!confirm('「'+(item.title||'公式戦資料')+'」を削除しますか？')) return;
    try{
      const response=await fetch(API,{
        method:'POST',
        headers:{'content-type':'application/json','x-admin-password':adminPassword},
        body:JSON.stringify({action:'deleteBoardTournament',id:item.id})
      });
      const body=await response.json().catch(function(){return {}});
      if(!response.ok) throw new Error(body.error||'PDFを削除できませんでした。');
      documents=Array.isArray(body.data)?body.data:documents.filter(function(entry){return entry.id!==item.id});
      renderDocuments();
      showSaveNotice('PDFを削除しました');
    }catch(e){
      alert(e.message||'PDFを削除できませんでした。');
    }
  }

  loadDocuments();
})();
