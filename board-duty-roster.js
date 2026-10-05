/* duty-month-grades-integration:20261005-1 */
(function(){
  const API='/.netlify/functions/site-data?section=duty-roster';
  const REQUEST_API='/.netlify/functions/duty-change-requests';
  const REQUESTER_DEVICE_KEY='ylsDutyRequesterDeviceToken';
  function requesterDeviceToken(){
    try{
      let token=localStorage.getItem(REQUESTER_DEVICE_KEY)||'';
      if(!token){
        token=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
        localStorage.setItem(REQUESTER_DEVICE_KEY,token);
      }
      return token;
    }catch(_){return''}
  }
  async function applyDutyRequestPublicSetting(){const box=document.getElementById('dutyRequestBox'),note=document.getElementById('dutyRequestPublicNote');try{const r=await fetch('/.netlify/functions/site-data?section=admin-visibility-settings',{cache:'no-store'}),j=await r.json();const enabled=!!(r.ok&&j&&j.data&&j.data.dutyRequestPublic===true);if(box)box.hidden=!enabled;if(note)note.hidden=!enabled}catch(e){if(box)box.hidden=true;if(note)note.hidden=true}}
  applyDutyRequestPublicSetting();
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
  let replacementFamilies=null;
  let replacementFamiliesFailed=false;
  window.getDutyRosterGradesForMonth=function(year,month){
    return window.DutyGradePolicy.defaultGrades(images,year,month,window.DutyRosterData.tableForImage);
  };
  let changes=[];
  let parsedChanges=[];
  let requests=[];
  let requestsLoaded=false;
  let partnerApprovalEnabled=false;
  let dutyChangeMutationInFlight=false;
  function syncDutyRequestOperationNote(){
    const note=document.getElementById('dutyRequestOperationNote');
    if(!note)return;
    note.textContent=partnerApprovalEnabled
      ? '※当番表が登録されている月のみ変更申請ができます。通常は変更後のご家庭へ個別LINEで承認リンクを送ってください。LINEを利用できない場合は、申請画面の「LINEを利用できない方」を開き、チェックして申請してください。申請後、表示された申請番号を管理者へお知らせください。管理者が確認後、当番表へ反映します。'
      : '※当番表が登録されている月のみ変更申請ができます。申請後は、必ず全体LINEでご連絡ください。全体LINEでの連絡がない場合、変更は完了しません。';
  }


  if(!list||!tableList||!adminList||!fileInput||!saveBtn||!panel||!changeSection||!changeList||!changeAdminList)return;

  function cleanName(value){return window.DutyRosterData.cleanName(value)}
  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,function(char){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]})}


  function displayName(value,grade){
    const name=cleanName(value);
    const key=name.replace(/[()]/g,'');
    const matches=new Set();
    images.forEach(function(image){
      if(!canViewRoster(image))return;
      const table=image.table;if(!table)return;
      const grades=table.grades||[2,1];
      table.rows.forEach(function(row){
        row.slice(2,2+grades.length*2).forEach(function(candidate,index){
          if(String(grades[Math.floor(index/2)])!==String(grade))return;
          const normalized=cleanName(candidate);
          if(/\([^()]+\)/.test(normalized)&&normalized.replace(/[()]/g,'')===key)matches.add(normalized);
        });
      });
    });
    const result=matches.size===1?Array.from(matches)[0]:name;
    return result.replace(/\(/g,'（').replace(/\)/g,'）');
  }

  function octoberDisplayName(value,grade,dateOrTable){
    let name=displayName(value,grade).replace(/[（）()]/g,'');
    let isOctober=false;
    if(dateOrTable&&typeof dateOrTable==='object'){
      isOctober=Number(dateOrTable.year)===2026&&Number(dateOrTable.month)===10;
    }else{
      isOctober=/^2026-10-/.test(String(dateOrTable||''));
    }
    if(isOctober){
      if(String(grade)==='1'&&name==='石川')name='石川晃';
      if(String(grade)==='2'&&name==='石川圭')name='石川';
    }
    return name;
  }

  function normalize(raw){
    const imageList=raw&&raw.initialized===true&&Array.isArray(raw.images)?raw.images:[];
    const changeItems=raw&&raw.initialized===true&&Array.isArray(raw.changes)?raw.changes:[];
    return{
      images:imageList.filter(function(item){return item&&typeof item==='object'&&(item.data||item.src)}).slice(0,8).map(function(item,index){return{id:String(item.id||('duty-'+index)),name:String(item.name||('当番表 '+(index+1))),data:item.data?String(item.data):'',src:item.src?String(item.src):'',testMode:item.testMode===true,table:window.DutyRosterData.tableForImage(item)}}),
      changes:changeItems.filter(function(item){return item&&/^\d{4}-\d{2}-\d{2}$/.test(String(item.date||''))&&['1','2','3'].includes(String(item.grade||''))&&cleanName(item.from)&&cleanName(item.to)&&!(String(item.date)==='2026-10-24'&&cleanName(item.from)==='齋藤'&&cleanName(item.to)==='荒木')}).slice(0,300).map(function(item,index){return{id:String(item.id||('change-'+index)),requestNo:String(item.requestNo||'').slice(0,20),date:String(item.date),grade:String(item.grade),from:cleanName(item.from),to:cleanName(item.to),toGrade:String(item.toGrade||item.grade||''),status:String(item.status||'active')==='cancelled'?'cancelled':'active',createdAt:String(item.createdAt||''),cancelledAt:String(item.cancelledAt||'')}})
    };
  }

  function normalizeRequestList(items){
    return (Array.isArray(items)?items:[]).filter(function(item){
      return item&&/^\d{4}-\d{2}-\d{2}$/.test(String(item.date||''))&&['1','2','3'].includes(String(item.fromGrade||''))&&['1','2','3'].includes(String(item.toGrade||''))&&cleanName(item.fromName)&&cleanName(item.toName);
    }).slice(0,300).map(function(item,index){
      return{id:String(item.id||('request-'+index)),requestNo:String(item.requestNo||'').slice(0,20),date:String(item.date),fromGrade:String(item.fromGrade),fromName:cleanName(item.fromName),toGrade:String(item.toGrade),toName:cleanName(item.toName),requestType:String(item.requestType||'replace')==='swap'?'swap':'replace',swapDate:String(item.swapDate||''),swapGrade:String(item.swapGrade||''),swapName:cleanName(item.swapName||''),status:['pending','approved','rejected'].includes(String(item.status))?String(item.status):'pending',createdAt:String(item.createdAt||''),updatedAt:String(item.updatedAt||''),approvalExpiresAt:String(item.approvalExpiresAt||''),approvalMode:String(item.approvalMode||'admin')==='family'?'family':'admin',requesterCanCancel:item.requesterCanCancel===true,noLineFallback:item.noLineFallback===true};
    });
  }

  function isAdminViewing(){
    return !!(
      (window.YLSAdminSession&&typeof window.YLSAdminSession.isActive==='function'&&window.YLSAdminSession.isActive()) ||
      (panel&&panel.dataset&&panel.dataset.adminPassword)
    );
  }
  function testMonthKey(item){const t=item&&item.table;return t&&Number(t.year)&&Number(t.month)?t.year+'-'+String(t.month).padStart(2,'0'):''}
  function isTestMonth(year,month){const key=Number(year)+'-'+String(Number(month)).padStart(2,'0');return images.some(function(item){return item.testMode===true&&testMonthKey(item)===key})}
  window.getDutyRosterTestModeForMonth=function(year,month){return isTestMonth(year,month)};
  window.setDutyRosterTestModeForMonth=async function(year,month,enabled){
    const y=Number(year),m=Number(month),next=enabled===true;
    const index=images.findIndex(function(item){
      return item&&item.table&&Number(item.table.year)===y&&Number(item.table.month)===m;
    });
    if(index<0)return false;

    const previousImages=images.map(function(item){return Object.assign({},item)});
    const previousChanges=changes.map(function(item){return Object.assign({},item)});
    const monthKey=y+'-'+String(m).padStart(2,'0');

    // A test roster is disposable test data. Turning the checkbox off ends the
    // test and removes that month's test roster/changes instead of publishing it.
    if(!next&&images[index].testMode===true){
      dutyChangeMutationInFlight=true;
      try{
        images.splice(index,1);
        changes=changes.filter(function(item){return !String(item.date||'').startsWith(monthKey+'-')});
        render();
        await persist('テストモードを終了しました','テスト用当番表を終了しました',false);

        // Close test requests for the removed month so they cannot reappear later.
        const monthRequests=requests.filter(function(item){return String(item.date||'').startsWith(monthKey+'-')});
        for(const requestItem of monthRequests){
          try{
            const response=await fetch(REQUEST_API,{
              method:'POST',
              credentials:'same-origin',
              headers:requestHeaders(true),
              body:JSON.stringify({action:'close',id:requestItem.id})
            });
            const body=await response.json().catch(function(){return{}});
            if(response.ok&&Array.isArray(body.requests)){
              requests=normalizeRequestList(body.requests);
            }
          }catch(_){}
        }
        requests=requests.filter(function(item){return !String(item.date||'').startsWith(monthKey+'-')});
        requestsLoaded=true;
        renderRequests();
        syncPendingRequestCount();
        return true;
      }catch(e){
        images=previousImages;
        changes=previousChanges;
        render();
        throw e;
      }finally{
        dutyChangeMutationInFlight=false;
      }
    }

    // Checking the box for an already-saved month only changes it to test mode.
    images[index]={...images[index],testMode:next};
    render();
    try{
      await persist(
        next?'テストモードに切り替えました':'テストモードを終了しました',
        next?'当番表をテストモードに切り替えました':'当番表のテストモードを終了しました',
        false
      );
      return true;
    }catch(e){
      images=previousImages;
      changes=previousChanges;
      render();
      throw e;
    }
  };
  function isTestDate(date){const key=String(date||'').slice(0,7);return images.some(function(item){return item.testMode===true&&testMonthKey(item)===key})}
  function canViewRoster(item){return !item.testMode||isAdminViewing()}
  function imageSource(item){return item.data||item.src||''}
  function adminImageLabel(item,index){const table=item&&item.table;const title=table&&Number(table.year)&&Number(table.month)?table.year+'年'+table.month+'月 当番表':String(item&&item.name||('当番表 '+(index+1)));return(index+1)+'番目　'+title+(item&&item.testMode?'　【テスト】':'')}
  function imageSourceKey(item){const source=imageSource(item);return String(item.id)+'-'+source.length+'-'+source.slice(-24)}
  function sortChanges(items){return items.slice().sort(function(a,b){const at=new Date(a.createdAt||'').getTime(),bt=new Date(b.createdAt||'').getTime();if(Number.isFinite(at)&&Number.isFinite(bt)&&at!==bt)return bt-at;if(Number.isFinite(at)!==Number.isFinite(bt))return Number.isFinite(bt)?1:-1;return b.date.localeCompare(a.date)||Number(b.grade)-Number(a.grade)||a.from.localeCompare(b.from,'ja')})}
  function displayDate(value){const parts=String(value||'').split('-').map(Number);if(parts.length!==3)return value;const date=new Date(parts[0],parts[1]-1,parts[2]);return parts[1]+'/'+parts[2]+'（'+'日月火水木金土'[date.getDay()]+'）'}

  function changeUpdatedMarkup(item){
    const date=new Date(item.createdAt||'');
    if(Number.isNaN(date.getTime()))return'<span class="duty-change-updated">更新日時：記録なし</span>';
    const label=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
    return'<time class="duty-change-updated" datetime="'+date.toISOString()+'">更新：'+label+'</time>';
  }

  function changeMarkup(item){return'<span class="duty-change-date">'+displayDate(item.date)+'</span><span class="duty-change-grade">'+item.grade+'年生</span><span class="duty-change-names"><span class="duty-change-before">'+escapeHtml(octoberDisplayName(item.from,item.grade,item.date))+'</span><b class="duty-change-arrow">→</b><span class="duty-change-after">'+escapeHtml(octoberDisplayName(item.to,item.toGrade||item.grade,item.date))+'</span></span>'}

  function tableDate(table,day){return table.year+'-'+String(table.month).padStart(2,'0')+'-'+String(day).padStart(2,'0')}
  function appliedCell(table,row,grade,column,name){
    const result=window.DutyRosterData.applyChanges(table,row[0],grade,name,changes);
    return{value:octoberDisplayName(result.value,grade,table),changed:result.changed,original:octoberDisplayName(result.original,grade,table),column:column};
  }
  function isPublicRosterActive(item,now=new Date()){
    const table=item&&item.table;if(!table||!Number(table.year)||!Number(table.month)||!Array.isArray(table.rows)||!table.rows.length)return true;
    const lastDay=Math.max.apply(null,table.rows.map(function(row){return Number(row&&row[0])||0}));
    if(!lastDay)return true;
    const end=new Date(Number(table.year),Number(table.month)-1,lastDay,23,59,59,999);
    return now<=end;
  }
  function renderTables(){
    tableList.innerHTML=images.filter(function(item){return item.table&&isPublicRosterActive(item)&&canViewRoster(item)}).map(function(item){const table=item.table;const grades=table.grades||[2,1];
      const rows=table.rows.map(function(row,index){
        const cells=grades.flatMap(function(grade,group){return [0,1].map(function(column){return appliedCell(table,row,grade,column,row[2+group*2+column]);});});
        const cellMarkup=cells.map(function(cell){const title=cell.changed?' title="変更前：'+escapeHtml(cell.original)+'"':'';return'<td class="'+(cell.changed?'is-changed':'')+'"'+title+'><span>'+escapeHtml(cell.value)+'</span></td>'}).join('');
        return'<tr class="'+(table.activityDays.includes(row[0])?'is-activity':'')+'">'+(index===0?'<th class="duty-month" scope="rowgroup" rowspan="'+table.rows.length+'">'+table.month+'月</th>':'')+'<th scope="row">'+row[0]+'</th><td class="duty-weekday duty-weekday-'+row[1]+'">'+row[1]+'</td>'+cellMarkup+'</tr>';
      }).join('');
      const hasChanges=changes.some(function(item){return item.date.startsWith(table.year+'-'+String(table.month).padStart(2,'0')+'-')});
      return'<section class="duty-digital-roster'+(grades.length===3?' has-three-grades':'')+'" aria-label="'+table.year+'年'+table.month+'月の当番表"><div class="duty-table-scroll"><table><colgroup><col style="width:12%"><col style="width:8%"><col style="width:8%"><col span="'+(grades.length*2)+'" style="width:'+(72/(grades.length*2))+'%"></colgroup><thead><tr><th>'+table.year+'年</th><th>日付</th><th>曜日</th>'+grades.map(function(grade){return'<th colspan="2">'+grade+'年生</th>';}).join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div><div class="duty-sheet-note">黄色の日は里山活動日です。駐車場所にご注意ください。'+(hasChanges?'<br>赤字は変更箇所です。':'')+'</div></section>';
    }).join('');
  }

  function cleanupExpiredImages(now=new Date()){
    const cutoffYear=now.getFullYear()-1,cutoffMonth=now.getMonth()+1;
    const before=images.length;
    images=images.filter(function(item){
      const table=item&&item.table;if(!table||!Number(table.year)||!Number(table.month))return true;
      return Number(table.year)>cutoffYear||(Number(table.year)===cutoffYear&&Number(table.month)>=cutoffMonth);
    });
    return images.length!==before;
  }
  function saveCache(){try{const value=JSON.stringify({initialized:true,images:images,changes:changes});if(value.length<=4*1024*1024)sessionStorage.setItem(CACHE_KEY,value);else sessionStorage.removeItem(CACHE_KEY)}catch(e){}}
  function loadCache(){try{const cached=normalize(JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null'));if(cached.images.length||cached.changes.length){images=cached.images;changes=cached.changes;render()}}catch(e){sessionStorage.removeItem(CACHE_KEY)}}

  function renderChanges(){
    // 通常表示は「今日以降」の変更だけにする。履歴データ自体は削除せず管理画面に保持する。
    const today=new Date(),todayKey=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
    const ordered=sortChanges(changes),activeOrdered=ordered.filter(function(item){return item.status!=='cancelled'&&item.date>=todayKey&&(!isTestDate(item.date)||isAdminViewing())});changeSection.hidden=!activeOrdered.length;
    changeList.innerHTML=activeOrdered.map(function(item){return'<div class="duty-change-item">'+changeMarkup(item)+changeUpdatedMarkup(item)+'</div>'}).join('');
    // 管理画面の「登録済み変更履歴」も、公開中の当番表が存在する月だけ表示する。
    // 当番表の最終日を過ぎて公開表示から消えた月（例：9月）は履歴も同時に非表示にする。
    const activeRosterMonths=new Set(images.filter(function(item){return item.table&&isPublicRosterActive(item)}).map(function(item){return item.table.year+'-'+String(item.table.month).padStart(2,'0')}));
    const adminOrdered=ordered.filter(function(item){return item.status!=='cancelled'&&activeRosterMonths.has(String(item.date||'').slice(0,7))});
    changeAdminList.innerHTML=adminOrdered.length?adminOrdered.map(function(item){return'<div class="duty-change-admin-item"><span>'+displayDate(item.date)+'・'+item.grade+'年生　'+escapeHtml(octoberDisplayName(item.from,item.grade,item.date))+' → <b>'+escapeHtml(octoberDisplayName(item.to,item.toGrade||item.grade,item.date))+'</b>'+changeUpdatedMarkup(item)+'</span><div class="duty-change-admin-buttons"><button type="button" data-cancel-duty-change="'+escapeHtml(item.id)+'">取消</button></div></div>'}).join(''):'<div class="duty-change-preview">登録済みの当番変更はありません。</div>';
    changeAdminList.querySelectorAll('[data-cancel-duty-change]').forEach(function(button){button.addEventListener('click',function(){cancelChange(button.dataset.cancelDutyChange)})});
  }

  function render(){
    adminList.replaceChildren();
    const visibleImages=images.filter(function(item){return canViewRoster(item)});if(!visibleImages.length){const empty=document.createElement('div');empty.className='duty-roster-loading';empty.textContent='現在掲載中の当番表はありません。';list.replaceChildren(empty)}
    const existingImages=new Map(Array.from(list.querySelectorAll('.duty-roster-image[data-duty-id]')).map(function(image){return[image.dataset.dutyId,image]}));
    const imageFragment=document.createDocumentFragment();
    images.forEach(function(item,index){
      const sourceKey=imageSourceKey(item);let image=existingImages.get(String(item.id));
      if(!image||image.dataset.sourceKey!==sourceKey){image=document.createElement('img');image.className='duty-roster-image';image.src=imageSource(item);image.dataset.dutyId=String(item.id);image.dataset.sourceKey=sourceKey}
      image.alt=item.name||('当番表 '+(index+1));image.loading=index===0?'eager':'lazy';image.decoding='async';if(isPublicRosterActive(item)&&canViewRoster(item))imageFragment.appendChild(image);
      const row=document.createElement('div');row.className='duty-roster-admin-item'+(item.testMode?' is-test-mode':'');const name=document.createElement('span');name.textContent=adminImageLabel(item,index);const actions=document.createElement('div');actions.className='duty-roster-admin-actions';
      const up=document.createElement('button');up.type='button';up.textContent='↑';up.title='上へ';up.disabled=index===0;up.addEventListener('click',function(){move(index,-1)});
      const down=document.createElement('button');down.type='button';down.textContent='↓';down.title='下へ';down.disabled=index===images.length-1;down.addEventListener('click',function(){move(index,1)});
      const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.className='duty-roster-delete';remove.addEventListener('click',function(){removeImage(index)});
      actions.append(up,down,remove);row.append(name,actions);
      // 公開期間が終了した原本は1年間データ保管するが、管理画面の一覧には表示しない。
      if(isPublicRosterActive(item))adminList.appendChild(row);
    });
    if(images.length){list.replaceChildren(imageFragment);if(!list.childElementCount){const empty=document.createElement('div');empty.className='duty-roster-loading';empty.textContent='現在掲載中の当番表はありません。';list.appendChild(empty)}}renderTables();renderChanges();renderRequests();
  }

  async function load(){
    if(dutyChangeMutationInFlight)return;
    try{
      await window.boardAccessReady;
      const accessPassword=sessionStorage.getItem('yachiyoAttendancePass')||'';
      const adminPassword=panel.dataset.adminPassword||'';
      const headers={'x-access-password':accessPassword};
      if(adminPassword)headers['x-admin-password']=adminPassword;
      const response=await fetch(API,{cache:'no-store',headers:headers});
      if(!response.ok)throw new Error('load failed');
      const body=await response.json(),normalized=normalize(body.data);
      images=normalized.images;changes=normalized.changes;
      const cleaned=cleanupExpiredImages();saveCache();render();syncPendingRequestCount();loadRequests();
      if(cleaned&&panel.dataset.adminPassword){persist('','期限切れの当番表原本を整理しました',false).catch(function(){})}
    }catch(e){render();syncPendingRequestCount();loadRequests()}
  }

  function readAsDataUrl(file){return new Promise(function(resolve,reject){const reader=new FileReader();reader.onload=function(){resolve(String(reader.result||''))};reader.onerror=reject;reader.readAsDataURL(file)})}

  async function persist(successMessage,updateMessage,announceLatest){
    const adminPassword=panel.dataset.adminPassword||'';if(!adminPassword)throw new Error('管理画面を開き直してください。')
    const payload={initialized:true,images:images,changes:changes};if(JSON.stringify(payload).length>7500000){throw new Error('画像の合計容量が大きすぎます。画像を減らしてください。')}
    const response=await fetch(API,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-admin-password':adminPassword},body:JSON.stringify({data:payload,updateMessage:updateMessage||'当番表を更新しました',announceLatest:announceLatest===true})});
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

  async function cancelChange(id){
    const target=changes.find(function(item){return item.id===id});
    if(!target||target.status==='cancelled')return;
    const linked=target.requestNo
      ?changes.filter(function(item){return item.requestNo===target.requestNo&&item.status!=='cancelled'})
      :[target];
    dutyChangeMutationInFlight=true;
    const isSwap=linked.length>1;
    const confirmed=confirm(
      isSwap
        ?'この当番日の入れ替えを取り消しますか？\n2つの当番日を変更前の状態に戻します。'
        :displayDate(target.date)+'「'+target.from+' → '+target.to+'」を取り消しますか？\n当番表は変更前の状態に戻ります。'
    );
    if(!confirmed){dutyChangeMutationInFlight=false;return}
    const previous=changes.map(function(item){return Object.assign({},item)});
    const now=new Date().toISOString();
    linked.forEach(function(item){item.status='cancelled';item.cancelledAt=now});
    render();
    try{
      await persist(isSwap?'当番日の入れ替えを取り消しました':'当番変更を取り消しました',isSwap?'当番日の入れ替えを取り消しました':'当番変更を取り消しました',true);
    }catch(e){
      changes=previous;render();alert(e.message||'当番変更を取り消せませんでした。');
    }finally{
      dutyChangeMutationInFlight=false;
    }
  }

  async function deleteChange(id){
    const target=changes.find(function(item){return item.id===id});if(!target||!confirm('この変更履歴を完全に削除しますか？\n当番表は変更前の状態に戻り、この申請は完了扱いで閉じます。'))return;
    const previous=changes.slice();
    try{
      if(target.requestNo){
        const adminPassword=panel.dataset.adminPassword||'';
        if(!adminPassword)throw new Error('管理画面を開き直してください。');
        const response=await fetch(REQUEST_API,{method:'POST',credentials:'same-origin',headers:requestHeaders(true),body:JSON.stringify({action:'close',requestNo:target.requestNo})});
        const body=await response.json().catch(function(){return{}});
        if(!response.ok)throw new Error(body.error||'関連する申請を完了扱いにできませんでした。');
        requests=normalizeRequestList(body.requests);requestsLoaded=true;
      }
      changes=changes.filter(function(item){return item.id!==id});render();
      await persist('変更履歴を削除しました','当番変更履歴を削除しました');
      renderRequests();syncPendingRequestCount();
    }catch(e){
      changes=previous;render();alert(e.message||'変更履歴を削除できませんでした。');
    }
  }

  async function confirmGeneratedDutyRoster(detail){
    if(!detail||!detail.table||!detail.data)throw new Error('確定する当番表データがありません。');
    const table=detail.table;
    const sameIndex=images.findIndex(function(item){return item.table&&Number(item.table.year)===Number(table.year)&&Number(item.table.month)===Number(table.month)});
    if(sameIndex>=0&&!confirm(table.year+'年'+table.month+'月の当番表はすでに登録されています。\nこの案で置き換えますか？'))return false;
    const previous=images.slice();
    const item={id:sameIndex>=0?images[sameIndex].id:'duty-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),name:detail.name||('当番表_'+table.year+'年'+String(table.month).padStart(2,'0')+'月.png'),data:String(detail.data),src:'',testMode:detail.testMode===true,table:table};
    if(sameIndex>=0)images[sameIndex]=item;else images.push(item);
    render();
    try{await persist(item.testMode?'テストモードで当番表を登録しました':'当番表を確定・登録しました',item.testMode?'当番表をテスト登録しました':'当番表を更新しました',!item.testMode);return true}catch(e){images=previous;render();throw e}
  }
  window.confirmGeneratedDutyRoster=confirmGeneratedDutyRoster;

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

  function rosterNamesForDate(date){
    const map=new Map();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return[];
    images.forEach(function(image){
      if(!canViewRoster(image))return;
      const table=image.table;if(!table)return;
      const prefix=table.year+'-'+String(table.month).padStart(2,'0')+'-';
      if(!String(date).startsWith(prefix))return;
      const day=Number(String(date).slice(-2));
      const row=table.rows.find(function(r){return Number(r&&r[0])===day});
      if(!row)return;
      const grades=table.grades||[2,1];
      row.slice(2,2+grades.length*2).forEach(function(name,index){
        const clean=cleanName(name);if(!clean)return;
        const grade=String(grades[Math.floor(index/2)]);
        const current=window.DutyRosterData.applyChanges(table,row[0],grade,clean,changes);
        const currentName=cleanName(current&&current.value)||clean;
        map.set(grade+'|'+currentName,{grade:grade,name:currentName});
      });
    });
    return Array.from(map.values()).sort(function(a,b){return Number(b.grade)-Number(a.grade)||a.name.localeCompare(b.name,'ja')});
  }
  function rosterReplacementCandidates(date){
    return window.DutyGradePolicy.replacementCandidates(images,date,replacementFamilies,window.DutyRosterData.tableForImage,canViewRoster);
  }
  function todayYmd(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function rosterDates(){const today=todayYmd(),out=[];images.forEach(function(image){if(!canViewRoster(image))return;const table=image.table;if(!table)return;table.rows.forEach(function(row){const date=tableDate(table,row[0]);if(date>=today)out.push({date:date,label:table.year+'年'+table.month+'月'+row[0]+'日（'+row[1]+'）',table:table,row:row})})});return out.sort(function(a,b){return a.date.localeCompare(b.date)})}
  function rosterHasMonth(date){return images.some(function(image){return image.table&&date.startsWith(image.table.year+'-'+String(image.table.month).padStart(2,'0')+'-')})}
  function requestExpired(item){const t=Date.parse(item&&item.approvalExpiresAt||'');return item&&item.status==='pending'&&Number.isFinite(t)&&Date.now()>t}
  function requestStatusLabel(status,item){if(status==='approved')return'反映済み';if(status==='rejected')return'却下済み';if(requestExpired(item))return'承認期限切れ・再申請待ち';return'確認待ち'}
  function requestPersonLabel(item,side){
    const grade=String(item[side+'Grade']||'');
    const name=String(item[side+'Name']||'');
    return (grade?grade+'年・':'')+octoberDisplayName(name,grade,item.date);
  }
  function requestSummaryHtml(item){
    if(item&&item.requestType==='swap'){
      return '<b>'+escapeHtml(displayDate(item.date))+'</b>　'+escapeHtml(requestPersonLabel(item,'from'))+
        ' ↔ <b>'+escapeHtml(displayDate(item.swapDate))+'</b>　'+escapeHtml((item.swapGrade?item.swapGrade+'年・':'')+octoberDisplayName(item.swapName,item.swapGrade,item.swapDate));
    }
    return '<b>'+escapeHtml(displayDate(item.date))+'</b><br>'+escapeHtml(requestPersonLabel(item,'from'))+' → <b>'+escapeHtml(requestPersonLabel(item,'to'))+'</b>';
  }
  function requestSummaryText(item){
    if(item&&item.requestType==='swap'){
      return displayDate(item.date)+' '+requestPersonLabel(item,'from')+' ↔ '+displayDate(item.swapDate)+' '+(item.swapGrade?item.swapGrade+'年・':'')+octoberDisplayName(item.swapName,item.swapGrade,item.swapDate);
    }
    return displayDate(item.date)+'\n変更前：'+requestPersonLabel(item,'from')+'\n変更後：'+requestPersonLabel(item,'to')
  }
  function requestHeaders(includeAdmin){
    const headers={'content-type':'application/json'};
    const accessPassword=sessionStorage.getItem('yachiyoAttendancePass')||'';
    if(accessPassword)headers['x-access-password']=accessPassword;
    const deviceToken=requesterDeviceToken();
    if(deviceToken)headers['x-duty-requester-device']=deviceToken;
    if(includeAdmin){
      const adminPassword=panel.dataset.adminPassword||'';
      if(adminPassword)headers['x-admin-password']=adminPassword;
    }
    return headers;
  }
  function monitorStatusLabel(status){
    if(status==='error')return'要確認';
    if(status==='warning')return'注意';
    return'すべて正常';
  }
  function formatMonitorTime(value){
    const d=new Date(value||'');if(Number.isNaN(d.getTime()))return'';
    return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);
  }
  function renderDutySystemMonitor(monitor){
    const card=document.getElementById('dutySystemMonitor');if(!card)return;
    card.hidden=!isAdminViewing();if(card.hidden)return;
    const badge=document.getElementById('dutyMonitorBadge');
    const summary=document.getElementById('dutyMonitorSummary');
    const pending=document.getElementById('dutyMonitorPending');
    const approved=document.getElementById('dutyMonitorApproved');
    const noLineAlert=document.getElementById('dutyMonitorNoLineAlert');
    const noLineCount=document.getElementById('dutyMonitorNoLineCount');
    const issues=document.getElementById('dutyMonitorIssues');
    const issueList=document.getElementById('dutyMonitorIssueList');
    const recent=document.getElementById('dutyMonitorRecent');
    const details=document.getElementById('dutyMonitorDetails');
    const toggle=document.getElementById('dutyMonitorToggle');
    if(!monitor){
      if(badge){badge.className='duty-monitor-badge error';badge.textContent='確認失敗'}
      if(summary)summary.textContent='監視情報を取得できませんでした。再読み込みしてください。';
      return;
    }
    if(badge){badge.className='duty-monitor-badge '+monitor.status;badge.textContent=monitorStatusLabel(monitor.status)}
    if(details&&toggle&&monitor.issueCount>0){
      details.hidden=false;
      toggle.setAttribute('aria-expanded','true');
      toggle.textContent='システム処理履歴を隠す';
    }
    if(summary){
      summary.textContent=monitor.partnerApprovalEnabled
        ?(monitor.issueCount?'申請フローに確認が必要な項目があります。':'申請・LINE認証・承認・当番表反映に異常は見つかっていません。')
        :'承認リンクは未使用です。監視は待機中です。';
    }
    const localApproved=requests.filter(function(item){return item.status==='approved'}).length;
    const localNoLine=requests.filter(function(item){return item.status==='pending'&&item.noLineFallback===true}).length;
    if(pending)pending.textContent=String(monitor.pendingCount||0);
    if(approved)approved.textContent=String(Number.isFinite(Number(monitor.approvedCount))?Number(monitor.approvedCount):localApproved);
    if(noLineCount)noLineCount.textContent=String(localNoLine);
    if(noLineAlert)noLineAlert.hidden=localNoLine===0;
    if(issues)issues.textContent=String(monitor.issueCount||0);
    if(issueList){
      const list=Array.isArray(monitor.issues)?monitor.issues:[];
      issueList.hidden=!list.length;
      issueList.innerHTML=list.map(function(item){return'<li>'+(item.requestNo?'#'+escapeHtml(item.requestNo)+' ':'')+escapeHtml(item.message||'確認が必要です。')+'</li>'}).join('');
    }
    if(recent){
      const events=Array.isArray(monitor.recentEvents)?monitor.recentEvents:[];
      const stageLabel={line_start:'LINE認証開始',request_created:'申請・リンク発行',self_approval_blocked:'自己承認を防止',reflection_error:'当番表反映エラー',approved_reflected:'承認・反映完了'};
      if(events.length){
        recent.innerHTML=events.map(function(item){
          return '<div class="duty-monitor-recent-item"><b>'+(item.requestNo?'#'+escapeHtml(item.requestNo)+' ':'')+escapeHtml(stageLabel[item.stage]||item.stage||'処理')+'</b>'+
            (item.message?'<br>'+escapeHtml(item.message):'')+
            (item.device?'<br><span>'+escapeHtml(item.device)+'</span>':'')+
            (item.at?'<br><small>'+escapeHtml(formatMonitorTime(item.at))+'</small>':'')+
            '</div>';
        }).join('');
      }else{
        const items=Array.isArray(monitor.recent)?monitor.recent:[];
        recent.innerHTML=items.length?items.map(function(item){
          const status=item.status==='approved'?'反映済み':(item.status==='pending'?'確認待ち':item.status);
          const device=item.requesterDevice?('申請：'+escapeHtml(item.requesterDevice)):'申請端末：記録なし';
          const approver=item.approverDevice?(' / 承認：'+escapeHtml(item.approverDevice)):'';
          return '<div class="duty-monitor-recent-item"><b>'+(item.requestNo?'#'+escapeHtml(item.requestNo)+' ':'')+escapeHtml(status)+'</b>　'+escapeHtml(displayDate(item.date))+'<br><span>'+device+approver+'</span>'+(item.updatedAt?'<br><small>最終更新：'+escapeHtml(formatMonitorTime(item.updatedAt))+'</small>':'')+'</div>';
        }).join(''):'<div class="duty-monitor-recent-item">まだ監視対象の申請はありません。</div>';
      }
    }
  }
  function setupDutyMonitorToggle(){
    const toggle=document.getElementById('dutyMonitorToggle');
    const details=document.getElementById('dutyMonitorDetails');
    if(!toggle||!details||toggle.dataset.ready==='1')return;
    toggle.dataset.ready='1';
    toggle.addEventListener('click',function(){
      const open=details.hidden;
      details.hidden=!open;
      toggle.setAttribute('aria-expanded',String(open));
      toggle.textContent=open?'システム処理履歴を隠す':'システム処理履歴を表示';
    });
  }

  async function loadDutySystemMonitor(){
    const card=document.getElementById('dutySystemMonitor');
    if(!card||!isAdminViewing()){if(card)card.hidden=true;return}
    card.hidden=false;
    setupDutyMonitorToggle();
    try{
      const response=await fetch(REQUEST_API,{
        method:'POST',credentials:'same-origin',headers:requestHeaders(true),
        body:JSON.stringify({action:'monitor'})
      });
      const body=await response.json().catch(function(){return{}});
      if(!response.ok||!body.monitor)throw new Error(body.error||'monitor failed');
      renderDutySystemMonitor(body.monitor);
    }catch(e){renderDutySystemMonitor(null)}
  }

  async function loadRequests(){
    try{
      const response=await fetch(REQUEST_API,{cache:'no-store',credentials:'same-origin',headers:requestHeaders(false)});
      if(!response.ok)throw new Error('load failed');
      const body=await response.json();
      if(!Array.isArray(body&&body.requests))throw new Error('invalid data');
      requests=normalizeRequestList(body.requests);
      replacementFamilies=Array.isArray(body.replacementFamilies)?body.replacementFamilies:null;
      replacementFamiliesFailed=replacementFamilies===null;
      partnerApprovalEnabled=body.partnerApprovalEnabled===true;
      const approvalToggle=document.getElementById('dutyPartnerApprovalToggle');
      const approvalStatus=document.getElementById('dutyPartnerApprovalStatus');
      if(approvalToggle)approvalToggle.checked=partnerApprovalEnabled;
      if(approvalStatus)approvalStatus.textContent=partnerApprovalEnabled?'ご家族承認モード':'管理者承認モード';
      const noLineToggle=document.getElementById('toggleDutyNoLine');
      const noLineOption=document.getElementById('dutyRequestNoLineOption');
      const noLineInput=document.getElementById('dutyRequestNoLine');
      if(noLineToggle){noLineToggle.hidden=!partnerApprovalEnabled;noLineToggle.setAttribute('aria-expanded','false');noLineToggle.textContent='LINEを利用できない方';}
      if(noLineOption)noLineOption.hidden=true;
      if(noLineInput&&!partnerApprovalEnabled)noLineInput.checked=false;
      syncDutyRequestOperationNote();
      requestsLoaded=true;
      renderRequests();
      if(isAdminViewing())loadDutySystemMonitor();
      return true;
    }catch(e){
      requestsLoaded=false;
      const admin=document.getElementById('dutyRequestAdminList');
      if(admin)admin.innerHTML='<div class="duty-change-preview">申請データを確認できません。再読み込みしてください。</div>';
      return false;
    }
  }
  async function syncPendingRequestCount(){
    if(isAdminViewing()&&requestsLoaded){renderRequests();return;}
    try{
      const response=await fetch('/.netlify/functions/duty-request-alert',{cache:'no-store'});
      if(!response.ok)return;
      const body=await response.json();
      const count=Math.max(0,Number(body&&body.pendingCount)||0);
      const requestBadge=document.getElementById('dutyRequestPendingBadge');
      if(requestBadge){requestBadge.hidden=false;requestBadge.textContent='申請中 '+count+'件'}
      const statusToggle=document.getElementById('toggleDutyRequestStatus');
      if(statusToggle&&statusToggle.getAttribute('aria-expanded')!=='true')statusToggle.textContent=count?'申請内容を見る（申請中 '+count+'件）':'申請内容を見る';
    }catch(e){}
  }
  function renderRequests(){
    const admin=document.getElementById('dutyRequestAdminList');
    if(!requestsLoaded){
      if(admin)admin.innerHTML='<div class="duty-change-preview">申請データを確認中です。</div>';
      return;
    }
    const ordered=requests.slice().filter(function(item){
      // Pending requests are always visible to the team until resolved.
      // Test-mode filtering only applies to processed history.
      return item.status==='pending'||!isTestDate(item.date)||isAdminViewing();
    }).sort(function(a,b){return String(b.createdAt).localeCompare(String(a.createdAt))});
    const pendingCount=ordered.filter(function(item){return item.status==='pending'}).length;
    const requestBadge=document.getElementById('dutyRequestPendingBadge');
    if(requestBadge){requestBadge.hidden=false;requestBadge.textContent='申請中 '+pendingCount+'件'}
    const statusBox=document.getElementById('dutyRequestStatus'),statusList=document.getElementById('dutyRequestStatusList'),statusToggle=document.getElementById('toggleDutyRequestStatus');
    if(statusBox&&statusList&&statusToggle){
      const publicItems=ordered.filter(function(item){return item.status!=='rejected'});
      statusBox.hidden=publicItems.length===0;
      statusToggle.textContent=pendingCount?'申請内容を見る（申請中 '+pendingCount+'件）':'申請内容を見る';
      statusList.innerHTML=publicItems.length?publicItems.map(function(item){
        return '<div class="duty-request-status-item">'+(item.requestNo?'<b>申請番号 #'+escapeHtml(item.requestNo)+'</b><br>':'')+
          requestSummaryHtml(item)+'<br>'+
          (item.status==='pending'&&item.approvalMode==='family'&&partnerApprovalEnabled&&!requestExpired(item)
            ?'<span class="duty-request-pending-actions">'+(item.requesterCanCancel
              ?'<button type="button" class="duty-request-resend" data-resend-duty-request="'+escapeHtml(item.id)+'" data-status="pending">'+escapeHtml(requestStatusLabel(item.status,item))+'<small>タップでLINEを再送</small></button><button type="button" class="duty-request-self-cancel" data-cancel-own-duty-request="'+escapeHtml(item.id)+'">申請を取り消す</button>'
              :'<b data-status="pending">'+escapeHtml(requestStatusLabel(item.status,item))+'</b>')+'</span>'
            :item.status==='pending'&&item.approvalMode==='admin'
              ?'<span class="duty-request-pending-actions"><b data-status="pending">確認待ち（管理者承認）</b>'+(item.requesterCanCancel?'<button type="button" class="duty-request-self-cancel" data-cancel-own-duty-request="'+escapeHtml(item.id)+'">申請を取り消す</button>':'')+'</span>'
              :'<b data-status="'+escapeHtml(item.status)+'">'+escapeHtml(requestStatusLabel(item.status,item))+'</b>')+
          (item.createdAt?'<br><small>申請日時：'+escapeHtml(new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(item.createdAt)))+'</small>':'')+
          '</div>';
      }).join(''):'';
      statusList.querySelectorAll('[data-resend-duty-request]').forEach(function(button){
        button.addEventListener('click',function(){resendPendingRequestToLine(button.dataset.resendDutyRequest,button)});
      });
      statusList.querySelectorAll('[data-cancel-own-duty-request]').forEach(function(button){
        button.addEventListener('click',function(){cancelOwnPendingRequest(button.dataset.cancelOwnDutyRequest,button)});
      });
    }
    if(admin){
      const pendingItems=ordered.filter(function(item){return item.status==='pending'});
      admin.innerHTML=pendingItems.length?pendingItems.map(function(item){
        return '<div class="duty-request-admin-item">'+(item.requestNo?'<b>申請番号 #'+escapeHtml(item.requestNo)+'</b><br>':'')+
          (item.noLineFallback===true?'<div class="duty-request-no-line-alert"><span class="duty-request-no-line-badge">LINE利用不可</span><span class="duty-request-no-line-action">管理者確認が必要</span></div>':'')+
          requestSummaryHtml(item)+'<br><span class="duty-request-wait'+(requestExpired(item)&&item.approvalMode==='family'?' is-expired':'')+'">'+escapeHtml(requestExpired(item)&&item.approvalMode==='family'?'承認期限切れ・再申請待ち':'確認待ち')+'</span><span class="duty-request-admin-mode">'+escapeHtml(item.approvalMode==='family'?'ご家族承認':'管理者承認')+'</span><div class="duty-request-admin-actions"><button type="button" data-approve-duty-request="'+escapeHtml(item.id)+'">当番表に反映</button><button class="reject" type="button" data-reject-duty-request="'+escapeHtml(item.id)+'">却下</button></div></div>';
      }).join(''):'<div class="duty-change-preview">確認待ちの当番変更申請はありません。</div>';
      admin.querySelectorAll('[data-approve-duty-request]').forEach(function(b){b.addEventListener('click',function(){decideRequest(b.dataset.approveDutyRequest,true)})});
      admin.querySelectorAll('[data-reject-duty-request]').forEach(function(b){b.addEventListener('click',function(){decideRequest(b.dataset.rejectDutyRequest,false)})});
    }
    populateRequestForm();
    restoreLineLoginResume();
  }
  function personOptionValue(x){return x.grade+'|'+x.name}
  function parsePersonOption(value){const i=String(value||'').indexOf('|');return i<1?null:{grade:String(value).slice(0,i),name:cleanName(String(value).slice(i+1))}}
  function requestPersonOptions(date,names,excludeValue){
    names=Array.isArray(names)?names:rosterNamesForDate(date);
    let opts='<option value="">選択してください</option>';
    ['3','2','1'].forEach(function(g){
      const group=names.filter(function(x){return x.grade===g&&window.DutyRosterData.nameKey(personOptionValue(x))!==window.DutyRosterData.nameKey(excludeValue)});if(!group.length)return;
      opts+='<optgroup label="'+g+'年生">'+group.map(function(x){return'<option value="'+escapeHtml(personOptionValue(x))+'">'+g+'年・'+escapeHtml(octoberDisplayName(x.name,g,date))+'</option>'}).join('')+'</optgroup>';
    });
    return opts;
  }
  function dutySlotValue(date,person){return [date,person.grade,person.name].join('|')}
  function parseDutySlot(value){
    const parts=String(value||'').split('|');
    if(parts.length<3)return null;
    return{date:parts[0],grade:parts[1],name:cleanName(parts.slice(2).join('|'))};
  }
  function rosterDutySlotsForDate(date){
    const slots=[];
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return slots;
    images.forEach(function(image){
      if(!canViewRoster(image))return;
      const table=image.table;if(!table)return;
      const prefix=table.year+'-'+String(table.month).padStart(2,'0')+'-';
      if(!String(date).startsWith(prefix))return;
      const day=Number(String(date).slice(-2));
      const row=table.rows.find(function(r){return Number(r&&r[0])===day});
      if(!row)return;
      const grades=table.grades||[2,1];
      row.slice(2,2+grades.length*2).forEach(function(name,index){
        const original=cleanName(name);if(!original)return;
        const grade=String(grades[Math.floor(index/2)]);
        const applied=window.DutyRosterData.applyChanges(table,row[0],grade,original,changes);
        const current=cleanName(applied&&applied.value)||original;
        slots.push({grade:grade,name:current});
      });
    });
    return slots;
  }
  function dutySlotOptions(excludeValue){
    let html='<option value="">選択してください</option>';
    rosterDates().forEach(function(d){
      rosterDutySlotsForDate(d.date).forEach(function(person){
        const value=dutySlotValue(d.date,person);
        if(value===excludeValue)return;
        html+='<option value="'+escapeHtml(value)+'">'+escapeHtml(displayDate(d.date)+'　'+person.grade+'年・'+octoberDisplayName(person.name,person.grade,d.date))+'</option>';
      });
    });
    return html;
  }
  function populateRequestForm(){
    const typeSel=document.getElementById('dutyRequestType');
    const replaceFields=document.getElementById('dutyRequestReplaceFields');
    const swapFields=document.getElementById('dutyRequestSwapFields');
    const dateSel=document.getElementById('dutyRequestRosterDate');
    const fromSel=document.getElementById('dutyRequestFrom');
    const toSel=document.getElementById('dutyRequestTo');
    const swapFrom=document.getElementById('dutyRequestSwapFromSlot');
    const swapTo=document.getElementById('dutyRequestSwapToSlot');
    if(!dateSel||!fromSel||!toSel)return;

    const requestType=typeSel&&typeSel.value==='swap'?'swap':'replace';
    if(replaceFields){
      replaceFields.hidden=requestType==='swap';
      replaceFields.style.setProperty('display',requestType==='swap'?'none':'block','important');
    }
    if(swapFields){
      swapFields.hidden=requestType!=='swap';
      swapFields.style.setProperty('display',requestType==='swap'?'block':'none','important');
    }
    const submitButton=document.getElementById('submitDutyRequest');
    if(submitButton)submitButton.textContent=requestType==='swap'?'この2つを入れ替えて申請':'変更申請を送信';

    if(requestType==='swap'){
      if(!swapFrom||!swapTo)return;
      const fromValue=swapFrom.value,toValue=swapTo.value;
      swapFrom.innerHTML=dutySlotOptions('');
      if(Array.from(swapFrom.options).some(function(o){return o.value===fromValue}))swapFrom.value=fromValue;
      swapTo.innerHTML=dutySlotOptions(swapFrom.value);
      if(Array.from(swapTo.options).some(function(o){return o.value===toValue}))swapTo.value=toValue;
      return;
    }

    const current=dateSel.value,fromValue=fromSel.value,toValue=toSel.value;
    const dates=rosterDates();
    dateSel.innerHTML='<option value="">日付を選択してください</option>'+dates.map(function(x){return'<option value="'+x.date+'">'+x.label+'</option>'}).join('');
    if(Array.from(dateSel.options).some(function(o){return o.value===current}))dateSel.value=current;
    const fromOptions=requestPersonOptions(dateSel.value,rosterNamesForDate(dateSel.value),'');
    fromSel.innerHTML=fromOptions;
    if(Array.from(fromSel.options).some(function(o){return o.value===fromValue}))fromSel.value=fromValue;
    const selectedFrom=fromSel.value;
    const toOptions=requestPersonOptions(dateSel.value,rosterReplacementCandidates(dateSel.value),selectedFrom);
    toSel.innerHTML=toOptions;
    toSel.disabled=!dateSel.value||replacementFamilies===null;
    if(!dateSel.value)toSel.innerHTML='<option value="">先に変更日を選択してください</option>';
    else if(replacementFamilies===null)toSel.innerHTML='<option value="">'+(replacementFamiliesFailed?'名簿を取得できません。ページを再読み込みしてください':'保護者名簿を確認中…')+'</option>';
    if(Array.from(toSel.options).some(function(o){return o.value===toValue}))toSel.value=toValue;
  }
  function approvalLineText(item,url){
    if(item&&item.requestType==='swap'){
      return '【当番日入れ替え申請'+(item.requestNo?' #'+item.requestNo:'')+'】\n'+
        displayDate(item.date)+' '+requestPersonLabel(item,'from')+'\n↕\n'+
        displayDate(item.swapDate)+' '+(item.swapGrade?item.swapGrade+'年・':'')+octoberDisplayName(item.swapName,item.swapGrade,item.swapDate)+
        '\n当番日を入れ替える申請です。\n\n【入れ替える相手のご家庭へ】\n下の専用リンクから内容を確認して承認してください。\n'+url;
    }
    return '【当番変更申請'+(item.requestNo?' #'+item.requestNo:'')+'】\n'+displayDate(item.date)+'\n変更前：'+requestPersonLabel(item,'from')+'\n変更後：'+requestPersonLabel(item,'to')+'\n当番変更を申請しました。\n\n【変更後のご家庭の方へ】\n下の専用リンクから内容を確認して承認してください。\n'+url;
  }
  async function resendPendingRequestToLine(id,button){
    const item=requests.find(function(x){return x.id===id&&x.status==='pending'});
    if(!item)return;
    const original=button?button.innerHTML:'';
    if(button){button.disabled=true;button.textContent='LINEを準備中…';}
    try{
      const response=await fetch(REQUEST_API,{method:'POST',credentials:'same-origin',headers:requestHeaders(false),body:JSON.stringify({action:'reissue-partner-approval',id:item.id})});
      const body=await response.json().catch(function(){return{}});
      if(!response.ok){
        if(body.code==='line_login_required'&&body.loginUrl){
          const resumePayload=JSON.stringify({mode:'resend',id:item.id,expires:Date.now()+10*60*1000});
          try{sessionStorage.setItem('ylsDutyLineResume',resumePayload)}catch(_){}
          try{localStorage.setItem('ylsDutyLineResume',resumePayload)}catch(_){}
          location.href=body.loginUrl;
          return;
        }
        throw new Error(body.error||'承認リンクを再発行できませんでした。');
      }
      requests=normalizeRequestList(body.requests);requestsLoaded=true;renderRequests();syncPendingRequestCount();
      const url=String(body.approvalUrl||'');
      if(!url)throw new Error('承認リンクを取得できませんでした。');
      const shareUrl='https://line.me/R/share?text='+encodeURIComponent(approvalLineText(item,url));
      window.location.assign(shareUrl);
    }catch(e){
      alert(e.message||'LINEを開けませんでした。');
      if(button){button.disabled=false;button.innerHTML=original;}
    }
  }

  async function cancelOwnPendingRequest(id,button){
    const item=requests.find(function(x){return x.id===id&&x.status==='pending'});
    if(!item)return;
    const cancelMessage=item.approvalMode==='family'
      ?'この当番変更申請を取り消しますか？\n承認リンクも使用できなくなります。'
      :'この当番変更申請を取り消しますか？';
    if(!confirm(cancelMessage))return;
    const original=button?button.textContent:'';
    if(button){button.disabled=true;button.textContent='取消中…';}
    try{
      const response=await fetch(REQUEST_API,{method:'POST',credentials:'same-origin',headers:requestHeaders(false),body:JSON.stringify({action:'requester-cancel',id:item.id})});
      const body=await response.json().catch(function(){return{}});
      if(!response.ok)throw new Error(body.error||'申請を取り消せませんでした。');
      requests=normalizeRequestList(body.requests);requestsLoaded=true;renderRequests();syncPendingRequestCount();
    }catch(e){
      alert(e.message||'申請を取り消せませんでした。');
      if(button){button.disabled=false;button.textContent=original;}
    }
  }

  async function submitRequest(){
    const typeSel=document.getElementById('dutyRequestType');
    const requestType=typeSel&&typeSel.value==='swap'?'swap':'replace';
    const btn=document.getElementById('submitDutyRequest'),result=document.getElementById('dutyRequestResult');
    let date='',fromPerson=null,toPerson=null,swapDate='',swapPerson=null;

    if(requestType==='swap'){
      const fromSlot=parseDutySlot(document.getElementById('dutyRequestSwapFromSlot')?.value||'');
      const toSlot=parseDutySlot(document.getElementById('dutyRequestSwapToSlot')?.value||'');
      if(!fromSlot||!toSlot)return alert('①あなたのお当番と②入れ替える相手のお当番を選択してください。');
      if(fromSlot.date===toSlot.date&&fromSlot.grade===toSlot.grade&&fromSlot.name===toSlot.name)return alert('別のお当番を選択してください。');
      date=fromSlot.date;
      fromPerson={grade:fromSlot.grade,name:fromSlot.name};
      swapDate=toSlot.date;
      swapPerson={grade:toSlot.grade,name:toSlot.name};
      toPerson=swapPerson;
    }else{
      date=document.getElementById('dutyRequestRosterDate').value;
      fromPerson=parsePersonOption(document.getElementById('dutyRequestFrom').value);
      toPerson=parsePersonOption(document.getElementById('dutyRequestTo').value);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!rosterDates().some(function(x){return x.date===date})||!fromPerson||!toPerson){
        return alert('登録済みのお当番表から変更日・変更前・変更後を選択してください。');
      }
      if(fromPerson.grade===toPerson.grade&&fromPerson.name===toPerson.name)return alert('変更前と変更後は別の方を選択してください。');
    }

    if(requestType==='swap'&&date.slice(0,7)!==swapDate.slice(0,7)){
      const fromMonth=Number(date.slice(5,7));
      const toMonth=Number(swapDate.slice(5,7));
      if(!confirm(fromMonth+'月と'+toMonth+'月をまたぐ当番日の入れ替えになります。\n内容に間違いありませんか？'))return;
    }

    if(fromPerson.grade!==toPerson.grade){
      const message=requestType==='swap'
        ?fromPerson.grade+'年生と'+toPerson.grade+'年生のお当番を入れ替える変更になります。内容に間違いありませんか？'
        :fromPerson.grade+'年生 → '+toPerson.grade+'年生の変更になります。内容に間違いありませんか？';
      if(!confirm(message))return;
    }

    const noLineFallback=partnerApprovalEnabled===true&&document.getElementById('dutyRequestNoLine')?.checked===true;
    if(noLineFallback&&!confirm('LINEを利用できない場合の申請です。\n申請後、表示された申請番号を管理者へお知らせください。\nこの内容で申請しますか？'))return;

    const requestPayload={
      date:date,fromGrade:fromPerson.grade,fromName:fromPerson.name,
      toGrade:toPerson.grade,toName:toPerson.name,
      requestType:requestType,
      swapDate:requestType==='swap'?swapDate:'',
      swapGrade:requestType==='swap'?swapPerson.grade:'',
      swapName:requestType==='swap'?swapPerson.name:'',
      noLineFallback:noLineFallback
    };

    btn.disabled=true;btn.textContent='送信中…';
    try{
      const response=await fetch(REQUEST_API,{method:'POST',credentials:'same-origin',headers:requestHeaders(false),body:JSON.stringify({action:'submit',request:requestPayload})});
      const body=await response.json().catch(function(){return{}});
      if(!response.ok){
        if(body.code==='line_login_required'&&body.loginUrl){
          // The server has already persisted this request as pending.
          // Show the exact server result before leaving for LINE Login.
          if(body.request){
            const pending=normalizeRequestList([body.request])[0];
            if(pending){
              const existing=requests.findIndex(function(item){return item.id===pending.id});
              if(existing>=0)requests[existing]=pending;else requests.unshift(pending);
              requestsLoaded=true;
              renderRequests();
            }
          }
          const resumePayload=JSON.stringify({
            mode:'submit',requestType:requestType,date:date,from:personOptionValue(fromPerson),to:personOptionValue(toPerson),
            swapDate:requestType==='swap'?swapDate:'',swapPerson:requestType==='swap'?personOptionValue(swapPerson):'',
            expires:Date.now()+10*60*1000
          });
          try{sessionStorage.setItem('ylsDutyLineResume',resumePayload)}catch(_){}
          try{localStorage.setItem('ylsDutyLineResume',resumePayload)}catch(_){}
          location.href=body.loginUrl;
          return;
        }
        throw new Error(body.error||'申請できませんでした。');
      }
      requests=normalizeRequestList(body.requests);requestsLoaded=true;renderRequests();syncPendingRequestCount();
      const submitted=requests.slice().sort(function(a,b){return String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt))}).find(function(x){
        return x.status==='pending'&&x.date===date&&x.fromGrade===fromPerson.grade&&x.fromName===fromPerson.name&&x.requestType===requestType&&(requestType!=='swap'||x.swapDate===swapDate);
      });
      const requestNo=submitted&&submitted.requestNo?submitted.requestNo:'';
      const approvalUrl=String(body.approvalUrl||'');
      const shareItem=submitted||{
        requestNo:requestNo,date:date,fromGrade:fromPerson.grade,fromName:fromPerson.name,toGrade:toPerson.grade,toName:toPerson.name,
        requestType:requestType,swapDate:requestType==='swap'?swapDate:'',swapGrade:requestType==='swap'?swapPerson.grade:'',swapName:requestType==='swap'?swapPerson.name:''
      };
      const text=approvalUrl?approvalLineText(shareItem,approvalUrl):
        (requestType==='swap'
          ?'【当番日入れ替え申請'+(requestNo?' #'+requestNo:'')+'】\n'+displayDate(date)+' '+fromPerson.grade+'年・'+octoberDisplayName(fromPerson.name,fromPerson.grade,date)+'\n↕\n'+displayDate(swapDate)+' '+swapPerson.grade+'年・'+octoberDisplayName(swapPerson.name,swapPerson.grade,swapDate)+'\n当番日を入れ替える申請です。'
          :'【当番変更申請'+(requestNo?' #'+requestNo:'')+'】\n'+displayDate(date)+'\n変更前：'+fromPerson.grade+'年・'+octoberDisplayName(fromPerson.name,fromPerson.grade,date)+'\n変更後：'+toPerson.grade+'年・'+octoberDisplayName(toPerson.name,toPerson.grade,date)+'\n当番変更を申請しました。');
      const note=approvalUrl?'※承認リンクは1回限り・24時間有効です。期限を過ぎた場合は、再度「当番変更申請」から申請してください。承認後、当番表へ自動反映されます。':'※当番表への正式な反映は管理者確認後となります。';
      if(approvalUrl){
        try{
          sessionStorage.setItem('ylsDutyLineComplete',JSON.stringify({
            approvalUrl:approvalUrl,
            request:{
              requestNo:requestNo,date:date,
              fromGrade:fromPerson.grade,fromName:octoberDisplayName(fromPerson.name,fromPerson.grade,date),
              toGrade:toPerson.grade,toName:octoberDisplayName(toPerson.name,toPerson.grade,date),
              requestType:requestType,
              swapDate:requestType==='swap'?swapDate:'',
              swapGrade:requestType==='swap'?swapPerson.grade:'',
              swapName:requestType==='swap'?octoberDisplayName(swapPerson.name,swapPerson.grade,swapDate):''
            }
          }));
          window.location.assign('/duty-line-complete.html');
          return;
        }catch(_){}
      }
      if(noLineFallback){
        result.hidden=false;
        result.innerHTML='<div class="duty-request-complete"><b>変更申請を受け付けました</b>'+(requestNo?'<p><b>申請番号 #'+escapeHtml(requestNo)+'</b></p>':'')+'<p>申請番号を管理者へお知らせください。</p><small>管理者が内容を確認後、当番表へ反映します。</small></div>';
        const noLineInput=document.getElementById('dutyRequestNoLine');
        if(noLineInput)noLineInput.checked=false;
        return;
      }
      const shareUrl='https://line.me/R/share?text='+encodeURIComponent(text);
      result.hidden=false;result.innerHTML='<div class="duty-request-complete"><b>変更申請を受け付けました</b><p>下のボタンを押すと、LINEの送信先選択画面が開きます。</p><a id="dutyRequestLineShare" class="line-share" href="'+shareUrl+'">LINEで共有する</a><small>'+escapeHtml(note)+'</small></div>';
      const lineShare=document.getElementById('dutyRequestLineShare');
      if(lineShare)lineShare.addEventListener('click',function(event){event.preventDefault();window.location.assign(shareUrl)});
    }catch(e){alert(e.message||'申請できませんでした。')}finally{btn.disabled=false;btn.textContent='変更申請を送信'}
  }
  async function requestAdminAction(id,action){
    const adminPassword=panel.dataset.adminPassword||'';if(!adminPassword)throw new Error('管理画面を開き直してください。');
    const response=await fetch(REQUEST_API,{method:'POST',credentials:'same-origin',headers:requestHeaders(true),body:JSON.stringify({action:action,id:id})});
    const body=await response.json().catch(function(){return{}});
    if(!response.ok)throw new Error(body.error||'処理できませんでした。');
    requests=normalizeRequestList(body.requests);requestsLoaded=true;renderRequests();syncPendingRequestCount();
  }
  async function decideRequest(id,approve){
    const item=requests.find(function(x){return x.id===id});if(!item)return;
    if(!confirm(approve?'この申請を当番表に反映しますか？':'この申請を却下しますか？'))return;
    try{
      await requestAdminAction(id,approve?'approve':'reject');
      if(approve){await load();showSaveNotice('申請を当番表に反映しました')}else showSaveNotice('申請を却下しました');
      if(isAdminViewing())loadDutySystemMonitor();
    }catch(e){alert(e.message||'処理できませんでした。')}
  }
  async function removeImage(index){
    const target=images[index];if(!target)return;
    const key=target.table?target.table.year+'-'+String(target.table.month).padStart(2,'0'):null;
    const deleteHistory=key&&!images.some((item,i)=>i!==index&&item.table&&item.table.year===target.table.year&&item.table.month===target.table.month);

    dutyChangeMutationInFlight=true;
    const confirmed=confirm('「'+target.name+'」を削除しますか？'+(deleteHistory?' '+key+'の表と変更履歴も削除します。':''));
    if(!confirmed){dutyChangeMutationInFlight=false;return}

    const previous=images.slice(),previousChanges=changes.slice();
    images.splice(index,1);
    if(deleteHistory)changes=changes.filter(item=>!item.date.startsWith(key+'-'));
    render();

    try{
      await persist('当番表と関連する変更履歴を削除しました','当番表を削除しました');
    }catch(e){
      images=previous;changes=previousChanges;render();alert(e.message||'当番表を削除できませんでした。');
    }finally{
      dutyChangeMutationInFlight=false;
    }
  }

  const partnerApprovalToggle=document.getElementById('dutyPartnerApprovalToggle');
  const partnerApprovalStatus=document.getElementById('dutyPartnerApprovalStatus');
  if(partnerApprovalToggle){
    partnerApprovalToggle.addEventListener('change',async function(){
      const desired=partnerApprovalToggle.checked;
      partnerApprovalToggle.checked=partnerApprovalEnabled;
      const adminPassword=prompt('管理者パスワードを入力してください');
      if(!adminPassword)return;
      partnerApprovalToggle.disabled=true;
      if(partnerApprovalStatus)partnerApprovalStatus.textContent='設定を確認しています…';
      try{
        const headers=requestHeaders(false);
        headers['x-admin-password']=adminPassword;
        const response=await fetch(REQUEST_API,{method:'POST',credentials:'same-origin',headers:headers,body:JSON.stringify({action:'set-partner-approval',enabled:desired})});
        const body=await response.json().catch(function(){return{}});
        if(!response.ok)throw new Error(body.error||'設定を変更できませんでした。');
        partnerApprovalEnabled=body.partnerApprovalEnabled===true;
        partnerApprovalToggle.checked=partnerApprovalEnabled;
        if(isAdminViewing())loadDutySystemMonitor();
        if(partnerApprovalStatus)partnerApprovalStatus.textContent=partnerApprovalEnabled?'ご家族承認モード':'管理者承認モード';
        const noLineToggle=document.getElementById('toggleDutyNoLine');
        const noLineOption=document.getElementById('dutyRequestNoLineOption');
        const noLineInput=document.getElementById('dutyRequestNoLine');
        if(noLineToggle){noLineToggle.hidden=!partnerApprovalEnabled;noLineToggle.setAttribute('aria-expanded','false');noLineToggle.textContent='LINEを利用できない方';}
        if(noLineOption)noLineOption.hidden=true;
        if(noLineInput&&!partnerApprovalEnabled)noLineInput.checked=false;
        syncDutyRequestOperationNote();
        if(window.showSaveNotice)showSaveNotice(partnerApprovalEnabled?'ご家族承認モードに切り替えました':'管理者承認モードに切り替えました');
      }catch(e){
        partnerApprovalToggle.checked=partnerApprovalEnabled;
        if(partnerApprovalStatus)partnerApprovalStatus.textContent=partnerApprovalEnabled?'ご家族承認モード':'管理者承認モード';
        alert(e.message||'設定を変更できませんでした。');
      }finally{
        partnerApprovalToggle.disabled=false;
      }
    });
  }

  const legacyLineToggle=document.getElementById('toggleLegacyDutyLine'),legacyLineBlock=document.getElementById('legacyDutyLineBlock');
  if(legacyLineToggle&&legacyLineBlock){
    legacyLineBlock.hidden=true;
    legacyLineToggle.setAttribute('aria-expanded','false');
    legacyLineToggle.textContent='表示 ▼';
    legacyLineToggle.addEventListener('click',function(){
      const open=legacyLineBlock.hidden;
      legacyLineBlock.hidden=!open;
      legacyLineToggle.setAttribute('aria-expanded',String(open));
      legacyLineToggle.textContent=open?'非表示 ▲':'表示 ▼';
    });
  }

  let lineResumeHandled=false;
  function cleanLineResumeUrl(){
    try{
      const u=new URL(location.href);
      u.searchParams.delete('line_login');
      u.searchParams.delete('line_resume');
      history.replaceState(null,'',u.pathname+u.search+u.hash);
    }catch(e){}
  }
  function restoreLineLoginResume(){
    if(lineResumeHandled)return;
    const params=new URLSearchParams(location.search);
    if(params.get('line_login')!=='ok')return;
    let saved=null;
    try{saved=JSON.parse(sessionStorage.getItem('ylsDutyLineResume')||localStorage.getItem('ylsDutyLineResume')||'null')}catch(e){}
    const urlResume=params.get('line_resume')==='duty-submit'?{
      mode:'submit',
      date:params.get('d')||'',
      from:(params.get('fg')&&params.get('fn'))?(params.get('fg')+'|'+params.get('fn')):'',
      to:(params.get('tg')&&params.get('tn'))?(params.get('tg')+'|'+params.get('tn')):'',
      expires:Date.now()+60*1000
    }:null;
    if(!saved||Date.now()>Number(saved.expires||0))saved=urlResume;
    if(!saved||Date.now()>Number(saved.expires||0)){
      try{sessionStorage.removeItem('ylsDutyLineResume')}catch(_){}
      try{localStorage.removeItem('ylsDutyLineResume')}catch(_){}
      lineResumeHandled=true;cleanLineResumeUrl();return;
    }
    const mode=String(saved.mode||'');
    if(mode==='submit'&&params.get('line_resume')==='duty-submit'){
      const dateSel=document.getElementById('dutyRequestRosterDate'),fromSel=document.getElementById('dutyRequestFrom'),toSel=document.getElementById('dutyRequestTo');
      if(!dateSel||!fromSel||!toSel||!Array.from(dateSel.options).some(function(o){return o.value===saved.date}))return;
      if(requestContent){requestContent.hidden=false}
      if(requestToggle){requestToggle.setAttribute('aria-expanded','true');requestToggle.textContent='閉じる'}
      dateSel.value=saved.date;populateRequestForm();
      if(Array.from(fromSel.options).some(function(o){return o.value===saved.from}))fromSel.value=saved.from;
      if(Array.from(toSel.options).some(function(o){return o.value===saved.to}))toSel.value=saved.to;
      try{sessionStorage.removeItem('ylsDutyLineResume')}catch(_){}
      try{localStorage.removeItem('ylsDutyLineResume')}catch(_){}
      lineResumeHandled=true;cleanLineResumeUrl();
      const result=document.getElementById('dutyRequestResult');
      if(result){result.hidden=false;result.innerHTML='<div class="duty-request-complete"><b>LINE認証が完了しました</b><p>申請を続行しています。</p></div>'}
      setTimeout(function(){submitRequest()},80);
      return;
    }
    if(mode==='resend'&&params.get('line_resume')==='duty-resend'){
      const box=document.getElementById('dutyRequestStatus'),list=document.getElementById('dutyRequestStatusList'),toggle=document.getElementById('toggleDutyRequestStatus');
      if(!box||!list||!toggle)return;
      box.hidden=false;list.hidden=false;toggle.setAttribute('aria-expanded','true');toggle.textContent='申請内容を閉じる';
      if(window.showSaveNotice)showSaveNotice('LINE認証が完了しました。「確認待ち」をタップしてLINEを再送してください。');
      try{sessionStorage.removeItem('ylsDutyLineResume')}catch(_){}
      try{localStorage.removeItem('ylsDutyLineResume')}catch(_){}
      lineResumeHandled=true;cleanLineResumeUrl();
    }
  }

  function setupDutyAdminMenu(){
    const toggle=document.getElementById('dutyAdminMenuToggle');
    const body=document.getElementById('dutyAdminMenuBody');
    if(!toggle||!body||toggle.dataset.ready==='1')return;
    toggle.dataset.ready='1';
    const setOpen=function(open){
      body.hidden=!open;
      body.style.setProperty('display',open?'block':'none','important');
      toggle.setAttribute('aria-expanded',String(open));
    };
    setOpen(false);
    toggle.addEventListener('click',function(){
      setOpen(toggle.getAttribute('aria-expanded')!=='true');
    });
  }
  setupDutyAdminMenu();

  const hasLegacyChangeForm=!!(changeYear&&changeGrade&&changeText&&pasteChangeBtn&&changePreview&&saveChangesBtn);
  if(hasLegacyChangeForm)changeYear.value=String(new Date().getFullYear());
  const adminHistoryToggle=document.getElementById('toggleDutyAdminHistory');
  if(adminHistoryToggle&&changeAdminList){
    changeAdminList.hidden=true;
    changeAdminList.style.display='none';
    adminHistoryToggle.setAttribute('aria-expanded','false');
    adminHistoryToggle.textContent='表示 ▼';
    adminHistoryToggle.addEventListener('click',function(){
      const open=changeAdminList.hidden;
      changeAdminList.hidden=!open;
      changeAdminList.style.display=open?'':'none';
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
  if(hasLegacyChangeForm)[changeYear,changeText].forEach(function(element){element.addEventListener('input',function(){updateChangePreview(false)});element.addEventListener('change',function(){updateChangePreview(false)})});
  if(hasLegacyChangeForm)changeGrade.addEventListener('change',function(){updateChangePreview(true)});
  const requestToggle=document.getElementById('toggleDutyRequest'),requestContent=document.getElementById('dutyRequestContent');
  if(requestToggle&&requestContent)requestToggle.addEventListener('click',function(){const open=requestContent.hidden;requestContent.hidden=!open;requestToggle.setAttribute('aria-expanded',String(open));requestToggle.textContent=open?'閉じる':'申請する';populateRequestForm()});
  const requestStatusToggle=document.getElementById('toggleDutyRequestStatus'),requestStatusList=document.getElementById('dutyRequestStatusList');
  if(requestStatusToggle&&requestStatusList)requestStatusToggle.addEventListener('click',function(){const open=requestStatusList.hidden;requestStatusList.hidden=!open;requestStatusToggle.setAttribute('aria-expanded',String(open));const pending=requests.filter(function(item){return item.status==='pending'}).length;requestStatusToggle.textContent=open?'申請内容を閉じる':(pending?'申請内容を見る（申請中 '+pending+'件）':'申請内容を見る')});
  document.getElementById('dutyRequestType')?.addEventListener('change',populateRequestForm);
  document.getElementById('dutyRequestRosterDate')?.addEventListener('change',populateRequestForm);
  document.getElementById('dutyRequestFrom')?.addEventListener('change',populateRequestForm);
  document.getElementById('dutyRequestSwapFromSlot')?.addEventListener('change',populateRequestForm);
  const noLineToggle=document.getElementById('toggleDutyNoLine');
  const noLineOption=document.getElementById('dutyRequestNoLineOption');
  if(noLineToggle&&noLineOption)noLineToggle.addEventListener('click',function(){
    if(!partnerApprovalEnabled)return;
    const open=noLineOption.hidden;
    noLineOption.hidden=!open;
    noLineToggle.setAttribute('aria-expanded',String(open));
    noLineToggle.textContent=open?'LINEを利用できない方を閉じる':'LINEを利用できない方';
  });
  document.getElementById('submitDutyRequest')?.addEventListener('click',submitRequest);
  if(hasLegacyChangeForm)pasteChangeBtn.addEventListener('click',pasteChangeText);
  if(hasLegacyChangeForm)saveChangesBtn.addEventListener('click',saveChanges);saveBtn.addEventListener('click',addImages);
  document.addEventListener('visibilitychange',function(){if(!document.hidden){syncPendingRequestCount();loadRequests();if(isAdminViewing()&&!dutyChangeMutationInFlight)load();}});
  window.addEventListener('focus',function(){syncPendingRequestCount();loadRequests();if(isAdminViewing()&&!dutyChangeMutationInFlight)load();});
  document.addEventListener('yachiyo:admin-session-active',function(){load();});
  document.addEventListener('yachiyo:admin-session-expired',function(){render();syncPendingRequestCount();});
  try{
    new MutationObserver(function(mutations){
      if(!mutations.some(function(m){return m.attributeName==='data-admin-password'}))return;
      if(isAdminViewing())load();else{render();syncPendingRequestCount();}
    }).observe(panel,{attributes:true,attributeFilter:['data-admin-password']});
  }catch(e){}
  loadCache();render();syncPendingRequestCount();loadRequests();load();
})();
