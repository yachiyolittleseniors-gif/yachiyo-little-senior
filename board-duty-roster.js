(function(){
  const API='/.netlify/functions/site-data?section=duty-roster';
  const list=document.getElementById('dutyRosterList');
  const adminList=document.getElementById('dutyRosterAdminList');
  const fileInput=document.getElementById('dutyRosterImageInput');
  const saveBtn=document.getElementById('saveDutyRosterBtn');
  const panel=document.getElementById('densukeAdminPanel');
  const CACHE_KEY='yachiyoDutyRosterCacheV1';
  let images=[];

  if(!list||!adminList||!fileInput||!saveBtn||!panel)return;

  function normalize(raw){
    if(!raw||raw.initialized!==true||!Array.isArray(raw.images))return [];
    return raw.images.filter(function(item){
      return item&&typeof item==='object'&&(item.data||item.src);
    }).slice(0,8).map(function(item,index){
      return {
        id:String(item.id||('duty-'+index)),
        name:String(item.name||('当番表 '+(index+1))),
        data:item.data?String(item.data):'',
        src:item.src?String(item.src):''
      };
    });
  }

  function imageSource(item){return item.data||item.src||''}

  function imageSourceKey(item){
    const source=imageSource(item);
    return String(item.id)+'-'+source.length+'-'+source.slice(-24);
  }

  function saveCache(){
    try{
      const value=JSON.stringify({initialized:true,images:images});
      if(value.length<=4*1024*1024)sessionStorage.setItem(CACHE_KEY,value);
      else sessionStorage.removeItem(CACHE_KEY);
    }catch(e){}
  }

  function loadCache(){
    try{
      const cached=normalize(JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null'));
      if(cached.length){images=cached;render()}
    }catch(e){sessionStorage.removeItem(CACHE_KEY)}
  }

  function render(){
    adminList.replaceChildren();

    if(!images.length){
      const empty=document.createElement('div');
      empty.className='duty-roster-loading';
      empty.textContent='現在掲載中の当番表はありません。';
      list.replaceChildren(empty);
    }

    const existingImages=new Map(Array.from(list.querySelectorAll('.duty-roster-image[data-duty-id]')).map(function(image){return [image.dataset.dutyId,image]}));
    const imageFragment=document.createDocumentFragment();
    images.forEach(function(item,index){
      const sourceKey=imageSourceKey(item);
      let image=existingImages.get(String(item.id));
      if(!image||image.dataset.sourceKey!==sourceKey){
        image=document.createElement('img');
        image.className='duty-roster-image';
        image.src=imageSource(item);
        image.dataset.dutyId=String(item.id);
        image.dataset.sourceKey=sourceKey;
      }
      image.alt=item.name||('当番表 '+(index+1));
      image.loading=index===0?'eager':'lazy';
      image.decoding='async';
      imageFragment.appendChild(image);

      const row=document.createElement('div');
      row.className='duty-roster-admin-item';
      const name=document.createElement('span');
      name.textContent=item.name||('当番表 '+(index+1));
      const actions=document.createElement('div');
      actions.className='duty-roster-admin-actions';
      const up=document.createElement('button');
      up.type='button';up.textContent='↑';up.title='上へ';up.disabled=index===0;
      up.addEventListener('click',function(){move(index,-1)});
      const down=document.createElement('button');
      down.type='button';down.textContent='↓';down.title='下へ';down.disabled=index===images.length-1;
      down.addEventListener('click',function(){move(index,1)});
      const remove=document.createElement('button');
      remove.type='button';remove.textContent='削除';remove.className='duty-roster-delete';
      remove.addEventListener('click',function(){removeImage(index)});
      actions.append(up,down,remove);row.append(name,actions);adminList.appendChild(row);
    });
    if(images.length)list.replaceChildren(imageFragment);
  }

  async function load(){
    try{
      await window.boardAccessReady;
      const accessPassword=sessionStorage.getItem('yachiyoAttendancePass')||'';
      const response=await fetch(API,{cache:'no-store',headers:{'x-access-password':accessPassword}});
      if(!response.ok)throw new Error('load failed');
      const body=await response.json();
      images=normalize(body.data);
      saveCache();
      render();
    }catch(e){render()}
  }

  function readAsDataUrl(file){
    return new Promise(function(resolve,reject){
      const reader=new FileReader();
      reader.onload=function(){resolve(String(reader.result||''))};
      reader.onerror=reject;
      reader.readAsDataURL(file);
    });
  }

  async function persist(successMessage,updateMessage,announceLatest){
    const adminPassword=panel.dataset.adminPassword||'';
    if(!adminPassword){alert('管理画面を開き直してください。');return false}
    const payload={initialized:true,images:images};
    if(JSON.stringify(payload).length>7500000){alert('画像の合計容量が大きすぎます。画像を減らしてください。');return false}
    const response=await fetch(API,{
      method:'POST',
      headers:{'content-type':'application/json','x-admin-password':adminPassword},
      body:JSON.stringify({data:payload,updateMessage:updateMessage||'当番表を更新しました',announceLatest:announceLatest===true})
    });
    const body=await response.json().catch(function(){return {}});
    if(!response.ok)throw new Error(body.error||'保存できませんでした。');
    saveCache();render();showSaveNotice(successMessage||'保存しました');if(announceLatest)window.refreshBoardLatestUpdate?.();return true;
  }

  async function addImages(){
    const files=Array.from(fileInput.files||[]);
    if(!files.length){alert('追加する画像を選択してください。');return}
    if(images.length+files.length>8){alert('当番表は8枚まで保存できます。');return}
    for(const file of files){
      if(!/^image\/(jpeg|png|webp)$/i.test(file.type)&&!(/\.(jpe?g|png|webp)$/i.test(file.name))){alert('JPEG・PNG・WebP画像を選択してください。');return}
      if(file.size>4*1024*1024){alert(file.name+' は4MBを超えています。');return}
    }
    saveBtn.disabled=true;saveBtn.textContent='保存中...';
    const previous=images.slice();
    try{
      for(const file of files){
        images.push({
          id:'duty-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),
          name:file.name,
          data:await readAsDataUrl(file),
          src:''
        });
      }
      await persist(files.length+'枚の画像を保存しました','当番表の画像を'+files.length+'枚保存しました',true);
      fileInput.value='';
    }catch(e){images=previous;render();alert(e.message||'画像を保存できませんでした。')}
    finally{saveBtn.disabled=false;saveBtn.textContent='画像を保存'}
  }

  async function move(index,direction){
    const next=index+direction;if(next<0||next>=images.length)return;
    const previous=images.slice();
    [images[index],images[next]]=[images[next],images[index]];
    render();
    try{await persist('並び順を保存しました','当番表の並び順を変更しました')}catch(e){images=previous;render();alert(e.message||'並び順を保存できませんでした。')}
  }

  async function removeImage(index){
    const target=images[index];
    if(!target||!confirm('「'+(target.name||'当番表')+'」を削除しますか？'))return;
    const previous=images.slice();images.splice(index,1);render();
    try{await persist('画像を削除しました','当番表「'+(target.name||'画像')+'」を削除しました')}catch(e){images=previous;render();alert(e.message||'画像を削除できませんでした。')}
  }

  saveBtn.addEventListener('click',addImages);
  loadCache();
  load();
})();
