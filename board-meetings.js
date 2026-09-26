(function(){
  const DOCUMENT_API='/.netlify/functions/site-data?section=board-meeting-documents';
  const SCHEDULE_API='/.netlify/functions/site-data?section=board-meeting-schedule';
  const COACH_AUTH_API='/.netlify/functions/coach-attendance-data';
  const documentList=document.getElementById('meetingDocumentList');
  const adminOpen=document.getElementById('meetingAdminOpen');
  const adminPanel=document.getElementById('meetingAdminPanel');
  const adminDocumentList=document.getElementById('meetingAdminDocumentList');
  const pdfInput=document.getElementById('meetingPdfInput');
  const pdfSave=document.getElementById('meetingPdfSave');
  const pdfCancel=document.getElementById('meetingPdfCancel');
  const calendarGrid=document.getElementById('meetingCalendarGrid');
  const calendarTitle=document.getElementById('meetingCalendarTitle');
  const prevMonth=document.getElementById('meetingPrevMonth');
  const nextMonth=document.getElementById('meetingNextMonth');
  const editor=document.getElementById('meetingEditor');
  const editorClose=document.getElementById('meetingEditorClose');
  const editorDate=document.getElementById('meetingEditorDate');
  const dayList=document.getElementById('meetingDayList');
  const addEvent=document.getElementById('meetingAddEvent');
  const form=document.getElementById('meetingForm');
  const eventTitle=document.getElementById('meetingEventTitle');
  const eventTime=document.getElementById('meetingEventTime');
  const eventPlace=document.getElementById('meetingEventPlace');
  const eventMemo=document.getElementById('meetingEventMemo');
  const formSave=document.getElementById('meetingFormSave');
  const editCancel=document.getElementById('meetingEditCancel');
  const formActions=form.querySelector('.meeting-form-actions');
  let documents=[];
  let events=[];
  let selectedDate='';
  let editingEventId='';
  let historyFocusEventId='';
  let activeCoachPassword='';
  let documentCoachPassword='';
  const now=new Date();
  let viewYear=now.getFullYear();
  let viewMonth=now.getMonth();

  if(!documentList||!adminOpen||!adminPanel||!adminDocumentList||!pdfInput||!pdfSave||!pdfCancel||!calendarGrid||!form||!addEvent||!formSave||!editCancel||!formActions)return;

  function accessHeaders(json,coachPassword){
    const headers={'x-access-password':sessionStorage.getItem('yachiyoAttendancePass')||''};
    if(coachPassword)headers['x-coach-password']=coachPassword;
    if(json)headers['content-type']='application/json';
    return headers;
  }

  async function verifyCoachPassword(password){
    if(!password)return false;
    try{
      const response=await fetch(COACH_AUTH_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'verifyCoachPassword',password:password})});
      return response.ok;
    }catch(e){return false}
  }

  async function requireCoachPassword(){
    if(window.YLSOperatorPasskeys?.authorize){
      return window.YLSOperatorPasskeys.authorize('パスワードを入力してください。');
    }
    const entered=prompt('パスワードを入力してください。');
    if(entered===null)return '';
    if(await verifyCoachPassword(entered))return entered;
    alert('パスワードが違います。');
    return '';
  }

  function formatDate(year,month,day){
    return String(year)+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  }

  const japaneseHolidayCache=new Map();
  function japaneseHolidays(year){
    if(japaneseHolidayCache.has(year))return japaneseHolidayCache.get(year);
    const holidays=new Set();
    const add=function(month,day){holidays.add(formatDate(year,month-1,day))};
    const nthMonday=function(month,nth){
      const first=new Date(year,month-1,1).getDay();
      return 1+((8-first)%7)+(nth-1)*7;
    };
    add(1,1);
    add(1,nthMonday(1,2));
    add(2,11);
    if(year>=2020)add(2,23);
    add(3,Math.floor(20.8431+.242194*(year-1980)-Math.floor((year-1980)/4)));
    add(4,29);
    add(5,3);add(5,4);add(5,5);
    if(year===2020){add(7,23);add(7,24);add(8,10)}
    else if(year===2021){add(7,22);add(7,23);add(8,8)}
    else{add(7,nthMonday(7,3));add(8,11);add(10,nthMonday(10,2))}
    add(9,nthMonday(9,3));
    add(9,Math.floor(23.2488+.242194*(year-1980)-Math.floor((year-1980)/4)));
    add(11,3);add(11,23);
    for(let time=new Date(year,0,2).getTime(),end=new Date(year,11,30).getTime();time<=end;time+=86400000){
      const current=new Date(time);
      const key=formatDate(current.getFullYear(),current.getMonth(),current.getDate());
      if(holidays.has(key))continue;
      const previous=new Date(time-86400000),next=new Date(time+86400000);
      if(holidays.has(formatDate(previous.getFullYear(),previous.getMonth(),previous.getDate()))&&holidays.has(formatDate(next.getFullYear(),next.getMonth(),next.getDate())))holidays.add(key);
    }
    Array.from(holidays).sort().forEach(function(key){
      const parts=key.split('-').map(Number);
      const holiday=new Date(parts[0],parts[1]-1,parts[2]);
      if(holiday.getDay()!==0)return;
      let substitute=new Date(holiday.getFullYear(),holiday.getMonth(),holiday.getDate()+1);
      let substituteKey=formatDate(substitute.getFullYear(),substitute.getMonth(),substitute.getDate());
      while(holidays.has(substituteKey)){
        substitute=new Date(substitute.getFullYear(),substitute.getMonth(),substitute.getDate()+1);
        substituteKey=formatDate(substitute.getFullYear(),substitute.getMonth(),substitute.getDate());
      }
      holidays.add(substituteKey);
    });
    japaneseHolidayCache.set(year,holidays);
    return holidays;
  }

  function isJapaneseHoliday(date){
    const year=Number(String(date).slice(0,4));
    return japaneseHolidays(year).has(date);
  }

  function formatSize(bytes){
    const value=Number(bytes||0);
    return value>=1024*1024?(value/1024/1024).toFixed(1)+'MB':Math.max(1,Math.round(value/1024))+'KB';
  }

  function renderDocuments(){
    documentList.replaceChildren();
    const button=document.createElement('button');
    button.className='meeting-document-library-link';
    button.type='button';
    button.setAttribute('data-open-secretariat-documents','');
    button.textContent='保存済み資料を見る（'+documents.length+'件）';
    documentList.appendChild(button);
    renderAdminDocuments();
  }

  function renderAdminDocuments(){
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
      name.textContent=(item.fileName||'事務局資料')+'（'+formatSize(item.size)+'）';
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

  function eventsFor(date){
    return events.filter(function(item){return item.date===date});
  }

  function gradesFor(item){
    if(Array.isArray(item&&item.grades)){
      const grades=['1','2','3','other'].filter(function(grade){return item.grades.map(String).includes(grade)});
      return grades.length?grades:['1','2','3'];
    }
    const legacy=String(item&&item.grade||'');
    const grades=['1','2','3'].filter(function(grade){return legacy.includes(grade)});
    return grades.length?grades:['1','2','3'];
  }

  const gradeColorPalette=[
    {icon:'🔴',accent:'#d62432',background:'#fff0f1',text:'#98202a'},
    {icon:'🟢',accent:'#18864b',background:'#edf9f2',text:'#116137'},
    {icon:'🔵',accent:'#176cd3',background:'#eef5ff',text:'#124e96'}
  ];

  function academicYearFor(date){
    const parts=String(date||'').split('-').map(Number);
    const year=parts[0]||new Date().getFullYear();
    const month=parts[1]||new Date().getMonth()+1;
    return month>=4?year:year-1;
  }

  function gradeColorFor(date,grade){
    const shift=((academicYearFor(date)-2026)%3+3)%3;
    const index=((Number(grade)-1-shift)%3+3)%3;
    return gradeColorPalette[index];
  }

  function updateMeetingGradeOptions(date){
    form.querySelectorAll('[data-meeting-grade]').forEach(function(label){
      const grade=label.dataset.meetingGrade;
      if(grade==='all'){
        const text=label.querySelector('span');
        if(text)text.textContent='🟡全学年';
        label.style.setProperty('--grade-accent','#c99a00');
        label.style.setProperty('--grade-bg','#fff8d8');
        label.style.setProperty('--grade-text','#705500');
        return;
      }
      if(grade==='other'){
        const text=label.querySelector('span');
        if(text)text.textContent='⚫️その他';
        label.style.setProperty('--grade-accent','#252b33');
        label.style.setProperty('--grade-bg','#f0f1f2');
        label.style.setProperty('--grade-text','#161a1f');
        return;
      }
      const color=gradeColorFor(date,grade);
      const text=label.querySelector('span');
      if(text)text.textContent=color.icon+grade+'年生';
      label.style.setProperty('--grade-accent',color.accent);
      label.style.setProperty('--grade-bg',color.background);
      label.style.setProperty('--grade-text',color.text);
    });
  }

  function syncMeetingAllGrade(){
    const all=document.getElementById('meetingGradeAll');
    const schoolGrades=Array.from(form.querySelectorAll('input[name="meetingGrade"]')).filter(function(input){return ['1','2','3'].includes(input.value)});
    const checkedCount=schoolGrades.filter(function(input){return input.checked}).length;
    all.checked=checkedCount===schoolGrades.length;
    all.indeterminate=checkedCount>0&&checkedCount<schoolGrades.length;
  }

  document.getElementById('meetingGradeAll').addEventListener('change',function(event){
    form.querySelectorAll('input[name="meetingGrade"]').forEach(function(input){
      if(['1','2','3'].includes(input.value))input.checked=event.target.checked;
    });
    syncMeetingAllGrade();
  });
  form.querySelectorAll('input[name="meetingGrade"]').forEach(function(input){
    if(['1','2','3'].includes(input.value))input.addEventListener('change',syncMeetingAllGrade);
  });

  function gradeText(item){
    const grades=gradesFor(item);
    const schoolGrades=grades.filter(function(grade){return ['1','2','3'].includes(grade)});
    const labels=[];
    if(schoolGrades.length===3)labels.push('🟡全学年');
    else labels.push.apply(labels,schoolGrades.map(function(grade){return gradeColorFor(item&&item.date,grade).icon+grade+'年生'}));
    if(grades.includes('other'))labels.push('⚫️その他');
    return labels.join('、');
  }

  function gradeIcons(item){
    const grades=gradesFor(item);
    const schoolGrades=grades.filter(function(grade){return ['1','2','3'].includes(grade)});
    let icons=schoolGrades.length===3?'🟡':schoolGrades.map(function(grade){return gradeColorFor(item&&item.date,grade).icon}).join('');
    if(grades.includes('other'))icons+='⚫️';
    return icons;
  }

  function renderCalendar(){
    calendarTitle.textContent=viewYear+'年 '+(viewMonth+1)+'月';
    calendarGrid.replaceChildren();
    const first=new Date(viewYear,viewMonth,1);
    const start=new Date(viewYear,viewMonth,1-first.getDay());
    const today=formatDate(now.getFullYear(),now.getMonth(),now.getDate());
    for(let index=0;index<42;index++){
      const current=new Date(start.getFullYear(),start.getMonth(),start.getDate()+index);
      const date=formatDate(current.getFullYear(),current.getMonth(),current.getDate());
      const dayEvents=eventsFor(date);
      const button=document.createElement('button');
      button.type='button';
      button.className='meeting-calendar-day';
      if(current.getMonth()!==viewMonth)button.classList.add('muted');
      if(current.getDay()===0)button.classList.add('sun');
      if(current.getDay()===6)button.classList.add('sat');
      if(isJapaneseHoliday(date))button.classList.add('holiday');
      if(date===today)button.classList.add('today');
      button.dataset.date=date;
      button.setAttribute('aria-label',date+(dayEvents.length?' '+dayEvents.map(function(item){return item.title}).join('、'):''));
      const number=document.createElement('span');
      number.className='meeting-day-number';
      number.textContent=current.getDate();
      button.appendChild(number);
      dayEvents.slice(0,2).forEach(function(item){
        const pill=document.createElement('span');
        pill.className='meeting-day-event';
        pill.textContent=(gradeIcons(item)?gradeIcons(item)+' ':'')+item.title;
        button.appendChild(pill);
      });
      if(dayEvents.length>2){
        const more=document.createElement('span');
        more.className='meeting-day-event';
        more.textContent='ほか'+(dayEvents.length-2)+'件';
        button.appendChild(more);
      }
      button.addEventListener('click',function(){openEditor(date)});
      calendarGrid.appendChild(button);
    }
  }

  function renderDayList(){
    dayList.replaceChildren();
    const selectedEvents=eventsFor(selectedDate);
    if(!selectedEvents.length){
      const empty=document.createElement('div');
      empty.className='meeting-empty';
      empty.textContent='この日の予定はありません。';
      dayList.appendChild(empty);
      return;
    }
    selectedEvents.forEach(function(item){
      const row=document.createElement('div');
      row.className='meeting-day-list-row';
      if(historyFocusEventId&&String(item.id||'')===historyFocusEventId)row.classList.add('history-focus-event');
      const info=document.createElement('div');
      const title=document.createElement('strong');
      title.textContent=(gradeText(item)?gradeText(item)+'　':'')+(item.title||'事務局');
      const detail=document.createElement('span');
      detail.textContent=[item.time,item.place,item.memo].filter(Boolean).join('／');
      info.appendChild(title);
      if(detail.textContent)info.appendChild(detail);
      const remove=document.createElement('button');
      remove.type='button';
      remove.className='meeting-event-delete';
      remove.textContent='削除';
      remove.addEventListener('click',function(){deleteEvent(item)});
      const edit=document.createElement('button');
      edit.type='button';
      edit.className='meeting-event-edit';
      edit.textContent='編集';
      edit.addEventListener('click',function(){startEditing(item)});
      const actions=document.createElement('div');
      actions.className='meeting-day-list-actions';
      actions.append(edit,remove);
      row.append(info,actions);
      dayList.appendChild(row);
    });
  }

  function resetFormMode(clearPassword=true){
    editingEventId='';
    if(clearPassword)activeCoachPassword='';
    form.reset();
    syncMeetingAllGrade();
    form.hidden=true;
    addEvent.hidden=false;
    formSave.textContent='予定を保存';
    editCancel.hidden=true;
    formActions.classList.remove('editing');
  }

  async function startEditing(item){
    const coachPassword=await requireCoachPassword();
    if(!coachPassword)return;
    activeCoachPassword=coachPassword;
    editingEventId=String(item.id||'');
    eventTitle.value=item.title||'';
    const selectedGrades=gradesFor(item);
    form.querySelectorAll('input[name="meetingGrade"]').forEach(function(input){input.checked=selectedGrades.includes(input.value)});
    syncMeetingAllGrade();
    eventTime.value=item.time||'';
    eventPlace.value=item.place||'';
    eventMemo.value=item.memo||'';
    form.hidden=false;
    addEvent.hidden=true;
    formSave.textContent='変更を保存';
    editCancel.hidden=false;
    formActions.classList.add('editing');
    eventTitle.focus();
  }

  function openEditor(date){
    selectedDate=date;
    updateMeetingGradeOptions(date);
    editorDate.textContent=date.replace(/-/g,'/')+' の予定';
    resetFormMode();
    renderDayList();
    editor.classList.add('show');
    editor.setAttribute('aria-hidden','false');
  }

  function closeEditor(){
    resetFormMode();
    editor.classList.remove('show');
    editor.setAttribute('aria-hidden','true');
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

  async function loadData(){
    try{
      await window.boardAccessReady;
      const responses=await Promise.all([
        fetch(DOCUMENT_API,{cache:'no-store',headers:accessHeaders(false)}),
        fetch(SCHEDULE_API,{cache:'no-store',headers:accessHeaders(false)})
      ]);
      if(!responses[0].ok||!responses[1].ok)throw new Error('load failed');
      const bodies=await Promise.all(responses.map(function(response){return response.json()}));
      documents=Array.isArray(bodies[0].data)?bodies[0].data:[];
      events=Array.isArray(bodies[1].data)?bodies[1].data:[];
      renderDocuments();
      renderCalendar();
      openHistoryScheduleTarget();
    }catch(e){
      documentList.innerHTML='<button class="meeting-document-library-link" type="button" data-open-secretariat-documents>保存済み資料を見る</button>';
      renderCalendar();
    }
  }

  function openHistoryScheduleTarget(){
    const params=new URLSearchParams(location.search);
    if(params.get('focus')!=='schedule')return;
    const title=params.get('focusTitle')||'';
    const updatedAt=params.get('focusUpdatedAt')||'';
    let target=events.find(function(item){return updatedAt&&String(item.updatedAt||'')===updatedAt});
    if(!target&&title){
      target=events.filter(function(item){return String(item.title||'')===title}).sort(function(a,b){return new Date(b.updatedAt||0)-new Date(a.updatedAt||0)})[0];
    }
    const card=document.getElementById('boardMeetingCard');
    if(target){
      const parts=String(target.date||'').split('-').map(Number);
      if(parts.length===3&&parts.every(Number.isFinite)){
        viewYear=parts[0];viewMonth=parts[1]-1;renderCalendar();
      }
      historyFocusEventId=String(target.id||'');
    }
    setTimeout(function(){
      if(card){
        card.scrollIntoView({behavior:'smooth',block:'center'});
        card.classList.add('history-focus-target');
        setTimeout(function(){card.classList.remove('history-focus-target')},2600);
      }
      if(target)openEditor(target.date);
    },280);
  }

  adminOpen.addEventListener('click',async function(){
    const coachPassword=await requireCoachPassword();
    if(!coachPassword)return;
    documentCoachPassword=coachPassword;
    adminOpen.hidden=true;
    adminPanel.hidden=false;
    renderAdminDocuments();
  });

  pdfCancel.addEventListener('click',function(){
    pdfInput.value='';
    documentCoachPassword='';
    adminPanel.hidden=true;
    adminOpen.hidden=false;
  });

  documentList.addEventListener('click',function(event){
    const button=event.target.closest('[data-open-secretariat-documents]');
    if(!button)return;
    event.preventDefault();
    window.location.assign('/secretariat-documents.html?v=20260912-11');
  });

  pdfSave.addEventListener('click',async function(){
    const file=pdfInput.files&&pdfInput.files[0];
    const allowedType=/^(application\/pdf|image\/(jpeg|png|webp))$/i.test(file&&file.type||'');
    const allowedName=/\.(pdf|jpe?g|png|webp)$/i.test(file&&file.name||'');
    if(!file||!allowedType||!allowedName){alert('PDF・JPEG・PNG・WebPファイルを選択してください。');return}
    if(file.size>6*1024*1024){alert('ファイルは6MB以下にしてください。');return}
    const coachPassword=documentCoachPassword||await requireCoachPassword();
    if(!coachPassword)return;
    documentCoachPassword=coachPassword;
    pdfSave.disabled=true;
    pdfSave.textContent='保存中...';
    try{
      const body=await uploadFileInChunks(DOCUMENT_API,file,coachPassword,'uploadBoardMeetingDocument',pdfSave);
      documents=Array.isArray(body.data)?body.data:documents;
      pdfInput.value='';
      renderDocuments();
      showSaveNotice('事務局からのお知らせを保存しました');
      window.refreshBoardLatestUpdate?.();
    }catch(e){alert(e.message||'資料を保存できませんでした。')}
    finally{pdfSave.disabled=false;pdfSave.textContent='選択した資料を保存'}
  });

  async function deleteDocument(item){
    if(!confirm('「'+(item.fileName||'事務局資料')+'」を削除しますか？'))return;
    const coachPassword=documentCoachPassword||await requireCoachPassword();
    if(!coachPassword)return;
    documentCoachPassword=coachPassword;
    try{
      const response=await fetch(DOCUMENT_API,{
        method:'POST',headers:accessHeaders(true,coachPassword),
        body:JSON.stringify({action:'deleteBoardMeetingDocument',id:item.id})
      });
      const body=await response.json().catch(function(){return {}});
      if(!response.ok)throw new Error(body.error||'PDFを削除できませんでした。');
      documents=Array.isArray(body.data)?body.data:documents.filter(function(entry){return entry.id!==item.id});
      renderDocuments();
      showSaveNotice('PDFを削除しました');
    }catch(e){alert(e.message||'PDFを削除できませんでした。')}
  }

  function startRenameDocument(item,row,name,actions){
    const currentName=String(item.fileName||'事務局資料.pdf');
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
    cancel.addEventListener('click',renderAdminDocuments);
    input.addEventListener('keydown',function(event){
      if(event.key==='Enter'){event.preventDefault();submit()}
      if(event.key==='Escape'){event.preventDefault();renderAdminDocuments()}
    });
    input.focus();input.select();
  }

  async function renameDocument(item,entered){
    const currentName=String(item.fileName||'事務局資料.pdf');
    const extension=(currentName.match(/\.(?:pdf|jpe?g|png|webp)$/i)||[])[0]||({"application/pdf":'.pdf',"image/jpeg":'.jpg',"image/png":'.png',"image/webp":'.webp'}[item.contentType]||'');
    const nextBase=entered.trim().replace(/\.(?:pdf|jpe?g|png|webp)$/i,'').trim();
    if(!nextBase){alert('ファイル名を入力してください。');return false}
    const fileName=nextBase+extension;
    if(fileName===currentName){renderAdminDocuments();return true}
    const coachPassword=documentCoachPassword||await requireCoachPassword();
    if(!coachPassword)return false;
    documentCoachPassword=coachPassword;
    try{
      const response=await fetch(DOCUMENT_API,{
        method:'POST',headers:accessHeaders(true,coachPassword),
        body:JSON.stringify({action:'renameBoardMeetingDocument',id:item.id,fileName:fileName})
      });
      const body=await response.json().catch(function(){return {}});
      if(!response.ok)throw new Error(body.error||'ファイル名を変更できませんでした。');
      documents=Array.isArray(body.data)?body.data:documents.map(function(entry){return entry.id===item.id?Object.assign({},entry,{fileName:fileName}):entry});
      renderDocuments();
      showSaveNotice('ファイル名を変更しました');
      window.refreshBoardLatestUpdate?.();
      return true;
    }catch(e){alert(e.message||'ファイル名を変更できませんでした。');return false}
  }

  addEvent.addEventListener('click',async function(){
    const coachPassword=await requireCoachPassword();
    if(!coachPassword)return;
    resetFormMode(false);
    activeCoachPassword=coachPassword;
    form.hidden=false;
    addEvent.hidden=true;
    eventTitle.focus();
  });

  editCancel.addEventListener('click',function(){
    resetFormMode();
  });

  form.addEventListener('submit',async function(event){
    event.preventDefault();
    const title=eventTitle.value.trim();
    if(!selectedDate||!title)return;
    const coachPassword=activeCoachPassword||await requireCoachPassword();
    if(!coachPassword)return;
    const editingId=editingEventId;
    const grades=Array.from(form.querySelectorAll('input[name="meetingGrade"]:checked')).map(function(input){return input.value});
    if(!grades.length){
      alert('対象学年を選択してください。');
      return;
    }
    formSave.disabled=true;formSave.textContent=editingId?'変更中...':'保存中...';
    try{
      const response=await fetch(SCHEDULE_API,{
        method:'POST',headers:accessHeaders(true,coachPassword),
        body:JSON.stringify({action:'saveBoardMeetingEvent',event:{id:editingId||undefined,date:selectedDate,title,grades,time:eventTime.value.trim(),place:eventPlace.value.trim(),memo:eventMemo.value.trim()}})
      });
      const body=await response.json().catch(function(){return {}});
      if(!response.ok)throw new Error(body.error||(editingId?'予定を変更できませんでした。':'予定を保存できませんでした。'));
      events=Array.isArray(body.data)?body.data:events;
      resetFormMode();
      renderDayList();
      renderCalendar();
      showSaveNotice(editingId?'予定の変更を保存しました':'予定を保存しました');
      window.refreshBoardLatestUpdate?.();
    }catch(e){alert(e.message||(editingId?'予定を変更できませんでした。':'予定を保存できませんでした。'))}
    finally{
      formSave.disabled=false;
      formSave.textContent=editingEventId?'変更を保存':'予定を保存';
    }
  });

  async function deleteEvent(item){
    const coachPassword=await requireCoachPassword();
    if(!coachPassword)return;
    if(!confirm('「'+(item.title||'事務局予定')+'」を削除しますか？'))return;
    try{
      const response=await fetch(SCHEDULE_API,{
        method:'POST',headers:accessHeaders(true,coachPassword),
        body:JSON.stringify({action:'deleteBoardMeetingEvent',id:item.id})
      });
      const body=await response.json().catch(function(){return {}});
      if(!response.ok)throw new Error(body.error||'予定を削除できませんでした。');
      events=Array.isArray(body.data)?body.data:events.filter(function(entry){return entry.id!==item.id});
      if(editingEventId===String(item.id||''))resetFormMode();
      renderDayList();renderCalendar();showSaveNotice('予定を削除しました');
    }catch(e){alert(e.message||'予定を削除できませんでした。')}
  }

  prevMonth.addEventListener('click',function(){viewMonth--;if(viewMonth<0){viewMonth=11;viewYear--}renderCalendar()});
  nextMonth.addEventListener('click',function(){viewMonth++;if(viewMonth>11){viewMonth=0;viewYear++}renderCalendar()});
  editorClose.addEventListener('click',closeEditor);
  editor.addEventListener('click',function(event){if(event.target===editor)closeEditor()});
  renderCalendar();
  loadData();
})();
