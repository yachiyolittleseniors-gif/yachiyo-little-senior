(function(){
  const API='/.netlify/functions/site-data?section=duty-roster';
  const list=document.getElementById('dutyRosterList');
  const tableList=document.getElementById('dutyRosterTableList');
  const adminList=document.getElementById('dutyRosterAdminList');
  const fileInput=document.getElementById('dutyRosterImageInput');
  const saveBtn=document.getElementById('saveDutyRosterBtn');
  const panel=document.getElementById('densukeAdminPanel');
  const changeSection=document.getElementById('dutyChangeSection');
  const changeList=document.getElementById('dutyChangeList');
  const changeYear=document.getElementById('dutyChangeYear');
  const changeGrade=document.getElementById('dutyChangeGrade');
  const changeText=document.getElementById('dutyChangeText');
  const pasteChangeBtn=document.getElementById('pasteDutyChangeBtn');
  const changePreview=document.getElementById('dutyChangePreview');
  const saveChangesBtn=document.getElementById('saveDutyChangesBtn');
  const changeAdminList=document.getElementById('dutyChangeAdminList');
  const CACHE_KEY='yachiyoDutyRosterCacheV2';
  let images=[];
  let changes=[];
  let parsedChanges=[];
  let requests=[];


  if(!list||!tableList||!adminList||!fileInput||!saveBtn||!panel||!changeSection||!changeList||!changeYear||!changeGrade||!changeText||!pasteChangeBtn||!changePreview||!saveChangesBtn||!changeAdminList)return;

  function cleanName(value){return window.DutyRosterData.cleanName(value)}
  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,function(char){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]})}


  function displayName(value,grade){
    const name=cleanName(value);
    const key=name.replace(/[()]/g,'');
    const matches=new Set();
    images.forEach(function(image){
      const table=image.table;if(!table)return;
      const grades=table.grades||[2,1];
      table.rows.forEach(function(row){
        row.slice(2,6).forEach(function(candidate,index){
          if(String(grades[Math.floor(index/2)])!==String(grade))return;
          const normalized=cleanName(candidate);
          if(/\([^()]+\)/.test(normalized)&&normalized.replace(/[()]/g,'')===key)matches.add(normalized);
        });
      });
    });
    const result=matches.size===1?Array.from(matches)[0]:name;
    return result.replace(/\(/g,'（').replace(/\)/g,'）');
  }

  function normalize(raw){
    const imageList=raw&&raw.initialized===true&&Array.isArray(raw.images)?raw.images:[];
    const changeItems=raw&&raw.initialized===true&&Array.isArray(raw.changes)?raw.changes:[];
    return{
      images:imageList.filter(function(item){return item&&typeof item==='object'&&(item.data||item.src)}).slice(0,8).map(function(item,index){return{id:String(item.id||('duty-'+index)),name:String(item.name||('当番表 '+(index+1))),data:item.data?String(item.data):'',src:item.src?String(item.src):'',table:window.DutyRosterData.tableForImage(item)}}),
      changes:changeItems.filter(function(item){return item&&/^\d{4}-\d{2}-\d{2}$/.test(String(item.date||''))&&['1','2','3'].includes(String(item.grade||''))&&cleanName(item.from)&&cleanName(item.to)}).slice(0,300).map(function(item,index){return{id:String(item.id||('change-'+index)),date:String(item.date),grade:String(item.grade),from:cleanName(item.from),to:cleanName(item.to),createdAt:String(item.createdAt||'')}}),
      requests:Array.isArray(raw&&raw.requests)?raw.requests.filter(function(item){return item&&/^\d{4}-\d{2}-\d{2}$/.test(String(item.date||''))&&['1','2','3'].includes(String(item.grade||''))&&cleanName(item.from)&&cleanName(item.to)}).slice(0,200).map(function(item,index){return{id:String(item.id||('request-'+index)),date:String(item.date),grade:String(item.grade),from:cleanName(item.from),to:cleanName(item.to),note:String(item.note||'').slice(0,200),status:['pending','approved','rejected'].includes(String(item.status))?String(item.status):'pending',createdAt:String(item.createdAt||''),updatedAt:String(item.updatedAt||'')}}):[]
    };
  }

  function imageSource(item){return item.data||item.src||''}
  function adminImageLabel(item,index){const table=item&&item.table;const title=table&&Number(table.year)&&Number(table.month)?table.year+'年'+table.month+'月 当番表':String(item&&item.name||('当番表 '+(index+1)));return(index+1)+'番目　'+title}
  function imageSourceKey(item){const source=imageSource(item);return String(item.id)+'-'+source.length+'-'+source.slice(-24)}
  function sortChanges(items){return items.slice().sort(function(a,b){const at=new Date(a.createdAt||'').getTime(),bt=new Date(b.createdAt||'').getTime();if(Number.isFinite(at)&&Number.isFinite(bt)&&at!==bt)return bt-at;if(Number.isFinite(at)!==Number.isFinite(bt))return Number.isFinite(bt)?1:-1;return b.date.localeCompare(a.date)||Number(b.grade)-Number(a.grade)||a.from.localeCompare(b.from,'ja')})}
  function displayDate(value){const parts=String(value||'').split('-').map(Number);if(parts.length!==3)return value;const date=new Date(parts[0],parts[1]-1,parts[2]);return parts[1]+'/'+parts[2]+'（'+'日月火水木金土'[date.getDay()]+'）'}

  function changeUpdatedMarkup(item){
    const date=new Date(item.createdAt||'');
    if(Number.isNaN(date.getTime()))return'<span class="duty-change-updated">更新日時：記録なし</span>';
    const label=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
    return'<time class="duty-change-updated" datetime="'+date.toISOString()+'">更新：'+label+'</time>';
  }

  function changeMarkup(item){return'<span class="duty-change-date">'+displayDate(item.date)+'</span><span class="duty-change-grade">'+item.grade+'年生</span><span class="duty-change-names"><span class="duty-change-before">'+escapeHtml(displayName(item.from,item.grade))+'</span><b class="duty-change-arrow">→</b><span class="duty-change-after">'+escapeHtml(displayName(item.to,item.grade))+'</span></span>'}

  function tableDate(table,day){return table.year+'-'+String(table.month).padStart(2,'0')+'-'+String(day).padStart(2,'0')}
  function appliedCell(table,row,grade,column,name){
    const result=window.DutyRosterData.applyChanges(table,row[0],grade,name,changes);
    return{value:displayName(result.value,grade),changed:result.changed,original:displayName(result.original,grade),column:column};
  }
  function renderTables(){
    tableList.innerHTML=images.filter(function(item){return item.table}).map(function(item){const table=item.table;const grades=table.grades||[2,1];
      const rows=table.rows.map(function(row,index){
        const cells=[appliedCell(table,row,grades[0],0,row[2]),appliedCell(table,row,grades[0],1,row[3]),appliedCell(table,row,grades[1],0,row[4]),appliedCell(table,row,grades[1],1,row[5])];
        const cellMarkup=cells.map(function(cell){const title=cell.changed?' title="変更前：'+escapeHtml(cell.original)+'"':'';return'<td class="'+(cell.changed?'is-changed':'')+'"'+title+'><span>'+escapeHtml(cell.value)+'</span></td>'}).join('');
        return'<tr class="'+(table.activityDays.includes(row[0])?'is-activity':'')+'">'+(index===0?'<th class="duty-month" scope="rowgroup" rowspan="'+table.rows.length+'">'+table.month+'月</th>':'')+'<th scope="row">'+row[0]+'</th><td class="duty-weekday duty-weekday-'+row[1]+'">'+row[1]+'</td>'+cellMarkup+'</tr>';
      }).join('');
      const hasChanges=changes.some(function(item){return item.date.startsWith(table.year+'-'+String(table.month).padStart(2,'0')+'-')});
      return'<section class="duty-digital-roster" aria-label="'+table.year+'年'+table.month+'月の当番表"><div class="duty-table-scroll"><table><colgroup><col style="width:12%"><col style="width:8%"><col style="width:8%"><col span="4" style="width:18%"></colgroup><thead><tr><th>'+table.year+'年</th><th>日付</th><th>曜日</th><th colspan="2">'+grades[0]+'年生</th><th colspan="2">'+grades[1]+'年生</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="duty-sheet-note">黄色の日は里山活動日です。駐車場所にご注意ください。'+(hasChanges?'<br>赤字は変更箇所です。':'')+'</div></section>';
    }).join('');
  }

  function saveCache(){try{const value=JSON.stringify({initialized:true,images:images,changes:changes,requests:requests});if(value.length<=4*1024*1024)sessionStorage.setItem(CACHE_KEY,value);else sessionStorage.removeItem(CACHE_KEY)}catch(e){}}
  function loadCache(){try{const cached=normalize(JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null'));if(cached.images.length||cached.changes.length){images=cached.images;changes=cached.changes;requests=cached.requests;render()}}catch(e){sessionStorage.removeItem(CACHE_KEY)}}

  function renderChanges(){
    const ordered=sortChanges(changes);changeSection.hidden=!ordered.length;
    changeList.innerHTML=ordered.map(function(item){return'<div class="duty-change-item">'+changeMarkup(item)+changeUpdatedMarkup(item)+'</div>'}).join('');
    const adminOrdered=ordered;
    changeAdminList.innerHTML=adminOrdered.length?adminOrdered.map(function(item){return'<div class="duty-change-admin-item"><span>'+displayDate(item.date)+'・'+item.grade+'年生　'+escapeHtml(displayName(item.from,item.grade))+' → <b>'+escapeHtml(displayName(item.to,item.grade))+'</b>'+changeUpdatedMarkup(item)+'</span><button type="button" data-remove-duty-change="'+escapeHtml(item.id)+'">取消</button></div>'}).join(''):'<div class="duty-change-preview">登録済みの当番変更はありません。</div>';
    changeAdminList.querySelectorAll('[data-remove-duty-change]').forEach(function(button){button.addEventListener('click',function(){removeChange(button.dataset.removeDutyChange)})});
  }

  function render(){
    adminList.replaceChildren();
    if(!images.length){const empty=document.createElement('div');empty.className='duty-roster-loading';empty.textContent='現在掲載中の当番表はありません。';list.replaceChildren(empty)}
    const existingImages=new Map(Array.from(list.querySelectorAll('.duty-roster-image[data-duty-id]')).map(function(image){return[image.dataset.dutyId,image]}));
    const imageFragment=document.createDocumentFragment();
    images.forEach(function(item,index){
      const sourceKey=imageSourceKey(item);let image=existingImages.get(String(item.id));
      if(!image||image.dataset.sourceKey!==sourceKey){image=document.createElement('img');image.className='duty-roster-image';image.src=imageSource(item);image.dataset.dutyId=String(item.id);image.dataset.sourceKey=sourceKey}
      image.alt=item.name||('当番表 '+(index+1));image.loading=index===0?'eager':'lazy';image.decoding='async';imageFragment.appendChild(image);
      const row=document.createElement('div');row.className='duty-roster-admin-item';const name=document.createElement('span');name.textContent=adminImageLabel(item,index);const actions=document.createElement('div');actions.className='duty-roster-admin-actions';
      const up=document.createElement('button');up.type='button';up.textContent='↑';up.title='上へ';up.disabled=index===0;up.addEventListener('click',function(){move(index,-1)});
      const down=document.createElement('button');down.type='button';down.textContent='↓';down.title='下へ';down.disabled=index===images.length-1;down.addEventListener('click',function(){move(index,1)});
      const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.className='duty-roster-delete';remove.addEventListener('click',function(){removeImage(index)});
      actions.append(up,down,remove);row.append(name,actions);adminList.appendChild(row);
    });
    if(images.length)list.replaceChildren(imageFragment);renderTables();renderChanges();renderRequests();
  }

  async function load(){
    try{await window.boardAccessReady;const accessPassword=sessionStorage.getItem('yachiyoAttendancePass')||'';const response=await fetch(API,{cache:'no-store',headers:{'x-access-password':accessPassword}});if(!response.ok)throw new Error('load failed');const body=await response.json();const normalized=normalize(body.data);images=normalized.images;changes=normalized.changes;requests=normalized.requests;saveCache();render()}catch(e){render()}
  }

  function readAsDataUrl(file){return new Promise(function(resolve,reject){const reader=new FileReader();reader.onload=function(){resolve(String(reader.result||''))};reader.onerror=reject;reader.readAsDataURL(file)})}

  async function persist(successMessage,updateMessage,announceLatest){
    const adminPassword=panel.dataset.adminPassword||'';if(!adminPassword)throw new Error('管理画面を開き直してください。')
    const payload={initialized:true,images:images,changes:changes,requests:requests};if(JSON.stringify(payload).length>7500000){throw new Error('画像の合計容量が大きすぎます。画像を減らしてください。')}
    const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-admin-password':adminPassword},body:JSON.stringify({data:payload,updateMessage:updateMessage||'当番表を更新しました',announceLatest:announceLatest===true})});
    const body=await response.json().catch(function(){return{}});if(!response.ok)throw new Error(body.error||'保存できませんでした。');saveCache();render();showSaveNotice(successMessage||'保存しました');if(announceLatest)window.refreshBoardLatestUpdate?.();return true;
  }

  function validDate(year,month,day){const date=new Date(year,month-1,day);return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day}
  function parseChangeLines(){
    const year=Number(changeYear.value),grade=String(changeGrade.value||''),results=[],errors=[];
    if(!Number.isInteger(year)||year<2020||year>2100)return{results:[],errors:['年を選択してください。']};
    changeText.value.split(/\r?\n/).forEach(function(source){
      const line=source.normalize('NFKC').trim();if(!line)return;
      const match=line.match(/(\d{1,2})\s*(?:\/|月)\s*(\d{1,2})\s*日?(?:\s*[（(〔［【]\s*[日月火水木金土](?:曜(?:日)?)?\s*[）)〕］】])?\s*(.+?)\s*(?:→|⇒|＞|->)\s*(.+?)\s*$/);if(!match)return;
      const month=Number(match[1]),day=Number(match[2]),from=cleanName(match[3]),to=cleanName(match[4]);
      if(!validDate(year,month,day)||!from||!to){errors.push('判定できません：'+source.trim());return}
      results.push({id:'change-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),date:year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0'),grade:grade,from:from,to:to,createdAt:new Date().toISOString()});
    });
    if(changeText.value.trim()&&!results.length&&!errors.length)errors.push('「10/3 山田→佐藤」または「10月3日 山田→佐藤」のような変更行が見つかりませんでした。');return{results:results,errors:errors};
  }

  function changeKey(item){return[item.date,item.from,item.to].join('|')}
  function gradeOptions(selected){return'<option value="">学年を選択</option>'+['3','2','1'].map(function(grade){return'<option value="'+grade+'" '+(selected===grade?'selected':'')+'>'+grade+'年生</option>'}).join('')}
  function updateChangePreview(forceGrade){
    const previousGrades=new Map(parsedChanges.map(function(item){return[changeKey(item),item.grade]}));
    const parsed=parseChangeLines(),batchGrade=String(changeGrade.value||'');
    parsedChanges=parsed.results.map(function(item){return{...item,grade:forceGrade?batchGrade:(previousGrades.get(changeKey(item))||item.grade||batchGrade)}});
    changePreview.classList.toggle('has-items',parsedChanges.length>0);
    const items=parsedChanges.map(function(item,index){return'<div class="duty-change-preview-row"><span>'+displayDate(item.date)+'　'+escapeHtml(displayName(item.from,item.grade))+' → <b>'+escapeHtml(displayName(item.to,item.grade))+'</b></span><select data-duty-preview-grade="'+index+'" aria-label="'+displayDate(item.date)+'の当番枠の学年">'+gradeOptions(item.grade)+'</select></div>'}).join('');
    const errors=parsed.errors.map(function(error){return'<div class="duty-change-preview-error">'+escapeHtml(error)+'</div>'}).join('');
    changePreview.innerHTML=items+errors||(changeText.value.trim()?'変更内容を確認してください。':'変更内容を貼り付けると、ここに確認結果が表示されます。');
    changePreview.querySelectorAll('[data-duty-preview-grade]').forEach(function(select){select.addEventListener('change',function(){const item=parsedChanges[Number(select.dataset.dutyPreviewGrade)];if(item)item.grade=select.value})});
  }

  async function saveChanges(){
    updateChangePreview();if(!parsedChanges.length){alert('保存できる当番変更がありません。');return}if(parsedChanges.some(function(item){return!['1','2','3'].includes(item.grade)})){alert('各変更行の「当番枠の学年」を選択してください。');return}const previous=changes.slice();
    parsedChanges.forEach(function(item){const index=changes.findIndex(function(current){return current.date===item.date&&current.grade===item.grade&&current.from===item.from});if(index>=0)changes[index]={...item,id:changes[index].id};else changes.push(item)});
    saveChangesBtn.disabled=true;saveChangesBtn.textContent='保存中…';
    try{await persist(parsedChanges.length+'件の当番変更を保存しました','当番変更を'+parsedChanges.length+'件反映しました',true);changeText.value='';parsedChanges=[];updateChangePreview()}catch(e){changes=previous;render();alert(e.message||'当番変更を保存できませんでした。')}finally{saveChangesBtn.disabled=false;saveChangesBtn.textContent='確認した変更を保存'}
  }

  async function pasteChangeText(){
    try{
      if(!navigator.clipboard?.readText)throw new Error('clipboard unavailable');
      const text=await navigator.clipboard.readText();
      if(!String(text||'').trim())throw new Error('clipboard empty');
      changeText.value=text;updateChangePreview(false);changeText.focus();
    }catch(e){changeText.focus();alert('入力欄を長押しして「ペースト」を選んでください。')}
  }

  async function removeChange(id){
    const target=changes.find(function(item){return item.id===id});if(!target||!confirm(displayDate(target.date)+'「'+target.from+' → '+target.to+'」を取り消しますか？'))return;
    const previous=changes.slice(),previousRequests=requests.slice();
    changes=changes.filter(function(item){return item.id!==id});
    // 管理画面で正式な当番変更を取り消した場合、対応する「反映済み」申請も処理済み表示から外す。
    // 申請履歴そのものは rejected として保持し、一般画面には表示しない。
    requests=requests.map(function(req){
      const reqFromGrade=String(req.fromGrade||req.grade||'');
      const reqToGrade=String(req.toGrade||req.grade||reqFromGrade||'');
      const targetGrade=String(target.grade||'');
      const targetToGrade=String(target.toGrade||targetGrade||'');
      const matched=req.status==='approved'&&req.date===target.date&&reqFromGrade===targetGrade&&cleanName(req.from)===cleanName(target.from)&&reqToGrade===targetToGrade&&cleanName(req.to)===cleanName(target.to);
      return matched?{...req,status:'rejected',updatedAt:new Date().toISOString(),cancelledByChangeRemoval:true}:req;
    });
    render();
    try{await persist('当番変更を取り消しました','当番変更を取り消しました',true)}catch(e){changes=previous;requests=previousRequests;render();alert(e.message||'当番変更を取り消せませんでした。')}
  }

  async function addImages(){
    const files=Array.from(fileInput.files||[]);if(!files.length){alert('追加する画像を選択してください。');return}if(images.length+files.length>8){alert('当番表は8枚まで保存できます。');return}
    for(const file of files){if(!/^image\/(jpeg|png|webp)$/i.test(file.type)&&!(/\.(jpe?g|png|webp)$/i.test(file.name))){alert('JPEG・PNG・WebP画像を選択してください。');return}if(file.size>4*1024*1024){alert(file.name+' は4MBを超えています。');return}}
    saveBtn.disabled=true;saveBtn.textContent='読み取り・確認中…';const previous=images.slice();
    try{
      const pending=[];
      for(const file of files){
        const data=await readAsDataUrl(file),table=await window.readDutyImage(data);
        if(!table)return;
        if(images.concat(pending).some(item=>item.table&&item.table.year===table.year&&item.table.month===table.month))throw new Error('同じ月の当番表が登録されています。原本一覧を確認してください。');
        pending.push({id:'duty-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),name:file.name,data:data,src:'',table:table});
      }
      images=images.concat(pending);await persist('当番表を保存しました','当番表を更新しました',true);fileInput.value='';
    }catch(e){images=previous;render();alert(e.message||'保存できませんでした。')}finally{saveBtn.disabled=false;saveBtn.textContent='画像から表を作成'}
  }

  async function move(index,direction){const next=index+direction;if(next<0||next>=images.length)return;const previous=images.slice();[images[index],images[next]]=[images[next],images[index]];render();try{await persist('並び順を保存しました','当番表の並び順を変更しました')}catch(e){images=previous;render();alert(e.message||'並び順を保存できませんでした。')}}

  function allRosterNames(){
    const map=new Map();
    images.forEach(function(image){const table=image.table;if(!table)return;const grades=table.grades||[2,1];table.rows.forEach(function(row){row.slice(2,6).forEach(function(name,index){const clean=cleanName(name);if(!clean)return;const grade=String(grades[Math.floor(index/2)]);map.set(grade+'|'+clean,{grade:grade,name:clean})})})});
    return Array.from(map.values()).sort(function(a,b){return Number(b.grade)-Number(a.grade)||a.name.localeCompare(b.name,'ja')});
  }
  function todayYmd(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function rosterDates(){const today=todayYmd(),out=[];images.forEach(function(image){const table=image.table;if(!table)return;table.rows.forEach(function(row){const date=tableDate(table,row[0]);if(date>=today)out.push({date:date,label:table.year+'年'+table.month+'月'+row[0]+'日（'+row[1]+'）',table:table,row:row})})});return out.sort(function(a,b){return a.date.localeCompare(b.date)})}
  function rosterHasMonth(date){return images.some(function(image){return image.table&&date.startsWith(image.table.year+'-'+String(image.table.month).padStart(2,'0')+'-')})}
  function requestStatusLabel(status,date){if(status==='approved')return'反映済み';if(status==='rejected')return'却下';return rosterHasMonth(date)?'確認待ち':'当番表登録待ち'}
  function requestPersonLabel(item, side){
    const grade=String(item[side+'Grade']||item.grade||'');
    const name=String(item[side]||'');
    return (grade?grade+'年・':'')+displayName(name,grade);
  }
  function renderRequests(){
    const statusWrap=document.getElementById('dutyRequestStatus'),statusList=document.getElementById('dutyRequestStatusList'),admin=document.getElementById('dutyRequestAdminList');
    const ordered=requests.slice().sort(function(a,b){return String(b.createdAt).localeCompare(String(a.createdAt))});
    const publicOrdered=ordered.filter(function(item){return item.status!=='rejected'});
    const pendingCount=ordered.filter(function(item){return item.status==='pending'}).length;
    const requestBadge=document.getElementById('dutyRequestPendingBadge');
    if(requestBadge){requestBadge.hidden=pendingCount===0;requestBadge.textContent='確認待ち '+pendingCount+'件'}
    if(statusWrap&&statusList){statusWrap.hidden=!publicOrdered.length;statusList.innerHTML=publicOrdered.map(function(item){const label=requestStatusLabel(item.status,item.date);return'<div class="duty-request-status-item"><b>'+displayDate(item.date)+'</b><br>'+escapeHtml(requestPersonLabel(item,'from'))+' → <b>'+escapeHtml(requestPersonLabel(item,'to'))+'</b><br><b data-status="'+item.status+'">'+label+'</b></div>'}).join('')}
    if(admin){const pending=ordered.filter(function(x){return x.status==='pending'});admin.innerHTML=pending.length?pending.map(function(item){const canApply=rosterHasMonth(item.date);return'<div class="duty-request-admin-item"><b>'+displayDate(item.date)+'</b><br>'+escapeHtml(requestPersonLabel(item,'from'))+' → <b>'+escapeHtml(requestPersonLabel(item,'to'))+'</b>'+(!canApply?'<br><span class="duty-request-wait">当番表登録待ち</span>':'')+'<div class="duty-request-admin-actions"><button type="button" data-approve-duty-request="'+escapeHtml(item.id)+'" '+(canApply?'':'disabled')+'>当番表に反映</button><button class="reject" type="button" data-reject-duty-request="'+escapeHtml(item.id)+'">却下</button></div></div>'}).join(''):'<div class="duty-change-preview">未確認の当番変更申請はありません。</div>';admin.querySelectorAll('[data-approve-duty-request]').forEach(function(b){b.addEventListener('click',function(){decideRequest(b.dataset.approveDutyRequest,true)})});admin.querySelectorAll('[data-reject-duty-request]').forEach(function(b){b.addEventListener('click',function(){decideRequest(b.dataset.rejectDutyRequest,false)})})}
    populateRequestForm();
  }
  function personOptionValue(x){return x.grade+'|'+x.name}
  function parsePersonOption(value){const i=String(value||'').indexOf('|');return i<1?null:{grade:String(value).slice(0,i),name:cleanName(String(value).slice(i+1))}}
  function populateRequestForm(){
    const dateSel=document.getElementById('dutyRequestRosterDate'),fromSel=document.getElementById('dutyRequestFrom'),toSel=document.getElementById('dutyRequestTo');if(!dateSel||!fromSel||!toSel)return;
    const current=dateSel.value;dateSel.innerHTML='<option value="">日付を選択してください</option>'+rosterDates().map(function(x){return'<option value="'+x.date+'">'+x.label+'</option>'}).join('');if(Array.from(dateSel.options).some(function(o){return o.value===current}))dateSel.value=current;
    const names=allRosterNames();let opts='<option value="">選択してください</option>';['3','2','1'].forEach(function(g){const group=names.filter(function(x){return x.grade===g});if(!group.length)return;opts+='<optgroup label="'+g+'年生">'+group.map(function(x){return'<option value="'+escapeHtml(personOptionValue(x))+'">'+g+'年・'+escapeHtml(displayName(x.name,g))+'</option>'}).join('')+'</optgroup>'});
    const fv=fromSel.value,tv=toSel.value;fromSel.innerHTML=opts;toSel.innerHTML=opts;if(Array.from(fromSel.options).some(o=>o.value===fv))fromSel.value=fv;if(Array.from(toSel.options).some(o=>o.value===tv))toSel.value=tv;
  }
  async function submitRequest(){
    const mode=document.querySelector('input[name="dutyRequestMode"]:checked')?.value||'roster',date=mode==='direct'?document.getElementById('dutyRequestDirectDate').value:document.getElementById('dutyRequestRosterDate').value,fromPerson=parsePersonOption(document.getElementById('dutyRequestFrom').value),toPerson=parsePersonOption(document.getElementById('dutyRequestTo').value),btn=document.getElementById('submitDutyRequest'),result=document.getElementById('dutyRequestResult');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!fromPerson||!toPerson)return alert('変更日・変更前・変更後を選択してください。');if(fromPerson.grade===toPerson.grade&&fromPerson.name===toPerson.name)return alert('変更前と変更後は別の方を選択してください。');
    btn.disabled=true;btn.textContent='送信中…';try{const accessPassword=sessionStorage.getItem('yachiyoAttendancePass')||'';const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-access-password':accessPassword},body:JSON.stringify({action:'submitDutyChangeRequest',request:{date:date,fromGrade:fromPerson.grade,from:fromPerson.name,toGrade:toPerson.grade,to:toPerson.name}})});const body=await response.json().catch(function(){return{}});if(!response.ok)throw new Error(body.error||'申請できませんでした。');requests=normalize(body.data).requests;renderRequests();const text='【当番変更連絡】\n'+displayDate(date)+'\n変更前：'+fromPerson.grade+'年・'+displayName(fromPerson.name,fromPerson.grade)+'\n変更後：'+toPerson.grade+'年・'+displayName(toPerson.name,toPerson.grade)+'\n当番変更を申請しました。';result.hidden=false;result.innerHTML='<div class="duty-request-complete"><b>変更申請を受け付けました</b><p>続けて、チームへの連絡のためLINEで変更内容を共有してください。</p><a class="line-share" target="_blank" rel="noopener noreferrer" href="https://line.me/R/share?text='+encodeURIComponent(text)+'">LINEで共有する</a><small>※当番表への正式な反映は管理者確認後となります。</small></div>';}catch(e){alert(e.message||'申請できませんでした。')}finally{btn.disabled=false;btn.textContent='変更申請を送信'}
  }
  async function decideRequest(id,approve){
    const item=requests.find(function(x){return x.id===id});if(!item)return;if(!confirm(approve?'この申請を当番表に反映しますか？':'この申請を却下しますか？'))return;const previousReq=requests.slice(),previousChanges=changes.slice();item.status=approve?'approved':'rejected';item.updatedAt=new Date().toISOString();if(approve){const slotGrade=String(item.fromGrade||item.grade||'');const idx=changes.findIndex(function(x){return x.date===item.date&&x.grade===slotGrade&&x.from===item.from});const change={id:idx>=0?changes[idx].id:'change-'+Date.now().toString(36),date:item.date,grade:slotGrade,from:item.from,to:item.to,toGrade:String(item.toGrade||item.grade||slotGrade),createdAt:new Date().toISOString()};if(idx>=0)changes[idx]=change;else changes.push(change)}render();try{await persist(approve?'申請を当番表に反映しました':'申請を却下しました',approve?'当番変更を反映しました':'当番変更申請を却下しました',approve)}catch(e){requests=previousReq;changes=previousChanges;render();alert(e.message||'処理できませんでした。')}
  }
  async function removeImage(index){
    const target=images[index];if(!target)return;
    const key=target.table?target.table.year+'-'+String(target.table.month).padStart(2,'0'):null;
    const deleteHistory=key&&!images.some((item,i)=>i!==index&&item.table&&item.table.year===target.table.year&&item.table.month===target.table.month);
    if(!confirm('「'+target.name+'」を削除しますか？'+(deleteHistory?' '+key+'の表と変更履歴も削除します。':'')))return;
    const previous=images.slice(),previousChanges=changes.slice();images.splice(index,1);
    if(deleteHistory)changes=changes.filter(item=>!item.date.startsWith(key+'-'));
    try{await persist('当番表と関連する変更履歴を削除しました','当番表を削除しました')}catch(e){images=previous;changes=previousChanges;render();alert(e.message)}
  }

  changeYear.value=String(new Date().getFullYear());
  const adminHistoryToggle=document.getElementById('toggleDutyAdminHistory');
  if(adminHistoryToggle&&changeAdminList){
    changeAdminList.hidden=true;
    adminHistoryToggle.setAttribute('aria-expanded','false');
    adminHistoryToggle.textContent='表示 ▼';
    adminHistoryToggle.addEventListener('click',function(){
      const open=changeAdminList.hidden;
      changeAdminList.hidden=!open;
      adminHistoryToggle.setAttribute('aria-expanded',String(open));
      adminHistoryToggle.textContent=open?'非表示 ▲':'表示 ▼';
    });
  }
  const historyToggle=document.getElementById('toggleDutyHistory');
  const historyContent=document.getElementById('dutyHistoryContent');
  if(historyToggle&&historyContent)historyToggle.addEventListener('click',function(){
    const open=historyContent.hidden;
    historyContent.hidden=!open;
    historyToggle.setAttribute('aria-expanded',String(open));
    historyToggle.textContent=open?'変更履歴を閉じる':'変更履歴を確認する';
  });
  const originalsToggle=document.getElementById('toggleDutyOriginals');
  const originalsPanel=document.getElementById('dutyRosterOriginals');
  if(originalsToggle&&originalsPanel)originalsToggle.addEventListener('click',function(){
    const open=originalsPanel.hidden;
    originalsPanel.hidden=!open;
    originalsToggle.setAttribute('aria-expanded',String(open));
    originalsToggle.textContent=open?'原本を閉じる':'原本を見る';
  });
  [changeYear,changeText].forEach(function(element){element.addEventListener('input',function(){updateChangePreview(false)});element.addEventListener('change',function(){updateChangePreview(false)})});
  changeGrade.addEventListener('change',function(){updateChangePreview(true)});
  const requestToggle=document.getElementById('toggleDutyRequest'),requestContent=document.getElementById('dutyRequestContent'),requestStatusToggle=document.getElementById('toggleDutyRequestStatus'),requestStatusList=document.getElementById('dutyRequestStatusList');
  if(requestToggle&&requestContent)requestToggle.addEventListener('click',function(){const open=requestContent.hidden;requestContent.hidden=!open;requestToggle.setAttribute('aria-expanded',String(open));requestToggle.textContent=open?'閉じる':'申請する';populateRequestForm()});
  if(requestStatusToggle&&requestStatusList)requestStatusToggle.addEventListener('click',function(){const open=requestStatusList.hidden;requestStatusList.hidden=!open;requestStatusToggle.setAttribute('aria-expanded',String(open));requestStatusToggle.textContent=open?'申請状況を閉じる':'申請状況を見る'});
  const directDate=document.getElementById('dutyRequestDirectDate'),rosterDate=document.getElementById('dutyRequestRosterDate');if(directDate){directDate.min=todayYmd();if(!directDate.value||directDate.value<directDate.min)directDate.value=directDate.min}function syncDutyRequestDateMode(){const mode=document.querySelector('input[name="dutyRequestMode"]:checked')?.value||'roster',direct=mode==='direct';if(rosterDate){rosterDate.hidden=direct;rosterDate.disabled=direct}if(directDate){directDate.hidden=!direct;directDate.disabled=!direct}}document.querySelectorAll('input[name="dutyRequestMode"]').forEach(function(r){r.addEventListener('change',syncDutyRequestDateMode)});syncDutyRequestDateMode();
  document.getElementById('dutyRequestRosterDate')?.addEventListener('change',populateRequestForm);document.getElementById('submitDutyRequest')?.addEventListener('click',submitRequest);
  pasteChangeBtn.addEventListener('click',pasteChangeText);
  saveChangesBtn.addEventListener('click',saveChanges);saveBtn.addEventListener('click',addImages);loadCache();render();load();
})();
