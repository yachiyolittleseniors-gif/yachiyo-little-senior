(function(){
  'use strict';
  const API='/.netlify/functions/site-data?section=seniorcup-winners';
  const defaults=[
    [1,1996,'勝田ハニーズ'],[2,1997,'新木戸ヤングミヤコシ'],[3,1998,'新木戸ヤングミヤコシ'],[4,1999,'ヤングタイガース'],[5,2000,'村上ファイターズ'],[6,2001,'村上ファイターズ'],[7,2002,'北東タイガース'],[8,2003,'大和田タイガース'],[9,2004,'秋津ボーイズ'],[10,2005,'キングファイターズ'],[11,2006,'ヤングタイガース'],[12,2007,'新木戸ヤングミヤコシ'],[13,2008,'キングファイターズ'],[14,2009,'村上ファイターズA'],[15,2010,'新木戸ヤングミヤコシ'],[16,2011,'大新ジャガーズ'],[17,2012,'西高津クラブ'],[18,2013,'新木戸ヤングミヤコシ'],[19,2014,'村上ファイターズ'],[20,2015,'高津ボーイズ'],[21,2016,'南高津クラブ'],
    [22,2017,'新木戸ヤングミヤコシ'],[23,2018,'大新ファイターズ'],[24,2019,'エースライオンズ'],[25,2020,'ヤングタイガース'],[26,2021,'大和田タイガース'],[27,2022,'大和田ST（スカーレット・タイガース）'],[28,2023,'大和田タイガース'],[29,2024,'新木戸ヤングミヤコシ'],[30,2025,'エースライオンズ']
  ].map(([edition,year,team])=>({edition,year,team}));
  const list=document.getElementById('winnersList');
  const toggle=document.getElementById('winnersToggle');
  const editor=document.getElementById('winnersEditor');
  const admin=document.getElementById('winnersAdmin');
  const add=document.getElementById('winnerAddBtn');
  const save=document.getElementById('winnerSaveBtn');
  if(!list||!toggle||!editor||!admin||!add||!save)return;
  let data=defaults.map(x=>({...x}));
  let busy=false;
  const clean=items=>(Array.isArray(items)?items:[]).map(x=>({edition:Number(x.edition)||0,year:Number(x.year)||0,team:String(x.team||'').trim()})).filter(x=>x.edition&&x.year&&x.team).sort((a,b)=>a.edition-b.edition);
  function renderList(){
    list.replaceChildren();
    [...data].sort((a,b)=>b.edition-a.edition).forEach(item=>{
      const row=document.createElement('div');row.className='winner-row';
      const ed=document.createElement('div');ed.className='winner-edition';ed.textContent='第'+item.edition+'回';
      const yr=document.createElement('div');yr.className='winner-year';yr.textContent=item.year+'年';
      const team=document.createElement('div');team.className='winner-team'+(item.team==='記録確認中'?' pending':'');team.textContent=item.team;
      row.append(ed,yr,team);list.append(row);
    });
  }
  function renderEditor(){
    editor.replaceChildren();
    [...data].sort((a,b)=>b.edition-a.edition).forEach(item=>{
      const row=document.createElement('div');row.className='winner-edit-row';row.dataset.edition=String(item.edition);
      const ed=document.createElement('input');ed.type='number';ed.min='1';ed.value=item.edition;ed.setAttribute('aria-label','大会回数');
      const yr=document.createElement('input');yr.type='number';yr.min='1990';yr.max='2100';yr.value=item.year;yr.setAttribute('aria-label','開催年');
      const team=document.createElement('input');team.type='text';team.maxLength=100;team.value=item.team;team.placeholder='優勝チーム';team.setAttribute('aria-label','優勝チーム');
      const del=document.createElement('button');del.type='button';del.textContent='削除';del.addEventListener('click',()=>{data=data.filter(x=>x!==item);renderAll();});
      row.append(ed,yr,team,del);editor.append(row);
    });
  }
  function syncEditor(){
    data=[...editor.querySelectorAll('.winner-edit-row')].map(row=>{const inputs=row.querySelectorAll('input');return{edition:Number(inputs[0].value),year:Number(inputs[1].value),team:inputs[2].value.trim()};});
    data=clean(data);
  }
  function renderAll(){renderList();renderEditor();}
  toggle.addEventListener('click',()=>{const open=!list.classList.contains('show');list.classList.toggle('show',open);toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'歴代優勝チームを閉じる':'歴代優勝チームを見る';});
  add.addEventListener('click',()=>{syncEditor();const maxEdition=Math.max(0,...data.map(x=>x.edition));const maxYear=Math.max(2025,...data.map(x=>x.year));const item={edition:maxEdition+1,year:maxYear+1,team:''};data.push(item);renderEditor();const row=[...editor.querySelectorAll('.winner-edit-row')].find(r=>Number(r.dataset.edition)===item.edition);const teamInput=row?.querySelector('input[type=\"text\"]');if(teamInput){teamInput.focus();teamInput.scrollIntoView({behavior:'smooth',block:'center'});}});
  save.addEventListener('click',async()=>{
    if(busy)return;syncEditor();
    if(!data.length){alert('歴代優勝データを入力してください。');return;}
    const editions=data.map(x=>x.edition);if(new Set(editions).size!==editions.length){alert('大会回数が重複しています。');return;}
    const password=sessionStorage.getItem('yachiyoAdminPassword')||'';if(!password){alert('管理画面を開き直してください。');return;}
    busy=true;save.disabled=true;save.textContent='保存中...';
    try{
      const res=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-admin-password':password},body:JSON.stringify({data})});
      const json=await res.json().catch(()=>({}));if(!res.ok)throw new Error(json.error||'保存できませんでした。');
      data=clean(json.data||data);renderAll();if(typeof showSaveNotice==='function')showSaveNotice('歴代優勝を保存しました');else alert('歴代優勝を保存しました。');
    }catch(e){alert(e.message);}finally{busy=false;save.disabled=false;save.textContent='歴代優勝を保存';}
  });
  new MutationObserver(()=>{admin.classList.toggle('show',document.getElementById('cupAdminArea')?.classList.contains('show'));}).observe(document.getElementById('cupAdminArea'),{attributes:true,attributeFilter:['class']});
  fetch(API,{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(j=>{const loaded=clean(j.data);if(loaded.length)data=loaded;renderAll();}).catch(()=>renderAll());
  renderAll();
})();
