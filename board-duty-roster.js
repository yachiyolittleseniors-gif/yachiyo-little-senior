(function(){
  const API='/.netlify/functions/site-data?section=duty-roster';
  const list=document.getElementById('dutyRosterList');
  const adminList=document.getElementById('dutyRosterAdminList');
  const fileInput=document.getElementById('dutyRosterImageInput');
  const saveBtn=document.getElementById('saveDutyRosterBtn');
  const panel=document.getElementById('densukeAdminPanel');
  const changeSection=document.getElementById('dutyChangeSection');
  const changeList=document.getElementById('dutyChangeList');
  const changeYear=document.getElementById('dutyChangeYear');
  const changeGrade=document.getElementById('dutyChangeGrade');
  const changeText=document.getElementById('dutyChangeText');
  const changePreview=document.getElementById('dutyChangePreview');
  const saveChangesBtn=document.getElementById('saveDutyChangesBtn');
  const changeAdminList=document.getElementById('dutyChangeAdminList');
  const CACHE_KEY='yachiyoDutyRosterCacheV2';
  let images=[];
  let changes=[];
  let parsedChanges=[];

  if(!list||!adminList||!fileInput||!saveBtn||!panel||!changeSection||!changeList||!changeYear||!changeGrade||!changeText||!changePreview||!saveChangesBtn||!changeAdminList)return;

  function cleanName(value){return String(value||'').normalize('NFKC').replace(/[\s　]+/g,'').replace(/(?:さん|様)$/,'').replace(/[。、,，]+$/,'').trim().slice(0,60)}
  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,function(char){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]})}

  function normalize(raw){
    const imageList=raw&&raw.initialized===true&&Array.isArray(raw.images)?raw.images:[];
    const changeItems=raw&&raw.initialized===true&&Array.isArray(raw.changes)?raw.changes:[];
    return{
      images:imageList.filter(function(item){return item&&typeof item==='object'&&(item.data||item.src)}).slice(0,8).map(function(item,index){return{id:String(item.id||('duty-'+index)),name:String(item.name||('当番表 '+(index+1))),data:item.data?String(item.data):'',src:item.src?String(item.src):''}}),
      changes:changeItems.filter(function(item){return item&&/^\d{4}-\d{2}-\d{2}$/.test(String(item.date||''))&&['1','2','3'].includes(String(item.grade||''))&&cleanName(item.from)&&cleanName(item.to)}).slice(0,300).map(function(item,index){return{id:String(item.id||('change-'+index)),date:String(item.date),grade:String(item.grade),from:cleanName(item.from),to:cleanName(item.to),createdAt:String(item.createdAt||'')}})
    };
  }

  function imageSource(item){return item.data||item.src||''}
  function imageSourceKey(item){const source=imageSource(item);return String(item.id)+'-'+source.length+'-'+source.slice(-24)}
  function sortChanges(items){return items.slice().sort(function(a,b){return a.date.localeCompare(b.date)||Number(b.grade)-Number(a.grade)||a.from.localeCompare(b.from,'ja')})}
  function displayDate(value){const parts=String(value||'').split('-').map(Number);if(parts.length!==3)return value;const date=new Date(parts[0],parts[1]-1,parts[2]);return parts[1]+'/'+parts[2]+'（'+'日月火水木金土'[date.getDay()]+'）'}
  function changeMarkup(item){return'<span class="duty-change-date">'+displayDate(item.date)+'</span><span class="duty-change-grade">'+item.grade+'年生</span><span class="duty-change-names"><span class="duty-change-before">'+escapeHtml(item.from)+'</span><b class="duty-change-arrow">→</b><span class="duty-change-after">'+escapeHtml(item.to)+'</span></span>'}

  function saveCache(){try{const value=JSON.stringify({initialized:true,images:images,changes:changes});if(value.length<=4*1024*1024)sessionStorage.setItem(CACHE_KEY,value);else sessionStorage.removeItem(CACHE_KEY)}catch(e){}}
  function loadCache(){try{const cached=normalize(JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null'));if(cached.images.length||cached.changes.length){images=cached.images;changes=cached.changes;render()}}catch(e){sessionStorage.removeItem(CACHE_KEY)}}

  function renderChanges(){
    const ordered=sortChanges(changes);changeSection.hidden=!ordered.length;
    changeList.innerHTML=ordered.map(function(item){return'<div class="duty-change-item">'+changeMarkup(item)+'</div>'}).join('');
    const adminOrdered=ordered.slice().reverse();
    changeAdminList.innerHTML=adminOrdered.length?adminOrdered.map(function(item){return'<div class="duty-change-admin-item"><span>'+displayDate(item.date)+'・'+item.grade+'年生　'+escapeHtml(item.from)+' → <b>'+escapeHtml(item.to)+'</b></span><button type="button" data-remove-duty-change="'+escapeHtml(item.id)+'">取消</button></div>'}).join(''):'<div class="duty-change-preview">登録済みの当番変更はありません。</div>';
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
      const row=document.createElement('div');row.className='duty-roster-admin-item';const name=document.createElement('span');name.textContent=item.name||('当番表 '+(index+1));const actions=document.createElement('div');actions.className='duty-roster-admin-actions';
      const up=document.createElement('button');up.type='button';up.textContent='↑';up.title='上へ';up.disabled=index===0;up.addEventListener('click',function(){move(index,-1)});
      const down=document.createElement('button');down.type='button';down.textContent='↓';down.title='下へ';down.disabled=index===images.length-1;down.addEventListener('click',function(){move(index,1)});
      const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.className='duty-roster-delete';remove.addEventListener('click',function(){removeImage(index)});
      actions.append(up,down,remove);row.append(name,actions);adminList.appendChild(row);
    });
    if(images.length)list.replaceChildren(imageFragment);renderChanges();
  }

  async function load(){
    try{await window.boardAccessReady;const accessPassword=sessionStorage.getItem('yachiyoAttendancePass')||'';const response=await fetch(API,{cache:'no-store',headers:{'x-access-password':accessPassword}});if(!response.ok)throw new Error('load failed');const body=await response.json();const normalized=normalize(body.data);images=normalized.images;changes=normalized.changes;saveCache();render()}catch(e){render()}
  }

  function readAsDataUrl(file){return new Promise(function(resolve,reject){const reader=new FileReader();reader.onload=function(){resolve(String(reader.result||''))};reader.onerror=reject;reader.readAsDataURL(file)})}

  async function persist(successMessage,updateMessage,announceLatest){
    const adminPassword=panel.dataset.adminPassword||'';if(!adminPassword){alert('管理画面を開き直してください。');return false}
    const payload={initialized:true,images:images,changes:changes};if(JSON.stringify(payload).length>7500000){alert('画像の合計容量が大きすぎます。画像を減らしてください。');return false}
    const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-admin-password':adminPassword},body:JSON.stringify({data:payload,updateMessage:updateMessage||'当番表を更新しました',announceLatest:announceLatest===true})});
    const body=await response.json().catch(function(){return{}});if(!response.ok)throw new Error(body.error||'保存できませんでした。');saveCache();render();showSaveNotice(successMessage||'保存しました');if(announceLatest)window.refreshBoardLatestUpdate?.();return true;
  }

  function validDate(year,month,day){const date=new Date(year,month-1,day);return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day}
  function parseChangeLines(){
    const year=Number(changeYear.value),grade=String(changeGrade.value||''),results=[],errors=[];
    if(!Number.isInteger(year)||year<2020||year>2100||!['1','2','3'].includes(grade))return{results:[],errors:['年と対象学年を選択してください。']};
    changeText.value.split(/\r?\n/).forEach(function(source){
      const line=source.normalize('NFKC').trim();if(!line)return;
      const match=line.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*[（(][^）)]*[）)])?\s*(.+?)\s*(?:→|⇒|＞|->)\s*(.+?)\s*$/);if(!match)return;
      const month=Number(match[1]),day=Number(match[2]),from=cleanName(match[3]),to=cleanName(match[4]);
      if(!validDate(year,month,day)||!from||!to){errors.push('判定できません：'+source.trim());return}
      results.push({id:'change-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),date:year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0'),grade:grade,from:from,to:to,createdAt:new Date().toISOString()});
    });
    if(changeText.value.trim()&&!results.length&&!errors.length)errors.push('「10/3 竹内→矢羽田」のような変更行が見つかりませんでした。');return{results:results,errors:errors};
  }

  function updateChangePreview(){
    const parsed=parseChangeLines();parsedChanges=parsed.results;changePreview.classList.toggle('has-items',parsedChanges.length>0);
    const items=parsedChanges.map(function(item){return'<div>'+displayDate(item.date)+'・'+item.grade+'年生　'+escapeHtml(item.from)+' → <b>'+escapeHtml(item.to)+'</b></div>'}).join('');
    const errors=parsed.errors.map(function(error){return'<div class="duty-change-preview-error">'+escapeHtml(error)+'</div>'}).join('');
    changePreview.innerHTML=items+errors||(changeText.value.trim()?'変更内容を確認してください。':'変更内容を貼り付けると、ここに確認結果が表示されます。');
  }

  async function saveChanges(){
    updateChangePreview();if(!parsedChanges.length){alert('保存できる当番変更がありません。');return}const previous=changes.slice();
    parsedChanges.forEach(function(item){const index=changes.findIndex(function(current){return current.date===item.date&&current.grade===item.grade&&current.from===item.from});if(index>=0)changes[index]={...item,id:changes[index].id};else changes.push(item)});
    saveChangesBtn.disabled=true;saveChangesBtn.textContent='保存中…';
    try{await persist(parsedChanges.length+'件の当番変更を保存しました','当番変更を'+parsedChanges.length+'件反映しました',true);changeText.value='';parsedChanges=[];updateChangePreview()}catch(e){changes=previous;render();alert(e.message||'当番変更を保存できませんでした。')}finally{saveChangesBtn.disabled=false;saveChangesBtn.textContent='確認した変更を保存'}
  }

  async function removeChange(id){
    const target=changes.find(function(item){return item.id===id});if(!target||!confirm(displayDate(target.date)+'「'+target.from+' → '+target.to+'」を取り消しますか？'))return;
    const previous=changes.slice();changes=changes.filter(function(item){return item.id!==id});render();
    try{await persist('当番変更を取り消しました','当番変更を取り消しました',true)}catch(e){changes=previous;render();alert(e.message||'当番変更を取り消せませんでした。')}
  }

  async function addImages(){
    const files=Array.from(fileInput.files||[]);if(!files.length){alert('追加する画像を選択してください。');return}if(images.length+files.length>8){alert('当番表は8枚まで保存できます。');return}
    for(const file of files){if(!/^image\/(jpeg|png|webp)$/i.test(file.type)&&!(/\.(jpe?g|png|webp)$/i.test(file.name))){alert('JPEG・PNG・WebP画像を選択してください。');return}if(file.size>4*1024*1024){alert(file.name+' は4MBを超えています。');return}}
    saveBtn.disabled=true;saveBtn.textContent='保存中…';const previous=images.slice();
    try{for(const file of files)images.push({id:'duty-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),name:file.name,data:await readAsDataUrl(file),src:''});await persist(files.length+'枚の画像を保存しました','当番表の画像を'+files.length+'枚保存しました',true);fileInput.value=''}catch(e){images=previous;render();alert(e.message||'画像を保存できませんでした。')}finally{saveBtn.disabled=false;saveBtn.textContent='画像を保存'}
  }

  async function move(index,direction){const next=index+direction;if(next<0||next>=images.length)return;const previous=images.slice();[images[index],images[next]]=[images[next],images[index]];render();try{await persist('並び順を保存しました','当番表の並び順を変更しました')}catch(e){images=previous;render();alert(e.message||'並び順を保存できませんでした。')}}
  async function removeImage(index){const target=images[index];if(!target||!confirm('「'+(target.name||'当番表')+'」を削除しますか？'))return;const previous=images.slice();images.splice(index,1);render();try{await persist('画像を削除しました','当番表「'+(target.name||'画像')+'」を削除しました')}catch(e){images=previous;render();alert(e.message||'画像を削除できませんでした。')}}

  changeYear.value=String(new Date().getFullYear());
  [changeYear,changeGrade,changeText].forEach(function(element){element.addEventListener('input',updateChangePreview);element.addEventListener('change',updateChangePreview)});
  saveChangesBtn.addEventListener('click',saveChanges);saveBtn.addEventListener('click',addImages);loadCache();render();load();
})();
